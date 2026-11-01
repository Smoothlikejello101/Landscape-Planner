// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPlants, plantIdsInPlan, plantsById } from '../src/plants';
import { state } from '../src/state';
import type { CircleShape } from '../src/types';

// A catalog record folded into another (scripts/catalog/decisions.json `fold`): a plant placed from it keeps going.
describe('a plant placed from a record since folded into another', () => {
  it("shows the other record's facts, and counts as it in the plan", async () => {
    const file = {
      meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { ncsu: { title: 'NC State', trust: 'reference' } }, moved: { 'sage-and-oregano': 'salvia-officinalis' } },
      plants: [{ id: 'salvia-officinalis', common: 'Kitchen sage', botanical: 'Salvia officinalis', src: ['ncsu'], audited: '2026-10-27', facts: { form: 'Perennial' } }],
    };
    const was = globalThis.fetch;
    globalThis.fetch = (async () => ({ json: async () => file })) as unknown as typeof fetch;
    try { await loadPlants(); } finally { globalThis.fetch = was; }
    expect(plantsById['sage-and-oregano']).toBe(plantsById['salvia-officinalis']);
    expect(plantsById['sage-and-oregano'].common).toBe('Kitchen sage');
    state.shapes = [{ id: 's1', type: 'circle', x: 0, y: 0, r: 1, plantId: 'sage-and-oregano' } as unknown as CircleShape];
    expect([...plantIdsInPlan()]).toEqual(['salvia-officinalis']);
  });
  it('Water iris, folded into Blue flag iris (Jason, 2026-11-01): a plan\u2019s Water iris shows Blue flag iris, with its facts', async () => {
    const file = JSON.parse(readFileSync('public/plants.json', 'utf8'));
    expect(file.meta.moved['iris-aquatic-spp']).toBe('iris-virginica');
    const was = globalThis.fetch;
    globalThis.fetch = (async () => ({ json: async () => file })) as unknown as typeof fetch;
    try { await loadPlants(); } finally { globalThis.fetch = was; }
    expect(plantsById['iris-aquatic-spp']).toBe(plantsById['iris-virginica']);
    expect([plantsById['iris-aquatic-spp'].common, plantsById['iris-aquatic-spp'].botanical]).toEqual(['Blue flag iris', 'Iris virginica']);
    state.shapes = [{ id: 'w1', type: 'circle', x: 0, y: 0, r: 1, plantId: 'iris-aquatic-spp', label: 'Water iris' } as unknown as CircleShape];
    expect([...plantIdsInPlan()]).toEqual(['iris-virginica']);
  });
});
