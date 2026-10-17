-- Landscape Planner: syncing projects (sync step 2).
--
-- Run after 01-accounts.sql: Supabase → SQL Editor → New query → paste → Run.
-- Safe to run again.
--
-- A project is uploaded through one function, push_project, which compares
-- revisions and writes in one step, so two devices can never both "win": a
-- device whose copy didn't start from the server's latest gets the server's
-- version back (a conflict) and keeps its own as a copy beside it.

-- ---------- Trials start at the first sync, not at sign-in ----------
alter table public.plans add column if not exists trial_started timestamptz;
alter table public.plans alter column trial_ends drop default;
alter table public.plans alter column trial_ends drop not null;
-- Trials "started" by signing in before this script: not started yet after all.
-- (Before this script nothing synced, so no trial was in use; beta and paid plans aren't touched.)
update public.plans set trial_ends = null where plan = 'trial' and trial_started is null;

-- Who has had a trial: by email (Gmail's dots and anything after a "+" don't
-- make a new address) and by app install (a random id the app makes, kept
-- with the plans on the device; it identifies nothing else). One-way
-- fingerprints only; the app can't read either table.
create or replace function public.email_key(email text) returns text
language sql immutable set search_path = '' as $$
  with a as (select split_part(lower(trim(coalesce(email, ''))), '@', 1) as l, split_part(lower(trim(coalesce(email, ''))), '@', 2) as d)
  select encode(pg_catalog.sha256(convert_to(
    case when d in ('gmail.com', 'googlemail.com') then replace(split_part(l, '+', 1), '.', '') || '@gmail.com'
         else split_part(l, '+', 1) || '@' || d end, 'UTF8')), 'hex')
  from a
$$;
revoke all on function public.email_key(text) from public, anon, authenticated;
create table if not exists public.trial_installs (
  install_id text primary key check (install_id ~ '^[A-Za-z0-9-]{16,64}$'),
  at timestamptz not null default now()
);
alter table public.trial_installs enable row level security;

-- New accounts: a plan row, trial not started.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.plans (owner, trial_ends) values (new.id, null) on conflict (owner) do nothing;
  return new;
end $$;

-- Start the free trial (first sync). No second trial for the same email or the same install.
create or replace function public.start_trial(p_install text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  p public.plans;
  addr text;
  had boolean;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into p from public.plans where owner = me for update;
  if not found then
    insert into public.plans (owner, trial_ends) values (me, null) returning * into p;
  end if;
  if p.plan = 'trial' and p.trial_started is null then
    select email into addr from auth.users where id = me;
    had := exists (select 1 from public.trial_used where email_hash = public.email_key(addr))
        or (p_install is not null and exists (select 1 from public.trial_installs where install_id = p_install));
    update public.plans set trial_started = now(), trial_ends = case when had then now() else now() + interval '30 days' end
      where owner = me returning * into p;
    if addr is not null then insert into public.trial_used (email_hash) values (public.email_key(addr)) on conflict do nothing; end if;
    if p_install ~ '^[A-Za-z0-9-]{16,64}$' then insert into public.trial_installs (install_id) values (p_install) on conflict do nothing; end if;
  end if;
  return jsonb_build_object('plan', p.plan, 'trial_started', p.trial_started, 'trial_ends', p.trial_ends, 'paid_until', p.paid_until);
end $$;

-- Deleting an account remembers its email (normalized) as having had a trial.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  addr text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select email into addr from auth.users where id = auth.uid();
  if addr is not null then
    insert into public.trial_used (email_hash) values (public.email_key(addr)) on conflict do nothing;
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- What the account's plan allows ----------
create or replace function public.sync_allowed(me uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.plans p where p.owner = me and (
      p.plan = 'beta'
      or (p.plan = 'active' and (p.paid_until is null or p.paid_until > now()))
      or (p.plan = 'trial' and p.trial_ends > now())
    )
  )
$$;
revoke all on function public.sync_allowed(uuid) from public, anon, authenticated;

-- ---------- Projects ----------
-- The account's projects (without their content), including the trash.
-- Projects in the trash for more than 30 days are removed for good here.
create or replace function public.sync_list() returns table (
  id text, name text, revision bigint, updated_at timestamptz, updated_by text, deleted_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.projects p where p.owner = auth.uid() and p.deleted_at < now() - interval '30 days';
  return query select p.id, p.name, p.revision, p.updated_at, p.updated_by, p.deleted_at
    from public.projects p where p.owner = auth.uid() order by p.updated_at desc;
end $$;

-- Upload a project. `p_base` is the revision this device's copy started from
-- (null for a project the server hasn't seen). Returns
--   {status: 'ok', revision}              stored
--   {status: 'conflict', revision, name, content, updated_by, updated_at}
--                                         the server moved on: here is its version
--   {status: 'deleted', revision}         it's in the trash (restore it first to keep it)
--   {status: 'paused'}                    the plan doesn't include sync right now
--   {status: 'full'}                      the account's project limit is reached
create or replace function public.push_project(p_id text, p_base bigint, p_name text, p_content jsonb, p_device text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cur public.projects;
  nm text := left(coalesce(nullif(trim(p_name), ''), 'Untitled'), 200);
  dev text := left(coalesce(p_device, ''), 80);
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_id !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'bad project id'; end if;
  if jsonb_typeof(p_content) is distinct from 'object' then raise exception 'bad project content'; end if;
  if not public.sync_allowed(me) then return jsonb_build_object('status', 'paused'); end if;
  select * into cur from public.projects where owner = me and id = p_id for update;
  if not found then
    if (select count(*) from public.projects where owner = me) >= 500 then return jsonb_build_object('status', 'full'); end if;
    begin
      insert into public.projects (owner, id, name, content, revision, updated_by) values (me, p_id, nm, p_content, 1, dev);
      return jsonb_build_object('status', 'ok', 'revision', 1);
    exception when unique_violation then
      -- Another device uploaded it a moment ago: answer as if we'd seen that first.
      select * into cur from public.projects where owner = me and id = p_id;
    end;
  end if;
  if cur.deleted_at is not null then return jsonb_build_object('status', 'deleted', 'revision', cur.revision); end if;
  if p_base is distinct from cur.revision then
    return jsonb_build_object('status', 'conflict', 'revision', cur.revision, 'name', cur.name, 'content', cur.content,
      'updated_by', cur.updated_by, 'updated_at', cur.updated_at);
  end if;
  update public.projects set name = nm, content = p_content, revision = cur.revision + 1, updated_at = now(), updated_by = dev
    where owner = me and id = p_id;
  return jsonb_build_object('status', 'ok', 'revision', cur.revision + 1);
end $$;

-- Move a project to the trash (kept 30 days). `p_base` is the revision this
-- device deleted; if another device has changed the project since, it isn't
-- trashed ('changed': it comes back to this device with those changes).
-- Returns 'ok' (in the trash, or not on the server), 'changed' or 'paused'.
drop function if exists public.trash_project(text, text);
create or replace function public.trash_project(p_id text, p_base bigint, p_device text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cur public.projects;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.sync_allowed(me) then return 'paused'; end if;
  select * into cur from public.projects where owner = me and id = p_id for update;
  if not found or cur.deleted_at is not null then return 'ok'; end if;
  if p_base is distinct from cur.revision then return 'changed'; end if;
  update public.projects set deleted_at = now(), revision = revision + 1, updated_at = now(), updated_by = left(coalesce(p_device, ''), 80)
    where owner = me and id = p_id;
  return 'ok';
end $$;
-- Bring a project back out of the trash; returns its new revision (null if
-- it isn't there, or the plan doesn't include sync right now).
create or replace function public.restore_project(p_id text, p_device text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  rev bigint;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.sync_allowed(auth.uid()) then return null; end if;
  update public.projects set deleted_at = null, revision = revision + 1, updated_at = now(), updated_by = left(coalesce(p_device, ''), 80)
    where owner = auth.uid() and id = p_id and deleted_at is not null returning revision into rev;
  return rev;
end $$;

-- Only signed-in accounts may call these (each acts only on its own rows).
revoke all on function public.start_trial(text) from public, anon;
revoke all on function public.sync_list() from public, anon;
revoke all on function public.push_project(text, bigint, text, jsonb, text) from public, anon;
revoke all on function public.trash_project(text, bigint, text) from public, anon;
revoke all on function public.restore_project(text, text) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.start_trial(text) to authenticated;
grant execute on function public.sync_list() to authenticated;
grant execute on function public.push_project(text, bigint, text, jsonb, text) to authenticated;
grant execute on function public.trash_project(text, bigint, text) to authenticated;
grant execute on function public.restore_project(text, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
