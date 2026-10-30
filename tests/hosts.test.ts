// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { stateHosts } from '../scripts/catalog/wild.mjs';
// @ts-expect-error (a plain .mjs script)
import { writeAudit } from '../scripts/catalog/write.mjs';
import { catalogErrors, resolveCatalog, type CatalogFile } from '../src/catalog';
import { hostsHere, loadWild, resetWild, type WildFile } from '../src/wild';
import { hostPlant, plantMatches, PLANT_FILTER_DEFAULTS, type Plant } from '../src/plants';
import { butterflyCaps, hostMatchText, matchPlant, readQuery } from '../src/search';
import { plantDetails } from '../src/ui/plant-details';
import { state } from '../src/state';

// Caterpillar hosts: the ones a source names (`hosts`), and how many native caterpillars a plant's genus feeds, in
// North America (`host_genus`) and in the garden's state (its state file), from Shropshire & Tallamy.

describe('caterpillars by state, from the genus index', () => {
  const genera = {
    Asclepias: { species: 25, states: { AR: 12, MN: 9 }, butterflies: [['Monarch (Danaus plexippus)', ['AR', 'MN']], ['Queen (Danaus gilippus)', ['TX']]] },
    Heuchera: { species: 7, states: { MN: 2 }, butterflies: [] },
    Quercus: { species: 963, states: { AR: 424 }, butterflies: [] },
  };
  it('keeps the catalog\'s genera that some live in, with the butterflies of that state', () => {
    expect(stateHosts('AR', genera, new Set(['Asclepias', 'Heuchera']))).toEqual({ Asclepias: { n: 12, butterflies: ['Monarch (Danaus plexippus)'] } });
    expect(stateHosts('TX', genera, new Set(['Asclepias']))).toEqual({});
  });
});

describe('writing hosts', () => {
  const file: CatalogFile = { meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { compendium: { title: 'old', trust: 'unverified' } }, enums: { form: ['Shrub'] } },
    plants: [{ id: 'spicebush', common: 'Spicebush', src: ['compendium'], audited: null, facts: { form: 'Shrub', host: 'Spicebush swallowtail' } }] };
  const audit = [{ id: 'spicebush', claims: [{ src: 'ncsu', kind: 'authority' }, { src: 'tallamy', kind: 'authority' }], facts: {
    host: { v: ['Palamedes Swallowtail (Papilio palamedes)', 'Spicebush Swallowtail (Papilio troilus)', 'Spicebush Swallowtail'], src: ['ncsu'], check: 'single' },
    host_genus: { v: { genus: 'Lindera', species: 12 }, src: ['tallamy'], check: 'single' },
  } }];
  const { file: out } = writeAudit(file, audit, '2026-10-25');
  it('writes the names its sources give, a bare name its binomial already gives once, and its genus\'s count', () => {
    const f = out.plants[0].facts;
    expect(f.hosts).toEqual({ v: ['Palamedes Swallowtail (Papilio palamedes)', 'Spicebush Swallowtail (Papilio troilus)'], src: ['ncsu'], check: 'single' });
    expect(f.host_genus).toEqual({ v: { genus: 'Lindera', species: 12 }, src: ['tallamy'], check: 'single' });
    expect(f.host).toBe('Spicebush swallowtail'); // (the earlier list's sentence, as it was)
    expect(catalogErrors(out)).toEqual([]);
  });
  it('a cultivar takes its species\' hosts and genus', () => {
    const [, c] = resolveCatalog({ meta: out.meta, plants: [out.plants[0], { id: 'cv', common: "Spicebush 'X'", parent: 'spicebush', src: ['ncsu'], audited: '2026-10-25', facts: {} }] });
    expect(c).toMatchObject({ hosts: ['Palamedes Swallowtail (Papilio palamedes)', 'Spicebush Swallowtail (Papilio troilus)'], host_genus: { genus: 'Lindera', species: 12 }, prov: { hosts: { inherited: true } } });
  });
});

