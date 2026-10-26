import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { applySplits, linkCultivars } from '../scripts/catalog/split.mjs';
import { catalogErrors, catalogWarnings, resolveCatalog, type CatalogFile } from '../src/catalog';

// A record of several cultivars, made one record per cultivar (decided with Jason, 2026-10-25).
const file = (): CatalogFile => ({
  meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { compendium: { title: 'old', trust: 'unverified' }, ncsu: { title: 'NC State', trust: 'reference' } } },
  plants: [
    { id: 'carya-illinoinensis', common: 'Pecan', botanical: 'Carya illinoinensis', src: ['ncsu'], audited: '2026-10-24', facts: {
      form: 'Tree', height: { v: { min: 70, max: 100, med: 85 }, src: ['ncsu'] }, width: { v: { min: 40, max: 75, med: 57.5 }, src: ['ncsu'] }, zone_min: 5, zone_max: 9.5 } },
    { id: 'carya-illinoinensis-kanza-lakota', common: 'Pecan', botanical: "Carya illinoinensis ('Kanza' / 'Lakota')", src: ['compendium'], audited: '2026-10-25', facts: {
      form: 'Tree', height: { v: { min: 70, max: 100, med: 85 }, src: ['ncsu'] } } },
    { id: 'acer-palmatum', common: 'Japanese maple', botanical: 'Acer palmatum', src: ['ncsu'], audited: '2026-10-24', facts: { form: 'Tree' } },
    { id: 'acer-palmatum-seiryu', common: "Japanese Maple 'Seiryu'", botanical: "Acer palmatum 'Seiryu'", parent: 'acer-palmatum', src: ['ncsu'], audited: '2026-10-24', facts: { form: 'Tree' } },
    { id: 'acer-palmatum-bloodgood-seiryu', common: 'Japanese maple', botanical: "Acer palmatum ('Bloodgood' / 'Seiryu')", src: ['compendium'], audited: '2026-10-25', facts: { form: 'Tree' } },
  ],
});
const decisions = { split: {
  'carya-illinoinensis-kanza-lakota': { keep: { cultivar: 'Lakota', common: "Pecan 'Lakota'" }, others: [{ cultivar: 'Kanza', common: "Pecan 'Kanza'", page: null }] },
  'acer-palmatum-bloodgood-seiryu': { keep: { cultivar: 'Bloodgood', common: "Japanese maple 'Bloodgood'" }, others: [{ cultivar: 'Seiryu', page: 'acer-palmatum-seiryu' }] },
} };

describe('splitting a record of several cultivars', () => {
  it('keeps the record, its id and facts, for the cultivar it kept, pointed at its species; adds a cultivar with no page', () => {
    const f = file();
    const done = applySplits(f, decisions);
    const byId = new Map(f.plants.map((r) => [r.id, r]));
    const lakota = byId.get('carya-illinoinensis-kanza-lakota')!;
    expect([lakota.common, lakota.botanical, lakota.parent]).toEqual(["Pecan 'Lakota'", "Carya illinoinensis 'Lakota'", 'carya-illinoinensis']);
    expect(Object.keys(lakota).slice(0, 4)).toEqual(['id', 'common', 'botanical', 'parent']); // (names first, as in any record)
    expect(lakota.facts.height).toEqual({ v: { min: 70, max: 100, med: 85 }, src: ['ncsu'] }); // (plants placed from it stay as they were)
    const kanza = byId.get('carya-illinoinensis-kanza')!;
    expect(kanza).toEqual({ id: 'carya-illinoinensis-kanza', common: "Pecan 'Kanza'", botanical: "Carya illinoinensis 'Kanza'", parent: 'carya-illinoinensis', inherits: ['height', 'width'], src: ['compendium'], audited: null, facts: {} });
    expect(f.plants.indexOf(kanza)).toBe(f.plants.indexOf(lakota) + 1); // (beside it)
    // A cultivar with a page of its own isn't made here (the build adds it from its page), nor one the catalog has.
    expect(f.plants.filter((r) => /seiryu/i.test(r.botanical ?? '') && !/Bloodgood/.test(r.botanical ?? ''))).toHaveLength(1);
    expect(byId.get('acer-palmatum-bloodgood-seiryu')!.common).toBe("Japanese maple 'Bloodgood'");
    expect(done.length).toBeGreaterThan(0);
    expect(catalogErrors(f)).toEqual([]);
    // Twice: nothing more.
    expect(applySplits(f, decisions)).toEqual([]);
  });
  it('a cultivar with no page takes its species\' size, said to be its species\'; its other facts as any cultivar\'s', () => {
    const f = file();
    applySplits(f, decisions);
    const kanza = resolveCatalog(f).find((p) => p.id === 'carya-illinoinensis-kanza')!;
    expect(kanza.height).toEqual({ min: 70, max: 100, med: 85 });
    expect(kanza.width).toEqual({ min: 40, max: 75, med: 57.5 });
    expect(kanza.prov?.width?.inherited).toBe(true);
    expect([kanza.form, kanza.zone_min]).toEqual(['Tree', 5]);
    // (Its spread comes from its species: not a "no spread" to check.)
    expect(catalogWarnings(f).filter((w) => w.startsWith('carya-illinoinensis-kanza:'))).toEqual([]);
  });
  it('takes only a size, and only with a species to take it from', () => {
    const f = file();
    f.plants.push({ id: 'x', common: 'X', inherits: ['flower_color'], src: ['compendium'], audited: null, facts: {} });
    expect(catalogErrors(f)).toEqual(['x: inherits must list height or width', 'x: inherits, but has no species to take it from']);
  });
});

describe('a cultivar with no species named', () => {
  const rec = (id: string, common: string, botanical: string, more = {}) => ({ id, common, botanical, src: ['ncsu'], audited: null, facts: {}, ...more });
  it('is linked to its species\' record, the variety\'s where it names one; not a record of the earlier list naming one beside its species', () => {
    const f = { meta: file().meta, plants: [
      rec('rudbeckia-fulgida', 'Orange coneflower', 'Rudbeckia fulgida'),
      rec('rudbeckia-fulgida-var-sullivantii', "Sullivant's coneflower", 'Rudbeckia fulgida var. sullivantii'),
      rec('goldsturm', "Black-eyed Susan 'Goldsturm'", "Rudbeckia fulgida var. sullivantii 'Goldsturm'"),
      rec('stokesia-laevis', "Stokes' aster", 'Stokesia laevis'),
      rec('bluestone', "Stokesia 'Bluestone'", "Stokesia laevis 'Bluestone'"),
      rec('nandina-domestica', 'Nandina', 'Nandina domestica'),
      rec('flirt', 'Nandina Flirt', "Nandina domestica Flirt 'Murasaki'"),
      rec('aucuba-japonica', 'Japanese laurel', 'Aucuba japonica'),
      rec('aucuba', 'Aucuba', "Aucuba japonica ('Gold Dust')"),
      rec('rosa-julia-child', "Rose 'Julia Child'", "Rosa 'Julia Child'"),
    ] } as CatalogFile;
    const done = linkCultivars(f);
    const parent = Object.fromEntries(f.plants.map((r) => [r.id, r.parent ?? null]));
    expect(parent).toMatchObject({ goldsturm: 'rudbeckia-fulgida-var-sullivantii', bluestone: 'stokesia-laevis', flirt: 'nandina-domestica', aucuba: null, 'rosa-julia-child': null, 'stokesia-laevis': null });
    expect(done).toHaveLength(3);
    expect(linkCultivars(f)).toEqual([]);
  });
});
