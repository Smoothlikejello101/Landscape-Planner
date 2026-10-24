-- Tests for 06-beta.sql (sign-ups and beta codes), after sync-test.sql. Run with scripts/test-sql.sh.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cara@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'dev@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'eli@example.com'),
  ('00000000-0000-0000-0000-0000000000c4', 'flo@example.com');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u, ''), false);
end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
end $$;

-- ---------- Sign-ups: from the website, with no account ----------
set role anon;
select pg_temp.check(public.beta_signup(' Cara.Smith+beta@Gmail.com ', 'Cara', '72923', 'iphone', true, 'A shade bed under the oaks', 'Reddit') = 'ok', 'sign-up');
-- The same Gmail address another way: still one sign-up, and the first answers stand.
select pg_temp.check(public.beta_signup('carasmith@gmail.com', 'Someone else', 'TX', 'android', false, null, null) = 'ok', 'a second sign-up answers the same');
select pg_temp.check(public.beta_signup('not-an-email', 'Dev', 'Ohio', 'android', false, null, null) = 'invalid: email', 'bad email refused');
select pg_temp.check(public.beta_signup('dev@example.com', '  ', 'Ohio', 'android', false, null, null) = 'invalid: first name', 'blank name refused');
select pg_temp.check(public.beta_signup('dev@example.com', 'Dev', 'O', 'android', false, null, null) = 'invalid: ZIP code or state', 'place too short refused');
select pg_temp.check(public.beta_signup('dev@example.com', 'Dev', 'Ohio', 'blackberry', false, null, null) = 'invalid: phone', 'unknown phone refused');
select pg_temp.check(public.beta_signup('dev@example.com', 'Dev', 'Ohio', 'none', false, repeat('x', 1001), null) = 'invalid: what you''re planning', 'long answer refused');
select pg_temp.check(public.beta_signup('dev@example.com', 'Dev', 'Ohio', 'none', false, '   ', '') = 'ok', 'blank optional answers are fine');
-- Nobody reads or writes the list through the API.
do $$ begin perform 1 from public.beta_signups; raise exception 'FAILED: anon read the sign-ups'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into public.beta_signups (email, email_key, first_name, place, phone) values ('x@y.zz', 'k', 'X', 'TX', 'none'); raise exception 'FAILED: anon wrote a sign-up directly'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.new_beta_code(5); raise exception 'FAILED: anon made a code'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.redeem_beta_code('ABCD-EFGH'); raise exception 'FAILED: anon used a code'; exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.check((select count(*) = 2 from public.beta_signups), 'two sign-ups kept');
select pg_temp.check((select first_name = 'Cara' and email = 'cara.smith+beta@gmail.com' and place = '72923' and phone = 'iphone' and computer
  and planning = 'A shade bed under the oaks' and heard = 'Reddit' from public.beta_signups where first_name = 'Cara'), 'the first answers, trimmed');
select pg_temp.check((select planning is null and heard is null from public.beta_signups where first_name = 'Dev'), 'blank answers stored as none');
-- Past 200 sign-ups in an hour: busy.
insert into public.beta_signups (email, email_key, first_name, place, phone)
  select 'f' || i || '@example.com', 'flood' || i, 'F', 'TX', 'none' from generate_series(1, 200) i;
set role anon;
select pg_temp.check(public.beta_signup('late@example.com', 'Late', 'TX', 'none', false, null, null) = 'busy', 'flood cap');
reset role;
delete from public.beta_signups where email_key like 'flood%';
-- One internet address: 10 tries an hour, wrong ones too; another address isn't held back.
set role anon;
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7, 10.0.0.1"}', false);
select pg_temp.check(public.beta_signup('a' || i || '@example.com', 'A', 'TX', 'none', false, null, null) = 'ok', 'tries from one address') from generate_series(1, 9) i;
select pg_temp.check(public.beta_signup('bad', 'A', 'TX', 'none', false, null, null) = 'invalid: email', 'a wrong try counts too');
select pg_temp.check(public.beta_signup('a99@example.com', 'A', 'TX', 'none', false, null, null) = 'too-many', 'the eleventh try from one address waits');
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.4"}', false);
select pg_temp.check(public.beta_signup('b1@example.com', 'B', 'TX', 'none', false, null, null) = 'ok', 'another address is fine');
select set_config('request.headers', '', false);
reset role;
select pg_temp.check((select count(*) = 2 and bool_and(ip_hash ~ '^[0-9a-f]{64}$') from (select distinct ip_hash from public.beta_signup_tries) x), 'addresses kept only as hashes');
select pg_temp.check((select count(*) = 0 from public.beta_signup_tries where ip_hash like '%203.0.113%'), 'no address in the clear');
-- An hour later the address may try again; older tries are deleted.
update public.beta_signup_tries set at = now() - interval '61 minutes';
set role anon;
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7"}', false);
select pg_temp.check(public.beta_signup('a99@example.com', 'A', 'TX', 'none', false, null, null) = 'ok', 'an hour later, fine again');
select set_config('request.headers', '', false);
reset role;
select pg_temp.check((select count(*) = 1 from public.beta_signup_tries), 'tries older than an hour deleted');
delete from public.beta_signups where email ~ '^(a[0-9]+|b1)@example\.com$';
select pg_temp.check((select count(*) = 2 from public.beta_signups), 'back to the two sign-ups');

