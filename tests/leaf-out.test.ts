// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { bareDays, csvFields, daySpread, DROP_PHASES, fallDays, FALL_FROM, leafOutDays, MIN_PLANT_YEARS, npnSource, stateLeafOut, TURN_PHASES } from '../scripts/catalog/npn.mjs';
import { dayOfYear, loadWild, localLeafFall, localLeafOut, resetWild, type WildFile } from '../src/wild';
import type { Plant } from '../src/plants';
import { plantDetails } from '../src/ui/plant-details';
import { state } from '../src/state';

// When plants leaf out, by state, from USA-NPN's records (docs/leaf-out.md).

const row = (o: Record<string, string | number>) => ({
  genus: 'Cercis', Species: 'canadensis', State: 'AR', Individual_ID: '1', Phenophase_Description: 'Breaking leaf buds',
  First_Yes_Year: '2020', First_Yes_DOY: '80', NumDays_Since_Prior_No: '5', Observed_Status_Conflict_Flag: '-9999',
  ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])),
});

describe("USA-NPN's records, summed up", () => {
  it('reads its CSV lines, quoted commas and quotes too', () => {
    expect(csvFields('2,43.08,"Ornamental,Allergen",x')).toEqual(['2', '43.08', 'Ornamental,Allergen', 'x']);
    expect(csvFields('"a ""b""",,c')).toEqual(['a "b"', '', 'c']);
  });
  it("takes each plant-year's first leaf series, only where a no came at most two weeks before it", () => {
    const days = leafOutDays([
      row({}), // 80
      row({ First_Yes_DOY: 120 }), // (a later series that year: not the leaf-out)
      row({ First_Yes_Year: 2021, First_Yes_DOY: 70, NumDays_Since_Prior_No: 30 }), // (a month since the last no: unknown, and not stood in for)
      row({ First_Yes_Year: 2021, First_Yes_DOY: 95 }),
      row({ First_Yes_Year: 2022, First_Yes_DOY: 75, NumDays_Since_Prior_No: -9999 }), // (no no before it)
      row({ First_Yes_Year: 2023, First_Yes_DOY: 78, Observed_Status_Conflict_Flag: 'OneObserver-StatusConflict' }),
      row({ Individual_ID: 2, First_Yes_DOY: 85, State: 'TX' }),
      row({ Individual_ID: 3, Phenophase_Description: 'Open flowers', First_Yes_DOY: 60 }), // (not a leaf phase)
      row({ Individual_ID: 4, genus: 'Asclepias', Species: 'tuberosa', Phenophase_Description: 'Initial growth (forbs)', First_Yes_DOY: 105 }),
    ]);
    expect(days).toEqual({ 'cercis canadensis': { AR: [80], TX: [85] }, 'asclepias tuberosa': { AR: [105] } });
  });
  it("gives a state's day where it has ten plant-years, else its region's, else none", () => {
    expect(MIN_PLANT_YEARS).toBe(10);
    expect(daySpread([70, 75, 80, 85, 90])).toEqual({ med: 80, q1: 75, q3: 85, n: 5 });
    const ten = Array.from({ length: 10 }, (_, i) => 70 + i * 2);
    const days = { 'cercis canadensis': { AR: ten, TX: [100, 100] }, 'cornus florida': { AR: [70, 72], TN: ten } };
    const plants = [{ id: 'redbud', binomial: 'Cercis canadensis' }, { id: 'dogwood', binomial: 'Cornus florida' }, { id: 'none', binomial: 'Quercus alba' }];
    const near = { 5: [47, 48] }, postal = (f: number) => ({ 5: 'AR', 47: 'TN', 48: 'TX' } as Record<number, string>)[f];
    const ar = stateLeafOut(5, days, plants, near, postal);
    expect(ar.redbud).toEqual({ med: 79, q1: 75, q3: 84, n: 10, area: 'state' });
    expect(ar.dogwood).toMatchObject({ n: 12, area: 'region' });
    expect(ar.none).toBeUndefined();
    expect(stateLeafOut(5, days, plants, {}, postal).dogwood).toBeUndefined();
    expect(npnSource({ year: '2026', from: '2009-01-01', to: '2025-12-31' })).toMatchObject({ url: 'https://doi.org/10.5066/F78S4N1V' });
  });
});

