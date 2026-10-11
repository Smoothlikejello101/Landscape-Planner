import { PX_PER_FOOT_BASE } from './constants';
import { state } from './state';

// ============================================================
// GEOMETRY HELPERS
// ============================================================
export function pxPerFoot() { return PX_PER_FOOT_BASE * state.zoom; }
export function screenToFeet(clientX, clientY) {
  const rect = document.getElementById('canvas-svg').getBoundingClientRect();
  return {
    x: (clientX - rect.left) / pxPerFoot() + state.offsetX,
    y: (clientY - rect.top) / pxPerFoot() + state.offsetY
  };
}
export function viewCenterFeet() {
  return {
    x: state.offsetX + state.canvasW / pxPerFoot() / 2,
    y: state.offsetY + state.canvasH / pxPerFoot() / 2
  };
}
export function shapeCenter(s) {
  if (s.type === 'circle') return { x: s.x, y: s.y };
  return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
}
export function shapeBBox(s) {
  // Axis-aligned bounding box in feet, accounting for rotation
  if (s.type === 'circle') {
    return { minX: s.x - s.radius, maxX: s.x + s.radius, minY: s.y - s.radius, maxY: s.y + s.radius };
  }
  const w = s.width, h = s.height;
  if (!s.rotation) {
    return { minX: s.x, maxX: s.x + w, minY: s.y, maxY: s.y + h };
  }
  const cx = s.x + w / 2, cy = s.y + h / 2;
  const rad = s.rotation * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const hw = w / 2, hh = h / 2;
  const corners = [
    { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of corners) {
    const rx = c.x * cos - c.y * sin;
    const ry = c.x * sin + c.y * cos;
    minX = Math.min(minX, cx + rx);
    maxX = Math.max(maxX, cx + rx);
    minY = Math.min(minY, cy + ry);
    maxY = Math.max(maxY, cy + ry);
  }
  return { minX, maxX, minY, maxY };
}
export function rectsIntersect(a, b) {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}
// Triangle vertex generator for rendering and export
export function trianglePoints(s) {
  const x = s.x, y = s.y, w = s.width, h = s.height;
  switch (s.rightAngle) {
    case 'br': return [[x + w, y + h], [x, y + h], [x + w, y]];
    case 'tl': return [[x, y], [x + w, y], [x, y + h]];
    case 'tr': return [[x + w, y], [x, y], [x + w, y + h]];
    case 'bl':
    default:   return [[x, y + h], [x + w, y + h], [x, y]];
  }
}
