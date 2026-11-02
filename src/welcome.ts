// Welcome back (Jason, Nov 2, from the UI review: big #8 and quick #9, marked Next: "The whole plan and a small card
// after a gap or an update; on the second visit, 'Saved on this phone; back it up'").
//
// At each start of the app, before anything is drawn: how long it was away, whether this is a new version, and which
// visit this is on the device. Then, after a gap or an update, the plan opens on the whole of it, not where it was
// zoomed last, with a small card (src/ui/welcome-card.ts); on the second visit, once, a card that says the plans are
// saved here and offers a backup. One card at a time, in the order startCard sets.
//
// This device's own, in localStorage, as the hints are: never part of a plan. This file has no page in it.

import { stamp } from './util';

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Away this many days or more, the app opens on the whole plan, with the card. A day or two away is the same stretch
 * of work: a bed half-planted on Saturday is still the one to zoom in on Sunday or Monday. By three days (longer than
 * a weekend) it's a new sitting, and where the plan was zoomed is more likely forgotten than wanted.
 */
export const WELCOME_BACK_DAYS = 3;
/** A backup older than this, with a plan changed since, is offered again on the card ("Back up"). */
export const BACKUP_STALE_DAYS = 30;

/** The version of the app this device last started. */
const VERSION_KEY = 'lp-app-version';
/** The visits counted on this device: how many, and the day of the last one (src/welcome.ts arrive). */
const VISITS_KEY = 'lp-visits';
/** The second visit's card: shown, or not needed (backed up already, or syncing). Once set, never again. */
const SAVED_KEY = 'lp-saved-here';
/** In sessionStorage, not localStorage: this window's visit has been counted (a reload in it is the same visit). */
const SESSION_KEY = 'lp-visit-counted';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
function local(): Store | null { try { return localStorage; } catch { return null; } }
function session(): Store | null { try { return sessionStorage; } catch { return null; } }
function get(s: Store | null, key: string): string | null { try { return s?.getItem(key) ?? null; } catch { return null; } }
function put(s: Store | null, key: string, v: string): void { try { s?.setItem(key, v); } catch { /* not kept: said again, or not */ } }

/** What a start of the app is: worked out once, before the visit is noted (src/hints.ts noteVisit). */
export interface Arrival {
  /** Which visit this is on this device: 1, the first. A start in a window already counted, the same day, isn't one. */
  visit: number;
  /** How long since the app was last on screen (ms); null: never on this device. */
  away: number | null;
  /** Away WELCOME_BACK_DAYS or more. */
  gap: boolean;
  /** The first start of a new version: this device last started another (or one from before versions were kept). */
  updated: boolean;
}

interface Visits { n: number; day: string }
function readVisits(s: Store | null): Visits | null {
  try {
    const v = JSON.parse(get(s, VISITS_KEY) ?? 'null') as Partial<Visits> | null;
    return v && Number.isInteger(v.n) && (v.n as number) > 0 && typeof v.day === 'string' ? { n: v.n as number, day: v.day } : null;
  } catch { return null; }
}

/**
 * This start, noted. `lastVisit`: when the app was last on screen here (ms; 0: never), read before it's noted again.
 *
 * A visit is a start of the app after it was closed (a window not counted yet: sessionStorage, which a reload keeps and
 * closing the app clears), or on a later day than the last visit. A device that used the app before visits were
 * counted has had one already. The version is noted for next time.
 */
export function arrive(lastVisit: number, version: string, now = Date.now(), store: Store | null = local(), win: Store | null = session()): Arrival {
  const today = stamp(new Date(now));
  const rec = readVisits(store);
  let visit = rec?.n ?? (lastVisit > 0 ? 1 : 0);
  if (get(win, SESSION_KEY) !== '1' || !rec || rec.day !== today) {
    visit += 1;
    put(store, VISITS_KEY, JSON.stringify({ n: visit, day: today }));
    put(win, SESSION_KEY, '1');
  }
  const was = get(store, VERSION_KEY);
  const updated = was != null ? was !== version : lastVisit > 0;
  if (was !== version) put(store, VERSION_KEY, version);
  const away = lastVisit > 0 ? now - lastVisit : null;
  return { visit, away, gap: away != null && away >= WELCOME_BACK_DAYS * DAY_MS, updated };
}

