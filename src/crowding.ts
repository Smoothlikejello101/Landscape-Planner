import { plantSpread } from './my-plants';
import type { Plant } from './plants';
import type { Shape } from './types';

// Crowding (task C2): two plants are crowded when their centers are closer
// than CROWD_FACTOR of the usual spacing, which is half of each plant's
// typical spread added together (the distance at which they just touch at
// typical size). Uses plant data when there is some, else the drawn circle.
//
// Plants only crowd plants in the same layer of the garden: canopy trees,
// understory trees, and everything below them. Shrubs under an oak, or a
// redbud under its edge, is ordinary layered planting, not crowding.

export const CROWD_FACTOR = 0.75;

function typicalRadius(s: Shape, byId: Record<string, Plant | undefined>): number | null {
  if (s.type !== 'circle' || s.role !== 'plant' || s.status === 'gone') return null;
  const p = s.plantId ? byId[s.plantId] : undefined;
  return p ? plantSpread(p, 'typical') / 2 : s.radius;
}
/** 2 canopy tree, 1 understory tree, 0 everything else. A tree of unknown kind counts as canopy. */
export function layerOf(s: Shape, byId: Record<string, Plant | undefined>): number {
  const form = s.plantId ? byId[s.plantId]?.form : undefined;
  if (form === 'Tree (canopy)') return 2;
  if (form === 'Tree (understory)') return 1;
  if (form?.startsWith('Tree')) return 2;
  return s.type === 'circle' && s.tree ? 2 : 0;
}
export interface Crowd { other: Shape; distance: number; recommended: number }

/** Plants crowding `s`, closest first. */
export function crowdingOf(s: Shape, shapes: Shape[], byId: Record<string, Plant | undefined>): Crowd[] {
  const r = typicalRadius(s, byId);
  if (r == null || s.type !== 'circle') return [];
  const layer = layerOf(s, byId);
  const out: Crowd[] = [];
  for (const o of shapes) {
    if (o === s || o.type !== 'circle' || layerOf(o, byId) !== layer) continue;
    const ro = typicalRadius(o, byId);
    if (ro == null) continue;
    const distance = Math.hypot(o.x - s.x, o.y - s.y);
    const recommended = r + ro;
    if (distance < recommended * CROWD_FACTOR) out.push({ other: o, distance, recommended });
  }
  return out.sort((a, b) => a.distance / a.recommended - b.distance / b.recommended);
}
/** Ids of every crowded plant (for highlighting). */
export function crowdedIds(shapes: Shape[], byId: Record<string, Plant | undefined>): Set<string> {
  const plants = shapes.filter((s) => typicalRadius(s, byId) != null) as (Shape & { type: 'circle' })[];
  const radii = plants.map((s) => typicalRadius(s, byId)!);
  const layers = plants.map((s) => layerOf(s, byId));
  const ids = new Set<string>();
  // Sort by x so only nearby plants are compared.
  const order = plants.map((_, i) => i).sort((a, b) => plants[a].x - plants[b].x);
  const maxR = Math.max(0, ...radii);
  for (let a = 0; a < order.length; a++) {
    const i = order[a];
    for (let b = a + 1; b < order.length; b++) {
      const j = order[b];
      if (plants[j].x - plants[i].x >= (radii[i] + maxR) * CROWD_FACTOR) break;
      if (layers[i] !== layers[j]) continue;
      const d = Math.hypot(plants[j].x - plants[i].x, plants[j].y - plants[i].y);
      if (d < (radii[i] + radii[j]) * CROWD_FACTOR) { ids.add(plants[i].id); ids.add(plants[j].id); }
    }
  }
  return ids;
}
