import { PX_PER_FOOT_BASE } from './constants';
import { state } from './state';
import type { Bounds, Point, Shape, TriangleShape } from './types';

// ---- View transforms (depend on current zoom/offset) ----
export function pxPerFoot(): number { return PX_PER_FOOT_BASE * state.zoom; }

export function canvasRect(): DOMRect {
  const svg = document.getElementById('canvas-svg');
  if (!svg) throw new Error('canvas not mounted');
  return svg.getBoundingClientRect();
}
export function screenToFeet(clientX: number, clientY: number): Point {
  const rect = canvasRect();
  return {
    x: (clientX - rect.left) / pxPerFoot() + state.offsetX,
    y: (clientY - rect.top) / pxPerFoot() + state.offsetY
  };
}
export function viewCenterFeet(): Point {
  return {
    x: state.offsetX + state.canvasW / pxPerFoot() / 2,
    y: state.offsetY + state.canvasH / pxPerFoot() / 2
  };
}

// ---- Pure shape geometry (feet) ----
export function shapeCenter(s: Shape): Point {
  if (s.type === 'circle') return { x: s.x, y: s.y };
  return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
}
/** Rotate point (x, y) by `deg` degrees around the origin. */
export function rotate(x: number, y: number, deg: number): Point {
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}
/** Axis-aligned bounds of a w×h box centered at (cx, cy) rotated by `deg`. */
export function rotatedBoxBounds(cx: number, cy: number, w: number, h: number, deg: number): Bounds {
  const hw = w / 2, hh = h / 2;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
    const r = rotate(x, y, deg);
    minX = Math.min(minX, cx + r.x); maxX = Math.max(maxX, cx + r.x);
    minY = Math.min(minY, cy + r.y); maxY = Math.max(maxY, cy + r.y);
  }
  return { minX, maxX, minY, maxY };
}
/** Axis-aligned bounding box in feet, accounting for rotation. */
export function shapeBBox(s: Shape): Bounds {
  if (s.type === 'circle') {
    return { minX: s.x - s.radius, maxX: s.x + s.radius, minY: s.y - s.radius, maxY: s.y + s.radius };
  }
  if (!s.rotation) return { minX: s.x, maxX: s.x + s.width, minY: s.y, maxY: s.y + s.height };
  return rotatedBoxBounds(s.x + s.width / 2, s.y + s.height / 2, s.width, s.height, s.rotation);
}
export function unionBounds(list: Bounds[]): Bounds | null {
  if (!list.length) return null;
  return list.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY)
  }));
}
export function rectsIntersect(a: Bounds, b: Bounds): boolean {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}
/** Triangle vertices (unrotated), right angle at the chosen corner. */
export function trianglePoints(s: Pick<TriangleShape, 'x' | 'y' | 'width' | 'height' | 'rightAngle'>): [number, number][] {
  const x = s.x, y = s.y, w = s.width, h = s.height;
  switch (s.rightAngle) {
    case 'br': return [[x + w, y + h], [x, y + h], [x + w, y]];
    case 'tl': return [[x, y], [x + w, y], [x, y + h]];
    case 'tr': return [[x + w, y], [x, y], [x + w, y + h]];
    case 'bl':
    default:   return [[x, y + h], [x + w, y + h], [x, y]];
  }
}

// ---- Containment, area, perimeter (feet) ----
/** Point in the shape's own unrotated frame (relative to its box/circle). */
function toLocal(s: Shape, p: Point): Point {
  if (s.type === 'circle' || !s.rotation) return p;
  const c = shapeCenter(s);
  const r = rotate(p.x - c.x, p.y - c.y, -s.rotation);
  return { x: c.x + r.x, y: c.y + r.y };
}
export function pointInShape(s: Shape, p: Point): boolean {
  if (s.type === 'circle') return Math.hypot(p.x - s.x, p.y - s.y) <= s.radius;
  const q = toLocal(s, p);
  if (s.type === 'rect') return q.x >= s.x && q.x <= s.x + s.width && q.y >= s.y && q.y <= s.y + s.height;
  if (s.type === 'oval') {
    const rx = s.width / 2, ry = s.height / 2, cx = s.x + rx, cy = s.y + ry;
    return ((q.x - cx) / rx) ** 2 + ((q.y - cy) / ry) ** 2 <= 1;
  }
  const [a, b, c] = trianglePoints(s);
  const side = (p1: number[], p2: number[]) => (q.x - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (q.y - p2[1]);
  const d1 = side(a, b), d2 = side(b, c), d3 = side(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
export function shapeArea(s: Shape): number {
  if (s.type === 'circle') return Math.PI * s.radius ** 2;
  if (s.type === 'rect') return s.width * s.height;
  if (s.type === 'oval') return Math.PI * (s.width / 2) * (s.height / 2);
  return (s.width * s.height) / 2;
}
export function shapePerimeter(s: Shape): number {
  if (s.type === 'circle') return 2 * Math.PI * s.radius;
  if (s.type === 'rect') return 2 * (s.width + s.height);
  if (s.type === 'oval') { // Ramanujan's approximation
    const a = s.width / 2, b = s.height / 2;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  return s.width + s.height + Math.hypot(s.width, s.height);
}
/** Move a shape so its center lands at `c`. */
export function setCenter(s: Shape, c: Point) {
  if (s.type === 'circle') { s.x = c.x; s.y = c.y; return; }
  s.x = c.x - s.width / 2;
  s.y = c.y - s.height / 2;
}
