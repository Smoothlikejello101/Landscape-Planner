import { bedOf, isBed, isPlant } from './beds';
import type { Plant } from './plants';
import type { Shape } from './types';

// When things bloom: month-by-month, per bed and for the whole plan, so gaps
// in color show up (task C6). Uses bloom months from the catalog and from
// the user's own plants. Gone plants don't count; planned ones do.

/** Months (1-12) a plant blooms in, wrapping the year end (Nov-Jan). Empty if unknown. */
export function bloomMonths(p: Plant | undefined): number[] {
  const b = p?.bloom;
  if (!b || !b.start) return [];
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

export interface BloomRow { label: string; count: number; months: number[]; color: string; colorText: string }
export interface BloomSummary { rows: BloomRow[]; noData: number; perMonth: number[] }
export interface BloomGroup extends BloomSummary { bed: string }

/** One row per plant name (gone plants left out), sorted by when they start blooming. */
export function bloomSummary(plants: Shape[], plantsById: Record<string, Plant | undefined>): BloomSummary {
  const byName = new Map<string, BloomRow>();
  let noData = 0;
  const unknown = new Set<string>();
  for (const p of plants) {
    if (!isPlant(p) || p.status === 'gone') continue;
    const label = p.label.trim() || 'Unlabeled plant';
    const data = p.plantId ? plantsById[p.plantId] : undefined;
    const months = bloomMonths(data);
    if (!months.length) { if (!unknown.has(label)) { unknown.add(label); noData++; } continue; }
    const row = byName.get(label) ?? { label, count: 0, months, color: bloomColor(data?.bloom?.color, p.color), colorText: data?.bloom?.color ?? '' };
    row.count++;
    byName.set(label, row);
  }
  const rows = [...byName.values()].sort((a, b) => a.months[0] - b.months[0] || a.label.localeCompare(b.label));
  const perMonth = Array.from({ length: 12 }, (_, i) => rows.filter((r) => r.months.includes(i + 1)).length);
  return { rows, noData, perMonth };
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
    .filter((g) => g.rows.length || g.noData);
  const loose = plants.filter((p) => { const b = bedOf(p, shapes); return !b || b.status === 'gone'; });
  if (loose.length) groups.push({ bed: 'Not in a bed', ...bloomSummary(loose, plantsById) });
  return groups;
}

export const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/**
 * Months in the growing season (April to October by default) with nothing
 * in bloom, as runs: "Jul-Aug, Oct". '' when there are none.
 */
export function bloomGaps(perMonth: number[], season: [number, number] = [4, 10]): string {
  const runs: [number, number][] = [];
  for (let m = season[0]; m <= season[1]; m++) {
    if (perMonth[m - 1] > 0) continue;
    const last = runs.at(-1);
    if (last && last[1] === m - 1) last[1] = m; else runs.push([m, m]);
  }
  return runs.map(([a, b]) => (a === b ? MONTHS[a - 1] : `${MONTHS[a - 1]}-${MONTHS[b - 1]}`)).join(', ');
}
