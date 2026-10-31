// How a plant spreads: by seed (`self_seed`) and underground or by runners (what its `habit` says), two facts from
// separate sources, shown together under "How it spreads" (docs/catalog-format.md). Which habits speak to spreading,
// and how, is this fixed table: a habit it doesn't know is listed by `catalog:check`, never guessed at.

/** What a habit says of spreading underground or by runners. */
export type RootSpread = 'aggressive' | 'maybe' | 'spreads' | 'slow' | 'stays' | 'other' | 'shape';
/**
 * Every habit in the catalog: 'aggressive', 'maybe' (aggressively, as one reading of its page says and the other
 * doesn't: Jason, 2026-10-30), 'spreads', 'slow' (underground or by runners: rhizomes, stolons, suckers, tubers); 'stays' (clumps, or a single stem: doesn't run); 'other' (about spreading, but not by runners: mats,
 * naturalizing bulbs, a reseeding annual, shown as given); 'shape' (says nothing of spreading: multi-stemmed,
 * upright, a vine's way of climbing; keeps its own "Habit" row).
 */
export const HABIT_SPREAD: Record<string, RootSpread> = {
  'Aggressive rhizome': 'aggressive', 'Aggressive rhizomatous': 'aggressive', 'Runner - CONTAIN': 'aggressive',
  'Aggressive runner (stolons)': 'aggressive',
  'Suckering colonizer': 'aggressive', 'Suckering thicket': 'aggressive', 'Thicket-forming': 'aggressive',
  'Spreading rhizome, maybe aggressive': 'maybe', 'Runner (stolons), maybe aggressive': 'maybe', 'Suckering, maybe aggressive': 'maybe',
  'Spreading rhizome': 'spreads', 'Rhizomatous': 'spreads', 'Runner (stolons)': 'spreads', 'Suckering': 'spreads',
  'Suckering (rhizome)': 'spreads', 'Suckering canes': 'spreads', 'Spreading (tubers)': 'spreads',
  'Suckering (slow)': 'slow', 'Slow-spreading rhizome': 'slow',
  'Clumping': 'stays', 'Clumping (this cv)': 'stays', 'Clumping (semi-woody)': 'stays', 'Clumping rosette': 'stays',
  'Single-stem': 'stays', 'Single-stem, horizontal': 'stays',
  'Mat-forming': 'other', 'Naturalizing': 'other', 'Reseeding annual': 'other',
  // (Shape, not spread: a multi-stemmed shrub or an erect cane may sucker or not; these don't say.)
  'Multi-stem': 'shape', 'Single/multi-stem': 'shape', 'Arching multi-stem': 'shape', 'Erect canes': 'shape',
  'Upright open': 'shape', 'Tiered horizontal': 'shape', 'Twining': 'shape', 'Twining vine': 'shape',
  'Twining (leaf petioles)': 'shape', 'Self-clinging (aerial rootlets)': 'shape', 'Self-clinging (tendrils+pads)': 'shape',
  'Self-clinging (adhesive pads)': 'shape', 'Climbing/sprawling canes': 'shape', 'Needs tying': 'shape',
};
/** What a habit says of spreading underground or by runners; null for a habit not in the table (or none). */
export const rootSpread = (habit: string | undefined): RootSpread | null => (habit ? HABIT_SPREAD[habit] ?? null : null);

/** A plant's spreading, as far as the facts go. */
export interface SpreadFacts { self_seed?: string; habit?: string; wild_us?: string }
/**
 * Listed invasive in USGS's register for the lower 48 (`wild_us` "invasive" or "widespread invasive": src/plants.ts):
 * never reassured about ("Doesn't run", "Stays put"), whatever its habit says.
 */
const listedInvasive = (p: SpreadFacts): boolean => p.wild_us === 'invasive' || p.wild_us === 'widespread invasive';
/**
 * The seed part, in words: "Self-sows freely", "Self-sows a little", "Self-sows, aggressiveness unknown" (its source
 * says it self-sows, not how freely: Jason, 2026-10-27), "Said not to set seed" (never stated as fact). Empty where it's
 * missing.
 */
