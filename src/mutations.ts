import { carriesPlants, movedWith, patchBedCarryingPlants } from './beds';
import { redrawCanvas, tierOf } from './canvas';
import { MAX_ZOOM, MIN_ZOOM, PX_PER_FOOT_BASE } from './constants';
import { canvasRect, pxPerFoot, rotatedBoxBounds, shapeBBox, shapeCenter, unionBounds, viewCenterFeet } from './geometry';
import { flushHistoryDebounce, pushHistory, pushHistoryDebounced } from './history';
import { getSelected, singleSelected } from './selection';
import { state } from './state';
import { forgetCleared, getClipboard, keepCleared, migrateShape, save, setClipboard, type ClearedPlan } from './storage';
import { toast } from './ui/toast';
import { defaultLook, isLocked, roleKey } from './roles';
import { isUtilityKind, utilityLook } from './utility-kinds';
import type { Bounds, Clipboard, Point, Role, RoleKey, RoleView, Shape, ShapeFilter, ShapePatch, Status } from './types';
import { cleanPhaseName, MAX_PHASES, shownWith, statusPatch } from './status';
import { render } from './ui/render';
import { deepClone, now, snap, uid } from './util';
import { setRadius } from './trees';

// Every mutation records an undo step (pushHistory) and schedules a save.

/** Patch the selected shape and re-render everything (for buttons/swatches). */
/** Apply a patch to a shape; a bed brings its plants along. */
function applyPatch(s: Shape, patch: ShapePatch) {
  // A shaped canopy grows and shrinks with its radius.
  if (s.type === 'circle' && s.canopy && patch.radius != null && !patch.canopy) {
    setRadius(s, patch.radius);
    patch = { ...patch };
    delete patch.radius;
  }
  if (carriesPlants(s)) patchBedCarryingPlants(s, patch, state.shapes);
  else Object.assign(s, patch);
}
export function updateSelected(patch: ShapePatch) {
  const s = singleSelected();
  if (!s) return;
  applyPatch(s, patch);
  save();
  pushHistoryDebounced();
  render();
}
/**
 * Patch the selected shape and redraw only the canvas. Used by text, number,
 * range and color inputs: rebuilding the panel would destroy the focused
 * input and dismiss the Android keyboard.
 */
export function updateSelectedSilent(patch: ShapePatch) {
  const s = singleSelected();
  if (!s) return;
  applyPatch(s, patch);
  save();
  pushHistoryDebounced();
  redrawCanvas();
}
export function deleteShapesByIds(ids: string[]) {
  flushHistoryDebounce();
  if (!ids.length) return;
  state.shapes = state.shapes.filter((s) => !ids.includes(s.id));
  // (A vine on what was deleted: a groundcover again, in the same step.)
  for (const v of state.shapes) if (v.type === 'circle' && v.climbsOn && ids.includes(v.climbsOn)) delete v.climbsOn;
  state.selectedIds = state.selectedIds.filter((id) => !ids.includes(id));
  pushHistory();
  save();
}
export function deleteSelected() {
  deleteShapesByIds(state.selectedIds.slice());
  state.panel = null;
}
export function duplicateShapesByIds(ids: string[], offset: Point = { x: 1, y: 1 }): string[] {
  flushHistoryDebounce();
  if (!ids.length) return [];
  const newIds: string[] = [];
  for (const id of ids) {
    const s = state.shapes.find((sh) => sh.id === id);
    if (!s) continue;
    const copy: Shape = { ...deepClone(s), id: uid(), x: snap(s.x + offset.x), y: snap(s.y + offset.y), locked: false };
    state.shapes.push(copy);
    newIds.push(copy.id);
  }
  state.selectedIds = newIds;
  pushHistory();
  save();
  return newIds;
}
export function duplicateSelected() {
  duplicateShapesByIds(state.selectedIds.slice());
}
export function copySelected(): boolean {
  return copyShapes(getSelected());
}
/** Put these shapes on the clipboard (the device's own, for pasting in any plan). */
export function copyShapes(sel: Shape[]): boolean {
  if (!sel.length) return false;
  const data: Clipboard = {
    shapes: sel.map((s) => {
      const { id: _id, ...rest } = deepClone(s);
      return rest;
    }),
    sourceProjectId: state.currentProjectId,
    timestamp: now()
  };
  setClipboard(data);
  return true;
}
/**
 * Paste clipboard shapes. From another project they land centered in the
 * current view; within the same project they're offset 1 ft so they're visible.
 */
/** The clipboard last pasted, and how many times: each paste of it steps a foot further (Tom, Oct 30: a second
 * Ctrl+V landed exactly on the first, hiding it). */
