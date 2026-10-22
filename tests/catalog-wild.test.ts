import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The catalog against the wild records (public/wild/1/): a plant recorded growing wild in its own right keeps no
// unsourced "Sterile" from an older list (docs/catalog-format.md, self_seed). A sourced one may stand: a few
// wild-recorded plants are sterile clones (the red spider lily spreads by bulbs).

const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8')) as { plants: { id: string; facts?: Record<string, unknown> }[] };
const recordedWild = new Set<string>();
for (const f of readdirSync('public/wild/1').filter((n) => /^\d+\.json$/.test(n))) {
  const file = JSON.parse(readFileSync(`public/wild/1/${f}`, 'utf8')) as { plants: Record<string, number[]>; species?: string[] };
  const species = new Set(file.species ?? []);
  for (const id of Object.keys(file.plants)) if (!species.has(id)) recordedWild.add(id);
}

describe('the catalog against the wild records', () => {
  it('keeps no unsourced "Sterile" on a plant recorded growing wild in its own right', () => {
    expect(recordedWild.size).toBeGreaterThan(0); // (the records were read)
    // (A plain value is the older list's, unsourced; a sourced fact is { v, src }.)
    const unsourcedSterile = catalog.plants.filter((p) => p.facts?.self_seed === 'Sterile');
    expect(unsourcedSterile.filter((p) => recordedWild.has(p.id)).map((p) => p.id)).toEqual([]);
  });
});

describe('the catalog on sterility', () => {
  it('keeps no unsourced "Sterile" at all: none rather than wrong (a sourced one may stand)', () => {
    // (The older list's "Sterile" was struck from every record, 2026-10-22: a species usually sets seed, and a
    // cultivar sold as sterile often isn't. A value with its source, { v: "Sterile", src }, is the audit's.)
    expect(catalog.plants.filter((p) => p.facts?.self_seed === 'Sterile').map((p) => p.id)).toEqual([]);
  });
});
