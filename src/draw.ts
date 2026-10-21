import { MAX_POINTS, MIN_POINTS } from './constants';
import { svgEl } from './dom';
import { bakeRotation, fmtFeet, outlineOf, pathPoints, pxPerFoot, rotate, screenToFeet, setWorldPoints } from './geometry';
import { flushHistoryDebounce, pushHistory } from './history';
import { state } from './state';
import { save } from './storage';
import { buildShape, CANOPY_MIN_TAPS, isKindKey, kindDef, tapAccepted, TAPS_TO_FINISH, type KindKey, type Method } from './kinds';
import type { DrawState, PathShape, Point, Shape } from './types';
import { plantColor, plantFilter, plantsById } from './plants';
import { snap, uid } from './util';
import { SNAP_MAX_FT, SNAP_PX, snapTargets, snapToShapes, squareUp, tidyOn, setTidyOn, type SnapHit } from './tidy';
import { dismissToastAction, toast, toastAction } from './ui/toast';
import { render } from './ui/render';

// Freeform outlines (closed) and lines (open).
//
// Drawing: each tap on the canvas adds a corner, snapped to the grid, or onto another shape's corner or edge
// when it's close (src/tidy.ts); an outline with nearly square corners is squared when it's done. Drags
// still pan and pinches zoom, so a long fence can be drawn across the plan.
// Tapping the first point (or Done) finishes an outline.
//
// Editing points: drag a point to move it, tap the + on an edge to add one,
// tap a point and Delete point to remove it.

/** How close (screen px) a tap must be to the first point to close an outline. */
const CLOSE_RADIUS_PX = 18;

const isPath = (s: Shape | undefined): s is PathShape => !!s && (s.type === 'poly' || s.type === 'line');

// ---------- Drawing ----------
type DrawKind = DrawState['kind'];
const minPoints = (k: DrawKind) => (k === 'measure' || k === 'line' || k === 'path' ? 2 : k === 'canopy' ? CANOPY_MIN_TAPS : TAPS_TO_FINISH[k] ?? MIN_POINTS.poly);
/** The tap that closes an outline (its first point), once there are enough to close: index into the taps, or -1. */
function closingIndex(d: DrawState): number {
  if (d.kind === 'poly') return d.points.length >= MIN_POINTS.poly ? 0 : -1;
  if (d.kind === 'canopy') return d.points.length >= CANOPY_MIN_TAPS ? 1 : -1; // the first point after the trunk
  return -1;
}

/** Start drawing with `method`, adding a thing of kind `target` (none = a measurement). */
export function startDraw(method: DrawKind, target?: KindKey) {
  flushHistoryDebounce();
  dismissToastAction(); // (a notice about the last drawing gives way to the next)
  state.draw = { kind: method, points: [], ...(target ? { target } : {}) };
  state.placing = null;
  state.pickerForTree = false;
  state.editPoints = null;
  state.selectMode = false;
  state.selectedIds = [];
  state.panel = null;
  state.menu = null;
  hover = null;
}
/**
 * Start adding a thing of this kind: plants open the picker, Measure starts
 * measuring, everything else starts drawing in its remembered method.
 */
