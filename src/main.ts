import './styles.css';
import { resizeCanvas } from './canvas';
import { fitAboveKeyboard } from './keyboard';
import { cancelGestures, onCanvasPointerMove, onCanvasPointerUp } from './gestures';
import { pushHistory, redo, undo } from './history';
import { copySelected, duplicateSelected, nudgeSelected, paste, selectAllShown, zoomBy } from './mutations';
import { cutSelected, deleteSelectedAsking } from './ui/delete-selected';
import { clearSelection } from './selection';
import { canFinishDraw, finishDraw, startKind } from './draw';
import { kindForShortcut } from './kinds';
import { finishPlacing, undoPlace } from './place';
import { state } from './state';
import { loadPlants } from './plants';
import { loadWild } from './wild';
import { initAccount, restoreCodeSent, setAccountListener } from './account';
import { onAccountChange, setSyncUi, startSyncTriggers } from './sync/sync';
import { refreshAfterSync, screenBusy, showSyncResults } from './ui/sync-results';
import { refreshAccountSection } from './ui/account-section';
import { loadMyPlants } from './my-plants';
import { setupServiceWorker } from './pwa';
import { buildEmergencyBackup, downloadText } from './backup';
import { notePageZoom } from './page-zoom';
import { loadViewSettings } from './view-settings';
import { applyTextSize } from './text-size';
import { updateSaveWarning, updateSaveState } from './ui/save-warning';
import { flushSave, initStorage, refreshClipboard, requestPersistence, save, setSaveStateListener, setSaveStatusListener, StorageUnavailableError, writeJournalIfDirty } from './storage';
import { flashZoom, render } from './ui/render';
import { dismissToastAction, toast } from './ui/toast';
import { noteVisit } from './hints';
import { pxPerFoot } from './geometry';

// The page at this device's text size, before anything is drawn (src/text-size.ts).
applyTextSize();

// ============================================================
// EVENT LISTENERS
// ============================================================
// IMPORTANT: window resize calls resizeCanvas ONLY, never render().
// Android keyboard appearing fires a viewport resize; a full render()
// destroys focused inputs.
window.addEventListener('resize', () => { fitAboveKeyboard(); resizeCanvas(); });
// Same goes for visualViewport resize (covers iOS keyboard + zoom)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => { fitAboveKeyboard(); resizeCanvas(); notePageZoom(); });
  // iOS pans the visual viewport (scroll, not resize) after its keyboard opens: re-measure (CSS only).
  window.visualViewport.addEventListener('scroll', () => { fitAboveKeyboard(); });
}
// With the keyboard open, the field being typed in is scrolled into view
// (its sheet has just become shorter). Scrolling only: nothing re-renders.
document.addEventListener('focusin', (e) => {
  const t = e.target as HTMLElement | null;
  if (!t || !t.matches('input, textarea, select') || !t.closest('.sheet, .modal')) return;
  setTimeout(() => { if (document.activeElement === t) t.scrollIntoView({ block: 'nearest' }); }, 350);
});

// Pointer moves and releases are watched on the whole window, not just the
// canvas: a finger lifted over the toolbar must still end the gesture, or a
// stale pointer makes the next touch look like a second finger (pinch).
window.addEventListener('pointermove', onCanvasPointerMove, { passive: false });
window.addEventListener('pointerup', onCanvasPointerUp);
window.addEventListener('pointercancel', onCanvasPointerUp);
window.addEventListener('blur', cancelGestures);

// Keyboard shortcuts (helpful on desktop, harmless on phone)
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') escPressed = true; onKey(e); });
// Esc whose press never reached the page: an extension took it (PhotoShow closes its viewer with Esc, and takes the
// key even with none open; Jason, 2026-10-25). Its release may still come through: act on that, once.
let escPressed = false;
window.addEventListener('blur', () => { escPressed = false; }); // (a press whose release went elsewhere)
window.addEventListener('keyup', (e) => {
  if (e.key !== 'Escape') return;
  if (escPressed) { escPressed = false; return; }
  onKey(e);
});
/** The arrow keys' directions. */
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
/**
 * An arrow key: moves what's selected half a foot (a snap step), five feet with Shift, as a drag would (one undo step
 * for a run of presses). With nothing selected, or while drawing or placing, it pans the plan a tenth of the screen
 * (half with Shift).
 */
