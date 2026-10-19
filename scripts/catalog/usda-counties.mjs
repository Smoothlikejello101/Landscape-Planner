// USDA PLANTS county records for each catalog plant, placed in standard counties: from the pages the PLANTS
// site's map reads (its public map service, layer 6, fetched into catalog-src/web/ by symbol's profile Id):
//   node scripts/catalog/usda-counties.mjs <combined.json> [out.json]   (default catalog-src/usda-counties.json)
// USDA's county ids are its own, so each record is placed by its shape: the county (Census boundaries) its
// center falls in, or one its corners fall in whose name is the record's (a city inside a county, say).
// "Excluded" records (USDA's own: not there) are left out. Writes { id: { counties: [fips], species } },
// `species` where the records are the plant's species' (a cultivar, mix, or variety USDA maps only as its
// species). A hybrid gets none. docs/wild-records.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { countyFinder } from '../climate/lib.mjs';
import { savedPage } from './pages.mjs';

const MAP = 'https://apps.geo.fpac.usda.gov/nrcs-geodata/rest/services/land_use_land_cover/plants/MapServer';
export const recordsUrl = (id) => `${MAP}/6/query?where=plant_master_id%3D${id}&outFields=country_subdivision_name,plant_nativity_id&returnGeometry=true&outSR=4326&maxAllowableOffset=0.1&geometryPrecision=2&f=json`;
const profileUrl = (symbol) => `https://plantsservices.sc.egov.usda.gov/api/PlantProfile?symbol=${symbol}`;
const norm = (s) => String(s ?? '').toLowerCase().replace(/\((city|county)\)|\b(county|parish|borough|census area|city and borough|municipality|city)\b/g, '').replace(/[^a-z]/g, '');

/** Places USDA's county records: (features) → the counties (FIPS) they're in, and how many couldn't be placed. */
export function placer(countyFeatures, nameOf) {
  const at = countyFinder(countyFeatures);
  return (features) => {
    const out = new Set();
    let unplaced = 0;
    for (const f of features) {
      if (f.attributes?.Symbol === 'Excluded') continue;
      const rings = f.geometry?.rings ?? [];
      const ring = rings.reduce((a, r) => (r.length > a.length ? r : a), []);
      if (!ring.length) { unplaced++; continue; }
      let a = 0, cx = 0, cy = 0;
      for (let i = 0; i < ring.length - 1; i++) { const [x0, y0] = ring[i], [x1, y1] = ring[i + 1], c = x0 * y1 - x1 * y0; a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
      const center = a ? [cy / (3 * a), cx / (3 * a)] : [ring[0][1], ring[0][0]];
      const step = Math.max(1, Math.floor(ring.length / 12));
      const candidates = [at(center), ...ring.filter((_, i) => i % step === 0).map(([x, y]) => at([y, x]))].filter(Boolean);
      const want = norm(f.attributes?.country_subdivision_name);
      const named = candidates.find((c) => norm(nameOf.get(c)) === want);
      const c = named ?? candidates[0];
      if (c) out.add(c); else unplaced++;
    }
    return { counties: [...out].sort((x, y) => x - y), unplaced };
  };
}

/** Each catalog plant's records (cultivars with a species record in the catalog take theirs in the app). */
export function usdaRecords(catalog, audit, place, page = savedPage) {
  const byId = new Map(audit.map((a) => [a.id, a]));
  const out = {};
  let unplaced = 0, noRecords = 0;
  for (const rec of catalog.plants) {
    if (rec.parent) continue;
    const bot = String(rec.botanical ?? '').replace(/\s+/g, ' ').trim();
    if (/×| x |\bhybrid\b/i.test(bot) && !/\bhybrids\b/i.test(bot)) continue;
    const symbol = byId.get(rec.id)?.sources?.usda?.symbol;
    if (!symbol) continue;
    let profile = null, records = null;
    try { profile = JSON.parse(page('usda', profileUrl(symbol))?.text ?? 'null'); } catch { /* none */ }
    if (!profile?.Id) continue;
    try { records = JSON.parse(page('web', recordsUrl(profile.Id))?.text ?? 'null'); } catch { /* none */ }
    if (!records?.features || records.exceededTransferLimit) { noRecords++; continue; }
    const r = place(records.features);
    unplaced += r.unplaced;
    if (!r.counties.length) continue;
    // Its own records: a plain species, or a variety USDA has under its own name. Otherwise its species'.
    const infra = bot.match(/ (var\.|subsp\.|ssp\.) ([a-zë-]+)/);
    const plain = /^[A-Z][a-zë-]+ [a-zë-]+$/.test(bot);
    const own = plain || (infra && String(profile.ScientificName ?? '').includes(`${infra[1] === 'ssp.' ? 'subsp.' : infra[1]} ${infra[2]}`));
    out[rec.id] = { counties: r.counties, species: !own };
  }
  return { records: out, unplaced, noRecords };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [auditPath, outPath = 'catalog-src/usda-counties.json'] = process.argv.slice(2);
  if (!auditPath) { console.error('usage: node scripts/catalog/usda-counties.mjs <combined.json> [out.json]'); process.exit(1); }
  const topo = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('us-atlas/counties-10m.json'), 'utf8'));
  const fc = feature(topo, topo.objects.counties).features;
  const nameOf = new Map(fc.map((f) => [Number(f.id), f.properties.name]));
  const { records, unplaced, noRecords } = usdaRecords(JSON.parse(readFileSync('public/plants.json', 'utf8')), JSON.parse(readFileSync(auditPath, 'utf8')), placer(fc, nameOf));
  writeFileSync(outPath, JSON.stringify(records));
  console.log(`${Object.keys(records).length} plants with USDA county records (${Object.values(records).filter((r) => r.species).length} as their species'); ${unplaced} records not placed; ${noRecords} plants with no records page → ${outPath}`);
}
