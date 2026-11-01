// Settings: every setting in one sheet, from ⋮ (Jason, Oct 31, from round 3: Bea found them scattered, zoom buttons
// and drawing in Layers, text size at the foot of ⋮). Text size and the plan's label size; drawing (snap, square, zoom
// buttons): this device's own. Warnings moved to a sheet of their own on Nov 1, a plan tool (src/ui/warnings-sheet.ts):
// one row here goes there. Layers keeps the plan's own view: background, layers shown and locked, plant size, which
// plants show, the shapes.

import { el, ts } from '../dom';
import { I } from '../icons';
import { LABEL_SIZES, labelSize, setLabelSize } from '../label-size';
import { centerOnShape, setRoleView, setViewFilter } from '../mutations';
import { roleHidden, roleKey } from '../roles';
import { state } from '../state';
import { passesFilter } from '../status';
import { setSnapOn, setSquareOn, snapOn, squareOn } from '../tidy';
import { setTextSize, textSize, TEXT_SIZES } from '../text-size';
import { setZoomButtons } from '../view-settings';
import { render } from './render';
import { openWarnings } from './warnings-sheet';

export function renderSettingsPanel() {
  const close = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  close.addEventListener('click', () => { state.panel = null; render(); });
  const header = el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, 'Settings'), close);
  const body = el('div', { 'data-testid': 'settings' }, textSection(), drawingSection(), warningsRow(),
    el('div', { className: 'hint', style: { padding: '10px 16px 16px' } },
      'Text and Drawing are this device’s own: a phone and a computer can differ. What Warnings checks (and what’s dismissed) goes with the plan, on all your devices.'));
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

/** A label size's mark: a plant's green circle with an A in it, at that size (Jason's idea). */
function labelMark(scale: number): string {
  const r = Math.round(11 * scale), size = 2 * r + 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="#bbf7d0" stroke="#15803d" stroke-width="1.5"/>` +
    `<text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(13 * scale)}" font-weight="700" fill="#14532d">A</text></svg>`;
}

/** Text size (the app's) and label size (the plan's names), two settings (Jason, Oct 31). */
function textSection(): HTMLElement {
  const wrap = el('div', { className: 'role-rows', 'data-testid': 'text-settings' }, el('div', { className: 'section-label' }, 'Text'));
  // Text size: four A's, each at its size. A change shows at once.
  const seg = el('div', { className: 'seg', role: 'group', 'aria-label': 'Text size' });
  for (const s of TEXT_SIZES) {
    const b = el('button', { 'aria-pressed': String(textSize() === s.key), 'aria-label': s.name, title: s.name, 'data-testid': `text-size-${s.key}`, style: { fontSize: `${14 * s.scale}px` } }, 'A');
    b.addEventListener('click', () => { setTextSize(s.key); render(); });
    seg.appendChild(b);
  }
  wrap.appendChild(el('div', { className: 'text-size-row', 'data-testid': 'text-size' }, el('span', {}, 'Text size'), seg));
  // The plan's names: three green circles, each with its A at that size.
  const labels = el('div', { className: 'seg label-seg', role: 'group', 'aria-label': 'Label size on the plan' });
  for (const s of LABEL_SIZES) {
    const b = el('button', { 'aria-pressed': String(labelSize() === s.key), 'aria-label': `${s.name} labels`, title: `${s.name} labels`, 'data-testid': `label-size-${s.key}`, html: labelMark(s.scale) });
    b.addEventListener('click', () => { setLabelSize(s.key); render(); });
    labels.appendChild(b);
  }
  wrap.appendChild(el('div', { className: 'text-size-row', 'data-testid': 'label-size' }, el('span', {}, 'Names on the plan'), labels));
  wrap.appendChild(el('div', { className: 'hint' },
    'Text size is the app’s menus and sheets. Names on the plan are sized apart: bigger names fit inside fewer plants, so more show only when selected or zoomed in.'));
  return wrap;
}

/** Drawing: tidying what's drawn (src/tidy.ts), and the zoom buttons. */
function drawingSection(): HTMLElement {
  const wrap = el('div', { className: 'role-rows', 'data-testid': 'drawing-settings' }, el('div', { className: 'section-label' }, 'Drawing'));
  const check = (testid: string, on: boolean, set: (v: boolean) => void, text: string) => {
    const box = el('input', { type: 'checkbox', 'data-testid': testid }) as HTMLInputElement;
    box.checked = on;
    box.addEventListener('change', () => set(box.checked));
    wrap.appendChild(el('label', { className: 'check-row' }, box, el('span', {}, text)));
  };
  check('snap-drawing', snapOn(), setSnapOn, 'Snap to nearby edges and corners');
  check('square-drawing', squareOn(), setSquareOn, 'Square nearly-square outlines');
  // The + and − buttons: off on a phone to start (a pinch zooms), for zooming with one finger (src/view-settings.ts).
  check('zoom-buttons', state.zoomButtons, (v) => { setZoomButtons(v); render(); }, 'Zoom buttons (+ and −), to zoom with one finger');
  wrap.appendChild(el('div', { className: 'hint' },
    'A snapped point lights up the edge it\'s on, with an Unsnap; squaring says so after, with an Undo.'));
  return wrap;
}

/**
 * Warnings: since Nov 1 a plan tool of its own (src/ui/warnings-sheet.ts; Jason approved the mock-ups), opened from the
 * plan. Settings keeps one row to it.
 */
function warningsRow(): HTMLElement {
  const b = el('button', { className: 'settings-go', 'data-testid': 'settings-warnings' }, el('span', {}, 'Warnings: what\u2019s checked'), el('span', { 'aria-hidden': 'true' }, '\u2192'));
  b.addEventListener('click', () => openWarnings());
  return el('div', { className: 'role-rows' }, b);
}

/**
 * Select these shapes on the plan and bring the first into view, showing any a layer or the plants shown hid; the
 * sheet closes (a row of what's in bloom, src/ui/year-bar.ts, where the month stays).
 */
export function showOnPlan(ids: string[]) {
  const shapes = ids.map((id) => state.shapes.find((s) => s.id === id)).filter((s) => !!s);
  if (!shapes.length) return;
  for (const s of shapes) {
    if (roleHidden(s)) setRoleView(roleKey(s), { hidden: false });
    if (!passesFilter(s, state.viewFilter)) setViewFilter({ status: '', phase: '', showGone: s.status === 'gone' });
  }
  state.selectedIds = shapes.map((s) => s.id);
  centerOnShape(shapes[0].id);
  state.panel = null;
  render();
}

/** A line in Layers where these used to be: to Settings. */
export function settingsLink(): HTMLElement {
  const b = el('button', { className: 'link-btn', 'data-testid': 'layers-settings', style: { fontSize: ts(14) } }, 'Text size, drawing and warnings: Settings…');
  b.addEventListener('click', () => { state.panel = 'settings'; render(); });
  return el('div', { className: 'role-rows' }, b);
}
