import { treeBranches } from './crowding';
import { drawnOutline, pointInPolygon } from './geometry';
import type { Plant } from './plants';
import { isTree } from './trees';
import type { Bounds, Point, Shape, UtilityKind } from './types';
import { isUtilityKind } from './utility-kinds';

// What's checked near a utility (sub-features part 2, decided with Jason, 2026-10-25: "overhead power lines (a
// mature-height check), buried utilities and septic fields"). The rules, from public extension and utility guidance
// (docs/site-checks.md has them, with their sources):
//
// - Overhead power line: by how tall a tree (or a shrub that grows like one) gets and how far it stands from the line,
//   the zones UF/IFAS Extension gives for planting under lines: within 20 ft, nothing that tops out over 25 ft; 20 to
//   50 ft away, nothing 40 ft or taller; taller trees 50 ft or more away. A plant's height is its typical mature
//   height: the catalog's, or one set by hand on a tree. A tree drawn without either isn't checked (its stand-in
//   height is only a guess), nor a vine (its height is how far it climbs) or anything else not woody.
// - Buried line: a tree or shrub within 10 ft (Entergy keeps 10 ft clear of its underground power lines; roots, and
//   digging the hole, reach a line). Smaller plants aren't flagged: the line's own note says to call 811 first.
// - Septic field: a tree or shrub nearer the field than it grows tall, or on it (UGA Extension: at least its mature
//   height away, farther if you can). Food grown on a field is UGA's concern too, but the catalog's "edible" takes in
//   bee balm and yarrow, which UGA names for the field: so the field's own note says it, and no plant is flagged.
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
  /** Which rule: within 20 ft of a power line, or 20 to 50; near a buried line; on a septic field, or near it. */
  rule: 'near' | 'mid' | 'buried' | 'on' | 'field';
  /** The utility it's near. */
  other: Shape;
  /** Feet from it (0 on a septic field). */
  distance: number;
  /** One short line ("Grows to 60 ft, 12 ft from a power line"), and what opens under it. */
  line: string;
  detail: string;
}

const f = (v: number) => (Math.round(v * 10) / 10).toString();
/** A height, in whole feet: a typical mature height is no closer than that ("Grows to 54 ft", not 53.8: the review, Nov 1). */
const ft = (v: number) => String(Math.round(v));
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
/** A utility made ready to measure from: its kind, its outline as drawn, and its box (feet). */
export interface PreparedUtility { shape: Shape; kind: UtilityKind; pts: Point[]; closed: boolean; box: Bounds }
/** The utilities among `shapes` this version checks (a kind it knows, not gone), ready to measure from. */
export function prepareUtilities(shapes: Shape[]): PreparedUtility[] {
  const out: PreparedUtility[] = [];
  for (const u of shapes) {
    const kind = utilityOf(u);
    if (!kind || u.status === 'gone') continue;
    const o = drawnOutline(u);
    if (!o || o.pts.length < 2) continue;
    const xs = o.pts.map((q) => q.x), ys = o.pts.map((q) => q.y);
    out.push({ shape: u, kind, pts: o.pts, closed: o.closed, box: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } });
  }
  return out;
}
/** Feet from `p` to a utility: to its line, or to a field's edge (0 inside it). */
export function distanceToUtility(u: PreparedUtility, p: Point): number {
  if (u.closed && pointInPolygon(u.pts, p)) return 0;
  return distanceToLine(u.pts, p, u.closed);
}
const toBox = (b: Bounds, p: Point) => Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minY - p.y, 0, p.y - b.maxY));

/** The utility a shape is, if it's one with a kind this version knows (a later version's kind isn't checked). */
export const utilityOf = (s: Shape): UtilityKind | null => (s.role === 'utility' && isUtilityKind(s.utility) ? s.utility : null);

/**
 * What's wrong with where a plant is, for each utility it's near (`utils`: those shown, prepared once for the whole
 * plan). Every rule is about trees and shrubs, so anything else is done at once.
 */
