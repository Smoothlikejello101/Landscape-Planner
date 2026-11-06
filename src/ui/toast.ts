import { state } from '../state';
import { tapSaid } from '../dom';

// Brief, non-blocking status messages ("Backup saved").

let timer: ReturnType<typeof setTimeout> | null = null;
/** When the plain notice last went up. */
let shownAt = 0;

let keptUntil = 0;
/**
 * A plain notice. `keep`: not to be covered by a passing hint while it shows (`keptToastUp`), as a swap's "Swapped for
 * …" isn't by the ring's hint when its sheet closes (Jason, Nov 5).
 */
export function toast(message: string, ms = 3000, { keep = false }: { keep?: boolean } = {}) {
  keptUntil = keep ? Date.now() + ms : 0;
  let node = document.getElementById('toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'toast';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    document.body.appendChild(node);
  }
  // ("Tap" said as a mouse does it, on a computer: src/dom.ts.)
  node.textContent = tapSaid(message);
  shownAt = Date.now();
  placeToast(node);
  // (Again once this frame's drawing is done: a notice raised as a shape is selected comes before its chip.)
  const n = node;
  requestAnimationFrame(() => placeToast(n));
  node.classList.add('show');
  if (timer) clearTimeout(timer);
  // (Its words go with it: a screen reader, and the page's text, kept reading old notices long after: round 2, Oct 30.)
  timer = setTimeout(() => { n.classList.remove('show'); timer = setTimeout(() => { if (!n.classList.contains('show')) n.textContent = ''; }, 400); }, ms);
}

/** A notice raised with `keep` is still up. */
export const keptToastUp = (): boolean => Date.now() < keptUntil && !!document.getElementById('toast')?.classList.contains('show');

/**
 * A plain notice raised before what just opened (a sheet, the ⋮ menu): put away, not left over its title or its rows
 * (round 3: the tour's last notice sat on the Add sheet and the menu for Ruth, Lena, Grace and Bea). One raised as it
 * opened stays.
 */
export function hideOldToast() {
  const n = document.getElementById('toast');
  if (!n?.classList.contains('show') || Date.now() - shownAt < 400) return;
  n.classList.remove('show');
  n.textContent = '';
  if (timer) { clearTimeout(timer); timer = null; }
}

/** The plain notice put away if it says something now out of date (a hint already acted on). */
export function hideToastSaying(re: RegExp) {
  const n = document.getElementById('toast');
  if (!n?.classList.contains('show') || !re.test(n.textContent ?? '')) return;
  n.classList.remove('show');
  n.textContent = '';
  if (timer) { clearTimeout(timer); timer = null; }
}

/**
 * Where a notice goes: above whatever sits at the foot of the plan (the selected shape's chip with Edit and More,
 * the bar for several shapes), so it never covers their buttons; with a sheet open, at the top, clear of the
 * sheet's own buttons below. (It lets taps through all the same.)
 */
export function placeToast(node: HTMLElement) {
  node.style.top = '';
  node.style.bottom = '';
  node.style.left = '';
  // (Beside the plant picker's panel, on a computer: over the plan left of it, not across the panel.)
  const side = besidePanel();
  if (side) { const w = document.getElementById('canvas-wrap')?.getBoundingClientRect(); if (w) node.style.left = `${Math.round((w.left + side.left) / 2)}px`; }
  if (document.querySelector('.sheet')) {
    // (Under the guided introduction's card, which sits at the top while a sheet is open.)
    const card = document.querySelector('.intro-card.at-top')?.getBoundingClientRect();
    node.style.top = card && card.height > 0 ? `${Math.round(card.bottom + 8)}px` : 'calc(60px + env(safe-area-inset-top))';
    node.style.bottom = 'auto';
    return;
  }
  let top = Infinity;
  for (const e of document.querySelectorAll('.sel-pill, .multi-bar, .walk-chip, .intro-card, .trace-card')) {
    const r = e.getBoundingClientRect();
    if (r.height > 0) top = Math.min(top, r.top);
  }
  if (top < Infinity) node.style.bottom = `${Math.max(80, Math.round(window.innerHeight - top + 8))}px`;
}

/**
 * A notice with buttons ("Squared the corners. Undo"), kept up long enough to reach: tapping a button runs it
 * and closes the notice (unless it's `keep`: turning a setting off leaves the Undo there). A new notice
 * replaces it: one for something new always does, and only notices about the same placement or action keep an order
 * of their own (noticeAbout). With `detail`, the message is one short line that opens to say more (Jason, 2026-10-27: a notice
 * mustn't get in the way); opened, it stays up while it's read. `tone` marks it amber or red. `sub`: a second, quieter
 * line under the message. `untilAction`: no time limit; it goes at the first thing done anywhere else (a press, a key,
 * the wheel), so it never covers what the person came to do (the start's cards: src/ui/welcome-card.ts). A question
 * up over it (src/ui/ask.ts) isn't that: answered, it's still there.
 */
