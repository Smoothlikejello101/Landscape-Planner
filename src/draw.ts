import { MAX_POINTS, MIN_POINTS } from './constants';
import { afterPointAdded, afterPointDeleted, kindsFor } from './features';
import { startFeaturePlace } from './feature-edit';
import { svgEl } from './dom';
import { bakeRotation, canvasRect, fmtFeet, outlineOf, pathPoints, pxPerFoot, rotate, screenToFeet, setWorldPoints } from './geometry';
import { flushHistoryDebounce, pushHistory, undo } from './history';
import { gesture, state } from './state';
import { save } from './storage';
import { buildShape, CANOPY_MIN_TAPS, isKindKey, kindDef, tapAccepted, TAPS_TO_FINISH, type KindKey, type Method } from './kinds';
import type { DrawState, PathShape, Point, Shape, TapSnap } from './types';
import { plantColor, plantFilter, plantsById } from './plants';
import { snap, uid } from './util';
import { SNAP_MAX_FT, SNAP_PX, SNAP_PX_MOUSE, setSnapOn, setSquareOn, snapOn, snapTargets, snapToShapes, squareOn, squareUp } from './tidy';
import { dismissToastAction, toast, toastAction } from './ui/toast';
import { angleSpot, clipToBox, cornerAngle, lengthText, middleOf, SIDE_LABEL_MIN_PX, sideLabelSpot, typedFarSide, typedPoint } from './draw-numbers';
import { render } from './ui/render';
import { offerToVines } from './ui/vine-offers';

// Freeform outlines (closed) and lines (open).
//
// Drawing: each tap on the canvas adds a corner, snapped to the grid, or onto another shape's corner or edge
// when it's close (src/tidy.ts): the dot lands there, the edge lights up, and the draw bar says so, with an
// Unsnap. What the dots show is what's made, except that an outline with nearly square corners is squared
// when it's done, which is said, with an Undo. Drags still pan and pinches zoom, so a long fence can be drawn
// across the plan.
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
  state.featurePlace = null;
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
    state.draw = null; state.editPoints = null; state.placing = null; state.featurePlace = null; state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; state.linkOffer = null; state.menu = null;
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
  if (!(keep(d.kind) && keep(kind))) { d.points = []; d.snaps = []; d.exact = []; delete d.lastTap; }
  if (!typedApplies({ ...d, kind })) delete d.typed;
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
export function undoDrawPoint() {
  const d = state.draw;
  if (!d) return;
  d.points.pop(); d.snaps?.pop(); d.exact?.pop(); delete d.lastTap;
  delete d.typed; // (a length typed for the side after the point taken back isn't for the one before it)
}
/**
 * Where a tap at `f` (feet) lands: onto another shape's corner or edge when within SNAP_PX on screen (and
 * SNAP_MAX_FT) and snapping is on, else on the grid. Not for plants (an existing tree's trunk and canopy go
 * where they're tapped), notes, or a path's center line (its band's edges are what meet things).
 */
