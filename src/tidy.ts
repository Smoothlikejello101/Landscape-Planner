// Tidying what's drawn by hand: a tap near another shape's corner or edge lands on it (a bed drawn against
// the house touches the house, with no sliver between), and an outline whose corners are all nearly square
// is squared up. Each tidy is said, with an Undo (src/draw.ts), and can be turned off (Layers, on this device).
import { drawnOutline } from './geometry';
import { state } from './state';
import { shownWith } from './status';
import type { Point, Shape } from './types';

// ---------- The setting (this device) ----------
const KEY = 'lp-tidy';
let on: boolean | null = null;
/** Whether drawing is tidied (on unless turned off on this device). */
export function tidyOn(): boolean {
  if (on == null) { try { on = localStorage.getItem(KEY) !== 'off'; } catch { on = true; } }
  return on;
}
export function setTidyOn(v: boolean) { on = v; try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* this session only */ } }

// ---------- Snapping to other shapes ----------
/** How close (screen px) a tap must be to another shape's corner or edge to land on it. */
export const SNAP_PX = 14;
export interface SnapHit { point: Point; to: 'corner' | 'edge'; shapeId: string }
/**
 * Shapes a tap can land on: everything drawn with straight edges (outlines, rectangles, triangles, lines),
 * on view, but not plants (a bed's edge isn't a circle's), notes, round things, or a path's center line
 * (its edges are its band's, not the line).
 */
export function snapTargets(shapes: Shape[], exceptId?: string): { id: string; pts: Point[]; closed: boolean }[] {
  const out: { id: string; pts: Point[]; closed: boolean }[] = [];
  for (const s of shapes) {
    if (s.id === exceptId || s.role === 'plant' || s.type === 'circle' || s.type === 'oval' || s.type === 'text') continue;
    if (s.type === 'line' && s.pathWidth) continue;
    if (!shownWith(s, state.viewFilter)) continue;
    const o = drawnOutline(s);
    if (o && o.pts.length >= 2) out.push({ id: s.id, ...o });
  }
  return out;
}
/** The nearest point on segment a–b to p. */
function nearestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}
/**
 * Where a tap at `p` (feet, unsnapped) lands: on another shape's corner within `tol` feet (corners first:
 * meeting a corner exactly is the likelier intent), else on its nearest edge within `tol`; null if none.
 */
export function snapToShapes(p: Point, targets: ReturnType<typeof snapTargets>, tol: number): SnapHit | null {
  let best: SnapHit | null = null, bestD = tol;
  for (const t of targets) for (const c of t.pts) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d <= bestD) { bestD = d; best = { point: { ...c }, to: 'corner', shapeId: t.id }; }
  }
  if (best) return best;
  bestD = tol;
  for (const t of targets) {
    const n = t.pts.length, edges = t.closed ? n : n - 1;
    for (let i = 0; i < edges; i++) {
      const q = nearestOnSegment(p, t.pts[i], t.pts[(i + 1) % n]);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= bestD) { bestD = d; best = { point: q, to: 'edge', shapeId: t.id }; }
    }
  }
  return best && { ...best, point: { x: round(best.point.x), y: round(best.point.y) } };
}
const round = (v: number) => Math.round(v * 1000) / 1000 + 0;

// ---------- Squaring up ----------
/** How far (degrees) from square a corner may be and still be squared. */
export const SQUARE_TOL = 10;
/** How far (degrees) from the grid an outline may be turned and still be lined up with it. */
export const GRID_TOL = 3;
const deg = (r: number) => (r * 180) / Math.PI;
/**
 * An outline (closed) with every corner within SQUARE_TOL of square (90° or 270°: an L-shaped house too),
 * squared: each edge made exactly parallel to one of two square directions (the outline's own, from its
 * edges weighted by length; the grid's if within GRID_TOL), at its average offset, corners where they meet.
 * Null if any corner isn't nearly square, or squaring would move a point more than `maxMove` feet. Points
 * in `fixed` (snapped onto another shape) stay put where they can: the outline's direction is taken from an
 * edge that runs between two of them, when there is one.
 */
export function squareUp(pts: Point[], maxMove = Infinity, fixed: boolean[] = []): Point[] | null {
  const n = pts.length;
  if (n < 4 || n % 2) return null; // (a squared outline has an even number of corners)
  const edgeAngle = (i: number) => Math.atan2(pts[(i + 1) % n].y - pts[i].y, pts[(i + 1) % n].x - pts[i].x);
  for (let i = 0; i < n; i++) {
    let turn = deg(edgeAngle(i) - edgeAngle((i + n - 1) % n));
    turn = ((turn % 360) + 540) % 360 - 180; // (-180, 180]
    if (Math.abs(Math.abs(turn) - 90) > SQUARE_TOL) return null;
  }
  // The outline's direction: an edge between two fixed points (it lies along another shape), else the
  // length-weighted mean of its edges' directions folded into a quarter turn.
  let theta: number;
  const along = Array.from({ length: n }, (_, i) => i).find((i) => fixed[i] && fixed[(i + 1) % n]);
  if (along != null) theta = edgeAngle(along);
  else {
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) {
      const a = edgeAngle(i), len = Math.hypot(pts[(i + 1) % n].x - pts[i].x, pts[(i + 1) % n].y - pts[i].y);
      sx += len * Math.cos(4 * a); sy += len * Math.sin(4 * a);
    }
    theta = Math.atan2(sy, sx) / 4;
    const toGrid = deg(theta) - Math.round(deg(theta) / 90) * 90;
    if (Math.abs(toGrid) <= GRID_TOL) theta = (Math.round(deg(theta) / 90) * 90 * Math.PI) / 180;
  }
  const c = Math.cos(theta), s = Math.sin(theta);
  const local = pts.map((p) => ({ u: p.x * c + p.y * s, v: -p.x * s + p.y * c }));
  // Each edge runs along u (its v constant) or along v (its u constant); its line sits at its ends' average,
  // or at a fixed end's when one is fixed.
  const lines = Array.from({ length: n }, (_, i) => {
    const a = local[i], b = local[(i + 1) % n];
    const alongU = Math.abs(b.u - a.u) >= Math.abs(b.v - a.v);
    const fa = fixed[i], fb = fixed[(i + 1) % n];
    const pick = (x: number, y: number) => (fa && !fb ? x : fb && !fa ? y : (x + y) / 2);
    return alongU ? { alongU, at: pick(a.v, b.v) } : { alongU, at: pick(a.u, b.u) };
  });
  // Consecutive edges must alternate directions (it's square everywhere).
  for (let i = 0; i < n; i++) if (lines[i].alongU === lines[(i + 1) % n].alongU) return null;
  const out = Array.from({ length: n }, (_, i) => {
    const prev = lines[(i + n - 1) % n], next = lines[i];
    const u = prev.alongU ? next.at : prev.at, v = prev.alongU ? prev.at : next.at;
    return { x: round(u * c - v * s), y: round(u * s + v * c) };
  });
  for (let i = 0; i < n; i++) if (Math.hypot(out[i].x - pts[i].x, out[i].y - pts[i].y) > maxMove) return null;
  // Nothing to do: it was square already.
  if (out.every((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y) < 0.01)) return null;
  return out;
}
