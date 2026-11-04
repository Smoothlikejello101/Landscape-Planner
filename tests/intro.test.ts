// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  NEW_RECORD, SHRUBS_TO_FIND, STEPS, UNSCALED, applies, nextStep, plantCardText, prevStep, resumeStep, ringCardText, shrubToFind, stepDone,
  type IntroRecord, type ShrubCheck, type Snapshot,
} from '../src/intro';
import { NO_YARD, applyYard, household, loadYard, saveYard, yardFilter, yardOf, yardSet } from '../src/yard';
import { PLANT_FILTER_DEFAULTS } from '../src/plants';

const BLANK: Snapshot = {
  zip: null, scale: null, rotation: 0, opacity: 1, visible: true, buildings: 0, beds: 0, sunAreas: 0, plants: 0,
  busy: false, panel: null, bgEditMode: false,
};
const at = (o: Partial<Snapshot>): Snapshot => ({ ...BLANK, ...o });
const PHOTO = at({ scale: 0.05 });

describe('the guided introduction: when a step is done', () => {
  it('the ZIP: set, or changed', () => {
    expect(stepDone('zip', BLANK, at({ zip: '71923' }))).toBe(true);
    expect(stepDone('zip', at({ zip: '71923' }), at({ zip: '71923' }))).toBe(false); // (already set when the step began)
    expect(stepDone('zip', at({ zip: '71923' }), at({ zip: '72201' }))).toBe(true);
  });
  it('the photo: once its scale is set (picked but not yet scaled is not done)', () => {
    expect(stepDone('photo', BLANK, at({ scale: UNSCALED }))).toBe(false);
    expect(stepDone('photo', BLANK, at({ scale: 0.04 }))).toBe(true);
    expect(stepDone('photo', BLANK, at({ scale: 0.04, busy: true }))).toBe(false); // (still setting it)
  });
  it('turning it: turned, and out of moving the photo (not with the photo gone)', () => {
    expect(stepDone('turn', PHOTO, at({ scale: 0.05, rotation: 12, bgEditMode: true }))).toBe(false);
    expect(stepDone('turn', PHOTO, at({ scale: 0.05, rotation: 12 }))).toBe(true);
    expect(stepDone('turn', at({ scale: 0.05, rotation: 12 }), BLANK)).toBe(false);
  });
  it('locking the house (3b): the newest building locked (Jason, Nov 4: from its own panel)', () => {
    expect(stepDone('lock', at({ buildings: 1, houseLocked: false }), at({ buildings: 1, houseLocked: false }))).toBe(false);
    expect(stepDone('lock', at({ buildings: 1, houseLocked: false }), at({ buildings: 1, houseLocked: true }))).toBe(true);
    expect(stepDone('lock', at({ buildings: 1, houseLocked: false }), at({ buildings: 1, houseLocked: true, busy: true }))).toBe(false);
  });
  it('the house, the bed and the plant: one more than when the step began', () => {
    expect(stepDone('house', at({ buildings: 1 }), at({ buildings: 1 }))).toBe(false);
    expect(stepDone('house', at({ buildings: 1 }), at({ buildings: 2 }))).toBe(true);
    expect(stepDone('bed', BLANK, at({ beds: 1 }))).toBe(true);
    expect(stepDone('bed', BLANK, at({ beds: 1, busy: true }))).toBe(false); // (still drawing)
    expect(stepDone('plant', BLANK, at({ plants: 1 }))).toBe(true);
  });
  it('fading the photo: lowered or hidden, once its sheet is closed', () => {
    expect(stepDone('fade', PHOTO, at({ scale: 0.05, opacity: 0.5, panel: 'bg' }))).toBe(false);
    expect(stepDone('fade', PHOTO, at({ scale: 0.05, opacity: 0.5 }))).toBe(true);
    expect(stepDone('fade', PHOTO, at({ scale: 0.05, visible: false }))).toBe(true);
  });
  it('sun and shade: sun recorded on an area, once its sheet is closed (the times are set in it)', () => {
    expect(stepDone('sun', BLANK, at({ sunAreas: 1, panel: 'props' }))).toBe(false);
    expect(stepDone('sun', BLANK, at({ sunAreas: 1 }))).toBe(true);
  });
  it("who's in the yard and the ring end only with the card's own button", () => {
    expect(stepDone('who', BLANK, at({ plants: 3 }))).toBe(false);
    expect(stepDone('ring', BLANK, at({ plants: 3 }))).toBe(false);
  });
});

