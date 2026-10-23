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
});
