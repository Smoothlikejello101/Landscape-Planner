import './styles.css';
import { finishFeaturePlace, undoFeaturePlace } from './feature-edit';
import { resizeCanvas } from './canvas';
import { fitToWindow, installAppHeight } from './app-height';
import { fitAboveKeyboard } from './keyboard';
import { cancelGestures, onCanvasPointerMove, onCanvasPointerUp } from './gestures';
import { installTapGuard } from './tap-guard';
import { pushHistory, redo, undo } from './history';
import { copySelected, duplicateSelected, nudgeSelected, paste, selectAllShown, zoomBy, zoomToFit } from './mutations';
import { cutSelected, deleteSelectedAsking } from './ui/delete-selected';
import { clearSelection } from './selection';
import { canFinishDraw, finishDraw, finishTypedRect, startKind } from './draw';
import { kindForShortcut } from './kinds';
import { finishPlacing, undoPlace } from './place';
import { state } from './state';
import { loadPlants, plantFilter } from './plants';
import { applyYard, household, loadHardy } from './yard';
import { loadWild } from './wild';
import { initAccount, restoreCodeSent, setAccountListener, storedSession } from './account';
import { CHANNEL, signInAllowed } from './channel';
import { deviceName, onAccountChange, setSyncUi, startSyncTriggers, syncOnThisDevice } from './sync/sync';
import { refreshAfterSync, screenBusy, showSyncResults } from './ui/sync-results';
import { refreshAccountSection } from './ui/account-section';
import { loadMyPlants } from './my-plants';
import { reloadToNewest, setupServiceWorker } from './pwa';
import { NewerVersionError, setOpenBlockedListener } from './db';
import { buildEmergencyBackup, buildRawCopyFile, downloadText } from './backup';
import { notePageZoom } from './page-zoom';
import { loadViewSettings } from './view-settings';
import { applyTextSize } from './text-size';
import { updateSaveWarning, updateSaveState } from './ui/save-warning';
import {
  currentProject, flushSave, getLastBackupAt, initStorage, refreshClipboard, requestPersistence, saveIsFailing, saveView, setHouseholdListener,
  setNewerVersionListener, setSaveStateListener, setSaveStatusListener, StorageUnavailableError, storageIsDurable, supersededByNewer, writeJournalIfDirty,
} from './storage';
import { flashZoom, placeFirstCard, render } from './ui/render';
import { dismissToastAction, toast } from './ui/toast';
import { closeYear, stepMonth } from './ui/year-bar';
import { closeWarningsSide, warningsSideOpen } from './ui/warnings-sheet';
import { lastVisitAt, noteVisit, visitedBefore } from './hints';
import { arrive, backupDue, deviceWord, startCard } from './welcome';
import { fitWholePlan, showSavedHere, showWelcomeBack } from './ui/welcome-card';
import { listenForInstall, offerInstall } from './ui/install-card';
import { newsAtStart } from './whats-new';
import { tellWhatsNew } from './ui/whats-new-panel';
import { introActive } from './ui/intro-card';
import { installErrorLog } from './error-log';
import { pxPerFoot } from './geometry';
import { ask, asking, dismissAsk, tell } from './ui/ask';
import { installFocusKeeping } from './ui/focus';
import { closeCompare, compareShown } from './ui/compare-sheet';
import { closeSourcePane } from './ui/source-pane';
import { placePicker } from './ui/picker-view';
import { pickingBed } from './bed-plant';
import { stopPickingBed } from './ui/plant-for';

// The app's own errors, kept on this device for a support file (src/error-log.ts): from the start.
installErrorLog();

// The page at this device's text size, before anything is drawn (src/text-size.ts).
applyTextSize();

// The app's height, the window's own, measured now and again whenever it may have changed (src/app-height.ts).
installAppHeight();