function landing(f: Point, kind: DrawKind, exceptId?: string, plant = false, reachPx = pointerKind === 'mouse' ? SNAP_PX_MOUSE : SNAP_PX): { p: Point; snapped: TapSnap | null } {
  const grid = { x: snap(f.x), y: snap(f.y) };
  const hit = snapOn() && kind !== 'note' && kind !== 'path' && !plant
    ? snapToShapes(f, snapTargets(state.shapes, exceptId), Math.min(reachPx / pxPerFoot(), SNAP_MAX_FT), grid) : null;
  // (On the shape at the grid point anyway: nothing to unsnap, but still on it, so squaring keeps it there.)
  return hit ? { p: hit.point, snapped: { to: hit.to, shapeId: hit.shapeId, seg: hit.seg, angles: hit.angles, alt: grid } } : { p: grid, snapped: null };
}
/** What the last press on the plan was ('mouse', 'touch', 'pen'): a fingertip's miss is wider than a mouse's. */
let pointerKind = 'touch';
export function notePointer(type: string) { pointerKind = type || 'touch'; }
const samePt = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
/** A snap that moved the point (unsnapping would change something). */
export const snapMoved = (s: TapSnap | null | undefined, p: Point | undefined): s is TapSnap => !!s && !!p && !samePt(s.alt, p);
/** How close (screen px) and soon (ms) a second tap must be to the last to be the same tap again (a double tap). */
const SAME_TAP_PX = 20, SAME_TAP_MS = 350;
/** The plan moved under the finger (a pan or pinch): the next tap in the same spot on screen is a new one. */
export function forgetLastTap() { if (state.draw) delete state.draw.lastTap; }
const drawsPlant = (d: DrawState) => !!d.target && kindDef(d.target).role === 'plant';
export function canFinishDraw(): boolean {
  return !!state.draw && state.draw.points.length >= minPoints(state.draw.kind);
}
/** Methods that finish by themselves once enough points are tapped (no Done button). */
export function finishesItself(kind: DrawKind): boolean { return kind !== 'measure' && TAPS_TO_FINISH[kind] != null; }
/** Drawing methods whose next side can be typed: outlines, lines and paths, and a rectangle's two sides. */
export function typedApplies(d: Pick<DrawState, 'kind' | 'points'>): boolean {
  const n = d.points.length;
  if (d.kind === 'poly' || d.kind === 'line' || d.kind === 'path') return n >= 1;
  return d.kind === 'rect' && (n === 1 || n === 2);
}
/** What the typed side is called in the bar: a rectangle's first side, then its other; else the next side. */
export function typedLabel(d: Pick<DrawState, 'kind' | 'points'>): string {
  return d.kind === 'rect' ? (d.points.length === 1 ? 'This side' : 'Other side') : 'Next side';
}
/** The length typed for the next side (silently: the bar's field, typed without a re-render). */
export function setTypedLength(v: number | null) {
  const d = state.draw;
  if (!d) return;
  if (v == null || !typedApplies(d)) delete d.typed; else d.typed = v;
}
/** Where a tap toward `f` (feet) puts the next point at the typed length; null without one. */
function typedTarget(d: DrawState, f: Point): Point | null {
  if (!d.typed || !typedApplies(d)) return null;
  const pts = d.points, last = pts.at(-1)!;
  if (d.kind === 'rect' && pts.length === 2) return typedFarSide(pts[0], pts[1], f, d.typed);
  const before = pts.at(-2);
  const prevDir = before ? Math.atan2(last.y - before.y, last.x - before.x) : undefined;
  return typedPoint(last, f, d.typed, prevDir);
}
/**
 * Whether a tap at `f` (feet) closes the outline being drawn: by its first dot, or by where that was tapped before it
 * snapped, or landing on it, once there are enough points to close.
 */
function closesAt(d: DrawState, f: Point): boolean {
  const ci = closingIndex(d);
  if (ci < 0) return false;
  const first = d.points[ci], firstSnap = d.snaps?.[ci];
  // (No wider than 3 ft zoomed far out: at 5% 18 px is 15 ft, and a small bed would close on its fourth tap.)
  const by = (q: Point) => Math.hypot(f.x - q.x, f.y - q.y) * pxPerFoot() <= Math.max(8, Math.min(CLOSE_RADIUS_PX, 3 * pxPerFoot()));
  // (Or landing on the same shape as the first point, within a grid step of it: a near miss beside the wall.)
  const l = landing(f, d.kind, undefined, drawsPlant(d));
  const besideFirst = !!firstSnap && l.snapped?.shapeId === firstSnap.shapeId && Math.hypot(l.p.x - first.x, l.p.y - first.y) <= 0.5 + 1e-9;
  return by(first) || (!!firstSnap && by(firstSnap.alt)) || samePt(l.p, first) || besideFirst;
}
/**
 * A tap on the canvas while drawing. Returns true if the drawing finished
 * (tapped the first point of an outline, or the last tap a shape needs).
 */
