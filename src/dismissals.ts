// Warnings dismissed for a plant across the plan (Jason, Oct 30): hardiness and poison are the plant's, not where a copy
// stands, so dismissing one dismisses its other copies and the ones added later, with a toast that says so and offers
// to warn again for new ones. Fruit-partner reminders too. Per plan: another plan, another yard, warns again. Each is
// kept with what the warning said when it was dismissed, so it comes back if that changes (a new ZIP; someone new in
// the yard). Sun and crowding stay a copy's own: they depend on where it stands. Shown again from the plant's pane or
// Layers → Warnings, "Dismissed in this plan".

import { pushHistory } from './history';
import { householdFlags, plantsById, type Plant } from './plants';
import { state } from './state';
import { save } from './storage';
import type { DismissKind, Shape } from './types';

/** What a plant's poison warning says, for who's in the yard now ("Poisonous to people; A problem for dogs"): its key. */
export const poisonSaid = (p: Plant): string => householdFlags(p).map((f) => f.text).join('; ');

/** Each kind as a person reads it ("Fig: hardiness"). */
export const DISMISS_WORDS: Record<DismissKind, string> = { hardy: 'hardiness', poison: 'poison', fruit: 'fruit partner' };

/** Whether this kind of warning, saying `said`, is dismissed for the plant across the plan. */
export function dismissedForPlan(kind: DismissKind, plantId: string | undefined, said: string): boolean {
  return !!plantId && state.dismissed?.[kind]?.[plantId] === said;
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
  dropPlanEntry(kind, plantId);
  const field = kind === 'hardy' ? 'hardyDismissed' : kind === 'poison' ? 'poisonDismissed' : null;
  const copies = field ? copiesOf(plantId).filter((s) => s[field] !== undefined) : [];
  if (copies.length) {
    for (const s of copies) delete s[field!];
    pushHistory();
  }
  save();
}

/**
 * New copies warn again; those placed so far stay dismissed, each its own (hardiness and poison: a badge each), or, for
 * fruit partners (said only as one is placed), nothing more to do. Saved.
 */
export function warnForNewOnes(kind: DismissKind, plantId: string, said: string) {
  dropPlanEntry(kind, plantId);
  const field = kind === 'hardy' ? 'hardyDismissed' : kind === 'poison' ? 'poisonDismissed' : null;
  if (field) {
    for (const s of copiesOf(plantId)) s[field] = said;
    pushHistory();
  }
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

/** Everything dismissed across the plan, by plant name: for Layers → Warnings. */
export function planDismissals(): { kind: DismissKind; plantId: string; name: string }[] {
  const out: { kind: DismissKind; plantId: string; name: string }[] = [];
  for (const kind of ['hardy', 'poison', 'fruit'] as const) {
    for (const plantId of Object.keys(state.dismissed?.[kind] ?? {})) out.push({ kind, plantId, name: plantsById[plantId]?.common ?? plantId });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
}

/** "all 3 figs" for the toast: the plant's copies in the plan, by name ("Fig" and "all 3 of Fig" avoid a guessed plural). */
export function copiesSaid(plantId: string): string {
  const n = copiesOf(plantId).length, name = plantsById[plantId]?.common ?? 'this plant';
  return n > 1 ? `all ${n} of ${name}` : name;
}