describe('the guided introduction: the order of the steps', () => {
  const rec = (o: Partial<IntroRecord> = {}): IntroRecord => ({ ...NEW_RECORD, ...o });
  it("the photo's own steps (2b, 4b) only with a photo; turning it only one set in this run (a traced photo isn't moved)", () => {
    expect(applies('turn', BLANK)).toBe(false);
    expect(applies('turn', PHOTO)).toBe(false);
    expect(applies('turn', PHOTO, ['photo'])).toBe(true);
    expect(applies('fade', PHOTO)).toBe(true);
    expect(nextStep('photo', rec(), BLANK)).toBe('house');
    expect(nextStep('photo', rec(), PHOTO)).toBe('house');
    expect(nextStep('photo', rec({ done: ['photo'] }), PHOTO)).toBe('turn');
    expect(nextStep('bed', rec(), BLANK)).toBe('sun');
    expect(nextStep('bed', rec(), PHOTO)).toBe('fade');
  });
  it('"Lock the house" (3b) only while the newest building is unlocked: none drawn, or locked already, it\'s passed by', () => {
    const drawn = at({ buildings: 1, houseLocked: false });
    expect(applies('lock', BLANK)).toBe(false);
    expect(applies('lock', drawn)).toBe(true);
    expect(applies('lock', at({ buildings: 1, houseLocked: true }))).toBe(false);
    expect(nextStep('house', rec(), drawn)).toBe('lock');
    expect(nextStep('house', rec(), at({ buildings: 1, houseLocked: true }))).toBe('bed');
    expect(nextStep('house', rec(), BLANK)).toBe('bed');
    expect(prevStep('bed', drawn)).toBe('lock');
    expect(prevStep('bed', at({ buildings: 1, houseLocked: true }))).toBe('house');
    expect(STEPS.indexOf('lock')).toBe(STEPS.indexOf('house') + 1);
  });
  it('goes on past what is done or skipped, and ends after the ring', () => {
    expect(nextStep(null, rec(), BLANK)).toBe('zip');
    expect(nextStep(null, rec({ done: ['zip'], skipped: ['photo'] }), BLANK)).toBe('house');
    expect(nextStep('ring', rec(), BLANK)).toBe(null);
    expect(STEPS.at(-1)).toBe('ring');
  });
  it('Back goes to the step before that applies, done or skipped; none before the first', () => {
    expect(prevStep('zip', BLANK)).toBe(null);
    expect(prevStep('house', BLANK)).toBe('photo');
    expect(prevStep('house', PHOTO)).toBe('photo');
    expect(prevStep('house', PHOTO, ['photo'])).toBe('turn');
  });
  it('Guided start (⋮ → Help) picks up at the step they left, or the first not done', () => {
    expect(resumeStep(rec({ step: 'sun', done: ['zip', 'house', 'bed'], skipped: ['photo'] }), BLANK)).toBe('sun');
    expect(resumeStep(rec({ step: 'sun', done: ['zip', 'sun'] }), BLANK)).toBe('photo');
    expect(resumeStep(rec({ step: 'turn', done: ['zip'] }), BLANK)).toBe('photo'); // (the photo since removed)
  });
});

describe("the guided introduction: step 7's shrub and words", () => {
  const all: ShrubCheck = { hardy: () => true, takesSun: () => null, native: () => false, flagged: () => false, yardOk: () => true };
  it('the first on the list that fits; one native to the state first', () => {
    expect(shrubToFind(all)?.id).toBe(SHRUBS_TO_FIND[0].id);
    expect(shrubToFind({ ...all, native: (id) => id === 'calycanthus-floridus' })?.id).toBe('calycanthus-floridus');
  });
  it("not one that isn't hardy, doesn't take the bed's sun, is flagged, or that the yard's filters hide", () => {
    const only = (id: string) => (x: string) => x === id;
    expect(shrubToFind({ ...all, hardy: only('weigela-florida') })?.id).toBe('weigela-florida');
    expect(shrubToFind({ ...all, takesSun: (id) => id === 'forsythia-x-intermedia' })?.id).toBe('forsythia-x-intermedia');
    expect(shrubToFind({ ...all, flagged: (id) => id !== 'kalmia-latifolia' })?.id).toBe('kalmia-latifolia');
    expect(shrubToFind({ ...all, yardOk: (id) => !id.startsWith('hydrangea') })?.id).toBe('syringa-vulgaris');
    expect(shrubToFind({ ...all, hardy: () => null })).toBe(null); // (no ZIP: none named)
  });
  it('the words change with what was skipped: the ZIP, the bed, the sun', () => {
    const shrub = { name: 'an oakleaf hydrangea' };
    expect(plantCardText({ bed: true, zip: true, sun: 'Part', shrub, tap: 'tap' })).toBe(
      "Find something for the bed: search for a plant you know, or try the filters. Not sure? Try an oakleaf hydrangea: it's hardy here and takes this bed's sun. Find it, tap Place, then tap in the bed.");
    expect(plantCardText({ bed: true, zip: true, sun: null, shrub, tap: 'tap' })).toContain("Try an oakleaf hydrangea: it's hardy here. Find it");
    expect(plantCardText({ bed: false, zip: false, sun: null, shrub: null, tap: 'click' })).toBe(
      'Find something to plant: search for a plant you know, or try the filters. Click Place, then click on the plan.');
  });
});

