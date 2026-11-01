# Notes for working on this repo

- Owner: Jason. He uses it on Android (installed PWA) for real garden plans;
  never risk his data. Test migrations against e2e/fixtures/legacy-app.
- Before opening a pull request, or pushing to one: `npm run typecheck`,
  `npm test`, and the end-to-end specs that cover the change. CI is the full
  check (Jason, Nov 1): it runs every test on the pull request as it would
  merge, in about 3 minutes; `npm run check` takes 20–35 minutes on this
  workspace's 2 cores. Never ask Jason to merge before CI passes. Never run
  a full check while another test run is going: the load makes tests time
  out.
- Keyboard safety (Android): text/number/range/color inputs must update via
  the *Silent* functions (`updateSelectedSilent`, `updateBgImageSilent`) that
  redraw only the canvas. Window resize must call `resizeCanvas()`, never
  `render()` — the keyboard opening fires a resize and a full render
  destroys the focused input.
- Gestures update only the affected canvas layer (`previewView`,
  `redrawShapes`, `redrawMarquee`, `redrawBackground`); a full `render()`
  happens on pointer release.
- Storage changes need a migration path, a test in tests/storage.test.ts,
  and a pull request of their own.
- Service worker updates are user-confirmed (src/pwa.ts); don't add
  automatic reloads.
- Releases (docs/releasing.md): pull requests go into `main`, which is
  published as Next (next.fullgrown.garden), a preview copy, not to testers.
  Testers get main only through a release pull request from `main` into
  `release`, when Jason asks for one. Never push to `release` directly.
- A change people will notice adds its What's new lines in the PR that
  makes it, in plain words (the app tells them after the update), as a file
  of its own: src/whats-new/next/<branch>.json, a JSON list of lines (see
  the README there). Right after a release, a PR moves them into
  src/whats-new.json with its date (scripts/release/whats-new-fold.mjs).
  CI checks both.
- Commits: end messages with the Co-Authored-By line.
- Plant catalog (public/plants.json) is version 2, sourced facts: see
  docs/catalog-format.md; which sources may be used: docs/catalog-sources.md.
  One record per line; `npm run catalog:check` lists
  problems. Never add a value without a source.
