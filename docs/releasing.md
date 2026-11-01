# Releasing: Next, then the testers' app

Decided with Jason, 2026-10-31: merges don't reach testers one by one. They go to a preview copy of the app first, and
testers get them together, as one update, when Jason says so.

## Where a change goes

| Branch | What happens | Who sees it |
| --- | --- | --- |
| a pull request's | tested | — |
| `main` (each merged pull request) | tested, then built as **Next** and published at **next.fullgrown.garden** (about 25 minutes after the merge) | Jason, trying it |
| `release` (a release pull request from main) | tested, then deployed to **app.fullgrown.garden** | testers, and Jason's own plans |

Next (`src/channel.ts`, `APP_CHANNEL=next`) is the same app with:
- **Its own web address, so its own plans.** An installed web app keeps its plans in the browser, per address: Next
  can't read or change the real app's. To try a change on real plans: in the real app, Projects → **Back up all
  projects**; in Next, Projects → **Import from file**. The original is never touched.
- **Sign-in and sync off** (Jason: "Off on Next"). It shares the one Supabase backend, so untested code never writes to
  synced plans. A change to sync is tried with a throwaway account, never Jason's own, and only when I ask for it.
- **A name of its own**: "FG Next" on the home screen, "FullGrown Next (preview)" as its title, an amber stripe along
  the top, and "Next (preview)" beside the version in ⋮. It asks search engines to leave it alone.

## Day to day

1. Each change is built on its own branch; the type check, the unit tests and the end-to-end tests that cover it pass,
   and a pull request into `main` is opened. A change people will notice adds its What's new lines in that pull
   request (below). CI is the full check (Jason, Nov 1): it runs every test on the pull request as it would merge into
   main, in about 3 minutes, and a pull request is ready to merge once it passes.
2. Jason merges pull requests whenever he likes. Merging updates Next only.
3. Jason tries Next when he has a few minutes: it's installed on his phone beside the real app.

## A release

When Jason says "release":
1. I check the release not yet out (the top one in `src/whats-new.json` dated `"next"`, with the lines waiting in
   `src/whats-new/next/`) covers every change people will notice since the last release, and open a pull request from
   `main` into `release`, titled "Release N: <what's in it>", listing its What's new lines and the pull requests it
   carries. If the lines want putting in order first (the most noticeable first), a pull request runs
   `node scripts/release/whats-new-fold.mjs` (no date), which moves them into `src/whats-new.json`, still `"next"`.
2. Jason merges it. CI tests it and deploys app.fullgrown.garden. Testers get one "A new version of the app is ready"
   banner, then, once they update, one What's new notice.
3. Right after it merges, I open a small pull request into main that runs
   `node scripts/release/whats-new-fold.mjs <the day release N went out>`: the waiting lines move into
   `src/whats-new.json` and its date replaces `"next"`, so Next stops calling those changes "Not released yet". CI on
   any other pull request fails until that's done (`scripts/release/whats-new-check.mjs`).

A release every day or two is plenty in the beta. If changes wait on Next more than a few days, I say what's ready.
I don't release on my own, and never push to `release` directly.

**An urgent fix** goes the same way, released at once. If main holds changes Jason hasn't tried, the fix is instead
branched from `release`, sent as a pull request into `release` (tested, then deployed once merged), and then brought
back into main by a pull request from `release`.

## What's new

`src/whats-new.json`, newest first, each release an `id` (counting up), a `date`, and its lines; and the lines waiting
for the release not yet out, a file a pull request in `src/whats-new/next/` (named like the branch,
`pins-sooner.json`, a JSON list of lines). The app adds the waiting lines to the top release if it's dated `"next"`,
after its own, else to a new one dated `"next"` (`src/whats-new-pending.ts`). A file a pull request means pull requests
open side by side never change the same lines, so merging main into one doesn't stop on What's new. The rules,
checked by CI against the release branch's copy (its waiting lines included):
- A pull request's new lines go in a file of its own in `src/whats-new/next/`. A release that's out never gets new
  lines: devices that saw it would never be shown them. Right after a release, until its date is written in, new
  lines would join it, so CI refuses them until then.
- Only the top release may be dated `"next"`. In Next it shows as "Not released yet"; a release build shows its
  build day until the real date is written in.
- Lines say what people will see, in plain words, with no "tap" or "click".

## One-time setup (Jason)

0. **Verify fullgrown.garden with GitHub**, if it isn't already: your GitHub Settings → Pages → Verified domains → Add
   a domain, put the TXT record it gives into fullgrown.garden's DNS, then Verify. A CNAME to
   `smoothlikejello101.github.io` only sends that one name to GitHub's Pages servers, and GitHub serves whichever repo
   claims it. Until a repo does, someone else's could ("subdomain takeover"). Verifying stops that for every
   fullgrown.garden name, app.fullgrown.garden's too.
1. **The Next site's repo.** On GitHub, create a public repository, `Smoothlikejello101/fullgrown-next`, with a README
   (so it has a branch). Its Pages site will serve the `gh-pages` branch CI pushes.
2. **The address.** Where fullgrown.garden's DNS is managed, add a CNAME record: `next` →
   `smoothlikejello101.github.io`.
3. **The token CI publishes with.** GitHub → Settings → Developer settings → Fine-grained tokens → Generate new
   token:
   - name "FullGrown Next deploy";
   - expiration: 1 year;
   - repository access: only `fullgrown-next`;
   - permissions: Contents, read and write.

   Copy it straight into Landscape-Planner → Settings → Secrets and variables → Actions → New repository secret, named
   `NEXT_DEPLOY_TOKEN`. Never in chat. When it expires, Next stops updating (CI says so); make a new one the same way.
4. **Let the release branch deploy.** Landscape-Planner → Settings → Environments → github-pages → Deployment branches
   and tags → add `release`. (Until then, a release's deploy is refused, and the testers' app stays as it was.)
5. **After the first push to Next** (after the first merge once 1–3 are done): fullgrown-next → Settings → Pages → Source
   "Deploy from a branch", branch `gh-pages`, folder `/`; Custom domain `next.fullgrown.garden`; Enforce HTTPS once it's
   offered.

The release branch was made from main as of #167 (what the testers' app was running), on 2026-10-31.
