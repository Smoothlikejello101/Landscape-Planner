import { state } from '../state';

// Brief, non-blocking status messages ("Backup saved").

let timer: ReturnType<typeof setTimeout> | null = null;
/** When the plain notice last went up. */
let shownAt = 0;

export function toast(message: string, ms = 3000) {
  let node = document.getElementById('toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'toast';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    document.body.appendChild(node);
  }
  node.textContent = message;
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
  if (document.querySelector('.sheet')) {
    // (Under the guided introduction's card, which sits at the top while a sheet is open.)
    const card = document.querySelector('.intro-card.at-top')?.getBoundingClientRect();
    node.style.top = card && card.height > 0 ? `${Math.round(card.bottom + 8)}px` : 'calc(60px + env(safe-area-inset-top))';
    node.style.bottom = 'auto';
    return;
  }
  let top = Infinity;
  for (const e of document.querySelectorAll('.sel-pill, .multi-bar, .intro-card')) {
    const r = e.getBoundingClientRect();
    if (r.height > 0) top = Math.min(top, r.top);
  }
  if (top < Infinity) node.style.bottom = `${Math.max(80, Math.round(window.innerHeight - top + 8))}px`;
}

/**
 * A notice with buttons ("Squared the corners. Undo"), kept up long enough to reach: tapping a button runs it
 * and closes the notice (unless it's `keep`: turning a setting off leaves the Undo there). A new notice
 * replaces it. With `detail`, the message is one short line that opens to say more (Jason, 2026-10-27: a notice
 * mustn't get in the way); opened, it stays up while it's read. `tone` marks it amber or red.
 */
export function toastAction(message: string, actions: { label: string; run: () => void; keep?: boolean; className?: string }[], ms = 10000, testid?: string,
  opts: { detail?: string; tone?: 'amber' | 'red' } = {}) {
  toast('', 1); // (clears a plain toast)
  document.getElementById('toast-action')?.remove();
  const node = document.createElement('div');
  node.id = 'toast-action';
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
    words.textContent = message;
    const chev = document.createElement('span');
    chev.className = 'notice-chev';
    chev.setAttribute('aria-hidden', 'true');
    line.append(words, chev);
    const more = document.createElement('div');
    more.className = 'notice-detail';
    more.dataset.testid = 'notice-detail';
    more.textContent = opts.detail;
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
    text.textContent = message;
    node.appendChild(text);
  }
  const buttons = document.createElement('div');
  buttons.className = 'notice-buttons';
  for (const a of actions) {
    const b = document.createElement('button');
    b.textContent = a.label;
    if (a.className) b.className = a.className;
    b.addEventListener('click', () => { if (a.keep) b.remove(); else node.remove(); a.run(); });
    buttons.appendChild(b);
  }
  node.appendChild(buttons);
  // Put away without its buttons (Jason, 2026-10-27): ✕, or a swipe sideways.
  const close = document.createElement('button');
  close.className = 'notice-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Dismiss');
  close.dataset.testid = 'notice-close';
  close.addEventListener('click', () => node.remove());
  node.appendChild(close);
  swipeAway(node);
  document.body.appendChild(node);
  placeNotice();
  requestAnimationFrame(placeNotice);
  const tick = () => { if (!node.isConnected) return; const left = closeAt - Date.now(); if (left <= 0) node.remove(); else setTimeout(tick, left); };
  setTimeout(tick, ms);
}
/**
 * Where a notice with buttons sits: at the top of the plan; with a sheet open, just above the sheet, so it never
 * covers the sheet's own buttons (its close, say), and as high as the screen allows when the sheet is tall.
 * Run after every render (a sheet opening under a notice moves it).
 */
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
  const sheet = document.querySelector('.sheet');
  // (Placing: just above the place bar, by the thumb, its buttons in one row. At the top it covered the new plant and
  // the hint, a third of a small phone at large text. Jason, Oct 31, from round 3: Bea.)
  const bar = !sheet && state.placing ? document.querySelector<HTMLElement>('[data-testid=place-bar]') : null;
  node.classList.toggle('at-bottom', !!bar);
  if (bar) {
    const h = node.getBoundingClientRect().height;
    node.style.top = `${Math.max(8, Math.round(bar.getBoundingClientRect().top - h - 8))}px`;
    return;
  }
  if (!sheet) return;
  const sheetTop = sheet.getBoundingClientRect().top;
  const h = node.getBoundingClientRect().height;
  node.style.top = `${Math.max(8, Math.round(sheetTop - h - 8))}px`;
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
