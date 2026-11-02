// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { byTypicalHeight, hardinessWarning, householdFlags, PLANT_FILTER_DEFAULTS, plantMatches, rowFlags, type Plant } from '../src/plants';
import { NO_YARD, saveYard } from '../src/yard';
import { state } from '../src/state';

// The warnings Jason chose from round 2 of testing (Oct 30): poison where the household has kids or pets, hardiness
// both ways by default, and the height ceiling by a plant's tallest listed height.

const milkweed = { id: 'm', common: 'Butterfly milkweed', form: 'Perennial', poison: { severity: 'Low', parts: ['Leaves', 'Sap/Juice'] }, problem_for: ['dogs', 'cats'] } as unknown as Plant;
const rose = { id: 'r', common: 'Rose', form: 'Shrub', poison: { symptoms: 'Thorns' } } as unknown as Plant;

describe('a household with kids or pets', () => {
  afterEach(() => { state.poisonWarnings = true; });
  it('flags plants poisonous to people where there are kids, and a problem for the animals it has', () => {
    expect(householdFlags(milkweed, { ...NO_YARD, kids: true }).map((f) => f.text)).toEqual(['Poisonous to people']);
    expect(householdFlags(milkweed, { ...NO_YARD, kids: true })[0].title).toBe('Poisonous if eaten (Low severity: leaves and sap/juice)');
    expect(householdFlags(milkweed, { ...NO_YARD, dogs: 'hideToxic', cats: true }).map((f) => f.text)).toEqual(['A problem for dogs and cats']);
    expect(householdFlags(milkweed, NO_YARD)).toEqual([]);
    expect(householdFlags(rose, { ...NO_YARD, kids: true })).toEqual([]); // (thorns: no parts, no severity)
  });
  it("flags a hybrid none rates as its parents are rated, and says it isn't rated itself (Jason, Oct 30: the 'Illinois Everbearing' mulberry)", () => {
    const mulberry = { id: 'mul', common: "Mulberry 'Illinois Everbearing'", form: 'Tree', poison: null, poison_parents: { via: 'name', parents: [
      { name: 'Morus alba', poison: { severity: 'low', parts: ['fruits', 'leaves', 'sap', 'stems'] } },
      { name: 'Morus rubra', id: 'morus-rubra', common: 'Red mulberry', poison: { severity: 'low', parts: ['sap'], skin: true } }] } } as unknown as Plant;
    const kids = householdFlags(mulberry, { ...NO_YARD, kids: true });
    expect(kids.map((f) => [f.text, f.title])).toEqual([['Poisonous to people', 'Not rated itself; a parent is poisonous if eaten (low severity: fruits, leaves, sap and stems)']]);
    expect(rowFlags(mulberry).find((f) => f.testid === 'row-skin')?.title).toBe('NC State lists a parent as causing contact dermatitis');
    // (A parent rated only for the skin: no flag for eating it; one listing none, or not rated: nothing.)
    const skinOnly = { ...mulberry, poison_parents: { via: 'name', parents: [{ name: 'Morus alba', poison: null }, { name: 'Morus rubra', poison: { skin: true } }] } } as unknown as Plant;
    expect(householdFlags(skinOnly, { ...NO_YARD, kids: true })).toEqual([]);
    expect(householdFlags({ ...mulberry, poison_parents: undefined } as Plant, { ...NO_YARD, kids: true })).toEqual([]);
  });
  it('marks a skin irritant on its row whoever is in the yard; "Poisonous to people" only with kids (Jason, Nov 1: anyone walking past can brush one)', () => {
    const mayapple = { id: 'may', common: 'Mayapple', form: 'Perennial', poison: { severity: 'high', parts: ['leaves', 'roots'], skin: true } } as unknown as Plant;
    const yards = [NO_YARD, { ...NO_YARD, kids: true }, { ...NO_YARD, dogs: 'hideToxic' as const }, { ...NO_YARD, dogs: 'nonToxic' as const },
      { ...NO_YARD, cats: true }, { ...NO_YARD, horses: true }, { kids: true, dogs: 'hideToxic' as const, cats: true, horses: true }];
    try {
      for (const y of yards) {
        saveYard(y);
        const marks = rowFlags(mayapple).map((f) => f.text);
        expect(marks).toContain('Can irritate skin');
        expect(marks.includes('Poisonous to people')).toBe(y.kids);
      }
    } finally { saveYard(NO_YARD); localStorage.clear(); }
  });
  it('says nothing with the warning turned off in Warnings', () => {
    state.poisonWarnings = false;
    expect(householdFlags(milkweed, { ...NO_YARD, kids: true, dogs: 'hideToxic' })).toEqual([]);
    expect(rowFlags(milkweed).some((f) => f.testid === 'row-poison' || f.testid === 'row-pets')).toBe(false);
  });
});