export function utilityIssues(s: Shape, utils: PreparedUtility[], byId: Record<string, Plant | undefined>): UtilityIssue[] {
  if (!utils.length || s.type !== 'circle' || s.role !== 'plant' || s.status === 'gone' || !woody(s, byId)) return [];
  const h = matureHeight(s, byId);
  const out: UtilityIssue[] = [];
  for (const u of utils) {
    if (toBox(u.box, s) >= Math.max(CLEAR_OF_LINE, h ?? 0)) continue; // (no rule reaches that far: 50 ft, or a tree's height from a field)
    const kind = u.kind, d = distanceToUtility(u, s);
    if (kind === 'overhead' && h != null && ((d < NEAR_LINE && h > SMALL_TREE) || (d < CLEAR_OF_LINE && h >= MEDIUM_TREE))) {
      out.push({
        kind, rule: d < NEAR_LINE ? 'near' : 'mid', other: u.shape, distance: d, line: `Grows to ${ft(h)} ft, ${f(d)} ft from a power line`,
        detail: `Within ${NEAR_LINE} ft of an overhead line, a tree should top out at ${SMALL_TREE} ft or less; ${NEAR_LINE} to ${CLEAR_OF_LINE} ft away, under ${MEDIUM_TREE} ft; taller trees ${CLEAR_OF_LINE} ft or more away (UF/IFAS Extension). Many utilities also keep a strip under their lines clear of trees: ask yours before planting.`,
      });
    } else if (kind === 'buried' && d < BURIED_CLEAR) {
      out.push({
        kind, rule: 'buried', other: u.shape, distance: d, line: `${f(d)} ft from a buried line`,
        detail: `Roots, and digging the hole, can reach a buried line. Keep trees and shrubs ${BURIED_CLEAR} ft from it: Entergy, for one, keeps that much clear of its underground power lines. Call 811 before you dig, and the lines are marked for free.`,
      });
    } else if (kind === 'septic' && (d === 0 || (h != null && d < h))) {
      out.push({
        kind, rule: d === 0 ? 'on' : 'field', other: u.shape, distance: d, line: d === 0 ? 'On the septic field' : `${f(d)} ft from the septic field${h != null ? `, ${ft(h)} ft tall` : ''}`,
        detail: `Tree and shrub roots can clog a drainfield's lines. Plant a tree or shrub at least as far from the field as it grows tall, farther if you can (UGA Extension). Grass and shallow-rooted perennials suit the field itself.`,
      });
    }
  }
  return out;
}
/**
 * What a plant's utility warnings are, together: what's kept when they're dismissed. Which utilities and which rule
 * (within 20 ft of a power line, say), not the words: a dismissed warning stays so while the plant moves a little, and
 * comes back when it breaks another rule or is near another utility.
 */
export const issuesKey = (issues: UtilityIssue[]): string => issues.map((i) => `${i.other.id}:${i.rule}`).sort().join(' ');
/** Whether a plant's utility warnings show (a badge on the plan): some, and not dismissed as they read now. */
export function utilityWarningShown(s: Shape, issues: UtilityIssue[]): boolean {
  return issues.length > 0 && s.utilityDismissed !== issuesKey(issues);
}

/** What a utility's own properties say about it. */
export function utilityNote(kind: UtilityKind): string {
  if (kind === 'overhead') return `Trees near it are checked against how tall they grow: within ${NEAR_LINE} ft, ${SMALL_TREE} ft or less; ${NEAR_LINE} to ${CLEAR_OF_LINE} ft, under ${MEDIUM_TREE} ft. A tree drawn without a height isn't checked: give it one in its properties.`;
  if (kind === 'buried') return `Call 811 before you dig: the lines are marked for free. Trees and shrubs within ${BURIED_CLEAR} ft of it are flagged.`;
  return "Trees and shrubs nearer it than they grow tall are flagged. Grass and shallow-rooted perennials suit the field itself; don't grow vegetables or other food on it (UGA Extension).";
}