// ============================================================
// EVENT LISTENERS
// ============================================================
// IMPORTANT: window resize calls resizeCanvas ONLY, never render().
// Android keyboard appearing fires a viewport resize; a full render()
// destroys focused inputs.
// (The plant picker's place under the top bar, measured again: CSS only, src/ui/picker-view.ts.)
window.addEventListener('resize', () => { fitToWindow(); resizeCanvas(); placeFirstCard(); placePicker(); });
// Same goes for visualViewport resize (covers iOS keyboard + zoom)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => { fitToWindow(); resizeCanvas(); placeFirstCard(); placePicker(); notePageZoom(); });
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
installTapGuard(); // (first: a stray tap is dropped before anything sees it; src/tap-guard.ts)
installFocusKeeping(); // (with a keyboard, focus kept through redraws and inside sheets: src/ui/focus.ts)
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
  const busy = state.placing || state.draw || state.editPoints || state.bgEditMode || state.bgCalibrate || state.featurePlace || pickingBed();
  if (state.selectedIds.length && !busy) {
    const step = e.shiftKey ? 5 : 0.5;
    if (!nudgeSelected(ax * step, ay * step)) toast(state.selectedIds.length === 1 ? 'It’s locked: unlock it to move it.' : 'They’re all locked: unlock them to move them.');
    render();
    return;
  }
  const part = e.shiftKey ? 0.5 : 0.1, ppf = pxPerFoot();
  state.offsetX += ax * part * state.canvasW / ppf;
  state.offsetY += ay * part * state.canvasH / ppf;
  saveView();
  render();
}
/** A field that holds typing (text, a number, a choice being made), not a button, box or slider. */
function holdsTyping(t: Element): boolean {
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  return t instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit', 'color', 'file'].includes(t.type);
}
function onKey(e: KeyboardEvent) {
  if (asking()) return; // (a question is up: its keys are its own, src/ui/ask.ts)
  // Don't capture while typing in inputs
  const target = e.target as Element | null;
  const tag = (target?.tagName || '').toLowerCase();
  // Esc in the picker closes it, from its search too (where the cursor starts, with a keyboard); in the More menu,
  // closes that. Other sheets keep Esc while one has focus: some hold typing that closing would throw away.
  // (A source's little pane open, src/ui/source-pane.ts: Esc closes it, back on its Source; the next one, the sheet.)
  if (e.key === 'Escape' && closeSourcePane(true)) { e.preventDefault(); return; }
  // (The comparison over the picker: Esc goes back to the picker, the plants still chosen.)
  if (e.key === 'Escape' && state.panel === 'plants' && compareShown()) { e.preventDefault(); closeCompare(); return; }
  if (e.key === 'Escape' && state.panel === 'plants' && target?.closest?.('.overlay')) {
    e.preventDefault(); state.panel = null; state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; render(); return;
  }
  if (e.key === 'Escape' && state.menu && target?.closest?.('.menu')) { e.preventDefault(); state.menu = null; render(); return; }
  // (Warnings beside the plan, on a computer: Esc from inside it closes it.)
  if (e.key === 'Escape' && target?.closest?.('.warnings-side') && !state.panel) { e.preventDefault(); closeWarningsSide(); render(); return; }
  // In any other sheet, Esc closes it from a button, a checkbox or a slider: only typing would be lost (Alex, Tom,
  // Oct 30: Esc did nothing in Layers with a padlock focused, nor in a sun record with its slider focused).
  if (e.key === 'Escape' && target?.closest?.('.overlay') && !holdsTyping(target)) { e.preventDefault(); if (closeOne()) render(); return; }
  // In a field that holds typing, Esc leaves the field for the sheet's ×: a second Esc closes the sheet. (Round 3,
  // Alex: Esc in a number field did nothing, twice, and a keyboard user was stuck there.) Nothing typed is lost: a
  // field's value is used as it's typed, or read at Save.
  if (e.key === 'Escape' && target?.closest?.('.overlay') && holdsTyping(target) && !(target instanceof HTMLSelectElement)) {
    e.preventDefault();
    (target as HTMLElement).blur();
    target.closest('.overlay')?.querySelector<HTMLElement>('.sheet-header .iconbtn[aria-label=Close], .sheet-header button')?.focus();
    return;
  }
  // Esc from the month's slider (or another box or slider on the plan's bars): what Esc does anywhere (Alex, Oct 30:
  // with the slider focused, Esc left the month bar open).
  if (e.key === 'Escape' && target && tag === 'input' && !holdsTyping(target)) { e.preventDefault(); if (closeOne()) render(); return; }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  // Keys pressed while a panel has focus (a chip, a menu, Warnings beside the plan) belong to the panel, never the plan.
  if (target?.closest?.('.overlay, .menu, .warnings-side')) return;
  // The plant picker open, its plan beside or above it there to look at (src/ui/picker-view.ts): a click on the plan
  // leaves the focus on the page, and still no key edits the plan (Delete took the plant being swapped), starts a tool
  // or redraws the picker. Esc closes it, as from inside it (closeOne, below); Ctrl and + zoom the page, as in a sheet.
  if (state.panel === 'plants' && e.key !== 'Escape') return;
  // (Picking a bed on the plan for the picker: a tap on a bed, or Esc; the arrows pan. Nothing else edits the plan.)
  if (pickingBed() && e.key !== 'Escape' && !ARROWS[e.key]) return;
  // Ctrl or Cmd with + or − zooms the plan, not the page, whatever is going on (Jason, 2026-10-25). With a sheet's field
  // or button focused, the keys never get here: the page zooms, for reading.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && ['=', '+', '-', '_'].includes(e.key)) {
    e.preventDefault(); zoomBy(e.key === '-' || e.key === '_' ? 1 / 1.25 : 1.25); render(); flashZoom(); return;
  }
  // Shift+1: the whole plan in view (by the key, not the character: on most layouts Shift+1 types "!").
  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'Digit1') {
    e.preventDefault(); if (zoomToFit()) { render(); flashZoom(); } return;
  }
  // (The More menu open: the arrow keys are its, never the plan's behind it; from outside it, they go into it. Alex,
  // Oct 30.)
  if (state.menu && ARROWS[e.key]) {
    e.preventDefault();
    document.querySelector<HTMLElement>('.menu .menu-item:not(:disabled)')?.focus();
    return;
  }
  // Through the year, left and right step the month, as its ‹ › do (Alex, Oct 30); with Shift, they pan as ever.
  if (state.month != null && !state.panel && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault(); stepMonth(e.key === 'ArrowLeft' ? -1 : 1); render(); return;
  }
  // (A sheet open, with the focus outside it: the arrow keys are never the plan's behind it. Round 3, Kim: two presses
  // with the Edit sheet up moved the plant a foot, unseen; in Print, they panned the plan.)
  if (ARROWS[e.key] && document.querySelector('.overlay:not(.top)')) { e.preventDefault(); return; }
  if (ARROWS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) { onArrow(e, ARROWS[e.key]); return; }
  if (state.placing && (e.ctrlKey || e.metaKey)) {
    // While placing, undo takes back the last plant; other edits wait until Done.
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoPlace(); render(); }
    else if (['y', 'Z', 'v', 'd', 'a', 'x'].includes(e.key)) e.preventDefault();
    return;
  }
  if (state.featurePlace) {
    // Likewise while adding doors and windows: undo takes back the last one; the house they go on stays selected, but
    // isn't deleted, cut, copied over or swapped for another until Done.
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoFeaturePlace(); render(); return; }
    if ((e.ctrlKey || e.metaKey) && ['y', 'Z', 'v', 'd', 'a', 'x'].includes(e.key)) { e.preventDefault(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return; }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); dismissToastAction(); undo(); render();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { // (Ctrl+Shift+Z: "z" or "Z", by layout and Caps Lock)
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
    if (state.selectedIds.length) { e.preventDefault(); void deleteSelectedAsking(); }
  } else if (e.key === 'Escape') {
    if (closeOne()) render();
  } else if (e.key === 'Enter' && state.placing && !state.panel && target?.tagName !== 'BUTTON') {
    e.preventDefault(); finishPlacing(); render();
  } else if (e.key === 'Enter' && state.featurePlace && !state.panel && target?.tagName !== 'BUTTON') {
    e.preventDefault(); finishFeaturePlace(); render();
  } else if (e.key === 'Enter' && state.draw && finishTypedRect()) {
    e.preventDefault(); render();
  } else if (e.key === 'Enter' && state.draw) {
    // A focused button (Undo, Cancel) gets its own Enter.
    if (canFinishDraw() && target?.tagName !== 'BUTTON') { e.preventDefault(); finishDraw(); render(); }
  } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
    // Letter shortcuts for adding things (shown in tooltips and the ? list). Never over an open
    // panel (it may hold unsaved typing) or a drawing with taps in it (that would be thrown away).
    if (state.panel || state.menu || state.bgCalibrate || state.bgEditMode || state.editPoints || state.placing || state.featurePlace) return;
    if (state.draw && state.draw.points.length) return;
    if (e.key === '?') { e.preventDefault(); state.draw = null; state.panel = 'shortcuts'; render(); return; }
    if (e.key.toLowerCase() === 'a') { e.preventDefault(); state.draw = null; state.panel = 'add'; render(); return; }
    const kind = kindForShortcut(e.key);
    if (kind) { e.preventDefault(); startKind(kind.key); render(); }
  }
}

