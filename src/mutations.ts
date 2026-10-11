import { redrawCanvas, tierOf } from './canvas';
import { MAX_ZOOM, MIN_ZOOM, PX_PER_FOOT_BASE } from './constants';
import { canvasRect, pxPerFoot, shapeBBox, shapeCenter, unionBounds, viewCenterFeet } from './geometry';
import { flushHistoryDebounce, pushHistory, pushHistoryDebounced } from './history';
import { getSelected, singleSelected } from './selection';
import { state } from './state';
import { getClipboard, save, setClipboard } from './storage';
import { defaultLook, roleKey } from './roles';
import type { Clipboard, Point, Role, RoleKey, RoleView, Shape, ShapePatch, ShapeType } from './types';
import { render } from './ui/render';
import { deepClone, now, snap, uid } from './util';

// Every mutation records an undo step (pushHistory) and schedules a save.

const BASE = { label: '', opacity: 0.65, locked: false } as const;

export function makeShape(type: ShapeType, c: Point, id = uid()): Shape {
  switch (type) {
    case 'circle':
      return { ...BASE, id, type, x: snap(c.x), y: snap(c.y), radius: 2, color: '#16a34a' };
    case 'rect':
      return { ...BASE, id, type, x: snap(c.x - 2), y: snap(c.y - 1.5), width: 4, height: 3, color: '#78350f', rotation: 0 };
    case 'oval':
      return { ...BASE, id, type, x: snap(c.x - 2.5), y: snap(c.y - 1.5), width: 5, height: 3, color: '#0891b2', rotation: 0 };
    case 'triangle':
      return { ...BASE, id, type, x: snap(c.x - 2), y: snap(c.y - 1.5), width: 4, height: 3, color: '#7c3aed', rotation: 0, rightAngle: 'bl' };
  }
}

export function addShape(type: ShapeType) {
  flushHistoryDebounce();
  const shape = makeShape(type, viewCenterFeet());
  state.shapes.push(shape);
  state.selectedIds = [shape.id];
  state.panel = 'props';
  pushHistory();
  save();
}
/** Patch the selected shape and re-render everything (for buttons/swatches). */
export function updateSelected(patch: ShapePatch) {
  const s = singleSelected();
  if (!s) return;
  Object.assign(s, patch);
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
  Object.assign(s, patch);
  save();
  pushHistoryDebounced();
  redrawCanvas();
}
export function deleteShapesByIds(ids: string[]) {
  flushHistoryDebounce();
  if (!ids.length) return;
  state.shapes = state.shapes.filter((s) => !ids.includes(s.id));
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
  const sel = getSelected();
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
export function paste(): boolean {
  const data = getClipboard();
  if (!data || !data.shapes || !data.shapes.length) return false;
  flushHistoryDebounce();
  const incoming = data.shapes.map((s) => ({ ...deepClone(s), id: uid() }) as Shape);
  let dx = 1, dy = 1;
  if (data.sourceProjectId !== state.currentProjectId) {
    const b = unionBounds(incoming.map(shapeBBox))!;
    const target = viewCenterFeet();
    dx = snap(target.x - (b.minX + b.maxX) / 2);
    dy = snap(target.y - (b.minY + b.maxY) / 2);
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
export function resetCurrentProject() {
  flushHistoryDebounce();
  state.shapes = [];
  state.selectedIds = [];
  state.zoom = 1;
  state.offsetX = -10;
  state.offsetY = -10;
  state.panel = null;
  state.bgImage = null;
  state.bgEditMode = false;
  state.bgCalibrate = null;
  pushHistory();
  save();
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
    const before = defaultLook(roleKey(s), s.type);
    const wasDefault = s.color.toLowerCase() === before.color && Math.abs(s.opacity - before.opacity) < 0.001;
    if (role) s.role = role; else delete s.role;
    if (wasDefault) Object.assign(s, defaultLook(roleKey(s), s.type));
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
