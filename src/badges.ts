// Warning badges on a plant (poison, utilities, hardiness, sun): on the plant itself, not by its name (Jason's notes after
// release 3: "flags show up on names, I guess? I would expect them on the plant itself, so the flagged cardinal flower
// and milkweed made me think a plant was out of place"). Until then each kind had its own spot around where the name
// was written: for a run of one plant named once, that was the run's middle, between plants; for a small plant, all
// four huddled on the name written over its edge.
//
// Now they stack at one corner of the plant's own circle, safety first as Warnings lists them: the first centered on its
// edge at the top right, the others above it, a column rising from the circle. (A plant smaller than a badge has it at
// its corner, not over its middle.) Where that corner is taken, by a neighbor's badges or a neighbor itself (a badge
// whose middle is inside another plant), the top left, then the bottom right and the bottom left (a column going down
// from those); none clear, the top right. With
// its full-size ring shown, the stack is moved in or out along its corner until it's clear of the ring, the least it
// can be. A climbing vine starts at the bottom: its name is above its spot.
//
// Only the arithmetic, in screen px: where they're drawn is src/canvas.ts.

/** The kinds of badge, in the order they stack: safety first, as Warnings lists them (src/warnings-list.ts). */
export type BadgeKind = 'poison' | 'utility' | 'hardy' | 'sun';
export const BADGE_ORDER: BadgeKind[] = ['poison', 'utility', 'hardy', 'sun'];
/** A badge's half size (px) at full size, its white edge and all; and the step from one stacked to the next. */
export const BADGE_HALF = 10;
export const BADGE_STEP = 19;
/** Top right, top left, bottom right, bottom left. */
export type Corner = 0 | 1 | 2 | 3;
const SIGNS: [number, number][] = [[1, -1], [-1, -1], [1, 1], [-1, 1]];
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface Circle { x: number; y: number; r: number }
/**
 * What the badges go on: its middle and radius (px) as drawn; its full-size ring's radius, when that's shown; how many
 * badges; their scale (smaller once zoomed far out); and whether it's a climbing vine's spot.
 */
export interface BadgeHolder { x: number; y: number; r: number; full?: number | null; n: number; k: number; vine?: boolean }
/** Where a plant's badges go: its corner, and how far out from its middle (px) the first is centered, along it. */
export interface BadgeSpot { corner: Corner; rho: number }

/** The first badge's distance out (px): on the edge; a plant smaller than a badge, at its corner, clear of its middle. */
export const rimOf = (h: BadgeHolder): number => Math.max(h.r, BADGE_HALF * h.k * 1.2);
/** Each badge's middle (px), first to last. */
export function badgeCenters(h: Pick<BadgeHolder, 'x' | 'y' | 'n' | 'k'>, spot: BadgeSpot): { x: number; y: number }[] {
  const [sx, sy] = SIGNS[spot.corner], a = spot.rho * Math.SQRT1_2;
  return Array.from({ length: h.n }, (_, i) => ({ x: h.x + sx * a, y: h.y + sy * a + sy * i * BADGE_STEP * h.k }));
}
/** Each badge's box (px). */
export function badgeBoxes(h: Pick<BadgeHolder, 'x' | 'y' | 'n' | 'k'>, spot: BadgeSpot): Box[] {
  const e = BADGE_HALF * h.k;
  return badgeCenters(h, spot).map((c) => ({ x0: c.x - e, y0: c.y - e, x1: c.x + e, y1: c.y + e }));
}
const meets = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** The nearest and farthest a box comes to a point (px). */
function reach(b: Box, x: number, y: number): [number, number] {
  const nx = Math.max(b.x0, Math.min(x, b.x1)), ny = Math.max(b.y0, Math.min(y, b.y1));
  const fx = Math.max(Math.abs(b.x0 - x), Math.abs(b.x1 - x)), fy = Math.max(Math.abs(b.y0 - y), Math.abs(b.y1 - y));
  return [Math.hypot(nx - x, ny - y), Math.hypot(fx, fy)];
}
/** Whether the boxes keep clear of a ring of radius `R` around (x, y): each wholly inside it or wholly outside. */
export function ringClear(boxes: Box[], x: number, y: number, R: number, gap = 1.5): boolean {
  return boxes.every((b) => { const [near, far] = reach(b, x, y); return far <= R - gap || near >= R + gap; });
}
/**
 * Whether a badge sits on another plant: its middle inside that plant's circle, where it would read as that plant's. (Not
 * merely touching it: a row of plants side by side would have its badges flip from corner to corner.)
 */
const onCircle = (b: Box, c: Circle) => Math.hypot((b.x0 + b.x1) / 2 - c.x, (b.y0 + b.y1) / 2 - c.y) < c.r - 2;
/**
 * How far out the first badge goes at a corner, kept clear of the full-size ring: on the edge if it's clear there, else
 * the least moved in or out that is (in no nearer the middle than 40% of the edge); none, on the edge.
 */
function clearOfRing(h: BadgeHolder, corner: Corner, rim: number): { rho: number; ok: boolean } {
  const R = h.full;
  const clear = (rho: number) => !R || ringClear(badgeBoxes(h, { corner, rho }), h.x, h.y, R);
  if (clear(rim)) return { rho: rim, ok: true };
  const most = R! + (h.n * BADGE_STEP + 3 * BADGE_HALF) * h.k;
  for (let d = 2; rim + d <= most || rim - d >= 0.4 * rim; d += 2) {
    if (rim - d >= 0.4 * rim && clear(rim - d)) return { rho: rim - d, ok: true };
    if (rim + d <= most && clear(rim + d)) return { rho: rim + d, ok: true };
  }
  return { rho: rim, ok: false };
}
/**
 * Where a plant's badges go: the first corner (top right, top left, bottom right, bottom left; a vine's from the bottom)
 * whose stack is clear of the badges `placed` already, of the full-size ring and of the other plants `near` it; the
 * fewest of those met, by that order (a neighbor's badges worst, then the ring, then a neighbor).
 */
export function placeBadges(h: BadgeHolder, placed: Box[] = [], near: Circle[] = []): BadgeSpot {
  const rim = rimOf(h);
  const order: Corner[] = h.vine ? [2, 3, 0, 1] : [0, 1, 2, 3];
  let best: { spot: BadgeSpot; score: number } | null = null;
  for (const corner of order) {
    const { rho, ok } = clearOfRing(h, corner, rim);
    const spot = { corner, rho };
    const boxes = badgeBoxes(h, spot);
    const score = (boxes.some((b) => placed.some((p) => meets(b, p))) ? 4 : 0) + (ok ? 0 : 2) + (boxes.some((b) => near.some((c) => onCircle(b, c))) ? 1 : 0);
    if (!score) return spot;
    if (!best || score < best.score) best = { spot, score };
  }
  return best!.spot;
}
