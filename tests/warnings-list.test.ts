// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dismissedForPlan, dismissForPlan } from '../src/dismissals';
import { pushHistory } from '../src/history';
import { fitInCircle } from '../src/labels';
import { plantsById, type Plant } from '../src/plants';
import { state } from '../src/state';
import type { Shape } from '../src/types';
import { buttonSaid, countSaid, hiddenFromChecks, kindStates, planWarnings, setDismissed, warningsSummary, type WarningKind } from '../src/warnings-list';

// Every warning in the plan now, for Warnings (Jason, Oct 31, from round 3; a sheet of its own since Nov 1): active and
// dismissed, each worked out as the plan works it out, and said as the plant's details say it.

const shrub = { id: 'wl-shrub', common: 'Spicebush', form: 'Shrub', width: { min: 3, max: 5, med: 4 }, zone_min: 4, zone_max: 9 } as Plant;
const tropical = { id: 'wl-trop', common: 'Bougainvillea', form: 'Vine', width: { min: 3, max: 5, med: 4 }, zone_min: 9.5, zone_max: 11 } as Plant;
const at = (id: string, plantId: string, x: number, extra: Partial<Shape> = {}): Shape =>
  ({ id, type: 'circle', role: 'plant', plantId, label: plantsById[plantId]?.common, x, y: 0, radius: 2, color: '#16a34a', opacity: 0.65, ...extra } as Shape);

describe('the warnings in the plan now', () => {
  beforeEach(() => {
    plantsById[shrub.id] = shrub; plantsById[tropical.id] = tropical;
    Object.assign(state, { showCrowding: true, crowdWarnings: true, sunWarnings: true, hardyWarnings: true, poisonWarnings: true, fruitWarnings: true });
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = {};
    state.dismissed = undefined;
    state.location = { zip: '71923', zone: '8a' };
  });
  afterEach(() => { state.shapes = []; state.location = null; });

  it('lists crowded pairs, then the pairs dismissed; a dismissed pair is shown again by itself', () => {
    // Two 4-ft shrubs 2 ft apart are crowded; 'c' and 'd' too, dismissed.
    state.shapes = [at('a', shrub.id, 0), at('b', shrub.id, 2), at('c', shrub.id, 40, { crowdOk: ['d'] } as Partial<Shape>), at('d', shrub.id, 42)];
    const rows = planWarnings().filter((r) => r.kind === 'crowding');
    expect(rows.map((r) => [r.ids.join('+'), r.said, r.dismissed, r.scope])).toEqual([['a+b', 'Crowded: they’ll grow into each other', false, undefined], ['c+d', 'Crowded: they’ll grow into each other', true, 'for this pair']]);
    // (Not "Spicebush and Spicebush": the review, Nov 1.)
    expect(rows[0].name).toBe('2 Spicebush, 2 ft apart');
    rows[1].again!();
    expect(state.shapes.find((s) => s.id === 'c')).not.toHaveProperty('crowdOk');
    expect(planWarnings().filter((r) => r.kind === 'crowding' && !r.dismissed)).toHaveLength(2);
  });

  it('a pair left close that has since moved apart is no longer listed', () => {
    state.shapes = [at('c', shrub.id, 0, { crowdOk: ['d'] } as Partial<Shape>), at('d', shrub.id, 20)];
    expect(planWarnings().filter((r) => r.kind === 'crowding')).toEqual([]);
  });

  it('hardiness is the plant\'s: one row for its copies, the dismissed copies apart, all of them once dismissed across the plan', () => {
    state.shapes = [at('x', tropical.id, 0), at('y', tropical.id, 20), at('z', tropical.id, 40)];
    let rows = planWarnings().filter((r) => r.kind === 'hardy');
    expect(rows.map((r) => [r.name, r.dismissed])).toEqual([['Bougainvillea ×3', false]]);
    expect(rows[0].said).toMatch(/^Too cold for zone 8a/);
    const line = rows[0].said;
    state.shapes[2].hardyDismissed = line;
    rows = planWarnings().filter((r) => r.kind === 'hardy');
    expect(rows.map((r) => [r.name, r.ids.join(','), r.dismissed, r.scope])).toEqual([['Bougainvillea ×2', 'x,y', false, undefined], ['Bougainvillea', 'z', true, 'for this one']]);
    dismissForPlan('hardy', tropical.id, line);
    rows = planWarnings().filter((r) => r.kind === 'hardy');
    expect(rows.map((r) => [r.ids.join(','), r.dismissed, r.scope])).toEqual([['x,y,z', true, 'for every Bougainvillea in this plan']]);
    rows[0].again!();
    expect(planWarnings().filter((r) => r.kind === 'hardy').map((r) => [r.ids.join(','), r.dismissed])).toEqual([['x,y,z', false]]);
  });

  it('leaves out a kind switched off, plants already there, gone ones and those filtered out of the plan', () => {
    state.shapes = [at('x', tropical.id, 0, { status: 'existing' }), at('y', tropical.id, 20, { status: 'gone' }), at('w', tropical.id, 40, { status: 'planned' })];
    expect(planWarnings().filter((r) => r.kind === 'hardy').map((r) => r.ids.join(','))).toEqual(['w']);
    state.viewFilter = { status: 'planted', phase: '', showGone: false };
    expect(planWarnings().filter((r) => r.kind === 'hardy')).toEqual([]);
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.hardyWarnings = false;
    expect(planWarnings().filter((r) => r.kind === 'hardy')).toEqual([]);
  });

  it('counts say how many are active and how many dismissed', () => {
    const row = (dismissed: boolean) => ({ kind: 'sun' as const, ids: [], name: '', said: '', dismissed });
    expect(countSaid([row(false), row(false), row(true)])).toBe('2 active, 1 dismissed');
    expect(countSaid([row(true)])).toBe('1 dismissed');
    expect(countSaid([])).toBe('none');
  });
});

