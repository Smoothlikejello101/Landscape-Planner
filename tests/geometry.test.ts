import { describe, expect, it } from 'vitest';
import { rotate, rotatedBoxBounds, shapeBBox, trianglePoints, unionBounds, rectsIntersect } from '../src/geometry';
import type { Shape } from '../src/types';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('geometry', () => {
  it('rotates points clockwise in screen space (y down)', () => {
    const p = rotate(1, 0, 90);
    close(p.x, 0); close(p.y, 1);
  });
  it('bounds an unrotated box exactly', () => {
    const s: Shape = { id: 'a', type: 'rect', x: 1, y: 2, width: 4, height: 3, rotation: 0, color: '', label: '', opacity: 1, locked: false };
    expect(shapeBBox(s)).toEqual({ minX: 1, maxX: 5, minY: 2, maxY: 5 });
  });
  it('bounds a 90°-rotated box as its swapped dimensions about the center', () => {
    const s: Shape = { id: 'a', type: 'rect', x: 0, y: 0, width: 4, height: 2, rotation: 90, color: '', label: '', opacity: 1, locked: false };
    const b = shapeBBox(s);
    close(b.minX, 1); close(b.maxX, 3); close(b.minY, -1); close(b.maxY, 3);
  });
  it('bounds circles by radius', () => {
    const s: Shape = { id: 'c', type: 'circle', x: 5, y: 5, radius: 2, color: '', label: '', opacity: 1, locked: false };
    expect(shapeBBox(s)).toEqual({ minX: 3, maxX: 7, minY: 3, maxY: 7 });
  });
  it('puts the triangle right angle at the chosen corner', () => {
    const base = { x: 0, y: 0, width: 4, height: 3 };
    expect(trianglePoints({ ...base, rightAngle: 'bl' })[0]).toEqual([0, 3]);
    expect(trianglePoints({ ...base, rightAngle: 'br' })[0]).toEqual([4, 3]);
    expect(trianglePoints({ ...base, rightAngle: 'tl' })[0]).toEqual([0, 0]);
    expect(trianglePoints({ ...base, rightAngle: 'tr' })[0]).toEqual([4, 0]);
  });
  it('unions bounds and detects intersection', () => {
    const u = unionBounds([{ minX: 0, maxX: 1, minY: 0, maxY: 1 }, { minX: 5, maxX: 6, minY: -2, maxY: 0 }]);
    expect(u).toEqual({ minX: 0, maxX: 6, minY: -2, maxY: 1 });
    expect(unionBounds([])).toBeNull();
    expect(rectsIntersect({ minX: 0, maxX: 2, minY: 0, maxY: 2 }, { minX: 1, maxX: 3, minY: 1, maxY: 3 })).toBe(true);
    expect(rectsIntersect({ minX: 0, maxX: 1, minY: 0, maxY: 1 }, { minX: 2, maxX: 3, minY: 2, maxY: 3 })).toBe(false);
  });
  it('bounds a rotated box symmetrically about its center', () => {
    const b = rotatedBoxBounds(10, 10, 2, 2, 45);
    close(b.maxX - 10, Math.SQRT2); close(10 - b.minY, Math.SQRT2);
  });
});
