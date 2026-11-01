import { svgEl } from './dom';
import { pxPerFoot, screenToFeet } from './geometry';
import { flushHistoryDebounce, pushHistory } from './history';
import { plantRadius } from './my-plants';
import { plantColor, plantShapeAt, plantsById, type Plant } from './plants';
import { state } from './state';
import { save } from './storage';
import type { Point } from './types';
import { snap } from './util';
import { crowdNotice, dismissCrowdNotice } from './ui/crowd-notice';
import { offerSupport, offerToVines } from './ui/vine-offers';
import { hardyNotice } from './ui/hardy-notice';
import { fruitNotice } from './ui/fruit-notice';
import { deleteShapesByIds } from './mutations';
import { render } from './ui/render';

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
  lastPlaced.t = -1e9; // (a new go: its first tap is never taken for a double tap on the last go's)
  state.draw = null;
  state.editPoints = null;
  state.featurePlace = null;
  state.selectMode = false;
  state.selectedIds = [];
  state.panel = null;
  state.menu = null;
  state.pickerLinkId = null;
  state.pickerLinkAlso = [];
  state.pickerLinkLocked = false;
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
/** The last tap that placed a plant: a double tap places one, not two exactly on top of each other (Sam, Oct 30). */
let lastPlaced = { t: -1e9, x: 0, y: 0, id: '' };
export function placeTap(clientX: number, clientY: number) {
  const p = placingPlant();
  if (!p || !state.placing) return;
  const t = performance.now();
  // (The same plant, there again at once. Another plant switched to and placed close by is meant.)
  if (p.id === lastPlaced.id && t - lastPlaced.t < 400 && Math.hypot(clientX - lastPlaced.x, clientY - lastPlaced.y) < 24) return;
  lastPlaced = { t, x: clientX, y: clientY, id: p.id };
  const shape = plantShapeAt(p, screenToFeet(clientX, clientY));
  state.shapes.push(shape);
  pushHistory();
  state.placing.placed.push({ id: shape.id, snap: state.history[state.historyIndex] });
  noteRecentPlant(p.id); // what's actually placed, not just picked
  save();
  // Too close to another: a notice (Move it takes this one back, to tap again).
  crowdNotice(shape, () => { if (state.placing?.placed.at(-1)?.id === shape.id) undoPlace(); });
  // A vine by a fence or a tree, or a tree by a vine: offered to climb it (src/ui/vine-offers.ts).
  offerSupport(shape);
  offerToVines(shape);
  // Too cold or too warm here: said once a go, unless a notice above is up (src/ui/hardy-notice.ts).
  // (Undo while placing takes it back as Undo on the bar does; after Done, it's deleted, as an undo step of its own.)
  hardyNotice(shape, () => {
    if (state.placing?.placed.at(-1)?.id === shape.id) undoPlace();
    else if (!state.placing && state.shapes.some((s) => s.id === shape.id)) deleteShapesByIds([shape.id]);
    render();
  });
  // Needs a partner to fruit (male and female plants, a second variety): said once a go, until the plan has one;
  // its Add buttons go on placing the partner (src/ui/fruit-notice.ts).
  fruitNotice(shape, (q) => { switchPlacingPlant(q); render(); });
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
  dismissCrowdNotice();
  const ids = new Set(state.shapes.map((s) => s.id));
  state.selectedIds = state.placing.placed.map((x) => x.id).filter((id) => ids.has(id));
  justPlaced = state.selectedIds.join();
  state.placing = null;
  hover = null;
}
/** The plants Done left selected, as one key: while they're the selection, its bar says "just placed". */
let justPlaced = '';
/**
 * Whether what's selected is the batch just placed (Jason, Oct 30: kept selected for one status for them all, the bar
 * saying "N just placed", so a stray tap on its bin isn't taken for an unknown "N selected").
 */
export function selectionJustPlaced(): boolean {
  // (Once the selection is something else, the batch is just selected again: chosen the same way by hand later, it
  // isn't "just placed".)
  if (justPlaced && state.selectedIds.join() !== justPlaced) justPlaced = '';
  return !!justPlaced;
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
/** A plant just placed (by a tap, or swapped in for another: src/plants.ts linkFromPicker), first in Recent. */
export function noteRecentPlant(id: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...loadRecent().filter((x) => x !== id)].slice(0, 20))); } catch { /* not remembered */ }
}
/** The last plants placed, newest first (ones no longer known are skipped). */
export function recentPlants(): Plant[] {
  // (A plant of mine switched to the catalog's is that plant now: listed once.)
  const seen = new Set<string>();
  return loadRecent().map((id) => plantsById[id]).filter((p): p is Plant => !!p && !seen.has(p.id) && !!seen.add(p.id)).slice(0, RECENT_MAX);
}

// ---------- With a mouse: the plant follows the pointer ----------
let hover: Point | null = null;
export function setPlaceHover(p: Point | null) { hover = p ? { x: snap(p.x), y: snap(p.y) } : null; }
/** Whether the plant is shown following the pointer. */
export const hasPlaceHover = () => hover !== null;
export function renderPlaceOverlay(g: SVGElement) {
  const p = placingPlant();
  if (!p || !hover) return;
  const ppf = pxPerFoot();
  g.appendChild(svgEl('circle', {
    'data-role': 'place-ghost', cx: (hover.x - state.offsetX) * ppf, cy: (hover.y - state.offsetY) * ppf, r: plantRadius(p, state.sizeMode) * ppf,
    fill: plantColor(p), 'fill-opacity': 0.25, stroke: '#0f766e', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'pointer-events': 'none',
  }));
}
