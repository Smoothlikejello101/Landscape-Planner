-- Tests for the setup scripts, on a plain Postgres with supabase-stub.sql.
-- Run with scripts/test-sql.sh. Every check raises an exception when it fails.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'j.ason+garden@gmail.com'),
  ('00000000-0000-0000-0000-00000000000b', 'beth@example.com');

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u, ''), false);
end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
end $$;

-- A new account has a plan whose trial hasn't started.
select pg_temp.check((select trial_ends is null and trial_started is null and plan = 'trial' from public.plans where owner = '00000000-0000-0000-0000-00000000000a'), 'new account: trial not started');

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

-- Before the trial starts, nothing syncs.
select pg_temp.check(public.push_project('p1', null, 'Back Yard', '{"shapes":[]}', 'Pixel 7') ->> 'status' = 'paused', 'no sync before the trial');
-- Starting the trial: 30 days.
select pg_temp.check((public.start_trial('install-aaaaaaaaaaaaaaaa') ->> 'trial_ends')::timestamptz > now() + interval '29 days', 'trial: 30 days');
-- Starting again changes nothing.
select pg_temp.check((public.start_trial('install-aaaaaaaaaaaaaaaa') ->> 'trial_ends')::timestamptz > now() + interval '29 days', 'trial starts once');

-- First upload, then an update from the same base.
select pg_temp.check(public.push_project('p1', null, 'Back Yard', '{"shapes":[1]}', 'Pixel 7') = '{"status":"ok","revision":1}', 'first upload');
select pg_temp.check(public.push_project('p1', 1, 'Back Yard', '{"shapes":[1,2]}', 'Pixel 7') = '{"status":"ok","revision":2}', 'update from its base');
-- Another device still at revision 1: a conflict, with the server's version.
select pg_temp.check((select r ->> 'status' = 'conflict' and (r ->> 'revision')::int = 2 and r -> 'content' = '{"shapes":[1,2]}' and r ->> 'updated_by' = 'Pixel 7'
  from (select public.push_project('p1', 1, 'Back Yard', '{"shapes":[9]}', 'Laptop') r) x), 'stale base: conflict with the server version');
-- The losing write changed nothing.
select pg_temp.check((select content = '{"shapes":[1,2]}' and revision = 2 from public.projects where id = 'p1'), 'conflict writes nothing');
-- Not a project, not an id.
do $$ begin perform public.push_project('../x', null, 'X', '{}', ''); raise exception 'FAILED: bad id accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
do $$ begin perform public.push_project('p2', null, 'X', '[1]', ''); raise exception 'FAILED: non-object content accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;

-- The trash: listed with its date, refused for uploads until restored.
select pg_temp.check(public.trash_project('p1', 'Laptop') = 3, 'trash bumps the revision');
select pg_temp.check((select deleted_at is not null from public.sync_list() where id = 'p1'), 'trash is listed');
select pg_temp.check(public.push_project('p1', 3, 'Back Yard', '{}', 'Pixel 7') ->> 'status' = 'deleted', 'upload to a trashed project');
select pg_temp.check(public.restore_project('p1', 'Pixel 7') = 4, 'restore');
select pg_temp.check(public.push_project('p1', 4, 'Back Yard', '{"shapes":[3]}', 'Pixel 7') ->> 'status' = 'ok', 'upload after restore');
-- Over 30 days in the trash: gone for good at the next list.
reset role;
update public.projects set deleted_at = now() - interval '31 days' where id = 'p1';
set role authenticated;
select pg_temp.check(not exists (select 1 from public.sync_list() where id = 'p1'), 'old trash purged');

-- Another account sees none of it, and can't touch it.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(public.push_project('q1', null, 'Hers', '{}', '') ->> 'status' = 'paused', 'b: paused before trial');
select pg_temp.check(not exists (select 1 from public.sync_list()), 'b sees no projects');
select pg_temp.check(not exists (select 1 from public.projects), 'b reads no project rows');
select pg_temp.check(public.trash_project('p1', '') is null, 'b cannot trash a project');
-- Nobody upgrades themselves: plans can't be written by the app.
update public.plans set plan = 'beta';
select pg_temp.check((select plan from public.plans) = 'trial', 'plan not writable');
do $$ begin insert into public.projects (id, name, content) values ('z', 'z', '{}'); raise exception 'FAILED: direct insert allowed'; exception when insufficient_privilege then null; when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;

-- Anonymous callers can't run anything.
reset role;
set role anon;
select pg_temp.as_user(null);
do $$ begin perform public.sync_list(); raise exception 'FAILED: anon ran sync_list'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.delete_my_account(); raise exception 'FAILED: anon ran delete_my_account'; exception when insufficient_privilege then null; end $$;

-- A deleted account's email (any Gmail spelling) and its install don't get a second trial.
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.delete_my_account();
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000c', 'jason@googlemail.com'),
  ('00000000-0000-0000-0000-00000000000d', 'fresh@example.com');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((public.start_trial('install-cccccccccccccccc') ->> 'trial_ends')::timestamptz <= now(), 'same gmail, other spelling: no new trial');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((public.start_trial('install-aaaaaaaaaaaaaaaa') ->> 'trial_ends')::timestamptz <= now(), 'same install: no new trial');
reset role;
select pg_temp.check(not exists (select 1 from public.projects where owner = '00000000-0000-0000-0000-00000000000a'), 'deleted account: projects gone');

-- Beta accounts sync without a trial.
update public.plans set plan = 'beta' where owner = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(public.push_project('q1', null, 'Hers', '{}', '') ->> 'status' = 'ok', 'beta syncs');
reset role;
select 'all SQL checks passed' as result;
