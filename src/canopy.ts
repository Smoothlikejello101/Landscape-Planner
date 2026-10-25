// A tree's canopy is drawn over what grows under it, but taps go through it: to the bed, the shrub or the path
// beneath, or the ground. The tree itself is picked by its trunk (decided with Jason, 2026-10-25). The first few
// times a tap lands under a canopy, a hint says how to pick the tree (and once more after a long time away).
import { isTree, trunkReachPx } from './trees';
import { shownWith } from './status';
import { pointInShape } from './geometry';
import { state } from './state';
import { toast } from './ui/toast';
import { hintDue, hintShown } from './hints';
import type { CircleShape, Point, Shape } from './types';

/** The smallest a trunk is to tap, as a radius in px (a 44 px target, a fingertip). */
export const TRUNK_HIT_PX = 22;
/** The trunk's tap target, radius in px: its drawn trunk and spokes, at least a fingertip, never past the canopy. */
export function trunkHitPx(s: CircleShape, ppf: number): number {
  return Math.min(s.radius * ppf, Math.max(TRUNK_HIT_PX, trunkReachPx(s, ppf)));
}

/**
 * The trees whose canopy (outside the trunk's tap target) a point on the plan (feet) is under, top-most first.
 * `ppf`: px per foot, for the trunk's target.
 */
export function canopiesAt(p: Point, shapes: Shape[], ppf: number): CircleShape[] {
  const out: CircleShape[] = [];
  for (const s of shapes) {
    if (!isTree(s) || !shownWith(s, state.viewFilter)) continue;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d * ppf <= trunkHitPx(s, ppf)) continue;
    if (pointInShape(s, p)) out.push(s);
  }
  return out.reverse();
}

/** How many times the hint has shown on this device (src/hints.ts): it stops at HINT_TIMES. */
const HINT_KEY = 'lp-canopy-hint';
export const HINT_TIMES = 3;
/**
 * After a tap at `p` that didn't pick a tree: if it was under a canopy, say how to pick that tree (its trunk), the
 * first few times on this device, and once after a long time away.
 */
export function canopyHint(p: Point, shapes: Shape[], ppf: number, picked?: string | null): void {
  if (!hintDue(HINT_KEY, HINT_TIMES)) return;
  const tree = canopiesAt(p, shapes, ppf).find((t) => t.id !== picked);
  if (!tree) return;
  const name = tree.label.trim();
  toast(name ? `Under ${name}’s canopy. To pick the tree, tap its trunk.` : 'Under a tree’s canopy. To pick the tree, tap its trunk.', 5000);
  hintShown(HINT_KEY);
}