function onArrow(e: KeyboardEvent, [ax, ay]: [number, number]) {
  e.preventDefault();
  const busy = state.placing || state.draw || state.editPoints || state.bgEditMode || state.bgCalibrate;
  if (state.selectedIds.length && !busy) {
    const step = e.shiftKey ? 5 : 0.5;
    if (!nudgeSelected(ax * step, ay * step)) toast(state.selectedIds.length === 1 ? 'It’s locked: unlock it to move it.' : 'They’re all locked: unlock them to move them.');
    render();
    return;
  }
  const part = e.shiftKey ? 0.5 : 0.1, ppf = pxPerFoot();
  state.offsetX += ax * part * state.canvasW / ppf;
  state.offsetY += ay * part * state.canvasH / ppf;
  save();
  render();
}
function onKey(e: KeyboardEvent) {
  // Don't capture while typing in inputs
  const target = e.target as Element | null;
  const tag = (target?.tagName || '').toLowerCase();
  // Esc in the picker closes it, from its search too (where the cursor starts, with a keyboard); in the More menu,
  // closes that. Other sheets keep Esc while one has focus: some hold typing that closing would throw away.
  if (e.key === 'Escape' && state.panel === 'plants' && target?.closest?.('.overlay')) {
    e.preventDefault(); state.panel = null; state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; render(); return;
  }
  if (e.key === 'Escape' && state.menu && target?.closest?.('.menu')) { e.preventDefault(); state.menu = null; render(); return; }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  // Keys pressed while a panel has focus (a chip, a menu) belong to the panel, never the plan.
  if (target?.closest?.('.overlay, .menu')) return;
  // Ctrl or Cmd with + or − zooms the plan, not the page, whatever is going on (Jason, 2026-10-25). With a sheet's field
  // or button focused, the keys never get here: the page zooms, for reading.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && ['=', '+', '-', '_'].includes(e.key)) {
    e.preventDefault(); zoomBy(e.key === '-' || e.key === '_' ? 1 / 1.25 : 1.25); render(); flashZoom(); return;
  }
  if (ARROWS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) { onArrow(e, ARROWS[e.key]); return; }
  if (state.placing && (e.ctrlKey || e.metaKey)) {
    // While placing, undo takes back the last plant; other edits wait until Done.
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoPlace(); render(); }
    else if (['y', 'Z', 'v', 'd', 'a', 'x'].includes(e.key)) e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); dismissToastAction(); undo(); render();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
    e.preventDefault(); dismissToastAction(); redo(); render();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    if (state.selectedIds.length) { e.preventDefault(); copySelected(); }
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault(); paste(); render();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    if (state.selectedIds.length) { e.preventDefault(); duplicateSelected(); render(); }
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
    if (state.selectedIds.length) { e.preventDefault(); cutSelected(); render(); }
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    // Everything on the plan (not while drawing or editing an outline: those keep their taps).
    e.preventDefault();
    if (state.draw || state.editPoints || state.bgEditMode || state.bgCalibrate) return;
    selectAllShown(); render();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.selectedIds.length) { e.preventDefault(); deleteSelectedAsking(); render(); }
  } else if (e.key === 'Escape') {
    if (state.panel) { state.panel = null; state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; render(); }
    else if (state.placing) { finishPlacing(); render(); }
    else if (state.menu) { state.menu = null; render(); }
    // Drawing: done, as Done would (what's tapped is kept); with too few taps to make anything, put away.
    else if (state.draw) { if (canFinishDraw()) finishDraw(); else state.draw = null; render(); }
    else if (state.editPoints) { state.editPoints = null; render(); }
    else if (state.bgCalibrate) { state.bgCalibrate = null; render(); }
    else if (state.bgEditMode) { state.bgEditMode = false; render(); }
    else if (state.selectedIds.length) { clearSelection(); render(); }
  } else if (e.key === 'Enter' && state.placing && !state.panel && target?.tagName !== 'BUTTON') {
    e.preventDefault(); finishPlacing(); render();
  } else if (e.key === 'Enter' && state.draw) {
    // A focused button (Undo, Cancel) gets its own Enter.
    if (canFinishDraw() && target?.tagName !== 'BUTTON') { e.preventDefault(); finishDraw(); render(); }
  } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
    // Letter shortcuts for adding things (shown in tooltips and the ? list). Never over an open
    // panel (it may hold unsaved typing) or a drawing with taps in it (that would be thrown away).
    if (state.panel || state.menu || state.bgCalibrate || state.bgEditMode || state.editPoints || state.placing) return;
    if (state.draw && state.draw.points.length) return;
    if (e.key === '?') { e.preventDefault(); state.draw = null; state.panel = 'shortcuts'; render(); return; }
    if (e.key.toLowerCase() === 'a') { e.preventDefault(); state.draw = null; state.panel = 'add'; render(); return; }
    const kind = kindForShortcut(e.key);
    if (kind) { e.preventDefault(); startKind(kind.key); render(); }
  }
}

