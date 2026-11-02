import { describe, expect, it } from 'vitest';
import { isStrayTap, OPENED_MS, tooSoonAfterOpening, type Tap } from '../src/tap-guard';

// Taps that land on what a tap just put there (src/tap-guard.ts). The end-to-end tests are e2e/tap-guard.spec.ts.

describe('a panel just opened', () => {
  it('takes no tap for a moment, then every tap (Jason, Nov 1: the end of a double tap pressed Swap)', () => {
    expect(tooSoonAfterOpening(1000, 1000)).toBe(true);
    expect(tooSoonAfterOpening(1000, 1000 + OPENED_MS - 1)).toBe(true);
    expect(tooSoonAfterOpening(1000, 1000 + OPENED_MS)).toBe(false);
    expect(tooSoonAfterOpening(1000, 999)).toBe(false); // (a press from before it opened)
    expect(tooSoonAfterOpening(-Infinity, 5)).toBe(false); // (none opened yet)
  });
  it('waits longer than a double tap is apart', () => {
    expect(OPENED_MS).toBeGreaterThanOrEqual(350);
    expect(OPENED_MS).toBeLessThanOrEqual(500);
  });
});

describe('a quick second tap', () => {
  const tap = (t: number, x: number, what: string): Tap => ({ t, x, y: 100, what, area: { left: 0, top: 80, right: 200, bottom: 120 } });
  it('is dropped on something that came up where the first pressed, not on the same control', () => {
    expect(isStrayTap(tap(0, 50, 'BUTTON|place||Place'), tap(200, 52, 'BUTTON|add||Add'))).toBe(true);
    expect(isStrayTap(tap(0, 50, 'BUTTON|zoom-in||+'), tap(200, 52, 'BUTTON|zoom-in||+'))).toBe(false);
    expect(isStrayTap(tap(0, 50, 'BUTTON|place||Place'), tap(400, 52, 'BUTTON|add||Add'))).toBe(false);
  });
});
