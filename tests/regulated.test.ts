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
    expect(real.jurisdictions.map((j: { code: string }) => j.code)).toEqual(['US', 'AR', 'TX', 'MS', 'MO', 'OK', 'LA', 'TN', 'VA', 'GA', 'PA', 'KY', 'NC', 'OH', 'IN', 'IL', 'WV', 'AL', 'MI', 'NJ', 'SC', 'NY', 'MA']);
    expect(problems({ v: 1, jurisdictions: [list('XX', [{ name: 'Melia', class: 'noxious' }, { name: 'Melia azedarach', class: 'banned' },
      { genus: 'Cuscuta', except: ['Lythrum alatum'], class: 'noxious' }, { name: 'Melia azedarach', kew: 'Melia', class: 'noxious' },
      { name: 'Melia azedarach', accepted: 'Melia', also: ['x'], notKew: 'Ophiuros', class: 'noxious' }])] }))
      .toEqual(['XX Melia: not a species, variety, subspecies or genus', 'XX Melia azedarach: class "banned" not in its list\'s classes',
        'XX Cuscuta: bad exceptions', 'XX Melia azedarach: bad Kew spelling', 'XX Melia azedarach: bad accepted name',
        'XX Melia azedarach: bad notKew', 'XX Melia azedarach: bad other names']);
    expect(problems({ v: 1, jurisdictions: [{ ...list('XX', []), url: 'http://example.gov' }] })).toEqual(['XX: url not https']);
    expect(problems({ v: 1, jurisdictions: [{ ...list('XX', []), tiers: { noxious: 'severe' } }] })).toEqual(['XX noxious: no tier (ban or listed)']);
    // A list that adopts another's plants: a list that has some of its own, into a class it has.
    expect(problems({ v: 1, jurisdictions: [list('US', []), { ...list('XX', []), adopts: { code: 'US', class: 'noxious' } }] })).toEqual([]);
    expect(problems({ v: 1, jurisdictions: [list('US', []), { ...list('XX', []), adopts: { code: 'ZZ', class: 'federal' } },
      { ...list('YY', []), adopts: { code: 'XX', class: 'noxious' } }] }))
      .toEqual(['XX: adopts no list of plants of its own', 'XX: adopts into class "federal", not in its list\'s classes', 'YY: adopts no list of plants of its own']);
    // A background note: "Background: …", a source with an https link, the date it was checked.
    const bg = { note: 'Background: some are toxic to livestock.', source: { title: 'A page', url: 'https://example.gov/p' }, checked: '2026-10-21' };
    expect(problems({ v: 1, jurisdictions: [list('XX', [{ genus: 'Crotalaria', class: 'noxious', background: bg }])] })).toEqual([]);
    expect(problems({ v: 1, jurisdictions: [list('XX', [{ genus: 'Crotalaria', class: 'noxious', background: { ...bg, note: 'Toxic.' } },
      { genus: 'Xanthium', class: 'noxious', background: { ...bg, source: { title: 'x', url: 'http://example.gov' } } }])] }))
      .toEqual(['XX Crotalaria: bad background', 'XX Xanthium: bad background']);
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
    // (Not the federal Cuscuta entry, which excepts most native dodders: "every Cuscuta species" would be false.)
    expect(genusWide).toEqual({ AR: { 'winged-loosestrife': 'Lythrum' } });
    expect(stateRegulated(data, r, 'AR', genusWide).genusWide).toEqual({ 'winged-loosestrife': { 'AR:lythrum': 'Lythrum' } });
    expect('genusWide' in stateRegulated(data, r, 'MS', genusWide)).toBe(false); // (none: left out)
  });
  it('carry an entry\'s background note to the plants it took in, by rule key', () => {
    const withBg = { ...data, jurisdictions: data.jurisdictions.map((j) => j.code !== 'AR' ? j
      : { ...j, plants: [{ genus: 'Lythrum', class: 'lythrum', background: { note: 'Background: the heading names purple loosestrife.', source: { title: 'NISIC', url: 'https://example.gov/pl' }, checked: '2026-10-21' } }] }) };
    const backgrounds: Record<string, Record<string, unknown>> = {};
    const r = regulatedPlants(withBg, plants, accepted, {}, backgrounds);
    expect(backgrounds).toEqual({ AR: { 'winged-loosestrife': { note: 'Background: the heading names purple loosestrife.', title: 'NISIC', url: 'https://example.gov/pl' } } });
    expect(stateRegulated(withBg, r, 'AR', {}, backgrounds).background).toEqual({ 'winged-loosestrife': { 'AR:lythrum': backgrounds.AR['winged-loosestrife'] } });
    expect('background' in stateRegulated(withBg, r, 'MS', {}, backgrounds)).toBe(false);
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
  it("match Virginia's tiers and its store-sign list: kudzu's variety by its species, a sign law in amber", () => {
    const r = regulatedPlants(real, [
      { id: 'japanese-honeysuckle', botanical: "Lonicera japonica 'Halliana'", binomial: 'Lonicera japonica' },
      { id: 'kudzu', botanical: 'Pueraria montana var. lobata', binomial: 'Pueraria montana' },
      { id: 'nandina', botanical: "Nandina domestica 'Firepower'", binomial: 'Nandina domestica' },
      { id: 'coral-honeysuckle', botanical: 'Lonicera sempervirens', binomial: 'Lonicera sempervirens' },
    ], {});
    expect(r.VA).toEqual({ 'japanese-honeysuckle': 'tier3', kudzu: 'tier3', nandina: 'invasive' });
    const j = real.jurisdictions.find((x: { code: string }) => x.code === 'VA');
    expect([j.tiers.tier3, j.tiers.invasive]).toEqual(['ban', 'listed']);
    expect(j.classes.invasive).toMatch(/^Invasive plant in Virginia: from January 1, 2027, a store may sell it/);
  });
  it("give Georgia the federal list's plants, by reference, in its own class: a ban on selling them", () => {
    const ga = real.jurisdictions.find((x: { code: string }) => x.code === 'GA');
    const us = real.jurisdictions.find((x: { code: string }) => x.code === 'US');
    expect(ga.plants).toEqual(us.plants.map((p: object) => ({ ...p, class: 'federal' })));
    expect(ga.tiers.federal).toBe('ban');
    const r = regulatedPlants(real, [
      { id: 'japanese-dodder', botanical: 'Cuscuta japonica', binomial: 'Cuscuta japonica' },
      { id: 'dodder', botanical: 'Cuscuta gronovii', binomial: 'Cuscuta gronovii' },
    ], {});
    expect(r.GA).toEqual({ 'japanese-dodder': 'federal' }); // (the federal list's exceptions too)
    expect(stateRegulated(real, r, 'GA').regulated['japanese-dodder']).toEqual(['GA:federal', 'US:noxious']);
  });
  it("match Pennsylvania's classes, its own first, then the federal list as Class C; a species' exempted cultivars said in its line", () => {
    const r = regulatedPlants(real, [
      { id: 'blood-grass', botanical: "Imperata cylindrica 'Rubra'", binomial: 'Imperata cylindrica' },
      { id: 'callery-pear', botanical: 'Pyrus calleryana', binomial: 'Pyrus calleryana' },
      { id: 'barberry', botanical: 'Berberis thunbergii', binomial: 'Berberis thunbergii' },
      { id: 'glossy-buckthorn', botanical: 'Frangula alnus', binomial: 'Frangula alnus' },
      { id: 'japanese-hops', botanical: 'Humulus scandens', binomial: 'Humulus scandens' },
    ], { 'glossy-buckthorn': 'Frangula alnus', 'japanese-hops': 'Humulus scandens' });
    expect(r.PA).toEqual({ 'blood-grass': 'classC', 'callery-pear': 'classB', barberry: 'classBBarberry', 'glossy-buckthorn': 'classBBuckthorn', 'japanese-hops': 'classB' });
    const j = real.jurisdictions.find((x: { code: string }) => x.code === 'PA');
    expect(Object.values(j.tiers).every((t) => t === 'ban')).toBe(true);
    expect(j.classes.classBBarberry).toMatch(/^Class B noxious weed in Pennsylvania: .*; the Department of Agriculture exempts six cultivars: Crimson Cutie, .*Sunjoy Mini-Maroon \(/);
    // (Kentucky's only plant law: the highway department keeps state rights-of-way clear of them. A listing.)
    expect(real.jurisdictions.find((x: { code: string }) => x.code === 'KY').tiers).toEqual({ rightofway: 'listed' });
  });
  it("match North Carolina's: the federal list as Class A, after its own; its aquatic weeds a listing, not a ban", () => {
    const r = regulatedPlants(real, [
      { id: 'beach-vitex', botanical: 'Vitex rotundifolia', binomial: 'Vitex rotundifolia' },
      { id: 'water-lettuce', botanical: 'Pistia stratiotes', binomial: 'Pistia stratiotes' },
      { id: 'blood-grass', botanical: "Imperata cylindrica 'Rubra'", binomial: 'Imperata cylindrica' },
      { id: 'mosquito-fern', botanical: 'Salvinia minima', binomial: 'Salvinia minima' },
      { id: 'winged-loosestrife', botanical: 'Lythrum alatum', binomial: 'Lythrum alatum' },
    ], {});
    expect(r.NC).toEqual({ 'beach-vitex': 'classB', 'water-lettuce': 'aquatic', 'blood-grass': 'classA' });
    const j = real.jurisdictions.find((x: { code: string }) => x.code === 'NC');
    expect([j.tiers.classA, j.tiers.classB, j.tiers.aquatic]).toEqual(['ban', 'ban', 'listed']);
  });
  it("match Ohio's, Indiana's and Illinois's: Indiana's Lythrum rule natives included, a ban that starts later a listing until then", () => {
    const r = regulatedPlants(real, [
      { id: 'winged-loosestrife', botanical: 'Lythrum alatum', binomial: 'Lythrum alatum' },
      { id: 'callery-pear', botanical: 'Pyrus calleryana', binomial: 'Pyrus calleryana' },
      { id: 'ribbon-grass', botanical: "Phalaris arundinacea 'Picta'", binomial: 'Phalaris arundinacea' },
      { id: 'field-bindweed', botanical: 'Convolvulus arvensis', binomial: 'Convolvulus arvensis' },
      { id: 'multiflora', botanical: 'Rosa multiflora', binomial: 'Rosa multiflora' },
      { id: 'bamboo', botanical: 'Phyllostachys aureosulcata', binomial: 'Phyllostachys aureosulcata' },
    ], {});
    expect(r.IN).toEqual({ 'winged-loosestrife': 'lythrum', 'ribbon-grass': 'terrestrial', 'field-bindweed': 'terrestrial', multiflora: 'multiflora' });
    expect(r.OH).toEqual({ 'callery-pear': 'invasive', 'ribbon-grass': 'invasive', 'field-bindweed': 'noxious', multiflora: 'invasive' }); // (not the bamboo: listed only once escaped)
    expect(r.IL).toEqual({ 'callery-pear': 'exotic2028', multiflora: 'exotic' });
    const tier = (code: string, cls: string) => real.jurisdictions.find((x: { code: string }) => x.code === code).tiers[cls];
    expect([tier('OH', 'invasive'), tier('OH', 'noxious'), tier('IN', 'lythrum'), tier('IN', 'detrimental'), tier('IL', 'exotic'), tier('IL', 'exotic2028'), tier('IL', 'noxious')])
      .toEqual(['ban', 'listed', 'ban', 'listed', 'ban', 'listed', 'listed']);
  });
  it("match West Virginia's, Alabama's, Michigan's and New Jersey's: a law not yet in force a listing, its start in its line", () => {
    const r = regulatedPlants(real, [
      { id: 'star-of-bethlehem', botanical: 'Ornithogalum umbellatum', binomial: 'Ornithogalum umbellatum' },
      { id: 'autumn-olive', botanical: 'Elaeagnus umbellata', binomial: 'Elaeagnus umbellata' },
      { id: 'norway-maple', botanical: "Acer platanoides 'Crimson King'", binomial: 'Acer platanoides' },
      { id: 'multiflora', botanical: 'Rosa multiflora', binomial: 'Rosa multiflora' },
      { id: 'barberry', botanical: 'Berberis thunbergii', binomial: 'Berberis thunbergii' },
      { id: 'mahonia', botanical: 'Berberis bealei', binomial: 'Berberis bealei' },
    ], {});
    expect(r.AL).toEqual({ 'star-of-bethlehem': 'classC', multiflora: 'classC' });
    expect(r.MI).toEqual({ 'autumn-olive': 'restricted', barberry: 'restricted2028' }); // (the Commission's 2026 order: from 2028)
    expect(r.WV).toEqual({ 'autumn-olive': 'noxious', multiflora: 'multiflora', barberry: 'barberry' }); // (not every Berberis: its rust quarantine's left out)
    expect(r.NJ).toEqual({ 'autumn-olive': 'prohibited', 'norway-maple': 'prohibited', multiflora: 'prohibited', barberry: 'prohibited' });
    const j = (code: string) => real.jurisdictions.find((x: { code: string }) => x.code === code);
    expect([j('NJ').tiers.prohibited, j('MI').tiers.restricted, j('MI').tiers.noxious, j('AL').tiers.aquatic]).toEqual(['listed', 'ban', 'listed', 'listed']);
    expect(j('NJ').classes.prohibited).toMatch(/^Prohibited invasive species in New Jersey: from early 2027 /);
    // (Indiana's shattercane is the weedy subspecies its statute prints: never grain sorghum.)
    expect(regulatedPlants(real, [{ id: 'sorghum', botanical: 'Sorghum bicolor', binomial: 'Sorghum bicolor' }], {}).IN).toBeUndefined();
  });
  it("match South Carolina's, New York's and Massachusetts's: an agency's reading said as such, exempt cultivars named, phase-outs listings until they end", () => {
    const r = regulatedPlants(real, [
      { id: 'callery-pear', botanical: 'Pyrus calleryana', binomial: 'Pyrus calleryana' },
      { id: 'barberry', botanical: 'Berberis thunbergii', binomial: 'Berberis thunbergii' },
      { id: 'norway-maple', botanical: "Acer platanoides 'Crimson King'", binomial: 'Acer platanoides' },
      { id: 'maiden-grass', botanical: "Miscanthus sinensis 'Gracillimus'", binomial: 'Miscanthus sinensis' },
      { id: 'cup-plant', botanical: 'Silphium perfoliatum', binomial: 'Silphium perfoliatum' },
      { id: 'black-currant', botanical: 'Ribes nigrum', binomial: 'Ribes nigrum' },
      { id: 'water-chestnut', botanical: 'Trapa natans', binomial: 'Trapa natans' },
      { id: 'rice', botanical: 'Oryza sativa', binomial: 'Oryza sativa' },
      { id: 'satsuma', botanical: "Citrus reticulata 'Owari'", binomial: 'Citrus reticulata' },
    ], {});
    expect(r.SC).toEqual({ 'callery-pear': 'pest', 'water-chestnut': 'pest' }); // (not rice or satsumas: crops the list doesn't explain)
    expect(r.NY).toEqual({ barberry: 'prohibitedBarberry', 'norway-maple': 'regulated', 'maiden-grass': 'regulated', 'cup-plant': 'prohibited', 'black-currant': 'blackCurrant', 'water-chestnut': 'prohibited' });
    expect(r.MA).toEqual({ 'callery-pear': 'phaseoutPear', barberry: 'prohibited', 'norway-maple': 'prohibited', 'maiden-grass': 'phaseout2026', 'water-chestnut': 'trapa' });
    const j = (code: string) => real.jurisdictions.find((x: { code: string }) => x.code === code);
    expect([j('SC').tiers.pest, j('NY').tiers.prohibited, j('NY').tiers.regulated, j('MA').tiers.prohibited, j('MA').tiers.phaseout2026, j('MA').tiers.trapa]).toEqual(['ban', 'ban', 'listed', 'ban', 'listed', 'ban']);
    expect(j('SC').classes.pest).toMatch(/^Plant pest in South Carolina: by its agency's reading \(Clemson University's Department of Plant Industry/);
    expect(j('NY').classes.prohibitedBarberry).toMatch(/Crimson Cutie/);
    expect(j('MA').classes.phaseout2026).toMatch(/^Prohibited plant in Massachusetts after December 31, 2026: /);
    // (From the list page Jason saved, 2026-11-01: what the list forbids, and Callery pear's phase-out dates.)
    expect(j('MA').classes.prohibited).toContain('"sale, import, trade, purchase, distribution, propagation, and related activities are currently prohibited" in the state, its cultivars, varieties and hybrids included');
    expect(j('MA').classes.phaseoutPear).toMatch(/^Prohibited plant in Massachusetts after December 31, 2028: since September 19, 2024 .*"with limited exceptions in orchards"/);
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
