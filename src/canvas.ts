import { renderBgHandles, renderBgImageInto } from './background';
import { AXIS_LABEL, BG_COLOR, GRID_MAJOR, GRID_MINOR, PX_PER_FOOT_BASE } from './constants';
import { svgEl, type Attrs } from './dom';
import { pxPerFoot, trianglePoints } from './geometry';
import { onShapePointerDown } from './gestures';
import { isSelected } from './selection';
import { state } from './state';
import type { Shape } from './types';

// Canvas drawing. Everything here writes only into the <svg>, never into
// panel DOM, so it is safe to call while an input has keyboard focus.
//
// The canvas is a stack of layers so gestures can update just what changed:
//   base     tan background rect (the pan/marquee hit target)
//   bg       background image
//   grid     grid lines and axis labels
//   shapes   one <g> per shape (shape + label), then the marquee
//   handles  background edit outline/handle, calibration markers
// During a pan or pinch the bg/shapes/handles layers are moved with a
// transform and only the grid is redrawn; the full redraw happens on release.

type Layer = 'base' | 'bg' | 'grid' | 'shapes' | 'handles';
const LAYERS: Layer[] = ['base', 'bg', 'grid', 'shapes', 'handles'];
const SCENE_LAYERS: Layer[] = ['bg', 'shapes', 'handles'];

/** The view the scene layers were last drawn with (for gesture previews). */
let drawnView = { offsetX: 0, offsetY: 0, zoom: 1 };

function canvasSvg(): SVGSVGElement | null {
  return document.getElementById('canvas-svg') as SVGSVGElement | null;
}
function layer(svg: SVGSVGElement, name: Layer): SVGGElement {
  let g = svg.querySelector<SVGGElement>(`:scope > g[data-layer="${name}"]`);
  if (!g) {
    g = svgEl('g', { 'data-layer': name });
    svg.appendChild(g);
  }
  return g;
}
function ensureLayers(svg: SVGSVGElement) {
  const ok = svg.children.length === LAYERS.length &&
    LAYERS.every((name, i) => (svg.children[i] as SVGElement).dataset.layer === name);
  if (!ok) {
    svg.replaceChildren();
    for (const name of LAYERS) layer(svg, name);
  }
}

export function renderGrid(g: SVGElement) {
  const w = state.canvasW, h = state.canvasH;
  const ppf = pxPerFoot();
  const startFx = Math.floor(state.offsetX);
  const endFx = Math.ceil(state.offsetX + w / ppf);
  const startFy = Math.floor(state.offsetY);
  const endFy = Math.ceil(state.offsetY + h / ppf);
  const minorEvery = ppf < 10 ? 5 : 1;
  const majorEvery = 10;
  // Lines ignore pointers so a touch landing exactly on one still pans.
  for (let fx = startFx; fx <= endFx; fx++) {
    if (fx % minorEvery !== 0 && fx % majorEvery !== 0) continue;
    const px = (fx - state.offsetX) * ppf;
    const isMajor = fx % majorEvery === 0;
    g.appendChild(svgEl('line', { x1: px, y1: 0, x2: px, y2: h, stroke: isMajor ? GRID_MAJOR : GRID_MINOR, 'stroke-width': isMajor ? 1 : 0.5, 'pointer-events': 'none' }));
  }
  for (let fy = startFy; fy <= endFy; fy++) {
    if (fy % minorEvery !== 0 && fy % majorEvery !== 0) continue;
    const py = (fy - state.offsetY) * ppf;
    const isMajor = fy % majorEvery === 0;
    g.appendChild(svgEl('line', { x1: 0, y1: py, x2: w, y2: py, stroke: isMajor ? GRID_MAJOR : GRID_MINOR, 'stroke-width': isMajor ? 1 : 0.5, 'pointer-events': 'none' }));
  }
  if (ppf >= 6) {
    for (let fx = startFx; fx <= endFx; fx++) {
      if (fx % majorEvery !== 0) continue;
      const px = (fx - state.offsetX) * ppf;
      g.appendChild(svgEl('text', { x: px + 2, y: 10, 'font-size': 10, fill: AXIS_LABEL, 'pointer-events': 'none' }, fx + "'"));
    }
    for (let fy = startFy; fy <= endFy; fy++) {
      if (fy % majorEvery !== 0) continue;
      const py = (fy - state.offsetY) * ppf;
      g.appendChild(svgEl('text', { x: 2, y: py + 10, 'font-size': 10, fill: AXIS_LABEL, 'pointer-events': 'none' }, fy + "'"));
    }
  }
}

