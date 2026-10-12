import { MAX_POINTS, MIN_POINTS } from './constants';
import { svgEl } from './dom';
import { bakeRotation, fmtFeet, outlineOf, pathPoints, pxPerFoot, screenToFeet, setWorldPoints } from './geometry';
import { flushHistoryDebounce, pushHistory } from './history';
import { defaultLook } from './roles';
import { state } from './state';
import { save } from './storage';
import type { PathShape, Point, Shape } from './types';
import { snap, uid } from './util';

// Freeform outlines (closed) and lines (open).
//
// Drawing: each tap on the canvas adds a corner, snapped to the grid; drags
// still pan and pinches zoom, so a long fence can be drawn across the plan.
// Tapping the first point (or Done) finishes an outline.
//
// Editing points: drag a point to move it, tap the + on an edge to add one,
// tap a point and Delete point to remove it.

/** How close (screen px) a tap must be to the first point to close an outline. */
const CLOSE_RADIUS_PX = 18;

const isPath = (s: Shape | undefined): s is PathShape => !!s && (s.type === 'poly' || s.type === 'line');

// ---------- Drawing ----------
type DrawKind = 'poly' | 'line' | 'measure';
const minPoints = (k: DrawKind) => (k === 'measure' ? 2 : MIN_POINTS[k]);

export function startDraw(kind: DrawKind) {
  flushHistoryDebounce();
  state.draw = { kind, points: [] };
  state.editPoints = null;
  state.selectMode = false;
  state.selectedIds = [];
  state.panel = null;
  state.menu = null;
}
export function setDrawKind(kind: DrawKind) {
  const d = state.draw;
  if (!d) return;
  if ((d.kind === 'measure') !== (kind === 'measure')) d.points = []; // a measurement isn't the start of a shape
  d.kind = kind;
}
/** Length of the current measurement, in feet (null until both ends are placed). */
export function measuredFeet(): number | null {
  const d = state.draw;
  if (!d || d.kind !== 'measure' || d.points.length < 2) return null;
  const [a, b] = d.points;
  return Math.hypot(b.x - a.x, b.y - a.y);
}
export function cancelDraw() { state.draw = null; }
export function undoDrawPoint() { state.draw?.points.pop(); }
export function canFinishDraw(): boolean {
  return !!state.draw && state.draw.points.length >= minPoints(state.draw.kind);
}
/**
 * A tap on the canvas while drawing. Returns true if the drawing finished
 * (tapped the first point of an outline).
 */
export function drawTap(clientX: number, clientY: number): boolean {
  const d = state.draw;
  if (!d) return false;
  const first = d.points[0];
  if (d.kind === 'measure' && d.points.length >= 2) d.points = []; // a third tap starts a new measurement
  if (d.kind === 'poly' && d.points.length >= MIN_POINTS.poly && first) {
    const f = screenToFeet(clientX, clientY);
    if (Math.hypot(f.x - first.x, f.y - first.y) * pxPerFoot() <= CLOSE_RADIUS_PX) { finishDraw(); return true; }
  }
  if (d.points.length >= MAX_POINTS) return false;
  const f = screenToFeet(clientX, clientY);
  const p = { x: snap(f.x), y: snap(f.y) };
  const last = d.points.at(-1);
  if (last && last.x === p.x && last.y === p.y) return false; // double tap on the same spot
  d.points.push(p);
  return false;
}
/** Turn the drawing into a shape (selected, with its properties open). */
export function finishDraw(): Shape | null {
  const d = state.draw;
  if (!d || !canFinishDraw()) return null;
  if (d.kind === 'measure') return keepMeasurement();
  state.draw = null;
  // An outline's closing point may duplicate the first one; drop it.
  const pts = d.points.slice();
  if (d.kind === 'poly' && pts.length > 3 && pts[0].x === pts.at(-1)!.x && pts[0].y === pts.at(-1)!.y) pts.pop();
  const shape = {
    id: uid(), type: d.kind, x: 0, y: 0, points: [], rotation: 0, label: '', locked: false,
    ...(d.kind === 'line' ? { role: 'boundary' as const, ...defaultLook('boundary', 'line') } : defaultLook('unassigned', 'poly')),
  } as PathShape;
  setWorldPoints(shape, pts);
  state.shapes.push(shape);
  state.selectedIds = [shape.id];
  state.panel = 'props';
  pushHistory();
  save();
  return shape;
}

