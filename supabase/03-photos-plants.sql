-- FullGrown: syncing background photos and My plants (sync step 3).
--
-- Run after 02-sync.sql: Supabase → SQL Editor → New query → paste → Run.
-- Safe to run again (re-running 01 or 02 needs this run again after them:
-- it tightens their access rules and replaces push_project).

-- ---------- Background photos ----------
-- A photo file is stored once per account, named by a fingerprint of its
-- bytes (<owner>/<fingerprint>.jpg), and shared by any project that uses it.
-- A row in public.photos reserves the space before the file goes up; the
-- storage rules below only accept files that have one. `stored` is set once
-- the file is up, so a device knows it needn't send it again.
alter table public.photos add column if not exists stored boolean not null default false;
-- When a plan last pointed at the photo (reserving it, or uploading a plan that shows it).
alter table public.photos add column if not exists last_used timestamptz not null default now();
-- Rows are written only through the functions below (which check the plan and the limits).
drop policy if exists "photos: own" on public.photos;
drop policy if exists "photos: read own" on public.photos;
create policy "photos: read own" on public.photos for select to authenticated using (owner = auth.uid());

-- Reserve room for a photo. Returns 'stored' (already up: nothing to send),
-- 'send' (reserved: upload it, then mark it stored), 'paused' (the plan doesn't
-- include sync now), 'too_big' (over 5 MB) or 'full' (the account's 300 MB, or
-- 500 photos, are used).
create or replace function public.reserve_photo(p_fp text, p_size integer) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ph public.photos;
  used bigint;
  n integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_fp is null or p_fp !~ '^[0-9a-f]{64}$' then raise exception 'bad photo fingerprint'; end if;
  if not public.sync_allowed(me) then return 'paused'; end if;
  if p_size is null or p_size <= 0 or p_size > 5 * 1024 * 1024 then return 'too_big'; end if;
  select * into ph from public.photos where owner = me and fingerprint = p_fp;
  if found then
    update public.photos set last_used = now() where owner = me and fingerprint = p_fp; -- in use again: not cleaned up now
    return case when ph.stored then 'stored' else 'send' end;
  end if;
  -- One account's reservations at a time, so two devices can't both squeeze under the limit.
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  select coalesce(sum(size), 0), count(*) into used, n from public.photos where owner = me;
  if used + p_size > 300 * 1024 * 1024 or n >= 500 then return 'full'; end if;
  insert into public.photos (owner, fingerprint, size) values (me, p_fp, p_size) on conflict do nothing;
  return 'send';
end $$;

-- The file is up.
create or replace function public.photo_stored(p_fp text) returns void
language sql security definer set search_path = '' as $$
  update public.photos set stored = true where owner = auth.uid() and fingerprint = p_fp
$$;

-- Photos no project of the account uses any more (not even one in the trash),
-- and none has for a day (so one on its way up with its plan, or just picked
-- again for another plan, is never caught). The app deletes each: forget_photo, then the file.
create or replace function public.unused_photos() returns setof text
language sql stable security definer set search_path = '' as $$
  select ph.fingerprint from public.photos ph
  where ph.owner = auth.uid() and ph.last_used < now() - interval '1 day'
    and not exists (select 1 from public.projects pr where pr.owner = ph.owner and pr.content -> 'photo' ->> 'fingerprint' = ph.fingerprint)