/**
 * Put away the one thing most on top: a panel, placing, adding doors, the menu, a drawing (kept, as Done would keep it,
 * when it has enough taps), editing points, calibrating, the background's edit mode, the selection, the month view.
 * What Esc does, and the phone's back button. False when nothing was open.
 */
function closeOne(): boolean {
  // (Picking a bed on the plan for the picker, and a bed's conditions opened from it: back to the picker.)
  if (pickingBed()) stopPickingBed();
  else if (state.panel === 'bedConditions') state.panel = 'plants';
  else if (state.panel) { state.panel = null; state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; }
  else if (state.placing) finishPlacing();
  else if (state.featurePlace) finishFeaturePlace();
  else if (state.menu) state.menu = null;
  // (Measuring: Esc is Done, which leaves the measurement unkept; Keep is its own button. Tom, Oct 30: Esc kept it.)
  else if (state.draw) { if (state.draw.kind !== 'measure' && canFinishDraw()) finishDraw(); else state.draw = null; }
  else if (state.editPoints) state.editPoints = null;
  else if (state.bgCalibrate) state.bgCalibrate = null;
  else if (state.bgEditMode) state.bgEditMode = false;
  else if (state.selectedIds.length) clearSelection();
  // (Select several: Esc leaves it once nothing's selected, as its × does. Round 3: Tom, Alex.)
  else if (state.selectMode) state.selectMode = false;
  else if (warningsSideOpen()) closeWarningsSide();
  else if (state.month != null) closeYear();
  else return false;
  return true;
}