export function seedText(p: SpreadFacts): string {
  return ({ Prolific: 'Self-sows freely', Modest: 'Self-sows a little', Unrated: 'Self-sows, aggressiveness unknown', Sterile: 'Said not to set seed' } as Record<string, string>)[p.self_seed ?? ''] ?? '';
}
/**
 * The underground part, in words, with the habit as given: "Spreads aggressively underground or by runners: Runner -
 * CONTAIN", "Doesn't run: Clumping". Empty where the habit says nothing of it, and for a plant USGS's register lists
 * as invasive that the habit calls clumping (no reassurance for an invasive plant).
 */
export function rootText(p: SpreadFacts): string {
  const r = rootSpread(p.habit), h = p.habit ?? '';
  if (r === 'aggressive') return `Spreads aggressively underground or by runners: ${h}`;
  if (r === 'maybe') return `Spreads, maybe aggressively, underground or by runners: ${h.replace(/, maybe aggressive$/, '')}`;
  if (r === 'spreads') return `Spreads underground or by runners: ${h}`;
  if (r === 'slow') return `Spreads slowly underground or by runners: ${h}`;
  if (r === 'stays') return listedInvasive(p) ? '' : `Doesn't run: ${h}`;
  if (r === 'other') return h;
  return '';
}
/**
 * Whether a plant spreads as the picker's filter asks: 'stays' (doesn't run, and self-sows only a little or is said
 * to be sterile: a sterile value only ever comes with a source, Jason 2026-10-27; never a plant the register lists
 * as invasive),
 * 'seed' (self-sows freely, or self-sows and how freely isn't known: it may), 'runs' (spreads underground or by runners
 * at all, mats and naturalizing bulbs too), 'aggressive' (spreads aggressively underground or by runners, or maybe
 * does: counted as aggressive, as a self-sower whose freeness isn't known counts as free).
 */
export function spreadsAs(p: SpreadFacts, how: string): boolean {
  const r = rootSpread(p.habit);
  if (how === 'stays') return r === 'stays' && (p.self_seed === 'Modest' || p.self_seed === 'Sterile') && !listedInvasive(p);
  if (how === 'seed') return p.self_seed === 'Prolific' || p.self_seed === 'Unrated';
  // (Mats and naturalizing bulbs spread too: creeping thyme, fogfruit; a reseeding annual is the seed's.)
  if (how === 'runs') return r === 'aggressive' || r === 'maybe' || r === 'spreads' || r === 'slow' || (r === 'other' && p.habit !== 'Reseeding annual');
  if (how === 'aggressive') return r === 'aggressive' || r === 'maybe';
  return true;
}
/** The ways of spreading the picker offers, mildest first. */
export const SPREAD_WAYS = ['stays', 'runs', 'aggressive', 'seed'] as const;
/**
 * The ways a plant spreads, for the picker's "Spreading you're OK with" (Jason, 2026-10-25): 'runs' (underground or by
 * runners, not aggressively; mats and naturalizing bulbs too), 'aggressive' (aggressively so), 'seed' (self-sows
 * freely); 'stays' where it does none of them (doesn't run, self-sows only a little, not listed invasive). Null where
 * the facts don't say.
 */
export function spreadWays(p: SpreadFacts): string[] | null {
  const ways: string[] = [];
  if (spreadsAs(p, 'aggressive')) ways.push('aggressive');
  else if (spreadsAs(p, 'runs')) ways.push('runs');
  if (spreadsAs(p, 'seed')) ways.push('seed');
  if (ways.length) return ways;
  return spreadsAs(p, 'stays') ? ['stays'] : null;
}
/**
 * Whether every way a plant spreads is one the person is OK with: "stays put or spreads by runners" keeps out an
 * aggressive runner, and a runner that also self-sows freely. OK with aggressive runners is OK with runners too. A
 * plant whose facts don't say is left out.
 */
export function spreadsOnlyAs(p: SpreadFacts, ok: readonly string[]): boolean {
  const ways = spreadWays(p);
  return !!ways && ways.every((w) => ok.includes(w) || (w === 'runs' && ok.includes('aggressive')));
}
