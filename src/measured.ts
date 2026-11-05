import { MAX_POINTS } from './constants';
import type { MeasuredSide, Point, Shape } from './types';

// Sides typed as numbers (Nov 4, for Rescale with the photo, a later change: Jason's answer 3, "Remember typed numbers
// and untick them by default"). Kept on the shape (src/types.ts MeasuredSide), for sides typed from Nov 4 on: nothing
// is worked out for older shapes. Pure: no state, no page.
//
// The rule (docs/storage.md, "Sides typed as numbers"): a remembered side counts only while that side is still the
// length typed, within MEASURED_TOL. So:
// - moving or turning the whole shape keeps it (no side changes length);
// - a step that changes its length forgets it, for good (a resize, a stretch, a corner dragged, typing another
//   Width): src/history.ts pushHistory, as each step is recorded, and measuredSides, whatever is stored;
// - adding a point forgets the side it splits, and the sides after it are renumbered; taking one out forgets the two
//   sides that met there, now one, and renumbers the rest (afterPointInserted, afterPointRemoved). So a number never
//   moves onto another side.
// A version that doesn't know the field drops it whole when it saves or syncs the shape (it reads shapes into new
// objects of the fields it knows), so it can never leave one on a side it reshaped.

/** How far a side may be from the length typed and still count as it (feet). */
export const MEASURED_TOL = 0.05;
/** The longest side kept (feet): the edit pane's largest size. */
export const MAX_MEASURED_FT = 5000;

/** The shapes that keep sides typed: rectangles, outlines and lines. */
export type Sided = Extract<Shape, { type: 'rect' | 'poly' | 'line' }>;
export const keepsSides = (s: Shape): s is Sided => s.type === 'rect' || s.type === 'poly' || s.type === 'line';
/** A rectangle's sides a typed Width sets (top and bottom), and a typed Length (right and left). */
export const BOX_SIDES = { width: [0, 2], height: [1, 3] } as const;

