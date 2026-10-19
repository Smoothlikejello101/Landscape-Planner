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
  { id: 'allium-canadense-var-lavendulare', botanical: 'Allium canadense var. lavendulare' },
  { id: 'allium-canadense-var-mobilense', botanical: 'Allium canadense var. mobilense' },
  { id: 'rudbeckia-goldsturm', botanical: "Rudbeckia fulgida 'Goldsturm'" },
  { id: 'morus-x', botanical: 'Morus alba x rubra' },
] };
const audit = [{ id: 'asarum-canadense', species: 'Asarum canadense', raw: { arkatlas: { name: 'Asarum canadense L.' } } }];
const maps = {
  'Quercus muehlenbergii': [5019, 5007], 'Viola sororia': [5059, 5091], 'Mitella diphylla': [5007], 'Asarum canadense': [5109, 5007],
  'Allium canadense': [5007, 5019], 'Allium canadense var. lavendulare': [5007], 'Rudbeckia fulgida': [5019], 'Morus alba': [5019], 'Morus rubra': [5019],
};
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
  it('are each plant\'s own taxon\'s (a cultivar\'s are its species\', said so; a hybrid has none), with the counties over the state line', () => {
    expect(file.plants).toEqual({
      'allium-canadense-var-lavendulare': [5007], // (its own map: not the species' Clark County)
      'allium-canadense-var-mobilense': [5007, 5019], 'asarum-canadense': [5109, 5007], 'mitella-diphylla': [5007],
      'quercus-muehlenbergii': [5019, 5007], 'rudbeckia-goldsturm': [5019], 'viola-sororia': [5059, 5091],
    });
    expect(file.species).toEqual(['allium-canadense-var-mobilense', 'rudbeckia-goldsturm']);
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
    expect(wildText(wildHere({ id: 'mitella-diphylla' })!)).toBe('Recorded growing wild in 1 Arkansas county, none recorded in or next to yours');
    expect(wildHere({ id: 'rosmarinus' })).toBeNull();
    expect(wildText(wildHere({ id: 'rudbeckia-goldsturm' })!)).toBe('Its species is recorded growing wild in Clark County');
    expect(wildHere({ id: 'allium-canadense-var-lavendulare' })!.where).toBe('state');
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
  it('let a plant rated for cooler zones but recorded wild nearby pass "Hardy here", and say so; never one rated for warmer zones', async () => {
    await loadWild(undefined, fetcher);
    const oak = { id: 'quercus-muehlenbergii', common: 'Chinquapin oak', zone_min: 3, zone_max: 7.5 } as Plant;
    const mitella = { id: 'mitella-diphylla', common: "Bishop's cap", zone_min: 3, zone_max: 7.5 } as Plant;
    const castor = { id: 'quercus-muehlenbergii', common: 'A tender plant recorded here', zone_min: 9, zone_max: 11 } as Plant;
    const goldsturm = { id: 'rudbeckia-goldsturm', common: 'Goldsturm', zone_min: 3, zone_max: 7.5 } as Plant;
    const f = { ...PLANT_FILTER_DEFAULTS, hardyHere: true };
    expect([plantMatches(oak, f), plantMatches(mitella, f), plantMatches(castor, f), plantMatches(goldsturm, f)]).toEqual([true, false, false, true]);
    expect(zoneNote(oak)).toBe(' (zone 8a may be too warm, though it\'s recorded wild nearby)');
    expect(zoneNote(goldsturm)).toBe(' (zone 8a may be too warm, though its species is recorded wild nearby)');
    expect(zoneNote(mitella)).toBe(' (zone 8a may be too warm)');
    expect(zoneNote(castor)).toBe(' (zone 8a winters are too cold)'); // (an escaped annual's record says nothing of winters)
  });
  it('tell every caller when a lookup under way finishes, retry one that came back empty, and remember a few ZIPs', async () => {
    const calls: string[] = [];
    const first = loadWild(() => calls.push('a'), fetcher);
    const second = loadWild(() => calls.push('b'), fetcher);
    await Promise.all([first, second]);
    expect(calls).toEqual(['a', 'b']);
    // Offline: nothing found, and not asked again straight away; online a minute later, found.
    resetWild();
    state.location = { zip: '75501', zone: '8a' };
    const offline = (async () => { throw new TypeError('offline'); }) as typeof fetch;
    await loadWild(undefined, offline);
    fetched = [];
    await loadWild(undefined, fetcher);
    expect(fetched).toEqual([]);
    const now = Date.now();
    const realNow = Date.now; Date.now = () => now + 61_000;
    try { await loadWild(undefined, fetcher); } finally { Date.now = realNow; }
    expect(wildHere({ id: 'viola-sororia' })?.where).toBe('near');
    // Two ZIPs remembered on the device: back to the first, offline, it still knows its county.
    state.location = { zip: '71923', zone: '8a' };
    await loadWild(undefined, fetcher);
    expect(JSON.parse(localStorage.getItem('lp-zip-county')!)).toEqual([['75501', 48037], ['71923', 5019]]); // (the latest last)
    // A caller asking twice while a lookup is under way is told once.
    resetWild(); calls.length = 0;
    const once = () => calls.push('once');
    await Promise.all([loadWild(once, fetcher), loadWild(once, fetcher)]);
    expect(calls).toEqual(['once']);
    // The index in, the state's file not: tried again later, not left empty.
    resetWild(); fetched = [];
    const noFile = (async (url: string) => (url === 'wild/05.json' ? new Response('', { status: 500 }) : fetcher(url))) as typeof fetch;
    await loadWild(undefined, noFile);
    expect(wildHere({ id: 'quercus-muehlenbergii' })).toBeNull();
    const t = Date.now(); const real = Date.now; Date.now = () => t + 61_000;
    try { await loadWild(undefined, fetcher); } finally { Date.now = real; }
    expect(wildHere({ id: 'quercus-muehlenbergii' })?.where).toBe('county');
  });
});
