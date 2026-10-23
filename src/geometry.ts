import { PX_PER_FOOT_BASE } from './constants';
import { state } from './state';
import type { Bounds, CircleShape, PathShape, Point, Shape, TextShape, TriangleShape } from './types';

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
/** Width and height of any non-circle shape's box (for paths: of its points). */
export function boxSize(s: Exclude<Shape, CircleShape>): { w: number; h: number } {
  if (s.type === 'poly' || s.type === 'line') return pathSize(s.points);
  if (s.type === 'text') return textSize(s);
  return { w: s.width, h: s.height };
}
/** Average glyph width as a share of the font size (sans-serif); text boxes are estimates. */
const CHAR_WIDTH = 0.55;
/** Box of a text note, in feet: one line per line of text. */
export function textSize(s: Pick<TextShape, 'label' | 'fontSize'>): { w: number; h: number } {
  const lines = textLines(s.label);
  const longest = Math.max(...lines.map((l) => l.length));
  return { w: Math.max(s.fontSize, longest * CHAR_WIDTH * s.fontSize), h: lines.length * s.fontSize * LINE_HEIGHT };
}
export const LINE_HEIGHT = 1.25;
export function textLines(text: string): string[] {
  const lines = (text || 'Text').split('\n');
  return lines.length ? lines : ['Text'];
}
export function shapeCenter(s: Shape): Point {
  if (s.type === 'circle') return { x: s.x, y: s.y };
  const { w, h } = boxSize(s);
  return { x: s.x + w / 2, y: s.y + h / 2 };
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
  if (s.type === 'line' && s.pathWidth) { // a path's band reaches half its width past the center line
    const b = pointsBounds(worldPoints(s)), h = s.pathWidth / 2;
    return { minX: b.minX - h, maxX: b.maxX + h, minY: b.minY - h, maxY: b.maxY + h };
  }
  if (s.type === 'circle') {
    return { minX: s.x - s.radius, maxX: s.x + s.radius, minY: s.y - s.radius, maxY: s.y + s.radius };
  }
  const { w, h } = boxSize(s);
  if (!s.rotation) return { minX: s.x, maxX: s.x + w, minY: s.y, maxY: s.y + h };
  if (s.type === 'poly' || s.type === 'line') return pointsBounds(worldPoints(s));
  return rotatedBoxBounds(s.x + w / 2, s.y + h / 2, w, h, s.rotation);
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
  if (s.type === 'circle') {
    if (s.canopy) return pointInPolygon(s.canopy.map(([x, y]) => ({ x: s.x + x, y: s.y + y })), p);
    return Math.hypot(p.x - s.x, p.y - s.y) <= s.radius;
  }
  const q = toLocal(s, p);
  if (s.type === 'rect') return q.x >= s.x && q.x <= s.x + s.width && q.y >= s.y && q.y <= s.y + s.height;
  if (s.type === 'oval') {
    const rx = s.width / 2, ry = s.height / 2, cx = s.x + rx, cy = s.y + ry;
    return ((q.x - cx) / rx) ** 2 + ((q.y - cy) / ry) ** 2 <= 1;
  }
  if (s.type === 'line') return false; // a line has no inside
  if (s.type === 'text') { const { w, h } = textSize(s); return q.x >= s.x && q.x <= s.x + w && q.y >= s.y && q.y <= s.y + h; }
  if (s.type === 'poly') return pointInPolygon(pathPoints(s), q);
  const [a, b, c] = trianglePoints(s);
  const side = (p1: number[], p2: number[]) => (q.x - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (q.y - p2[1]);
  const d1 = side(a, b), d2 = side(b, c), d3 = side(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
export function shapeArea(s: Shape): number {
  if (s.type === 'circle') return s.canopy ? polygonArea(s.canopy) : Math.PI * s.radius ** 2;
  if (s.type === 'rect') return s.width * s.height;
  if (s.type === 'oval') return Math.PI * (s.width / 2) * (s.height / 2);
  if (s.type === 'poly') return polygonArea(s.points);
  if (s.type === 'line' || s.type === 'text') return 0;
  return (s.width * s.height) / 2;
}
export function shapePerimeter(s: Shape): number {
  if (s.type === 'circle') return s.canopy ? pathLength(s.canopy, true) : 2 * Math.PI * s.radius;
  if (s.type === 'rect') return 2 * (s.width + s.height);
  if (s.type === 'oval') { // Ramanujan's approximation
    const a = s.width / 2, b = s.height / 2;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  if (s.type === 'poly') return pathLength(s.points, true);
  if (s.type === 'line') return pathLength(s.points, false);
  if (s.type === 'text') return 0;
  return s.width + s.height + Math.hypot(s.width, s.height);
}
/**
 * Change a circle's radius. A shaped canopy grows or shrinks with it, about
 * the trunk, so its outline keeps reaching exactly the new radius. (Not
 * rounded: repeated resizes mustn't wear the shape down.)
 */
export function setRadius(s: CircleShape, radius: number) {
  if (s.canopy && s.radius > 0) {
    const k = radius / s.radius;
    s.canopy = s.canopy.map(([x, y]) => [x * k, y * k]);
  }
  s.radius = radius;
}
/** Move a shape so its center lands at `c`. */
export function setCenter(s: Shape, c: Point) {
  if (s.type === 'circle') { s.x = c.x; s.y = c.y; return; }
  const { w, h } = boxSize(s);
  s.x = c.x - w / 2;
  s.y = c.y - h / 2;
}

// ---- Freeform outlines and lines ----
export function pathSize(points: [number, number][]): { w: number; h: number } {
  let w = 0, h = 0;
  for (const [x, y] of points) { w = Math.max(w, x); h = Math.max(h, y); }
  return { w, h };
}
/** Points in world feet, before rotation. */
export function pathPoints(s: PathShape): Point[] {
  return s.points.map(([x, y]) => ({ x: s.x + x, y: s.y + y }));
}
/** Points in world feet, as drawn (rotation applied around the box center). */
export function worldPoints(s: PathShape): Point[] {
  const pts = pathPoints(s);
  if (!s.rotation) return pts;
  const c = shapeCenter(s);
  return pts.map((p) => { const r = rotate(p.x - c.x, p.y - c.y, s.rotation); return { x: c.x + r.x, y: c.y + r.y }; });
}
export function pointsBounds(pts: Point[]): Bounds {
  return {
    minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)),
  };
}
/** Shoelace formula. */
export function polygonArea(points: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}
export function pathLength(points: [number, number][], closed: boolean): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  if (closed && points.length > 2) len += Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]);
  return len;
}
/** Even-odd ray casting. */
export function pointInPolygon(poly: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/**
 * Set a path's points from world coordinates (unrotated), normalizing so the
 * box's top-left is (x, y) and the smallest point coordinates are 0.
 */
export function setWorldPoints(s: PathShape, world: Point[]) {
  const minX = Math.min(...world.map((p) => p.x)), minY = Math.min(...world.map((p) => p.y));
  s.x = round3(minX); s.y = round3(minY);
  s.points = world.map((p) => [round3(p.x - s.x), round3(p.y - s.y)]);
}
const round3 = (v: number) => Math.round(v * 1000) / 1000;
/** Apply a path's rotation to its points and reset rotation to 0 (before editing points). */
export function bakeRotation(s: PathShape) {
  if (!s.rotation) return;
  const pts = worldPoints(s);
  s.rotation = 0;
  setWorldPoints(s, pts);
}
/** Points scaled so the path's (unrotated) box is w × h, top-left corner fixed. */
export function resizedPoints(points: [number, number][], w: number, h: number): [number, number][] {
  const size = pathSize(points);
  const kx = size.w > 0 ? w / size.w : 1, ky = size.h > 0 ? h / size.h : 1;
  return points.map(([x, y]) => [round3(x * kx), round3(y * ky)]);
}
/**
 * The angle to write a box shape's name at (a bed, rectangle, oval or triangle; degrees, clockwise): along
 * whichever of its sides is nearer level, so it reads as upright as it can and never upside down. The shape's
 * turn, less any quarter turns: a bed drawn tall and turned on its side reads across, as it lies; one turned
 * 30° reads at 30°, one turned 60° at −30°, along its other side. An unturned shape's name stays level, as
 * before, at any zoom and in every export alike.
 */
export function boxLabelAngle(rotation: number): number {
  const a = ((rotation % 90) + 90) % 90; // (in [0, 90), however far and whichever way it is turned)
  return Math.round((a > 45 ? a - 90 : a) * 10) / 10 + 0;
}
/**
 * Where a label runs along a line (property lines, fences): the middle of the
 * longest straight run, turned to follow it and kept readable (never upside
 * down). `angle` is in degrees, clockwise.
 */
export function alongLabel(s: PathShape): { x: number; y: number; angle: number } {
  const pts = worldPoints(s);
  const n = s.type === 'poly' ? pts.length : pts.length - 1;
  let best = 0, bestLen = -1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen) { bestLen = len; best = i; }
  }
  const a = pts[best], b = pts[(best + 1) % pts.length];
  let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  if (angle > 90) angle -= 180;
  else if (angle <= -90) angle += 180;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: Math.round(angle * 10) / 10 + 0 };
}
/** Where to put a label: deep inside an outline, or a line's midpoint. */
export function pathLabelPoint(s: PathShape): Point {
  const pts = worldPoints(s);
  if (s.type === 'line') {
    const half = pathLength(s.points, false) / 2;
    let walked = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (walked + seg >= half && seg > 0) {
        const t = (half - walked) / seg;
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
      }
      walked += seg;
    }
    return pts[0];
  }
  // The point inside farthest from any edge (sampled), so the label sits in
  // the roomiest part: the middle of an L's thickest arm, not its inner corner.
  const b = pointsBounds(pts);
  const N = 16;
  let best: Point | null = null, bestD = -1;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = { x: b.minX + ((b.maxX - b.minX) * (i + 0.5)) / (N + 1), y: b.minY + ((b.maxY - b.minY) * (j + 0.5)) / (N + 1) };
      if (!pointInPolygon(pts, p)) continue;
      const d = edgeDistance(pts, p);
      if (d > bestD + 1e-9) { bestD = d; best = p; }
    }
  }
  return best ?? shapeCenter(s);
}
/** Distance from p to the nearest edge of a closed polygon. */
function edgeDistance(poly: Point[], p: Point): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    const dx = c.x - a.x, dy = c.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    min = Math.min(min, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return min;
}
/**
 * Outline of a rectangle, oval (24 sides) or triangle, in world feet, before
 * rotation. Its box matches the shape's box, so the same rotation applies.
 */
