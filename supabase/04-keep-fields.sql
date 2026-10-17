-- FullGrown: keep what an older app version doesn't know about (garden location, and anything later).
--
-- Run after 03-photos-plants.sql: Supabase → SQL Editor → New query → paste → Run.
-- Safe to run again (re-running 01, 02 or 03 needs this run again after them).

-- Upload a project (replaces the version in 03). The same, except that any
-- part of the plan the upload says nothing about stays as the server has it:
-- a version of the app from before that part synced (a photo, a garden
-- location) can't remove it by not knowing about it.
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
  body := cur.content || body; -- (keys the upload has replace the server's; keys it lacks stay)
  update public.projects set name = nm, content = body, revision = cur.revision + 1, updated_at = now(), updated_by = dev
    where owner = me and id = p_id;
  -- (The photo it showed before, too: a day's grace before it's cleaned up.)
  update public.photos set last_used = now() where owner = me
    and fingerprint in (body -> 'photo' ->> 'fingerprint', cur.content -> 'photo' ->> 'fingerprint');
  return jsonb_build_object('status', 'ok', 'revision', cur.revision + 1);
end $$;

