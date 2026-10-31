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
  /** Plants to offer to add, the best two (partnerChoices). */
  offer: Plant[];
  /** Every plant that would be its partner, best first (partnerChoices): "All 7…" in the notice, past the two. */
  all: Plant[];
}

/** A cultivar's name, its quoted part ("Southern Gentleman"), or null for a species. */
export const cultivarName = (p: Plant): string | null => /['‘]([^'’]+)['’]/.exec(p.botanical ?? '')?.[1] ?? /['‘]([^'’]+)['’]/.exec(p.common)?.[1] ?? null;
/** A name as compared: letters and digits, lowercased, doubled letters as one (NC State's 'Will Flemming' is 'Will Fleming'). */
const bare = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');
const genusOf = (p: Plant) => (p.botanical ?? '').split(/\s+/)[0] || null;
/** Whether `p`'s description names `q` as its partner (`partners`: by its cultivar's name, in the same genus). */
export function names(p: Plant, q: Plant): boolean {
  const c = cultivarName(q);
  return !!c && genusOf(p) === genusOf(q) && (p.partners ?? []).some((n) => bare(n) === bare(c));
}
/** The partners `p`'s description names that the catalog doesn't have ("James Swan"), as named. */
export const unlistedPartners = (p: Plant, catalog: Plant[]): string[] =>
  (p.partners ?? []).filter((n) => !catalog.some((q) => q.id !== p.id && genusOf(q) === genusOf(p) && bare(cultivarName(q) ?? '') === bare(n)));

/**
 * Every plant that would be `p`'s partner, of the kind it needs (`fits`), best first (Jason, Oct 30: with seven females in
 * the catalog, the first two in its order were as good as chance): those its description names, then those whose
 * description names it ('Winter Red''s page names 'Southern Gentleman'), then those hardy in the garden's zone (`hardy`),
 * then the rest, each in the catalog's order. A plant its description names counts whatever its kind: the page knows.
 */
export function partnerChoices(p: Plant, catalog: Plant[], fits: (q: Plant) => boolean, hardy: (q: Plant) => boolean = () => true): Plant[] {
  const key = speciesKey(p);
  const rank = (q: Plant) => (names(p, q) ? 0 : names(q, p) ? 1 : hardy(q) ? 2 : 3);
  return catalog.filter((q) => q.id !== p.id && (names(p, q) || (speciesKey(q) === key && fits(q))))
    .map((q, i) => ({ q, i, r: rank(q) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.q);
}

/** What kind of plant `p` needs beside it to fruit (its fruit set and sex), or null where it needs none. */
export function partnerKind(p: Plant): ((q: Plant) => boolean) | null {
  if (p.fruit_set === 'separate') return p.sex === 'male' ? (q) => q.sex === 'female' : (q) => q.sex === 'male';
  if (p.fruit_set === 'partner' || p.fruit_set === 'better') return (q) => q.id !== p.id;
  return null;
}

/**
 * What a plant needs to fruit that the plan doesn't have yet, or null: `p` the plant placed, `plan` every plant in
 * the plan (it among them), `catalog` the plants that could be offered, `hardy` whether one is hardy in the garden's
 * zone (offered first after those named).
 */
export function fruitNeed(p: Plant, plan: Plant[], catalog: Plant[], hardy?: (q: Plant) => boolean): FruitNeed | null {
  const fs = p.fruit_set;
  const key = speciesKey(p);
  // (Its fruit matters if its species' does: a male cultivar has none of its own to list.)
  if (!fs || fs === 'self' || !(fruitMatters(p) || fruitMatters(catalog.find((q) => q.id === key) ?? p))) return null;
  const same = plan.filter((q) => speciesKey(q) === key);
  const name = p.common;
  const all = partnerChoices(p, catalog, partnerKind(p) ?? (() => false), hardy);
  // (Named by its page, not in the catalog: said, to look for elsewhere.)
  const unlisted = unlistedPartners(p, catalog);
  const also = unlisted.length ? `; NC State suggests ${unlisted.slice(0, 2).map((n) => `'${n}'`).join(' or ')}` : '';
  const need = (line: string): FruitNeed => ({ line: line + also, offer: all.slice(0, 2), all });
  if (fs === 'separate') {
    if (p.sex === 'female') {
      if (same.some((q) => q.sex === 'male') || plan.some((q) => names(p, q))) return null;
      return need(`${name} is a female: it needs a male of its kind nearby to fruit`);
    }
    if (p.sex === 'male') {
      if (same.some((q) => q.sex !== 'male')) return null;
      return need(`${name} is a male: it won't fruit itself, but pollinates females of its kind nearby`);
    }
    // (Unsexed: three, to likely get both; or a known male beside it.)
    if (same.length >= 3 || same.some((q) => q.sex === 'male')) return null;
    return need(`${name} has male and female plants: plant at least 3 to likely get both, or a named female and a male`);
  }
  // A partner needed, or helping: a second plant that isn't the same clone (another cultivar, or a second seedling).
  const ids = new Set(same.map((q) => q.id));
  const seedlings = same.filter((q) => q.id === key).length;
  if (ids.size >= 2 || seedlings >= 2 || plan.some((q) => q.id !== p.id && names(p, q))) return null;
  return fs === 'partner'
    ? need(`${name} needs a second, different variety nearby to fruit`)
    : need(`${name} fruits on its own, and better with a second variety nearby`);
}
