// Build public/wild/1/<state FIPS>.json (1: the format; a new format gets a new folder, so a phone never
// reads one format with an app made for another), the counties each catalog plant is recorded growing wild in, by
// state, and public/wild/index.json, which says what states have records and which counties outside each
// border it (public/wild/1/index.json; docs/wild-records.md):
//   node scripts/catalog/wild.mjs <combined.json>
// Sources: the Atlas of the Vascular Plants of Arkansas's county maps (catalog-src/arkatlas/counties.json,
// from atlas_counties.py) and USDA PLANTS's county records (catalog-src/usda-counties.json, from
// usda-counties.mjs). Reads catalog-src/counties.json (counties.mjs) and public/plants.json. <combined.json>:
// sample.mjs's output, for the atlas name each plant was matched by. County codes are five-digit FIPS as
// numbers (Clark County, Arkansas, 05019, is 5019).
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { bloomCounts, bloomDisagreements, bloomSpecies, seasonsToCheck, stateBloom } from './bloom.mjs';
import { gadmSubdivisionsUrl, gadmUrl, matchedTaxon, matchUrl, tsvRows, US_GADM } from './gbif.mjs';
import { STATES } from './counties.mjs';
import { savedPage } from './pages.mjs';
import { readRegulated, regulatedPlants, stateRegulated } from './regulated.mjs';

