import './styles.css';
import { resizeCanvas } from './canvas';
import { cancelGestures, onCanvasPointerMove, onCanvasPointerUp } from './gestures';
import { pushHistory, redo, undo } from './history';
import { copySelected, deleteSelected, duplicateSelected, paste } from './mutations';
import { clearSelection } from './selection';
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
window.addEventListener('resize', () => { resizeCanvas(); });
// Same goes for visualViewport resize (covers iOS keyboard + zoom)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => { resizeCanvas(); });
}

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
  const tag = ((e.target as Element | null)?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
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
    else if (state.menu) { state.menu = null; render(); }
    else if (state.draw || state.editPoints) { state.draw = null; state.editPoints = null; render(); }
    else if (state.selectedIds.length) { clearSelection(); render(); }
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