export function toastAction(message: string, actions: { label: string; run: () => void; keep?: boolean; className?: string; icon?: string }[], ms = 10000, testid?: string,
  opts: { detail?: string; tone?: 'amber' | 'red'; sub?: string; untilAction?: boolean } = {}) {
  toast('', 1); // (clears a plain toast)
  document.getElementById('toast-action')?.remove();
  const node = document.createElement('div');
  node.id = 'toast-action';
  raisedAt.set(node, Date.now());
  if (testid) node.dataset.testid = testid;
  if (opts.tone) node.classList.add(`tone-${opts.tone}`);
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  let closeAt = Date.now() + ms;
  if (opts.detail) {
    const line = document.createElement('button');
    line.className = 'notice-line';
    line.setAttribute('aria-expanded', 'false');
    line.dataset.testid = 'notice-line';
    const words = document.createElement('span');
    words.textContent = tapSaid(message);
    const chev = document.createElement('span');
    chev.className = 'notice-chev';
    chev.setAttribute('aria-hidden', 'true');
    line.append(words, chev);
    const more = document.createElement('div');
    more.className = 'notice-detail';
    more.dataset.testid = 'notice-detail';
    more.textContent = tapSaid(opts.detail);
    more.hidden = true;
    line.addEventListener('click', () => {
      more.hidden = !more.hidden;
      line.setAttribute('aria-expanded', String(!more.hidden));
      if (!more.hidden) closeAt = Math.max(closeAt, Date.now() + 30000); // (time to read it)
      placeNotice();
    });
    node.append(line, more);
  } else {
    const text = document.createElement('span');
    text.textContent = tapSaid(message);
    if (opts.sub) {
      node.classList.add('has-sub');
      const sub = document.createElement('span');
      sub.className = 'notice-sub';
      sub.textContent = tapSaid(opts.sub);
      text.appendChild(sub);
    }
    node.appendChild(text);
  }
  const buttons = document.createElement('div');
  buttons.className = 'notice-buttons';
  for (const a of actions) {
    const b = document.createElement('button');
    if (a.className) b.className = a.className;
    // (An icon in place of its word, named for screen readers and on hover: the crowding notice's Settings, so its
    // four buttons keep to one row by the place bar.)
    if (a.icon) { b.innerHTML = a.icon; b.setAttribute('aria-label', a.label); b.title = a.label; b.classList.add('notice-icon'); }
    else b.textContent = tapSaid(a.label);
    b.addEventListener('click', () => { if (a.keep) b.remove(); else node.remove(); a.run(); });
    buttons.appendChild(b);
  }
  node.appendChild(buttons);
  // Put away without its buttons (Jason, 2026-10-27): ✕, or a swipe sideways.
  const close = document.createElement('button');
  close.className = 'notice-close';
  close.textContent = '✕';
  // ("Close": it only puts the notice away. Dismiss is what a warning's own button does: one vocabulary, Nov 1.)
  close.setAttribute('aria-label', 'Close');
  close.dataset.testid = 'notice-close';
  close.addEventListener('click', () => node.remove());
  node.appendChild(close);
  swipeAway(node);
  document.body.appendChild(node);
  placeNotice();
  requestAnimationFrame(placeNotice);
  if (opts.untilAction) { goesAtFirstAction(node); return; }
  const tick = () => { if (!node.isConnected) return; const left = closeAt - Date.now(); if (left <= 0) node.remove(); else setTimeout(tick, left); };
  setTimeout(tick, ms);
}
/** When each notice with buttons went up (ms). */
const raisedAt = new WeakMap<Element, number>();
/**
 * The notice with buttons that's up, if any: its kind (testid), the shape it's about (`about`, set by the notices about a
 * plant or a building), and when it went up (ms).
 */
export function noticeUp(): { testid?: string; about?: string; at: number } | null {
  const n = document.getElementById('toast-action');
  return n ? { testid: n.dataset.testid, about: n.dataset.about, at: raisedAt.get(n) ?? 0 } : null;
}
/**
 * Whether a notice that's up is about this shape: the same placement, whose notice said first keeps its place (a
 * plant placed too close: its crowding notice before its hardiness one). A notice about anything else is older, and a
 * new one replaces it (Jason, Nov 4: a crowding notice didn't show while "Nudged… Undo" for the last plant was up, and
 * the hardiness and fruit-partner notices skipped whenever any notice was up).
 */
