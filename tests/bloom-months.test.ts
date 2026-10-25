// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { agreesWithSeasons, bloomCounts, bloomDisagreements, bloomSpecies, bloomWindow, MIN_RECORDS, seasonsToCheck, stateBloom } from '../scripts/catalog/bloom.mjs';
// @ts-expect-error (a plain .mjs script)
import { DOWNLOADS, matchedTaxon, matchUrl, phases, tsvRows } from '../scripts/catalog/gbif.mjs';
import { loadWild, localBloom, resetWild, type WildFile } from '../src/wild';
import { bloomMonths } from '../src/bloom';
import { plantMatches, plantMetaLine, PLANT_FILTER_DEFAULTS, type Plant } from '../src/plants';
import { plantDetails } from '../src/ui/plant-details';
import { state } from '../src/state';

// Bloom months by state, from GBIF's flowering records (docs/bloom-months.md).

const months = (o: Record<number, number>) => Array.from({ length: 12 }, (_, i) => o[i + 1] ?? 0);

describe('a bloom window', () => {
  it('is the shortest run of months holding 80% of the records, wrapping past December, with its peak', () => {
    // Purple coneflower in Arkansas: 334 records, nearly all June to August.
    expect(bloomWindow(months({ 4: 1, 5: 14, 6: 84, 7: 38, 8: 108, 9: 7 }))).toEqual({ start: 6, end: 8, peak: 8, n: 252 });
    // Witch hazel: December to February.
    expect(bloomWindow(months({ 12: 30, 1: 20, 2: 15, 3: 2, 10: 1, 11: 5 }))).toMatchObject({ start: 12, end: 2, peak: 12 });
    expect(bloomWindow(months({}))).toBeNull();
  });
  it('is checked against NC State\'s seasons: no shared month, no window', () => {
    expect(agreesWithSeasons({ start: 6, end: 8 }, ['summer'])).toBe(true);
    expect(agreesWithSeasons({ start: 12, end: 2 }, ['winter', 'spring'])).toBe(true);
    expect(agreesWithSeasons({ start: 6, end: 8 }, ['spring'])).toBe(false);
    expect(agreesWithSeasons({ start: 6, end: 8 }, undefined)).toBe(true);
    expect(agreesWithSeasons({ start: 4, end: 5 }, ['mid spring'])).toBe(true); // (USDA's finer seasons: the season's months)
    expect(agreesWithSeasons({ start: 7, end: 8 }, ['late spring'])).toBe(false);
    expect(seasonsToCheck([{ id: 'a', facts: { bloom_season: { v: ['spring'], src: ['ncsu', 'x.com'] } } },
      { id: 'b', facts: { bloom_season: { v: ['spring'], src: ['somenursery.com'] } } }, { id: 'c', facts: {} },
      { id: 'allium-tricoccum', facts: { bloom_season: { v: ['spring'], src: ['ncsu'] } } }])).toEqual({ a: ['spring'] }); // (ramps: reviewed, the records trusted)
  });
});

