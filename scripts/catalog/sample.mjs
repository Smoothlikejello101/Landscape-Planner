// Build the side-by-side for a set of catalog plants from pages already in
// catalog-src/ (fetch them first with fetch.mjs):
//   node scripts/catalog/sample.mjs <sample.json> <atlas.txt> <out.json> [extra-claims.json]
// <sample.json>: [{ id, species, ncsu?: slug, mnwild?: url path, ... }]
// <atlas.txt>: the Arkansas atlas PDF as `pdftotext -layout` text.
// A page whose botanical name doesn't match the plant is left out, and said so.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { savedPage } from './pages.mjs';
import { arkatlasStatus, mnwildFields, ncsuFields, usdaFields } from './extract.mjs';
import { sameTaxon } from './usda-counties.mjs';
import { acceptsPage, ncsuPageName, ownCultivarPage, recordCultivars, titleCultivar } from './ncsu-page.mjs';
import { arkatlasClaims, combine, FLOWER_FACTS, flowerless, mnwildClaims, ncsuClaims, onlyCaterpillars, tallamyClaims, usdaClaims } from './claims.mjs';
import { ncsuDeer, ncsuDescription, ncsuNames, ncsuProseClaims, ncsuZones } from './prose.mjs';
import { gateProse, GATED, loadReadings, settleDegree } from './second-reading.mjs';

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

