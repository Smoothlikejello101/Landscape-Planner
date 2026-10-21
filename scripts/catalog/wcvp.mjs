// Native or introduced, state by state, from Kew's World Checklist of Vascular Plants (WCVP; CC BY 3.0:
// docs/wild-records.md): its distribution gives each species' presence in each US state ("botanical country",
// TDWG level 3), native or introduced. Reads catalog-src/kew-wcvp/wcvp_names.csv and wcvp_distribution.csv
// (from https://sftp.kew.org/pub/data-repositories/WCVP/wcvp.zip, unzipped there) and writes
// catalog-src/wcvp-native.json: { id: { states: { fips: "N" | "I" }, species, name } } (states {} for a plant WCVP
// has in no US state; `name`, its accepted name, is what the regulated lists are matched by), and
// catalog-src/wcvp-regulated.json: the accepted name of each species the regulated lists name (regulated.mjs),
// { "listed name": "accepted name" }.
//   node scripts/catalog/wcvp.mjs <combined.json>
import { createReadStream, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { bloomSpecies } from './bloom.mjs';
import { listedSpecies, readRegulated } from './regulated.mjs';

/** TDWG level 3 areas that are US states (and DC, Puerto Rico), by FIPS. The Aleutians are Alaska's. */
export const TDWG_STATES = {
  ALA: 1, ASK: 2, ALU: 2, ARI: 4, ARK: 5, CAL: 6, COL: 8, CNT: 9, DEL: 10, WDC: 11, FLA: 12, GEO: 13, HAW: 15, IDA: 16,
  ILL: 17, INI: 18, IOW: 19, KAN: 20, KTY: 21, LOU: 22, MAI: 23, MRY: 24, MAS: 25, MIC: 26, MIN: 27, MSI: 28, MSO: 29,
  MNT: 30, NEB: 31, NEV: 32, NWH: 33, NWJ: 34, NWM: 35, NWY: 36, NCA: 37, NDA: 38, OHI: 39, OKL: 40, ORE: 41, PEN: 42,
  RHO: 44, SCA: 45, SDA: 46, TEN: 47, TEX: 48, UTA: 49, VER: 50, VRG: 51, WAS: 53, WVA: 54, WIS: 55, WYO: 56, PUE: 72,
};

/** The catalog's names WCVP spells otherwise (each checked to be the same plant, 2026-10-21). */
export const WCVP_NAME = { 'Andropogon gerardii': 'Andropogon gerardi', 'Buddleia davidii': 'Buddleja davidii', 'Monarda bradburiana': 'Monarda bradburyana' };
const wcvpName = (b) => WCVP_NAME[b] ?? b;
/**
 * The accepted WCVP taxon for a binomial: { id, name }, from its species-rank names (an accepted one, or a
 * synonym's accepted name); null where there's none, or where its names lead to more than one accepted taxon
 * (homonyms, a name split two ways), or to an infraspecific one (a synonym of a variety: the species' range
 * isn't its alone). `names`: the rows for that binomial.
 */
export function acceptedTaxon(rows, byId) {
  const sp = rows.filter((r) => r.taxon_rank === 'Species' && ['Accepted', 'Synonym'].includes(r.taxon_status));
  const targets = new Set(sp.map((r) => (r.taxon_status === 'Accepted' ? r.plant_name_id : r.accepted_plant_name_id)).filter(Boolean));
  // (An accepted name wins over synonyms of the same spelling: a later homonym sunk elsewhere.)
  const accepted = sp.filter((r) => r.taxon_status === 'Accepted');
  const id = accepted.length === 1 ? accepted[0].plant_name_id : targets.size === 1 ? [...targets][0] : null;
  if (id && accepted.length === 1 && targets.size > 1) decidedByAccepted.push(accepted[0].taxon_name);
  const t = id && byId(id);
  return t && t.taxon_rank === 'Species' ? { id, name: t.taxon_name } : null;
}
/** Names where an accepted name won over a homonym's synonym of the same spelling (listed by the run, for review). */
export const decidedByAccepted = [];
/** A taxon's status in each state from its distribution rows: N native, I introduced; not where extinct or doubtful. */
export function stateStatus(rows) {
  const out = {};
  for (const r of rows) {
    const fips = TDWG_STATES[r.area_code_l3];
    if (!fips || r.extinct === '1' || r.location_doubtful === '1') continue;
    // (Native and introduced in one state, a row each: native.)
    out[fips] = r.introduced === '1' && out[fips] !== 'N' ? 'I' : 'N';
  }
  return out;
}

async function* rowsOf(path) {
  let head = null;
  for await (const line of createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })) {
    const v = line.split('|');
    if (!head) { head = v; continue; }
    yield Object.fromEntries(head.map((h, i) => [h, v[i] ?? '']));
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [auditPath] = process.argv.slice(2);
  if (!auditPath) { console.error('usage: node scripts/catalog/wcvp.mjs <combined.json>'); process.exit(1); }
  const dir = 'catalog-src/kew-wcvp';
  const species = bloomSpecies(JSON.parse(readFileSync('public/plants.json', 'utf8')), JSON.parse(readFileSync(auditPath, 'utf8')));
  const listed = listedSpecies(readRegulated());
  const wanted = new Set([...species.map((s) => wcvpName(s.binomial)), ...listed]);
  const byName = new Map(), rowById = new Map();
  for await (const r of rowsOf(`${dir}/wcvp_names.csv`)) {
    if (wanted.has(r.taxon_name)) (byName.get(r.taxon_name) ?? byName.set(r.taxon_name, []).get(r.taxon_name)).push(r);
    if (r.taxon_rank === 'Species' && r.taxon_status === 'Accepted') rowById.set(r.plant_name_id, { taxon_rank: r.taxon_rank, taxon_name: r.taxon_name });
  }
  const taxa = new Map(), unmatched = [];
  for (const b of wanted) {
    const t = acceptedTaxon(byName.get(b) ?? [], (id) => rowById.get(id));
    if (t) taxa.set(b, t); else unmatched.push(b);
  }
  const ids = new Set([...taxa.values()].map((t) => t.id));
  const dist = new Map();
  for await (const r of rowsOf(`${dir}/wcvp_distribution.csv`)) if (ids.has(r.plant_name_id)) (dist.get(r.plant_name_id) ?? dist.set(r.plant_name_id, []).get(r.plant_name_id)).push(r);
  const out = {};
  for (const s of species) {
    const t = taxa.get(wcvpName(s.binomial));
    if (!t) continue;
    out[s.id] = { states: stateStatus(dist.get(t.id) ?? []), species: s.species, name: t.name };
  }
  const regulated = Object.fromEntries(listed.map((n) => [n, taxa.get(n)?.name]).filter(([, a]) => a));
  writeFileSync('catalog-src/wcvp-regulated.json.tmp', JSON.stringify(regulated, null, 1) + '\n');
  renameSync('catalog-src/wcvp-regulated.json.tmp', 'catalog-src/wcvp-regulated.json');
  const path = 'catalog-src/wcvp-native.json';
  writeFileSync(`${path}.tmp`, JSON.stringify(out)); renameSync(`${path}.tmp`, path);
  if (decidedByAccepted.length) console.log(`accepted name chosen over a homonym's synonym (check these): ${[...new Set(decidedByAccepted)].join(', ')}`);
  const ours = new Set(species.map((s) => wcvpName(s.binomial)));
  const mine = unmatched.filter((n) => ours.has(n));
  const lost = listed.filter((n) => !regulated[n]);
  console.log(`${Object.keys(regulated).length} of ${listed.length} regulated names matched to an accepted species${lost.length ? ` (not: ${lost.join(', ')})` : ''}`);
  console.log(`${Object.values(out).filter((r) => Object.keys(r.states).length).length} plants with US states from WCVP (${species.length} looked up); ${mine.length} names not matched to one accepted species: ${mine.slice(0, 20).join(', ')}${mine.length > 20 ? '…' : ''}`);
}
