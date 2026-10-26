// How a plant spreads: by seed (`self_seed`) and underground or by runners (what its `habit` says), two facts from
// separate sources, shown together under "How it spreads" (docs/catalog-format.md). Which habits speak to spreading,
// and how, is this fixed table: a habit it doesn't know is listed by `catalog:check`, never guessed at.

/** What a habit says of spreading underground or by runners. */
export type RootSpread = 'aggressive' | 'spreads' | 'slow' | 'stays' | 'other' | 'shape';
/**
 * Every habit in the catalog: 'aggressive', 'spreads', 'slow' (underground or by runners: rhizomes, stolons, suckers,
 * tubers); 'stays' (clumps, or a single stem: doesn't run); 'other' (about spreading, but not by runners: mats,
 * naturalizing bulbs, a reseeding annual, shown as given); 'shape' (says nothing of spreading: multi-stemmed,
 * upright, a vine's way of climbing; keeps its own "Habit" row).
 */
export const HABIT_SPREAD: Record<string, RootSpread> = {
  'Aggressive rhizome': 'aggressive', 'Aggressive rhizomatous': 'aggressive', 'Runner - CONTAIN': 'aggressive',
  'Suckering colonizer': 'aggressive', 'Suckering thicket': 'aggressive', 'Thicket-forming': 'aggressive',
  'Spreading rhizome': 'spreads', 'Rhizomatous': 'spreads', 'Runner (stolons)': 'spreads', 'Suckering': 'spreads',
  'Suckering (rhizome)': 'spreads', 'Suckering canes': 'spreads', 'Spreading (tubers)': 'spreads',
  'Suckering (slow)': 'slow',
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
export interface SpreadFacts { self_seed?: string; habit?: string; invasive?: boolean }
/**
 * The seed part, in words: "Self-sows freely", "Self-sows a little", "Said not to set seed" (an earlier list's claim,
 * never stated as fact). Empty where it's missing.
 */
export function seedText(p: SpreadFacts): string {
  return ({ Prolific: 'Self-sows freely', Modest: 'Self-sows a little', Sterile: 'Said not to set seed' } as Record<string, string>)[p.self_seed ?? ''] ?? '';
}
/**
 * The underground part, in words, with the habit as given: "Spreads aggressively underground or by runners: Runner -
 * CONTAIN", "Doesn't run: Clumping". Empty where the habit says nothing of it, and for a plant listed invasive that
 * the habit calls clumping (no reassurance for an invasive plant).
 */
export function rootText(p: SpreadFacts): string {
  const r = rootSpread(p.habit), h = p.habit ?? '';
  if (r === 'aggressive') return `Spreads aggressively underground or by runners: ${h}`;
  if (r === 'spreads') return `Spreads underground or by runners: ${h}`;
  if (r === 'slow') return `Spreads slowly underground or by runners: ${h}`;
  if (r === 'stays') return p.invasive ? '' : `Doesn't run: ${h}`;
  if (r === 'other') return h;
  return '';
}
/**
 * Whether a plant spreads as the picker's filter asks: 'stays' (doesn't run, and self-sows only a little; never a
 * plant listed invasive, nor one only said not to set seed), 'seed' (self-sows freely), 'runs' (spreads underground or
 * by runners at all, mats and naturalizing bulbs too), 'aggressive' (spreads aggressively underground or by runners).
 */
export function spreadsAs(p: SpreadFacts, how: string): boolean {
  const r = rootSpread(p.habit);
  if (how === 'stays') return r === 'stays' && p.self_seed === 'Modest' && !p.invasive;
  if (how === 'seed') return p.self_seed === 'Prolific';
  // (Mats and naturalizing bulbs spread too: creeping thyme, fogfruit; a reseeding annual is the seed's.)
  if (how === 'runs') return r === 'aggressive' || r === 'spreads' || r === 'slow' || (r === 'other' && p.habit !== 'Reseeding annual');
  if (how === 'aggressive') return r === 'aggressive';
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
