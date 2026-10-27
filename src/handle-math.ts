import { ROT_SNAP, SNAP } from './constants';
import { boxSize, pathLength, resizedPoints, rotate, textSize } from './geometry';
import type { CircleShape, Point, Shape, ShapePatch } from './types';

// The geometry of the handles on a selected shape (src/handles.ts): a corner dragged to resize, the knob above it
// turned to rotate, a circle's edge pulled to size it. Pure: each takes the shape as it was when the drag began and
// where the pointer is now (feet), and returns the patch, so a drag never wears a shape down step by step.

export type Corner4 = 'tl' | 'tr' | 'bl' | 'br';
export type HandleKind = Corner4 | 'radius' | 'rotate';
export const CORNERS: Corner4[] = ['tl', 'tr', 'br', 'bl'];
/** Which way each corner lies from the center, along the shape's own sides. */
export const CORNER_SIGNS: Record<Corner4, [number, number]> = { tl: [-1, -1], tr: [1, -1], bl: [-1, 1], br: [1, 1] };

export type BoxLike = Exclude<Shape, CircleShape>;
/** A shape's box: its center, its size before it's turned, and its turn (feet; degrees clockwise). */
export interface Frame { cx: number; cy: number; w: number; h: number; rot: number }
export function frameOf(s: BoxLike): Frame {
  const { w, h } = boxSize(s);
  return { cx: s.x + w / 2, cy: s.y + h / 2, w, h, rot: s.rotation || 0 };
}
/** A point of the box, by how far it is from the center along the box's own sides, in world feet. */
export function framePoint(f: Frame, lx: number, ly: number): Point {
  const r = rotate(lx, ly, f.rot);
  return { x: f.cx + r.x, y: f.cy + r.y };
}
export function cornerPoint(f: Frame, c: Corner4): Point {
  const [sx, sy] = CORNER_SIGNS[c];
  return framePoint(f, (sx * f.w) / 2, (sy * f.h) / 2);
}

/** The smallest a side can be dragged to (feet): the grid's step (or what it was, if it was thinner already). */
export const MIN_SIDE = SNAP;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
/**
 * A side dragged from `from` toward `to` feet: changed in the grid's half-foot steps from what it was (a traced 7.3 ft
 * goes to 7.8, not 7.5; a side the drag doesn't pull doesn't change), and no thinner than half a foot, or than it was.
 */
const stepSide = (from: number, to: number) => Math.max(Math.min(from, MIN_SIDE), round3(from + Math.round((to - from) / SNAP) * SNAP));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The patch that puts corner `c` of `start` (as it was when the drag began) under the pointer `p` (feet), the opposite
 * corner staying where it is, the shape keeping its turn. Sides change in the grid's half-foot steps, and get no
 * smaller than that; past the opposite corner it stops there, rather than turning inside out. `keepRatio` (Shift held)
 * scales both sides alike, its longer side no shorter than half a foot, as a text note always does (its size is its
 * letters' height). A side that's 0 (a straight line along it) stays 0.
 */
export function resizePatch(start: BoxLike, c: Corner4, p: Point, keepRatio = false): ShapePatch {
  const f = frameOf(start);
  const [sx, sy] = CORNER_SIGNS[c];
  const fixed = framePoint(f, (-sx * f.w) / 2, (-sy * f.h) / 2);
  // The pointer from the fixed corner, along the box's own sides.
  const d = rotate(p.x - fixed.x, p.y - fixed.y, -f.rot);
  let w: number, h: number;
  const patch: ShapePatch = {};
  if (start.type === 'text' || keepRatio) {
    // Along the box's diagonal: how far the corner has gone, as a share of the diagonal.
    const len2 = f.w * f.w + f.h * f.h;
    const k = len2 > 0 ? (sx * d.x * f.w + sy * d.y * f.h) / len2 : 1;
    if (start.type === 'text') {
      // (In quarter feet, as the properties' Text height field steps.)
      patch.fontSize = clamp(Math.round(start.fontSize * k * 4) / 4, 0.25, 50);
      ({ w, h } = textSize({ label: start.label, fontSize: patch.fontSize }));
    } else {
      // (Its longer side no shorter than half a foot: a thin side, already thinner, isn't what limits it.)
      const longest = Math.max(f.w, f.h);
      const least = longest > 0 ? Math.min(1, MIN_SIDE / longest) : 1;
      const kk = Math.max(least, k);
      w = Math.round(f.w * kk * 100) / 100;
      h = Math.round(f.h * kk * 100) / 100;
    }
  } else {
    w = f.w > 0 ? stepSide(f.w, sx * d.x) : 0;
    h = f.h > 0 ? stepSide(f.h, sy * d.y) : 0;
  }
  // The new center: from the fixed corner, half the new size along each side.
  const center = framePoint({ ...f, cx: fixed.x, cy: fixed.y }, (sx * w) / 2, (sy * h) / 2);
  patch.x = round3(center.x - w / 2);
  patch.y = round3(center.y - h / 2);
  if (start.type === 'poly' || start.type === 'line') patch.points = resizedPoints(start.points, w, h);
  else if (start.type !== 'text') { patch.width = w; patch.height = h; }
  return patch;
}

/** A circle's size from its edge pulled to `p`: the radius out to it, in quarter feet (half-foot steps across). */
export function radiusPatch(start: CircleShape, p: Point): ShapePatch {
  const r = Math.hypot(p.x - start.x, p.y - start.y);
  return { radius: Math.max(0.25, Math.round(r * 4) / 4) };
}

/** Degrees in [0, 360). */
export const turnOf = (deg: number) => ((deg % 360) + 360) % 360;
/** Angle in degrees from `center` to `p`, 0° straight up, clockwise (the way rotation turns). */
export function angleTo(center: Point, p: Point): number {
  return (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI + 90;
}
/**
 * The turn after the knob has gone from `startAngle` to `angle` (degrees, around the shape's center): the shape's turn
 * when the drag began plus the knob's, in steps of 5° (15° with Shift), as the properties' rotation buttons step.
 */
export function rotatePatch(start: BoxLike, startAngle: number, angle: number, step = ROT_SNAP): ShapePatch {
  const r = (start.rotation || 0) + angle - startAngle;
  return { rotation: turnOf(Math.round(r / step) * step) };
}

/** What a drag reads as, beside the handle: the size it's dragged to, or the turn. */
export function readoutText(s: Shape, kind: HandleKind): string {
  const ft = (v: number) => String(Math.round(v * 10) / 10);
  if (kind === 'rotate') return `${Math.round(s.type === 'circle' ? 0 : s.rotation || 0)}°`;
  if (s.type === 'circle') return `${ft(s.radius * 2)} ft across`;
  if (s.type === 'text') return `${ft(s.fontSize)} ft text`;
  if (s.type === 'line') return `${ft(pathLength(s.points, false))} ft long`;
  const { w, h } = boxSize(s);
  return `${ft(w)} × ${ft(h)} ft`;
}
