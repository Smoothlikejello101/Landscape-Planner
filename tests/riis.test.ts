import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { DEGREES, nameKey, registerOf, RIIS_SOURCE, tsv, wildFacts } from '../scripts/catalog/riis.mjs';

// USGS's register of introduced plants in the wild in the lower 48 (US-RIIS): each plant's degree, in the register's
// own terms, onto the catalog's species records.

const taxa = tsv([
  'id\tscientificName\tkingdom',
  'a\tLigustrum sinense\tPlantae',
  'b\tSyringa vulgaris\tPlantae',
  'c\tAcer palmatum\tPlantae',
  'd\tLigustrum sinense var. stauntonii\tPlantae', // (a variety: the species' key, the furthest degree kept)
  'e\tAbacarus hystrix\tAnimalia', // (a mite: not a plant)
  'f\tMiscanthus ×giganteus\tPlantae',
  'g\tPhyllostachys aurea\tPlantae',
].join('\n'));
const distribution = tsv([
  'id\tlocality\tdegreeOfEstablishment',
  'a\tconterminous 48 United States\twidespread invasive (category E)',
  'b\tconterminous 48 United States\tinvasive (category D2)',
  'c\tconterminous 48 United States\testablished (category C3)',
  'd\tconterminous 48 United States\testablished (category C3)',
  'e\tconterminous 48 United States\tinvasive (category D2)',
  'f\tconterminous 48 United States\testablished (category C3)',
  'g\tconterminous 48 United States\tsomething else',
].join('\n'));

describe("USGS's register (US-RIIS)", () => {
  it('keys a binomial, a named hybrid, and nothing for a genus alone', () => {
    expect(nameKey('Ligustrum sinense Lour.')).toBe('ligustrum sinense');
    expect(nameKey('Miscanthus ×giganteus')).toBe('miscanthus x giganteus');
    expect(nameKey('Miscanthus x giganteus')).toBe('miscanthus x giganteus');
    expect(nameKey('Ligustrum')).toBeNull();
    // (A hybrid by its formula isn't either parent; a group isn't the species alone.)
    expect(nameKey("Morus alba x rubra 'Illinois Everbearing'")).toBeNull();
    expect(nameKey('Morus alba × rubra')).toBeNull();
    expect(nameKey('Castanea mollissima & hybrids')).toBeNull();
    expect(nameKey("Hypericum androsaemum 'Matisse'")).toBe('hypericum androsaemum');
  });
  it("keeps the register's terms, and its plants only, each at the furthest degree any of its names has", () => {
    expect(Object.values(DEGREES)).toEqual(['established', 'invasive', 'widespread invasive']);
    const reg = registerOf(taxa, distribution);
    expect(reg.get('ligustrum sinense').degree).toBe('widespread invasive');
    expect(reg.get('syringa vulgaris').degree).toBe('invasive');
    expect(reg.get('acer palmatum').degree).toBe('established');
    expect(reg.get('miscanthus x giganteus').degree).toBe('established');
    expect(reg.has('abacarus hystrix')).toBe(false);
    expect(reg.has('phyllostachys aurea')).toBe(false); // (a degree it doesn't define: left out, never guessed)
  });
  it("writes it on species records by name or one of Kew's older names, takes it off the rest, and takes the earlier list's flag off every record", () => {
    const catalog = { meta: { sources: {} as Record<string, unknown> }, plants: [
      { id: 'ligustrum-sinense', botanical: 'Ligustrum sinense', facts: { invasive: { v: true, src: ['compendium'] } } },
      { id: 'ligustrum-sinense-sunshine', botanical: "Ligustrum sinense 'Sunshine'", parent: 'ligustrum-sinense', facts: { invasive: { v: true, src: ['compendium'] } } },
      { id: 'lilac', botanical: 'Syringa vulgaris L.', facts: {} },
      { id: 'renamed', botanical: 'Acer newname', facts: { botanical_synonyms: { v: ['Acer palmatum'], src: ['wcvp'] } } },
      { id: 'oak', botanical: 'Quercus alba', facts: { wild_us: { v: 'established', src: ['riis'] } } },
    ] };
    expect(wildFacts(catalog, registerOf(taxa, distribution))).toEqual({ n: 3, dropped: 2 });
    const by = Object.fromEntries(catalog.plants.map((p) => [p.id, p.facts as Record<string, unknown>]));
    expect(by['ligustrum-sinense']).toEqual({ wild_us: { v: 'widespread invasive', src: ['riis'] } });
    expect(by['ligustrum-sinense-sunshine']).toEqual({}); // (a cultivar takes its species' in the app)
    expect(by.lilac.wild_us).toEqual({ v: 'invasive', src: ['riis'] });
    expect(by.renamed.wild_us).toEqual({ v: 'established', src: ['riis'] });
    expect(by.oak.wild_us).toBeUndefined(); // (not on the register now: taken off)
    expect(catalog.meta.sources.riis).toEqual(RIIS_SOURCE);
  });
});
