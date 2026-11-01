import { canShareFiles, shareBlob } from '../backup';
import { el, hasKeyboard, ts } from '../dom';
import { copySvg, doExport } from '../export';
import { I } from '../icons';
import { resetCurrentProject } from '../mutations';
import { state } from '../state';
import { currentProject } from '../storage';
import type { ExportPreview } from '../types';
import { errMsg } from '../util';
import { tell } from './ask';
import { undoNotice } from './delete-selected';
import { render } from './render';
import { openPrint } from './print-panel';
import { toast } from './toast';

export function renderExportModal() {
  const printBtn = el('button', { className: 'btn primary', 'data-testid': 'printable-plan' }, 'Printable plan (PDF)…');
  printBtn.addEventListener('click', () => { openPrint(); render(); });
  const pngBtn = el('button', { className: 'btn secondary' }, 'Download PNG');
  pngBtn.addEventListener('click', () => doExport('png'));
  const svgBtn = el('button', { className: 'btn secondary' }, 'Download SVG');
  svgBtn.addEventListener('click', () => doExport('svg'));
  const cancelBtn = el('button', { className: 'btn ghost' }, 'Cancel');
  cancelBtn.addEventListener('click', () => { state.panel = null; render(); });
  const modal = el('div', { className: 'modal' },
    el('div', { className: 'sheet-header' },
      el('div', { className: 'title' }, 'Export plan'),
      (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
    ),
    el('div', { className: 'sheet-body' },
      el('div', { style: { fontSize: ts(14), color: '#57534e' } }, 'The printable plan is a to-scale sheet with a title, scale bar, north arrow, legend and plant list. PNG and SVG are just the drawing.'),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, printBtn, pngBtn, svgBtn, cancelBtn)
    )
  );
  const overlay = el('div', { className: 'overlay center' }, modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

/** The picture as a file's contents: the SVG's text, or the PNG's bytes from its data: address. */
function pictureBlob(p: ExportPreview, type: string): Blob {
  if (p.format === 'svg') return new Blob([p.svgText], { type });
  const bin = atob(p.dataUrl.slice(p.dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
export function renderPreviewModal() {
  const p = state.exportPreview;
  if (!p) return null;
  const img = el('img', { className: 'preview-img', src: p.dataUrl, alt: 'Export preview' });
  const previewWrap = el('div', { className: 'preview-wrap' }, img);
  // Download, and Share… where the phone can hand a picture to an app, as the PDF has them, in its words (the UI
  // review, 2026-11-01: it said "Save to Photos", an iPhone's words, and had no Share).
  const kind = p.format.toUpperCase();
  const dlLink = el('a', { className: 'dl-link', style: { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }, href: p.dataUrl, download: p.filename, target: '_blank', rel: 'noopener', 'data-testid': 'download-picture' }, `Download ${kind}`);
  dlLink.addEventListener('click', () => toast(`Saved ${p.filename} to your Downloads`, 6000));
  const row = el('div', { style: { display: 'flex', gap: '8px' } }, dlLink);
  const type = p.format === 'svg' ? 'image/svg+xml' : 'image/png';
  const canShare = canShareFiles(type, 'x.' + p.format);
  if (canShare) {
    const sh = el('button', { className: 'btn ghost', style: { flex: '1' }, 'data-testid': 'share-picture' }, 'Share…');
    sh.addEventListener('click', async () => {
      try { await shareBlob(p.filename, pictureBlob(p, type)); } catch (e) { void tell("Couldn't share: " + errMsg(e)); }
    });
    row.appendChild(sh);
  }
  const buttons = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, row);
  if (p.format === 'svg') {
    const copyBtn = el('button', { className: 'btn ghost' }, 'Copy SVG text to clipboard');
    copyBtn.addEventListener('click', copySvg);
    buttons.appendChild(copyBtn);
  }
  const doneBtn = el('button', { className: 'btn ghost' }, 'Done');
  doneBtn.addEventListener('click', () => { state.panel = null; state.exportPreview = null; render(); });
  buttons.appendChild(doneBtn);
  const body = el('div', { className: 'sheet-body' },
    el('div', { style: { fontSize: ts(13), color: '#57534e', lineHeight: '1.5' } },
      // (The one that applies here: a laptop was told "On phone: long-press the image". Round 3, Jordan.)
      hasKeyboard() ? `Click Download ${kind}, or right-click the picture and choose “Save image as…”.`
        : `Tap Download ${kind} to save it to your Downloads` + (canShare ? ', or Share… to send it to an app.' : '.')),
    previewWrap,
    buttons
  );
  if (p.format === 'svg') {
    const ta = el('textarea', { readonly: true }, p.svgText);
    ta.addEventListener('click', e => (e.target as HTMLTextAreaElement).select());
    body.appendChild(el('details', {},
      el('summary', {}, 'Backup: show SVG text (select all, copy)'),
      ta
    ));
  }
  const modal = el('div', { className: 'modal' },
    el('div', { className: 'sheet-header' },
      el('div', { className: 'title' }, 'Save your plan (' + p.format.toUpperCase() + ')'),
      (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', () => { state.panel = null; state.exportPreview = null; render(); }); return b; })()
    ),
    body
  );
  const overlay = el('div', { className: 'overlay center', style: { zIndex: 40 } }, modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; state.exportPreview = null; render(); } });
  return overlay;
}

export function renderResetModal() {
  const cancelBtn = el('button', { className: 'btn ghost' }, 'Cancel');
  cancelBtn.addEventListener('click', () => { state.panel = null; render(); });
  const confirmBtn = el('button', { className: 'btn danger-solid' }, 'Clear all');
  confirmBtn.addEventListener('click', () => {
    const n = state.shapes.length;
    resetCurrentProject(); render();
    undoNotice(`Cleared ${n} shape${n === 1 ? '' : 's'}`);
  });
  const modal = el('div', { className: 'modal' },
    el('div', { className: 'sheet-body' },
      el('div', { style: { fontWeight: 600, color: '#292524', marginBottom: '8px' } }, 'Clear this project?'),
      el('div', { style: { fontSize: ts(14), color: '#57534e', marginBottom: '16px' } },
        // (Said as it is: the background photo goes too; what it took is kept to bring back. Sam, Oct 30.)
        `This will delete all ${state.shapes.length} shape${state.shapes.length === 1 ? '' : 's'} from \u201c${currentProject()?.name || 'this project'}\u201d${state.bgImage ? ', and its background photo' : ''}. ` +
        "If it's a mistake, Undo brings them back, and so does the empty plan (after a reload too), until you draw something new."),
      el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, cancelBtn, confirmBtn)
    )
  );
  const overlay = el('div', { className: 'overlay center' }, modal);
  return overlay;
}
