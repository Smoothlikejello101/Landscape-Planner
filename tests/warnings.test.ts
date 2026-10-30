// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { byTypicalHeight, hardinessWarning, householdFlags, PLANT_FILTER_DEFAULTS, plantMatches, rowFlags, type Plant } from '../src/plants';
import { NO_YARD } from '../src/yard';
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
});
