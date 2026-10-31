// A partner for fruit (Jason, Oct 30: "partner plants required for fruit set"; his rule: plants of separate sexes,
// unsexed, at least 3; a male or female cultivar, at least 1 of each; one needing a different cultivar, that). Said as a
// plant whose fruit matters is placed (src/ui/fruit-notice.ts), until the plan has its partner. What it takes to fruit,
// and a cultivar's sex, come from the catalog (`fruit_set`, `sex`: read from NC State's descriptions, prose.mjs).
//
// A partner is any plant of the same species anywhere in the plan (no distances: NC State gives one for only a few
// plants). Same species: a cultivar's species (`parent`), a plant of mine's ("Same species as"), or the plant itself.

import type { Plant } from './plants';

/** The species a plant belongs to, by catalog id: a cultivar's species, a plant of mine's, or itself. */
export const speciesKey = (p: Plant): string => p.parent ?? p.species ?? p.id;

/** Whether its fruit is why it's grown, or shown: edible fruit, or fruit its source gives a color (showy). */
export function fruitMatters(p: Plant): boolean {
  return (p.edible === true && (p.edible_parts ?? []).includes('fruit')) || (p.fruit_color?.length ?? 0) > 0;
}

export interface FruitNeed {
  /** What to say, in a line. */
  line: string;
  /** Plants to offer to add (the catalog's males of its species for a female, and so on), at most two. */
  offer: Plant[];
}

/**
 * What a plant needs to fruit that the plan doesn't have yet, or null: `p` the plant placed, `plan` every plant in
 * the plan (it among them), `catalog` the plants that could be offered.
 */
export function fruitNeed(p: Plant, plan: Plant[], catalog: Plant[]): FruitNeed | null {
  const fs = p.fruit_set;
  const key = speciesKey(p);
  // (Its fruit matters if its species' does: a male cultivar has none of its own to list.)
  if (!fs || fs === 'self' || !(fruitMatters(p) || fruitMatters(catalog.find((q) => q.id === key) ?? p))) return null;
  const same = plan.filter((q) => speciesKey(q) === key);
  const kin = catalog.filter((q) => speciesKey(q) === key && q.id !== p.id);
  const name = p.common;
  const offer = (pick: (q: Plant) => boolean) => kin.filter(pick).slice(0, 2);
  if (fs === 'separate') {
    if (p.sex === 'female') {
      if (same.some((q) => q.sex === 'male')) return null;
      return { line: `${name} is a female: it needs a male of its kind nearby to fruit`, offer: offer((q) => q.sex === 'male') };
    }
    if (p.sex === 'male') {
      if (same.some((q) => q.sex !== 'male')) return null;
      return { line: `${name} is a male: it won't fruit itself, but pollinates females of its kind nearby`, offer: offer((q) => q.sex === 'female') };
    }
    // (Unsexed: three, to likely get both; or a known male beside it.)
    if (same.length >= 3 || same.some((q) => q.sex === 'male')) return null;
    return { line: `${name} has male and female plants: plant at least 3 to likely get both, or a named female and a male`, offer: offer((q) => q.sex === 'male') };
  }
  // A partner needed, or helping: a second plant that isn't the same clone (another cultivar, or a second seedling).
  const ids = new Set(same.map((q) => q.id));
  const seedlings = same.filter((q) => q.id === key).length;
  if (ids.size >= 2 || seedlings >= 2) return null;
  const another = offer((q) => q.id !== p.id);
  return fs === 'partner'
    ? { line: `${name} needs a second, different variety nearby to fruit`, offer: another }
    : { line: `${name} fruits on its own, and better with a second variety nearby`, offer: another };
}
