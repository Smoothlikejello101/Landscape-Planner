import { describe, expect, it } from 'vitest';
import { BADGE_HALF, BADGE_STEP, badgeBoxes, badgeCenters, placeBadges, ringClear, rimOf } from '../src/badges';

// Warning badges on the plant itself, stacked at a corner of its circle (Jason's notes after release 3: "I would expect
// them on the plant itself"), clear of its full-size ring and of a neighbor's badges where they can be.

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

describe('warning badges on a plant', () => {
  it('one: centered on its edge, at the top right', () => {
    const h = { x: 100, y: 200, r: 30, n: 1, k: 1 };
    const spot = placeBadges(h);
    expect(spot).toEqual({ corner: 0, rho: 30 });
    const [c] = badgeCenters(h, spot);
    expect(near(Math.hypot(c.x - 100, c.y - 200), 30)).toBe(true); // (on the edge)
    expect(c.x).toBeGreaterThan(100); expect(c.y).toBeLessThan(200); // (top right)
  });
  it('several: stacked, the first on the edge and the rest rising above it, a step apart', () => {
    const h = { x: 0, y: 0, r: 40, n: 3, k: 1 };
    const at = badgeCenters(h, placeBadges(h));
    expect(at.map((c) => Math.round(c.x))).toEqual([28, 28, 28]);
    expect(at.map((c) => Math.round(c.y))).toEqual([-28, -28 - BADGE_STEP, -28 - 2 * BADGE_STEP]);
  });
  it('a plant smaller than a badge has it at its corner, not over its middle', () => {
    const h = { x: 0, y: 0, r: 4, n: 1, k: 1 };
    expect(rimOf(h)).toBe(BADGE_HALF * 1.2);
    const [b] = badgeBoxes(h, placeBadges(h));
    expect(b.x0).toBeGreaterThan(-BADGE_HALF / 2); expect(b.y1).toBeLessThan(BADGE_HALF / 2);
  });
  it('zoomed far out, smaller and closer together', () => {
    const h = { x: 0, y: 0, r: 20, n: 2, k: 0.5 };
    const [a, b] = badgeCenters(h, placeBadges(h));
    expect(near(a.y - b.y, BADGE_STEP * 0.5)).toBe(true);
    expect(badgeBoxes(h, placeBadges(h))[0].x1 - badgeBoxes(h, placeBadges(h))[0].x0).toBe(BADGE_HALF);
  });
  it('clear of its full-size ring: moved in or out along its corner, the least it can be', () => {
    // (A ring 6 px out from the edge: a badge on the edge would sit across it.)
    const h = { x: 0, y: 0, r: 40, full: 46, n: 2, k: 1 };
    expect(ringClear(badgeBoxes(h, { corner: 0, rho: 40 }), 0, 0, 46)).toBe(false);
    const spot = placeBadges(h);
    expect(spot.corner).toBe(0);
    expect(ringClear(badgeBoxes(h, spot), 0, 0, 46)).toBe(true);
    expect(Math.abs(spot.rho - 40)).toBeLessThan(40);
    // A ring well out from the edge: on the edge, as ever.
    expect(placeBadges({ ...h, full: 120 })).toEqual({ corner: 0, rho: 40 });
  });
  it('a neighbor\'s badges at the top right: the top left, then the bottom', () => {
    const h = { x: 0, y: 0, r: 20, n: 1, k: 1 };
    const taken = badgeBoxes(h, { corner: 0, rho: 20 });
    expect(placeBadges(h, taken).corner).toBe(1);
    expect(placeBadges(h, [...taken, ...badgeBoxes(h, { corner: 1, rho: 20 })]).corner).toBe(2);
  });
  it('not on another plant, where a badge would read as that one\'s; a neighbor merely touching is no matter', () => {
    const h = { x: 0, y: 0, r: 20, n: 1, k: 1 };
    // (Overlapping it, up and to the right: the badge's middle is inside it.)
    expect(placeBadges(h, [], [{ x: 30, y: -30, r: 25 }]).corner).toBe(1);
    // (Side by side, touching: a row of plants keeps its badges at the same corner.)
    expect(placeBadges(h, [], [{ x: 40, y: 0, r: 20 }]).corner).toBe(0);
  });
  it('a climbing vine\'s start at the bottom right: its name is above its spot', () => {
    expect(placeBadges({ x: 0, y: 0, r: 6, n: 1, k: 1, vine: true }).corner).toBe(2);
  });
});
