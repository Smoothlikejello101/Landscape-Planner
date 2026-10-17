-- Tests for 03-photos-plants.sql. Run with scripts/test-sql.sh (after sync-test.sql).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'eve@example.com'),
  ('00000000-0000-0000-0000-0000000000f1', 'fay@example.com');
update public.plans set plan = 'beta' where owner = '00000000-0000-0000-0000-0000000000e1';

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u, ''), false);
end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
end $$;
\set FP1 '''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'''
\set FP2 '''bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'''

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');

-- ---------- Photos ----------
select pg_temp.check(public.reserve_photo(:FP1, 800000) = 'send', 'new photo: send it');
select pg_temp.check(public.reserve_photo(:FP1, 800000) = 'send', 'reserved but not up yet: still send');
-- Storage accepts a file only with a reservation, at exactly its name, in the account's own folder.
insert into storage.objects (bucket_id, name) values ('photos', '00000000-0000-0000-0000-0000000000e1/' || :FP1 || '.jpg');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('photos', '00000000-0000-0000-0000-0000000000e1/sub/' || repeat('a', 64) || '.jpg');
  raise exception 'FAILED: file in a subfolder accepted';
exception when insufficient_privilege then null; end $$;
select public.photo_stored(:FP1);
do $$ begin
  insert into storage.objects (bucket_id, name) values ('photos', '00000000-0000-0000-0000-0000000000e1/' || repeat('a', 64) || '.jpg');
  raise exception 'FAILED: second upload of a stored photo accepted';
exception when insufficient_privilege then null; end $$;
-- The tables can't be written around the functions.
do $$ begin
  insert into public.photos (fingerprint, size) values (repeat('e', 64), 1);
  raise exception 'FAILED: direct photo row accepted';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.my_plants (id, plant) values ('u-direct', '{}');
  raise exception 'FAILED: direct plant row accepted';
exception when insufficient_privilege then null; end $$;
select pg_temp.check(public.reserve_photo(:FP1, 800000) = 'stored', 'up: nothing to send');
select pg_temp.check(public.reserve_photo(:FP2, 6 * 1024 * 1024) = 'too_big', 'over 5 MB');
do $$ begin perform public.reserve_photo('../x', 10); raise exception 'FAILED: bad fingerprint accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
-- The account's limit.
reset role;
insert into public.photos (owner, fingerprint, size, stored)
  select '00000000-0000-0000-0000-0000000000e1', lpad(to_hex(i), 64, 'c'), 5 * 1024 * 1024, true from generate_series(1, 59) i;
set role authenticated;
select pg_temp.check(public.reserve_photo(:FP2, 5 * 1024 * 1024) = 'full', '300 MB used: full');
reset role;
delete from public.photos where fingerprint like 'c%';
set role authenticated;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('photos', '00000000-0000-0000-0000-0000000000e1/' || repeat('d', 64) || '.jpg');
  raise exception 'FAILED: unreserved file accepted';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('photos', '00000000-0000-0000-0000-0000000000f1/' || repeat('a', 64) || '.jpg');
  raise exception 'FAILED: file in another account''s folder accepted';
exception when insufficient_privilege then null; end $$;

-- Unused photos: only after a day, and never one a project (even in the trash) uses.
select public.push_project('ph1', null, 'With photo', jsonb_build_object('shapes', '[]'::jsonb, 'photo', jsonb_build_object('fingerprint', :FP1)), 'Pixel');
reset role;
update public.photos set last_used = now() - interval '2 days';
set role authenticated;
select pg_temp.check(not exists (select 1 from public.unused_photos()), 'a used photo is not unused');
-- A plan from an app version before photos synced (no "photo" in it) keeps the server's photo.
select pg_temp.check(public.push_project('ph1', 1, 'With photo', '{"shapes":[1]}', 'Old laptop') ->> 'revision' = '2', 'old-version upload');
select pg_temp.check((select content -> 'photo' ->> 'fingerprint' = :FP1 and content -> 'shapes' = '[1]' from public.projects where id = 'ph1'), 'photo kept with the old-version plan');
select pg_temp.check(public.push_project('ph1', 2, 'With photo', '{"shapes":[1],"location":{"zip":"71923","zone":"8a"}}', 'Pixel') ->> 'revision' = '3', 'new-version upload with a location');
select pg_temp.check(public.push_project('ph1', 3, 'With photo', '{"shapes":[2]}', 'Old laptop') ->> 'revision' = '4', 'old-version upload');
select pg_temp.check((select content -> 'location' ->> 'zone' = '8a' and content -> 'photo' ->> 'fingerprint' = :FP1 and content -> 'shapes' = '[2]' from public.projects where id = 'ph1'), 'location and photo kept with the old-version plan (04)');
select pg_temp.check(public.push_project('ph1', 4, 'With photo', '{"shapes":[2],"location":null}', 'Pixel') ->> 'revision' = '5', 'location cleared');
select pg_temp.check((select content -> 'location' = 'null'::jsonb from public.projects where id = 'ph1'), 'a cleared location stays cleared');
select pg_temp.check((select last_used > now() - interval '1 minute' from public.photos where fingerprint = :FP1), 'uploading a plan marks its photo in use');
reset role;
update public.photos set last_used = now() - interval '2 days';
set role authenticated;
select pg_temp.check(public.trash_project('ph1', 5, 'Pixel') = 'ok', 'trash the project');
select pg_temp.check(not exists (select 1 from public.unused_photos()), 'a photo of a trashed project is kept');
select pg_temp.check(public.restore_project('ph1', 'Pixel') = 7, 'restore');
select pg_temp.check(public.push_project('ph1', 7, 'With photo', '{"shapes":[],"photo":null}', 'Pixel') ->> 'status' = 'ok', 'photo removed from the plan');
select pg_temp.check(not exists (select 1 from public.unused_photos()), 'just stopped being used: kept a day');
reset role;
update public.photos set last_used = now() - interval '2 days';
set role authenticated;
select pg_temp.check((select array_agg(f) from public.unused_photos() f) = array[:FP1], 'now unused');
select pg_temp.check(public.forget_photo(:FP1), 'forgotten');
select pg_temp.check(not public.forget_photo(:FP1), 'forgetting twice: nothing to do');
-- A photo still in use isn't forgotten.
select public.reserve_photo(:FP2, 1000);
select public.push_project('ph2', null, 'P2', jsonb_build_object('photo', jsonb_build_object('fingerprint', :FP2)), 'Pixel');
select pg_temp.check(not public.forget_photo(:FP2), 'in use: kept');

