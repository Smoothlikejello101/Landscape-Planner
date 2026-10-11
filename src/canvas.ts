import { renderBgHandles, renderBgImageInto } from './background';
import { AXIS_LABEL, BG_COLOR, GRID_MAJOR, GRID_MINOR } from './constants';
import { svgEl, type Attrs } from './dom';
import { pxPerFoot, trianglePoints } from './geometry';
import { onShapePointerDown } from './gestures';
import { isSelected } from './selection';
import { state } from './state';
import type { Shape } from './types';

// Canvas drawing. Everything here writes only into the <svg>, never into
// panel DOM, so it is safe to call while an input has keyboard focus.

export function renderGrid(svg: SVGSVGElement) {
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
  // grid stays visible as a scale reference while tracing.
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

export function renderOneShape(svg: SVGSVGElement, s: Shape) {
  const ppf = pxPerFoot();
  const sel = isSelected(s.id);
  const common: Attrs = {
    'data-shape-id': s.id,
    fill: s.color,
    'fill-opacity': s.opacity ?? 0.65,
    stroke: sel ? '#0f172a' : 'rgba(0,0,0,0.3)',
    'stroke-width': sel ? 2 : 1,
    style: `cursor:${s.locked ? 'pointer' : 'move'};touch-action:none;`,
    'stroke-dasharray': s.locked ? '4 2' : null,
  };
  let shapeEl: SVGElement;
  let labelX: number, labelY: number, fs: number, rotTransform = '';

  if (s.type === 'circle') {
    const cx = (s.x - state.offsetX) * ppf;
    const cy = (s.y - state.offsetY) * ppf;
    const r = s.radius * ppf;
    shapeEl = svgEl('circle', { ...common, cx, cy, r });
    labelX = cx; labelY = cy;
    fs = Math.max(10, Math.min(14, r * 0.4));
  } else {
    const px = (s.x - state.offsetX) * ppf;
    const py = (s.y - state.offsetY) * ppf;
    const w = s.width * ppf, h = s.height * ppf;
    const cx = px + w / 2, cy = py + h / 2;
    rotTransform = s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : '';
    if (rotTransform) common.transform = rotTransform;
    if (s.type === 'rect') {
      shapeEl = svgEl('rect', { ...common, x: px, y: py, width: w, height: h });
    } else if (s.type === 'oval') {
      shapeEl = svgEl('ellipse', { ...common, cx, cy, rx: w / 2, ry: h / 2 });
    } else {
      const pts = trianglePoints(s).map((p) => `${(p[0] - state.offsetX) * ppf},${(p[1] - state.offsetY) * ppf}`).join(' ');
      shapeEl = svgEl('polygon', { ...common, points: pts });
    }
    labelX = cx; labelY = cy;
    fs = Math.max(10, Math.min(14, Math.min(w, h) * 0.2));
  }
  shapeEl.addEventListener('pointerdown', (e) => onShapePointerDown(e as PointerEvent, s));
  svg.appendChild(shapeEl);
  if (s.label) {
    svg.appendChild(svgEl('text', {
      x: labelX, y: labelY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': fs, fill: '#0f172a', 'pointer-events': 'none',
      style: 'user-select:none;font-weight:500;',
      transform: rotTransform || null,
    }, s.label));
  }
}

/** Shapes in paint order: locked (background) tier first, then unlocked. */
export function paintOrder(shapes: Shape[]): Shape[] {
  return [...shapes].sort((a, b) => (a.locked ? 0 : 1) - (b.locked ? 0 : 1));
}

export function renderShapes(svg: SVGSVGElement) {
  for (const s of paintOrder(state.shapes)) renderOneShape(svg, s);
  if (state.marquee) {
    const m = state.marquee;
    const ppf = pxPerFoot();
    svg.appendChild(svgEl('rect', {
      x: (Math.min(m.x1, m.x2) - state.offsetX) * ppf,
      y: (Math.min(m.y1, m.y2) - state.offsetY) * ppf,
      width: Math.abs(m.x2 - m.x1) * ppf, height: Math.abs(m.y2 - m.y1) * ppf,
      fill: 'rgba(5,150,105,0.1)', stroke: '#059669', 'stroke-width': 1.5,
      'stroke-dasharray': '5 3', 'pointer-events': 'none'
    }));
  }
}

function canvasSvg(): SVGSVGElement | null {
  return document.getElementById('canvas-svg') as SVGSVGElement | null;
}

/** Clear and redraw the canvas contents only. Never touches panel DOM. */
export function redrawCanvas() {
  const svg = canvasSvg();
  if (!svg) return;
  svg.replaceChildren();
  renderGrid(svg);
  renderShapes(svg);
  renderBgHandles(svg);
}

/**
 * Size the canvas to its container and redraw. Window resizes call this, never
 * the full render(): Android fires a resize when the keyboard opens, and a
 * full render would destroy the input being typed into.
 */
export function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const svg = canvasSvg();
  if (!wrap || !svg) return;
  const rect = wrap.getBoundingClientRect();
  state.canvasW = Math.max(100, Math.round(rect.width));
  state.canvasH = Math.max(100, Math.round(rect.height));
  svg.setAttribute('width', String(state.canvasW));
  svg.setAttribute('height', String(state.canvasH));
  redrawCanvas();
}
