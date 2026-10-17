// Where the garden is: its USDA hardiness zone and typical frost dates, from
// a ZIP code. The tables ship with the app (public/climate/, built by
// scripts/climate/build.mjs from official data), so a ZIP never leaves the
// device. A plan keeps what was looked up, so it works offline after.

/** Frost dates as month-day ("04-08"). */
export type MonthDay = string;
export interface FrostDates {
  /** Weather station the dates come from, and how far it is from the ZIP's center. */
  station: string;
  miles: number;
  /** Percent of years with a freeze (32 °F) at all. Under 50: no dates (frost is rare there). */
  chance: number;
  /** Last spring frost: half of years later than this date; 1 year in 10 later than `springLate`. */
  spring?: MonthDay;
  springLate?: MonthDay;
  /** First fall frost: half of years earlier than this date; 1 year in 10 earlier than `fallEarly`. */
  fall?: MonthDay;
  fallEarly?: MonthDay;
}
export interface GardenLocation {
  zip: string;
  /** USDA zone with its half ("8a"). */
  zone: string;
  frost?: FrostDates;
  /** When the source data was downloaded (YYYY-MM-DD), as the zone data's terms ask to be shown. */
  accessed?: string;
}

/** The sources, as their terms ask them to be named. */
export const ZONE_SOURCE = 'USDA Plant Hardiness Zone Map (2023), PRISM Group, Oregon State University, https://prism.oregonstate.edu';
export const FROST_SOURCE = 'NOAA NCEI U.S. Climate Normals, 1991–2020';
/** Filled in by the data build: when the tables were downloaded. */
export interface ClimateMeta { zonesAccessed: string; frostAccessed: string }

// ---------- Checking ----------
const MD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isMonthDay = (v: unknown): v is MonthDay => typeof v === 'string' && MD.test(v);
export const ZONE_RE = /^(1[0-3]|[1-9])[ab]$/;
export function sanitizeLocation(raw: unknown): GardenLocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.zip !== 'string' || !/^\d{5}$/.test(o.zip) || typeof o.zone !== 'string' || !ZONE_RE.test(o.zone)) return null;
  const out: GardenLocation = { zip: o.zip, zone: o.zone };
  if (typeof o.accessed === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.accessed)) out.accessed = o.accessed;
  const f = o.frost as Record<string, unknown> | null | undefined;
  const ok = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
  if (f && typeof f === 'object' && typeof f.station === 'string' && ok(f.miles, 500) && ok(f.chance, 100)) {
    const frost: FrostDates = { station: f.station.slice(0, 80), miles: Math.round(f.miles), chance: Math.round(f.chance) };
    // Dates all together, or none.
    if (isMonthDay(f.spring) && isMonthDay(f.springLate) && isMonthDay(f.fall) && isMonthDay(f.fallEarly)) {
      Object.assign(frost, { spring: f.spring, springLate: f.springLate, fall: f.fall, fallEarly: f.fallEarly });
    }
    out.frost = frost;
  }
  return out;
}

// ---------- Looking up ----------
/** One file per ZIP prefix (first three digits). */
export interface ClimateFile {
  v: 1;
  /** When the source data was downloaded. */
  accessed?: string;
  /** zip → [zone, station index or -1, miles to the station] */
  zips: Record<string, [string, number, number]>;
  stations: { name: string; chance: number; spring?: MonthDay; springLate?: MonthDay; fall?: MonthDay; fallEarly?: MonthDay }[];
}
export type LookupResult = { ok: true; location: GardenLocation } | { ok: false; why: 'format' | 'unknown' | 'offline' };
/** Look a ZIP up in the tables (fetched on demand: they aren't part of the offline copy). */
export async function lookUpZip(zip: string, fetcher: typeof fetch = fetch): Promise<LookupResult> {
  const z = zip.trim();
  if (!/^\d{5}$/.test(z)) return { ok: false, why: 'format' };
  let file: ClimateFile;
  try {
    const res = await fetcher(`climate/${z.slice(0, 3)}.json`);
    if (res.status === 404) return { ok: false, why: 'unknown' };
    if (!res.ok) return { ok: false, why: 'offline' };
    file = await res.json() as ClimateFile;
  } catch {
    return { ok: false, why: 'offline' };
  }
  const row = file?.zips?.[z];
  if (!row) return { ok: false, why: 'unknown' };
  const [zone, si, miles] = row;
  const st = si >= 0 ? file.stations?.[si] : undefined;
  const location = sanitizeLocation({ zip: z, zone, accessed: file.accessed, frost: st ? { ...st, station: st.name, miles } : undefined });
  return location ? { ok: true, location } : { ok: false, why: 'unknown' };
}

// ---------- Plants and zones ----------
/** The whole-number zone ("8a" → 8). */
export const zoneNumber = (zone: string) => parseInt(zone, 10);
/**
 * Whether a plant is rated for the garden's zone: 'fits', 'cold' (the
 * garden's winters are colder than it's rated for), 'warm' (warmer: it may
 * lack the winter chill or summer cool it needs), or null if either is unknown.
 */
export function zoneFit(p: { zone_min?: number; zone_max?: number }, loc: GardenLocation | null | undefined): 'fits' | 'cold' | 'warm' | null {
  if (!loc) return null;
  const lo = typeof p.zone_min === 'number' ? p.zone_min : null, hi = typeof p.zone_max === 'number' ? p.zone_max : null;
  if (lo == null && hi == null) return null;
  const z = zoneNumber(loc.zone);
  if (lo != null && z < lo) return 'cold';
  if (hi != null && z > hi) return 'warm';
  return 'fits';
}
/** "zones 5–9" */
export function zoneRange(p: { zone_min?: number; zone_max?: number }): string | null {
  const lo = typeof p.zone_min === 'number' ? p.zone_min : null, hi = typeof p.zone_max === 'number' ? p.zone_max : null;
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null) return lo === hi ? `zone ${lo}` : `zones ${lo}–${hi}`;
  return lo != null ? `zone ${lo} and warmer` : `zone ${hi} and colder`;
}

// ---------- Showing ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "04-08" → "Apr 8" */
export function formatMonthDay(md: MonthDay): string {
  const [m, d] = md.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
