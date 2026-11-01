// Who's in the yard (the guided introduction's step 6, Oct 25: "Kids · Dogs · Cats · Horses" sets the picker's
// filters; since Oct 30 (Jason, from round 2) it also puts warnings on rows, the plan and the plant: src/plants.ts
// householdFlags). Kept per device, like the hints, so the answer outlasts a reload: the other
// filters are for the search at hand and reset, but kids and pets don't change between visits. The picker's own
// controls for the same four filters keep it up to date (src/ui/plants-panel.ts).

import type { DogFilter, PlantFilter } from './plants';
import { parseIntroRecord } from './intro';

export interface Yard { kids: boolean; dogs: DogFilter; cats: boolean; horses: boolean }
export const NO_YARD: Yard = { kids: false, dogs: '', cats: false, horses: false };
const KEY = 'lp-yard';
const DOGS: DogFilter[] = ['', 'hideToxic', 'nonToxic'];

export function loadYard(): Yard {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!v || typeof v !== 'object') return { ...NO_YARD };
    return { kids: !!v.kids, dogs: DOGS.includes(v.dogs) ? v.dogs : '', cats: !!v.cats, horses: !!v.horses };
  } catch { return { ...NO_YARD }; }
}
/** Who's in the yard, as last kept (read once, then kept up to date by saveYard). */
let kept: Yard | null = null;
export function household(): Yard { return (kept ??= loadYard()); }
/** Keep who's in the yard; set by the person (any control for the four), so the picker's question is answered too. */
export function saveYard(y: Yard): void {
  kept = { ...y };
  const v = JSON.stringify(y);
  try { if (localStorage.getItem(KEY) !== v) localStorage.setItem(KEY, v); } catch { /* no storage: nothing kept */ }
  noteAsked();
}
/**
 * One of the four turned on or off, as a chip does it (the guided introduction's step 6; the picker's "Anyone you need
 * to protect?"). Dogs on is "no dog warnings", the Poison & pets dog control's first setting (decided Oct 28), or what
 * it was before it went off ("only plants rated safe" kept if that's what it was, as step 6 did before).
 */
let lastDogs: DogFilter = 'hideToxic';
export function toggleYard(y: Yard, k: keyof Yard): Yard {
  const out = { ...y };
  if (k === 'dogs') { if (out.dogs) lastDogs = out.dogs; out.dogs = out.dogs ? '' : lastDogs; } else out[k] = !out[k];
  return out;
}
/**
 * The yard as filters (decided Oct 28): kids, "Not listed as poisonous to people"; dogs, no dog warnings (plants not
 * yet rated still show) unless the picker was set to "only plants rated safe"; cats and horses, no warnings for them.
 */
export function applyYard(f: PlantFilter, y: Yard): void {
  f.noPoison = y.kids;
  f.dogs = y.dogs;
  f.cats = y.cats;
  f.horses = y.horses;
}
/** A filter of the yard alone: `defaults` (the picker's, cleared) with the yard's four set. */
export function yardFilter(defaults: PlantFilter, y: Yard): PlantFilter {
  const f = { ...defaults };
  applyYard(f, y);
  return f;
}
/** The yard the filters say now. */
export const yardOf = (f: PlantFilter): Yard => ({ kids: f.noPoison, dogs: f.dogs, cats: f.cats, horses: f.horses });
/** Whether anyone's in it. */
export const yardSet = (y: Yard): boolean => y.kids || y.dogs !== '' || y.cats || y.horses;

// "Anyone you need to protect?" (Jason, Nov 1, from the UI review: a tester saw "Can irritate skin" on rows but nothing
// on a plant highly poisonous to people, and never learned the picker can screen for kids and pets without opening
// Filters). The picker asks it first, at the top of its filters, until it's answered or dismissed; then it lives under
// Filters, Poison & pets (src/ui/plants-panel.ts). Kept per device, as the yard is: 'answered' or 'dismissed'.
// Answered is any of the four set anywhere (saveYard), or step 6 of the guided introduction done, even with none
// ticked; the yard itself is left as it was.
const ASKED_KEY = 'lp-protect-line';
export type Asked = 'answered' | 'dismissed' | null;
export function loadAsked(): Asked {
  try { const v = localStorage.getItem(ASKED_KEY); return v === 'answered' || v === 'dismissed' ? v : null; } catch { return null; }
}
/** The question answered (a dismissal stays one: it says how it left the top). */
export function noteAsked(): void {
  try { if (!localStorage.getItem(ASKED_KEY)) localStorage.setItem(ASKED_KEY, 'answered'); } catch { /* no storage: asked again next time */ }
}
/** Dismissed with its ×. */
export function dismissAsked(): void {
  try { localStorage.setItem(ASKED_KEY, 'dismissed'); } catch { /* no storage: asked again next time */ }
}
/**
 * Whether step 6 ("Who's in your yard?") was done on this device before the question was kept here: its Next counts,
 * with nothing ticked too (src/intro.ts keeps it in 'lp-intro').
 */
export function introAnswered(): boolean {
  try { return parseIntroRecord(localStorage.getItem('lp-intro')).done.includes('who'); } catch { return false; }
}
/**
 * Whether the picker asks it at the top of its filters, as it opens: not once it's been answered (kept, anyone in the
 * yard, or step 6 done) or dismissed. Decided as the picker opens and kept till it closes, so an answer given there
 * stays in view to see (only a dismissal moves it at once).
 */
export function askAtTop(o: { asked: Asked; yard: Yard; intro: boolean }): boolean {
  return o.asked === null && !yardSet(o.yard) && !o.intro;
}

// "Hardy in zone N" (beside the picker's Filters, decided with Jason, Oct 25) is about the garden, as kids and pets
// are, not the search at hand: kept per device too (testers, Oct 30: it was ticked when the ZIP was set, unticked after
// a reload). Off until ticked here (or by the tour, or by a ZIP asked for from the picker): turned on by default, it
// would start hiding plants with no zones known from someone who never asked for it.
const HARDY_KEY = 'lp-hardy-here';
export function loadHardy(): boolean {
  try { return localStorage.getItem(HARDY_KEY) === '1'; } catch { return false; }
}
export function saveHardy(on: boolean): void {
  try { localStorage.setItem(HARDY_KEY, on ? '1' : '0'); } catch { /* no storage: nothing kept */ }
}
