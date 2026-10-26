import { describe, expect, it } from 'vitest';
import { byMatch, closeMatchIn, inNotes, matchPlant, nearShows, readQuery } from '../src/search';
import { bloomMatch, earlierOnly, filterOn, matchedBy, seasonMonths, trueToColor, nonToxicToDogs, PLANT_FILTER_DEFAULTS, pickerCount, plantMatches, reportedPhrase, rowFlags, rowLines, shareDogWarnings, speciesOf, sunSaid, toxicToDogs, plantTakesSun, reportedMatch, searchRank, type Plant } from '../src/plants';
import { HABIT_SPREAD, rootSpread, rootText, seedText, spreadsAs, spreadWays } from '../src/spread';
import { readFileSync } from 'node:fs';
import { HEIGHT_STOPS, heightLabel, heightStops, heightValue } from '../src/ui/height-range';
import { fallText, poisonRow, poisonText, toxRow, winterText } from '../src/ui/plant-details';

const heuchera: Plant = {
  id: 'h', common: "Heuchera 'Autumn Bride'", botanical: 'Heuchera villosa', form: 'Perennial',
  dog: 'Safe', sun_most: 'Part', sun_least: 'Shade', water: 'Low', dry_shade: true,
  height: { med: 1.75 }, width: { med: 2.5 }, bloom: { start: 9, end: 10 }, nectar: 'Low'
};
const f = (over: Partial<typeof PLANT_FILTER_DEFAULTS> = {}) => ({ ...PLANT_FILTER_DEFAULTS, ...over });

describe('poisonous to people, in its source\'s words', () => {
  it('names the parts, how severe, and skin irritation, as NC State gives them', () => {
    expect(poisonText({ severity: 'high', parts: ['leaves', 'roots', 'seeds', 'stems'], skin: true })).toBe('Leaves, roots, seeds and stems, high severity; can irritate skin');
    expect(poisonText({ severity: 'medium', parts: ['seeds'] })).toBe('Seeds, medium severity');
    expect(poisonText({ severity: 'low' })).toBe('Low severity');
    expect(poisonText({ skin: true })).toBe('Can irritate skin');
    expect(poisonText({})).toBe('Yes; no part or severity given'); // (listed for people, nothing more said)
    expect(poisonText(undefined)).toBe('');
  });
  it("says none listed where its source was read and silent, and not known where no source rates it: never nothing", () => {
    const p = { id: 'a', common: 'Aster' } as Plant;
    expect(poisonRow({ ...p, prov: { poison: { src: ['ncsu'], unknown: true } } } as Plant)).toBe('None listed');
    expect(poisonRow(p)).toBe('Not known: no source we read rates it for people');
    expect(poisonRow({ ...p, poison: { severity: 'low' } } as Plant)).toBe('Low severity');
  });
});

