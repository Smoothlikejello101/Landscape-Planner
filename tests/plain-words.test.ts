// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Plant } from '../src/plants';
import { flowerFormText, foldDetailGroups, leafFormText, plantDetails } from '../src/ui/plant-details';
import { heightRange } from '../src/ui/height-range';

// Words a new gardener would trip on, in plain ones (Kayla, Nov 4: "I feel like it's very technical. What is mature
// spread? What if I'm a new Gardner").

describe('plain words for a new gardener', () => {
  it('"width when grown", not "mature spread"; height the same way', () => {
    const w = heightRange('', () => {}, () => {}, 'width');
    expect([...w.querySelectorAll('input')].map((i) => i.getAttribute('aria-label'))).toEqual(['Narrowest width when grown', 'Widest width when grown']);
    const h = heightRange('', () => {}, () => {});
    expect([...h.querySelectorAll('input')].map((i) => i.getAttribute('aria-label'))).toEqual(['Shortest height when grown', 'Tallest height when grown']);
  });
  it("a plant's details: plain names for its rows", () => {
    foldDetailGroups();
    const p = { id: 'x', common: 'X', fruit_set: 'separate', wet_feet: true, habit: 'Twining', nativar: true } as unknown as Plant;
    const labels = [...plantDetails(p, undefined).querySelectorAll('dt')].map((d) => d.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Fruiting', 'Takes wet soil', 'How it grows', 'Bred from a native']));
    expect(labels).not.toEqual(expect.arrayContaining(['Fruit set']));
    expect(labels.filter((l) => /Nativar|wet feet|^Habit$/.test(l ?? ''))).toEqual([]);
  });
  it("leaves and flowers in everyday words, the botanist's word after where it helps", () => {
    expect(leafFormText({ type: ['compound'], shape: ['cordate', 'lanceolate'], arrangement: ['whorled'] })).toBe('Compound (made of leaflets) · heart-shaped or lance-shaped · in rings around the stem');
    expect(flowerFormText({ inflorescence: ['umbel'] })).toBe('In umbrella-shaped clusters (umbels)');
    expect(flowerFormText({ inflorescence: ['raceme'] })).toBe('Along a stem (racemes)');
  });
});
