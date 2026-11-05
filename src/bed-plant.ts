// Plant this bed (Jason, Nov 2: the proposal "Plant this bed" and his answers to it). The picker opened For a bed lists
// only plants whose facts fit its sun, soil and moisture, so they aren't set by hand each time. Filters only: nothing is
// ranked, scored or suggested, and the list keeps its order.
//
// The bed's conditions are a layer of their own over the person's filters (answer B's note): Sun, Water needs, Drought
// tolerant, Takes wet soil and Clay OK are the bed's while it's planted for; the person's own are set aside, untouched,
// and are as they were with Anywhere again. Everything else (Hardy in zone, who's in the yard, the search) adds to it.
// Loam and Sandy filter by the soil textures NC State rates a plant for, as Clay does by Clay OK (Jason, Nov 4).
//
// Here: which bed the picker is For (never stored), the sun across a bed from its sun areas (worked out each time,
// never stored), and what a bed's conditions filter on. The picker's row and box: src/ui/plant-for.ts; the questions:
// src/ui/bed-conditions.ts; the bed outlined while placing: src/canvas.ts.

import { boxSize, fmtFeet, pointInShape, shapeArea, shapeBBox } from './geometry';
import { plantFilter, sunRangeSaid, type PlantFilter } from './plants';
import { state } from './state';
import { sunAt, sunHours, sunLevel, type SunLevel } from './sun';
import type { Shape } from './types';

/** A part of a bed's conditions, as the picker's box takes it off and puts it back: its sun, its soil, its moisture. */
export type BedPart = 'sun' | 'soil' | 'moisture';

// ---------- Which bed the picker plants for (never stored) ----------
let forId: string | null = null;
/** The parts of the bed's conditions taken off with their × in the picker: for this bed, until it's left. */
let partsOff = new Set<BedPart>();
/** Pick on the plan: the picker closed for one tap on a bed. */
let picking = false;

/** The bed the picker plants for, if it still is one (undone, deleted, made something else: anywhere). */
export function plantingFor(): Shape | null {
  const s = forId ? state.shapes.find((x) => x.id === forId) : undefined;
  return s && s.role === 'bed' ? s : null;
}
/** For a bed, or anywhere (null). Another bed starts with all its conditions on. */
export function setPlantingFor(id: string | null) {
  if (id !== forId) partsOff = new Set();
  forId = id;
}
/** The parts taken off for this bed. */
export const offParts = (): ReadonlySet<BedPart> => partsOff;
/** A part of the bed's conditions taken off (its ×), or put back. */
export function setPartOff(part: BedPart, isOff: boolean) {
  const next = new Set(partsOff);
  if (isOff) next.add(part); else next.delete(part);
  partsOff = next;
}
/** The picker opened from the Plant button: For the bed selected, if a bed alone is (answer 9), else anywhere. */
export function planForSelection() {
  const one = state.selectedIds.length === 1 ? state.shapes.find((s) => s.id === state.selectedIds[0]) : undefined;
  setPlantingFor(one?.role === 'bed' && one.status !== 'gone' ? one.id : null);
}
export const pickingBed = (): boolean => picking;
export function setPickingBed(on: boolean) { picking = on; }
/**
 * After each redraw: no longer For a bed once nothing's planting for it (the picker closed, not placing, not picking a
 * bed on the plan, not answering its conditions from the picker).
 */
export function plantingSettled() {
  if (state.panel === 'plants' || state.panel === 'bedConditions' || state.placing || picking) return;
  setPlantingFor(null);
}

// ---------- Beds ----------
/** The beds the picker offers to plant for, in the plan's order (not one marked gone). */
export const bedsToPlant = (shapes: Shape[]): Shape[] => shapes.filter((s) => s.role === 'bed' && s.status !== 'gone');
/** The bed at a spot on the plan (the smallest, where beds overlap, as a plant's bed is: src/beds.ts bedOf). */
export function bedAt(p: { x: number; y: number }, shapes: Shape[]): Shape | null {
  let best: Shape | null = null;
  for (const s of bedsToPlant(shapes)) if (pointInShape(s, p) && (!best || shapeArea(s) < shapeArea(best))) best = s;
  return best;
}
/** A bed by its name, or an unnamed one by its size: "Bed, 12 × 4 ft", "Bed, 6 ft across". */
export function bedName(bed: Shape): string {
  if (bed.label.trim()) return bed.label.trim();
  if (bed.type === 'circle') return `Bed, ${fmtFeet(bed.radius * 2)} ft across`;
  const { w, h } = boxSize(bed);
  return `Bed, ${fmtFeet(w)} × ${fmtFeet(h)} ft`;
}

