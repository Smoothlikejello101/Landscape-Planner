// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Plant } from '../src/plants';
import { foldDetailGroups, groupSummary, plantDetails, safetyWarnings } from '../src/ui/plant-details';

// A plant's details, folded (Jason, 2026-10-29: "the list is getting long"): a few rows always open, then Flowers and
// leaves, Wildlife, Safety and Growing, each a line that opens; open ones stay open until the picker closes.

const witchHazel = {
  id: 'hamamelis-virginiana', common: 'Common witch hazel', botanical: 'Hamamelis virginiana', form: 'Shrub', forms: ['Shrub', 'Tree'],
  height: { min: 15, max: 30, med: 22.5 }, width: { min: 15, max: 20, med: 17.5 }, sun_most: 'Full', sun_least: 'Part', water: 'Moderate',
  flower_color: ['cream', 'yellow'], fall_color: true, fall_colors: ['gold'], foliage: 'deciduous', bark: ['smooth'],
  attracts: ['moths', 'songbirds'], deer: 'Resistant', tolerates: ['deer', 'erosion'], clay_ok: true, growth_rate: 'medium', maintenance_level: 'low',
  edible: true, poison: null, native: 'Local ecotype possible', self_seed: 'Modest',
  prov: {
    height: { src: ['ncsu', 'prairienursery.com'], check: 'confirmed' }, width: { src: ['ncsu'], check: 'single' },
    poison: { src: ['ncsu'], unknown: true },
  },
} as unknown as Plant;
const jessamine = {
  id: 'gelsemium-sempervirens', common: 'Carolina jessamine', form: 'Vine', forms: ['Vine'], height: { min: 10, max: 20 },
  poison: { severity: 'high', parts: ['leaves', 'roots'] }, dog: 'HARD NO', flower_color: ['yellow'], attracts: ['bees'],
} as unknown as Plant;

describe("a plant's details, folded", () => {
  beforeEach(() => foldDetailGroups());

  it('keeps form, size (height and spread in one row), sun and water open; the rest in groups, folded, each with its line', () => {
    const box = plantDetails(witchHazel, undefined);
    const top = box.querySelector('.details-list')!;
    expect([...top.querySelectorAll(':scope > dt')].map((d) => d.textContent)).toEqual(['Form', 'Size', 'Sun', 'Water']);
    expect(box.querySelector('[data-testid=size-row]')!.textContent).toMatch(/^15–30 ft tall, 15–20 ft wide/);
    expect(box.querySelector('[data-testid=size-row] .details-src')!.textContent).toMatch(/^height: .*; spread: /);
    const heads = [...box.querySelectorAll<HTMLButtonElement>('.details-group-head')];
    expect(heads.map((h) => h.dataset.testid)).toEqual(['group-looks', 'group-wildlife', 'group-safety', 'group-growing']);
    expect(heads.every((h) => h.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(box.querySelector('[data-testid=group-looks-sum]')!.textContent).toBe('Cream, yellow flowers · gold in fall · deciduous');
    expect(box.querySelector('[data-testid=group-wildlife-sum]')!.textContent).toBe('Moths, songbirds');
    expect(box.querySelector('[data-testid=group-growing-sum]')!.textContent).toBe('Deer resistant · takes erosion, clay · medium growth · low upkeep · self-sows a little');
    // (The earlier list's "native" in its topic's group.)
    expect(heads[1].nextElementSibling!.textContent).toContain('Local ecotype possible');
  });

  it('opens a group with a tap; it stays open for the next plant until the picker closes', () => {
    const box = plantDetails(witchHazel, undefined);
    const head = box.querySelector<HTMLButtonElement>('[data-testid=group-growing]')!;
    head.click();
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect((head.nextElementSibling as HTMLElement).hidden).toBe(false);
    expect(plantDetails(jessamine, undefined).querySelector('[data-testid=group-growing]')?.getAttribute('aria-expanded') ?? 'true').toBe('true');
    expect(plantDetails(witchHazel, undefined).querySelector('[data-testid=group-growing]')!.getAttribute('aria-expanded')).toBe('true');
    foldDetailGroups(); // (the picker closed)
    expect(plantDetails(witchHazel, undefined).querySelector('[data-testid=group-growing]')!.getAttribute('aria-expanded')).toBe('false');
  });

  it("never folds a warning away: Safety says it in its line, comes first, and starts open", () => {
    expect(safetyWarnings(witchHazel)).toEqual([]);
    expect(groupSummary('safety', witchHazel)).toBe('Not listed as poisonous to people · not listed as a problem for pets · edible');
    expect(safetyWarnings(jessamine)).toEqual(['Poisonous to people (high severity)', 'dogs: hard no (earlier list)']);
    const box = plantDetails(jessamine, undefined);
    const first = box.querySelector<HTMLButtonElement>('.details-group-head')!;
    expect(first.dataset.testid).toBe('group-safety');
    expect(first.closest('.details-group')!.classList.contains('warn')).toBe(true);
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(box.querySelector('[data-testid=group-safety-sum]')!.textContent).toBe('Poisonous to people (high severity) · dogs: hard no (earlier list)');
    // (A hybrid with no rating of its own, a parent rated: a warning too.)
    expect(safetyWarnings({ id: 'x', common: 'x', poison_parents: { via: 'name', parents: [{ name: 'Morus rubra', poison: { severity: 'low' } }] } } as unknown as Plant))
      .toEqual(['A parent is poisonous to people']);
    expect(safetyWarnings({ id: 'x', common: 'x', problem_for: ['cats', 'dogs'] } as unknown as Plant)).toEqual(['a problem for dogs and cats']);
  });

  it('opens Growing where the plant is shown for what other sources say of deer', () => {
    const box = plantDetails(witchHazel, ['deer resistance']);
    expect(box.querySelector('[data-testid=group-growing]')!.getAttribute('aria-expanded')).toBe('true');
    expect(box.querySelector('[data-testid=group-looks]')!.getAttribute('aria-expanded')).toBe('false');
  });
});
