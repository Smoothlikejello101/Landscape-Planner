import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { hybridName, misapplied, pickSymbol } from '../scripts/catalog/usda-pick.mjs';
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
    expect(pickSymbol('Carex albicans', [result('CAAL', 'Carex albida L.')])).toBeNull();
    expect([misapplied('Monarda fistulosa Sims, nom. inq.'), misapplied('Aster x sensu Gray'), misapplied('Echinacea purpurea (L.) Moench, nom. cons.')]).toEqual([true, true, false]);
  });
  it('takes a doubtful entry only when its profile is the plant\'s own (the apple), and never a hybrid for a species', () => {
    // USDA's only apple entry is "Malus domestica auct. non Borkh.", whose profile is Malus pumila: the apple, a reviewed rename.
    const apple = [result('MADO4', 'Malus domestica auct. non Borkh.')];
    expect(pickSymbol('Malus domestica', apple, () => '<i>Malus pumila</i> Mill.')).toEqual({ symbol: 'MADO4', id: 1, name: 'Malus domestica auct. non Borkh.' });
    expect(pickSymbol('Malus domestica', apple)).toBeNull(); // (its profile not at hand: not taken)
    expect(pickSymbol('Carex albicans', [result('CAAL23', 'Carex albicans auct. non Willd.')], () => '<i>Carex peckii</i> Howe')).toBeNull();
    // A hybrid listed first, at species rank, with a common name: never the species.
    expect(hybridName('Carex grayi × intumescens [unnamed hybrid]')).toBe(true);
    expect(pickSymbol('Carex grayi', [
      result('CAGR6', 'Carex grayi × intumescens [unnamed hybrid]', { CommonName: 'sedge' }),
      result('CAGR5', 'Carex grayi Carey', { CommonName: "Gray's sedge" }),
    ])).toEqual({ symbol: 'CAGR5', id: 1, name: 'Carex grayi Carey' });
    expect(sameTaxon('Carex grayi', '<i>Carex grayi</i> × <i>intumescens</i> [unnamed hybrid]')).toBe(false);
  });
  it('prefers a plain entry listed after a doubtful one, and refuses a plain one whose profile is another plant', () => {
    expect(pickSymbol('Carex frankii', [result('CAFR11', 'Carex frankii auct. non Kunth'), result('CAFR3', 'Carex frankii Kunth')], (s: string) => (s === 'CAFR11' ? '<i>Carex aureolensis</i> Steud.' : '<i>Carex frankii</i> Kunth'))).toMatchObject({ symbol: 'CAFR3' });
    // A reviewed choice: the catalog's Anemone patens is the American pasque flower.
    expect(pickSymbol('Anemone patens', [result('ANPA19', 'Anemone patens L.'), result('ANPAM', 'Anemone patens L. var. multifida Pritz.', { Rank: 'Variety' })])).toMatchObject({ symbol: 'ANPAM' });
    expect(sameTaxon('Anemone patens', '<i>Pulsatilla patens</i> (L.) Mill. ssp. <i>multifida</i> (Pritz.) Zamels')).toBe(true);
    expect(sameTaxon('Anemone patens', '<i>Pulsatilla patens</i> (L.) Mill. ssp. <i>patens</i> (L.) Mill. [excluded]')).toBe(false);
    // (Bidens polylepis: USDA lumps it into B. aristosa, not a reviewed rename.)
    expect(pickSymbol('Bidens polylepis', [result('BIPO', 'Bidens polylepis S.F. Blake')], () => '<i>Bidens aristosa</i> (Michx.) Britton')).toBeNull();
  });
  it('takes a profile only for the plant itself or a reviewed rename of it', () => {
    expect(sameTaxon('Carex albicans', '<i>Carex albicans</i> Willd. ex Spreng.')).toBe(true);
    expect(sameTaxon('Carex albicans', '<i>Carex peckii</i> Howe')).toBe(false);
    expect(sameTaxon('Buchloe dactyloides', '<i>Bouteloua dactyloides</i> (Nutt.) J.T. Columbus')).toBe(true);
    expect(sameTaxon('Viburnum trilobum', '<i>Viburnum opulus</i> L. var. <i>opulus</i>')).toBe(false); // (the rename is var. americanum)
  });
});
