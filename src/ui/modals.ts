import { el } from '../dom';
import { copySvg, doExport } from '../export';
import { I } from '../icons';
import { resetCurrentProject } from '../mutations';
import { state } from '../state';
import { currentProject } from '../storage';
import { render } from './render';

export function renderExportModal() {
  const printBtn = el('button', { className: 'btn primary', 'data-testid': 'printable-plan' }, 'Printable plan (PDF)…');
  printBtn.addEventListener('click', () => { state.panel = 'print'; render(); });
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
      el('div', { style: { fontSize: '14px', color: '#57534e' } }, 'The printable plan is a to-scale sheet with a title, scale bar, north arrow, legend and plant list. PNG and SVG are just the drawing.'),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, printBtn, pngBtn, svgBtn, cancelBtn)
    )
  );
  const overlay = el('div', { className: 'overlay center' }, modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

export function renderPreviewModal() {
  const p = state.exportPreview;
  if (!p) return null;
  const img = el('img', { className: 'preview-img', src: p.dataUrl, alt: 'Export preview' });
  const previewWrap = el('div', { className: 'preview-wrap' }, img);
  const dlLink = el('a', { className: 'dl-link', href: p.dataUrl, download: p.filename, target: '_blank', rel: 'noopener' }, 'Download / Open in new tab');
  const buttons = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, dlLink);
  if (p.format === 'svg') {
    const copyBtn = el('button', { className: 'btn ghost' }, 'Copy SVG text to clipboard');
    copyBtn.addEventListener('click', copySvg);
    buttons.appendChild(copyBtn);
  }
  const doneBtn = el('button', { className: 'btn ghost' }, 'Done');
  doneBtn.addEventListener('click', () => { state.panel = null; state.exportPreview = null; render(); });
  buttons.appendChild(doneBtn);
  const body = el('div', { className: 'sheet-body' },
    el('div', { style: { fontSize: '13px', color: '#57534e', lineHeight: '1.5' } },
      el('b', {}, 'On phone:'), ' long-press the image, then choose "Save to Photos" or "Download Image."',
      el('br'), el('br'),
      el('b', {}, 'On desktop:'), ' right-click the image and choose "Save image as...", or tap the Download button.'),
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
  confirmBtn.addEventListener('click', () => { resetCurrentProject(); render(); });
  const modal = el('div', { className: 'modal' },
    el('div', { className: 'sheet-body' },
      el('div', { style: { fontWeight: 600, color: '#292524', marginBottom: '8px' } }, 'Clear this project?'),
      el('div', { style: { fontSize: '14px', color: '#57534e', marginBottom: '16px' } },
        'This will delete all ' + state.shapes.length + ' shapes from "' + (currentProject()?.name || 'this project') + "\". You can undo immediately after if it's a mistake."),
      el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, cancelBtn, confirmBtn)
    )
  );
  const overlay = el('div', { className: 'overlay center' }, modal);
  return overlay;
}
