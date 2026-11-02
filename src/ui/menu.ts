import { el, hasKeyboard } from '../dom';
import { canRedo, redo, redoLabel } from '../history';
import { roomyText } from '../text-size';
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
import { openWhatsNew } from './whats-new-panel';
import { CHANNEL } from '../channel';
import { builtOn } from '../whats-new';
import { openPrint } from './print-panel';
import { openWarnings, warningsMenuLabel } from './warnings-sheet';
import { openPlantList } from './plant-list-panel';
import { checkForUpdate, onUpdateWaiting, updateNow, updateWaiting } from '../pwa';

/** Select mode on or off (the lasso button on the top bar). */
export function toggleSelectMode() {
  state.selectMode = !state.selectMode;
  if (state.placing) finishPlacing();
  state.draw = null; state.editPoints = null;
  if (!state.selectMode) clearSelection();
  state.menu = null;
}
export function renderMoreMenu() {
  const items: { icon?: string; label?: string; onClick?: () => void; disabled?: boolean; divider?: boolean; testid?: string; title?: string }[] = [];
  // Redo, at Medium and Large text (the top bar keeps room for the plan's name; Jason, 2026-10-25).
  if (roomyText()) {
    items.push({
      icon: I.redo, label: 'Redo', testid: 'menu-redo', title: redoLabel() ? `Redo: ${redoLabel()}` : undefined,
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
  // Warnings, with how many to look at: a plan tool (Jason approved the mock-ups, Nov 1), not under Settings.
  if (state.shapes.some((s) => s.role === 'plant')) {
    items.push({ icon: I.warn, label: warningsMenuLabel(), testid: 'menu-warnings', onClick: () => openWarnings() });
  }
  // (What to buy, what's planted: also a button on the plan, beside Through the year. Jason, Nov 1, from the UI review.)
  items.push({ icon: I.list, label: 'Plant list', testid: 'menu-plant-list', onClick: () => { openPlantList(); render(); } });
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
    items.push({ icon: I.print, label: 'Print or save as PDF…', onClick: () => { openPrint(); state.menu = null; render(); } });
    items.push({ icon: I.download, label: 'Export image…', onClick: () => { state.panel = 'export'; state.menu = null; render(); } });
  }
  items.push({ divider: true });
  // The plans, and backing them up: the pane the plan's name opens, from here too (Jason, from the UI review,
  // 2026-11-01: people looked for backup in ⋮).
  items.push({ icon: I.folder, label: 'Plans and backup\u2026', testid: 'menu-plans', onClick: () => { state.panel = 'projects'; state.menu = null; render(); } });
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
    items.push({ icon: I.keyboard, label: 'Keyboard shortcuts (?)', onClick: () => { state.panel = 'shortcuts'; state.menu = null; render(); } });
  }
  items.push({
    // (A bin, not the Undo arrow it used to share: round 3, Marcus and Tom read it as Undo.)
    icon: I.trash,
    label: 'Clear all shapes in project',
    onClick: () => { state.panel = 'reset'; state.menu = null; render(); }
  });
  items.push({ divider: true });
  // Every setting in one sheet: text and label size, drawing, and a way to Warnings (Jason, Oct 31, from round 3: Bea
  // found them scattered between Layers and the foot of this menu).
  items.push({ icon: I.settings, label: 'Settings\u2026', testid: 'menu-settings', onClick: () => { state.panel = 'settings'; state.menu = null; render(); } });
  // The guided introduction, any time: from the start, or (left part way) pick up where they left (src/ui/intro-card.ts).
  items.push({
    icon: I.help, label: 'Show me around', testid: 'menu-intro',
    onClick: () => { state.menu = null; showMeAround(); render(); },
  });
  // What changed in each update, newest first (src/whats-new.ts; Jason, Oct 31: for the beta's testers).
  items.push({ icon: I.news, label: 'What\u2019s new', testid: 'menu-whats-new', onClick: openWhatsNew });
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
    const btn = el('button', { className: 'menu-item', ...(it.testid ? { 'data-testid': it.testid } : {}), ...(it.title ? { title: it.title } : {}) });
    btn.innerHTML = it.icon + '<span>' + it.label + '</span>';
    btn.disabled = !!it.disabled;
    btn.addEventListener('click', it.onClick);
    menu.appendChild(btn);
  }
  // The mark leads the version line (it has no text, so the line still reads "Version …"); its own top border divides
  // it from the items (a divider here too made two lines: the bug hunt, Nov 1).
  const version = el('div', { className: 'menu-version', html: MARK_SMALL });
  version.append(el('span', {}, `Version ${__APP_VERSION__}${CHANNEL === 'next' ? ' · Next (preview)' : ''} · ${builtOn()}`), updateCheck());
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
  // (In a box as tall as the room under the top bar, so the menu takes all of it before it scrolls: on a 1366 × 820
  // screen it stopped at 80% of the height, "Check for updates" cut off above empty screen. The bug hunt, Nov 1.)
  const overlay = el('div', { className: 'overlay top' }, el('div', { className: 'menu-wrap' }, menu));
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.menu = null; render(); } });
  return overlay;
}

