import { canShareFiles, canShareWords, downloadBlob, safeFileName, shareBlob, shareWords, stamp } from '../backup';
import { el, hasKeyboard } from '../dom';
import { I } from '../icons';
import { markPlantedToday } from '../mutations';
import { boughtText, listTotals, plantedText, plantList, plantsOfKind, rowFacts, tickEntry, totalsText, listText, type ListGroup, type ListRow } from '../plant-list';
import { plantsById } from '../plants';
import { state } from '../state';
import { currentProject, save } from '../storage';
import { errMsg, now } from '../util';
import { tell } from './ask';
import { undoNotice } from './delete-selected';
import { render } from './render';
import { toast } from './toast';

// The Plant list sheet (Jason, Nov 1, from the UI review): what to buy, what's planted and what was there already, a
// row a kind, with a tick for each kind to buy, kept with the plan (src/plant-list.ts). Opened from the plan's own
// buttons, beside Through the year, and from ⋮.

/** The PDF last made, while the list it was made from stands. */
let made: { blob: Blob; filename: string; pages: number; of: string } | null = null;
let busy = false;
/** What the PDF is made from: the plan, its plants and its ticks. */
const listNow = () => JSON.stringify([state.currentProjectId, plantList(state.shapes, plantsById, state.bought)]);

export function openPlantList() {
  state.panel = 'plantList';
  state.menu = null;
}
/** Whether the plan has a plant to list. */
export const hasPlantsToList = () => state.shapes.some((s) => s.role === 'plant' && s.status !== 'gone' && s.status !== 'remove');

/** A kind's tick, set to `n` bought now (all to buy, or none): kept with the plan, and synced. */
function setBought(key: string, n: number) {
  state.bought = { ...(state.bought ?? {}), [key]: tickEntry(n, plantsOfKind(state.shapes, key, plantsById), now()) };
  save();
  render();
}

function tick(r: ListRow): HTMLElement {
  const all = r.bought >= r.count, some = r.bought > 0 && !all;
  const b = el('button', {
    className: 'pl-tick' + (all ? ' on' : some ? ' some' : ''), role: 'checkbox', 'aria-checked': all ? 'true' : some ? 'mixed' : 'false',
    'aria-label': `Bought: ${r.name}`, 'data-testid': 'pl-tick', html: all ? I.check : some ? '<span class="pl-dash"></span>' : '',
  });
  // (Partly bought, a tick makes it all: more were added since it was ticked.)
  b.addEventListener('click', () => setBought(r.key, all ? 0 : r.count));
  return b;
}
function row(r: ListRow, group: ListGroup): HTMLElement {
  const bought = group === 'buy' ? boughtText(r) : '';
  const main = el('div', { className: 'pl-main' },
    el('div', { className: 'pl-name' },
      el('span', { className: 'pl-title', 'data-testid': 'pl-name' }, r.name),
      el('span', { className: 'pl-count', 'data-testid': 'pl-count' }, `× ${r.count}`)),
    r.botanical ? el('div', { className: 'pl-bot', 'data-testid': 'pl-bot' }, r.botanical) : null,
    rowFacts(r) ? el('div', { className: 'pl-facts', 'data-testid': 'pl-facts' }, rowFacts(r)) : null);
  if (group === 'buy' && r.bought > 0) {
    // Planting day: what's bought goes in, today (Jason, Nov 1). Partly bought, as many as are bought, the first on the
    // plan: the rest are still to buy. (Offered once some are bought: it follows the tick, and an unbought row stays short.)
    const k = Math.min(r.bought, r.count);
    const mark = el('button', { className: 'btn ghost pl-mark', 'data-testid': 'pl-mark-planted', 'aria-label': `Mark ${k === r.count ? '' : `${k} `}${r.name} planted, today` },
      k === r.count ? 'Mark planted' : `Mark ${k} planted`);
    mark.addEventListener('click', () => {
      markPlantedToday(r.ids.slice(0, k));
      render();
      undoNotice(`${r.name}: ${k === r.count ? `${k}` : `${k} of ${r.count}`} planted today.`);
    });
    main.appendChild(el('div', { className: 'pl-actions' },
      el('span', { className: 'pl-state' + (bought !== 'Bought' ? ' some' : ''), 'data-testid': 'pl-bought' }, bought), mark));
  } else if (group === 'planted' && r.plantedOn) {
    main.appendChild(el('div', { className: 'pl-state', 'data-testid': 'pl-planted-on' }, `Planted ${plantedText(r.plantedOn)}`));
  }
  return el('div', { className: 'pl-row' + (group === 'buy' && r.bought >= r.count ? ' bought' : ''), 'data-testid': 'pl-row', 'data-group': group, 'data-key': r.key },
    group === 'buy' ? tick(r) : null, main);
}
const GROUPS: [ListGroup, string][] = [['buy', 'To buy'], ['planted', 'Planted'], ['existing', 'Existing']];

