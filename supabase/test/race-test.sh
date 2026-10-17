#!/bin/sh
# Two devices uploading the same new project at the same moment (two real
# sessions): the second gets a conflict with the first's version, not an error.
# Run by scripts/test-sql.sh after sync-test.sql (account b is on the beta).
set -e
P="psql -v ON_ERROR_STOP=1 -q -X -d lp_sql_test"
B=00000000-0000-0000-0000-00000000000b
$P -c "begin; insert into public.projects (owner, id, name, content, updated_by) values ('$B', 'race', 'First', '{\"shapes\":[1]}', 'first'); select pg_sleep(1.5); commit;" > /dev/null &
FIRST=$!
sleep 0.5
OUT=$($P -t -A -c "set role authenticated; select set_config('request.jwt.claim.sub', '$B', false); select public.push_project('race', null, 'Second', '{\"shapes\":[2]}', 'second') ->> 'status';" | tail -1)
wait $FIRST
[ "$OUT" = "conflict" ] || { echo "FAILED: insert race gave '$OUT', not a conflict"; exit 1; }
echo "insert race: conflict (ok)"
