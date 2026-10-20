// USDA PLANTS county records for each catalog plant, placed in standard counties: from the pages the PLANTS
// site's map reads (its public map service, layer 6, fetched into catalog-src/web/ by symbol's profile Id):
//   node scripts/catalog/usda-counties.mjs <combined.json> [out.json]   (default catalog-src/usda-counties.json)
// USDA's county ids are its own, so each record is placed by its shape: the county (Census boundaries) its
// center falls in, or one its corners fall in whose name is the record's (a city inside a county, say).
// (Its map service holds no "Excluded" county records: a query for them counts none, 2026-10-19.) Writes
// { id: { counties: [fips], species } }, `species` where the records are the plant's species' (a cultivar or
// mix, or a variety USDA has only as its species). A hybrid gets none. A plant whose USDA symbol leads to
// another name gets its records only where that's a reviewed rename of the same plant (SAME_PLANT): USDA's
// redirects also lead from misapplied names, lumps and Old World look-alikes. docs/wild-records.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { countyFinder } from '../climate/lib.mjs';
import { savedPage } from './pages.mjs';

const MAP = 'https://apps.geo.fpac.usda.gov/nrcs-geodata/rest/services/land_use_land_cover/plants/MapServer';
export const recordsUrl = (id) => `${MAP}/6/query?where=plant_master_id%3D${id}&outFields=country_subdivision_name,plant_nativity_id&returnGeometry=true&outSR=4326&maxAllowableOffset=0.1&geometryPrecision=2&f=json`;
const profileUrl = (symbol) => `https://plantsservices.sc.egov.usda.gov/api/PlantProfile?symbol=${symbol}`;
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const binomialOf = (s) => strip(s).replace(/ ×/, ' ×').split(' ').slice(0, 2).join(' ');
/**
 * Plants whose USDA symbol leads to another accepted name that is the same plant renamed (reviewed by hand,
 * 2026-10-19, from the 35 redirects among the catalog's symbols). The others are left without USDA's records:
 * a misapplied name (Carex albicans → C. peckii, Carex frankii → C. aureolensis, Silphium terebinthinaceum →
 * S. compositum var. reniforme, Ziziphus jujuba → Z. mauritiana), a lump into a wider taxon (Iliamna remota,
 * Symphyotrichum firmum, Oenothera rhombipetala, Bidens polylepis), an Old World taxon USDA excludes (Anemone patens, Anthoxanthum
 * hirtum), a hybrid (Viola palmata).
 */
export const SAME_PLANT = new Map([
  ['Potentilla fruticosa', 'Dasiphora fruticosa'], ['Sambucus canadensis', 'Sambucus nigra ssp. canadensis'],
  ['Viburnum trilobum', 'Viburnum opulus var. americanum'], ['Bidens trichosperma', 'Bidens coronata'],
  ['Campanula americana', 'Campanulastrum americanum'], ['Drymocallis arguta', 'Potentilla arguta ssp. arguta'],
  ['Gentiana flavida', 'Gentiana alba'], ['Hepatica acutiloba', 'Hepatica nobilis var. acuta'], ['Hypericum pyramidatum', 'Hypericum ascyron'],
  ['Linaria canadensis', 'Nuttallanthus canadensis'], ['Persicaria virginiana', 'Polygonum virginianum'],
  ['Persicaria pensylvanica', 'Polygonum pensylvanicum'], ['Persicaria punctata', 'Polygonum punctatum var. punctatum'],
  ['Polymnia uvedalia', 'Smallanthus uvedalius'], ['Porteranthus stipulatus', 'Gillenia stipulata'], ['Thermopsis caroliniana', 'Thermopsis villosa'],
  ['Buchloe dactyloides', 'Bouteloua dactyloides'], ['Juncus balticus', 'Juncus arcticus ssp. littoralis'], ['Turritis glabra', 'Arabis glabra'],
  ['Peritoma serrulata', 'Cleome serrulata'], ['Osmundastrum cinnamomeum', 'Osmunda cinnamomea'],
  ['Osmunda spectabilis', 'Osmunda regalis var. spectabilis'], ['Malus domestica', 'Malus pumila'], ['Ziziphus jujuba', 'Ziziphus zizyphus'],
  // (The American pasque flower: usda-pick.mjs PICK. Not Bidens polylepis → B. aristosa: USDA lumps them, but
  // Kew's World Checklist (POWO) and World Flora Online keep B. polylepis a species, so B. aristosa's records
  // aren't its own.)
  ['Anemone patens', 'Pulsatilla patens ssp. multifida'],
]);
/** Whether a USDA profile is the plant's own (its name, or a reviewed rename of it). */
export const sameTaxon = (binomial, profileName) => !(/×|\bhybrid\b/i.test(strip(profileName)) && !/×/.test(binomial))
  && (canonical(profileName).split(' ').slice(0, 2).join(' ') === binomial || SAME_PLANT.get(binomial) === canonical(profileName));