/** Whether the second visit's card has had its turn on this device (shown, or not needed). */
export const savedHereSettled = (store: Store | null = local()): boolean => get(store, SAVED_KEY) != null;
/** The second visit's card, done with on this device: 'shown', or 'skipped' (backed up already, or syncing). */
export function settleSavedHere(how: 'shown' | 'skipped', store: Store | null = local()): void { put(store, SAVED_KEY, how); }

/** The app as it opens, as far as the start's cards care. */
export interface Scene {
  /** The guided introduction is under way: its card has the screen. */
  touring: boolean;
  /** Something is drawn on the plan (an empty one opens on the first screen, which has its own card). */
  drawn: boolean;
  /** A backup has been made on this device. */
  backedUp: boolean;
  /** Signed in, with sync on for this device: the plans are in the account too. */
  syncing: boolean;
  /** The plans are being saved on this device (not a browser that keeps nothing, nor saves failing). */
  saving: boolean;
}
export type StartCard = 'welcome' | 'saved' | null;

/**
 * Which card the start shows, if any, and whether the plan opens on the whole of it. One card at a time, in this
 * order (what isn't shown waits for a later start, or isn't needed):
 *  1. The guided introduction under way, or nothing drawn (the first screen): neither card, and the view as left.
 *     What's new says so itself, as it always has (src/ui/whats-new-panel.ts).
 *  2. After an update: the welcome-back card, with What's new on it (its notice isn't shown as well).
 *  3. The second visit: "Saved on this phone…", once. Not when backed up already or syncing: then never.
 *  4. After a gap: the welcome-back card.
 * After a gap or an update, the plan opens on the whole of it, whichever card shows.
 */
export function startCard(a: Arrival, s: Scene, store: Store | null = local()): { card: StartCard; fit: boolean } {
  if (s.touring || !s.drawn) return { card: null, fit: false };
  const fit = a.gap || a.updated;
  if (a.updated) return { card: 'welcome', fit };
  if (a.visit >= 2 && !savedHereSettled(store)) {
    if (s.backedUp || s.syncing) settleSavedHere('skipped', store);
    else if (s.saving) return { card: 'saved', fit };
  }
  return { card: a.gap ? 'welcome' : null, fit };
}

/**
 * Whether the card offers a backup: none made on this device, or the last one over BACKUP_STALE_DAYS old with a plan
 * changed since (a backup of plans unchanged since is as good as new, however old).
 */
export function backupDue(lastBackup: number | null, lastChange: number, now = Date.now()): boolean {
  if (!lastBackup) return true;
  return now - lastBackup >= BACKUP_STALE_DAYS * DAY_MS && lastChange > lastBackup;
}

/**
 * This device, as the card names it: "this phone", "this tablet", "this computer", or "this device". `name` is how sync
 * names it (src/sync/sync.ts deviceName). An iPad asking for the desktop site says it's a Mac: told apart by its touch
 * screen.
 */
export function deviceWord(name: string, touchPoints = 0): string {
  if (name === 'Android phone' || name === 'iPhone') return 'this phone';
  if (name === 'Android tablet' || name === 'iPad' || (name === 'Mac' && touchPoints > 1)) return 'this tablet';
  if (['Mac', 'Windows PC', 'Linux computer', 'Chromebook'].includes(name)) return 'this computer';
  return 'this device';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** When the plan last changed, as the card says it: "today", "yesterday", "Oct 28", "Oct 28, 2025". */
export function changedOn(t: number, now = Date.now()): string {
  const d = new Date(t), today = new Date(now);
  if (stamp(d) === stamp(today)) return 'today';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (stamp(d) === stamp(yesterday)) return 'yesterday';
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === today.getFullYear() ? day : `${day}, ${d.getFullYear()}`;
}
