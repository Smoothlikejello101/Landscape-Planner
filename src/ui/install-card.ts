// The install card (src/install.ts decides when): once, on a phone's browser where the app isn't installed, a notice at
// the top of the plan, as the start's other cards are (src/ui/welcome-card.ts), that says what installing means and
// how. Chrome on Android: Install, which asks the browser to install it. An iPhone: the two steps. It goes with its
// button, its ✕, or the first thing done anywhere else; either way, never again on this device. Help has it any time.

import { deviceName } from '../sync/sync';
import { INSTALL_MEANS, IPHONE_STEPS, installCard, phoneKind, settleInstall } from '../install';
import { state } from '../state';
import { introActive } from './intro-card';
import { noticeUp, toast, toastAction } from './toast';

/** Chrome's offer to install (its beforeinstallprompt), kept for an Install button. */
interface InstallOffer extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let offer: InstallOffer | null = null;
/** This visit, waiting for the browser's offer (Android), till the card has had its chance. */
let waiting: { visit: number; otherCard: boolean } | null = null;

/** Running installed: from its own icon, full screen, not in a browser tab (an iPhone says so its own way). */
export function runningInstalled(): boolean {
  return !!window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}
/** Whether the browser offers to install it now (Help's Install button). */
export const installOffered = (): boolean => !!offer;

/** Listen for the browser's offer to install, and for the app being installed. At the start, before anything else. */
export function listenForInstall(): void {
  if (runningInstalled()) settleInstall('installed');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // (asked when the person chooses to, from the card or Help)
    offer = e as InstallOffer;
    maybeOffer();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    settleInstall('installed');
    if (noticeUp()?.testid === 'install-card') document.getElementById('toast-action')?.remove();
  });
}

/** The start's turn for the card, after the first drawing: now (an iPhone), or once the browser offers it (Android). */
export function offerInstall(at: { visit: number; otherCard: boolean }): void {
  waiting = at;
  maybeOffer();
}

/** The browser's install, asked for (the card's Install, Help's). */
export async function promptInstall(): Promise<void> {
  const o = offer;
  if (!o) return;
  offer = null; // (it can be asked once)
  try {
    await o.prompt();
    const { outcome } = await o.userChoice;
    if (outcome === 'accepted') { settleInstall('installed'); toast('Installing. Look for FullGrown on your home screen.', 6000); }
  } catch (e) { console.warn('install prompt failed', e); }
}

function maybeOffer(): void {
  const at = waiting;
  if (!at) return;
  const way = installCard({ phone: phoneKind(deviceName()), installed: runningInstalled(), visit: at.visit, touring: introActive(), otherCard: at.otherCard, canPrompt: !!offer });
  if (!way) return;
  waiting = null; // (one chance a visit)
  // (Not over something under way: a sheet, a drawing, a plant being placed, another notice. A later visit, then.)
  if (state.panel || state.draw || state.placing || state.menu || noticeUp()) return;
  settleInstall('shown');
  if (way === 'prompt') {
    toastAction('Install FullGrown on this phone?', [
      { label: 'Install', run: () => void promptInstall() },
      { label: 'Not now', run: () => {}, className: 'notice-quiet' },
    ], 0, 'install-card', { sub: INSTALL_MEANS, untilAction: true });
  } else {
    toastAction('Add FullGrown to your home screen?', [{ label: 'OK', run: () => {} }], 0, 'install-card',
      { sub: `${INSTALL_MEANS} To add it: ${IPHONE_STEPS}`, untilAction: true });
  }
}
