import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { writeAudit } from '../scripts/catalog/write.mjs';
import { catalogErrors, catalogWarnings, type CatalogFile } from '../src/catalog';

const catalog: CatalogFile = {
  meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { compendium: { title: 'old', trust: 'unverified' } }, enums: { form: ['Shrub', 'Tree', 'Perennial'], water: ['Low', 'Moderate', 'High'], deer: ['Resistant'] } },
  plants: [
    { id: 'redbud', common: 'Redbud', src: ['compendium'], audited: null, facts: { form: 'Tree', zone_max: 9.5, sun_most: 'Full', water: 'Low', height: { min: 20, max: 30, med: 25 } } },
    { id: 'nothing', common: 'Nothing found', src: ['compendium'], audited: null, facts: { form: 'Perennial' } },
  ],
};
const audit = [
  { id: 'redbud', claims: [{ src: 'ncsu', kind: 'authority' }, { src: 'usda', kind: 'authority' }, { src: 'shop.com', kind: 'nursery' }, { src: 'x.edu', kind: 'authority' }], facts: {
    form: { v: ['Tree', 'Shrub'], src: ['ncsu', 'usda'], check: 'confirmed' },
    zone_max: { v: 9, src: ['ncsu'], check: 'disputed', note: 'x.edu: 11' },
    sun_most: { v: 'Part', src: ['ncsu'], check: 'single', alt: { v: 'Full', src: ['shop.com'], check: 'reported' } },
    sun_least: { v: 'Shade', src: ['ncsu'], check: 'single', alt: { v: 'Shade', src: ['shop.com'], check: 'reported' } }, // (the same: not kept)
    water: { v: 'Moderate', src: ['ncsu', 'x.edu'], check: 'confirmed' },
    height: { v: { min: 20, max: 30 }, src: ['ncsu'], check: 'single' },
    zone_min: { v: 4.25, src: ['ncsu'], check: 'single' }, // (not a half-zone: not written)
    width: null,
    tox_people: { v: ['minor'], src: ['ncsu'], check: 'single' }, // (waits on its format change)
  } },
  { id: 'nothing', claims: [], facts: { form: null } },
];

