// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { NEW_RECORD } from '../src/intro';
import { state } from '../src/state';
import type { PlanHousehold } from '../src/types';
import { askAtTop, askDismissed, dismissAsked, household, householdCopy, householdFromDevice, introAnswered, loadAsked, loadYard, NO_YARD, noteAsked, saveYard, toggleYard } from '../src/yard';

// "Anyone you need to protect?" (Jason, Nov 1, from the UI review): first among the picker's filters until it's
// answered for the plan or dismissed on this device, then under Filters, Poison & pets. Who's in the yard, and whether
// the question was answered, are kept with the plan (Jason, Nov 1); the × is kept per device in 'lp-protect-line'.

const none: PlanHousehold = { ...NO_YARD, answered: false };
const fresh = { dismissed: false, household: none };

describe('when the picker asks "Anyone you need to protect?" at the top', () => {
  beforeEach(() => localStorage.clear());
  it('for a plan not yet answered, until it is answered or dismissed on this device', () => {
    expect(askAtTop(fresh)).toBe(true);
    expect(askAtTop({ ...fresh, household: { ...none, answered: true } })).toBe(false);
    expect(askAtTop({ ...fresh, dismissed: true })).toBe(false);
  });
  it('not with anyone in the plan\'s yard already, set before it was asked (any of the four)', () => {
    expect(askAtTop({ ...fresh, household: { ...none, kids: true } })).toBe(false);
    expect(askAtTop({ ...fresh, household: { ...none, dogs: 'hideToxic' } })).toBe(false);
    expect(askAtTop({ ...fresh, household: { ...none, dogs: 'nonToxic' } })).toBe(false);
    expect(askAtTop({ ...fresh, household: { ...none, cats: true } })).toBe(false);
    expect(askAtTop({ ...fresh, household: { ...none, horses: true } })).toBe(false);
  });
});

describe('what the plan keeps of it, and what the device keeps', () => {
  beforeEach(() => { localStorage.clear(); state.household = { ...none }; });
  it('answered for the plan when anyone in the yard is set or unset anywhere (saveYard), the yard kept as set, and when it was', () => {
    saveYard({ ...NO_YARD, kids: true });
    expect(household()).toMatchObject({ ...NO_YARD, kids: true, answered: true, at: expect.any(Number) });
    state.household = { ...none };
    saveYard(NO_YARD); // (all four off is an answer too)
    expect(household()).toMatchObject({ ...NO_YARD, answered: true });
    // (Kept with the plan, not on the device: 'lp-yard' and 'lp-protect-line' aren't written.)
    expect([localStorage.getItem('lp-yard'), localStorage.getItem('lp-protect-line')]).toEqual([null, null]);
  });
  it('answered alone leaves the yard as it was (step 6 done with none ticked)', () => {
    noteAsked();
    expect(household()).toMatchObject({ ...NO_YARD, answered: true, at: expect.any(Number) });
  });
  it('dismissed is this device\'s, for every plan, and stays dismissed when a plan is answered later', () => {
    dismissAsked();
    saveYard({ ...NO_YARD, cats: true });
    expect(askDismissed()).toBe(true);
    expect(loadAsked()).toBe('dismissed');
    state.household = { ...none }; // (another plan)
    expect(askAtTop({ dismissed: askDismissed(), household: household() })).toBe(false);
  });
  it('anything else kept under its name reads as not dismissed', () => {
    localStorage.setItem('lp-protect-line', 'maybe');
    expect(loadAsked()).toBe(null);
    expect(askDismissed()).toBe(false);
  });
  it('a new plan of the same garden copies it, answered or not, as set now', () => {
    state.household = { ...NO_YARD, dogs: 'nonToxic', answered: true };
    expect(householdCopy()).toEqual({ ...NO_YARD, dogs: 'nonToxic', answered: true, at: expect.any(Number) });
    state.household = { ...none };
    expect(householdCopy()).toEqual({ ...none, at: expect.any(Number) });
  });
});

describe('a plan from before plans kept who\'s in the yard (Jason, Nov 1)', () => {
  beforeEach(() => localStorage.clear());
  it('takes what this device had, never set in the plan (no time)', () => {
    expect(householdFromDevice()).toEqual(none);
    localStorage.setItem('lp-yard', JSON.stringify({ kids: false, dogs: 'hideToxic', cats: true, horses: false }));
    expect(householdFromDevice()).toEqual({ ...NO_YARD, dogs: 'hideToxic', cats: true, answered: true });
    expect(loadYard()).toEqual({ ...NO_YARD, dogs: 'hideToxic', cats: true }); // (left in place, for an older version)
  });
  it('answered if the device answered the question, or step 6 of the introduction, with none of the four; not if it only dismissed it', () => {
    localStorage.setItem('lp-protect-line', 'answered');
    expect(householdFromDevice()).toEqual({ ...none, answered: true });
    localStorage.setItem('lp-protect-line', 'dismissed');
    expect(householdFromDevice()).toEqual(none);
    localStorage.setItem('lp-intro', JSON.stringify({ ...NEW_RECORD, status: 'finished', done: ['zip', 'who'] }));
    expect(householdFromDevice()).toEqual({ ...none, answered: true });
  });
  it('step 6 done, as the introduction kept it; skipped is not answered', () => {
    expect(introAnswered()).toBe(false);
    localStorage.setItem('lp-intro', JSON.stringify({ ...NEW_RECORD, status: 'finished', done: ['zip', 'who'] }));
    expect(introAnswered()).toBe(true);
    localStorage.setItem('lp-intro', JSON.stringify({ ...NEW_RECORD, status: 'exited', step: 'plant', skipped: ['who'] }));
    expect(introAnswered()).toBe(false);
    localStorage.setItem('lp-intro', '{broken');
    expect(introAnswered()).toBe(false);
  });
});

describe('a chip for one of the four', () => {
  it('turns it on or off; Dogs on is "no dog warnings", or "only plants rated safe" if that is what it was', () => {
    expect(toggleYard(NO_YARD, 'kids')).toEqual({ ...NO_YARD, kids: true });
    expect(toggleYard({ ...NO_YARD, kids: true }, 'kids')).toEqual(NO_YARD);
    expect(toggleYard(NO_YARD, 'horses')).toEqual({ ...NO_YARD, horses: true });
    expect(toggleYard(NO_YARD, 'dogs').dogs).toBe('hideToxic');
    const off = toggleYard({ ...NO_YARD, dogs: 'nonToxic' }, 'dogs');
    expect(off.dogs).toBe('');
    expect(toggleYard(off, 'dogs').dogs).toBe('nonToxic');
  });
});
