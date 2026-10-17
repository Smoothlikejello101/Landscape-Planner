import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
    format: 'lp-catalog', version: 2,
    sources: { compendium: { title: 'old', trust: 'unverified' }, mobot: { title: 'Missouri Botanical Garden', trust: 'reference' }, ncsu: { title: 'NC State Extension', trust: 'reference' } },
    enums: { form: ['Shrub', 'Perennial'] },
  };
  const rec = (r: Partial<CatalogRecord>): CatalogRecord => ({ id: 'x', common: 'X', src: ['compendium'], audited: null, facts: {}, ...r });
  const species = rec({
    id: 'hydrangea-arborescens', common: 'Smooth hydrangea', botanical: 'Hydrangea arborescens', audited: '2026-11-01', src: ['mobot'],
    facts: { form: 'Shrub', width: { min: 3, max: 6, med: 4.5 }, tox: { dog: 'toxic', cat: 'toxic' }, bloom: { v: { start: 6, end: 8, color: 'White' }, src: ['mobot', 'ncsu'], at: 'MO', check: 'agree' } },
  });
  const cultivar = rec({ id: 'haas-halo', common: "Smooth hydrangea 'Haas' Halo'", short: "'Haas' Halo' hydrangea", parent: 'hydrangea-arborescens', audited: '2026-11-02', src: ['ncsu'], facts: { width: { min: 4, max: 6 } } });

  it('fill a cultivar from its species, except its size, and say so', () => {
    const [, c] = resolveCatalog({ meta, plants: [species, cultivar] });
    expect(c).toMatchObject({ short: "'Haas' Halo' hydrangea", parent: 'hydrangea-arborescens', form: 'Shrub', tox: { dog: 'toxic' }, width: { min: 4, max: 6 } });
    expect(c.prov!.tox).toEqual({ src: ['mobot'], inherited: true });
    expect(c.prov!.bloom).toEqual({ src: ['mobot', 'ncsu'], at: 'MO', check: 'agree', inherited: true });
    expect(c.prov!.width).toEqual({ src: ['ncsu'] });
    expect(c.unverified).toBeUndefined();
    // A species not yet audited makes what the cultivar takes from it unverified too.
    const [, c2] = resolveCatalog({ meta, plants: [{ ...species, audited: null }, cultivar] });
    expect(c2.unverified).toBe(true);
  });
  it('treat a null fact as known unknown (left out), and a cultivar never inherits size', () => {
    const [, c] = resolveCatalog({ meta, plants: [species, rec({ id: 'c', common: 'C', parent: 'hydrangea-arborescens', facts: { tox: null } })] });
    expect(c.tox).toBeUndefined(); // the cultivar's own "unknown" wins over the species
    expect(c.width).toBeUndefined();
  });
  it('are checked for anything that would break the app', () => {
    const bad: CatalogFile = { meta, plants: [
      rec({ id: 'a', facts: { form: 'Tree', hight: 3 } }),
      rec({ id: 'a', parent: 'b' }),
      rec({ id: 'b', parent: 'a', facts: { bloom: { v: { start: 13 }, src: ['nowhere'] } } }),
      rec({ id: 'Bad Id', facts: { tox: { dog: 'safe' }, width: { v: { min: 2 }, at: 'Arkansas' } } }),
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
    ]);
    expect(catalogErrors({ meta, plants: [species, cultivar] })).toEqual([]);
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