const stateOf = (fips) => Math.floor(fips / 1000);
const binomial = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
/** A hybrid, or two taxa in one entry: no one plant's records (usda-counties.mjs twoTaxa). */
const isHybrid = (bot) => (/×| x |\bhybrid\b/i.test(bot) && !/\bhybrids\b/i.test(bot)) || /\/\s*[A-Za-z]/.test(bot.replace(/'[^']*'|‘[^’]*’|\([^)]*\)/g, ''));

/**
 * The atlas's records for each catalog plant: { id: { counties, species } }. A plant gets its own taxon's: a
 * species all its maps (its varieties' too), matched by the atlas name the audit found for it or its
 * botanical name; a variety or subspecies its own map. A cultivar or mix (no species record in the catalog),
 * or a variety the atlas maps only as its species, gets its species' (`species`). A hybrid gets none.
 * `audit`: [{ id, species, raw: { arkatlas: { name } } }]; `maps`: { "Genus species[ var. x]": [fips] }.
 */
export function atlasRecords(catalog, audit, maps) {
  const byId = new Map(audit.map((a) => [a.id, a]));
  const out = {};
  for (const rec of catalog.plants) {
    if (rec.parent) continue; // (a cultivar with a species record takes its records in the app, and says so)
    const bot = String(rec.botanical ?? '').replace(/\s+/g, ' ').trim();
    if (isHybrid(bot)) continue;
    const a = byId.get(rec.id);
    const names = [a?.raw?.arkatlas?.name, a?.species, bot].map(binomial).filter((n) => /^[A-Z][a-zë-]+ [a-zë-]+$/.test(n));
    const speciesMap = names.map((n) => maps[n]).find((m) => m?.length);
    const infra = bot.match(/^[A-Z][a-zë-]+ [a-zë-]+ (var\.|subsp\.|ssp\.) ([a-zë-]+)/);
    const ownMap = infra ? maps[`${binomial(bot)} ${infra[1] === 'ssp.' ? 'subsp.' : infra[1]} ${infra[2]}`] : null;
    const plain = /^[A-Z][a-zë-]+ [a-zë-]+$/.test(bot) || (!bot && names.length);
    if (ownMap?.length) out[rec.id] = { counties: ownMap, species: false };
    else if (speciesMap) out[rec.id] = { counties: speciesMap, species: !plain };
  }
  return out;
}

/**
 * One state's file from every source's records ({ key: { id: { counties, species } } }). A plant's records
 * there are the union of its sources' in the state; where any source has its own taxon's records, only those
 * count (a variety never takes its species' counties from another source). `src` names each plant's sources,
 * `species` the plants whose records are their species'. `counties`: the state's counties (their neighbors in
 * any state) and the counties over its line that border it (their state, and their neighbors in it).
 */
export function stateFile(state, bySource, sources, counties) {
  const plants = {}, src = {}, species = [];
  const ids = new Set(Object.values(bySource).flatMap((r) => Object.keys(r)));
  for (const id of [...ids].sort()) {
    const here = Object.entries(bySource).map(([key, r]) => [key, r[id]]).filter(([, r]) => r)
      .map(([key, r]) => [key, { ...r, counties: r.counties.filter((c) => stateOf(c) === state.fips) }]).filter(([, r]) => r.counties.length);
    if (!here.length) continue;
    const own = here.filter(([, r]) => !r.species);
    const use = own.length ? own : here;
    plants[id] = [...new Set(use.flatMap(([, r]) => r.counties))].sort((a, b) => a - b);
    src[id] = use.map(([key]) => key);
    if (!own.length) species.push(id);
  }
  const inState = counties.filter((c) => stateOf(c.fips) === state.fips);
  const ownCounties = new Set(inState.map((c) => c.fips));
  const out = {};
  for (const c of inState) out[c.fips] = { name: c.name, near: c.near };
  for (const c of counties) {
    if (ownCounties.has(c.fips)) continue;
    const near = c.near.filter((n) => ownCounties.has(n));
    if (near.length) out[c.fips] = { name: c.name, state: c.state, near };
  }
  const used = new Set(Object.values(src).flat());
  return {
    v: 1, state: state.code, fips: state.fips,
    sources: Object.fromEntries(Object.entries(sources).filter(([k]) => used.has(k))),
    counties: out, plants, src, species,
  };
}
/**
 * Each plant's native status in a state, from Kew's World Checklist (wcvp.mjs: { id: { states: { fips: "N" | "I" },
 * species } }): { native: { id: "N" | "I" }, species: [ids whose status is their species'] }. None where WCVP doesn't
 * list it in the state, nor native where the catalog calls the plant exotic (`exotic`: ids; WCVP's species can
 * hold a native subspecies the garden plant isn't: its Rubus idaeus, the American red raspberry).
 */
export function nativeStatus(state, wcvp, exotic = new Set()) {
  const native = {}, species = [];
  for (const [id, r] of Object.entries(wcvp)) {
    const s = r.states[state];
    if (!s || (s === 'N' && exotic.has(id))) continue;
    native[id] = s;
    if (r.species) species.push(id);
  }
  return { native, species: species.sort() };
}
/** The index: which states have a file, and for each county outside them that borders one, which files to load. */
export function wildIndex(files) {
  const states = {}, border = {};
  for (const f of files) {
    states[f.fips] = f.state;
    for (const [c, info] of Object.entries(f.counties)) if (info.state) (border[c] ??= []).push(f.fips);
  }
  for (const k of Object.keys(border)) border[k].sort((a, b) => a - b);
  return { v: 1, states, border };
}

/** The files' format: their folder (public/wild/1/), and src/wild.ts's WILD_FORMAT. */
export const FORMAT = 1;
export const SOURCES = {
  arkatlas: { title: 'Atlas of the Vascular Plants of Arkansas (Arkansas Vascular Flora Committee, 2013)', url: 'https://biology.uark.edu/herbarium/' },
  usda: { title: 'USDA PLANTS Database (NRCS), county records', url: 'https://plants.usda.gov' },
  wcvp: { title: 'World Checklist of Vascular Plants v16 (Royal Botanic Gardens, Kew; CC BY 3.0)', url: 'https://doi.org/10.34885/egs6-cp24' },
};
// ---------- GBIF's herbarium specimens by county ----------
/** GADM's old names for counties since renamed or merged (Shannon, SD is Oglala Lakota; Alaska's census areas). */
/**
 * GADM's areas holding a county and a city of the same name together (records from both are in them): Richmond,
 * Virginia (city and county, 50 miles apart), Baltimore and St. Louis (each city with its county). Checked by
 * the spread of the records GBIF places in them, 2026-10-20.
 */
const GADM_LUMPED = new Set(['VA Richmond', 'MD Baltimore', 'MO Saint Louis']);
const GADM_RENAMED = { 'SD Shannon': 'Oglala Lakota', 'AK Wade Hampton': 'Kusilvak', 'AK Prince of Wales-Outer Ketchi': 'Prince of Wales-Hyder',
  'VA Clifton Forge City': 'Alleghany' }; // (Clifton Forge merged into Alleghany County in 2001)
const countyKey = (n) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\bsaint\b/g, 'st').replace(/\bsainte\b/g, 'ste').replace(/[^a-z]/g, '');
/**
 * GADM's counties (a download names them so: "USA.4.10_1" is Clark County, Arkansas) by our FIPS: { gid: fips }.
 * `states`: [{ code (postal), subs (GADM's subdivisions of it) }]. By name in the state ("X City" as X; Bedford
 * City, Virginia, merged into Bedford County in 2013, is that county now). Lakes, and areas since split, match
 * nothing.
 */
