import { drawnOutline, pointInShape, shapeArea, shapeCenter } from './geometry';
import type { Plant } from './plants';
import type { Shape, SunInfo } from './types';
import { alreadyThere } from './status';

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
/** Overlay strength: darker for less sun. */
export function shadeOpacity(info: SunInfo): number {
  const h = Math.min(8, sunHours(info));
  return Math.round((0.12 + 0.43 * (1 - h / 8)) * 100) / 100;
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
  return !!s.sunDismissed && (s.sunDismissed === check.message || s.sunDismissed === check.message.replace(/part shade/g, 'part sun'));
}
/** A warning to show: not ok, not dismissed in its current wording, and warnings switched on. */
export function sunWarningShown(check: SunCheck | null, s: Shape, warningsOn: boolean): boolean {
  return !!check && !check.ok && warningsOn && !sunDismissedFor(check, s);
}