describe('hosts where the garden is', () => {
  const wild = { v: 1, state: 'AR', fips: 5, sources: { tallamy: { title: 'Shropshire & Tallamy 2025' } }, counties: { 5019: { name: 'Clark', near: [] } }, plants: {},
    native: { milkweed: 'N', privet: 'I' }, hosts: { Asclepias: { n: 12, butterflies: ['Gray Hairstreak (Strymon melinus)', 'Monarch (Danaus plexippus)'] }, Ligustrum: { n: 29 } } } as unknown as WildFile;
  const fetcher = (async (url: string) => {
    const body = { 'climate/719.json': { v: 1, zips: { 71923: ['8a', 0, 3, 5019] }, stations: [] }, 'wild/1/index.json': { v: 1, states: { 5: 'AR' }, border: {} }, 'wild/1/05.json': wild }[url];
    return body ? new Response(JSON.stringify(body)) : new Response('', { status: 404 });
  }) as typeof fetch;
  const milkweed = { id: 'milkweed', common: 'Butterfly milkweed', botanical: 'Asclepias tuberosa', host_genus: { genus: 'Asclepias', species: 25 }, native_na: true } as Plant;
  // (Native to Texas and Mexico, not Arkansas: still the continent's, so a host for Arkansas's milkweed caterpillars.)
  const antelope = { id: 'antelope', common: 'Antelope horns', botanical: 'Asclepias asperula', host_genus: { genus: 'Asclepias', species: 25 }, native_na: true } as Plant;
  const tropical = { id: 'tropical', common: 'Tropical milkweed', botanical: 'Asclepias curassavica', host_genus: { genus: 'Asclepias', species: 25 } } as Plant;
  const privet = { id: 'privet', common: 'Chinese privet', botanical: 'Ligustrum sinense', host_genus: { genus: 'Ligustrum', species: 47 } } as Plant;
  const spicebush = { id: 'spicebush', common: 'Spicebush', hosts: ['Spicebush Swallowtail (Papilio troilus)'], prov: { hosts: { src: ['ncsu'], check: 'single' } } } as unknown as Plant;
  const old = { id: 'old', common: 'Old-list plant', host: 'Several moth spp.' } as Plant;
  beforeEach(async () => { resetWild(); state.location = { zip: '71923', zone: '8a' }; await loadWild(undefined, fetcher); });
  it('reads the state\'s count for the genus, and its butterflies', () => {
    expect(hostsHere(milkweed)).toEqual({ genus: 'Asclepias', n: 12, butterflies: ['Gray Hairstreak (Strymon melinus)', 'Monarch (Danaus plexippus)'], stateName: 'Arkansas', source: 'Shropshire & Tallamy 2025' });
    expect(hostsHere({})).toBeNull();
  });
  it('counts a plant as a host where a source names its caterpillars, or it\'s native to North America in a genus they use here', () => {
    expect([hostPlant(spicebush), hostPlant(milkweed), hostPlant(privet), hostPlant(old)]).toEqual(['named', 'genus', null, 'earlier']);
    expect([hostPlant(antelope), hostPlant(tropical)]).toEqual(['genus', null]);
    const f = { ...PLANT_FILTER_DEFAULTS, hostOnly: true };
    expect([spicebush, milkweed, privet].map((p) => plantMatches(p, f))).toEqual([true, true, false]);
    state.location = null; // (no state known: a genus-wide count isn't enough)
    expect(hostPlant(milkweed)).toBeNull();
  });
  it('a search finds it by a butterfly its genus feeds here, and says so', () => {
    expect(matchPlant(milkweed, readQuery('monarch')!, false)).toMatchObject({ rank: 3 });
    expect(hostMatchText(milkweed, readQuery('monarch')!)).toBe('Its genus feeds the caterpillars of: Monarch (Danaus plexippus)');
    expect(hostMatchText(spicebush, readQuery('spicebush swallowtail')!)).toBe('Its leaves feed the caterpillars of: Spicebush Swallowtail (Papilio troilus)');
    expect(hostMatchText(old, readQuery('moth')!)).toBe('Its leaves feed the caterpillars of: Several moth spp.');
    // (Field-guide capitals on the earlier list's names too.)
    expect(hostMatchText({ ...old, host: 'Viceroy, mourning cloak (willow genus)' }, readQuery('cloak')!)).toBe('Its leaves feed the caterpillars of: Viceroy, Mourning Cloak (willow genus)');
  });
  it('gives butterfly and moth names field-guide capitals; descriptions, notes and binomials stay as written', () => {
    expect(butterflyCaps('Monarch, queen')).toBe('Monarch, Queen');
    expect(butterflyCaps('Viceroy, mourning cloak, many moths')).toBe('Viceroy, Mourning Cloak, many moths');
    expect(butterflyCaps('Baltimore checkerspot (chiefly C. glabra, C. ovata)')).toBe('Baltimore Checkerspot (chiefly C. glabra, C. ovata)');
    expect(butterflyCaps('Hydrangea sphinx, titan sphinx moths')).toBe('Hydrangea Sphinx, Titan Sphinx moths');
    expect(butterflyCaps('Chalcedony midget moth; Penstemon specialist bees')).toBe('Chalcedony Midget Moth; Penstemon specialist bees');
    expect(butterflyCaps('GIANT SWALLOWTAIL, eastern tiger swallowtail')).toBe('Giant Swallowtail, Eastern Tiger Swallowtail');
    expect(butterflyCaps('Eastern tailed-blue, silver-spotted skipper, skippers')).toBe('Eastern Tailed-Blue, Silver-spotted Skipper, skippers');
    expect(butterflyCaps('Red-Spotted Purple and Viceroy')).toBe('Red-Spotted Purple and Viceroy');
    expect(butterflyCaps('Spring/summer azures')).toBe('Spring/Summer Azures');
    expect(['Pygarctia spraguei', '500+ Lepidoptera (oak genus)', 'Several moth spp.', 'Hermit sphinx, others'].map(butterflyCaps))
      .toEqual(['Pygarctia spraguei', '500+ Lepidoptera (oak genus)', 'Several moth spp.', 'Hermit Sphinx, others']);
  });
  it('shows the named ones, then its genus here, each with its source', () => {
    const p = { ...milkweed, hosts: ['Monarch (Danaus plexippus)'], prov: { hosts: { src: ['ncsu'], check: 'single' } } } as unknown as Plant;
    const row = plantDetails(p, undefined).querySelector('[data-testid=host-row]')!;
    expect(row.querySelector('[data-testid=hosts-named]')!.textContent).toBe('Monarch');
    expect(row.querySelector('[data-testid=hosts-genus]')!.textContent).toBe('Its genus, Asclepias: 12 kinds of native caterpillars in Arkansas (25 in North America). Butterflies among them: Gray Hairstreak, Monarch');
    expect(row.textContent).toContain('Shropshire & Tallamy 2025 · counted for the genus');
    // (The earlier list's sentence only where no source names any.)
    expect(plantDetails({ ...old, hosts: undefined } as Plant, undefined).querySelector('[data-testid=hosts-earlier]')!.textContent).toBe('Several moth spp.');
    expect(plantDetails({ ...old, host: 'Monarch, queen' } as Plant, undefined).querySelector('[data-testid=hosts-earlier]')!.textContent).toBe('Monarch, Queen');
    expect(row.querySelector('[data-testid=hosts-earlier]')).toBeNull();
  });
});
