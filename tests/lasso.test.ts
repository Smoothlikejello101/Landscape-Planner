import { describe, expect, it } from 'vitest';
import { lassoTouches } from '../src/geometry';
import type { Shape } from '../src/types';

const base = { color: '#000', opacity: 1, label: '' };
const box = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });

describe('what a lasso picks', () => {
  const yard = { ...base, id: 'y', type: 'poly', x: 0, y: 0, rotation: 0, points: [[0, 0], [100, 0], [100, 60], [0, 60]], role: 'boundary' } as unknown as Shape;
  const plant = { ...base, id: 'p', type: 'circle', x: 50, y: 30, radius: 1, role: 'plant' } as Shape;
  it('not a shape it lies wholly inside: the property line around the plants', () => {
    expect(lassoTouches(yard, box(40, 20, 60, 40))).toBe(false);
    expect(lassoTouches(plant, box(40, 20, 60, 40))).toBe(true);
  });
  it('a shape whose edge it crosses or reaches, or that lies in it', () => {
    expect(lassoTouches(yard, box(95, 20, 110, 40))).toBe(true); // (across the east line)
    expect(lassoTouches(yard, box(-5, -5, 105, 65))).toBe(true); // (all of it)
    expect(lassoTouches(plant, box(50.5, 29.5, 52, 31))).toBe(true); // (its edge)
    expect(lassoTouches(plant, box(49.8, 29.8, 50.2, 30.2))).toBe(false); // (wholly inside the circle)
  });
  it('a diagonal path it crosses, though the box is inside the path\'s box; not one it misses', () => {
    const path = { ...base, id: 'l', type: 'line', x: 0, y: 0, rotation: 0, points: [[0, 0], [40, 40]], pathWidth: 3 } as unknown as Shape;
    expect(lassoTouches(path, box(18, 18, 22, 22))).toBe(true);
    expect(lassoTouches(path, box(30, 5, 35, 10))).toBe(false);
    expect(lassoTouches(path, box(21.5, 18, 23, 19))).toBe(true); // (the band, not just its center line)
  });
  it('a rotated rectangle by its drawn corners', () => {
    const r = { ...base, id: 'r', type: 'rect', x: 0, y: 0, width: 20, height: 2, rotation: 45 } as Shape;
    expect(lassoTouches(r, box(9, 0, 11, 2))).toBe(true); // (its middle)
    expect(lassoTouches(r, box(0, 0, 2, 2))).toBe(false); // (in its box's corner, off the bar)
  });
});
