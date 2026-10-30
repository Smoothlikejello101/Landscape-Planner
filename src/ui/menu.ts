import { el, hasKeyboard } from '../dom';
import { canRedo, redo } from '../history';
import { roomyText, setTextSize, textSize, TEXT_SIZES } from '../text-size';
import { dismissToastAction } from './toast';
import { I } from '../icons';
import { paste } from '../mutations';
import { clearSelection } from '../selection';
import { state } from '../state';
import { finishPlacing } from '../place';
import { currentProject, getClipboard } from '../storage';
import { render } from './render';
import { openLocation } from './location-panel';
import { openFeedback } from './feedback-sheet';
import { MARK_SMALL } from '../brand';
import { showMeAround } from './intro-card';

/** Select mode on or off (the lasso button on the top bar). */
export function toggleSelectMode() {
  state.selectMode = !state.selectMode;
  if (state.placing) finishPlacing();
  state.draw = null; state.editPoints = null;
  if (!state.selectMode) clearSelection();
  state.menu = null;
}
export function renderMoreMenu() {
  const items: { icon?: string; label?: string; onClick?: () => void; disabled?: boolean; divider?: boolean; testid?: string }[] = [];
  // Redo, at Medium and Large text (the top bar keeps room for the plan's name; Jason, 2026-10-25).
  if (roomyText()) {
    items.push({
      icon: I.redo, label: 'Redo', testid: 'menu-redo',
      disabled: !canRedo() || !!state.draw || !!state.placing || !!state.featurePlace,
      onClick: () => { dismissToastAction(); redo(); state.menu = null; render(); },
    });
  }
  // Paste (if clipboard has data)
  const clip = getClipboard();
  if (clip && clip.shapes && clip.shapes.length) {
    items.push({
      icon: I.paste,
      label: 'Paste ' + clip.shapes.length + ' shape' + (clip.shapes.length !== 1 ? 's' : ''),
      onClick: () => { paste(); state.menu = null; render(); }
    });
  }
  items.push({ divider: true });
  items.push({
    icon: I.leaf,
    label: 'Bloom calendar',
    onClick: () => { state.panel = 'bloom'; state.menu = null; render(); }
  });
  items.push({
    icon: I.pin,
    label: state.location ? `Garden location (zone ${state.location.zone})…` : 'Garden location…',
    onClick: () => { state.menu = null; openLocation(); }
  });
  items.push({
    icon: I.image,
    label: state.bgImage ? 'Background image…' : 'Add background image…',
    onClick: () => { state.panel = 'bg'; state.menu = null; render(); }
  });
  if (state.shapes.length) {
    // (Its own item: people look for "print", not for it under Export.)
    items.push({ icon: I.print, label: 'Print or save as PDF…', onClick: () => { state.panel = 'print'; state.menu = null; render(); } });
    items.push({ icon: I.download, label: 'Export image…', onClick: () => { state.panel = 'export'; state.menu = null; render(); } });
  }
  items.push({ divider: true });
  items.push({
    icon: I.edit,
    label: 'Rename current project',
    onClick: () => {
      state.panelArgs = { renamingId: state.currentProjectId, originalName: currentProject()?.name || '', returnTo: null };
      state.panel = 'rename';
      state.menu = null;
      render();
    }
  });
  // Only where there's a keyboard (a laptop or desktop).
  if (hasKeyboard()) {
    items.push({ icon: I.text, label: 'Keyboard shortcuts (?)', onClick: () => { state.panel = 'shortcuts'; state.menu = null; render(); } });
  }
  items.push({
    icon: I.reset,
    label: 'Clear all shapes in project',
    onClick: () => { state.panel = 'reset'; state.menu = null; render(); }
  });
  items.push({ divider: true });
  // The guided introduction, any time: from the start, or (left part way) pick up where they left (src/ui/intro-card.ts).
  items.push({
    icon: I.leaf, label: 'Show me around', testid: 'menu-intro',
    onClick: () => { state.menu = null; showMeAround(); render(); },
  });
  items.push({
    icon: I.mail,
    label: 'Send feedback',
    // A sheet: write to us (the person's own mail app opens, with the version and kind of device filled in:
    // src/feedback.ts), or save a support file to attach (src/ui/feedback-sheet.ts).
    onClick: () => openFeedback(),
  });
  const menu = el('div', { className: 'menu' });
  for (const it of items) {
    if (!it.onClick) { menu.appendChild(el('div', { className: 'menu-divider' })); continue; }
    const btn = el('button', { className: 'menu-item', ...(it.testid ? { 'data-testid': it.testid } : {}) });
    btn.innerHTML = it.icon + '<span>' + it.label + '</span>';
    btn.disabled = !!it.disabled;
    btn.addEventListener('click', it.onClick);
    menu.appendChild(btn);
  }
  // Text size: four A's, each at its size. A change shows at once; the menu stays open to try another.
  const seg = el('div', { className: 'seg', role: 'group', 'aria-label': 'Text size' });
  for (const s of TEXT_SIZES) {
    const b = el('button', { 'aria-pressed': String(textSize() === s.key), 'aria-label': s.name, title: s.name, 'data-testid': `text-size-${s.key}`, style: { fontSize: `${14 * s.scale}px` } }, 'A');
    b.addEventListener('click', () => { setTextSize(s.key); render(); });
    seg.appendChild(b);
  }
  menu.appendChild(el('div', { className: 'menu-divider' }));
  menu.appendChild(el('div', { className: 'text-size-row', 'data-testid': 'text-size' }, el('span', {}, 'Text size'), seg));
  // The mark leads the version line (it has no text, so the line still reads "Version …").
  const version = el('div', { className: 'menu-version', html: MARK_SMALL });
  version.append(`Version ${__APP_VERSION__} · ${__BUILD_TIME__}`);
  menu.appendChild(version);
  // (Up and down step through its items, as a menu's do; Home and End go to the ends.)
  menu.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled), .menu button:not(:disabled)')];
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[to].focus();
  });
  const overlay = el('div', { className: 'overlay top' }, el('div', { style: { paddingRight: '8px', paddingTop: '4px' } }, menu));
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.menu = null; render(); } });
  return overlay;
}

// ============================================================
