// Text size (decided with Jason, 2026-10-25, from mockups of five screens at three sizes; four sizes since 2026-10-27,
// when Medium read like a large-print book): Medium, 115% of the size the app was drawn at, is the default, its main
// text 16 px (Small's 14); Small (that size), Large (130%) and Extra large (145%, the Large of before) are in the ⋮
// menu. Apple's guidance is 17 pt for body text and 11 pt at the least; Medium's smallest labels are 11.5 px. Every
// size scales all of the text by one factor (styles.css: --ts on <html>), so a source stays a step smaller than the
// fact it backs. Above Small the top bar keeps room for the plan's name: no shape count or zoom (the zoom shows for a
// moment while it changes) and Redo in the ⋮ menu (src/ui/render.ts).
//
// Kept on this device, not with the plan: a phone and a laptop want different sizes. Kept under a new name since the
// sizes changed, read from the old one once: whoever chose Large keeps exactly that size, now called Extra large.

export type TextSize = 'small' | 'medium' | 'large' | 'xlarge';
export const TEXT_SIZES: { key: TextSize; name: string; scale: number }[] = [
  { key: 'small', name: 'Small', scale: 1 },
  { key: 'medium', name: 'Medium', scale: 1.15 },
  { key: 'large', name: 'Large', scale: 1.3 },
  { key: 'xlarge', name: 'Extra large', scale: 1.45 },
];
export const DEFAULT_TEXT_SIZE: TextSize = 'medium';
const KEY = 'lp-text-size-2', OLD_KEY = 'lp-text-size';
/** A size chosen before there were four: Small and Medium as named (Medium now a little smaller), Large as big as it was. */
const FROM_OLD: Record<string, TextSize> = { small: 'small', medium: 'medium', large: 'xlarge' };

const isSize = (v: unknown): v is TextSize => TEXT_SIZES.some((s) => s.key === v);
let current: TextSize = (() => {
  try {
    const v = localStorage.getItem(KEY);
    if (isSize(v)) return v;
    const old = FROM_OLD[localStorage.getItem(OLD_KEY) ?? ''];
    return old ?? DEFAULT_TEXT_SIZE;
  } catch { return DEFAULT_TEXT_SIZE; }
})();

/** The text size on this device. */
export const textSize = (): TextSize => current;
/** Above Small: the top bar keeps room for the plan's name. */
export const roomyText = (): boolean => current !== 'small';
/** The page at the text size on this device (at start, and after a change). */
export function applyTextSize() {
  document.documentElement.dataset.text = current;
}
/** Change it, here and on this device from now on. */
export function setTextSize(size: TextSize) {
  if (!isSize(size)) return;
  current = size;
  try { localStorage.setItem(KEY, size); } catch { /* this session only */ }
  applyTextSize();
}
