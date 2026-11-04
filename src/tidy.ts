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
/** With a mouse, which lands where it's pointed: the first, tighter reach. */
export const SNAP_PX_MOUSE = 14;
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
    // (Nor a sun-exposure zone, which overlays the beds, a utility, which runs over or under them, or a kept measurement.)
    if (s.id === exceptId || s.role === 'plant' || s.role === 'shade' || s.role === 'utility' || s.type === 'circle' || s.type === 'oval' || s.type === 'text') continue;
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
      // (Only beside the edge: off its end, the nearest point is the corner, which has its own, shorter reach.)
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      const along = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
      if (along <= 0 || along >= 1) continue;
      const near = nearestOnSegment(p, a, b);
      const d = Math.hypot(near.x - p.x, near.y - p.y);
      if (d > tol || d >= edgeD) continue;
      const withGrid = Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9;
      edgeD = d;
      edge = { point: withGrid ? nearestOnSegment(grid, a, b) : near, to: 'edge', shapeId: t.id, seg: [{ ...a }, { ...b }], angles: [angleOf(a, b)] };
    }
  }
  // A corner reaches half as far, and wins when it's not much farther than the edge (a tap beside a wall near
  // its end doesn't jump along the wall to the corner, nor one off past the corner pulled in at a slant).
  const best = corner && cornerD <= tol / 2 && (!edge || cornerD <= 1.5 * edgeD + 1e-9) ? corner : edge;
  return best && { ...best, point: { x: round(best.point.x), y: round(best.point.y) } };
}
const round = (v: number) => Math.round(v * 1000) / 1000 + 0;

// ---------- Squaring up ----------
/**
 * How far (degrees) from square a corner, or from the outline's two square directions a wall, may be and still be
 * squared. 10 until Jason's notes, Nov 4: "Squaring corners on an outline building probably needs to be more
 * aggressive… hard to accidentally build a trapezoid or a rhombus": a corner tapped by a fingertip at house scale is
 * often 12° out.
 */
export const SQUARE_TOL = 15;
/**
 * A wall at least this far (degrees) from both square directions is meant to be angled (a bay window's walls, at 45°;
 * a corner cut off): kept as drawn while the rest is squared. Between SQUARE_TOL and this, it's neither plainly square
 * nor plainly angled (a curving bed's sides): the outline is left as drawn.
 */
export const ANGLED_MIN = 25;
/** How far (degrees) from the grid an outline may be turned and still be lined up with it. */
export const GRID_TOL = 3;
const deg = (r: number) => (r * 180) / Math.PI;
/** Turns (radians) folded into (-180°, 180°], in degrees. */
const turnDeg = (r: number) => { const t = deg(r); return ((t % 360) + 540) % 360 - 180; };
/**
 * Each edge of a closed outline against the square directions `theta` and a quarter turn from it: along which
 * (`alongU`: theta's), how far off it (degrees, signed), and so whether it's to be squared (within SQUARE_TOL) or is
 * meant to be angled (ANGLED_MIN or more). `ambiguous`: one is neither.
 */
function edgesAgainst(pts: Point[], theta: number) {
  const n = pts.length;
  const edges = Array.from({ length: n }, (_, i) => {
    const a = pts[i], b = pts[(i + 1) % n];
    const angle = Math.atan2(b.y - a.y, b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.round((angle - theta) / (Math.PI / 2));
    const off = deg(angle - theta - (k * Math.PI) / 2);
    return { angle, len, alongU: ((k % 2) + 2) % 2 === 0, off, square: Math.abs(off) <= SQUARE_TOL, angled: Math.abs(off) >= ANGLED_MIN };
  });
  return { edges, ambiguous: edges.some((e) => !e.square && !e.angled) };
}
/** The direction (radians, in a quarter turn) the edges run, weighted by length; `only` limits it to some of them. */
function squareDirection(pts: Point[], only?: (i: number) => boolean): number | null {
  const n = pts.length;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    if (only && !only(i)) continue;
    const a = pts[i], b = pts[(i + 1) % n], len = Math.hypot(b.x - a.x, b.y - a.y), t = Math.atan2(b.y - a.y, b.x - a.x);
    sx += len * Math.cos(4 * t); sy += len * Math.sin(4 * t);
  }
  return Math.hypot(sx, sy) < 1e-9 ? null : Math.atan2(sy, sx) / 4;
}
/**
 * An outline's square directions: those of its walls that are nearly square (a bay's angled walls left out); `only`,
 * of some of its walls (by the index of the point each starts at).
 */
