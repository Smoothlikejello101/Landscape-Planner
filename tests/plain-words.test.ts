// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Plant } from '../src/plants';
import { flowerFormText, foldDetailGroups, leafFormText, photoSearchUrl, plantDetails } from '../src/ui/plant-details';
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

// See photos (Jason, Nov 4, from Sam: "Wishes there were photos of the plants"): a web image search, not images in the app.
describe('See photos', () => {
  const q = (url: string) => new URL(url).searchParams.get('q');
  it("searches images for its botanical name and its common name, the cultivar once, notes in brackets left out", () => {
    const url = photoSearchUrl({ common: "Black-Eyed Susan 'Goldsturm'", botanical: "Rudbeckia fulgida 'Goldsturm'" });
    expect(url.startsWith('https://www.google.com/search?tbm=isch&q=')).toBe(true);
    expect(q(url)).toBe("Rudbeckia fulgida 'Goldsturm' Black-Eyed Susan");
    expect(q(photoSearchUrl({ common: 'Purple Coneflower (Species)', botanical: 'Echinacea purpurea' }))).toBe('Echinacea purpurea Purple Coneflower');
    expect(q(photoSearchUrl({ common: "Coneflower 'Magnus'", botanical: 'Echinacea purpurea' }))).toBe("Echinacea purpurea Coneflower 'Magnus'");
    expect(q(photoSearchUrl({ common: 'My mystery shrub' }))).toBe('My mystery shrub');
  });
  it('is a plain link in its details, to a new tab, saying nothing of where it came from', () => {
    foldDetailGroups();
    const a = plantDetails({ id: 'b', common: 'Buttonbush', botanical: 'Cephalanthus occidentalis' } as Plant, undefined).querySelector<HTMLAnchorElement>('[data-testid=see-photos]')!;
    expect(a.textContent).toContain('See photos');
    expect([a.target, a.rel]).toEqual(['_blank', 'noopener noreferrer']);
    expect(q(a.href)).toBe('Cephalanthus occidentalis Buttonbush');
  });
});
