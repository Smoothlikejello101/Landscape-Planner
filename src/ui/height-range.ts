import { el } from '../dom';

// The picker's mature-height filter: a slider with two handles over fixed stops (feet), finer where plants are
// short. The left end is "no shortest", the right end "no tallest". Made like the sun-hours slider
// (time-range.ts): two overlaid range inputs.

/** The stops, in feet; the last means "and taller". */
export const HEIGHT_STOPS: readonly number[] = [0, 1, 2, 3, 4, 6, 8, 10, 15, 20, 30, 40, 60, 80, 100];
const LAST = HEIGHT_STOPS.length - 1;

/** The filter's value: "lo-hi" in feet, either end empty when open ("-10", "20-"); "" for any height. */
export function heightValue(lo: number, hi: number): string {
  const a = lo > 0 ? String(HEIGHT_STOPS[lo]) : '', b = hi < LAST ? String(HEIGHT_STOPS[hi]) : '';
  return a || b ? `${a}-${b}` : '';
}
/** The stops a value sits at ([0, last] for any height); a value between stops goes to the nearest. */
export function heightStops(value: string): [number, number] {
  const [a, b] = (value || '-').split('-');
  const nearest = (ft: number) => HEIGHT_STOPS.reduce((best, s, i) => (Math.abs(s - ft) < Math.abs(HEIGHT_STOPS[best]! - ft) ? i : best), 0);
  const at = (ft: string, open: number) => (ft === '' ? open : nearest(Number(ft)));
  return [at(a ?? '', 0), at(b ?? '', LAST)];
}
/** The value in words: "Any height", "Up to 10 ft", "20 ft and taller", "4–10 ft". */
export function heightLabel(value: string): string {
  const [a, b] = (value || '-').split('-');
  if (!a && !b) return 'Any height';
  if (!a) return `Up to ${b} ft`;
  if (!b) return `${a} ft and taller`;
  return `${a}–${b} ft`;
}

/**
 * The control. `onInput` fires while dragging (for the readout), `onChange` when a handle is let go (for the
 * list), each with the new value.
 */
export function heightRange(value: string, onInput: (v: string) => void, onChange: (v: string) => void): HTMLElement {
  const [lo0, hi0] = heightStops(value);
  const mk = (v: number, label: string, testId: string) => el('input', { type: 'range', min: 0, max: LAST, step: 1, value: v, 'aria-label': label, 'data-testid': testId });
  const a = mk(lo0, 'Shortest mature height', 'height-min'), b = mk(hi0, 'Tallest mature height', 'height-max');
  const fill = el('div', { className: 'tr-fill' });
  const sync = () => {
    let lo = Number(a.value), hi = Number(b.value);
    if (lo > hi) [lo, hi] = [hi, lo];
    fill.style.left = (lo / LAST) * 100 + '%';
    fill.style.width = ((hi - lo) / LAST) * 100 + '%';
    a.setAttribute('aria-valuetext', Number(a.value) === 0 ? 'no shortest' : `${HEIGHT_STOPS[Number(a.value)]} ft`);
    b.setAttribute('aria-valuetext', Number(b.value) === LAST ? 'no tallest' : `${HEIGHT_STOPS[Number(b.value)]} ft`);
    return heightValue(lo, hi);
  };
  a.addEventListener('input', () => onInput(sync()));
  b.addEventListener('input', () => onInput(sync()));
  a.addEventListener('change', () => onChange(sync()));
  b.addEventListener('change', () => onChange(sync()));
  sync();
  return el('div', { className: 'time-range height-range' },
    el('div', { className: 'tr-track' }, fill), a, b,
    el('div', { className: 'tr-scale' }, el('span', {}, 'any'), el('span', {}, '10 ft'), el('span', {}, '100+ ft')));
}