// ============================================================
// THE BACK BUTTON
// ============================================================
// On a phone, back closes what's open, one thing at a time, as Esc does, rather than leaving the app (a tester on
// Android pressed it to close a panel and was out of the app: Oct 30). One extra history entry stands guard: each back
// takes it, and it's put back while there's something to close. With nothing open, back says so and the next one
// leaves, as it always did. (The guard is added on a tap or a key: Chrome skips history entries a page adds without
// one.)
const GUARD = { fullgrownGuard: true };
function guard() { if (!history.state?.fullgrownGuard) history.pushState(GUARD, ''); }
window.addEventListener('pointerdown', guard, true);
window.addEventListener('keydown', guard, true);
window.addEventListener('popstate', () => {
  if (dismissAsk()) { guard(); return; } // (a question up: back answers no)
  if (closeSourcePane()) { guard(); return; } // (a source's little pane: closed, in place)
  if (state.panel === 'plants' && compareShown()) { closeCompare(); guard(); return; } // (back to the picker, in place)
  if (closeOne()) { render(); guard(); return; }
  toast('Press back again to leave FullGrown.');
});

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

// ---- A newer version of the app has the plans (src/db.ts DB_VERSION) ----
/**
 * This page is an older version than the one that has the database: it stopped before opening the plans, and has
 * written nothing. Its Reload gets the newer version (src/pwa.ts reloadToNewest), and only when pressed: one that
 * still can't get it shows this again, never reloading by itself.
 */
