import { treeBranches } from './crowding';
import { drawnOutline, pointInPolygon } from './geometry';
import type { Plant } from './plants';
import { isTree } from './trees';
import type { Point, Shape, UtilityKind } from './types';

// What's checked near a utility (sub-features part 2, decided with Jason, 2026-10-25: "overhead power lines (a
// mature-height check), buried utilities and septic fields"). The rules, from public extension and utility guidance
// (docs/site-checks.md has them, with their sources):
//
// - Overhead power line: by how tall a tree grows and how far it stands from the line, the zones UF/IFAS Extension
//   gives for planting under lines: within 20 ft, nothing that tops out over 25 ft; 20 to 50 ft away, nothing 40 ft or
//   taller; taller trees 50 ft or more away. A plant's height is its typical mature height: the catalog's, or one set
//   by hand on a tree. A tree drawn without either isn't checked (its stand-in height is only a guess).
// - Buried line: a tree or shrub within 10 ft (Entergy keeps 10 ft clear of its underground power lines; roots, and
//   digging the hole, reach a line). Smaller plants aren't flagged: the line's own note says to call 811 first.
// - Septic field: a tree or shrub nearer the field than it grows tall, or on it (UGA Extension: at least its mature
//   height away, farther if you can); an edible plant on it (produce over a drainfield can be contaminated, and
//   digging for it can damage the lines).
//
// Distances are from the plant's center, as planting distances are measured, to the nearest point of the line, or of
// the field's edge (0 on it).

/** Feet: within this of an overhead line a tree should top out at SMALL_TREE or less (UF/IFAS). */
export const NEAR_LINE = 20;
export const SMALL_TREE = 25;
/** Feet: from NEAR_LINE to this, a tree should be under MEDIUM_TREE (UF/IFAS); taller trees this far or more away. */
export const CLEAR_OF_LINE = 50;
export const MEDIUM_TREE = 40;
/** Feet: trees and shrubs kept this far from a buried line (Entergy's underground easement). */
export const BURIED_CLEAR = 10;

export interface UtilityIssue {
  kind: UtilityKind;
  /** The utility it's near. */
  other: Shape;
  /** Feet from it (0 on a septic field). */
  distance: number;
  /** One short line ("Grows to 60 ft, 12 ft from a power line"), and what opens under it. */
  line: string;
  detail: string;
}

const f = (v: number) => (Math.round(v * 10) / 10).toString();
const formsOf = (p: Plant | undefined) => (p?.forms?.length ? p.forms : p?.form ? [p.form] : []);

/** A plant's typical mature height (feet), where a source or the person gave one; null where only a guess. */
export function matureHeight(s: Shape, byId: Record<string, Plant | undefined>): number | null {
  if (s.type !== 'circle') return null;
  const p = s.plantId ? byId[s.plantId] : undefined;
  if (isTree(s, byId)) {
    const t = treeBranches(s, p);
    return (t.heightFrom === 'hand' || t.heightFrom === 'plant') && t.height != null ? t.height : null;
  }
  return p?.height?.med ?? null;
}
/** A tree or shrub (by its forms, or drawn as a tree): roots that reach a line or a drainfield. */
export function woody(s: Shape, byId: Record<string, Plant | undefined>): boolean {
  if (isTree(s, byId)) return true;
  const forms = formsOf(s.plantId ? byId[s.plantId] : undefined);
  return forms.includes('Tree') || forms.includes('Shrub');
}

/** Feet from `p` to the nearest point of a polyline (closed: back to its start too). */
export function distanceToLine(pts: Point[], p: Point, closed = false): number {
  let best = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y));
  }
  return best;
}
/** Feet from `p` to a utility: to its line, or to a field's edge (0 inside it). Null for a shape with no outline. */
export function distanceToUtility(u: Shape, p: Point): number | null {
  const o = drawnOutline(u);
  if (!o || o.pts.length < 2) return null;
  if (o.closed && pointInPolygon(o.pts, p)) return 0;
  return distanceToLine(o.pts, p, o.closed);
}

