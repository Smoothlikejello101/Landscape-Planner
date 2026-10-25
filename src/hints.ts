// Hints: a few words the first times something comes up on this device, then no more. After 60 days away from the
// app, each shows once more (decided with Jason, 2026-10-25: returning users get the hints back, once each).
// Kept in localStorage, per device: a hint's key holds how many times it has shown, `<key>-at` when it last did.

const DAY_MS = 24 * 60 * 60 * 1000;
export const AWAY_DAYS = 60;
/** When the app was last open or left (ms). */
const VISIT_KEY = 'lp-last-visit';
/** When the app was last opened after AWAY_DAYS or more away (ms). */
const RETURN_KEY = 'lp-returned';

function num(key: string): number {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}
function put(key: string, v: number): void {
  try { localStorage.setItem(key, String(v)); } catch { /* no storage: nothing kept */ }
}

/** The app was opened, brought back or left. Opened after AWAY_DAYS or more away: the person is back. */
export function noteVisit(now = Date.now()): void {
  const last = num(VISIT_KEY);
  if (last && now - last >= AWAY_DAYS * DAY_MS) put(RETURN_KEY, now);
  put(VISIT_KEY, now);
}

/**
 * Whether the hint kept under `key` is due: shown fewer than `times` times on this device, or not since the person
 * came back from a long time away. Never where nothing can be kept (rather than every time).
 */
export function hintDue(key: string, times: number): boolean {
  let n: number;
  try { n = Number(localStorage.getItem(key)) || 0; } catch { return false; }
  if (n < times) return true;
  const back = num(RETURN_KEY);
  return back > 0 && num(key + '-at') < back;
}

/** Count the hint kept under `key` as shown. */
export function hintShown(key: string, now = Date.now()): void {
  put(key, num(key) + 1);
  put(key + '-at', now);
}
