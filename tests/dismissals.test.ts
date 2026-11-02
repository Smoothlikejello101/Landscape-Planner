import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { atRisk, clearForPlan, copiesSaid, copyDismissed, dismissedForPlan, dismissForPlan, planDismissals, poisonCovered, showAgainForPlan, warnedCopies, warnForNewOnes } from '../src/dismissals';
import { plantsById, type Plant } from '../src/plants';
import { state } from '../src/state';
import type { Shape } from '../src/types';

// Warnings dismissed for a plant across the plan (Jason, Oct 30): its copies and the ones added later, kept with what
// the warning said, shown again from its pane or Layers.
const fig = (id: string): Shape => ({ id, type: 'circle', role: 'plant', plantId: 'ficus-carica', x: 0, y: 0, radius: 2 } as Shape);
const said = "Too cold for zone 8a: it's rated for zones 9–11";

describe('a warning dismissed for a plant, across the plan', () => {
  beforeEach(() => { state.shapes = [fig('a'), fig('b')]; state.dismissed = undefined; });
  it('covers every copy, and new ones, while it says the same', () => {
    dismissForPlan('hardy', 'ficus-carica', said);
    expect(dismissedForPlan('hardy', 'ficus-carica', said)).toBe(true);
    expect(dismissedForPlan('hardy', 'ficus-carica', 'Too cold for zone 6b')).toBe(false); // (a new ZIP: back)
    expect(dismissedForPlan('poison', 'ficus-carica', said)).toBe(false);
    expect(planDismissals().map((d) => `${d.plantId} ${d.kind}`)).toEqual(['ficus-carica hardy']);
  });
  it('"Warn me for new ones": the copies placed so far keep it, each its own; new ones warn', () => {
    dismissForPlan('hardy', 'ficus-carica', said);
    warnForNewOnes('hardy', 'ficus-carica', said);
    expect(dismissedForPlan('hardy', 'ficus-carica', said)).toBe(false);
    expect(state.shapes.map((s) => s.hardyDismissed)).toEqual([said, said]);
    expect(state.dismissed).toEqual({}); // (kept, empty, so it syncs)
  });
  it('says the copies as a nursery would: "Oleander", "both Oleander", "all 3 Oleander" (not "all 2 of Oleander": the warnings bug hunt, Nov 1)', () => {
    plantsById['nerium-oleander'] = { id: 'nerium-oleander', common: 'Oleander' } as Plant;
    const ole = (id: string): Shape => ({ ...fig(id), plantId: 'nerium-oleander' });
    state.shapes = [ole('o1')];
    expect(copiesSaid('poison', 'nerium-oleander')).toBe('Oleander');
    state.shapes.push(ole('o2'));
    expect(copiesSaid('poison', 'nerium-oleander')).toBe('both Oleander');
    state.shapes.push(ole('o3'), fig('c'));
    expect(copiesSaid('poison', 'nerium-oleander')).toBe('all 3 Oleander');
  });
  it('a poison warning stays dismissed with the same or fewer at risk, and comes back with someone new (Jason, Nov 1)', () => {
    dismissForPlan('poison', 'ficus-carica', 'Poisonous to people; A problem for dogs');
    const still = (now: string) => dismissedForPlan('poison', 'ficus-carica', now);
    expect(still('Poisonous to people; A problem for dogs')).toBe(true);
    expect(still('A problem for dogs')).toBe(true); // (the kids gone from the yard)
    expect(still('Poisonous to people')).toBe(true); // (the dog gone)
    expect(still('A problem for dogs and cats')).toBe(false); // (cats added: newly at risk)
    expect(still('Poisonous to people; A problem for dogs, cats and horses')).toBe(false);
    // (What's kept is what it said when dismissed: unchanged.)
    expect(state.dismissed).toEqual({ poison: { 'ficus-carica': 'Poisonous to people; A problem for dogs' } });
    // A copy's own likewise; hardiness still by what it says, whole.
    expect(poisonCovered('A problem for dogs, cats and horses', 'A problem for cats and horses')).toBe(true);
    expect(poisonCovered('A problem for cats', 'Poisonous to people; A problem for cats')).toBe(false);
    expect(poisonCovered(undefined, 'A problem for cats')).toBe(false);
    expect([...atRisk('Poisonous to people; A problem for dogs, cats and horses')]).toEqual(['people', 'dogs', 'cats', 'horses']);
    const copy = { ...fig('c'), poisonDismissed: 'Poisonous to people', hardyDismissed: said } as Shape;
    expect(copyDismissed('poison', copy, 'Poisonous to people')).toBe(true);
    expect(copyDismissed('poison', copy, 'A problem for dogs')).toBe(false);
    expect(copyDismissed('hardy', copy, said)).toBe(true);
    expect(copyDismissed('hardy', copy, 'Too cold for zone 6b')).toBe(false);
  });
  it('shown again: for the plant across the plan, and each copy', () => {
    dismissForPlan('poison', 'ficus-carica', 'Poisonous to people');
    state.shapes[0].poisonDismissed = 'Poisonous to people';
    showAgainForPlan('poison', 'ficus-carica');
    expect(dismissedForPlan('poison', 'ficus-carica', 'Poisonous to people')).toBe(false);
    expect(state.shapes.map((s) => s.poisonDismissed)).toEqual([undefined, undefined]);
  });
  it('a fruit-partner warning too (Jason, Nov 1): "Just these 2" keeps it to the copies there now, each its own, by its words', () => {
    const line = "Fig 'Brown Turkey' needs a second, different variety nearby to fruit";
    dismissForPlan('fruit', 'ficus-carica', line);
    warnForNewOnes('fruit', 'ficus-carica', line);
    expect(dismissedForPlan('fruit', 'ficus-carica', line)).toBe(false);
    expect(state.dismissed).toEqual({}); // (kept, empty, so it syncs)
    expect(state.shapes.map((s) => s.fruitDismissed)).toEqual([line, line]);
    expect(state.shapes.map((s) => [s.hardyDismissed, s.poisonDismissed])).toEqual([[undefined, undefined], [undefined, undefined]]); // (only its own kind)
    expect(copyDismissed('fruit', state.shapes[0], line)).toBe(true);
    expect(copyDismissed('fruit', state.shapes[0], line + '; NC State suggests \'Celeste\'')).toBe(false); // (its words changed: back)
    expect(copyDismissed('fruit', fig('new'), line)).toBe(false); // (one added later: warned for)
    // Shown again for the plant: every copy's goes too, as hardiness's and poison's do; left '', shown again on purpose,
    // so sync doesn't fill it back from another device (src/sync/engine.ts withFruitDismissals). '' is never dismissed.
    expect(clearForPlan('fruit', 'ficus-carica')).toBe(true);
    expect(state.shapes.map((s) => s.fruitDismissed)).toEqual(['', '']);
    expect(copyDismissed('fruit', state.shapes[0], line)).toBe(false);
    expect(clearForPlan('fruit', 'ficus-carica')).toBe(false); // (none left: no step)
    // (Hardiness and poison aren't filled back by sync: theirs go, as before.)
    state.shapes[0].hardyDismissed = said;
    expect(clearForPlan('hardy', 'ficus-carica')).toBe(true);
    expect('hardyDismissed' in state.shapes[0]).toBe(false);
  });
  it('"Just these 2" counts, and keeps it for, the copies the warning is about: not a gone one, one coming out, a tree; for hardiness, not one already there (the review, Nov 1)', () => {
    const line = "Fig 'Brown Turkey' needs a second, different variety nearby to fruit";
    state.shapes = [fig('a'), fig('b'), { ...fig('gone'), status: 'gone' } as Shape, { ...fig('out'), status: 'remove' } as Shape,
      { ...fig('tree'), tree: true } as Shape, { ...fig('old'), status: 'existing' } as Shape];
    plantsById['ficus-carica'] = { id: 'ficus-carica', common: 'Fig' } as Plant;
    expect(warnedCopies('fruit', 'ficus-carica').map((s) => s.id)).toEqual(['a', 'b', 'old']);
    expect(warnedCopies('poison', 'ficus-carica').map((s) => s.id)).toEqual(['a', 'b', 'old']);
    expect(warnedCopies('hardy', 'ficus-carica').map((s) => s.id)).toEqual(['a', 'b']);
    expect([copiesSaid('fruit', 'ficus-carica'), copiesSaid('hardy', 'ficus-carica')]).toEqual(['all 3 Fig', 'both Fig']);
    dismissForPlan('fruit', 'ficus-carica', line);
    warnForNewOnes('fruit', 'ficus-carica', line);
    expect(Object.fromEntries(state.shapes.map((s) => [s.id, s.fruitDismissed]))).toEqual({ a: line, b: line, gone: undefined, out: undefined, tree: undefined, old: line });
  });
});
