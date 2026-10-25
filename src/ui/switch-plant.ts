// "Now in the catalog": a plant of mine side by side with the catalog plant it is, and the choice to switch to
// the catalog's (src/my-plants.ts, switchToCatalog), keep mine, or decide later.
import { el } from '../dom';
import { flushHistoryDebounce, undo } from '../history';
import { I } from '../icons';
import { formatSize, isDataSized, keepMine, plantRadius, switchToCatalog, unswitch } from '../my-plants';
import { plantsById, type Plant } from '../plants';
import { state } from '../state';
import { errMsg } from '../util';
import { render } from './render';
import { toast, toastAction } from './toast';

let args: { mineId: string; targetId: string } | null = null;
let busy = false;

/** Open the comparison for a plant of mine and the catalog plant it is. */
export function openSwitch(mineId: string, targetId: string) {
  args = { mineId, targetId };
  state.panel = 'switchPlant';
  render();
}

const sunWords: Record<string, string> = { Full: 'full sun', Part: 'part shade', Shade: 'shade' };
function sunText(p: Plant): string {
  if (!p.sun_most || !p.sun_least) return '';
  const a = sunWords[p.sun_most], b = sunWords[p.sun_least];
  const t = a === b ? a : `${a} to ${b}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function renderSwitchPanel(): HTMLElement | null {
  const mine = args ? plantsById[args.mineId] : undefined;
  const target = args ? plantsById[args.targetId] : undefined;
  // (Gone meanwhile, or already switched: nothing to compare.)
  if (!args || !mine || !target || mine.id !== args.mineId) { state.panel = 'plants'; return null; }
  const back = () => { args = null; state.panel = 'plants'; render(); };

  const placed = state.shapes.filter((s) => s.plantId === mine.id);
  const resizable = placed.filter((s) => isDataSized(s) && s.type === 'circle' && !s.tree && s.radius !== plantRadius(target, state.sizeMode));
  const body = el('div', { className: 'sheet-body' });
  body.appendChild(el('p', { className: 'switch-intro' },
    `Your “${mine.common}” is now in the catalog as ${target.common}${target.botanical ? ` (${target.botanical})` : ''}, with facts checked against published sources.`));

  // Side by side: what differs is what the person is deciding about.
  // (Catalog sizes can lack an end: written as the plant form writes them, from what's there.)
  const size = (r: Plant['width']) => (r ? formatSize({ min: r.min ?? r.med ?? r.max ?? 0, max: r.max ?? r.med ?? r.min ?? 0, med: r.med ?? 0 }) : '');
  const rows: [string, string, string][] = [
    ['Spread', size(mine.width), size(target.width)],
    ['Height', size(mine.height), size(target.height)],
    ['Sun', sunText(mine), sunText(target)],
  ];
  const table = el('div', { className: 'switch-compare', role: 'table', 'aria-label': 'Yours and the catalog’s' },
    el('div', { role: 'row', className: 'switch-row head' }, el('span', { role: 'columnheader' }, ''), el('span', { role: 'columnheader' }, 'Yours'), el('span', { role: 'columnheader' }, 'Catalog')));
  for (const [label, a, b] of rows) {
    if (!a && !b) continue;
    // (Marked where both say something and it differs: a blank of yours isn't a disagreement.)
    table.appendChild(el('div', { role: 'row', className: 'switch-row' + (a && b && a !== b ? ' differs' : '') },
      el('span', { role: 'rowheader' }, label), el('span', { role: 'cell' }, a || '—'), el('span', { role: 'cell' }, b || '—')));
  }
  body.appendChild(table);

  const resize = el('input', { type: 'checkbox', 'data-testid': 'switch-resize' }) as HTMLInputElement;
  resize.checked = true;
  if (placed.length) {
    body.appendChild(el('div', { className: 'hint' },
      `${placed.length} placed in this plan. Plants placed in your other plans switch too.`));
    if (resizable.length) body.appendChild(el('label', { className: 'check-row' }, resize,
      el('span', {}, `Redraw ${resizable.length === placed.length ? (placed.length === 1 ? 'it' : 'them') : `the ${resizable.length} sized from your plant`} at the catalog’s size (${size(target.width)})`)));
  }
  const keeps = [mine.notes ? 'your notes' : '', mine.color ? 'your color' : ''].filter(Boolean);
  if (keeps.length) body.appendChild(el('div', { className: 'hint' }, `It keeps ${keeps.join(' and ')}.`));

  const go = el('button', { className: 'btn primary', 'data-testid': 'switch-go' }, busy ? 'Switching…' : `Switch to ${target.common}`);
  go.disabled = busy;
  go.addEventListener('click', async () => {
    busy = true; render();
    try {
      const n = await switchToCatalog(mine, target, resize.checked);
      const step = state.history[state.historyIndex];
      args = null; state.panel = 'plants'; busy = false; render();
      toastAction(`Switched to ${target.common}` + (n ? ` (${n} placed here)` : ''), [{ label: 'Undo', run: async () => {
        try { await unswitch(mine); } catch (e) { alert("Couldn't undo: " + errMsg(e)); return; }
        flushHistoryDebounce();
        if (n && state.history[state.historyIndex] === step) undo();
        else if (n) toast('Your plant is back; the plants placed here stay linked to the catalog’s (the plan has changed since).', 6000);
        render();
      } }], 10000);
    } catch (e) {
      busy = false; render();
      alert("Couldn't switch: " + errMsg(e));
    }
  });
  const keep = el('button', { className: 'btn ghost', style: { flex: '1' }, 'data-testid': 'switch-keep' }, 'Keep mine');
  keep.addEventListener('click', async () => {
    try { await keepMine(mine, target); } catch (e) { alert(errMsg(e)); return; }
    toast(`Keeping yours. ${target.common} won’t be offered for it again.`, 5000);
    back();
  });
  const later = el('button', { className: 'btn ghost', style: { flex: '1' }, 'data-testid': 'switch-later' }, 'Not now');
  later.addEventListener('click', back);
  const foot = el('div', { className: 'sheet-foot' }, go, el('div', { style: { display: 'flex', gap: '8px' } }, keep, later));

  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Now in the catalog'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', back); return b; })());
  const sheet = el('div', { className: 'sheet', 'data-testid': 'switch-sheet' }, header, body, foot);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) back(); });
  return overlay;
}
