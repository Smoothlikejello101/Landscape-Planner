// Bloom months by state from GBIF's flowering records (docs/bloom-months.md). bloomSpecies says which
// catalog records are looked up (gbif-fetch.mjs, gbif-download.mjs); bloomCounts counts the download's rows.
import { twoTaxa } from './usda-counties.mjs';
import { matchedTaxon, matchUrl, phases } from './gbif.mjs';

const binomialOf = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
/**
 * The catalog records looked up: species and varieties (a cultivar with a species record takes its
 * species' in the app), not hybrids or two taxa in one entry; by the audit's species name, else the
 * botanical name's first two words. A cultivar or mix with no species record looks up its species, said so.
 */
export function bloomSpecies(catalog, audit) {
  const byId = new Map(audit.map((a) => [a.id, a]));
  const out = [];
  for (const rec of catalog.plants) {
    if (rec.parent) continue;
    const bot = String(rec.botanical ?? '').replace(/\s+/g, ' ').trim();
    if ((/×| x |\bhybrid\b/i.test(bot) && !/\bhybrids\b/i.test(bot)) || twoTaxa(bot)) continue;
    const binomial = binomialOf(byId.get(rec.id)?.species ?? bot);
    if (!/^[A-Z][a-zë-]+ [a-zë-]+$/.test(binomial)) continue;
    out.push({ id: rec.id, binomial, species: !/^[A-Z][a-zë-]+ [a-zë-]+$/.test(bot) });
  }
  return out;
}

/** Records a state needs before its own months are shown; below it, the state and its neighbors together. */
export const MIN_RECORDS = 30;
/** The share of a plant's flowering records its bloom window holds. */
export const WINDOW_SHARE = 0.8;
/**
 * The shortest run of months (wrapping past December: witch hazel blooms Dec–Feb) holding at least
 * WINDOW_SHARE of the records, the busiest such run on a tie; and the peak month. Months are 1–12.
 */
export function bloomWindow(counts) {
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n) return null;
  let best = null;
  for (let len = 1; len <= 12 && !best; len++) {
    for (let s = 0; s < 12; s++) {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += counts[(s + i) % 12];
      if (sum >= WINDOW_SHARE * n && (!best || sum > best.sum)) best = { start: s + 1, end: ((s + len - 1) % 12) + 1, sum };
    }
  }
  const peak = counts.indexOf(Math.max(...counts)) + 1;
  return { start: best.start, end: best.end, peak, n };
}
const SEASON_MONTHS = { winter: [12, 1, 2], spring: [3, 4, 5], summer: [6, 7, 8], fall: [9, 10, 11] };
const inWindow = (m, w) => (w.start <= w.end ? m >= w.start && m <= w.end : m >= w.start || m <= w.end);
/**
 * Whether a window shares a month with a source's seasons ("spring", "summer"…; USDA's "mid spring" is spring's
 * months). No seasons: nothing to check.
 */
export function agreesWithSeasons(w, seasons) {
  const months = (seasons ?? []).flatMap((s) => SEASON_MONTHS[String(s).toLowerCase().replace(/^(early|mid|late) /, '')] ?? []);
  return !months.length || months.some((m) => inWindow(m, w));
}

/**
 * Each looked-up plant's records of a phase ('flower', or 'fruit') by state and month: { id: { states: { fips:
 * [12 counts] }, total: [12], species, taxon } }. `rows`: the bloom download's (specieskey, level1gid, month,
 * reproductivecondition, n); `read(url)` gives a fetched match page's JSON; `fipsOf(gid)` a GADM id's state
 * FIPS. Records with no month count nowhere; with no state, only in the US-wide total.
 */
