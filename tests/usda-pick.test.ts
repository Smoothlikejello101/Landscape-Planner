import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { misapplied, pickSymbol } from '../scripts/catalog/usda-pick.mjs';
// @ts-expect-error (a plain .mjs script)
import { sameTaxon } from '../scripts/catalog/usda-counties.mjs';

// Choosing a plant's USDA PLANTS symbol: its own name, never a name another plant was once called by.

const result = (Symbol: string, ScientificName: string, extra: Record<string, unknown> = {}) => ({ Text: ScientificName, Plant: { Id: 1, Symbol, ScientificName, Rank: 'Species', ...extra } });

describe('picking a USDA symbol', () => {
  it('skips misapplied names ("auct. non", ", non X"), varieties, and other species', () => {
    expect(misapplied('Carex albicans auct. non Willd. ex Spreng.')).toBe(true);
    expect(misapplied('Silphium terebinthinaceum Elliott, non Jacq.')).toBe(true);
    expect(misapplied('Carex albicans Willd. ex Spreng.')).toBe(false);
    // (USDA's search lists the misapplied name first: the earlier pick took it.)
    expect(pickSymbol('Carex albicans', [
      result('CAAL23', 'Carex albicans auct. non Willd. ex Spreng.'),
      result('CAAL25', 'Carex albicans Willd. ex Spreng.', { CommonName: 'whitetinge sedge' }),
      result('CAALA', 'Carex albicans Willd. ex Spreng. var. albicans', { Rank: 'Variety' }),
    ])).toEqual({ symbol: 'CAAL25', id: 1, name: 'Carex albicans Willd. ex Spreng.' });
    expect(pickSymbol('Malus domestica', [result('MADO4', 'Malus domestica auct. non Borkh.')])).toBeNull();
    expect(pickSymbol('Carex albicans', [result('CAAL', 'Carex albida L.')])).toBeNull();
  });
  it('takes a profile only for the plant itself or a reviewed rename of it', () => {
    expect(sameTaxon('Carex albicans', '<i>Carex albicans</i> Willd. ex Spreng.')).toBe(true);
    expect(sameTaxon('Carex albicans', '<i>Carex peckii</i> Howe')).toBe(false);
    expect(sameTaxon('Buchloe dactyloides', '<i>Bouteloua dactyloides</i> (Nutt.) J.T. Columbus')).toBe(true);
    expect(sameTaxon('Viburnum trilobum', '<i>Viburnum opulus</i> L. var. <i>opulus</i>')).toBe(false); // (the rename is var. americanum)
  });
});
