// What's new: what changed in each update, in plain words, for the people using the app (Jason, Oct 31: before the
// beta invites go out, testers should be able to see what changed in a new version). After an update, a notice says
// so once and opens the list; ⋮ → What's new opens it any time (src/ui/whats-new-panel.ts).
//
// The releases are in src/whats-new.json. A change people will notice adds its lines in the pull request that makes
// it, as a file of its own, src/whats-new/next/<branch>.json (a JSON list of lines: src/whats-new-pending.ts); they
// join the release not yet out (the top one, dated "next", or a new one). Right after a release, they’re moved into
// src/whats-new.json with its date (docs/releasing.md). Say what they'll see, not how it was built; no "tap" or
// "click" (a phone and a computer both read it).

import dated from './whats-new.json';
import { withPending, type Release } from './whats-new-pending';
import { CHANNEL, type Channel } from './channel';
import { stamp } from './util';

export type { Release };

/** The lines waiting for the release not yet out, a file a pull request (none: the folder holds only its README). */
const waiting = import.meta.glob<string[]>('./whats-new/next/*.json', { eager: true, import: 'default' });

/**
 * Newest first: src/whats-new.json's releases, with the waiting lines (data, so CI can compare them with the release
 * branch's: scripts/release/whats-new-check.mjs).
 */
export const RELEASES: Release[] = withPending(dated, Object.entries(waiting).map(([path, lines]) => [path.slice(path.lastIndexOf('/') + 1), lines]));

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

/**
 * The day this copy of the app was built, as the person's own calendar has it ("2026-11-01"), as the files they save
 * are dated (src/util.ts stamp). The build keeps its time in UTC (vite.config.ts), which late in the evening in Arkansas
 * is already tomorrow: ⋮'s version line said 2026-11-02 at 6:18 PM on Nov 1 (the bug hunt, Nov 1). A date with no time
 * is shown as it is.
 */
export function builtOn(built = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : ''): string {
  const t = built.includes('T') ? new Date(built) : null;
  return t && !Number.isNaN(t.getTime()) ? stamp(t) : built;
}

/**
 * "Oct 31, 2026"; the release not yet out: in Next, "Not released yet" (Jason, Oct 31: its changes are already running
 * there; what they await is the testers' app), in a release build, its build day.
 */
export function releaseDate(date: string, channel: Channel = CHANNEL, built = builtOn()): string {
  if (date === 'next') {
    if (channel === 'next' || !built) return 'Not released yet';
    date = built;
  }
  const [y, m, d] = date.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return month && d ? `${month} ${d}, ${y}` : date;
}
