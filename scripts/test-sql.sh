#!/bin/sh
# Run the Supabase setup scripts and their tests on a scratch Postgres
# (a stand-in for Supabase's auth and storage; never the live project).
#   PGHOST=... PGPORT=... PGUSER=postgres scripts/test-sql.sh
set -e
cd "$(dirname "$0")/.."
P="psql -v ON_ERROR_STOP=1 -q -X"
$P -c "drop database if exists lp_sql_test" -c "create database lp_sql_test"
$P -d lp_sql_test -f supabase/test/supabase-stub.sql
for f in supabase/0*.sql; do $P -d lp_sql_test -f "$f"; done
for f in supabase/0*.sql; do $P -d lp_sql_test -f "$f"; done # all again, in order: safe to run again
$P -d lp_sql_test -f supabase/test/sync-test.sql
$P -d lp_sql_test -f supabase/test/photos-plants-test.sql
$P -d lp_sql_test -f supabase/test/beta-test.sql
$P -d lp_sql_test -f supabase/test/signup-alerts-test.sql
sh supabase/test/race-test.sh
# The live project, made before Supabase's 2026-10-30 change: new tables get every privilege by default.
$P -c "drop database if exists lp_sql_test_wide" -c "create database lp_sql_test_wide"
$P -d lp_sql_test_wide -f supabase/test/supabase-stub.sql
$P -d lp_sql_test_wide -c "alter default privileges in schema public grant all on tables to anon, authenticated" \
  -c "alter default privileges in schema public grant all on sequences to anon, authenticated"
for f in supabase/0*.sql; do $P -d lp_sql_test_wide -f "$f"; done
$P -d lp_sql_test_wide -f supabase/test/grants-wide-test.sql
$P -c "drop database lp_sql_test_wide"
