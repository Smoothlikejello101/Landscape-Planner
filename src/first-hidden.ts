// The first screen put away with its ✕, plan by plan, on this device (Jason, Nov 1: "we need some way to dismiss the
// zip box on the home screen. It's important, but we can still nudge people back to it when they try to do other
// things that require it": Warnings' hardiness card, the plant picker's "Hardy in zone", the bloom calendar and
// ⋮ → Garden location all ask for it there). A note on this device, not part of the plan: an empty plan opened on
// another device still says what FullGrown does.

const KEY = 'lp-first-hidden';
const MAX = 50; // (the newest kept: a list of plan ids that would otherwise only grow)
/** Kept for this session where the browser keeps nothing (a private window). */
const session = new Set<string>();

function stored(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-MAX) : [];
  } catch { return []; }
}

/** Whether this plan's first screen was put away here. */
export function firstHidden(plan: string | null | undefined): boolean {
  return !!plan && (session.has(plan) || stored().includes(plan));
}

/** Put this plan's first screen away, or (Undo) bring it back. */
export function hideFirst(plan: string, hide = true): void {
  if (hide) session.add(plan); else session.delete(plan);
  const list = stored().filter((x) => x !== plan);
  if (hide) list.push(plan);
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch { /* (kept for this session only) */ }
}
