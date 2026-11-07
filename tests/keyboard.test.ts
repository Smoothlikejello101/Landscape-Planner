import { describe, expect, it } from 'vitest';
import { restingHeight, type RestWhy } from '../src/keyboard';

// The window's height with no keyboard up, which places a sheet's top so the keyboard coming and going never moves it
// (Jason, Nov 5: the sheet jumped with each keyboard change as Android's spelling menu and the keyboard came and went).

const phone = (o: Partial<RestWhy> = {}): RestWhy => ({ typing: false, fieldLeft: false, mouse: false, ...o });
const was = { h: 839, w: 412 };

describe('the window\'s height with no keyboard up', () => {
  it('the window\'s own to start, and whenever it\'s as tall or taller (the keyboard gone)', () => {
    expect(restingHeight({ h: 0, w: 0 }, 549, 412, phone({ typing: true }))).toBe(549);
    expect(restingHeight(was, 839, 412, phone({ typing: true }))).toBe(839);
    expect(restingHeight(was, 900, 412, phone({ typing: true }))).toBe(900);
  });
  it('kept while a field is typed in and the keyboard shortens the window, and as the field is left with it still up', () => {
    expect(restingHeight(was, 549, 412, phone({ typing: true }))).toBe(839);
    // (Chrome's spelling menu over the page: the field blurred, then the keyboard goes and comes back. Kept throughout.)
    expect(restingHeight(was, 549, 412, phone({ fieldLeft: true }))).toBe(839);
  });
  it('the window\'s, shorter with nothing typed in (split screen), turned, or on a computer (no keyboard on the screen)', () => {
    expect(restingHeight(was, 500, 412, phone())).toBe(500);
    expect(restingHeight(was, 400, 839, phone({ typing: true }))).toBe(400);
    expect(restingHeight(was, 549, 412, phone({ typing: true, mouse: true }))).toBe(549);
  });
});
