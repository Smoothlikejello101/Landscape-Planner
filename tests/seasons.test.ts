import { describe, expect, it } from 'vitest';
import type { Plant } from '../src/plants';
import { bloomWindow, midDay, monthLook, monthOfDay, seasonMonths, summerLeafColors, yearLook, type Here } from '../src/seasons';

// What a plant shows in each month where the garden is (docs/seasons.md).

const plant = (o: Partial<Plant>) => ({ id: 'x', common: 'X', ...o }) as Plant;
const states = (p: Plant, here: Here = {}) => yearLook(p, here).map((m) => m.leaves.state);
const region = (med: number) => ({ med, q1: med - 10, q3: med + 10, n: 50, area: 'region' as const });
// Eastern redbud near Clark County, Arkansas (USA-NPN's records, 2009–2025): out Mar 28, coloring Sep 14, bare Nov 10.
const redbudHere: Here = {
  leafOut: { ...region(87), stateName: 'Arkansas', species: false, source: 'USA-NPN' },
  fall: { turn: region(257), drop: region(273), bare: region(314), stateName: 'Arkansas', species: false, source: 'USA-NPN' },
};

describe('months and seasons', () => {
  it('places days of the year and season words in months', () => {
    expect([monthOfDay(1), monthOfDay(31), monthOfDay(32), monthOfDay(87), monthOfDay(257), monthOfDay(314), monthOfDay(365)]).toEqual([1, 1, 2, 3, 9, 11, 12]);
    expect([midDay(1), midDay(9), midDay(12)]).toEqual([16, 259, 350]);
    expect(seasonMonths('spring')).toEqual([3, 4, 5]);
    expect(seasonMonths('early spring')).toEqual([3]);
    expect(seasonMonths('Mid Summer')).toEqual([7]);
    expect(seasonMonths('late fall')).toEqual([11]);
    expect(seasonMonths('winter')).toEqual([12, 1, 2]);
    expect(seasonMonths('rainy')).toEqual([]);
  });
});

describe('a winter no source gives (scripts/catalog/winter.mjs)', () => {
  it("is drawn as its species' records or its relatives show it, each month saying which", () => {
    const records = plant({ form: 'Shrub', winter_leaves: { leaves: 'deciduous', basis: 'records', n: 12 } });
    expect(states(records)).toEqual(states(plant({ form: 'Shrub', foliage: 'deciduous' })));
    const relatives = plant({ form: 'Perennial', winter_leaves: { leaves: 'deciduous', basis: 'relatives', n: 5 } });
    expect(monthLook(relatives, 1).leaves).toMatchObject({ state: 'dormant', basis: 'relatives' });
    expect(monthLook(relatives, 7).leaves).toMatchObject({ state: 'on', basis: 'relatives' });
    expect(monthLook(plant({ form: 'Shrub', winter_leaves: { leaves: 'evergreen', basis: 'relatives', n: 3 } }), 1).leaves).toMatchObject({ state: 'on', basis: 'relatives' });
    // (A source's foliage first; none at all: not known.)
    expect(monthLook(plant({ form: 'Shrub', foliage: 'evergreen', winter_leaves: { leaves: 'deciduous', basis: 'relatives', n: 3 } }), 1).leaves).toMatchObject({ state: 'on', basis: 'source' });
    expect(monthLook(plant({ form: 'Shrub' }), 1).leaves).toMatchObject({ state: null, basis: 'unknown' });
  });
});

describe('leaf colors', () => {
  it("takes the fall colors out of NC State's list for the summer's, green first", () => {
    expect(summerLeafColors({ leaf_color: ['gold', 'green', 'orange'], fall_colors: ['gold', 'orange', 'red'] })).toEqual({ colors: ['green'], variegated: false });
    expect(summerLeafColors({ leaf_color: ['silver', 'green'] })).toEqual({ colors: ['green', 'silver'], variegated: false });
  });
  it('keeps a colored leaf whose fall color is the same, and treats variegated as a flag', () => {
    expect(summerLeafColors({ leaf_color: ['purple'], fall_colors: ['purple', 'red'] })).toEqual({ colors: ['purple'], variegated: false });
    expect(summerLeafColors({ leaf_color: ['purple', 'red'], fall_colors: ['red'] }).colors).toEqual(['purple']);
    expect(summerLeafColors({ leaf_color: ['variegated'] })).toEqual({ colors: ['green'], variegated: true });
    expect(summerLeafColors({ leaf_color: ['green', 'cream', 'variegated'] })).toEqual({ colors: ['green', 'cream'], variegated: true });
    expect(summerLeafColors({})).toEqual({ colors: [], variegated: false });
  });
});

