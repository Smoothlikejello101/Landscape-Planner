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
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [auditPath] = process.argv.slice(2);
  if (!auditPath) { console.error('usage: node scripts/catalog/wild.mjs <combined.json>'); process.exit(1); }
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const write = (path, data) => { const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(data)); renameSync(tmp, path); };
  const catalog = read('public/plants.json'), counties = read('catalog-src/counties.json');
  if (!existsSync('catalog-src/usda-counties.json')) { console.error('catalog-src/usda-counties.json is missing: run usda-fetch.mjs and usda-counties.mjs first (or every state but Arkansas would lose its records)'); process.exit(1); }
  const bySource = { arkatlas: atlasRecords(catalog, read(auditPath), read('catalog-src/arkatlas/counties.json')), usda: read('catalog-src/usda-counties.json') };
  const states = [...new Set(counties.map((c) => stateOf(c.fips)))].sort((a, b) => a - b);
  const dir = `public/wild/${FORMAT}`;
  rmSync('public/wild', { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files = [];
  for (const fips of states) {
    const code = counties.find((c) => stateOf(c.fips) === fips)?.state;
    const f = stateFile({ fips, code }, bySource, SOURCES, counties);
    if (!Object.keys(f.plants).length) continue;
    write(`${dir}/${String(fips).padStart(2, '0')}.json`, f);
    files.push(f);
  }
  write(`${dir}/index.json`, wildIndex(files));
  const size = readdirSync(dir).reduce((n, f) => n + readFileSync(`${dir}/${f}`).length, 0);
  console.log(`${files.length} state files (${Math.round(size / 1024)} KB); Arkansas: ${Object.keys(files.find((f) => f.fips === 5)?.plants ?? {}).length} plants`);
}