export function startKind(key: KindKey) {
  if (key === 'plant' || key === 'tree') {
    // Plants are picked first. An existing tree is picked (or "unknown"), then its canopy drawn.
    state.draw = null; state.editPoints = null; state.placing = null; state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; state.linkOffer = null; state.menu = null;
    state.pickerForTree = key === 'tree';
    // A fresh pick starts with an empty search. (Switching plants while placing keeps it:
    // the next of several plants for the same purpose, say monarch hosts, is likely another match.)
    plantFilter.q = '';
    state.panel = 'plants';
    return;
  }
  if (key === 'measure') { startDraw('measure'); return; }
  startDraw(methodFor(key), key);
}
/** The method a kind starts in: the one last used for it, else its default. */
function methodFor(key: KindKey): Method {
  const def = kindDef(key);
  const remembered = loadPrefs().methods[key];
  return remembered && def.methods.includes(remembered) ? remembered : def.methods[0];
}
/** Draw an existing tree (once picked, or as an unknown tree): its trunk, then its canopy. */
export function startTreeDraw(plantId?: string) {
  startDraw(methodFor('tree'), 'tree');
  if (plantId) state.draw!.plantId = plantId;
}
/** Switch the drawing method (Outline, Rectangle...). Taps so far are kept only between outline and line. */
export function setDrawKind(kind: DrawKind) {
  const d = state.draw;
  if (!d || d.kind === kind) return;
  const keep = (a: DrawKind) => a === 'poly' || a === 'line' || a === 'path';
  if (!(keep(d.kind) && keep(kind))) { d.points = []; d.raw = []; d.snaps = []; }
  d.kind = kind;
  if (d.target && kind !== 'measure') rememberMethod(d.target, kind);
}
/** Length of the current measurement, in feet (null until both ends are placed). */
export function measuredFeet(): number | null {
  const d = state.draw;
  if (!d || d.kind !== 'measure' || d.points.length < 2) return null;
  const [a, b] = d.points;
  return Math.hypot(b.x - a.x, b.y - a.y);
}
export function cancelDraw() { state.draw = null; hover = null; }
export function undoDrawPoint() { state.draw?.points.pop(); state.draw?.raw?.pop(); state.draw?.snaps?.pop(); }
/**
 * Where a tap at `f` (feet) lands: onto another shape's corner or edge when within SNAP_PX on screen (and
 * SNAP_MAX_FT) and tidying is on, else on the grid. Not for plants (an existing tree's trunk and canopy go
 * where they're tapped), notes, or a path's center line (its band's edges are what meet things).
 */
function landing(f: Point, kind: DrawKind, exceptId?: string, plant = false): { p: Point; grid: Point; hit: (SnapHit & { moved: boolean }) | null } {
  const grid = { x: snap(f.x), y: snap(f.y) };
  const hit = tidyOn() && kind !== 'note' && kind !== 'path' && !plant
    ? snapToShapes(f, snapTargets(state.shapes, exceptId), Math.min(SNAP_PX / pxPerFoot(), SNAP_MAX_FT), grid) : null;
  // (`moved`: off the grid point. Where the grid point is on the shape already, nothing was corrected, so
  // nothing is said; it's still on the shape, so squaring keeps it there.)
  const moved = !!hit && (Math.abs(hit.point.x - grid.x) > 1e-6 || Math.abs(hit.point.y - grid.y) > 1e-6);
  return { p: hit ? hit.point : grid, grid, hit: hit && { ...hit, moved } };
}
const drawsPlant = (d: DrawState) => !!d.target && kindDef(d.target).role === 'plant';
export function canFinishDraw(): boolean {
  return !!state.draw && state.draw.points.length >= minPoints(state.draw.kind);
}
/** Methods that finish by themselves once enough points are tapped (no Done button). */
export function finishesItself(kind: DrawKind): boolean { return kind !== 'measure' && TAPS_TO_FINISH[kind] != null; }
/**
 * A tap on the canvas while drawing. Returns true if the drawing finished
 * (tapped the first point of an outline, or the last tap a shape needs).
 */
