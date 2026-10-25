import { recentKinds, startKind } from '../draw';
import { el } from '../dom';
import { I } from '../icons';
import { KIND_GROUPS, KINDS, kindDef, type KindDef, type Method } from '../kinds';
import { state } from '../state';
import { render } from './render';

// The Add sheet (everything the bottom bar doesn't name), the pictures that
// show how each drawing method is tapped, and the keyboard shortcuts list.

/** "Bed (B)" on devices with a keyboard; just "Bed" in labels. */
export function withKey(kind: KindDef): string {
  return kind.shortcut ? `${kind.label} (${kind.shortcut.toUpperCase()})` : kind.label;
}

function closeX(onClose: () => void): HTMLElement {
  const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  b.addEventListener('click', onClose);
  return b;
}
function pick(kind: KindDef) {
  startKind(kind.key);
  render();
}
function kindChip(kind: KindDef): HTMLElement {
  const b = el('button', { className: 'kind-chip', title: withKey(kind), 'data-kind': kind.key }, kind.label);
  b.addEventListener('click', () => pick(kind));
  return b;
}

export function renderAddSheet(): HTMLElement {
  const close = () => { state.panel = null; render(); };
  const body = el('div', { className: 'sheet-body add-sheet' });
  // Until the plan has one: tracing over a photo is the easiest way to get the yard right.
  if (!state.bgImage) {
    const photo = el('button', { className: 'add-photo-row', 'data-testid': 'add-photo', html: I.image + '<span><b>Aerial photo</b><br>A satellite or drone photo of your yard to trace over</span>' });
    photo.addEventListener('click', () => { state.panel = 'bg'; render(); });
    body.appendChild(photo);
  }
  const recent = recentKinds();
  if (recent.length) {
    body.appendChild(el('div', { className: 'kind-group' },
      el('div', { className: 'kind-group-name' }, 'Recent'),
      el('div', { className: 'kind-chips', 'data-testid': 'recent-kinds' }, ...recent.map((k) => kindChip(kindDef(k))))));
  }
  for (const group of KIND_GROUPS) {
    body.appendChild(el('div', { className: 'kind-group' },
      el('div', { className: 'kind-group-name' }, group),
      el('div', { className: 'kind-chips' }, ...KINDS.filter((k) => k.group === group).map(kindChip))));
  }
  const sheet = el('div', { className: 'sheet', 'data-testid': 'add-sheet' },
    el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, 'Add to the plan'), closeX(close)),
    body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return overlay;
}

// ---------- Method pictures: tap points as dots, joined in tapping order ----------
const DOT = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="2.6" class="m-dot"/>`;
const STROKE = (pts: [number, number][]) => `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" class="m-stroke"/>`;
const SHAPE = (inner: string) => inner.replace(/^<(\w+)/, '<$1 class="m-shape"');
/** A small picture of a drawing method: the shape faintly, its taps as dots, strokes between them in order. */
export function methodIcon(m: Method): string {
  let body = '';
  switch (m) {
    case 'poly': {
      const p: [number, number][] = [[6, 8], [22, 4], [31, 13], [24, 21], [8, 19]];
      body = SHAPE(`<polygon points="${p.map((q) => q.join(',')).join(' ')}"/>`) + STROKE(p) + p.map(([x, y]) => DOT(x, y)).join('');
      break;
    }
    case 'rect': {
      // Tilted, like a house traced from a photo: corner, next corner, then the far side.
      const a: [number, number] = [6, 13], b: [number, number] = [21, 4], c: [number, number] = [30, 14], d: [number, number] = [15, 23];
      body = SHAPE(`<polygon points="${[a, b, c, d].map((q) => q.join(',')).join(' ')}"/>`) + STROKE([a, b, c]) + DOT(...a) + DOT(...b) + DOT(...c);
      break;
    }
    case 'circle': // one edge, then the opposite edge
      body = SHAPE('<circle cx="18" cy="12" r="10"/>') + STROKE([[8, 12], [28, 12]]) + DOT(8, 12) + DOT(28, 12);
      break;
    case 'trunk': // the trunk, then the canopy's edge
      body = SHAPE('<circle cx="18" cy="12" r="10"/>') + STROKE([[18, 12], [28, 12]]) + '<circle cx="18" cy="12" r="3" class="m-trunk"/>' + DOT(28, 12);
      break;
    case 'canopy': { // the trunk, then around the edge
      const p: [number, number][] = [[9, 6], [22, 3], [30, 12], [25, 21], [10, 19]];
      body = SHAPE(`<polygon points="${p.map((q) => q.join(',')).join(' ')}"/>`) + STROKE(p) + '<circle cx="18" cy="12" r="3" class="m-trunk"/>' + p.map(([x, y]) => DOT(x, y)).join('');
      break;
    }
    case 'oval':
      body = SHAPE('<ellipse cx="18" cy="12" rx="14" ry="8"/>') + STROKE([[4, 12], [32, 12]]) + STROKE([[18, 12], [18, 4]]) + DOT(4, 12) + DOT(32, 12) + DOT(18, 4);
      break;
    case 'triangle': {
      const p: [number, number][] = [[6, 20], [18, 4], [30, 20]];
      body = SHAPE(`<polygon points="${p.map((q) => q.join(',')).join(' ')}"/>`) + STROKE(p) + p.map(([x, y]) => DOT(x, y)).join('');
      break;
    }
    case 'line': {
      const p: [number, number][] = [[4, 18], [14, 8], [24, 14], [32, 5]];
      body = STROKE(p) + p.map(([x, y]) => DOT(x, y)).join('');
      break;
    }
    case 'path': {
      const p: [number, number][] = [[4, 20], [14, 10], [24, 13], [32, 4]];
      body = `<polyline points="${p.map((q) => q.join(',')).join(' ')}" class="m-band"/>` + STROKE(p) + p.map(([x, y]) => DOT(x, y)).join('');
      break;
    }
    case 'note':
      body = '<text x="18" y="16" text-anchor="middle" class="m-text">Aa</text>' + DOT(8, 12);
      break;
  }
  return `<svg class="method-icon" viewBox="0 0 36 24" aria-hidden="true">${body}</svg>`;
}

// ---------- Keyboard shortcuts ----------
export const OTHER_SHORTCUTS: [string, string][] = [
  ['A', 'Open the Add sheet'],
  ['Enter', 'Finish drawing'],
  ['Esc', 'Done placing or drawing, close the picker, or clear the selection'],
  ['Shift / Ctrl + click', 'Add to the selection, or take out (drag: add what a box touches)'],
  ['Delete', 'Delete what is selected'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copy / paste / duplicate'],
  ['?', 'Show this list'],
];
export function renderShortcutsPanel(): HTMLElement {
  const close = () => { state.panel = null; render(); };
  const rows = [
    ...KINDS.filter((k) => k.shortcut).map((k) => [k.shortcut!.toUpperCase(), 'Add: ' + k.label] as [string, string]),
    ...OTHER_SHORTCUTS,
  ];
  const table = el('div', { className: 'shortcut-list' },
    ...rows.map(([key, what]) => el('div', { className: 'shortcut-row' }, el('kbd', {}, key), el('span', {}, what))));
  const sheet = el('div', { className: 'sheet', 'data-testid': 'shortcuts' },
    el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, 'Keyboard shortcuts'), closeX(close)),
    el('div', { className: 'sheet-body' }, table));
  const overlay = el('div', { className: 'overlay center' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return overlay;
}
