// A partner for fruit, said as a plant is placed (Jason, Oct 30): male and female plants, a second variety needed or
// helping (src/fruit-partners.ts). Once a go for each plant, and not over another notice (crowding and hardiness are
// said first), until the plan has its partner. Its buttons offer the catalog's plants that would be one ("Add 'Southern
// Gentleman'"), the best two, alike (those its sources name first, then those hardy here), placed next as any plant
// picked is; with more, "All 7…" opens the picker on them; Dismiss dismisses it for the plant across the plan.

import { copiesOf, copiesSaid, dismissedForPlan, dismissForPlan, warnForNewOnes } from '../dismissals';
import { hardyHere } from '../crowd-here';
import { fruitNeed } from '../fruit-partners';
import { PLANTS, plantsById, showPartnersOf, type Plant } from '../plants';
import { state } from '../state';
import type { Shape } from '../types';
import { openWarningsAt } from './warnings-sheet';
import { render } from './render';
import { toastAction } from './toast';

/** A plant offered by its cultivar's name where it has one ("'Southern Gentleman'"), else its name. */
const offerName = (p: Plant) => /['‘][^'’]+['’]/.exec(p.common)?.[0] ?? p.common;

export function fruitNotice(shape: Shape, place: (p: Plant) => void) {
  if (!state.fruitWarnings || !state.placing || shape.role !== 'plant' || !shape.plantId) return;
  if (state.placing.warnedFruit === shape.plantId || document.getElementById('toast-action')) return;
  const p = plantsById[shape.plantId];
  if (!p) return;
  const plan = state.shapes.flatMap((s) => (s.role === 'plant' && s.plantId && plantsById[s.plantId] ? [plantsById[s.plantId]] : []));
  const need = fruitNeed(p, plan, PLANTS, hardyHere);
  // (Not reminded again for a plant dismissed across the plan: src/dismissals.ts.)
  if (!need || dismissedForPlan('fruit', p.id, need.line)) return;
  state.placing.warnedFruit = shape.plantId;
  const id = p.id, line = need.line;
  toastAction(`${line}.`, [
    // (Its choices alike: none is "the" answer. Jason, Oct 30: two females in two colors.)
    ...need.offer.map((q) => ({ label: `Add ${offerName(q)}`, run: () => place(q), className: 'notice-choice' })),
    // (More than two: the picker, showing only them, to compare in its details.)
    ...(need.all.length > need.offer.length ? [{ label: `All ${need.all.length}\u2026`, run: () => {
      showPartnersOf(id);
      state.panel = 'plants';
      render();
    } }] : []),
    { label: 'Dismiss', run: () => remindNoMore(id, line) },
    { label: 'Settings', run: () => openWarningsAt('fruit') },
  ], 12000, 'fruit-notice');
  const n = document.getElementById('toast-action');
  if (n) n.dataset.about = shape.id; // (gone with the plant: src/ui/toast.ts placeNotice)
}

/**
 * Dismiss ("Don't remind me" until Nov 1: one vocabulary): dismissed for this plant across the plan, its new copies too,
 * with a toast that says so (Jason, Oct 30), and "Just these 2" to keep it to those there now. Also a fruit-partner
 * row's Dismiss in Warnings (Jason, Nov 1), whose list is redrawn with it.
 */
export function remindNoMore(id: string, line: string) {
  const who = copiesSaid(id), n = copiesOf(id).length;
  dismissForPlan('fruit', id, line);
  render();
  toastAction(`Fruit partner warning dismissed for ${who} in this plan, and any you add later.`, [
    { label: n > 1 ? `Just these ${n}` : 'Just this one', run: () => { warnForNewOnes('fruit', id, line); render(); } },
    { label: 'OK', run: () => {} },
  ], 10000, 'dismiss-notice');
}