export function outlineDirection(pts: Point[], only: (i: number) => boolean = () => true): number | null {
  let theta = squareDirection(pts, only);
  if (theta == null) return null;
  // (Again from only the walls within SQUARE_TOL of it, twice: a bay's 45° walls pull the first guess off.)
  for (let k = 0; k < 2; k++) {
    const { edges } = edgesAgainst(pts, theta);
    const again = squareDirection(pts, (i) => only(i) && edges[i].square);
    if (again == null) break;
    theta = again;
  }
  const toGrid = deg(theta) - Math.round(deg(theta) / 90) * 90;
  return Math.abs(toGrid) <= GRID_TOL ? (Math.round(deg(theta) / 90) * 90 * Math.PI) / 180 : theta;
}
/** Walls going the same way this near one line (feet) are put on it: a T's shoulders, the wall either side of a bay. */
export const IN_LINE_FT = 0.75;
/** At least this share of an outline's length must be walls to square (the rest angled) for it to be squared. */
const SQUARE_SHARE = 0.6;
/**
 * An outline (closed) mostly of nearly square walls (an L- or T-shaped house too, one with a bay window, a bed with a
 * corner cut), squared: each wall within SQUARE_TOL of one of two square directions (the outline's own, from those walls
 * weighted by length; the grid's if within GRID_TOL) made exactly parallel to it, at its average offset (walls in line
 * with each other, a point partway along a wall, on one line), corners where they meet. A wall meant to be angled
 * (ANGLED_MIN or more off both: a bay's) keeps its direction, its ends sliding along it to meet the squared walls.
 * Null if a wall is neither (a curving bed), a corner between squared walls isn't within SQUARE_TOL of square, less
 * than SQUARE_SHARE of its length is to be squared, fewer than two corners are square, or squaring would move a point
 * more than `maxMove` feet. Points in `fixed` (snapped onto another shape) stay put where they can: the outline's
 * direction is taken from an edge that runs between two of them, when there is one.
 */
