// When plants leaf out, by state, from USA-NPN's Individual Phenometrics (docs/leaf-out.md): downloaded by hand from
// its site, as its terms ask of anything but approved automated access, and summed up here for the build.
//   node scripts/catalog/npn.mjs <individual_phenometrics_data.csv> [catalog-src/usanpn/leafout.json]
// wild.mjs then gives each state's file the days its plants leaf out (stateLeafOut).
import { createReadStream, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

/**
 * The phenophases that say a plant has started to leaf out: a tree's or shrub's leaf buds breaking (lilac's and
 * honeysuckle's own protocol too), a conifer's needle buds breaking or a pine's needles emerging, an herb's or a
 * grass's first growth.
 */
export const LEAF_PHASES = new Set([
  'Breaking leaf buds', 'Breaking leaf buds (lilac/honeysuckle)', 'Breaking needle buds (conifers)', 'Emerging needles (pines)',
  'Initial growth (forbs)', 'Initial growth (grasses/sedges)',
]);
/** Days: a plant-year counts only where a "no" came at most this long before the first "yes" (the day known to two weeks). */
export const MAX_GAP = 14;

/** One CSV line's fields (quoted fields may hold commas; "" is a quote). */
export function csvFields(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Each plant-year's leaf-out day, from rows of the download (objects by its column names): for each plant (its
 * Individual_ID) and year, the first leaf phenophase "yes" series of the year, kept only where a "no" came 1 to
 * MAX_GAP days before it and no observer recorded both "yes" and "no" that day. A later series that year doesn't
 * stand in for an unknown first one. Returns { "genus species": { ST: [day of year, …] } }, the binomial lowercase.
 */
export function leafOutDays(rows) {
  const first = new Map(); // "individual year" → { doy, ok, binomial, state }
  for (const r of rows) {
    if (!LEAF_PHASES.has(r.Phenophase_Description)) continue;
    const doy = Number(r.First_Yes_DOY), year = Number(r.First_Yes_Year), gap = Number(r.NumDays_Since_Prior_No);
    if (!(doy >= 1 && doy <= 366) || !(year >= 1900)) continue;
    const binomial = `${r.genus} ${r.Species}`.toLowerCase().trim();
    if (!/^[a-zë-]+ [a-zë-]+$/.test(binomial) || !/^[A-Z]{2}$/.test(r.State ?? '')) continue;
    const k = `${r.Individual_ID} ${year}`;
    const was = first.get(k);
    if (was && was.doy <= doy) continue;
    const ok = gap >= 1 && gap <= MAX_GAP && (r.Observed_Status_Conflict_Flag ?? '-9999') === '-9999';
    first.set(k, { doy, ok, binomial, state: r.State });
  }
  const out = {};
  for (const { doy, ok, binomial, state } of first.values()) {
    if (!ok) continue;
    ((out[binomial] ??= {})[state] ??= []).push(doy);
  }
  for (const s of Object.values(out)) for (const v of Object.values(s)) v.sort((a, b) => a - b);
  return out;
}

/** Plant-years a state needs before its own day is shown; below it, the state and its neighbors together. */
export const MIN_PLANT_YEARS = 10;
/** The middle day and the quartiles of sorted days (rounded to whole days). */
export function daySpread(days) {
  const at = (q) => { const i = (days.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(days[lo] + (days[hi] - days[lo]) * (i - lo)); };
  return { med: at(0.5), q1: at(0.25), q3: at(0.75), n: days.length };
}
/**
 * One state's leaf-out days: { id: { med, q1, q3, n, area } }, days of the year. Its own plant-years where it has
 * MIN_PLANT_YEARS; else its own and its neighbors' together (area "region") where they do; else none. `plants`: the
 * catalog records looked up (bloomSpecies: a cultivar takes its species'); `postalOf`: a state FIPS's postal code.
 */
export function stateLeafOut(fips, days, plants, neighborStates, postalOf) {
  const out = {};
  const own = postalOf(fips), near = [own, ...(neighborStates[fips] ?? []).map(postalOf)];
  for (const p of plants) {
    const d = days[p.binomial.toLowerCase()];
    if (!d) continue;
    const mine = d[own] ?? [];
    if (mine.length >= MIN_PLANT_YEARS) { out[p.id] = { ...daySpread(mine), area: 'state' }; continue; }
    const pooled = near.flatMap((s) => d[s] ?? []).sort((a, b) => a - b);
    if (pooled.length >= MIN_PLANT_YEARS) out[p.id] = { ...daySpread(pooled), area: 'region' };
  }
  return out;
}
/** The source line (USA-NPN's citation, as its data use policy asks, with what was asked for). */
export const npnSource = (meta) => ({
  title: `USA National Phenology Network. ${meta.year}. Plant and Animal Phenology Data. Individual Phenometrics, ${meta.from} to ${meta.to}, the US. Data were provided by the USA National Phenology Network`,
  url: 'https://doi.org/10.5066/F78S4N1V',
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [csv, out = 'catalog-src/usanpn/leafout.json'] = process.argv.slice(2);
  if (!csv) { console.error('usage: node scripts/catalog/npn.mjs <individual_phenometrics_data.csv> [out.json]'); process.exit(1); }
  // (The search's settings sit beside the data: its dates, for the citation.)
  const params = (() => { try { return Object.fromEntries(readFileSync(csv.replace(/[^/]*$/, 'search_parameters.csv'), 'utf8').split('\n').map(csvFields).map(([k, v]) => [String(k).replace(/:$/, ''), v])); } catch { return {}; } })();
  let header = null, n = 0;
  const rows = [];
  for await (const line of createInterface({ input: createReadStream(csv, 'utf8'), crlfDelay: Infinity })) {
    if (!line) continue;
    const f = csvFields(line);
    if (!header) { header = f; continue; }
    n++;
    const r = {};
    for (const k of ['genus', 'Species', 'State', 'Individual_ID', 'Phenophase_Description', 'First_Yes_Year', 'First_Yes_DOY', 'NumDays_Since_Prior_No', 'Observed_Status_Conflict_Flag']) r[k] = f[header.indexOf(k)];
    if (LEAF_PHASES.has(r.Phenophase_Description)) rows.push(r);
  }
  const days = leafOutDays(rows);
  // (Downloaded on the day its folder is named for: the citation's year.)
  const accessed = /(\d{4}-\d{2}-\d{2})\/[^/]*$/.exec(csv)?.[1] ?? new Date().toISOString().slice(0, 10);
  const meta = { file: csv.split('/').slice(-2).join('/'), rows: n, from: params['Start Date'] ?? '', to: params['End Date'] ?? '', accessed, year: accessed.slice(0, 4) };
  const tmp = `${out}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ meta, days }));
  renameSync(tmp, out);
  const plantYears = Object.values(days).reduce((a, s) => a + Object.values(s).reduce((b, v) => b + v.length, 0), 0);
  console.log(`${n} rows; ${plantYears} plant-years leafing out, ${Object.keys(days).length} species → ${out}`);
}