let pasted: { from: unknown; n: number } = { from: null, n: 0 };
export function paste(): boolean {
  const data = getClipboard();
  if (!data || !data.shapes || !data.shapes.length) return false;
  pasted = data === pasted.from ? { from: data, n: pasted.n + 1 } : { from: data, n: 1 }; // (a new copy starts again)
  flushHistoryDebounce();
  // (Read as a stored plan's shapes are, doors and windows too: a clipboard can come from another version's tab, a
  // utility of a kind this one doesn't know, say.)
  const incoming = data.shapes.map((s) => migrateShape(deepClone(s))).filter((s): s is Shape => !!s).map((s) => ({ ...s, id: uid() }) as Shape);
  if (!incoming.length) return false;
  let dx = pasted.n, dy = pasted.n;
  if (data.sourceProjectId !== state.currentProjectId) {
    const b = unionBounds(incoming.map(shapeBBox))!;
    const target = viewCenterFeet();
    dx = snap(target.x - (b.minX + b.maxX) / 2) + pasted.n - 1;
    dy = snap(target.y - (b.minY + b.maxY) / 2) + pasted.n - 1;
  }
  for (const s of incoming) {
    s.x = snap(s.x + dx);
    s.y = snap(s.y + dy);
    s.locked = false;
    state.shapes.push(s);
  }
  state.selectedIds = incoming.map((s) => s.id);
  pushHistory();
  save();
  return true;
}
/**
 * Every shape shown on the plan, selected (Ctrl+A): what a box drawn round the whole plan would select, locked shapes
 * too (the lock keeps them in place; Delete and Cut leave them).
 */
export function selectAllShown() {
  state.selectedIds = state.shapes.filter((s) => shownWith(s, state.viewFilter)).map((s) => s.id);
}
/**
 * Move the selection by (dx, dy) feet (the arrow keys), as a drag would: beds bring the plants in them, locked shapes
 * stay. A run of moves is one undo step. What moved (ids), or null when everything selected is locked.
 */
export function nudgeSelected(dx: number, dy: number): string[] | null {
  const free = getSelected().filter((s) => !isLocked(s));
  if (!free.length) return null;
  const ids = movedWith(free, state.shapes);
  for (const id of ids) {
    const s = state.shapes.find((sh) => sh.id === id);
    if (!s) continue;
    s.x = snap(s.x + dx);
    s.y = snap(s.y + dy);
  }
  save();
  pushHistoryDebounced();
  return ids;
}
export function setLockedForIds(ids: string[], locked: boolean) {
  flushHistoryDebounce();
  for (const id of ids) {
    const s = state.shapes.find((sh) => sh.id === id);
    if (s) s.locked = locked;
  }
  pushHistory();
  save();
}

// ---- Layer order. Shapes draw in tiers (by role, then locked behind
// unlocked), so reordering only moves a shape within its own tier. ----
export function findNextSameTier(arr: Shape[], fromIndex: number, direction: 1 | -1): number {
  const tier = tierOf(arr[fromIndex]);
  for (let i = fromIndex + direction; i >= 0 && i < arr.length; i += direction) {
    if (tierOf(arr[i]) === tier) return i;
  }
  return -1;
}
function swapWithNeighbor(id: string, direction: 1 | -1) {
  const i = state.shapes.findIndex((s) => s.id === id);
  if (i === -1) return;
  const j = findNextSameTier(state.shapes, i, direction);
  if (j === -1) return;
  flushHistoryDebounce();
  [state.shapes[i], state.shapes[j]] = [state.shapes[j], state.shapes[i]];
  pushHistory();
  save();
}
export function bringForward(id: string) { swapWithNeighbor(id, 1); }
export function sendBackward(id: string) { swapWithNeighbor(id, -1); }
function moveToTierEnd(id: string, toFront: boolean) {
  const i = state.shapes.findIndex((s) => s.id === id);
  if (i === -1) return;
  flushHistoryDebounce();
  const [shape] = state.shapes.splice(i, 1);
  const sameTier = state.shapes.map((s, k) => (tierOf(s) === tierOf(shape) ? k : -1)).filter((k) => k !== -1);
  const at = toFront
    ? (sameTier.length ? sameTier[sameTier.length - 1] + 1 : 0)
    : (sameTier.length ? sameTier[0] : state.shapes.length);
  state.shapes.splice(at, 0, shape);
  pushHistory();
  save();
}
export function bringToFront(id: string) { moveToTierEnd(id, true); }
export function sendToBack(id: string) { moveToTierEnd(id, false); }

