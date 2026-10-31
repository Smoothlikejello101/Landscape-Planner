// What's new: what changed in each update, in plain words, for the people using the app (Jason, Oct 31: before the
// beta invites go out, testers should be able to see what changed in a new version). After an update, a notice says
// so once and opens the list; ⋮ → What's new opens it any time (src/ui/whats-new-panel.ts).
//
// A change people will notice adds a line here, in the pull request that makes it: to a new release at the top
// (the next id), or to the top one if it hasn't shipped yet. Say what they'll see, not how it was built; no "tap"
// or "click" (a phone and a computer both read it).

export interface Release {
  /** One more than the release below it: what this device has seen is kept by it. */
  id: number;
  /** The day it shipped, YYYY-MM-DD. */
  date: string;
  /** What's new, a line each. */
  items: string[];
}

/** Newest first. */
export const RELEASES: Release[] = [
  {
    id: 1,
    date: '2026-10-31',
    items: [
      'Settings has a sheet of its own: ⋮ → Settings. Text size, the size of names on the plan, drawing aids and warnings are all there.',
      'Settings → Warnings → “In this plan now” lists every warning in the open plan, and can show again ones you dismissed.',
      'Print starts from what the screen shows: the plants shown or hidden, names on or off, the month.',
      'A plant’s details say when the U.S. Geological Survey lists it as invasive in the lower 48. A plant your state’s law bans is left out while you browse; a search still finds it, with a red “Place (banned)”.',
      'Redo is easier to find: after an undo, it shows next to Undo.',
      'A tree you draw that’s already in the yard is marked Existing, not Planted.',
      'This list: after an update, a notice says what’s new; ⋮ → What’s new shows it any time.',
    ],
  },
];

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

/** "Oct 31, 2026". */
export function releaseDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return month && d ? `${month} ${d}, ${y}` : date;
}
