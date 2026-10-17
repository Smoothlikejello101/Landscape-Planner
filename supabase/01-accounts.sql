-- Landscape Planner: accounts (sync step 1).
--
-- Paste into Supabase: SQL Editor → New query → paste → Run.
-- Safe to run again: it only creates what isn't there and replaces the rules
-- and functions. (Changes to an existing table's columns come as a new script.)
-- Later scripts (02-sync.sql, ...) replace some of these functions: if you
-- run this one again, run the later ones again after it.
--
-- Every table is locked with row-level security: a signed-in account can
-- only ever see its own rows. The app uses the public key, which can do
-- nothing beyond these rules.

-- ---------- Plans: the account's subscription (trial, paid, lapsed, beta) ----------
create table if not exists public.plans (
  owner uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial', 'active', 'lapsed', 'beta')),
  source text check (source in ('stripe', 'play', 'appstore', 'manual')),
  trial_ends timestamptz not null default now() + interval '30 days',
  paid_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.plans enable row level security;
drop policy if exists "plans: read own" on public.plans;
create policy "plans: read own" on public.plans for select to authenticated using (owner = auth.uid());
-- No insert/update/delete rules: only the server (sign-up below, payments later) changes a plan.

-- Emails that have had a trial, kept (as a one-way fingerprint, not the
-- address) after an account is deleted, so deleting and signing up again
-- doesn't start a new trial. No access rules: the app can't read it.
create table if not exists public.trial_used (
  email_hash text primary key,
  at timestamptz not null default now()
);
alter table public.trial_used enable row level security;
create or replace function public.email_hash(email text) returns text
language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to(lower(trim(coalesce(email, ''))), 'UTF8')), 'hex')
$$;
revoke all on function public.email_hash(text) from public, anon, authenticated;

-- Every new account starts a 30-day trial (unless that email has had one).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and exists (select 1 from public.trial_used where email_hash = public.email_hash(new.email)) then
    insert into public.plans (owner, trial_ends) values (new.id, now()) on conflict (owner) do nothing;
  else
    insert into public.plans (owner) values (new.id) on conflict (owner) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
-- Accounts made before this ran (a test sign-in, say) get their trial too.
insert into public.plans (owner) select id from auth.users on conflict (owner) do nothing;

-- ---------- Projects (written by the sync step; set up now) ----------
create table if not exists public.projects (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  content jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz,
  primary key (owner, id),
  constraint projects_content_size check (pg_column_size(content) <= 2 * 1024 * 1024)
);
alter table public.projects enable row level security;
drop policy if exists "projects: read own" on public.projects;
create policy "projects: read own" on public.projects for select to authenticated using (owner = auth.uid());
-- Writes go through one server function (next step), so two devices can never both "win".

-- ---------- My plants: one row per plant in the library ----------
create table if not exists public.my_plants (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  plant jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner, id),
  constraint my_plants_size check (pg_column_size(plant) <= 64 * 1024)
);
alter table public.my_plants enable row level security;
drop policy if exists "my_plants: own" on public.my_plants;
create policy "my_plants: own" on public.my_plants for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- ---------- Photos: one row per stored background photo ----------
create table if not exists public.photos (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  size integer not null check (size > 0 and size <= 5 * 1024 * 1024),
  created_at timestamptz not null default now(),
  primary key (owner, fingerprint)
);
alter table public.photos enable row level security;
drop policy if exists "photos: own" on public.photos;
create policy "photos: own" on public.photos for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- The photo files: a private bucket, <owner id>/<fingerprint>.jpg, 5 MB each at most.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
drop policy if exists "photos bucket: own folder" on storage.objects;
create policy "photos bucket: own folder" on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Delete my account ----------
-- Removes the sign-in record; its projects, plants, photo records and plan
-- go with it (on delete cascade). The app deletes the account's photo files
-- through the storage service first.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  addr text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select email into addr from auth.users where id = auth.uid();
  if addr is not null then
    insert into public.trial_used (email_hash) values (public.email_hash(addr)) on conflict do nothing;
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
