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
  const covered = window.innerHeight - vv.height - vv.offsetTop;
  // Pinch zoom and browser toolbars move the visual viewport a little: only a keyboard-sized gap counts.
  return covered > 80 ? Math.round(covered) : 0;
}
export function fitAboveKeyboard() {
  document.documentElement.style.setProperty('--kb', keyboardInset() + 'px');
}
