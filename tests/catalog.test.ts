import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain JS script
import { convertV1 } from '../scripts/catalog/convert-v1.mjs';
import { catalogErrors, catalogWarnings, isCatalogV2, resolveCatalog, type CatalogFile, type CatalogRecord } from '../src/catalog';

const shipped = JSON.parse(readFileSync(new URL('../public/plants.json', import.meta.url), 'utf8'));

describe('the shipped catalog', () => {
  it('is version 2 with no structural problems', () => {
    expect(isCatalogV2(shipped)).toBe(true);
    expect(catalogErrors(shipped)).toEqual([]);
  });
  it('still has every plant, all marked unverified until audited', () => {
    const plants = resolveCatalog(shipped);
    expect(plants).toHaveLength(820);
    const unaudited = (shipped as CatalogFile).plants.filter((r) => !r.audited).map((r) => r.id);
    expect(plants.filter((p) => p.unverified).map((p) => p.id)).toEqual(unaudited);
    const bs = plants.find((p) => p.id === 'cephalanthus-occidentalis')!;
    expect(bs).toMatchObject({ common: 'Buttonbush', form: 'Shrub', width: { min: 4, max: 6, med: 5 } });
    expect(bs.prov!.width).toEqual({ src: ['compendium'] });
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
    expect(c.unverified).toBeUndefined();
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
    expect(catalogErrors({ meta: { ...meta, sources: { x: { title: 'X', trust: 'maybe' as 'reference' } } }, plants: [] })).toEqual(['source x: needs a title and a trust of reference, observation or unverified']);
    expect(catalogErrors({ meta, plants: [species, cultivar] })).toEqual([]);
    // Zone values: half-zones from 1 (1a) to 13.5 (13b), nothing finer.
    const z = (v: number) => catalogErrors({ meta, plants: [rec({ id: 'z', facts: { zone_min: v } })] });
    for (const ok of [1, 7, 7.5, 13.5]) expect(z(ok)).toEqual([]);
    for (const bad of [0.5, 7.25, 14]) expect(z(bad)).toEqual([`z.zone_min: unexpected value ${bad}`]);
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
