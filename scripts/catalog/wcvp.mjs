// Native or introduced, state by state, from Kew's World Checklist of Vascular Plants (WCVP; CC BY 3.0:
// docs/wild-records.md): its distribution gives each species' presence in each US state ("botanical country",
// TDWG level 3), native or introduced. Reads catalog-src/kew-wcvp/wcvp_names.csv and wcvp_distribution.csv
// (from https://sftp.kew.org/pub/data-repositories/WCVP/wcvp.zip, unzipped there) and writes
// catalog-src/wcvp-native.json: { id: { states: { fips: "N" | "I" }, species, name, na? } } (states {} for a plant WCVP
// has in no US state; `name`, its accepted name, is what the regulated lists are matched by; `na` true where it's
// native to Canada or the US mainland, written into public/plants.json as `native_na`; `was`, its older botanical names,
// as `botanical_synonyms`), and
// catalog-src/wcvp-regulated.json: the accepted name of each species the regulated lists name (regulated.mjs),
// { "listed name": "accepted name" }.
//   node scripts/catalog/wcvp.mjs <combined.json>
import { createReadStream, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { bloomSpecies } from './bloom.mjs';
import { catalogText } from './convert-v1.mjs';
import { hybridName, WCVP_SOURCE } from './hybrids.mjs';
import { listedSpecies, readRegulated, unreviewed } from './regulated.mjs';

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
  if (id && accepted.length === 1 && targets.size > 1) { decidedByAccepted.push(accepted[0].taxon_name); acceptedAuthors.set(accepted[0].taxon_name, accepted[0].taxon_authors); }
  const t = id && byId(id);
  return t && t.taxon_rank === 'Species' ? { id, name: t.taxon_name } : null;
}
/** Names where an accepted name won over a homonym's synonym of the same spelling (listed by the run, for review). */
export const decidedByAccepted = [];
/** Those names' accepted authors ("L."): a check recorded in decisions.json holds only while Kew's accepted name is the one checked. */
export const acceptedAuthors = new Map();
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

/**
 * Whether a taxon is native somewhere in Canada or the US mainland (Alaska and Greenland too): TDWG regions 70–78,
 * Kew's "Northern America" less Mexico (79). Not Hawaii (Pacific) or Puerto Rico (Caribbean). For the caterpillar-host
 * rule (`native_na`, docs/catalog-format.md): the plants the continent's caterpillars grew up with.
 */
export function nativeToNorthAmerica(rows) {
  return rows.some((r) => r.continent_code_l1 === '7' && /^7[0-8]$/.test(r.region_code_l2) && r.introduced !== '1' && r.extinct !== '1' && r.location_doubtful !== '1');
}

/**
 * `botanical_synonyms` on each species record: its older botanical names, by Kew's checklist (`native`: wcvp-native.json's,
 * by id, `was`): homotypic synonyms only, the same species under an earlier genus or spelling ("Mahonia aquifolium",
 * "Sedum spectabile", "Aster novae-angliae"), the names on older tags and in older books; never its own name. Taken off
 * every other record (a cultivar takes its species', in the app). Returns how many have some.
 */
export function oldNameFacts(catalog, native) {
  let n = 0;
  for (const rec of catalog.plants) {
    const was = rec.parent ? [] : (native[rec.id]?.was ?? []).filter((x) => x !== rec.botanical);
    if (was.length) { rec.facts.botanical_synonyms = { v: was, src: ['wcvp'] }; n++; }
    else delete rec.facts.botanical_synonyms;
  }
  if (n) catalog.meta.sources.wcvp ??= WCVP_SOURCE;
  return n;
}
/**
 * `native_na` on each species record Kew has native to Canada or the US mainland (`native`: wcvp-native.json's, by
 * id, `na` true); taken off every other record (a cultivar takes its species', in the app). Returns how many have it.
 */
