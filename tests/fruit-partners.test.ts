import { describe, expect, it } from 'vitest';
import { fruitMatters, fruitNeed, partnerChoices, partnerKind, speciesKey } from '../src/fruit-partners';
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
    // (A named cultivar not sexed is one clone: its copies don't count; two others of its kind, or a male, do. Round 3.)
    const picturata: Plant = { id: 'aucuba-japonica-picturata', common: "Japanese laurel 'Picturata'", fruit_set: 'separate', parent: 'aucuba-japonica', fruit_color: ['red/burgundy'] };
    expect(fruitNeed(picturata, [picturata, picturata, picturata], [...catalog, picturata])?.line).toBe("Japanese laurel 'Picturata' is male or female (its sources don't say), and its copies are all the same: plant others of its kind nearby, or a named male, for fruit");
    const seedling: Plant = { id: 'aucuba-japonica', common: 'Japanese laurel', fruit_set: 'separate', fruit_color: ['red/burgundy'] };
    expect(fruitNeed(picturata, [picturata, seedling, seedling], [...catalog, picturata, seedling])).toBeNull();
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

describe('which partners, first (Jason, Oct 30: "named partners first", then hardy ones; the rest a tap away)', () => {
  const holly = (id: string, name: string, extra: Partial<Plant> = {}): Plant =>
    ({ ...winterberry, id: `ilex-verticillata-${id}`, common: `Winterberry holly '${name}'`, botanical: `Ilex verticillata '${name}'`, parent: 'ilex-verticillata', ...extra });
  const gold = holly('winter-gold', 'Winter Gold', { sex: 'female' }), red = holly('winter-red', 'Winter Red', { sex: 'female', partners: ['Southern Gentleman'] });
  const berry = holly('berry-heavy', 'Berry Heavy', { sex: 'female' }), sparkle = holly('sparkleberry', 'Sparkleberry', { sex: 'female' });
  const sg = holly('southern-gentleman', 'Southern Gentleman', { sex: 'male' }), jim = holly('jim-dandy', 'Jim Dandy', { sex: 'male' });
  const all = [winterberry, gold, berry, sparkle, red, jim, sg];
  it('a male: the females whose sources name it first, then the rest in the catalog\'s order, two offered, all of them listed', () => {
    const need = fruitNeed(sg, [sg], all);
    expect(need?.offer.map((p) => p.common)).toEqual(["Winterberry holly 'Winter Red'", "Winterberry holly 'Winter Gold'"]);
    expect(need?.all.length).toBe(4);
  });
  it('those its own sources name first; then those hardy here', () => {
    const picky = holly('picky', 'Picky', { sex: 'female', partners: ['Southern Gentleman'] });
    expect(partnerChoices(picky, all, partnerKind(picky)!).map((p) => p.id)).toEqual([sg.id, jim.id]);
    const notGold = (q: Plant) => q.id !== gold.id;
    expect(partnerChoices(jim, all, partnerKind(jim)!, notGold).map((p) => p.id)).toEqual([berry.id, sparkle.id, red.id, gold.id]);
  });
  it('one its sources name that the catalog lacks is said; one named, planted, is a partner whatever its kind', () => {
    const emily = holly('emily', 'Emily', { sex: 'female', partners: ['James Swan'] });
    expect(fruitNeed(emily, [emily], all)?.line).toBe("Winterberry holly 'Emily' is a female: it needs a male of its kind nearby to fruit; NC State suggests 'James Swan'");
    const named = holly('named', 'Named', { sex: 'female', partners: ['Sparkleberry'] });
    expect(fruitNeed(named, [named, sparkle], all)).toBeNull();
  });
});

