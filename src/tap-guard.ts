// Taps that land on what a tap just put there (round 2 testing, Oct 30).
//
// 1. The plan's own click. A tap on the plan that opens a panel under the finger (the tap that finishes a sun area's
//    circle) is followed by the browser's click for that same tap, and the click lands on whatever button of the
//    panel is now there: "Record sun for this area" was pressed with no one choosing it (Grace, twice). A click whose
//    press was on the plan goes to nothing else.
// 2. A quick second tap. Double-tapping Place in the plant picker dropped a plant where the button had been;
//    double-tapping Done opened the Add sheet that took its place (Sam). A second tap that comes quickly, at the same
//    spot, on something other than what the first one pressed (it went, and something else is there now) is dropped,
//    with its click. The same control drawn again (zoom in, +15°, the next month, a checkbox) takes every tap.

const QUICK_MS = 350, NEAR_PX = 32;
const PLAN = '#canvas-svg';
const CONTROL = 'button, a, input, select, textarea, label, summary, [role=button], [role=tab], [role=option], [role=checkbox]';

/** What a tap pressed, told apart as a person would: the plan, or a control by its name, or neither. */
export function tapTarget(target: EventTarget | null): string {
  const el = target instanceof Element ? target : null;
  if (!el) return '';
  if (el.closest(PLAN)) return 'plan';
  const c = el.closest(CONTROL) as HTMLElement | null;
  if (!c) return 'other';
  return [c.tagName, c.dataset.testid ?? '', c.getAttribute('aria-label') ?? '', (c.textContent ?? '').trim().slice(0, 40)].join('|');
}
/** Where what a tap pressed was, on the screen. */
function areaOf(target: EventTarget | null): Box | null {
  const el = target instanceof Element ? target : null;
  const c = el?.closest(PLAN) ?? el?.closest(CONTROL) ?? el;
  const r = c?.getBoundingClientRect();
  return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
}
type Box = { left: number; top: number; right: number; bottom: number };
export type Tap = { t: number; x: number; y: number; what: string; area: Box | null };

/**
 * Whether a press is a quick second tap on something that wasn't there for the first: soon after, near it, inside
 * what the first one pressed (where it was), and on something else. (A quick tap on the next checkbox down is a
 * tap: it's outside the first.) Pure, for the tests.
 */
export function isStrayTap(prev: Tap | null, now: Tap): boolean {
  if (!prev || now.t - prev.t >= QUICK_MS || Math.hypot(now.x - prev.x, now.y - prev.y) >= NEAR_PX || now.what === prev.what) return false;
  const a = prev.area, pad = 4;
  return !a || (now.x >= a.left - pad && now.x <= a.right + pad && now.y >= a.top - pad && now.y <= a.bottom + pad);
}

export function installTapGuard(win: Window = window) {
  // (Off for the end-to-end tests, which click faster than a person can see: playwright.config.ts. Its own tests,
  // e2e/tap-guard.spec.ts, turn it back on.)
  try { if (win.localStorage.getItem('lp-tap-guard') === 'off') return; } catch { /* storage blocked: on */ }
  let last: Tap | null = null;
  let planPress = false;
  let dropped: number | null = null; // the pointer whose press was dropped
  let dropClickUntil = 0;
  const stop = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };
  win.addEventListener('pointerdown', (e) => {
    const now: Tap = { t: e.timeStamp, x: e.clientX, y: e.clientY, what: tapTarget(e.target), area: areaOf(e.target) };
    if (isStrayTap(last, now)) { last = null; planPress = false; dropped = e.pointerId; stop(e); return; }
    last = now;
    planPress = now.what === 'plan';
  }, true);
  const up = (e: PointerEvent) => {
    if (dropped === null || e.pointerId !== dropped) return;
    dropped = null;
    dropClickUntil = e.timeStamp + 250; // (its click follows its release)
    stop(e);
  };
  win.addEventListener('pointerup', up, true);
  win.addEventListener('pointercancel', up, true);
  win.addEventListener('click', (e) => {
    if (e.timeStamp < dropClickUntil) { dropClickUntil = 0; stop(e); return; }
    // (A click from the keyboard, detail 0, has no press to come from.)
    if (planPress && e.detail !== 0 && tapTarget(e.target) !== 'plan') { planPress = false; stop(e); return; }
    planPress = false;
  }, true);
}
