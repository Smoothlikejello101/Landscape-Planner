import { el } from '../dom';
import { state } from '../state';
import type { PrintUnder } from '../types';
import { setPrintUnder } from '../view-settings';

/**
 * How a printout or picture draws the plants under taller ones (Jason, Nov 4: "C by default, but with a printing option
 * for same as on screen with numbered dots"; src/canvas.ts paperUnder): each taller plant faded where it covers one, or as
 * on the screen, the plants under them numbered dots with a key. One choice for Print and Export (the picture follows,
 * as it does the area), kept on this device.
 */
export function underPicker(onChange: () => void): HTMLElement {
  const label = 'Plants under taller ones';
  const options: [PrintUnder, string][] = [['windows', 'Show through'], ['screen', 'As on screen']];
  const seg = el('div', { className: 'seg', role: 'group', 'aria-label': label, 'data-testid': 'print-under' });
  for (const [k, text] of options) {
    const b = el('button', { className: k === state.printUnder ? 'sel' : '', 'aria-pressed': String(k === state.printUnder) }, text);
    b.addEventListener('click', () => { if (state.printUnder !== k) { setPrintUnder(k); onChange(); } });
    seg.appendChild(b);
  }
  return el('div', { className: 'field' }, el('label', {}, label), seg, el('div', { className: 'hint', 'data-testid': 'print-under-says' }, underSays()));
}
/** What the choice draws, in a line under it. */
export function underSays(): string {
  if (state.printUnder === 'windows') return 'Each taller plant is faded just where it covers a shorter one, so that one shows through.';
  const tall = state.seeThroughTall ? ` Plants ${state.seeThroughFrom} ft or taller are seen through, as Layers has them now.` : '';
  return `Plants are drawn solid, as on the plan. Each one under a taller plant is a numbered dot, listed with its name.${tall}`;
}