describe('plant filters', () => {
  it('let what nurseries report count (by choice), and say when a match rests on it', () => {
    const h = { id: 'h', common: 'Heuchera', sun_most: 'Part', sun_least: 'Shade', reported: { sun_most: 'Full' } } as Plant;
    const fs = (o: Partial<typeof PLANT_FILTER_DEFAULTS>) => ({ ...PLANT_FILTER_DEFAULTS, ...o });
    expect(reportedMatch(h, fs({ sun: 'Part' }))).toEqual([]); // (the references say so)
    expect(reportedMatch(h, fs({ sun: 'Full' }))).toEqual(['sun']); // (only nurseries say so)
    expect(reportedMatch(h, fs({ sun: 'Full', withReported: false }))).toBeNull();
    expect(reportedMatch({ ...h, reported: undefined }, fs({ sun: 'Full' }))).toBeNull();
    // Each filter on its own: only the one that needed the nursery is named…
    const w = { ...h, water: 'Low', reported: { sun_most: 'Full', water: 'Moderate' } } as Plant;
    expect(reportedMatch(w, fs({ sun: 'Part', water: 'Moderate' }))).toEqual(['water']);
    // …a nursery's value that would fail a filter the references pass doesn't hide the plant…
    expect(reportedMatch({ ...w, sun_most: 'Full', sun_least: 'Part', reported: { sun_most: 'Part', water: 'Moderate' } } as Plant, fs({ sun: 'Full', water: 'Moderate' }))).toEqual(['water']);
    // …and a filter that isn't in use (zones, with no location) is never named.
    expect(reportedMatch(w, fs({ hardyHere: true, water: 'Moderate' }))).toEqual(['water']);
    // A reported single form against a list of forms.
    const redbud = { id: 'r', common: 'Redbud', form: 'Tree', forms: ['Tree', 'Shrub'], reported: { form: 'Perennial' } } as Plant;
    expect(reportedMatch(redbud, fs({ form: 'Perennial' }))).toEqual(['form']);
    // Facts nurseries aren't taken for never count, even if a record carried them.
    const dog = { id: 'd', common: 'D', tox: { dog: 'toxic' }, reported: { tox: { dog: 'nontoxic' } } } as unknown as Plant;
    expect(reportedMatch(dog, fs({ dogs: 'nonToxic' }))).toBeNull();
    const inv = { id: 'i', common: 'I', invasive: true, reported: { invasive: false } } as unknown as Plant;
    expect(reportedMatch(inv, fs({}))).toBeNull();
  });
  it('match a plant under each of its forms', () => {
    const redbud = { id: 'r', common: 'Redbud', form: 'Tree', forms: ['Tree', 'Shrub'] } as Plant;
    const fo = (form: string) => ({ ...PLANT_FILTER_DEFAULTS, form });
    expect(plantMatches(redbud, fo('Shrub'))).toBe(true);
    expect(plantMatches(redbud, fo('Tree'))).toBe(true);
    expect(plantMatches(redbud, fo('Vine'))).toBe(false);
    expect(plantMatches({ id: 'h', common: 'Heuchera', form: 'Perennial' } as Plant, fo('Perennial'))).toBe(true);
  });
  it('treats sun tolerance as a range', () => {
    expect(plantTakesSun(heuchera, 'Part')).toBe(true);
    expect(plantTakesSun(heuchera, 'Shade')).toBe(true);
    expect(plantTakesSun(heuchera, 'Full')).toBe(false);
    expect(plantTakesSun(heuchera, '')).toBe(true);
  });
  it('matches on bloom month within the range', () => {
    expect(plantMatches(heuchera, f({ bloomMonth: '9' }))).toBe(true);
    expect(plantMatches(heuchera, f({ bloomMonth: '5' }))).toBe(false);
  });
  it('counts a plant whose season covers the month asked for, where it has no months; a season, by its months', () => {
    expect(seasonMonths('summer')).toEqual([6, 7, 8]);
    expect([seasonMonths('early spring'), seasonMonths('mid summer'), seasonMonths('late fall'), seasonMonths('winter')]).toEqual([[3], [7], [11], [12, 1, 2]]);
    const aster = { id: 'a', common: 'Aster', bloom_season: ['fall'] } as Plant;
    expect([bloomMatch(aster, '10'), bloomMatch(aster, '6'), bloomMatch(aster, 'fall'), bloomMatch(aster, 'spring')]).toEqual(['season', null, 'season', null]);
    // (Its sources' season comes before the earlier list's months; with neither, no match.)
    expect(bloomMatch({ ...aster, bloom: { start: 5, end: 6 } }, '6')).toBe('earlier');
    expect(bloomMatch(heuchera, 'fall')).toBe('earlier');
    expect(bloomMatch({ id: 'x', common: 'X' } as Plant, '6')).toBeNull();
    expect(plantMatches(aster, f({ bloomMonth: '9' }))).toBe(true);
  });
  it('matches any flower color ticked; says whether the color is what you get (a cultivar, or a species of one color)', () => {
    const cone = { id: 'c', common: 'Purple coneflower', botanical: 'Echinacea purpurea', flower_color: ['purple', 'pink', 'red'] } as Plant;
    expect(plantMatches(cone, f({ flowerColors: ['red', 'white'] }))).toBe(true);
    expect(plantMatches(cone, f({ flowerColors: ['white'] }))).toBe(false);
    expect(plantMatches({ ...cone, flower_color: ['insignificant'] }, f({ flowerColors: ['green'] }))).toBe(false);
    expect(trueToColor(cone)).toBe(false);
    expect(trueToColor({ ...cone, common: "Coneflower 'Tomato Soup'" })).toBe(true);
    expect(trueToColor({ ...cone, parent: 'echinacea-purpurea' })).toBe(true);
    expect(trueToColor({ ...cone, common: "Bush's coneflower" })).toBe(false); // (a possessive isn't a cultivar name)
    expect(trueToColor({ ...cone, flower_color: ['white', 'cream'] })).toBe(true); // (white and cream count as one)
  });
  it('matches leaf colors and who it attracts by any ticked; bees take in specialized bees', () => {
    const p = { id: 'p', common: 'P', leaf_color: ['green', 'silver'], attracts: ['specialized bees', 'moths'] } as Plant;
    expect(plantMatches(p, f({ leafColors: ['silver', 'gold'] }))).toBe(true);
    expect(plantMatches(p, f({ leafColors: ['gold'] }))).toBe(false);
    expect(plantMatches(p, f({ attracts: ['bees'] }))).toBe(true);
    expect(plantMatches(p, f({ attracts: ['hummingbirds'] }))).toBe(false);
  });
  it('filters on NC State\'s words: low maintenance, drought or dry soil, deer resistant; hides thorns and pet warnings only where listed', () => {
    const p = { id: 'p', common: 'P', maintenance_level: 'low', tolerates: ['dry soil'], deer: 'Resistant' } as Plant;
    expect(plantMatches(p, f({ lowMaintenance: true, drought: true, deerResistant: true, noThorns: true, cats: true, horses: true }))).toBe(true);
    expect(plantMatches({ ...p, maintenance_level: 'medium' }, f({ lowMaintenance: true }))).toBe(false);
    expect(plantMatches({ ...p, tolerates: ['deer'] }, f({ drought: true }))).toBe(false);
    expect(plantMatches({ ...p, deer: 'Occasional' }, f({ deerResistant: true }))).toBe(false);
    expect(plantMatches({ ...p, thorns: true }, f({ noThorns: true }))).toBe(false);
    expect(plantMatches({ ...p, problem_for: ['cats'] }, f({ cats: true }))).toBe(false);
    expect(plantMatches({ ...p, problem_for: ['cats'] }, f({ horses: true }))).toBe(true);
  });
  it('filters natives to North America by the earlier list\'s words, its regional natives included', () => {
    expect(plantMatches(heuchera, f({ native: '@na' }))).toBe(false);
    expect(plantMatches({ ...heuchera, native: 'Regional native' }, f({ native: '@na' }))).toBe(true);
    expect(plantMatches({ ...heuchera, native: 'Exotic' }, f({ native: '@na' }))).toBe(false);
  });
  it('says a filter is on when it differs from its default, a list when it has anything in it', () => {
    expect(filterOn(f(), 'flowerColors')).toBe(false);
    expect(filterOn(f({ flowerColors: ['red'] }), 'flowerColors')).toBe(true);
    expect(filterOn(f({ withReported: false }), 'withReported')).toBe(true);
    expect(filterOn(f({ form: 'Shrub' }), 'form')).toBe(true);
    expect(Object.isFrozen(PLANT_FILTER_DEFAULTS.flowerColors)).toBe(true); // (changed only by a new list, never in place)
  });
  it('shows dog-unsafe plants unless asked; hides nothing else by default', () => {
    expect(plantMatches({ ...heuchera, dog: 'Mild GI' }, f())).toBe(true);
    expect(plantMatches({ ...heuchera, dog: 'Mild GI' }, f({ dogs: 'nonToxic' }))).toBe(false);
    expect(plantMatches({ ...heuchera, dog: 'HARD NO' }, f())).toBe(true);
  });
  it('keeps, when asked, only plants whose NC State page lists no poison to people: not those listed, nor those not rated', () => {
    const mayapple = { ...heuchera, poison: { severity: 'high', parts: ['leaves', 'roots', 'seeds', 'stems'], skin: true } } as Plant;
    const none = { ...heuchera, prov: { ...heuchera.prov, poison: { src: ['ncsu'], unknown: true } } } as Plant;
    expect(plantMatches(mayapple, f())).toBe(true);
    expect(plantMatches(mayapple, f({ noPoison: true }))).toBe(false);
    expect(plantMatches({ ...heuchera, poison: {} } as Plant, f({ noPoison: true }))).toBe(false); // (listed, nothing more said)
    expect(plantMatches(none, f({ noPoison: true }))).toBe(true);
    expect(plantMatches(heuchera, f({ noPoison: true }))).toBe(false); // (not rated: not called safe, as the dog filter)
  });
  it('keeps, when asked, only evergreens: not semi-evergreen (it depends on the winter), nor plants no source rates', () => {
    expect(plantMatches({ ...heuchera, foliage: 'evergreen' }, f({ evergreen: true }))).toBe(true);
    expect(plantMatches({ ...heuchera, foliage: 'semi-evergreen' }, f({ evergreen: true }))).toBe(false);
    expect(plantMatches({ ...heuchera, foliage: 'deciduous' }, f({ evergreen: true }))).toBe(false);
    expect(plantMatches(heuchera, f({ evergreen: true }))).toBe(false);
    // (A tender shrub, also listed as an annual or perennial, keeps its leaves only where winters are mild.)
    expect(plantMatches({ ...heuchera, form: 'Shrub', forms: ['Shrub', 'Perennial', 'Annual'], foliage: 'evergreen' }, f({ evergreen: true }))).toBe(false);
    expect(plantMatches({ ...heuchera, form: 'Shrub', forms: ['Shrub'], foliage: 'evergreen' }, f({ evergreen: true }))).toBe(true);
  });
  it('says what happens to its leaves in winter in words fit for its form', () => {
    expect(winterText({ ...heuchera, foliage: 'evergreen' })).toBe('Evergreen: keeps its leaves');
    expect(winterText({ ...heuchera, foliage: 'deciduous' })).toBe('Dies back in winter'); // (an herb: no bare branches)
    expect(winterText({ ...heuchera, form: 'Shrub', foliage: 'deciduous' })).toBe('Deciduous: loses its leaves');
    expect(winterText({ ...heuchera, form: 'Tree', forms: ['Tree', 'Shrub'], foliage: 'semi-evergreen' })).toBe('Semi-evergreen: keeps some of its leaves, by the winter');
    expect(winterText({ ...heuchera, form: 'Tree', foliage: 'evergreen', needles: true })).toBe('Evergreen, with needles');
    expect(winterText({ ...heuchera, form: 'Annual', foliage: 'deciduous' })).toBe(''); // (one season)
    expect(winterText(heuchera)).toBe('');
    // (An annual or perennial is an herb; a grass goes dormant, often standing.)
    expect(winterText({ ...heuchera, form: 'Annual', forms: ['Annual', 'Perennial'], foliage: 'deciduous' })).toBe('Dies back in winter'); // (black-eyed Susan)
    expect(winterText({ ...heuchera, form: 'Grass/Sedge', forms: ['Grass/Sedge', 'Perennial'], foliage: 'deciduous' })).toBe('Goes dormant in winter');
    // (Listed as woody and as an herb, or as a vine and a perennial: either, by the plant.)
    expect(winterText({ ...heuchera, form: 'Perennial', forms: ['Perennial', 'Shrub'], foliage: 'deciduous' })).toBe('Deciduous: loses its leaves, or dies back to the ground'); // (swamp rose mallow)
    expect(winterText({ ...heuchera, form: 'Vine', forms: ['Vine', 'Perennial'], foliage: 'deciduous' })).toBe('Deciduous: loses its leaves, or dies back to the ground'); // (passionflower)
    expect(winterText({ ...heuchera, form: 'Vine', forms: ['Vine'], foliage: 'deciduous' })).toBe('Deciduous: loses its leaves');
    expect(winterText({ ...heuchera, form: 'Shrub', forms: ['Shrub', 'Perennial', 'Annual'], foliage: 'evergreen' })).toBe('Evergreen where winters are mild; may die back in a cold one'); // ('Miss Huff' lantana)
  });
  it('says whether it colors in fall, and in what colors', () => {
    expect(fallText({ ...heuchera, fall_color: true, fall_colors: ['gold', 'red'] })).toBe('Yes: gold, red');
    expect(fallText({ ...heuchera, fall_color: true })).toBe('Yes');
    expect(fallText({ ...heuchera, fall_color: false, fall_colors: ['gold'] })).toBe('No');
    expect(fallText({ ...heuchera, fall_colors: ['gold'] })).toBe('Gold');
    expect(fallText(heuchera)).toBe('');
  });
  it('never suggests invasives, but finds them by name', () => {
    const privet: Plant = { id: 'p', common: 'Chinese privet', botanical: 'Ligustrum sinense', invasive: true };
    expect(plantMatches(privet, f())).toBe(false);
    expect(plantMatches(privet, f({ q: 'privet' }))).toBe(true);
    expect(plantMatches(privet, f({ inPlan: true }), new Set(['p']))).toBe(true);
  });
  it('counts what it offers, and says where the invasives went (so the gap never reads as a filter left on)', () => {
    expect(pickerCount(3622, 3622, 22)).toBe('All 3,622 plants \u00b7 22 invasive plants show only when searched by name');
    expect(pickerCount(140, 3622, 22)).toBe('140 of 3,622 plants match \u00b7 22 invasive plants show only when searched by name');
    expect(pickerCount(1, 3622, 1)).toContain('1 invasive plant shows only');
    expect(pickerCount(12, 3644, 0)).toBe('12 of 3,644 plants match'); // (a search: they count, and may be among the 12)
  });
  it('can show only plants already placed in the open plan', () => {
    expect(plantMatches(heuchera, f({ inPlan: true }), new Set(['h']))).toBe(true);
    expect(plantMatches(heuchera, f({ inPlan: true }), new Set(['other']))).toBe(false);
  });
  it('finds a plant by another name it goes by, or had (after cultivar names were reordered)', () => {
    const lime: Plant = { id: 'l', common: "Hydrangea 'Limelight'", botanical: "Hydrangea paniculata 'Limelight'", synonyms: ['Limelight Hydrangea'] };
    const bonica: Plant = { id: 'b', common: 'Rosa Bonica', botanical: "Rosa Bonica 'MELdomonac'", synonyms: ['Bonica 82'] };
    const weed: Plant = { id: 'w', common: 'Butterfly milkweed', botanical: 'Asclepias tuberosa', synonyms: ['Chiggerflower'] };
    expect(matchPlant(bonica, readQuery('bonica 82')!, false)).not.toBeNull();
    expect(matchPlant(weed, readQuery('chigger')!, false)).not.toBeNull();
    expect(matchPlant(lime, readQuery('limelight hydrangea')!, false)?.rank).toBe(0); // (its own name has both words)
    expect(matchPlant(weed, readQuery('monarch')!, false)).toBeNull();
  });
  it('searches common and botanical names case-insensitively', () => {
    expect(plantMatches(heuchera, f({ q: 'VILLOSA' }))).toBe(true);
    expect(plantMatches(heuchera, f({ q: 'oak' }))).toBe(false);
  });
  it('lets what nurseries report count for the height range, flagged', () => {
    const vine: Plant = { ...heuchera, id: 'v', height: { med: 22.5 }, reported: { height: { min: 40, max: 60, med: 50 } } };
    expect(reportedMatch(vine, f({ height: '40-', withReported: true }))).toEqual(['height']);
    expect(reportedMatch(vine, f({ height: '40-', withReported: false }))).toBeNull();
    expect(reportedMatch(vine, f({ height: '20-30', withReported: true }))).toEqual([]);
  });
  it('applies the height range to the typical (median) height', () => {
    expect(plantMatches(heuchera, f({ height: '-2' }))).toBe(true);
    expect(plantMatches(heuchera, f({ height: '-1' }))).toBe(false);
    expect(plantMatches(heuchera, f({ height: '1-2' }))).toBe(true);
    expect(plantMatches(heuchera, f({ height: '2-' }))).toBe(false); // (by its typical height)
  });
  it('ranks name matches first, and says when a plant matched only by what it hosts', () => {
    const smooth: Plant = { id: 's', common: "Smooth hydrangea 'Haas' Halo'", botanical: 'Hydrangea arborescens' };
    const goldenseal: Plant = { id: 'g', common: 'Goldenseal', botanical: 'Hydrastis canadensis' };
    const buttonbush: Plant = { id: 'b', common: 'Buttonbush', botanical: 'Cephalanthus occidentalis', host: 'Hydrangea sphinx, titan sphinx moths' };
    expect(searchRank(smooth, 'hydra')).toBe(0); // a word in its name
    expect(searchRank(goldenseal, 'Hydra')).toBe(2); // botanical name
    expect(searchRank(buttonbush, 'hydra')).toBe(3); // only its host
    expect(matchedBy(buttonbush, 'hydra')).toBe('host');
    expect(matchedBy(buttonbush, 'button')).toBe('name');
    expect(searchRank(buttonbush, 'oak')).toBe(-1);
    expect(searchRank({ id: 'x', common: 'Purple coneflower' }, 'flower')).toBe(1); // inside a word
  });
  it('matches a search word by word, in any order, across punctuation and spacing', () => {
    const pear: Plant = { id: 'p', common: 'Bradford/Callery pear', botanical: 'Pyrus calleryana' };
    const witherod: Plant = { id: 'w', common: "Witherod viburnum 'Winterthur'", botanical: 'Viburnum nudum' };
    const hazel: Plant = { id: 'h', common: 'Common witch hazel', botanical: 'Hamamelis virginiana' };
    const beebalm: Plant = { id: 'b', common: 'Spotted beebalm', botanical: 'Monarda punctata' };
    expect(searchRank(pear, 'Bradford pear')).toBe(0); // (the slash split the name: it didn't match before)
    expect(searchRank(witherod, 'Winterthur viburnum')).toBe(0); // (its words in another order)
    expect(searchRank(witherod, 'winterthur nudum')).toBe(2); // (name and botanical name together)
    expect(searchRank(hazel, 'witchhazel')).toBe(0); // run together, from a word's start
    expect(searchRank(beebalm, 'bee balm')).toBe(1); // split apart
    expect(searchRank(pear, 'Bradford oak')).toBe(-1); // (every word must match)
    expect(searchRank({ id: 'e', common: 'Échinacée' }, 'echinacee')).toBe(0); // (accents aside)
  });
  it('finds a near spelling, but only when nothing anywhere matches closer', () => {
    const witherod: Plant = { id: 'w', common: "Witherod viburnum 'Winterthur'", botanical: 'Viburnum nudum' };
    const cranberry: Plant = { id: 'cb', common: 'American cranberrybush', botanical: 'Viburnum trilobum' };
    const coreopsis: Plant = { id: 'c', common: 'Lance-leaf coreopsis', botanical: 'Coreopsis lanceolata' };
    const goldenrod: Plant = { id: 'g', common: 'Gray goldenrod', botanical: 'Solidago nemoralis' };
    const alexanders: Plant = { id: 'a', common: 'Golden Alexanders', botanical: 'Zizia aurea' };
    expect(searchRank(witherod, 'viburnam')).toBe(4); // a letter changed, in its name
    expect(searchRank(cranberry, 'viburnam')).toBe(5); // in its botanical name: after those in the name
    expect(searchRank(coreopsis, 'corepsis')).toBe(4); // one dropped
    expect(searchRank(coreopsis, 'croeopsis')).toBe(4); // two swapped
    expect(searchRank(goldenrod, 'goldenrd')).toBe(4);
    expect(searchRank(alexanders, 'goldenrd')).toBe(-1); // ("golden" is two off: too far for eight letters)
    expect(searchRank(witherod, 'vib')).toBe(0); // (as it's typed)
    expect(searchRank({ id: 'p', common: 'Partridge pea' }, 'pear')).toBe(-1); // (four letters: too short to guess at)
    expect(searchRank({ id: 'ch', common: 'Chinese privet' }, 'chives')).toBe(-1); // (two off)
    expect(searchRank({ id: 'ap', common: 'Appalachian sedge', botanical: 'Carex appalachica' }, 'hackberry')).toBe(-1); // (nothing like it)
    expect(searchRank({ id: 'e', common: 'Fancy echinacea hybrids' }, 'echinsc')).toBe(4); // (a slip in the start of a longer word)
    // Shown only when nothing matches closer: decided over everything searched, before filters.
    const q = readQuery('viburnam')!;
    expect(closeMatchIn(q, [witherod, cranberry])).toBe(false);
    expect(closeMatchIn(readQuery('viburnum')!, [goldenrod], [witherod])).toBe(true); // (in either list)
    expect(matchedBy(witherod, 'viburnam')).toBe('name');
    expect(matchedBy(cranberry, 'viburnam')).toBe('botanical');
  });
  it('finds a plural\'s singular, and nothing for a search of punctuation alone', () => {
    const aster: Plant = { id: 'a', common: "Aromatic aster 'October Skies'", botanical: 'Symphyotrichum oblongifolium' };
    expect(searchRank(aster, 'asters')).toBe(0);
    expect(searchRank({ id: 'g', common: 'Little bluestem', botanical: 'Schizachyrium scoparium' }, 'grasses')).toBe(-1);
    expect(searchRank({ id: 'm', common: 'Pink muhly grass' }, 'grasses')).toBe(0);
    expect(readQuery("'")).toBe(null); // (starting a cultivar name: not yet a search)
    expect(readQuery(' - / ')).toBe(null);
    const privet: Plant = { id: 'pr', common: 'Chinese privet', invasive: true };
    expect(plantMatches(privet, f({ q: "'" }))).toBe(false); // (invasives stay out: it isn't a search for one)
  });
  it('matches words run together only from a word\'s start, and botanical names from a word\'s start', () => {
    expect(searchRank({ id: 'h', common: "Smooth hydrangea 'Haas' Halo'", botanical: 'Hydrangea arborescens' }, 'ash')).toBe(-1);
    expect(searchRank({ id: 'b', common: 'Arkansas bluestar', botanical: 'Amsonia hubrichtii' }, 'brich')).toBe(-1);
    expect(searchRank({ id: 'b', common: 'Arkansas bluestar', botanical: 'Amsonia hubrichtii' }, 'hubri')).toBe(2);
    expect(searchRank({ id: 'w', common: 'White avens', botanical: 'Geum canadense' }, 'itea')).toBe(-1);
  });
  it('reads a plural as its singular only as a whole word', () => {
    const rank = (common: string, query: string, botanical?: string) => searchRank({ id: 'x', common, botanical }, query);
    expect(rank('Blue flag iris', 'iris')).toBe(0);
    expect(rank('Prairie alumroot', 'iris')).toBe(-1); // ("iris" isn't a plural: not "iri" in "prairie")
    expect(rank('Climbing rose', 'roses')).toBe(0);
    expect(rank('Rosemary', 'roses')).toBe(-1); // (not "ros")
    expect(rank('Pink muhly grass', 'pines')).toBe(-1); // (not "pin")
    expect(rank('Prairie lily', 'lilies')).toBe(0);
    expect(rank('Black chokeberry', 'berries')).toBe(0); // ("-ies": the end of a word too)
    expect(rank("Beebalm 'Raspberry Wine'", 'berries')).toBe(-1); // (but not a cultivar's)
    expect(rank('Common blue violet', 'skies')).toBe(-1);
    expect(rank('Bottlebrush grass', 'grasses')).toBe(0);
  });
  it('lists plants that are what was searched before ones named for it', () => {
    const plants: Plant[] = [{ id: 'f', common: 'Oak fern' }, { id: 'h', common: "Oakleaf hydrangea 'Alice'" }, { id: 'b', common: 'Bur oak' }, { id: 't', common: 'Tree of heaven' }, { id: 'c', common: 'Chaste tree' }];
    const ids = (query: string) => { const q = readQuery(query)!; return plants.flatMap((plant) => { const hit = matchPlant(plant, q, true); return hit ? [{ plant, hit }] : []; }).sort(byMatch).map((x) => x.plant.id); };
    expect(ids('oak')).toEqual(['b', 'f', 'h']);
    expect(ids('oaks')).toEqual(['b', 'f']);
    expect(ids('tree')).toEqual(['c', 't']);
    expect(ids('trees')).toEqual(['c', 't']);
  });
  it('shows close spellings only when nothing matches as typed, a plant of mine\'s notes included', () => {
    const fence: Plant = { id: 'm', common: 'Mystery shrub', notes: 'By the back fence' };
    const fennel: Plant = { id: 'fe', common: 'Bronze fennel' };
    expect(nearShows(readQuery('fence'), [fennel], [])).toBe(true);
    expect(nearShows(readQuery('fence'), [fennel], [fence])).toBe(false); // (found by its notes: a match as typed)
    expect(nearShows(readQuery("'"), [fennel], [fence])).toBe(false); // (no search)
    expect(inNotes(fence, readQuery('fences')!)).toBe(true);
  });
  it('puts a plant\'s own name first', () => {
    const plants: Plant[] = [
      { id: 'h', common: 'Hairy mountain mint' }, { id: 'm', common: 'Mountain mint' }, { id: 'o', common: 'Hoary mountain mint' },
      { id: 'w', common: "Wood's sedge" }, { id: 's', common: 'Woodland sedge' },
    ];
    const first = (query: string) => {
      const q = readQuery(query)!;
      return plants.flatMap((plant) => { const hit = matchPlant(plant, q, true); return hit ? [{ plant, hit }] : []; }).sort(byMatch)[0].plant.id;
    };
    expect(first('mountain mint')).toBe('m');
    expect(first("wood's sedge")).toBe('w');
    expect(first('woods sedge')).toBe('w');
  });
  it('calls a plant non-toxic to dogs only when nothing says otherwise', () => {
    expect(nonToxicToDogs({ id: 'a', common: 'A', dog: 'Safe' })).toBe(true); // the earlier list, until checked
    expect(nonToxicToDogs({ id: 'a', common: 'A', dog: 'Unverified' })).toBe(false);
    expect(nonToxicToDogs({ id: 'a', common: 'A', dog: 'Unverified', tox: { dog: 'nontoxic' } })).toBe(true);
    expect(nonToxicToDogs({ id: 'a', common: 'A', tox: { dog: 'unlisted' } })).toBe(false); // not listed isn't safe
    expect(nonToxicToDogs({ id: 'a', common: 'A', dog: 'HARD NO', tox: { dog: 'nontoxic' } })).toBe(false); // the warning holds until the audit settles it
  });
  it('gives a warning for one record of a species to the others, which then say so (never silence, which reads as safe)', () => {
    expect(speciesOf('Asclepias tuberosa (clay strain)')).toBe('Asclepias tuberosa');
    expect(speciesOf("Ilex verticillata 'Southern Gentleman'")).toBe('Ilex verticillata');
    expect(speciesOf('Abelia x grandiflora')).toBe('Abelia × grandiflora');
    expect(speciesOf("Hosta 'Halcyon'")).toBeNull();
    expect(speciesOf('Carex spp.')).toBeNull();
    const clay: Plant = { id: 'clay', common: "Butterfly weed 'for Clay'", botanical: 'Asclepias tuberosa (clay strain)', dog: 'Toxic - rarely eaten' };
    const sp: Plant = { id: 'sp', common: 'Butterfly milkweed', botanical: 'Asclepias tuberosa' };
    const safe: Plant = { id: 'hb', common: "Butterfly weed 'Hello Yellow'", botanical: "Asclepias tuberosa 'Hello Yellow'", dog: 'Safe' };
    const other: Plant = { id: 'sw', common: 'Swamp milkweed', botanical: 'Asclepias incarnata' };
    shareDogWarnings([clay, sp, safe, other]);
    expect(sp.dogVia).toEqual({ id: 'clay', common: "Butterfly weed 'for Clay'", dog: 'Toxic - rarely eaten' });
    expect(clay.dogVia).toBeUndefined(); // (its own)
    expect(other.dogVia).toBeUndefined(); // (another species)
    expect(nonToxicToDogs(safe)).toBe(false); // (a warning beats the earlier list's "Safe" for one record)
    expect(toxicToDogs(sp)).toBe(true);
    expect(toxRow(sp)).toEqual({ value: 'dogs: Toxic - rarely eaten', line: "earlier list, unverified · given for Butterfly weed 'for Clay', the same species" });
    expect(toxRow(safe)!.line).toContain('the earlier list calls this one safe');
    expect(toxRow(other)).toEqual({ value: 'Not rated for pets', line: 'No source we\u2019ve read rates it for dogs, cats or horses' });
    // NC State's "Problem for Dogs" (cats, horses): a warning, ahead of the earlier list's word; an NC State page that
    // lists none says so, and that it isn't the same as safe.
    const flagged: Plant = { id: 'ff', common: 'Flagged', dog: 'Safe', problem_for: ['dogs', 'cats'], prov: { problem_for: { src: ['ncsu'], check: 'single' } } };
    expect(toxicToDogs(flagged)).toBe(true);
    expect(nonToxicToDogs(flagged)).toBe(false);
    expect(toxRow(flagged)!.value).toBe('A problem for dogs and cats');
    const catsOnly: Plant = { id: 'fc', common: 'Cats only', dog: 'Mild GI', problem_for: ['cats'], prov: { problem_for: { src: ['ncsu'], check: 'single' } } };
    expect(toxRow(catsOnly)!.value).toBe('A problem for cats; dogs: Mild GI');
    const readNone: Plant = { id: 'rn', common: 'Read', prov: { poison: { src: ['ncsu'], unknown: true } } };
    expect(toxRow(readNone)!.value).toBe('Not listed as a problem for dogs, cats or horses');
    expect(toxRow({ id: 'u-1', common: 'Mine' })).toBeNull(); // (a plant of mine: the person's own notes)
    // The species' own record's warning is the one given, where it has one.
    const a: Plant = { id: 'a', common: "Oakleaf 'Alice'", botanical: "Hydrangea quercifolia 'Alice'", dog: 'Mild GI' };
    const b: Plant = { id: 'b', common: 'Oakleaf hydrangea', botanical: 'Hydrangea quercifolia', dog: 'Toxic' };
    const c: Plant = { id: 'c', common: "Oakleaf 'Ruby'", botanical: "Hydrangea quercifolia 'Ruby'" };
    shareDogWarnings([a, b, c]);
    expect(c.dogVia?.id).toBe('b');
  });
  it('filters dogs three ways: any, hide toxic (keep unrated), only non-toxic', () => {
    const toxic: Plant = { id: 't', common: 'T', dog: 'Toxic' }, unrated: Plant = { id: 'u', common: 'U' }, safe: Plant = { id: 's', common: 'S', dog: 'Safe' };
    const via: Plant = { id: 'v', common: 'V', dogVia: { id: 't', common: 'T', dog: 'Toxic' } };
    const shown = (dogs: typeof PLANT_FILTER_DEFAULTS.dogs) => [toxic, unrated, safe, via].filter((p) => plantMatches(p, f({ dogs }))).map((p) => p.id);
    expect(shown('')).toEqual(['t', 'u', 's', 'v']);
    expect(shown('hideToxic')).toEqual(['u', 's']);
    expect(shown('nonToxic')).toEqual(['s']);
  });
});

