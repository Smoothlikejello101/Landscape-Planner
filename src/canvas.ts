import { renderBgHandles, renderBgImageInto } from './background';
import { AXIS_LABEL, BG_COLOR, GRID_MAJOR, GRID_MINOR } from './constants';
import { svgEl } from './dom';
import { pxPerFoot, trianglePoints } from './geometry';
import { onShapePointerDown } from './gestures';
import { isSelected } from './selection';
import { state } from './state';

// ============================================================
// CANVAS RENDERING
// ============================================================
export function renderGrid(svg) {
  const w = state.canvasW, h = state.canvasH;
  const ppf = pxPerFoot();
  const startFx = Math.floor(state.offsetX);
  const endFx = Math.ceil(state.offsetX + w / ppf);
  const startFy = Math.floor(state.offsetY);
  const endFy = Math.ceil(state.offsetY + h / ppf);
  const minorEvery = ppf < 10 ? 5 : 1;
  const majorEvery = 10;
  svg.appendChild(svgEl('rect', { 'data-role': 'grid', x: 0, y: 0, width: w, height: h, fill: BG_COLOR }));
  // Background image sits above the tan base but below grid lines, so the
  // grid stays visible as a scale reference while the user traces.
  renderBgImageInto(svg);
  for (let fx = startFx; fx <= endFx; fx++) {
    if (fx % minorEvery !== 0 && fx % majorEvery !== 0) continue;
    const px = (fx - state.offsetX) * ppf;
    const isMajor = fx % majorEvery === 0;
    svg.appendChild(svgEl('line', { x1: px, y1: 0, x2: px, y2: h, stroke: isMajor ? GRID_MAJOR : GRID_MINOR, 'stroke-width': isMajor ? 1 : 0.5 }));
  }
  for (let fy = startFy; fy <= endFy; fy++) {
    if (fy % minorEvery !== 0 && fy % majorEvery !== 0) continue;
    const py = (fy - state.offsetY) * ppf;
    const isMajor = fy % majorEvery === 0;
    svg.appendChild(svgEl('line', { x1: 0, y1: py, x2: w, y2: py, stroke: isMajor ? GRID_MAJOR : GRID_MINOR, 'stroke-width': isMajor ? 1 : 0.5 }));
  }
  if (ppf >= 6) {
    for (let fx = startFx; fx <= endFx; fx++) {
      if (fx % majorEvery !== 0) continue;
      const px = (fx - state.offsetX) * ppf;
      svg.appendChild(svgEl('text', { x: px + 2, y: 10, 'font-size': 10, fill: AXIS_LABEL, 'pointer-events': 'none' }, fx + "'"));
    }
    for (let fy = startFy; fy <= endFy; fy++) {
      if (fy % majorEvery !== 0) continue;
      const py = (fy - state.offsetY) * ppf;
      svg.appendChild(svgEl('text', { x: 2, y: py + 10, 'font-size': 10, fill: AXIS_LABEL, 'pointer-events': 'none' }, fy + "'"));
    }
  }
}

export function renderOneShape(svg, s) {
  const ppf = pxPerFoot();
  const sel = isSelected(s.id);
  const stroke = sel ? '#0f172a' : 'rgba(0,0,0,0.3)';
  const strokeWidth = sel ? 2 : 1;
  const opacity = s.opacity !== undefined ? s.opacity : 0.65;
  const cursor = s.locked ? 'pointer' : 'move';
  const dashAttrs = s.locked ? { 'stroke-dasharray': '4 2' } : {};
  let shapeEl, labelX, labelY, fs, rotTransform = '';

  if (s.type === 'circle') {
    const cx = (s.x - state.offsetX) * ppf;
    const cy = (s.y - state.offsetY) * ppf;
    const r = s.radius * ppf;
    shapeEl = svgEl('circle', Object.assign({
      cx, cy, r, fill: s.color, 'fill-opacity': opacity,
      stroke, 'stroke-width': strokeWidth,
      style: `cursor:${cursor};touch-action:none;`
    }, dashAttrs));
    labelX = cx; labelY = cy;
    fs = Math.max(10, Math.min(14, r * 0.4));
  } else {
    const px = (s.x - state.offsetX) * ppf;
    const py = (s.y - state.offsetY) * ppf;
    const w = s.width * ppf, h = s.height * ppf;
    const cx = px + w / 2, cy = py + h / 2;
    rotTransform = s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : '';
    const common = Object.assign({
      fill: s.color, 'fill-opacity': opacity,
      stroke, 'stroke-width': strokeWidth,
      style: `cursor:${cursor};touch-action:none;`
    }, dashAttrs);
    if (rotTransform) common.transform = rotTransform;
    if (s.type === 'rect') {
      shapeEl = svgEl('rect', Object.assign({ x: px, y: py, width: w, height: h }, common));
    } else if (s.type === 'oval') {
      shapeEl = svgEl('ellipse', Object.assign({ cx, cy, rx: w / 2, ry: h / 2 }, common));
    } else if (s.type === 'triangle') {
      const pts = trianglePoints(s).map(p => `${(p[0] - state.offsetX) * ppf},${(p[1] - state.offsetY) * ppf}`).join(' ');
      shapeEl = svgEl('polygon', Object.assign({ points: pts }, common));
    }
    labelX = cx; labelY = cy;
    fs = Math.max(10, Math.min(14, Math.min(w, h) * 0.2));
  }
  if (shapeEl) {
    shapeEl.addEventListener('pointerdown', (e) => onShapePointerDown(e, s));
    svg.appendChild(shapeEl);
  }
  if (s.label) {
    const textAttrs = {
      x: labelX, y: labelY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': fs, fill: '#0f172a', 'pointer-events': 'none',
      style: 'user-select:none;font-weight:500;'
    };
    if (rotTransform) textAttrs.transform = rotTransform;
    svg.appendChild(svgEl('text', textAttrs, s.label));
  }
}

export function renderShapes(svg) {
  const sorted = [...state.shapes].sort((a, b) => (a.locked ? 0 : 1) - (b.locked ? 0 : 1));
  for (const s of sorted) renderOneShape(svg, s);
  // Marquee overlay
  if (state.marquee) {
    const m = state.marquee;
    const ppf = pxPerFoot();
    const x = Math.min(m.x1, m.x2);
    const y = Math.min(m.y1, m.y2);
    const w = Math.abs(m.x2 - m.x1);
    const h = Math.abs(m.y2 - m.y1);
    svg.appendChild(svgEl('rect', {
      x: (x - state.offsetX) * ppf,
      y: (y - state.offsetY) * ppf,
      width: w * ppf, height: h * ppf,
      fill: 'rgba(5,150,105,0.1)', stroke: '#059669', 'stroke-width': 1.5,
      'stroke-dasharray': '5 3', 'pointer-events': 'none'
    }));
  }
}

// ============================================================
// RESIZE (CANVAS-ONLY — preserves Android keyboard fix)
// ============================================================
export function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const svg = document.getElementById('canvas-svg');
  if (!wrap || !svg) return;
  const rect = wrap.getBoundingClientRect();
  state.canvasW = Math.max(100, Math.round(rect.width));
  state.canvasH = Math.max(100, Math.round(rect.height));
  svg.setAttribute('width', state.canvasW);
  svg.setAttribute('height', state.canvasH);
  // Clear and redraw only the SVG contents (grid + shapes + bg handles) — do not touch panel DOM
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  renderGrid(svg);
  renderShapes(svg);
  renderBgHandles(svg);
}
