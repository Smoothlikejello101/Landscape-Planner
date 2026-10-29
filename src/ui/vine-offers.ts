// What a vine climbs, offered as plants and supports come near each other (src/vines.ts; Jason, 2026-10-29): a
// notice with a button, never a question that stops you, each time a vine or a support is placed or moved within
// reach (Jason, Oct 29: "it should offer every time you're moving it"), unless the vine is set to grow as a
// groundcover; and a vine whose support went away (moved out of its reach) back to a groundcover, said, with Undo.
import { flushHistoryDebounce, pushHistory, undo } from '../history';
import { plantsById } from '../plants';
import { state } from '../state';
import { save } from '../storage';
import type { CircleShape, Shape } from '../types';
import { offerFor, strandedVines, vinesFor, type Support } from '../vines';
import { render } from './render';
import { toastAction } from './toast';

const nameOf = (s: Shape) => (s.type === 'circle' && s.plantId ? plantsById[s.plantId]?.common ?? s.label : s.label) || '';
/** What a support is called in a notice: "the red maple", "the fence", "the house", "the arbor". */
export function supportName(sup: Pick<Support, 'shape' | 'kind'>): string {
  const name = nameOf(sup.shape);
  // (Its first letter only: "the red maple 'October Glory'".)
  if (name) return `the ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  return sup.kind === 'tree' ? 'the tree' : sup.kind === 'shrub' ? 'the shrub' : sup.kind === 'arbor' ? 'the arbor'
    : sup.shape.role === 'building' ? 'the building' : sup.shape.role === 'structure' ? 'the trellis' : 'the line';
}
function offer(fresh: CircleShape[], sup: Support) {
  if (!fresh.length) return;
  const who = fresh.length === 1 ? nameOf(fresh[0]) || 'This vine' : `${fresh.length} vines`;
  toastAction(`${who} could climb ${supportName(sup)}.`, [{
    label: 'Climb it',
    run: () => {
      flushHistoryDebounce();
      for (const v of fresh) { const s = state.shapes.find((x) => x.id === v.id); if (s?.type === 'circle') s.climbsOn = sup.shape.id; }
      pushHistory(); save(); render();
    },
  }], 10000, 'vine-offer');
}
/** A vine just placed or moved: the support near enough to mean it, offered. */
export function offerSupport(v: Shape) {
  if (v.type !== 'circle') return;
  const sup = offerFor(v, state.shapes);
  if (sup) offer([v], sup);
}
/** A tree, a fence or a building just placed, drawn or moved: offered to the vines it's near. */
export function offerToVines(t: Shape) {
  const vines = vinesFor(t, state.shapes);
  if (!vines.length) return;
  const sup = offerFor(vines[0], state.shapes);
  if (sup) offer(vines, sup);
}
/**
 * Before a move is kept: the vines whose support moved out of their reach go back to a groundcover, in the same
 * step. Returns them, to say so after.
 */
export function freeStrandedVines(): CircleShape[] {
  const freed = strandedVines(state.shapes);
  for (const v of freed) delete v.climbsOn;
  return freed;
}
/** Say which vines went back to a groundcover; Undo takes back the move with them. */
export function saidFreed(freed: CircleShape[]) {
  if (!freed.length) return;
  const who = freed.length === 1 ? nameOf(freed[0]) || 'A vine' : `${freed.length} vines`;
  toastAction(`${who} ${freed.length === 1 ? 'is' : 'are'} out of reach of what ${freed.length === 1 ? 'it' : 'they'} climbed: now a groundcover.`,
    [{ label: 'Undo', run: () => { undo(); render(); } }], 10000, 'vine-freed');
}
/** After a drag: vines freed, else what's now near enough offered. */
export function afterMove(ids: string[]) {
  const moved = ids.map((id) => state.shapes.find((s) => s.id === id)).filter((s): s is Shape => !!s);
  for (const s of moved) { offerSupport(s); offerToVines(s); }
}
