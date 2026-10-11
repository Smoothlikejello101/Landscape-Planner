import { state } from './state';
import type { Shape } from './types';

export function isSelected(id: string): boolean { return state.selectedIds.includes(id); }
export function selectOnly(id: string | null) {
  state.selectedIds = id === null ? [] : [id];
}
export function toggleSelect(id: string) {
  const i = state.selectedIds.indexOf(id);
  if (i === -1) state.selectedIds.push(id);
  else state.selectedIds.splice(i, 1);
}
export function clearSelection() { state.selectedIds = []; }
export function getSelected(): Shape[] {
  return state.selectedIds
    .map((id) => state.shapes.find((s) => s.id === id))
    .filter((s): s is Shape => !!s);
}
export function singleSelected(): Shape | null {
  const sel = getSelected();
  return sel.length === 1 ? sel[0] : null;
}