export function squareUp(pts: Point[], maxMove = Infinity, fixed: boolean[] = [], direction?: number): Point[] | null {
  const n = pts.length;
  if (n < 4) return null;
  // The outline's direction: `direction` where given (an edge lying along another shape's: the caller
  // checks it is), else its nearly square walls', folded into a quarter turn.
  const theta = direction ?? outlineDirection(pts);
  if (theta == null) return null;
  const { edges, ambiguous } = edgesAgainst(pts, theta);
  if (ambiguous) return null;
  const total = edges.reduce((t, e) => t + e.len, 0);
  if (edges.reduce((t, e) => t + (e.square ? e.len : 0), 0) < SQUARE_SHARE * total) return null;
  // Corners between two walls to square: square (or straight on, a point partway along a wall), never doubling back.
  let squareCorners = 0;
  for (let i = 0; i < n; i++) {
    const prev = edges[(i + n - 1) % n], next = edges[i];
    if (!prev.square || !next.square) continue;
    const turn = turnDeg(next.angle - prev.angle);
    if (prev.alongU !== next.alongU) { if (Math.abs(Math.abs(turn) - 90) > SQUARE_TOL) return null; squareCorners++; }
    else if (Math.abs(turn) > SQUARE_TOL) return null;
  }
  if (squareCorners < 2) return null;
  const c = Math.cos(theta), s = Math.sin(theta);
  const local = pts.map((p) => ({ u: p.x * c + p.y * s, v: -p.x * s + p.y * c }));
  // Walls to square in line with each other (a point partway along one) are one line: each run of them, from its
  // first. Its line sits at its points' average, or at its fixed points' (which must agree: two on other shapes but
  // not in line, squaring would pull one off what it landed on).
  const runOf = new Array<number>(n).fill(-1);
  const continues = (i: number) => edges[i].square && edges[(i + n - 1) % n].square && edges[(i + n - 1) % n].alongU === edges[i].alongU;
  const start = edges.findIndex((e, i) => e.square && !continues(i));
  if (start < 0 && edges.some((e) => e.square)) return null; // (every wall in one line: no outline)
  const runs: { alongU: boolean; at: number }[] = [];
  for (let k = 0; k < n && start >= 0; k++) {
    const i = (start + k) % n;
    if (!edges[i].square) continue;
    if (!continues(i)) runs.push({ alongU: edges[i].alongU, at: 0 });
    runOf[i] = runs.length - 1;
  }
  // Each run's points, and which way its walls go along their line (two walls going the same way, in line, are one
  // wall broken by something between: the shoulders of a T, the wall either side of a bay).
  const runPts = runs.map((_, r) => { const e = new Set<number>(); for (let i = 0; i < n; i++) if (runOf[i] === r) { e.add(i); e.add((i + 1) % n); } return [...e]; });
  const runWay = runs.map((run, r) => {
    const i = runOf.indexOf(r), a = local[i], b = local[(i + 1) % n];
    return Math.sign(run.alongU ? b.u - a.u : b.v - a.v);
  });
  const coordOf = (alongU: boolean, j: number) => (alongU ? local[j].v : local[j].u);
  /** A line's offset from its points: their average, or the fixed ones' (which must agree). Null where they don't. */
  const lineAt = (alongU: boolean, idx: number[]) => {
    const held = idx.filter((j) => fixed[j]), by = held.length ? held : idx;
    if (held.length > 1 && Math.max(...held.map((j) => coordOf(alongU, j))) - Math.min(...held.map((j) => coordOf(alongU, j))) > 0.01) return null;
    return by.reduce((t, j) => t + coordOf(alongU, j), 0) / by.length;
  };
  for (let r = 0; r < runs.length; r++) {
    const at = lineAt(runs[r].alongU, runPts[r]);
    if (at == null) return null;
    runs[r].at = at;
  }
  // Each corner where its two lines meet: two squared walls, where their lines cross (or, in line, the point put on
  // the line); a squared wall and an angled one, where the squared line crosses the angled wall as drawn; two angled
  // walls, as drawn.
  const angledAt = (i: number, line: { alongU: boolean; at: number }) => {
    const a = local[i], b = local[(i + 1) % n];
    return line.alongU
      ? { u: a.u + ((line.at - a.v) * (b.u - a.u)) / (b.v - a.v), v: line.at }
      : { u: line.at, v: a.v + ((line.at - a.u) * (b.v - a.v)) / (b.u - a.u) };
  };
  const turnSign = (q: Point[], i: number) => {
    const a = q[(i + n - 1) % n], b = q[i], c = q[(i + 1) % n];
    return Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
  };
  const place = (lines: { alongU: boolean; at: number }[]): Point[] | null => {
    const out = Array.from({ length: n }, (_, i) => {
      const ip = (i + n - 1) % n, prev = runOf[ip] >= 0 ? lines[runOf[ip]] : null, next = runOf[i] >= 0 ? lines[runOf[i]] : null;
      let q: { u: number; v: number };
      if (prev && next && runOf[ip] !== runOf[i]) q = prev.alongU ? { u: next.at, v: prev.at } : { u: prev.at, v: next.at };
      else if (prev && next) q = prev.alongU ? { u: local[i].u, v: prev.at } : { u: prev.at, v: local[i].v };
      else if (prev) q = angledAt(i, prev);
      else if (next) q = angledAt(ip, next);
      else q = local[i];
      return { x: round(q.u * c - q.v * s), y: round(q.u * s + q.v * c) };
    });
    for (let i = 0; i < n; i++) if (Math.hypot(out[i].x - pts[i].x, out[i].y - pts[i].y) > maxMove) return null;
    // Still the same outline: every edge there (a tenth of a foot or more), every corner turning the same way
    // (a small step squared mustn't turn inside out).
    for (let i = 0; i < n; i++) {
      if (Math.hypot(out[(i + 1) % n].x - out[i].x, out[(i + 1) % n].y - out[i].y) < 0.1) return null;
      const ip = (i + n - 1) % n, straight = runOf[ip] >= 0 && runOf[ip] === runOf[i]; // (a point partway along a wall)
      if (!straight && turnSign(out, i) !== turnSign(pts, i)) return null;
    }
    return out;
  };
  // Walls going the same way within IN_LINE_FT of one line, put on it; where that won't do (it would close a step to
  // nothing, or pull a fixed point off), each on its own line.
  const merged = runs.map((r) => ({ ...r }));
  for (const alongU of [true, false]) for (const way of [1, -1]) {
    const group = runs.map((_, r) => r).filter((r) => runs[r].alongU === alongU && runWay[r] === way).sort((a, b) => runs[a].at - runs[b].at);
    for (let k = 0; k < group.length;) {
      let m = k + 1;
      while (m < group.length && runs[group[m]].at - runs[group[k]].at <= IN_LINE_FT) m++;
      const these = group.slice(k, m), at = these.length > 1 ? lineAt(alongU, these.flatMap((r) => runPts[r])) : null;
      if (at != null) for (const r of these) merged[r].at = at;
      k = m;
    }
  }
  const out = place(merged) ?? place(runs);
  if (!out) return null;
  // Nothing to do: it was square already.
  if (out.every((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y) < 0.01)) return null;
  return out;
}