describe('flowering records by state', () => {
  const match = { 'Echinacea purpurea': { matchType: 'EXACT', rank: 'SPECIES', status: 'ACCEPTED', usageKey: 1, species: 'Echinacea purpurea' },
    'Aster novae-angliae': { matchType: 'EXACT', rank: 'SPECIES', status: 'SYNONYM', usageKey: 9, acceptedUsageKey: 2, speciesKey: 2, species: 'Symphyotrichum novae-angliae', canonicalName: 'Aster novae-angliae' },
    // (A synonym of a subspecies: its species' records would be another plant's too.)
    'Hibiscus lasiocarpos': { matchType: 'EXACT', rank: 'SPECIES', status: 'SYNONYM', usageKey: 6377193, acceptedUsageKey: 6377098, speciesKey: 3152596, species: 'Hibiscus moscheutos' },
    'Fooa bar': { matchType: 'FUZZY', rank: 'SPECIES', status: 'ACCEPTED', usageKey: 3 } } as Record<string, unknown>;
  const pages = new Map<string, unknown>();
  for (const [n, m] of Object.entries(match)) pages.set(matchUrl(n), m);
  // The bloom download's rows: species key, state, month, the note as published, records.
  const rows = tsvRows(['specieskey\tlevel1gid\tmonth\treproductivecondition\tn',
    '1\tUSA.4_1\t6\tFlowers\t30', '1\tUSA.4_1\t6\tfl-fr\t5', '1\tUSA.26_1\t6\tFlowers|Flower Buds\t5', '1\tUSA.4_1\t7\tflr & frt\t10',
    '1\tUSA.4_1\t8\tNo Flowers or Fruits\t50', '1\tUSA.4_1\t9\tFruits or Seeds\t40', '1\tUSA.4_1\t\tflowers\t9', '1\t\t5\tflowering\t3',
    '2\tUSA.4_1\t9\tflowering or fruiting\t12', '3\tUSA.4_1\t9\tflowering\t12'].join('\n'));
  it('count observations and herbarium specimens, not a botanic garden\'s plants or ones marked cultivated', () => {
    const kinds = tsvRows(['specieskey\tlevel1gid\tmonth\treproductivecondition\tbasisofrecord\tdegree\tn',
      '1\tUSA.4_1\t6\tFlowers\tHUMAN_OBSERVATION\t\t30', '1\tUSA.4_1\t6\tfl\tPRESERVED_SPECIMEN\t\t5', '1\tUSA.4_1\t6\tfl\tLIVING_SPECIMEN\t\t50',
      '1\tUSA.4_1\t7\tFlowers\tHUMAN_OBSERVATION\tcultivated\t50'].join('\n'));
    expect(bloomCounts(species, read, (g: string) => fips[g], kinds)['echinacea-purpurea'].states[5]).toEqual(months({ 6: 35 }));
  });
  const fips = { 'USA.4_1': 5, 'USA.26_1': 29 } as Record<string, number>;
  const species = [{ id: 'echinacea-purpurea', binomial: 'Echinacea purpurea', species: false }, { id: 'aster', binomial: 'Aster novae-angliae', species: false }, { id: 'foo', binomial: 'Fooa bar', species: false }];
  const read = (u: string) => pages.get(u) ?? null;
  const counts = bloomCounts(species, read, (g: string) => fips[g], rows);
  it('take an exact match, or a plain synonym\'s accepted name; never a fuzzy guess', () => {
    expect(matchedTaxon(match['Aster novae-angliae'])).toEqual({ key: 2, name: 'Symphyotrichum novae-angliae', synonym: 'Aster novae-angliae' });
    expect(matchedTaxon(match['Fooa bar'])).toBeNull();
    expect(matchedTaxon(match['Hibiscus lasiocarpos'])).toBeNull();
    expect(Object.keys(counts)).toEqual(['echinacea-purpurea']); // (the aster's one row says flowers or fruit: neither)
  });
  it('count records whose note says flowers, by state and month; no month, nowhere; no state, only in the US total', () => {
    expect(counts['echinacea-purpurea'].states).toEqual({ 5: months({ 6: 35, 7: 10 }), 29: months({ 6: 5 }) });
    expect(counts['echinacea-purpurea'].total).toEqual(months({ 5: 3, 6: 40, 7: 10 }));
    expect(bloomCounts(species, read, (g: string) => fips[g], rows, 'fruit')['echinacea-purpurea'].states[5]).toEqual(months({ 6: 5, 7: 10, 9: 40 }));
  });
  it('read a note as its publisher wrote it: iNaturalist\'s annotations, herbaria\'s codes; unsure or neither says nothing', () => {
    expect(phases('Flowers|Fruits or Seeds|Flower Buds')).toEqual({ flower: true, fruit: true, bud: true });
    expect(phases('fl-fr')).toEqual({ flower: true, fruit: true });
    expect(phases('Phenology: flowering and fruiting.')).toEqual({ flower: true, fruit: true });
    expect(phases('reproductive/flowering')).toEqual({ flower: true });
    expect(phases('Flower Buds')).toEqual({ bud: true });
    for (const none of ['No Flowers or Fruits', 'notdetermined', 'fertile', 'vegetative', 'sterile', 'post-flowering', 'flowering or fruiting', 'flowering and/or fruiting', ''])
      expect(phases(none)).toEqual({});
  });
  it("ask GBIF for counts only, by its backbone's species keys, with the licences that allow commercial use", () => {
    for (const sql of [DOWNLOADS.bloom([2, 1]), DOWNLOADS.counties([2, 1])]) {
      expect(sql).toMatch(/^SELECT .*COUNT\(\*\)/);
      expect(sql).toContain("occurrence.gbif_classification.specieskey IN ('2', '1')");
      expect(sql).toContain("license IN ('CC0_1_0', 'CC_BY_4_0')");
      expect(sql).toContain("countrycode = 'US'");
    }
  });
  it('give a state its own window with enough records, else its region\'s, else none; and leave out a plant NC State disagrees with', () => {
    expect(MIN_RECORDS).toBe(30);
    expect(stateBloom(5, counts, {})['echinacea-purpurea']).toEqual({ start: 6, end: 7, peak: 6, n: 45, area: 'state' });
    expect(stateBloom(29, counts, { 29: [5] })['echinacea-purpurea']).toMatchObject({ n: 50, area: 'region' });
    expect(stateBloom(29, counts, {})['echinacea-purpurea']).toBeUndefined();
    expect(stateBloom(5, counts, {}, { 'echinacea-purpurea': ['fall'] })).toEqual({});
    expect(bloomDisagreements(counts, { 'echinacea-purpurea': ['fall'] })).toHaveLength(1);
  });
  it('are looked up for species and varieties, not hybrids or two taxa in one entry (a cultivar with no species record: its species\', said so)', () => {
    const cat = { plants: [{ id: 'a', botanical: 'Echinacea purpurea' }, { id: 'b', botanical: "Echinacea purpurea 'Magnus'", parent: 'a' }, { id: 'c', botanical: "Rudbeckia fulgida 'Goldsturm'" }, { id: 'd', botanical: 'Salvia officinalis / Origanum vulgare' }, { id: 'e', botanical: 'Abelia × grandiflora' }] };
    expect(bloomSpecies(cat, [])).toEqual([{ id: 'a', binomial: 'Echinacea purpurea', species: false }, { id: 'c', binomial: 'Rudbeckia fulgida', species: true }]);
  });
});

