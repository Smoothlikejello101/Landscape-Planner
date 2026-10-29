import { describe, expect, it } from 'vitest';
// @ts-expect-error (a build script, plain JavaScript)
import { formulaParents, hybridName, hybridParents, parentRating } from '../scripts/catalog/hybrids.mjs';

// A hybrid no source rates for people gets its parents' ratings (scripts/catalog/hybrids.mjs; Jason, 2026-10-29).

const page = (fields: Record<string, string[]>) =>
  `<dl>${Object.entries(fields).map(([k, vs]) => `<dt>${k}:</dt>${vs.map((v) => `<dd>${v}</dd>`).join('')}`).join('')}</dl>`;

describe("a hybrid's parents", () => {
  it('reads a cross from its name, a named hybrid for Kew, and nothing from a cultivar of unknown parents', () => {
    expect(hybridName("Morus alba x rubra 'Illinois Everbearing'")).toEqual({ kind: 'cross', parents: ['Morus alba', 'Morus rubra'] });
    expect(hybridName('Ilex verticillata × serrata')).toEqual({ kind: 'cross', parents: ['Ilex verticillata', 'Ilex serrata'] });
    expect(hybridName('Ilex verticillata × I. serrata')).toEqual({ kind: 'cross', parents: ['Ilex verticillata', 'Ilex serrata'] });
    expect(hybridName('Abelia × grandiflora')).toEqual({ kind: 'named', wcvp: 'Abelia × grandiflora' });
    expect(hybridName("Forsythia x intermedia 'Lynwood Gold'")).toEqual({ kind: 'named', wcvp: 'Forsythia × intermedia' });
    expect(hybridName('× Chitalpa tashkentensis')).toEqual({ kind: 'named', wcvp: '× Chitalpa tashkentensis' });
    expect(hybridName("Rudbeckia × 'American Gold Rush'")).toBeNull();
    expect(hybridName("Ilex x 'Nellie R. Stevens'")).toBeNull();
    expect(hybridName('Cercis canadensis')).toBeNull();
  });

  it("reads Kew's formula: abbreviated genera spelled out, a third parent kept, what isn't a species left out", () => {
    expect(formulaParents('A. chinensis × A. uniflora', 'Abelia')).toEqual(['Abelia chinensis', 'Abelia uniflora']);
    expect(formulaParents('A. flava × A. glabra × A. pavia', 'Aesculus')).toEqual(['Aesculus flava', 'Aesculus glabra', 'Aesculus pavia']);
    expect(formulaParents('Catalpa bignonioides × Chilopsis linearis', 'Chitalpa')).toEqual(['Catalpa bignonioides', 'Chilopsis linearis']);
    expect(formulaParents('(H. niger × H. orientalis) × H. sp.', 'Helleborus')).toEqual(['Helleborus niger', 'Helleborus orientalis']);
    expect(formulaParents('', 'Abelia')).toEqual([]);
  });

  it("takes a parent's rating from its catalog record, else NC State's saved page; none where neither says", () => {
    const records = new Map([['morus rubra', { id: 'morus-rubra', common: 'Red mulberry', facts: { poison: { v: { severity: 'low', parts: ['sap'], skin: true }, src: ['ncsu'] } } }]]);
    const pages: Record<string, string> = {
      'Morus alba': page({ 'Poison Severity': ['Low'], 'Poison Part': ['Fruits', 'Sap/Juice'] }),
      'Morus nigra': page({ Genus: ['Morus'] }),
    };
    const at = (n: string) => pages[n] ?? null;
    expect(parentRating('Morus rubra', records, at)).toEqual({ name: 'Morus rubra', id: 'morus-rubra', common: 'Red mulberry', poison: { severity: 'low', parts: ['sap'], skin: true }, src: ['ncsu'] });
    expect(parentRating('Morus alba', records, at)).toEqual({ name: 'Morus alba', poison: { severity: 'low', parts: ['fruits', 'sap'] }, src: ['ncsu'] });
    expect(parentRating('Morus nigra', records, at)).toEqual({ name: 'Morus nigra', poison: null, src: ['ncsu'] });
    expect(parentRating('Morus indica', records, at)).toEqual({ name: 'Morus indica' });
  });

  it('writes poison_parents only for an unrated hybrid with a rated parent; a rated hybrid and its cultivars keep their own', () => {
    const catalog = {
      meta: { sources: { ncsu: { title: 'NC State' } } },
      plants: [
        { id: 'morus-rubra', common: 'Red mulberry', botanical: 'Morus rubra', facts: { poison: { v: { severity: 'low', parts: ['sap'] }, src: ['ncsu'] } } },
        { id: 'mulberry-x', common: "Mulberry 'Illinois Everbearing'", botanical: "Morus alba x rubra 'Illinois Everbearing'", facts: { poison: { v: null, src: ['ncsu'] } } },
        { id: 'abelia-x-grandiflora', common: 'Glossy abelia', botanical: 'Abelia × grandiflora', facts: {} },
        { id: 'abelia-x-grandiflora-rose-creek', common: "Abelia 'Rose Creek'", botanical: "Abelia × grandiflora 'Rose Creek'", parent: 'abelia-x-grandiflora', facts: {} },
        { id: 'magnolia-x-soulangeana', common: 'Saucer magnolia', botanical: 'Magnolia × soulangeana', facts: { poison: { v: { severity: 'low' }, src: ['ncsu'] } } },
        { id: 'rudbeckia-x', common: "Rudbeckia 'American Gold Rush'", botanical: "Rudbeckia × 'American Gold Rush'", facts: {} },
      ],
    };
    const kew = { 'abelia-x-grandiflora': { name: 'Abelia × grandiflora', formula: 'A. chinensis × A. uniflora' }, 'magnolia-x-soulangeana': { name: 'Magnolia × soulangeana', formula: 'M. denudata × M. liliiflora' } };
    const pages: Record<string, string> = { 'Abelia chinensis': page({ 'Poison Severity': ['Low'] }), 'Morus alba': page({ Genus: ['Morus'] }) };
    const r = hybridParents(catalog, kew, (n: string) => pages[n] ?? null);
    expect(r.written).toBe(2);
    const of = (id: string) => catalog.plants.find((p) => p.id === id)!.facts as Record<string, unknown>;
    expect(of('mulberry-x').poison_parents).toEqual({
      v: { via: 'name', parents: [{ name: 'Morus alba', poison: null }, { name: 'Morus rubra', id: 'morus-rubra', common: 'Red mulberry', poison: { severity: 'low', parts: ['sap'] } }] },
      src: ['ncsu'],
    });
    expect(of('abelia-x-grandiflora').poison_parents).toEqual({ v: { via: 'kew', parents: [{ name: 'Abelia chinensis', poison: { severity: 'low' } }, { name: 'Abelia uniflora' }] }, src: ['wcvp', 'ncsu'] });
    expect(of('abelia-x-grandiflora-rose-creek').poison_parents).toBeUndefined(); // (the app takes its species')
    expect(of('magnolia-x-soulangeana').poison_parents).toBeUndefined(); // (rated itself)
    expect(of('rudbeckia-x').poison_parents).toBeUndefined(); // (no parents known)
    expect((catalog.meta.sources as Record<string, unknown>).wcvp).toBeDefined(); // (credited where its formula is used)
  });
});
