import { recordError } from './error-log';
import { fitAboveKeyboard } from './keyboard';

// The app's height, measured by the window itself. The app fills the window (styles.css, .app): by CSS, 100dvh less
// the keyboard (src/keyboard.ts). Android Chrome has been seen to lay the installed app out taller than its screen
// after it reloaded for an update, and to put it right only when the app was left and opened again (Jason,
// 2026-10-31, on Next: the bar at the bottom cut off, a white strip of it showing). So the window's own height,
// innerHeight, is set as --app-h, which the app's height uses in place of 100dvh, whenever it may have changed:
// at start and a few times just after (a browser may settle on its size without saying so), when the page is shown
// again or comes back from the background, and on every resize and rotation. And if anything scrolls the page
// itself (it never scrolls: its sheets and lists do), it's put back at once: an element brought into view scrolls
// every box above it, the page too, and a page scrolled most of a screen down showed nothing at all, the bar at the
// bottom at its top (the UI review, 2026-11-01, on a phone). Its cause there, a hidden span that made the page
// taller than the screen, is fixed in styles.css (the overlays clip what they hold); this is for any other. CSS and scrolling only: nothing re-renders, so a field
// being typed in keeps its focus (CLAUDE.md, keyboard safety).

let lastHeight = 0;
let noted = false;

/**
 * The app's height set from the window's, and the page (the document, its body, the app's root) scrolled back to
 * its top if it had moved. `check`: a timed look, not an event's: a change found then is one the browser made
 * without saying so.
 */
export function fitToWindow(check = false): void {
  // (Which boxes had scrolled is read first: fitted to the window, a box no longer overflows, and its scroll is gone.)
  const moved = typing() || zoomed() ? [] : pageBoxes().filter((b) => b.scrollTop !== 0 || b.scrollLeft !== 0);
  if (moved.length && !scrollNoted) {
    scrollNoted = true;
    recordError(`The page had scrolled ${Math.round(moved[0]!.scrollTop)} px down: put back`, 'layout');
  }
  const h = Math.round(window.innerHeight);
  if (h > 0) {
    note(h, check);
    document.documentElement.style.setProperty('--app-h', h + 'px');
    lastHeight = h;
  }
  fitAboveKeyboard();
  for (const box of moved) box.scrollTo(0, 0);
}

let scrollNoted = false;
/** The boxes that hold the whole app: the document, its body, the app's root. None of them should ever scroll. */
function pageBoxes(): Element[] {
  return [document.scrollingElement, document.body, document.getElementById('root')].filter((b): b is Element => !!b);
}

/** The page pinch-zoomed (a menu or sheet, made bigger to read): where it's scrolled is the person's doing. */
function zoomed(): boolean {
  return Math.abs((window.visualViewport?.scale ?? 1) - 1) > 0.01;
}

/** Once per run, for a support file (src/error-log.ts): the window's height far from 100dvh, or changed unannounced. */
function note(h: number, check: boolean) {
  if (noted || !document.body) return;
  let said = '';
  if (check && lastHeight && Math.abs(h - lastHeight) > 40) said = `The window's height went from ${lastHeight} to ${h} px with no resize`;
  else {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100dvh;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const dvh = Math.round(probe.getBoundingClientRect().height);
    probe.remove();
    if (dvh > 0 && Math.abs(dvh - h) > 40) said = `100dvh was ${dvh} px in a window ${h} px tall`;
  }
  if (!said) return;
  noted = true;
  recordError(`${said}: the app fitted to the window`, 'layout');
}

/** A text field has the focus (the keyboard may be up, and the browser may have scrolled to show it). */
function typing(): boolean {
  const a = document.activeElement;
  return !!a && a.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea, select, [contenteditable=true]');
}

/** Fit now and a few times after start, and again whenever the page is shown or brought back. */
export function installAppHeight(): void {
  const later = () => fitToWindow(true);
  fitToWindow();
  requestAnimationFrame(later);
  for (const ms of [500, 1500, 4000]) setTimeout(later, ms);
  window.addEventListener('pageshow', () => fitToWindow());
  window.addEventListener('focus', () => fitToWindow());
  window.addEventListener('orientationchange', () => { fitToWindow(); setTimeout(later, 500); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    fitToWindow();
    setTimeout(later, 500);
  });
  // The page itself scrolled: back at once (a scroll doesn't bubble: caught on its way down). While a field is being
  // typed in, the browser may be showing it above the keyboard: then when the field's left.
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (t === document || (t instanceof Element && pageBoxes().includes(t))) fitToWindow();
  }, true);
  document.addEventListener('focusout', () => setTimeout(() => fitToWindow(), 0));
}