describe('writing the audit into the catalog', () => {
  const { file, review } = writeAudit(catalog, audit, '2026-10-19');
  const redbud = file.plants[0];
  it('writes settled facts with their sources and how sure they are, nurseries\' differing values beside them', () => {
    expect(redbud.audited).toBe('2026-10-19');
    expect(redbud.facts.form).toEqual({ v: ['Tree', 'Shrub'], src: ['ncsu', 'usda'], check: 'confirmed' });
    expect(redbud.facts.sun_most).toEqual({ v: 'Part', src: ['ncsu'], check: 'single', alt: { v: 'Full', src: ['shop.com'], check: 'reported' } });
    expect(redbud.facts.sun_least).toEqual({ v: 'Shade', src: ['ncsu'], check: 'single' });
    expect(redbud.facts.height).toEqual({ v: { min: 20, max: 30, med: 25 }, src: ['ncsu'], check: 'single' });
    expect(redbud.facts.water).toMatchObject({ v: 'Moderate', check: 'confirmed' });
  });
  it('keeps the current value where the audit settled nothing, and lists disputes and values it can\'t take', () => {
    expect(redbud.facts.zone_max).toBe(9.5);
    expect(redbud.facts.zone_min).toBeUndefined();
    expect(redbud.facts.tox_people).toBeUndefined();
    expect(review).toEqual([
      { id: 'redbud', fact: 'zone_min', note: "value the catalog can't take: 4.25" },
      { id: 'redbud', fact: 'zone_max', note: 'x.edu: 11' },
    ]);
    expect(file.plants[1]).toEqual(catalog.plants[1]); // (nothing written: not marked audited)
  });
  it('cites each source once, by its kind, and the result passes the app\'s checks', () => {
    expect(file.meta.sources['shop.com']).toEqual({ title: 'shop.com', url: 'https://shop.com', trust: 'nursery' });
    expect(file.meta.sources['x.edu']).toMatchObject({ trust: 'reference' });
    expect(file.meta.sources.ncsu.title).toMatch(/NC State/);
    expect(file.meta.updated).toBe('2026-10-19');
    expect(catalogErrors(file)).toEqual([]);
  });
  it('dates a record by a later run only where its facts changed: a run that changes nothing changes nothing', () => {
    const again = writeAudit(file, audit, '2026-11-02').file;
    expect(again).toEqual(file); // (the same facts: the records keep 2026-10-19, and so does the file)
    const changed = writeAudit(file, [{ ...audit[0], facts: { ...audit[0].facts, water: { v: 'High', src: ['ncsu'], check: 'single' } } }, audit[1]], '2026-11-02').file;
    expect([changed.plants[0].audited, changed.plants[0].facts.water]).toEqual(['2026-11-02', { v: 'High', src: ['ncsu'], check: 'single' }]);
    expect(changed.meta.updated).toBe('2026-11-02');
    // (A value an earlier run sourced that no source gives now: kept, and listed.)
    const { height: _h, ...noHeight } = audit[0].facts;
    const gone = writeAudit(file, [{ ...audit[0], facts: noHeight }, audit[1]], '2026-11-02');
    expect(gone.file.plants[0].facts.height).toEqual(file.plants[0].facts.height);
    expect(gone.review).toContainEqual({ id: 'redbud', fact: 'height', note: 'no source gives it now: {"min":20,"max":30,"med":25}, from ncsu' });
    expect(gone.review.filter((i: { note: string }) => i.note.startsWith('no source'))).toHaveLength(1); // (not the facts it lists already)
    // (Beside a record that changes, one that doesn't keeps its date.)
    const two = { ...file, plants: [...file.plants, { ...file.plants[0], id: 'redbud-2' }] };
    const both = writeAudit(two, [{ ...audit[0], facts: { ...audit[0].facts, water: { v: 'High', src: ['ncsu'], check: 'single' } } }, audit[1], { ...audit[0], id: 'redbud-2' }], '2026-11-02').file;
    expect(both.plants.map((p: { audited: string | null }) => p.audited)).toEqual(['2026-11-02', null, '2026-10-19']);
  });
});

