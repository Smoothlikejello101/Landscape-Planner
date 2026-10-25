// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { placeToast } from '../src/ui/toast';

/** An element on screen at a given height (jsdom lays nothing out). */
function at(className: string, top: number, height = 48) {
  const e = document.createElement('div');
  e.className = className;
  e.getBoundingClientRect = () => ({ top, height, bottom: top + height, left: 0, right: 0, width: 200, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(e);
  return e;
}

describe('where a notice goes', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const toast = () => { const n = document.createElement('div'); n.id = 'toast'; document.body.appendChild(n); return n; };

  it('above the selected shape\'s chip, so Edit and More stay in reach', () => {
    Object.defineProperty(window, 'innerHeight', { value: 839, configurable: true });
    at('sel-pill', 700);
    const n = toast();
    placeToast(n);
    expect(n.style.bottom).toBe('147px'); // (839 − 700 + 8)
  });
  it('above the bar for several shapes too; where nothing is selected, where it always was', () => {
    Object.defineProperty(window, 'innerHeight', { value: 839, configurable: true });
    const bar = at('multi-bar', 690);
    const n = toast();
    placeToast(n);
    expect(n.style.bottom).toBe('157px');
    bar.remove();
    placeToast(n);
    expect(n.style.bottom).toBe(''); // (the stylesheet's place, above the bottom bar)
  });
  it('at the top while a sheet is open, clear of its buttons', () => {
    at('sheet', 300, 539);
    const n = toast();
    placeToast(n);
    expect(n.style.top).toContain('60px');
    expect(n.style.bottom).toBe('auto');
  });
});