export function gadmCounties(states, counties) {
  const out = {};
  for (const { code, subs } of states) {
    const mine = counties.filter((c) => c.state === code);
    const nameOf = (s) => countyKey(GADM_RENAMED[`${code} ${s.name}`] ?? s.name.replace(/ city$/i, ''));
    const shared = new Map();
    for (const s of subs) shared.set(nameOf(s), (shared.get(nameOf(s)) ?? 0) + 1);
    for (const s of subs) {
      const city = /city/i.test([...(s.type ?? []), ...(s.englishType ?? [])].join(' ')) || / city$/i.test(s.name);
      let hits = mine.filter((c) => countyKey(c.name.replace(/ city$/i, '')) === nameOf(s));
      // A county and a city of ours sharing the name: told apart where GADM has both too (Roanoke, Fairfax).
      // Where it has one area, that's the county (Franklin, Virginia: its city is elsewhere, in GADM's
      // Southampton), except where GADM's one area holds both (GADM_LUMPED): those are neither.
      if (hits.length > 1) {
        hits = shared.get(nameOf(s)) > 1 ? hits.filter((c) => (c.fips % 1000 >= 500) === city)
          : GADM_LUMPED.has(`${code} ${s.name}`) ? [] : hits.filter((c) => c.fips % 1000 < 500);
      }
      if (hits.length === 1) out[s.id] = hits[0].fips;
    }
  }
  return out;
}
/**
 * GBIF's records of each catalog plant by county, from the counties download's rows: { id: { counties, species } },
 * like atlasRecords. Herbarium specimens only (a botanist collected it there, as the atlas's and USDA's records
 * are), not those marked cultivated or captive; observations aren't counted (a planted shrub is too easily
 * logged as wild). And only in or next to (in the same state) a county where the curated sources (the atlas,
 * USDA) record it wild already (`nearRecord(id, county)`): specimens fill in its range, never extend it. Few specimens of planted
 * things are marked so (65 of 760,000): unchecked, a garden camellia, a Chinese chestnut or a misnamed
 * coneflower collected in Arkansas would count. `fipsOf(gid)`: a county's FIPS.
 */
export function gbifRecords(rows, species, keyOf, fipsOf, nearRecord) {
  const byKey = new Map();
  for (const s of species) { const k = keyOf(s); if (k != null) (byKey.get(String(k)) ?? byKey.set(String(k), []).get(String(k))).push(s); }
  const out = {};
  for (const r of rows) {
    if (r.basisofrecord !== 'PRESERVED_SPECIMEN' || /^(cultivated|captive)$/i.test(r.degree) || !(Number(r.n) > 0)) continue;
    const f = fipsOf(r.level2gid);
    if (f == null) continue;
    for (const s of byKey.get(String(r.specieskey)) ?? []) if (nearRecord(s.id, f)) (out[s.id] ??= { counties: new Set(), species: s.species }).counties.add(f);
  }
  return Object.fromEntries(Object.entries(out).map(([id, r]) => [id, { counties: [...r.counties].sort((a, b) => a - b), species: r.species }]));
}

/**
 * Whether a county is one the curated sources record a plant in, or next to one in the same state: (id, fips)
 * → boolean. (Over a state line, a record vouches for nothing in the other state; checked, those additions were
 * mostly look-alikes, a northern blazing star "wild" in Arkansas.)
 */