const KINDS = new Set(['HUMAN_OBSERVATION', 'PRESERVED_SPECIMEN']);
export function bloomCounts(species, read, fipsOf, rows, phase = 'flower') {
  const byKey = new Map();
  for (const s of species) {
    const t = matchedTaxon(read(matchUrl(s.binomial)));
    if (t) (byKey.get(String(t.key)) ?? byKey.set(String(t.key), []).get(String(t.key))).push({ ...s, taxon: t });
  }
  const out = {};
  for (const r of rows) {
    const plants = byKey.get(String(r.specieskey));
    const m = Number(r.month), n = Number(r.n);
    if (!plants || !(m >= 1 && m <= 12) || !(n > 0) || !phases(r.reproductivecondition)[phase]) continue;
    // Observations and herbarium specimens, not living collections (a botanic garden's plants) or anything
    // marked cultivated or captive. (The first download had neither column: everything counted.)
    if (r.basisofrecord != null && !KINDS.has(r.basisofrecord)) continue;
    if (/^(cultivated|captive)$/i.test(r.degree ?? '')) continue;
    const f = r.level1gid ? fipsOf(r.level1gid) : null;
    for (const s of plants) {
      const c = (out[s.id] ??= { states: {}, total: Array(12).fill(0), species: s.species, taxon: s.taxon });
      c.total[m - 1] += n;
      if (f != null) (c.states[f] ??= Array(12).fill(0))[m - 1] += n;
    }
  }
  return out;
}

/**
 * One state's bloom windows: { id: { start, end, peak, n, area } }. Its own records where it has
 * MIN_RECORDS; else its own and its neighbors' together (area "region") where they do; else none. Plants
 * whose US-wide window shares no month with NC State's seasons are left out (`disagree`, for review).
 */
export function stateBloom(fips, counts, neighborStates, ncsuSeasons = {}) {
  const out = {};
  for (const [id, c] of Object.entries(counts)) {
    const all = bloomWindow(c.total);
    if (!all || !agreesWithSeasons(all, ncsuSeasons[id])) continue;
    const own = c.states[fips];
    const ownN = own ? own.reduce((a, b) => a + b, 0) : 0;
    if (ownN >= MIN_RECORDS) { out[id] = { ...bloomWindow(own), area: 'state' }; continue; }
    const pooled = Array(12).fill(0);
    for (const f of [fips, ...(neighborStates[fips] ?? [])]) (c.states[f] ?? []).forEach((v, i) => { pooled[i] += v; });
    if (pooled.reduce((a, b) => a + b, 0) >= MIN_RECORDS) out[id] = { ...bloomWindow(pooled), area: 'region' };
  }
  return out;
}
/**
 * Plants reviewed where the records and NC State disagree, the records trusted (the owner, 2026-10-20): dwarf
 * larkspur blooms Apr–May, not summer and fall; ramps flower Jun–Jul, after their spring leaves die back; Carex
 * flaccosperma Apr–May, not summer.
 */
export const RECORDS_TRUSTED = new Set(['delphinium-tricorne', 'allium-tricoccum', 'carex-flaccosperma']);
/**
 * The seasons each plant's window is checked against: { id: ["spring", …] }, where NC State gives them (a season
 * from another source alone, a nursery's, isn't the check), but not for plants reviewed (RECORDS_TRUSTED).
 */
export function seasonsToCheck(audit) {
  return Object.fromEntries(audit.map((a) => [a.id, a.facts?.bloom_season])
    .filter(([id, f]) => f?.v?.length && f.src?.includes('ncsu') && !RECORDS_TRUSTED.has(id)).map(([id, f]) => [id, f.v]));
}
/**
 * Plants whose US-wide window shares no month with NC State's seasons: [{ id, window, seasons }]. Only those
 * with MIN_RECORDS in the US (fewer could never be shown anywhere, so there's nothing to review).
 */
export function bloomDisagreements(counts, ncsuSeasons) {
  return Object.entries(counts).map(([id, c]) => ({ id, window: bloomWindow(c.total), seasons: ncsuSeasons[id] }))
    .filter((d) => d.window && d.window.n >= MIN_RECORDS && !agreesWithSeasons(d.window, d.seasons));
}
