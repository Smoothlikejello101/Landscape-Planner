import { el } from '../dom';
import { DAY_END, DAY_START, formatTime } from '../sun';

// A slider with two handles for a time range (minutes after midnight), made
// of two overlaid range inputs. `onInput` fires while dragging; the caller
// must update without re-rendering the panel (keyboard/focus safety).

export function timeRange(value: [number, number], onInput: (v: [number, number]) => void): { node: HTMLElement; readout: HTMLElement } {
  const step = 30;
  const mk = (v: number, label: string) => el('input', {
    type: 'range', min: DAY_START, max: DAY_END, step, value: v, 'aria-label': label,
  });
  const a = mk(value[0], 'Sun starts'), b = mk(value[1], 'Sun ends');
  const fill = el('div', { className: 'tr-fill' });
  const readout = el('div', { className: 'tr-readout' });
  const sync = () => {
    let lo = Number(a.value), hi = Number(b.value);
    if (lo > hi) [lo, hi] = [hi, lo];
    const span = DAY_END - DAY_START;
    fill.style.left = ((lo - DAY_START) / span) * 100 + '%';
    fill.style.width = ((hi - lo) / span) * 100 + '%';
    readout.textContent = `${formatTime(lo)} – ${formatTime(hi)}`;
    return [lo, hi] as [number, number];
  };
  const changed = () => onInput(sync());
  a.addEventListener('input', changed);
  b.addEventListener('input', changed);
  sync();
  const node = el('div', { className: 'time-range' },
    el('div', { className: 'tr-track' }, fill), a, b,
    // ("noon" where noon is on the track, not half way along it: the day runs 5 am to 9 pm, so half way is 1 pm (Dana,
    // Oct 30: a handle set on "noon" read 1 pm).)
    el('div', { className: 'tr-scale' }, el('span', {}, formatTime(DAY_START)),
      el('span', { className: 'tr-noon', style: { left: `${((12 * 60 - DAY_START) / (DAY_END - DAY_START)) * 100}%` } }, 'noon'), el('span', {}, formatTime(DAY_END))));
  return { node, readout };
}

/**
 * A day with no sun recorded yet (Jason, Oct 31, from round 3: a new record started at "4 h, 9 am–1 pm", sun no one
 * had said): an empty bar that says what to do. A drag across it draws the hours in sun; a tap, two hours around the
 * spot, to stretch by its handles. Nothing is recorded until then. (The bar is a button, so the tap guard's rules
 * hold: a tap that drew a sun area isn't taken as one here.)
 */
export function emptyTimeline(onPick: (v: [number, number]) => void): HTMLElement {
  const fill = el('div', { className: 'tr-fill' });
  fill.style.display = 'none';
  const words = el('div', { className: 'tr-empty-words' }, 'Drag across the hours this spot gets sun');
  const bar = el('button', { className: 'time-range empty', 'data-testid': 'sun-empty', 'aria-label': 'Drag across the hours this spot gets sun', tabindex: '-1' },
    el('div', { className: 'tr-track' }, fill), words,
    el('div', { className: 'tr-scale' }, el('span', {}, formatTime(DAY_START)),
      el('span', { className: 'tr-noon', style: { left: `${((12 * 60 - DAY_START) / (DAY_END - DAY_START)) * 100}%` } }, 'noon'), el('span', {}, formatTime(DAY_END))));
  const at = (x: number) => {
    const r = bar.getBoundingClientRect(), left = r.left + 10, w = r.width - 20;
    const m = DAY_START + Math.max(0, Math.min(1, (x - left) / w)) * (DAY_END - DAY_START);
    return Math.round(m / 30) * 30;
  };
  let start: { x: number; m: number; id: number } | null = null;
  const show = (a: number, b: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b), span = DAY_END - DAY_START;
    fill.style.display = '';
    fill.style.left = ((lo - DAY_START) / span) * 100 + '%';
    fill.style.width = ((hi - lo) / span) * 100 + '%';
    words.textContent = `${formatTime(lo)} – ${formatTime(hi)}`;
  };
  bar.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, m: at(e.clientX), id: e.pointerId };
    bar.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  bar.addEventListener('pointermove', (e) => { if (start && e.pointerId === start.id && Math.abs(e.clientX - start.x) > 6) show(start.m, at(e.clientX)); });
  bar.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const a = start.m, dragged = Math.abs(e.clientX - start.x) > 6;
    start = null;
    let lo: number, hi: number;
    if (dragged) { lo = Math.min(a, at(e.clientX)); hi = Math.max(a, at(e.clientX)); if (hi - lo < 30) hi = lo + 30; }
    else { lo = a - 60; hi = a + 60; }
    // (Kept on the bar: a window at the day's edge slides in rather than being cut short.)
    if (lo < DAY_START) { hi += DAY_START - lo; lo = DAY_START; }
    if (hi > DAY_END) { lo -= hi - DAY_END; hi = DAY_END; }
    onPick([Math.max(DAY_START, lo), hi]);
  });
  bar.addEventListener('pointercancel', () => { start = null; fill.style.display = 'none'; words.textContent = 'Drag across the hours this spot gets sun'; });
  return bar;
}
