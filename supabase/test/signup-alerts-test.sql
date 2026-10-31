-- Tests for 07-signup-alerts.sql, after beta-test.sql. Run with scripts/test-sql.sh.
\set ON_ERROR_STOP 1
set client_min_messages = error;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
end $$;
truncate public.beta_signups, public.beta_signup_tries;
truncate net.requests;

-- No key in the Vault: no email, and the sign-up still goes on the list.
set role anon;
select pg_temp.check(public.beta_signup('ann@example.com', 'Ann', '72923', 'iphone', false, null, null) = 'ok', 'signed up without a key');
reset role;
select pg_temp.check((select count(*) = 0 from net.requests), 'no key, no email');

-- With one: an email to hello@ that says how many, and nothing anyone typed.
insert into vault.secrets (name, secret) values ('resend_signup_alerts', 're_test_key');
set role anon;
select pg_temp.check(public.beta_signup('bo@example.com', 'Bo Secretname', 'Ohio', 'android', true, 'A rain garden', 'A friend') = 'ok', 'signed up');
reset role;
select pg_temp.check((select count(*) = 1 from net.requests), 'one email');
select pg_temp.check((select url = 'https://api.resend.com/emails' and headers ->> 'Authorization' = 'Bearer re_test_key'
  and body -> 'to' = '["hello@fullgrown.garden"]'::jsonb and body ->> 'subject' = 'New beta sign-up (2 on the list)' from net.requests), 'to hello@, with the count');
select pg_temp.check((select position('bo@' in body::text) = 0 and position('Secretname' in body::text) = 0 and position('Ohio' in body::text) = 0
  and position('rain garden' in body::text) = 0 from net.requests), 'none of their answers');

-- The same person again: not a new sign-up, no email.
set role anon;
select pg_temp.check(public.beta_signup('BO@example.com', 'Bo', 'Ohio', 'android', true, null, null) = 'ok', 'signed up again');
reset role;
select pg_temp.check((select count(*) = 1 from net.requests), 'no email for one already on the list');

-- Five in an hour at most.
set role anon;
select public.beta_signup('p' || i || '@example.com', 'P', 'Texas', 'none', false, null, null) from generate_series(1, 6) i;
reset role;
select pg_temp.check((select count(*) = 4 from net.requests), 'five an hour (the 6th to 8th in the hour: none)');

-- An email that can't be queued never costs a sign-up.
truncate public.beta_signups;
alter function net.http_post(text, jsonb, jsonb, jsonb, integer) rename to http_post_away;
set role anon;
select pg_temp.check(public.beta_signup('cy@example.com', 'Cy', 'Maine', 'iphone', false, null, null) = 'ok', 'signed up with the email failing');
reset role;
alter function net.http_post_away(text, jsonb, jsonb, jsonb, integer) rename to http_post;
select pg_temp.check((select count(*) = 1 from public.beta_signups where email = 'cy@example.com'), 'on the list');

-- Not for the API to call.
select pg_temp.check(not has_function_privilege('anon', 'public.beta_signup_alert()', 'execute'), 'not callable by anon');

truncate public.beta_signups, public.beta_signup_tries;
delete from vault.secrets;
select 'sign-up alert checks passed';
