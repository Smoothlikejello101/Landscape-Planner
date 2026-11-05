// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { noticeAbout, noticeUp, placeToast, toastAction } from '../src/ui/toast';

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

// Jason, Nov 4: a notice for something new replaces an older one; only one about the same placement keeps its order.
describe('which notice is up, and what it is about', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  it('says its kind, the shape it is about and when it went up; a new one takes its place', () => {
    expect(noticeUp()).toBeNull();
    const t0 = Date.now();
    toastAction('Nudged Snowberry 2.5 ft away from Aster.', [{ label: 'Undo', run: () => {} }], 8000, 'nudge-notice');
    document.getElementById('toast-action')!.dataset.about = 'b';
    expect(noticeUp()).toMatchObject({ testid: 'nudge-notice', about: 'b' });
    expect(noticeUp()!.at).toBeGreaterThanOrEqual(t0);
    expect(noticeAbout('b')).toBe(true);
    expect(noticeAbout('c')).toBe(false); // (a plant placed since: its notice goes over this one)
    toastAction('Crowding Snowberry', [{ label: 'Nudge apart', run: () => {} }], 10000, 'crowd-notice');
    expect(document.querySelectorAll('#toast-action')).toHaveLength(1);
    expect(noticeUp()).toMatchObject({ testid: 'crowd-notice' });
    expect(noticeUp()!.about).toBeUndefined();
  });
});