export function drawTap(clientX: number, clientY: number): boolean {
  const d = state.draw;
  if (!d) return false;
  if (d.kind === 'measure' && d.points.length >= 2) { d.points = []; d.raw = []; d.snaps = []; } // a third tap starts a new measurement
  const ci = closingIndex(d);
  if (ci >= 0) {
    const first = d.points[ci];
    const f = screenToFeet(clientX, clientY);
    if (Math.hypot(f.x - first.x, f.y - first.y) * pxPerFoot() <= CLOSE_RADIUS_PX) { finishDraw(); return true; }
  }
  if (d.points.length >= MAX_POINTS) return false;
  const f = screenToFeet(clientX, clientY);
  const { p, grid, hit } = landing(f, d.kind, undefined, drawsPlant(d));
  const last = d.points.at(-1);
  if (last && last.x === p.x && last.y === p.y) return false; // double tap on the same spot
  if (d.kind !== 'measure' && !tapAccepted(d.kind, d.points, p)) return false; // too small to make a shape
  d.points.push(p);
  // (Kept beside the taps, for the Undo on tidying.)
  (d.raw ??= []).push(grid);
  (d.snaps ??= []).push(hit ? { to: hit.to, shapeId: hit.shapeId, moved: hit.moved } : null);
  if (finishesItself(d.kind) && d.points.length >= (TAPS_TO_FINISH[d.kind as Method] ?? Infinity)) { finishDraw(); return true; }
  return false;
}
/** Turn the drawing into a shape of its kind, selected. */
export function finishDraw(): Shape | null {
  const d = state.draw;
  if (!d || !canFinishDraw()) return null;
  if (d.kind === 'measure') return keepMeasurement();
  const kind = kindDef(d.target ?? 'plain');
  // Tidied: taps that landed on other shapes, and an outline with nearly square corners squared, moving no
  // point more than a foot and a half. Not a property line (it's surveyed, not squared) or a plant.
  const snapped = (d.snaps ?? []).filter((h) => h?.moved);
  let pts = d.points, squared = false;
  if (tidyOn() && d.kind === 'poly' && kind.role !== 'boundary' && kind.role !== 'plant') {
    const sq = squareUp(pts, 1.5, (d.snaps ?? []).map(Boolean), alongTarget(pts, d.snaps ?? []));
    if (sq) { pts = sq; squared = true; }
  }
  const method = d.kind;
  const make = (points: Point[], id?: string) => {
    const sh = buildShape(method, points, drawKindDef(d), state.shapes, id);
    if (sh) finishNew(sh, d);
    return sh;
  };
  const shape = make(pts);
  if (!shape) return null;
  state.draw = null;
  hover = null;
  state.shapes.push(shape);
  state.selectedIds = [shape.id];
  // Most things stay closed so the plan stays in view; a note needs its text, sun exposure its sun record.
  state.panel = kind.openProps ? 'props' : null;
  noteRecentKind(kind.key);
  pushHistory();
  save();
  // Say what was tidied, with an Undo (the shape as tapped) and a way to stop it.
  const raw = d.raw?.length === d.points.length ? withoutRepeats(d.raw, method !== 'line' && method !== 'path') : null;
  if ((snapped.length || squared) && raw) {
    const names = [...new Set(snapped.map((h) => state.shapes.find((x) => x.id === h!.shapeId)).filter(Boolean).map((x) => x!.label || 'a shape'))];
    const said = [snapped.length ? `Lined up with ${names.slice(0, 2).join(' and ')}${names.length > 2 ? ' and others' : ''}` : '', squared ? 'squared the corners' : '']
      .filter(Boolean).join('; ');
    const tidied = JSON.stringify(shape);
    toastAction(said.charAt(0).toUpperCase() + said.slice(1) + '.', [
      { label: 'Undo', run: () => undoTidy(shape.id, tidied, () => buildShape(method, raw, drawKindDef(d), state.shapes.filter((x) => x.id !== shape.id), shape.id)) },
      { label: 'Turn off', run: () => { setTidyOn(false); toast('Snapping and squaring are off. Turn them back on in Layers.', 4000); } },
    ]);
  }
  return shape;
}
/**
 * The direction of an outline edge that lies along another shape: both its ends landed on the same shape
 * and it runs parallel (within a degree) to one of that shape's edges. A bed against the house squares to
 * the house. Undefined if none.
 */