/** How many sides a shape has: a rectangle 4, an outline one a point, a line one fewer. 0: none it keeps. */
export function sideCount(s: { type: unknown; points?: unknown }): number {
  if (s.type === 'rect') return 4;
  const n = Array.isArray(s.points) ? s.points.length : 0;
  if (s.type === 'poly') return n >= 3 ? n : 0;
  if (s.type === 'line') return n >= 2 ? n - 1 : 0;
  return 0;
}
/** Side `i`'s length (feet): where the shape is, and how it's turned, don't change it. */
export function sideLength(s: Sided, i: number): number {
  if (s.type === 'rect') return i % 2 === 0 ? s.width : s.height;
  const p = s.points, a = p[i], b = p[(i + 1) % p.length];
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
/** Whether a remembered side is still true: a side the shape has, the length typed. */
const holds = (s: Sided, m: MeasuredSide) => m.side < sideCount(s) && Math.abs(sideLength(s, m.side) - m.ft) <= MEASURED_TOL + 1e-9;
const listOf = (s: Shape): MeasuredSide[] | undefined => (s as { measured?: MeasuredSide[] }).measured;
/** Its remembered sides as `list`, in side order (none: the field taken off). */
function setMeasured(s: Shape, list: MeasuredSide[]) {
  const t = s as { measured?: MeasuredSide[] };
  if (list.length) t.measured = [...list].sort((a, b) => a.side - b.side); else delete t.measured;
}

/**
 * The sides typed as numbers that are still that long: what Rescale (a later change) keeps as measured, and lists
 * unticked. In side order; a rectangle's typed Width is both its top and bottom (0 and 2).
 */
export function measuredSides(s: Shape): MeasuredSide[] {
  const list = listOf(s);
  if (!list?.length || !keepsSides(s)) return [];
  return list.filter((m) => holds(s, m)).map((m) => ({ side: m.side, ft: m.ft })).sort((a, b) => a.side - b.side);
}
/** The sides no longer the length typed, forgotten (as each step is recorded: src/history.ts). Whether any was. */
export function forgetChangedSides(s: Shape): boolean {
  const list = listOf(s);
  if (list === undefined) return false;
  const kept = keepsSides(s) ? list.filter((m) => holds(s, m)) : [];
  if (kept.length === list.length && list.length) return false;
  setMeasured(s, kept);
  return true;
}
/**
 * Sides `sides` typed as `ft` (a rectangle's Width or Length: BOX_SIDES); null, typed as something that isn't a
 * length (out of range, or nothing): those sides forgotten. The others as they were.
 */
export function setTypedSides(s: Shape, sides: readonly number[], ft: number | null) {
  if (!keepsSides(s)) return;
  const rest = (listOf(s) ?? []).filter((m) => !sides.includes(m.side));
  setMeasured(s, ft == null ? rest : [...rest, ...sides.map((side) => ({ side, ft }))]);
}
/** A point added on side `after` (src/draw.ts insertVertex): that side, split in two, forgotten; those after it, one up. */
export function afterPointInserted(s: Shape, after: number) {
  const list = listOf(s);
  if (!list) return;
  setMeasured(s, list.filter((m) => m.side !== after).map((m) => (m.side > after ? { ...m, side: m.side + 1 } : m)));
}
/**
 * Point `i` taken out of an outline (`closed`) or a line of `n` points (src/draw.ts deleteSelectedVertex): the two
 * sides that met there, joined into one, forgotten (one, at a line's end); those after it, one down.
 */
export function afterPointRemoved(s: Shape, i: number, n: number, closed: boolean) {
  const list = listOf(s);
  if (!list) return;
  const into = closed ? (i - 1 + n) % n : i - 1, out = closed || i < n - 1 ? i : -1;
  setMeasured(s, list.filter((m) => m.side !== into && m.side !== out).map((m) => (m.side > i ? { ...m, side: m.side - 1 } : m)));
}
/**
 * A shape just made from the taps `taps`, the sides `typed` of them typed (src/draw.ts finishDraw): those kept as
 * typed, where they're still that long (one that closed an outline at its first point may not be). An outline's or a
 * line's side i is from tap i to the next, as it's made; a rectangle's typed side is its Width or its Length, by the way
 * it runs, and both of that pair.
 */
export function markTypedSides(s: Shape, taps: Point[], typed: { from: number; ft: number }[] | undefined) {
  if (!typed?.length || !keepsSides(s)) return;
  const marks = new Map<number, MeasuredSide>();
  for (const t of typed) {
    if (s.type === 'rect') {
      const a = taps[t.from], b = taps[(t.from + 1) % taps.length];
      if (!a || !b) continue;
      const off = Math.atan2(b.y - a.y, b.x - a.x) - ((s.rotation || 0) * Math.PI) / 180;
      for (const side of BOX_SIDES[Math.abs(Math.cos(off)) >= Math.abs(Math.sin(off)) ? 'width' : 'height']) marks.set(side, { side, ft: t.ft });
    } else marks.set(t.from, { side: t.from, ft: t.ft });
  }
  setMeasured(s, [...marks.values()].filter((m) => holds(s, m)));
}
/**
 * Sides typed, as stored, synced or pasted (`sides`: how many the shape has): each a side it has, once (the first
 * kept), with a length in feet; anything else dropped, the rest kept. Undefined: none (not a list, or nothing in it
 * that could be kept). Kept in the order it came. Whether each still holds is measuredSides', not this.
 */
export function sanitizeMeasured(raw: unknown, sides: number): MeasuredSide[] | undefined {
  if (!Array.isArray(raw) || sides <= 0) return undefined;
  const seen = new Set<number>(), out: MeasuredSide[] = [];
  for (const m of raw.slice(0, MAX_POINTS)) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    const { side, ft } = m as Record<string, unknown>;
    if (typeof side !== 'number' || !Number.isInteger(side) || side < 0 || side >= sides || seen.has(side)) continue;
    if (typeof ft !== 'number' || !Number.isFinite(ft) || ft <= 0 || ft > MAX_MEASURED_FT) continue;
    seen.add(side);
    out.push({ side, ft });
  }
  return out.length ? out : undefined;
}
