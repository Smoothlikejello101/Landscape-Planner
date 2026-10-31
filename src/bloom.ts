import { bedOf, isBed, isPlant } from './beds';
import type { Plant } from './plants';
import type { CircleShape, Shape } from './types';
import { lookOf } from './looks';
import { bloomWindow, showyFlowers } from './seasons';
import { localBloom } from './wild';

// When things bloom: month-by-month, per bed and for the whole plan, so gaps
// in color show up (task C6). Uses bloom months from the catalog and from
// the user's own plants. Gone plants don't count; planned ones do.

/**
 * When a plant blooms: where the garden is, from flowering records there (src/wild.ts), else the
 * catalog's (or the user's own) months. Null if unknown.
 */
export function bloomSpan(p: Plant | undefined): { start: number; end: number } | null {
  if (!p) return null;
  const local = localBloom(p);
  if (local) return { start: local.start, end: local.end };
  return p.bloom?.start ? { start: p.bloom.start, end: p.bloom.end || p.bloom.start } : null;
}
/** Months (1-12) a plant blooms in, wrapping the year end (Nov-Jan). Empty if unknown. */
export function bloomMonths(p: Plant | undefined): number[] {
  const b = bloomSpan(p);
  if (!b) return [];
  const start = b.start, end = b.end || b.start;
  const out: number[] = [];
  for (let m = start, i = 0; i < 12; i++, m = (m % 12) + 1) {
    out.push(m);
    if (m === end) break;
  }
  return out;
}

const COLOR_WORDS: [RegExp, string][] = [
  [/scarlet|red|maroon|crimson/, '#dc2626'], [/orange|coral/, '#f97316'], [/gold|yellow|butter/, '#eab308'],
  [/cream|ivory/, '#fde68a'], [/white|silver/, '#e7e5e4'], [/magenta|rose|pink|mauve/, '#ec4899'],
  [/lavender|lilac/, '#c4b5fd'], [/violet|purple/, '#9333ea'], [/blue/, '#3b82f6'], [/green|catkin/, '#84cc16'], [/brown/, '#92400e'],
];
/** A display color for a bloom description ("White-pink" -> white). Falls back to `fallback`. */
export function bloomColor(text: string | undefined, fallback: string): string {
  const t = (text || '').toLowerCase();
  for (const [re, hex] of COLOR_WORDS) if (re.test(t)) return hex;
  return fallback;
}

/**
 * A row: a plant name, how many, the months it blooms, its color. `bySeason`: months from the season words its sources
 * give (spring: Mar–May), none giving months, as the month slider draws it (src/seasons.ts); shown faint.
 */
export interface BloomRow {
  label: string; count: number; months: number[]; color: string; colorText: string; bySeason?: string[];
  /** Months only by its season, drawn faint and not counted (Jason, Oct 31): all of them, or those its list doesn't name. */
  faint?: number[];
  /** Flowers its sources call insignificant: listed, not counted. */
  notShowy?: boolean;
}
/**
 * A plant with no bloom months, and why: one of the person's own plants (they can add them), a catalog plant whose
 * sources give a season only (`season`: "mid summer") or nothing, a fern (it doesn't flower), or a circle not
 * linked to any plant.
 */
export type NoBloomWhy = 'mine' | 'season' | 'catalog' | 'fern' | 'unlinked';
export interface NoBloomRow { label: string; count: number; why: NoBloomWhy; plantId?: string; season?: string[] }
/** `perMonth`: plants in bloom by their months, as the month bar counts them; `perMonthAround`: more by season only. */
export interface BloomSummary { rows: BloomRow[]; missing: NoBloomRow[]; noData: number; perMonth: number[]; perMonthAround: number[] }

const MY_PREFIX = 'u-'; // (src/my-plants.ts: imported from there, it would bring the whole library in)
function noBloomWhy(data: Plant | undefined): NoBloomWhy {
  if (!data) return 'unlinked';
  if (data.id.startsWith(MY_PREFIX)) return 'mine';
  if (data.form === 'Fern') return 'fern';
  return data.bloom_season?.length ? 'season' : 'catalog';
}
export interface BloomGroup extends BloomSummary { bed: string }

