import { renderBgHandles, renderBgImageInto } from './background';
import { AXIS_LABEL, BG_COLOR, GRID_MAJOR, GRID_MINOR, PX_PER_FOOT_BASE } from './constants';
import { svgEl, type Attrs } from './dom';
import { alongLabel, boxLabelAngle, boxSize, shapeBBox, shapeCenter, displayLabel, LINE_HEIGHT, pathLabelPoint, pxPerFoot, textLines, textSize, trianglePoints, worldPoints } from './geometry';
import { renderPathOverlay } from './draw';
import { fullRingRadius } from './my-plants';
import { crowdLevels, type CrowdLevel } from './crowding';
import { crowdOptions } from './crowd-here';
import { renderPlaceOverlay } from './place';
import { renderShapeHandles } from './handles';
import { onShapePointerDown } from './gestures';
import { plantsById } from './plants';
import { plantLabelFit, LABEL_LINE_HEIGHT, textWidth1, type FittedLabel } from './labels';
import { canopyInnerRadius, canopyPoints, isTree, trunkParts, trunkReachPx } from './trees';
import { trunkHitPx } from './canopy';
import { isLocked, roleDef, roleRank } from './roles';
import { shownWith } from './status';
import { checkPlantSun, formatHours, shadeOpacity, sunHours, sunWarningShown } from './sun';
import { prepareUtilities, utilityIssues, utilityWarningShown, type PreparedUtility } from './utilities';
import { isSelected } from './selection';
import { state } from './state';
import type { CircleShape, Shape, ShapeFilter, TextShape } from './types';

// Canvas drawing. Everything here writes only into the <svg>, never into
// panel DOM, so it is safe to call while an input has keyboard focus.
//
// The canvas is a stack of layers so gestures can update just what changed:
//   base     tan background rect (the pan/marquee hit target)
//   bg       background image
//   grid     grid lines and axis labels
//   shapes   one <g> per shape (shape + label), then the marquee
//   handles  background edit outline/handle, calibration markers, the selected shape's resize and rotate handles
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
  const { minorEvery, majorEvery } = gridSteps(ppf);
  // Lines ignore pointers so a touch landing exactly on one still pans.
  for (let fx = Math.ceil(startFx / minorEvery) * minorEvery; fx <= endFx; fx += minorEvery) {
    const px = (fx - state.offsetX) * ppf;
    const isMajor = fx % majorEvery === 0;
    g.appendChild(svgEl('line', { x1: px, y1: 0, x2: px, y2: h, stroke: isMajor ? GRID_MAJOR : GRID_MINOR, 'stroke-width': isMajor ? 1 : 0.5, 'pointer-events': 'none' }));
  }
  for (let fy = Math.ceil(startFy / minorEvery) * minorEvery; fy <= endFy; fy += minorEvery) {
    const py = (fy - state.offsetY) * ppf;
    const isMajor = fy % majorEvery === 0;
    g.appendChild(svgEl('line', { x1: 0, y1: py, x2: w, y2: py, stroke: isMajor ? GRID_MAJOR : GRID_MINOR, 'stroke-width': isMajor ? 1 : 0.5, 'pointer-events': 'none' }));
  }
  for (let fx = Math.ceil(startFx / majorEvery) * majorEvery; fx <= endFx; fx += majorEvery) {
    const px = (fx - state.offsetX) * ppf;
    g.appendChild(svgEl('text', { x: px + 2, y: 10, 'font-size': 10, fill: AXIS_LABEL, 'pointer-events': 'none' }, fx + "'"));
  }
  for (let fy = Math.ceil(startFy / majorEvery) * majorEvery; fy <= endFy; fy += majorEvery) {
    const py = (fy - state.offsetY) * ppf;
    g.appendChild(svgEl('text', { x: 2, y: py + 10, 'font-size': 10, fill: AXIS_LABEL, 'pointer-events': 'none' }, fy + "'"));
  }
}
/** Pixels a foot below which the plan is zoomed out past 25% (the farthest out before 5% was). */
export const FAR_OUT_PPF = 6;
/**
 * The band (px) a thin line takes taps in: 18 px, but no wider than 3 ft once zoomed out past 25% (at 5%,
 * 18 px is 15 ft of yard: a pan starting near a fence would drag the fence), and never under 6 px.
 */
