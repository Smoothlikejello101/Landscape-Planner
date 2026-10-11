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
    el('div', { className: 'tr-scale' }, el('span', {}, formatTime(DAY_START)), el('span', {}, 'noon'), el('span', {}, formatTime(DAY_END))));
  return { node, readout };
}
