import { bloomByBed, bloomGaps, bloomSummary, MONTH_LETTERS, type BloomSummary } from '../bloom';
import { plantsInBed } from '../beds';
import { el } from '../dom';
import { I } from '../icons';
import { plantsById } from '../plants';
import { state } from '../state';
import type { Shape } from '../types';
import { render } from './render';

// Bloom calendar: a row per plant, a column per month, filled where it
// blooms, and a bottom row counting what's in bloom, with growing-season
// gaps called out.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function bloomChart(sum: BloomSummary): HTMLElement {
  const wrap = el('div', { className: 'bloom', 'data-testid': 'bloom-chart' });
  if (!sum.rows.length) {
    wrap.appendChild(el('div', { className: 'hint' }, sum.noData
      ? `No bloom months known for the ${sum.noData === 1 ? 'plant' : `${sum.noData} plants`} here. Add them to your own plants to see them.`
      : 'No plants here yet.'));
    return wrap;
  }
  const grid = el('div', { className: 'bloom-grid', role: 'table', 'aria-label': 'Bloom months' });
  grid.appendChild(el('div', { className: 'bloom-name head' }));
  MONTH_LETTERS.forEach((m, i) => grid.appendChild(el('div', { className: 'bloom-head', title: MONTH_NAMES[i] }, m)));
  for (const r of sum.rows) {
    grid.appendChild(el('div', { className: 'bloom-name', title: r.label + (r.colorText ? ` (${r.colorText})` : '') },
      r.label + (r.count > 1 ? ` ×${r.count}` : '')));
    for (let m = 1; m <= 12; m++) {
      const on = r.months.includes(m);
      grid.appendChild(el('div', {
        className: 'bloom-cell' + (on ? ' on' : ''), style: on ? { background: r.color } : undefined,
        title: on ? `${r.label}: blooms in ${MONTH_NAMES[m - 1]}` : undefined,
      }));
    }
  }
  // How many are in bloom each month; empty growing-season months are gaps.
  grid.appendChild(el('div', { className: 'bloom-name total' }, 'In bloom'));
  sum.perMonth.forEach((n, i) => grid.appendChild(el('div', {
    className: 'bloom-count' + (n === 0 && i >= 3 && i <= 9 ? ' gap' : ''), 'data-month': i + 1,
  }, n ? String(n) : '–')));
  wrap.appendChild(grid);
  const gaps = bloomGaps(sum.perMonth);
  wrap.appendChild(el('div', { className: 'hint', 'data-testid': 'bloom-gaps' }, gaps
    ? `Nothing in bloom in ${gaps} (April to October).`
    : 'Something is in bloom every month from April to October.'));
  if (sum.noData) wrap.appendChild(el('div', { className: 'hint' }, `${sum.noData} plant${sum.noData === 1 ? ' has' : 's have'} no bloom months recorded.`));
  return wrap;
}

/** Bed properties: when the plants in this bed bloom. */
export function bedBloomSection(bed: Shape): HTMLElement {
  const plants = plantsInBed(bed, state.shapes);
  return el('div', { className: 'field' }, el('label', {}, 'Bloom by month'), bloomChart(bloomSummary(plants, plantsById)));
}

/** The whole plan, bed by bed. */
export function renderBloomPanel() {
  const close = () => { state.panel = null; render(); };
  const body = el('div', { className: 'sheet-body' });
  const groups = bloomByBed(state.shapes, plantsById);
  if (!groups.length) body.appendChild(el('div', { className: 'hint' }, 'Add plants to see when they bloom.'));
  if (groups.length > 1) {
    const all = bloomSummary(state.shapes, plantsById);
    const gaps = bloomGaps(all.perMonth);
    body.appendChild(el('div', { className: 'banner' }, gaps
      ? `Across the whole plan, nothing is in bloom in ${gaps}.`
      : 'Across the whole plan, something is in bloom every month from April to October.'));
  }
  for (const g of groups) {
    body.appendChild(el('div', { className: 'bloom-group' }, el('div', { className: 'section-label' }, g.bed), bloomChart(g)));
  }
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Bloom calendar'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', close); return b; })());
  const overlay = el('div', { className: 'overlay' }, el('div', { className: 'sheet' }, header, body));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return overlay;
}