-- ---------- Codes ----------
create temp table codes as select public.new_beta_code(2, 'Wave 1') as wave1, public.new_beta_code(5, 'Old', 1) as old;
select pg_temp.check((select wave1 ~ '^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$' from codes), 'a code is 8 clear characters');
select pg_temp.check((select count(distinct c) = 50 from (select public.new_beta_code(1) c from generate_series(1, 50)) x), 'codes differ');
update public.beta_codes set expires_at = now() - interval '1 minute' where code = (select old from codes);
grant select on codes to authenticated;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
-- Lower case, spaces, no dash: the same code.
select pg_temp.check(public.redeem_beta_code(lower(replace((select wave1 from codes), '-', ' '))) = 'ok', 'code used');
select pg_temp.check((select plan = 'beta' from public.plans where owner = auth.uid()), 'now a beta account');
select pg_temp.check(public.redeem_beta_code((select wave1 from codes)) = 'already', 'already on the beta');
-- The plan can't be changed any other way: refused here (no grant); on a database with older, wider grants,
-- row-level security leaves it nothing to update. Either way account c2's plan stays as it was.
do $$ begin update public.plans set plan = 'beta'; exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.check((select plan = 'trial' from public.plans where owner = '00000000-0000-0000-0000-0000000000c2'), 'another account''s plan unchanged');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ begin perform 1 from public.beta_codes; raise exception 'FAILED: codes readable'; exception when insufficient_privilege then null; end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check(public.redeem_beta_code((select old from codes)) = 'invalid', 'expired code refused');
select pg_temp.check(public.redeem_beta_code('ZZZZ-ZZZZ') = 'invalid', 'unknown code refused');
select pg_temp.check(public.redeem_beta_code((select wave1 from codes)) = 'ok', 'second use');
select pg_temp.check((select plan = 'beta' from public.plans where owner = auth.uid()), 'second beta account');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check(public.redeem_beta_code((select wave1 from codes)) = 'used-up', 'a code serves only its count');
select pg_temp.check((select plan = 'trial' from public.plans where owner = auth.uid()), 'used-up code changes nothing');
-- Guessing: 10 wrong codes in an hour, then even a good one waits.
select public.redeem_beta_code('WRNG-' || lpad(i::text, 4, 'A')) from generate_series(1, 8) i;
select pg_temp.check(public.redeem_beta_code('ZZZZ-ZZZZ') = 'invalid', 'ninth wrong code');
reset role;
-- (the expired and unknown tries above were account c2's)
select pg_temp.check((select count(*) = 9 from public.beta_code_tries where owner = '00000000-0000-0000-0000-0000000000c3'), 'wrong codes counted');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check(public.redeem_beta_code('ZZZZ-ZZZZ') = 'invalid', 'tenth wrong code');
reset role;
create temp table good as select public.new_beta_code(5, 'Wave 2') as code;
grant select on good to authenticated;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check(public.redeem_beta_code((select code from good)) = 'too-many', 'after 10 wrong codes, wait');
reset role;
update public.beta_code_tries set at = now() - interval '2 hours' where owner = '00000000-0000-0000-0000-0000000000c3';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check(public.redeem_beta_code((select code from good)) = 'ok', 'an hour later, the good code works');

-- A paid account is left as it is.
reset role;
update public.plans set plan = 'active', paid_until = now() + interval '1 year' where owner = '00000000-0000-0000-0000-0000000000c4';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
select pg_temp.check(public.redeem_beta_code((select code from good)) = 'paid', 'paid plan left alone');
select pg_temp.check((select plan = 'active' from public.plans where owner = auth.uid()), 'still paid');
select pg_temp.as_user(null);
do $$ begin perform public.redeem_beta_code('ABCD-EFGH'); raise exception 'FAILED: no account'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
reset role;

-- Deleting an account takes its redemption and tries with it; the code's count stays.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.check((select count(*) = 0 from public.beta_redemptions where owner = '00000000-0000-0000-0000-0000000000c1'), 'redemption deleted with the account');
select pg_temp.check((select uses = 2 from public.beta_codes where code = (select wave1 from codes)), 'uses counted');

select 'beta checks passed';
