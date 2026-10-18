// Fetch pages for the catalog audit, politely (docs/catalog-sources.md):
//   node scripts/catalog/fetch.mjs <list.json> [--refresh]
// <list.json>: [{ "source": "ncsu", "url": "https://…" }, …] (optional "pace"
// in seconds, never below the source's own). The rules live in fetch-lib.mjs.
//
// Pages are kept in catalog-src/ (not committed):
//   <source>/<date>/<name>        the page, and <name>.meta.json beside it
//   robots/<host>-<date>.txt      every robots.txt read, with its status
//   refused.json                  sites that refused us; left alone until
//                                 their entry is removed by hand
// --refresh fetches again into today's folder; earlier copies stay.
import { readFileSync } from 'node:fs';
import { fileStore, runFetch } from './fetch-lib.mjs';
import { get } from './net.mjs';
import { lockCatalogSrc } from './pages.mjs';

const ROOT = 'catalog-src';
const today = new Date().toISOString().slice(0, 10);
const [listPath, ...flags] = process.argv.slice(2);
if (!listPath) { console.error('usage: node scripts/catalog/fetch.mjs <list.json> [--refresh]'); process.exit(1); }
const list = JSON.parse(readFileSync(listPath, 'utf8'));
lockCatalogSrc(ROOT); // (one run at a time)

const store = fileStore(ROOT, today);

const result = await runFetch(list, {
  get, store, today,
  sleep: (s) => new Promise((r) => setTimeout(r, s * 1000)),
  now: () => Date.now(),
  refresh: flags.includes('--refresh'),
  log: (l) => console.log(l),
});
console.log(`${result.saved} fetched, ${result.cached} already here, ${result.skipped} skipped.`);
