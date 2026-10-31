-- A stand-in for the parts of Supabase the setup scripts use, so they can be
-- run and tested on a plain Postgres: the roles, auth.users and auth.uid(),
-- and the storage tables. Not for Supabase itself.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now());
-- As in Supabase: the signed-in account, from the request's token.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create or replace function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to authenticated;

-- Supabase's API roles and the public schema. Since 2026-10-30 a new table there gets no grants to them
-- (before, they got everything, with row-level security the guard): each table the app reads needs its own
-- grant (05-grants.sql). The stub does as Supabase now does, so a missing grant fails here first.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

-- pg_net and Vault (07-signup-alerts.sql): a request is kept, not sent; a secret is read back as stored.
create schema if not exists net;
create table if not exists net.requests (id bigserial primary key, url text, body jsonb, headers jsonb);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language sql as $$
  insert into net.requests (url, body, headers) values (url, body, headers) returning id
$$;
create schema if not exists vault;
create table if not exists vault.secrets (name text primary key, secret text not null);
create or replace view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
