import { pointInShape, rotate, setCenter, shapeArea, shapeCenter } from './geometry';
import { isLocked } from './roles';
import type { Shape, ShapePatch } from './types';

// Bed membership is worked out from position, never stored: a plant belongs
// to the bed its center sits in (the smallest one if beds overlap). So it can
// never go stale when plants or beds move.

export const isBed = (s: Shape) => s.role === 'bed';
export const isPlant = (s: Shape) => s.role === 'plant';
export const carriesPlants = (bed: Shape) => isBed(bed) && bed.carryPlants !== false;

/** The bed a plant sits in, or null. */
export function bedOf(plant: Shape, shapes: Shape[]): Shape | null {
  const c = shapeCenter(plant);
  let best: Shape | null = null;
  for (const s of shapes) {
    if (isBed(s) && s !== plant && pointInShape(s, c) && (!best || shapeArea(s) < shapeArea(best))) best = s;
  }
  return best;
}
export function plantsInBed(bed: Shape, shapes: Shape[]): Shape[] {
  return shapes.filter((s) => isPlant(s) && bedOf(s, shapes) === bed);
}
/**
 * The ids that move with a selection: what's selected, and, only when no plant is among it, the plants its beds carry
 * (Jason, Oct 31, from round 3: Hank's lasso took in a bed's edge with three plants, and moving them moved the bed and
 * all 27 in it. A bed, or beds, moved on their own still bring their plants.)
 */
export function movedWith(selected: Shape[], shapes: Shape[]): string[] {
  if (selected.some(isPlant)) return selected.map((s) => s.id);
  return [...new Set(selected.flatMap((s) => [s.id, ...attachedPlants(s, shapes).map((p) => p.id)]))];
}
/** Plants that should move with `bed` right now (unlocked members, if the bed carries plants). */
export function attachedPlants(bed: Shape, shapes: Shape[]): Shape[] {
  return carriesPlants(bed) ? plantsInBed(bed, shapes).filter((p) => !isLocked(p)) : [];
}
/** "Coneflower ×3, Heuchera" — plants in a bed grouped by label. */
export function plantSummary(plants: Shape[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of plants) {
    const k = p.label || 'Unlabeled plant';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Apply `patch` to a bed, carrying its plants along: a move translates them,
 * a rotation swings them around the bed's center (and turns them with it).
 * Resizing leaves them in place. Returns the ids of plants that moved.
 */
export function patchBedCarryingPlants(bed: Shape, patch: ShapePatch, shapes: Shape[]): string[] {
  const members = attachedPlants(bed, shapes);
  const before = shapeCenter(bed);
  const rotBefore = bed.type === 'circle' ? 0 : bed.rotation || 0;
  Object.assign(bed, patch);
  if (!members.length) return [];
  const moves = 'x' in patch || 'y' in patch || 'rotation' in patch;
  if (!moves) return [];
  const resized = 'width' in patch || 'height' in patch || 'radius' in patch;
  const after = shapeCenter(bed);
  // A resize alone also shifts the center of box shapes; that is not a move.
  const dx = resized && !('x' in patch) ? 0 : after.x - before.x;
  const dy = resized && !('y' in patch) ? 0 : after.y - before.y;
  const dRot = (bed.type === 'circle' ? 0 : bed.rotation || 0) - rotBefore;
  for (const p of members) {
    const c = shapeCenter(p);
    const r = rotate(c.x - before.x, c.y - before.y, dRot);
    setCenter(p, { x: before.x + dx + r.x, y: before.y + dy + r.y });
    if (dRot && p.type !== 'circle') p.rotation = ((p.rotation || 0) + dRot) % 360;
  }
  return members.map((p) => p.id);
}
