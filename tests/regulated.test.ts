// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { cleanName, lawPlants, listedSpecies, problems, readRegulated, regulatedPlants, stateRegulated, unreviewed } from '../scripts/catalog/regulated.mjs';

// Plants regulated by law: the lists as each rule names them (scripts/catalog/regulated-plants.json), matched
// to catalog plants by Kew's accepted names.

const real = readRegulated();
const list = (code: string, plants: object[], classes: Record<string, string> = { noxious: 'Noxious weed in X' }) =>
  ({ code, title: `${code} list`, url: 'https://example.gov/rule.pdf', edition: '2025', read: '2026-10-21', classes,
    tiers: Object.fromEntries(Object.keys(classes).map((c) => [c, c === 'invasive' ? 'listed' : 'ban'])), plants });

describe('the regulated lists', () => {
  it('are well formed: each entry a species, variety or genus, of a class its list says, each list cited', () => {
    expect(problems(real)).toEqual([]);
    expect(real.jurisdictions.map((j: { code: string }) => j.code)).toEqual(['US', 'AR', 'TX', 'MS', 'MO', 'OK', 'LA', 'TN']);
    expect(problems({ v: 1, jurisdictions: [list('XX', [{ name: 'Melia', class: 'noxious' }, { name: 'Melia azedarach', class: 'banned' },
      { genus: 'Cuscuta', except: ['Lythrum alatum'], class: 'noxious' }, { name: 'Melia azedarach', kew: 'Melia', class: 'noxious' },
      { name: 'Melia azedarach', accepted: 'Melia', also: ['x'], notKew: 'Ophiuros', class: 'noxious' }])] }))
      .toEqual(['XX Melia: not a species, variety, subspecies or genus', 'XX Melia azedarach: class "banned" not in its list\'s classes',
        'XX Cuscuta: bad exceptions', 'XX Melia azedarach: bad Kew spelling', 'XX Melia azedarach: bad accepted name',
        'XX Melia azedarach: bad notKew', 'XX Melia azedarach: bad other names']);
    expect(problems({ v: 1, jurisdictions: [{ ...list('XX', []), url: 'http://example.gov' }] })).toEqual(['XX: url not https']);
    expect(problems({ v: 1, jurisdictions: [{ ...list('XX', []), tiers: { noxious: 'severe' } }] })).toEqual(['XX noxious: no tier (ban or listed)']);
    // Real lists: bans are bans, listings with lighter duties are listed.
    const tier = (code: string, cls: string) => real.jurisdictions.find((j: { code: string }) => j.code === code).tiers[cls];
    expect([tier('AR', 'lythrum'), tier('AR', 'prohibited'), tier('AR', 'noxious'), tier('OK', 'noxious'), tier('LA', 'noxious'), tier('TX', 'invasive')])
      .toEqual(['ban', 'ban', 'listed', 'listed', 'listed', 'ban']);
  });
  it("say what each rule says, as the rule says it", () => {
    const says = (code: string, cls: string) => real.jurisdictions.find((j: { code: string }) => j.code === code).classes[cls];
    expect(says('AR', 'prohibited')).toBe('Prohibited in Arkansas: no plant, seed or any reproductive structure of it may be sold or planted (2 CAR §50-101(f))');
    expect(says('TX', 'invasive')).toContain('selling it, distributing it or bringing it into the state, in any live form, is a misdemeanor, unless permitted (Texas Agriculture Code §71.152');
    expect(says('OK', 'noxious')).not.toMatch(/sold/); // (Oklahoma's law bans no sale: a duty to control it)
    expect(says('TN', 'pest')).toBe('Pest plant in Tennessee: it may not be sold, offered for sale or released in the state, nor propagated without a permit from the commissioner (Tenn. Comp. R. & Regs. 0080-06-24)');
  });
  it('look up their species in Kew\'s checklist by its spelling where the rule spells one otherwise', () => {
    const names = listedSpecies(real);
    expect(names).toContain('Echinochloa crus-galli');
    expect(names).not.toContain('Echinochloa crusgalli');
    expect(names).not.toContain('Cuscuta gronovii'); // (an exception: matched by its printed name)
  });
  it("record Kew's accepted name for each listed species it files otherwise, checked by hand; report any not", () => {
    expect(unreviewed(real, { 'Sapium sebiferum': 'Triadica sebifera', 'Rottboellia exaltata': 'Ophiuros exaltatus', 'Pennisetum polystachion': 'Setaria parviflora' })).toEqual([]);
    expect(unreviewed(real, { 'Melia azedarach': 'Azedarach sempervirens' })).toEqual(["Melia azedarach: Kew's accepted name is Azedarach sempervirens, the list's Melia azedarach"]);
    // (Where wcvp.mjs has run: its lookups all reviewed.)
    if (existsSync('catalog-src/wcvp-regulated.json')) expect(unreviewed(real, JSON.parse(readFileSync('catalog-src/wcvp-regulated.json', 'utf8')))).toEqual([]);
  });
});

