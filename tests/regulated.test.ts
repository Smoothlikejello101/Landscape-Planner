// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { listedSpecies, problems, readRegulated, regulatedPlants, stateRegulated } from '../scripts/catalog/regulated.mjs';

// Plants regulated by law: the lists as each rule names them (scripts/catalog/regulated-plants.json), matched
// to catalog plants by Kew's accepted names.

const real = readRegulated();
const list = (code: string, plants: object[], classes: Record<string, string> = { noxious: 'Noxious weed in X' }) =>
  ({ code, title: `${code} list`, url: 'https://example.gov/rule.pdf', edition: '2025', read: '2026-10-21', classes, plants });

describe('the regulated lists', () => {
  it('are well formed: each entry a species, variety or genus, of a class its list says, each list cited', () => {
    expect(problems(real)).toEqual([]);
    expect(real.jurisdictions.map((j: { code: string }) => j.code)).toEqual(['US', 'AR', 'TX', 'MS', 'MO', 'OK', 'LA']);
    expect(problems({ v: 1, jurisdictions: [list('XX', [{ name: 'Melia', class: 'noxious' }, { name: 'Melia azedarach', class: 'banned' },
      { genus: 'Cuscuta', except: ['Lythrum alatum'], class: 'noxious' }, { name: 'Melia azedarach', kew: 'Melia', class: 'noxious' }])] }))
      .toEqual(['XX Melia: not a species, variety, subspecies or genus', 'XX Melia azedarach: class "banned" not in its list\'s classes',
        'XX Cuscuta: bad exceptions', 'XX Melia azedarach: bad Kew spelling']);
    expect(problems({ v: 1, jurisdictions: [{ ...list('XX', []), url: 'http://example.gov' }] })).toEqual(['XX: url not https']);
  });
  it("say what each rule says, as the rule says it", () => {
    const says = (code: string, cls: string) => real.jurisdictions.find((j: { code: string }) => j.code === code).classes[cls];
    expect(says('AR', 'prohibited')).toBe('Prohibited in Arkansas: no plant, seed or other part of it may be sold or planted (2 CAR §50-101(f))');
    expect(says('TX', 'invasive')).toContain('may not be sold, distributed or brought into the state');
    expect(says('OK', 'noxious')).not.toMatch(/sold/); // (Oklahoma's law bans no sale: a duty to control it)
  });
  it('look up their species in Kew\'s checklist by its spelling where the rule spells one otherwise', () => {
    const names = listedSpecies(real);
    expect(names).toContain('Echinochloa crus-galli');
    expect(names).not.toContain('Echinochloa crusgalli');
    expect(names).toContain('Cuscuta gronovii'); // (an exception: looked up too)
  });
});

