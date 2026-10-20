// Fetch GBIF's names for the catalog's species and its US states' GADM codes, politely (robots.txt, 1
// request every 2 s), into catalog-src/gbif/; run again to retry what failed (saved pages aren't asked for
// again). The records themselves come by SQL download (gbif-download.mjs).
// (States' and counties' GADM codes too: a download names them by GADM, wild.mjs by FIPS.)
//   node scripts/catalog/gbif-fetch.mjs <combined.json>
import { readFileSync } from 'node:fs';
import { fetchSession, fileStore, runFetch } from './fetch-lib.mjs';
import { get } from './net.mjs';
import { lockCatalogSrc, savedPage } from './pages.mjs';
import { gadmSubdivisionsUrl, gadmUrl, matchUrl, US_GADM } from './gbif.mjs';
import { bloomSpecies } from './bloom.mjs';

const [auditPath] = process.argv.slice(2);
if (!auditPath) { console.error('usage: node scripts/catalog/gbif-fetch.mjs <combined.json>'); process.exit(1); }
lockCatalogSrc();
const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8'));
const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
async function fetchAll(urls, label) {
  const todo = [...new Set(urls)].filter((u) => !savedPage('gbif', u));
  let saved = 0, other = 0;
  await runFetch(todo.map((url) => ({ source: 'gbif', url })), { get, store: fileStore('catalog-src', today), today, session: fetchSession(), concurrency: 1, sleep: (s) => new Promise((r) => setTimeout(r, s * 1000)), now: () => Date.now(), log: (l) => { if (/^200/.test(l)) saved++; else { other++; if (other <= 5) console.log('  ' + l.slice(0, 200)); } } });
  console.log(`${label}: ${todo.length} to fetch, ${saved} saved, ${other} not`);
}
const species = bloomSpecies(catalog, audit);
await fetchAll([...US_GADM.map(gadmUrl), ...US_GADM.map(gadmSubdivisionsUrl), ...species.map((s) => matchUrl(s.binomial))], 'names, states and counties');
process.exit(0);
