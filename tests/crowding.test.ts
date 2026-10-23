import { describe, expect, it } from 'vitest';
import { crowdedIds, crowdingOf, sharedHeight } from '../src/crowding';
import type { Plant } from '../src/plants';
import type { Shape } from '../src/types';

const byId: Record<string, Plant> = {
  shrub: { id: 'shrub', common: 'Shrub', width: { min: 3, max: 5, med: 4 } } as Plant,
  oak: { id: 'oak', common: 'Bur oak', form: 'Tree', width: { min: 60, max: 80, med: 70 } } as Plant,
  redbud: { id: 'redbud', common: 'Redbud', form: 'Tree', width: { min: 25, max: 35, med: 30 } } as Plant,
  // With heights: a 60 ft oak (crown from 20 ft), a 25 ft redbud (from 8⅓ ft), shrubs of 6 and 30 ft, a 2 ft perennial.
  oakH: { id: 'oakH', common: 'White oak', form: 'Tree', width: { min: 60, max: 80, med: 70 }, height: { min: 50, max: 70, med: 60 } } as Plant,
  redbudH: { id: 'redbudH', common: 'Redbud', form: 'Tree', width: { min: 25, max: 35, med: 30 }, height: { min: 20, max: 30, med: 25 } } as Plant,
  shrubH: { id: 'shrubH', common: 'Spicebush', form: 'Shrub', width: { min: 4, max: 8, med: 6 }, height: { min: 4, max: 8, med: 6 } } as Plant,
  bigShrub: { id: 'bigShrub', common: 'Wax myrtle', form: 'Shrub', width: { min: 15, max: 25, med: 20 }, height: { min: 20, max: 40, med: 30 } } as Plant,
  low: { id: 'low', common: 'Coreopsis', form: 'Perennial', width: { min: 1, max: 3, med: 2 }, height: { min: 1, max: 3, med: 2 } } as Plant,
};
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
  it('without a height, a tree is taken to be about as tall as it is wide; other plants crowd as before', () => {
    const shapes = [
      p('oak', 0, { plantId: 'oak', radius: 10, tree: true, sizeFrom: 'manual' } as Partial<Shape>), // 70 ft wide: crown 23⅓–70 ft
      p('shrub', 19), p('redbud', 20, { plantId: 'redbud' }), // (redbud 30 ft wide: 10–30 ft, a third of it in the oak's)
      p('oak2', 40, { plantId: 'oak' }), p('mystery', 5, { plantId: undefined, tree: true } as Partial<Shape>), // (4 ft wide: a young tree)
      p('bigUnknown', -25, { plantId: undefined, tree: true, radius: 20 } as Partial<Shape>), // (40 ft wide: 13⅓–40 ft)
    ];
    const near = (id: string) => crowdingOf(shapes.find((s) => s.id === id)!, shapes, byId).map((x) => x.other.id);
    expect(near('shrub')).toEqual([]); // (no height, not a tree: only other plants like it, as before)
    expect(near('redbud')).toEqual([]); // under the oak's edge: a third of the usual 50 ft, so fine at 20
    expect(near('mystery')).toEqual([]); // a young tree under the oak: nothing shared
    expect(near('oak')).toEqual(['oak2', 'bigUnknown']);
    expect([...crowdedIds(shapes, byId)].sort()).toEqual(['bigUnknown', 'oak', 'oak2']);
  });
  it('a vine shares no height with a tree (planted to climb it), but crowds what else grows beside it', () => {
    const vines: Record<string, Plant> = { ...byId, vine: { id: 'vine', common: 'Crossvine', form: 'Vine', width: { min: 6, max: 10, med: 8 }, height: { min: 30, max: 50, med: 40 } } as Plant };
    const shapes = [p('oak', 0, { plantId: 'oakH' }), p('vine', 3, { plantId: 'vine' }), p('shrub', 8, { plantId: 'shrubH' })];
    const near = (id: string) => crowdingOf(shapes.find((s) => s.id === id)!, shapes, vines).map((x) => x.other.id);
    expect(near('vine')).toEqual(['shrub']); // (5 ft apart; usual 7, all their height shared)
    expect(near('oak')).toEqual([]);
  });
  it('with heights, crowds only as much as the leaves share heights: a tree\'s crown from a third of its height', () => {
    const band = (tree: boolean, h: number) => ({ tree, vine: false, band: [tree ? h / 3 : 0, h] as [number, number] });
    expect(sharedHeight(band(true, 60), band(false, 6))).toBe(0); // a shrub under an oak's raised crown
    expect(sharedHeight(band(true, 60), band(true, 25))).toBeCloseTo(5 / (25 - 25 / 3)); // a redbud's top 5 ft in it
    expect(sharedHeight(band(true, 60), band(true, 60))).toBe(1);
    expect(sharedHeight(band(false, 6), band(false, 2))).toBe(1); // a shrub and a perennial at its feet
    expect(sharedHeight(band(true, 60), band(false, 30))).toBeCloseTo(10 / 30);
    const shapes = [
      p('oak', 0, { plantId: 'oakH' }), p('shrub', 8, { plantId: 'shrubH' }), p('low', 10, { plantId: 'low' }),
      p('redbud', 20, { plantId: 'redbudH' }), p('redbud2', 9, { y: 0.1, plantId: 'redbudH' } as Partial<Shape>),
      p('myrtle', -10, { plantId: 'bigShrub' }), p('oak2', 45, { plantId: 'oakH' }),
    ];
    const near = (id: string) => crowdingOf(shapes.find((s) => s.id === id)!, shapes, byId);
    // The shrub and the perennial share no height with the oak: only with each other (2 ft apart; usual 4 ft).
    expect(near('shrub').map((c) => [c.other.id, c.recommended, c.shared])).toEqual([['low', 4, 1]]);
    // The redbud at 20 ft is under the oak's edge: three tenths of the spacing (15 ft), so fine at 20, not at 9.
    expect(near('redbud').map((c) => c.other.id)).toEqual(['redbud2']);
    expect(near('redbud2').map((c) => c.other.id)).toEqual(['redbud', 'oak']);
    expect(near('redbud2').find((c) => c.other.id === 'oak')?.recommended).toBeCloseTo((35 + 15) * 0.3);
    // A 30 ft wax myrtle reaches 10 ft into the oak's crown: a third of the usual 45 ft spacing.
    expect(near('myrtle').map((c) => [c.other.id, Math.round(c.recommended)])).toEqual([['oak', 15]]);
    // Two oaks share all their height: the usual spacing.
    expect(near('oak2').map((c) => c.other.id)).toEqual(['oak']);
    const brute = new Set(shapes.filter((s) => crowdingOf(s, shapes, byId).length).map((s) => s.id));
    expect(crowdedIds(shapes, byId)).toEqual(brute);
  });
});
