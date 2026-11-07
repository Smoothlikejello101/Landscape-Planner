// The start's cards (src/welcome.ts decides which): after a gap or an update, "Welcome back" or "FullGrown was
// updated", when the plan last changed, What's new after an update, and a quiet Back up when the last backup is old or
// there's none; on the second visit, once, "Saved on this phone. It opens right here next time." with Back up to a file
// and OK. A notice at the top of the plan (src/ui/toast.ts), as What's new's was: it goes at the first thing done
// anywhere else, or with its ✕. The plan behind it is fitted to the room under it.

import { backupAll, backupSaid } from '../backup';
import { errMsg } from '../util';
import { planBounds, zoomToBounds } from '../mutations';
import { changedOn, settleSavedHere } from '../welcome';
import { tell } from './ask';
import { toast, toastAction } from './toast';
import { openWhatsNew } from './whats-new-panel';

/** A full backup, downloaded, as Projects' Back up all projects makes it, and said. */
async function backUp(): Promise<void> {
  try {
    const b = await backupAll('download');
    if (b) toast(backupSaid(b), 10000);
  } catch (e) { void tell('Backup failed: ' + errMsg(e)); }
}

/**
 * After a gap or an update. `news`: the new things since this device last opened the app (What's new's count; the
 * notice that would say so isn't shown as well). `lastChanged`: the open plan's last change (ms; 0: not known).
 */
export function showWelcomeBack(o: { updated: boolean; news: number; lastChanged: number; backup: boolean; now?: number }): void {
  const said = o.updated ? `FullGrown was updated${o.news ? `: ${o.news} new thing${o.news === 1 ? '' : 's'}` : ''}.` : 'Welcome back.';
  const actions: Parameters<typeof toastAction>[1] = [];
  if (o.updated) actions.push({ label: 'See what’s new', run: openWhatsNew });
  if (o.backup) actions.push({ label: 'Back up', run: () => void backUp(), className: 'notice-quiet' });
  toastAction(said, actions, 0, 'welcome-back', { sub: o.lastChanged ? `Last changed ${changedOn(o.lastChanged, o.now)}.` : undefined, untilAction: true });
}

/** The second visit, once on this device: counted as had once it's shown. `device`: "this phone" (src/welcome.ts deviceWord). */
export function showSavedHere(device: string): void {
  settleSavedHere('shown');
  toastAction(`Saved on ${device}. It opens right here next time.`, [
    { label: 'Back up to a file', run: () => void backUp() },
    { label: 'OK', run: () => {} },
  ], 0, 'saved-here', { untilAction: true });
}

/**
 * The whole plan in view, clear of the start's card at the top and the "Now trace" card at the foot (when they leave
 * room enough). False when nothing shows to fit. Measured after the first drawing; the caller draws again.
 */
export function fitWholePlan(): boolean {
  const b = planBounds();
  if (!b) return false;
  const wrap = document.getElementById('canvas-wrap')?.getBoundingClientRect();
  let top = 0, bottom = 0;
  if (wrap?.height) {
    const card = document.getElementById('toast-action')?.getBoundingClientRect();
    if (card?.height && card.top < wrap.top + wrap.height / 2) top = card.bottom - wrap.top;
    const foot = document.querySelector('#canvas-wrap .trace-card')?.getBoundingClientRect();
    if (foot?.height) bottom = wrap.bottom - foot.top;
  }
  zoomToBounds(b, 28, { top, bottom });
  return true;
}