export function drawTap(clientX: number, clientY: number): boolean {
  const d = state.draw;
  if (!d) return false;
  if (d.kind === 'measure' && d.points.length >= 2) { d.points = []; d.snaps = []; d.exact = []; delete d.lastTap; } // a third tap starts a new measurement
  if (closesAt(d, screenToFeet(clientX, clientY))) { finishDraw(); return true; }
  if (d.points.length >= MAX_POINTS) return false;
  // A length typed for this side: the tap gives only its direction (no grid, no snapping: the length is exact).
  const typed = typedTarget(d, screenToFeet(clientX, clientY));
  if (typed) {
    // (A typed side that ends by the first point closes the outline there, rather than doubling the corner.)
    if (closesAt(d, typed)) { finishDraw(); return true; }
    if (d.kind !== 'measure' && !tapAccepted(d.kind, d.points, typed)) { toast('That side is too short to make a shape.', 2500); return false; }
    d.points.push(typed);
    (d.snaps ??= []).push(null);
    // (Both ends of a typed side stay where they are when the outline's squared, so the side keeps its length.)
    const exact = (d.exact ??= []);
    while (exact.length < d.points.length - 1) exact.push(false);
    if (exact.length) exact[exact.length - 1] = true;
    exact.push(true);
    delete d.typed;
    d.lastTap = { x: clientX, y: clientY, t: Date.now() };
    if (finishesItself(d.kind) && d.points.length >= (TAPS_TO_FINISH[d.kind as Method] ?? Infinity)) { finishDraw(); return true; }
    return false;
  }
  // A double tap: the finger in the same spot (not where it landed: two taps either side of a wall both land on it).
  const now = Date.now();
  if (d.lastTap && now - d.lastTap.t <= SAME_TAP_MS && Math.hypot(clientX - d.lastTap.x, clientY - d.lastTap.y) <= SAME_TAP_PX) return false;
  const f = screenToFeet(clientX, clientY);
  let { p, snapped } = landing(f, d.kind, undefined, drawsPlant(d));
  const last = d.points.at(-1);
  // Landing on the last point: the same spot again where the finger's by it; tapped farther off (a foot out
  // from a wall, after a point on it), it goes on the grid instead.
  if (last && samePt(last, p)) {
    const fingerOff = Math.hypot(f.x - last.x, f.y - last.y) * pxPerFoot();
    if (!snapped || samePt(last, snapped.alt) || fingerOff <= SAME_TAP_PX) return false;
    p = snapped.alt; snapped = null;
  }
  // The same spot as the last tap before it snapped ("did it register?", tapped again): not a new point.
  const lastSnapped = d.snaps?.[d.points.length - 1];
  if (lastSnapped && (samePt(snapped?.alt ?? p, lastSnapped.alt) || Math.hypot(f.x - lastSnapped.alt.x, f.y - lastSnapped.alt.y) * pxPerFoot() <= SAME_TAP_PX / 2)) return false;
  const fits = (q: Point) => d.kind === 'measure' || tapAccepted(d.kind, d.points, q);
  // A snap never makes a tap fail (a triangle's third corner on the same wall as the first two would be in line
  // with them): where it would, the tap goes on the grid instead.
  if (!fits(p)) {
    if (!snapped || !fits(snapped.alt) || (last && samePt(last, snapped.alt))) return false; // too small to make a shape
    p = snapped.alt; snapped = null;
  }
  d.points.push(p);
  (d.snaps ??= []).push(snapped);
  if (d.exact) { while (d.exact.length < d.points.length - 1) d.exact.push(false); d.exact.push(false); }
  d.lastTap = { x: clientX, y: clientY, t: now };
  if (finishesItself(d.kind) && d.points.length >= (TAPS_TO_FINISH[d.kind as Method] ?? Infinity)) { finishDraw(); return true; }
  return false;
}
/** Turn the drawing into a shape of its kind, selected. */
export function finishDraw(): Shape | null {
  const d = state.draw;
  if (!d || !canFinishDraw()) return null;
  if (d.kind === 'measure') return keepMeasurement();
  const kind = kindDef(d.target ?? 'plain');
  const method = d.kind;
  const snaps = d.snaps ?? [];
  const others = (id: string) => state.shapes.filter((x) => x.id !== id);
  // What the dots show is what's made. Two things change it after, each its own step (the notice's Undo is the
  // toolbar's: one step back), and each said:
  // - an outline with nearly square corners, squared (not a property line, which is surveyed, or a plant);
  // - a shape that finishes on its last tap, made before that tap's dot was shown: if it landed on another
  //   shape, made first as on the grid, then as landed.
  let seen = d.points, tidied: Point[] | null = null, said = '';
  if (squareOn() && method === 'poly' && kind.role !== 'boundary' && kind.role !== 'plant') {
    // (A point put down at a typed length stays where it is, as a snapped one does.)
    const sq = squareUp(seen, maxSquareMove(seen), seen.map((_, i) => !!snaps[i] || !!d.exact?.[i]), wallDirection(seen, snaps));
    if (sq) {
      tidied = sq;
      const moved = Math.max(...sq.map((q, i) => Math.hypot(q.x - seen[i].x, q.y - seen[i].y)));
      said = `Squared the corners (moved up to ${fmtFeet(Math.max(0.1, Math.round(moved * 10) / 10))} ft).`;
    }
  } else if (finishesItself(method) && snapMoved(snaps.at(-1), seen.at(-1))) {
    const last = snaps.at(-1)!;
    const onGrid = [...seen.slice(0, -1), last.alt];
    if (buildShape(method, onGrid, drawKindDef(d), state.shapes, 'check')) {
      tidied = seen; seen = onGrid;
      said = `Last point on ${shapeName(last.shapeId)}.`;
    }
  }
  const shape = buildShape(method, seen, drawKindDef(d), state.shapes);
  if (!shape) return null;
  finishNew(shape, d);
  state.draw = null;
  hover = null;
  state.shapes.push(shape);
  state.selectedIds = [shape.id];
  // Most things stay closed so the plan stays in view; a note needs its text, sun exposure its sun record.
  state.panel = kind.openProps ? 'props' : null;
  noteRecentKind(kind.key);
  pushHistory();
  // (A fence or a building drawn by a vine: offered to it, src/ui/vine-offers.ts.)
  offerToVines(shape);
  // Asked for while drawing: on to its doors and windows, gates or steps, tapped onto its edges.
  const subs = d.thenFeatures ? kindsFor(shape) : [];
  if (subs.length) startFeaturePlace(shape.id, subs[0]);
  const after = tidied && buildShape(method, tidied, drawKindDef(d), others(shape.id), shape.id);
  if (after) {
    finishNew(after, d);
    const i = state.shapes.findIndex((x) => x.id === shape.id);
    state.shapes[i] = { ...after, label: shape.label } as Shape;
    pushHistory();
    const step = state.history[state.historyIndex];
    const isSquare = method === 'poly';
    toastAction(said, [
      { label: 'Undo', run: () => {
        flushHistoryDebounce();
        if (state.history[state.historyIndex] !== step) { toast('It has changed since, so it was left as it is.'); return; }
        undo(); render();
      } },
      isSquare
        ? { label: 'Stop squaring', keep: true, run: () => { setSquareOn(false); toast('Squaring is off: turn it back on in \u22ee \u2192 Settings.', 4000); } }
        : { label: 'Stop snapping', keep: true, run: () => { setSnapOn(false); toast('Snapping is off: turn it back on in \u22ee \u2192 Settings.', 4000); } },
    ], 10000);
  }
  save();
  return state.shapes.find((x) => x.id === shape.id) ?? shape;
}
/** The shape a snap landed on, by name: "House", or "another shape". */
export function shapeName(id: string): string { return state.shapes.find((x) => x.id === id)?.label || 'another shape'; }
/**
 * How far squaring may move a point: a foot and a half at most, and a tenth of the outline's shortest edge (a
 * small bed isn't reshaped), but always a half-foot grid step (a tap's usual error).
 */
