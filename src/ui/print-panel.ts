import { canShareFiles, downloadBlob, safeFileName, shareBlob } from '../backup';
import { el } from '../dom';
import { I } from '../icons';
import { PAPER, planLayout, printContent, scaleText } from '../print';
import { state } from '../state';
import { currentProject, save } from '../storage';
import type { PaperSize, PrintSettings } from '../types';
import { errMsg } from '../util';
import { render } from './render';
import { toast } from './toast';

// Printable plan options and the Create PDF button.
// Text and number fields update settings without re-rendering (Android
// keyboard safety); buttons and checkboxes re-render.

let result: { blob: Blob; filename: string; pages: number } | null = null;
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
  const content = printContent(state.shapes, state.bgImage, p.includeBackground);
  if (!content.bounds) return 'Add something to the plan first.';
  const l = planLayout(p.paper, p.orientation, content.bounds);
  const ww = Math.round(l.window.maxX - l.window.minX), wh = Math.round(l.window.maxY - l.window.minY);
  return `${l.orientation === 'landscape' ? 'Landscape' : 'Portrait'} · scale ${scaleText(l.ftPerIn)} · the sheet shows ${ww} × ${wh} ft`;
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
      result = { blob: r.blob, pages: r.pages, filename: `${safeFileName(state.print.title.trim() || projectName)}-plan-${localDate()}.pdf` };
    } catch (e) {
      alert("Couldn't make the PDF: " + errMsg(e));
    } finally {
      busy = false;
      if (state.panel === 'print') render();
    }
  });
  body.appendChild(create);

  const out = el('div', { 'data-testid': 'print-result', style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  if (result) {
    const r = result;
    out.appendChild(el('div', { className: 'hint' }, `${r.filename} · ${r.pages} page${r.pages === 1 ? '' : 's'} · ${Math.max(1, Math.round(r.blob.size / 1024))} KB`));
    const dl = el('button', { className: 'btn secondary', 'data-testid': 'download-pdf' }, 'Download PDF');
    dl.addEventListener('click', () => { downloadBlob(r.filename, r.blob); toast('Saved ' + r.filename); });
    out.appendChild(dl);
    if (canShareFiles('application/pdf', 'x.pdf')) {
      const sh = el('button', { className: 'btn ghost' }, 'Share…');
      sh.addEventListener('click', async () => {
        try { await shareBlob(r.filename, r.blob); } catch (e) { alert("Couldn't share: " + errMsg(e)); }
      });
      out.appendChild(sh);
    }
  }
  body.appendChild(out);

  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Printable plan'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })());
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}
