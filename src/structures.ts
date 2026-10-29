import type { Point, Shape } from './types';

// Garden structures (role 'structure'; the Backlog's vine plan, Oct 28–29): a trellis, drawn as a line with its
// lattice marked along it, and an arbor or pergola, an area with the slats across its top. Vines climb both
// (src/vines.ts). The marks are drawn in pixels, on the plan and in exports alike, so they stay legible zoomed out.

/** Feet between a trellis's lattice marks, and between an arbor's slats (fewer when zoomed far out). */
export const LATTICE_STEP = 1;
export const SLAT_STEP = 1.5;
/** The fewest pixels between two marks: zoomed out further, they're spaced wider. */
const MIN_GAP = 8;

export const isTrellis = (s: Shape): boolean => s.role === 'structure' && s.type === 'line';
export const isArbor = (s: Shape): boolean => s.role === 'structure' && (s.type === 'rect' || s.type === 'poly' || s.type === 'oval' || s.type === 'triangle');

/**
 * A trellis's lattice: a small cross every `stepPx` along its line (pixel points), as an SVG path. `size`: each
 * cross's half-width in pixels.
 */
export function latticePath(pts: Point[], stepPx: number, size = 4): string {
  const step = Math.max(MIN_GAP, stepPx);
  let d = '', carry = step / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    let t = carry;
    for (; t <= len; t += step) {
      const x = a.x + ux * t, y = a.y + uy * t;
      // (Two diagonals across the line: a lattice's crossing laths.)
      const p = { x: (ux - uy) * size, y: (uy + ux) * size }, q = { x: (ux + uy) * size, y: (uy - ux) * size };
      d += `M${r1(x - p.x)},${r1(y - p.y)}L${r1(x + p.x)},${r1(y + p.y)}M${r1(x - q.x)},${r1(y - q.y)}L${r1(x + q.x)},${r1(y + q.y)}`;
    }
    carry = t - len;
  }
  return d;
}
/**
 * An arbor's slats: lines across its short side every `stepPx`, inside the box (`x`, `y`, `w`, `h`, in pixels,
 * before its turn), as an SVG path. (The box's own transform turns them with it.)
 */
export function slatsPath(x: number, y: number, w: number, h: number, stepPx: number): string {
  const step = Math.max(MIN_GAP, stepPx);
  const along = w >= h; // (across the short side: a slat spans the depth, the slats run the length)
  const len = along ? w : h, n = Math.floor(len / step);
  if (n < 1) return '';
  const pad = (len - (n - 1) * step) / 2;
  let d = '';
  for (let i = 0; i < n; i++) {
    const t = pad + i * step;
    d += along ? `M${r1(x + t)},${r1(y)}V${r1(y + h)}` : `M${r1(x)},${r1(y + t)}H${r1(x + w)}`;
  }
  return d;
}
const r1 = (v: number) => Math.round(v * 10) / 10;