describe("step 8's words: select a plant first; then both its circles, plainly (Jason, Nov 4)", () => {
  it('none selected: select one, the one just placed after step 7', () => {
    expect(ringCardText({ looking: 'unselected', justPlaced: true, tap: 'tap' })).toBe('Tap the plant you just placed to see its ring.');
    expect(ringCardText({ looking: 'unselected', tap: 'click' })).toBe('Click a plant to see its ring.');
  });
  it('a planned plant: its own edge is dashed too, and said so; the outer ring is the size it can reach', () => {
    expect(ringCardText({ looking: 'plant', planned: true, ring: true, tap: 'tap' })).toBe(
      "Its circle is its typical size, dashed because it's planned, not planted yet. The outer dashed ring is the size it can reach. Give it room: plant two closer than usual and the app tells you.");
    expect(ringCardText({ looking: 'plant', planned: false, ring: true, tap: 'tap' })).toBe(
      'Its circle is its typical size. The outer dashed ring is the size it can reach. Give it room: plant two closer than usual and the app tells you.');
  });
  it('one size from its sources: no ring, its circle the size it can reach; no plant at all: in general', () => {
    expect(ringCardText({ looking: 'plant', planned: true, ring: false, tap: 'tap' })).toBe(
      "Its circle is the size it can reach (its sources give one size), dashed because it's planned, not planted yet. Give it room: when circles overlap, the app tells you.");
    expect(ringCardText({ looking: 'nothing', tap: 'tap' })).toContain("A plant's circle is its typical size; selected, a dashed ring shows the size it can reach.");
  });
});

describe("who's in the yard (kept with the plan since Nov 1; what the device kept before, read for plans from then)", () => {
  beforeEach(() => localStorage.clear());
  it('none until answered; kept as answered, with the plan; what the device kept, a bad record reads as none', () => {
    expect(household()).toMatchObject(NO_YARD);
    saveYard({ kids: true, dogs: 'hideToxic', cats: false, horses: true });
    expect(household()).toMatchObject({ kids: true, dogs: 'hideToxic', cats: false, horses: true, answered: true });
    expect(loadYard()).toEqual(NO_YARD); // (no longer kept on the device)
    localStorage.setItem('lp-yard', '{"kids":1,"dogs":"wolves"}');
    expect(loadYard()).toEqual({ kids: true, dogs: '', cats: false, horses: false });
    localStorage.setItem('lp-yard', 'not json');
    expect(loadYard()).toEqual(NO_YARD);
  });
  it("sets the picker's filters for them, and reads back from them", () => {
    const f = { ...PLANT_FILTER_DEFAULTS };
    applyYard(f, { kids: true, dogs: 'hideToxic', cats: true, horses: false });
    expect([f.noPoison, f.dogs, f.cats, f.horses]).toEqual([true, 'hideToxic', true, false]);
    expect(yardOf(f)).toEqual({ kids: true, dogs: 'hideToxic', cats: true, horses: false });
    expect(yardSet(yardOf(f))).toBe(true);
    expect(yardSet(NO_YARD)).toBe(false);
  });
  it("a filter of the yard alone: kids alone is the people-poison filter, nothing else on", () => {
    const f = yardFilter(PLANT_FILTER_DEFAULTS, { ...NO_YARD, kids: true });
    expect(f).toEqual({ ...PLANT_FILTER_DEFAULTS, noPoison: true });
    expect(PLANT_FILTER_DEFAULTS.noPoison).toBe(false); // (the defaults themselves untouched)
  });
});
