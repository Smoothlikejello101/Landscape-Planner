// Fix from the problem (Jason's UI review, Nov 2, marked Next): "Smaller forms of the same plant first (Blue Jean Baby
// for Russian sage); 'Nudge apart'; Swap opened already filtered by the rule that failed. No 'plants like this'
// suggestions." Everything here comes from the plan and the catalog's sourced facts, never a guess at what's similar:
// the app isn't placed to recommend a plant for what it doesn't know of the gardener's aims (Jason, Nov 2).
//
// This file: the working out (tested in tests/fix-problem.test.ts). Its buttons: src/ui/fix-problem.ts.

import { bedOf } from './beds';
import { apartAt, crowdingOf, type CrowdOptions } from './crowding';
import { drawnOutline, pointInShape, shapeBBox } from './geometry';
import { plantSpread } from './my-plants';
import { earlierListOnly, PLANT_META, speciesOf, type Plant } from './plants';
import { isLocked } from './roles';
import { alreadyThere } from './status';
import { isTree } from './trees';
import type { Point, Shape } from './types';

// ---------- Nudge apart ----------
/** A little past the spacing, so the pair is clear of it however the sum rounds. */
const PAST = 0.01;
/**
 * What Nudge apart did, or why it didn't: `apart`, they aren't close; `fixed`, neither can move (locked, or already in
 * the ground); `bed`, the way out leaves its bed (or goes into one); `plant`, it would crowd a third plant (`third`).
 */
export type Nudge =
  | { ok: true; mover: Shape; other: Shape; from: Point; to: Point; by: number }
  | { ok: false; why: 'apart' | 'fixed' | 'bed' | 'plant'; mover?: Shape; other?: Shape; bed?: Shape | null; third?: Shape };

/** Whether a plant can be nudged: a circle, not locked, not a tree or plant already in the ground. */
export const canNudge = (s: Shape): boolean => s.type === 'circle' && !isLocked(s) && !alreadyThere(s);

/**
 * Which of two plants moves, and which stays: `prefer` (the one selected, or just placed), else the newer (later in the
 * plan: shapes don't keep when they were added, and a plant is added at the end). One that can't move stays, and the
 * other moves in its place. Null when neither can.
 */
export function moverOf(a: Shape, b: Shape, shapes: Shape[], prefer?: string): [Shape, Shape] | null {
  const at = (s: Shape) => shapes.findIndex((x) => x.id === s.id);
  const newer = at(b) >= at(a) ? [b, a] : [a, b];
  const [first, second] = prefer === a.id ? [a, b] : prefer === b.id ? [b, a] : newer;
  if (canNudge(first)) return [first, second];
  if (canNudge(second)) return [second, first];
  return null;
}

/** Directions to try where two plants share a center: along neither's line, so east first, then round the compass. */
const COMPASS: Point[] = [0, 180, 90, 270, 45, 135, 225, 315].map((d) => ({ x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180) }));

/**
 * Nudge apart (Jason, Nov 2): the newer, or the selected, of two plants that may grow into each other moves away from
 * the other along the line between them, just far enough that they're no longer close: their typical-size circles
 * touching, for two that share all their height (the usual spacing the warning gives, less under a tree's raised
 * crown). It stays in its bed, by where its center is, as a bed counts its plants (src/beds.ts), and isn't pushed into
 * a third plant: none it wasn't close to before, and none closer than it was. No room: said why, and nothing moves.
 *
 * `shapes`: what crowding checks (those shown); `all`: every shape, for its bed (a bed in a hidden layer still holds it).
 */
export function nudgeApart(a: Shape, b: Shape, shapes: Shape[], byId: Record<string, Plant | undefined>,
  opts: CrowdOptions & { prefer?: string; all?: Shape[] } = {}): Nudge {
  const pair = moverOf(a, b, shapes, opts.prefer);
  if (!pair) return { ok: false, why: 'fixed' };
  const [mover, other] = pair;
  if (mover.type !== 'circle') return { ok: false, why: 'fixed' };
  const need = apartAt(mover, other, shapes, byId, opts);
  const d = Math.hypot(mover.x - other.x, mover.y - other.y);
  if (need == null || d >= need) return { ok: false, why: 'apart', mover, other };
  const all = opts.all ?? shapes;
  const bed = bedOf(mover, all);
  const check = { ...opts, close: true, includeLeft: true };
  const before = new Map(crowdingOf(mover, shapes, byId, check).map((c) => [c.other.id, c.distance]));
  const ways = d > 1e-6 ? [{ x: (mover.x - other.x) / d, y: (mover.y - other.y) / d }] : COMPASS;
  let first: Nudge | null = null;
  for (const u of ways) {
    const to = { x: other.x + u.x * (need + PAST), y: other.y + u.y * (need + PAST) };
    const moved = { ...mover, x: to.x, y: to.y };
    const swap = (list: Shape[]) => list.map((s) => (s.id === mover.id ? moved : s));
    const bedNow = bedOf(moved, swap(all));
    if ((bedNow?.id ?? null) !== (bed?.id ?? null)) { first ??= { ok: false, why: 'bed', mover, other, bed: bed ?? bedNow }; continue; }
    const into = crowdingOf(moved, swap(shapes), byId, check).find((c) => {
      const was = before.get(c.other.id);
      return c.other.id === other.id || was == null || c.distance < was - 1e-9;
    });
    if (into) { first ??= { ok: false, why: 'plant', mover, other, third: into.other }; continue; }
    return { ok: true, mover, other, from: { x: mover.x, y: mover.y }, to, by: Math.hypot(to.x - mover.x, to.y - mover.y) };
  }
  return first!;
}

