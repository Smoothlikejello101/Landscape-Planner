// Garden over time (Jason, Oct 29: "Month slider is part of garden over time", wanted for most of the beta): the plan
// drawn in a month. Opened from the plan's buttons, it takes the bottom bar's place: the month, a step either way, a
// slider across the year, Today, Done. Every plant is drawn as it is that month (src/looks.ts LookMonth, from
// src/seasons.ts with the records near the garden): leafing out, in leaf, coloring, bare or died back; in bloom only in
// its months, faint where those are only "around"; fruit where it shows; a dotted ring where its winter isn't known.
// The month isn't saved: closed, plants are drawn in bloom again.
import { redrawCanvas } from '../canvas';
import { el } from '../dom';
import { I } from '../icons';
import { lookMonthOf } from '../plant-looks';
import { plantsById } from '../plants';
import { state } from '../state';
import type { CircleShape } from '../types';
import { render } from './render';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** This month, 1–12. */
export const thisMonth = () => new Date().getMonth() + 1;

/** Open garden over time at this month; close it. */
export function openYear() { state.month = thisMonth(); }
export function closeYear() { state.month = null; listOpen = false; }

/** How many of the plan's plants are in bloom in `month`, and how many say so only "around" (a season word). */
export function bloomCount(month: number): { n: number; around: number; of: number } {
  let n = 0, around = 0, of = 0; // (around: kept for a fuller list later)
  for (const s of state.shapes) {
    if (s.type !== 'circle' || s.role !== 'plant' || !s.plantId || s.status === 'gone') continue;
    const m = lookMonthOf(s as CircleShape, month);
    if (!m) continue;
    of++;
    if (m.bloom === 'yes') n++;
    else if (m.bloom === 'around') { n++; around++; }
  }
  return { n, around, of };
}
/**
 * The plan's plants in bloom in `month`, a line each kind (its name, how many, and whether only "around": a season
 * word, drawn faint), in the order they're on the plan. (Jason, Oct 30: "a button or expandable panel to see which
 * plants are in bloom".)
 */
export function inBloom(month: number): { name: string; n: number; around: boolean }[] {
  const out = new Map<string, { name: string; n: number; around: boolean }>();
  for (const s of state.shapes) {
    if (s.type !== 'circle' || s.role !== 'plant' || !s.plantId || s.status === 'gone') continue;
    const m = lookMonthOf(s as CircleShape, month);
    if (!m || m.bloom === 'no') continue;
    const name = s.label || plantsById[s.plantId]?.common || 'A plant';
    const row = out.get(name) ?? out.set(name, { name, n: 0, around: true }).get(name)!;
    row.n++;
    if (m.bloom === 'yes') row.around = false;
  }
  return [...out.values()];
}
/** Whether the list of what's in bloom is open (kept while the month changes; closed with the bar). */
let listOpen = false;
const bloomText = (month: number) => {
  const { n, of } = bloomCount(month);
  if (!of) return 'No plants from the catalog yet';
  // (Those only "around" in bloom are drawn faint; the count says no more, to fit a phone's bar.)
  return n ? `${n} of ${of} in bloom` : 'Nothing in bloom';
};

/** The plan's button that opens it. */
export function yearButton(): HTMLElement {
  const on = state.month != null;
  const b = el('button', {
    className: 'zoombtn' + (on ? ' on' : ''), html: I.year, 'data-testid': 'year-open',
    title: 'Through the year', 'aria-label': 'Through the year', 'aria-pressed': String(on),
  });
  b.addEventListener('click', () => { if (on) closeYear(); else openYear(); render(); });
  return b;
}

/** The bottom bar while the plan is shown in a month. */
export function renderYearBar(): HTMLElement {
  const month = state.month ?? thisMonth();
  const bar = el('div', { className: 'bottom-toolbar draw-bar year-bar', 'data-testid': 'year-bar' });
  const name = el('div', { className: 'year-month', 'data-testid': 'year-month', 'aria-live': 'polite' }, MONTHS[month - 1]);
  // (The count opens the list of what's in bloom, a line a kind, above the bar.)
  const count = el('button', { className: 'year-count', 'data-testid': 'year-count', 'aria-expanded': String(listOpen), 'aria-controls': 'year-list' }, bloomText(month));
  const list = el('div', { className: 'year-list', id: 'year-list', 'data-testid': 'year-list' });
  const fill = (m: number) => {
    const rows = inBloom(m);
    count.disabled = !rows.length;
    list.hidden = !listOpen || !rows.length;
    list.replaceChildren(...rows.map((r) => el('div', { className: 'year-list-row' + (r.around ? ' around' : '') },
      el('span', {}, r.name), r.n > 1 ? el('span', { className: 'count' }, ` \u00d7${r.n}`) : '',
      r.around ? el('span', { className: 'count' }, ' (around now, by its season)') : '')));
  };
  count.addEventListener('click', () => { listOpen = !listOpen; count.setAttribute('aria-expanded', String(listOpen)); fill(state.month ?? month); });
  fill(month);
  const slider = el('input', { type: 'range', min: '1', max: '12', step: '1', value: String(month), 'aria-label': 'Month', 'data-testid': 'year-slider' }) as HTMLInputElement;
  // (Slid: the plan redraws, and the words beside it change, without rebuilding the bar: the slider keeps its place.)
  const show = (m: number) => {
    state.month = m;
    name.textContent = MONTHS[m - 1];
    count.textContent = bloomText(m);
    fill(m);
    slider.value = String(m);
    // (Once a frame, however fast the slider moves: a big plan draws every plant anew in a month it hasn't shown yet.)
    if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; redrawCanvas(); }); }
  };
  let pending = false;
  slider.addEventListener('input', () => show(Number(slider.value)));
  const step = (d: number, label: string, icon: string) => {
    const b = el('button', { className: 'draw-btn year-step', html: icon, 'aria-label': label, title: label, 'data-testid': d < 0 ? 'year-prev' : 'year-next' });
    b.addEventListener('click', () => show((((state.month ?? month) - 1 + d + 12) % 12) + 1));
    return b;
  };
  const today = el('button', { className: 'draw-btn', 'data-testid': 'year-today' }, 'Today');
  today.addEventListener('click', () => show(thisMonth()));
  const done = el('button', { className: 'draw-btn primary', 'data-testid': 'year-done' }, 'Done');
  done.addEventListener('click', () => { closeYear(); render(); });
  const letters = el('div', { className: 'year-letters', 'aria-hidden': 'true' }, ...MONTHS.map((m) => el('span', {}, m[0])));
  bar.append(el('div', { className: 'draw-bar-rows' }, list,
    el('div', { className: 'draw-bar-row' }, step(-1, 'Previous month', '‹'), el('div', { className: 'year-head' }, name, count), step(1, 'Next month', '›'), today, done),
    el('div', { className: 'year-slide' }, slider, letters)));
  return bar;
}