function showNewerVersion() {
  const root = document.getElementById('root')!;
  document.getElementById('open-blocked')?.remove();
  const box = document.createElement('div');
  box.className = 'fatal';
  box.dataset.testid = 'newer-version';
  const h = document.createElement('h1');
  h.textContent = 'FullGrown has been updated';
  const p = document.createElement('p');
  p.textContent = 'A newer version of FullGrown saved the plans on this device. This page is an older version, so it hasn’t opened them, and has changed nothing. Reload to get the newer version.';
  const reload = document.createElement('button');
  reload.textContent = 'Reload';
  reload.dataset.testid = 'newer-reload';
  reload.addEventListener('click', () => { reload.disabled = true; reload.textContent = 'Reloading…'; void reloadToNewest(); });
  const again = document.createElement('p');
  again.textContent = 'If this comes back, close FullGrown everywhere on this device (every tab and window), then open it again.';
  // (For when no version can open them: a raw copy of the database, never changed by making it. The review, Nov 1.)
  const raw = document.createElement('button');
  raw.className = 'secondary';
  raw.textContent = 'Save a raw copy as a file';
  raw.dataset.testid = 'newer-raw-copy';
  const rawSaid = document.createElement('p');
  rawSaid.textContent = 'A raw copy is everything stored on this device, exactly as it is, in one file: for help if the app can’t open your plans. It isn’t a backup the app can import.';
  raw.addEventListener('click', async () => {
    raw.disabled = true;
    try {
      const file = await buildRawCopyFile();
      if (file) downloadText(file.filename, file.text);
      else rawSaid.textContent = 'There’s nothing stored on this device to copy.';
    } catch (e) {
      console.error('raw copy failed', e);
      rawSaid.textContent = 'The copy couldn’t be made. Close FullGrown everywhere on this device, then open it and try again.';
    } finally { raw.disabled = false; }
  });
  box.append(h, p, reload, again, raw, rawSaid);
  root.replaceChildren(box);
}
/** Shown on the plan when a newer version opens the database in another tab or window; then reloaded into it. */
let appShown = false;
setNewerVersionListener((lastWrite) => {
  // (Before the plan is shown, start() says so instead: showNewerVersion.)
  if (!appShown) return;
  void ask('FullGrown was updated in another tab or window. This page will reload into the new version.', { ok: 'Reload', noCancel: true, testid: 'newer-tab' })
    // (Its edits not saved yet were being written as it closed: a moment for that to finish.)
    .then(async (pressed) => {
      await Promise.race([lastWrite, new Promise((r) => setTimeout(r, 5000))]);
      // Reload, pressed: into the newer version, a waiting one put in first (the person asked). Put away (Esc, Back, a
      // tap beside it, another question over it): only reloaded, the update left to wait for its Update (CLAUDE.md;
      // the review, Nov 1).
      if (pressed) void reloadToNewest(); else location.reload();
    });
});
/**
 * While this page's opening of the plans waits for another tab or window, open on an older version, to let go of them
 * (src/db.ts setOpenBlockedListener). Said after a second (a page that lets go at once, as every version since Oct 11
 * does, isn't worth a flash of it); gone once the wait is over, and the app goes on.
 */
let blockedTimer: ReturnType<typeof setTimeout> | null = null;
setOpenBlockedListener((blocked) => {
  if (blockedTimer) { clearTimeout(blockedTimer); blockedTimer = null; }
  if (!blocked) { document.getElementById('open-blocked')?.remove(); return; }
  blockedTimer = setTimeout(() => {
    blockedTimer = null;
    if (document.getElementById('open-blocked')) return;
    const box = document.createElement('div');
    box.className = 'fatal';
    box.id = 'open-blocked';
    box.setAttribute('role', 'status');
    const h = document.createElement('h1');
    h.textContent = 'Close FullGrown’s other tabs or windows';
    const p = document.createElement('p');
    p.textContent = 'FullGrown is open on an older version in another tab or window on this device. Close it to finish updating: this page goes on by itself once it’s closed.';
    box.append(h, p);
    document.getElementById('root')!.appendChild(box);
  }, 1000);
});

