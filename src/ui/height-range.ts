import { el } from '../dom';

// The picker's mature-size filters, height and width: a slider with two handles over fixed stops (feet), finer where
// plants are small. The left end is "no smallest", the right end "no largest". Made like the sun-hours slider
// (time-range.ts): two overlaid range inputs. (Width, as height, asked for by Jason, Oct 31: "something you'd expect".)

/** The stops, in feet; the last means "and taller" (or wider). */
export const HEIGHT_STOPS: readonly number[] = [0, 1, 2, 3, 4, 6, 8, 10, 15, 20, 30, 40, 60, 80, 100];
const LAST = HEIGHT_STOPS.length - 1;

/** Which size: its words, for the readout, the handles and the tests. */
export type SizeKind = 'height' | 'width';
const WORDS: Record<SizeKind, { any: string; more: string; small: string; large: string; name: string }> = {
  height: { any: 'Any height', more: 'taller', small: 'shortest', large: 'tallest', name: 'Mature height' },
  width: { any: 'Any width', more: 'wider', small: 'narrowest', large: 'widest', name: 'Mature width' },
};

/** The filter's value: "lo-hi" in feet, either end empty when open ("-10", "20-"); "" for any size. */
export function heightValue(lo: number, hi: number): string {
  const a = lo > 0 ? String(HEIGHT_STOPS[lo]) : '', b = hi < LAST ? String(HEIGHT_STOPS[hi]) : '';
  return a || b ? `${a}-${b}` : '';
}
/** The stops a value sits at ([0, last] for any size); a value between stops goes to the nearest. */
export function heightStops(value: string): [number, number] {
  const [a, b] = (value || '-').split('-');
  const nearest = (ft: number) => HEIGHT_STOPS.reduce((best, s, i) => (Math.abs(s - ft) < Math.abs(HEIGHT_STOPS[best]! - ft) ? i : best), 0);
  const at = (ft: string, open: number) => (ft === '' ? open : nearest(Number(ft)));
  return [at(a ?? '', 0), at(b ?? '', LAST)];
}
/** The value in words: "Any height", "Up to 10 ft", "20 ft and taller", "4–10 ft" (a width: "Any width", "… and wider"). */
export function sizeLabel(value: string, kind: SizeKind = 'height'): string {
  const [a, b] = (value || '-').split('-');
  if (!a && !b) return WORDS[kind].any;
  if (!a) return `Up to ${b} ft`;
  if (!b) return `${a} ft and ${WORDS[kind].more}`;
  return `${a}–${b} ft`;
}
export const heightLabel = (value: string): string => sizeLabel(value, 'height');

/**
 * The control. `onInput` fires while dragging (for the readout), `onChange` when a handle is let go (for the
 * list), each with the new value.
 */
export function heightRange(value: string, onInput: (v: string) => void, onChange: (v: string) => void, kind: SizeKind = 'height'): HTMLElement {
  const w = WORDS[kind];
  const [lo0, hi0] = heightStops(value);
  const mk = (v: number, label: string, testId: string) => el('input', { type: 'range', min: 0, max: LAST, step: 1, value: v, 'aria-label': label, 'data-testid': testId });
  const a = mk(lo0, `${w.small[0].toUpperCase()}${w.small.slice(1)} ${w.name.toLowerCase()}`, `${kind}-min`);
  const b = mk(hi0, `${w.large[0].toUpperCase()}${w.large.slice(1)} ${w.name.toLowerCase()}`, `${kind}-max`);
  const fill = el('div', { className: 'tr-fill' });
  // (Once let go, the handles are put in order, a step apart: a handle dragged past the other trades places with
  // it, so each keeps its label for a screen reader; "Up to 0 ft", or a range of one stop, would find nothing.
  // Not while dragging: the handle under the finger mustn't jump.)
  const sync = (settle = false) => {
    let lo = Number(a.value), hi = Number(b.value);
    if (lo > hi) [lo, hi] = [hi, lo];
    if (lo === hi) { if (hi < LAST) hi++; else lo--; }
    if (settle) { a.value = String(lo); b.value = String(hi); }
    fill.style.left = (lo / LAST) * 100 + '%';
    fill.style.width = ((hi - lo) / LAST) * 100 + '%';
    const text = (i: number) => (i === 0 ? `no ${w.small}` : i === LAST ? `no ${w.large}` : `${HEIGHT_STOPS[i]} ft`);
    a.setAttribute('aria-valuetext', text(Number(a.value)));
    b.setAttribute('aria-valuetext', text(Number(b.value)));
    return heightValue(lo, hi);
  };
  a.addEventListener('input', () => onInput(sync()));
  b.addEventListener('input', () => onInput(sync()));
  a.addEventListener('change', () => onChange(sync(true)));
  b.addEventListener('change', () => onChange(sync(true)));
  sync(true);
  return el('div', { className: `time-range height-range ${kind}-range`, role: 'group', 'aria-label': w.name },
    el('div', { className: 'tr-track' }, fill), a, b,
    el('div', { className: 'tr-scale' }, el('span', {}, 'any'), el('span', {}, '10 ft'), el('span', {}, '100+ ft')));
}
