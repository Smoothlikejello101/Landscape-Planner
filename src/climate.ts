// Where the garden is: its USDA hardiness zone and typical frost dates, from
// a ZIP code. The tables are files on the app's own site (public/climate/,
// built by scripts/climate/build.mjs from official data), one per ZIP prefix:
// a lookup fetches the file for the first three digits, so the full ZIP isn't
// sent anywhere. A plan keeps what was looked up, so it works offline after.

/** Frost dates as month-day ("04-08"). */
export type MonthDay = string;
export interface FrostDates {
  /** Weather station the dates come from, and how far it is from the ZIP's center. */
  station: string;
  miles: number;
  /** Percent of years with a freeze (32 °F) at all. Under 50: no dates (frost is rare there). */
  chance: number;
  /** Frost can come in any month (NOAA: too cold to compute dates). */
  yearRound?: true;
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
  /** The ZIP has no mapped area (a PO box, or one building), so no frost dates could be placed. */
  noArea?: true;
}

/** The sources, as their terms ask them to be named. */
export const ZONE_SOURCE = 'USDA Plant Hardiness Zone Map (2023), PRISM Group, Oregon State University, https://prism.oregonstate.edu';
export const FROST_SOURCE = 'NOAA NCEI U.S. Climate Normals, 1991–2020';
/** When the tables shipped with this version were built from the sources (see docs/climate-data.md). */
export const CLIMATE_ACCESSED = '2026-10-17';
/** Short form, for beside a zone elsewhere in the app. */
export const ZONE_SOURCE_SHORT = 'USDA Plant Hardiness Zone Map 2023 (PRISM Group, Oregon State University, prism.oregonstate.edu)';
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
  if (o.noArea === true) out.noArea = true;
  const f = o.frost as Record<string, unknown> | null | undefined;
  const ok = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
  if (f && typeof f === 'object' && typeof f.station === 'string' && ok(f.miles, 500) && ok(f.chance, 100)) {
    const frost: FrostDates = { station: f.station.slice(0, 80), miles: Math.round(f.miles), chance: Math.round(f.chance) };
    if (f.yearRound === true) frost.yearRound = true;
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
  /** zip → [zone, station index (-1: none near enough; -2: the ZIP has no mapped area), miles to the station, county FIPS (5019: 05019) if it has one] */
  zips: Record<string, [string, number, number, number?]>;
  stations: { name: string; chance: number; yearRound?: true; spring?: MonthDay; springLate?: MonthDay; fall?: MonthDay; fallEarly?: MonthDay }[];
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
  const location = sanitizeLocation({ zip: z, zone, accessed: file.accessed, noArea: si === -2 || undefined, frost: st ? { ...st, station: st.name, miles } : undefined });
  return location ? { ok: true, location } : { ok: false, why: 'unknown' };
}

// ---------- Plants and zones ----------
// Zones on a half-zone scale: 7a is 7, 7b is 7.5. A plant's zone_min is the
// coldest half-zone it takes (a whole-zone rating "7" is 7: all of zone 7);
// its zone_max is the warmest half-zone it takes (a whole-zone "9" is 9.5:
// all of zone 9, through 9b).

/** A garden's zone on the half-zone scale ("8a" → 8, "8b" → 8.5), or NaN if it isn't a zone. */
export const halfZone = (zone: string) => (ZONE_RE.test(zone) ? parseInt(zone, 10) + (zone.endsWith('b') ? 0.5 : 0) : NaN);
export type ZoneFit = 'fits' | 'edge-cold' | 'edge-warm' | 'cold' | 'warm';
/**
 * Whether a plant is rated for the garden's zone:
 * - 'fits': inside its range with at least half a zone to spare;
 * - 'edge-cold' / 'edge-warm': the garden is the end half-zone of its range
 *   (a 7a garden and a plant rated from zone 7): rated for it, but worth a
 *   little care;
 * - 'cold': the garden's winters are colder than its range; 'warm': warmer
 *   (it may lack the winter chill or summer cool it needs);
 * - null if either is unknown.
 * Zone 1a and 13b are the ends of the map: nothing is colder or warmer, so
 * a range that reaches them has no edge there.
 */
export function zoneFit(p: { zone_min?: number; zone_max?: number }, loc: GardenLocation | null | undefined): ZoneFit | null {
  if (!loc) return null;
  const lo = typeof p.zone_min === 'number' ? p.zone_min : null, hi = typeof p.zone_max === 'number' ? p.zone_max : null;
  if (lo == null && hi == null) return null;
  const g = halfZone(loc.zone);
  if (Number.isNaN(g)) return null;
  const cold = lo != null && lo > 1 ? g - lo : Infinity, warm = hi != null && hi < 13.5 ? hi - g : Infinity;
  if (cold < 0) return 'cold';
  if (warm < 0) return 'warm';
  if (cold === 0) return 'edge-cold';
  if (warm === 0) return 'edge-warm';
  return 'fits';
}
/** Whether a fit counts as hardy there (inside its range: the edges count). */
export const hardyEnough = (fit: ZoneFit | null) => fit === 'fits' || fit === 'edge-cold' || fit === 'edge-warm';
/** A plant's coldest and warmest zones as people write them: 7 (all of zone 7) or 7b; 9 (through 9b) or 9a. */
const lowName = (z: number) => (z % 1 ? `${Math.floor(z)}b` : `${z}`);
const highName = (z: number) => (z % 1 ? `${Math.floor(z)}` : `${z}a`);
/** "zones 5–9", "zones 7b–9a", "zone 8", "zone 8a", "zone 6b and warmer" */
export function zoneRange(p: { zone_min?: number; zone_max?: number }): string | null {
  const lo = typeof p.zone_min === 'number' ? p.zone_min : null, hi = typeof p.zone_max === 'number' ? p.zone_max : null;
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null) {
    // One half-zone wide: "zone 8a", "zone 7b".
    if (lo === hi) return `zone ${Math.floor(lo)}${lo % 1 ? 'b' : 'a'}`;
    const a = lowName(lo), b = highName(hi);
    return a === b ? `zone ${a}` : `zones ${a}–${b}`;
  }
  return lo != null ? `zone ${lowName(lo)} and warmer` : `zone ${highName(hi as number)} and colder`;
}

// ---------- Showing ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "04-08" → "Apr 8" */
export function formatMonthDay(md: MonthDay): string {
  const [m, d] = md.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
