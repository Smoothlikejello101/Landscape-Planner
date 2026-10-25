-- On the live project, made before Supabase's 2026-10-30 change, a new table in "public" still gets every
-- privilege for the API roles by default. Run on a database set up that way (scripts/test-sql.sh): the beta's
-- tables and their sequence must end with none, so only its functions reach them.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
do $$
declare t text; r text; p text;
begin
  foreach t in array array['public.beta_signups', 'public.beta_signup_tries', 'public.beta_codes', 'public.beta_redemptions', 'public.beta_code_tries'] loop
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
        if has_table_privilege(r, t, p) then raise exception 'FAILED: % can % on %', r, p, t; end if;
      end loop;
    end loop;
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if has_sequence_privilege(r, 'public.beta_signups_id_seq', 'usage') or has_sequence_privilege(r, 'public.beta_signups_id_seq', 'select')
      or has_sequence_privilege(r, 'public.beta_signups_id_seq', 'update') then
      raise exception 'FAILED: % can use the sign-up sequence', r;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.new_beta_code(integer, text, integer)', 'execute')
    or has_function_privilege('authenticated', 'public.new_beta_code(integer, text, integer)', 'execute') then
    raise exception 'FAILED: the API can make codes';
  end if;
  if has_function_privilege('anon', 'public.redeem_beta_code(text)', 'execute') then raise exception 'FAILED: anon can use a code'; end if;
end $$;
select 'wide-grant checks passed' as result;
