// Building the ZIP code tables (public/climate/) from official data:
//   PRISM Group (Oregon State University): 2023 USDA hardiness zones by ZIP code
//   U.S. Census Bureau Gazetteer: where each ZIP code area's center is
//   NOAA NCEI U.S. Climate Normals, 1991-2020: freeze-date probabilities by station
// Each ZIP gets its zone, and the frost dates of the nearest station that has
// them (within MAX_MILES).

export const MAX_MILES = 50;

/** Split a CSV line (quotes allowed; a doubled quote is a quote). */
export function csvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
/** Rows of a delimited text as objects keyed by its header (trimmed). */
export function table(text, delimiter = ',') {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const split = delimiter === ',' ? csvLine : (l) => l.split(delimiter);
  const head = split(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = split(l);
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

/** PRISM's ZIP table: zip → zone ("8a"). */
export function zonesByZip(text) {
  const out = new Map();
  for (const r of table(text)) {
    const zip = (r.zipcode ?? r.ZIPCODE ?? r.zip ?? '').padStart(5, '0');
    const zone = (r.zone ?? r.ZONE ?? '').trim();
    if (/^\d{5}$/.test(zip) && /^(1[0-3]|[1-9])[ab]$/.test(zone)) out.set(zip, zone);
  }
  return out;
}
/** Census Gazetteer ZCTA file (tab-separated): zip → [lat, lon]. */
export function centersByZip(text) {
  const out = new Map();
  for (const r of table(text, '\t')) {
    const zip = r.GEOID, lat = Number(r.INTPTLAT), lon = Number(r.INTPTLONG);
    if (/^\d{5}$/.test(zip ?? '') && Number.isFinite(lat) && Number.isFinite(lon)) out.set(zip, [lat, lon]);
  }
  return out;
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/**
 * A normals date as "MM-DD". NOAA's 1991-2020 files give "MM/DD" (padded with
 * spaces); day of year and MMDD are read too. -9999 (missing, or too few
 * years: also where it never freezes) and anything else is none.
 */
export function monthDay(v) {
  const s = String(v ?? '').trim();
  let m, d;
  if (/^\d{1,2}[-/]\d{1,2}$/.test(s)) [m, d] = s.split(/[-/]/).map(Number);
  else if (/^\d{4}$/.test(s) && Number(s.slice(0, 2)) <= 12) { m = Number(s.slice(0, 2)); d = Number(s.slice(2)); }
  else if (/^\d{1,3}$/.test(s) && Number(s) >= 1 && Number(s) <= 366) {
    let n = Number(s); m = 1;
    while (m <= 12 && n > DAYS[m - 1]) { n -= DAYS[m - 1]; m++; }
    d = n;
  } else return null;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= DAYS[m - 1] + (m === 2 ? 1 : 0))) return null;
  return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/**
 * The NOAA columns used: last spring and first fall 32 °F freeze. P50: half
 * of years either side. P10: 1 year in 10 is riskier (a last spring freeze
 * later than the date; a first fall freeze earlier), as NOAA's sample file
 * shows (spring P10 04/04, P50 03/16, P90 02/26; fall P10 11/04, P50 11/19).
 */
export const FROST_COLUMNS = {
  spring: 'ANN-TMIN-PRBLST-T32FP50',
  springLate: 'ANN-TMIN-PRBLST-T32FP10',
  fall: 'ANN-TMIN-PRBFST-T32FP50',
  fallEarly: 'ANN-TMIN-PRBFST-T32FP10',
};
/** How often a year has a freeze at all (percent), NOAA's ANN-TMIN-PRBOCC-LSTH032. */
export const CHANCE_COLUMN = 'ANN-TMIN-PRBOCC-LSTH032';
/** Below this, freezes are too rare for dates to mean much (they're shown as rare instead). */
export const DATES_FROM = 50;
/**
 * Stations with frost records, from NOAA normals rows (STATION, NAME,
 * LATITUDE, LONGITUDE, and the columns above). `chance`: percent of years
 * with a freeze. Dates where freezes come at least half of years; else none.
 */
export function frostStations(rows) {
  const out = [];
  for (const r of rows) {
    const lat = Number(r.LATITUDE), lon = Number(r.LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const dates = Object.fromEntries(Object.entries(FROST_COLUMNS).map(([k, col]) => [k, monthDay(r[col])]));
    const complete = Object.values(dates).every(Boolean);
    const chanceText = String(r[CHANCE_COLUMN] ?? '').trim();
    const rawChance = chanceText ? Number(chanceText) : NaN; // (blank: the station has no temperature records)
    const chance = Number.isFinite(rawChance) && rawChance >= 0 && rawChance <= 100 ? Math.round(rawChance) : complete ? 100 : null;
    if (chance == null) continue; // no frost records
    const base = { id: r.STATION, name: stationName(r.NAME ?? r.STATION), lat, lon, chance };
    if (chance >= DATES_FROM) {
      if (!complete) continue; // freezes most years, but no dates: not useful
      out.push({ ...base, ...dates });
    } else out.push(base);
  }
  return out;
}
/** "ARKADELPHIA 2 N, AR US" → "Arkadelphia 2 N, AR" */
export function stationName(raw) {
  // (The country code after the state goes: US, RQ for Puerto Rico, VQ, GQ…)
  const s = String(raw).trim().replace(/(,\s*[A-Z]{2})\s+[A-Z]{2}$/, '$1').replace(/\s+US$/, '');
  const [place, state] = s.split(/,\s*/);
  const nice = place.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(\d*(?:\.\d+)?)(n|s|e|w|ne|nw|se|sw|nne|nnw|sse|ssw|ene|ese|wnw|wsw)\b/gi, (_, d, x) => d + x.toUpperCase());
  return state ? `${nice}, ${state}` : nice;
}

export function miles(a, b) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Nearest station (within MAX_MILES) for a point: a 1° grid keeps it quick. */
export function nearestFinder(stations) {
  const grid = new Map();
  const key = (lat, lon) => `${Math.floor(lat)},${Math.floor(lon)}`;
  for (const s of stations) { const k = key(s.lat, s.lon); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
  return (p) => {
    let best = null, bestMi = Infinity;
    const [la, lo] = [Math.floor(p[0]), Math.floor(p[1])];
    // (A degree of longitude shrinks toward the poles: look as many cells across as 50 miles needs.)
    const span = Math.ceil(MAX_MILES / (69 * Math.max(0.2, Math.cos((Math.abs(p[0]) + 1) * Math.PI / 180))));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -span; dx <= span; dx++) {
      for (const s of grid.get(`${la + dy},${lo + dx}`) ?? []) {
        const d = miles(p, [s.lat, s.lon]);
        if (d < bestMi) { bestMi = d; best = s; }
      }
    }
    return best && bestMi <= MAX_MILES ? { station: best, miles: Math.round(bestMi) } : null;
  };
}

/** The files: one per ZIP prefix, as src/climate.ts reads them. */
export function buildFiles(zones, centers, stations, accessed) {
  const nearest = nearestFinder(stations);
  const files = new Map();
  for (const [zip, zone] of [...zones].sort()) {
    const prefix = zip.slice(0, 3);
    if (!files.has(prefix)) files.set(prefix, { v: 1, accessed, zips: {}, stations: [], index: new Map() });
    const f = files.get(prefix);
    const c = centers.get(zip);
    const near = c ? nearest(c) : null;
    let si = -1;
    if (near) {
      const s = near.station;
      if (!f.index.has(s.id)) {
        f.index.set(s.id, f.stations.length);
        const { id: _i, lat: _a, lon: _o, ...shown } = s;
        f.stations.push(shown);
      }
      si = f.index.get(s.id);
    }
    f.zips[zip] = [zone, si, near ? near.miles : 0];
  }
  for (const f of files.values()) delete f.index;
  return files;
}
