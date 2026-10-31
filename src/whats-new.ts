// What's new: what changed in each update, in plain words, for the people using the app (Jason, Oct 31: before the
// beta invites go out, testers should be able to see what changed in a new version). After an update, a notice says
// so once and opens the list; ⋮ → What's new opens it any time (src/ui/whats-new-panel.ts).
//
// The releases are in src/whats-new.json. A change people will notice adds a line there, in the pull request that
// makes it, to the release not yet out: the top one, dated "next" (the next id, dated "next", if the top one has
// shipped). Its date is written in once it's out (docs/releasing.md). Say what they'll see, not how it was built; no
// "tap" or "click" (a phone and a computer both read it).

import releases from './whats-new.json';
import { CHANNEL, type Channel } from './channel';

export interface Release {
  /** One more than the release below it: what this device has seen is kept by it. */
  id: number;
  /** The day it shipped, YYYY-MM-DD; "next" for the one not yet out (a release build shows its build day). */
  date: string;
  /** What's new, a line each. */
  items: string[];
}

/** Newest first (src/whats-new.json: data, so CI can compare it with the release branch's: scripts/whats-new-check.mjs). */
export const RELEASES: Release[] = releases;

const KEY = 'lp-whats-new';

/** The newest release's id: what a device that has seen everything has seen. */
export const newestRelease = (releases: Release[] = RELEASES): number => Math.max(0, ...releases.map((r) => r.id));

/** The releases newer than `seen`, newest first. */
export function releasesSince(seen: number, releases: Release[] = RELEASES): Release[] {
  return releases.filter((r) => r.id > seen).sort((a, b) => b.id - a.id);
}

/**
 * The newest release this device had seen, as kept (null: none kept: a new device, or one from before this list).
 */
export function seenRelease(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    const n = v == null ? NaN : Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch { return null; }
}
export function markSeen(id = newestRelease()): void {
  try { localStorage.setItem(KEY, String(id)); } catch { /* no storage: shown again next time */ }
}

/**
 * At start: the releases to tell this device about, and every one counted as seen. Nothing on a new device (the
 * app is new to them, all of it). A device used before this list existed (`usedBefore`: it has a last visit) hears
 * of the newest release only.
 */
export function newsAtStart(usedBefore: boolean, releases: Release[] = RELEASES): Release[] {
  const seen = seenRelease();
  const newest = newestRelease(releases);
  const news = seen == null ? (usedBefore ? releasesSince(newest - 1, releases) : []) : releasesSince(seen, releases);
  if (seen !== newest) markSeen(newest);
  return news;
}

/** "Oct 31, 2026"; the release not yet out: in Next, "Coming in the next update", in a release build, its build day. */
export function releaseDate(date: string, channel: Channel = CHANNEL, built = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : ''): string {
  if (date === 'next') {
    if (channel === 'next' || !built) return 'Coming in the next update';
    date = built;
  }
  const [y, m, d] = date.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return month && d ? `${month} ${d}, ${y}` : date;
}
