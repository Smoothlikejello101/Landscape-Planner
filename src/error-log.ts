// The app's own errors, the last few, kept on this device for a support file (src/support.ts; Jason, 2026-10-29: "a
// support export … accessible from Send feedback"). Nothing is sent anywhere: the list goes to us only if the person
// saves a support file and attaches it to an email. Kept in localStorage, so yesterday's crash is still there today.
// A list that can't be read (cleared, or garbage) is an empty list; writing never throws.

export const ERROR_LOG_KEY = 'lp-errors';
/** How many it keeps (the latest), and how much of each one's stack. */
export const MAX_ERRORS = 30;
const MAX_STACK = 1500, MAX_MESSAGE = 500;

export interface ErrorEntry {
  /** When it first happened, and last (ms). */
  at: number;
  last?: number;
  /** How many times in a row (the same error again is counted, not listed again). */
  count?: number;
  /** Where the app caught it ("save", "window", "promise"…). */
  where: string;
  message: string;
  stack?: string;
  /** The app's version when it happened. */
  version?: string;
}
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const store = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** The kept errors, oldest first; [] where none can be read. */
export function readErrors(s: Store | null = store()): ErrorEntry[] {
  try {
    const raw = JSON.parse(s?.getItem(ERROR_LOG_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((e): e is ErrorEntry => !!e && typeof e === 'object' && typeof e.message === 'string' && typeof e.at === 'number') : [];
  } catch { return []; }
}
/** An error as it's kept: its message and the top of its stack, cut short. */
export function errorEntry(e: unknown, where: string, now: number, version?: string): ErrorEntry {
  const err = e instanceof Error ? e : null;
  const message = (err ? `${err.name}: ${err.message}` : typeof e === 'string' ? e : (() => { try { return JSON.stringify(e); } catch { return String(e); } })()) ?? String(e);
  const stack = err?.stack ? err.stack.split('\n').slice(0, 12).join('\n').slice(0, MAX_STACK) : undefined;
  return { at: now, where, message: message.slice(0, MAX_MESSAGE), ...(stack ? { stack } : {}), ...(version ? { version } : {}) };
}
/** Keep an error: the same one as the last is counted; only the latest MAX_ERRORS are kept. */
export function recordError(e: unknown, where: string, now = Date.now(), s: Store | null = store()): void {
  if (!s) return;
  try {
    const entry = errorEntry(e, where, now, typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined);
    const list = readErrors(s);
    const prev = list[list.length - 1];
    if (prev && prev.message === entry.message && prev.where === entry.where) {
      prev.count = (prev.count ?? 1) + 1;
      prev.last = now;
    } else list.push(entry);
    s.setItem(ERROR_LOG_KEY, JSON.stringify(list.slice(-MAX_ERRORS)));
  } catch { /* full or blocked: not kept */ }
}
/** Keep what nothing else caught: errors thrown on the page, and promises rejected with no handler. */
export function installErrorLog(): void {
  window.addEventListener('error', (ev) => {
    const where = ev.filename ? `window (${ev.filename.replace(location.origin, '')}:${ev.lineno}:${ev.colno})` : 'window';
    recordError(ev.error ?? ev.message, where);
  });
  window.addEventListener('unhandledrejection', (ev) => recordError(ev.reason, 'promise'));
}
