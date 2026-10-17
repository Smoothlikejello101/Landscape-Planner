# FullGrown

A phone-first, top-down garden planner: a 1-ft grid, shapes at real scale,
plants placed at their mature spread, and a calibrated satellite photo to
trace over. Works offline as an installable web app.

## Development

Requires Node 22.

```sh
npm install
npm run dev          # local dev server
npm run check        # typecheck + unit tests + build + end-to-end tests
```

| Command | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript, strict |
| `npm test` | Unit tests (Vitest): geometry, calibration, plant filters, storage, backups |
| `npm run test:e2e` | Browser tests (Playwright) on phone and desktop viewports, against the production build |
| `npm run build` | Production build into `dist/` |

## Layout

```
src/
  main.ts            startup, global listeners
  state.ts types.ts  app state and data types
  storage.ts db.ts   IndexedDB persistence, migration, save journal
  backup.ts          project/backup files (export, import)
  canvas.ts          SVG drawing (layered for cheap gesture updates)
  gestures.ts        pan, pinch, drag, lasso, background tools
  mutations.ts       shape edits (each records an undo step)
  background.ts      satellite image: upload, calibration, drawing
  plants.ts          plant index and filters
  export.ts          PNG/SVG export
  pwa.ts sw.ts       service worker and update prompt
  ui/                panels, menus, main render
public/              plants.json, icons, manifest (copied as-is)
e2e/                 Playwright tests (incl. upgrade-from-old-version tests)
tests/               Vitest unit tests
```

## Deploying

Pushes to `main` are tested and published to GitHub Pages by
`.github/workflows/ci.yml`. In the repository settings, **Pages → Build and
deployment → Source** must be set to **GitHub Actions**.

## Data

Projects are stored in the browser's IndexedDB. Data from versions before
0.2 (localStorage) is migrated automatically on first launch and the old
copy is left in place. Use **Projects → Back up all projects** to save a
file you can restore on any device.
