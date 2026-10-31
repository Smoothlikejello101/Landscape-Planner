import { canShareFiles, downloadBlob, safeFileName, shareBlob } from '../backup';
import { el } from '../dom';
import { I } from '../icons';
import { PAPER, planLayout, printContent, scaleText } from '../print';
import { STATUSES } from '../status';
import { state } from '../state';
import { currentProject, save } from '../storage';
import type { PaperSize, PrintSettings } from '../types';
import { errMsg } from '../util';
import { render } from './render';
import { toast } from './toast';
import { tell } from './ask';

// Printable plan options and the Create PDF button.
// Text and number fields update settings without re-rendering (Android
// keyboard safety); buttons and checkboxes re-render.

let result: { blob: Blob; filename: string; pages: number; of: string } | null = null;
/**
 * What a PDF was made of: the plan, its layers and what's shown. Changed since, the PDF made is let go, not offered as
 * "Ready" (round 3, Tom: plants hidden, and Download gave the PDF with them).
 */
const printedFrom = () => JSON.stringify([state.currentProjectId, state.shapes, state.roleViews, state.viewFilter, state.sizeMode, state.bgImage?.dataUrl?.length ?? 0, state.bgImage?.opacity, state.bgImage?.visible, state.bgImage?.cx, state.bgImage?.cy, state.bgImage?.rotation, state.bgImage?.ftPerPx]);
let busy = false;
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function set(patch: Partial<PrintSettings>, rerender: boolean) {
  state.print = { ...state.print, ...patch };
  save();
  result = null;
  if (rerender) render();
  else document.querySelector('[data-testid=print-result]')?.replaceChildren();
}
function seg<T extends string>(options: [T, string][], current: T, onPick: (v: T) => void, testid: string) {
  const wrap = el('div', { className: 'seg', role: 'group', 'data-testid': testid });
  for (const [v, label] of options) {
    const b = el('button', { className: v === current ? 'sel' : '', 'aria-pressed': String(v === current) }, label);
    b.addEventListener('click', () => onPick(v));
    wrap.appendChild(b);
  }
  return wrap;
}
const check = (label: string, checked: boolean, onChange: (v: boolean) => void, disabled = false) => {
  const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
  cb.checked = checked; cb.disabled = disabled;
  cb.addEventListener('change', () => onChange(cb.checked));
  return el('label', { className: 'check-row' }, cb, el('span', {}, label));
};

/** "Landscape · 1 in = 10 ft · shows 95 × 72 ft of the yard" */
export function printSummary(p: PrintSettings): string {
  const content = printContent(state.shapes, state.bgImage, p.includeBackground, { status: p.statusFilter, phase: p.phaseFilter, showGone: false });
  if (!content.bounds) return 'Add something to the plan first.';
  const l = planLayout(p.paper, p.orientation, content.bounds);
  const ww = Math.round(l.window.maxX - l.window.minX), wh = Math.round(l.window.maxY - l.window.minY);
  // (Which is which, said: "shows 31 × 29 ft" was read both ways, and a landscape sheet showing less width than height
  // looked wrong, its legend taking the side. Round 3, Hank, Kim.)
  return `${l.orientation === 'landscape' ? 'Landscape' : 'Portrait'} · scale ${scaleText(l.ftPerIn)} · the drawing shows ${ww} ft across, ${wh} ft down`;
}

