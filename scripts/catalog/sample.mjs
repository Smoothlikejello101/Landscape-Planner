// Build the side-by-side for a set of catalog plants from pages already in
// catalog-src/ (fetch them first with fetch.mjs):
//   node scripts/catalog/sample.mjs <sample.json> <atlas.txt> <out.json>
// <sample.json>: [{ id, species, ncsu?: slug, mnwild?: url path, ... }]
// <atlas.txt>: the Arkansas atlas PDF as `pdftotext -layout` text.
// A page whose botanical name doesn't match the plant is left out, and said so.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cacheName } from './fetch-lib.mjs';
import { arkatlasStatus, mnwildFields, ncsuFields, usdaFields } from './extract.mjs';
import { mapPlant } from './map.mjs';

const [samplePath, atlasPath, outPath] = process.argv.slice(2);
const sample = JSON.parse(readFileSync(samplePath, 'utf8'));
const atlas = readFileSync(atlasPath, 'utf8');
const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8'));
const byId = new Map(catalog.plants.map((p) => [p.id, p]));

/** The newest saved copy of a URL, or null. */
function page(source, url) {
  const dir = join('catalog-src', source);
  if (!existsSync(dir)) return null;
  const name = cacheName(url);
  for (const d of readdirSync(dir).sort().reverse()) {
    const f = join(dir, d, name);
    if (!existsSync(f) || !existsSync(f + '.meta.json')) continue;
    const meta = JSON.parse(readFileSync(f + '.meta.json', 'utf8'));
    if (meta.url !== url) continue;
    // (Decoded as the server said: Minnesota Wildflowers sends ISO-8859-1.)
    const latin = /charset="?(iso-8859-1|windows-1252|latin1)/i.test(meta.type ?? '');
    return { text: new TextDecoder(latin ? 'windows-1252' : 'utf-8').decode(readFileSync(f)), fetched: d, url };
  }
  return null;
}
const json = (p) => { try { return p ? JSON.parse(p.text) : null; } catch { return null; } };
const sameName = (a, b) => a && b && a.toLowerCase().replace(/\s+/g, ' ').startsWith(b.toLowerCase());

const out = [];
for (const s of sample) {
  const rec = byId.get(s.id);
  const notes = [];
  const seen = {};
  // NC State
  let ncsu = {};
  if (s.ncsu) {
    const url = `https://plants.ces.ncsu.edu/plants/${s.ncsu}/`;
    const p = page('ncsu', url);
    if (p) {
      const f = ncsuFields(p.text);
      const name = `${f.Genus?.[0] ?? ''} ${f.Species?.[0] ?? ''}`.trim();
      if (s.ncsuName ? true : sameName(name, s.species) || (s.genusOnly && f.Genus?.[0] === s.species.split(' ')[0])) { ncsu = f; seen.ncsu = { url, fetched: p.fetched, name: name || s.ncsu }; }
      else notes.push(`NC State page ${s.ncsu} is ${name}, not ${s.species}: left out`);
      if (s.genusOnly) notes.push(`NC State has only a page for the genus ${s.species.split(' ')[0]}`);
    } else notes.push('NC State page not fetched');
  } else notes.push('No NC State page');
  // USDA
  let usda = {};
  if (s.usda) {
    const prof = json(page('usda', `https://plantsservices.sc.egov.usda.gov/api/PlantProfile?symbol=${s.usda.symbol}`));
    const chars = json(page('usda', `https://plantsservices.sc.egov.usda.gov/api/PlantCharacteristics/${s.usda.id}`));
    if (prof) { usda = usdaFields(prof, chars ?? []); seen.usda = { symbol: s.usda.symbol, name: usda['Scientific name']?.[0] }; }
    if (prof && !chars?.length) notes.push('USDA has no characteristics for it');
  } else notes.push('Not in USDA PLANTS by this name');
  // Minnesota Wildflowers
  let mnwild = null;
  if (s.mnwild) {
    const url = `https://www.minnesotawildflowers.info/${s.mnwild}`;
    const p = page('mnwild', url);
    const f = p && mnwildFields(p.text);
    if (f && sameName(f['Scientific name']?.[0], s.species)) { mnwild = f; seen.mnwild = { url, fetched: p.fetched }; }
    else if (f) notes.push(`Minnesota Wildflowers page is ${f['Scientific name']?.[0]}: left out`);
  }
  // Arkansas atlas
  const ar = s.genusOnly ? null : arkatlasStatus(atlas, s.species);
  if (ar) seen.arkatlas = { name: ar.name };
  if (s.genusOnly) notes.push('Arkansas atlas not looked up (no species name)');
  else if (!ar) notes.push(`Not found under ${s.species} on the Arkansas atlas's map pages`);
  else if (ar.uncertain) notes.push(`The Arkansas atlas maps ${s.species} more than once with different status: left for the review`);
  const mapped = mapPlant({ ncsu, usda, mnwild, arkatlas: ar });
  // A cultivar record read from a species page: size and flower color are the cultivar's own, so they stay unknown.
  const cultivar = /'[^']+'/.test(`${rec?.common ?? ''} ${rec?.botanical ?? ''}`);
  const speciesPage = seen.ncsu && !/'/.test(s.ncsu) && s.ncsu.split('-').length <= 2;
  if (cultivar && (speciesPage || !seen.ncsu)) {
    for (const k of ['height', 'width', 'flower_color']) mapped[k] = null;
    notes.push('A cultivar read from species pages: its size and flower color stay unknown until a page for the cultivar is found');
  }
  out.push({ id: s.id, common: rec?.common, botanical: rec?.botanical, species: s.species, compendium: rec?.facts ?? {}, sources: seen, raw: { ncsu, usda, mnwild, arkatlas: ar }, facts: mapped, notes });
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`${out.length} plants → ${outPath}`);
