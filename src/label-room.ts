import { boxLabelAngle, pathLabelPoint, pointInShape, rotate, shapeCenter, worldPoints } from './geometry';
import type { Point, Shape } from './types';

// Whether a shape's name fits inside it, zoomed far out. A name keeps its size on the screen (10–14 px, times Settings'
// label size) at every zoom while the yard shrinks under it: at 5% a 26 px "Path" is 21 ft of yard, across a 2.5 ft path
// 3 px wide, "the most prominent thing in the plan" (Jason, Nov 4, his note 6: "about 30' wide at 5%"). From Oct 22,
// zoomed out past 25% (src/canvas.ts FAR_OUT_PPF), a name longer than its shape's longest side was left off, which a
// name across a long, thin path, a driveway or a bed passed. Now it's left off unless it lies inside its shape, as it's
// drawn: so no name is bigger than what it names, and a shape's name goes as soon as the shape is smaller than its name.
// Closer in than 25%, names show as before, readable on the smallest shape.

/** Where a shape's name is drawn (feet) and how it's turned (degrees), as src/canvas.ts shapeGroup draws it. */
export function nameSpot(s: Shape): { at: Point; angle: number } {
  if (s.type === 'poly' || s.type === 'line') return { at: pathLabelPoint(s), angle: 0 };
  if (s.type === 'circle') return { at: { x: s.x, y: s.y }, angle: 0 };
  if (s.type === 'text') return { at: shapeCenter(s), angle: 0 };
  return { at: { x: s.x + s.width / 2, y: s.y + s.height / 2 }, angle: boxLabelAngle(s.rotation || 0) };
}

/** How far a point is from a line through `pts` (feet). */
function lineDistance(pts: Point[], p: Point): number {
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    min = Math.min(min, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return min;
}

/**
 * Whether a name `w` × `h` px, drawn where its shape puts it (nameSpot), lies inside the shape at `ppf` px a foot: each
 * corner of its box inside the shape's outline; for a path drawn as a line, within its band. A thin line (a fence, a
 * utility line, a trellis, a measuring line) has no inside: its name sits beside it, and a boundary's runs along it.
 */
export function nameInside(s: Shape, w: number, h: number, ppf: number): boolean {
  if (s.type === 'line' && !s.pathWidth) return false;
  if (s.role === 'boundary' && (s.type === 'poly' || s.type === 'line')) return false;
  if (s.type === 'text') return true;
  const { at, angle } = nameSpot(s);
  const hw = w / 2 / ppf, hh = h / 2 / ppf;
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => { const r = rotate(x, y, angle); return { x: at.x + r.x, y: at.y + r.y }; });
  if (s.type === 'line') {
    const pts = worldPoints(s), half = s.pathWidth! / 2 + 1e-6;
    return corners.every((c) => lineDistance(pts, c) <= half);
  }
  return corners.every((c) => pointInShape(s, c));
}
