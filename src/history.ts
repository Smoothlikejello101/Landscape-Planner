import { HISTORY_DEBOUNCE_MS, MAX_HISTORY } from './constants';
import { state } from './state';
import { save } from './storage';
import { deepClone } from './util';

export let historyTimer = null;
// ============================================================
// HISTORY (undo/redo)
// ============================================================
export function pushHistory() {
  // Truncate any redo branch
  state.history = state.history.slice(0, state.historyIndex + 1);
  // Push snapshot. Shapes: deep clone (mutable objects). bgImage: shallow
  // spread — its dataUrl is a big string but strings are immutable/shared in
  // JS, so 50 snapshots referencing the same image cost ~50 * (small object)
  // in memory, not 50 * (image size).
  state.history.push({
    shapes: deepClone(state.shapes),
    bgImage: state.bgImage ? Object.assign({}, state.bgImage) : null
  });
  // Cap
  if (state.history.length > MAX_HISTORY) {
    state.history.shift();
  } else {
    state.historyIndex++;
  }
}
export function pushHistoryDebounced() {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => { pushHistory(); historyTimer = null; }, HISTORY_DEBOUNCE_MS);
}
export function flushHistoryDebounce() {
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = null;
    pushHistory();
  }
}
export function applyHistorySnapshot(snap) {
  // Snapshots created before this change may be bare arrays (old shape-only
  // format). Handle both.
  if (Array.isArray(snap)) {
    state.shapes = deepClone(snap);
  } else {
    state.shapes = deepClone(snap.shapes);
    state.bgImage = snap.bgImage ? Object.assign({}, snap.bgImage) : null;
  }
  state.selectedIds = state.selectedIds.filter(id => state.shapes.find(s => s.id === id));
}
export function undo() {
  flushHistoryDebounce();
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  applyHistorySnapshot(state.history[state.historyIndex]);
  save();
}
export function redo() {
  flushHistoryDebounce();
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  applyHistorySnapshot(state.history[state.historyIndex]);
  save();
}
export function canUndo() { return state.historyIndex > 0; }
export function canRedo() { return state.historyIndex < state.history.length - 1; }
