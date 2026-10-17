import { MIN_TRUNK } from './constants';
import { fullRingRadius } from './my-plants';
import { plantsById } from './plants';
import type { CircleShape, Shape } from './types';

// Trees: a trunk at the center under the canopy. The trunk is drawn as a
// brown disc ringed with short spokes, like branches seen from above. Until
// the catalog has trunk sizes, a trunk is sized in proportion to the canopy
// (a rule of thumb: about a twentieth of its spread), so a young tree drawn
// with half its mature canopy gets half its mature trunk. When the tree is
// selected, its full-grown trunk shows as a dashed ring, like its canopy.

/** Trunk diameter as a share of canopy spread, until the catalog has real trunk sizes. */
export const TRUNK_SHARE = 1 / 20;
export const TRUNK_COLOR = '#78350f';

/** Drawn as a tree: added as one, or a plant whose catalog form is a tree. */
export function isTree(s: Shape): s is CircleShape {
  if (s.type !== 'circle' || s.role !== 'plant') return false;
  if (s.tree) return true;
  const form = s.plantId ? plantsById[s.plantId]?.form : undefined;
  return !!form && form.startsWith('Tree');
}
const quarter = (v: number) => Math.max(MIN_TRUNK, Math.round(v * 4) / 4);
/** Trunk diameter (feet) in proportion to a canopy this wide. */
export function trunkFor(spread: number): number { return quarter(spread * TRUNK_SHARE); }
/** The trunk drawn: set by hand, else in proportion to the canopy as drawn. */
export function trunkDiameter(s: CircleShape): number {
  return s.trunk ?? trunkFor(s.radius * 2);
}
/** The full-grown trunk, when the tree is drawn smaller than full size (else null). */
export function fullTrunkDiameter(s: CircleShape): number | null {
  const full = fullRingRadius(s);
  if (!full) return null;
  const d = quarter(trunkDiameter(s) * full / s.radius);
  return d > trunkDiameter(s) ? d : null;
}

/**
 * Change a circle's radius. A shaped canopy grows or shrinks with it, about
 * the trunk, so its outline keeps reaching exactly the new radius.
 */
export { setRadius } from './geometry';

/** SVG pieces of a tree's trunk, as element name and attributes (shared by the screen and exports). */
export interface Part { tag: 'circle'; attrs: Record<string, string | number> }
/**
 * The trunk at (cx, cy) px: a disc, a ring of spokes around it, and (when
 * `full`) a dashed ring at the full-grown size. `ppf`: px per foot; `k`
 * scales line widths for print.
 */
function trunkSize(s: CircleShape, ppf: number, k: number) {
  const r = Math.max(1.5 * k, (trunkDiameter(s) / 2) * ppf);
  const spoke = Math.max(2 * k, r * 0.7); // how far the spokes reach past the trunk
  return { r, spoke };
}
/** How far (px) the trunk and its spokes reach from the center. */
export function trunkReachPx(s: CircleShape, ppf: number, k = 1): number {
  const { r, spoke } = trunkSize(s, ppf, k);
  return r + spoke;
}
export function trunkParts(s: CircleShape, cx: number, cy: number, ppf: number, full: boolean, k = 1): Part[] {
  const { r, spoke } = trunkSize(s, ppf, k);
  const ringR = r + spoke / 2;
  // About 12 spokes, each a short dash; a wide stroke turns the dashes sideways, into spokes.
  const circ = 2 * Math.PI * ringR;
  const n = Math.max(6, Math.min(16, Math.round(circ / (4 * k))));
  const dash = Math.max(0.8 * k, Math.min(r * 0.35, circ / n / 2));
  const parts: Part[] = [
    { tag: 'circle', attrs: { 'data-role': 'trunk-spokes', cx, cy, r: ringR, fill: 'none', stroke: TRUNK_COLOR, 'stroke-width': spoke, 'stroke-dasharray': `${dash} ${circ / n - dash}`, 'stroke-opacity': 0.75 } },
    { tag: 'circle', attrs: { 'data-role': 'trunk', cx, cy, r, fill: TRUNK_COLOR, stroke: '#fff', 'stroke-width': Math.min(1.5 * k, r / 3), 'stroke-opacity': 0.8 } },
  ];
  const fullD = full ? fullTrunkDiameter(s) : null;
  if (fullD) {
    parts.push({ tag: 'circle', attrs: { 'data-role': 'full-trunk', cx, cy, r: (fullD / 2) * ppf, fill: 'none', stroke: TRUNK_COLOR, 'stroke-width': 1.2 * k, 'stroke-dasharray': `${3 * k} ${3 * k}` } });
  }
  return parts;
}
/** The same pieces as SVG markup (exports and print). */
export function partsToSvg(parts: Part[]): string {
  return parts.map((p) => `<${p.tag} ${Object.entries(p.attrs).filter(([n]) => n !== 'data-role').map(([n, v]) => `${n}="${v}"`).join(' ')}/>`).join('');
}
/** A shaped canopy's outline as SVG points, in px. */
export function canopyPoints(s: CircleShape, toPx: (x: number, y: number) => [number, number]): string {
  return (s.canopy ?? []).map(([dx, dy]) => toPx(s.x + dx, s.y + dy).join(',')).join(' ');
}
/**
 * The largest circle around the trunk that stays inside a shaped canopy (feet),
 * for fitting the name in; the radius for a round one.
 */
export function canopyInnerRadius(s: CircleShape): number {
  const c = s.canopy;
  if (!c || c.length < 3) return s.radius;
  let best = Infinity;
  for (let i = 0; i < c.length; i++) {
    const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
