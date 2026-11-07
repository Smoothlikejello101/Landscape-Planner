// Keeping the app above the on-screen keyboard.
//
// Android Chrome is told (index.html: interactive-widget=resizes-content) to
// shrink the page when the keyboard opens, so the bottom sheets move up with
// it. Where a browser only shrinks the visual viewport instead (iOS, older
// Android), the keyboard's height is measured here and the app is shortened
// by that much through a CSS variable. Either way only CSS changes: nothing
// re-renders, so the field being typed in keeps its focus.

/** Height (px) of whatever covers the bottom of the page: the keyboard, or 0. */
export function keyboardInset(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  // Zoomed in, the visual viewport is smaller for that reason alone: no keyboard to measure.
  if (Math.abs((vv.scale ?? 1) - 1) > 0.01) return 0;
  const covered = window.innerHeight - vv.height - vv.offsetTop;
  // Pinch zoom and browser toolbars move the visual viewport a little: only a keyboard-sized gap counts.
  return covered > 80 ? Math.round(covered) : 0;
}
export function fitAboveKeyboard() {
  document.documentElement.style.setProperty('--kb', keyboardInset() + 'px');
}

// A sheet's top stays where it is while the keyboard comes and goes (Jason, Nov 5, on the release: a misspelled name in
// "Add a plant" tapped, Android's spelling menu and the keyboard came and went over and over, and the whole sheet
// jumped up and down with them). A tall sheet was 85% of the window's height, from its foot: the keyboard shortens
// the window, so each time it came or went the sheet, the field and the word being fixed moved by a sixth of the
// keyboard's height (44 px on a Pixel 7), the plan above flashing, and the spelling menu, left where the word had been,
// ended up over it. Now a sheet's top is 15% of the window's height with no keyboard up (styles.css, .sheet; this
// height, --rest-h, src/app-height.ts): the keyboard takes room from the sheet's foot only, and the field is kept in
// sight above it (keepFieldInView, below).

/** What's known as the window changes: whether a field is being typed in, or was just left; a mouse and keyboard. */
export interface RestWhy { typing: boolean; fieldLeft: boolean; mouse: boolean }
/**
 * The window's height with no on-screen keyboard up, given what it was (`was`, at its width) and the window now, `h` px
 * tall and `w` wide. Taller or as tall: the window's own, the keyboard gone. Shorter with a field being typed in, or
 * just left (its keyboard still on its way down): the keyboard, so the height without it is kept. Shorter with nothing
 * typed in: the window made smaller (split screen). Turned, or a computer's window (no on-screen keyboard): the window's.
 */
export function restingHeight(was: { h: number; w: number }, h: number, w: number, why: RestWhy): number {
  if (!was.h || w !== was.w || h >= was.h || why.mouse) return h;
  return why.typing || why.fieldLeft ? was.h : h;
}

/** A field that holds typing (text, a number, a choice being made), not a button, box or slider. */
const typingIn = (t: Element): boolean => t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
  || (t instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit', 'color', 'file'].includes(t.type));

/** The box `el` scrolls in: the nearest one above it that scrolls, up to its sheet or dialog. */
function scrollerOf(el: HTMLElement, sheet: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY)) return p;
    if (p === sheet) break;
  }
  return null;
}

/** The height (px) left above the keyboard when last looked at: a field is brought into sight only as it shrinks. */
let lastRoom = 0;
/**
 * The field being typed in, in a sheet or dialog, kept in sight as the room above the keyboard shrinks (the keyboard
 * coming up): its box scrolled just enough to show it, with its label if there's room, between the sheet's header and
 * foot, which stay where they are. Nothing else moves; nothing is drawn again. Called whenever the app fits itself to
 * the window (src/app-height.ts): with more room, or the same (the keyboard going, a sheet scrolled by hand), it does
 * nothing.
 */
export function keepFieldInView(): void {
  const room = window.innerHeight - keyboardInset();
  const shrank = lastRoom > 0 && room < lastRoom - 1;
  lastRoom = room;
  if (!shrank) return;
  const a = document.activeElement;
  if (!(a instanceof HTMLElement) || !typingIn(a)) return;
  const sheet = a.closest<HTMLElement>('.sheet, .modal');
  const box = sheet && scrollerOf(a, sheet);
  if (!box) return;
  const r = box.getBoundingClientRect();
  // (Under a header or over a foot that stays put as the box scrolls: the room is between them.)
  const header = box.querySelector<HTMLElement>(':scope > .sheet-header'), foot = box.querySelector<HTMLElement>(':scope > .sheet-foot');
  const top = header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : r.top;
  const bottom = Math.min(foot && getComputedStyle(foot).position === 'sticky' ? foot.getBoundingClientRect().top : r.bottom,
    window.innerHeight - keyboardInset());
  const pad = 8;
  const field = a.closest<HTMLElement>('.field');
  const want = (field && box.contains(field) && field.getBoundingClientRect().height <= bottom - top - 2 * pad ? field : a).getBoundingClientRect();
  let dy = 0;
  if (want.bottom > bottom - pad) dy = want.bottom - (bottom - pad);
  if (want.top - dy < top + pad) dy = want.top - (top + pad);
  if (Math.abs(dy) >= 1) box.scrollTop += dy;
}