export function renderPrintPanel() {
  const p = state.print;
  const projectName = currentProject()?.name || 'My Garden';
  const body = el('div', { className: 'sheet-body' });

  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Paper'),
    seg((Object.keys(PAPER) as PaperSize[]).map((k) => [k, k === 'letter' ? 'Letter' : k === 'tabloid' ? '11 × 17' : k.toUpperCase()]), p.paper, (v) => set({ paper: v }, true), 'paper')));
  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Orientation'),
    seg([['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], p.orientation, (v) => set({ orientation: v }, true), 'orientation')));
  body.appendChild(el('div', { className: 'measure', 'data-testid': 'print-summary' }, printSummary(p)));

  const title = el('input', { type: 'text', value: p.title, placeholder: projectName, maxLength: 120 }) as HTMLInputElement;
  title.addEventListener('input', () => set({ title: title.value }, false));
  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Title'), title));
  const subtitle = el('input', { type: 'text', value: p.subtitle, placeholder: 'e.g. 123 Main St · Fall 2026 planting', maxLength: 200 }) as HTMLInputElement;
  subtitle.addEventListener('input', () => set({ subtitle: subtitle.value }, false));
  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Subtitle (optional)'), subtitle));

  // Which plants: everything, or one status and/or phase (beds, paths and the house always print).
  if (state.shapes.some((s) => s.status || s.phase)) {
    const st = el('select', { 'data-testid': 'print-status' }) as HTMLSelectElement;
    st.appendChild(el('option', { value: '' }, 'Any status'));
    for (const x of STATUSES.filter((x) => x.key !== 'gone')) st.appendChild(el('option', { value: x.key }, x.label));
    st.value = p.statusFilter === 'gone' ? '' : p.statusFilter;
    st.addEventListener('change', () => set({ statusFilter: st.value as PrintSettings['statusFilter'] }, true));
    const ph = el('select', { 'data-testid': 'print-phase' }) as HTMLSelectElement;
    ph.appendChild(el('option', { value: '' }, 'Any phase'));
    for (const x of state.phases) ph.appendChild(el('option', { value: x }, x));
    ph.value = p.phaseFilter;
    ph.addEventListener('change', () => set({ phaseFilter: ph.value }, true));
    // (Filtered to none: said here, not found on the paper. Round 3, Dana: "Planted", with every plant planned, printed
    // no plants and no list, and nothing said why.)
    const shown = (p.statusFilter || p.phaseFilter)
      ? printContent(state.shapes, null, false, { status: p.statusFilter, phase: p.phaseFilter, showGone: false }).shapes.filter((x) => x.role === 'plant').length : -1;
    body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Plants to show'),
      el('div', { style: { display: 'flex', gap: '8px' } }, st, ph),
      shown === 0 ? el('div', { className: 'hint error', 'data-testid': 'print-none' }, 'No plants on the plan are in this status and phase: none will print.') : null,
      el('div', { className: 'hint' }, 'Beds, paths and buildings print too, unless hidden in Layers or given another phase. Gone plants never do.')));
  }

  const hasBg = !!state.bgImage?.visible;
  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Include'),
    check('Plant list, grouped by bed', p.includePlantList, (v) => set({ includePlantList: v }, true)),
    check('Grid', p.includeGrid, (v) => set({ includeGrid: v }, true)),
    ...(state.sizeMode === 'typical' && state.shapes.some((s) => s.plantId)
      ? [check('Full-size rings around plants', p.includeFullRings, (v) => set({ includeFullRings: v }, true))] : []),
    check(hasBg ? 'Background photo (uses more ink)' : 'Background photo (none shown)', p.includeBackground && hasBg, (v) => set({ includeBackground: v }, true), !hasBg)));

  // North arrow
  const north = el('input', { type: 'number', step: '5', value: p.northDeg }) as HTMLInputElement;
  north.addEventListener('input', () => set({ northDeg: ((Math.round(parseFloat(north.value) || 0) % 360) + 360) % 360 }, false));
  const quick = el('div', { className: 'rot-quick' });
  for (const [deg, label] of [[0, '↑ Up'], [90, '→ Right'], [180, '↓ Down'], [270, '← Left']] as const) {
    const b = el('button', { className: p.northDeg === deg ? 'sel' : '' }, label);
    b.addEventListener('click', () => set({ northDeg: deg }, true));
    quick.appendChild(b);
  }
  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'North points (degrees clockwise from up)'), north, quick,
    el('div', { className: 'hint' }, 'Aerial photos and county GIS images usually have north at the top.')));

  // Create
  const create = el('button', { className: 'btn primary', 'data-testid': 'create-pdf' }, busy ? 'Making the PDF…' : 'Create PDF');
  create.disabled = busy || !printContent(state.shapes, state.bgImage, false).bounds;
  create.addEventListener('click', async () => {
    busy = true; result = null; render();
    try {
      const { buildPlanPdf } = await import('../print-pdf');
      const r = await buildPlanPdf(state.print, projectName, state.shapes, state.bgImage, state.sizeMode);
      result = { blob: r.blob, pages: r.pages, filename: pdfName(state.print.title.trim() || projectName, localDate()), of: printedFrom() };
    } catch (e) {
      void tell("Couldn't make the PDF: " + errMsg(e));
    } finally {
      busy = false;
      if (state.panel === 'print') {
        render();
        // (The result where it can be seen: the bar it's in stays at the bottom of the sheet.)
        document.querySelector('[data-testid=print-result]')?.scrollIntoView({ block: 'nearest' });
      }
    }
  });
  const out = el('div', { 'data-testid': 'print-result', style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  if (result && result.of !== printedFrom()) result = null;
  if (result) {
    const r = result;
    out.appendChild(el('div', { className: 'hint', 'data-testid': 'pdf-ready' }, `Ready: ${r.filename} · ${r.pages} page${r.pages === 1 ? '' : 's'} · ${Math.max(1, Math.round(r.blob.size / 1024))} KB`));
    const row = el('div', { style: { display: 'flex', gap: '8px' } });
    const dl = el('button', { className: 'btn secondary', style: { flex: '1' }, 'data-testid': 'download-pdf' }, 'Download PDF');
    dl.addEventListener('click', () => { downloadBlob(r.filename, r.blob); toast(`Saved ${r.filename} to your Downloads`, 6000); });
    row.appendChild(dl);
    if (canShareFiles('application/pdf', 'x.pdf')) {
      const sh = el('button', { className: 'btn ghost', style: { flex: '1' } }, 'Share…');
      sh.addEventListener('click', async () => {
        try { await shareBlob(r.filename, r.blob); } catch (e) { void tell("Couldn't share: " + errMsg(e)); }
      });
      row.appendChild(sh);
    }
    out.appendChild(row);
  }
  // Create, and what it made, stay at the bottom of the sheet, in view however far the options are scrolled.
  const foot = el('div', { className: 'sheet-foot' }, create, out);

  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Printable plan'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })());
  const sheet = el('div', { className: 'sheet' }, header, body, foot);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}
/** "Back yard-plan-2026-10-25.pdf"; a title already ending in "plan" isn't given another ("My plan-2026-10-25.pdf"). */
export function pdfName(title: string, date: string): string {
  const base = safeFileName(title);
  return `${/(^|[-_ ])plan$/i.test(base) ? base : `${base}-plan`}-${date}.pdf`;
}
