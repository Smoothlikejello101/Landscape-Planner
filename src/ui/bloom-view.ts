import { bloomByBed, bloomGaps, bloomSeason, bloomSummary, MONTH_LETTERS, type BloomSummary, type NoBloomRow } from '../bloom';
import { plantsInBed } from '../beds';
import { el } from '../dom';
import { I } from '../icons';
import { plantsById } from '../plants';
import { state } from '../state';
import type { PanelName, Shape } from '../types';
import { render } from './render';
import { openLocation } from './location-panel';

// Bloom calendar: a row per plant, a column per month, filled where it
// blooms, and a bottom row counting what's in bloom, with growing-season
// gaps called out. Plants with no bloom months are listed too, by name, so
// it's plain what else is there (asked for by Jason, 2026-10-25); the
// person's own plants with a button to add them.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** What a row with no bloom months says, after the plant's name. */
const NO_BLOOM_SAYS: Record<NoBloomRow['why'], string> = {
  mine: 'No bloom months', season: '', catalog: 'None recorded', fern: "Doesn't flower", unlinked: 'Not linked to a plant',
};
/** "Mid summer, late summer (no months)": a season its sources give, where none give months. */
const seasonSays = (season: string[]) => { const t = season.join(', '); return t.charAt(0).toUpperCase() + t.slice(1) + ' (no months)'; };
/** A plant with no bloom months: its name, then why, across the months (the person's own: Add). */
function noBloomRow(r: NoBloomRow, back: PanelName): HTMLElement[] {
  const name = el('div', { className: 'bloom-name none', title: r.label }, r.label + (r.count > 1 ? ` ×${r.count}` : ''));
  const says = el('div', { className: 'bloom-none ' + r.why, 'data-testid': 'bloom-none' }, el('span', {}, r.season ? seasonSays(r.season) : NO_BLOOM_SAYS[r.why]));
  if (r.why === 'mine' && r.plantId) {
    const add = el('button', { className: 'link-btn', 'data-testid': 'bloom-add', 'aria-label': `Add bloom months to ${r.label}` }, 'Add');
    add.addEventListener('click', () => { state.plantForm = { editId: r.plantId, place: false, back }; state.panel = 'plantForm'; render(); });
    says.appendChild(add);
  }
  return [name, says];
}

/** `back`: where adding bloom months to a plant of mine comes back to (the panel this chart is in). */
export function bloomChart(sum: BloomSummary, back: PanelName = 'bloom'): HTMLElement {
  const wrap = el('div', { className: 'bloom', 'data-testid': 'bloom-chart' });
  if (!sum.rows.length && !sum.missing.length) {
    wrap.appendChild(el('div', { className: 'hint' }, 'No plants here yet.'));
    return wrap;
  }
  const grid = el('div', { className: 'bloom-grid', role: 'table', 'aria-label': 'Bloom months' });
  grid.appendChild(el('div', { className: 'bloom-name head' }));
  MONTH_LETTERS.forEach((m, i) => grid.appendChild(el('div', { className: 'bloom-head', title: MONTH_NAMES[i] }, m)));
  for (const r of sum.rows) {
    const season = r.bySeason ? ` (by season: ${r.bySeason.join(', ')})` : '';
    grid.appendChild(el('div', { className: 'bloom-name', title: r.label + (r.colorText ? ` (${r.colorText})` : '') + season },
      r.label + (r.count > 1 ? ` ×${r.count}` : '')));
    for (let m = 1; m <= 12; m++) {
      const on = r.months.includes(m);
      grid.appendChild(el('div', {
        className: 'bloom-cell' + (on ? ' on' : '') + (on && r.bySeason ? ' by-season' : ''), style: on ? { background: r.color } : undefined,
        title: on ? `${r.label}: ${r.bySeason ? `in bloom around ${MONTH_NAMES[m - 1]}${season}` : `blooms in ${MONTH_NAMES[m - 1]}`}` : undefined,
      }));
    }
  }
  // Then those with none, each saying why.
  for (const r of sum.missing) grid.append(...noBloomRow(r, back));
  wrap.appendChild(grid);
  const seasonal = sum.rows.filter((r) => r.bySeason);
  if (seasonal.length) {
    wrap.appendChild(el('div', { className: 'hint', 'data-testid': 'bloom-by-season' },
      `Faint: months from the season its sources give, none giving months (${seasonal.map((r) => `${r.label}: ${r.bySeason!.join(', ')}`).join('; ')}).`));
  }
  if (!sum.rows.length) return wrap; // (nothing known to bloom here: no count, no gaps)
  // How many are in bloom each month; empty months within the plan's blooming season are gaps.
  const season = planSeason();
  grid.appendChild(el('div', { className: 'bloom-name total' }, 'In bloom'));
  sum.perMonth.forEach((n, i) => grid.appendChild(el('div', {
    className: 'bloom-count' + (n === 0 && season.includes(i + 1) ? ' gap' : ''), 'data-month': i + 1,
  }, n ? String(n) : '–')));
  const gaps = bloomGaps(sum.perMonth, season);
  if (season.length) {
    wrap.appendChild(el('div', { className: 'hint', 'data-testid': 'bloom-gaps' }, gaps
      // (Measured against the whole plan's season, so say it in two sentences: "here", then the plan.)
      ? `Nothing here blooms in ${gaps}. ${cap(seasonText(season))}.`
      : `Something is in bloom every month ${seasonSpan(season)}.`));
  }
  return wrap;
}