describe('matching the lists to catalog plants', () => {
  const data = { v: 1, jurisdictions: [
    list('US', [{ genus: 'Cuscuta', except: ['Cuscuta gronovii'], class: 'noxious' }]),
    list('TX', [{ name: 'Triadica sebifera', class: 'noxious' }, { name: 'Melia azedarach', class: 'invasive' }, { name: 'Triadica sebifera', class: 'invasive' },
      { name: 'Pueraria montana var. lobata', class: 'noxious' }, { name: 'Schinus terebinthifolius', kew: 'Schinus terebinthifolia', class: 'noxious' }],
    { noxious: 'Noxious plant in Texas', invasive: 'On Texas\'s invasive list' }),
    list('MS', [{ name: 'Sapium sebiferum', class: 'noxious' }]),
    list('AR', [{ genus: 'Lythrum', class: 'lythrum' }], { lythrum: 'Prohibited in Arkansas' }),
  ] };
  const plants = [
    { id: 'tallow', botanical: 'Triadica sebifera', binomial: 'Triadica sebifera' },
    { id: 'chinaberry-cv', botanical: "Melia azedarach 'Umbraculiformis'", binomial: 'Melia azedarach' },
    { id: 'kudzu', botanical: 'Pueraria montana var. lobata', binomial: 'Pueraria montana' },
    { id: 'kudzu-species', botanical: 'Pueraria montana', binomial: 'Pueraria montana' },
    { id: 'peppertree', botanical: 'Schinus terebinthifolia', binomial: 'Schinus terebinthifolia' },
    { id: 'winged-loosestrife', botanical: 'Lythrum alatum', binomial: 'Lythrum alatum' },
    { id: 'dodder', botanical: 'Cuscuta gronovii', binomial: 'Cuscuta gronovii' },
    { id: 'japanese-dodder', botanical: 'Cuscuta japonica', binomial: 'Cuscuta japonica' },
    { id: 'oak', botanical: 'Quercus alba', binomial: 'Quercus alba' },
  ];
  const accepted = { tallow: 'Triadica sebifera', 'chinaberry-cv': 'Melia azedarach', 'winged-loosestrife': 'Lythrum alatum', oak: 'Quercus alba' };
  const acceptedListed = { 'Sapium sebiferum': 'Triadica sebifera', 'Melia azedarach': 'Melia azedarach', 'Schinus terebinthifolia': 'Schinus terebinthifolia' };
  const m = regulatedPlants(data, plants, accepted, acceptedListed);
  it('match a species by its accepted name (a rule\'s synonym too), its cultivars with it', () => {
    expect(m.MS).toEqual({ tallow: 'noxious' }); // (Sapium sebiferum is Triadica sebifera)
    expect(m.TX['chinaberry-cv']).toBe('invasive');
    expect(m.TX.peppertree).toBe('noxious'); // (the rule's terebinthifolius, Kew's terebinthifolia)
  });
  it('take the first of two entries for one plant; a variety only for that variety; a genus but its exceptions', () => {
    expect(m.TX.tallow).toBe('noxious');
    expect(m.TX.kudzu).toBe('noxious');
    expect(m.TX['kudzu-species']).toBeUndefined();
    expect(m.AR).toEqual({ 'winged-loosestrife': 'lythrum' });
    expect(m.US).toEqual({ 'japanese-dodder': 'noxious' });
    expect(Object.values(m).some((x) => 'oak' in (x as object))).toBe(false);
  });
  it("give a state's file its own list's lines first, then the federal list's", () => {
    const law = stateRegulated(data, { ...m, US: { ...m.US, tallow: 'noxious' } }, 'TX');
    expect(law.regulated.tallow).toEqual(['TX:noxious', 'US:noxious']);
    expect(law.regulated['japanese-dodder']).toEqual(['US:noxious']);
    expect(law.rules['TX:invasive']).toEqual({ says: 'On Texas\'s invasive list', title: 'TX list', url: 'https://example.gov/rule.pdf', edition: '2025', read: '2026-10-21' });
    expect(Object.keys(stateRegulated(data, m, 'AL').regulated)).toEqual(['japanese-dodder']);
  });
  it('match the real lists: winged loosestrife in Arkansas (all Lythrum), chinaberry in Texas', () => {
    const r = regulatedPlants(real, [
      { id: 'lythrum-alatum', botanical: 'Lythrum alatum', binomial: 'Lythrum alatum' },
      { id: 'melia-azedarach', botanical: 'Melia azedarach', binomial: 'Melia azedarach' },
      { id: 'imperata-red-baron', botanical: "Imperata cylindrica 'Red Baron'", binomial: 'Imperata cylindrica' },
      { id: 'allium-cernuum', botanical: 'Allium cernuum', binomial: 'Allium cernuum' },
      { id: 'ipomoea-pandurata', botanical: 'Ipomoea pandurata', binomial: 'Ipomoea pandurata' },
    ], {}, { 'Eichhornia crassipes': 'Pontederia crassipes' });
    expect(r.AR).toEqual({ 'lythrum-alatum': 'lythrum', 'imperata-red-baron': 'prohibited' });
    expect(r.TX).toEqual({ 'melia-azedarach': 'invasive' });
    expect(r.US).toEqual({ 'imperata-red-baron': 'noxious' });
  });
});