export function renderPlantListPanel() {
  const close = () => { state.panel = null; render(); };
  const list = plantList(state.shapes, plantsById, state.bought);
  const totals = listTotals(list);
  const planName = currentProject()?.name || 'My Garden';
  const body = el('div', { className: 'sheet-body pl-body' });
  const any = list.buy.length + list.planted.length + list.existing.length > 0;
  if (!any) {
    body.appendChild(el('div', { className: 'hint', 'data-testid': 'pl-empty' }, 'No plants in this plan yet. Plants you place from the plant picker are listed here, ready to buy.'));
  } else {
    body.appendChild(el('div', { className: 'pl-totals', 'data-testid': 'pl-totals' }, totalsText(totals)));
    for (const [g, title] of GROUPS) {
      const rows = list[g];
      if (!rows.length) continue;
      const n = rows.reduce((k, r) => k + r.count, 0);
      // (Nothing ticked yet: what the ticks are for, in a line.)
      const how = g === 'buy' && !totals.bought ? el('div', { className: 'hint pl-how', 'data-testid': 'pl-how' }, 'Tick each kind as you buy it. Mark planted then records the day it goes in.') : null;
      body.appendChild(el('section', { className: 'pl-group', 'data-testid': `pl-group-${g}`, 'aria-label': title },
        el('div', { className: 'pl-head' }, title, el('span', { className: 'pl-head-n' }, ` (${n})`)), how,
        ...rows.map((r) => row(r, g))));
    }
  }
  // Getting it out: as words to paste into a note or a message (on a computer, copied), and on paper.
  const foot = el('div', { className: 'sheet-foot pl-foot' });
  if (any) {
    const words = listText(list, planName);
    const viaShare = canShareWords() && !hasKeyboard();
    const share = el('button', { className: 'btn secondary', 'data-testid': 'pl-share' }, viaShare ? 'Share as text' : 'Copy as text');
    share.addEventListener('click', async () => {
      if (viaShare) {
        try { await shareWords(`${planName}: plant list`, words); } catch (e) { void tell("Couldn't share: " + errMsg(e)); }
        return;
      }
      try {
        await navigator.clipboard.writeText(words);
        toast('The list is copied: paste it into a note, an email or a message.', 6000);
      } catch { void tell("Couldn't copy the list. Share or print it instead."); }
    });
    const buttons = el('div', { className: 'pl-foot-row' }, share);
    if (list.buy.length) {
      const print = el('button', { className: 'btn secondary', 'data-testid': 'pl-print' }, busy ? 'Making the PDF…' : 'Print list');
      print.disabled = busy;
      print.addEventListener('click', async () => {
        busy = true; made = null; render();
        try {
          const { buildListPdf } = await import('../plant-list-pdf');
          const r = await buildListPdf(planName, list);
          made = { blob: r.blob, pages: r.pages, filename: `${safeFileName(planName)}-plant-list-${stamp()}.pdf`, of: listNow() };
        } catch (e) { void tell("Couldn't make the PDF: " + errMsg(e)); }
        finally { busy = false; if (state.panel === 'plantList') render(); }
      });
      buttons.appendChild(print);
    }
    foot.appendChild(buttons);
    if (made && made.of !== listNow()) made = null; // (made from a list that's changed since: let go)
    if (made) {
      const m = made;
      foot.appendChild(el('div', { className: 'hint', 'data-testid': 'pl-pdf-ready' }, `Ready: ${m.filename} · ${m.pages} page${m.pages === 1 ? '' : 's'}`));
      const got = el('div', { className: 'pl-foot-row' });
      const dl = el('button', { className: 'btn ghost', 'data-testid': 'pl-download-pdf' }, 'Download PDF');
      dl.addEventListener('click', () => { downloadBlob(m.filename, m.blob); toast(`Saved ${m.filename} to your Downloads`, 6000); });
      got.appendChild(dl);
      if (canShareFiles('application/pdf', 'x.pdf')) {
        const sh = el('button', { className: 'btn ghost' }, 'Share…');
        sh.addEventListener('click', async () => { try { await shareBlob(m.filename, m.blob); } catch (e) { void tell("Couldn't share: " + errMsg(e)); } });
        got.appendChild(sh);
      }
      foot.appendChild(got);
    }
  }
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Plant list'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', close); return b; })());
  const sheet = el('div', { className: 'sheet pl-sheet', 'data-testid': 'plant-list' }, header, body, ...(any ? [foot] : []));
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return overlay;
}