// ---------- The sun across a bed ----------
const RANK: Record<SunLevel, number> = { Full: 0, Part: 1, Shade: 2 };
/** How many spots across a bed's box, each way, its sun is read at (those inside the bed count). */
export const SUN_GRID = 16;
/** The sun across a bed, from the sun areas over it (sunAt at spots across it). */
export interface BedSun {
  /** The least and most hours of direct sun read across it. */
  minH: number; maxH: number;
  /** Its sunniest and shadiest, as levels (filtered light reads as part shade at best: src/sun.ts sunLevel). */
  most: SunLevel; least: SunLevel;
  /** The sun areas over it, least sun first, with their hours. */
  areas: { area: Shape; hours: number }[];
  /** The share of it with sun recorded, 0 to 1. */
  covered: number;
  /** Where on the plan the part with none recorded lies, where it's to one side (null: all covered, or no side). */
  bare: 'top' | 'bottom' | 'left' | 'right' | null;
}
/** Spots across a bed: a grid over its box, the ones inside it (its middle, for one too thin to hold any). */
export function spotsIn(bed: Shape, n = SUN_GRID): { x: number; y: number }[] {
  const b = shapeBBox(bed), w = b.maxX - b.minX, h = b.maxY - b.minY;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const p = { x: b.minX + ((i + 0.5) * w) / n, y: b.minY + ((j + 0.5) * h) / n };
    if (pointInShape(bed, p)) out.push(p);
  }
  return out.length ? out : [{ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }];
}
/**
 * The sun across a bed, read at spots across it from the sun areas recorded (src/sun.ts sunAt: where two overlap,
 * the one inside the other, else the less sun). Null where no sun area touches it: then it's asked. Worked out each
 * time, never stored.
 */
export function sunOverBed(bed: Shape, shapes: Shape[]): BedSun | null {
  const spots = spotsIn(bed);
  const areas = new Map<string, { area: Shape; hours: number }>();
  let minH = Infinity, maxH = -Infinity, most: SunLevel | null = null, least: SunLevel | null = null, n = 0;
  let bx = 0, by = 0, nb = 0, ax = 0, ay = 0;
  for (const p of spots) {
    ax += p.x; ay += p.y;
    const at = sunAt(p, shapes);
    if (!at) { bx += p.x; by += p.y; nb++; continue; }
    n++;
    const h = sunHours(at.info), lv = sunLevel(at.info);
    minH = Math.min(minH, h); maxH = Math.max(maxH, h);
    if (!most || RANK[lv] < RANK[most]) most = lv;
    if (!least || RANK[lv] > RANK[least]) least = lv;
    if (!areas.has(at.area.id)) areas.set(at.area.id, { area: at.area, hours: h });
  }
  if (!n || !most || !least) return null;
  let bare: BedSun['bare'] = null;
  if (nb) {
    // (Which way the bare spots lie from the bed's middle, as a share of its box: one side clearly, or none said.)
    const b = shapeBBox(bed), w = Math.max(1e-6, b.maxX - b.minX), hgt = Math.max(1e-6, b.maxY - b.minY);
    const dx = (bx / nb - ax / spots.length) / w, dy = (by / nb - ay / spots.length) / hgt;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 0.12) bare = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
  }
  return { minH, maxH, most, least, areas: [...areas.values()].sort((a, b) => a.hours - b.hours), covered: n / spots.length, bare };
}

// ---------- What a bed filters on ----------
/** A bed's conditions as the picker reads them: its sun (sunniest, shadiest), soil, moisture, drip. */
export interface BedRules {
  sun: [SunLevel, SunLevel] | null;
  soil: 'clay' | 'loam' | 'sand' | 'unsure' | null;
  moisture: 'dry' | 'average' | 'wet' | 'unsure' | null;
  drip: boolean;
}
const isLevel = (v: unknown): v is SunLevel => v === 'Full' || v === 'Part' || v === 'Shade';
/**
 * A bed's conditions, read: the sun worked out from the sun areas over it where any are, else as answered; soil and
 * moisture as answered. A word a later version stores, this one doesn't know, filters nothing.
 */
export function bedRules(bed: Shape, sun: BedSun | null): BedRules {
  const c = bed.conditions ?? {};
  let range: [SunLevel, SunLevel] | null = sun ? [sun.most, sun.least] : null;
  if (!range && c.sun && typeof c.sun === 'object' && isLevel(c.sun.most) && isLevel(c.sun.least)) {
    range = RANK[c.sun.most] <= RANK[c.sun.least] ? [c.sun.most, c.sun.least] : [c.sun.least, c.sun.most];
  }
  const soil = (['clay', 'loam', 'sand', 'unsure'] as const).find((v) => v === c.soil) ?? null;
  const moisture = (['dry', 'average', 'wet', 'unsure'] as const).find((v) => v === c.moisture) ?? null;
  return { sun: range, soil, moisture, drip: c.drip === true };
}
/** The filters a bed sets while it's planted for: these, the person's own set aside (shown "Set by Front bed"). */
export const SET_BY_BED: readonly (keyof PlantFilter)[] = ['sun', 'sunRange', 'water', 'drought', 'wetFeet', 'clayOk', 'clayBed', 'soilBed'];
/** Which part of a bed's conditions sets each of those. */
export const PART_OF: Partial<Record<keyof PlantFilter, BedPart>> = {
  sun: 'sun', sunRange: 'sun', clayOk: 'soil', clayBed: 'soil', soilBed: 'soil', water: 'moisture', drought: 'moisture', wetFeet: 'moisture',
};
/**
 * What a bed's conditions filter on (Jason's answers, Nov 2), as the picker's filters: every filter the bed sets,
 * the ones it doesn't use cleared, so the person's own aren't counted while it's planted for. `off`: parts taken off.
 * - Sun: plants whose sun range takes in some of the bed's (answer A).
 * - Clay: rated Clay OK; one no source rates, below a divider (answer D). Loam and sandy, the same way by the soil
 *   textures NC State rates it for (Jason, Nov 4): rated for that one first; one rated for none, below a divider; one
 *   rated only for others, left out. Not sure: nothing.
 * - Dry: drought tolerant. Average: water needs low or moderate, so High and Wetland are left out (answer 7). Wet:
 *   takes wet soil. Not sure: nothing.
 * - Drip irrigated lifts only the limits that keep out thirstier plants (answer 6): dry or average with drip, any
 *   water need; wet with drip, as wet.
 */