-- Another account sees none of it.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check(not exists (select 1 from public.photos), 'f sees no photo rows');
select pg_temp.check(not public.forget_photo(:FP2), 'f cannot forget e''s photo');
select pg_temp.check(public.reserve_photo(:FP1, 10) = 'paused', 'f (no trial) cannot reserve');
select pg_temp.check(not exists (select 1 from storage.objects), 'f sees no files');

-- ---------- My plants ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.check(public.push_plant('u-abc', null, '{"id":"u-abc","common":"Rose"}', '2026-10-17T10:00:00Z', 'Pixel') = '{"status":"ok","revision":1}', 'new plant');
select pg_temp.check(public.push_plant('u-abc', 1, '{"id":"u-abc","common":"Rosa"}', '2026-10-17T11:00:00Z', 'Pixel') ->> 'revision' = '2', 'edit');
select pg_temp.check((select r ->> 'status' = 'conflict' and r -> 'plant' ->> 'common' = 'Rosa' and (r ->> 'edited_at')::timestamptz = '2026-10-17T11:00:00Z'
  from (select public.push_plant('u-abc', 1, '{"id":"u-abc","common":"Old"}', '2026-10-17T09:00:00Z', 'Laptop') r) x), 'stale base: conflict with the server''s plant');
select pg_temp.check(public.push_plant('u-abc', 2, null, '2026-10-17T12:00:00Z', 'Laptop') ->> 'revision' = '3', 'delete');
select pg_temp.check((select deleted_at is not null and revision = 3 from public.plant_list() where id = 'u-abc'), 'listed as deleted');
select pg_temp.check(public.push_plant('u-abc', 3, '{"id":"u-abc","common":"Back"}', '2026-10-17T13:00:00Z', 'Pixel') ->> 'revision' = '4', 'brought back');
select pg_temp.check((select deleted_at is null from public.plant_list() where id = 'u-abc'), 'live again');
select pg_temp.check(public.push_plant('u-none', null, null, now(), 'Pixel') ->> 'status' = 'ok', 'deleting what the server never had');
select public.push_plant('u-future', null, '{"id":"u-future","common":"F"}', now() + interval '10 years', 'Fast clock');
select pg_temp.check((select edited_at <= now() from public.plant_list() where id = 'u-future'), 'an edit time from the future is capped at now');
select public.push_plant('u-unknown', null, '{"id":"u-unknown","common":"U"}', null, 'Pixel');
select pg_temp.check((select edited_at is null from public.plant_list() where id = 'u-unknown'), 'an unknown edit time stays unknown');
do $$ begin perform public.push_plant('x-bad', null, '{}', now(), ''); raise exception 'FAILED: bad plant id accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
do $$ begin perform public.push_plant('u-' || repeat('x', 39), null, '{}', now(), ''); raise exception 'FAILED: long plant id accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
do $$ begin perform public.push_plant('u-arr', null, '[1]', now(), ''); raise exception 'FAILED: non-object plant accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check(not exists (select 1 from public.plant_list()), 'f sees no plants');
select pg_temp.check(public.push_plant('u-abc', 4, null, now(), '') ->> 'status' = 'paused', 'f (no trial) cannot touch plants');

-- Anonymous callers can't run anything.
reset role;
set role anon;
select pg_temp.as_user(null);
do $$ begin perform public.plant_list(); raise exception 'FAILED: anon ran plant_list'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.reserve_photo(repeat('a', 64), 1); raise exception 'FAILED: anon ran reserve_photo'; exception when insufficient_privilege then null; end $$;
reset role;
select 'photo and plant checks passed' as result;