function alongTarget(pts: Point[], snaps: NonNullable<DrawState['snaps']>): number | undefined {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = snaps[i], b = snaps[(i + 1) % n];
    if (!a || !b || a.shapeId !== b.shapeId) continue;
    const t = snapTargets(state.shapes).find((x) => x.id === a.shapeId);
    if (!t) continue;
    const ang = Math.atan2(pts[(i + 1) % n].y - pts[i].y, pts[(i + 1) % n].x - pts[i].x);
    const m = t.pts.length, edges = t.closed ? m : m - 1;
    for (let k = 0; k < edges; k++) {
      const e = Math.atan2(t.pts[(k + 1) % m].y - t.pts[k].y, t.pts[(k + 1) % m].x - t.pts[k].x);
      const diff = Math.abs((((ang - e) * 180) / Math.PI) % 180);
      if (Math.min(diff, 180 - diff) <= 1) return ang;
    }
  }
  return undefined;
}
/** A new shape's finishing touches: a picked tree's plant, the plan's shown status or phase. */
function finishNew(shape: Shape, d: DrawState) {
  // An existing tree picked from the list: it's that plant (still sized as drawn).
  const tree = d.plantId ? plantsById[d.plantId] : undefined;
  if (tree && shape.type === 'circle') {
    shape.plantId = tree.id;
    shape.label = tree.common;
    if (tree.color || tree.form) shape.color = plantColor(tree);
  }
  // A plant added while the plan shows one status or phase joins it (else it would vanish from view).
  const f = state.viewFilter;
  if (shape.role === 'plant') {
    if (f.status && f.status !== 'gone') shape.status = f.status;
    if (f.phase) shape.phase = f.phase;
  }
}
/**
 * Put back a tidied shape as it was tapped (a step of its own, for Redo), if it's still as it was tidied:
 * changed since, it's left alone and said so.
 */
function undoTidy(id: string, tidied: string, asTapped: () => Shape | null) {
  const i = state.shapes.findIndex((x) => x.id === id);
  if (i < 0 || JSON.stringify(state.shapes[i]) !== tidied) { toast('It has changed since, so it was left as it is.'); return; }
  const back = asTapped();
  if (!back) { toast("Couldn't put it back as tapped (those taps don't make a shape), so it was left tidied."); return; }
  // Its geometry as tapped; the rest (its name, a plan's shown status or phase) as it was given.
  const was = state.shapes[i];
  state.shapes[i] = { ...back, label: was.label, ...(was.status ? { status: was.status } : {}), ...(was.phase ? { phase: was.phase } : {}) } as Shape;
  flushHistoryDebounce();
  pushHistory();
  save();
  render();
}

/** Points without one repeated next to another (round a closed outline too): grid points two snapped taps shared. */
function withoutRepeats(pts: Point[], closed: boolean): Point[] {
  const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
  const out = pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]));
  while (closed && out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
  return out;
}
/** The kind being drawn, with the width set while drawing a path. */
export function drawKindDef(d: DrawState) {
  const kind = kindDef(d.target ?? 'plain');
  return d.pathWidth ? { ...kind, pathWidth: d.pathWidth } : kind;
}
/** Width of the path being drawn (feet). */
export function drawPathWidth(): number { const d = state.draw; return d ? drawKindDef(d).pathWidth ?? 3 : 3; }
export function setDrawPathWidth(w: number) { if (state.draw && w >= 0.25 && w <= 50) state.draw.pathWidth = w; }