// ============================================================
// SAVE ON EXIT
// ============================================================
// Mobile browsers may kill a backgrounded app without warning, so write
// pending edits as soon as the page is hidden instead of waiting for the
// save debounce.
document.addEventListener('visibilitychange', () => {
  noteVisit(); // (for hints after a long time away: src/hints.ts)
  if (document.visibilityState === 'hidden') { cancelGestures(); writeJournalIfDirty(); void flushSave(); }
  else void refreshClipboard().then(() => { if (state.menu || state.panel === 'projects') render(); });
});
window.addEventListener('pagehide', () => { writeJournalIfDirty(); void flushSave(); });

// ============================================================
// INIT
// ============================================================
function showStorageError() {
  const root = document.getElementById('root')!;
  root.replaceChildren();
  const box = document.createElement('div');
  box.className = 'fatal';
  const h = document.createElement('h1');
  h.textContent = "Your projects couldn't be opened";
  const p = document.createElement('p');
  p.textContent = "The browser's storage didn't respond. Your projects are still on this device. Close the app completely (swipe it away from recent apps), then open it again.";
  const retry = document.createElement('button');
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => location.reload());
  box.append(h, p, retry);
  const rescue = buildEmergencyBackup();
  if (rescue) {
    const save = document.createElement('button');
    save.className = 'secondary';
    save.textContent = 'Save older copies and unsaved changes as a file';
    save.addEventListener('click', () => downloadText(rescue.filename, rescue.text));
    box.appendChild(save);
  }
  root.appendChild(box);
}

async function start() {
  let migrationError: string | undefined;
  try {
    ({ migrationError } = await initStorage());
  } catch (e) {
    if (e instanceof StorageUnavailableError) { showStorageError(); return; }
    throw e;
  }
  noteVisit(); // (before the first render: a hint may be due again)
  loadMyPlants();
  loadViewSettings(); // (full-size rings and crowding outlines, as left on this device)
  setSaveStatusListener(updateSaveWarning);
  setSaveStateListener(updateSaveState);
  pushHistory(); // seed undo history with the loaded state
  render();
  if (migrationError) {
    alert("Some projects from the previous version couldn't be copied (" + migrationError + "). They are still stored on this device; the app will try again next time it opens.");
  }
  void loadPlants();
  void loadWild(); // (the garden's county and its state's wild records, if it has a location)
  // Signed in (or just back from signing in): check the session. Changes refresh only the Account section.
  setAccountListener(() => { refreshAccountSection(); onAccountChange(); });
  setSyncUi({
    status: refreshAccountSection,
    changed: showSyncResults,
    // The open plan is in use: a download waits rather than replace it mid-gesture or mid-typing.
    busy: screenBusy,
    showOpen: () => { pushHistory(); refreshAfterSync(); },
  });
  startSyncTriggers();
  restoreCodeSent();
  void initAccount();
  void requestPersistence();
  setupServiceWorker();
}
void start();
