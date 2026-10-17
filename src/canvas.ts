import { renderBgHandles, renderBgImageInto } from './background';
import { AXIS_LABEL, BG_COLOR, GRID_MAJOR, GRID_MINOR, PX_PER_FOOT_BASE } from './constants';
import { svgEl, type Attrs } from './dom';
import { boxSize, shapeBBox, displayLabel, LINE_HEIGHT, pathLabelPoint, pxPerFoot, textLines, textSize, trianglePoints, worldPoints } from './geometry';
import { renderPathOverlay } from './draw';
import { fullRingRadius } from './my-plants';
import { crowdedIds } from './crowding';
import { renderPlaceOverlay } from './place';
import { onShapePointerDown } from './gestures';
import { plantsById } from './plants';
import { isLocked, roleDef, roleRank } from './roles';
import { shownWith } from './status';
import { checkPlantSun, formatHours, shadeOpacity, sunHours, sunWarningShown } from './sun';
import { isSelected } from './selection';
import { state } from './state';
import type { Shape, ShapeFilter, TextShape } from './types';

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
  // Taps fall through to the background tools / drawing / point editing.
  const inert = state.bgEditMode || !!state.bgCalibrate || !!state.draw || !!state.editPoints || !!state.placing;
  // Boundaries and open lines: a stroke, no fill.
  const outline = s.type === 'line' || (s.role ? !!roleDef(s.role).outline : false);
  const dashed = s.role ? !!roleDef(s.role).outline : false;
  const common: Attrs = {
    'data-shape-id': s.id,
    fill: outline ? 'none' : s.color,
    // Shade with recorded sun: darker for less sun.
    'fill-opacity': outline ? null : s.role === 'shade' && s.sun ? shadeOpacity(s.sun) : s.opacity ?? 0.65,
    stroke: outline ? s.color : sel ? '#0f172a' : 'rgba(0,0,0,0.3)',
    'stroke-width': outline ? (sel ? 3.5 : 2.5) : sel ? 2 : 1,
    style: `cursor:${isLocked(s) ? 'grab' : 'move'};touch-action:none;`,
    'stroke-dasharray': dashed ? '8 4' : s.locked ? '4 2' : null,
    'pointer-events': inert ? 'none' : null,
  };
  // Status: planned = lighter with a dashed edge; to remove = red edge; gone (when shown) = faint ghost.
  if (s.status === 'planned' && !outline) {
    common['fill-opacity'] = Number(common['fill-opacity'] ?? 0.65) * 0.5;
    common['stroke-dasharray'] = '6 4';
    common.stroke = sel ? '#0f172a' : s.color;
    common['stroke-width'] = sel ? 2.5 : 2;
  } else if (s.status === 'remove') {
    common.stroke = '#dc2626';
    common['stroke-width'] = sel ? 3 : 2;
  } else if (s.status === 'gone') {
    common.opacity = 0.35;
    common['stroke-dasharray'] = '2 3';
  }
  if (s.type === 'text') return textGroup(s, sel, inert, common);
  let shapeEl: SVGElement;
  let hitEl: SVGElement | null = null;
  let ring: SVGElement | null = null;
  const g0: SVGElement[] = [];
  let labelX: number, labelY: number, fs: number, rotTransform = '';

  if (s.type === 'circle') {
    const cx = (s.x - state.offsetX) * ppf;
    const cy = (s.y - state.offsetY) * ppf;
    const r = s.radius * ppf;
    shapeEl = svgEl('circle', { ...common, cx, cy, r });
    // Plants drawn below full size: a dashed ring at full size when selected (or for all, from Layers).
    // While placing more of a plant, its full spread shows so the next one can be spaced by eye.
    const full = (sel && state.selectedIds.length === 1) || state.showFullSize || (state.placing && s.plantId === state.placing.plantId) ? fullRingRadius(s) : null;
    if (crowded.has(s.id)) {
      g0.push(svgEl('circle', { 'data-role': 'crowded', cx, cy, r: r + 4, fill: 'none', stroke: '#dc2626', 'stroke-width': 2.5, 'pointer-events': 'none' }));
    }
    if (full) ring = svgEl('circle', { 'data-role': 'full-ring', cx, cy, r: full * ppf, fill: 'none', stroke: s.color, 'stroke-width': 1.5, 'stroke-dasharray': '5 4', 'pointer-events': 'none' });
    labelX = cx; labelY = cy;
    fs = Math.max(10, Math.min(14, r * 0.4));
  } else if (s.type === 'poly' || s.type === 'line') {
    const pts = worldPoints(s).map((p) => `${(p.x - state.offsetX) * ppf},${(p.y - state.offsetY) * ppf}`).join(' ');
    if (s.type === 'poly') {
      shapeEl = svgEl('polygon', { ...common, points: pts, 'stroke-linejoin': 'round' });
    } else if (s.pathWidth) {
      // A path: a band at its real width, with a thin center line while selected.
      shapeEl = svgEl('polyline', {
        ...common, points: pts, fill: 'none', stroke: s.status === 'remove' ? '#dc2626' : s.color, 'stroke-opacity': s.status === 'planned' ? 0.5 * (s.opacity ?? 0.65) : s.opacity ?? 0.65,
        'stroke-width': Math.max(2, s.pathWidth * ppf), 'stroke-linejoin': 'round', 'stroke-linecap': 'butt', 'stroke-dasharray': null, 'pointer-events': 'none',
      });
      if (sel) g0.push(svgEl('polyline', { 'data-role': 'path-center', points: pts, fill: 'none', stroke: '#0f172a', 'stroke-width': 1.5, 'stroke-dasharray': '6 4', 'pointer-events': 'none' }));
      hitEl = svgEl('polyline', {
        'data-shape-id': s.id, 'data-role': 'line-hit', points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(18, s.pathWidth * ppf),
        'stroke-linejoin': 'round', style: common.style, 'pointer-events': inert ? 'none' : 'stroke',
      });
    } else {
      // A thin line is hard to hit with a finger: a wide invisible stroke takes the taps.
      shapeEl = svgEl('polyline', { ...common, points: pts, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'pointer-events': 'none' });
      hitEl = svgEl('polyline', {
        'data-shape-id': s.id, 'data-role': 'line-hit', points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': 18,
        'stroke-linecap': 'round', style: common.style, 'pointer-events': inert ? 'none' : 'stroke',
      });
    }
    const lp = pathLabelPoint(s);
    labelX = (lp.x - state.offsetX) * ppf; labelY = (lp.y - state.offsetY) * ppf;
    const { w, h } = boxSize(s);
    fs = s.type === 'line' ? 12 : Math.max(10, Math.min(14, Math.min(w, h) * ppf * 0.2));
    if (s.type === 'line' && !s.pathWidth) labelY -= 10; // above a thin line, not on it (a path's label sits on it)
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
  const target = hitEl ?? shapeEl;
  target.addEventListener('pointerdown', (e) => onShapePointerDown(e as PointerEvent, s));
  const g = svgEl('g', { 'data-shape-group': s.id }, shapeEl);
  if (hitEl) g.appendChild(hitEl);
  if (ring) g.appendChild(ring);
  for (const x of g0) g.appendChild(x);
  // Dimension lines get end ticks, like a drawing's dimension.
  if (s.type === 'line' && s.showLength) {
    const pts = worldPoints(s).map((p) => ({ x: (p.x - state.offsetX) * ppf, y: (p.y - state.offsetY) * ppf }));
    for (const [a, b] of [[pts[0], pts[1]], [pts.at(-1)!, pts.at(-2)!]]) {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = (-(b.y - a.y) / len) * 7, ny = ((b.x - a.x) / len) * 7;
      g.appendChild(svgEl('line', { 'data-role': 'dim-tick', x1: a.x - nx, y1: a.y - ny, x2: a.x + nx, y2: a.y + ny, stroke: s.color, 'stroke-width': 2, 'pointer-events': 'none' }));
    }
  }
  const sunText = s.role === 'shade' && s.sun ? '☀ ' + formatHours(sunHours(s.sun)) : '';
  const label = repeatLabels.has(s.id) && !(sel && state.selectedIds.length === 1) ? '' : displayLabel(s);
  if (label) {
    g.appendChild(svgEl('text', {
      x: labelX, y: sunText ? labelY - fs * 0.6 : labelY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': fs, fill: '#0f172a', 'pointer-events': 'none',
      style: 'user-select:none;font-weight:500;',
      transform: rotTransform || null,
    }, label));
  }
  if (sunText) {
    g.appendChild(svgEl('text', {
      x: labelX, y: label ? labelY + fs * 0.7 : labelY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': Math.max(10, fs * 0.85), fill: '#1e293b', 'pointer-events': 'none', 'data-role': 'sun-label',
      style: 'user-select:none;', transform: rotTransform || null,
    }, sunText));
  }
  // To remove: a red cross over the shape. To move: a blue arrow badge.
  if (s.status === 'remove' || s.status === 'move') {
    const b = shapeBBox(s);
    const x1 = (b.minX - state.offsetX) * ppf, x2 = (b.maxX - state.offsetX) * ppf;
    const y1 = (b.minY - state.offsetY) * ppf, y2 = (b.maxY - state.offsetY) * ppf;
    if (s.status === 'remove') {
      const k = s.type === 'circle' ? 0.146 : 0; // keep the cross inside a circle
      const ix = (x2 - x1) * k, iy = (y2 - y1) * k;
      g.appendChild(svgEl('path', {
        'data-role': 'status-remove', d: `M${x1 + ix},${y1 + iy}L${x2 - ix},${y2 - iy}M${x2 - ix},${y1 + iy}L${x1 + ix},${y2 - iy}`,
        stroke: '#dc2626', 'stroke-width': 2, 'stroke-linecap': 'round', 'pointer-events': 'none', opacity: 0.85,
      }));
    } else {
      const bx = x1 + 2, by = y1 + 2;
      g.appendChild(svgEl('g', { 'data-role': 'status-move', 'pointer-events': 'none' },
        svgEl('circle', { cx: bx, cy: by, r: 9, fill: '#2563eb', stroke: '#fff', 'stroke-width': 1.5 }),
        svgEl('path', { d: `M${bx - 4.5},${by}h9M${bx + 1.5},${by - 3}l3,3l-3,3M${bx - 1.5},${by - 3}l-3,3l3,3`, stroke: '#fff', 'stroke-width': 1.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })));
    }
  }
  // Plants whose spot doesn't match their sun needs get a small warning badge.
  if (s.role === 'plant' && s.plantId) {
    const check = checkPlantSun(s, plantsById[s.plantId], state.shapes);
    if (sunWarningShown(check, s, state.sunWarnings)) {
      const r = s.type === 'circle' ? s.radius * ppf : Math.min(boxSize(s).w, boxSize(s).h) * ppf / 2;
      const bx = labelX + r * 0.7, by = labelY - r * 0.7;
      g.appendChild(svgEl('g', { 'data-role': 'sun-warning', 'pointer-events': 'none' },
        svgEl('circle', { cx: bx, cy: by, r: 8, fill: '#f59e0b', stroke: '#fff', 'stroke-width': 1.5 }),
        svgEl('text', { x: bx, y: by + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#fff' }, '!')));
    }
  }
  return g;
}

/** A text note: the text itself (with a light halo so it reads over anything) and an invisible box to tap. */
function textGroup(s: TextShape, sel: boolean, inert: boolean, common: Attrs): SVGGElement {
  const ppf = pxPerFoot();
  const { w, h } = textSize(s);
  const px = (s.x - state.offsetX) * ppf, py = (s.y - state.offsetY) * ppf;
  const fs = s.fontSize * ppf;
  const rot = s.rotation ? `rotate(${s.rotation} ${px + (w * ppf) / 2} ${py + (h * ppf) / 2})` : null;
  const box = svgEl('rect', {
    'data-shape-id': s.id, x: px, y: py, width: w * ppf, height: h * ppf, fill: 'transparent',
    stroke: sel ? '#0f172a' : 'none', 'stroke-width': 1, 'stroke-dasharray': '4 3',
    style: common.style, 'pointer-events': inert ? 'none' : 'all', transform: rot,
  });
  box.addEventListener('pointerdown', (e) => onShapePointerDown(e as PointerEvent, s));
  const text = svgEl('text', {
    'data-role': 'text-note', x: px, y: py, 'font-size': fs, fill: s.color, 'font-family': 'sans-serif', 'font-weight': 500,
    stroke: 'rgba(255,255,255,0.85)', 'stroke-width': Math.max(1.5, fs * 0.12), 'paint-order': 'stroke', 'stroke-linejoin': 'round',
    'pointer-events': 'none', style: 'user-select:none;', transform: rot,
  });
  textLines(s.label).forEach((line, i) => {
    text.appendChild(svgEl('tspan', { x: px, y: py + (i * LINE_HEIGHT + 1) * fs }, line || ' '));
  });
  if (!s.label) text.setAttribute('fill-opacity', '0.4'); // placeholder until text is typed
  return svgEl('g', { 'data-shape-group': s.id }, text, box);
}

/** Drawing tier: by role (ground first, plants on top), then locked before unlocked. */
export function tierOf(s: Shape): number {
  return roleRank(s) * 2 + (s.locked ? 0 : 1);
}
/** Visible shapes in paint order (stable within a tier: list order). */
export function paintOrder(shapes: Shape[], filter: ShapeFilter = state.viewFilter): Shape[] {
  return shapes.filter((s) => shownWith(s, filter)).sort((a, b) => tierOf(a) - tierOf(b));
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

/**
 * Plants whose name would sit on top of the same name next to it (a row of
 * five coneflowers): only the first of each overlapping run is labeled, so the
 * names stay readable. A selected plant always shows its name.
 */
let repeatLabels = new Set<string>();
function refreshRepeatLabels() {
  const ppf = pxPerFoot();
  const kept: { text: string; x0: number; x1: number; y0: number; y1: number }[] = [];
  repeatLabels = new Set();
  for (const s of paintOrder(state.shapes)) {
    if (s.type !== 'circle' || s.role !== 'plant' || !s.label) continue;
    const r = s.radius * ppf, fs = Math.max(10, Math.min(14, r * 0.4));
    const w = s.label.length * fs * 0.55, cx = s.x * ppf, cy = s.y * ppf;
    const box = { text: s.label, x0: cx - w / 2, x1: cx + w / 2, y0: cy - fs / 2, y1: cy + fs / 2 };
    if (kept.some((k) => k.text === box.text && k.x0 < box.x1 && box.x0 < k.x1 && k.y0 < box.y1 && box.y0 < k.y1)) repeatLabels.add(s.id);
    else kept.push(box);
  }
}

/** Plants outlined as crowded (Layers switch); refreshed on each redraw. */
let crowded = new Set<string>();
function refreshCrowding() {
  crowded = state.showCrowding || state.placing ? crowdedIds(state.shapes.filter((s) => shownWith(s, state.viewFilter)), plantsById) : new Set();
}

/** Clear and redraw the whole canvas. Never touches panel DOM. */
export function redrawCanvas() {
  refreshCrowding();
  refreshRepeatLabels();
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
  renderHandles(layer(svg, 'handles'));
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
  if (state.showCrowding) {
    // Moving one plant can change which others are crowded: redraw all plants whose state flips.
    const before = crowded;
    refreshCrowding();
    ids = [...new Set([...ids, ...[...before].filter((id) => !crowded.has(id)), ...[...crowded].filter((id) => !before.has(id))])];
  }
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
  renderHandles(handles);
}
function renderHandles(g: SVGGElement) {
  renderBgHandles(g);
  renderPathOverlay(g);
  renderPlaceOverlay(g);
}
/** Redraw only the handles layer (drawing in progress, point handles). */
export function redrawHandles() {
  const svg = canvasSvg();
  if (!svg || svg.children.length !== LAYERS.length || drawnView.zoom !== state.zoom ||
      drawnView.offsetX !== state.offsetX || drawnView.offsetY !== state.offsetY) { redrawCanvas(); return; }
  const handles = layer(svg, 'handles');
  handles.replaceChildren();
  renderHandles(handles);
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
