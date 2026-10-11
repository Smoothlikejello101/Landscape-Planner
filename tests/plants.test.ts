import { describe, expect, it } from 'vitest';
import { PLANT_FILTER_DEFAULTS, plantMatches, plantTakesSun, type Plant } from '../src/plants';

const heuchera: Plant = {
  id: 'h', common: "Heuchera 'Autumn Bride'", botanical: 'Heuchera villosa', form: 'Perennial',
  dog: 'Safe', sun_most: 'Part', sun_least: 'Shade', water: 'Low', dry_shade: true,
  height: { med: 1.75 }, width: { med: 2.5 }, bloom: { start: 9, end: 10 }, status: 'Planned', nectar: 'Low'
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
  it('hides dog-unsafe and rejected plants by default', () => {
    expect(plantMatches({ ...heuchera, dog: 'Mild GI' }, f())).toBe(false);
    expect(plantMatches({ ...heuchera, dog: 'Mild GI' }, f({ dogSafeOnly: false }))).toBe(true);
    expect(plantMatches({ ...heuchera, status: 'Rejected' }, f())).toBe(false);
    expect(plantMatches({ ...heuchera, status: 'Rejected' }, f({ showArchived: true }))).toBe(true);
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