export function bedFilter(r: BedRules, off: ReadonlySet<BedPart> = new Set()): Partial<PlantFilter> {
  const out: Partial<PlantFilter> = { sun: '', sunRange: '', water: '', drought: false, wetFeet: false, clayOk: false, clayBed: false, soilBed: '' };
  if (r.sun && !off.has('sun')) out.sunRange = `${r.sun[0]}-${r.sun[1]}`;
  if (r.soil === 'clay' && !off.has('soil')) out.clayBed = true;
  if ((r.soil === 'loam' || r.soil === 'sand') && !off.has('soil')) out.soilBed = r.soil;
  if (!off.has('moisture')) {
    if (r.moisture === 'dry' && !r.drip) out.drought = true;
    else if (r.moisture === 'average' && !r.drip) out.water = 'Low,Moderate';
    else if (r.moisture === 'wet') out.wetFeet = true;
  }
  return out;
}
/** Each part of a bed's conditions that filters, in the words of its chip ("Takes part shade to full sun", "Clay OK"). */
export function bedChips(r: BedRules): { part: BedPart; text: string }[] {
  const out: { part: BedPart; text: string }[] = [];
  if (r.sun) out.push({ part: 'sun', text: `Takes ${sunRangeSaid(`${r.sun[0]}-${r.sun[1]}`)}` });
  if (r.soil === 'clay') out.push({ part: 'soil', text: 'Clay OK' });
  else if (r.soil === 'loam') out.push({ part: 'soil', text: 'Loam OK' });
  else if (r.soil === 'sand') out.push({ part: 'soil', text: 'Sandy soil OK' });
  if (r.moisture === 'dry' && !r.drip) out.push({ part: 'moisture', text: 'Drought tolerant' });
  else if (r.moisture === 'average' && !r.drip) out.push({ part: 'moisture', text: 'Water needs: low or moderate' });
  else if (r.moisture === 'wet') out.push({ part: 'moisture', text: 'Takes wet soil' });
  return out;
}
/** What a part is called where it hid plants a search found: "hidden by Front bed: Clay". */
export const PART_NAME: Record<BedPart, string> = { sun: 'Sun', soil: 'Clay', moisture: 'Moisture' };
/** The same, by the bed's own soil: "Front bed: Loam", "Front bed: Sandy soil" (a clay bed's is Clay, as before). */
export const partName = (part: BedPart, r: BedRules): string =>
  part === 'soil' && r.soil === 'loam' ? 'Loam' : part === 'soil' && r.soil === 'sand' ? 'Sandy soil' : PART_NAME[part];

/** `fn` with these filters set, the filters as they were after. */
export function withFilters<T>(set: Partial<PlantFilter>, fn: () => T): T {
  const was = (Object.keys(set) as (keyof PlantFilter)[]).map((k) => [k, plantFilter[k]] as const);
  Object.assign(plantFilter, set);
  try { return fn(); } finally { for (const [k, v] of was) Object.assign(plantFilter, { [k]: v }); }
}

/** A bed's layer over the picker's filters, as the picker uses it. */
export interface BedLayer {
  bed: Shape;
  name: string;
  sun: BedSun | null;
  rules: BedRules;
  /** The filters it sets (bedFilter), with the parts taken off left out. */
  keys: Partial<PlantFilter>;
  /** Its chips: each part that filters, and whether it's taken off. */
  chips: { part: BedPart; text: string; off: boolean }[];
  /** Whether anything of it filters now. */
  filtering: boolean;
}
/** The layer of the bed the picker plants for, or null (anywhere). */
export function bedLayer(bed: Shape | null = plantingFor(), shapes: Shape[] = state.shapes, off: ReadonlySet<BedPart> = partsOff): BedLayer | null {
  if (!bed) return null;
  const sun = sunOverBed(bed, shapes);
  const rules = bedRules(bed, sun);
  const chips = bedChips(rules).map((c) => ({ ...c, off: off.has(c.part) }));
  return { bed, name: bedName(bed), sun, rules, keys: bedFilter(rules, off), chips, filtering: chips.some((c) => !c.off) };
}
/** Whether a plant placed at `at` is inside the bed (its middle, as a plant belongs to a bed: src/beds.ts bedOf). */
export const inBed = (bed: Shape, at: { x: number; y: number }): boolean => pointInShape(bed, at);
