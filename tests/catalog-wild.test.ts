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
  it('keeps no unsourced "Sterile" on a plain species: sterility is a cultivar\'s claim, and a species\' needs a source', () => {
    // (A plain species: a bare binomial, a subspecies or variety allowed; or two species in one record, "Salvia
    // officinalis / Origanum vulgare", "Prunus laurocerasus / caroliniana". Not a hybrid, nor "spp.".)
    const one = '[A-Z][a-zë-]+ [a-zë-]+( (subsp\\.|var\\.) [a-zë-]+)?';
    const plain = new RegExp(`^${one}( / (${one}|[a-zë-]+))?$`);
    const all = (JSON.parse(readFileSync('public/plants.json', 'utf8')) as { plants: { id: string; botanical?: string; parent?: string; facts?: Record<string, unknown> }[] }).plants;
    const species = all.filter((p) => !p.parent && plain.test((p.botanical ?? '').trim()) && !/ (hybrids?|spp\.?)$/.test(p.botanical ?? ''));
    expect(species.length).toBeGreaterThan(100);
    expect(species.filter((p) => p.facts?.self_seed === 'Sterile').map((p) => p.id)).toEqual([]);
  });
});