// ---- View ----
export function centerOnShape(id: string) {
  const s = state.shapes.find((sh) => sh.id === id);
  if (!s) return;
  const c = shapeCenter(s);
  state.offsetX = c.x - state.canvasW / pxPerFoot() / 2;
  state.offsetY = c.y - state.canvasH / pxPerFoot() / 2;
  save();
}
/** Zoom by `factor`, keeping the point under (screenX, screenY) fixed (default: canvas center). */
export function zoomBy(factor: number, anchorScreenX?: number, anchorScreenY?: number) {
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.zoom * factor));
  if (newZoom === state.zoom) return;
  const rect = canvasRect(); // live rect: state.canvasW/H can lag layout
  const ax = anchorScreenX !== undefined ? anchorScreenX - rect.left : rect.width / 2;
  const ay = anchorScreenY !== undefined ? anchorScreenY - rect.top : rect.height / 2;
  const feetAtAnchor = { x: state.offsetX + ax / pxPerFoot(), y: state.offsetY + ay / pxPerFoot() };
  const newPxPerFoot = PX_PER_FOOT_BASE * newZoom;
  state.offsetX = feetAtAnchor.x - ax / newPxPerFoot;
  state.offsetY = feetAtAnchor.y - ay / newPxPerFoot;
  state.zoom = newZoom;
  save();
}
/**
 * The whole plan as shown: every shape in view, and the photo while it shows (feet). Null when nothing shows.
 */
export function planBounds(): Bounds | null {
  // (What's shown: not gone plants, hidden layers or plants the view leaves out.)
  const list = state.shapes.filter((s) => shownWith(s, state.viewFilter)).map(shapeBBox);
  const bg = state.bgImage;
  if (bg?.visible) list.push(rotatedBoxBounds(bg.cx, bg.cy, bg.naturalWidth * bg.ftPerPx, bg.naturalHeight * bg.ftPerPx, bg.rotation));
  return unionBounds(list);
}
/** Zoom and move the view so `b` (feet) fills the plan, a margin all round; as close as the zoom allows. */
export function zoomToBounds(b: Bounds, marginPx = 28) {
  const rect = canvasRect();
  const W = rect.width || state.canvasW, H = rect.height || state.canvasH;
  const w = Math.max(b.maxX - b.minX, 1), h = Math.max(b.maxY - b.minY, 1);
  const fit = Math.min((W - 2 * marginPx) / (w * PX_PER_FOOT_BASE), (H - 2 * marginPx) / (h * PX_PER_FOOT_BASE));
  state.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit));
  const ppf = PX_PER_FOOT_BASE * state.zoom;
  state.offsetX = (b.minX + b.maxX) / 2 - W / ppf / 2;
  state.offsetY = (b.minY + b.maxY) / 2 - H / ppf / 2;
  save();
}
/** Everything in view (the zoom buttons' Fit, Shift+1). False when there's nothing on the plan to fit. */
export function zoomToFit(): boolean {
  const b = planBounds();
  if (!b) return false;
  zoomToBounds(b);
  return true;
}
export function resetCurrentProject() {
  flushHistoryDebounce();
  // (Kept on the device until something new is drawn: offered back on the empty plan, after a reload too.)
  keepCleared({ shapes: deepClone(state.shapes), bgImage: state.bgImage ? { ...state.bgImage } : null, photoElsewhere: state.photoElsewhere });
  state.shapes = [];
  state.selectedIds = [];
  state.zoom = 1;
  state.offsetX = -10;
  state.offsetY = -10;
  state.panel = null;
  state.bgImage = null;
  state.photoElsewhere = null;
  state.bgEditMode = false;
  state.bgCalibrate = null;
  state.draw = null;
  state.editPoints = null;
  state.featurePlace = null;
  pushHistory();
  save();
}

/** What Clear all took, back on the plan (its photo too), as one step to undo. */
export function bringBackCleared(c: ClearedPlan) {
  flushHistoryDebounce();
  state.shapes = deepClone(c.shapes);
  if (c.bgImage) state.bgImage = { ...c.bgImage };
  if (c.photoElsewhere) state.photoElsewhere = c.photoElsewhere;
  state.selectedIds = [];
  forgetCleared();
  pushHistory();
  save();
  zoomToFit();
  toast(`Brought back ${c.shapes.length} shape${c.shapes.length === 1 ? '' : 's'}${c.bgImage ? ' and the photo' : ''}.`);
}

// ---- Roles ----
/**
 * Give shapes a role. A shape still wearing its old role's default look gets
 * the new role's look; colors the user chose are kept.
 */
