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