describe('what the writer holds back', () => {
  const meta = { ...catalog.meta, enums: { ...catalog.meta.enums, water: ['Low', 'Moderate', 'High', 'Wetland'] } };
  const rec = (id: string, facts: Record<string, unknown>, extra = {}) => ({ id, common: id, src: ['compendium'], audited: null, facts, ...extra });
  const settled = (v: unknown, alt?: unknown) => ({ v, src: ['ncsu'], check: 'single', ...(alt ? { alt: { v: alt, src: ['shop.com'], check: 'reported' } } : {}) });
  const run = (plants: CatalogFile['plants'], audit: unknown[]) => writeAudit({ meta, plants }, audit, '2026-10-19', catalogWarnings);
  it('keeps a Wetland rating, its species\' too', () => {
    const { file } = run([rec('sp', { water: 'Wetland' }), rec('cv', { form: 'Shrub' }, { parent: 'sp' })],
      [{ id: 'sp', facts: { water: settled('High') } }, { id: 'cv', facts: { water: settled('High') } }]);
    expect(file.plants.map((p: { facts: Record<string, unknown> }) => p.facts.water)).toEqual(['Wetland', undefined]);
  });
  it('sends "edible" to review on a plant toxic to dogs (its species\' rating too) or seriously toxic to people', () => {
    const { file, review } = run([rec('mayapple', {}), rec('sp', { dog: 'Toxic' }), rec('cv', {}, { parent: 'sp' }), rec('fig', {})], [
      { id: 'mayapple', facts: { edible: settled(true), tox_people: settled(['major', 'dermatitis']) } },
      { id: 'sp', facts: {} }, { id: 'cv', facts: { edible: settled(true) } },
      { id: 'fig', facts: { edible: settled(true), tox_people: settled(['minor']) } },
    ]);
    expect(review.filter((r: { note: string }) => r.note === 'edible, but rated toxic').map((r: { id: string }) => r.id)).toEqual(['mayapple', 'cv']);
    expect(file.plants[3].facts.edible).toMatchObject({ v: true }); // (a fig's sap irritates; its fruit is food)
  });
  it('marks a toxic plant edible, or not, as a person decided, its poisonous parts beside it from the same source', () => {
    const poison = { v: { severity: 'high', parts: ['leaves', 'roots', 'seeds', 'stems'], skin: true }, src: ['ncsu'], check: 'single' };
    const { file, review } = writeAudit({ meta, plants: [rec('mayapple', { dog: 'Toxic - rarely eaten' }), rec('oak', { dog: 'Toxic - rarely eaten', edible: true }), rec('ramps', { dog: 'Toxic - rarely eaten' })] }, [
      { id: 'mayapple', facts: { edible: settled(true), tox_people: settled(['major', 'dermatitis']), poison } },
      { id: 'oak', facts: { edible: settled(true) } },
      { id: 'ramps', facts: { edible: settled(true), poison: { v: {}, src: ['ncsu'], check: 'single' } } },
    ], '2026-10-23', catalogWarnings, { edible: { mayapple: { v: true }, oak: { v: false } } });
    const [mayapple, oak, ramps] = file.plants;
    expect(mayapple.facts.edible).toEqual({ v: true, src: ['ncsu'], check: 'single' });
    expect(mayapple.facts.poison).toEqual(poison);
    expect(oak.facts.edible).toBeUndefined(); // (an older unsourced "edible", taken out)
    expect(oak.audited).toBe('2026-10-23'); // (a change, though nothing was written)
    expect(ramps.facts.edible).toBe(undefined); // (not decided: still listed)
    expect(ramps.facts.poison).toEqual({ v: {}, src: ['ncsu'], check: 'single' }); // (poisonous, nothing more said)
    expect(review).toEqual([{ id: 'ramps', fact: 'edible', note: 'edible, but rated toxic' }]);
    expect(catalogErrors(file)).toEqual([]);
    // Decided against later: a sourced "edible" comes out, and isn't then listed as one "no source gives now".
    const again = writeAudit(file, [{ id: 'mayapple', facts: { edible: settled(true), tox_people: settled(['major']), poison } }], '2026-11-01', catalogWarnings, { edible: { mayapple: { v: false } } });
    expect(again.file.plants[0].facts.edible).toBeUndefined();
    expect(again.review).toEqual([]);
  });
  it("says none listed where NC State's page was read and says nothing of poison, unless its species is rated", () => {
    const read = (id: string, ncsu: Record<string, string[]>, parent?: string) => ({ id, sources: { ncsu: { url: 'x' } }, raw: { ncsu }, facts: {}, ...(parent ? { parent } : {}) });
    const { file } = writeAudit({ meta, plants: [rec('aster', {}), rec('jasmine', {}), rec('unread', {}), rec('yew', { poison: { v: { severity: 'high' }, src: ['ncsu'], check: 'single' } }), rec('yew-cv', {}, { parent: 'yew' })] }, [
      read('aster', { 'Plant Type': ['Herbaceous Perennial'] }),
      read('jasmine', { 'Plant Type': ['Poisonous', 'Vine'] }), // (a bare tag: nothing said of people, nor "none")
      { id: 'unread', facts: {} },
      read('yew-cv', { 'Plant Type': ['Shrub'] }), // (its own page silent, its species rated: not "none")
    ], '2026-10-23', catalogWarnings);
    const poison = (id: string) => file.plants.find((p: { id: string }) => p.id === id).facts.poison;
    expect(poison('aster')).toEqual({ v: null, src: ['ncsu'] });
    expect(poison('jasmine')).toBeUndefined();
    expect(poison('unread')).toBeUndefined();
    expect(poison('yew-cv')).toBeUndefined();
    expect(catalogErrors(file)).toEqual([]);
  });
  it('holds back values that make a record implausible, and drops a nursery report on half a pair', () => {
    const { file, review } = run([rec('gg', { form: 'Perennial', height: { min: 0.5, max: 1, med: 0.75 }, zone_min: 6, zone_max: 9 })], [
      { id: 'gg', facts: { height: settled({ min: 0.08, max: 0.17 }), zone_min: settled(10), zone_max: { v: null, check: 'disputed', note: 'x' }, sun_most: settled('Part', 'Full'), sun_least: null } },
    ]);
    const gg = file.plants[0];
    expect(gg.facts.height).toEqual({ min: 0.5, max: 1, med: 0.75 }); // (1–2 in: inches read as feet?)
    expect(gg.facts.zone_min).toBe(6); // (10 against the older list's warm limit of 9: backwards)
    expect(gg.facts.sun_most).toEqual({ v: 'Part', src: ['ncsu'], check: 'single' }); // (Full from the shop is half a range)
    expect(review.map((r: { fact: string }) => r.fact)).toEqual(expect.arrayContaining(['height', 'zone_min']));
    expect(review.find((r: { fact: string }) => r.fact.includes('height'))).toMatchObject({ fact: 'height' }); // (the form isn't in doubt)
  });
  it('takes a height that only sharpens an old doubt, not one grown past double; keeps a report whose other half an earlier run sourced', () => {
    const shrub = (id: string) => rec(id, { form: 'Shrub', height: { min: 30, max: 40, med: 35 } });
    const { file } = run([shrub('pear'), shrub('slip')], [
      { id: 'pear', facts: { height: settled({ min: 30, max: 50 }) } }, { id: 'slip', facts: { height: settled({ min: 300, max: 400 }) } },
    ]);
    expect(file.plants[0].facts.height).toMatchObject({ v: { min: 30, max: 50 } });
    expect(file.plants[1].facts.height).toEqual({ min: 30, max: 40, med: 35 });
    const again = run([rec('z', { zone_min: { v: 5, src: ['ncsu'], check: 'single' } })], [{ id: 'z', facts: { zone_max: settled(8, 10) } }]);
    expect(again.file.plants[0].facts.zone_max.alt).toMatchObject({ v: 10 });
    expect(file.meta.sources['shop.com']).toBeUndefined(); // (cited nowhere now)
  });
  it("writes a cultivar's form as a person decided (scripts/catalog/decisions.json), from the forms its species' sources list", () => {
    const tree = 'its species is listed as a tree; a cultivar may be a tree or a shrub';
    const forms = (ncsu: string[], usda?: string[]) => [
      { fact: 'form', v: ncsu, src: 'ncsu', kind: 'authority' }, ...(usda ? [{ fact: 'form', v: usda, src: 'usda', kind: 'authority' }] : []),
    ];
    const disputed = { v: null, src: ['ncsu', 'usda'], check: 'disputed', note: tree };
    const ids = ['dwarf', 'both', 'cherry', 'twice', 'vine', 'shop', 'flagged', 'odd', 'four', 'open'];
    const plants = ids.map((id) => rec(id, { form: 'Shrub' }));
    const auditOf = (id: string, claims: unknown[]) => ({ id, claims, facts: { form: disputed } });
    const decisions = { form: {
      dwarf: { v: 'Shrub' }, both: { v: ['Tree', 'Shrub'] }, cherry: { v: 'Tree' }, twice: { v: ['Tree', 'Tree'] }, vine: { v: 'Vine' },
      shop: { v: 'Vine' }, flagged: { v: 'Vine' }, odd: { v: 'Palm' }, four: { v: ['Tree', 'Shrub', 'Vine', 'Perennial'] },
    } };
    const { file, review } = writeAudit({ meta: { ...meta, enums: { ...meta.enums, form: ['Shrub', 'Tree', 'Perennial', 'Vine'] } }, plants }, [
      auditOf('dwarf', forms(['Shrub', 'Tree'], ['Shrub', 'Tree'])), auditOf('both', forms(['Shrub', 'Tree'], ['Tree'])),
      auditOf('cherry', forms(['Tree'])), auditOf('twice', forms(['Tree'])), auditOf('vine', forms(['Tree'])),
      auditOf('shop', [...forms(['Tree']), { fact: 'form', v: ['Vine'], src: 'shop.com', kind: 'nursery' }]),
      auditOf('flagged', [...forms(['Tree']), { fact: 'form', v: ['Vine'], src: 'usda', kind: 'authority', flag: { text: 'x' } }]),
      auditOf('odd', forms(['Tree'])), auditOf('four', forms(['Tree', 'Shrub', 'Vine', 'Perennial'])), auditOf('open', forms(['Tree'])),
    ], '2026-10-23', catalogWarnings, decisions);
    const form = (id: string) => file.plants.find((p: { id: string }) => p.id === id).facts.form;
    // (Single, however many list it: the sources list the species as either form, and a person chose.)
    expect(form('dwarf')).toEqual({ v: 'Shrub', src: ['ncsu', 'usda'], check: 'single' });
    expect(form('both')).toEqual({ v: ['Tree', 'Shrub'], src: ['ncsu', 'usda'], check: 'single' }); // (NC State lists both: first)
    expect(form('cherry')).toEqual({ v: 'Tree', src: ['ncsu'], check: 'single' }); // (a shrub in the old list: now a tree)
    expect(form('twice')).toEqual({ v: 'Tree', src: ['ncsu'], check: 'single' }); // (one form, said twice)
    // A decision never adds a form: none listed, or only by a nursery or in a flag, a form the catalog lacks, or four.
    for (const id of ['vine', 'shop', 'flagged', 'odd', 'four', 'open']) expect(form(id), id).toBe('Shrub');
    expect(review.map((r: { id: string; note: string }) => [r.id, r.note])).toEqual([
      ['vine', `${tree}; the decision names a form its sources don't list (Vine)`],
      ['shop', `${tree}; the decision names a form its sources don't list (Vine)`],
      ['flagged', `${tree}; the decision names a form its sources don't list (Vine)`],
      ['odd', `${tree}; the decision names a form the catalog doesn't have (Palm)`],
      ['four', `${tree}; the decision names more than three forms`],
      ['open', tree], // (not decided: as it was, and still listed)
    ]);
    expect(catalogErrors(file)).toEqual([]);
  });
});

