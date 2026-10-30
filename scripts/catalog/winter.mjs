// Winter leaves for a plant no source says keeps its leaves or not (`foliage`): what the month slider draws it as in
// winter (garden over time), and what its details say, as `winter_leaves` (docs/catalog-format.md), never `foliage`
// itself, so no filter takes it for a source's word. Decided with Jason, 2026-10-29, after testing both on the plants
// whose foliage a source gives:
//
// 1. Its own species' USA-NPN records (Jason's download, catalog-src/usanpn/): observers recorded its last live leaves
//    of the year, then none (npn.mjs bareDays: the "bare" days in leafout.json). Recorded bare: it loses its leaves (an
//    herb: dies back). Right for 94% of 441 plants with a source's foliage; the misses were semi-evergreens recorded
//    bare in a cold state. (Never "evergreen": a species no one recorded bare may only be one few watch.)
// 2. Else its relatives in the catalog: two or more other species of its genus whose foliage a source gives, all the
//    same. Right for 93% of 584. Said as what's expected, with how many: "Expected to die back, like its 5 relatives in
//    the catalog" (Jason).
//
// The rest have none: the slider draws them with the not-known ring. A cultivar takes its species' (src/catalog.ts
// INHERITED), so only species records get one. An annual's winter isn't asked.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { speciesOf } from './list.mjs';
import { catalogText } from './convert-v1.mjs';
import { npnSource } from './npn.mjs';

export const MIN_RELATIVES = 2;
const valueOf = (f) => (f && typeof f === 'object' && !Array.isArray(f) && 'v' in f ? f.v : f);
/** The species name USA-NPN's summary is keyed by ("acer saccharum"); null for a genus alone. */
export function npnName(botanical) {
  const s = speciesOf(botanical);
  return s.genusOnly ? null : s.species.toLowerCase().replace(/ × /, ' x ');
}
const genusOf = (botanical) => speciesOf(botanical).species.split(' ')[0];
/** How many plant-years a species was recorded bare, over every state. */
export const bareYears = (bare, name) => Object.values(bare?.[name] ?? {}).reduce((n, days) => n + days.length, 0);

/**
 * `plants`: the catalog's records; `sources`: its meta.sources; `bare`: leafout.json's `bare` (USA-NPN), or null.
 * Returns the records with `winter_leaves` set where it now applies and taken off where it no longer does (a source's
 * foliage since written), and counts.
 */
export function winterLeaves(plants, sources, bare, date) {
  const sourced = (rec) => {
    const f = rec.facts?.foliage;
    return valueOf(f) && (f?.src ?? rec.src ?? []).some((s) => sources[s]?.trust !== 'unverified') ? valueOf(f) : undefined;
  };
  // Each genus's species with a source's foliage: species name → foliage.
  const byGenus = new Map();
  for (const rec of plants) {
    if (rec.parent || speciesOf(rec.botanical).genusOnly) continue;
    const fol = sourced(rec);
    if (!fol) continue;
    const g = genusOf(rec.botanical);
    if (!byGenus.has(g)) byGenus.set(g, new Map());
    byGenus.get(g).set(speciesOf(rec.botanical).species, fol);
  }
  const counts = { records: 0, relatives: 0 };
  const out = plants.map((rec) => {
    const before = rec.facts?.winter_leaves;
    let next;
    const forms = [valueOf(rec.facts?.form)].flat();
    if (!rec.parent && !valueOf(rec.facts?.foliage) && !(forms.length && forms.every((f) => f === 'Annual')) && !speciesOf(rec.botanical).genusOnly) {
      const name = npnName(rec.botanical);
      const n = name ? bareYears(bare, name) : 0;
      if (n > 0) next = { v: { leaves: 'deciduous', basis: 'records', n }, src: ['usanpn'] };
      else {
        const own = speciesOf(rec.botanical).species;
        const rel = [...(byGenus.get(genusOf(rec.botanical)) ?? new Map())].filter(([sp]) => sp !== own).map(([, f]) => f);
        if (rel.length >= MIN_RELATIVES && new Set(rel).size === 1) next = { v: { leaves: rel[0], basis: 'relatives', n: rel.length }, src: ['relatives'] };
      }
    }
    if (next) counts[next.v.basis]++;
    if (JSON.stringify(next) === JSON.stringify(before)) return rec;
    const facts = { ...rec.facts };
    if (next) facts.winter_leaves = next; else delete facts.winter_leaves;
    return { ...rec, facts, audited: date ?? rec.audited };
  });
  return { plants: out, counts };
}

/** The sources a `winter_leaves` cites, for meta.sources: USA-NPN as the wild files credit it, and the relatives. */
export const RELATIVES_SOURCE = { title: 'Its relatives in this catalog: other species of its genus, each as its own sources give it', trust: 'reference' };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // (node scripts/catalog/winter.mjs [--date YYYY-MM-DD]: the build's step, after the USA-NPN summary.)
  const catalogPath = 'public/plants.json', npnPath = 'catalog-src/usanpn/leafout.json';
  const date = process.argv.includes('--date') ? process.argv[process.argv.indexOf('--date') + 1] : undefined;
  const file = JSON.parse(readFileSync(catalogPath, 'utf8'));
  let npn = null;
  try { npn = JSON.parse(readFileSync(npnPath, 'utf8')); } catch { /* no download: relatives only */ }
  const { plants, counts } = winterLeaves(file.plants, file.meta.sources, npn?.bare ?? null, date);
  const sources = { ...file.meta.sources };
  const cites = (s) => plants.some((p) => p.facts?.winter_leaves?.src?.includes(s));
  if (cites('usanpn') && npn) sources.usanpn = { ...npnSource(npn.meta), trust: 'observation' }; else if (!cites('usanpn')) delete sources.usanpn;
  if (cites('relatives')) sources.relatives = RELATIVES_SOURCE; else delete sources.relatives;
  const changed = plants.some((p, i) => p !== file.plants[i]);
  writeFileSync(catalogPath, catalogText({ meta: { ...file.meta, sources, ...(changed && date ? { updated: date } : {}) }, plants }));
  console.log(`winter leaves: ${counts.records} by their USA-NPN records, ${counts.relatives} by their relatives${changed ? '' : ' (no change)'}`);
}
