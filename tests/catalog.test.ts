import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain JS script
import { convertV1 } from '../scripts/catalog/convert-v1.mjs';
import { catalogErrors, catalogWarnings, isCatalogV2, resolveCatalog, type CatalogFile, type CatalogRecord } from '../src/catalog';

const shipped = JSON.parse(readFileSync(new URL('../public/plants.json', import.meta.url), 'utf8'));

describe('the decisions the build applies (scripts/catalog/decisions.json)', () => {
  const decisions = JSON.parse(readFileSync(new URL('../scripts/catalog/decisions.json', import.meta.url), 'utf8'));
  const ids = new Set((shipped as CatalogFile).plants.map((r) => r.id));
  it('name plants the catalog has, forms it has, and who decided when', () => {
    for (const kind of ['form', 'edible', 'nativeShown', 'genusPage']) {
      for (const [id, d] of Object.entries(decisions[kind] ?? {}) as [string, { decided?: string; by?: string }][]) {
        expect(ids.has(id), `${kind}: ${id}`).toBe(true);
        expect(d.decided, `${kind}: ${id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(d.by, `${kind}: ${id}`).toBeTruthy();
      }
    }
    for (const [id, d] of Object.entries(decisions.form ?? {}) as [string, { v: string | string[] }][]) {
      for (const f of [d.v].flat()) expect((shipped as CatalogFile).meta.enums?.form, `${id}: ${f}`).toContain(f);
      // (Applied: written with its sources, not left as the older list's.)
      expect((shipped as CatalogFile).plants.find((r) => r.id === id)!.facts.form, id).toMatchObject({ v: d.v, check: 'single' });
    }
    for (const [name, d] of Object.entries(decisions.kewNames ?? {}) as [string, { author?: string }][]) expect(d.author, name).toBeTruthy();
  });
});

describe('the shipped catalog', () => {
  it('is version 2 with no structural problems', () => {
    expect(isCatalogV2(shipped)).toBe(true);
    expect(catalogErrors(shipped)).toEqual([]);
  });
  it('still has every plant; those the audit has not reached are marked unverified', () => {
    const plants = resolveCatalog(shipped);
    const records = (shipped as CatalogFile).plants;
    expect(plants).toHaveLength(records.length);
    // Every plant of the first list; the rest added from NC State's Plant Toolbox, each with the page it was found
    // on (scripts/catalog/added-plants.json: so it's never added twice).
    // (820, and 5 cultivars split from its records of several: decisions.json `split`, named by the record.)
    expect(records.filter((r) => r.src?.includes('compendium'))).toHaveLength(825);
    expect(records.filter((r) => r.src?.includes('compendium') && r.inherits).length).toBe(5);
    const pages = JSON.parse(readFileSync(new URL('../scripts/catalog/added-plants.json', import.meta.url), 'utf8')).pages;
    const added = records.filter((r) => !r.src?.includes('compendium'));
    expect(added.filter((r) => r.src?.join() !== 'ncsu' || !pages[r.id]).map((r) => r.id)).toEqual([]);
    expect(added.length).toBeGreaterThan(2000);
    const unaudited = (shipped as CatalogFile).plants.filter((r) => !r.audited).map((r) => r.id);
    expect(plants.filter((p) => p.unverified).map((p) => p.id)).toEqual(unaudited);
    // The rest say they're partly checked while any detail still comes only from the older list.
    expect(plants.filter((p) => p.partlyChecked).length).toBeGreaterThan(0);
    expect(plants.some((p) => p.partlyChecked && p.unverified)).toBe(false);
    // An audited fact names its sources and how sure it is; what the audit couldn't settle stays the older list's.
    // Where sources disagree, the value more back (on a tie, the cautious one) leads, the other beside it.
    const bs = plants.find((p) => p.id === 'cephalanthus-occidentalis')!;
    expect(bs).toMatchObject({ common: 'Buttonbush', form: 'Shrub', width: { min: 3, max: 6, med: 4.5 } });
    expect(bs.prov!.width).toEqual({ src: ['ncsu', 'ufl.edu'], check: 'confirmed' });
    expect(bs.prov!.zone_max).toEqual({ src: ['ncsu'], check: 'single', alt: { v: 11.5, src: ['ufl.edu'], check: 'single' } }); // (NC State 9b, UF/IFAS 11b: the colder leads)
    // A tree is one form: rusty blackhaw is a tree and a shrub to NC State and USDA alike. A dwarf cultivar of a
    // tree, with no page of its own, takes the form a person chose from its species' (scripts/catalog/decisions.json).
    expect(plants.find((p) => p.id === 'viburnum-rufidulum')).toMatchObject({ form: 'Tree', forms: ['Tree', 'Shrub'], prov: { form: { src: ['ncsu', 'usda'], check: 'confirmed' } } });
    // Poisonous to people, from NC State, beside an edible decided by a person (mayapple's ripe fruit).
    expect(plants.find((p) => p.id === 'podophyllum-peltatum')).toMatchObject({ edible: true, poison: { severity: 'high', parts: ['leaves', 'roots', 'seeds', 'stems'], skin: true }, prov: { poison: { src: ['ncsu'], check: 'single' }, edible: { src: ['ncsu'] } } });
    expect(plants.filter((p) => p.poison).length).toBeGreaterThan(100);
    // Leaves, from NC State and USDA's plant traits: red maple's in full; a cultivar keeps its species' winter
    // habit, never its leaf color (bred to change).
    expect(plants.find((p) => p.id === 'acer-rubrum')).toMatchObject({ foliage: 'deciduous', fall_color: true, fall_colors: ['gold', 'red'], growth_rate: 'fast',
      prov: { foliage: { src: ['ncsu', 'usda'], check: 'confirmed' }, growth_rate: { src: ['ncsu', 'usda'], check: 'confirmed' } } });
    expect(plants.filter((p) => p.foliage).length).toBeGreaterThan(250); // (USDA's only of trees and shrubs: most herbs have none)
    expect(plants.filter((p) => p.parent && p.leaf_color && !(shipped as CatalogFile).plants.find((r) => r.id === p.id)?.facts.leaf_color)).toEqual([]);
    expect(plants.find((p) => p.id === 'ilex-vomitoria-nana-schillings')).toMatchObject({ form: 'Shrub', prov: { form: { src: ['ncsu', 'usda'], check: 'single' } } });
    expect(new Set(plants.flatMap((p) => p.forms ?? [p.form]).filter((f) => f?.startsWith('Tree')))).toEqual(new Set(['Tree']));
    expect((shipped as CatalogFile).meta.sources['ufl.edu']).toMatchObject({ trust: 'reference' });
  });
  it('cites every source it uses, and nursery sources as nurseries', () => {
    const sources = (shipped as CatalogFile).meta.sources;
    expect(sources['newmoonnursery.com']).toMatchObject({ trust: 'nursery' });
    expect(sources.ncsu).toMatchObject({ trust: 'reference' });
  });
});

describe('records', () => {
  const meta: CatalogFile['meta'] = {
    format: 'lp-catalog', version: 2, zones: 'half',
    sources: { compendium: { title: 'old', trust: 'unverified' }, mobot: { title: 'Missouri Botanical Garden', trust: 'reference' }, ncsu: { title: 'NC State Extension', trust: 'reference' } },
    enums: { form: ['Shrub', 'Perennial'] },
  };
  const rec = (r: Partial<CatalogRecord>): CatalogRecord => ({ id: 'x', common: 'X', src: ['compendium'], audited: null, facts: {}, ...r });
  const species = rec({
    id: 'hydrangea-arborescens', common: 'Smooth hydrangea', botanical: 'Hydrangea arborescens', audited: '2026-11-01', src: ['mobot'],
    facts: { form: 'Shrub', width: { min: 3, max: 6, med: 4.5 }, tox: { dog: 'toxic', cat: 'toxic' }, bloom: { v: { start: 6, end: 8, color: 'White' }, src: ['mobot', 'ncsu'], at: 'MO', check: 'agree' } },
  });
  const cultivar = rec({ id: 'haas-halo', common: "Smooth hydrangea 'Haas' Halo'", short: "'Haas' Halo' hydrangea", parent: 'hydrangea-arborescens', audited: '2026-11-02', src: ['ncsu'], facts: { width: { min: 4, max: 6 } } });

  it('fill a cultivar from its species with what comes with the species, and say so', () => {
    const [, c] = resolveCatalog({ meta, plants: [species, cultivar] });
    expect(c).toMatchObject({ short: "'Haas' Halo' hydrangea", parent: 'hydrangea-arborescens', form: 'Shrub', tox: { dog: 'toxic' }, width: { min: 4, max: 6 } });
    expect(c.prov!.tox).toEqual({ src: ['mobot'], inherited: true });
    expect(c.prov!.width).toEqual({ src: ['ncsu'] });
    expect(c.bloom).toBeUndefined(); // flower color is what cultivars are bred to change
    // Whether it keeps its leaves in winter comes with the species; leaf color and growth rate are bred to change.
    const leafy = rec({ ...species, facts: { ...species.facts, foliage: { v: 'deciduous', src: ['ncsu'], check: 'single' }, leaf_color: { v: ['green'], src: ['ncsu'], check: 'single' }, growth_rate: { v: 'fast', src: ['ncsu'], check: 'single' } } });
    const [, leafyC] = resolveCatalog({ meta, plants: [leafy, cultivar] });
    expect(leafyC).toMatchObject({ foliage: 'deciduous', prov: { foliage: { src: ['ncsu'], inherited: true } } });
    expect(leafyC.leaf_color).toBeUndefined();
    expect(leafyC.growth_rate).toBeUndefined();
    // When it blooms comes with the species; its flowers' color is bred to change.
    const flowery = rec({ ...species, facts: { ...species.facts, bloom_season: { v: ['summer'], src: ['ncsu'], check: 'single' }, flower_color: { v: ['white'], src: ['ncsu'], check: 'single' } } });
    const [, floweryC] = resolveCatalog({ meta, plants: [flowery, cultivar] });
    expect(floweryC).toMatchObject({ bloom_season: ['summer'], prov: { bloom_season: { src: ['ncsu'], inherited: true } } });
    expect(floweryC.flower_color).toBeUndefined();
    expect(c.unverified).toBeUndefined();
    // Audited, but the cultivar's form and toxicity come from Missouri's page: sourced, so fully checked.
    expect(c.partlyChecked).toBeUndefined();
    // A detail still resting only on the older list makes it partly checked (a known unknown doesn't).
    const [old] = resolveCatalog({ meta, plants: [rec({ ...species, facts: { ...species.facts, habit: { v: 'Mounding', src: ['compendium'] }, edible: { v: null, src: ['compendium'] } } })] });
    expect(old.partlyChecked).toBe(true);
    const [none] = resolveCatalog({ meta, plants: [rec({ ...species, facts: { ...species.facts, edible: { v: null, src: ['compendium'] } } })] });
    expect(none.partlyChecked).toBeUndefined();
    // What a cultivar takes from its species counts too: an older-list detail there leaves the cultivar partly checked.
    const [, inheritsOld] = resolveCatalog({ meta, plants: [rec({ ...species, facts: { ...species.facts, native: { v: 'Native', src: ['compendium'] } } }), cultivar] });
    expect(inheritsOld.prov!.native).toEqual({ src: ['compendium'], inherited: true });
    expect(inheritsOld.partlyChecked).toBe(true);
    // A species not yet audited makes what the cultivar takes from it unverified too.
    const [, c2] = resolveCatalog({ meta, plants: [{ ...species, audited: null }, cultivar] });
    expect(c2.unverified).toBe(true);
  });
  it('treat a null fact as known unknown (left out, but recorded), and a cultivar never inherits size or trunk', () => {
    const sp = { ...species, facts: { ...species.facts, trunk: 2 } };
    const [, c] = resolveCatalog({ meta, plants: [sp, rec({ id: 'c', common: 'C', parent: 'hydrangea-arborescens', facts: { tox: null } })] });
    expect(c.tox).toBeUndefined(); // the cultivar's own "unknown" wins over the species
    expect(c.prov!.tox).toEqual({ src: ['compendium'], unknown: true });
    expect(c.width).toBeUndefined();
    expect(c.trunk).toBeUndefined();
  });
  it('are checked for anything that would break the app', () => {
    const bad: CatalogFile = { meta, plants: [
      rec({ id: 'a', facts: { form: 'Tree', hight: 3 } }),
      rec({ id: 'a', parent: 'b' }),
      rec({ id: 'b', parent: 'a', facts: { bloom: { v: { start: 13 }, src: ['nowhere'] } } }),
      rec({ id: 'Bad Id', facts: { tox: { dog: 'safe' }, width: { v: { min: 2 }, at: 'Arkansas' } } }),
      { ...rec({ id: 'typos', short: 3 as unknown as string, facts: { height: [], tox: {}, bloom: { v: { start: 5 }, sources: ['mobot'] } } }), parnet: 'a' } as CatalogRecord,
    ] };
    expect(catalogErrors(bad)).toEqual([
      'a: id used 2 times',
      'a.form: unexpected value "Tree"',
      'a: unknown fact hight',
      'a: parent b is itself a cultivar',
      'b: parent a is itself a cultivar',
      'b.bloom: unknown source nowhere',
      'b.bloom: unexpected value {"start":13}',
      'Bad Id: id must be lowercase letters, digits and dashes',
      'Bad Id.tox: unexpected value {"dog":"safe"}',
      'Bad Id.width: "at" must be a state code',
      'typos: unknown key parnet',
      'typos: short must be text',
      'typos.height: unexpected value []',
      'typos.tox: unexpected value {}',
      'typos.bloom: unknown key sources',
    ]);
    expect(catalogErrors({ meta: { ...meta, sources: { x: { title: 'X', trust: 'maybe' as 'reference' } } }, plants: [] })).toEqual(['source x: needs a title and a trust of reference, nursery, observation or unverified']);
    expect(catalogErrors({ meta, plants: [species, cultivar] })).toEqual([]);
    // Zone values: half-zones from 1 (1a) to 13.5 (13b), nothing finer.
    const z = (v: number) => catalogErrors({ meta, plants: [rec({ id: 'z', facts: { zone_min: v } })] });
    for (const ok of [1, 7, 7.5, 13.5]) expect(z(ok)).toEqual([]);
    for (const bad of [0.5, 7.25, 14]) expect(z(bad)).toEqual([`z.zone_min: unexpected value ${bad}`]);
    // Poisonous to people: NC State's severity, the parts it names, skin irritation; {} is poisonous, nothing more said.
    const pz = (v: unknown) => catalogErrors({ meta, plants: [rec({ id: 'p', facts: { poison: { v, src: ['ncsu'], check: 'single' } } })] });
    for (const ok of [{}, { severity: 'high', parts: ['seeds'], skin: true }, { severity: 'low' }, { skin: true }]) expect(pz(ok), JSON.stringify(ok)).toEqual([]);
    for (const bad of [{ severity: 'severe' }, { severity: null }, { parts: [] }, { parts: 'seeds' }, { parts: ['seeds', 'seeds'] }, { parts: ['Seeds'] }, { skin: false }, { color: 'red' }, 'yes']) expect(pz(bad), JSON.stringify(bad)).toHaveLength(1);
    expect(pz(null)).toEqual([]); // (NC State read, nothing said of poison)
    // Leaves: colors and fall colors as lists of the catalog's words, each once; one word for winter and growth.
    const lf = (k: string, v: unknown) => catalogErrors({ meta, plants: [rec({ id: 'l', facts: { [k]: { v, src: ['ncsu'], check: 'single' } } })] });
    for (const [k, ok] of [['leaf_color', ['green', 'silver']], ['fall_colors', ['gold']], ['foliage', 'semi-evergreen'], ['growth_rate', 'fast'], ['needles', true]] as const) expect(lf(k, ok), k).toEqual([]);
    for (const [k, bad] of [['leaf_color', []], ['leaf_color', ['green', 'green']], ['leaf_color', ['Green']], ['fall_colors', ['teal']], ['foliage', 'sometimes'], ['growth_rate', 'rapid'], ['needles', 'yes']] as const) expect(lf(k, bad), `${k} ${JSON.stringify(bad)}`).toHaveLength(1);
    // A file must say its zones are on the half-zone scale.
    const { zones: _z, ...older } = meta;
    expect(catalogErrors({ meta: older as CatalogFile['meta'], plants: [] })).toEqual(['meta.zones must be "half" (zones on the half-zone scale; see docs/catalog-format.md)']);
  });
  it('read an older file\'s whole-zone zone_max as through the b half', () => {
    const p = rec({ id: 'p', facts: { zone_min: 5, zone_max: 9 } });
    const { zones: _z, ...older } = meta;
    expect(resolveCatalog({ meta: older as CatalogFile['meta'], plants: [p] })[0]).toMatchObject({ zone_min: 5, zone_max: 9.5 });
    expect(resolveCatalog({ meta, plants: [p] })[0]).toMatchObject({ zone_min: 5, zone_max: 9 });
  });
  it('take a list of forms, primary first, for a plant that grows more than one way', () => {
    const r = rec({ id: 'redbud', facts: { form: ['Shrub', 'Perennial'] } });
    const [p] = resolveCatalog({ meta, plants: [r] });
    expect(p).toMatchObject({ form: 'Shrub', forms: ['Shrub', 'Perennial'] });
    expect(catalogErrors({ meta, plants: [r] })).toEqual([]);
    for (const bad of [[], ['Shrub', 'Shrub'], ['Shrub', 'Tree'], ['Shrub', 'Perennial', 'Shrub', 'Perennial']]) {
      expect(catalogErrors({ meta, plants: [rec({ id: 'b', facts: { form: bad } })] })).toEqual([`b.form: unexpected value ${JSON.stringify(bad)}`]);
    }
  });
  it('keep what nurseries report beside the authority\'s value, and check it like any value', () => {
    const r = rec({ id: 'h', facts: { sun_most: { v: 'Shade', src: ['ncsu'], check: 'single', alt: { v: 'Part', src: ['mobot'], check: 'reported' } } } });
    const [p] = resolveCatalog({ meta, plants: [r] });
    expect(p.sun_most).toBe('Shade');
    expect(p.reported).toEqual({ sun_most: 'Part' });
    expect(p.prov!.sun_most.alt).toEqual({ v: 'Part', src: ['mobot'], check: 'reported' });
    expect(catalogErrors({ meta, plants: [r] })).toEqual([]);
    const bad = rec({ id: 'b', facts: { sun_most: { v: 'Shade', src: ['ncsu'], alt: { v: 'Lots', src: ['mobot'], check: 'maybe' } } } });
    expect(catalogErrors({ meta, plants: [bad] })).toEqual(['b.sun_most: alt needs a value, its sources, and a check of confirmed, single, likely or reported']);
    // (Where sources disagree, the side that didn't lead may be an authority's: its check is an authority's.)
    const byAuthority = rec({ id: 'a', facts: { sun_most: { v: 'Part', src: ['mobot'], check: 'likely', alt: { v: 'Shade', src: ['ncsu'], check: 'single' } } } });
    expect(catalogErrors({ meta, plants: [byAuthority] })).toEqual([]);
    const tox = rec({ id: 't', facts: { tox: { v: { dog: 'toxic' }, src: ['ncsu'], alt: { v: { dog: 'nontoxic' }, src: ['mobot'], check: 'reported' } } } });
    expect(catalogErrors({ meta, plants: [tox] })).toEqual(["t.tox: no other value (alt) is taken for tox"]);
    expect(resolveCatalog({ meta, plants: [tox] })[0].reported).toBeUndefined();
    const same = rec({ id: 's', facts: { sun_most: { v: 'Shade', src: ['ncsu'], alt: { v: 'Shade', src: ['mobot'], check: 'reported' } } } });
    expect(catalogErrors({ meta, plants: [same] })).toEqual(['s.sun_most: alt is for a value that differs from the one shown']);
    // An older file's whole-zone zone_max is read half a zone warmer, nurseries' too.
    const { zones: _z, ...older } = meta;
    const z = rec({ id: 'z', facts: { zone_max: { v: 8, src: ['ncsu'], alt: { v: 9, src: ['mobot'], check: 'reported' } } } });
    expect(resolveCatalog({ meta: older as CatalogFile['meta'], plants: [z] })[0]).toMatchObject({ zone_max: 8.5, reported: { zone_max: 9.5 } });
  });
  it('list implausible values for the audit', () => {
    const w = catalogWarnings({ meta, plants: [rec({ id: 'p', common: "Coneflower 'Magnus'", botanical: 'Echinacea purpurea', facts: { form: 'Perennial', height: { min: 30, max: 36 }, zone_min: 9, zone_max: 3 } })] });
    expect(w).toEqual([
      'p: 36 ft is tall for a perennial',
      'p: zones backwards (9 > 3)',
      "p: named as a cultivar, but its botanical name doesn't say which",
      'p: no spread',
    ]);
  });
});

describe('converting the first catalog', () => {
  const v1 = { meta: { enums: { nectar: ['Low', 'High'] } }, plants: [
    { id: 'monarda-didyma', common: "Beebalm 'Jacob Cline'", botanical: 'Monarda didyma', host: 'Hermit sphinx' },
    { id: 'monarda-didyma-rw', common: "Beebalm 'Raspberry Wine'", botanical: "Monarda didyma 'Raspberry Wine'" },
    { id: 'panicum-n', common: "Switchgrass 'Northwind'", botanical: 'Panicum virgatum' },
    { id: 'panicum', common: 'Switchgrass (species)', botanical: 'Panicum virgatum', host: 'Skippers', width: null, zone_min: 4, zone_max: 9 },
    { id: 'panicum-s', common: "Switchgrass 'Shenandoah'", botanical: "Panicum virgatum 'Shenandoah'" },
  ] };
  const out = convertV1(v1, '2026-10-17') as CatalogFile;
  it('keeps every value, sourced to the first compendium and unaudited', () => {
    expect(out.plants[3]).toEqual({ id: 'panicum', common: 'Switchgrass (species)', botanical: 'Panicum virgatum', src: ['compendium'], audited: null, facts: { host: 'Skippers', zone_min: 4, zone_max: 9.5 } });
    expect(catalogErrors(out)).toEqual([]);
  });
  it('links a cultivar only to a record that is clearly its species', () => {
    expect(out.plants.map((p) => p.parent ?? '-')).toEqual(['-', '-', '-', '-', 'panicum']);
    // Jacob Cline is a cultivar filed under the species name: Raspberry Wine doesn't inherit from it.
  });
});
