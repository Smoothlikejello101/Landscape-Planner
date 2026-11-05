import { describe, expect, it } from 'vitest';
import { FULL, REST, KEYBOARD_PX, SETTLE_PX, keyboardUp, sameView, settleSheet, sheetHeights, viewToShow, type Room, type View } from '../src/plan-in-view';
import { MIN_ZOOM, PX_PER_FOOT_BASE } from '../src/constants';
import type { Bounds } from '../src/types';

// The plan in view while choosing plants (Jason, Nov 2, from the bed review's S3): the arithmetic behind the picker
// at rest (60%, half until Nov 4) on a phone and beside the plan on a computer (src/plan-in-view.ts).

/** Where `b` is drawn (px from the plan's top left) at `v`. */
function drawn(b: Bounds, v: View) {
  const ppf = PX_PER_FOOT_BASE * v.zoom;
  return { left: (b.minX - v.offsetX) * ppf, right: (b.maxX - v.offsetX) * ppf, top: (b.minY - v.offsetY) * ppf, bottom: (b.maxY - v.offsetY) * ppf };
}
/** Whether `b` is inside `room`, `m` px clear of its edges, at `v`. */
function inside(b: Bounds, v: View, room: Room, m = 16) {
  const d = drawn(b, v);
  return d.left >= room.left + m - 1e-6 && d.right <= room.right - m + 1e-6 && d.top >= room.top + m - 1e-6 && d.bottom <= room.bottom - m + 1e-6;
}

// A 412 px phone: the plan 790 px tall, the picker at half height leaving its top 400 px in sight.
const PHONE: Room = { left: 0, top: 0, right: 412, bottom: 400 };
// A 1366 px computer: the plan left of a 464 px panel.
const COMPUTER: Room = { left: 0, top: 0, right: 902, bottom: 700 };
const BED: Bounds = { minX: 0, maxX: 12, minY: 0, maxY: 6 }; // (12 × 6 ft: 288 × 144 px at 100%)

describe('the selected thing brought into the part of the plan in sight', () => {
  it('a bed already in sight above the picker: the view is left as it is', () => {
    const v: View = { offsetX: -3, offsetY: -3, zoom: 1 };
    expect(inside(BED, v, PHONE)).toBe(true);
    expect(viewToShow(BED, v, PHONE)).toEqual(v);
  });

  it('a bed under the picker comes up into the middle of what shows above it, staying where it was across, at the same zoom', () => {
    const v: View = { offsetX: -3, offsetY: -24, zoom: 1 }; // (the bed 576 px down: under the picker)
    expect(inside(BED, v, PHONE)).toBe(false);
    const next = viewToShow(BED, v, PHONE);
    expect(next.zoom).toBe(1);
    expect(next.offsetX).toBe(-3); // (across, it was in sight: not moved that way)
    expect(inside(BED, next, PHONE)).toBe(true);
    const d = drawn(BED, next);
    expect((d.top + d.bottom) / 2).toBeCloseTo(200, 6); // (the middle of the 400 px in sight)
  });

  it('beside a computer\'s panel: a bed under the panel comes left into the middle of the plan beside it', () => {
    const v: View = { offsetX: -30, offsetY: -10, zoom: 1 }; // (the bed at x 720 to 1008 px: half under the panel)
    const next = viewToShow(BED, v, COMPUTER);
    expect(next.offsetY).toBe(-10); // (up and down, it was in sight)
    expect(inside(BED, next, COMPUTER)).toBe(true);
    const d = drawn(BED, next);
    expect((d.left + d.right) / 2).toBeCloseTo(451, 6);
  });

  it('only zooms out where it doesn\'t fit in the room at this zoom, never in, and then to the middle', () => {
    // A bed 40 ft long at 100% (960 px) on a 412 px phone: out to fit, a margin all round.
    const long: Bounds = { minX: 0, maxX: 40, minY: 0, maxY: 6 };
    const next = viewToShow(long, { offsetX: 0, offsetY: 0, zoom: 1 }, PHONE);
    expect(next.zoom).toBeCloseTo((412 - 32) / (40 * PX_PER_FOOT_BASE), 9);
    expect(inside(long, next, PHONE)).toBe(true);
    const d = drawn(long, next);
    expect((d.left + d.right) / 2).toBeCloseTo(206, 6);
    expect((d.top + d.bottom) / 2).toBeCloseTo(200, 6);
    // Zoomed out a long way already, a small bed out of sight: moved, not zoomed in on.
    const far = viewToShow(BED, { offsetX: 200, offsetY: 200, zoom: 0.2 }, PHONE);
    expect(far.zoom).toBe(0.2);
    expect(inside(BED, far, PHONE)).toBe(true);
  });

  it('never zooms out past the least zoom; a room with no space in it leaves the view be', () => {
    const huge: Bounds = { minX: 0, maxX: 100000, minY: 0, maxY: 10 };
    expect(viewToShow(huge, { offsetX: 0, offsetY: 0, zoom: 1 }, PHONE).zoom).toBe(MIN_ZOOM);
    const v: View = { offsetX: 5, offsetY: 5, zoom: 1 };
    expect(viewToShow(BED, v, { left: 0, top: 0, right: 412, bottom: 20 })).toEqual(v);
  });

  it('a single plant (a point with a size) and a bed at an edge of the room', () => {
    const plant: Bounds = { minX: 10, maxX: 12, minY: 30, maxY: 32 };
    const next = viewToShow(plant, { offsetX: 0, offsetY: 0, zoom: 2 }, PHONE);
    expect(next.zoom).toBe(2);
    expect(inside(plant, next, PHONE)).toBe(true);
    // Just inside the margin across, out of sight down: moved down only.
    const v: View = { offsetX: -16 / 24, offsetY: -40, zoom: 1 };
    const moved = viewToShow(BED, v, PHONE);
    expect(moved.offsetX).toBe(v.offsetX);
    expect(moved.offsetY).not.toBe(v.offsetY);
  });

  it('views told apart to a hair', () => {
    expect(sameView({ offsetX: 1, offsetY: 2, zoom: 1 }, { offsetX: 1 + 1e-12, offsetY: 2, zoom: 1 })).toBe(true);
    expect(sameView({ offsetX: 1, offsetY: 2, zoom: 1 }, { offsetX: 1.01, offsetY: 2, zoom: 1 })).toBe(false);
  });
});

