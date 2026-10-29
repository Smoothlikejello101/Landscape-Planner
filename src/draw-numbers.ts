import { fmtFeet } from './geometry';
import type { Point } from './types';

// Drawing numbers (decided with Jason, Oct 25): the lengths of the sides and the angle at the newest corner while
// drawing or editing points, and a typed length for the next side (a prototype for him to try). Pure: no state.

/** A side shorter than this on screen gets no label (it would sit on its own points). */
export const SIDE_LABEL_MIN_PX = 48;
/** How far a typed side's direction sticks to a multiple of 45°, or square to the side before it (degrees). */
export const TYPED_STICK_DEG = 3;

export const lengthText = (ft: number): string => `${fmtFeet(ft)} ft`;

const unit = (x: number, y: number): Point | null => { const l = Math.hypot(x, y); return l > 1e-9 ? { x: x / l, y: y / l } : null; };

/** The angle at `at` between its sides to `prev` and `next`, in whole degrees (0 to 180); null if a side is empty. */
export function cornerAngle(prev: Point, at: Point, next: Point): number | null {
  const u = unit(prev.x - at.x, prev.y - at.y), v = unit(next.x - at.x, next.y - at.y);
  if (!u || !v) return null;
  const dot = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
  return Math.round((Math.acos(dot) * 180) / Math.PI);
}

/**
 * Where a side's label goes (its center): the side's middle, moved along its normal to the side away from `inside`
 * (if given), far enough that a label `size` big stays `gap` clear of the side whichever way the side runs.
 */
export function sideLabelSpot(a: Point, b: Point, gap: number, inside?: Point | null, size = { w: 0, h: 0 }): Point {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const n = unit(-(b.y - a.y), b.x - a.x);
  if (!n) return m;
  const s = inside && (inside.x - m.x) * n.x + (inside.y - m.y) * n.y > 0 ? -1 : 1;
  const off = gap + Math.abs(n.x) * (size.w / 2) + Math.abs(n.y) * (size.h / 2);
  return { x: m.x + s * n.x * off, y: m.y + s * n.y * off };
}

/** Where a corner's angle goes: `off` from the corner, into the angle (along the line halving it). */
export function angleSpot(prev: Point, at: Point, next: Point, off: number): Point {
  const u = unit(prev.x - at.x, prev.y - at.y), v = unit(next.x - at.x, next.y - at.y);
  if (!u || !v) return at;
  // (A straight line has no inside: the label goes beside it.)
  const h = unit(u.x + v.x, u.y + v.y) ?? { x: -u.y, y: u.x };
  return { x: at.x + h.x * off, y: at.y + h.y * off };
}

/** The middle of the points (for which side of a side is "inside"). */
export function middleOf(pts: Point[]): Point | null {
  if (pts.length < 3) return null;
  return { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length };
}

/**
 * The direction (radians) from `from` toward `toward`: stuck to a multiple of 45°, or square to the side before
 * (`prevDir`), when within TYPED_STICK_DEG of one. Null if the two are the same point.
 */
export function stickDirection(from: Point, toward: Point, prevDir?: number): number | null {
  if (Math.hypot(toward.x - from.x, toward.y - from.y) < 1e-9) return null;
  const a = Math.atan2(toward.y - from.y, toward.x - from.x);
  const tol = (TYPED_STICK_DEG * Math.PI) / 180;
  const near = (step: number, base: number) => {
    const k = Math.round((a - base) / step), t = base + k * step;
    return Math.abs(a - t) <= tol ? t : null;
  };
  // (Square to the side before first: a turned house's walls are square to each other, not to the grid.)
  return (prevDir != null ? near(Math.PI / 2, prevDir) : null) ?? near(Math.PI / 4, 0) ?? a;
}

/** The next point a typed length puts down: `length` feet from `from`, toward the tap (its direction stuck). */
export function typedPoint(from: Point, toward: Point, length: number, prevDir?: number): Point | null {
  const a = stickDirection(from, toward, prevDir);
  if (a == null || !(length > 0)) return null;
  return { x: from.x + Math.cos(a) * length, y: from.y + Math.sin(a) * length };
}

/**
 * A rectangle's far side from a typed length: `length` feet square off its first side (a to b), on the side the
 * tap was. Null if the tap was on the first side's line.
 */
export function typedFarSide(a: Point, b: Point, toward: Point, length: number): Point | null {
  const n = unit(-(b.y - a.y), b.x - a.x);
  if (!n || !(length > 0)) return null;
  const d = (toward.x - a.x) * n.x + (toward.y - a.y) * n.y;
  if (Math.abs(d) < 1e-9) return null;
  const s = d > 0 ? 1 : -1;
  return { x: b.x + s * n.x * length, y: b.y + s * n.y * length };
}

/** A length typed in the bar: feet as a number (a comma for the decimal point too); null if it isn't one. */
export function parseTypedLength(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 && v <= 1000 ? v : null;
}

/**
 * The part of the segment a to b inside the box [0, w] × [0, h] (screen px), or null if none of it is (Liang and
 * Barsky's clip). A side's label goes by the part on screen, so a long fence keeps its length in view.
 */
export function clipToBox(a: Point, b: Point, w: number, h: number): [Point, Point] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.x], [dx, w - a.x], [-dy, a.y], [dy, h - a.y]] as const) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
}
