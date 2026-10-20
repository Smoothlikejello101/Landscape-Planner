// Fetch GBIF's flowering records by month and state for each catalog species, politely (robots.txt, 1
// request every 2 s), into catalog-src/gbif/; run again to retry what failed (saved pages aren't asked for
// again). Counts only in the log.
//   node scripts/catalog/gbif-fetch.mjs <combined.json>
import { readFileSync } from 'node:fs';
import { fetchSession, fileStore, runFetch } from './fetch-lib.mjs';
import { get } from './net.mjs';
import { lockCatalogSrc, savedPage } from './pages.mjs';
import { DATASET_BATCH, datasetsUrl, gadmUrl, matchedTaxon, matchUrl, monthsUrl, statesUrl, US_GADM } from './gbif.mjs';
import { bloomSpecies } from './bloom.mjs';

const [auditPath] = process.argv.slice(2);
if (!auditPath) { console.error('usage: node scripts/catalog/gbif-fetch.mjs <combined.json>'); process.exit(1); }
lockCatalogSrc();
const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8'));
const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const json = (url) => { try { return JSON.parse(savedPage('gbif', url)?.text ?? 'null'); } catch { return null; } };
async function fetchAll(urls, label) {
  const todo = [...new Set(urls)].filter((u) => !savedPage('gbif', u));
  let saved = 0, other = 0;
  await runFetch(todo.map((url) => ({ source: 'gbif', url })), { get, store: fileStore('catalog-src', today), today, session: fetchSession(), concurrency: 1, sleep: (s) => new Promise((r) => setTimeout(r, s * 1000)), now: () => Date.now(), log: (l) => { if (/^200/.test(l)) saved++; else { other++; if (other <= 5) console.log('  ' + l.slice(0, 200)); } } });
  console.log(`${label}: ${todo.length} to fetch, ${saved} saved, ${other} not`);
}
const species = bloomSpecies(catalog, audit);
await fetchAll([...US_GADM.map(gadmUrl), ...species.map((s) => matchUrl(s.binomial))], 'names and states');
const keys = [...new Set(species.map((s) => matchedTaxon(json(matchUrl(s.binomial)))?.key).filter(Boolean))];
const batches = [];
for (let i = 0; i < keys.length; i += DATASET_BATCH) batches.push(datasetsUrl(keys.slice(i, i + DATASET_BATCH)));
await fetchAll([...keys.map(monthsUrl), ...batches], 'months and datasets');
const monthly = [];
for (const k of keys) {
  const m = json(monthsUrl(k));
  for (const c of m?.facets?.[0]?.counts ?? []) if (c.count > 0) monthly.push(statesUrl(k, Number(c.name)));
}
await fetchAll(monthly, 'states by month');
process.exit(0);