export function northAmericaFacts(catalog, native) {
  let n = 0;
  for (const rec of catalog.plants) {
    if (!rec.parent && native[rec.id]?.na) { rec.facts.native_na = { v: true, src: ['wcvp'] }; n++; }
    else delete rec.facts.native_na;
  }
  if (n) catalog.meta.sources.wcvp ??= WCVP_SOURCE;
  return n;
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
  const regulatedData = readRegulated();
  const listed = listedSpecies(regulatedData);
  const wanted = new Set([...species.map((s) => wcvpName(s.binomial)), ...listed]);
  // (A named hybrid's parents, from Kew's hybrid formula: for hybrids.mjs, poison by the parents.)
  const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8'));
  const hybrids = new Map();
  for (const r of catalog.plants) { const h = hybridName(r.botanical); if (h?.kind === 'named') hybrids.set(r.id, h.wcvp); }
  const hybridNames = new Set(hybrids.values());
  const byName = new Map(), rowById = new Map(), hybridRows = new Map(), hybridById = new Map();
  for await (const r of rowsOf(`${dir}/wcvp_names.csv`)) {
    if (wanted.has(r.taxon_name)) (byName.get(r.taxon_name) ?? byName.set(r.taxon_name, []).get(r.taxon_name)).push(r);
    if (r.taxon_rank === 'Species' && r.taxon_status === 'Accepted') rowById.set(r.plant_name_id, { taxon_rank: r.taxon_rank, taxon_name: r.taxon_name });
    if (r.taxon_rank === 'Species' && hybridNames.has(r.taxon_name)) (hybridRows.get(r.taxon_name) ?? hybridRows.set(r.taxon_name, []).get(r.taxon_name)).push(r);
    if (r.taxon_rank === 'Species' && r.hybrid_formula) hybridById.set(r.plant_name_id, { name: r.taxon_name, formula: r.hybrid_formula, status: r.taxon_status });
  }
  // (Kew's own hybrid, else the one a synonym is accepted as: its formula, where Kew gives one.)
  const kewHybrids = {};
  for (const [id, name] of hybrids) {
    const rows = hybridRows.get(name) ?? [];
    const own = rows.find((r) => r.taxon_status !== 'Synonym' && r.hybrid_formula);
    const via = own ? hybridById.get(own.plant_name_id) : rows.map((r) => hybridById.get(r.accepted_plant_name_id)).find(Boolean);
    if (via?.formula) kewHybrids[id] = { name: via.name, formula: via.formula };
  }
  writeFileSync('catalog-src/wcvp-hybrids.json.tmp', JSON.stringify(kewHybrids, null, 1) + '\n');
  renameSync('catalog-src/wcvp-hybrids.json.tmp', 'catalog-src/wcvp-hybrids.json');
  const taxa = new Map(), unmatched = [];
  for (const b of wanted) {
    const t = acceptedTaxon(byName.get(b) ?? [], (id) => rowById.get(id));
    if (t) taxa.set(b, t); else unmatched.push(b);
  }
  const ids = new Set([...taxa.values()].map((t) => t.id));
  // (Each accepted species' homotypic synonyms: its older names. A second read of the names, now the ids are known.)
  const older = new Map();
  for await (const r of rowsOf(`${dir}/wcvp_names.csv`)) {
    if (r.taxon_status !== 'Synonym' || r.taxon_rank !== 'Species' || r.homotypic_synonym !== 'T' || !ids.has(r.accepted_plant_name_id)) continue;
    (older.get(r.accepted_plant_name_id) ?? older.set(r.accepted_plant_name_id, new Set()).get(r.accepted_plant_name_id)).add(r.taxon_name);
  }
  const dist = new Map();
  for await (const r of rowsOf(`${dir}/wcvp_distribution.csv`)) if (ids.has(r.plant_name_id)) (dist.get(r.plant_name_id) ?? dist.set(r.plant_name_id, []).get(r.plant_name_id)).push(r);
  const out = {};
  for (const s of species) {
    const t = taxa.get(wcvpName(s.binomial));
    if (!t) continue;
    const rows = dist.get(t.id) ?? [];
    out[s.id] = { states: stateStatus(rows), species: s.species, name: t.name };
    if (nativeToNorthAmerica(rows)) out[s.id].na = true;
    const was = [...(older.get(t.id) ?? [])].filter((n) => n !== t.name).sort();
    if (was.length) out[s.id].was = was;
  }
  const regulated = Object.fromEntries(listed.map((n) => [n, taxa.get(n)?.name]).filter(([, a]) => a));
  writeFileSync('catalog-src/wcvp-regulated.json.tmp', JSON.stringify(regulated, null, 1) + '\n');
  renameSync('catalog-src/wcvp-regulated.json.tmp', 'catalog-src/wcvp-regulated.json');
  const path = 'catalog-src/wcvp-native.json';
  writeFileSync(`${path}.tmp`, JSON.stringify(out)); renameSync(`${path}.tmp`, path);
  // (Native to Canada or the US mainland, into the catalog: the caterpillar-host rule's.)
  const na = northAmericaFacts(catalog, out);
  const olderNames = oldNameFacts(catalog, out);
  writeFileSync('public/plants.json.tmp', catalogText(catalog));
  renameSync('public/plants.json.tmp', 'public/plants.json');
  console.log(`${na} plants native to Canada or the US mainland (native_na); ${olderNames} with older botanical names (botanical_synonyms)`);
  // (Names a person checked are read as Kew's accepted name, by its authors: scripts/catalog/decisions.json
  // `kewNames`. A later checklist that accepts the other homonym lists the name again.)
  const checked = JSON.parse(readFileSync('scripts/catalog/decisions.json', 'utf8')).kewNames ?? {};
  const homonyms = [...new Set(decidedByAccepted)].filter((n) => checked[n]?.author !== acceptedAuthors.get(n)).sort();
  if (homonyms.length) console.log(`accepted name chosen over a homonym's synonym (check these): ${homonyms.join(', ')}`);
  const ours = new Set(species.map((s) => wcvpName(s.binomial)));
  const mine = unmatched.filter((n) => ours.has(n));
  const lost = listed.filter((n) => !regulated[n]);
  console.log(`${Object.keys(regulated).length} of ${listed.length} regulated names matched to an accepted species${lost.length ? ` (not: ${lost.join(', ')})` : ''}`);
  const check = unreviewed(regulatedData, regulated);
  if (check.length) console.log(`regulated names Kew accepts under a name the list doesn't give (check each, and set its "accepted" in regulated-plants.json):\n  ${check.join('\n  ')}`);
  console.log(`${Object.values(out).filter((r) => Object.keys(r.states).length).length} plants with US states from WCVP (${species.length} looked up); ${mine.length} names not matched to one accepted species: ${mine.slice(0, 20).join(', ')}${mine.length > 20 ? '…' : ''}`);
  // (The same, for the build's review report: docs/catalog-build.md.)
  // (A law-list name whose `accepted` is set, a name or false, has been looked at: not listed again.)
  const looked = new Set(regulatedData.jurisdictions.flatMap((j) => j.plants.filter((p) => p.accepted !== undefined).map((p) => p.kew ?? p.name)));
  const review = { homonyms, regulatedUnreviewed: check, regulatedNotMatched: lost.filter((n) => !looked.has(n)), notMatched: [...mine].sort() };
  writeFileSync('catalog-src/wcvp-review.json.tmp', JSON.stringify(review, null, 1) + '\n');
  renameSync('catalog-src/wcvp-review.json.tmp', 'catalog-src/wcvp-review.json');
}
