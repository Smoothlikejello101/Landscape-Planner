// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { AWAY_DAYS, hintDue, hintShown, noteVisit } from '../src/hints';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1);

describe('hints', () => {
  beforeEach(() => localStorage.clear());
  it('show the first few times, then stop', () => {
    noteVisit(T0);
    for (let i = 0; i < 3; i++) { expect(hintDue('h', 3)).toBe(true); hintShown('h', T0 + i); }
    expect(hintDue('h', 3)).toBe(false);
    expect(localStorage.getItem('h')).toBe('3');
  });
  it('show once more after a long time away, not after a short one', () => {
    noteVisit(T0); hintShown('h', T0);
    noteVisit(T0 + (AWAY_DAYS - 1) * DAY);
    expect(hintDue('h', 1)).toBe(false);
    noteVisit(T0 + (2 * AWAY_DAYS - 1) * DAY); // (away AWAY_DAYS since the last visit)
    expect(hintDue('h', 1)).toBe(true);
    hintShown('h', T0 + (2 * AWAY_DAYS - 1) * DAY + 5);
    expect(hintDue('h', 1)).toBe(false);
    noteVisit(T0 + 2 * AWAY_DAYS * DAY); // (back again soon: still shown once)
    expect(hintDue('h', 1)).toBe(false);
  });
  it('keep a hint shown before this record began as shown (a "1" from before)', () => {
    localStorage.setItem('lp-hint-full-size', '1');
    noteVisit(T0);
    expect(hintDue('lp-hint-full-size', 1)).toBe(false);
  });
  it('count the first visit as no return', () => {
    noteVisit(T0);
    hintShown('h', T0);
    expect(hintDue('h', 1)).toBe(false);
    expect(localStorage.getItem('lp-returned')).toBe(null);
  });
});
