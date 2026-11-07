import { drawnOutline, pointInShape, shapeArea, shapeCenter } from './geometry';
import type { Plant } from './plants';
import type { Shape, ShapeFilter, SunInfo } from './types';
import { alreadyThere, shownWith } from './status';
import { sameSaid } from './names';
import { state } from './state';

// Observed sun on shade areas, and the check of plants against it.
// Thresholds follow common nursery usage: full sun = 6+ hours of direct
// sun, part sun/shade = 3–6, shade = under 3. Observations are the user's
// (normally summer); the app does not model the sun's path.

export type SunLevel = 'Full' | 'Part' | 'Shade';
const RANK: Record<SunLevel, number> = { Full: 0, Part: 1, Shade: 2 };
/** Hot afternoon sun window used for the afternoon check. */
export const AFTERNOON: [number, number] = [13 * 60, 18 * 60];
export const DAY_START = 5 * 60;
export const DAY_END = 21 * 60;

export function newSunInfo(today = new Date()): SunInfo {
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return { mode: 'times', periods: [[9 * 60, 13 * 60]], hours: 4, dappled: false, observedOn: iso };
}

/** Total direct sun in hours (overlapping periods count once). */
export function sunHours(info: SunInfo): number {
  if (info.mode === 'hours') return info.hours;
  return mergedMinutes(info.periods) / 60;
}
function mergedMinutes(periods: [number, number][], clip?: [number, number]): number {
  const ps = periods
    .map(([a, b]) => (clip ? [Math.max(a, clip[0]), Math.min(b, clip[1])] : [a, b]))
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);
  let total = 0, end = -Infinity;
  for (const [a, b] of ps) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return total;
}
/** Hours of sun between 1 and 6 pm; null when only a total is known. */
export function afternoonHours(info: SunInfo): number | null {
  return info.mode === 'times' ? mergedMinutes(info.periods, AFTERNOON) / 60 : null;
}
export function sunLevel(info: SunInfo): SunLevel {
  const h = sunHours(info);
  const level: SunLevel = h >= 6 ? 'Full' : h >= 3 ? 'Part' : 'Shade';
  // Filtered light all day reads as part shade at best.
  return info.dappled && level === 'Full' ? 'Part' : level;
}
// ---- How a sun area is drawn ----
// Jason, Nov 4 (his answers to the sun-areas page, "1) ramp plus hatch. 2) no, keep the separation 3) no"): a sun area
// with hours recorded is washed from warm to cool by its hours, ground with nothing recorded stays plain, and inside a
// bed the parts with no sun recorded are faintly hatched (on the screen only). Until then a sun area was a slate wash,
// darker for less sun, so a full-sun area looked darker than ground with nothing recorded.

/** A wash: a fill color and its opacity. */
export interface Wash { color: string; opacity: number }
/**
 * The ramp's three fixed points (the page's colors table): a lemon gold at 8 h or more (the full gold waits for 8 h,
 * Jason's answer 2: 6 to 7 h stay pale), a light gray for 4 to 5 h, a slate blue at 2 h or less. Opacity stays near
 * 40% all along, so the sunny end doesn't start out faint.
 */