// ---------- Remembered per device: method per kind, recently added kinds ----------
interface KindPrefs { methods: Partial<Record<KindKey, Method>>; recent: KindKey[] }
const PREFS_KEY = 'lp-kind-prefs';
function loadPrefs(): KindPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<KindPrefs>;
    const methods: KindPrefs['methods'] = {};
    for (const [k, m] of Object.entries(raw.methods ?? {})) if (isKindKey(k) && kindDef(k).methods.includes(m as Method)) methods[k] = m as Method;
    const recent = Array.isArray(raw.recent) ? raw.recent.filter(isKindKey) : [];
    return { methods, recent };
  } catch { return { methods: {}, recent: [] }; } // no storage: nothing remembered, which is fine
}
function savePrefs(p: KindPrefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* not remembered */ } }
function rememberMethod(key: KindKey, m: Method) { const p = loadPrefs(); p.methods[key] = m; savePrefs(p); }
/** Kinds added most recently from the Add sheet (newest first; plants and measuring aren't listed). */
export function recentKinds(): KindKey[] { return loadPrefs().recent.slice(0, 2); }
function noteRecentKind(key: KindKey) {
  const p = loadPrefs();
  p.recent = [key, ...p.recent.filter((k) => k !== key)].slice(0, 4);
  savePrefs(p);
}

// ---------- Where the pointer is (mouse only), for a preview of the next tap ----------
let hover: Point | null = null;
export function setDrawHover(p: Point | null) { hover = p ? (state.draw ? landing(p, state.draw.kind, undefined, drawsPlant(state.draw)).p : { x: snap(p.x), y: snap(p.y) }) : null; }

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
  d.points = []; d.raw = []; d.snaps = [];
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
/** The last point moved onto another shape (said when the drag ends), or null. */
let vertexSnap: { id: string; index: number; at: Point; grid: Point; shapeId: string } | null = null;
/** Move point `i` to a world position (snapped). Doesn't record history. */
export function moveVertex(s: PathShape, i: number, world: Point) {
  const pts = pathPoints(s);
  if (i < 0 || i >= pts.length) return;
  // (Onto another shape's corner or edge when close, as when drawing: not a path's center line or a plant's.)
  const method: DrawKind = s.type === 'poly' ? 'poly' : s.pathWidth ? 'path' : 'line';
  const { p, grid, hit } = landing(world, method, s.id, s.role === 'plant');
  pts[i] = p;
  vertexSnap = hit?.moved ? { id: s.id, index: i, at: p, grid, shapeId: hit.shapeId } : null;
  setWorldPoints(s, pts);
}
/**
 * A point drag ended (its step recorded): if it landed on another shape, say so, with an Undo (back on the grid
 * point) and a way to stop it.
 */
