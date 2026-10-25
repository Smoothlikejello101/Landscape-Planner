// A tree's canopy is drawn over what grows under it, but taps go through it: to the bed, the shrub or the path
// beneath, or the ground. The tree itself is picked by its trunk (decided with Jason, 2026-10-25). The first few
// times a tap lands under a canopy, a hint says how to pick the tree.
import { isTree, trunkReachPx } from './trees';
import { shownWith } from './status';
import { state } from './state';
import { toast } from './ui/toast';
import type { CircleShape, Point, Shape } from './types';

/** The smallest a trunk is to tap, as a radius in px (a 44 px target, a fingertip). */
export const TRUNK_HIT_PX = 22;
/** The trunk's tap target, radius in px: its drawn trunk and spokes, at least a fingertip, never past the canopy. */
export function trunkHitPx(s: CircleShape, ppf: number): number {
  return Math.min(s.radius * ppf, Math.max(TRUNK_HIT_PX, trunkReachPx(s, ppf)));
}

/** Whether a point (feet) is inside a polygon of [x, y] points. */
function inPolygon(p: Point, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
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
    if (s.canopy && s.canopy.length >= 3 ? inPolygon(p, s.canopy.map(([dx, dy]) => [s.x + dx, s.y + dy])) : d <= s.radius) out.push(s);
  }
  return out.reverse();
}

/** How many times the hint has shown on this device (it stops at HINT_TIMES). */
const HINT_KEY = 'lp-canopy-hint';
export const HINT_TIMES = 3;
function shownTimes(): number {
  try { return Number(localStorage.getItem(HINT_KEY)) || 0; } catch { return HINT_TIMES; }
}
/**
 * After a tap at `p` that didn't pick a tree: if it was under a canopy, say how to pick that tree (its trunk), the
 * first few times on this device.
 */
export function canopyHint(p: Point, shapes: Shape[], ppf: number, picked?: string | null): void {
  const n = shownTimes();
  if (n >= HINT_TIMES) return;
  const tree = canopiesAt(p, shapes, ppf).find((t) => t.id !== picked);
  if (!tree) return;
  const name = tree.label.trim();
  toast(name ? `Under ${name}’s canopy. To pick the tree, tap its trunk.` : 'Under a tree’s canopy. To pick the tree, tap its trunk.', 5000);
  try { localStorage.setItem(HINT_KEY, String(n + 1)); } catch { /* shown, not counted */ }
}