export const hitBand = (ppf: number) => Math.max(6, Math.min(18, 3 * ppf));
/** Badges (sun warning, to move) at their size close in, shrinking with the plan once zoomed out past 25%. */
function badgeScale(ppf: number, x: number, y: number): string | null {
  if (ppf >= FAR_OUT_PPF) return null;
  const k = Math.max(0.4, ppf / FAR_OUT_PPF);
  return `translate(${x} ${y}) scale(${k}) translate(${-x} ${-y})`;
}
/**
 * The grid's spacing (feet) at this many pixels a foot: labeled lines at least 40 px apart (every 10 ft, as
 * always, until zoomed far out: then 50, 100, 500 ft), and fainter ones between, every foot close in.
 */
export function gridSteps(ppf: number): { minorEvery: number; majorEvery: number } {
  const majors: [number, number][] = [[10, ppf < 10 ? 5 : 1], [50, 10], [100, 20], [500, 100], [1000, 200]];
  const [majorEvery, minorEvery] = majors.find(([m]) => m * ppf >= 40) ?? majors[majors.length - 1];
  return { minorEvery, majorEvery };
}

/** A shape and its label, wrapped in a group so it can be redrawn alone. */
export function shapeGroup(s: Shape): SVGGElement {
  const ppf = pxPerFoot();
  const sel = isSelected(s.id);
  // Taps fall through to the background tools / drawing / point editing.
  const inert = state.bgEditMode || !!state.bgCalibrate || !!state.draw || !!state.editPoints || !!state.placing;
  // Boundaries and open lines: a stroke, no fill.
  const outline = s.type === 'line' || (s.role ? !!roleDef(s.role).outline : false);
  // (And a buried line: under the ground, as a plan shows it.)
  const dashed = (s.role ? !!roleDef(s.role).outline : false) || (s.role === 'utility' && s.utility === 'buried');
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
  let fitted: FittedLabel | null | undefined; // circles: the name fitted inside (null = doesn't fit)
  let overflow = false; // a plant's name written over its edge

  if (s.type === 'circle') {
    const cx = (s.x - state.offsetX) * ppf;
    const cy = (s.y - state.offsetY) * ppf;
    const r = s.radius * ppf;
    // A tree pruned into a shape: its outline instead of a circle.
    shapeEl = s.canopy
      ? svgEl('polygon', { ...common, points: canopyPoints(s, (x, y) => [(x - state.offsetX) * ppf, (y - state.offsetY) * ppf]), 'stroke-linejoin': 'round' })
      : svgEl('circle', { ...common, cx, cy, r });
    // Plants drawn below full size: a dashed ring at full size when selected (or for all, from Layers).
    // While placing more of a plant, its full spread shows so the next one can be spaced by eye.
    const showFull = (sel && state.selectedIds.length === 1) || state.showFullSize || (!!state.placing && s.plantId === state.placing.plantId);
    const full = showFull ? fullRingRadius(s) : null;
    // Crowding: red where it's crowded; amber where it's close to another (their typical spreads touch).
    const level = crowded.get(s.id);
    if (level === 'crowded') g0.push(svgEl('circle', { 'data-role': 'crowded', cx, cy, r: r + 4, fill: 'none', stroke: '#dc2626', 'stroke-width': 2.5, 'pointer-events': 'none' }));
    else if (level === 'close') g0.push(svgEl('circle', { 'data-role': 'close', cx, cy, r: r + 4, fill: 'none', stroke: '#d97706', 'stroke-width': 2, 'stroke-dasharray': '6 4', 'pointer-events': 'none' }));
    if (full) ring = svgEl('circle', { 'data-role': 'full-ring', cx, cy, r: full * ppf, fill: 'none', stroke: s.color, 'stroke-width': 1.5, 'stroke-dasharray': '5 4', 'pointer-events': 'none' });
    if (isTree(s)) {
      const trunk = trunkParts(s, cx, cy, ppf, showFull).map((p) => svgEl(p.tag, { ...p.attrs, 'pointer-events': 'none', opacity: s.status === 'gone' ? 0.35 : null }));
      g0.unshift(...trunk);
      // Taps go through the canopy to what's under it (src/canopy.ts); the trunk picks the tree.
      shapeEl.setAttribute('pointer-events', 'none');
      hitEl = svgEl('circle', {
        'data-trunk-of': s.id, 'data-role': 'trunk-hit', cx, cy, // (not data-shape-id: that's the tree as drawn)
        r: trunkHitPx(s, ppf), fill: 'transparent',
        style: common.style, 'pointer-events': inert ? 'none' : 'all',
      });
    }
    labelX = cx; labelY = cy;
    fs = Math.max(10, Math.min(14, r * 0.4));
    fitted = circleLabel(s, ppf);
    // A plant name that won't fit inside still shows, over the edge, where it has the room.
    if (fitted === null && overflowLabels.has(s.id)) { fitted = undefined; overflow = true; }
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
        'data-shape-id': s.id, 'data-role': 'line-hit', points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(hitBand(ppf), s.pathWidth * ppf),
        'stroke-linejoin': 'round', style: common.style, 'pointer-events': inert ? 'none' : 'stroke',
      });
    } else {
      // A thin line is hard to hit with a finger: a wide invisible stroke takes the taps.
      shapeEl = svgEl('polyline', { ...common, points: pts, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'pointer-events': 'none' });
      hitEl = svgEl('polyline', {
        'data-shape-id': s.id, 'data-role': 'line-hit', points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': hitBand(ppf),
        'stroke-linecap': 'round', style: common.style, 'pointer-events': inert ? 'none' : 'stroke',
      });
    }
    const lp = pathLabelPoint(s);
    labelX = (lp.x - state.offsetX) * ppf; labelY = (lp.y - state.offsetY) * ppf;
    const { w, h } = boxSize(s);
    fs = s.type === 'line' ? 12 : Math.max(10, Math.min(14, Math.min(w, h) * ppf * 0.2));
    if (s.role === 'boundary') {
      // A property line or fence is named along itself, just beside the line, not in the middle of the yard.
      const al = alongLabel(s);
      labelX = (al.x - state.offsetX) * ppf; labelY = (al.y - state.offsetY) * ppf;
      if (al.angle) rotTransform = `rotate(${al.angle} ${labelX} ${labelY})`;
      labelY -= 9;
      fs = 12;
    } else if (s.type === 'line' && !s.pathWidth) labelY -= 10; // above a thin line, not on it (a path's label sits on it)
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
    // Its name reads as upright as it can, not turned with the shape (a bed drawn tall and turned on its side).
    // (The shape has its transform already: from here on, rotTransform turns its labels.)
    const angle = boxLabelAngle(s.rotation || 0);
    rotTransform = angle ? `rotate(${angle} ${cx} ${cy})` : '';
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
  // Names hidden (beside the zoom buttons): no names, lengths, sun hours or badges, but a selected shape's own.
  const named = state.showNames || sel;
  // Zoomed out past 25%, a name (or sun hours) wider than its shape is left off, unless the shape is selected:
  // a whole yard's names would pile up over beds a few pixels across.
  const room = (text: string) => {
    if (!named) return false;
    if (ppf >= FAR_OUT_PPF || sel || isPlantCircle(s)) return true;
    const b = shapeBBox(s);
    return textWidth1(text) * fs <= Math.max(b.maxX - b.minX, b.maxY - b.minY) * ppf;
  };
  const sunText = s.role === 'shade' && s.sun && room('☀ ' + formatHours(sunHours(s.sun))) ? '☀ ' + formatHours(sunHours(s.sun)) : '';
  const label = room(displayLabel(s)) ? displayLabel(s) : '';
  if (fitted && named) {
    // Wrapped and sized to fit inside the circle (or below a tree's trunk).
    const lh = fitted.fontSize * LABEL_LINE_HEIGHT;
    const text = svgEl('text', {
      'data-role': 'plant-label', x: labelX, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fitted.fontSize, fill: '#0f172a',
      stroke: 'rgba(255,255,255,0.55)', 'stroke-width': 2.5, 'paint-order': 'stroke', 'stroke-linejoin': 'round',
      'pointer-events': 'none', style: 'user-select:none;font-weight:500;',
    });
    fitted.lines.forEach((line, i) => {
      // A trailing space keeps the words apart in the text's content (screen readers, search); it isn't drawn.
      text.appendChild(svgEl('tspan', { x: labelX, y: labelY + fitted!.dy + (i - (fitted!.lines.length - 1) / 2) * lh }, line + (i < fitted!.lines.length - 1 ? ' ' : '')));
    });
    g.appendChild(text);
  } else if (label && (fitted === undefined || !isPlantCircle(s) || (sel && state.selectedIds.length === 1))) {
    // Not fitted (other shapes), or a plant's name over its edge (room for it, or selected): one line, with a halo.
    const halo = fitted === null || overflow;
    if (halo) fs = OVERFLOW_PX;
    g.appendChild(svgEl('text', {
      x: labelX, y: sunText ? labelY - fs * 0.6 : labelY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': fs, fill: '#0f172a', 'pointer-events': 'none',
      style: 'user-select:none;font-weight:500;',
      transform: rotTransform || null,
      ...(halo ? { 'data-role': 'plant-label', stroke: 'rgba(255,255,255,0.85)', 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round' } : {}),
    }, label));
  }
  if (sunText) {
    g.appendChild(svgEl('text', {
      x: labelX, y: label ? labelY + fs * 0.7 : labelY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': Math.max(10, fs * 0.85), fill: '#1e293b', 'pointer-events': 'none', 'data-role': 'sun-label',
      style: 'user-select:none;', transform: rotTransform || null,
    }, sunText));
  }
  // To remove: a red cross over the shape. To move: a blue arrow badge (hidden with the names; the cross isn't a badge).
  if (s.status === 'remove' || (s.status === 'move' && named)) {
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
      g.appendChild(svgEl('g', { 'data-role': 'status-move', 'pointer-events': 'none', transform: badgeScale(ppf, bx, by) },
        svgEl('circle', { cx: bx, cy: by, r: 9, fill: '#2563eb', stroke: '#fff', 'stroke-width': 1.5 }),
        svgEl('path', { d: `M${bx - 4.5},${by}h9M${bx + 1.5},${by - 3}l3,3l-3,3M${bx - 1.5},${by - 3}l-3,3l3,3`, stroke: '#fff', 'stroke-width': 1.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })));
    }
  }
  // Plants whose spot doesn't match their sun needs get a small warning badge.
  if (s.role === 'plant' && s.plantId && named) {
    const check = checkPlantSun(s, plantsById[s.plantId], state.shapes);
    if (sunWarningShown(check, s, state.sunWarnings)) {
      const r = s.type === 'circle' ? s.radius * ppf : Math.min(boxSize(s).w, boxSize(s).h) * ppf / 2;
      const bx = labelX + r * 0.7, by = labelY - r * 0.7;
      g.appendChild(svgEl('g', { 'data-role': 'sun-warning', 'pointer-events': 'none', transform: badgeScale(ppf, bx, by) },
        svgEl('circle', { cx: bx, cy: by, r: 8, fill: '#f59e0b', stroke: '#fff', 'stroke-width': 1.5 }),
        svgEl('text', { x: bx, y: by + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#fff' }, '!')));
    }
  }
  // Plants too near a power line, a buried line or a septic field for what they are (src/utilities.ts): a badge in
  // the power line's orange, low on the other side.
  if (s.role === 'plant' && s.type === 'circle' && named && shownUtilities.length) {
    const issues = utilityIssues(s, shownUtilities, plantsById);
    if (utilityWarningShown(s, issues)) {
      const r = s.radius * ppf;
      const bx = labelX - r * 0.7, by = labelY + r * 0.7;
      g.appendChild(svgEl('g', { 'data-role': 'utility-warning', 'pointer-events': 'none', transform: badgeScale(ppf, bx, by) },
        svgEl('circle', { cx: bx, cy: by, r: 8, fill: '#ea580c', stroke: '#fff', 'stroke-width': 1.5 }),
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
    stroke: 'rgba(255,255,255,0.85)', 'stroke-width': Math.max(Math.min(1.5, fs * 0.3), fs * 0.12), 'paint-order': 'stroke', 'stroke-linejoin': 'round', // (thin with tiny text, far out)
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

const isPlantCircle = (s: Shape): s is CircleShape => s.type === 'circle' && s.role === 'plant';
/** One-line names drawn over a plant's edge: the size used, for placing them. */
const OVERFLOW_PX = 11;
/**
 * Plants whose name doesn't fit inside their circle but can be written over
 * its edge without landing on another plant's name. Names that fit inside
 * claim their room first; then the rest, biggest plants first, each where it
 * doesn't collide with one already placed. A row of small plants named alike
 * gets every other name, rather than a pile of overlapping text.
 */
let overflowLabels = new Set<string>();
function refreshLabelLayout() {
  const ppf = pxPerFoot();
  overflowLabels = new Set();
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const placed: Box[] = [];
  const waiting: { s: CircleShape; box: Box }[] = [];
  for (const s of paintOrder(state.shapes)) {
    // Names hidden: a name that isn't drawn keeps no room (a selected plant's shows beside it).
    if (!state.showNames && !state.selectedIds.includes(s.id)) continue;
    if (!isPlantCircle(s)) {
      // Other shapes' names (a bed's, a path's) are there first: plant names stay off them.
      const label = s.type === 'text' ? '' : displayLabel(s);
      if (!label) continue;
      const w = textWidth1(label) * 12, h = 14;
      if (s.role === 'boundary' && (s.type === 'poly' || s.type === 'line')) {
        // Along the line: 9 px off it, turned with it (the box that holds the turned label).
        const al = alongLabel(s), rad = (al.angle * Math.PI) / 180;
        const cx = al.x * ppf + 9 * Math.sin(rad), cy = al.y * ppf - 9 * Math.cos(rad);
        const bw = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)), bh = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
        placed.push({ x0: cx - bw / 2, x1: cx + bw / 2, y0: cy - bh / 2, y1: cy + bh / 2 });
        continue;
      }
      const at = s.type === 'poly' || s.type === 'line' ? pathLabelPoint(s) : shapeCenter(s);
      placed.push({ x0: at.x * ppf - w / 2, x1: at.x * ppf + w / 2, y0: at.y * ppf - h / 2, y1: at.y * ppf + h / 2 });
      continue;
    }
    const fit = circleLabel(s, ppf);
    const cx = s.x * ppf, cy = s.y * ppf;
    if (fit) {
      const w = Math.max(...fit.lines.map((l) => textWidth1(l))) * fit.fontSize;
      const h = fit.lines.length * fit.fontSize * LABEL_LINE_HEIGHT;
      placed.push({ x0: cx - w / 2, x1: cx + w / 2, y0: cy + fit.dy - h / 2, y1: cy + fit.dy + h / 2 });
    } else if (fit === null) {
      const w = textWidth1(displayLabel(s)) * OVERFLOW_PX, h = OVERFLOW_PX * LABEL_LINE_HEIGHT;
      waiting.push({ s, box: { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 } });
    }
  }
  waiting.sort((a, b) => b.s.radius - a.s.radius);
  for (const { s, box } of waiting) {
    if (placed.some((p) => p.x0 < box.x1 && box.x0 < p.x1 && p.y0 < box.y1 && box.y0 < p.y1)) continue;
    placed.push(box);
    overflowLabels.add(s.id);
  }
}
/**
 * A circle's name, fitted inside it: wrapped, shrunk, or shortened. For a
 * plant, null when no form of the name fits (it shows when selected); other
 * circles fall back to a plain one-line label (undefined).
 */
function circleLabel(s: CircleShape, ppf: number): FittedLabel | null | undefined {
  const label = displayLabel(s);
  if (!label || (s.role === 'shade' && s.sun)) return undefined; // sun hours share the space; keep the plain label
  const plant = s.plantId ? plantsById[s.plantId] : undefined;
  const fit = plantLabelFit(label, canopyInnerRadius(s) * ppf, isTree(s) ? { below: trunkReachPx(s, ppf) + 1 } : {}, isPlantCircle(s) ? plant : undefined);
  return fit ?? (isPlantCircle(s) ? null : undefined);
}

/** Plants ringed as close or crowded (Layers switch, and always while placing); refreshed on each redraw. */
let crowded = new Map<string, CrowdLevel>();
function refreshCrowding() {
  crowded = state.showCrowding || state.placing ? crowdLevels(state.shapes.filter((s) => shownWith(s, state.viewFilter)), plantsById, crowdOptions()) : new Map();
}
/** The utilities shown, measured once a redraw for every plant's check (src/utilities.ts); none on most plans. */
let shownUtilities: PreparedUtility[] = [];
function refreshUtilities() {
  shownUtilities = prepareUtilities(state.shapes.filter((s) => s.role === 'utility' && shownWith(s, state.viewFilter)));
}

/** Clear and redraw the whole canvas. Never touches panel DOM. */
export function redrawCanvas() {
  refreshCrowding();
  refreshUtilities();
  refreshLabelLayout();
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
  // (A utility dragged: its own outline measured again; the plants' badges catch up on release, with the full render.)
  if (ids.some((id) => state.shapes.find((sh) => sh.id === id)?.role === 'utility')) refreshUtilities();
  if (state.showCrowding || state.placing) {
    // Moving one plant can change which others are close or crowded: redraw all plants whose ring changes.
    const before = crowded;
    refreshCrowding();
    const changed = [...new Set([...before.keys(), ...crowded.keys()])].filter((id) => before.get(id) !== crowded.get(id));
    ids = [...new Set([...ids, ...changed])];
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
  renderShapeHandles(g);
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