// ---------- A dragged corner sticks square ----------
/**
 * How near (degrees) a dragged corner's walls must come to the outline's square directions to stick there (Jason,
 * Nov 4: "make it easy to build that, and hard to accidentally build a trapezoid or a rhombus"). A few degrees: the
 * finger moved on past it puts the corner anywhere.
 */
export const STICK_DEG = 4;
/** Which of a dragged corner's two walls stuck: the one from the point before it, the one to the point after it. */
export type StuckWall = 'before' | 'after';
/**
 * Where corner `i` of a closed outline, dragged toward `f` (feet), sticks: where a wall from it runs within STICK_DEG
 * of the outline's square directions (taken from its other walls, as squaring takes them), on that line, its length
 * a whole number of `step`s; where both walls do, where the two lines cross (its corners square, its walls parallel to
 * the others). Null when neither does, or the outline's other walls aren't plainly square or angled (a curving bed):
 * the corner goes where it's put.
 */
export function squareStick(pts: Point[], i: number, f: Point, step = 0.5): { p: Point; walls: StuckWall[] } | null {
  const n = pts.length;
  if (n < 4 || i < 0 || i >= n) return null;
  const ib = (i + n - 1) % n, P = pts[ib], N = pts[(i + 1) % n];
  const others = (j: number) => j !== i && j !== ib;
  const theta = outlineDirection(pts, others);
  if (theta == null) return null;
  const { edges } = edgesAgainst(pts, theta);
  if (edges.some((e, j) => others(j) && !e.square && !e.angled) || !edges.some((e, j) => others(j) && e.square)) return null;
  // Each wall, from its far end toward the finger: the square direction it's within STICK_DEG of, if any.
  const near = (from: Point, to: Point) => {
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-6) return null;
    const a = Math.atan2(to.y - from.y, to.x - from.x), k = Math.round((a - theta) / (Math.PI / 2));
    const t = theta + (k * Math.PI) / 2;
    return Math.abs(deg(a - t)) <= STICK_DEG ? { d: { x: Math.cos(t), y: Math.sin(t) }, k } : null;
  };
  const before = near(P, f), after = near(N, f);
  if (!before && !after) return null;
  const along = (from: Point, d: Point) => {
    const t = Math.round(((f.x - from.x) * d.x + (f.y - from.y) * d.y) / step) * step;
    return { x: round(from.x + t * d.x), y: round(from.y + t * d.y) };
  };
  if (before && after && (before.k - after.k) % 2 !== 0) {
    // Where the line from the point before crosses the line from the point after.
    const d1 = before.d, d2 = after.d, den = d1.x * d2.y - d1.y * d2.x;
    const s = ((N.x - P.x) * d2.y - (N.y - P.y) * d2.x) / den;
    return { p: { x: round(P.x + s * d1.x), y: round(P.y + s * d1.y) }, walls: ['before', 'after'] };
  }
  if (before && after) {
    // (In line with both its neighbors, which are in line with each other: along that line.)
    const offLine = Math.abs((N.x - P.x) * before.d.y - (N.y - P.y) * before.d.x);
    if (offLine < 0.01) return { p: along(P, before.d), walls: ['before', 'after'] };
  }
  // (One wall near square: on its line. Both, but the same way and not in line: the one the finger's nearer.)
  const chosen: StuckWall = before && after ? closer(P, N, f, before.d, after.d) : before ? 'before' : 'after';
  return chosen === 'before' ? { p: along(P, before!.d), walls: ['before'] } : { p: along(N, after!.d), walls: ['after'] };
}
/** Of two lines a finger is near (from `a` along `da`, from `b` along `db`), the one it's nearer. */
function closer(a: Point, b: Point, f: Point, da: Point, db: Point): StuckWall {
  const off = (o: Point, d: Point) => Math.abs((f.x - o.x) * d.y - (f.y - o.y) * d.x);
  return off(a, da) <= off(b, db) ? 'before' : 'after';
}