describe('hardiness, both ways', () => {
  afterEach(() => { state.location = null; });
  const tropical = { id: 't', common: 'Bougainvillea', form: 'Vine', zone_min: 9.5, zone_max: 11 } as Plant;
  const northern = { id: 'n', common: 'Bunchberry', form: 'Perennial', zone_min: 2, zone_max: 6 } as Plant;
  const fits = { id: 'f', common: 'Spicebush', form: 'Shrub', zone_min: 4, zone_max: 9 } as Plant;
  it('warns of a plant too cold or maybe too warm for the garden, and not of one that fits, an annual, or with no location', () => {
    expect(hardinessWarning(tropical)).toBeNull();
    state.location = { zip: '71923', zone: '8a' };
    expect(hardinessWarning(tropical)).toMatchObject({ cold: true });
    expect(hardinessWarning(tropical)!.line).toMatch(/^Too cold for zone 8a: it's rated for zones? /);
    expect(hardinessWarning(northern)).toMatchObject({ cold: false });
    expect(hardinessWarning(northern)!.line).toMatch(/^May be too warm for zone 8a/);
    expect(hardinessWarning(fits)).toBeNull();
    expect(hardinessWarning({ ...tropical, form: 'Annual' } as Plant)).toBeNull();
  });
});

describe('"up to N ft" by the tallest it grows', () => {
  const f = { ...PLANT_FILTER_DEFAULTS, height: '-6' };
  const viburnum = { id: 'v', common: 'Viburnum', form: 'Shrub', height: { min: 5, max: 10, med: 6 } } as Plant;
  const short = { id: 's', common: 'Itea', form: 'Shrub', height: { min: 3, max: 5, med: 4 } } as Plant;
  it('leaves out a plant whose typical height fits but whose tallest doesn\'t; the typical height shows it below', () => {
    expect([viburnum, short].map((p) => plantMatches(p, f))).toEqual([false, true]);
    expect(byTypicalHeight(() => [viburnum, short].map((p) => plantMatches(p, f)))).toEqual([true, true]);
    expect(plantMatches(viburnum, f)).toBe(false); // (and back to the tallest afterwards)
  });
  it('width the same way: "up to N ft" by its widest, "N ft and wider" by its typical spread; none known, no fit (Jason, Oct 31)', () => {
    const w = (width: string) => ({ ...PLANT_FILTER_DEFAULTS, width });
    const azalea = { id: 'a', common: 'Azalea', form: 'Shrub', width: { min: 2, max: 6, med: 4 } } as Plant;
    const boxwood = { id: 'b', common: 'Boxwood', form: 'Shrub', width: { min: 2, max: 3, med: 2.5 } } as Plant;
    expect([azalea, boxwood].map((p) => plantMatches(p, w('-4')))).toEqual([false, true]);
    expect(byTypicalHeight(() => [azalea, boxwood].map((p) => plantMatches(p, w('-4'))))).toEqual([true, true]);
    expect([azalea, boxwood].map((p) => plantMatches(p, w('3-')))).toEqual([true, false]);
    expect(plantMatches({ id: 'x', common: 'X', form: 'Shrub' } as Plant, w('-4'))).toBe(false);
    // (With height too: each its own.)
    expect(plantMatches({ ...boxwood, height: { min: 8, max: 10, med: 9 } }, { ...w('-4'), height: '-6' })).toBe(false);
  });
});