describe("fall in USA-NPN's records", () => {
  const fall = (o: Record<string, string | number>) => row({ Phenophase_Description: 'Colored leaves', First_Yes_DOY: 260, NumDays_Since_Prior_No: 7, ...o });
  it("takes each plant-year's first coloring (or falling) series from July on, only where a no came at most two weeks before it", () => {
    expect(FALL_FROM).toBe(182);
    const rows = [
      fall({ First_Yes_DOY: 40, NumDays_Since_Prior_No: -9999 }), // (last fall's leaves still hanging in February: not this fall)
      fall({}), // 260
      fall({ First_Yes_DOY: 300 }), // (a later series that fall)
      fall({ First_Yes_Year: 2021, First_Yes_DOY: 250, NumDays_Since_Prior_No: 40 }), // (a month and more since the last no: unknown, not stood in for)
      fall({ First_Yes_Year: 2021, First_Yes_DOY: 280 }),
      fall({ First_Yes_Year: 2022, First_Yes_DOY: 262, Observed_Status_Conflict_Flag: 'MultiObserver-StatusConflict' }),
      fall({ Individual_ID: 2, State: 'TX', First_Yes_DOY: 270 }),
      fall({ Individual_ID: 3, Phenophase_Description: 'Falling leaves', First_Yes_DOY: 275 }),
      fall({ Individual_ID: 4, genus: 'Taxodium', Species: 'distichum', Phenophase_Description: 'Colored needles', First_Yes_DOY: 300 }),
    ];
    expect(fallDays(rows, TURN_PHASES)).toEqual({ 'cercis canadensis': { AR: [260], TX: [270] }, 'taxodium distichum': { AR: [300] } });
    expect(fallDays(rows, DROP_PHASES)).toEqual({ 'cercis canadensis': { AR: [275] } });
  });
  it("takes each plant-year's last day with leaves, only where a no came at most two weeks after it; an evergreen has none", () => {
    const leaves = (o: Record<string, string | number>) => row({ Phenophase_Description: 'Leaves', First_Yes_DOY: 90, Last_Yes_Year: 2020, Last_Yes_DOY: 310, NumDays_Until_Next_No: 6, ...o });
    expect(bareDays([
      leaves({ Last_Yes_DOY: 200 }), // (an earlier series that year)
      leaves({}), // 310
      leaves({ Last_Yes_Year: 2021, First_Yes_Year: 2021, Last_Yes_DOY: 305, NumDays_Until_Next_No: 30 }), // (a month to the next no: unknown)
      leaves({ Individual_ID: 2, genus: 'Magnolia', Species: 'grandiflora', Last_Yes_DOY: 365, NumDays_Until_Next_No: -9999 }), // (evergreen: leaves to the year's end)
      leaves({ Individual_ID: 3, genus: 'Asclepias', Species: 'tuberosa', Phenophase_Description: 'Leaves (forbs)', Last_Yes_DOY: 290 }),
      leaves({ Individual_ID: 4, Last_Yes_DOY: 150 }), // (gone by June: not a fall)
    ])).toEqual({ 'cercis canadensis': { AR: [310] }, 'asclepias tuberosa': { AR: [290] } });
  });
});

describe('leaf-out in the app', () => {
  const file = { v: 1, state: 'AR', fips: 5, sources: { usanpn: { title: 'USA National Phenology Network. 2026.' } }, counties: { 5019: { name: 'Clark', near: [] } }, plants: {},
    leafOut: { redbud: { med: 87, q1: 75, q3: 94, n: 233, area: 'region' } }, leafOutSpecies: [],
    leafTurn: { redbud: { med: 257, q1: 244, q3: 274, n: 89, area: 'region' } }, leafBare: { redbud: { med: 314, q1: 307, q3: 332, n: 98, area: 'region' }, sumac: { med: 300, q1: 290, q3: 310, n: 12, area: 'state' } },
    leafFallSpecies: ['sumac'] } as unknown as WildFile;
  const fetcher = (async (url: string) => {
    const body = { 'climate/719.json': { v: 1, zips: { 71923: ['8a', 0, 3, 5019] }, stations: [] }, 'wild/1/index.json': { v: 1, states: { 5: 'AR' }, border: {} }, 'wild/1/05.json': file }[url];
    return body ? new Response(JSON.stringify(body)) : new Response('', { status: 404 });
  }) as typeof fetch;
  beforeEach(async () => { resetWild(); state.location = { zip: '71923', zone: '8a' }; await loadWild(undefined, fetcher); });
  it("comes from the garden's state or region; a cultivar takes its species'", () => {
    expect(localLeafOut({ id: 'redbud' })).toMatchObject({ med: 87, n: 233, area: 'region', stateName: 'Arkansas', species: false });
    expect(localLeafOut({ id: 'forest-pansy', parent: 'redbud' })).toMatchObject({ med: 87, species: true });
    expect(localLeafOut({ id: 'other' })).toBeNull();
    expect([dayOfYear(1), dayOfYear(87), dayOfYear(365)]).toEqual(['Jan 1', 'Mar 28', 'Dec 31']);
  });
  it("gives when leaves color, fall and are gone where there are records enough for each; a cultivar takes its species'", () => {
    expect(localLeafFall({ id: 'redbud' })).toEqual({ turn: { med: 257, q1: 244, q3: 274, n: 89, area: 'region' }, bare: { med: 314, q1: 307, q3: 332, n: 98, area: 'region' },
      stateName: 'Arkansas', species: false, source: 'USA National Phenology Network. 2026.' });
    expect(localLeafFall({ id: 'forest-pansy', parent: 'redbud' })).toMatchObject({ turn: { med: 257 }, species: true });
    expect(localLeafFall({ id: 'sumac' })).toMatchObject({ bare: { med: 300 }, species: true });
    expect(localLeafFall({ id: 'sumac' })?.turn).toBeUndefined();
    expect(localLeafFall({ id: 'other' })).toBeNull();
  });
  it('shows in the details as a day and the middle half of the plant-years, with where and the source', () => {
    const box = plantDetails({ id: 'redbud', common: 'Eastern redbud' } as Plant, undefined);
    const r = box.querySelector('[data-testid=leaf-out-row]')!;
    expect(r.querySelector('.details-part')!.textContent).toBe('Around Mar 28 (most Mar 16 to Apr 4)');
    expect(r.querySelector('.details-src')!.textContent).toBe('233 plant-years in Arkansas and neighboring states · USA National Phenology Network. 2026.');
    expect(plantDetails({ id: 'other', common: 'Other' } as Plant, undefined).querySelector('[data-testid=leaf-out-row]')).toBeNull();
  });
});