async function start() {
  // (The browser's offer to install, when it makes one: src/install.ts.)
  listenForInstall();
  let migrationError: string | undefined;
  let keptApart: string[] | undefined;
  try {
    ({ migrationError, keptApart } = await initStorage());
  } catch (e) {
    if (e instanceof NewerVersionError || supersededByNewer()) { showNewerVersion(); return; }
    if (e instanceof StorageUnavailableError) { showStorageError(); return; }
    throw e;
  }
  // (Taken by a newer version, in another tab or window, while this page was opening the plans.)
  if (supersededByNewer()) { showNewerVersion(); return; }
  appShown = true;
  // What's new since this device last opened the app (src/whats-new.ts): read before the visit is noted, which is how
  // a device used before the list existed is told from a new one.
  const news = newsAtStart(visitedBefore());
  // (And how long it was away, whether this is a new version, which visit this is: src/welcome.ts. Read before the
  // visit is noted too.)
  const arrival = arrive(lastVisitAt(), __APP_VERSION__);
  noteVisit(); // (before the first render: a hint may be due again)
  // Next, the preview copy of the app, is marked so it's never taken for the real one (a stripe along the top).
  document.body.classList.toggle('channel-next', CHANNEL === 'next');
  loadMyPlants();
  loadViewSettings(); // (full-size rings, plant pictures and the zoom buttons, as left on this device; the warning switches came with the plan)
  // (Kids and pets in the open plan's yard: the picker's filters for them, and again whenever another plan, or sync's
  // copy of this one, is put in place.)
  applyYard(plantFilter, household());
  setHouseholdListener(() => applyYard(plantFilter, household()));
  plantFilter.hardyHere = loadHardy(); // (hardy in the garden's zone: as left on this device, on to start)
  setSaveStatusListener(updateSaveWarning);
  setSaveStateListener(updateSaveState);
  pushHistory(); // seed undo history with the loaded state
  // Back after a gap or an update: the whole plan, and a small card; the second visit, once, "Saved on this phone"
  // (src/welcome.ts has the order). Up before the first drawing, so the photo's "not to scale yet" waits for it to go.
  const lastBackup = getLastBackupAt();
  const { card, fit } = startCard(arrival, {
    touring: introActive(), drawn: state.shapes.length > 0, backedUp: lastBackup != null,
    syncing: signInAllowed() && storedSession() && syncOnThisDevice(), saving: storageIsDurable() && !saveIsFailing(),
  });
  if (card === 'welcome') {
    const lastChange = Math.max(0, ...state.projects.map((p) => p.lastModified || 0));
    showWelcomeBack({ updated: arrival.updated, news: news.reduce((n, r) => n + r.items.length, 0), lastChanged: currentProject()?.lastModified ?? 0, backup: backupDue(lastBackup, lastChange) });
  } else if (card === 'saved') showSavedHere(deviceWord(deviceName(), navigator.maxTouchPoints));
  render();
  if (fit && fitWholePlan()) render(); // (measured under the card, now it's in its place)
  // (Said once, after the first render; not over the guided introduction's card, though its list still marks them New;
  // nor beside the start's card, which says it after an update.)
  tellWhatsNew(news, !introActive() && !card);
  // Once, on a phone's browser where the app isn't installed, from the second visit: what installing means and how
  // (src/install.ts has when). Not beside another start card, nor over Guided start.
  offerInstall({ visit: arrival.visit, otherCard: !!card || news.length > 0 });
  const told = migrationError
    ? tell("Some projects from the previous version couldn't be copied (" + migrationError + "). They are still stored on this device; the app will try again next time it opens.")
    : Promise.resolve();
  // (Unsaved changes from a tab or window with an older copy of a plan, kept beside it rather than over it:
  // src/storage.ts replayJournals. After the message above, if any: one question at a time.)
  if (keptApart?.length) {
    const names = keptApart.map((n) => `“${n}”`).join(', ');
    const one = keptApart.length === 1;
    void told.then(() => tell(`Changes left unsaved in another tab or window, made to an older copy of ${one ? 'a plan' : 'plans'}, are kept as ${one ? 'a plan of its own' : 'plans of their own'}: ${names}. Nothing newer was replaced. Compare, and delete what you don’t need.`, { testid: 'kept-apart' }));
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
  // (Not in Next, the preview copy: it shares the backend, so it never signs in or syncs. src/channel.ts.)
  if (signInAllowed()) {
    startSyncTriggers();
    restoreCodeSent();
    void initAccount();
  }
  void requestPersistence();
  setupServiceWorker();
}
void start();
