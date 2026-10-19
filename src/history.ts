import { HISTORY_DEBOUNCE_MS, MAX_HISTORY } from './constants';
import { state } from './state';
import { save } from './storage';
import type { HistorySnapshot } from './types';
import { deepClone } from './util';

// Undo/redo: in-memory snapshots of shapes + background image, per project.
// The background's dataUrl string is shared between snapshots (strings are
// immutable), so 50 snapshots cost little extra memory.

let historyTimer: ReturnType<typeof setTimeout> | null = null;

export function pushHistory() {
  state.history = state.history.slice(0, state.historyIndex + 1); // drop redo branch
  state.history.push({
    shapes: deepClone(state.shapes),
    bgImage: state.bgImage ? { ...state.bgImage } : null,
    photoElsewhere: state.photoElsewhere,
  });
  if (state.history.length > MAX_HISTORY) state.history.shift();
  else state.historyIndex++;
}
/** Coalesce rapid edits (typing, sliders) into one undo step. */
export function pushHistoryDebounced() {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => { historyTimer = null; pushHistory(); }, HISTORY_DEBOUNCE_MS);
}
export function flushHistoryDebounce() {
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = null;
    pushHistory();
  }
}
/** Forget pending debounced history (used when switching projects). */
export function cancelHistoryDebounce() {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = null;
}
function applySnapshot(snap: HistorySnapshot) {
  state.shapes = deepClone(snap.shapes);
  // "Keep this photo on this device only" isn't an undoable edit: the same photo keeps its setting.
  const keep = state.bgImage && snap.bgImage && state.bgImage.dataUrl === snap.bgImage.dataUrl ? state.bgImage.deviceOnly : snap.bgImage?.deviceOnly;
  state.bgImage = snap.bgImage ? { ...snap.bgImage } : null;
  if (state.bgImage) { if (keep) state.bgImage.deviceOnly = true; else delete state.bgImage.deviceOnly; }
  state.photoElsewhere = snap.photoElsewhere ?? null;
  state.selectedIds = state.selectedIds.filter((id) => state.shapes.some((s) => s.id === id));
}
export function undo() {
  flushHistoryDebounce();
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  state.linkOffer = null; // (the circles it named may have changed back)
  applySnapshot(state.history[state.historyIndex]);
  save();
}
export function redo() {
  flushHistoryDebounce();
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  state.linkOffer = null;
  applySnapshot(state.history[state.historyIndex]);
  save();
}
export function canUndo(): boolean { return state.historyIndex > 0; }
export function canRedo(): boolean { return state.historyIndex < state.history.length - 1; }
