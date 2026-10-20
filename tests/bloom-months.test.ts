// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { agreesWithSeasons, bloomCounts, bloomDisagreements, bloomSpecies, bloomWindow, MIN_RECORDS, stateBloom } from '../scripts/catalog/bloom.mjs';
// @ts-expect-error (a plain .mjs script)
import { matchedTaxon, matchUrl, monthsUrl, statesUrl } from '../scripts/catalog/gbif.mjs';
import { loadWild, localBloom, resetWild, type WildFile } from '../src/wild';
import { bloomMonths } from '../src/bloom';
import { plantMatches, plantMetaLine, PLANT_FILTER_DEFAULTS, type Plant } from '../src/plants';
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
  });
});

describe('flowering records by state', () => {
  const match = { 'Echinacea purpurea': { matchType: 'EXACT', rank: 'SPECIES', status: 'ACCEPTED', usageKey: 1, species: 'Echinacea purpurea' },
    'Aster novae-angliae': { matchType: 'EXACT', rank: 'SPECIES', status: 'SYNONYM', usageKey: 9, acceptedUsageKey: 2, species: 'Symphyotrichum novae-angliae', canonicalName: 'Aster novae-angliae' },
    'Fooa bar': { matchType: 'FUZZY', rank: 'SPECIES', status: 'ACCEPTED', usageKey: 3 } } as Record<string, unknown>;
  const pages = new Map<string, unknown>();
  for (const [n, m] of Object.entries(match)) pages.set(matchUrl(n), m);
  pages.set(monthsUrl(1), { facets: [{ counts: [{ name: '6', count: 40 }, { name: '7', count: 10 }] }] });
  pages.set(statesUrl(1, 6), { facets: [{ counts: [{ name: 'USA.4_1', count: 35 }, { name: 'USA.26_1', count: 5 }] }] });
  pages.set(statesUrl(1, 7), { facets: [{ counts: [{ name: 'USA.4_1', count: 10 }] }] });
  pages.set(monthsUrl(2), { facets: [{ counts: [{ name: '9', count: 12 }] }] }); // (its September by state not fetched yet)
  const fips = { 'USA.4_1': 5, 'USA.26_1': 29 } as Record<string, number>;
  const species = [{ id: 'echinacea-purpurea', binomial: 'Echinacea purpurea', species: false }, { id: 'aster', binomial: 'Aster novae-angliae', species: false }, { id: 'foo', binomial: 'Fooa bar', species: false }];
  const counts = bloomCounts(species, (u: string) => pages.get(u) ?? null, (g: string) => fips[g]);
  it('take an exact match, or a plain synonym\'s accepted name; never a fuzzy guess; and wait for every month', () => {
    expect(matchedTaxon(match['Aster novae-angliae'])).toEqual({ key: 2, name: 'Symphyotrichum novae-angliae', synonym: 'Aster novae-angliae' });
    expect(matchedTaxon(match['Fooa bar'])).toBeNull();
    expect(Object.keys(counts)).toEqual(['echinacea-purpurea']);
    expect(counts['echinacea-purpurea'].states).toEqual({ 5: months({ 6: 35, 7: 10 }), 29: months({ 6: 5 }) });
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
  const file = { v: 1, state: 'AR', fips: 5, sources: { gbif: { title: 'GBIF.org flowering records' } }, counties: { 5019: { name: 'Clark', near: [] } }, plants: {},
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
  it('drive "Blooming in…", a Dec–Feb bloom included in January', () => {
    const witch = { id: 'witch', common: 'Witch hazel' } as Plant;
    expect(plantMatches(witch, { ...PLANT_FILTER_DEFAULTS, bloomMonth: '1' })).toBe(true);
    expect(plantMatches(witch, { ...PLANT_FILTER_DEFAULTS, bloomMonth: '6' })).toBe(false);
  });
});
