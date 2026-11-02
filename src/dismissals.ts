// Warnings dismissed for a plant across the plan (Jason, Oct 30): hardiness and poison are the plant's, not where a copy
// stands, so dismissing one dismisses its other copies and the ones added later, with a toast that says so and offers
// to warn again for new ones. Fruit-partner reminders too (offering Undo instead: no copy keeps its own). Per plan:
// another plan, another yard, warns again. Each is kept with what the warning said when it was dismissed, so it comes
// back if that changes (a new ZIP; for poison, someone newly at risk in the yard, not fewer: poisonCovered). Sun and
// crowding stay a copy's own: they depend on where it stands. Shown again from the plant's pane or Warnings
// (src/warnings-list.ts, src/ui/warnings-sheet.ts), where they can be dismissed too (Jason, Nov 1).

import { pushHistory } from './history';
import { householdFlags, plantsById, type Plant } from './plants';
import { state } from './state';
import { save } from './storage';
import type { DismissKind, Shape } from './types';

/** What a plant's poison warning says, for who's in the yard now ("Poisonous to people; A problem for dogs"): its key. */
export const poisonSaid = (p: Plant): string => householdFlags(p).map((f) => f.text).join('; ');
/**
 * The same warning in the words its details use, with its severity and parts: "Poisonous if eaten (high severity:
 * leaves and seeds); a problem for dogs" (its details' banner; a row in Warnings: the review, Nov 1, every poison row
 * read "Poisonous to people; A problem for dogs" whatever the severity).
 */
export const poisonLine = (p: Plant): string =>
  householdFlags(p).map((f, i) => { const t = f.testid === 'row-poison' ? f.title ?? f.text : f.text; return i ? t.charAt(0).toLowerCase() + t.slice(1) : t; }).join('; ');

/** Each kind as a person reads it ("Fig: hardiness"). */
export const DISMISS_WORDS: Record<DismissKind, string> = { hardy: 'hardiness', poison: 'poison', fruit: 'fruit partner' };

/**
 * Who a poison warning's key says is at risk (poisonSaid): "Poisonous to people; A problem for dogs and cats" is
 * people, dogs and cats. A part it doesn't know stands for itself, whole.
 */
export function atRisk(said: string): Set<string> {
  const out = new Set<string>();
  for (const part of said.split('; ')) {
    if (!part) continue;
    const pets = /^A problem for (.+)$/.exec(part);
    if (part === 'Poisonous to people') out.add('people');
    else if (pets) for (const who of pets[1].split(/, | and /)) out.add(who);
    else out.add(part);
  }
  return out;
}
/**
 * Whether a poison warning dismissed when it said `then` is still dismissed now it says `now`: so long as nobody new is
 * at risk. The same, or fewer (the kids gone from the yard, the dogs still there), keeps it dismissed; someone newly at
 * risk (cats added) brings it back (Jason, Nov 1, from the warnings bug hunt: any change in who's in the yard brought
 * every dismissed poison warning back). What's kept is what it said when dismissed, as before.
 */
export function poisonCovered(then: string | undefined, now: string): boolean {
  if (!then) return false;
  if (then === now) return true;
  const was = atRisk(then);
  return [...atRisk(now)].every((who) => was.has(who));
}
/** Whether a copy's own dismissal of this kind (hardiness or poison) covers its warning saying `said` now. */
export function copyDismissed(kind: 'hardy' | 'poison', s: Shape, said: string): boolean {
  return kind === 'poison' ? poisonCovered(s.poisonDismissed, said) : s.hardyDismissed === said;
}

/** Whether this kind of warning, saying `said`, is dismissed for the plant across the plan. */
export function dismissedForPlan(kind: DismissKind, plantId: string | undefined, said: string): boolean {
  const kept = plantId ? state.dismissed?.[kind]?.[plantId] : undefined;
  if (kept === undefined) return false;
  return kind === 'poison' ? poisonCovered(kept, said) : kept === said;
}

/** A plant's copies in the plan. */
export const copiesOf = (plantId: string): Shape[] => state.shapes.filter((s) => s.role === 'plant' && s.plantId === plantId);

/** Dismiss it for the plant across the plan: its copies and the ones added later. Saved. */
export function dismissForPlan(kind: DismissKind, plantId: string, said: string) {
  state.dismissed = { ...(state.dismissed ?? {}), [kind]: { ...(state.dismissed?.[kind] ?? {}), [plantId]: said } };
  save();
}

/**
 * Warn again for the plant: from now on, for every copy too (hardiness and poison are also dismissed copy by copy, by
 * "Warn me for new ones": those go as well). Saved.
 */
export function showAgainForPlan(kind: DismissKind, plantId: string) {
  if (clearForPlan(kind, plantId)) pushHistory();
  save();
}
/**
 * What showAgainForPlan changes, without its step or save (Warnings shows a kind's all again as one step:
 * Jason, Nov 1). Whether a copy changed.
 */
export function clearForPlan(kind: DismissKind, plantId: string): boolean {
  dropPlanEntry(kind, plantId);
  const field = kind === 'hardy' ? 'hardyDismissed' : kind === 'poison' ? 'poisonDismissed' : null;
  const copies = field ? copiesOf(plantId).filter((s) => s[field] !== undefined) : [];
  for (const s of copies) delete s[field!];
  return copies.length > 0;
}

/**
 * New copies warn again; those placed so far stay dismissed, each its own (a badge each). Hardiness and poison only: a
 * plan keeps no fruit-partner dismissal copy by copy (src/ui/fruit-notice.ts remindNoMore). Saved.
 */
export function warnForNewOnes(kind: 'hardy' | 'poison', plantId: string, said: string) {
  dropPlanEntry(kind, plantId);
  const field = kind === 'hardy' ? 'hardyDismissed' : 'poisonDismissed';
  for (const s of copiesOf(plantId)) s[field] = said;
  pushHistory();
  save();
}

function dropPlanEntry(kind: DismissKind, plantId: string) {
  const m = state.dismissed?.[kind];
  if (!m || !(plantId in m)) return;
  const rest = { ...m };
  delete rest[plantId];
  const next = { ...state.dismissed };
  if (Object.keys(rest).length) next[kind] = rest; else delete next[kind];
  state.dismissed = next; // (kept, even empty, once the plan has had any: so showing them all again syncs too)
}

/** Everything dismissed across the plan, by plant name, current or not (Settings lists only those still in force). */
export function planDismissals(): { kind: DismissKind; plantId: string; name: string }[] {
  const out: { kind: DismissKind; plantId: string; name: string }[] = [];
  for (const kind of ['hardy', 'poison', 'fruit'] as const) {
    for (const plantId of Object.keys(state.dismissed?.[kind] ?? {})) out.push({ kind, plantId, name: plantsById[plantId]?.common ?? plantId });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
}

/**
 * The plant's copies in the plan, by name, for the toast: "Fig", "both Fig", "all 3 Fig" (a plant's name as a nursery
 * says it, "3 Oleander": no guessed plural; not "all 2 of Oleander", the warnings bug hunt, Nov 1).
 */
export function copiesSaid(plantId: string): string {
  const n = copiesOf(plantId).length, name = plantsById[plantId]?.common ?? 'this plant';
  return n > 2 ? `all ${n} ${name}` : n === 2 ? `both ${name}` : name;
}