export function curatedNear(bySource, counties) {
  const nearOf = new Map(counties.map((c) => [c.fips, c.near]));
  const ok = new Set(Object.values(bySource).flatMap((r) => Object.entries(r).flatMap(([id, x]) =>
    x.counties.flatMap((c) => [c, ...(nearOf.get(c) ?? []).filter((n) => stateOf(n) === stateOf(c))].map((n) => `${id} ${n}`)))));
  return (id, fips) => ok.has(`${id} ${fips}`);
}
/** The bloom months' source: GBIF's download of the flowering records, cited by its DOI (GBIF's citation form, short). */
export const gbifSource = (doi) => ({ title: `GBIF.org Occurrence Download doi:${doi}`, url: `https://doi.org/${doi}` });
/** The county records' source: GBIF's download of herbarium specimens by county, cited by its DOI. */
export const gbifSpecimensSource = (doi) => ({ title: `Herbarium specimens, GBIF.org Occurrence Download doi:${doi}`, url: `https://doi.org/${doi}` });
/** Each state's neighboring states (sharing a county line). */
export function neighborStates(counties) {
  const out = {};
  for (const c of counties) for (const n of c.near) {
    const a = stateOf(c.fips), b = stateOf(n);
    if (a !== b) (out[a] ??= new Set()).add(b);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort((x, y) => x - y)]));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [auditPath] = process.argv.slice(2);
  if (!auditPath) { console.error('usage: node scripts/catalog/wild.mjs <combined.json>'); process.exit(1); }
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const write = (path, data) => { const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(data)); renameSync(tmp, path); };
  const catalog = read('public/plants.json'), counties = read('catalog-src/counties.json');
  if (!existsSync('catalog-src/usda-counties.json')) { console.error('catalog-src/usda-counties.json is missing: run usda-fetch.mjs and usda-counties.mjs first (or every state but Arkansas would lose its records)'); process.exit(1); }
  const bySource = { arkatlas: atlasRecords(catalog, read(auditPath), read('catalog-src/arkatlas/counties.json')), usda: read('catalog-src/usda-counties.json') };
  if (!existsSync('catalog-src/wcvp-native.json')) { console.error('catalog-src/wcvp-native.json is missing: run wcvp.mjs first (native status by state)'); process.exit(1); }
  const wcvp = read('catalog-src/wcvp-native.json');
  // (The catalog's own "Exotic", from its sources: never shown native. Listed for review where WCVP says so.)
  const exotic = new Set(catalog.plants.filter((p) => (p.facts?.native?.v ?? p.facts?.native) === 'Exotic').map((p) => p.id));
  const nativeReview = Object.entries(wcvp).filter(([id, r]) => exotic.has(id) && Object.values(r.states).includes('N'))
    .map(([id, r]) => ({ id, name: r.name, nativeIn: Object.entries(r.states).filter(([, s]) => s === 'N').map(([f]) => Number(f)) }));
  writeFileSync('catalog-src/native-review.json', JSON.stringify(nativeReview, null, 1) + '\n');
  // Plants regulated by law (regulated-plants.json), matched by Kew's accepted names (wcvp.mjs; the lists' own reviewed).
  const regulatedData = readRegulated();
  const botanical = new Map(catalog.plants.map((p) => [p.id, p.botanical]));
  // (Every catalog plant with its own record: species as bloomSpecies finds them, and the rest, hybrids among them,
  // by their own names only: Tennessee's Lonicera × bella.)
  const speciesOf = bloomSpecies(catalog, read(auditPath));
  const seen = new Set(speciesOf.map((s) => s.id));
  const forLaw = [...speciesOf.map((s) => ({ ...s, botanical: botanical.get(s.id) })),
    ...catalog.plants.filter((p) => !p.parent && !seen.has(p.id) && p.botanical).map((p) => ({ id: p.id, botanical: p.botanical }))];
  const regulated = regulatedPlants(regulatedData, forLaw,
    Object.fromEntries(Object.entries(wcvp).map(([id, r]) => [id, r.name])));
  const sources = { ...SOURCES };
  const states = [...new Set(counties.map((c) => stateOf(c.fips)))].sort((a, b) => a - b);
  // Bloom months (GBIF's flowering records: gbif-fetch.mjs, then gbif-download.mjs), where they've been fetched.
  const audit = read(auditPath);
  const bloomMeta = existsSync('catalog-src/gbif-downloads/bloom.json') ? read('catalog-src/gbif-downloads/bloom.json') : null;
  const bloomRows = bloomMeta?.doi && existsSync('catalog-src/gbif-downloads/bloom.tsv') ? tsvRows(readFileSync('catalog-src/gbif-downloads/bloom.tsv', 'utf8')) : null;
  const page = (url) => { try { return JSON.parse(savedPage('gbif', url)?.text ?? 'null'); } catch { return null; } };
  const fipsByPostal = Object.fromEntries(Object.entries(STATES).map(([f, p]) => [p, Number(f)]));
  // (By the postal code among GADM's variant names; Rhode Island's lists only its long name.)
  const postalByName = { 'Rhode Island': 'RI' };
  const fipsOfGadm = Object.fromEntries(US_GADM.map((g) => {
    const p = page(gadmUrl(g));
    return [g, [...(p?.variantName ?? []), postalByName[p?.name]].map((v) => fipsByPostal[v]).find((f) => f != null)];
  }));
  if (bloomRows && US_GADM.some((g) => fipsOfGadm[g] == null)) { console.error('a state\'s GADM code is missing: run gbif-fetch.mjs first'); process.exit(1); }
  const counts = bloomRows ? bloomCounts(bloomSpecies(catalog, audit), page, (g) => fipsOfGadm[g], bloomRows) : {};
  // GBIF's herbarium specimens by county (gbif-download.mjs counties), where they've been fetched: a third source.
  const countyMeta = existsSync('catalog-src/gbif-downloads/counties.json') ? read('catalog-src/gbif-downloads/counties.json') : null;
  if (countyMeta?.doi && existsSync('catalog-src/gbif-downloads/counties.tsv')) {
    const codeOf = (g) => [...(page(gadmUrl(g))?.variantName ?? []), postalByName[page(gadmUrl(g))?.name]].find((v) => fipsByPostal[v] != null);
    const gadm = gadmCounties(US_GADM.map((g) => ({ code: codeOf(g), subs: page(gadmSubdivisionsUrl(g)) ?? [] })), counties);
    if (US_GADM.some((g) => !page(gadmSubdivisionsUrl(g)))) { console.error('a state\'s GADM counties are missing: run gbif-fetch.mjs first'); process.exit(1); }
    const keyOf = (s) => matchedTaxon(page(matchUrl(s.binomial)))?.key;
    const near = curatedNear(bySource, counties);
    // (Not where it's introduced in the state, by Kew's checklist: an introduced garden plant's specimens are as
    // likely planted ones, which herbaria seldom mark.)
    const fillIn = (id, c) => near(id, c) && wcvp[id]?.states[stateOf(c)] !== 'I';
    bySource.gbif = gbifRecords(tsvRows(readFileSync('catalog-src/gbif-downloads/counties.tsv', 'utf8')), bloomSpecies(catalog, audit), keyOf, (g) => gadm[g], fillIn);
    sources.gbif = gbifSpecimensSource(countyMeta.doi);
  }
  const ncsuSeasons = seasonsToCheck(audit);
  const near = neighborStates(counties);
  writeFileSync('catalog-src/bloom-review.json', JSON.stringify(bloomDisagreements(counts, ncsuSeasons), null, 1) + '\n');
  const dir = `public/wild/${FORMAT}`;
  rmSync('public/wild', { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files = [];
  for (const fips of states) {
    const code = counties.find((c) => stateOf(c.fips) === fips)?.state;
    const f = stateFile({ fips, code }, bySource, sources, counties);
    // Native or introduced in the state, by Kew's checklist (with its source, for the line that says so).
    const { native, species: nativeSpecies } = nativeStatus(fips, wcvp, exotic);
    if (Object.keys(native).length) {
      f.native = native;
      if (nativeSpecies.length) f.nativeSpecies = nativeSpecies;
      f.sources.wcvp = SOURCES.wcvp;
    }
    // What the law says of a plant here: the state's list, and the federal one.
    const law = stateRegulated(regulatedData, regulated, code);
    if (Object.keys(law.regulated).length) { f.regulated = law.regulated; f.rules = law.rules; }
    const bloom = stateBloom(fips, counts, near, ncsuSeasons);
    if (Object.keys(bloom).length) {
      f.bloom = bloom;
      f.bloomSpecies = Object.keys(bloom).filter((id) => counts[id].species).sort();
      f.sources.gbifBloom = gbifSource(bloomMeta.doi);
    }
    if (!Object.keys(f.plants).length && !f.bloom) continue;
    write(`${dir}/${String(fips).padStart(2, '0')}.json`, f);
    files.push(f);
  }
  write(`${dir}/index.json`, wildIndex(files));
  const size = readdirSync(dir).reduce((n, f) => n + readFileSync(`${dir}/${f}`).length, 0);
  const ar = files.find((f) => f.fips === 5);
  for (const [c, m] of Object.entries(regulated)) console.log(`regulated, ${c}: ${Object.entries(m).map(([id, k]) => `${id} (${k})`).join(', ')}`);
  console.log(`${files.length} state files (${Math.round(size / 1024)} KB); Arkansas: ${Object.keys(ar?.plants ?? {}).length} plants with wild records, ${Object.keys(ar?.bloom ?? {}).length} with bloom months; ${Object.keys(counts).length} plants with flowering records; ${bloomDisagreements(counts, ncsuSeasons).length} left out for disagreeing with NC State (catalog-src/bloom-review.json)`);
}