export const SUN_RAMP = {
  gold: { color: '#ffe614', opacity: 0.42 },
  mid: { color: '#c3c3c3', opacity: 0.38 },
  blue: { color: '#2f5597', opacity: 0.4 },
} as const;
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => Math.max(0, Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
const hex2 = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
/** sRGB hex to OKLab. */
function toLab(h: string): number[] {
  const [r, g, b] = hexRgb(h).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** OKLab to sRGB hex. */
function fromLab([L, A, B]: number[]): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return '#' + rgb.map((v) => hex2(fromLinear(v))).join('');
}
/** Between two colors, mixed in OKLab: from the gray to either end there's no green or orange on the way. */
function mixLab(a: string, b: string, t: number): string {
  const A = toLab(a), B = toLab(b);
  return fromLab(A.map((v, i) => v + (B[i] - v) * t));
}
const between = (a: Wash, b: Wash, t: number): Wash =>
  ({ color: mixLab(a.color, b.color, t), opacity: Math.round((a.opacity + (b.opacity - a.opacity) * t) * 100) / 100 });
/** The wash for this many hours of direct sun: slate blue at 2 h or less, gray at 4 to 5 h, gold at 8 h or more. */
export function washAt(hours: number): Wash {
  const { gold, mid, blue } = SUN_RAMP;
  if (hours <= 2) return { ...blue };
  if (hours < 4) return between(blue, mid, (hours - 2) / 2);
  if (hours <= 5) return { ...mid };
  if (hours < 8) return between(mid, gold, (hours - 5) / 3);
  return { ...gold };
}
/** A sun area with its sun recorded: drawn by its hours (its own color gives way to the ramp). */
export const sunRecorded = (s: Shape): boolean => s.role === 'shade' && !!s.sun;
/** The wash a sun area with hours recorded is drawn in (by its hours alone, as the "☀ 6.5 h" on it says). */
export function sunWash(info: SunInfo): Wash {
  return washAt(sunHours(info));
}
/** A wash as it looks over `ground` (hex): what the key shows. */
export function washOver(w: Wash, ground: string): string {
  const c = hexRgb(w.color), g = hexRgb(ground);
  return '#' + c.map((v, i) => hex2(v * w.opacity + g[i] * (1 - w.opacity))).join('');
}
/** The key's bar, from 8 h or more (left) to 2 h or less (right), at these hours spaced evenly along it. */
export const KEY_HOURS = [8, 7, 6, 5, 4.5, 4, 3, 2];
/** The key's bar as colors over `ground`, one per KEY_HOURS. */
export const keyStops = (ground: string): string[] => KEY_HOURS.map((h) => washOver(washAt(h), ground));
/** The hours at `t` along the key's bar (0, its left end, to 1), between the KEY_HOURS points. */
export function keyHoursAt(t: number): number {
  const x = Math.max(0, Math.min(1, t)) * (KEY_HOURS.length - 1), i = Math.min(KEY_HOURS.length - 2, Math.floor(x));
  return KEY_HOURS[i] + (KEY_HOURS[i + 1] - KEY_HOURS[i]) * (x - i);
}
/** The key's words: in Layers, under the Sun Exposure row, and in the printed legend (as on the page Jason answered). */
export const SUN_KEY = {
  most: '☀ 8 h or more',
  least: '2 h or less',
  plain: 'Plain: no sun recorded',
  hatched: 'Hatched in a bed: no sun recorded',
  printTitle: 'Sun Exposure: hours of direct sun',
  printMost: '8 h+',
  /** A sun area on the sheet with no hours recorded yet, drawn in its own color, beside the key. */
  printUnrecorded: 'Sun Exposure, no hours recorded',
} as const;
/**
 * The hatch over the parts of beds with no sun recorded: #44403c lines at 40%, every 7 px at 45°, the same at any zoom.
 * (The page's table says 1.2 px lines, but its pictures, which Jason answered, drew them on the edge of the pattern's
 * tile, which shows half of each: 0.6 px. Its faintness is what was asked for ("a fainter hatch", 40% from 50%), so the
 * lines are 0.6 px, centered.)
 */
export const SUN_HATCH = { color: '#44403c', opacity: 0.4, width: 0.6, gap: 7, angle: 45 } as const;
/**
 * What's hatched: the beds drawn (not gone ones), less every sun area with hours recorded (shown or not: one hidden
 * by a phase still records the sun there, so the hatch mustn't say "none"). None while the Sun Exposure layer is
 * hidden (the hatch is a statement about the sun data), nor in a plan with no sun recorded anywhere.
 */
export function hatchRegion(shapes: Shape[], filter: ShapeFilter): { beds: Shape[]; suns: Shape[] } | null {
  if (state.roleViews.shade?.hidden) return null;
  const suns = shapes.filter(sunRecorded);
  if (!suns.length) return null;
  const beds = shapes.filter((s) => s.role === 'bed' && s.status !== 'gone' && s.type !== 'line' && s.type !== 'text' && shownWith(s, filter));
  return beds.length ? { beds, suns } : null;
}
/** Whether the hatch covers this point (feet): in a bed of hatchRegion, and in no sun area with hours. */
export function hatchedAt(point: { x: number; y: number }, shapes: Shape[], filter: ShapeFilter): boolean {
  const r = hatchRegion(shapes, filter);
  return !!r && r.beds.some((b) => pointInShape(b, point)) && !r.suns.some((s) => pointInShape(s, point));
}
export function formatTime(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 || h === 24 ? 'am' : 'pm'}`;
}
export function formatHours(h: number): string {
  return (Math.round(h * 2) / 2).toString().replace(/\.0$/, '') + ' h';
}

/**
 * The shade area governing a point: the one with the least sun, of those it's in. One drawn wholly inside another
 * says more about where it is, so the one around it doesn't count there (Grace, Oct 30: a 6 h circle drawn inside her
 * 2 h back yard, where an oak is coming down, changed nothing for the plants in it). Areas that only overlap: the
 * least sun, where the shade of both falls.
 */
export function sunAt(point: { x: number; y: number }, shapes: Shape[]): { area: Shape; info: SunInfo } | null {
  const here = shapes.filter((s) => s.role === 'shade' && !!s.sun && pointInShape(s, point));
  const inner = here.filter((outer) => !here.some((s) => s !== outer && insideOf(s, outer)));
  let best: { area: Shape; info: SunInfo } | null = null;
  for (const s of inner) if (!best || sunHours(s.sun!) < sunHours(best.info)) best = { area: s, info: s.sun! };
  return best;
}
/** Whether `a` lies wholly inside `b` (every point of its outline), and is the smaller. */
function insideOf(a: Shape, b: Shape): boolean {
  const o = drawnOutline(a);
  return !!o && shapeArea(a) < shapeArea(b) && o.pts.every((p) => pointInShape(b, p));
}

export interface SunCheck { ok: boolean; message: string }
const SUN_WORDS: Record<string, string> = { Full: 'full sun', Part: 'part shade', Shade: 'shade' };
/**
 * Compare a plant's sun needs with the observed sun where it sits. Only
 * plants inside a shade area with sun recorded are checked: elsewhere the
 * app doesn't know the conditions.
 */
export function checkPlantSun(plantShape: Shape, plant: Plant | undefined, shapes: Shape[]): SunCheck | null {
  // (A tree already there: it makes the shade, and isn't being planted. Jason, Oct 30.)
  if (alreadyThere(plantShape)) return null;
  if (!plant || !plant.sun_most || !plant.sun_least) return null;
  const at = sunAt(shapeCenter(plantShape), shapes);
  if (!at) return null;
  const h = sunHours(at.info), level = sunLevel(at.info);
  const most = RANK[plant.sun_most as SunLevel], least = RANK[plant.sun_least as SunLevel];
  const name = plant.common;
  const where = `about ${formatHours(h)} of ${at.info.dappled ? 'filtered ' : ''}sun here`;
  // (In the words its details use: "part shade to shade", not "part sun to shade". Round 3, Grace.)
  const word = (v: string) => SUN_WORDS[v] ?? v.toLowerCase();
  const wants = plant.sun_most === plant.sun_least ? word(plant.sun_most) : `${word(plant.sun_most)} to ${word(plant.sun_least)}`;
  if (RANK[level] < most) return { ok: false, message: `${name} gets ${where}; it prefers ${wants}.` };
  if (RANK[level] > least) return { ok: false, message: `${name} gets only ${where}; it wants ${wants}.` };
  const pm = afternoonHours(at.info);
  if (plant.sun_most !== 'Full' && pm !== null && pm >= 2) {
    return { ok: false, message: `${name} gets ${formatHours(pm)} of hot afternoon sun here; it does best with afternoon shade.` };
  }
  return { ok: true, message: `${name} gets ${where}, which suits it (${wants}).` };
}

/**
 * Whether a plant's sun warning is dismissed: in its current wording, or as it was worded before round 3 ("part sun"
 * where it now says "part shade"), so a warning dismissed then stays dismissed.
 */
export function sunDismissedFor(check: SunCheck, s: Shape): boolean {
  // (Whatever the case of the plant's name in it: names show in Title Case since Nov 4, src/names.ts.)
  return !!s.sunDismissed && (sameSaid(s.sunDismissed, check.message) || sameSaid(s.sunDismissed, check.message.replace(/part shade/g, 'part sun')));
}
/** A warning to show: not ok, not dismissed in its current wording, and warnings switched on. */
export function sunWarningShown(check: SunCheck | null, s: Shape, warningsOn: boolean): boolean {
  return !!check && !check.ok && warningsOn && !sunDismissedFor(check, s);
}
