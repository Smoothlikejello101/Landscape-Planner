// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPlants, plantsById } from '../src/plants';
import { foldDetailGroups, plantDetails, sourcesSaid } from '../src/ui/plant-details';

// Facts first, sources quieter (Jason, Nov 4, from the beta testers: "'Confirmed' and 'one source' seem unnecessary
// on the end of the plant facts. Maybe scrap those and add 'source:' or 'sources:' at the front?").

const file = {
  meta: {
    format: 'lp-catalog', version: 2, zones: 'half', sources: {
      ncsu: { title: 'NC State Extension Gardener Plant Toolbox', trust: 'reference' }, usda: { title: 'USDA PLANTS', trust: 'reference' },
      'a.com': { title: 'a.com', trust: 'nursery' }, 'b.com': { title: 'b.com', trust: 'nursery' },
      compendium: { title: 'First compendium (2026)', trust: 'unverified' },
    },
  },
  plants: [{
    id: 'cephalanthus-occidentalis', common: 'Buttonbush', botanical: 'Cephalanthus occidentalis', src: ['ncsu'], audited: '2026-10-27', facts: {
      form: { v: 'Shrub', src: ['ncsu', 'usda'], check: 'agree' },
      height: { v: { min: 5, max: 8 }, src: ['ncsu'], check: 'single' },
      width: { v: { min: 6, max: 10 }, src: ['a.com', 'b.com'], check: 'likely' },
      sun_most: { v: 'Full', src: ['ncsu'], check: 'single' }, sun_least: { v: 'Part', src: ['a.com'], check: 'reported' },
      water: { v: 'High', src: ['compendium'] },
      zone_min: { v: 5, src: ['ncsu', 'usda'], check: 'disputed' }, zone_max: { v: 9.5, src: ['ncsu', 'usda'], check: 'disputed' },
    },
  }],
};

describe('a fact, then its sources', () => {
  beforeAll(async () => {
    const was = globalThis.fetch;
    globalThis.fetch = (async () => ({ json: async () => file })) as unknown as typeof fetch;
    try { await loadPlants(); } finally { globalThis.fetch = was; }
    foldDetailGroups();
  });
  const line = (testid: string, label: string) => {
    const box = plantDetails(plantsById['cephalanthus-occidentalis'], undefined);
    const dt = [...box.querySelectorAll('dt')].find((d) => d.textContent === label)!;
    return dt.nextElementSibling!.querySelector('.details-src')?.textContent ?? `(none: ${testid})`;
  };
  it('says "Source:" or "Sources:" in front, by short names; no "confirmed", no "one source"', () => {
    expect(sourcesSaid(['NC State'])).toBe('Source: NC State');
    expect(sourcesSaid(['NC State', 'USDA'])).toBe('Sources: NC State, USDA');
    expect(line('form', 'Form')).toBe('Sources: NC State, USDA');
    expect(line('size', 'Size')).toBe('Sources: NC State for the height; a.com, b.com (nurseries) for the width');
    const all = plantDetails(plantsById['cephalanthus-occidentalis'], undefined).textContent!;
    expect(all).not.toMatch(/confirmed|one source/);
  });
  it('still says nurseries alone, sources that disagree, and the earlier list, unverified', () => {
    expect(line('sun', 'Sun')).toBe('Sources: NC State for the most sun; a.com (a nursery) for the least sun');
    expect(line('hardiness', 'Hardiness')).toBe('Sources: NC State, USDA (they disagree)');
    expect(line('water', 'Water')).toBe('Source: earlier list, unverified');
  });
});