/** The utility a shape is, if it's one with a kind. */
export const utilityOf = (s: Shape): UtilityKind | null => (s.role === 'utility' && s.utility ? s.utility : null);

/** What's wrong with where a plant is, for each utility it's near (`shapes`: those shown). */
export function utilityIssues(s: Shape, shapes: Shape[], byId: Record<string, Plant | undefined>): UtilityIssue[] {
  if (s.type !== 'circle' || s.role !== 'plant' || s.status === 'gone') return [];
  const p = s.plantId ? byId[s.plantId] : undefined;
  const h = matureHeight(s, byId), isWoody = woody(s, byId);
  const out: UtilityIssue[] = [];
  for (const u of shapes) {
    const kind = utilityOf(u);
    if (!kind || u.status === 'gone') continue;
    const d = distanceToUtility(u, s);
    if (d == null) continue;
    if (kind === 'overhead' && h != null && ((d < NEAR_LINE && h > SMALL_TREE) || (d < CLEAR_OF_LINE && h >= MEDIUM_TREE))) {
      out.push({
        kind, other: u, distance: d, line: `Grows to ${f(h)} ft, ${f(d)} ft from a power line`,
        detail: `Within ${NEAR_LINE} ft of an overhead line, a tree should top out at ${SMALL_TREE} ft or less; ${NEAR_LINE} to ${CLEAR_OF_LINE} ft away, under ${MEDIUM_TREE} ft; taller trees ${CLEAR_OF_LINE} ft or more away (UF/IFAS Extension). Many utilities also keep a strip under their lines clear of trees: ask yours before planting.`,
      });
    } else if (kind === 'buried' && isWoody && d < BURIED_CLEAR) {
      out.push({
        kind, other: u, distance: d, line: `${f(d)} ft from a buried line`,
        detail: `Roots, and digging the hole, can reach a buried line. Keep trees and shrubs ${BURIED_CLEAR} ft from it: Entergy, for one, keeps that much clear of its underground power lines. Call 811 before you dig, and the lines are marked for free.`,
      });
    } else if (kind === 'septic' && isWoody && (d === 0 || (h != null && d < h))) {
      out.push({
        kind, other: u, distance: d, line: d === 0 ? 'On the septic field' : `${f(d)} ft from the septic field${h != null ? `, ${f(h)} ft tall` : ''}`,
        detail: `Tree and shrub roots can clog a drainfield's lines. Plant a tree or shrub at least as far from the field as it grows tall, farther if you can (UGA Extension). Grass and shallow-rooted perennials suit the field itself.`,
      });
    } else if (kind === 'septic' && d === 0 && p?.edible) {
      out.push({
        kind, other: u, distance: d, line: 'Edible, on the septic field',
        detail: 'Food grown over a drainfield can be contaminated, and digging for it can damage the lines (UGA Extension). Ornamentals suit the field better.',
      });
    }
  }
  return out;
}
/** The words a plant's utility warnings read as, together: what's kept when one is dismissed. */
export const issuesKey = (issues: UtilityIssue[]): string => issues.map((i) => i.line).join(' · ');
/** Whether a plant's utility warnings show (a badge on the plan): some, and not dismissed as they read now. */
export function utilityWarningShown(s: Shape, issues: UtilityIssue[]): boolean {
  return issues.length > 0 && s.utilityDismissed !== issuesKey(issues);
}

/** What a utility's own properties say about it. */
export function utilityNote(kind: UtilityKind): string {
  if (kind === 'overhead') return `Trees near it are checked against how tall they grow: within ${NEAR_LINE} ft, ${SMALL_TREE} ft or less; ${NEAR_LINE} to ${CLEAR_OF_LINE} ft, under ${MEDIUM_TREE} ft. A tree drawn without a height isn't checked: give it one in its properties.`;
  if (kind === 'buried') return `Call 811 before you dig: the lines are marked for free. Trees and shrubs within ${BURIED_CLEAR} ft of it are flagged.`;
  return 'Trees and shrubs nearer it than they grow tall are flagged, and edible plants on it.';
}
