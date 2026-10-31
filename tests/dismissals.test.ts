import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { copiesSaid, dismissedForPlan, dismissForPlan, planDismissals, showAgainForPlan, warnForNewOnes } from '../src/dismissals';
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
    expect(copiesSaid('ficus-carica')).toMatch(/^all 2 of /);
    expect(planDismissals().map((d) => `${d.plantId} ${d.kind}`)).toEqual(['ficus-carica hardy']);
  });
  it('"Warn me for new ones": the copies placed so far keep it, each its own; new ones warn', () => {
    dismissForPlan('hardy', 'ficus-carica', said);
    warnForNewOnes('hardy', 'ficus-carica', said);
    expect(dismissedForPlan('hardy', 'ficus-carica', said)).toBe(false);
    expect(state.shapes.map((s) => s.hardyDismissed)).toEqual([said, said]);
    expect(state.dismissed).toEqual({}); // (kept, empty, so it syncs)
  });
  it('shown again: for the plant across the plan, and each copy', () => {
    dismissForPlan('poison', 'ficus-carica', 'Poisonous to people');
    state.shapes[0].poisonDismissed = 'Poisonous to people';
    showAgainForPlan('poison', 'ficus-carica');
    expect(dismissedForPlan('poison', 'ficus-carica', 'Poisonous to people')).toBe(false);
    expect(state.shapes.map((s) => s.poisonDismissed)).toEqual([undefined, undefined]);
  });
});
