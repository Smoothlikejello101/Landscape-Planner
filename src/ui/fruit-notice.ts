// A partner for fruit, said as a plant is placed (Jason, Oct 30): male and female plants, a second variety needed or
// helping (src/fruit-partners.ts). Once a go for each plant, and not over another notice (crowding and hardiness are
// said first), until the plan has its partner. Its buttons offer the catalog's plants that would be one ("Add 'Southern
// Gentleman'"), placed next as any plant picked is; Don't remind me dismisses it for the plant across the plan.

import { dismissedForPlan, dismissForPlan, warnForNewOnes } from '../dismissals';
import { fruitNeed } from '../fruit-partners';
import { PLANTS, plantsById, type Plant } from '../plants';
import { state } from '../state';
import type { Shape } from '../types';
import { openWarningsAt } from './layers-panel';
import { toastAction } from './toast';

/** A plant offered by its cultivar's name where it has one ("'Southern Gentleman'"), else its name. */
const offerName = (p: Plant) => /['‘][^'’]+['’]/.exec(p.common)?.[0] ?? p.common;

export function fruitNotice(shape: Shape, place: (p: Plant) => void) {
  if (!state.fruitWarnings || !state.placing || shape.role !== 'plant' || !shape.plantId) return;
  if (state.placing.warnedFruit === shape.plantId || document.getElementById('toast-action')) return;
  const p = plantsById[shape.plantId];
  if (!p) return;
  const plan = state.shapes.flatMap((s) => (s.role === 'plant' && s.plantId && plantsById[s.plantId] ? [plantsById[s.plantId]] : []));
  const need = fruitNeed(p, plan, PLANTS);
  // (Not reminded again for a plant dismissed across the plan: src/dismissals.ts.)
  if (!need || dismissedForPlan('fruit', p.id, need.line)) return;
  state.placing.warnedFruit = shape.plantId;
  const id = p.id, line = need.line;
  toastAction(`${line}.`, [
    ...need.offer.map((q) => ({ label: `Add ${offerName(q)}`, run: () => place(q) })),
    // (Dismissed for this plant across the plan, its new copies too, with a toast that says so: Jason, Oct 30.)
    { label: "Don't remind me", run: () => {
      dismissForPlan('fruit', id, line);
      toastAction(`Fruit partner reminders off for ${p.common} in this plan, and any you add later.`, [
        { label: 'Warn me for new ones', run: () => warnForNewOnes('fruit', id, line) },
        { label: 'OK', run: () => {} },
      ], 10000, 'dismiss-notice');
    } },
    { label: 'Settings', run: () => openWarningsAt('fruit-warnings') },
  ], 12000, 'fruit-notice');
  const n = document.getElementById('toast-action');
  if (n) n.dataset.about = shape.id; // (gone with the plant: src/ui/toast.ts placeNotice)
}
