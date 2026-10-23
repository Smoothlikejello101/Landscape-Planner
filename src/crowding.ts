import { plantSpread } from './my-plants';
import type { Plant } from './plants';
import { isTree } from './trees';
import type { CircleShape, Shape } from './types';

// Crowding (task C2): two plants are crowded when their centers are closer
// than CROWD_FACTOR of the usual spacing, which is half of each plant's
// typical spread added together (the distance at which they just touch at
// typical size). Uses plant data when there is some, else the drawn circle.
//
// Plants crowd only as much as their leaves share the same heights. A tree's
// crown can be raised (its lower limbs taken off) to a third of its height:
// arborists' guidance is to keep live branches on at least the upper two
// thirds of a tree (Iowa DNR, Texas A&M AgriLife). So a tree's crown is taken
// to run from a third of its typical height to the top, and anything else
// keeps its leaves to the ground. A 6 ft shrub under a 60 ft oak (crown from
// 20 ft) shares no height with it: ordinary layered planting, not crowding.
// A 25 ft redbud there reaches 5 ft into the oak's crown, three tenths of its
// own (8⅓ to 25 ft), so they crowd only within three tenths of the usual
// spacing. Two trees of a height, or two shrubs, share all of it: the usual
// spacing. An evergreen screen (Green Giant arborvitae: the catalog's
// `low_branched`) keeps its branches to the ground, so nothing shares its
// space; and a tree on the plan can be given its own height and lowest
// branches (the tree you have: limbed up higher, or never limbed at all).

export const CROWD_FACTOR = 0.75;
/** The share of a tree's height its trunk can be cleared to, keeping live branches on the upper two thirds. */
export const CLEAR_TRUNK = 1 / 3;

function typicalRadius(s: Shape, byId: Record<string, Plant | undefined>): number | null {
  if (s.type !== 'circle' || s.role !== 'plant' || s.status === 'gone') return null;
  const p = s.plantId ? byId[s.plantId] : undefined;
  return p ? plantSpread(p, 'typical') / 2 : s.radius;
}
/**
 * Where a plant's leaves are, in feet above the ground, by its typical height: null where that isn't known. A
 * tree with no height (one drawn without picking which, or a plant of my own without one) is taken to be about as
 * tall as it's drawn wide, as the catalog's shade trees are (northern red oak 60 ft tall and 62½ wide, bur oak 75
 * by 75): a stand-in, not a source's figure, so that an oak in the yard doesn't crowd every dogwood near it.
 */
export interface Band { tree: boolean; vine: boolean; band: [number, number] | null }
export function bandOf(s: Shape, byId: Record<string, Plant | undefined>): Band {
  const tree = isTree(s, byId);
  const p = s.plantId ? byId[s.plantId] : undefined;
  const vine = !tree && p?.form === 'Vine';
  const r = typicalRadius(s, byId);
  const { height: h, lowest } = tree && s.type === 'circle' ? treeBranches(s, p, r) : { height: p?.height?.med, lowest: 0 };
  if (!(h != null && h > 0)) return { tree, vine, band: null };
  return { tree, vine, band: [Math.min(lowest, h), h] };
}
/**
 * A tree's height and its lowest branches, in feet, and where each comes from: set by hand on the plan; else
 * the plant's typical height, or about as tall as it's drawn wide; its lowest branches a third of its height
 * up (the most they can be taken up), or the ground for an evergreen screen (the catalog's `low_branched`).
 */
export function treeBranches(s: CircleShape, p: Plant | undefined, r: number | null = s.radius): { height: number | undefined; lowest: number; heightFrom: 'hand' | 'plant' | 'spread' | null; lowestFrom: 'hand' | 'screen' | 'third' } {
  const heightFrom = s.treeHeight != null ? 'hand' : p?.height?.med != null ? 'plant' : r ? 'spread' : null;
  const height = s.treeHeight ?? p?.height?.med ?? (r ? r * 2 : undefined);
  const lowestFrom = s.lowestBranch != null ? 'hand' : p?.low_branched ? 'screen' : 'third';
  const lowest = s.lowestBranch ?? (p?.low_branched || height == null ? 0 : height * CLEAR_TRUNK);
  return { height, lowest, heightFrom, lowestFrom };
}
/**
 * How much two plants' leaves share the same heights, 0 to 1: the overlap as a share of the shorter crown.
 * A vine shares none with a tree: it's planted to climb one, or to cover the ground under it. Where either
 * height isn't known, trees crowd trees and everything else crowds everything else, as before.
 */
export function sharedHeight(a: Band, b: Band): number {
  if ((a.vine && b.tree) || (b.vine && a.tree)) return 0;
  if (!a.band || !b.band) return a.tree === b.tree ? 1 : 0;
  const over = Math.min(a.band[1], b.band[1]) - Math.max(a.band[0], b.band[0]);
  const shorter = Math.min(a.band[1] - a.band[0], b.band[1] - b.band[0]);
  return over <= 0 ? 0 : shorter > 0 ? Math.min(1, over / shorter) : 1;
}
/** `recommended`: the spacing they want, for the height they share (`shared`, 0 to 1). */
export interface Crowd { other: Shape; distance: number; recommended: number; shared: number }

/** Plants crowding `s`, closest first. */
export function crowdingOf(s: Shape, shapes: Shape[], byId: Record<string, Plant | undefined>): Crowd[] {
  const r = typicalRadius(s, byId);
  if (r == null || s.type !== 'circle') return [];
  const band = bandOf(s, byId);
  const out: Crowd[] = [];
  for (const o of shapes) {
    if (o === s || o.type !== 'circle') continue;
    const ro = typicalRadius(o, byId);
    if (ro == null) continue;
    const share = sharedHeight(band, bandOf(o, byId));
    if (share <= 0) continue;
    const distance = Math.hypot(o.x - s.x, o.y - s.y);
    const recommended = (r + ro) * share;
    if (distance < recommended * CROWD_FACTOR) out.push({ other: o, distance, recommended, shared: share });
  }
  return out.sort((a, b) => a.distance / a.recommended - b.distance / b.recommended);
}
/** Ids of every crowded plant (for highlighting). */
export function crowdedIds(shapes: Shape[], byId: Record<string, Plant | undefined>): Set<string> {
  const plants = shapes.filter((s) => typicalRadius(s, byId) != null) as (Shape & { type: 'circle' })[];
  const radii = plants.map((s) => typicalRadius(s, byId)!);
  const bands = plants.map((s) => bandOf(s, byId));
  const ids = new Set<string>();
  // Sort by x so only nearby plants are compared (a shared height never widens the usual spacing).
  const order = plants.map((_, i) => i).sort((a, b) => plants[a].x - plants[b].x);
  const maxR = Math.max(0, ...radii);
  for (let a = 0; a < order.length; a++) {
    const i = order[a];
    for (let b = a + 1; b < order.length; b++) {
      const j = order[b];
      if (plants[j].x - plants[i].x >= (radii[i] + maxR) * CROWD_FACTOR) break;
      const share = sharedHeight(bands[i], bands[j]);
      if (share <= 0) continue;
      const d = Math.hypot(plants[j].x - plants[i].x, plants[j].y - plants[i].y);
      if (d < (radii[i] + radii[j]) * share * CROWD_FACTOR) { ids.add(plants[i].id); ids.add(plants[j].id); }
    }
  }
  return ids;
}
