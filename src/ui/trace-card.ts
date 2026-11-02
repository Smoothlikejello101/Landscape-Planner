// "Now trace": once a photo is set to scale, what to trace over it, each a press away from its tool: House, Driveway,
// Trees, Lot line, Beds (Jason, Nov 2, from the UI review). Ticked as each is drawn; put away with its ✕, or by itself
// once all are drawn, and then not back on its own (src/yard-in.ts traceState). At the foot of the plan, between tools:
// not while drawing, placing or setting the scale, nor during the guided introduction, which has steps of its own.
// On an empty plan it's the first screen's line, in the card docked under the photo (src/ui/render.ts).

import { startKind } from '../draw';
import { el } from '../dom';
import { I } from '../icons';
import { state } from '../state';
import { allTraced, setTraceState, TRACE_ITEMS, traced, traceState } from '../yard-in';
import { introActive } from './intro-card';
import { render } from './render';
import { toastAction } from './toast';

/** Whether it's up now (and, all traced, put away for good). */
export function traceShown(): boolean {
  const plan = state.currentProjectId, bg = state.bgImage;
  if (!plan || traceState(plan) !== 'on' || !bg || !bg.visible || bg.uncalibrated) return false;
  if (allTraced(state.shapes)) { setTraceState(plan, 'off'); return false; }
  return !state.draw && !state.placing && !state.featurePlace && !state.editPoints && !state.bgCalibrate && !state.bgEditMode
    && !state.selectMode && !state.panel && state.month == null && !introActive();
}

/** "Now trace over the photo:" and its chips, each starting its tool; one drawn already, ticked. */
export function traceChips(): HTMLElement {
  const row = el('div', { className: 'trace-chips', role: 'group', 'aria-label': 'Trace over the photo' });
  for (const t of TRACE_ITEMS) {
    const done = traced(t.key, state.shapes);
    const b = el('button', { className: 'trace-chip' + (done ? ' done' : ''), 'data-testid': `trace-${t.key}`, 'aria-label': done ? `${t.label}, drawn: add another` : t.label },
      ...(done ? [el('span', { className: 'trace-tick', 'aria-hidden': 'true' }, '✓')] : []), t.label);
    b.addEventListener('click', () => { startKind(t.key); render(); });
    row.appendChild(b);
  }
  return el('div', { className: 'trace-line', 'data-testid': 'trace-line' }, el('div', { className: 'trace-head' }, 'Now trace over the photo:'), row);
}

/** Put away for this plan, with Undo; Add has them all, any time. */
export function putTraceAway(also?: { undo: () => void }): void {
  const plan = state.currentProjectId;
  if (!plan) return;
  setTraceState(plan, 'off');
  render();
  toastAction('Put away. House, driveway and the rest are under Add.',
    [{ label: 'Undo', run: () => { setTraceState(plan, 'on'); also?.undo(); render(); } }], 8000, 'trace-hidden');
}

/** On its own, at the foot of the plan (above a selected shape's chip: placed after layout, src/ui/render.ts). */
export function traceCard(): HTMLElement {
  const close = el('button', { className: 'trace-hide', html: I.x, 'aria-label': 'Put this away', title: 'Put this away', 'data-testid': 'trace-hide' });
  close.addEventListener('click', () => putTraceAway());
  return el('div', { className: 'trace-card', 'data-testid': 'trace-card' }, close, traceChips());
}

/** Above whatever is at the foot of the plan (the selected shape's chip, the bar for several). */
export function placeTraceCard(root: HTMLElement): void {
  const card = root.querySelector<HTMLElement>('.trace-card'), wrap = document.getElementById('canvas-wrap');
  if (!card || !wrap) return;
  const foot = wrap.getBoundingClientRect().bottom;
  let top = foot;
  for (const e of wrap.querySelectorAll('.sel-pill, .multi-bar')) { const r = e.getBoundingClientRect(); if (r.height) top = Math.min(top, r.top); }
  card.style.bottom = `${Math.round(foot - top + 8)}px`;
}
