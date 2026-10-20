// Bloom months by state from GBIF's flowering records (docs/bloom-months.md). bloomSpecies says which
// catalog records are looked up (gbif-fetch.mjs); bloomCounts reads what was fetched.
import { twoTaxa } from './usda-counties.mjs';
import { gadmUrl, matchedTaxon, matchUrl, monthsUrl, statesUrl } from './gbif.mjs';

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
/** Whether a window shares a month with a source's seasons ("spring", "summer"…). No seasons: nothing to check. */
export function agreesWithSeasons(w, seasons) {
  const months = (seasons ?? []).flatMap((s) => SEASON_MONTHS[String(s).toLowerCase()] ?? []);
  return !months.length || months.some((m) => inWindow(m, w));
}

/**
 * Each looked-up plant's flowering records by state: { id: { states: { fips: [12 counts] }, total: [12],
 * species, taxon } }. `read(url)` gives a fetched page's JSON; `fipsOf(gid)` a GADM id's state FIPS.
 */
export function bloomCounts(species, read, fipsOf) {
  const out = {};
  for (const s of species) {
    const t = matchedTaxon(read(matchUrl(s.binomial)));
    if (!t) continue;
    const months = read(monthsUrl(t.key))?.facets?.[0]?.counts ?? [];
    const states = {}, total = Array(12).fill(0);
    let complete = true;
    for (const c of months) {
      const m = Number(c.name);
      if (!(m >= 1 && m <= 12) || !(c.count > 0)) continue;
      total[m - 1] += c.count;
      const page = read(statesUrl(t.key, m));
      if (!page) { complete = false; continue; }
      for (const g of page.facets?.[0]?.counts ?? []) {
        const f = fipsOf(g.name);
        if (f == null) continue;
        (states[f] ??= Array(12).fill(0))[m - 1] += g.count;
      }
    }
    if (!complete) continue; // (some months not fetched yet: left out rather than shown short)
    out[s.id] = { states, total, species: s.species, taxon: t };
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
/** Plants whose US-wide window shares no month with NC State's seasons: [{ id, window, seasons }]. */
export function bloomDisagreements(counts, ncsuSeasons) {
  return Object.entries(counts).map(([id, c]) => ({ id, window: bloomWindow(c.total), seasons: ncsuSeasons[id] }))
    .filter((d) => d.window && !agreesWithSeasons(d.window, d.seasons));
}