describe('matching the lists to catalog plants', () => {
  const data = { v: 1, jurisdictions: [
    list('US', [{ genus: 'Cuscuta', except: ['Cuscuta gronovii', 'Cuscuta ceanothi'], exceptAlso: ['Cuscuta subinclusa'], class: 'noxious' }]),
    list('TX', [{ name: 'Triadica sebifera', class: 'noxious' }, { name: 'Melia azedarach', class: 'invasive' }, { name: 'Triadica sebifera', class: 'invasive' },
      { name: 'Pueraria montana var. lobata', also: ['Pueraria lobata'], class: 'noxious' }, { name: 'Schinus terebinthifolius', kew: 'Schinus terebinthifolia', class: 'noxious' }],
    { noxious: 'Noxious plant in Texas', invasive: 'On Texas\'s invasive list' }),
    list('MS', [{ name: 'Sapium sebiferum', accepted: 'Triadica sebifera', class: 'noxious' }]),
    list('AR', [{ genus: 'Lythrum', class: 'lythrum' }], { lythrum: 'Prohibited in Arkansas' }),
  ] };
  const plants = [
    { id: 'tallow', botanical: 'Triadica sebifera', binomial: 'Triadica sebifera' },
    { id: 'chinaberry-cv', botanical: "Melia azedarach 'Umbraculiformis'", binomial: 'Melia azedarach' },
    { id: 'kudzu', botanical: 'Pueraria montana var. lobata', binomial: 'Pueraria montana' },
    { id: 'kudzu-species', botanical: 'Pueraria montana', binomial: 'Pueraria montana' },
    { id: 'kudzu-old-name', botanical: 'Pueraria lobata', binomial: 'Pueraria lobata' },
    { id: 'peppertree', botanical: 'Schinus terebinthifolia', binomial: 'Schinus terebinthifolia' },
    { id: 'winged-loosestrife', botanical: 'Lythrum alatum', binomial: 'Lythrum alatum' },
    { id: 'dodder', botanical: 'Cuscuta gronovii', binomial: 'Cuscuta gronovii' },
    { id: 'japanese-dodder', botanical: 'Cuscuta japonica', binomial: 'Cuscuta japonica' },
    { id: 'canyon-dodder', botanical: 'Cuscuta subinclusa', binomial: 'Cuscuta subinclusa' },
    { id: 'oak', botanical: 'Quercus alba', binomial: 'Quercus alba' },
  ];
  const accepted = { tallow: 'Triadica sebifera', 'chinaberry-cv': 'Melia azedarach', 'winged-loosestrife': 'Lythrum alatum', oak: 'Quercus alba' };
  const m = regulatedPlants(data, plants, accepted);
  it('match a species by its accepted name (a rule\'s synonym too), its cultivars with it', () => {
    expect(m.MS).toEqual({ tallow: 'noxious' }); // (Sapium sebiferum is Triadica sebifera)
    expect(m.TX['chinaberry-cv']).toBe('invasive');
    expect(m.TX.peppertree).toBe('noxious'); // (the rule's terebinthifolius, Kew's terebinthifolia)
  });
  it('take the first of two entries for one plant; a variety only for that variety; a genus but its exceptions', () => {
    expect(m.TX.tallow).toBe('noxious');
    expect(m.TX.kudzu).toBe('noxious');
    expect(m.TX['kudzu-species']).toBeUndefined();
    expect(m.TX['kudzu-old-name']).toBe('noxious'); // (by its other name)
    expect(m.AR).toEqual({ 'winged-loosestrife': 'lythrum' });
    expect(m.US).toEqual({ 'japanese-dodder': 'noxious' });
    expect(Object.values(m).some((x) => 'oak' in (x as object))).toBe(false);
  });
  it("give a state's file its own list's lines first, then the federal list's", () => {
    const law = stateRegulated(data, { ...m, US: { ...m.US, tallow: 'noxious' } }, 'TX');
    expect(law.regulated.tallow).toEqual(['TX:noxious', 'US:noxious']);
    expect(law.regulated['japanese-dodder']).toEqual(['US:noxious']);
    expect(law.rules['TX:invasive']).toEqual({ says: 'On Texas\'s invasive list', tier: 'listed', title: 'TX list', url: 'https://example.gov/rule.pdf', edition: '2025', read: '2026-10-21' });
    expect(Object.keys(stateRegulated(data, m, 'AL').regulated)).toEqual(['japanese-dodder']);
  });
  it('record which plants a whole-genus entry took in, for the line that says why a native is covered', () => {
    const genusWide = {};
    const r = regulatedPlants(data, plants, accepted, genusWide);
    expect(r).toEqual(m);
    expect(genusWide).toEqual({ US: { 'japanese-dodder': 'Cuscuta' }, AR: { 'winged-loosestrife': 'Lythrum' } });
    expect(stateRegulated(data, r, 'AR', genusWide).genusWide).toEqual({ 'winged-loosestrife': { 'AR:lythrum': 'Lythrum' }, 'japanese-dodder': { 'US:noxious': 'Cuscuta' } });
    expect(stateRegulated(data, r, 'MS', genusWide).genusWide).toEqual({ 'japanese-dodder': { 'US:noxious': 'Cuscuta' } });
    expect('genusWide' in stateRegulated(data, { MS: r.MS }, 'MS', genusWide)).toBe(false); // (none: left out)
  });
  it('match the real lists: Arkansas\'s genera and wild onion, itchgrass by its reviewed name, never missiongrass\'s namesake', () => {
    const r = regulatedPlants(real, [
      { id: 'allium-canadense', botanical: 'Allium canadense var. lavendulare', binomial: 'Allium canadense' },
      { id: 'crotalaria-sagittalis', botanical: 'Crotalaria sagittalis', binomial: 'Crotalaria sagittalis' },
      { id: 'cirsium-discolor', botanical: 'Cirsium discolor', binomial: 'Cirsium discolor' },
      { id: 'sweet-potato', botanical: 'Ipomoea batatas', binomial: 'Ipomoea batatas' },
      { id: 'joseph-coat', botanical: 'Alternanthera ficoidea', binomial: 'Alternanthera ficoidea' },
      { id: 'itchgrass', botanical: 'Rottboellia cochinchinensis', binomial: 'Rottboellia cochinchinensis' },
      { id: 'ophiuros', botanical: 'Ophiuros exaltatus', binomial: 'Ophiuros exaltatus' },
      { id: 'knotroot', botanical: 'Setaria parviflora', binomial: 'Setaria parviflora' },
      { id: 'water-hyacinth', botanical: 'Pontederia crassipes', binomial: 'Pontederia crassipes' },
    ], { knotroot: 'Setaria parviflora' });
    expect(r.AR).toEqual({ 'allium-canadense': 'noxious', 'crotalaria-sagittalis': 'noxious', 'cirsium-discolor': 'noxious', itchgrass: 'noxious', 'water-hyacinth': 'prohibited' });
    expect(r.US).toEqual({ itchgrass: 'noxious' }); // (not knotroot bristlegrass, a native; water hyacinth isn't on it, rooted water hyacinth is)
  });
  it('match a named hybrid by the catalog\'s own name, however its sign is typed; a hybrid by its genus too', () => {
    const r = regulatedPlants(real, [
      { id: 'bella-x', botanical: 'Lonicera x bella' },
      { id: 'bella-sign', botanical: "Lonicera ×bella 'Rosea'" },
      { id: 'fly-honeysuckle', botanical: 'Lonicera xylosteum', binomial: 'Lonicera xylosteum' },
      { id: 'lythrum-hybrid', botanical: 'Lythrum × hybrida' },
      { id: 'privet', botanical: 'Ligustrum sinense', binomial: 'Ligustrum sinense' },
    ], {});
    expect(r.TN).toEqual({ 'bella-x': 'pest', 'bella-sign': 'pest', privet: 'pest' });
    expect(r.AR).toEqual({ 'lythrum-hybrid': 'lythrum' }); // (§50-709: Lythrum "including any hybrid cross thereof")
    // A name's hybrid sign, as typed: never a species whose epithet starts with x.
    expect(['Lonicera x bella', 'Lonicera X bella', ' Lonicera  ×bella ', 'Lonicera × bella'].map(cleanName)).toEqual(Array(4).fill('Lonicera × bella'));
    expect(['Lonicera xylosteum', 'Xanthium strumarium', '× Chitalpa tashkentensis', 'Lonicera xbella'].map(cleanName))
      .toEqual(['Lonicera xylosteum', 'Xanthium strumarium', '× Chitalpa tashkentensis', 'Lonicera xbella']);
    // A "spp." record takes no genus line (its species can't be checked against the rule's exceptions).
    expect(regulatedPlants(real, [{ id: 'dodders', botanical: 'Cuscuta spp.' }], {})).toEqual({});
    expect(problems({ v: 1, jurisdictions: [list('XX', [{ name: 'Lonicera × bella', class: 'noxious' }])] })).toEqual([]);
  });
  it('match the real lists: winged loosestrife in Arkansas (all Lythrum), chinaberry in Texas', () => {
    const r = regulatedPlants(real, [
      { id: 'lythrum-alatum', botanical: 'Lythrum alatum', binomial: 'Lythrum alatum' },
      { id: 'melia-azedarach', botanical: 'Melia azedarach', binomial: 'Melia azedarach' },
      { id: 'imperata-red-baron', botanical: "Imperata cylindrica 'Red Baron'", binomial: 'Imperata cylindrica' },
      { id: 'allium-cernuum', botanical: 'Allium cernuum', binomial: 'Allium cernuum' },
      { id: 'ipomoea-pandurata', botanical: 'Ipomoea pandurata', binomial: 'Ipomoea pandurata' },
    ], {});
    expect(r.AR).toEqual({ 'lythrum-alatum': 'lythrum', 'imperata-red-baron': 'prohibited' });
    expect(r.TX).toEqual({ 'melia-azedarach': 'invasive' });
    expect(r.US).toEqual({ 'imperata-red-baron': 'noxious' });
  });
});

describe('what the matcher is given', () => {
  it('every plant with its own record: species with their species, the rest by their own names; no cultivar with a parent', () => {
    const catalog = { plants: [
      { id: 'privet', botanical: 'Ligustrum sinense' },
      { id: 'privet-cv', botanical: "Ligustrum sinense 'Variegatum'", parent: 'privet' },
      { id: 'bella', botanical: 'Lonicera x bella' },
      { id: 'mix', botanical: '' },
    ] };
    expect(lawPlants(catalog, [{ id: 'privet', binomial: 'Ligustrum sinense' }])).toEqual([
      { id: 'privet', binomial: 'Ligustrum sinense', botanical: 'Ligustrum sinense' },
      { id: 'bella', botanical: 'Lonicera x bella' },
    ]);
  });
});
