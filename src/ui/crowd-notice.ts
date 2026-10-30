// Crowding, as a plant is placed (decided with Jason, 2026-10-25): a notice saying which plant it's close to or
// crowding, with Leave it (that pair isn't flagged again), Move it (take it back and tap again) and Settings (where the
// notices can be turned off). Crowded: every time. Close: once each time plants are placed (the first close one).
// One line, amber or red, that opens to say how far apart they are and why it matters (2026-10-27: it got in the way);
// a plant crowded by one half again its size is "too far under" it, buried, and is best moved out toward its edge. A
// spring bulb under a deciduous plant, which doesn't count (src/crowding.ts), gets no notice at all.
import { pushHistory } from '../history';
import { crowdingOf, crowdPairs, crowdRelation } from '../crowding';
import { crowdOptions } from '../crowd-here';
import { plantsById } from '../plants';
import { state } from '../state';
import { shownWith } from '../status';
import { save } from '../storage';
import type { Crowd } from '../crowding';
import type { Shape } from '../types';
import { render } from './render';
import { toast, toastAction } from './toast';

const TESTID = 'crowd-notice';
const f = (v: number) => (Math.round(v * 10) / 10).toString();
const nameOf = (s: Shape) => (s.plantId && plantsById[s.plantId]?.common) || s.label || 'a plant';

/** Close the crowding notice, if one is up (another plant placed, or placing done). */
export function dismissCrowdNotice() {
  const n = document.getElementById('toast-action');
  if (n?.dataset.testid === TESTID) n.remove();
}

/** After `shape` is placed: the notice, if it's close to or crowding another; `moveIt` takes it back to tap again. */
export function crowdNotice(shape: Shape, moveIt: () => void) {
  dismissCrowdNotice();
  if (!state.crowdWarnings) return;
  const shapes = state.shapes.filter((x) => shownWith(x, state.viewFilter));
  const opts = crowdOptions();
  const crowds = crowdingOf(shape, shapes, plantsById, { ...opts, close: true });
  const crowded = crowds.filter((c) => c.level === 'crowded');
  const list = crowded.length ? crowded : crowds;
  if (!list.length || (!crowded.length && state.placing?.warnedClose)) return;
  if (!crowded.length && state.placing) state.placing.warnedClose = true;
  const { line, detail } = crowdWords(shape, list[0], list.length - 1, !!crowded.length);
  toastAction(line, [
    { label: 'Leave it', run: () => leaveClose(shape.id, list.map((c) => c.other.id)) },
    { label: 'Move it', run: () => { moveIt(); render(); toast('Tap where it should go.'); } },
    { label: 'Settings', run: openCrowdingSettings },
  ], 10000, TESTID, { detail, tone: crowded.length ? 'red' : 'amber' });
  const n = document.getElementById('toast-action');
  if (n) n.dataset.about = shape.id; // (gone with the plant: src/ui/toast.ts placeNotice)
}

/**
 * The notice's words: a short line ("Too far under Beautyberry"), and what opens under it, how far apart they are,
 * what's usual and what to do. `more`: how many others it's close to as well.
 */
export function crowdWords(shape: Shape, c: Crowd, more: number, crowded: boolean): { line: string; detail: string } {
  const name = nameOf(shape), other = nameOf(c.other);
  const also = more > 0 ? ` (+${more} more)` : '';
  const apart = `${f(c.distance)} ft apart, where about ${f(c.recommended)} ft is usual for these two`;
  if (!crowded) {
    return {
      line: `Close to ${other}${c.bulb ? ', at its base' : ''}${also}`,
      detail: `${name} and ${other} may quickly grow into one another: ${apart}. A little of this can be fine, if you're after a quick, full look.`,
    };
  }
  const how = crowdRelation(shape, c.other, plantsById);
  if (how === 'under') return { line: `Too far under ${other}${also}`, detail: `${name} will be buried by ${other}: ${apart}. Try moving it out toward the edge of ${other}.` };
  if (how === 'over') return { line: `Too far over ${other}${also}`, detail: `${name} will bury ${other}: ${apart}. Try moving it farther away, so ${other} is out at its edge.` };
  return { line: `Crowding ${other}${also}`, detail: `${name} and ${other} will grow into each other: ${apart}.` };
}

/**
 * Leave it: the plant and those named in the notice aren't flagged again. While placing, it goes with the step that
 * placed the plant (an undo takes both back together); otherwise it's a step of its own.
 */
export function leaveClose(id: string, others: string[]) {
  const s = state.shapes.find((x) => x.id === id);
  if (!s || s.type !== 'circle') return;
  s.crowdOk = [...new Set([...(s.crowdOk ?? []), ...others])];
  const copy = state.placing?.placed.find((x) => x.id === id)?.snap.shapes.find((x) => x.id === id);
  if (copy?.type === 'circle') copy.crowdOk = [...s.crowdOk];
  else pushHistory();
  save();
  render();
}

/**
 * Leave every pair flagged now close on purpose (Jason, 2026-10-27: a plan drawn before the warnings, red all over):
 * the rings clear, the warnings stay on for what's placed from now on. One undo step. Returns how many pairs.
 */
export function leaveAllClose(): number {
  const pairs = crowdPairs(state.shapes.filter((x) => shownWith(x, state.viewFilter)), plantsById, crowdOptions());
  for (const { a, b } of pairs) if (a.type === 'circle') a.crowdOk = [...new Set([...(a.crowdOk ?? []), b.id])];
  if (!pairs.length) return 0;
  pushHistory();
  save();
  return pairs.length;
}

/** Flag a plant's pairs again (each one it, or the other, was left close to). */
export function flagAgain(id: string) {
  let changed = false;
  for (const s of state.shapes) {
    if (s.type !== 'circle' || !s.crowdOk?.length) continue;
    const keep = s.id === id ? [] : s.crowdOk.filter((x) => x !== id);
    if (keep.length === s.crowdOk.length) continue;
    changed = true;
    if (keep.length) s.crowdOk = keep; else delete s.crowdOk;
  }
  if (!changed) return;
  pushHistory();
  save();
  render();
}

/** Crowding settings…: the Layers panel, at its crowding section. */
export function openCrowdingSettings() {
  state.panel = 'layers';
  render();
  requestAnimationFrame(() => {
    const n = document.querySelector('[data-testid=crowding-settings]');
    n?.scrollIntoView({ block: 'center' });
    n?.classList.add('flash');
  });
}
