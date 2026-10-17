# Notes for working on this repo

- Owner: Jason. He uses it on Android (installed PWA) for real garden plans;
  never risk his data. Test migrations against e2e/fixtures/legacy-app.
- Run `npm run check` before every commit; all tests must pass.
- Keyboard safety (Android): text/number/range/color inputs must update via
  the *Silent* functions (`updateSelectedSilent`, `updateBgImageSilent`) that
  redraw only the canvas. Window resize must call `resizeCanvas()`, never
  `render()` — the keyboard opening fires a resize and a full render
  destroys the focused input.
- Gestures update only the affected canvas layer (`previewView`,
  `redrawShapes`, `redrawMarquee`, `redrawBackground`); a full `render()`
  happens on pointer release.
- Storage changes need a migration path and a test in tests/storage.test.ts.
- Service worker updates are user-confirmed (src/pwa.ts); don't add
  automatic reloads.
- Commits: end messages with the Co-Authored-By line.
- Plant catalog (public/plants.json) is version 2, sourced facts: see
  docs/catalog-format.md. One record per line; `npm run catalog:check` lists
  problems. Never add a value without a source.