describe('a picker row', () => {
  it('says its names and forms, then its size as its sources give it, its sun and its zones', () => {
    const r = rowLines({ ...heuchera, height: { min: 1.5, max: 2, med: 1.75 }, width: { min: 0.67, max: 1.5, med: 1.08 }, zone_min: 4, zone_max: 9.5 });
    expect(r).toEqual({ names: "Heuchera villosa \u00b7 Perennial", size: '1.5\u20132 ft tall, 8 in\u20131.5 ft wide', sun: 'Part shade to shade', hardy: { text: 'Zones 4\u20139', ok: true } });
    // (A botanical name that is its name isn't said twice; one size alone.)
    expect(rowLines({ id: 'a', common: 'Adiantum × mairisii', botanical: 'Adiantum × mairisii', form: 'Fern', height: { med: 1.25 } })).toMatchObject({ names: 'Fern', size: '1.3 ft tall' });
    expect([sunSaid('Full', 'Full'), sunSaid('Full', 'Shade'), sunSaid()]).toEqual(['Full sun', 'Full sun to shade', '']);
  });
  it('marks only what applies: skin irritation (not poison that\'s eaten), invasive, how far it\'s checked', () => {
    expect(rowFlags(heuchera)).toEqual([]);
    expect(rowFlags({ ...heuchera, poison: { severity: 'high', parts: ['leaves'] } })).toEqual([]);
    expect(rowFlags({ ...heuchera, poison: { skin: true }, invasive: true, unverified: true }).map((x) => x.text)).toEqual(['Invasive: not for planting', 'Can irritate skin', 'Unverified']);
    expect(rowFlags({ ...heuchera, partlyChecked: true }).map((x) => x.testid)).toEqual(['partly-badge']);
  });
  it('puts a match resting only on the earlier list below its own divider, naming the filter', () => {
    const sources = { compendium: { title: 'Earlier list', trust: 'unverified' as const }, ncsu: { title: 'NC State', trust: 'reference' as const } };
    const p = { ...heuchera, deer: 'Resistant', wet_feet: true, prov: { deer: { src: ['compendium'] }, sun_most: { src: ['ncsu'] }, sun_least: { src: ['ncsu'] }, wet_feet: { src: ['compendium'] } } } as Plant;
    expect(earlierOnly(p, f({ sun: 'Shade' }), sources)).toEqual([]);
    expect(earlierOnly(p, f({ sun: 'Shade', deerResistant: true, wetFeet: true }), sources)).toEqual(['deer resistance', 'wet feet']);
    // (A plant of mine is its own word.)
    expect(earlierOnly(heuchera, f({ wetFeet: true }), sources)).toEqual([]);
  });
  it('says what other sources helped with, as the divider reads', () => {
    expect(reportedPhrase(['sun'], f({ sun: 'Shade' }))).toBe('take shade');
    expect(reportedPhrase(['sun', 'hardiness zones', 'sun'], f({ sun: 'Part', hardyHere: true }))).toBe('take part shade and are hardy here');
    expect(reportedPhrase(['form'], f({ form: 'Shrub' }))).toBe('are shrubs');
  });
  it('says why a search found it where its name doesn\'t: another name it goes by', () => {
    const limelight = { id: 'l', common: "Hydrangea 'Limelight'", botanical: "Hydrangea paniculata 'Limelight'", synonyms: ['Limelight Hydrangea'] } as Plant;
    expect(matchPlant(limelight, readQuery('limelight hydrangea')!, false)).toMatchObject({ rank: 0 });
    const chigger = { id: 'c', common: 'Butterfly weed', synonyms: ['Chiggerflower'] } as Plant;
    expect(matchPlant(chigger, readQuery('chiggerflower')!, false)).toEqual({ rank: 1, order: 5, also: 'Chiggerflower' });
  });
  it('ranks a butterfly found inside a word ("oak" in "mourning cloak") after one starting a word', () => {
    const a = { id: 'a', common: 'Willow', host: 'Mourning cloak' } as Plant, b = { id: 'b', common: 'Oak', host: 'Oak hairstreak' } as Plant;
    const c = { id: 'c', common: 'Elm', host: 'Oak hairstreak' } as Plant;
    expect(matchPlant(a, readQuery('oak')!, false)).toMatchObject({ rank: 3, order: 1 });
    expect(matchPlant(c, readQuery('oak')!, false)).toMatchObject({ rank: 3, order: 0 });
    expect(b.common).toBe('Oak');
  });
});

