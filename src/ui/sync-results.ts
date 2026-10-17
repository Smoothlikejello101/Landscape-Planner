import { redrawCanvas } from '../canvas';
import { activePointers } from '../gestures';
import { state } from '../state';
import type { SyncReport } from '../sync/engine';
import { render } from './render';
import { toast } from './toast';

// What a sync changed, shown without getting in the way: the plan and the
// project list are redrawn only when nothing is being typed, and anything
// the user should know (a conflict copy, a project deleted elsewhere) is said
// once, in a few words.

const typing = () => document.activeElement instanceof HTMLElement && document.activeElement.matches('input, textarea, select');
/** The open plan is in use right now (a gesture, a drawing, typing): sync leaves the screen alone. */
export function screenBusy(): boolean {
  return activePointers.size > 0 || !!state.draw || !!state.placing || !!state.editPoints || !!state.bgCalibrate || typing();
}

/** Show the plan (and the project list, if open) as sync left them. */
export function refreshAfterSync() {
  if (screenBusy()) { if (!activePointers.size) redrawCanvas(); return; } // keyboard safety: never rebuild a panel under the keyboard
  render();
}

export function showSyncResults(r: SyncReport) {
  const notes: string[] = [];
  for (const c of r.conflicts) {
    notes.push(`“${c.name}” was also changed on ${c.otherDevice ?? 'another device'}. Both versions are kept: yours is “${c.copyName}”.`);
  }
  for (const n of r.removed) notes.push(`“${n}” was deleted on another device. It’s in Recently deleted (Projects → Account) for 30 days.`);
  for (const n of r.restored) notes.push(`“${n}” was deleted on another device, but this one had changes, so it was kept.`);
  if (notes.length) toast(notes.join(' '), 9000);
  // New or renamed projects: the list and the project name in the top bar.
  if (r.downloaded || r.conflicts.length || r.removed.length || r.restored.length) {
    if (state.panel === 'projects' || state.panel === null) refreshAfterSync();
  }
}
