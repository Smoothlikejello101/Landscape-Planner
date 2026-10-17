import { describe, expect, it } from 'vitest';
import { PLANT_FILTER_DEFAULTS, plantMatches, plantTakesSun, type Plant } from '../src/plants';

const heuchera: Plant = {
  id: 'h', common: "Heuchera 'Autumn Bride'", botanical: 'Heuchera villosa', form: 'Perennial',
  dog: 'Safe', sun_most: 'Part', sun_least: 'Shade', water: 'Low', dry_shade: true,
  height: { med: 1.75 }, width: { med: 2.5 }, bloom: { start: 9, end: 10 }, nectar: 'Low'
};
const f = (over: Partial<typeof PLANT_FILTER_DEFAULTS> = {}) => ({ ...PLANT_FILTER_DEFAULTS, ...over });

describe('plant filters', () => {
  it('treats sun tolerance as a range', () => {
    expect(plantTakesSun(heuchera, 'Part')).toBe(true);
    expect(plantTakesSun(heuchera, 'Shade')).toBe(true);
    expect(plantTakesSun(heuchera, 'Full')).toBe(false);
    expect(plantTakesSun(heuchera, '')).toBe(true);
  });
  it('matches on bloom month within the range', () => {
    expect(plantMatches(heuchera, f({ bloomMonth: '9' }))).toBe(true);
    expect(plantMatches(heuchera, f({ bloomMonth: '5' }))).toBe(false);
  });
  it('shows dog-unsafe plants unless asked; hides nothing else by default', () => {
    expect(plantMatches({ ...heuchera, dog: 'Mild GI' }, f())).toBe(true);
    expect(plantMatches({ ...heuchera, dog: 'Mild GI' }, f({ dogSafeOnly: true }))).toBe(false);
    expect(plantMatches({ ...heuchera, dog: 'HARD NO' }, f())).toBe(true);
  });
  it('never suggests invasives, but finds them by name', () => {
    const privet: Plant = { id: 'p', common: 'Chinese privet', botanical: 'Ligustrum sinense', invasive: true };
    expect(plantMatches(privet, f())).toBe(false);
    expect(plantMatches(privet, f({ q: 'privet' }))).toBe(true);
    expect(plantMatches(privet, f({ inPlan: true }), new Set(['p']))).toBe(true);
  });
  it('can show only plants already placed in the open plan', () => {
    expect(plantMatches(heuchera, f({ inPlan: true }), new Set(['h']))).toBe(true);
    expect(plantMatches(heuchera, f({ inPlan: true }), new Set(['other']))).toBe(false);
  });
  it('searches common and botanical names case-insensitively', () => {
    expect(plantMatches(heuchera, f({ q: 'VILLOSA' }))).toBe(true);
    expect(plantMatches(heuchera, f({ q: 'oak' }))).toBe(false);
  });
  it('applies the max height filter to the median height', () => {
    expect(plantMatches(heuchera, f({ maxHeight: '2' }))).toBe(true);
    expect(plantMatches(heuchera, f({ maxHeight: '1' }))).toBe(false);
  });
});
