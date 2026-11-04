// Getting the yard in (Jason's UI review, approved Nov 2): from a photo of the yard, or an empty grid, to the house,
// driveway, trees, lot line and beds drawn to scale. This file is its rules, with no page in it: the house scale the
// Building tool opens at, which building gets asked about its size, and what the "Now trace" banner lists.
//
// Nothing here is drawn for the person: "Lots of real houses aren't near rectangles, so I'm hesitant to draw the thing
// for them" (Jason). The tool opens where a house fits; a building that comes out shed-sized is asked about.

import { PX_PER_FOOT_BASE } from './constants';
import { shapeArea } from './geometry';
import { kindOfShape } from './kinds';
import type { Shape } from './types';

// ---------- The Building tool opens at house scale ----------
/**
 * How much the plan shows across its narrower side when the Building tool opens (feet): a house, 50 by 30 ft say, with
 * room round it. The opening view is about 17 ft across a phone, where a house drawn by hand came out a shed.
 */
export const HOUSE_VIEW_FT = 70;
/**
 * The zoom the Building tool opens at, or null to leave the view as it is: only zoomed out, never in, and only for the
 * plan's first building (the house) with no photo showing (over a photo, the view is the person's own, to trace by).
 * `w`, `h`: the plan's size (px).
 */
export function houseScaleZoom(view: { w: number; h: number; zoom: number }, plan: { buildings: number; photoShown: boolean }): number | null {
  if (plan.buildings > 0 || plan.photoShown || !(view.w > 0 && view.h > 0)) return null;
  // (A whole percent, as the zoom's readout says it.)
  const zoom = Math.floor(Math.min(view.w, view.h) / (HOUSE_VIEW_FT * PX_PER_FOOT_BASE) * 100) / 100;
  return zoom < view.zoom - 1e-6 ? zoom : null;
}

// ---------- A building that came out small is asked about ----------
/** Under this (square feet), the plan's only building gets "Is that the real size?". */
export const SMALL_BUILDING_SQFT = 300;
/**
 * Whether to ask about this building's size: smaller than SMALL_BUILDING_SQFT, and the only building in the plan
 * ("Only question a small building if it's the only one in the plan — sheds really are that small": Jason).
 */
export function asksRealSize(shape: Shape, shapes: Shape[]): boolean {
  return shape.role === 'building' && shapeArea(shape) < SMALL_BUILDING_SQFT && !shapes.some((s) => s.id !== shape.id && s.role === 'building');
}

// ---------- "Now trace": what to trace over a photo once it's to scale ----------
export type TraceItem = 'building' | 'driveway' | 'tree' | 'property' | 'bed';
/** In the order the banner lists them, with what it calls them. */
export const TRACE_ITEMS: { key: TraceItem; label: string }[] = [
  { key: 'building', label: 'House' }, { key: 'driveway', label: 'Driveway' }, { key: 'tree', label: 'Trees' },
  { key: 'property', label: 'Lot line' }, { key: 'bed', label: 'Beds' },
];
/** Whether the plan has one of these drawn already. */
export function traced(item: TraceItem, shapes: Shape[]): boolean {
  return shapes.some((s) => item === 'tree' ? s.type === 'circle' && !!s.tree : kindOfShape(s) === item);
}
/** Every one of them drawn: the banner's job is done, and it goes for good. */
export const allTraced = (shapes: Shape[]): boolean => TRACE_ITEMS.every((t) => traced(t.key, shapes));

// ---------- The scale box keeps clear of A and B ----------
interface Box { left: number; top: number; right: number; bottom: number }
/**
 * How to move the plan so the two points being measured, A and B (page px), show clear of the box asking how far apart
 * they are: null when they're clear of it already (`margin` px round each). Else the zoom to apply about their middle
 * (1, or less where they're too far apart to fit below it), then how far down to move them (px): just below the box,
 * where a phone's keyboard, coming up from the bottom, leaves them be. `room`: the plan's top and bottom (page px).
 */
export function clearOfBox(pts: { x: number; y: number }[], box: Box, room: { top: number; bottom: number }, margin = 24): { zoom: number; dy: number } | null {
  if (!pts.length || !pts.some((p) => p.x > box.left - margin && p.x < box.right + margin && p.y > box.top - margin && p.y < box.bottom + margin)) return null;
  const ys = pts.map((p) => p.y), minY = Math.min(...ys), maxY = Math.max(...ys);
  const top = Math.max(room.top, box.bottom) + margin, bottom = room.bottom - margin;
  const span = maxY - minY, fits = Math.max(1, bottom - top);
  const zoom = span > fits ? fits / span : 1;
  return { zoom, dy: top - ((minY + maxY) / 2 - (span * zoom) / 2) };
}

/**
 * Setting a photo's scale began, and the strip saying what to tap (with lengths you may know) came above the plan,
 * taking its top (src/canvas.ts resizeCanvas leaves what's on the plan where it was on the screen): how to move the
 * plan so the part of the photo that was in view (`photo`, page px, in the plan's box as it was, `before`) is still in
 * view, below the strip (the plan's box now, `after`), where the two points go. Null when it is already. As the scale
 * box keeps clear of A and B (clearOfBox): moved down, zoomed out only if it must, about (x, y).
 */
export function clearOfStrip(photo: Box, before: Box, after: Box): { zoom: number; dy: number; x: number; y: number } | null {
  const seen = { left: Math.max(photo.left, before.left), top: Math.max(photo.top, before.top), right: Math.min(photo.right, before.right), bottom: Math.min(photo.bottom, before.bottom) };
  if (seen.right <= seen.left || seen.bottom <= seen.top || seen.top >= after.top - 0.5) return null;
  const span = seen.bottom - seen.top, fits = Math.max(1, after.bottom - after.top);
  const zoom = span > fits ? fits / span : 1, y = (seen.top + seen.bottom) / 2;
  return { zoom, dy: after.top - (y - (span * zoom) / 2), x: (seen.left + seen.right) / 2, y };
}

/**
 * Whether this plan's "Now trace" banner is up (`on`: offered once its photo was set to scale), or put away for good
 * (`off`: dismissed, or everything on it traced): "it shouldn't come back on its own once dismissed or finished"
 * (Jason). A note on this device, as the first screen's ✕ is (src/first-hidden.ts), not part of the plan.
 */
const TRACE_KEY = 'lp-trace';
const TRACE_MAX = 50; // (the newest kept)
const traceSession = new Map<string, 'on' | 'off'>();
function traceRecords(): [string, 'on' | 'off'][] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(TRACE_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is [string, 'on' | 'off'] => Array.isArray(x) && typeof x[0] === 'string' && (x[1] === 'on' || x[1] === 'off')) : [];
  } catch { return []; }
}
export function traceState(plan: string | null | undefined): 'on' | 'off' | null {
  if (!plan) return null;
  return traceSession.get(plan) ?? traceRecords().find(([p]) => p === plan)?.[1] ?? null;
}
export function setTraceState(plan: string, v: 'on' | 'off' | null): void {
  if (v) traceSession.set(plan, v); else traceSession.delete(plan);
  const list = traceRecords().filter(([p]) => p !== plan);
  if (v) list.push([plan, v]);
  try { localStorage.setItem(TRACE_KEY, JSON.stringify(list.slice(-TRACE_MAX))); } catch { /* (this session only) */ }
}
/** The photo was just set to scale: the banner is offered, unless it was put away before. */
export function offerTrace(plan: string | null | undefined): void {
  if (plan && traceState(plan) !== 'off') setTraceState(plan, 'on');
}
