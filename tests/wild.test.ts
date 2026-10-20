// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { atlasRecords, gadmCounties, gbifRecords, SOURCES, stateFile, wildIndex } from '../scripts/catalog/wild.mjs';
// @ts-expect-error (a plain .mjs script)
import { canonical, placer, twoTaxa, usdaRecords } from '../scripts/catalog/usda-counties.mjs';
import { countyName, loadWild, shortCountyName, resetWild, wildHere, wildNearby, wildText, type WildFile } from '../src/wild';
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
const atlas = atlasRecords(catalog, audit, maps);
// USDA: a second source. Its own records for the oak add Hot Spring; only its species' for lavendulare
// (which has its own atlas map, so USDA's species-wide counties never reach it); a Texas county.
const usda = {
  'quercus-muehlenbergii': { counties: [5059, 48037], species: false },
  'allium-canadense-var-lavendulare': { counties: [5019], species: true },
  'rosmarinus': { counties: [48067], species: false },
};
const file: WildFile = stateFile({ fips: 5, code: 'AR' }, { arkatlas: atlas, usda }, SOURCES, counties);
const tx: WildFile = stateFile({ fips: 48, code: 'TX' }, { arkatlas: atlas, usda }, SOURCES, counties);
const index = wildIndex([file, tx]);

const zipTable = { v: 1, zips: { 71923: ['8a', 0, 3, 5019], 71998: ['8a', -2, 0] }, stations: [] };
const texTable = { v: 1, zips: { 75501: ['8a', 0, 3, 48037], 75551: ['8a', 0, 9, 48067] }, stations: [] };
let fetched: string[] = [];
const fetcher = (async (url: string) => {
  fetched.push(url);
  const body = { 'climate/719.json': zipTable, 'climate/755.json': texTable, 'wild/1/index.json': index, 'wild/1/05.json': file, 'wild/1/48.json': tx }[url];
  return body ? new Response(JSON.stringify(body)) : new Response('', { status: 404 });
}) as typeof fetch;

beforeEach(() => { resetWild(); fetched = []; state.location = { zip: '71923', zone: '8a' }; });

describe("GBIF's herbarium specimens by county", () => {
  const counties = [{ fips: 5019, name: 'Clark', state: 'AR' }, { fips: 51159, name: 'Richmond', state: 'VA' }, { fips: 51760, name: 'Richmond', state: 'VA' },
    { fips: 51161, name: 'Roanoke', state: 'VA' }, { fips: 51770, name: 'Roanoke', state: 'VA' }, { fips: 51067, name: 'Franklin', state: 'VA' }, { fips: 51620, name: 'Franklin', state: 'VA' },
    { fips: 51019, name: 'Bedford', state: 'VA' }, { fips: 29510, name: 'St. Louis', state: 'MO' }, { fips: 29189, name: 'St. Louis', state: 'MO' }, { fips: 46102, name: 'Oglala Lakota', state: 'SD' }];
  it("match GADM's counties to ours by name: a county and a city apart where GADM has both, its lumped areas neither, renamed counties, not lakes", () => {
    // (GADM's entries as GBIF gives them.)
    expect(gadmCounties([
      { code: 'AR', subs: [{ id: 'USA.4.10_1', name: 'Clark', type: ['County'] }] },
      { code: 'VA', subs: [{ id: 'USA.47.106_1', name: 'Richmond', type: ['Independent City'] }, { id: 'USA.47.107_1', name: 'Roanoke', type: ['County'] },
        { id: 'USA.47.108_1', name: 'Roanoke City', type: ['Independent City'] }, { id: 'USA.47.46_1', name: 'Franklin', type: ['County'] },
        { id: 'USA.47.12_1', name: 'Bedford City', type: ['City'] }, { id: 'USA.47.29_1', name: 'Clifton Forge City', type: ['Independent City'] }] },
      { code: 'MO', subs: [{ id: 'USA.26.95_1', name: 'Saint Louis', type: ['County'] }] },
      { code: 'SD', subs: [{ id: 'USA.42.56_1', name: 'Shannon', type: ['County'] }] },
      { code: 'MI', subs: [{ id: 'USA.23.45_1', name: 'Lake Michigan', type: ['Water body'] }] },
    ], counties)).toEqual({ 'USA.4.10_1': 5019, 'USA.47.107_1': 51161, 'USA.47.108_1': 51770, 'USA.47.46_1': 51067, 'USA.47.12_1': 51019, 'USA.42.56_1': 46102 });
  });
  it('count specimens not marked cultivated, only in or next to a county the curated sources have it in', () => {
    const rows = [
      { specieskey: '1', level2gid: 'A', basisofrecord: 'PRESERVED_SPECIMEN', degree: '', n: '2' },
      { specieskey: '1', level2gid: 'B', basisofrecord: 'HUMAN_OBSERVATION', degree: '', n: '40' }, // (an observation)
      { specieskey: '1', level2gid: 'C', basisofrecord: 'PRESERVED_SPECIMEN', degree: 'cultivated', n: '1' },
      { specieskey: '1', level2gid: 'D', basisofrecord: 'PRESERVED_SPECIMEN', degree: '', n: '1' }, // (far from its records)
      { specieskey: '1', level2gid: 'Z', basisofrecord: 'PRESERVED_SPECIMEN', degree: '', n: '1' }, // (no county of ours)
    ];
    const fips = { A: 5019, B: 5059, C: 5109, D: 5005 } as Record<string, number>;
    const near = new Set([5019, 5059, 5109]);
    const out = gbifRecords(rows, [{ id: 'coneflower', binomial: 'Echinacea purpurea', species: false }], () => 1, (g: string) => fips[g], (_id: string, c: number) => near.has(c));
    expect(out).toEqual({ coneflower: { counties: [5019], species: false } });
  });
});

