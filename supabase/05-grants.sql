-- FullGrown: grants for the tables the app reads.
--
-- Run after 04-keep-fields.sql: Supabase → SQL Editor → New query → paste → Run. Safe to run again.
--
-- Since 2026-10-30, Supabase gives a new table in "public" no grants to its API roles (before, it gave them
-- everything, with row-level security as the guard). So a database set up again from these scripts (a new
-- project, a branch, a reset) needs said what the app reads directly (supabase-js `.from(...)`): its plan,
-- its projects and its own plants; and the photo reservations, which the storage policy for adding a photo
-- file reads as the user (03-photos-plants.sql: without it, every photo upload is refused).
--
-- Reading only, and only signed in: row-level security still limits each to its own rows (01-accounts.sql,
-- 03-photos-plants.sql). Every write, and every other table, goes through the functions (security definer),
-- which need no table grants. On the existing project this changes nothing: its tables kept their older,
-- wider grants.

grant select on public.plans to authenticated;
grant select on public.projects to authenticated;
grant select on public.my_plants to authenticated;
grant select on public.photos to authenticated;