describe('bloom months in the app', () => {
  const file = { v: 1, state: 'AR', fips: 5, sources: { gbifBloom: { title: 'GBIF.org flowering records' } }, counties: { 5019: { name: 'Clark', near: [] } }, plants: {},
    bloom: { coneflower: { start: 6, end: 8, peak: 8, n: 252, area: 'state' }, witch: { start: 12, end: 2, peak: 12, n: 73, area: 'state' } }, bloomSpecies: [] } as unknown as WildFile;
  const fetcher = (async (url: string) => {
    const body = { 'climate/719.json': { v: 1, zips: { 71923: ['8a', 0, 3, 5019] }, stations: [] }, 'wild/1/index.json': { v: 1, states: { 5: 'AR' }, border: {} }, 'wild/1/05.json': file }[url];
    return body ? new Response(JSON.stringify(body)) : new Response('', { status: 404 });
  }) as typeof fetch;
  beforeEach(async () => { resetWild(); state.location = { zip: '71923', zone: '8a' }; await loadWild(undefined, fetcher); });
  it('come from the garden\'s state where there are records, else the catalog\'s', () => {
    const cone = { id: 'coneflower', common: 'Purple coneflower', bloom: { start: 5, end: 7 } } as Plant;
    expect(localBloom(cone)).toMatchObject({ start: 6, end: 8, n: 252, stateName: 'Arkansas', species: false });
    expect(bloomMonths(cone)).toEqual([6, 7, 8]);
    expect(plantMetaLine(cone)).toContain('blooms Jun-Aug');
    const cultivar = { id: 'magnus', parent: 'coneflower', common: 'Magnus' } as Plant;
    expect(localBloom(cultivar)).toMatchObject({ start: 6, species: true });
    const other = { id: 'other', common: 'Other', bloom: { start: 4, end: 5 } } as Plant;
    expect(bloomMonths(other)).toEqual([4, 5]);
  });
  it('lead the details\' Bloom row, its season next, each with its source; the earlier list\'s months aren\'t shown then', () => {
    const cone = { id: 'coneflower', common: 'Purple coneflower', bloom: { start: 5, end: 7, color: 'Purple' }, bloom_season: ['summer'], flower_color: ['purple'],
      prov: { bloom: { src: ['compendium'] }, bloom_season: { src: ['ncsu'], check: 'single' }, flower_color: { src: ['ncsu'], check: 'single' } } } as unknown as Plant;
    const box = plantDetails(cone, undefined);
    const row = box.querySelector('[data-testid=bloom-row]')!;
    expect([...row.querySelectorAll('.details-part')].map((x) => x.textContent)).toEqual(['Jun–Aug, peak Aug', 'Summer']);
    expect(row.textContent).toContain('252 flowering records in Arkansas · GBIF.org flowering records');
    expect(row.querySelector('[data-testid=bloom-months]')).toBeNull();
    expect(box.querySelector('[data-testid=flower-color]')!.firstChild!.textContent).toBe('Purple');
  });
  it('drive "Blooming in…", a Dec–Feb bloom included in January', () => {
    const witch = { id: 'witch', common: 'Witch hazel' } as Plant;
    expect(plantMatches(witch, { ...PLANT_FILTER_DEFAULTS, bloomMonth: '1' })).toBe(true);
    expect(plantMatches(witch, { ...PLANT_FILTER_DEFAULTS, bloomMonth: '6' })).toBe(false);
  });
});

describe("GBIF's names for catalog plants", () => {
  it('asks GBIF by its own name where it differs, the catalog name otherwise', () => {
    expect(matchUrl('Andropogon gerardii')).toContain('name=Andropogon%20gerardi&');
    expect(matchUrl('Anemone patens')).toContain('name=Pulsatilla%20patens&');
    expect(matchUrl('Echinacea purpurea')).toContain('name=Echinacea%20purpurea&');
  });
});