/**
 * The plan's blooming season: from its first bloom to its last, whatever the
 * climate. A bed is measured against the whole plan's season, so a bed with
 * nothing in March shows a gap when the rest of the garden blooms then.
 */
function planSeason(): number[] { return bloomSeason(bloomSummary(state.shapes, plantsById).perMonth); }
const fullMonth = (m: number) => MONTH_NAMES[m - 1];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** "from March to October", "all year". */
function seasonSpan(season: number[]): string {
  if (!season.length) return '';
  return season.length === 12 ? 'of the year' : `from ${fullMonth(season[0])} to ${fullMonth(season.at(-1)!)}`;
}
/** "the whole plan blooms from March to October". */
function seasonText(season: number[]): string {
  return season.length === 12 ? 'the whole plan blooms all year' : `the whole plan blooms ${seasonSpan(season)}`;
}

/** Bed properties: when the plants in this bed bloom. */
export function bedBloomSection(bed: Shape): HTMLElement {
  const plants = plantsInBed(bed, state.shapes);
  return el('div', { className: 'field' }, el('label', {}, 'Bloom by month'), bloomChart(bloomSummary(plants, plantsById), 'props'));
}

/** The whole plan, bed by bed. */
export function renderBloomPanel() {
  const close = () => { state.panel = null; render(); };
  const body = el('div', { className: 'sheet-body' });
  const groups = bloomByBed(state.shapes, plantsById);
  if (!groups.length) body.appendChild(el('div', { className: 'hint' }, 'Add plants to see when they bloom.'));
  if (groups.length > 1) {
    const all = bloomSummary(state.shapes, plantsById);
    const season = bloomSeason(all.perMonth);
    const gaps = bloomGaps(all.perMonth, season);
    body.appendChild(el('div', { className: 'banner', 'data-testid': 'plan-bloom-gaps' }, !season.length
      ? 'No bloom months are known for the plants in this plan yet.'
      : gaps
        ? `Across the whole plan, nothing is in bloom in ${gaps}, between the first blooms in ${fullMonth(season[0])} and the last in ${fullMonth(season.at(-1)!)}.`
        : `Across the whole plan, something is in bloom every month ${seasonSpan(season)}.`));
  }
  for (const g of groups) {
    body.appendChild(el('div', { className: 'bloom-group' }, el('div', { className: 'section-label' }, g.bed), bloomChart(g)));
  }
  // No ZIP yet, and catalog plants without months: flowering records near the garden would give many of them.
  if (!state.location && groups.some((g) => g.rows.some((r) => r.bySeason) || g.missing.some((r) => r.why === 'season' || r.why === 'catalog'))) {
    const set = el('button', { className: 'link-btn', 'data-testid': 'bloom-zip' }, 'Set your ZIP code');
    set.addEventListener('click', () => openLocation('bloom'));
    body.appendChild(el('div', { className: 'hint' }, 'Many plants get bloom months from flowering records near your garden. ', set));
  }
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Bloom calendar'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', close); return b; })());
  const overlay = el('div', { className: 'overlay' }, el('div', { className: 'sheet' }, header, body));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return overlay;
}
