import { drawnOutline } from './geometry';
import { formsOf, plantsById, type Plant } from './plants';
import { isTree, trunkDiameter } from './trees';
import type { CircleShape, Point, Shape } from './types';

// Vines on what they climb (decided with Jason, Oct 28–29; the Backlog's "Vines drawn along their support"). A vine's
// catalog width is how far it spreads along what it climbs, not a disc on the ground. Its "Climbing on" (the
// shape's `climbsOn`) is a fence or wall line, a building's wall, or a tree; with none, it's a groundcover patch,
// drawn as any plant. On a support it's drawn as its planting spot and a band along the support, as long as its
// spread; on a tree, a band up to the trunk and along part of the crown. Its ground crowds only around its base.
//
// The app offers a support when one is close: a vine's base within VINE_REACH_TRUNK of a trunk's edge, or
// VINE_REACH_LINE of a line, whichever is placed second. No source gives how far a vine reaches for support:
// these are planting distances, what a gardener means by planting it there (Jason, Oct 29), to tune. Farther, a
// support within its spread can still be picked by hand. Shrubs are never offered (a vine left on one smothers
// it), but can be picked.

/** Feet from a trunk's edge, and from a line, within which the app offers the support. */
export const VINE_REACH_TRUNK = 3;
export const VINE_REACH_LINE = 2;
/** The ground a climbing vine's base takes, for crowding (feet, radius). */
export const VINE_BASE_RADIUS = 1;
/** How a climbing vine is drawn: a band this wide along its support, and its planting spot (feet). */
export const VINE_BAND_WIDTH = 1.5;
export const VINE_DOT_RADIUS = 0.6;

/** A plant drawn as a vine: its catalog form is Vine. */
export function isVine(s: Shape, byId: Record<string, Plant | undefined> = plantsById): s is CircleShape {
  if (s.type !== 'circle' || s.role !== 'plant' || !s.plantId) return false;
  const p = byId[s.plantId];
  return !!p && formsOf(p).includes('Vine');
}
/** What a vine can climb, found near it: the shape, how far its base is from it, and the nearest point of it. */
export interface Support { shape: Shape; kind: 'tree' | 'line' | 'shrub'; dist: number; at: Point }
/** Lines a vine climbs: a fence or wall drawn as a line (not a path, a dimension or a utility), or a building's walls. */
function climbableEdges(s: Shape): { pts: Point[]; closed: boolean } | null {
  if (s.status === 'gone') return null;
  if (s.type === 'line') {
    // (Not a path, a utility, or a measurement: a fence showing its length is still a fence.)
    if (s.pathWidth || s.role === 'utility' || s.role === 'path' || (s.showLength && s.role !== 'boundary' && s.role !== 'building')) return null;
    // (A property line isn't a thing to climb.)
    if (s.role === 'boundary' && /property/i.test(s.label)) return null;
    return drawnOutline(s);
  }
  if (s.role === 'building' && s.type !== 'circle' && s.type !== 'text') return drawnOutline(s);
  return null;
}
/** The nearest point of a polyline to `p`, and how far. */
export function nearestOnLine(pts: Point[], p: Point, closed = false): { at: Point; dist: number; seg: number } {
  let best = { at: pts[0], dist: Infinity, seg: 0 };
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    const at = { x: a.x + dx * t, y: a.y + dy * t }, dist = Math.hypot(at.x - p.x, at.y - p.y);
    if (dist < best.dist) best = { at, dist, seg: i };
  }
  return best;
}
/** (Not a type guard: a circle that isn't a tree is still a circle.) */
const treeLike = (s: Shape, byId: Record<string, Plant | undefined>): boolean => isTree(s, byId);
/** The support `t` as seen from `base`: how far, and its nearest point (a trunk's edge, a line's nearest point). */
export function supportFrom(t: Shape, base: Point, byId: Record<string, Plant | undefined> = plantsById): Support | null {
  if (t.status === 'gone') return null;
  if (t.type === 'circle' && t.role === 'plant') {
    const tree = treeLike(t, byId);
    if (!tree && !(t.plantId && formsOf(byId[t.plantId] ?? {}).includes('Shrub'))) return null;
    const d = Math.hypot(t.x - base.x, t.y - base.y);
    // (A tree's trunk edge; a shrub, its own edge.)
    const edge = tree ? trunkDiameter(t) / 2 : t.radius;
    const k = d > 0 ? edge / d : 0;
    return { shape: t, kind: tree ? 'tree' : 'shrub', dist: Math.max(0, d - edge), at: { x: t.x + (base.x - t.x) * k, y: t.y + (base.y - t.y) * k } };
  }
  const edges = climbableEdges(t);
  if (!edges || edges.pts.length < 2) return null;
  const near = nearestOnLine(edges.pts, base, edges.closed);
  return { shape: t, kind: 'line', dist: near.dist, at: near.at };
}
/** The support a vine climbs, if it's there to climb (a support deleted or gone leaves it a groundcover). */
export function supportOf(v: Shape, shapes: Shape[], byId: Record<string, Plant | undefined> = plantsById): Support | null {
  if (v.type !== 'circle' || !v.climbsOn || !isVine(v, byId)) return null;
  const t = shapes.find((s) => s.id === v.climbsOn);
  return t && t !== v ? supportFrom(t, v, byId) : null;
}
/** Whether a vine is drawn climbing (on a support that's there). */
export const climbing = (v: Shape, shapes: Shape[], byId: Record<string, Plant | undefined> = plantsById): boolean => !!supportOf(v, shapes, byId);
/** What a vine could climb: every support within its spread of its base, nearest first (for "Climbing on"). */
export function supportsNear(v: CircleShape, shapes: Shape[], byId: Record<string, Plant | undefined> = plantsById): Support[] {
  return shapes.filter((s) => s !== v).map((s) => supportFrom(s, v, byId)).filter((x): x is Support => !!x && x.dist <= Math.max(v.radius, VINE_REACH_TRUNK))
    .sort((a, b) => a.dist - b.dist);
}
/** The support to offer a vine on its own: the nearest tree or line close enough to mean it (never a shrub). */
export function offerFor(v: CircleShape, shapes: Shape[], byId: Record<string, Plant | undefined> = plantsById): Support | null {
  // (Climbing already, or set to none by hand: '').
  if (!isVine(v, byId) || v.climbsOn !== undefined) return null;
  return supportsNear(v, shapes, byId).find((x) => (x.kind === 'tree' && x.dist <= VINE_REACH_TRUNK) || (x.kind === 'line' && x.dist <= VINE_REACH_LINE)) ?? null;
}
/** Vines (not climbing, not decided by hand) a support just placed or moved is close enough to offer itself to. */
export function vinesFor(t: Shape, shapes: Shape[], byId: Record<string, Plant | undefined> = plantsById): CircleShape[] {
  return shapes.filter((v): v is CircleShape => isVine(v, byId) && v.climbsOn === undefined && v.status !== 'gone')
    .filter((v) => offerFor(v, shapes, byId)?.shape === t);
}
/** Vines whose support has moved out of their reach (past their spread), or is gone: back to a groundcover. */
export function strandedVines(shapes: Shape[], byId: Record<string, Plant | undefined> = plantsById): CircleShape[] {
  return shapes.filter((v): v is CircleShape => isVine(v, byId) && !!v.climbsOn).filter((v) => {
    const t = shapes.find((s) => s.id === v.climbsOn);
    const sup = t ? supportFrom(t, v, byId) : null;
    return !sup || sup.dist > Math.max(v.radius, VINE_REACH_TRUNK);
  });
}
/**
 * A climbing vine's band, in feet: along a line, centered on its nearest point and as long as the vine's spread
 * (cut at the line's ends, and following its corners); on a tree, an arc along the crown's edge as long as its
 * spread (at most half the crown), centered toward the vine. `connector`: from its base to the support.
 */
