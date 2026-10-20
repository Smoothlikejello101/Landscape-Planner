// Build public/wild/05.json, the Arkansas counties each catalog species is recorded growing wild in (from the
// Atlas of the Vascular Plants of Arkansas's county maps), and public/wild/index.json, which says what states
// have records and which counties outside them border them (docs/wild-records.md):
//   node scripts/catalog/wild.mjs <combined.json>
// <combined.json>: sample.mjs's output, for the atlas name each plant was matched by. Reads
// catalog-src/arkatlas/counties.json (atlas_counties.py), catalog-src/counties.json (counties.mjs) and
// public/plants.json. County codes are five-digit FIPS as numbers (Clark County, Arkansas, 05019, is 5019).
// A plant's records are its own taxon's: a species' (all its maps), a variety's own map. A cultivar, mix, or
// variety the atlas maps only as its species gets its species' records, listed in `species` so the app says
// so; a hybrid gets none.
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const stateOf = (fips) => Math.floor(fips / 1000);
/**
 * A state's file: each species record (a cultivar takes its species') with the counties its map marks; the
 * state's counties (name, and neighbors in any state); and the counties outside it that border it (name,
 * state, and their neighbors in it), so a garden over the line can be told about a county next door.
 * `audit`: [{ id, species, raw: { arkatlas: { name } } }]; `maps`: { "Genus species": [fips] };
 * `counties`: counties.mjs's table.
 */
export function wildFile(catalog, audit, maps, counties, source, state = { fips: 5, code: 'AR' }) {
  const byId = new Map(audit.map((a) => [a.id, a]));
  const binomial = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
  const plants = {}, ofSpecies = [];
  for (const rec of catalog.plants) {
    if (rec.parent) continue; // (a cultivar with a species record takes its records in the app, and says so)
    const bot = String(rec.botanical ?? '').replace(/\s+/g, ' ').trim();
    if (/×| x |\bhybrid\b/i.test(bot) && !/\bhybrids\b/i.test(bot)) continue; // (a hybrid isn't its parents)
    const a = byId.get(rec.id);
    const species = [a?.raw?.arkatlas?.name, a?.species, bot].map(binomial).filter((n) => /^[A-Z][a-zë-]+ [a-zë-]+$/.test(n));
    const speciesMap = species.map((n) => maps[n]).find((m) => m?.length);
    // A variety or subspecies: its own map, else its species' (said as its species').
    const infra = bot.match(/^[A-Z][a-zë-]+ [a-zë-]+ (var\.|subsp\.|ssp\.) ([a-zë-]+)/);
    const ownMap = infra ? maps[`${binomial(bot)} ${infra[1] === 'ssp.' ? 'subsp.' : infra[1]} ${infra[2]}`] : null;
    const plain = /^[A-Z][a-zë-]+ [a-zë-]+$/.test(bot) || (!bot && species.length);
    if (ownMap?.length) plants[rec.id] = ownMap;
    else if (speciesMap) { plants[rec.id] = speciesMap; if (!plain) ofSpecies.push(rec.id); } // (a cultivar, a mix, a variety mapped only as its species)
  }
  const inState = counties.filter((c) => stateOf(c.fips) === state.fips);
  const own = new Set(inState.map((c) => c.fips));
  const out = {};
  for (const c of inState) out[c.fips] = { name: c.name, near: c.near };
  for (const c of counties) {
    if (own.has(c.fips)) continue;
    const near = c.near.filter((n) => own.has(n));
    if (near.length) out[c.fips] = { name: c.name, state: c.state, near };
  }
  return {
    v: 1, state: state.code, fips: state.fips, source, counties: out,
    plants: Object.fromEntries(Object.entries(plants).sort(([x], [y]) => x.localeCompare(y))),
    species: ofSpecies.sort(),
  };
}
/** The index: which states have a file, and for each county outside them that borders one, which files to load. */
export function wildIndex(files) {
  const states = {}, border = {};
  for (const f of files) {
    states[f.fips] = f.state;
    for (const [c, info] of Object.entries(f.counties)) if (info.state) (border[c] ??= []).push(f.fips);
  }
  return { v: 1, states, border };
}

export const ATLAS_SOURCE = {
  title: 'Atlas of the Vascular Plants of Arkansas (Arkansas Vascular Flora Committee, 2013)',
  url: 'https://biology.uark.edu/herbarium/',
  counties: 'U.S. Census Bureau cartographic boundaries (county names and neighbors)',
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [auditPath] = process.argv.slice(2);
  if (!auditPath) { console.error('usage: node scripts/catalog/wild.mjs <combined.json>'); process.exit(1); }
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const write = (path, data) => { const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(data)); renameSync(tmp, path); };
  const file = wildFile(read('public/plants.json'), read(auditPath), read('catalog-src/arkatlas/counties.json'), read('catalog-src/counties.json'), ATLAS_SOURCE);
  mkdirSync('public/wild', { recursive: true });
  write('public/wild/05.json', file);
  const files = readdirSync('public/wild').filter((f) => /^\d\d\.json$/.test(f)).map((f) => read(`public/wild/${f}`));
  write('public/wild/index.json', wildIndex(files));
  console.log(`${Object.keys(file.plants).length} species with Arkansas county records → public/wild/05.json; index of ${files.length} state file(s)`);
}