$$;
-- Forget a photo if it's still unused (checked again here); true if forgotten (then the app deletes the file).
create or replace function public.forget_photo(p_fp text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from public.photos ph where ph.owner = me and ph.fingerprint = p_fp and ph.last_used < now() - interval '1 day'
    and not exists (select 1 from public.projects pr where pr.owner = me and pr.content -> 'photo' ->> 'fingerprint' = p_fp);
  return found;
end $$;

-- Upload a project (replaces the version in 02-sync.sql). The same, except:
-- a plan from a version of the app before photos synced says nothing about
-- its photo, so the photo the server has stays with it; and the photo a plan
-- shows is noted as in use.
create or replace function public.push_project(p_id text, p_base bigint, p_name text, p_content jsonb, p_device text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cur public.projects;
  nm text := left(coalesce(nullif(trim(p_name), ''), 'Untitled'), 200);
  dev text := left(coalesce(p_device, ''), 80);
  body jsonb := p_content;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_id !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'bad project id'; end if;
  if jsonb_typeof(p_content) is distinct from 'object' then raise exception 'bad project content'; end if;
  if not public.sync_allowed(me) then return jsonb_build_object('status', 'paused'); end if;
  select * into cur from public.projects where owner = me and id = p_id for update;
  if not found then
    if (select count(*) from public.projects where owner = me) >= 500 then return jsonb_build_object('status', 'full'); end if;
    begin
      insert into public.projects (owner, id, name, content, revision, updated_by) values (me, p_id, nm, body, 1, dev);
      update public.photos set last_used = now() where owner = me and fingerprint = body -> 'photo' ->> 'fingerprint';
      return jsonb_build_object('status', 'ok', 'revision', 1);
    exception when unique_violation then
      -- Another device uploaded it a moment ago: answer as if we'd seen that first.
      select * into cur from public.projects where owner = me and id = p_id for update;
    end;
  end if;
  if cur.deleted_at is not null then return jsonb_build_object('status', 'deleted', 'revision', cur.revision); end if;
  if p_base is distinct from cur.revision then
    return jsonb_build_object('status', 'conflict', 'revision', cur.revision, 'name', cur.name, 'content', cur.content,
      'updated_by', cur.updated_by, 'updated_at', cur.updated_at);
  end if;
  if not (body ? 'photo') and cur.content ? 'photo' then body := body || jsonb_build_object('photo', cur.content -> 'photo'); end if;
  update public.projects set name = nm, content = body, revision = cur.revision + 1, updated_at = now(), updated_by = dev
    where owner = me and id = p_id;
  -- (The photo it showed before, too: a day's grace before it's cleaned up.)
  update public.photos set last_used = now() where owner = me
    and fingerprint in (body -> 'photo' ->> 'fingerprint', cur.content -> 'photo' ->> 'fingerprint');
  return jsonb_build_object('status', 'ok', 'revision', cur.revision + 1);
end $$;

-- The photo files: read and remove your own; add one only with a reservation.
drop policy if exists "photos bucket: own folder" on storage.objects;
drop policy if exists "photos bucket: read own" on storage.objects;
drop policy if exists "photos bucket: remove own" on storage.objects;
drop policy if exists "photos bucket: add reserved" on storage.objects;
create policy "photos bucket: read own" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos bucket: remove own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos bucket: add reserved" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos'
    and exists (select 1 from public.photos ph where ph.owner = auth.uid() and not ph.stored
      and name = auth.uid()::text || '/' || ph.fingerprint || '.jpg'));

-- ---------- My plants: one record per plant ----------
-- Each plant has a revision, like a project, and the time it was last edited
-- (on the device that edited it). When a plant changed on two devices, the
-- later edit wins; a plant deleted on one device leaves the others unless it
-- was edited later there.
alter table public.my_plants add column if not exists revision bigint not null default 1;
alter table public.my_plants add column if not exists edited_at timestamptz;
alter table public.my_plants add column if not exists updated_by text;
-- Rows are written only through push_plant (which checks the plan, the limit and revisions).
drop policy if exists "my_plants: own" on public.my_plants;
drop policy if exists "my_plants: read own" on public.my_plants;
create policy "my_plants: read own" on public.my_plants for select to authenticated using (owner = auth.uid());

-- The account's plants (without their details), deleted ones included.
-- Deleted over a year ago: removed for good here.
create or replace function public.plant_list() returns table (id text, revision bigint, edited_at timestamptz, deleted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.my_plants p where p.owner = auth.uid() and p.deleted_at < now() - interval '1 year';
  return query select p.id, p.revision, p.edited_at, p.deleted_at from public.my_plants p where p.owner = auth.uid();
end $$;

-- Upload a plant (or, with p_plant null, its deletion). `p_base`: the
-- revision this device's copy started from (null if new). Returns
--   {status: 'ok', revision}
--   {status: 'conflict', revision, plant, edited_at, deleted_at}   the server moved on
--   {status: 'paused'} / {status: 'full'} (2000 plants)
create or replace function public.push_plant(p_id text, p_base bigint, p_plant jsonb, p_edited timestamptz, p_device text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cur public.my_plants;
  dev text := left(coalesce(p_device, ''), 80);
  -- A device whose clock runs ahead doesn't always win (an unknown time stays unknown).
  edited timestamptz := case when p_edited is null then null else least(p_edited, now()) end;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_id is null or p_id !~ '^u-.{1,38}$' then raise exception 'bad plant id'; end if;
  if p_plant is not null and jsonb_typeof(p_plant) <> 'object' then raise exception 'bad plant'; end if;
  if not public.sync_allowed(me) then return jsonb_build_object('status', 'paused'); end if;
  select * into cur from public.my_plants where owner = me and id = p_id for update;
  if not found then
    if p_plant is null then return jsonb_build_object('status', 'ok', 'revision', null); end if; -- nothing to delete
    if (select count(*) from public.my_plants where owner = me) >= 2000 then return jsonb_build_object('status', 'full'); end if;
    begin
      insert into public.my_plants (owner, id, plant, revision, edited_at, updated_by) values (me, p_id, p_plant, 1, edited, dev);
      return jsonb_build_object('status', 'ok', 'revision', 1);
    exception when unique_violation then
      select * into cur from public.my_plants where owner = me and id = p_id for update;
    end;
  end if;
  if p_base is distinct from cur.revision then
    return jsonb_build_object('status', 'conflict', 'revision', cur.revision, 'plant', cur.plant, 'edited_at', cur.edited_at, 'deleted_at', cur.deleted_at);
  end if;
  update public.my_plants set
    plant = coalesce(p_plant, cur.plant),
    deleted_at = case when p_plant is null then now() else null end,
    revision = cur.revision + 1, edited_at = edited, updated_at = now(), updated_by = dev
    where owner = me and id = p_id;
  return jsonb_build_object('status', 'ok', 'revision', cur.revision + 1);
end $$;

-- Only signed-in accounts may call these (each acts only on its own rows).
revoke all on function public.reserve_photo(text, integer) from public, anon;
revoke all on function public.photo_stored(text) from public, anon;
revoke all on function public.unused_photos() from public, anon;
revoke all on function public.forget_photo(text) from public, anon;
revoke all on function public.plant_list() from public, anon;
revoke all on function public.push_plant(text, bigint, jsonb, timestamptz, text) from public, anon;
grant execute on function public.reserve_photo(text, integer) to authenticated;
grant execute on function public.photo_stored(text) to authenticated;
grant execute on function public.unused_photos() to authenticated;
grant execute on function public.forget_photo(text) to authenticated;
grant execute on function public.plant_list() to authenticated;
grant execute on function public.push_plant(text, bigint, jsonb, timestamptz, text) to authenticated;
