// Crowding, as a plant is placed (decided with Jason, 2026-10-25): a notice saying which plant it's close to or
// crowding, how far apart they are and why it matters, with Leave it (that pair isn't flagged again), Move it (take it
// back and tap again) and Crowding settings… (where the notices can be turned off). Crowded: every time. Close: once
// each time plants are placed (the first close one). Spring bulbs placed under a deciduous plant, which don't count
// (src/crowding.ts), get a note saying why, once on this device.
import { pushHistory } from '../history';
import { bulbsUnder, crowdingOf } from '../crowding';
import { crowdOptions } from '../crowd-here';
import { hintDue, hintShown } from '../hints';
import { plantsById } from '../plants';
import { state } from '../state';
import { shownWith } from '../status';
import { save } from '../storage';
import type { Shape } from '../types';
import { render } from './render';
import { toast, toastAction } from './toast';

const TESTID = 'crowd-notice';
export const BULB_HINT = 'lp-hint-bulbs-under';
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
  if (!list.length || (!crowded.length && state.placing?.warnedClose)) { bulbNote(shape, shapes); return; }
  if (!crowded.length && state.placing) state.placing.warnedClose = true;
  const name = nameOf(shape), first = list[0], other = nameOf(first.other);
  const more = list.length > 1 ? ` (and ${list.length - 1} more)` : '';
  const text = crowded.length
    ? `${name} is crowding ${other}${more}: ${f(first.distance)} ft apart, where about ${f(first.recommended)} ft is usual for these two, so they'll grow into each other.`
    : `${name} is close to ${other}${more}${first.bulb ? ', right at its base' : ''}, and they may quickly grow into one another. A little of this can be fine, if you're after a quick, full look.`;
  toastAction(text, [
    { label: 'Leave it', run: () => leaveClose(shape.id, list.map((c) => c.other.id)) },
    { label: 'Move it', run: () => { moveIt(); render(); toast('Tap where it should go.'); } },
    { label: 'Crowding settings…', run: openCrowdingSettings },
  ], 10000, TESTID);
}

/** A spring bulb placed under a deciduous plant (or the plant placed over bulbs): why that isn't crowding, once. */
function bulbNote(shape: Shape, shapes: Shape[]) {
  const under = bulbsUnder(shape, shapes, plantsById, crowdOptions());
  if (!under.length || !hintDue(BULB_HINT, 1)) return;
  hintShown(BULB_HINT);
  const p = shape.plantId ? plantsById[shape.plantId] : undefined;
  const isBulb = !!p && (p.forms ?? [p.form]).includes('Bulb');
  const [bulb, big] = isBulb ? [nameOf(shape), nameOf(under[0])] : [nameOf(under[0]), nameOf(shape)];
  toast(`${bulb} under ${big}: spring bulbs flower and ripen their leaves before a deciduous plant leafs out, so they aren't counted as crowding it. Right at its base, they still are.`, 9000);
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
