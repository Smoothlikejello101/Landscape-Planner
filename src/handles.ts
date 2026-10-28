import { attachedPlants, carriesPlants, patchBedCarryingPlants } from './beds';
import { svgEl } from './dom';
import { pxPerFoot, rotate, setRadius, shapeCenter, worldPoints } from './geometry';
import { CORNERS, cornerPoint, framePoint, frameOf, radiusPatch, readoutText, resizePatch, rotatePatch, angleTo, type Corner4, type Frame, type HandleKind } from './handle-math';
import { isLocked } from './roles';
import { gesture, state } from './state';
import { shownWith } from './status';
import { isTree } from './trees';
import type { Gesture, Point, Shape } from './types';
import { deepClone } from './util';

// Handles on the selected shape (decided with Jason, 2026-10-25): drag a corner to resize it, the knob above it to
// turn it, a circle's edge to size it. Only one shape at a time, unlocked, and not a plant circle: a plant's circle is
// its spread (the catalog's, or set in its properties), not something to pull by accident; a tree drawn as an outline
// is the exception, sized by its edge. A path (a band drawn along a center line) has the knob only: its size is its
// width and length, reshaped by its points.

/** Where the knob sits beyond the shape's top edge (px), and its hit area (px). */
const KNOB_GAP = 30;
const KNOB_HIT = 14;
/** The hit area around a resize handle (px): at most this, less on a small shape, so most of it stays free to drag. */
const MAX_HIT = 18, MIN_HIT = 10;
/**
 * Below these on screen (px) a shape shows no resize handles, as they'd cover it, leaving no room to drag it or tap
 * what's on it: its longer side, and (a shape that isn't flat) its shorter side. Zoom in to resize it.
 */
const MIN_LONG_PX = 48, MIN_SHORT_PX = 24;
const INK = '#0f766e';

type HandleGesture = Extract<Gesture, { type: 'shape-resize' | 'shape-rotate' }>;
const activeOn = (s: Shape): HandleGesture | null => {
  const g = gesture.current;
  return (g?.type === 'shape-resize' || g?.type === 'shape-rotate') && g.id === s.id ? g : null;
};

/** The shape that shows handles now, or null. */
export function handleTarget(): Shape | null {
  if (state.selectedIds.length !== 1) return null;
  if (state.bgEditMode || state.bgCalibrate || state.draw || state.editPoints || state.placing || state.featurePlace) return null;
  const s = state.shapes.find((sh) => sh.id === state.selectedIds[0]);
  if (!s || isLocked(s) || !shownWith(s, state.viewFilter)) return null;
  if (s.type === 'circle' && (s.role === 'plant' || s.plantId || isTree(s)) && !s.canopy) return null;
  return s;
}

