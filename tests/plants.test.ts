import { describe, expect, it } from 'vitest';
import { byMatch, closeMatchIn, matchPlant, readQuery } from '../src/search';
import { matchedBy, nonToxicToDogs, PLANT_FILTER_DEFAULTS, plantMatches, plantTakesSun, reportedMatch, searchRank, type Plant } from '../src/plants';
import { HABIT_SPREAD, rootSpread, rootText, seedText, spreadsAs } from '../src/spread';
import { readFileSync } from 'node:fs';
import { HEIGHT_STOPS, heightLabel, heightStops, heightValue } from '../src/ui/height-range';

const heuchera: Plant = {
  id: 'h', common: "Heuchera 'Autumn Bride'", botanical: 'Heuchera villosa', form: 'Perennial',
  dog: 'Safe', sun_most: 'Part', sun_least: 'Shade', water: 'Low', dry_shade: true,
  height: { med: 1.75 }, width: { med: 2.5 }, bloom: { start: 9, end: 10 }, nectar: 'Low'
};
const f = (over: Partial<typeof PLANT_FILTER_DEFAULTS> = {}) => ({ ...PLANT_FILTER_DEFAULTS, ...over });

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
    expect(reportedMatch(dog, fs({ dogSafeOnly: true }))).toBeNull();
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
  it('shows dog-unsafe plants unless asked; hides nothing else by default', () => {
    expect(plantMatches({ ...heuchera, dog: 'Mild GI' }, f())).toBe(true);
    expect(plantMatches({ ...heuchera, dog: 'Mild GI' }, f({ dogSafeOnly: true }))).toBe(false);
    expect(plantMatches({ ...heuchera, dog: 'HARD NO' }, f())).toBe(true);
  });
  it('never suggests invasives, but finds them by name', () => {
    const privet: Plant = { id: 'p', common: 'Chinese privet', botanical: 'Ligustrum sinense', invasive: true };
    expect(plantMatches(privet, f())).toBe(false);
    expect(plantMatches(privet, f({ q: 'privet' }))).toBe(true);
    expect(plantMatches(privet, f({ inPlan: true }), new Set(['p']))).toBe(true);
  });
  it('can show only plants already placed in the open plan', () => {
    expect(plantMatches(heuchera, f({ inPlan: true }), new Set(['h']))).toBe(true);
    expect(plantMatches(heuchera, f({ inPlan: true }), new Set(['other']))).toBe(false);
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
    expect(nonToxicToDogs({ id: 'a', common: 'A', dog: 'Safe' })).toBe(true); // the older list, until checked
    expect(nonToxicToDogs({ id: 'a', common: 'A', dog: 'Unverified' })).toBe(false);
    expect(nonToxicToDogs({ id: 'a', common: 'A', dog: 'Unverified', tox: { dog: 'nontoxic' } })).toBe(true);
    expect(nonToxicToDogs({ id: 'a', common: 'A', tox: { dog: 'unlisted' } })).toBe(false); // not listed isn't safe
    expect(nonToxicToDogs({ id: 'a', common: 'A', dog: 'HARD NO', tox: { dog: 'nontoxic' } })).toBe(false); // the warning holds until the audit settles it
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
  it('says each part in words, the habit as given; an older list\'s "Sterile" never as fact; no reassurance for an invasive', () => {
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
    expect(plantMatches(p('Modest', 'Clumping'), { ...PLANT_FILTER_DEFAULTS, spread: 'runs' })).toBe(false);
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