export function vertexDropped(id: string) {
  const v = vertexSnap;
  vertexSnap = null;
  if (!v || v.id !== id) return;
  const other = state.shapes.find((x) => x.id === v.shapeId);
  toastAction(`Point lined up with ${other?.label || 'a shape'}.`, [
    { label: 'Undo', run: () => {
      const s = state.shapes.find((x) => x.id === v.id);
      const pts = s && isPath(s) ? pathPoints(s) : null;
      const now = pts?.[v.index];
      if (!s || !isPath(s) || !pts || !now || Math.abs(now.x - v.at.x) > 1e-6 || Math.abs(now.y - v.at.y) > 1e-6) { toast('It has changed since, so it was left as it is.'); return; }
      pts[v.index] = v.grid;
      setWorldPoints(s, pts);
      flushHistoryDebounce(); pushHistory(); save(); render();
    } },
    { label: 'Turn off', run: () => { setTidyOn(false); toast('Snapping and squaring are off. Turn them back on in Layers.', 4000); } },
  ]);
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
    renderDrawPreview(g, d);
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

const INK = '#0f766e';
/** The shape being drawn: what's tapped so far, plus (with a mouse) where the next tap would go. */
function renderDrawPreview(g: SVGElement, d: DrawState) {
  if (d.kind === 'measure') return;
  const method = d.kind;
  const ppf = pxPerFoot();
  const taps = d.points;
  const withHover = hover && (taps.length === 0 || !samePoint(hover, taps.at(-1)!)) ? [...taps, hover] : taps;
  const need = TAPS_TO_FINISH[method];
  const kind = drawKindDef(d);
  const shown = need != null ? withHover.slice(0, need) : withHover;
  const preview = need != null && shown.length >= need ? buildShape(method, shown, kind, state.shapes, 'preview') : null;
  const ghost = { 'pointer-events': 'none', 'data-role': 'draw-path' };
  if (preview && preview.type === 'circle') {
    const c = toScreen(preview);
    g.appendChild(svgEl('circle', { ...ghost, cx: c.x, cy: c.y, r: preview.radius * ppf, fill: 'rgba(13,148,136,0.15)', stroke: INK, 'stroke-width': 2.5 }));
  } else if (preview && (preview.type === 'rect' || preview.type === 'oval')) {
    const cx = preview.x + preview.width / 2, cy = preview.y + preview.height / 2;
    const pts = outlineOf(preview).map((p) => { const r = rotate(p.x - cx, p.y - cy, preview.rotation); return toScreen({ x: cx + r.x, y: cy + r.y }); });
    g.appendChild(svgEl('polygon', { ...ghost, points: pts.map((p) => `${p.x},${p.y}`).join(' '), fill: 'rgba(13,148,136,0.15)', stroke: INK, 'stroke-width': 2.5 }));
  } else if (method === 'canopy') {
    // The trunk, and the canopy outline around it.
    const edge = shown.slice(1).map(toScreen);
    if (edge.length > 1) {
      g.appendChild(svgEl(edge.length > 2 ? 'polygon' : 'polyline', {
        ...ghost, points: edge.map((p) => `${p.x},${p.y}`).join(' '),
        fill: edge.length > 2 ? 'rgba(13,148,136,0.15)' : 'none', stroke: INK, 'stroke-width': 2.5,
      }));
    }
  } else if ((method === 'circle' || method === 'trunk') && shown.length === 2) {
    // too small to be a circle yet: just the radius
    const [a, b] = shown.map(toScreen);
    g.appendChild(svgEl('line', { ...ghost, x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: INK, 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
  } else if (shown.length > 1) {
    const pts = shown.map(toScreen);
    const closed = (method === 'poly' || method === 'triangle') && pts.length > 2;
    if (method === 'path') {
      const width = (kind.pathWidth ?? 3) * ppf;
      g.appendChild(svgEl('polyline', { ...ghost, 'data-role': 'draw-band', points: pts.map((p) => `${p.x},${p.y}`).join(' '), fill: 'none', stroke: 'rgba(120,113,108,0.35)', 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': 'butt' }));
    }
    g.appendChild(svgEl(closed ? 'polygon' : 'polyline', {
      ...ghost, points: pts.map((p) => `${p.x},${p.y}`).join(' '),
      fill: closed ? 'rgba(13,148,136,0.15)' : 'none',
      stroke: INK, 'stroke-width': 2.5, 'stroke-dasharray': closed || method === 'rect' || method === 'oval' ? null : '8 4',
    }));
  }
  taps.forEach((p, i) => {
    const c = toScreen(p);
    const closer = i === closingIndex(d);
    const trunk = i === 0 && (method === 'canopy' || method === 'trunk');
    g.appendChild(svgEl('circle', {
      'data-role': closer ? 'draw-close' : trunk ? 'draw-trunk' : 'draw-point', cx: c.x, cy: c.y, r: closer ? 10 : trunk ? 7 : 5,
      fill: closer ? 'rgba(15,118,110,0.25)' : trunk ? '#78350f' : INK, stroke: closer ? INK : '#fff', 'stroke-width': 2, 'pointer-events': 'none',
    }));
  });
  if (hover && withHover.length > taps.length) {
    const c = toScreen(hover);
    g.appendChild(svgEl('circle', { 'data-role': 'draw-hover', cx: c.x, cy: c.y, r: 4, fill: 'none', stroke: INK, 'stroke-width': 1.5, 'pointer-events': 'none' }));
  }
}
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