export const noticeAbout = (id: string): boolean => noticeUp()?.about === id;
/** Keys that move around the page or hold others, not an action: Tab reaches the notice's own buttons. */
const NOT_ACTIONS = ['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];
/**
 * The notice goes at the first press, key or wheel anywhere but on it (or on a question asked over it). Only the notice
 * is taken away, nothing redrawn: the press may be the start of a pinch or a drag on the plan.
 */
function goesAtFirstAction(node: HTMLElement) {
  const kinds = ['pointerdown', 'keydown', 'wheel'] as const;
  const stop = () => { for (const k of kinds) window.removeEventListener(k, away, true); };
  function away(e: Event) {
    if (!node.isConnected) { stop(); return; }
    const t = e.target instanceof Element ? e.target : null;
    if (t && (node.contains(t) || t.closest('.ask-overlay'))) return;
    if (e instanceof KeyboardEvent && NOT_ACTIONS.includes(e.key)) return;
    stop();
    node.remove();
  }
  for (const k of kinds) window.addEventListener(k, away, true);
}
/**
 * Where a notice with buttons sits: at the top of the plan; with a sheet open, just above the sheet, so it never
 * covers the sheet's own buttons (its close, say), and as high as the screen allows when the sheet is tall.
 * Run after every render (a sheet opening under a notice moves it).
 */
/**
 * The plan's room across (px) for a notice at its top: clear of its side buttons (Warnings, with its count, first among
 * them), and of Warnings beside the plan on a computer, which is beside the plan, not on it (the warnings bug hunt, Nov
 * 1: a placed plant's notice covered the Warnings button and its count on a phone; on a computer, a dismissal's covered
 * the button and Warnings' own header). Null with no plan, or too little room to be worth it.
 */
/**
 * The plant picker's panel beside the plan, on a computer (src/ui/picker-view.ts marks its layer), where it is: the plan
 * is in view beside it, so a notice goes where it would with no sheet open, in the plan's room left of it.
 */
function besidePanel(): DOMRect | null {
  return document.querySelector('.picker-overlay.beside > .picker-sheet')?.getBoundingClientRect() ?? null;
}
export function planRoomAcross(): { x0: number; x1: number } | null {
  const wrap = document.getElementById('canvas-wrap')?.getBoundingClientRect();
  if (!wrap || !wrap.width) return null;
  const side = document.querySelector('#canvas-wrap .zoombtns')?.getBoundingClientRect();
  const x0 = Math.max(8, wrap.left + 8), x1 = Math.min(window.innerWidth - 8, (side && side.width ? side.left : wrap.right) - 8);
  return x1 - x0 >= 200 ? { x0, x1 } : null;
}
export function placeNotice() {
  // A plain notice up when the screen changed (a sheet opened over where it was): placed again, at the top over a
  // sheet (round 2, Oct 30: "Tap again for the bed under it." sat on the plant's edit pane).
  const plain = document.getElementById('toast');
  if (plain?.classList.contains('show')) placeToast(plain);
  const node = document.getElementById('toast-action');
  if (!node) return;
  // A notice about a shape that's gone (undone, deleted): gone with it (Ruth, Oct 30: a crowding notice stayed after
  // Undo took the plant back, and its Move it then had nothing to move).
  if (node.dataset.about && !state.shapes.some((x) => x.id === node.dataset.about)) { node.remove(); return; }
  node.style.top = '';
  node.style.left = '';
  node.style.maxWidth = '';
  // (Beside the plant picker's panel, on a computer, the plan's in view: as with no sheet open, left of the panel.)
  const side = besidePanel();
  const sheet = side ? null : document.querySelector('.sheet');
  const across = () => {
    const r = planRoomAcross();
    if (!r || !side) return r;
    const x1 = Math.min(r.x1, side.left - 8);
    return x1 - r.x0 >= 200 ? { x0: r.x0, x1 } : null;
  };
  // (Placing: just above the place bar, by the thumb, its buttons in one row. At the top it covered the new plant and
  // the hint, a third of a small phone at large text. Jason, Oct 31, from round 3: Bea.)
  const bar = !sheet && state.placing ? document.querySelector<HTMLElement>('[data-testid=place-bar]') : null;
  node.classList.toggle('at-bottom', !!bar);
  if (bar) {
    const h = node.getBoundingClientRect().height;
    node.style.top = `${Math.max(8, Math.round(bar.getBoundingClientRect().top - h - 8))}px`;
    const room = side ? across() : null;
    if (room) { node.style.left = `${Math.round((room.x0 + room.x1) / 2)}px`; node.style.maxWidth = `${Math.round(room.x1 - room.x0)}px`; }
    return;
  }
  // At the top of the plan, in its room across: clear of the side buttons and of Warnings beside the plan.
  const room = !sheet ? across() : null;
  if (room) {
    node.style.left = `${Math.round((room.x0 + room.x1) / 2)}px`;
    node.style.maxWidth = `${Math.round(room.x1 - room.x0)}px`;
  }
  // (An update's banner under the top bar, src/pwa.ts: the notice just below it, not over its Update.)
  const update = !sheet ? document.getElementById('update-banner') : null;
  if (update?.closest('.app')) node.style.top = `${Math.round(update.getBoundingClientRect().bottom + 8)}px`;
  // (Moving the photo: just below the strip saying how, its words and its ✕ left in sight. "Move the plan with the
  // photo?" comes up after each drag there: src/ui/rescale-card.ts.)
  const strip = !sheet && state.bgEditMode ? document.querySelector('[data-testid=mode-strip]')?.getBoundingClientRect() : null;
  if (strip?.height) node.style.top = `${Math.round(strip.bottom + 8)}px`;
  if (!sheet) { keepOffItsShape(node); return; }
  const sheetTop = sheet.getBoundingClientRect().top;
  const h = node.getBoundingClientRect().height;
  node.style.top = `${Math.max(8, Math.round(sheetTop - h - 8))}px`;
}
/**
 * A notice about a shape (a building asked about its size, a plant placed too close) never covers it (Jason, Nov 2,
 * from the UI review): at the top of the plan it would, it goes to the foot of the plan instead, above what's there.
 */
function keepOffItsShape(node: HTMLElement) {
  const id = node.dataset.about;
  const drawn = id && /^[\w-]+$/.test(id) ? document.querySelectorAll(`#canvas-svg [data-shape-id="${id}"]`) : [];
  if (!drawn.length) return;
  const n = node.getBoundingClientRect();
  const covers = [...drawn].some((e) => { const r = e.getBoundingClientRect(); return r.left < n.right && n.left < r.right && r.top < n.bottom && n.top < r.bottom; });
  if (!covers) return;
  let foot = document.getElementById('canvas-wrap')?.getBoundingClientRect().bottom ?? window.innerHeight;
  for (const e of document.querySelectorAll('#canvas-wrap .sel-pill, #canvas-wrap .multi-bar, #canvas-wrap .trace-card, .intro-card')) {
    const r = e.getBoundingClientRect();
    if (r.height) foot = Math.min(foot, r.top);
  }
  node.style.top = `${Math.max(8, Math.round(foot - n.height - 8))}px`;
}
/** How far a notice is swiped before it goes on its own (px), or how fast (px a millisecond). */
const SWIPE_AWAY = 80, SWIPE_FLICK = 0.5;
/**
 * A notice that follows a finger (or the mouse) sideways and goes when let go far enough, or flicked; short of
 * that, it slides back. A press that doesn't move sideways is a tap, its button's as before.
 */
function swipeAway(node: HTMLElement) {
  let start: { x: number; y: number; t: number; id: number } | null = null, dx = 0, swiping = false, swallow = false;
  const at = (x: number) => { node.style.transform = `translateX(calc(-50% + ${x}px))`; node.style.opacity = String(Math.max(0.2, 1 - Math.abs(x) / 240)); };
  node.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId }; dx = 0; swiping = false; });
  node.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    dx = e.clientX - start.x;
    if (!swiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(e.clientY - start.y)) {
      swiping = true;
      node.classList.add('swiping');
      try { node.setPointerCapture(e.pointerId); } catch { /* not capturable: it follows anyway */ }
    }
    if (swiping) at(dx);
  });
  const end = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const was = start;
    start = null;
    if (!swiping) return;
    swiping = false;
    node.classList.remove('swiping');
    // (The click that follows a swipe, if it ended on a button, doesn't press it; nothing later is held back.)
    swallow = true;
    setTimeout(() => { swallow = false; }, 0);
    const speed = Math.abs(dx) / Math.max(1, Date.now() - was.t);
    if (Math.abs(dx) >= SWIPE_AWAY || speed >= SWIPE_FLICK) {
      node.classList.add('gone');
      at(Math.sign(dx || 1) * (window.innerWidth));
      setTimeout(() => node.remove(), 200);
    } else { node.style.transform = ''; node.style.opacity = ''; }
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
  // (A swipe that ends on a button doesn't press it.)
  node.addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
}
/** Close a notice with buttons, if one is up (the next drawing starts, say). */
export function dismissToastAction() { document.getElementById('toast-action')?.remove(); }
/**
 * Another plan opened, or a new one made: the last plan's notices put away (the general bug hunt, Nov 1: a backup's
 * notice stayed up over the new, empty plan; an Undo left up would undo in the plan opened). A plain notice raised as
 * it opened stays (the import that opened it says what came in).
 */
export function planChanged() {
  hideOldToast();
  dismissToastAction();
}
