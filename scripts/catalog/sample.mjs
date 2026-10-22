// Build the side-by-side for a set of catalog plants from pages already in
// catalog-src/ (fetch them first with fetch.mjs):
//   node scripts/catalog/sample.mjs <sample.json> <atlas.txt> <out.json> [extra-claims.json]
// <sample.json>: [{ id, species, ncsu?: slug, mnwild?: url path, ... }]
// <atlas.txt>: the Arkansas atlas PDF as `pdftotext -layout` text.
// A page whose botanical name doesn't match the plant is left out, and said so.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { savedPage } from './pages.mjs';
import { arkatlasStatus, mnwildFields, ncsuFields, usdaFields } from './extract.mjs';
import { sameTaxon } from './usda-counties.mjs';
import { acceptsPage, ncsuPageName, ownCultivarPage, titleCultivar } from './ncsu-page.mjs';
import { arkatlasClaims, combine, mnwildClaims, ncsuClaims, onlyCaterpillars, tallamyClaims, usdaClaims } from './claims.mjs';

const [samplePath, atlasPath, outPath, extraPath] = process.argv.slice(2);
/** Claims gathered elsewhere (the web search, the Tallamy data), by plant id. */
const extraClaims = extraPath && existsSync(extraPath) ? JSON.parse(readFileSync(extraPath, 'utf8')) : {};
const sample = JSON.parse(readFileSync(samplePath, 'utf8'));
const atlas = readFileSync(atlasPath, 'utf8');
// Shropshire & Tallamy by host genus (scripts/catalog/tallamy.py builds it from their spreadsheet).
const TALLAMY = 'catalog-src/tallamy/genera.json';
const tallamy = existsSync(TALLAMY) ? JSON.parse(readFileSync(TALLAMY, 'utf8')) : null;
const lepGenera = tallamy?.lep_genera ? new Set(tallamy.lep_genera) : null;
const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8'));
const byId = new Map(catalog.plants.map((p) => [p.id, p]));

const page = (source, url) => savedPage(source, url);
const json = (p) => { try { return p ? JSON.parse(p.text) : null; } catch { return null; } };
const sameName = (a, b) => a && b && a.toLowerCase().replace(/\s+/g, ' ').startsWith(b.toLowerCase());

const out = [];
for (const s of sample) {
  const rec = byId.get(s.id);
  const notes = [];
  const seen = {};
  // NC State
  let ncsu = {}, ownCultivar = false, cultivarTitle = null;
  if (s.ncsu) {
    const url = `https://plants.ces.ncsu.edu/plants/${s.ncsu}/`;
    const p = page('ncsu', url);
    if (p) {
      const f = ncsuFields(p.text);
      const name = ncsuPageName(p.text, f);
      // (The page's own name, or one reviewed as this plant's: NC State's misspelling, or a synonym; ncsu-pages.json `names`.)
      if (acceptsPage(s, name, f.Genus?.[0])) { ncsu = f; seen.ncsu = { url, fetched: p.fetched, name: name || s.ncsu }; ownCultivar = !!s.genusOnly && ownCultivarPage(rec, p.text); cultivarTitle = titleCultivar(p.text); }
      else notes.push(`NC State page ${s.ncsu} is ${name}, not ${s.species}: left out`);
      if (s.genusOnly && s.ncsu === s.species.split(' ')[0].toLowerCase()) notes.push(`NC State has only a page for the genus ${s.species.split(' ')[0]}`);
    } else notes.push('NC State page not fetched');
  } else notes.push('No NC State page');
  // USDA
  let usda = {};
  if (s.usda) {
    const prof = json(page('usda', `https://plantsservices.sc.egov.usda.gov/api/PlantProfile?symbol=${s.usda.symbol}`));
    const chars = json(page('usda', `https://plantsservices.sc.egov.usda.gov/api/PlantCharacteristics/${s.usda.id}`));
    // (Only the plant's own profile, or a reviewed rename of it: a symbol can lead to another plant.)
    if (prof && !sameTaxon(s.species, prof.ScientificName)) notes.push(`USDA's ${s.usda.symbol} is ${String(prof.ScientificName).replace(/<[^>]+>/g, '')}: left out`);
    else if (prof) { usda = usdaFields(prof, chars ?? []); seen.usda = { symbol: s.usda.symbol, name: usda['Scientific name']?.[0] }; }
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
  // Claims from each source, combined by tier (docs/catalog-sources.md).
  const cultivar = /'[^']+'/.test(`${rec?.common ?? ''} ${rec?.botanical ?? ''}`);
  // (A species-level page: one whose title names no cultivar (the species', a synonym's, the page NC State moved it
  // to, a genus's), or one under a reviewed other name; for a genus or group, any page but its one cultivar's own:
  // Thuja 'Green Giant' for "Thuja 'Green Giant'", not 'Natchez' for three crape myrtles.)
  const speciesPage = seen.ncsu && (s.ncsuName || !cultivarTitle || (s.genusOnly && !ownCultivar));
  const claims = [
    ...ncsuClaims(ncsu).map((c) => ({ ...c, cultivarPage: !!seen.ncsu && !speciesPage }))
      .map((c) => (c.fact === 'host' ? { ...c, v: onlyCaterpillars(c.v, lepGenera) } : c)).filter((c) => !(c.fact === 'host' && !c.v.length)),
    ...mnwildClaims(mnwild), ...arkatlasClaims(ar), ...usdaClaims(usda), ...tallamyClaims(tallamy, s.species),
    ...(extraClaims[s.id] ?? []),
  ];
  const mapped = combine(claims, { cultivar, prefer: rec?.facts?.form?.v ?? rec?.facts?.form ?? null });
  if (cultivar && (speciesPage || !seen.ncsu)) notes.push('A cultivar read from species pages: its size, form and flower color come only from a page for the cultivar');
  out.push({ id: s.id, common: rec?.common, botanical: rec?.botanical, species: s.species, compendium: rec?.facts ?? {}, sources: seen, raw: { ncsu, usda, mnwild, arkatlas: ar }, claims, facts: mapped, notes });
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`${out.length} plants → ${outPath}`);
