// Text size (decided with Jason, 2026-10-25, from mockups of five screens at three sizes): Medium, 125% of the size
// the app was drawn at, is the default; Small (that size) and Large (145%) are in the ⋮ menu. Every size scales all
// of the text by one factor (styles.css: --ts on <html>), so a source stays a step smaller than the fact it backs.
// At Medium and Large the top bar keeps room for the plan's name: no shape count or zoom (the zoom shows for a
// moment while it changes) and Redo in the ⋮ menu (src/ui/render.ts).
//
// Kept on this device, not with the plan: a phone and a laptop want different sizes.

export type TextSize = 'small' | 'medium' | 'large';
export const TEXT_SIZES: { key: TextSize; name: string; scale: number }[] = [
  { key: 'small', name: 'Small', scale: 1 },
  { key: 'medium', name: 'Medium', scale: 1.25 },
  { key: 'large', name: 'Large', scale: 1.45 },
];
export const DEFAULT_TEXT_SIZE: TextSize = 'medium';
const KEY = 'lp-text-size';

const isSize = (v: unknown): v is TextSize => TEXT_SIZES.some((s) => s.key === v);
let current: TextSize = (() => {
  try { const v = localStorage.getItem(KEY); return isSize(v) ? v : DEFAULT_TEXT_SIZE; } catch { return DEFAULT_TEXT_SIZE; }
})();

/** The text size on this device. */
export const textSize = (): TextSize => current;
/** Medium or Large: the top bar keeps room for the plan's name. */
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