const toScreen = (p: Point): Point => {
  const ppf = pxPerFoot();
  return { x: (p.x - state.offsetX) * ppf, y: (p.y - state.offsetY) * ppf };
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** How far a box corner is from the shape itself (feet): 0 for a box's own corners, else to the nearest of its points. */
function offShape(s: Shape, p: Point): number {
  if (s.type !== 'poly' && s.type !== 'line') return 0;
  return Math.min(...worldPoints(s).map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
}
/**
 * The corner handles a shape shows: all four; or, on a box flat on screen (a straight line, or nearly), one at each
 * end, on the diagonal its line runs along, so the end held still is the line's own other end.
 */
function cornerHandles(s: Shape, f: Frame): { kind: Corner4; at: Point }[] {
  const all = CORNERS.map((kind) => ({ kind, world: cornerPoint(f, kind) })).map((c) => ({ ...c, at: toScreen(c.world) }));
  const [tl, tr, br, bl] = all;
  const meet = (a: { at: Point }, b: { at: Point }) => Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) < 1;
  if (!meet(tl, bl) && !meet(tl, tr)) return all;
  const off = (pair: typeof all) => pair.reduce((sum, c) => sum + offShape(s, c.world), 0);
  return off([tl, br]) <= off([tr, bl]) ? [tl, br] : [tr, bl];
}

/** Each handle the shape shows, where it is on screen (px), and how far round it takes a press (px). */
export function handlePositions(s: Shape): { kind: HandleKind; at: Point; hit: number }[] {
  const ppf = pxPerFoot();
  // (While one of its handles is dragged, they all stay, however small it gets: there's always one to pull back.)
  const dragging = !!activeOn(s);
  if (s.type === 'circle') {
    const rpx = s.radius * ppf;
    if (!dragging && rpx * 2 < MIN_LONG_PX) return [];
    const k = s.radius / Math.SQRT2; // (its edge, down and to the right)
    return [{ kind: 'radius', at: toScreen({ x: s.x + k, y: s.y + k }), hit: clamp(rpx / 3, MIN_HIT, MAX_HIT) }];
  }
  const f = frameOf(s);
  const out: { kind: HandleKind; at: Point; hit: number }[] = [];
  const longPx = Math.max(f.w, f.h) * ppf, shortPx = Math.min(f.w, f.h) * ppf;
  const flat = shortPx < 1;
  const path = s.type === 'line' && !!s.pathWidth;
  if (!path && (dragging || (longPx >= MIN_LONG_PX && (flat || shortPx >= MIN_SHORT_PX)))) {
    const hit = flat ? 14 : clamp(shortPx / 3, MIN_HIT, MAX_HIT);
    for (const c of cornerHandles(s, f)) out.push({ kind: c.kind, at: c.at, hit });
  }
  // The knob: beyond the middle of the top edge, out along the shape's own up.
  const top = toScreen(framePoint(f, 0, -f.h / 2));
  const up = rotate(0, -1, f.rot);
  out.push({ kind: 'rotate', at: { x: top.x + up.x * KNOB_GAP, y: top.y + up.y * KNOB_GAP }, hit: KNOB_HIT });
  return out;
}

/** Draw the selected shape's handles into the handles layer, and what a drag of one reads as. */
export function renderShapeHandles(g: SVGElement) {
  const s = handleTarget();
  if (!s) return;
  const positions = handlePositions(s);
  const center = toScreen(shapeCenter(s));
  const rot = s.type === 'circle' ? 0 : s.rotation || 0;
  const knob = positions.find((p) => p.kind === 'rotate');
  // The box the corners belong to, faintly, where it isn't the shape's own edge (an oval's, an outline's, a line's):
  // a corner handle off in the open reads as that box's corner.
  // (A tree's outline: the circle its edge handle sizes, the farthest the outline reaches.)
  if (s.type === 'circle' && s.canopy && positions.length) {
    g.appendChild(svgEl('circle', { 'data-role': 'handle-frame', cx: center.x, cy: center.y, r: s.radius * pxPerFoot(), fill: 'none', stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '3 3', 'stroke-opacity': 0.6, 'pointer-events': 'none' }));
  }
  if (s.type === 'oval' || s.type === 'triangle' || s.type === 'poly' || s.type === 'line') {
    const f = frameOf(s);
    if (f.w > 0 && f.h > 0 && positions.some((p) => p.kind !== 'rotate')) {
      const pts = CORNERS.map((c) => toScreen(cornerPoint(f, c))).map((p) => `${p.x},${p.y}`).join(' ');
      g.appendChild(svgEl('polygon', { 'data-role': 'handle-frame', points: pts, fill: 'none', stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '3 3', 'stroke-opacity': 0.6, 'pointer-events': 'none' }));
    }
  }
  if (knob && s.type !== 'circle') {
    const f = frameOf(s);
    const top = toScreen(framePoint(f, 0, -f.h / 2));
    g.appendChild(svgEl('line', { 'data-role': 'handle-stem', x1: top.x, y1: top.y, x2: knob.at.x, y2: knob.at.y, stroke: INK, 'stroke-width': 1.5, 'pointer-events': 'none' }));
  }
  for (const { kind, at, hit } of positions) {
    if (kind === 'rotate') {
      g.appendChild(svgEl('g', { 'data-role': 'shape-rotate', 'data-handle': kind, style: 'cursor:grab;touch-action:none;' },
        svgEl('circle', { cx: at.x, cy: at.y, r: hit, fill: 'transparent' }),
        svgEl('circle', { cx: at.x, cy: at.y, r: 10, fill: '#fff', stroke: INK, 'stroke-width': 2, 'pointer-events': 'none' }),
        svgEl('text', { x: at.x, y: at.y + 4.5, 'text-anchor': 'middle', 'font-size': 13, fill: INK, 'pointer-events': 'none', style: 'user-select:none;font-family:sans-serif;' }, '⟳')));
      continue;
    }
    // (The resize cursor that points the way this corner pulls, on screen.)
    const diagonal = (at.x - center.x) * (at.y - center.y) >= 0 ? 'nwse-resize' : 'nesw-resize';
    g.appendChild(svgEl('g', { 'data-role': 'shape-resize', 'data-handle': kind, style: `cursor:${diagonal};touch-action:none;` },
      svgEl('circle', { cx: at.x, cy: at.y, r: hit, fill: 'transparent' }),
      svgEl('rect', { x: at.x - 5.5, y: at.y - 5.5, width: 11, height: 11, rx: 2, fill: '#fff', stroke: INK, 'stroke-width': 2, 'pointer-events': 'none', transform: rot ? `rotate(${rot} ${at.x} ${at.y})` : null })));
  }
  // While a handle is dragged: the size, or the turn, just above it.
  const live = activeOn(s);
  if (live?.moved) {
    const kind: HandleKind = live.type === 'shape-rotate' ? 'rotate' : live.handle;
    const at = positions.find((p) => p.kind === kind)?.at ?? center;
    const text = readoutText(s, kind);
    const w = text.length * 7 + 16;
    const x = Math.max(w / 2 + 4, Math.min(state.canvasW - w / 2 - 4, at.x));
    const y = Math.max(16, at.y - 32);
    g.appendChild(svgEl('g', { 'data-role': 'handle-readout', 'pointer-events': 'none' },
      svgEl('rect', { x: x - w / 2, y: y - 11, width: w, height: 22, rx: 11, fill: '#0f172a', opacity: 0.85 }),
      svgEl('text', { x, y: y + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 12, 'font-weight': 600, fill: '#fff', style: 'user-select:none;' }, text)));
  }
}

/** Where a handle is, in feet: a corner of the box, or a circle's edge point. */
function handlePoint(s: Shape, kind: HandleKind): Point {
  if (s.type === 'circle') { const k = s.radius / Math.SQRT2; return { x: s.x + k, y: s.y + k }; }
  return kind === 'rotate' ? shapeCenter(s) : cornerPoint(frameOf(s), kind as Corner4);
}

/**
 * A handle pressed at `p` (feet): the drag it starts (null if the selection shows no handles). It keeps where on the
 * handle the press was (`grab`), so the corner moves with the finger rather than jumping under it.
 */
export function startHandleDrag(kind: HandleKind, p: Point, clientX: number, clientY: number, shapes: Shape[]): HandleGesture | null {
  const s = handleTarget();
  if (!s) return null;
  const start = deepClone(s);
  const historyAt = state.historyIndex;
  if (kind === 'rotate') {
    if (s.type === 'circle') return null;
    // A bed that carries its plants swings them round with it (and resizing leaves them where they are).
    const carried = attachedPlants(s, shapes).map((plant) => deepClone(plant));
    const center = shapeCenter(s);
    return { type: 'shape-rotate', id: s.id, start, carried, center, startAngle: angleTo(center, p), startX: clientX, startY: clientY, moved: false, historyAt };
  }
  const at = handlePoint(s, kind);
  return { type: 'shape-resize', id: s.id, handle: kind, start, carried: [], grab: { x: p.x - at.x, y: p.y - at.y }, startX: clientX, startY: clientY, moved: false, historyAt };
}

/**
 * Whether a handle's drag can go on: its shape still there and still the one selected, and nothing undone or redone
 * since it began (a second finger on Undo; the drag would bring the undone change back).
 */
export function handleDragLive(g: HandleGesture, shapes: Shape[]): boolean {
  return state.historyIndex === g.historyAt && state.selectedIds.length === 1 && state.selectedIds[0] === g.id && shapes.some((s) => s.id === g.id);
}

/**
 * A handle dragged to `p` (feet): the shape (and a bed's plants, turning) put back as they were when the drag began,
 * then given the drag's whole change at once. Returns the ids to redraw.
 */
export function applyHandleDrag(g: HandleGesture, p: Point, shift: boolean, shapes: Shape[]): string[] {
  const s = shapes.find((sh) => sh.id === g.id);
  if (!s) return [];
  Object.assign(s, deepClone(g.start));
  for (const c of g.carried) {
    const plant = shapes.find((sh) => sh.id === c.id);
    if (plant) Object.assign(plant, deepClone(c));
  }
  if (g.type === 'shape-rotate') {
    if (s.type === 'circle' || g.start.type === 'circle') return [];
    const patch = rotatePatch(g.start, g.startAngle, angleTo(g.center, p));
    const moved = carriesPlants(s) ? patchBedCarryingPlants(s, patch, shapes) : (Object.assign(s, patch), []);
    return [s.id, ...new Set([...moved, ...g.carried.map((c) => c.id)])];
  }
  const to = { x: p.x - g.grab.x, y: p.y - g.grab.y };
  if (s.type === 'circle' && g.start.type === 'circle') {
    const { radius } = radiusPatch(g.start, to);
    setRadius(s, radius!); // (a circle with a shaped outline grows and shrinks with it)
    if (s.plantId) s.sizeFrom = 'manual'; // (a tree of the catalog's, sized by hand: kept when the plan's size mode changes)
  } else if (s.type !== 'circle' && g.start.type !== 'circle' && g.handle !== 'radius') Object.assign(s, resizePatch(g.start, g.handle, to, shift));
  return [s.id];
}

/** Whether a handle's drag changed anything (a wiggle back to where it began is no undo step). */
export function handleDragChanged(g: HandleGesture, shapes: Shape[]): boolean {
  const now = shapes.find((sh) => sh.id === g.id);
  return !!now && JSON.stringify(now) !== JSON.stringify(g.start);
}