export function setRoleForIds(ids: string[], role: Role | undefined) {
  flushHistoryDebounce();
  for (const id of ids) {
    const s = state.shapes.find((sh) => sh.id === id);
    if (!s) continue;
    // (A utility's look is its kind's: a power line orange, a septic field gray.)
    const lookOf = (sh: Shape) => (sh.role === 'utility' && isUtilityKind(sh.utility) ? utilityLook(sh.utility) : defaultLook(roleKey(sh), sh.type));
    const before = lookOf(s);
    const wasDefault = s.color.toLowerCase() === before.color && Math.abs(s.opacity - before.opacity) < 0.001;
    if (role) s.role = role; else delete s.role;
    delete s.kind; // (what it was added as: no longer what it is)
    // A utility is one kind or another (src/utilities.ts): a line a power line, to start with, an area a septic field;
    // its properties change it. Made something else, it keeps which it was (only a utility's counts): turned back,
    // it's that again, and sync can tell it from a copy an older version sent, which has neither (src/sync/engine.ts).
    // (A kind a later version added is left as it is.)
    if (role === 'utility' && s.type !== 'circle' && s.type !== 'text' && (!s.utility || isUtilityKind(s.utility))) {
      if (!s.utility || (s.type === 'line') !== (s.utility !== 'septic')) s.utility = s.type === 'line' ? 'overhead' : 'septic';
    }
    if (wasDefault) Object.assign(s, lookOf(s));
  }
  pushHistory();
  save();
}
/** Hide/lock every shape of a role (view state, not an undo step). */
export function setRoleView(k: RoleKey, patch: RoleView) {
  const next = { ...state.roleViews[k], ...patch };
  if (!next.hidden) delete next.hidden;
  if (!next.locked) delete next.locked;
  state.roleViews = { ...state.roleViews, [k]: next };
  if (next.hidden) {
    // Hidden shapes can't stay selected.
    state.selectedIds = state.selectedIds.filter((id) => {
      const s = state.shapes.find((sh) => sh.id === id);
      return s && roleKey(s) !== k;
    });
  }
  save();
}

// ---- Status and phases ----
/** Set (or clear) the status of shapes; planting stamps today's date. One undo step. */
export function setStatusForIds(ids: string[], status: Status | undefined) {
  flushHistoryDebounce();
  for (const id of ids) {
    const s = state.shapes.find((sh) => sh.id === id);
    if (!s) continue;
    // (A key patched to undefined is removed: no status, no gone date.)
    for (const [k, v] of Object.entries(statusPatch(s, status))) {
      if (v === undefined) delete (s as unknown as Record<string, unknown>)[k];
      else (s as unknown as Record<string, unknown>)[k] = v;
    }
  }
  // Gone shapes leave the view (unless gone ones are shown): don't keep them selected.
  if (status === 'gone' && !state.viewFilter.showGone) state.selectedIds = state.selectedIds.filter((id) => !ids.includes(id));
  pushHistory();
  save();
}
export function setPhaseForIds(ids: string[], phase: string) {
  flushHistoryDebounce();
  for (const id of ids) {
    const s = state.shapes.find((sh) => sh.id === id);
    if (!s) continue;
    if (phase) s.phase = phase; else delete s.phase;
  }
  pushHistory();
  save();
}
/** Add a phase to the project's list. Returns the cleaned name ('' if empty or the list is full). */
export function addPhase(name: string): string {
  const n = cleanPhaseName(name);
  if (!n) return '';
  if (!state.phases.includes(n)) {
    if (state.phases.length >= MAX_PHASES) return '';
    state.phases = [...state.phases, n];
    save();
  }
  return n;
}
/** Remove a phase; shapes in it keep everything else. One undo step for the shapes. */
export function deletePhase(name: string) {
  flushHistoryDebounce();
  state.phases = state.phases.filter((p) => p !== name);
  for (const s of state.shapes) if (s.phase === name) delete s.phase;
  if (state.viewFilter.phase === name) state.viewFilter = { ...state.viewFilter, phase: '' };
  if (state.print.phaseFilter === name) state.print = { ...state.print, phaseFilter: '' };
  pushHistory();
  save();
}
/** Change which plants show; selected shapes that drop out of view are deselected. */
export function setViewFilter(patch: Partial<ShapeFilter>) {
  state.viewFilter = { ...state.viewFilter, ...patch };
  state.selectedIds = state.selectedIds.filter((id) => {
    const s = state.shapes.find((sh) => sh.id === id);
    return s && shownWith(s, state.viewFilter);
  });
  save(); // (kept with the plan: Jason, Oct 31)
}