// ---------- Smaller forms of the same plant ----------
/**
 * Whether two catalog records are the same species: one a cultivar of the other (`parent`), cultivars of one species,
 * or the same species by their botanical names ("Salvia yangii" and a cultivar of it; a cultivar with none, by its
 * parent's: `byId`). Never a genus alone: two hostas
 * named only "Hosta 'Halcyon'" and "Hosta 'June'" may be different species, and nothing says they're the same.
 */
export function sameSpecies(a: Plant, b: Plant, byId: Record<string, Plant | undefined> = {}): boolean {
  if (a.id === b.id) return false;
  if (a.parent === b.id || b.parent === a.id || (!!a.parent && a.parent === b.parent)) return true;
  const sa = speciesKey(a, byId), sb = speciesKey(b, byId);
  return !!sa && sa === sb;
}
/** A record's species by its botanical name, or its parent's (a cultivar named only by its parent). */
const speciesKey = (p: Plant, byId: Record<string, Plant | undefined>): string | null =>
  speciesOf(p.botanical) ?? (p.parent ? speciesOf(byId[p.parent]?.botanical) : null);
/**
 * A catalog record's typical spread, in feet, where a source gives its width (not the earlier list alone, and never a
 * species' size taken for a cultivar's: sizes aren't inherited, src/catalog.ts INHERITED). Null otherwise.
 */
export function sourcedWidth(p: Plant, sources = PLANT_META?.sources): number | null {
  const pv = p.prov?.width, w = p.width;
  if (!pv || pv.unknown || pv.inherited || !pv.src.length || earlierListOnly(pv, sources) || !w) return null;
  const typical = w.med ?? (w.min != null && w.max != null ? (w.min + w.max) / 2 : null);
  return typical != null && typical > 0 ? typical : null;
}
export interface SmallerForm { plant: Plant; width: number; fits: boolean }
/**
 * The cultivars and forms of `current`'s own species that the catalog says spread less (each by a source's width, and
 * `current`'s by its sources too: smaller only where both are known), smallest first; `fits`: within `room` (the width
 * that fits where it's planted), or every one with no room given. Never another species, however alike.
 */
export function smallerForms(current: Plant, plants: Plant[], room: number | null, sources = PLANT_META?.sources): SmallerForm[] {
  const now = sourcedWidth(current, sources);
  if (now == null) return [];
  const out: SmallerForm[] = [];
  const byId = Object.fromEntries(plants.map((p) => [p.id, p]));
  for (const p of plants) {
    if (p.id === current.id || p.id.startsWith('u-') || !sameSpecies(current, p, byId)) continue;
    const width = sourcedWidth(p, sources);
    if (width == null || width >= now) continue;
    out.push({ plant: p, width, fits: room == null || width <= room + 1e-9 });
  }
  return out.sort((x, y) => x.width - y.width || x.plant.common.localeCompare(y.plant.common));
}

// ---------- A plant wider than its bed ----------
/** The distance from a point to the nearest edge of a closed outline. */
function toEdge(pts: Point[], p: Point): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}
/**
 * How wide a bed is: the widest circle that fits in it, across, in feet (a 3 by 20 ft strip is 3 ft wide). A rectangle
 * or an oval, its narrower side; a circle, across; any other outline, found by looking, to within an inch or so.
 */
export function bedWidth(bed: Shape): number {
  if (bed.type === 'circle' && !bed.canopy) return bed.radius * 2;
  if (bed.type === 'rect' || bed.type === 'oval') return Math.min(bed.width, bed.height);
  const o = drawnOutline(bed);
  if (!o || !o.closed || o.pts.length < 3) return 0;
  const box = shapeBBox(bed);
  let best = { r: 0, x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  let span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  // (A grid over it, then finer around the best point found, five times over.)
  for (let round = 0; round < 6 && span > 0.02; round++) {
    const N = 24, step = span / N;
    const x0 = round ? best.x - span / 2 : box.minX, y0 = round ? best.y - span / 2 : box.minY;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const p = { x: x0 + i * step, y: y0 + j * step };
      if (!pointInShape(bed, p)) continue;
      const r = toEdge(o.pts, p);
      if (r > best.r) best = { r, x: p.x, y: p.y };
    }
    span = step * 4;
  }
  return best.r * 2;
}
/**
 * A plant whose typical spread is wider than its bed is anywhere (Jason, Nov 2: too big for its spot): its bed, the
 * bed's width and the plant's spread. Not a tree, whose crown is over the bed, nor one already in the ground; only a
 * plant the catalog sizes. Null when it fits, or isn't in a bed.
 */
export function widerThanBed(s: Shape, shapes: Shape[], byId: Record<string, Plant | undefined>): { bed: Shape; width: number; spread: number } | null {
  if (s.type !== 'circle' || s.role !== 'plant' || !s.plantId || alreadyThere(s) || s.status === 'gone' || s.status === 'remove' || s.climbsOn) return null;
  const p = byId[s.plantId];
  if (isTree(s as Shape, byId)) return null; // (a guard: no narrowing of `s` past it)
  if (!p || (!p.width && !p.height)) return null;
  const bed = bedOf(s, shapes);
  if (!bed) return null;
  const width = bedWidth(bed), spread = plantSpread(p, 'typical');
  return spread > width + 0.05 ? { bed, width, spread } : null;
}