export function outlineOf(s: Exclude<Shape, CircleShape | PathShape | TextShape>): Point[] {
  let pts: [number, number][];
  if (s.type === 'rect') pts = [[s.x, s.y], [s.x + s.width, s.y], [s.x + s.width, s.y + s.height], [s.x, s.y + s.height]];
  else if (s.type === 'triangle') pts = trianglePoints(s);
  else {
    const rx = s.width / 2, ry = s.height / 2;
    pts = Array.from({ length: 24 }, (_, i) => {
      const t = (i / 24) * Math.PI * 2;
      return [s.x + rx + rx * Math.cos(t), s.y + ry + ry * Math.sin(t)] as [number, number];
    });
  }
  return pts.map(([x, y]) => ({ x, y }));
}

/** Feet for display: 12, 12.5 (one decimal, no trailing .0). */
export function fmtFeet(v: number): string { return String(Math.round(v * 10) / 10); }
/** The label as shown on the plan: dimension lines add their length. */
export function displayLabel(s: Shape): string {
  if (s.type === 'line' && s.showLength) {
    const len = fmtFeet(pathLength(s.points, false)) + ' ft';
    return s.label ? `${s.label} · ${len}` : len;
  }
  return s.label;
}

// ---- Lasso ----
/** A shape's outline in world feet, as drawn (rotation applied), and whether it's a closed loop. */
export function drawnOutline(s: Shape): { pts: Point[]; closed: boolean } | null {
  if (s.type === 'circle') {
    if (s.canopy) return { pts: s.canopy.map(([x, y]) => ({ x: s.x + x, y: s.y + y })), closed: true };
    return { pts: Array.from({ length: 32 }, (_, i) => { const t = (i / 32) * Math.PI * 2; return { x: s.x + s.radius * Math.cos(t), y: s.y + s.radius * Math.sin(t) }; }), closed: true };
  }
  if (s.type === 'text') return null;
  if (s.type === 'line' || s.type === 'poly') return { pts: worldPoints(s), closed: s.type === 'poly' };
  const c = shapeCenter(s);
  const pts = outlineOf(s).map((p) => { if (!s.rotation) return p; const r = rotate(p.x - c.x, p.y - c.y, s.rotation); return { x: c.x + r.x, y: c.y + r.y }; });
  return { pts, closed: true };
}
const inBox = (p: Point, b: Bounds) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
/** Whether segment a–b crosses one of the box's edges (or lies in it). */
function segmentTouchesBox(a: Point, b: Point, box: Bounds): boolean {
  if (inBox(a, box) || inBox(b, box)) return true;
  // Liang–Barsky clipping: does any part of the segment fall inside the box?
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - box.minX], [dx, box.maxX - a.x], [-dy, a.y - box.minY], [dy, box.maxY - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}
/**
 * Whether a lasso box picks this shape: the box touches what's drawn (an edge or a corner of it, or the whole
 * shape lies in the box). A box lying wholly inside a shape, not touching its edge, doesn't pick it: lassoing
 * plants within the property line, a bed or the lawn picks the plants, not what surrounds them.
 */
export function lassoTouches(s: Shape, box: Bounds): boolean {
  if (!rectsIntersect(shapeBBox(s), box)) return false;
  const o = drawnOutline(s);
  if (!o) return true; // (a text label: its box)
  // A path's band reaches half its width past its center line.
  const b = s.type === 'line' && s.pathWidth ? { minX: box.minX - s.pathWidth / 2, maxX: box.maxX + s.pathWidth / 2, minY: box.minY - s.pathWidth / 2, maxY: box.maxY + s.pathWidth / 2 } : box;
  const n = o.pts.length;
  for (let i = 0; i < (o.closed ? n : n - 1); i++) if (segmentTouchesBox(o.pts[i], o.pts[(i + 1) % n], b)) return true;
  return n === 1 && inBox(o.pts[0], b);
}
