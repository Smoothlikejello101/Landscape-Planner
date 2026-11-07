#!/usr/bin/env bash
# Before a deploy (.github/workflows/ci.yml: `deploy`, app.fullgrown.garden from release; `next`, next.fullgrown.garden
# from main). Refuses, failing the job, to deploy:
#   - any commit but the head of the branch being deployed: a re-run of an older finished run would redeploy its
#     older commit;
#   - a build whose database version (src/db.ts DB_VERSION, published with each build as db-version.txt) is lower than
#     the live site's: every device that opened the newer one would find its plans refused (docs/storage.md).
# A live site without db-version.txt (404: the first deploy with one) is allowed; one that can't be read at all is not.
#
# Environment: LIVE_URL (https://app.fullgrown.garden), BRANCH (release), SHA (the commit built), REPO_URL (where to
# read the branch's head: never printed, it may hold a token), BUILD_DB_VERSION (the build's db-version.txt).
set -euo pipefail

fail() { echo "Not deployed: $*" >&2; exit 1; }
: "${LIVE_URL:?LIVE_URL}" "${BRANCH:?BRANCH}" "${SHA:?SHA}" "${REPO_URL:?REPO_URL}"
build="${BUILD_DB_VERSION:-}"
build="${build//[[:space:]]/}"

# 1. Only the branch's head.
head=$(git ls-remote "$REPO_URL" "refs/heads/$BRANCH" 2>/dev/null | cut -f1) || fail "couldn't read the head of $BRANCH."
[ -n "$head" ] || fail "couldn't read the head of $BRANCH."
[ "$head" = "$SHA" ] || fail "$SHA isn't the head of $BRANCH ($head): a re-run of an older run, or $BRANCH has moved on. Its own run deploys the head."

# 2. Never a lower database version than the live site's.
case "$build" in ''|*[!0-9]*) fail "the build's database version isn't known ('$build'): dist/db-version.txt is made by the build (vite.config.ts)." ;; esac
body=$(mktemp)
trap 'rm -f "$body"' EXIT
code=$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 --retry 3 --retry-delay 1 --retry-connrefused "$LIVE_URL/db-version.txt?t=$(date +%s)" 2>/dev/null) || code=000
case "$code" in
  200) ;;
  404) echo "$LIVE_URL has no db-version.txt yet: the first deploy with one, at database version $build."; exit 0 ;;
  *) fail "couldn't read $LIVE_URL/db-version.txt (HTTP $code), so it can't be told this build isn't older than the live one. Try again once the site answers." ;;
esac
live=$(tr -d '[:space:]' < "$body")
case "$live" in ''|*[!0-9]*) fail "$LIVE_URL/db-version.txt doesn't hold a version ('${live:0:40}')." ;; esac
if [ "$build" -lt "$live" ]; then
  fail "this build's database version ($build) is lower than the live site's ($live). Every device that opened the live one would find its plans refused. Fix forward instead (docs/releasing.md)."
fi
echo "Database version $build (live: $live); $SHA is the head of $BRANCH. Deploying."