describe('how a plant spreads: by seed, and underground or by runners: two facts under one question', () => {
  const p = (self_seed: string | undefined, habit: string | undefined, invasive = false) => ({ id: 'x', common: 'x', self_seed, habit, invasive }) as Plant;
  it('reads what a habit says of spreading from a fixed table, and knows every habit in the catalog', () => {
    expect(['Aggressive rhizome', 'Runner - CONTAIN', 'Thicket-forming'].map(rootSpread)).toEqual(Array(3).fill('aggressive'));
    expect(['Spreading rhizome', 'Runner (stolons)', 'Suckering', 'Spreading (tubers)'].map(rootSpread)).toEqual(Array(4).fill('spreads'));
    expect([rootSpread('Suckering (slow)'), rootSpread('Clumping'), rootSpread('Single-stem')]).toEqual(['slow', 'stays', 'stays']);
    // (Shape, not spread: an erect cane, a multi-stemmed shrub may sucker or not.)
    expect(['Erect canes', 'Multi-stem', 'Upright open', 'Twining vine'].map(rootSpread)).toEqual(Array(4).fill('shape'));
    expect(['Mat-forming', 'Naturalizing', 'Reseeding annual'].map(rootSpread)).toEqual(Array(3).fill('other'));
    expect([rootSpread('No runners'), rootSpread(undefined)]).toEqual([null, null]); // (not in the table: never guessed)
    const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8')) as { plants: { facts?: { habit?: unknown } }[] };
    // (A habit as a plain value or a sourced one, { v }.)
    const habitOf = (h: unknown) => (h && typeof h === 'object' ? (h as { v?: unknown }).v : h);
    const habits = new Set(catalog.plants.map((r) => habitOf(r.facts?.habit)).filter((h): h is string => typeof h === 'string'));
    expect(habits.size).toBeGreaterThan(20);
    expect([...habits].filter((h) => !(h in HABIT_SPREAD))).toEqual([]);
  });
  it('says each part in words, the habit as given; an earlier list\'s "Sterile" never as fact; no reassurance for an invasive', () => {
    expect([seedText(p('Prolific', '')), seedText(p('Modest', '')), seedText(p('Sterile', '')), seedText(p(undefined, ''))])
      .toEqual(['Self-sows freely', 'Self-sows a little', 'Said not to set seed', '']);
    expect(rootText(p(undefined, 'Runner - CONTAIN'))).toBe('Spreads aggressively underground or by runners: Runner - CONTAIN');
    expect(rootText(p(undefined, 'Suckering (slow)'))).toBe('Spreads slowly underground or by runners: Suckering (slow)');
    expect(rootText(p(undefined, 'Clumping'))).toBe("Doesn't run: Clumping");
    expect(rootText(p(undefined, 'Clumping', true))).toBe(''); // (an invasive plant)
    expect([rootText(p(undefined, 'Naturalizing')), rootText(p(undefined, 'Twining vine'))]).toEqual(['Naturalizing', '']);
  });
  it('filters: stays put (doesn\'t run, self-sows only a little, not invasive), self-sows freely, runs, runs aggressively', () => {
    expect(spreadsAs(p('Modest', 'Clumping'), 'stays')).toBe(true);
    expect([spreadsAs(p('Prolific', 'Clumping'), 'stays'), spreadsAs(p('Sterile', 'Clumping'), 'stays'), spreadsAs(p(undefined, 'Clumping'), 'stays'),
      spreadsAs(p('Modest', 'Clumping', true), 'stays'), spreadsAs(p('Modest', 'Multi-stem'), 'stays')]).toEqual([false, false, false, false, false]);
    expect([spreadsAs(p('Prolific', 'Clumping'), 'seed'), spreadsAs(p('Modest', 'Suckering (slow)'), 'runs'), spreadsAs(p('Modest', 'Suckering (slow)'), 'aggressive')]).toEqual([true, true, false]);
    expect([spreadsAs(p('Modest', 'Runner - CONTAIN'), 'aggressive'), spreadsAs(p('Prolific', 'Clumping'), 'aggressive')]).toEqual([true, false]);
    expect([spreadsAs(p('Modest', 'Mat-forming'), 'runs'), spreadsAs(p('Modest', 'Naturalizing'), 'runs'), spreadsAs(p('Prolific', 'Reseeding annual'), 'runs')]).toEqual([true, true, false]);
    expect(plantMatches(p('Modest', 'Clumping'), { ...PLANT_FILTER_DEFAULTS, spread: ['runs'] })).toBe(false);
  });
  it('filters on the ways of spreading the person is OK with: every way a plant spreads must be ticked', () => {
    expect([spreadWays(p('Modest', 'Clumping')), spreadWays(p('Modest', 'Suckering (slow)')), spreadWays(p('Prolific', 'Runner - CONTAIN')), spreadWays(p('Prolific', 'Multi-stem')), spreadWays(p(undefined, 'Multi-stem'))])
      .toEqual([['stays'], ['runs'], ['aggressive', 'seed'], ['seed'], null]);
    const ok = (seed: string | undefined, habit: string, ways: string[]) => plantMatches(p(seed, habit), { ...PLANT_FILTER_DEFAULTS, spread: ways });
    // Stays put or runs, not aggressively (Jason's example): a clump, a slow sucker; not an aggressive runner, nor a runner that self-sows freely.
    expect([ok('Modest', 'Clumping', ['stays', 'runs']), ok('Modest', 'Suckering (slow)', ['stays', 'runs']), ok('Modest', 'Runner - CONTAIN', ['stays', 'runs']), ok('Prolific', 'Rhizomatous', ['stays', 'runs'])])
      .toEqual([true, true, false, false]);
    expect(ok('Modest', 'Rhizomatous', ['aggressive'])).toBe(true); // (OK with aggressive runners is OK with runners)
    expect(ok(undefined, 'Multi-stem', ['stays', 'runs', 'aggressive', 'seed'])).toBe(false); // (the facts don't say)
  });
});

describe('the mature-height slider', () => {
  it('says its range in words and as the filter\'s value, either end open', () => {
    const last = HEIGHT_STOPS.length - 1;
    expect([heightValue(0, last), heightValue(0, 7), heightValue(9, last), heightValue(4, 7)]).toEqual(['', '-10', '20-', '4-10']);
    expect(['', '-10', '20-', '4-10'].map(heightLabel)).toEqual(['Any height', 'Up to 10 ft', '20 ft and taller', '4–10 ft']);
    expect([heightStops(''), heightStops('4-10'), heightStops('-10'), heightStops('24-')]).toEqual([[0, last], [4, 7], [0, 7], [9, last]]); // (24 ft: the nearest stop, 20)
  });
});