describe('writing bloom seasons and flower colors', () => {
  const file: CatalogFile = { meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { compendium: { title: 'old', trust: 'unverified' } }, enums: { form: ['Perennial'] } },
    plants: [{ id: 'aster', common: 'Aster', src: ['compendium'], audited: null, facts: { form: 'Perennial', bloom: { start: 9, end: 10, color: 'Lavender' } } },
      { id: 'phlox', common: 'Phlox', src: ['compendium'], audited: null, facts: { form: 'Perennial' } }] };
  const audit = [{ id: 'aster', claims: [{ src: 'ncsu', kind: 'authority' }, { src: 'usda', kind: 'authority' }], facts: {
    bloom_season: { v: ['fall'], src: ['ncsu', 'usda'], check: 'confirmed' },
    flower_color: { v: ['Purple/Lavender', 'Gray/Silver'], src: ['ncsu'], check: 'single' },
  } }, { id: 'phlox', claims: [{ src: 'nursery.com', kind: 'nursery' }], facts: {
    bloom_season: { v: ['May'], src: ['nursery.com'], check: 'reported' }, // (a month: not a season)
    flower_color: { v: ['Pink', 'Magenta'], src: ['nursery.com'], check: 'reported' }, // (magenta in none of NC State's groups: not "pink" alone)
  } }];
  const { file: out, review } = writeAudit(file, audit, '2026-10-25');
  it('writes them in the catalog\'s words, with their sources; the earlier list\'s months stay', () => {
    const f = out.plants[0].facts;
    expect(f.bloom_season).toEqual({ v: ['fall'], src: ['ncsu', 'usda'], check: 'confirmed' });
    expect(f.flower_color).toEqual({ v: ['purple', 'silver'], src: ['ncsu'], check: 'single' });
    expect(f.bloom).toEqual({ start: 9, end: 10, color: 'Lavender' });
    expect(catalogErrors(out)).toEqual([]);
  });
  it('refuses what isn\'t a season or a color it takes, and lists it', () => {
    expect(out.plants[1].facts.bloom_season).toBeUndefined();
    expect(out.plants[1].facts.flower_color).toBeUndefined();
    expect(review.filter((r: { id: string }) => r.id === 'phlox').map((r: { fact: string }) => r.fact).sort()).toEqual(['bloom_season', 'flower_color']);
  });
});

