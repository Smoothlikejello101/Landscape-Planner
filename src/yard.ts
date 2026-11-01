// Who's in the yard (the guided introduction's step 6, Oct 25: "Kids · Dogs · Cats · Horses" sets the picker's
// filters; since Oct 30 (Jason, from round 2) it also puts warnings on rows, the plan and the plant: src/plants.ts
// householdFlags). Kept with the plan since Nov 1 (Jason: it's the yard's, not the device's, and later maybe an area's
// within a plan), so it's synced and in backups and plan files, and the plan keeps whether "Anyone you need to
// protect?" was answered for it. The other filters are for the search at hand and reset, but kids and pets don't
// change between visits. The picker's own controls for the same four keep it up to date (src/ui/plants-panel.ts), and
// its filters follow the plan that's open (src/main.ts, setHouseholdListener).
//
// Before Nov 1 it was kept per device, in 'lp-yard' (chosen Oct 28 with the introduction, not by Jason). A plan from
// before takes what this device had there (householdFromDevice), so nobody's setting changes with the update; 'lp-yard'
// is only read for that now, and left in place for an older version of the app. It's read once, at the update, with
// whether the question was answered here (src/storage.ts takeFromDevice): 'lp-protect-line' and 'lp-intro' still change
// after it (the ×, the introduction run again), and a plan from before read later takes what was taken then.

import type { DogFilter, PlantFilter } from './plants';
import type { PlanHousehold } from './types';
import { parseIntroRecord } from './intro';
import { state } from './state';
import { save } from './storage';
import { now } from './util';

export interface Yard { kids: boolean; dogs: DogFilter; cats: boolean; horses: boolean }
export const NO_YARD: Yard = { kids: false, dogs: '', cats: false, horses: false };
const KEY = 'lp-yard';
const DOGS: DogFilter[] = ['', 'hideToxic', 'nonToxic'];

/** Who was in the yard as this device kept it before plans kept their own (read for plans from before only). */
export function loadYard(): Yard {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!v || typeof v !== 'object') return { ...NO_YARD };
    return { kids: !!v.kids, dogs: DOGS.includes(v.dogs) ? v.dogs : '', cats: !!v.cats, horses: !!v.horses };
  } catch { return { ...NO_YARD }; }
}
/**
 * A plan from before plans kept who's in the yard: as this device had it, and answered if it had anyone, or the
 * question was answered here ("Anyone you need to protect?", or step 6 of the introduction). No `at`: it was never set
 * in the plan, so another device's, set there or taken the same way, settles with it (src/sync/engine.ts).
 */
export function householdFromDevice(): PlanHousehold {
  const y = loadYard();
  return { ...y, answered: yardSet(y) || loadAsked() === 'answered' || introAnswered() };
}
/** Who's in the open plan's yard. */
export function household(): PlanHousehold { return state.household; }
/** Keep who's in the yard with the open plan; set by the person (any control for the four), so the question is answered too. */
export function saveYard(y: Yard): void {
  const h = state.household;
  if (h.answered && h.kids === y.kids && h.dogs === y.dogs && h.cats === y.cats && h.horses === y.horses) return;
  state.household = { kids: y.kids, dogs: y.dogs, cats: y.cats, horses: y.horses, answered: true, at: now() };
  save();
}
/** The open plan's household for a new plan of the same garden (New project's "Same garden?"), answered or not, as it is. */
export function householdCopy(): PlanHousehold { return { ...state.household, at: now() }; }
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
// Filters). The picker asks it first, at the top of its filters, until it's answered for the plan or dismissed on this
// device; then it lives under Filters, Poison & pets (src/ui/plants-panel.ts). Answered is any of the four set
// anywhere (saveYard), or step 6 of the guided introduction done, even with none ticked; kept with the plan (Jason,
// Nov 1). Dismissed with its × stays per device in 'lp-protect-line' (a person's wish not to be asked, as the hints
// are: it holds across plans). That key once said 'answered' too: read now for plans from before only.
const ASKED_KEY = 'lp-protect-line';
export type Asked = 'answered' | 'dismissed' | null;
/** What this device kept: 'dismissed' (the ×), or 'answered' as it was kept before plans kept it. */
export function loadAsked(): Asked {
  try { const v = localStorage.getItem(ASKED_KEY); return v === 'answered' || v === 'dismissed' ? v : null; } catch { return null; }
}
/** The question answered for the open plan, the yard left as it was (step 6 done with none ticked). */
export function noteAsked(): void {
  if (state.household.answered) return;
  state.household = { ...state.household, answered: true, at: now() };
  save();
}
/** Dismissed with its ×: on this device, for every plan. */
export function dismissAsked(): void {
  try { localStorage.setItem(ASKED_KEY, 'dismissed'); } catch { /* no storage: asked again next time */ }
}
/** Whether this device dismissed the question with its ×. */
export const askDismissed = (): boolean => loadAsked() === 'dismissed';
/**
 * Whether step 6 ("Who's in your yard?") was done on this device before the question was kept: its Next counts, with
 * nothing ticked too (src/intro.ts keeps it in 'lp-intro'). Read for plans from before plans kept it.
 */
export function introAnswered(): boolean {
  try { return parseIntroRecord(localStorage.getItem('lp-intro')).done.includes('who'); } catch { return false; }
}
/**
 * Whether the picker asks it at the top of its filters, as it opens: not once it's been answered for the plan (or it
 * has anyone in its yard) or dismissed on this device. Decided as the picker opens and kept till it closes, so an
 * answer given there stays in view to see (only a dismissal moves it at once).
 */
export function askAtTop(o: { dismissed: boolean; household: PlanHousehold }): boolean {
  return !o.dismissed && !o.household.answered && !yardSet(o.household);
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