// What a second reading agreed (second-reading.mjs): values read from a page's text are written only where it does.
const readings = loadReadings();
const tasks = new Map();
const out = [];
for (const s of sample) {
  const rec = byId.get(s.id);
  const notes = [];
  const seen = {};
  // NC State
  let ncsu = {}, ncsuHtml = null, ownCultivar = false, cultivarTitle = null;
  if (s.ncsu) {
    const url = `https://plants.ces.ncsu.edu/plants/${s.ncsu}/`;
    const p = page('ncsu', url);
    if (p) {
      const f = ncsuFields(p.text);
      const name = ncsuPageName(p.text, f);
      // (The page's own name, or one reviewed as this plant's: NC State's misspelling, or a synonym; ncsu-pages.json `names`.)
      if (acceptsPage(s, name, f.Genus?.[0])) { ncsu = f; ncsuHtml = p.text; seen.ncsu = { url, fetched: p.fetched, name: name || s.ncsu }; ownCultivar = !!s.genusOnly && ownCultivarPage(rec, p.text); cultivarTitle = titleCultivar(p.text); }
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
  else if (ar.uncertain) notes.push(ar.why?.startsWith('combined map')
    ? `The Arkansas atlas's combined map for ${s.species}: ${ar.why.replace('combined map: ', '')}: left for the review`
    : `The Arkansas atlas maps ${s.species} more than once with different status: left for the review`);
  // Claims from each source, combined by tier (docs/catalog-sources.md).
  // (A record that takes its species' size, a series named without quotes too: split.mjs, "Hibiscus syriacus Chiffon
  // series", reading the species' page.)
  const cultivar = recordCultivars(rec).length > 0 || !!rec?.inherits;
  // (A species-level page: one whose title names no cultivar (the species', a synonym's, the page NC State moved it
  // to, a genus's), or one under a reviewed other name; for a genus or group, any page but its one cultivar's own:
  // Thuja 'Green Giant' for "Thuja 'Green Giant'", not 'Natchez' for three crape myrtles.)
  // A record naming several cultivars likewise: one cultivar's page speaks for only one of them ("Acer palmatum
  // ('Bloodgood' / 'Seiryu')" reads 'Bloodgood''s purple leaves as species-level, not as its own).
  const several = recordCultivars(rec).length > 1 || /\//.test(rec?.botanical ?? '');
  const speciesPage = seen.ncsu && (s.ncsuName || !cultivarTitle || (s.genusOnly ? !ownCultivar : several));
  // (Its zones as its fields give them, unless its own description says the coldest are only where it's an annual.)
  // (Its deer as its field gives it, unless its own description says it resists deer only in part.)
  // (The page a value read from its text came from, for the second reading.)
  const ncsuPage = ncsuHtml ? { key: `ncsu:${s.ncsu}`, names: ncsuNames(ncsuHtml), sentences: ncsuDescription(ncsuHtml) } : null;
  const onPage = (c) => (c.prose && GATED.has(c.fact) && ncsuPage ? { ...c, page: ncsuPage } : c);
  const fields = ncsuDeer(ncsuZones(ncsuClaims(ncsu), ncsuHtml), ncsuHtml).map(onPage);
  const read = [
    // (A field its text lowered keeps the field's own claim beside it, for where the second reading doesn't agree.)
    ...fields.map((c) => ({ ...c, cultivarPage: !!seen.ncsu && !speciesPage, ...(c.fallback ? { fallback: { ...c.fallback, cultivarPage: !!seen.ncsu && !speciesPage } } : {}) }))
      .map((c) => (c.fact === 'host' ? { ...c, v: onlyCaterpillars(c.v, lepGenera) } : c)).filter((c) => !(c.fact === 'host' && !c.v.length)),
    // Its description, read by rule (prose.mjs), only for what its fields don't say.
    ...ncsuProseClaims(ncsuHtml).filter((c) => !fields.some((f) => f.fact === c.fact)).map((c) => ({ ...c, cultivarPage: !!seen.ncsu && !speciesPage })).map(onPage),
    ...mnwildClaims(mnwild), ...arkatlasClaims(ar), ...usdaClaims(usda), ...tallamyClaims(tallamy, s.species),
    ...(extraClaims[s.id] ?? []),
  ];
  // Values read from text, only where the second reading agrees; the rest held, and their pages listed to read.
  const gate = gateProse(read, readings);
  for (const [k, t] of gate.tasks) { const had = tasks.get(k); tasks.set(k, had ? { ...had, facts: [...new Set([...had.facts, ...t.facts])] } : t); }
  // (A degree left open by the readings, settled by another source that gives the degree the rules read.)
  const allClaims = settleDegree(gate.claims);
  // (No flowers: a conifer's or a fern's "bloom" and "flower color" are its cones or spores, left out.)
  const noFlowers = flowerless(usda, rec?.facts?.form?.v ?? rec?.facts?.form ?? null, ncsu?.Family?.[0]);
  const by = usda?.Group ? `USDA: ${noFlowers}` : ncsu?.Family?.[0] ? `NC State: ${noFlowers}` : 'a fern';
  if (noFlowers && allClaims.some((c) => FLOWER_FACTS.has(c.fact))) notes.push(`No flowers (${by}): its sources' bloom time and flower color, its cones or spores, left out`);
  const claims = noFlowers ? allClaims.filter((c) => !FLOWER_FACTS.has(c.fact)) : allClaims;
  const mapped = combine(claims, { cultivar, prefer: rec?.facts?.form?.v ?? rec?.facts?.form ?? null });
  if (cultivar && (speciesPage || !seen.ncsu)) notes.push('A cultivar read from species pages: its size, form and flower color come only from a page for the cultivar');
  out.push({ id: s.id, common: rec?.common, botanical: rec?.botanical, species: s.species, compendium: rec?.facts ?? {}, sources: seen, raw: { ncsu, usda, mnwild, arkatlas: ar }, claims, facts: mapped, notes, ...(gate.held.length ? { held: gate.held } : {}) });
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
// (The pages whose text still needs a second reading: second-reading.mjs, docs/catalog-sources.md.)
writeFileSync(join(dirname(outPath), 'second-reading-tasks.json'), JSON.stringify([...tasks.values()], null, 1));
const held = out.flatMap((a) => a.held ?? []);
console.log(`${out.length} plants → ${outPath}; read from text: ${held.filter((h) => h.why === 'disagree').length} held where a second reading differs, ${held.filter((h) => h.why === 'unread').length} waiting for one (${tasks.size} pages)`);