describe('writing the leaf facts', () => {
  const file: CatalogFile = { meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { compendium: { title: 'old', trust: 'unverified' } }, enums: { form: ['Shrub', 'Tree'] } },
    plants: [{ id: 'maple', common: 'Maple', src: ['compendium'], audited: null, facts: { form: 'Tree', fall_color: true } }] };
  const leafAudit = [{ id: 'maple', claims: [{ src: 'ncsu', kind: 'authority' }, { src: 'usda', kind: 'authority' }], facts: {
    fall_color: { v: false, src: ['ncsu'], check: 'single' }, // (NC State: "Insignificant")
    leaf_color: { v: ['green', 'silver'], src: ['ncsu', 'usda'], check: 'confirmed' },
    foliage: { v: 'semi-evergreen', src: ['ncsu'], check: 'single' },
    growth_rate: { v: 'rapid', src: ['ncsu'], check: 'single' }, // (not a word the catalog takes)
    needles: { v: true, src: ['ncsu'], check: 'single' },
    fall_colors: { v: ['gold', 'teal'], src: ['ncsu'], check: 'single' }, // (teal isn't one)
  } }];
  const { file: out, review } = writeAudit(file, leafAudit, '2026-10-24');
  const f = out.plants[0].facts;
  it('writes them with their sources, a sourced "no" fall color included', () => {
    expect(f.fall_color).toEqual({ v: false, src: ['ncsu'], check: 'single' });
    expect(f.leaf_color).toEqual({ v: ['green', 'silver'], src: ['ncsu', 'usda'], check: 'confirmed' });
    expect(f.foliage).toEqual({ v: 'semi-evergreen', src: ['ncsu'], check: 'single' });
    expect(f.needles).toEqual({ v: true, src: ['ncsu'], check: 'single' });
    expect(catalogErrors(out)).toEqual([]);
  });
  it('refuses words the catalog doesn\'t take, and lists them', () => {
    expect(f.growth_rate).toBeUndefined();
    expect(f.fall_colors).toBeUndefined();
    expect(review.map((r: { fact: string }) => r.fact).sort()).toEqual(['fall_colors', 'growth_rate']);
  });
});

