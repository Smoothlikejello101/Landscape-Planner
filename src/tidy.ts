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
/** How close (screen px) a tap must be to another shape's corner or edge to land on it, and at most (feet). */
export const SNAP_PX = 14;
export const SNAP_MAX_FT = 1;
export interface SnapHit { point: Point; to: 'corner' | 'edge'; shapeId: string }
/**
 * Shapes a tap can land on: everything drawn with straight edges (outlines, rectangles, triangles, lines),
 * on view, but not plants (a bed's edge isn't a circle's), notes, round things, or a path's center line
 * (its edges are its band's, not the line).
 */
export function snapTargets(shapes: Shape[], exceptId?: string): { id: string; pts: Point[]; closed: boolean }[] {
  const out: { id: string; pts: Point[]; closed: boolean }[] = [];
  for (const s of shapes) {
    // (Nor a sun-exposure zone, which overlays the beds, or a kept measurement.)
    if (s.id === exceptId || s.role === 'plant' || s.role === 'shade' || s.type === 'circle' || s.type === 'oval' || s.type === 'text') continue;
    if (s.type === 'line' && (s.pathWidth || (s.role === 'other' && s.showLength))) continue; // (a fence showing its length is still a fence)
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
 * Where a tap at `p` (feet, unsnapped) lands: on another shape's nearest edge within `tol` feet, at the
 * point there nearest the tap's grid point `grid` (along a wall that runs with the grid, it stays on the
 * grid: the next corner tapped on the grid lines up with it); or on a corner, where one is near and not
 * much farther than the edge (meeting a corner exactly is the likelier intent then). Null if none.
 */
export function snapToShapes(p: Point, targets: ReturnType<typeof snapTargets>, tol: number, grid: Point = p): SnapHit | null {
  let corner: SnapHit | null = null, cornerD = Infinity;
  for (const t of targets) for (const c of t.pts) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d <= tol && d < cornerD) { cornerD = d; corner = { point: { ...c }, to: 'corner', shapeId: t.id }; }
  }
  let edge: SnapHit | null = null, edgeD = Infinity;
  for (const t of targets) {
    const n = t.pts.length, edges = t.closed ? n : n - 1;
    for (let i = 0; i < edges; i++) {
      const a = t.pts[i], b = t.pts[(i + 1) % n];
      const d = Math.hypot(nearestOnSegment(p, a, b).x - p.x, nearestOnSegment(p, a, b).y - p.y);
      if (d <= tol && d < edgeD) { edgeD = d; edge = { point: nearestOnSegment(grid, a, b), to: 'edge', shapeId: t.id }; }
    }
  }
  // A corner wins when it's within half the reach and not much farther than the edge (a tap beside a wall
  // near its end doesn't jump along the wall to the corner).
  const best = corner && (!edge || (cornerD <= tol / 2 && cornerD <= 1.5 * edgeD + 1e-9)) ? corner : edge;
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
export function squareUp(pts: Point[], maxMove = Infinity, fixed: boolean[] = [], direction?: number): Point[] | null {
  const n = pts.length;
  if (n < 4 || n % 2) return null; // (a squared outline has an even number of corners)
  const edgeAngle = (i: number) => Math.atan2(pts[(i + 1) % n].y - pts[i].y, pts[(i + 1) % n].x - pts[i].x);
  for (let i = 0; i < n; i++) {
    let turn = deg(edgeAngle(i) - edgeAngle((i + n - 1) % n));
    turn = ((turn % 360) + 540) % 360 - 180; // (-180, 180]
    if (Math.abs(Math.abs(turn) - 90) > SQUARE_TOL) return null;
  }
  // The outline's direction: `direction` where given (an edge lying along another shape's: the caller
  // checks it is), else the length-weighted mean of its edges' directions folded into a quarter turn.
  let theta: number;
  if (direction != null) theta = direction;
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
    // (Both ends on other shapes but not in line: squaring would pull one off what it landed on.)
    const off = fa && fb && (alongU ? Math.abs(a.v - b.v) : Math.abs(a.u - b.u)) > 0.01;
    return { alongU, off, at: alongU ? pick(a.v, b.v) : pick(a.u, b.u) };
  });
  if (lines.some((l) => l.off)) return null;
  // Consecutive edges must alternate directions (it's square everywhere).
  for (let i = 0; i < n; i++) if (lines[i].alongU === lines[(i + 1) % n].alongU) return null;
  const out = Array.from({ length: n }, (_, i) => {
    const prev = lines[(i + n - 1) % n], next = lines[i];
    const u = prev.alongU ? next.at : prev.at, v = prev.alongU ? prev.at : next.at;
    return { x: round(u * c - v * s), y: round(u * s + v * c) };
  });
  for (let i = 0; i < n; i++) if (Math.hypot(out[i].x - pts[i].x, out[i].y - pts[i].y) > maxMove) return null;
  // Still the same outline: every edge there (a tenth of a foot or more), every corner turning the same way
  // (a small step squared mustn't turn inside out).
  const turnSign = (q: Point[], i: number) => {
    const a = q[(i + n - 1) % n], b = q[i], c = q[(i + 1) % n];
    return Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
  };
  for (let i = 0; i < n; i++) {
    if (Math.hypot(out[(i + 1) % n].x - out[i].x, out[(i + 1) % n].y - out[i].y) < 0.1) return null;
    if (turnSign(out, i) !== turnSign(pts, i)) return null;
  }
  // Nothing to do: it was square already.
  if (out.every((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y) < 0.01)) return null;
  return out;
}
