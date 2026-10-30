// Who's in the yard (the guided introduction's step 6, Oct 25: "Kids · Dogs · Cats · Horses" sets the picker's
// filters only, no warnings on its rows). Kept per device, like the hints, so the answer outlasts a reload: the other
// filters are for the search at hand and reset, but kids and pets don't change between visits. The picker's own
// controls for the same four filters keep it up to date (src/ui/plants-panel.ts).

import type { DogFilter, PlantFilter } from './plants';

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
export function saveYard(y: Yard): void {
  const v = JSON.stringify(y);
  try { if (localStorage.getItem(KEY) !== v) localStorage.setItem(KEY, v); } catch { /* no storage: nothing kept */ }
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
