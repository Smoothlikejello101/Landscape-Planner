import { el } from '../dom';
import { I } from '../icons';
import { paste } from '../mutations';
import { clearSelection } from '../selection';
import { state } from '../state';
import { finishPlacing } from '../place';
import { currentProject, getClipboard } from '../storage';
import { render } from './render';
import { openLocation } from './location-panel';
import { FEEDBACK_ADDRESS, feedbackLink } from '../feedback';
import { toast } from './toast';
import { deviceName } from '../sync/sync';

/** Select mode on or off (the lasso button on the top bar). */
export function toggleSelectMode() {
  state.selectMode = !state.selectMode;
  if (state.placing) finishPlacing();
  state.draw = null; state.editPoints = null;
  if (!state.selectMode) clearSelection();
  state.menu = null;
}
export function renderMoreMenu() {
  const items = [];
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
  if (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
    items.push({ icon: I.text, label: 'Keyboard shortcuts (?)', onClick: () => { state.panel = 'shortcuts'; state.menu = null; render(); } });
  }
  items.push({
    icon: I.reset,
    label: 'Clear all shapes in project',
    onClick: () => { state.panel = 'reset'; state.menu = null; render(); }
  });
  items.push({ divider: true });
  items.push({
    icon: I.mail,
    label: 'Send feedback',
    // The person's own mail app opens, with the version and kind of device filled in (src/feedback.ts).
    onClick: () => {
      state.menu = null; render();
      el('a', { href: feedbackLink(__APP_VERSION__, deviceName()) }).click();
      // Where no mail app is set up, nothing opens: the address, to write from anywhere.
      toast(`Opening your email app. If nothing opens, write to ${FEEDBACK_ADDRESS}.`, 8000);
    }
  });
  const menu = el('div', { className: 'menu' });
  for (const it of items) {
    if (!it.onClick) { menu.appendChild(el('div', { className: 'menu-divider' })); continue; }
    const btn = el('button', { className: 'menu-item' });
    btn.innerHTML = it.icon + '<span>' + it.label + '</span>';
    btn.addEventListener('click', it.onClick);
    menu.appendChild(btn);
  }
  menu.appendChild(el('div', { className: 'menu-version' }, `Version ${__APP_VERSION__} · ${__BUILD_TIME__}`));
  const overlay = el('div', { className: 'overlay top' }, el('div', { style: { paddingRight: '8px', paddingTop: '4px' } }, menu));
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.menu = null; render(); } });
  return overlay;
}

// ============================================================
