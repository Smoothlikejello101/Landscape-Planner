-- FullGrown: the beta sign-up form's check that a person is filling it in (Cloudflare Turnstile; Jason, Nov 5).
--
-- Run after 07-signup-alerts.sql: Supabase → SQL Editor → New query → paste → Run. Safe to run again, and safe to run
-- before anything else is in place: it adds a way in for the server function (supabase/functions/beta-signup) and
-- changes nothing for the form as it is. 09-beta-close.sql, pasted last, then closes the form's old way in.
--
-- beta_signup_checked: what beta_signup does (06-beta.sql: the same checks, the same answers, the same limits), for
-- the server function only, once Cloudflare has said a person filled in the form. The function passes the internet
-- address the form was sent from (p_ip): the request that reaches the database is the function's own.
create or replace function public.beta_signup_checked(p_ip text, p_email text, p_first_name text, p_place text,
  p_phone text, p_computer boolean, p_planning text, p_heard text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_first_name, ''));
  v_place text := trim(coalesce(p_place, ''));
  v_phone text := lower(trim(coalesce(p_phone, '')));
  v_planning text := nullif(trim(coalesce(p_planning, '')), '');
  v_heard text := nullif(trim(coalesce(p_heard, '')), '');
  v_ip text := nullif(trim(coalesce(p_ip, '')), '');
  v_ip_hash text := case when v_ip is null then null else encode(pg_catalog.sha256(convert_to(v_ip, 'UTF8')), 'hex') end;
begin
  -- Every try counts, a wrong answer too, so a flood of bad data is held back as well.
  delete from public.beta_signup_tries where at < now() - interval '1 hour';
  if v_ip_hash is not null then
    if (select count(*) from public.beta_signup_tries where ip_hash = v_ip_hash) >= 10 then return 'too-many'; end if;
    insert into public.beta_signup_tries (ip_hash) values (v_ip_hash);
  end if;
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
-- Only the server function (it calls with the project's secret key: the service_role), never the website or the app.
revoke all on function public.beta_signup_checked(text, text, text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.beta_signup_checked(text, text, text, text, text, boolean, text, text) to service_role;