// Dismissed from Settings → Warnings, one at a time or a kind all at once, and shown all again (Jason, Nov 1): each as
// the plan's own dismissal for its kind does it, one step, with a way to take it back.
describe('dismissing warnings from the list', () => {
  const partShade = { id: 'wl-shade', common: 'Wild ginger', form: 'Perennial', width: { min: 1, max: 2, med: 1.5 }, sun_most: 'Part', sun_least: 'Shade' } as Plant;
  const tall = { id: 'wl-oak', common: 'White oak', form: 'Tree', width: { min: 4, max: 5, med: 4.5 }, height: { min: 50, max: 70, med: 60 } } as Plant;
  const holly = { id: 'wl-holly', common: "Holly 'Red'", form: 'Shrub', width: { min: 1, max: 2, med: 1.5 }, fruit_set: 'separate', fruit_color: ['red/burgundy'], sex: 'female', parent: 'wl-holly-sp' } as Plant;
  const sunny: Shape = { id: 'sunny', type: 'rect', role: 'shade', x: 100, y: -10, width: 40, height: 20, rotation: 0, color: '#facc15', opacity: 0.3, label: '', locked: false, sun: { mode: 'hours', hours: 8, periods: [], dappled: false } } as Shape;
  const wire: Shape = { id: 'wire', type: 'line', role: 'utility', utility: 'overhead', x: 200, y: 0, rotation: 0, points: [[0, 0], [100, 0]], color: '#ea580c', opacity: 1 } as Shape;
  const of = (kind: WarningKind) => planWarnings().filter((r) => r.kind === kind);
  const shape = (id: string) => state.shapes.find((s) => s.id === id)!;
  const leftWith = (id: string) => (shape(id) as { crowdOk?: string[] }).crowdOk;

  beforeEach(() => {
    for (const p of [shrub, tropical, partShade, tall, holly]) plantsById[p.id] = p;
    Object.assign(state, { showCrowding: true, crowdWarnings: true, sunWarnings: true, hardyWarnings: true, poisonWarnings: true, fruitWarnings: true });
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = {};
    state.dismissed = undefined;
    state.location = { zip: '71923', zone: '8a' };
    // Two crowded pairs; two wild gingers in 8 h of sun; two bougainvilleas, too cold; an oak 10 ft under a power line;
    // a female holly with no male.
    state.shapes = [at('a', shrub.id, 0), at('b', shrub.id, 2), at('c', shrub.id, 40), at('d', shrub.id, 42),
      sunny, at('g1', partShade.id, 110, { radius: 0.75 }), at('g2', partShade.id, 130, { radius: 0.75 }),
      at('t1', tropical.id, 60), at('t2', tropical.id, 80),
      wire, at('oak', tall.id, 250, { y: 10, radius: 2 } as Partial<Shape>),
      at('h', holly.id, -40)];
    state.history = []; state.historyIndex = -1;
    pushHistory();
  });
  afterEach(() => { state.shapes = []; state.location = null; state.history = []; state.historyIndex = -1; });

  it('every kind has a Dismiss on its active rows, and a Show again on its dismissed ones', () => {
    for (const kind of ['crowding', 'sun', 'hardy', 'utility', 'fruit'] as const) {
      const rows = of(kind);
      expect(rows.length, kind).toBeGreaterThan(0);
      for (const r of rows) expect([!!r.dismiss, !!r.again], kind).toEqual([!r.dismissed, r.dismissed]);
    }
  });

  it('a row is dismissed as the plan dismisses it: the pair left close, the copy where it stands, the plant across the plan', () => {
    const steps = state.historyIndex;
    setDismissed([of('crowding')[0]], true);
    expect(leftWith('a')).toEqual(['b']); // (as Leave it does)
    expect(of('crowding').map((r) => [r.ids.join('+'), r.dismissed])).toEqual([['c+d', false], ['a+b', true]]);
    const sun = of('sun')[0];
    setDismissed([sun], true);
    expect(shape('g1').sunDismissed).toBe(sun.key); // (kept as its message, as before)
    expect(sun.key).toBe('Wild ginger gets about 8 h of sun here; it prefers part shade to shade.');
    expect(shape('g2').sunDismissed).toBeUndefined(); // (only that copy)
    expect(of('sun').filter((r) => r.dismissed).map((r) => [r.ids.join(), r.scope])).toEqual([['g1', 'for this one']]);
    const util = of('utility')[0];
    setDismissed([util], true);
    expect(shape('oak').utilityDismissed).toBe('wire:near'); // (which utilities and rules: src/utilities.ts issuesKey)
    expect(of('utility').map((r) => [r.dismissed, r.scope])).toEqual([[true, 'for this one']]);
    expect(state.historyIndex).toBe(steps + 3); // (each a step)
    const hardy = of('hardy')[0];
    setDismissed([hardy], true);
    expect(dismissedForPlan('hardy', tropical.id, hardy.key!)).toBe(true); // (the plant, every copy and new ones)
    expect(of('hardy').map((r) => [r.ids.join(','), r.dismissed])).toEqual([['t1,t2', true]]);
    const fruit = of('fruit')[0];
    setDismissed([fruit], true);
    expect(dismissedForPlan('fruit', holly.id, fruit.key!)).toBe(true);
    expect(of('fruit').map((r) => [r.dismissed, r.scope])).toEqual([[true, "for every Holly 'Red' in this plan"]]);
    expect(state.historyIndex).toBe(steps + 3); // (across the plan: no shape changed, no step)
  });

  it('a kind dismissed all at once is one step, and taken back in one', () => {
    const steps = state.historyIndex;
    const { n, takeBack } = setDismissed(of('crowding'), true);
    expect(n).toBe(2);
    expect(state.historyIndex).toBe(steps + 1);
    expect(state.history[state.historyIndex].label).toBe('dismiss 2 crowding warnings');
    expect(of('crowding').every((r) => r.dismissed)).toBe(true);
    expect(takeBack()).toBe(true);
    expect(state.historyIndex).toBe(steps);
    expect(of('crowding').map((r) => r.dismissed)).toEqual([false, false]);
  });

  it('dismissed across the plan, taken back as it was though no step was taken; not once the plan has changed since', () => {
    state.dismissed = { poison: { other: 'Poisonous to people' } };
    const steps = state.historyIndex;
    const { n, takeBack } = setDismissed(of('hardy'), true);
    expect([n, state.historyIndex]).toEqual([1, steps]);
    expect(takeBack()).toBe(true);
    expect(state.dismissed).toEqual({ poison: { other: 'Poisonous to people' } });
    expect(of('hardy').map((r) => r.dismissed)).toEqual([false]);
    // Changed since: left as it is.
    const again = setDismissed(of('hardy'), true);
    dismissForPlan('fruit', holly.id, of('fruit')[0].key!);
    expect(again.takeBack()).toBe(false);
    expect(of('hardy').map((r) => r.dismissed)).toEqual([true]);
    // A first ever, taken back: kept, empty, so that syncs too.
    state.dismissed = undefined;
    expect(setDismissed(of('fruit'), true).takeBack()).toBe(true);
    expect(state.dismissed).toEqual({});
  });

  it('shown all again: each as its Show again does, a utility\'s left empty so sync keeps it shown', () => {
    setDismissed(of('sun'), true);
    setDismissed(of('utility'), true);
    setDismissed(of('crowding'), true);
    expect(of('sun').every((r) => r.dismissed)).toBe(true);
    const steps = state.historyIndex;
    const { n } = setDismissed(of('sun'), false);
    expect(n).toBe(2);
    expect([shape('g1').sunDismissed, shape('g2').sunDismissed]).toEqual([undefined, undefined]);
    setDismissed(of('utility'), false);
    expect(shape('oak').utilityDismissed).toBe('');
    expect(of('utility').map((r) => r.dismissed)).toEqual([false]);
    setDismissed(of('crowding'), false);
    expect(['a', 'b', 'c', 'd'].map(leftWith)).toEqual([undefined, undefined, undefined, undefined]);
    expect(state.historyIndex).toBe(steps + 3);
    // Nothing to do: no step.
    expect(setDismissed(of('sun'), false).n).toBe(0);
    expect(state.historyIndex).toBe(steps + 3);
  });

  it('lists the kinds safety first: poison, utilities, hardiness, sun, crowding, fruit partners', () => {
    state.household = { kids: true, dogs: '', cats: false, horses: false, answered: true };
    plantsById['wl-mayapple'] = { id: 'wl-mayapple', common: 'Mayapple', form: 'Perennial', width: { min: 1, max: 1.5, med: 1 }, poison: { severity: 'high', parts: ['leaves', 'roots'] } } as unknown as Plant;
    state.shapes.push(at('may', 'wl-mayapple', -80, { radius: 0.5 }));
    const kinds = planWarnings().map((r) => r.kind);
    expect([...new Set(kinds)]).toEqual(['poison', 'utility', 'hardy', 'sun', 'crowding', 'fruit']);
    state.household = { kids: false, dogs: '', cats: false, horses: false, answered: false };
  });

  it("says each as the plant's details do: name first, sun naming its area, poison with its severity, heights in whole feet", () => {
    state.household = { kids: true, dogs: 'hideToxic', cats: false, horses: false, answered: true };
    plantsById['wl-mayapple'] = { id: 'wl-mayapple', common: 'Mayapple', form: 'Perennial', width: { min: 1, max: 1.5, med: 1 }, poison: { severity: 'high', parts: ['leaves', 'roots'] }, problem_for: ['dogs'] } as unknown as Plant;
    plantsById[tall.id] = { ...tall, height: { min: 50, max: 60, med: 53.8 } } as Plant;
    (state.shapes.find((s) => s.id === 'sunny') as Shape).label = 'Sunny strip';
    state.shapes.push(at('may', 'wl-mayapple', -80, { radius: 0.5 }));
    const [poison] = of('poison');
    expect([poison.name, poison.said, poison.key]).toEqual(['Mayapple', 'Poisonous if eaten (high severity: leaves and roots); a problem for dogs', 'Poisonous to people; A problem for dogs']);
    expect(of('sun').map((r) => [r.name, r.said])).toEqual([
      ['Wild ginger', 'Gets about 8 h of sun in Sunny strip; it prefers part shade to shade'], ['Wild ginger', 'Gets about 8 h of sun in Sunny strip; it prefers part shade to shade']]);
    expect(of('utility').map((r) => [r.name, r.said])).toEqual([['White oak', 'Grows to 54 ft, 10 ft from a power line']]);
    expect(of('hardy')[0].said).toMatch(/^Too cold for zone 8a: it's rated for zones /);
    expect(of('fruit').map((r) => [r.name, r.said])).toEqual([["Holly 'Red'", 'A female: it needs a male of its kind nearby to fruit']]);
    // (No closing period, so a screen reader's label doesn't end in two.)
    for (const r of planWarnings()) expect(r.said, r.kind).not.toMatch(/\.$/);
    plantsById[tall.id] = tall;
    state.household = { kids: false, dogs: '', cats: false, horses: false, answered: false };
  });
});

// What each kind can check now, what Layers hide from them, and the Warnings button (Jason approved the mock-ups, Nov 1).
describe('what the checks can do', () => {
  beforeEach(() => {
    Object.assign(state, { showCrowding: true, crowdWarnings: true, sunWarnings: true, hardyWarnings: true, poisonWarnings: true, fruitWarnings: true });
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = {};
    state.dismissed = undefined;
    state.location = null;
    state.household = { kids: false, dogs: '', cats: false, horses: false, answered: false };
    plantsById[shrub.id] = shrub; plantsById[tropical.id] = tropical;
  });
  afterEach(() => { state.shapes = []; state.location = null; state.roleViews = {}; state.viewFilter = { status: '', phase: '', showGone: false }; });
  const cant = () => Object.fromEntries(kindStates().map((k) => [k.kind, k.on ? k.cantRun ?? 'runs' : 'off']));

  it('a new plan: poison until kids or pets are chosen, utilities until one is drawn, hardiness until a ZIP, sun until a sun area', () => {
    state.shapes = [at('x', tropical.id, 0)];
    expect(cant()).toEqual({ poison: 'yard', utility: 'utilities', hardy: 'zip', sun: 'sun', crowding: 'runs', fruit: 'runs' });
    expect(warningsSummary()).toMatchObject({ active: 0, dismissed: 0, cantRun: 4, hidden: null });
    expect(buttonSaid(warningsSummary())).toBe('Warnings: none found, 4 checks can’t run yet');
    // Each given what it needs.
    state.household = { kids: true, dogs: '', cats: false, horses: false, answered: true };
    state.location = { zip: '71923', zone: '8a' };
    state.shapes.push({ id: 'sun', type: 'rect', role: 'shade', x: 100, y: 0, width: 4, height: 4, rotation: 0, color: '#facc15', opacity: 0.3, label: '', locked: false, sun: { mode: 'hours', hours: 8, periods: [], dappled: false } } as Shape,
      { id: 'w', type: 'line', role: 'utility', utility: 'buried', x: 200, y: 0, rotation: 0, points: [[0, 0], [10, 0]], color: '#ea580c', opacity: 1 } as Shape);
    expect(cant()).toEqual({ poison: 'runs', utility: 'runs', hardy: 'runs', sun: 'runs', crowding: 'runs', fruit: 'runs' });
    const w = warningsSummary();
    expect([w.active, w.cantRun]).toEqual([1, 0]); // (the bougainvillea, too cold)
    expect(buttonSaid(w)).toBe('Warnings: 1 to look at');
    state.hardyWarnings = false;
    expect(cant().hardy).toBe('off'); // (switched off: not a check that can't run)
    expect(buttonSaid(warningsSummary())).toBe('Warnings: all clear');
  });

  it('a kind switched off is off, whatever it would need', () => {
    state.poisonWarnings = false; state.sunWarnings = false;
    expect([cant().poison, cant().sun]).toEqual(['off', 'off']);
  });

  it('says what Layers hide from the checks: plants filtered out or hidden, or the utilities hidden', () => {
    state.location = { zip: '71923', zone: '8a' };
    state.shapes = [at('x', tropical.id, 0, { status: 'planned' }), at('y', tropical.id, 20, { status: 'planted' })];
    expect(hiddenFromChecks()).toBeNull();
    state.viewFilter = { status: 'planted', phase: '', showGone: false };
    expect(hiddenFromChecks()).toEqual({ plants: true, utilities: false, said: 'Layers: Planted' });
    // (Not a false all-clear: the button says it's the plants shown.)
    state.viewFilter = { status: 'planned', phase: '', showGone: false };
    state.hardyWarnings = false;
    expect(buttonSaid(warningsSummary())).toMatch(/^Warnings: none found in the plants shown/);
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = { plant: { hidden: true } };
    expect(hiddenFromChecks()?.said).toBe('Layers: Plants hidden');
    state.roleViews = { utility: { hidden: true } };
    state.shapes.push({ id: 'w', type: 'line', role: 'utility', utility: 'overhead', x: 200, y: 0, rotation: 0, points: [[0, 0], [10, 0]], color: '#ea580c', opacity: 1 } as Shape);
    expect(hiddenFromChecks()).toEqual({ plants: false, utilities: true, said: 'Layers: Utilities hidden' });
  });
});

describe('names on the plan at another label size', () => {
  it('start bigger at Large and smaller at Small, and fit inside fewer or more circles', () => {
    expect(fitInCircle('Buttonbush', 80)!.fontSize).toBe(14);
    expect(fitInCircle('Buttonbush', 80, {}, 10, 1.25)!.fontSize).toBe(18);
    expect(fitInCircle('Buttonbush', 80, {}, 10, 0.85)!.fontSize).toBe(12);
    // (A circle just big enough at Medium's smallest size: too small at Large's; Small fits a little smaller still.)
    let r = 10;
    while (!fitInCircle('Buttonbush', r)) r++;
    expect(fitInCircle('Buttonbush', r, {}, 10, 1.25)).toBeNull();
    expect(fitInCircle('Buttonbush', r - 2, {}, 10, 0.85)).not.toBeNull();
  });
});
