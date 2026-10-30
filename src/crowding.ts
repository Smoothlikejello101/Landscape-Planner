import { climbing, groundcoverRadius, VINE_BASE_RADIUS } from './vines';
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

// Two levels (decided with Jason, 2026-10-25): plants whose typical spreads touch are close ("they may quickly grow into
// one another"; amber), and past the limit above they're crowded (red): where one is half again as big as the other,
// the smaller is buried by it ("too far under", 2026-10-27), else they grow into each other. Plants the person chose to
// leave close (`crowdOk` on either) aren't flagged.
//
// Spring bulbs under bigger plants (decided with Jason, 2026-10-26): a spring bulb (its form Bulb, flowering only in
// late winter or spring, hardy where the garden is) doesn't crowd a deciduous plant at least 3 ft tall (a sourced
// leaf-drop fact, not the earlier list's; a plant with none doesn't count): it flowers and ripens its leaves before
// the bigger plant leafs out, the usual way to underplant shrubs and tall perennials. 3 ft: taller than every spring
// bulb in the catalog in flower (the tallest is 2½ ft), so the bulb is under it, not beside it. Right at its base,
// within a quarter of its typical spread, the bulb is still close.

export const CROWD_FACTOR = 0.75;
/** How tall, typically, a deciduous plant must be for spring bulbs to grow under it, in feet. */
export const BULB_PARTNER_MIN_HEIGHT = 3;
/** How near a bulb can be to that plant's center, as a share of its typical spread, and still count as close. */
export const BULB_BASE = 1 / 4;
export type CrowdLevel = 'close' | 'crowded';
export interface CrowdOptions {
  /** Whether a plant is hardy where the garden is (unknown: every plant is). */
  hardy?: (p: Plant) => boolean;
  /** Include pairs the person chose to leave close (marked `left`). */
  includeLeft?: boolean;
}
/** The share of a tree's height its trunk can be cleared to, keeping live branches on the upper two thirds. */
export const CLEAR_TRUNK = 1 / 3;

/** `climbing`: the vines drawn on a support, whose ground is only around their base (src/vines.ts). */
function typicalRadius(s: Shape, byId: Record<string, Plant | undefined>, climbing?: Set<string>): number | null {
  if (s.type !== 'circle' || s.role !== 'plant' || s.status === 'gone') return null;
  if (climbing?.has(s.id)) return VINE_BASE_RADIUS;
  // (A vine as a groundcover: the patch its spacing gives, not the length it would climb: src/vines.ts.)
  const ground = groundcoverRadius(s, byId);
  if (ground != null) return ground;
  const p = s.plantId ? byId[s.plantId] : undefined;
  return p ? plantSpread(p, 'typical') / 2 : s.radius;
}
/** The vines among `shapes` drawn on a support. */
const climbingIn = (shapes: Shape[], byId: Record<string, Plant | undefined>) =>
  new Set(shapes.filter((v) => v.type === 'circle' && v.climbsOn && climbing(v, shapes, byId)).map((v) => v.id));
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
  // (A lowest branch set at or above its height says nothing: a crown needs some height to it.)
  const hand = s.lowestBranch != null && (height == null || s.lowestBranch < height) ? s.lowestBranch : undefined;
  const lowestFrom = hand != null ? 'hand' : p?.low_branched ? 'screen' : 'third';
  const lowest = hand ?? (p?.low_branched || height == null ? 0 : height * CLEAR_TRUNK);
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
/**
 * `recommended`: the spacing they want, for the height they share (`shared`, 0 to 1). `level`: close (typical
 * spreads touching) or crowded. `bulb`: a spring bulb and a deciduous plant it can grow under, close only at its
 * base. `left`: the person chose to leave these two close (only with `includeLeft`).
 */
export interface Crowd { other: Shape; distance: number; recommended: number; shared: number; level: CrowdLevel; bulb?: boolean; left?: boolean }

const formsOf = (p: Plant) => (p.forms?.length ? p.forms : p.form ? [p.form] : []);
const SPRING = /^(?:late winter|winter|(?:early |mid |late )?spring)$/;
/** A spring bulb: its form Bulb, flowering only in late winter or spring (as its sources say), hardy here. */
export function springBulb(p: Plant | undefined, hardy: (p: Plant) => boolean = () => true): boolean {
  return !!p && formsOf(p).includes('Bulb') && !!p.bloom_season?.length && p.bloom_season.every((x) => SPRING.test(x)) && hardy(p);
}
/**
 * A plant spring bulbs can grow under: deciduous by a source (not only the earlier list, whose values are unverified;
 * no leaf-drop fact, no), at least BULB_PARTNER_MIN_HEIGHT ft tall typically (a tree as tall as it's set or drawn),
 * and not an annual or a bulb itself.
 */
export function bulbPartner(s: Shape, byId: Record<string, Plant | undefined>): boolean {
  const p = s.plantId ? byId[s.plantId] : undefined;
  const pv = p?.prov?.foliage;
  if (!p || p.foliage !== 'deciduous' || !pv || pv.unknown || !pv.src.some((x) => x !== 'compendium')) return false;
  const forms = formsOf(p);
  if (forms.includes('Bulb') || (forms.length && forms.every((f) => f === 'Annual'))) return false;
  const h = s.type === 'circle' && isTree(s, byId) ? treeBranches(s, p, typicalRadius(s, byId)).height : p.height?.med;
  return h != null && h >= BULB_PARTNER_MIN_HEIGHT;
}
const leftClose = (a: Shape, b: Shape) => !!(a.type === 'circle' && a.crowdOk?.includes(b.id)) || !!(b.type === 'circle' && b.crowdOk?.includes(a.id));

