import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The catalog against the wild records (public/wild/1/): a plant recorded growing wild in its own right isn't
// sterile, whatever an older list said (docs/catalog-format.md, self_seed).

const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8')) as { plants: { id: string; facts?: Record<string, unknown> }[] };
const recordedWild = new Set<string>();
for (const f of readdirSync('public/wild/1').filter((n) => /^\d+\.json$/.test(n))) {
  const file = JSON.parse(readFileSync(`public/wild/1/${f}`, 'utf8')) as { plants: Record<string, number[]>; species?: string[] };
  const species = new Set(file.species ?? []);
  for (const id of Object.keys(file.plants)) if (!species.has(id)) recordedWild.add(id);
}

describe('the catalog against the wild records', () => {
  it('calls no plant sterile that is recorded growing wild in its own right', () => {
    const sterile = catalog.plants.filter((p) => {
      const v = p.facts?.self_seed;
      return (typeof v === 'object' && v ? (v as { v?: unknown }).v : v) === 'Sterile';
    });
    expect(sterile.length).toBeGreaterThan(0); // (cultivars the records don't speak to: still to be checked)
    expect(sterile.filter((p) => recordedWild.has(p.id)).map((p) => p.id)).toEqual([]);
  });
});
