-- FullGrown: the beta. Sign-ups from the form on fullgrown.garden/beta, and beta codes.
--
-- Run after 05-grants.sql: Supabase → SQL Editor → New query → paste → Run. Safe to run again.
--
-- Making a code (in the SQL Editor, never in the app): a code for 10 people, for wave 1, good for 60 days:
--   select public.new_beta_code(10, 'Wave 1', 60);
-- The sign-ups: Table Editor → beta_signups. When the beta ends, empty it (the privacy policy says so):
--   truncate public.beta_signups;

-- ---------- Sign-ups ----------
-- The website has no accounts, so anyone may sign up, through one function that checks each answer. Nobody
-- can read the list through the API: no grants, and row-level security with no rules.
create table if not exists public.beta_signups (
  id bigint generated always as identity primary key,
  email text not null check (length(email) between 6 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_key text not null unique,
  first_name text not null check (length(first_name) between 1 and 60),
  place text not null check (length(place) between 2 and 40),
  phone text not null check (phone in ('android', 'iphone', 'other', 'none')),
  computer boolean not null default false,
  planning text check (length(planning) <= 1000),
  heard text check (length(heard) <= 200),
  created_at timestamptz not null default now()
);
alter table public.beta_signups enable row level security;

-- 'ok' for a sign-up, also one already on the list (the first one stands, so nobody can change another
-- person's answers by typing their email); 'invalid' with what's wrong; 'busy' past 200 in an hour, all told,
-- a cap on a flood. The same answer for a new address and a known one, so the form can't be used to find out
-- who signed up.
create or replace function public.beta_signup(p_email text, p_first_name text, p_place text, p_phone text,
  p_computer boolean, p_planning text, p_heard text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_first_name, ''));
  v_place text := trim(coalesce(p_place, ''));
  v_phone text := lower(trim(coalesce(p_phone, '')));
  v_planning text := nullif(trim(coalesce(p_planning, '')), '');
  v_heard text := nullif(trim(coalesce(p_heard, '')), '');
begin
  if length(v_email) not between 6 and 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'invalid: email'; end if;
  if length(v_name) not between 1 and 60 then return 'invalid: first name'; end if;
  if length(v_place) not between 2 and 40 then return 'invalid: ZIP code or state'; end if;
  if v_phone not in ('android', 'iphone', 'other', 'none') then return 'invalid: phone'; end if;
  if length(v_planning) > 1000 then return 'invalid: what you''re planning'; end if;
  if length(v_heard) > 200 then return 'invalid: how you heard'; end if;
  if (select count(*) from public.beta_signups where created_at > now() - interval '1 hour') >= 200 then return 'busy'; end if;
  insert into public.beta_signups (email, email_key, first_name, place, phone, computer, planning, heard)
  values (v_email, public.email_key(v_email), v_name, v_place, v_phone, coalesce(p_computer, false), v_planning, v_heard)
  on conflict (email_key) do nothing;
  return 'ok';
end $$;
revoke all on function public.beta_signup(text, text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.beta_signup(text, text, text, text, boolean, text, text) to anon, authenticated;

-- ---------- Beta codes ----------
-- A code makes a signed-in account a beta account (everything free during the beta). Each code serves up
-- to max_uses accounts, and can expire. Codes live only here, never in the app or this file.
create table if not exists public.beta_codes (
  code text primary key check (code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  max_uses integer not null check (max_uses between 1 and 1000),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
alter table public.beta_codes enable row level security;

-- Which account used which code (one each).
create table if not exists public.beta_redemptions (
  owner uuid primary key references auth.users (id) on delete cascade,
  code text not null references public.beta_codes (code) on delete cascade,
  at timestamptz not null default now()
);
alter table public.beta_redemptions enable row level security;

-- Wrong codes, to stop guessing: 10 an hour per account.
create table if not exists public.beta_code_tries (
  owner uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists beta_code_tries_owner_at on public.beta_code_tries (owner, at);
alter table public.beta_code_tries enable row level security;
-- Before 2026-10-30 Supabase gave every new table to its API roles, with row-level security the guard
-- (05-grants.sql). These four are reached only through the functions below, so take that away too.
revoke all on public.beta_signups, public.beta_codes, public.beta_redemptions, public.beta_code_tries from anon, authenticated;

-- A new code like 'K7PQ-M3XD': 8 characters from 31 (no 0/O, 1/I/L), from the server's strong random
-- source, about 40 bits. For the SQL Editor only.
create or replace function public.new_beta_code(p_uses integer, p_note text default null, p_days integer default null)
returns text language plpgsql set search_path = '' as $$
declare
  letters constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea;
  c text;
begin
  loop
    b := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
    c := '';
    for i in 0..7 loop
      -- Bytes 6 and 8 carry the uuid's version and variant bits: skipped.
      c := c || substr(letters, 1 + get_byte(b, (array[0, 1, 2, 3, 4, 5, 9, 10])[i + 1]) % 31, 1);
      if i = 3 then c := c || '-'; end if;
    end loop;
    exit when not exists (select 1 from public.beta_codes where code = c);
  end loop;
  insert into public.beta_codes (code, max_uses, note, expires_at)
  values (c, p_uses, p_note, case when p_days is null then null else now() + make_interval(days => p_days) end);
  return c;
end $$;
revoke all on function public.new_beta_code(integer, text, integer) from public, anon, authenticated;

-- Use a code. 'ok' (now a beta account), 'already' (already on the beta), 'paid' (a paid plan: left as it
-- is), 'invalid' (no such code, or expired), 'used-up', 'too-many' (10 wrong codes in the last hour).
-- Spaces, dashes and lower case don't matter: 'k7pq m3xd' is K7PQ-M3XD.
create or replace function public.redeem_beta_code(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  current_plan text;
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  rec public.beta_codes;
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from public.beta_code_tries where at < now() - interval '1 day';
  if (select count(*) from public.beta_code_tries where owner = me and at > now() - interval '1 hour') >= 10 then
    return 'too-many';
  end if;
  select plan into current_plan from public.plans where owner = me for update;
  if current_plan = 'beta' then return 'already'; end if;
  if current_plan = 'active' then return 'paid'; end if;
  if length(c) = 8 then c := substr(c, 1, 4) || '-' || substr(c, 5, 4); end if;
  select * into rec from public.beta_codes where code = c for update;
  if not found or (rec.expires_at is not null and rec.expires_at <= now()) then
    insert into public.beta_code_tries (owner) values (me);
    return 'invalid';
  end if;
  if rec.uses >= rec.max_uses then return 'used-up'; end if;
  update public.beta_codes set uses = uses + 1 where code = c;
  insert into public.beta_redemptions (owner, code) values (me, c)
    on conflict (owner) do update set code = excluded.code, at = now();
  insert into public.plans (owner, plan, trial_ends) values (me, 'beta', null)
    on conflict (owner) do update set plan = 'beta';
  return 'ok';
end $$;
revoke all on function public.redeem_beta_code(text) from public, anon, authenticated;
grant execute on function public.redeem_beta_code(text) to authenticated;
