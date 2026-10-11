import { state } from './state';

// ============================================================
// SELECTION HELPERS
// ============================================================
export function isSelected(id) { return state.selectedIds.includes(id); }
export function selectOnly(id) {
  if (id === null) state.selectedIds = [];
  else state.selectedIds = [id];
}
export function toggleSelect(id) {
  const i = state.selectedIds.indexOf(id);
  if (i === -1) state.selectedIds.push(id);
  else state.selectedIds.splice(i, 1);
}
export function clearSelection() { state.selectedIds = []; }
export function getSelected() {
  return state.selectedIds.map(id => state.shapes.find(s => s.id === id)).filter(Boolean);
}
export function singleSelected() {
  const sel = getSelected();
  return sel.length === 1 ? sel[0] : null;
}