describe('leaves through the year', () => {
  const redbud = plant({ form: 'Tree', foliage: 'deciduous', leaf_color: ['green', 'gold'], fall_colors: ['gold'] });
  it("follow the records near the garden: out the month it leafs out, coloring from its first colored leaves, gone after its last", () => {
    expect(states(redbud, redbudHere)).toEqual(['off', 'off', 'emerging', 'on', 'on', 'on', 'on', 'on', 'turning', 'turning', 'off', 'off']);
    const oct = monthLook(redbud, 10, redbudHere).leaves;
    expect(oct).toMatchObject({ state: 'turning', colors: ['green'], fall: ['gold'], basis: 'records' });
    expect(oct.progress).toBeCloseTo((289 - 257) / (314 - 257), 2);
    expect(monthLook(redbud, 7, redbudHere).leaves).toEqual({ state: 'on', colors: ['green'], basis: 'records' });
    expect(monthLook(redbud, 1, redbudHere).leaves).toEqual({ state: 'off', colors: [], basis: 'records' });
  });
  it('fall back on the seasons where there are no records: out in March, coloring Sep–Nov, gone in winter', () => {
    expect(states(redbud)).toEqual(['off', 'off', 'emerging', 'on', 'on', 'on', 'on', 'on', 'turning', 'turning', 'turning', 'off']);
    expect(yearLook(redbud).every((m) => m.leaves.basis === 'season')).toBe(true);
    // Records for spring only: the fall still by the seasons.
    const spring = monthLook(redbud, 10, { leafOut: redbudHere.leafOut }).leaves;
    expect(spring).toMatchObject({ state: 'turning', basis: 'season' });
  });
  it('die back for herbs, grasses, ferns and bulbs; stay for evergreens; thin in winter for semi-evergreens', () => {
    expect(states(plant({ form: 'Perennial', foliage: 'deciduous' }))[0]).toBe('dormant');
    expect(states(plant({ form: 'Grass/Sedge', foliage: 'deciduous' }))[11]).toBe('dormant');
    const holly = plant({ form: 'Shrub', foliage: 'evergreen', leaf_color: ['green'] });
    expect(yearLook(holly).every((m) => m.leaves.state === 'on' && m.leaves.basis === 'source' && m.leaves.colors[0] === 'green')).toBe(true);
    const semi = plant({ form: 'Shrub', foliage: 'semi-evergreen', leaf_color: ['green'] });
    expect(monthLook(semi, 1).leaves).toMatchObject({ state: 'on', thin: true, basis: 'season' });
    expect(monthLook(semi, 7).leaves.thin).toBeUndefined();
  });
  it('have no state where no fact says whether they stay', () => {
    expect(monthLook(plant({ form: 'Shrub', leaf_color: ['green'] }), 1).leaves).toEqual({ state: null, colors: ['green'], basis: 'unknown' });
  });
});

describe('flowers and fruit', () => {
  it('bloom in the months recorded near the garden, else the listed months, else the seasons', () => {
    const p = plant({ bloom: { start: 3, end: 5 }, bloom_season: ['summer'], flower_color: ['pink'] });
    expect(bloomWindow(p, { bloom: { start: 3, end: 4, peak: 3, n: 40, area: 'state', stateName: 'Arkansas', species: false, source: 'GBIF' } })).toEqual({ months: [3, 4], basis: 'records', sure: [3, 4] });
    const listed = plant({ bloom: { start: 3, end: 5 }, flower_color: ['pink'] });
    expect(bloomWindow(listed)).toEqual({ months: [3, 4, 5], basis: 'source', sure: [3, 4, 5] });
    expect(bloomWindow(plant({ bloom_season: ['late spring', 'early summer'] }))).toEqual({ months: [5, 6], basis: 'season', sure: [] });
    expect(bloomWindow(plant({ bloom: { start: 11, end: 1 } })).months).toEqual([11, 12, 1]);
    expect(bloomWindow(plant({}))).toEqual({ months: [], basis: 'unknown', sure: [] });
    expect(monthLook(listed, 4).flowers).toEqual({ state: 'bloom', colors: ['pink'], showy: true, basis: 'source' });
    expect(monthLook(listed, 8).flowers.state).toBe('none');
    // A season its sources give beats the earlier list's unverified months: the season's months, the list's among them
    // sure (pink muhly: Fall by two sources, Oct by the list). Jason, Oct 31.
    const muhly = plant({ bloom: { start: 10, end: 10 }, bloom_season: ['fall'] });
    expect(bloomWindow(muhly)).toEqual({ months: [9, 10, 11], basis: 'season', sure: [10] });
    expect([9, 10, 11].map((m) => monthLook(muhly, m).flowers.basis)).toEqual(['season', 'source', 'season']);
    expect(bloomWindow(p)).toEqual({ months: [6, 7, 8], basis: 'season', sure: [] }); // (listed Mar-May, sourced summer)
    // (One of the person's own: its months are theirs.)
    expect(bloomWindow({ ...muhly, id: 'u-1' })).toEqual({ months: [10], basis: 'source', sure: [10] });
    expect(monthLook(plant({}), 8).flowers).toEqual({ state: 'unknown', colors: [], showy: true, basis: 'unknown' });
  });
  it('leave out insignificant flowers, and use the earlier list\'s color words only where there are no colors', () => {
    expect(monthLook(plant({ bloom_season: ['spring'], flower_color: ['insignificant'] }), 4).flowers).toMatchObject({ colors: [], showy: false });
    expect(monthLook(plant({ bloom: { start: 4, end: 4, color: 'White-pink' } }), 4).flowers).toMatchObject({ colors: [], colorText: 'White-pink' });
  });
  it('show fruit in its seasons, in its colors', () => {
    const p = plant({ fruit_season: ['fall', 'winter'], fruit_color: ['red'] });
    expect(monthLook(p, 10).fruit).toEqual({ state: 'showing', colors: ['red'], basis: 'season' });
    expect(monthLook(p, 6).fruit.state).toBe('none');
    expect(monthLook(plant({}), 6).fruit).toEqual({ state: 'unknown', colors: [], basis: 'unknown' });
  });
});
