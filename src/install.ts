// Installing the app on a phone's home screen (Jason, Nov 4, from the first beta testers: Kayla "didn't know what it
// meant to install it on her home screen"; "Can we prompt phone browser users to install on their home screen?").
//
// Once, on a phone's browser where the app isn't installed, a card says what installing means and how (src/ui/
// install-card.ts): Chrome on Android offers the install itself (its beforeinstallprompt: the card's Install button);
// an iPhone gets the two steps (Share, then Add to Home Screen). When:
//  - from the second visit on this device (src/welcome.ts), never the first open of a brand-new one: that's for the
//    plan, and the app hasn't shown what it's for yet;
//  - not while Guided start is under way, nor beside another of the start's cards (welcome back, saved here): one card
//    at a time, the install card waiting for a later visit;
//  - on Android, only when the browser offers the install (it doesn't once the app is installed, so an installed app
//    opened in a browser tab isn't asked again).
// Never again once it has been shown (and put away), or the app is installed. Help has it any time (src/help.ts).
//
// This device's own, in localStorage, as the start's cards are: never part of a plan. This file has no page in it.

const KEY = 'lp-install-card';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
function local(): Store | null { try { return localStorage; } catch { return null; } }

/** Whether the card has had its turn on this device: 'shown', or 'installed'. Null: not yet. */
export function installSettled(store: Store | null = local()): string | null {
  try { return store?.getItem(KEY) ?? null; } catch { return null; }
}
/** The card done with on this device: shown (and put away), or the app installed. Never asked again. */
export function settleInstall(how: 'shown' | 'installed', store: Store | null = local()): void {
  try { store?.setItem(KEY, how); } catch { /* not kept: it may be offered once more */ }
}

/** A phone, by its browser's name for itself (src/sync/sync.ts deviceName): which kind, or null for anything else. */
export function phoneKind(deviceName: string): 'android' | 'iphone' | null {
  return deviceName === 'Android phone' ? 'android' : deviceName === 'iPhone' ? 'iphone' : null;
}

/** The app as it opens, as far as the install card cares. */
export interface InstallScene {
  phone: 'android' | 'iphone' | null;
  /** Running installed (full screen, from its own icon), not in a browser tab. */
  installed: boolean;
  /** Which visit this is on this device (src/welcome.ts arrive): 1, the first. */
  visit: number;
  /** Guided start is under way. */
  touring: boolean;
  /** Another of the start's cards is up (welcome back, saved here). */
  otherCard: boolean;
  /** The browser has offered the install (Chrome's beforeinstallprompt), for the card's Install button. */
  canPrompt: boolean;
}

/**
 * Which card to show, if one: 'prompt' (an Install button: the browser installs it), 'steps' (an iPhone's two steps),
 * or null for none now.
 */
export function installCard(s: InstallScene, store: Store | null = local()): 'prompt' | 'steps' | null {
  if (!s.phone || s.installed || installSettled(store)) return null;
  if (s.visit < 2 || s.touring || s.otherCard) return null;
  if (s.phone === 'iphone') return 'steps';
  return s.canPrompt ? 'prompt' : null;
}

/** What installing means, in plain words, for the card and Help. */
export const INSTALL_MEANS = 'It gets its own icon on your home screen, opens full screen like an app, and works without a signal. Your plans stay as they are.';
/** How, on an iPhone (in Safari, and the other browsers there, which share its menu). */
export const IPHONE_STEPS = 'Share (the square with an arrow), then Add to Home Screen.';
/** How, on Android, from Chrome's own menu (Help: where the card's Install isn't offered). */
export const ANDROID_STEPS = '⋮ → Install app (or Add to Home screen).';
