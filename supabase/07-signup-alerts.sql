-- FullGrown: an email to us when someone signs up for the beta (Jason, Oct 31).
--
-- Run after 06-beta.sql: Supabase → SQL Editor → New query → paste → Run. Safe to run again.
--
-- First, once: a Resend API key with sending access only, kept in Supabase's Vault (never in this file, the app
-- or the repo). In the SQL Editor, with the key pasted in place of re_…:
--   select vault.create_secret('re_…', 'resend_signup_alerts', 'Resend: beta sign-up alerts');
-- No key there, no email: sign-ups go on as before. To stop the alerts:
--   drop trigger if exists beta_signup_alert on public.beta_signups;
--
-- The email says only that someone signed up, and how many are on the list: nobody's answers go to Resend
-- (the privacy policy lists Resend for sign-in codes only). The answers stay in Table Editor → beta_signups.
-- Five an hour at most: past that, a flood, the next email after it says how many came.
-- If one doesn't come: select status_code, content::text from net._http_response order by created desc limit 3;

-- pg_net: Supabase's way to make a web request from the database (also under Database → Extensions).
do $$ begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

create or replace function public.beta_signup_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  n bigint;
begin
  if (select count(*) from public.beta_signups where created_at > now() - interval '1 hour') > 5 then return null; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'resend_signup_alerts' limit 1;
  if k is null then return null; end if;
  select count(*) into n from public.beta_signups;
  -- (Queued, and sent after the sign-up is saved: a slow or failed request never holds one up.)
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', 'FullGrown <alerts@fullgrown.garden>',
      'to', jsonb_build_array('hello@fullgrown.garden'),
      'subject', 'New beta sign-up (' || n || ' on the list)',
      'text', 'Someone signed up for the FullGrown beta: ' || n || ' on the list now.' || E'\n\n' ||
        'Their answers are in Supabase, Table Editor → beta_signups.'));
  return null;
exception when others then
  -- (Whatever goes wrong with the email, the sign-up stands.)
  raise warning 'beta sign-up alert not sent: %', sqlerrm;
  return null;
end $$;
revoke all on function public.beta_signup_alert() from public, anon, authenticated;

drop trigger if exists beta_signup_alert on public.beta_signups;
create trigger beta_signup_alert after insert on public.beta_signups
  for each row execute function public.beta_signup_alert();
