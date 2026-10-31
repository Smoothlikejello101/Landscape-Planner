// The size of the names on the plan, apart from the app's text size (Jason, Oct 31, from round 3: Ruth and Bea found
// Text size didn't grow the plan's own labels). Two settings, not one: bigger names fit inside fewer circles and
// cover more of the plan, which someone who wants bigger menus may not want. Medium, the default, is the size they've
// always been; Small fits more names inside their circles on a crowded plan, Large reads from further off. Names that
// don't fit, at any size, are written over the edge where there's room or left for when the plant is selected
// (src/labels.ts), so a larger size hides some names rather than piling them up.
//
// The plan on screen only: print and the PNG keep their own sizes, set for paper. Kept on this device.

export type LabelSize = 'small' | 'medium' | 'large';
export const LABEL_SIZES: { key: LabelSize; name: string; scale: number }[] = [
  { key: 'small', name: 'Small', scale: 0.85 },
  { key: 'medium', name: 'Medium', scale: 1 },
  { key: 'large', name: 'Large', scale: 1.25 },
];
export const DEFAULT_LABEL_SIZE: LabelSize = 'medium';
const KEY = 'lp-label-size';

const isSize = (v: unknown): v is LabelSize => LABEL_SIZES.some((s) => s.key === v);
let current: LabelSize = (() => {
  try { const v = localStorage.getItem(KEY); return isSize(v) ? v : DEFAULT_LABEL_SIZE; } catch { return DEFAULT_LABEL_SIZE; }
})();

/** The plan's label size on this device. */
export const labelSize = (): LabelSize => current;
/** How much bigger (or smaller) than Medium the plan's names are drawn. */
export const labelScale = (): number => LABEL_SIZES.find((s) => s.key === current)!.scale;
/** Change it, here and on this device from now on. */
export function setLabelSize(size: LabelSize) {
  if (!isSize(size)) return;
  current = size;
  try { localStorage.setItem(KEY, size); } catch { /* this session only */ }
}
