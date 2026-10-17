import './styles.css';
import { resizeCanvas } from './canvas';
import { fitAboveKeyboard } from './keyboard';
import { cancelGestures, onCanvasPointerMove, onCanvasPointerUp } from './gestures';
import { pushHistory, redo, undo } from './history';
import { copySelected, deleteSelected, duplicateSelected, paste } from './mutations';
import { clearSelection } from './selection';
import { canFinishDraw, finishDraw, startKind } from './draw';
import { kindForShortcut } from './kinds';
import { finishPlacing, undoPlace } from './place';
import { state } from './state';
import { loadPlants } from './plants';
import { loadMyPlants } from './my-plants';
import { setupServiceWorker } from './pwa';
import { buildEmergencyBackup, downloadText } from './backup';
import { updateSaveWarning } from './ui/save-warning';
import { flushSave, initStorage, refreshClipboard, requestPersistence, setSaveStatusListener, StorageUnavailableError, writeJournalIfDirty } from './storage';
import { render } from './ui/render';

// ============================================================
// EVENT LISTENERS
// ============================================================
// IMPORTANT: window resize calls resizeCanvas ONLY, never render().
// Android keyboard appearing fires a viewport resize; a full render()
// destroys focused inputs.
window.addEventListener('resize', () => { fitAboveKeyboard(); resizeCanvas(); });
// Same goes for visualViewport resize (covers iOS keyboard + zoom)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => { fitAboveKeyboard(); resizeCanvas(); });
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
window.addEventListener('keydown', (e) => {
  // Don't capture while typing in inputs
  const target = e.target as Element | null;
  const tag = (target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  // Keys pressed while a panel has focus (a chip, a menu) belong to the panel, never the plan.
  if (target?.closest?.('.overlay, .menu')) return;
  if (state.placing && (e.ctrlKey || e.metaKey)) {
    // While placing, undo takes back the last plant; other edits wait until Done.
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoPlace(); render(); }
    else if (['y', 'Z', 'v', 'd'].includes(e.key)) e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); undo(); render();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
    e.preventDefault(); redo(); render();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    if (state.selectedIds.length) { e.preventDefault(); copySelected(); }
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault(); paste(); render();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    if (state.selectedIds.length) { e.preventDefault(); duplicateSelected(); render(); }
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.selectedIds.length) { e.preventDefault(); deleteSelected(); render(); }
  } else if (e.key === 'Escape') {
    if (state.panel) { state.panel = null; render(); }
    else if (state.placing) { finishPlacing(); render(); }
    else if (state.menu) { state.menu = null; render(); }
    else if (state.draw || state.editPoints) { state.draw = null; state.editPoints = null; render(); }
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
});

// ============================================================
// SAVE ON EXIT
// ============================================================
// Mobile browsers may kill a backgrounded app without warning, so write
// pending edits as soon as the page is hidden instead of waiting for the
// save debounce.
document.addEventListener('visibilitychange', () => {
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
  loadMyPlants();
  setSaveStatusListener(updateSaveWarning);
  pushHistory(); // seed undo history with the loaded state
  render();
  if (migrationError) {
    alert("Some projects from the previous version couldn't be copied (" + migrationError + "). They are still stored on this device; the app will try again next time it opens.");
  }
  void loadPlants();
  void requestPersistence();
  setupServiceWorker();
}
void start();
