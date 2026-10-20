// Fetch USDA PLANTS's county records for each catalog plant with a USDA profile (from its public map
// service, the one the PLANTS site's distribution map reads) into catalog-src/web/, politely (robots.txt,
// 1 request every 5 s), skipping any already saved. Run it again to retry what failed:
//   node scripts/catalog/usda-fetch.mjs <combined.json>
// Then usda-counties.mjs places them. Logs counts only.
import { readFileSync } from 'node:fs';
import { fetchSession, fileStore, runFetch } from './fetch-lib.mjs';
import { get } from './net.mjs';
import { lockCatalogSrc, savedPage } from './pages.mjs';
import { recordsUrl } from './usda-counties.mjs';

const [auditPath] = process.argv.slice(2);
if (!auditPath) { console.error('usage: node scripts/catalog/usda-fetch.mjs <combined.json>'); process.exit(1); }
lockCatalogSrc();
const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8'));
const species = new Set(catalog.plants.filter((p) => !p.parent).map((p) => p.id));
const items = new Map();
for (const r of audit) {
  const symbol = r.sources?.usda?.symbol;
  if (!species.has(r.id) || !symbol) continue;
  let profile = null;
  try { profile = JSON.parse(savedPage('usda', `https://plantsservices.sc.egov.usda.gov/api/PlantProfile?symbol=${symbol}`)?.text ?? 'null'); } catch { /* none */ }
  if (!profile?.Id) continue;
  const url = recordsUrl(profile.Id);
  if (!savedPage('web', url)) items.set(url, { source: 'web', url });
}
console.log(`${items.size} to fetch`);
const today = new Date().toISOString().slice(0, 10);
let saved = 0, other = 0;
await runFetch([...items.values()], { get, store: fileStore('catalog-src', today), today, session: fetchSession(), concurrency: 1, sleep: (s) => new Promise((r) => setTimeout(r, s * 1000)), now: () => Date.now(), log: (l) => { if (/^200/.test(l)) saved++; else other++; } });
console.log(`saved ${saved}; ${other} not (run again to retry)`);
process.exit(0);
