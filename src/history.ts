import { HISTORY_DEBOUNCE_MS, MAX_HISTORY } from './constants';
import { keepBought } from './plant-list';
import { plantsById } from './plants';
import { state } from './state';
import { save } from './storage';
import type { HistorySnapshot, Shape } from './types';
import { deepClone } from './util';
import { describeShapes } from './ui/delete-selected';

// Undo/redo: in-memory snapshots of shapes + background image, per project.
// The background's dataUrl string is shared between snapshots (strings are
// immutable), so 50 snapshots cost little extra memory.

let historyTimer: ReturnType<typeof setTimeout> | null = null;
/** What the step being gathered did, while all of it was one thing (a run of nudges: "move Front bed"). */
let pendingLabel: string | undefined;

/**
 * A step to undo. `label`, where the step says what it did ("delete Front bed"), is what Undo and Redo say on a
 * computer, when the pointer is on them (the UI review, 2026-11-01): the commonest steps say (add, delete, move, swap,
 * status, Clear all); the rest are a plain "Undo".
 */
export function pushHistory(label?: string) {
  // (What's bought stays as it was but for planting: a planted plant deleted gives no tick back. src/plant-list.ts.)
  const before = state.history[state.historyIndex];
  if (before) boughtKept(before.shapes);
  state.history = state.history.slice(0, state.historyIndex + 1); // drop redo branch
  state.history.push({
    shapes: deepClone(state.shapes),
    bgImage: state.bgImage ? { ...state.bgImage } : null,
    photoElsewhere: state.photoElsewhere,
    ...(label ? { label } : {}),
  });
  if (state.history.length > MAX_HISTORY) state.history.shift();
  else state.historyIndex++;
}
/** Coalesce rapid edits (typing, sliders) into one undo step. */
export function pushHistoryDebounced(label?: string) {
  // (Steps of different kinds run together are one step: then it doesn't say which.)
  pendingLabel = historyTimer && pendingLabel !== label ? undefined : label;
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => { historyTimer = null; pushHistory(pendingLabel); }, HISTORY_DEBOUNCE_MS);
}
export function flushHistoryDebounce() {
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = null;
    pushHistory(pendingLabel);
  }
}
/** Forget pending debounced history (used when switching projects). */
export function cancelHistoryDebounce() {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = null;
}
/** What a step did it to, for its label: one shape by its name ("Front bed"), several by what they are ("3 plants"). */
export function stepNamed(shapes: Shape[]): string {
  const one = shapes.length === 1 ? shapes[0].label?.trim().replace(/\s+/g, ' ') : '';
  if (one) return one.length > 30 ? one.slice(0, 29).trimEnd() + '\u2026' : one; // (a note's text can be long)
  return describeShapes(shapes).replace(/^1 /, 'a ');
}
/**
 * The Plant list's ticks across a change from `before` to the plan's shapes now (a step, Undo, Redo): only planting
 * and un-planting use them up or give them back (src/plant-list.ts keepBought). Saved, if they changed.
 */
