// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { wildFile, wildIndex } from '../scripts/catalog/wild.mjs';
import { loadWild, resetWild, wildHere, wildNearby, wildText, type WildFile } from '../src/wild';
import { plantMatches, PLANT_FILTER_DEFAULTS, zoneNote, type Plant } from '../src/plants';
import { state } from '../src/state';

// Where a plant grows wild near the garden: the ZIP's county, and the county records of its state and of
// any state over a county line.

// Clark borders Hot Spring and Pike; Miller (AR) borders Bowie (TX); Benton is far off.
const counties = [
  { fips: 5007, name: 'Benton', state: 'AR', near: [] }, { fips: 5019, name: 'Clark', state: 'AR', near: [5059, 5109] },
  { fips: 5059, name: 'Hot Spring', state: 'AR', near: [5019] }, { fips: 5091, name: 'Miller', state: 'AR', near: [48037] },
  { fips: 5109, name: 'Pike', state: 'AR', near: [5019] }, { fips: 48037, name: 'Bowie', state: 'TX', near: [5091, 48067] },
  { fips: 48067, name: 'Cass', state: 'TX', near: [48037] },
];
const catalog = { plants: [
  { id: 'quercus-muehlenbergii', botanical: 'Quercus muehlenbergii' },
  { id: 'viola-sororia', botanical: 'Viola sororia' },
  { id: 'viola-sororia-freckles', botanical: "Viola sororia 'Freckles'", parent: 'viola-sororia' },
  { id: 'mitella-diphylla', botanical: 'Mitella diphylla' },
  { id: 'asarum-canadense', botanical: 'Asarum canadense' },
  { id: 'rosmarinus', botanical: 'Salvia rosmarinus' },
] };
const audit = [{ id: 'asarum-canadense', species: 'Asarum canadense', raw: { arkatlas: { name: 'Asarum canadense L.' } } }];
const maps = { 'Quercus muehlenbergii': [5019, 5007], 'Viola sororia': [5059, 5091], 'Mitella diphylla': [5007], 'Asarum canadense': [5109, 5007] };
const file: WildFile = wildFile(catalog, audit, maps, counties, { title: 'Arkansas atlas' });
const index = wildIndex([file]);

const zipTable = { v: 1, zips: { 71923: ['8a', 0, 3, 5019], 71998: ['8a', -2, 0] }, stations: [] };
const texTable = { v: 1, zips: { 75501: ['8a', 0, 3, 48037], 75551: ['8a', 0, 9, 48067] }, stations: [] };
let fetched: string[] = [];
const fetcher = (async (url: string) => {
  fetched.push(url);
  const body = { 'climate/719.json': zipTable, 'climate/755.json': texTable, 'wild/index.json': index, 'wild/05.json': file }[url];
  return body ? new Response(JSON.stringify(body)) : new Response('', { status: 404 });
}) as typeof fetch;

beforeEach(() => { resetWild(); fetched = []; state.location = { zip: '71923', zone: '8a' }; });

describe('wild records near the garden', () => {
  it('are built per species from the atlas maps (a cultivar takes its species\'), with the counties over the state line', () => {
    expect(file.plants).toEqual({ 'asarum-canadense': [5109, 5007], 'mitella-diphylla': [5007], 'quercus-muehlenbergii': [5019, 5007], 'viola-sororia': [5059, 5091] });
    expect(file.counties[5019]).toEqual({ name: 'Clark', near: [5059, 5109] });
    expect(file.counties[48037]).toEqual({ name: 'Bowie', state: 'TX', near: [5091] });
    expect(file.counties[48067]).toBeUndefined(); // (doesn't touch Arkansas)
    expect(index).toEqual({ v: 1, states: { 5: 'AR' }, border: { 48037: [5] } });
  });
  it('say where: the garden\'s county, a neighbor, or elsewhere in the state', async () => {
    await loadWild(undefined, fetcher);
    expect(fetched).toEqual(['climate/719.json', 'wild/index.json', 'wild/05.json']);
    expect(wildText(wildHere({ id: 'quercus-muehlenbergii' })!)).toBe('Recorded growing wild in Clark County');
    expect(wildText(wildHere({ id: 'asarum-canadense' })!)).toBe('Recorded growing wild in a neighboring county (Pike)');
    expect(wildText(wildHere({ id: 'viola-sororia-freckles', parent: 'viola-sororia' })!)).toBe('Its species is recorded growing wild in a neighboring county (Hot Spring)');
    expect(wildText(wildHere({ id: 'mitella-diphylla' })!)).toBe('Recorded growing wild in 1 Arkansas county, none near you');
    expect(wildHere({ id: 'rosmarinus' })).toBeNull();
    expect([wildNearby({ id: 'quercus-muehlenbergii' }), wildNearby({ id: 'mitella-diphylla' })]).toEqual([true, false]);
  });
  it('reach over a state line: a Texas garden next to Arkansas hears about the county next door, and nothing else', async () => {
    state.location = { zip: '75501', zone: '8a' };
    await loadWild(undefined, fetcher);
    expect(fetched).toEqual(['climate/755.json', 'wild/index.json', 'wild/05.json']);
    expect(wildText(wildHere({ id: 'viola-sororia' })!)).toBe('Recorded growing wild in a neighboring county (Miller, AR)');
    expect(wildHere({ id: 'mitella-diphylla' })).toBeNull(); // (Arkansas's count isn't this garden's state)
    resetWild(); fetched = [];
    state.location = { zip: '75551', zone: '8a' }; // (Cass County: no Arkansas neighbor)
    await loadWild(undefined, fetcher);
    expect(fetched).toEqual(['climate/755.json', 'wild/index.json']);
    expect(wildHere({ id: 'viola-sororia' })).toBeNull();
  });
  it('are looked up once per ZIP, the county remembered on the device; nothing for a ZIP with no county', async () => {
    await loadWild(undefined, fetcher);
    await loadWild(undefined, fetcher);
    expect(fetched).toEqual(['climate/719.json', 'wild/index.json', 'wild/05.json']);
    resetWild(); fetched = [];
    state.location = { zip: '71998', zone: '8a' };
    await loadWild(undefined, fetcher);
    expect(fetched).toEqual(['climate/719.json']);
    expect(wildHere({ id: 'quercus-muehlenbergii' })).toBeNull();
    state.location = null;
    await loadWild(undefined, fetcher);
    expect(wildHere({ id: 'quercus-muehlenbergii' })).toBeNull();
  });
  it('let a plant recorded wild nearby pass "Hardy here" whatever its rated zones, and say so', async () => {
    await loadWild(undefined, fetcher);
    const oak = { id: 'quercus-muehlenbergii', common: 'Chinquapin oak', zone_min: 3, zone_max: 7.5 } as Plant;
    const mitella = { id: 'mitella-diphylla', common: "Bishop's cap", zone_min: 3, zone_max: 7.5 } as Plant;
    const f = { ...PLANT_FILTER_DEFAULTS, hardyHere: true };
    expect([plantMatches(oak, f), plantMatches(mitella, f)]).toEqual([true, false]);
    expect(zoneNote(oak)).toBe(' (zone 8a may be too warm, though it grows wild nearby)');
    expect(zoneNote(mitella)).toBe(' (zone 8a may be too warm)');
  });
});