/** Save the current measurement as a dimension line (stays in measure mode). */
function keepMeasurement(): Shape | null {
  const d = state.draw;
  if (!d || d.kind !== 'measure' || d.points.length < 2) return null;
  const shape = {
    id: uid(), type: 'line', x: 0, y: 0, points: [], rotation: 0, label: '', locked: false, showLength: true,
    role: 'other', color: '#1c1917', opacity: 1,
  } as PathShape;
  setWorldPoints(shape, d.points.slice(0, 2));
  state.shapes.push(shape);
  d.points = [];
  pushHistory();
  save();
  return shape;
}

// ---------- Editing points ----------
export function editedShape(): PathShape | null {
  if (!state.editPoints) return null;
  const s = state.shapes.find((sh) => sh.id === state.editPoints!.id);
  return isPath(s) ? s : null;
}
export function startEditPoints(id: string) {
  const s = state.shapes.find((sh) => sh.id === id);
  if (!isPath(s)) return;
  flushHistoryDebounce();
  if (s.rotation) { bakeRotation(s); save(); } // same picture; points are simpler to edit unrotated
  state.editPoints = { id, vertex: null };
  state.draw = null;
  state.selectMode = false;
  state.panel = null;
  state.menu = null;
}
export function finishEditPoints() { state.editPoints = null; }
/** Move point `i` to a world position (snapped). Doesn't record history. */
export function moveVertex(s: PathShape, i: number, world: Point) {
  const pts = pathPoints(s);
  if (i < 0 || i >= pts.length) return;
  pts[i] = { x: snap(world.x), y: snap(world.y) };
  setWorldPoints(s, pts);
}
/** Insert a point after point `afterIndex` (on that edge). Returns the new point's index. */
export function insertVertex(s: PathShape, afterIndex: number, world: Point): number {
  if (s.points.length >= MAX_POINTS) return -1;
  const pts = pathPoints(s);
  pts.splice(afterIndex + 1, 0, { x: snap(world.x), y: snap(world.y) });
  setWorldPoints(s, pts);
  return afterIndex + 1;
}
export function canDeleteVertex(): boolean {
  const s = editedShape();
  return !!s && state.editPoints?.vertex != null && s.points.length > MIN_POINTS[s.type];
}
export function deleteSelectedVertex() {
  const s = editedShape();
  const i = state.editPoints?.vertex;
  if (!s || i == null || !canDeleteVertex()) return;
  flushHistoryDebounce();
  const pts = pathPoints(s);
  pts.splice(i, 1);
  setWorldPoints(s, pts);
  state.editPoints!.vertex = null;
  pushHistory();
  save();
}
/** Edges that get a + handle: [index of the point the edge starts at, its midpoint]. */
export function edgeMidpoints(s: PathShape): { after: number; at: Point }[] {
  const pts = pathPoints(s);
  const n = s.type === 'poly' ? pts.length : pts.length - 1;
  const out: { after: number; at: Point }[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push({ after: i, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
  }
  return out;
}

// ---------- Rectangles, ovals and triangles to outlines ----------
/** Replace a box shape with an editable outline of the same look, role and rotation. */
export function convertToOutline(id: string): PathShape | null {
  const i = state.shapes.findIndex((sh) => sh.id === id);
  const s = state.shapes[i];
  if (!s || s.type === 'circle' || s.type === 'text' || isPath(s)) return null;
  flushHistoryDebounce();
  const { width: _w, height: _h, ...rest } = s;
  const keep = { ...rest } as Record<string, unknown>;
  delete keep.rightAngle;
  const poly = { ...keep, type: 'poly', points: [], rotation: s.rotation || 0 } as unknown as PathShape;
  setWorldPoints(poly, outlineOf(s));
  state.shapes[i] = poly;
  pushHistory();
  save();
  return poly;
}

// ---------- Overlay (drawn in the handles layer) ----------
const toScreen = (p: Point) => ({ x: (p.x - state.offsetX) * pxPerFoot(), y: (p.y - state.offsetY) * pxPerFoot() });

export function renderPathOverlay(g: SVGElement) {
  const d = state.draw;
  if (d && d.kind === 'measure') {
    const pts = d.points.map(toScreen);
    if (pts.length === 2) {
      g.appendChild(svgEl('line', { 'data-role': 'measure-line', x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, stroke: '#b45309', 'stroke-width': 2.5, 'stroke-dasharray': '6 4', 'pointer-events': 'none' }));
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      const text = fmtFeet(measuredFeet()!) + ' ft';
      const w = text.length * 8 + 16;
      g.appendChild(svgEl('g', { 'data-role': 'measure-label', 'pointer-events': 'none' },
        svgEl('rect', { x: mx - w / 2, y: my - 26, width: w, height: 22, rx: 11, fill: '#b45309' }),
        svgEl('text', { x: mx, y: my - 15, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#fff' }, text)));
    }
    for (const p of pts) g.appendChild(svgEl('circle', { 'data-role': 'draw-point', cx: p.x, cy: p.y, r: 5, fill: '#b45309', stroke: '#fff', 'stroke-width': 2, 'pointer-events': 'none' }));
    return;
  }
  if (d) {
    const pts = d.points.map(toScreen);
    if (pts.length > 1) {
      g.appendChild(svgEl(d.kind === 'poly' ? 'polygon' : 'polyline', {
        'data-role': 'draw-path', points: pts.map((p) => `${p.x},${p.y}`).join(' '),
        fill: d.kind === 'poly' && pts.length > 2 ? 'rgba(13,148,136,0.15)' : 'none',
        stroke: '#0f766e', 'stroke-width': 2.5, 'stroke-dasharray': d.kind === 'poly' ? null : '8 4', 'pointer-events': 'none',
      }));
    }
    pts.forEach((p, i) => {
      const closer = i === 0 && d.kind === 'poly' && pts.length >= MIN_POINTS.poly;
      g.appendChild(svgEl('circle', {
        'data-role': closer ? 'draw-close' : 'draw-point', cx: p.x, cy: p.y, r: closer ? 10 : 5,
        fill: closer ? 'rgba(15,118,110,0.25)' : '#0f766e', stroke: closer ? '#0f766e' : '#fff', 'stroke-width': 2, 'pointer-events': 'none',
      }));
    });
    return;
  }
  const s = editedShape();
  if (!s || !state.editPoints) return;
  const sel = state.editPoints.vertex;
  for (const m of edgeMidpoints(s)) {
    const a = toScreen(pathPoints(s)[m.after]);
    const b = toScreen(pathPoints(s)[(m.after + 1) % s.points.length]);
    if (Math.hypot(a.x - b.x, a.y - b.y) < 44) continue; // too short to fit a handle between the points
    const c = toScreen(m.at);
    g.appendChild(svgEl('g', { 'data-role': 'midpoint', 'data-index': m.after, style: 'cursor:copy;touch-action:none;' },
      svgEl('circle', { cx: c.x, cy: c.y, r: 14, fill: 'transparent' }),
      svgEl('circle', { cx: c.x, cy: c.y, r: 7, fill: '#fff', stroke: '#0f766e', 'stroke-width': 1.5, 'pointer-events': 'none' }),
      svgEl('path', { d: `M${c.x - 3.5},${c.y}h7M${c.x},${c.y - 3.5}v7`, stroke: '#0f766e', 'stroke-width': 1.5, 'pointer-events': 'none' })));
  }
  pathPoints(s).forEach((p, i) => {
    const c = toScreen(p);
    g.appendChild(svgEl('g', { 'data-role': 'vertex', 'data-index': i, style: 'cursor:grab;touch-action:none;' },
      svgEl('circle', { cx: c.x, cy: c.y, r: 16, fill: 'transparent' }),
      svgEl('circle', { cx: c.x, cy: c.y, r: i === sel ? 8 : 6, fill: i === sel ? '#0f766e' : '#fff', stroke: '#0f766e', 'stroke-width': 2, 'pointer-events': 'none' })));
  });
}
