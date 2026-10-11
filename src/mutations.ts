import { renderBgHandles } from './background';
import { renderGrid, renderShapes } from './canvas';
import { MAX_ZOOM, MIN_ZOOM, PX_PER_FOOT_BASE } from './constants';
import { pxPerFoot, shapeBBox, shapeCenter, viewCenterFeet } from './geometry';
import { flushHistoryDebounce, pushHistory, pushHistoryDebounced } from './history';
import { getSelected, singleSelected } from './selection';
import { state } from './state';
import { getClipboard, save, setClipboard } from './storage';
import { render } from './ui/render';
import { deepClone, now, snap, uid } from './util';

// ============================================================
// MUTATIONS
// ============================================================
export function addShape(type) {
  flushHistoryDebounce();
  const c = viewCenterFeet();
  const id = uid();
  let shape;
  if (type === 'circle') {
    shape = { id, type, x: snap(c.x), y: snap(c.y), radius: 2, color: '#16a34a', label: '', opacity: 0.65, locked: false };
  } else if (type === 'rect') {
    shape = { id, type, x: snap(c.x - 2), y: snap(c.y - 1.5), width: 4, height: 3, color: '#78350f', label: '', opacity: 0.65, locked: false, rotation: 0 };
  } else if (type === 'oval') {
    shape = { id, type, x: snap(c.x - 2.5), y: snap(c.y - 1.5), width: 5, height: 3, color: '#0891b2', label: '', opacity: 0.65, locked: false, rotation: 0 };
  } else if (type === 'triangle') {
    shape = { id, type, x: snap(c.x - 2), y: snap(c.y - 1.5), width: 4, height: 3, color: '#7c3aed', label: '', opacity: 0.65, locked: false, rotation: 0, rightAngle: 'bl' };
  } else { return; }
  state.shapes.push(shape);
  state.selectedIds = [id];
  state.panel = 'props';
  pushHistory();
  save();
}
export function updateSelected(patch) {
  const s = singleSelected();
  if (!s) return;
  Object.assign(s, patch);
  save();
  pushHistoryDebounced();
  // Re-render so panel UI (selected swatch, lock state, triangle corner,
  // arrange-button enabled state, etc.) reflects the new value.
  render();
}
// Silent: update the shape AND redraw the canvas, but do not rebuild any panel
// DOM (so input focus / keyboard stays put on Android).
export function updateSelectedSilent(patch) {
  const s = singleSelected();
  if (!s) return;
  Object.assign(s, patch);
  save();
  pushHistoryDebounced();
  const svg = document.getElementById('canvas-svg');
  if (svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    renderGrid(svg);
    renderShapes(svg);
    renderBgHandles(svg);
  }
}
export function deleteShapesByIds(ids) {
  flushHistoryDebounce();
  if (!ids.length) return;
  state.shapes = state.shapes.filter(s => !ids.includes(s.id));
  state.selectedIds = state.selectedIds.filter(id => !ids.includes(id));
  pushHistory();
  save();
}
export function deleteSelected() {
  deleteShapesByIds(state.selectedIds.slice());
  state.panel = null;
}
export function duplicateShapesByIds(ids, offset) {
  flushHistoryDebounce();
  if (!ids.length) return [];
  const off = offset || { x: 1, y: 1 };
  const newIds = [];
  for (const id of ids) {
    const s = state.shapes.find(sh => sh.id === id);
    if (!s) continue;
    const copy = Object.assign(deepClone(s), {
      id: uid(),
      x: snap(s.x + off.x),
      y: snap(s.y + off.y),
      locked: false
    });
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
export function copySelected() {
  const sel = getSelected();
  if (!sel.length) return false;
  // Strip IDs (paste regenerates them) and locked flag
  const data = {
    shapes: sel.map(s => {
      const copy = deepClone(s);
      delete copy.id;
      return copy;
    }),
    sourceProjectId: state.currentProjectId,
    timestamp: now()
  };
  setClipboard(data);
  return true;
}
export function paste() {
  const data = getClipboard();
  if (!data || !data.shapes || !data.shapes.length) return false;
  flushHistoryDebounce();
  // Compute bbox of clipboard shapes
  const tempShapes = data.shapes.map(s => Object.assign({ id: '_tmp' }, s));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of tempShapes) {
    const b = shapeBBox(s);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  const bboxCx = (minX + maxX) / 2;
  const bboxCy = (minY + maxY) / 2;
  const target = viewCenterFeet();
  const sameProject = data.sourceProjectId === state.currentProjectId;
  // Translate: cross-project → center on view. Same project → small offset so paste is visible.
  let dx, dy;
  if (sameProject) { dx = 1; dy = 1; }
  else { dx = snap(target.x - bboxCx); dy = snap(target.y - bboxCy); }
  const newIds = [];
  for (const s of data.shapes) {
    const copy = Object.assign(deepClone(s), {
      id: uid(),
      x: snap(s.x + dx),
      y: snap(s.y + dy),
      locked: false
    });
    state.shapes.push(copy);
    newIds.push(copy.id);
  }
  state.selectedIds = newIds;
  pushHistory();
  save();
  return true;
}
export function setLockedForIds(ids, locked) {
  flushHistoryDebounce();
  for (const id of ids) {
    const s = state.shapes.find(sh => sh.id === id);
    if (s) s.locked = locked;
  }
  pushHistory();
  save();
}
export function findNextSameTier(arr, fromIndex, direction) {
  const tier = arr[fromIndex].locked;
  for (let i = fromIndex + direction; i >= 0 && i < arr.length; i += direction) {
    if (arr[i].locked === tier) return i;
  }
  return -1;
}
export function bringForward(id) {
  const i = state.shapes.findIndex(s => s.id === id);
  if (i === -1) return;
  const j = findNextSameTier(state.shapes, i, 1);
  if (j === -1) return;
  const tmp = state.shapes[i]; state.shapes[i] = state.shapes[j]; state.shapes[j] = tmp;
  pushHistory();
  save();
}
export function sendBackward(id) {
  const i = state.shapes.findIndex(s => s.id === id);
  if (i === -1) return;
  const j = findNextSameTier(state.shapes, i, -1);
  if (j === -1) return;
  const tmp = state.shapes[i]; state.shapes[i] = state.shapes[j]; state.shapes[j] = tmp;
  pushHistory();
  save();
}
export function bringToFront(id) {
  const i = state.shapes.findIndex(s => s.id === id);
  if (i === -1) return;
  const shape = state.shapes[i];
  state.shapes.splice(i, 1);
  let lastSameTier = -1;
  for (let k = 0; k < state.shapes.length; k++) {
    if (state.shapes[k].locked === shape.locked) lastSameTier = k;
  }
  state.shapes.splice(lastSameTier + 1, 0, shape);
  pushHistory();
  save();
}
export function sendToBack(id) {
  const i = state.shapes.findIndex(s => s.id === id);
  if (i === -1) return;
  const shape = state.shapes[i];
  state.shapes.splice(i, 1);
  let firstSameTier = state.shapes.length;
  for (let k = 0; k < state.shapes.length; k++) {
    if (state.shapes[k].locked === shape.locked) { firstSameTier = k; break; }
  }
  state.shapes.splice(firstSameTier, 0, shape);
  pushHistory();
  save();
}
export function centerOnShape(id) {
  const s = state.shapes.find(s => s.id === id);
  if (!s) return;
  const c = shapeCenter(s);
  state.offsetX = c.x - state.canvasW / pxPerFoot() / 2;
  state.offsetY = c.y - state.canvasH / pxPerFoot() / 2;
  save();
}
export function zoomBy(factor, anchorScreenX, anchorScreenY) {
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.zoom * factor));
  if (newZoom === state.zoom) return;
  const rect = document.getElementById('canvas-svg').getBoundingClientRect();
  // Use the live rect, not state.canvasW/H (which can lag behind layout)
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
