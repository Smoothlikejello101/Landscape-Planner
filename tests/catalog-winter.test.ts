import { describe, expect, it } from 'vitest';
// @ts-expect-error (plain JavaScript build script)
import { bareYears, npnName, winterLeaves } from '../scripts/catalog/winter.mjs';

type Rec = { id: string; audited?: string; facts: Record<string, unknown> };

// Winter leaves where no source gives a plant's foliage (Jason, 2026-10-29): its species' USA-NPN records (recorded
// bare: it loses its leaves), else two or more other species of its genus, all alike.

const sources = { ncsu: { trust: 'reference' }, old: { trust: 'unverified' } };
const rec = (id: string, botanical: string, facts: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  ({ id, common: id, botanical, audited: '2026-10-01', facts: { form: { v: 'Perennial', src: ['ncsu'] }, ...facts }, ...extra });
const fol = (v: string, src = ['ncsu']) => ({ foliage: { v, src } });
const bare = { 'aster novae-angliae': { MN: [300, 305], WI: [310] }, 'baptisia minor': {} };

describe('winter leaves', () => {
  it("names a species as USA-NPN's summary does, and counts its plant-years recorded bare", () => {
    expect(npnName("Symphyotrichum oblongifolium 'October Skies'")).toBe('symphyotrichum oblongifolium');
    expect(npnName('Hosta spp.')).toBeNull();
    expect(bareYears(bare, 'aster novae-angliae')).toBe(3);
    expect(bareYears(bare, 'baptisia minor')).toBe(0);
  });
  it('takes its own records first, then its relatives when two or more agree; else none', () => {
    const plants = [
      rec('a', 'Aster novae-angliae'),
      rec('b1', 'Baptisia alba', fol('deciduous')), rec('b2', 'Baptisia australis', fol('deciduous')), rec('b3', 'Baptisia minor'),
      rec('c1', 'Carex flacca', fol('evergreen')), rec('c2', 'Carex grayi', fol('deciduous')), rec('c3', 'Carex muskingumensis'),
      rec('d1', 'Dalea purpurea', fol('deciduous')), rec('d2', 'Dalea candida'),
      rec('e1', 'Erica carnea', fol('evergreen', ['old'])), rec('e2', 'Erica cinerea', fol('evergreen', ['old'])), rec('e3', 'Erica tetralix'),
    ];
    const { plants: out, counts } = winterLeaves(plants, sources, bare, '2026-10-29');
    const w = (id: string) => ((out as Rec[]).find((p) => p.id === id)!.facts).winter_leaves;
    expect(w('a')).toEqual({ v: { leaves: 'deciduous', basis: 'records', n: 3 }, src: ['usanpn'] });
    expect(w('b3')).toEqual({ v: { leaves: 'deciduous', basis: 'relatives', n: 2 }, src: ['relatives'] });
    expect(w('c3')).toBeUndefined(); // (its relatives differ)
    expect(w('d2')).toBeUndefined(); // (one relative)
    expect(w('e3')).toBeUndefined(); // (its relatives' foliage only from the earlier, unchecked list)
    expect(w('b1')).toBeUndefined(); // (a source gives its own)
    expect(counts).toEqual({ records: 1, relatives: 1 });
    expect((out as Rec[]).find((p) => p.id === 'b3')!.audited).toBe('2026-10-29');
  });
  it('leaves out a cultivar (its species is its), an annual and a genus alone; and takes one back once a source gives foliage', () => {
    const plants = [
      rec('b1', 'Baptisia alba', fol('deciduous')), rec('b2', 'Baptisia australis', fol('deciduous')),
      rec('b4', "Baptisia 'Purple Smoke'"), rec('b5', "Baptisia australis 'Blue'", {}, { parent: 'b2' }),
      rec('b6', 'Baptisia sphaerocarpa', { form: { v: 'Annual', src: ['ncsu'] } }),
      rec('b7', 'Baptisia tinctoria', { ...fol('evergreen'), winter_leaves: { v: { leaves: 'deciduous', basis: 'relatives', n: 2 }, src: ['relatives'] } }),
    ];
    const { plants: out } = winterLeaves(plants, sources, null, '2026-10-29');
    for (const id of ['b4', 'b5', 'b6', 'b7']) expect((out as Rec[]).find((p) => p.id === id)!.facts.winter_leaves).toBeUndefined();
    // (Run again on its own output: nothing changes, record for record.)
    const again = winterLeaves(out, sources, null, '2026-10-30');
    expect((again.plants as Rec[]).every((p, i) => p === out[i])).toBe(true);
  });
});
