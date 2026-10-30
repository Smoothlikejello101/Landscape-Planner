import { describe, expect, it } from 'vitest';
import { bloomByBed, bloomColor, bloomGaps, bloomMonths, bloomSeason, bloomSummary } from '../src/bloom';
import type { Plant } from '../src/plants';
import type { Shape } from '../src/types';

const plants: Record<string, Plant> = {
  cone: { id: 'cone', common: 'Coneflower', bloom: { start: 6, end: 8, color: 'Purple' } } as Plant,
  aster: { id: 'aster', common: 'Aster', bloom: { start: 9, end: 10, color: 'Blue-violet' } } as Plant,
  witch: { id: 'witch', common: 'Witch hazel', bloom: { start: 11, end: 1, color: 'Yellow' } } as Plant,
  fern: { id: 'fern', common: 'Fern' } as Plant,
};
const base = { color: '#16a34a', opacity: 0.65, locked: false };
const plant = (id: string, plantId: string, x: number, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id, type: 'circle', x, y: 1, radius: 0.5, role: 'plant', label: plants[plantId].common, plantId, ...extra } as Shape);
const bed = (id: string, label: string, x: number): Shape =>
  ({ ...base, id, type: 'rect', x, y: 0, width: 10, height: 2, rotation: 0, role: 'bed', label } as Shape);

describe('bloom months', () => {
  it('runs from start to end, wrapping the new year', () => {
    expect(bloomMonths(plants.cone)).toEqual([6, 7, 8]);
    expect(bloomMonths(plants.witch)).toEqual([11, 12, 1]);
    expect(bloomMonths(plants.fern)).toEqual([]);
    expect(bloomMonths({ id: 'x', common: 'x', bloom: { start: 5 } } as Plant)).toEqual([5]);
  });
  it('turns color words into a swatch', () => {
    expect(bloomColor('Purple', '#000')).toBe('#9333ea');
    expect(bloomColor('White-pink', '#000')).toBe('#e7e5e4');
    expect(bloomColor('Every color', '#123456')).toBe('#123456');
  });
  it("takes the season from the plan's own first and last blooms", () => {
    expect(bloomSeason([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0])).toEqual([3, 4, 5, 6, 7, 8, 9, 10]); // March-October
    expect(bloomSeason([0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0])).toEqual([4, 5, 6, 7, 8, 9, 10]);
    // Winter bloomers: the season runs through the new year; the off-season is the longest empty stretch.
    expect(bloomSeason([1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1])).toEqual([9, 10, 11, 12, 1]);
    // Two equally long empty stretches: the one nearer midwinter is the off-season.
    expect(bloomSeason([0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1])).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); // July stays a gap
    expect(bloomSeason([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toEqual([]);
    expect(bloomSeason(Array(12).fill(1))).toHaveLength(12);
  });
  it('finds gaps inside the season', () => {
    const per = [0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    expect(bloomGaps(per, bloomSeason(per))).toBe('Jun-Jul, Sep');
    expect(bloomGaps([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], [3, 4, 5, 6, 7, 8, 9, 10])).toBe('');
    // A bed measured against the plan's season: its empty March counts.
    expect(bloomGaps([0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0], [3, 4, 5, 6, 7, 8, 9, 10])).toBe('Mar');
    expect(bloomGaps([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1], [9, 10, 11, 12, 1])).toBe('Oct-Nov');
  });
});

describe('bloom by bed', () => {
  const shapes = [
    bed('b1', 'Front', 0), bed('b2', '', 20),
    plant('p1', 'cone', 1), plant('p2', 'cone', 2), plant('p3', 'aster', 3), plant('p4', 'fern', 4),
    plant('p5', 'witch', 21), plant('p6', 'aster', 50), plant('p7', 'cone', 22, { status: 'gone' }),
  ];
  it('counts plants by name, sorted by when they start, and notes missing data', () => {
    const s = bloomSummary(shapes.slice(2, 6), plants);
    expect(s.rows.map((r) => [r.label, r.count])).toEqual([['Coneflower', 2], ['Aster', 1]]);
    expect(s.noData).toBe(1);
    expect(s.perMonth).toEqual([0, 0, 0, 0, 0, 2, 2, 2, 1, 1, 0, 0]); // (plants in bloom, as the month slider counts)
  });
  it('colors a row by its flowers\' sourced colors where it has them, else the earlier list\'s words', () => {
    const sourced = { ...plants, cone: { ...plants.cone, flower_color: ['insignificant', 'white'] } as Plant };
    const rows = bloomSummary(shapes.slice(2, 4), sourced).rows;
    expect(rows[0]).toMatchObject({ colorText: 'white', color: '#e7e5e4' });
    expect(bloomSummary(shapes.slice(4, 5), plants).rows[0]).toMatchObject({ colorText: 'Blue-violet' });
  });
  it('lists the plants with no bloom months by name, saying why, the person\'s own first', () => {
    const lib = {
      ...plants,
      fern: { id: 'fern', common: 'Fern', form: 'Fern' } as Plant,
      shrub: { id: 'shrub', common: 'Boxwood', form: 'Shrub' } as Plant,
      phlox: { id: 'phlox', common: 'Phlox', bloom_season: ['mid summer', 'late summer'] } as Plant,
      'u-1': { id: 'u-1', common: 'My hosta', width: { min: 1, max: 2, med: 1.5 } } as Plant,
    };
    const named = (id: string, plantId: string | undefined, label: string) =>
      ({ ...base, id, type: 'circle', x: 1, y: 1, radius: 0.5, role: 'plant', label, ...(plantId ? { plantId } : {}) } as Shape);
    const s = bloomSummary([
      named('a', 'shrub', 'Boxwood'), named('b', 'fern', 'Fern'), named('c', 'u-1', 'My hosta'), named('d', 'u-1', 'My hosta'),
      named('e', undefined, 'Mystery'), named('f', 'cone', 'Coneflower'), named('g', 'shrub', 'Boxwood', ), named('h', undefined, ''),
      named('i', 'phlox', 'Phlox'),
    ], lib);
    expect(s.missing).toEqual([
      { label: 'My hosta', count: 2, why: 'mine', plantId: 'u-1' },
      { label: 'Mystery', count: 1, why: 'unlinked' },
      { label: 'Unlabeled plant', count: 1, why: 'unlinked' },
      { label: 'Boxwood', count: 2, why: 'catalog', plantId: 'shrub' },
      { label: 'Fern', count: 1, why: 'fern', plantId: 'fern' },
    ]);
    expect(s.noData).toBe(5);
    // A season and no months: its months by the season (as the month slider has them), marked so.
    expect(s.rows.map((r) => [r.label, r.months, r.bySeason])).toEqual([
      ['Coneflower', expect.any(Array), undefined], ['Phlox', [7, 8], ['mid summer', 'late summer']],
    ]);
  });
  it('groups by bed (gone plants left out), loose plants last', () => {
    const g = bloomByBed(shapes, plants);
    expect(g.map((x) => x.bed)).toEqual(['Front', 'Unnamed bed 1', 'Not in a bed']);
    expect(g[1].rows.map((r) => r.label)).toEqual(['Witch hazel']);
    expect(g[2].rows.map((r) => r.label)).toEqual(['Aster']);
  });
});