/** A USDA name without its authors: "Sambucus nigra L. ssp. canadensis (L.) R. Bolli" → "Sambucus nigra ssp. canadensis". */
export function canonical(sci) {
  const t = strip(sci);
  const infra = t.match(/ (ssp\.|subsp\.|var\.) ([a-zë-]+)/);
  return binomialOf(t) + (infra ? ` ${infra[1] === 'subsp.' ? 'ssp.' : infra[1]} ${infra[2]}` : '');
}
/** Two taxa in one entry ("Salvia officinalis / Origanum vulgare", "Prunus laurocerasus / caroliniana"): no one plant's records. */
export const twoTaxa = (bot) => /\/\s*[A-Za-z]/.test(String(bot ?? '').replace(/'[^']*'|‘[^’]*’|\([^)]*\)/g, ''));

const norm = (s) => String(s ?? '').toLowerCase().replace(/\((city|county)\)|\b(county|parish|borough|census area|city and borough|municipality|city)\b/g, '').replace(/[^a-z]/g, '');

/** Places USDA's county records: (features) → the counties (FIPS) they're in, and how many couldn't be placed. */
export function placer(countyFeatures, nameOf) {
  const at = countyFinder(countyFeatures);
  return (features) => {
    const out = new Set();
    let unplaced = 0;
    for (const f of features) {
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
  let unplaced = 0, noRecords = 0, otherName = 0;
  for (const rec of catalog.plants) {
    if (rec.parent) continue;
    const bot = String(rec.botanical ?? '').replace(/\s+/g, ' ').trim();
    if ((/×| x |\bhybrid\b/i.test(bot) && !/\bhybrids\b/i.test(bot)) || twoTaxa(bot)) continue;
    const symbol = byId.get(rec.id)?.sources?.usda?.symbol;
    if (!symbol) continue;
    let profile = null, records = null;
    try { profile = JSON.parse(page('usda', profileUrl(symbol))?.text ?? 'null'); } catch { /* none */ }
    if (!profile?.Id) continue;
    // The plant's own name, or a reviewed rename of it; never another plant's records.
    // (A rename is checked to its rank: Sambucus nigra ssp. canadensis, not any Sambucus nigra.)
    if (!sameTaxon(binomialOf(bot), profile.ScientificName)) { otherName++; continue; }
    try { records = JSON.parse(page('web', recordsUrl(profile.Id))?.text ?? 'null'); } catch { /* none */ }
    if (!records?.features || records.exceededTransferLimit) { noRecords++; continue; }
    const r = place(records.features);
    unplaced += r.unplaced;
    if (!r.counties.length) continue;
    // Its own records: a plain species, or a variety USDA has under its own name. Otherwise its species'.
    const infra = bot.match(/ (var\.|subsp\.|ssp\.) ([a-zë-]+)/);
    const plain = /^[A-Z][a-zë-]+ [a-zë-]+$/.test(bot);
    const own = plain || (infra && canonical(profile.ScientificName).endsWith(`${infra[1] === 'subsp.' ? 'ssp.' : infra[1]} ${infra[2]}`));
    out[rec.id] = { counties: r.counties, species: !own };
  }
  return { records: out, unplaced, noRecords, otherName };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [auditPath, outPath = 'catalog-src/usda-counties.json'] = process.argv.slice(2);
  if (!auditPath) { console.error('usage: node scripts/catalog/usda-counties.mjs <combined.json> [out.json]'); process.exit(1); }
  const topo = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('us-atlas/counties-10m.json'), 'utf8'));
  const fc = feature(topo, topo.objects.counties).features;
  const nameOf = new Map(fc.map((f) => [Number(f.id), f.properties.name]));
  const { records, unplaced, noRecords, otherName } = usdaRecords(JSON.parse(readFileSync('public/plants.json', 'utf8')), JSON.parse(readFileSync(auditPath, 'utf8')), placer(fc, nameOf));
  writeFileSync(outPath, JSON.stringify(records));
  console.log(`${Object.keys(records).length} plants with USDA county records (${Object.values(records).filter((r) => r.species).length} as their species'); ${unplaced} records not placed; ${noRecords} plants with no records page; ${otherName} left out (USDA's symbol leads to another plant) → ${outPath}`);
}
