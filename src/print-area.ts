import { bedOf, isBed, isPlant } from './beds';
import { canvasRect, pxPerFoot, shapeBBox, shapeCenter, unionBounds } from './geometry';
import { state } from './state';
import type { Bounds, Shape } from './types';

// What a printout or a picture shows (Jason, Nov 2, from the UI review: "Whole plan, what's on screen, or one bed,
// scaled to fill the page; the picture follows"): the whole plan, the part of it on the screen when Print or Export
// was opened, or one bed with its plants. Print (src/print-pdf.ts) and the picture (src/export.ts) frame the same area.
//
// The choice is kept for the session, not with the plan: the plan's print settings (PrintSettings, src/storage.ts
// sanitizePrint) have no field for it, and adding one would change what's stored.

export type AreaKind = 'all' | 'screen' | 'bed';
export interface PrintArea {
  kind: AreaKind;
  /** The part of the plan on the screen (feet), and how many px a foot it was shown at: for 'screen'. */
  view: Bounds | null;
  ppf: number;
  /** The bed: for 'bed'. */
  bedId: string | null;
}
export const WHOLE_PLAN: PrintArea = { kind: 'all', view: null, ppf: 0, bedId: null };

/** An area framed: what of the plan it shows, and what's drawn and listed there. */
export interface Framed {
  /** The part of the yard shown (feet); null when there's nothing to show (the bed's gone). */
  bounds: Bounds | null;
  /** What's drawn, in the order it's painted. */
  shapes: Shape[];
  /** The plants that count as in it, and are listed: those whose middle is in it (in the bed, for a bed). */
  plants: Shape[];
  /** What it is, said on the page ("Front bed"); '' for the whole plan. */
  name: string;
  /**
   * The drawing is the area itself, at its own proportions (on screen, one bed). Not so for the whole plan: it's in the
   * middle of the sheet's drawing box, the yard around it filling the rest, as it always has been.
   */
  exact: boolean;
}

/** Beds' names as printed: their own, or "Unnamed bed 2" in the plan's order (by id). */
export function bedNames(all: Shape[]): Map<string, string> {
  let unnamed = 0;
  return new Map(all.filter(isBed).map((b) => [b.id, b.label.trim() || `Unnamed bed ${++unnamed}`]));
}
/** The beds to pick from, by name: id and name. */
export function bedChoices(all: Shape[]): { id: string; name: string }[] {
  return [...bedNames(all)].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
/** The margin around a bed (feet): a foot, or a twentieth of its longer side if more. */
export function bedMargin(b: Bounds): number {
  return Math.max(1, 0.05 * Math.max(b.maxX - b.minX, b.maxY - b.minY));
}
const meets = (a: Bounds, b: Bounds) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
const holds = (outer: Bounds, inner: Bounds) => inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
const within = (p: { x: number; y: number }, b: Bounds) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

/**
 * Frame `area`: `shown` is what the sheet or picture would show of the whole plan (filtered, in paint order), `all` the
 * whole plan (for which bed a plant is in), `whole` the whole plan's bounds.
 * - On screen: the screen's part of the plan, exactly; what reaches into it is drawn, the plants whose middle is in it
 *   listed (a plant cut by the edge with its middle off it shows no number, and isn't).
 * - One bed: the bed, its plants and what lies within it (a trellis, a note), with a small margin; nothing else.
 */
export function frameArea(area: PrintArea, shown: Shape[], all: Shape[], whole: Bounds | null): Framed {
  if (area.kind === 'screen' && area.view) {
    const v = area.view;
    const shapes = shown.filter((s) => meets(shapeBBox(s), v));
    return { bounds: v, shapes, plants: shapes.filter((s) => isPlant(s) && within(shapeCenter(s), v)), name: 'Part of the plan', exact: true };
  }
  if (area.kind === 'bed') {
    const bed = all.find((s) => s.id === area.bedId && isBed(s));
    if (!bed) return { bounds: null, shapes: [], plants: [], name: '', exact: true };
    const box = shapeBBox(bed);
    const plants = shown.filter((s) => isPlant(s) && bedOf(s, all) === bed);
    const inside = shown.filter((s) => !isPlant(s) && !isBed(s) && holds(box, shapeBBox(s)));
    const keep = new Set([bed, ...plants, ...inside]);
    const b = unionBounds([box, ...plants.map(shapeBBox)])!;
    const m = bedMargin(b);
    return {
      bounds: { minX: b.minX - m, maxX: b.maxX + m, minY: b.minY - m, maxY: b.maxY + m },
      shapes: shown.filter((s) => keep.has(s)), plants, name: bedNames(all).get(bed.id)!, exact: true,
    };
  }
  return { bounds: whole, shapes: shown, plants: shown.filter(isPlant), name: '', exact: false };
}
/** What's included, said on the page: "Front bed: 7 plants"; '' for the whole plan. */
export function areaWords(f: Pick<Framed, 'name' | 'plants'>): string {
  return f.name ? `${f.name}: ${f.plants.length} plant${f.plants.length === 1 ? '' : 's'}` : '';
}
/** The part of the plan a view shows (feet): from its top left, `w` × `h` px at `ppf` px a foot. */
export function viewBounds(offsetX: number, offsetY: number, w: number, h: number, ppf: number): Bounds {
  return { minX: offsetX, minY: offsetY, maxX: offsetX + w / ppf, maxY: offsetY + h / ppf };
}

// ---------- The choice, for the session ----------
let kind: AreaKind = 'all';
let bedId: string | null = null;
let view: Bounds | null = null;
let viewPpf = 0;

/**
 * As Print or Export opens: the part of the plan on the screen now (the keyboard opening later, which shortens the
 * plan, doesn't change it), and the bed selected, if one is (else the one picked before stays picked).
 */
export function noteScreen() {
  let w = state.canvasW, h = state.canvasH;
  try { const r = canvasRect(); if (r.width && r.height) { w = r.width; h = r.height; } } catch { /* not drawn yet */ }
  viewPpf = pxPerFoot();
  view = viewBounds(state.offsetX, state.offsetY, w, h, viewPpf);
  const beds = state.shapes.filter((s) => isBed(s) && state.selectedIds.includes(s.id));
  if (beds.length === 1) bedId = beds[0].id;
}
/** The area chosen. One bed, with no beds on the plan, is the whole plan; with the bed picked gone, none is picked. */
export function printArea(): PrintArea {
  const beds = state.shapes.some(isBed);
  const k: AreaKind = kind === 'bed' && !beds ? 'all' : kind === 'screen' && !view ? 'all' : kind;
  const bed = state.shapes.find((s) => s.id === bedId && isBed(s));
  return { kind: k, view, ppf: viewPpf, bedId: bed ? bed.id : null };
}
export function setAreaKind(k: AreaKind) { kind = k; }
export function setAreaBed(id: string | null) { bedId = id; }
