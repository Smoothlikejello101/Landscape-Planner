import { kindsFor, nearestOnEdge, newSubFeature, SUB_FEATURES } from './features';
import { pxPerFoot, screenToFeet } from './geometry';
import { flushHistoryDebounce, pushHistory } from './history';
import { isLocked } from './roles';
import { shownWith } from './status';
import { state } from './state';
import { save } from './storage';
import type { Shape, SubFeatureKind } from './types';
import { toast } from './ui/toast';
import { uid } from './util';

// Adding and changing sub-features (src/features.ts): placed by tapping a wall, moved by dragging along it, sized and
// taken off in the shape's properties.

/** The shape sub-features are being added to (the one in `state.featurePlace`), if it's still there and open to change. */
export function featureHost(): Shape | null {
  const fp = state.featurePlace;
  const s = fp ? state.shapes.find((x) => x.id === fp.id) : undefined;
  // (Not one hidden since, by its kind in Layers or by what the plan is showing.)
  return s && kindsFor(s).length && !isLocked(s) && shownWith(s, state.viewFilter) ? s : null;
}
/** Start adding sub-features of a kind to a shape by tapping its edges. */
export function startFeaturePlace(id: string, kind: SubFeatureKind) {
  flushHistoryDebounce();
  state.featurePlace = { id, kind, added: [] };
  state.selectedIds = [id];
  state.selectMode = false; // (its taps place them: none drag a box)
  state.panel = null;
  state.draw = null;
  state.editPoints = null;
}
export function setFeatureKind(kind: SubFeatureKind) { if (state.featurePlace) state.featurePlace.kind = kind; }
export function finishFeaturePlace() { state.featurePlace = null; }

/** How far from an edge (px) a tap still means that edge. */
const REACH_PX = 40;
/**
 * A tap while adding sub-features: one goes on the nearest edge, where the tap is (in half-foot steps along it). A tap
 * well off any edge says so instead. Each one its own undo step.
 */
export function featureTap(clientX: number, clientY: number): boolean {
  const fp = state.featurePlace, s = featureHost();
  if (!fp || !s || s.type === 'circle' || s.type === 'text') return false;
  const p = screenToFeet(clientX, clientY);
  const w = SUB_FEATURES[fp.kind].width?.[0] ?? 0;
  const near = nearestOnEdge(s, p, w);
  if (!near || near.dist * pxPerFoot() > Math.max(REACH_PX, 1.5 * pxPerFoot())) {
    toast(s.role === 'boundary' ? 'Tap on the line itself.' : 'Tap on an edge of it: a wall, or the edge where it goes.');
    return false;
  }
  const f = newSubFeature(fp.kind, near.edge, near.at, uid());
  s.features = [...(s.features ?? []), f];
  fp.added.push(f.id);
  pushHistory();
  save();
  return true;
}
/** Take back the last one added while adding (a step of its own). */
export function undoFeaturePlace() {
  const fp = state.featurePlace, s = featureHost();
  if (!fp || !s || s.type === 'circle' || s.type === 'text') return;
  // (The last one still there: one taken off another way, by the top bar's Undo say, is already gone.)
  let last: string | undefined;
  while ((last = fp.added.pop()) && !(s.features ?? []).some((f) => f.id === last));
  if (!last) return;
  s.features = (s.features ?? []).filter((f) => f.id !== last);
  pushHistory();
  save();
}
