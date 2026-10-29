import { describe, expect, it } from 'vitest';
import { angleSpot, clipToBox, cornerAngle, lengthText, middleOf, parseTypedLength, sideLabelSpot, stickDirection, typedFarSide, typedPoint } from '../src/draw-numbers';

const close = (a: { x: number; y: number } | null, b: { x: number; y: number }) => {
  expect(a).not.toBeNull();
  expect(a!.x).toBeCloseTo(b.x, 6);
  expect(a!.y).toBeCloseTo(b.y, 6);
};

describe('drawing numbers', () => {
  it('says a length in feet, to a tenth', () => {
    expect(lengthText(12)).toBe('12 ft');
    expect(lengthText(12.345)).toBe('12.3 ft');
  });

  it("gives a corner's angle in whole degrees, null where a side has no length", () => {
    expect(cornerAngle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 })).toBe(90);
    expect(cornerAngle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 })).toBe(180);
    expect(cornerAngle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 })).toBe(45);
    expect(cornerAngle({ x: 10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 })).toBeNull();
  });

  it("puts a side's label beside its middle, away from the drawing's middle", () => {
    // (The side along the top of a square: its label goes above, outside the square.)
    close(sideLabelSpot({ x: 0, y: 0 }, { x: 10, y: 0 }, 2, { x: 5, y: 5 }), { x: 5, y: -2 });
    close(sideLabelSpot({ x: 0, y: 10 }, { x: 10, y: 10 }, 2, { x: 5, y: 5 }), { x: 5, y: 12 });
    close(middleOf([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]), { x: 5, y: 5 });
    // A label as wide as 40 beside an upright side: its near edge, not its middle, stays the gap clear of it.
    close(sideLabelSpot({ x: 10, y: 0 }, { x: 10, y: 10 }, 4, { x: 5, y: 5 }, { w: 40, h: 20 }), { x: 34, y: 5 });
    close(sideLabelSpot({ x: 0, y: 0 }, { x: 10, y: 0 }, 4, { x: 5, y: 5 }, { w: 40, h: 20 }), { x: 5, y: -14 });
    expect(middleOf([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });

  it("puts a corner's angle inside the corner", () => {
    const at = angleSpot({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, Math.SQRT2);
    close(at, { x: 9, y: 1 });
  });

  it("sticks a typed side's direction to a multiple of 45°, or square to the side before, only when within 3°", () => {
    expect(stickDirection({ x: 0, y: 0 }, { x: 10, y: 0.3 })).toBeCloseTo(0, 9); // (1.7° off: stuck)
    expect(stickDirection({ x: 0, y: 0 }, { x: 10, y: 10.4 })).toBeCloseTo(Math.PI / 4, 9);
    const free = stickDirection({ x: 0, y: 0 }, { x: 10, y: 2 })!; // (11°: left as tapped)
    expect(free).toBeCloseTo(Math.atan2(2, 10), 9);
    // A wall turned 20°: square to it wins over the grid.
    const wall = (20 * Math.PI) / 180;
    const tapped = wall + Math.PI / 2 + (2 * Math.PI) / 180;
    expect(stickDirection({ x: 0, y: 0 }, { x: Math.cos(tapped), y: Math.sin(tapped) }, wall)).toBeCloseTo(wall + Math.PI / 2, 9);
    expect(stickDirection({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });

  it('puts the next point at exactly the typed length, toward the tap', () => {
    close(typedPoint({ x: 2, y: 3 }, { x: 40, y: 3.5 }, 12), { x: 14, y: 3 });
    const p = typedPoint({ x: 0, y: 0 }, { x: 3, y: 4 }, 10)!;
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 9);
    expect(typedPoint({ x: 0, y: 0 }, { x: 3, y: 4 }, 0)).toBeNull();
  });

  it("puts a rectangle's far side the typed length off its first side, on the tapped side", () => {
    close(typedFarSide({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 13, y: 9 }, 28), { x: 40, y: 28 });
    close(typedFarSide({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 13, y: -2 }, 28), { x: 40, y: -28 });
    expect(typedFarSide({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 13, y: 0 }, 28)).toBeNull();
  });

  it('finds the part of a side on screen, for its label', () => {
    // (A fence across the screen and beyond both edges: the part between them.)
    const seen = clipToBox({ x: -100, y: 50 }, { x: 500, y: 50 }, 400, 300)!;
    close(seen[0], { x: 0, y: 50 });
    close(seen[1], { x: 400, y: 50 });
    // (On screen whole: itself.)
    const whole = clipToBox({ x: 10, y: 10 }, { x: 90, y: 40 }, 400, 300)!;
    close(whole[0], { x: 10, y: 10 });
    close(whole[1], { x: 90, y: 40 });
    // (Off screen, beside it: none.)
    expect(clipToBox({ x: -50, y: -10 }, { x: 450, y: -20 }, 400, 300)).toBeNull();
    expect(clipToBox({ x: 500, y: 10 }, { x: 600, y: 200 }, 400, 300)).toBeNull();
  });

  it('reads a typed length: feet, a comma for the decimal point too; nothing else', () => {
    expect(parseTypedLength('12')).toBe(12);
    expect(parseTypedLength(' 12,5 ')).toBe(12.5);
    expect(parseTypedLength('')).toBeNull();
    expect(parseTypedLength('abc')).toBeNull();
    expect(parseTypedLength('-3')).toBeNull();
    expect(parseTypedLength('0')).toBeNull();
  });
});