/**
 * "Check for updates", under the version (Jason, from the UI review, 2026-11-01): asks the app's service worker to look
 * now, not at the next hourly check. A new version found says so and offers Update now, which does what the update
 * banner's Update does (saves, then switches); nothing switches without that tap (CLAUDE.md). None: "You're up to
 * date", for a moment. What it found is kept while the app is open; the line is redrawn in place, not the app.
 */
type CheckSaid = 'idle' | 'checking' | 'ready' | 'none' | 'failed' | 'unavailable' | 'updating';
let checkSaid: CheckSaid = 'idle';
let checkTimer: ReturnType<typeof setTimeout> | null = null;
/** The version line's update check on the page now, to redraw (the menu is drawn afresh with each render). */
let checkShown: (() => void) | null = null;
const repaintCheck = () => checkShown?.();
onUpdateWaiting(repaintCheck); // (found by the hourly check, or this one, while ⋮ is open)
async function runCheck() {
  if (checkTimer) clearTimeout(checkTimer);
  checkSaid = 'checking'; repaintCheck();
  checkSaid = await checkForUpdate();
  repaintCheck();
  if (checkSaid === 'none' || checkSaid === 'unavailable') {
    checkTimer = setTimeout(() => { checkTimer = null; checkSaid = 'idle'; repaintCheck(); }, 4000);
  }
}
function updateCheck(): HTMLElement {
  const box = el('div', { className: 'update-check', 'data-testid': 'update-check', 'aria-live': 'polite', tabindex: '-1' });
  const button = (label: string, testid: string, run: () => void) => {
    const b = el('button', { className: 'link-btn', 'data-testid': testid }, label);
    b.addEventListener('click', run);
    return b;
  };
  const paint = () => {
    if (!box.isConnected && checkShown !== paint) return;
    const said = updateWaiting() && checkSaid !== 'updating' ? 'ready' : checkSaid;
    const focused = box.contains(document.activeElement); // (with a keyboard: kept in the line as it changes)
    box.replaceChildren(...(said === 'idle' ? [button('Check for updates', 'check-updates', () => void runCheck())]
      : said === 'checking' ? [el('span', {}, 'Checking for updates\u2026')]
      : said === 'ready' ? [el('span', {}, 'A new version is ready.'), button('Update now', 'update-now', () => { checkSaid = 'updating'; paint(); void updateNow(); })]
      : said === 'updating' ? [el('span', {}, 'Updating\u2026')]
      : said === 'none' ? [el('span', {}, 'You\u2019re up to date.')]
      : said === 'failed' ? [el('span', {}, 'Couldn\u2019t check just now (no connection?).'), button('Try again', 'check-updates', () => void runCheck())]
      // (No service worker here, a browser that won't run one: each opening of the app is its newest version.)
      : [el('span', {}, 'Nothing to check here: the app opens at its newest version.')]));
    if (focused) (box.querySelector('button') ?? box).focus();
  };
  checkShown = paint;
  paint();
  return box;
}

// ============================================================
