import { svgEl } from './dom';
import { pxPerFoot, screenToFeet } from './geometry';
import { flushHistoryDebounce, pushHistory } from './history';
import { plantRadius } from './my-plants';
import { plantColor, plantShapeAt, plantsById, type Plant } from './plants';
import { state } from './state';
import { save } from './storage';
import type { Point } from './types';
import { snap } from './util';

// Placing plants by tapping: pick a plant once, then each tap on the plan
// places one there, until Done. Drags still pan and pinches zoom, as while
// drawing. Each placed plant is its own undo step; Done leaves the batch
// selected so a status or phase can be set on all of them at once.

/** The plant in hand, if placing. */
export function placingPlant(): Plant | null {
  return state.placing ? plantsById[state.placing.plantId] ?? null : null;
}
export function startPlacing(p: Plant) {
  flushHistoryDebounce();
  state.draw = null;
  state.editPoints = null;
  state.selectMode = false;
  state.selectedIds = [];
  state.panel = null;
  state.menu = null;
  state.pickerLinkId = null;
  state.pickerForTree = false;
  state.placing = { plantId: p.id, placed: [] };
  hover = null;
}
/** Switch the plant in hand (the ones already placed stay). */
export function switchPlacingPlant(p: Plant) {
  if (!state.placing) return startPlacing(p);
  state.placing.plantId = p.id;
  state.panel = null;
}
/** A tap on the plan while placing: one plant there. */
export function placeTap(clientX: number, clientY: number) {
  const p = placingPlant();
  if (!p || !state.placing) return;
  const shape = plantShapeAt(p, screenToFeet(clientX, clientY));
  state.shapes.push(shape);
  pushHistory();
  state.placing.placed.push({ id: shape.id, snap: state.history[state.historyIndex] });
  noteRecentPlant(p.id); // what's actually placed, not just picked
  save();
}
/**
 * Take back the last one placed. Placing is a sandbox: a plant taken back is
 * erased from the undo history too, so after Done the first undo removes the
 * last plant kept, not one already taken back. Anything else done meanwhile
 * (a setting changed) stays, minus that plant.
 */
export function undoPlace() {
  const last = state.placing?.placed.pop();
  if (!last) return;
  flushHistoryDebounce();
  state.shapes = state.shapes.filter((s) => s.id !== last.id);
  state.selectedIds = state.selectedIds.filter((id) => id !== last.id);
  for (const snap of state.history) snap.shapes = snap.shapes.filter((s) => s.id !== last.id);
  // The step that placed it is now the same as the one before it: drop it.
  const i = state.history.indexOf(last.snap);
  if (i > 0) {
    state.history.splice(i, 1);
    if (i <= state.historyIndex) state.historyIndex--;
  }
  save();
}
/** Stop placing, with what was placed selected. */
export function finishPlacing() {
  if (!state.placing) return;
  const ids = new Set(state.shapes.map((s) => s.id));
  state.selectedIds = state.placing.placed.map((x) => x.id).filter((id) => ids.has(id));
  state.placing = null;
  hover = null;
}

// ---------- Recently placed plants (this device) ----------
const RECENT_KEY = 'lp-recent-plants';
export const RECENT_MAX = 8;
function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}
function noteRecentPlant(id: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...loadRecent().filter((x) => x !== id)].slice(0, 20))); } catch { /* not remembered */ }
}
/** The last plants placed, newest first (ones no longer known are skipped). */
export function recentPlants(): Plant[] {
  return loadRecent().map((id) => plantsById[id]).filter((p): p is Plant => !!p).slice(0, RECENT_MAX);
}

// ---------- With a mouse: the plant follows the pointer ----------
let hover: Point | null = null;
export function setPlaceHover(p: Point | null) { hover = p ? { x: snap(p.x), y: snap(p.y) } : null; }
export function renderPlaceOverlay(g: SVGElement) {
  const p = placingPlant();
  if (!p || !hover) return;
  const ppf = pxPerFoot();
  g.appendChild(svgEl('circle', {
    'data-role': 'place-ghost', cx: (hover.x - state.offsetX) * ppf, cy: (hover.y - state.offsetY) * ppf, r: plantRadius(p, state.sizeMode) * ppf,
    fill: plantColor(p), 'fill-opacity': 0.25, stroke: '#0f766e', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'pointer-events': 'none',
  }));
}
