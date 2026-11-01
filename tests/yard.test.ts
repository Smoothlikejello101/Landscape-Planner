// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { NEW_RECORD } from '../src/intro';
import { askAtTop, dismissAsked, introAnswered, loadAsked, loadYard, NO_YARD, noteAsked, saveYard, toggleYard } from '../src/yard';

// "Anyone you need to protect?" (Jason, Nov 1, from the UI review): first among the picker's filters until it's
// answered or dismissed, then under Filters, Poison & pets. Kept per device in 'lp-protect-line'.

const fresh = { asked: null, yard: NO_YARD, intro: false } as const;

describe('when the picker asks "Anyone you need to protect?" at the top', () => {
  beforeEach(() => localStorage.clear());
  it('on a fresh device, until it is answered or dismissed', () => {
    expect(askAtTop(fresh)).toBe(true);
    expect(askAtTop({ ...fresh, asked: 'answered' })).toBe(false);
    expect(askAtTop({ ...fresh, asked: 'dismissed' })).toBe(false);
  });
  it('not with anyone in the yard already, set before it was asked (any of the four)', () => {
    expect(askAtTop({ ...fresh, yard: { ...NO_YARD, kids: true } })).toBe(false);
    expect(askAtTop({ ...fresh, yard: { ...NO_YARD, dogs: 'hideToxic' } })).toBe(false);
    expect(askAtTop({ ...fresh, yard: { ...NO_YARD, dogs: 'nonToxic' } })).toBe(false);
    expect(askAtTop({ ...fresh, yard: { ...NO_YARD, cats: true } })).toBe(false);
    expect(askAtTop({ ...fresh, yard: { ...NO_YARD, horses: true } })).toBe(false);
  });
  it('not once the guided introduction\'s step 6 was done, with none of the four ticked too', () => {
    expect(askAtTop({ ...fresh, intro: true })).toBe(false);
  });
});

describe('what the device keeps of it', () => {
  beforeEach(() => localStorage.clear());
  it('answered when anyone in the yard is set or unset anywhere (saveYard), the yard kept as set', () => {
    expect(loadAsked()).toBe(null);
    saveYard({ ...NO_YARD, kids: true });
    expect(loadAsked()).toBe('answered');
    expect(loadYard()).toEqual({ ...NO_YARD, kids: true });
    localStorage.clear();
    saveYard(NO_YARD); // (all four off is an answer too)
    expect(loadAsked()).toBe('answered');
  });
  it('answered alone leaves the yard as it was (step 6 done with none ticked)', () => {
    noteAsked();
    expect(loadAsked()).toBe('answered');
    expect(localStorage.getItem('lp-yard')).toBe(null);
  });
  it('dismissed stays dismissed when it is answered later; answered becomes dismissed with the ×', () => {
    dismissAsked();
    saveYard({ ...NO_YARD, cats: true });
    expect(loadAsked()).toBe('dismissed');
    localStorage.clear();
    noteAsked();
    dismissAsked();
    expect(loadAsked()).toBe('dismissed');
  });
  it('anything else kept under its name reads as not yet asked', () => {
    localStorage.setItem('lp-protect-line', 'maybe');
    expect(loadAsked()).toBe(null);
  });
  it('step 6 done, as the introduction kept it before the question was kept on its own; skipped is not answered', () => {
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