describe('writing what NC State lists: attracts, tolerates, problems for animals, upkeep, thorns, winter interest', () => {
  const file: CatalogFile = { meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { compendium: { title: 'old', trust: 'unverified' } }, enums: { form: ['Shrub', 'Tree'] } },
    plants: [
      { id: 'rose', common: 'Carolina rose', botanical: 'Rosa carolina', src: ['compendium'], audited: null, facts: { form: 'Shrub', winter_interest: false } },
      { id: 'thornless', common: 'Honeylocust (var. inermis)', botanical: 'Gleditsia triacanthos var. inermis', src: ['compendium'], audited: null, facts: { form: 'Tree' } },
    ] };
  const ncsu = [{ src: 'ncsu', kind: 'authority' }];
  const rows = [
    { id: 'rose', claims: ncsu, facts: {
      attracts: { v: ['pollinators', 'songbirds'], src: ['ncsu'], check: 'single' },
      tolerates: { v: ['drought', 'heat', 'teleportation'], src: ['ncsu'], check: 'single' }, // (not a word it takes)
      tox_pets: { v: ['dogs', 'cats'], src: ['ncsu'], check: 'single' },
      maintenance_level: { v: 'medium', src: ['ncsu'], check: 'single' },
      thorns: { v: true, src: ['ncsu'], check: 'single' },
      winter_interest: { v: true, src: ['ncsu'], check: 'single' },
      bark: { v: ['shredding'], src: ['ncsu'], check: 'single' },
      fruit_season: { v: ['fall', 'winter'], src: ['ncsu'], check: 'single' },
      fruit_color: { v: ['red/burgundy'], src: ['ncsu'], check: 'single' },
      stem_color: { v: ['red'], src: ['ncsu'], check: 'single' }, // (not NC State's group: refused)
    } },
    { id: 'thornless', claims: ncsu, facts: { thorns: { v: true, src: ['ncsu'], check: 'single' } } },
  ];
  const { file: out, review } = writeAudit(file, rows, '2026-10-25');
  const [rose, thornless] = out.plants;
  it('writes them under their catalog names, with their sources; a sourced yes replaces the earlier list\'s no', () => {
    expect(rose.facts.attracts).toEqual({ v: ['pollinators', 'songbirds'], src: ['ncsu'], check: 'single' });
    expect(rose.facts.problem_for).toEqual({ v: ['dogs', 'cats'], src: ['ncsu'], check: 'single' });
    expect(rose.facts.maintenance_level).toEqual({ v: 'medium', src: ['ncsu'], check: 'single' });
    expect(rose.facts.thorns).toEqual({ v: true, src: ['ncsu'], check: 'single' });
    expect(rose.facts.winter_interest).toEqual({ v: true, src: ['ncsu'], check: 'single' });
    expect(rose.facts.bark).toEqual({ v: ['shredding'], src: ['ncsu'], check: 'single' });
    expect(rose.facts.fruit_season).toEqual({ v: ['fall', 'winter'], src: ['ncsu'], check: 'single' });
    expect(rose.facts.fruit_color).toEqual({ v: ['red/burgundy'], src: ['ncsu'], check: 'single' });
    expect(catalogErrors(out)).toEqual([]);
  });
  it('refuses a word it doesn\'t take, and holds back thorns on a plant named for having none', () => {
    expect(rose.facts.tolerates).toBeUndefined();
    expect(thornless.facts.thorns).toBeUndefined();
    expect(review.map((r: { id: string; fact: string; note: string }) => `${r.id} ${r.fact} ${r.note}`).sort()).toEqual([
      'rose stem_color value the catalog can\'t take: ["red"]', 'rose tolerates value the catalog can\'t take: ["drought","heat","teleportation"]', 'thornless thorns thorns, but named thornless',
    ]);
  });
});