/** A shape and its label, wrapped in a group so it can be redrawn alone. */
export function shapeGroup(s: Shape): SVGGElement {
  const ppf = pxPerFoot();
  const sel = isSelected(s.id);
  const inert = state.bgEditMode || !!state.bgCalibrate; // taps fall through to the background tools
  const common: Attrs = {
    'data-shape-id': s.id,
    fill: s.color,
    'fill-opacity': s.opacity ?? 0.65,
    stroke: sel ? '#0f172a' : 'rgba(0,0,0,0.3)',
    'stroke-width': sel ? 2 : 1,
    style: `cursor:${s.locked ? 'pointer' : 'move'};touch-action:none;`,
    'stroke-dasharray': s.locked ? '4 2' : null,
    'pointer-events': inert ? 'none' : null,
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
  const g = svgEl('g', { 'data-shape-group': s.id }, shapeEl);
  if (s.label) {
    g.appendChild(svgEl('text', {
      x: labelX, y: labelY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': fs, fill: '#0f172a', 'pointer-events': 'none',
      style: 'user-select:none;font-weight:500;',
      transform: rotTransform || null,
    }, s.label));
  }
  return g;
}

/** Shapes in paint order: locked (background) tier first, then unlocked. */
export function paintOrder(shapes: Shape[]): Shape[] {
  return [...shapes].sort((a, b) => (a.locked ? 0 : 1) - (b.locked ? 0 : 1));
}

function marqueeRect(): SVGRectElement | null {
  const m = state.marquee;
  if (!m) return null;
  const ppf = pxPerFoot();
  return svgEl('rect', {
    'data-role': 'marquee',
    x: (Math.min(m.x1, m.x2) - state.offsetX) * ppf,
    y: (Math.min(m.y1, m.y2) - state.offsetY) * ppf,
    width: Math.abs(m.x2 - m.x1) * ppf, height: Math.abs(m.y2 - m.y1) * ppf,
    fill: 'rgba(5,150,105,0.1)', stroke: '#059669', 'stroke-width': 1.5,
    'stroke-dasharray': '5 3', 'pointer-events': 'none'
  });
}

/** Clear and redraw the whole canvas. Never touches panel DOM. */
export function redrawCanvas() {
  const svg = canvasSvg();
  if (!svg) return;
  ensureLayers(svg);
  const w = state.canvasW, h = state.canvasH;
  layer(svg, 'base').replaceChildren(svgEl('rect', { 'data-role': 'grid', x: 0, y: 0, width: w, height: h, fill: BG_COLOR }));
  for (const name of SCENE_LAYERS) {
    const g = layer(svg, name);
    g.removeAttribute('transform');
    g.replaceChildren();
  }
  renderBgImageInto(layer(svg, 'bg'));
  const grid = layer(svg, 'grid');
  grid.replaceChildren();
  renderGrid(grid);
  const shapes = layer(svg, 'shapes');
  for (const s of paintOrder(state.shapes)) shapes.appendChild(shapeGroup(s));
  const mq = marqueeRect();
  if (mq) shapes.appendChild(mq);
  renderBgHandles(layer(svg, 'handles'));
  drawnView = { offsetX: state.offsetX, offsetY: state.offsetY, zoom: state.zoom };
}

/**
 * Show the current pan/zoom by transforming the already-drawn scene and
 * redrawing only the grid. Cheap enough to run on every pointer move.
 */
export function previewView() {
  const svg = canvasSvg();
  if (!svg || svg.children.length !== LAYERS.length) { redrawCanvas(); return; }
  const k = state.zoom / drawnView.zoom;
  const ppf = PX_PER_FOOT_BASE * state.zoom;
  const tx = (drawnView.offsetX - state.offsetX) * ppf;
  const ty = (drawnView.offsetY - state.offsetY) * ppf;
  const transform = `translate(${tx} ${ty}) scale(${k})`;
  for (const name of SCENE_LAYERS) layer(svg, name).setAttribute('transform', transform);
  const grid = layer(svg, 'grid');
  grid.replaceChildren();
  renderGrid(grid);
}

/** Redraw only the given shapes (e.g. while dragging them). */
export function redrawShapes(ids: string[]) {
  const svg = canvasSvg();
  if (!svg || svg.children.length !== LAYERS.length || drawnView.zoom !== state.zoom ||
      drawnView.offsetX !== state.offsetX || drawnView.offsetY !== state.offsetY) { redrawCanvas(); return; }
  const shapes = layer(svg, 'shapes');
  for (const id of ids) {
    const s = state.shapes.find((sh) => sh.id === id);
    const old = shapes.querySelector(`:scope > g[data-shape-group="${CSS.escape(id)}"]`);
    if (s && old) old.replaceWith(shapeGroup(s));
  }
}

/** Redraw only the marquee rectangle. */
export function redrawMarquee() {
  const svg = canvasSvg();
  if (!svg || svg.children.length !== LAYERS.length) { redrawCanvas(); return; }
  const shapes = layer(svg, 'shapes');
  shapes.querySelector(':scope > [data-role="marquee"]')?.remove();
  const mq = marqueeRect();
  if (mq) shapes.appendChild(mq);
}

/** Redraw only the background image and its handles. */
export function redrawBackground() {
  const svg = canvasSvg();
  if (!svg || svg.children.length !== LAYERS.length) { redrawCanvas(); return; }
  const bg = layer(svg, 'bg'), handles = layer(svg, 'handles');
  bg.replaceChildren(); handles.replaceChildren();
  renderBgImageInto(bg);
  renderBgHandles(handles);
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
