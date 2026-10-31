// Too cold, or maybe too warm, where the garden is: said as a plant is placed (Jason, Oct 30, from round 2: Lena
// placed a fig marked "Too cold here" and nothing said so; "too hot and too cold should get warnings by default").
// Once a go for each plant, and not over a crowding notice, which is said first (src/ui/crowd-notice.ts). Its badge
// stays on the plan (src/canvas.ts), and its pane says so, with Dismiss (src/ui/role-sections.ts).

import { dismissedForPlan } from '../dismissals';
import { hardinessWarning, plantsById } from '../plants';
import { state } from '../state';
import type { Shape } from '../types';
import { openWarningsAt } from './layers-panel';
import { toastAction } from './toast';

export function hardyNotice(shape: Shape, takeBack: () => void) {
  if (!state.hardyWarnings || !state.placing || shape.role !== 'plant' || !shape.plantId) return;
  if (state.placing.warnedHardy === shape.plantId || document.getElementById('toast-action')) return;
  const p = plantsById[shape.plantId];
  const w = p ? hardinessWarning(p) : null;
  if (!w || dismissedForPlan('hardy', p!.id, w.line)) return; // (dismissed for this plant across the plan)
  state.placing.warnedHardy = shape.plantId;
  toastAction(`${w.cold ? '\u2744' : '\u2600'} ${w.line}.`, [
    { label: 'Leave it', run: () => {} },
    { label: 'Undo', run: takeBack },
    { label: 'Settings', run: () => openWarningsAt('hardy-warnings') },
  ], 10000, 'hardy-notice', { tone: 'amber' });
  const n = document.getElementById('toast-action');
  if (n) n.dataset.about = shape.id; // (gone with the plant: src/ui/toast.ts placeNotice)
}