function boughtKept(before: Shape[]) {
  const next = keepBought(state.bought, before, state.shapes, plantsById);
  if (next === state.bought) return;
  state.bought = next;
  save();
}
function applySnapshot(snap: HistorySnapshot) {
  const before = state.shapes;
  state.shapes = deepClone(snap.shapes);
  boughtKept(before);
  fruitShownAgain(before);
  // "Keep this photo on this device only" isn't an undoable edit: the same photo keeps its setting.
  const keep = state.bgImage && snap.bgImage && state.bgImage.dataUrl === snap.bgImage.dataUrl ? state.bgImage.deviceOnly : snap.bgImage?.deviceOnly;
  state.bgImage = snap.bgImage ? { ...snap.bgImage } : null;
  if (state.bgImage) { if (keep) state.bgImage.deviceOnly = true; else delete state.bgImage.deviceOnly; }
  state.photoElsewhere = snap.photoElsewhere ?? null;
  state.selectedIds = state.selectedIds.filter((id) => state.shapes.some((s) => s.id === id));
  // (A phase brought back onto its shapes is back in the list too: removed, then undone, it was missing from the
  // filters until a reload. Round 3, Priya.)
  const missing = [...new Set(state.shapes.flatMap((s) => (s.phase && !state.phases.includes(s.phase) ? [s.phase] : [])))];
  if (missing.length) state.phases = [...state.phases, ...missing];
}
export function undo() {
  flushHistoryDebounce();
  if (state.historyIndex <= 0) return;
  const step = state.history[state.historyIndex];
  state.historyIndex--;
  state.linkOffer = null; // (the circles it named may have changed back)
  state.statusAsk = null; // (and the statuses it asked about)
  applySnapshot(state.history[state.historyIndex]);
  // (Whether it was put back, for Redo: one made across the plan since stands, and Redo leaves it, words alike or not.)
  if (step.narrowed) step.narrowed.putBack = narrowedBack(step.narrowed, true);
  save();
}
export function redo() {
  flushHistoryDebounce();
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  state.linkOffer = null;
  state.statusAsk = null;
  const step = state.history[state.historyIndex];
  applySnapshot(step);
  if (step.narrowed?.putBack) { narrowedBack(step.narrowed, false); step.narrowed.putBack = false; }
  save();
}
/**
 * A step that narrowed a warning dismissed across the plan ("Just these 2": src/dismissals.ts warnForNewOnes), undone:
 * that dismissal back (`back`), unless the plant has one across the plan again since; redone: gone again, if Undo put
 * it back (its `putBack`: not one made since with the same words, the second review, Nov 1) and it's still that one.
 * Whether it changed anything.
 */
function narrowedBack(n: NonNullable<HistorySnapshot['narrowed']>, back: boolean): boolean {
  const m = { ...(state.dismissed?.[n.kind] ?? {}) };
  if (back ? m[n.plantId] !== undefined : m[n.plantId] !== n.said) return false;
  if (back) m[n.plantId] = n.said; else delete m[n.plantId];
  const next = { ...(state.dismissed ?? {}) };
  if (Object.keys(m).length) next[n.kind] = m; else delete next[n.kind];
  state.dismissed = next; // (kept, even empty, once the plan has had any: so it syncs too, as in src/dismissals.ts)
  return true;
}
/**
 * A copy's own fruit-partner dismissal that Undo or Redo takes away is left '', shown again on purpose, as Show again
 * leaves it: so sync doesn't fill it back from another device's copy (src/sync/engine.ts withFruitDismissals).
 */
function fruitShownAgain(before: Shape[]) {
  const had = new Map(before.filter((s) => !!s.fruitDismissed).map((s) => [s.id, s.plantId]));
  if (!had.size) return;
  for (const s of state.shapes) if (s.fruitDismissed === undefined && had.has(s.id) && had.get(s.id) === s.plantId) s.fruitDismissed = '';
}
/**
 * Whether there's a step to undo: one taken, or one still being gathered (a run of arrow nudges, typing in a field),
 * which Undo takes first (Alex, Sam, Oct 30: the button stayed gray after a nudge, though Ctrl+Z undid it).
 */
export function canUndo(): boolean { return state.historyIndex > 0 || historyTimer !== null; }
export function canRedo(): boolean { return state.historyIndex < state.history.length - 1; }
/** What Undo would take back ("delete Front bed"), when its step says; else ''. */
export function undoLabel(): string {
  if (historyTimer) return pendingLabel ?? '';
  return state.historyIndex > 0 ? state.history[state.historyIndex]?.label ?? '' : '';
}
/** What Redo would do again, when its step says; else ''. */
export function redoLabel(): string { return canRedo() ? state.history[state.historyIndex + 1]?.label ?? '' : ''; }