describe('where the phone\'s picker settles when its handle is let go', () => {
  const rest = 504, full = 714;
  it('dragged up far enough: full height; down far enough: at rest', () => {
    expect(settleSheet(rest, rest + SETTLE_PX, rest, full)).toBe('full');
    expect(settleSheet(full, full - SETTLE_PX, rest, full)).toBe('rest');
  });
  it('a short drag goes back to whichever it\'s nearer', () => {
    expect(settleSheet(rest, rest + 10, rest, full)).toBe('rest');
    expect(settleSheet(full, full - 10, rest, full)).toBe('full');
    expect(settleSheet(600, 620, rest, full)).toBe('full'); // (past the middle, 609)
  });
  it('swiped down below its height at rest, it closes (Jason, Nov 4, note 3); not by a short drag', () => {
    expect(settleSheet(rest, rest - SETTLE_PX, rest, full)).toBe('closed');
    expect(settleSheet(rest, rest - 200, rest, full)).toBe('closed');
    expect(settleSheet(rest, rest - SETTLE_PX + 1, rest, full)).toBe('rest');
    // From full height: down to rest, or on past it, closed.
    expect(settleSheet(full, rest + 5, rest, full)).toBe('rest');
    expect(settleSheet(full, rest - SETTLE_PX - 5, rest, full)).toBe('closed');
  });
  it('its heights: 60% of the layer it\'s on at rest (Jason, Nov 4); full as it always was, 85% of the screen less the keyboard', () => {
    expect(REST).toBe(0.6);
    expect(sheetHeights(840, 0)).toEqual({ rest: Math.round(840 * REST), full: Math.round(840 * FULL) });
    // (A keyboard measured over the page, iOS: the layer is the screen less the keyboard.)
    expect(sheetHeights(500, 340)).toEqual({ rest: 300, full: Math.round(FULL * 840 - 340) });
    expect(sheetHeights(100, 600).full).toBe(60); // (never less than at rest)
  });
});

describe('whether a phone\'s keyboard is up', () => {
  it('the window shorter by a keyboard\'s height, or a keyboard measured over the page', () => {
    expect(keyboardUp(915, 915, 0)).toBe(false);
    expect(keyboardUp(915, 915 - KEYBOARD_PX + 1, 0)).toBe(false); // (a toolbar coming and going)
    expect(keyboardUp(915, 560, 0)).toBe(true);
    expect(keyboardUp(915, 915, 320)).toBe(true);
  });
});