function maxSquareMove(pts: Point[]): number {
  const n = pts.length;
  const shortest = Math.min(...pts.map((p, i) => Math.hypot(pts[(i + 1) % n].x - p.x, pts[(i + 1) % n].y - p.y)));
  return Math.min(1.5, Math.max(0.5, shortest / 10));
}
/**
 * The direction to square an outline to: a wall it was drawn against. Where a corner landed on another shape and
 * an edge of the outline from it runs within 5° of that shape's edge there (or square to it), that shape's
 * edge's direction: a bed against a turned house squares to the house, even with one corner on it. Undefined
 * (the grid, or the outline's own) if none.
 */
export function wallDirection(pts: Point[], snaps: (TapSnap | null)[]): number | undefined {
  const n = pts.length, deg = Math.PI / 180;
  const off = (a: number, b: number) => { const r = Math.abs((a - b) % (Math.PI / 2)); return Math.min(r, Math.PI / 2 - r); };
  const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
  // (An edge snap first: a wall is the likelier intent than a corner's two edges.)
  const order = [...snaps.keys()].sort((a, b) => Number(snaps[b]?.to === 'edge') - Number(snaps[a]?.to === 'edge'));
  for (const i of order) {
    const s = snaps[i];
    if (!s) continue;
    const drawn = [angle(pts[(i + n - 1) % n], pts[i]), angle(pts[i], pts[(i + 1) % n])];
    for (const t of s.angles) if (drawn.some((e) => off(e, t) <= 5 * deg)) return t;
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
let hover: Point | null = null, hoverSnap: TapSnap | null = null, hoverRaw: Point | null = null;
/**
 * A rectangle with its other side's length typed: made with Enter (testers, Oct 30: five of them pressed Enter and
 * waited; the shortcut list says Enter finishes drawing). On the side the mouse was last on, or with none (a phone, a
 * keyboard), the side facing the middle of the screen; Undo takes it back. False when there's no such rectangle.
 */
export function finishTypedRect(): boolean {
  const d = state.draw;
  if (!d || d.kind !== 'rect' || d.points.length !== 2 || !d.typed) return false;
  const [a, b] = d.points, r = canvasRect(), ppf = pxPerFoot();
  const mid = screenToFeet(r.left + r.width / 2, r.top + r.height / 2);
  let toward = hoverRaw ?? mid;
  if (!typedFarSide(a, b, toward, d.typed)) toward = { x: (a.x + b.x) / 2 - (b.y - a.y), y: (a.y + b.y) / 2 + (b.x - a.x) }; // (on the line: either side)
  return drawTap(r.left + (toward.x - state.offsetX) * ppf, r.top + (toward.y - state.offsetY) * ppf);
}
export function setDrawHover(p: Point | null) {
  hoverRaw = p;
  // (A hover is a mouse's: its tighter reach.)
  // (By the first dot, a click closes the outline: the preview shows that, not the typed side.)
  const typed = p && state.draw && !closesAt(state.draw, p) ? typedTarget(state.draw, p) : null;
  if (typed) { hover = typed; hoverSnap = null; return; }
  const l = p && state.draw ? landing(p, state.draw.kind, undefined, drawsPlant(state.draw), SNAP_PX_MOUSE) : null;
  hover = l ? l.p : p ? { x: snap(p.x), y: snap(p.y) } : null;
  hoverSnap = l?.snapped ?? null;
}

// ---------- Unsnap: the last tap, or a dragged point, back on the grid ----------
/** The last tap's snap, if it moved the tap (what the draw bar's "On House · Unsnap" chip is about). */
export function lastSnap(): TapSnap | null {
  const d = state.draw;
  const s = d?.snaps?.[d.points.length - 1];
  return d && snapMoved(s, d.points.at(-1)) ? s : null;
}
/** Put the last tap where it would have gone without snapping (if it still makes a shape there). */
export function unsnapLast() {
  const d = state.draw, s = lastSnap();
  if (!d || !s) return;
  const before = d.points.slice(0, -1), prev = before.at(-1);
  if ((prev && samePt(prev, s.alt)) || (d.kind !== 'measure' && !tapAccepted(d.kind, before, s.alt))) { toast("Off the shape, that point wouldn't make a shape: left on it.", 3000); return; }
  d.points[d.points.length - 1] = s.alt;
  d.snaps![d.points.length - 1] = null;
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
  d.points = []; d.snaps = []; delete d.lastTap;
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
  state.selectedIds = [id]; // (its width, typed in the bar, goes to it)
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
  // (Onto another shape's corner or edge when close, as when drawing: not a path's center line or a plant's.
  // It's lit while dragging, and the bar offers Unsnap after.)
  const method: DrawKind = s.type === 'poly' ? 'poly' : s.pathWidth ? 'path' : 'line';
  const { p, snapped } = landing(world, method, s.id, s.role === 'plant');
  pts[i] = p;
  if (state.editPoints) { if (snapMoved(snapped, p)) state.editPoints.snap = { ...snapped, index: i, at: p }; else delete state.editPoints.snap; }
  setWorldPoints(s, pts);
}
/** The selected point's snap, if it was dragged onto another shape and is still there (not undone since). */
export function vertexSnap(): (TapSnap & { index: number; at: Point }) | null {
  const e = state.editPoints, s = editedShape();
  if (!e?.snap || !s || e.vertex !== e.snap.index) return null;
  const now = pathPoints(s)[e.snap.index];
  return now && Math.hypot(now.x - e.snap.at.x, now.y - e.snap.at.y) < 1e-6 ? e.snap : null;
}
/** Put a point dragged onto another shape where it would have gone without snapping (a step of its own). */
export function unsnapVertex() {
  const s = editedShape(), v = vertexSnap();
  if (!s || !v) return;
  const pts = pathPoints(s);
  pts[v.index] = v.alt;
  setWorldPoints(s, pts);
  delete state.editPoints!.snap;
  flushHistoryDebounce(); pushHistory(); save();
}
/** Insert a point after point `afterIndex` (on that edge). Returns the new point's index. */
export function insertVertex(s: PathShape, afterIndex: number, world: Point): number {
  if (s.points.length >= MAX_POINTS) return -1;
  const pts = pathPoints(s);
  const p = { x: snap(world.x), y: snap(world.y) };
  // (Its doors, windows or gates stay on their walls: the edge split in two where the point went in, which is
  // where it was pressed, snapped, not always the middle; the edges after it renumbered.)
  const a = pts[afterIndex], b = pts[(afterIndex + 1) % pts.length];
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = len2 > 0 ? ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2 : 0.5;
  pts.splice(afterIndex + 1, 0, p);
  setWorldPoints(s, pts);
  if (s.features?.length) s.features = afterPointAdded(s.features, afterIndex, t);
  return afterIndex + 1;
}
export function canDeleteVertex(): boolean {
  const s = editedShape();
  const v = state.editPoints?.vertex;
  return !!s && v != null && v < s.points.length && s.points.length > MIN_POINTS[s.type];
}
export function deleteSelectedVertex() {
  const s = editedShape();
  const i = state.editPoints?.vertex;
  if (!s || i == null || !canDeleteVertex()) return;
  flushHistoryDebounce();
  const pts = pathPoints(s);
  // (Its doors, windows or gates stay where they were along the walls: the two edges that met there become one.)
  if (s.features?.length) {
    const closed = s.type === 'poly', n = pts.length;
    const lens = Array.from({ length: closed ? n : n - 1 }, (_, j) => Math.hypot(pts[(j + 1) % n].x - pts[j].x, pts[(j + 1) % n].y - pts[j].y));
    s.features = afterPointDeleted(s.features, i, lens, closed);
  }
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
    pts.forEach((p, i) => g.appendChild(d.snaps?.[i] ? snapDot(p) : svgEl('circle', { 'data-role': 'draw-point', cx: p.x, cy: p.y, r: 5, fill: '#b45309', stroke: '#fff', 'stroke-width': 2, 'pointer-events': 'none' })));
    litTargets(g, d);
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
  // A point dragged onto another shape: the shape's edge or corner lit.
  const snapped = state.editPoints.snap;
  if (snapped) snapTarget(g, snapped);
  // The sides' lengths (clear of the + on each side's middle), and the angle at the selected point.
  editNumbers(g, s, sel);
  pathPoints(s).forEach((p, i) => {
    const c = toScreen(p);
    const on = snapped?.index === i;
    g.appendChild(svgEl('g', { 'data-role': 'vertex', 'data-index': i, ...(on ? { 'data-snapped': 'true' } : {}), style: 'cursor:grab;touch-action:none;' },
      svgEl('circle', { cx: c.x, cy: c.y, r: 16, fill: 'transparent' }),
      svgEl('circle', { cx: c.x, cy: c.y, r: i === sel ? 8 : 6, fill: i === sel ? (on ? SNAP_INK : '#0f766e') : '#fff', stroke: on ? SNAP_INK : '#0f766e', 'stroke-width': 2, 'pointer-events': 'none' })));
  });
}

// ---------- Snaps, shown as they happen ----------
/** The color of a snap: the edge or corner a point landed on, and the point's ring. */
const SNAP_INK = '#c2410c';
/** Light the edge or corner a snap landed on. */
function snapTarget(g: SVGElement, s: TapSnap, faint = false) {
  const [a, b] = s.seg.map(toScreen);
  const ghost = { 'data-role': 'snap-target', 'pointer-events': 'none' };
  if (s.to === 'edge') g.appendChild(svgEl('line', { ...ghost, x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: SNAP_INK, 'stroke-width': 6, 'stroke-opacity': faint ? 0.3 : 0.6, 'stroke-linecap': 'round' }));
  else g.appendChild(svgEl('rect', { ...ghost, x: a.x - 9, y: a.y - 9, width: 18, height: 18, rx: 3, fill: 'none', stroke: SNAP_INK, 'stroke-width': 2.5, 'stroke-opacity': faint ? 0.5 : 1 }));
}
/** A tapped point that landed on another shape: ringed in the snap's color. */
const snapDot = (c: Point) => svgEl('circle', { 'data-role': 'draw-point', 'data-snapped': 'true', cx: c.x, cy: c.y, r: 6, fill: '#fff', stroke: SNAP_INK, 'stroke-width': 3, 'pointer-events': 'none' });
/** While drawing: the last tap's target lit, and (with a mouse) the one the next tap would land on, fainter. */
function litTargets(g: SVGElement, d: DrawState) {
  const last = d.snaps?.[d.points.length - 1];
  if (last) snapTarget(g, last);
  const same = last && hoverSnap && hoverSnap.shapeId === last.shapeId && samePt(hoverSnap.seg[0], last.seg[0]) && samePt(hoverSnap.seg[1], last.seg[1]);
  if (hoverSnap && !same) snapTarget(g, hoverSnap, true);
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
  litTargets(g, d);
  taps.forEach((p, i) => {
    const c = toScreen(p);
    const closer = i === closingIndex(d);
    const trunk = i === 0 && (method === 'canopy' || method === 'trunk');
    if (d.snaps?.[i] && !closer) { g.appendChild(snapDot(c)); return; }
    g.appendChild(svgEl('circle', {
      'data-role': closer ? 'draw-close' : trunk ? 'draw-trunk' : 'draw-point', cx: c.x, cy: c.y, r: closer ? 10 : trunk ? 7 : 5,
      fill: closer ? 'rgba(15,118,110,0.25)' : trunk ? '#78350f' : INK, stroke: closer ? INK : '#fff', 'stroke-width': 2, 'pointer-events': 'none',
    }));
  });
  if (hover && withHover.length > taps.length) {
    const c = toScreen(hover);
    g.appendChild(svgEl('circle', { 'data-role': 'draw-hover', cx: c.x, cy: c.y, r: 4, fill: 'none', stroke: INK, 'stroke-width': 1.5, 'pointer-events': 'none' }));
  }
  typedGuide(g, d);
  drawNumbers(g, d, shown, preview);
}

// ---------- Numbers on the drawing: the sides' lengths, the newest corner's angle (src/draw-numbers.ts) ----------
/** A number on the plan: a small dark pill, kept on screen. */
const PILL_H = 20;
const pillWidth = (text: string) => text.length * 6.6 + 14;
function numberPill(g: SVGElement, at: Point, text: string, role: string) {
  const w = pillWidth(text);
  const x = Math.max(w / 2 + 4, Math.min(state.canvasW - w / 2 - 4, at.x));
  const y = Math.max(12, Math.min(state.canvasH - 12, at.y));
  g.appendChild(svgEl('g', { 'data-role': role, 'pointer-events': 'none' },
    svgEl('rect', { x: x - w / 2, y: y - PILL_H / 2, width: w, height: PILL_H, rx: PILL_H / 2, fill: '#0f172a', opacity: 0.8 }),
    svgEl('text', { x, y: y + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 11.5, 'font-weight': 600, fill: '#fff', style: 'user-select:none;' }, text)));
}
/**
 * Each side's length (world points), `gap` px clear of it on the side away from the middle; sides too short on
 * screen go without.
 */
function sideLabels(g: SVGElement, pts: Point[], closed: boolean, gap: number, minPx = SIDE_LABEL_MIN_PX) {
  const sc = pts.map(toScreen), mid = middleOf(sc), n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    // (By the part of the side on screen: none, no label; a long one keeps its label where it can be seen.)
    const seen = clipToBox(sc[i], sc[(i + 1) % n], state.canvasW, state.canvasH);
    if (!seen || Math.hypot(sc[(i + 1) % n].x - sc[i].x, sc[(i + 1) % n].y - sc[i].y) < minPx) continue;
    const text = lengthText(Math.hypot(b.x - a.x, b.y - a.y));
    numberPill(g, sideLabelSpot(seen[0], seen[1], gap, mid, { w: pillWidth(text), h: PILL_H }), text, 'side-length');
  }
}
/**
 * The angle at a corner, inside it (not where its sides are too short on screen to tell); `clear`: its distance from
 * the corner (px), farther while a finger is on the corner, dragging it (Jason, Oct 29: it sat under his thumb).
 */
function cornerLabel(g: SVGElement, prev: Point, at: Point, next: Point, clear = 30) {
  const deg = cornerAngle(prev, at, next);
  const P = toScreen(prev), A = toScreen(at), N = toScreen(next);
  if (deg == null || Math.hypot(P.x - A.x, P.y - A.y) < 24 || Math.hypot(N.x - A.x, N.y - A.y) < 24) return;
  if (A.x < 0 || A.y < 0 || A.x > state.canvasW || A.y > state.canvasH) return; // (the corner off screen)
  numberPill(g, angleSpot(P, A, N, clear), `${deg}°`, 'corner-angle');
}
/** While drawing: the sides so far (and, with a mouse, the one to the pointer), and the newest corner's angle. */
function drawNumbers(g: SVGElement, d: DrawState, shown: Point[], preview: Shape | null) {
  const m = d.kind;
  if (m === 'poly' || m === 'line' || m === 'path' || m === 'triangle') {
    sideLabels(g, shown, false, 4);
    if (shown.length >= 3) cornerLabel(g, shown.at(-3)!, shown.at(-2)!, shown.at(-1)!);
  } else if (m === 'canopy') {
    sideLabels(g, shown.slice(1), false, 4); // (not from the trunk)
  } else if ((m === 'rect' || m === 'oval') && preview && (preview.type === 'rect' || preview.type === 'oval')) {
    numberPill(g, toScreen({ x: preview.x + preview.width / 2, y: preview.y + preview.height / 2 }), `${fmtFeet(preview.width)} × ${fmtFeet(preview.height)} ft`, 'side-length');
  } else if (m === 'rect' || m === 'oval') {
    sideLabels(g, shown.slice(0, 2), false, 4);
  } else if (m === 'circle' && shown.length === 2) {
    const [a, b] = shown;
    // (The circle as it will be made: its width rounded as the drawing rounds it.)
    const across = preview?.type === 'circle' ? preview.radius * 2 : Math.hypot(b.x - a.x, b.y - a.y);
    const text = `${fmtFeet(across)} ft across`;
    numberPill(g, sideLabelSpot(toScreen(a), toScreen(b), 4, null, { w: pillWidth(text), h: PILL_H }), text, 'side-length');
  }
}
/** A length typed for the next side: where the next point can go (a ring around the last; a rectangle's two far sides). */
function typedGuide(g: SVGElement, d: DrawState) {
  if (!d.typed || !typedApplies(d)) return;
  const ppf = pxPerFoot(), pts = d.points, guide = { 'data-role': 'typed-guide', 'pointer-events': 'none', fill: 'none', stroke: INK, 'stroke-width': 1.5, 'stroke-dasharray': '4 4', 'stroke-opacity': 0.8 };
  if (d.kind === 'rect' && pts.length === 2) {
    const [a, b] = pts, n = rotate(0, 1, (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
    for (const k of [1, -1]) {
      const A = toScreen({ x: a.x + n.x * d.typed * k, y: a.y + n.y * d.typed * k }), B = toScreen({ x: b.x + n.x * d.typed * k, y: b.y + n.y * d.typed * k });
      g.appendChild(svgEl('line', { ...guide, x1: A.x, y1: A.y, x2: B.x, y2: B.y }));
    }
    return;
  }
  const c = toScreen(pts.at(-1)!);
  g.appendChild(svgEl('circle', { ...guide, cx: c.x, cy: c.y, r: d.typed * ppf }));
}
/** Editing points: each side's length, and the angle at the selected point. */
function editNumbers(g: SVGElement, s: PathShape, sel: number | null) {
  const pts = pathPoints(s), n = pts.length, closed = s.type === 'poly';
  sideLabels(g, pts, closed, 12, 64); // (12 px: clear of the + on the side's middle)
  if (sel == null || sel >= n || n < 3 || (!closed && (sel === 0 || sel === n - 1))) return; // (an undo can leave the selected point gone)
  cornerLabel(g, pts[(sel + n - 1) % n], pts[sel], pts[(sel + 1) % n], gesture.current?.type === 'drag-vertex' ? 80 : 30);
}
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