/** One row per plant name (gone plants left out), sorted by when they start blooming. */
export function bloomSummary(plants: Shape[], plantsById: Record<string, Plant | undefined>): BloomSummary {
  const byName = new Map<string, BloomRow>();
  const missing = new Map<string, NoBloomRow>();
  for (const p of plants) {
    if (!isPlant(p) || p.status === 'gone') continue;
    const label = p.label.trim() || 'Unlabeled plant';
    const data = p.plantId ? plantsById[p.plantId] : undefined;
    // (Its months as the month slider has them (src/seasons.ts bloomWindow): by records near the garden, its listed
    // months, or its season, which beats the earlier list's unverified months; those by season alone faint. Dana,
    // Marcus, Lena, Oct 30: the calendar left season-only plants out. Jason, Oct 31: a season beats the list.)
    const w = data ? bloomWindow(data, { bloom: localBloom(data) }) : null;
    const months = w?.months ?? [];
    const faint = w ? months.filter((m) => !w.sure.includes(m)) : [];
    const bySeason = faint.length ? data!.bloom_season : undefined;
    if (!months.length) {
      // (One row per name and plant: two circles labeled alike but linked to different plants are two rows.)
      const key = label + '\n' + (p.plantId ?? '');
      const why = noBloomWhy(data);
      const row = missing.get(key) ?? { label, count: 0, why, ...(data ? { plantId: data.id } : {}), ...(why === 'season' ? { season: data!.bloom_season } : {}) };
      row.count++;
      missing.set(key, row);
      continue;
    }
    // (Its flowers' colors as its sources say, else the earlier list's words; "not showy" isn't a color.)
    const colorText = data?.flower_color?.filter((c) => c !== 'insignificant').join(', ') || data?.bloom?.color || '';
    // (In the color its picture's flowers are drawn on the plan, a color chosen for this plant included: the first
    // color word found, "purple, red" was red, "pink, white" white. Round 3: Marcus, Ruth.)
    const c = p as CircleShape;
    const drawn = data ? lookOf(data, p.color, !!c.colorSet, c.flowerColor).pal.fl : undefined;
    const row = byName.get(label) ?? { label, count: 0, months, color: drawn ?? bloomColor(colorText, p.color), colorText,
      ...(bySeason ? { bySeason, faint } : {}), ...(showyFlowers(data) ? {} : { notShowy: true }) };
    row.count++;
    byName.set(label, row);
  }
  const rows = [...byName.values()].sort((a, b) => a.months[0] - b.months[0] || a.label.localeCompare(b.label));
  // (Plants in bloom, as the month slider counts them: "4 of 18 in bloom", not kinds; by its months, apart from those
  // by season alone; insignificant flowers in neither.)
  const counted = rows.filter((r) => !r.notShowy);
  const perMonth = Array.from({ length: 12 }, (_, i) => counted.filter((r) => r.months.includes(i + 1) && !r.faint?.includes(i + 1)).reduce((n, r) => n + r.count, 0));
  const perMonthAround = Array.from({ length: 12 }, (_, i) => counted.filter((r) => r.faint?.includes(i + 1)).reduce((n, r) => n + r.count, 0));
  // The person's own first (they can add months), then by name.
  const order: NoBloomWhy[] = ['mine', 'unlinked', 'season', 'catalog', 'fern'];
  const none = [...missing.values()].sort((a, b) => order.indexOf(a.why) - order.indexOf(b.why) || a.label.localeCompare(b.label));
  return { rows, missing: none, noData: none.length, perMonth, perMonthAround };
}

/** The same, grouped by the bed each plant sits in (beds by name, then plants in no bed). */
export function bloomByBed(shapes: Shape[], plantsById: Record<string, Plant | undefined>): BloomGroup[] {
  const plants = shapes.filter((s) => isPlant(s) && s.status !== 'gone');
  const beds = shapes.filter((s) => isBed(s) && s.status !== 'gone');
  let unnamed = 0;
  const groups: BloomGroup[] = beds
    .map((b) => ({ b, name: b.label.trim() || `Unnamed bed ${++unnamed}` }))
    .sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }))
    .map(({ b, name }) => ({ bed: name, ...bloomSummary(plants.filter((p) => bedOf(p, shapes) === b), plantsById) }))
    .filter((g) => g.rows.length || g.missing.length);
  const loose = plants.filter((p) => { const b = bedOf(p, shapes); return !b || b.status === 'gone'; });
  if (loose.length) groups.push({ bed: 'Not in a bed', ...bloomSummary(loose, plantsById) });
  return groups;
}

export const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const next = (m: number) => (m % 12) + 1;
/**
 * The plan's blooming season, as months in order (1-12, possibly running
 * through the new year): from its first bloom to its last. Found as everything
 * outside the longest stretch with nothing in bloom (that's the off-season,
 * wherever the garden is), so it fits March-October gardens and winter
 * bloomers alike, without assuming a climate. Empty when nothing blooms.
 */
export function bloomSeason(perMonth: number[]): number[] {
  const blooming = (m: number) => perMonth[m - 1] > 0;
  if (![...Array(12).keys()].some((i) => blooming(i + 1))) return [];
  if ([...Array(12).keys()].every((i) => blooming(i + 1))) return [...Array(12).keys()].map((i) => i + 1);
  // The longest run of empty months (wrapping around the year); ties go to the one nearer midwinter.
  let best: { start: number; len: number; winter: number } | null = null;
  for (let start = 1; start <= 12; start++) {
    if (blooming(start) || !blooming(start === 1 ? 12 : start - 1)) continue; // runs start after a blooming month
    let len = 0, winter = 0;
    for (let m = start; !blooming(m) && len < 12; m = next(m)) { len++; if (m === 12 || m === 1 || m === 2) winter++; }
    if (!best || len > best.len || (len === best.len && winter > best.winter)) best = { start, len, winter };
  }
  // The season starts the month after the off-season ends.
  const out: number[] = [];
  let m = ((best!.start - 1 + best!.len) % 12) + 1;
  for (let i = 0; i < 12 - best!.len; i++, m = next(m)) out.push(m);
  return out;
}
/** "Mar", "Mar-Oct", "Dec-Feb". */
export function monthRun(a: number, b: number): string { return a === b ? MONTHS[a - 1] : `${MONTHS[a - 1]}-${MONTHS[b - 1]}`; }
/**
 * Months of `season` (in its order) with nothing in bloom, as runs:
 * "Jul-Aug, Oct". '' when there are none.
 */
export function bloomGaps(perMonth: number[], season: number[]): string {
  const runs: [number, number][] = [];
  let prev = -1;
  for (const m of season) {
    if (perMonth[m - 1] > 0) { prev = -1; continue; }
    const last = runs.at(-1);
    if (last && prev !== -1) last[1] = m; else runs.push([m, m]);
    prev = m;
  }
  return runs.map(([a, b]) => monthRun(a, b)).join(', ');
}
