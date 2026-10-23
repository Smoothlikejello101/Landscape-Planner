import { describe, expect, it } from 'vitest';
import { matchedBy, nonToxicToDogs, PLANT_FILTER_DEFAULTS, plantMatches, plantTakesSun, reportedMatch, searchRank, type Plant } from '../src/plants';
import { HABIT_SPREAD, rootSpread, rootText, seedText, spreadsAs } from '../src/spread';
import { readFileSync } from 'node:fs';

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
  it('applies the max height filter to the median height', () => {
    expect(plantMatches(heuchera, f({ maxHeight: '2' }))).toBe(true);
    expect(plantMatches(heuchera, f({ maxHeight: '1' }))).toBe(false);
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
