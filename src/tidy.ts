// Tidying what's drawn by hand: a tap near another shape's corner or edge lands on it (a bed drawn against
// the house touches the house, with no sliver between), and an outline whose corners are all nearly square
// is squared up when it's finished. A snap happens as the tap lands, so it's shown then (the target lit, an
// "On House · Unsnap" chip: src/draw.ts); squaring happens out of sight, so it's said, with an Undo. Each can
// be turned off (Layers, on this device).
import { drawnOutline } from './geometry';
import { state } from './state';
import { shownWith } from './status';
import type { Point, Shape } from './types';

// ---------- The settings (this device) ----------
// (`lp-tidy`, one switch for both before they were split: off there turns both off.)
function setting(key: string) {
  let on: boolean | null = null;
  return {
    get(): boolean {
      if (on == null) { try { const v = localStorage.getItem(key); on = v ? v !== 'off' : localStorage.getItem('lp-tidy') !== 'off'; } catch { on = true; } }
      return on;
    },
    set(v: boolean) { on = v; try { localStorage.setItem(key, v ? 'on' : 'off'); } catch { /* this session only */ } },
  };
}
const snapping = setting('lp-snap'), squaring = setting('lp-square');
/** Whether taps land on other shapes' edges and corners (on unless turned off on this device). */
export const snapOn = () => snapping.get();
export const setSnapOn = (v: boolean) => snapping.set(v);
/** Whether nearly-square outlines are squared when finished (on unless turned off on this device). */
export const squareOn = () => squaring.get();
export const setSquareOn = (v: boolean) => squaring.set(v);

// ---------- Snapping to other shapes ----------
/** How close (screen px) a tap must be to another shape's corner or edge to land on it, and at most (feet). */
// (A fingertip's miss, about a third of an inch; the owner, testing, wanted more than the first 14 px. A bed
// meant to stand off a wall by less is one Unsnap away, or drawn zoomed in.)
export const SNAP_PX = 32;
export const SNAP_MAX_FT = 1.25;
/**
 * Where a tap landed on another shape: the point, its corner or edge (`seg`, for lighting it), and the
 * directions of the target's edges there (one on an edge, two at a corner), for squaring to them.
 */
export interface SnapHit { point: Point; to: 'corner' | 'edge'; shapeId: string; seg: [Point, Point]; angles: number[] }
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
const angleOf = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
/**
 * Where a tap at `p` (feet, unsnapped) lands: on another shape's nearest edge within `tol` feet, at the
 * point there nearest the finger (on a wall that runs with the grid, nearest the tap's grid point `grid`,
 * so the next corner tapped on the grid lines up with it); or on a corner, where one is near and not much
 * farther than the edge (meeting a corner exactly is the likelier intent then). Null if none.
 */
export function snapToShapes(p: Point, targets: ReturnType<typeof snapTargets>, tol: number, grid: Point = p): SnapHit | null {
  let corner: SnapHit | null = null, cornerD = Infinity;
  for (const t of targets) {
    const n = t.pts.length;
    for (let i = 0; i < n; i++) {
      const c = t.pts[i], d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d > tol || d >= cornerD) continue;
      // (Its edges there: before and after it; an open line's end has one.)
      const prev = t.closed || i > 0 ? t.pts[(i + n - 1) % n] : null, next = t.closed || i < n - 1 ? t.pts[(i + 1) % n] : null;
      cornerD = d;
      corner = { point: { ...c }, to: 'corner', shapeId: t.id, seg: [{ ...c }, { ...c }],
        angles: [prev && angleOf(prev, c), next && angleOf(c, next)].filter((a): a is number => a != null) };
    }
  }
  let edge: SnapHit | null = null, edgeD = Infinity;
  for (const t of targets) {
    const n = t.pts.length, edges = t.closed ? n : n - 1;
    for (let i = 0; i < edges; i++) {
      const a = t.pts[i], b = t.pts[(i + 1) % n];
      const near = nearestOnSegment(p, a, b);
      const d = Math.hypot(near.x - p.x, near.y - p.y);
      if (d > tol || d >= edgeD) continue;
      const withGrid = Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9;
      edgeD = d;
      edge = { point: withGrid ? nearestOnSegment(grid, a, b) : near, to: 'edge', shapeId: t.id, seg: [{ ...a }, { ...b }], angles: [angleOf(a, b)] };
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