describe('wild records near the garden', () => {
  it('are each plant\'s own taxon\'s (a cultivar\'s are its species\', said so; a hybrid has none), with the counties over the state line', () => {
    expect(file.plants).toEqual({
      'allium-canadense-var-lavendulare': [5007], // (its own map: not the species' Clark County, from either source)
      'allium-canadense-var-mobilense': [5007, 5019], 'asarum-canadense': [5007, 5109], 'mitella-diphylla': [5007],
      'quercus-muehlenbergii': [5007, 5019, 5059], 'rudbeckia-goldsturm': [5019], 'viola-sororia': [5059, 5091],
    });
    expect(file.src!['quercus-muehlenbergii']).toEqual(['arkatlas', 'usda']);
    expect(file.src!['allium-canadense-var-lavendulare']).toEqual(['arkatlas']);
    expect(file.species).toEqual(['allium-canadense-var-mobilense', 'rudbeckia-goldsturm']);
    expect(file.counties[5019]).toEqual({ name: 'Clark', near: [5059, 5109] });
    expect(file.counties[48037]).toEqual({ name: 'Bowie', state: 'TX', near: [5091] });
    expect(file.counties[48067]).toBeUndefined(); // (doesn't touch Arkansas)
    expect(tx.plants).toEqual({ 'quercus-muehlenbergii': [48037], rosmarinus: [48067] });
    expect(Object.keys(tx.sources)).toEqual(['usda']);
    expect(index).toEqual({ v: 1, states: { 5: 'AR', 48: 'TX' }, border: { 5091: [48], 48037: [5] } });
  });
  it('say where: the garden\'s county, a neighbor, or elsewhere in the state', async () => {
    await loadWild(undefined, fetcher);
    expect(fetched).toEqual(['climate/719.json', 'wild/1/index.json', 'wild/1/05.json']);
    expect(wildText(wildHere({ id: 'quercus-muehlenbergii' })!)).toBe('Recorded growing wild in Clark County');
    expect(wildHere({ id: 'quercus-muehlenbergii' })!.sources).toEqual([SOURCES.arkatlas.title, SOURCES.usda.title]);
    expect(wildHere({ id: 'allium-canadense-var-lavendulare' })!.sources).toEqual([SOURCES.arkatlas.title]);
    expect(wildText(wildHere({ id: 'asarum-canadense' })!)).toBe('Recorded growing wild in a neighboring county (Pike)');
    expect(wildText(wildHere({ id: 'viola-sororia-freckles', parent: 'viola-sororia' })!)).toBe('Its species is recorded growing wild in a neighboring county (Hot Spring)');
    expect(wildText(wildHere({ id: 'mitella-diphylla' })!)).toBe('Recorded growing wild in 1 Arkansas county, none recorded in or next to yours');
    expect(wildHere({ id: 'rosmarinus' })).toBeNull();
    expect(wildText(wildHere({ id: 'rudbeckia-goldsturm' })!)).toBe('Its species is recorded growing wild in Clark County');
    expect(wildHere({ id: 'allium-canadense-var-lavendulare' })!.where).toBe('state');
    expect([wildNearby({ id: 'quercus-muehlenbergii' }), wildNearby({ id: 'mitella-diphylla' })]).toEqual([true, false]);
  });
  it('reach over a state line: a Texas garden next to Arkansas hears about the county next door, and its own state\'s', async () => {
    state.location = { zip: '75501', zone: '8a' };
    await loadWild(undefined, fetcher);
    expect(fetched).toEqual(['climate/755.json', 'wild/1/index.json', 'wild/1/48.json', 'wild/1/05.json']); // (its own state first)
    expect(wildText(wildHere({ id: 'viola-sororia' })!)).toBe('Recorded growing wild in a neighboring county (Miller, AR)');
    expect(wildText(wildHere({ id: 'quercus-muehlenbergii' })!)).toBe('Recorded growing wild in Bowie County');
    expect(wildText(wildHere({ id: 'rosmarinus' })!)).toBe('Recorded growing wild in a neighboring county (Cass)');
    expect(wildHere({ id: 'mitella-diphylla' })).toBeNull(); // (Arkansas's count isn't this garden's state)
    resetWild(); fetched = [];
    state.location = { zip: '75551', zone: '8a' }; // (Cass County: no Arkansas neighbor)
    await loadWild(undefined, fetcher);
    expect(fetched).toEqual(['climate/755.json', 'wild/1/index.json', 'wild/1/48.json']);
    expect(wildHere({ id: 'viola-sororia' })).toBeNull();
    expect(wildText(wildHere({ id: 'rosmarinus' })!)).toBe('Recorded growing wild in Cass County');
  });
  it('name counties as people do', () => {
    expect([countyName('Clark', 5019), countyName('Caddo', 22017), countyName('Salem', 51775), countyName('Juneau', 2110)]).toEqual(['Clark County', 'Caddo Parish', 'Salem (city)', 'Juneau']);
    expect([countyName('Baltimore', 24510), countyName('Baltimore', 24005), countyName('St. Louis', 29510), countyName('Carson City', 32510), countyName('District of Columbia', 11001), countyName('James City', 51095)])
      .toEqual(['Baltimore (city)', 'Baltimore County', 'St. Louis (city)', 'Carson City', 'District of Columbia', 'James City County']);
    expect([shortCountyName('Roanoke', 51161), shortCountyName('Roanoke', 51770)]).toEqual(['Roanoke', 'Roanoke (city)']);
    expect([countyName('Zapata', 48505), shortCountyName('Young', 48503), countyName('St. Croix', 78010)]).toEqual(['Zapata County', 'Young', 'St. Croix']); // (Texas's counties run past 500)
  });
  it('place USDA\'s records by shape: the county a record\'s center is in, or one of its corners\' that has its name', () => {
    const sq = (x0: number, x1: number, y0: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    // Alleghany County with Covington, a city inside it (its own county): a record for Covington is a small square in the hole.
    const shapes = [
      { id: '51005', geometry: { type: 'Polygon', coordinates: [sq(-80.2, -79.6, 37.6, 38.0), sq(-80.0, -79.95, 37.77, 37.82)] } },
      { id: '51580', geometry: { type: 'Polygon', coordinates: [sq(-80.0, -79.95, 37.77, 37.82)] } },
    ];
    const place = placer(shapes, new Map([[51005, 'Alleghany'], [51580, 'Covington']]));
    const rec = (name: string, ring: number[][], Symbol = 'Native') => ({ attributes: { country_subdivision_name: name, Symbol }, geometry: { rings: [ring] } });
    // (Alleghany's record, drawn whole, has its center in Covington: its corners find Alleghany by name.)
    expect(place([rec('Alleghany', sq(-80.2, -79.6, 37.6, 38.0).map(([x, y]) => [x, y]))]).counties).toEqual([51005]);
    expect(place([rec('Covington (city)', sq(-79.99, -79.96, 37.78, 37.81))]).counties).toEqual([51580]);
    expect(place([rec('Nowhere', sq(10, 11, 10, 11))])).toEqual({ counties: [], unplaced: 1 });
  });
  it('take USDA\'s records only under the plant\'s own name, or a reviewed rename of it: never another plant\'s', () => {
    const profiles: Record<string, unknown> = {
      CAAL23: { Id: 1, ScientificName: '<i>Carex peckii</i> Howe' }, // (a misapplied name: another sedge)
      BUDA: { Id: 2, ScientificName: '<i>Bouteloua dactyloides</i> (Nutt.) J.T. Columbus' }, // (buffalograss, renamed)
      QUMU: { Id: 3, ScientificName: '<i>Quercus muehlenbergii</i> Engelm.' },
    };
    const page = (source: string, url: string) => {
      const sym = url.match(/symbol=(\w+)/)?.[1];
      if (source === 'usda' && sym) return { text: JSON.stringify(profiles[sym] ?? null) };
      if (source === 'web') return { text: JSON.stringify({ features: [{ id: url }] }) };
      return null;
    };
    const cat = { plants: [{ id: 'carex-albicans', botanical: 'Carex albicans' }, { id: 'buchloe', botanical: 'Buchloe dactyloides' }, { id: 'oak', botanical: 'Quercus muehlenbergii' }, { id: 'oak-cv', botanical: "Quercus muehlenbergii 'X'" }] };
    const aud = [{ id: 'carex-albicans', sources: { usda: { symbol: 'CAAL23' } } }, { id: 'buchloe', sources: { usda: { symbol: 'BUDA' } } }, { id: 'oak', sources: { usda: { symbol: 'QUMU' } } }, { id: 'oak-cv', sources: { usda: { symbol: 'QUMU' } } }];
    const r = usdaRecords(cat, aud, () => ({ counties: [5019], unplaced: 0 }), page);
    expect(r.records).toEqual({ buchloe: { counties: [5019], species: false }, oak: { counties: [5019], species: false }, 'oak-cv': { counties: [5019], species: true } });
    expect(r.otherName).toBe(1);
    // A rename is checked to its rank; two taxa in one entry get nothing; a list of cultivars is one species.
    expect(canonical('<i>Sambucus nigra</i> L. ssp. <i>canadensis</i> (L.) R. Bolli')).toBe('Sambucus nigra ssp. canadensis');
    expect(canonical('<i>Viburnum opulus</i> L. var. <i>opulus</i>')).toBe('Viburnum opulus var. opulus');
    expect([twoTaxa('Salvia officinalis / Origanum vulgare'), twoTaxa('Prunus laurocerasus / caroliniana'), twoTaxa("Ilex vomitoria 'Nana' / 'Schillings'"), twoTaxa('Echinacea (Cone-fections / Big Sky)')]).toEqual([true, true, false, false]);
  });
  it('are looked up once per ZIP, the county remembered on the device; nothing for a ZIP with no county', async () => {
    await loadWild(undefined, fetcher);
    await loadWild(undefined, fetcher);
    expect(fetched).toEqual(['climate/719.json', 'wild/1/index.json', 'wild/1/05.json']);
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
    const noFile = (async (url: string) => (url === 'wild/1/05.json' ? new Response('', { status: 500 }) : fetcher(url))) as typeof fetch;
    await loadWild(undefined, noFile);
    expect(wildHere({ id: 'quercus-muehlenbergii' })).toBeNull();
    const t = Date.now(); const real = Date.now; Date.now = () => t + 61_000;
    try { await loadWild(undefined, fetcher); } finally { Date.now = real; }
    expect(wildHere({ id: 'quercus-muehlenbergii' })?.where).toBe('county');
  });
});
