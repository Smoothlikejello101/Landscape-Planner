import { describe, expect, it } from 'vitest';
import { fruitMatters, fruitNeed, speciesKey } from '../src/fruit-partners';
import type { Plant } from '../src/plants';

// Partners for fruit, as Jason set them (Oct 30): plants of separate sexes, unsexed, at least 3; a male or female
// cultivar, one of each; a plant needing (or doing better with) a second variety, that.
const fruit: Pick<Plant, 'edible' | 'edible_parts'> = { edible: true, edible_parts: ['fruit'] };
const winterberry: Plant = { id: 'ilex-verticillata', common: 'Winterberry holly', fruit_set: 'separate', fruit_color: ['red/burgundy'] };
const winterRed: Plant = { ...winterberry, id: 'ilex-verticillata-winter-red', common: "Winterberry holly 'Winter Red'", parent: 'ilex-verticillata', sex: 'female' };
const gentleman: Plant = { ...winterberry, id: 'ilex-verticillata-southern-gentleman', common: "Winterberry holly 'Southern Gentleman'", parent: 'ilex-verticillata', sex: 'male' };
const pawpaw: Plant = { id: 'asimina-triloba', common: 'Pawpaw', fruit_set: 'partner', ...fruit };
const davis: Plant = { ...pawpaw, id: 'asimina-triloba-davis', common: "Pawpaw 'Davis'", parent: 'asimina-triloba' };
const wells: Plant = { ...pawpaw, id: 'asimina-triloba-wells', common: "Pawpaw 'Wells'", parent: 'asimina-triloba' };
const blueberry: Plant = { id: 'vaccinium-corymbosum', common: 'Highbush blueberry', fruit_set: 'better', ...fruit };
const fig: Plant = { id: 'ficus-carica', common: 'Fig', fruit_set: 'self', ...fruit };
const catalog = [winterberry, winterRed, gentleman, pawpaw, davis, wells, blueberry, fig];

describe('a partner for fruit (Jason, Oct 30)', () => {
  it('knows a plant\'s species, and whether its fruit matters', () => {
    expect([speciesKey(winterRed), speciesKey(winterberry), speciesKey({ id: 'mine:1', common: 'My holly', species: 'ilex-verticillata' })]).toEqual(['ilex-verticillata', 'ilex-verticillata', 'ilex-verticillata']);
    expect([fruitMatters(pawpaw), fruitMatters(winterberry), fruitMatters({ id: 'x', common: 'Foamflower', fruit_set: 'partner' })]).toEqual([true, true, false]);
  });
  it('a female cultivar: a male of its kind, offered from the catalog', () => {
    const need = fruitNeed(winterRed, [winterRed], catalog);
    expect(need?.line).toBe("Winterberry holly 'Winter Red' is a female: it needs a male of its kind nearby to fruit");
    expect(need?.offer.map((p) => p.id)).toEqual(['ilex-verticillata-southern-gentleman']);
    expect(fruitNeed(winterRed, [winterRed, gentleman], catalog)).toBeNull();
    expect(fruitNeed(winterRed, [winterRed, winterberry], catalog)).not.toBeNull(); // (a seedling's sex isn't known)
  });
  it('a male cultivar: a female, or any plant of its kind not known to be male', () => {
    expect(fruitNeed(gentleman, [gentleman], catalog)?.offer.map((p) => p.id)).toEqual(['ilex-verticillata-winter-red']);
    expect(fruitNeed(gentleman, [gentleman, winterberry], catalog)).toBeNull();
  });
  it('unsexed: at least 3, or a known male', () => {
    expect(fruitNeed(winterberry, [winterberry, winterberry], catalog)?.line).toBe('Winterberry holly has male and female plants: plant at least 3 to likely get both, or a named female and a male');
    expect(fruitNeed(winterberry, [winterberry, winterberry, winterberry], catalog)).toBeNull();
    expect(fruitNeed(winterberry, [winterberry, gentleman], catalog)).toBeNull();
  });
  it('a second variety: another cultivar, or a second seedling; never a clone of it', () => {
    expect(fruitNeed(davis, [davis], catalog)?.line).toBe("Pawpaw 'Davis' needs a second, different variety nearby to fruit");
    expect(fruitNeed(davis, [davis, davis], catalog)).not.toBeNull(); // (two of one cultivar are one clone)
    expect(fruitNeed(davis, [davis, wells], catalog)).toBeNull();
    expect(fruitNeed(pawpaw, [pawpaw, pawpaw], catalog)).toBeNull(); // (two seedlings differ)
    expect(fruitNeed(blueberry, [blueberry], catalog)?.line).toBe('Highbush blueberry fruits on its own, and better with a second variety nearby');
  });
  it('nothing for a plant that fruits on its own, or whose fruit doesn\'t matter', () => {
    expect(fruitNeed(fig, [fig], catalog)).toBeNull();
    expect(fruitNeed({ id: 'tiarella', common: 'Foamflower', fruit_set: 'partner' }, [], catalog)).toBeNull();
  });
});