/**
 * How two plants stand: close, crowded, or neither (null). `ra`, `rb`: their typical radii; `share`: the height
 * they share. A spring bulb under a deciduous plant it can grow under is close only within BULB_BASE of that
 * plant's typical spread from its center, and never crowded.
 */
function pairLevel(a: Shape, b: Shape, ra: number, rb: number, share: number, byId: Record<string, Plant | undefined>, hardy: (p: Plant) => boolean):
  { level: CrowdLevel; distance: number; recommended: number; bulb?: boolean } | null {
  if (share <= 0) return null;
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const recommended = (ra + rb) * share;
  if (distance >= recommended) return null;
  const pa = a.plantId ? byId[a.plantId] : undefined, pb = b.plantId ? byId[b.plantId] : undefined;
  const under = springBulb(pa, hardy) && bulbPartner(b, byId) ? rb : springBulb(pb, hardy) && bulbPartner(a, byId) ? ra : null;
  if (under != null) return distance < under * 2 * BULB_BASE ? { level: 'close', distance, recommended, bulb: true } : null;
  return { level: distance < recommended * CROWD_FACTOR ? 'crowded' : 'close', distance, recommended };
}

/** Plants crowding `s`, closest first: crowded ones only, or, with `close`, those close to it too. */
export function crowdingOf(s: Shape, shapes: Shape[], byId: Record<string, Plant | undefined>, opts: CrowdOptions & { close?: boolean } = {}): Crowd[] {
  const vines = climbingIn(shapes, byId);
  const r = typicalRadius(s, byId, vines);
  if (r == null || s.type !== 'circle') return [];
  const band = bandOf(s, byId);
  const hardy = opts.hardy ?? (() => true);
  const out: Crowd[] = [];
  for (const o of shapes) {
    if (o === s || o.type !== 'circle') continue;
    const ro = typicalRadius(o, byId, vines);
    if (ro == null) continue;
    const left = leftClose(s, o);
    if (left && !opts.includeLeft) continue;
    const share = sharedHeight(band, bandOf(o, byId));
    const pair = pairLevel(s, o, r, ro, share, byId, hardy);
    if (!pair || (pair.level === 'close' && !opts.close)) continue;
    out.push({ other: o, shared: share, ...pair, ...(left ? { left: true } : {}) });
  }
  return out.sort((a, b) => a.distance / a.recommended - b.distance / b.recommended);
}
/** How much bigger one plant must be than another, typically, to bury it: half again as tall (or, heights unknown, wide). */
export const BURIES = 1.5;
/**
 * Which of two plants is under the other (for the notice's words, decided with Jason, 2026-10-27): 'under', `s` is
 * buried by `o` (a coneflower under a beautyberry); 'over', `s` buries `o`; 'even', they grow into each other. By
 * typical height where both are known, else by typical spread.
 */
export function crowdRelation(s: Shape, o: Shape, byId: Record<string, Plant | undefined>): 'under' | 'over' | 'even' {
  const hs = bandOf(s, byId).band?.[1], ho = bandOf(o, byId).band?.[1];
  const [a, b] = hs != null && ho != null ? [hs, ho] : [typicalRadius(s, byId), typicalRadius(o, byId)];
  if (a == null || b == null || a <= 0 || b <= 0) return 'even';
  return b >= a * BURIES ? 'under' : a >= b * BURIES ? 'over' : 'even';
}
/** Every pair of plants close or crowded now (not those left close on purpose), each once. */
export function crowdPairs(shapes: Shape[], byId: Record<string, Plant | undefined>, opts: CrowdOptions = {}): { a: Shape; b: Shape; level: CrowdLevel }[] {
  const vines = climbingIn(shapes, byId);
  const plants = shapes.filter((s) => typicalRadius(s, byId) != null) as (Shape & { type: 'circle' })[];
  const radii = plants.map((s) => typicalRadius(s, byId, vines)!);
  const bands = plants.map((s) => bandOf(s, byId));
  const hardy = opts.hardy ?? (() => true);
  const out: { a: Shape; b: Shape; level: CrowdLevel }[] = [];
  // Sort by x so only nearby plants are compared (a shared height never widens the usual spacing).
  const order = plants.map((_, i) => i).sort((a, b) => plants[a].x - plants[b].x);
  const maxR = Math.max(0, ...radii);
  for (let a = 0; a < order.length; a++) {
    const i = order[a];
    for (let b = a + 1; b < order.length; b++) {
      const j = order[b];
      if (plants[j].x - plants[i].x >= radii[i] + maxR) break;
      if (leftClose(plants[i], plants[j])) continue;
      const pair = pairLevel(plants[i], plants[j], radii[i], radii[j], sharedHeight(bands[i], bands[j]), byId, hardy);
      if (pair) out.push({ a: plants[i], b: plants[j], level: pair.level });
    }
  }
  return out;
}
/** Each plant that's close to another or crowded, by its worst (for the rings on the plan). */
export function crowdLevels(shapes: Shape[], byId: Record<string, Plant | undefined>, opts: CrowdOptions = {}): Map<string, CrowdLevel> {
  const out = new Map<string, CrowdLevel>();
  const mark = (id: string, level: CrowdLevel) => { if (out.get(id) !== 'crowded') out.set(id, level); };
  for (const p of crowdPairs(shapes, byId, opts)) { mark(p.a.id, p.level); mark(p.b.id, p.level); }
  return out;
}
/** Ids of every crowded plant. */
export function crowdedIds(shapes: Shape[], byId: Record<string, Plant | undefined>, opts: CrowdOptions = {}): Set<string> {
  return new Set([...crowdLevels(shapes, byId, opts)].filter(([, l]) => l === 'crowded').map(([id]) => id));
}
