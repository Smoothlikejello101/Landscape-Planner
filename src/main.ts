import './styles.css';
import { resizeCanvas } from './canvas';
import { cancelGestures, onCanvasPointerMove, onCanvasPointerUp } from './gestures';
import { pushHistory, redo, undo } from './history';
import { copySelected, deleteSelected, duplicateSelected, paste } from './mutations';
import { clearSelection } from './selection';
import { state } from './state';
import { loadPlants } from './plants';
import { flushSave, initStorage, refreshClipboard, requestPersistence, writeJournalIfDirty } from './storage';
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
    else if (state.selectedIds.length) { clearSelection(); render(); }
  }
});

// ============================================================
// SERVICE WORKER
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

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
async function start() {
  await initStorage();
  pushHistory(); // seed undo history with the loaded state
  render();
  void loadPlants();
  void requestPersistence();
}
void start();