export function vineBand(v: CircleShape, sup: Support): { band: Point[]; connector: Point[] } {
  const length = v.radius * 2;
  const connector: Point[] = [{ x: v.x, y: v.y }, sup.at];
  if (sup.kind !== 'line') {
    const t = sup.shape as CircleShape;
    const R = t.radius;
    const toward = Math.atan2(v.y - t.y, v.x - t.x);
    const half = Math.min(Math.PI / 2, length / (2 * R));
    const steps = Math.max(4, Math.ceil(half * 12));
    const band = Array.from({ length: steps * 2 + 1 }, (_, i) => {
      const a = toward - half + (i / (steps * 2)) * 2 * half;
      return { x: t.x + R * 0.92 * Math.cos(a), y: t.y + R * 0.92 * Math.sin(a) };
    });
    // (To the trunk, up it and out to the crown's edge: the connector runs from its base to the trunk, then out to
    // where the band is centered.)
    return { band, connector: [{ x: v.x, y: v.y }, sup.at, { x: t.x + R * 0.92 * Math.cos(toward), y: t.y + R * 0.92 * Math.sin(toward) }] };
  }
  const edges = climbableEdges(sup.shape)!;
  const pts = edges.closed ? [...edges.pts, edges.pts[0]] : edges.pts;
  const near = nearestOnLine(pts, v);
  // Walk each way from the nearest point, half the spread, following the line's corners.
  const walk = (dir: 1 | -1): Point[] => {
    const out: Point[] = [];
    let left = length / 2, here = near.at, i = dir === 1 ? near.seg + 1 : near.seg;
    while (left > 0 && i >= 0 && i < pts.length) {
      const next = pts[i], d = Math.hypot(next.x - here.x, next.y - here.y);
      if (d >= left) { out.push({ x: here.x + ((next.x - here.x) * left) / (d || 1), y: here.y + ((next.y - here.y) * left) / (d || 1) }); break; }
      out.push(next); left -= d; here = next; i += dir;
    }
    return out;
  };
  return { band: [...walk(-1).reverse(), near.at, ...walk(1)], connector };
}