describe('values read from a description (prose.mjs), as written', () => {
  const file: CatalogFile = {
    meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { compendium: { title: 'old', trust: 'unverified' }, ncsu: { title: 'NC State', trust: 'reference' } }, enums: { form: ['Perennial', 'Vine'] } },
    plants: [
      { id: 'pincushion', common: 'Pincushion flower', src: ['compendium'], audited: '2026-10-26', facts: { form: 'Perennial', foliage: { v: 'evergreen', src: ['ncsu'], check: 'single', from: 'description' } } },
      { id: 'clematis', common: 'Clematis', src: ['compendium'], audited: null, facts: { form: 'Vine', habit: 'Twining' } },
    ],
  };
  const read = (v: string) => ({ v, src: ['ncsu'], check: 'single', from: 'description' });
  const { file: out, review } = writeAudit(file, [
    { id: 'pincushion', claims: [{ src: 'ncsu', kind: 'authority' }], facts: {} },
    { id: 'clematis', claims: [{ src: 'ncsu', kind: 'authority' }], facts: { habit: read('Clumping') } },
  ], '2026-10-27');
  it('takes out a value the rules no longer read (a misread, since fixed), and says so in the review', () => {
    expect(out.plants[0].facts.foliage).toBeUndefined();
    expect(review).toContainEqual(expect.objectContaining({ id: 'pincushion', fact: 'foliage', note: expect.stringMatching(/^taken out: "evergreen", read from ncsu's description/) }));
  });
  it("doesn't write Clumping for a vine or a tree: its clump is its base or its trunks", () => {
    expect(out.plants[1].facts.habit).toBe('Twining');
  });
});
