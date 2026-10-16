import { describe, expect, it } from 'vitest';
import { crowdedIds, crowdingOf } from '../src/crowding';
import type { Plant } from '../src/plants';
import type { Shape } from '../src/types';

const byId: Record<string, Plant> = { shrub: { id: 'shrub', common: 'Shrub', width: { min: 3, max: 5, med: 4 } } as Plant };
const base = { color: '#16a34a', opacity: 0.65, locked: false };
const p = (id: string, x: number, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id, type: 'circle', x, y: 0, radius: 2, role: 'plant', label: id, plantId: 'shrub', ...extra } as Shape);

describe('crowding', () => {
  it('flags plants closer than 75% of the usual spacing (typical spreads touching)', () => {
    // Usual spacing for two 4-ft shrubs is 4 ft; crowded under 3 ft.
    const shapes = [p('a', 0), p('b', 2.9), p('c', 7), p('d', 30)];
    expect([...crowdedIds(shapes, byId)].sort()).toEqual(['a', 'b']);
    const c = crowdingOf(shapes[0], shapes, byId);
    expect(c.map((x) => [x.other.id, x.recommended])).toEqual([['b', 4]]);
  });
  it('ignores gone plants and non-plants; uses the drawn size without plant data', () => {
    const shapes = [p('a', 0), p('gone', 1, { status: 'gone' }), p('bed', 1, { role: 'bed' }), p('free', 1, { plantId: undefined, radius: 0.5 })];
    expect(crowdingOf(shapes[0], shapes, byId).map((x) => x.other.id)).toEqual(['free']); // 1 ft apart, usual 2.5 ft
    expect(crowdedIds(shapes, byId).has('gone')).toBe(false);
  });
  it('matches the pairwise check on a larger random layout', () => {
    const shapes = Array.from({ length: 200 }, (_, i) => p('s' + i, ((i * 7919) % 97) * 0.9, { y: ((i * 104729) % 89) * 0.9 } as Partial<Shape>));
    const brute = new Set(shapes.filter((s) => crowdingOf(s, shapes, byId).length).map((s) => s.id));
    expect(crowdedIds(shapes, byId)).toEqual(brute);
  });
});
