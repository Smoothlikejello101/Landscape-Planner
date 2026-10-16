import { flushHistoryDebounce, pushHistory } from './history';
import { FORM_COLORS, plantsById, type Plant } from './plants';
import { state } from './state';
import { rememberSizeMode, save, storedMyPlants, writeMyPlants } from './storage';
import type { CircleShape, Shape, SizeMode } from './types';
import { snap, uid } from './util';

// The user's own plants ("My plants"): a library shared by every project,
// for plants the catalog doesn't have (a cultivar off a nursery tag, a local
// ecotype). They behave like catalog plants everywhere: sun checks, the plant
// list, key numbers, size modes.
//
// Also here: plant sizes. Catalog and library plants give a size range; the
// plan draws them at the middle of it ('typical') or at the top ('full').

export const MY_PREFIX = 'u-';
export const isMine = (p: Plant | undefined) => !!p && p.id.startsWith(MY_PREFIX);
export let myPlants: Plant[] = [];

type SunLevel = 'Full' | 'Part' | 'Shade';
const SUNS: SunLevel[] = ['Full', 'Part', 'Shade'];
export interface Range { min: number; max: number; med: number }

// ---------- Sizes ----------
/**
 * Read a size the way nursery tags write it: "6-8 ft", "6 to 8'", "36 in",
 * "18-24\"", "3", "2.5 ft". A bare number is feet. Returns null if unreadable.
 */
export function parseSize(text: string): Range | null {
  const t = text.trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+to\s+/g, '-');
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(ft|feet|foot|'|in|inch|inches|")?\s*(?:-\s*(\d+(?:\.\d+)?)\s*(ft|feet|foot|'|in|inch|inches|")?)?$/);
  if (!m) return null;
  const inches = (u?: string) => !!u && (u.startsWith('in') || u === '"');
  // "18-24 in": the unit after the second number applies to both.
  const unitA = m[2] ?? m[4], unitB = m[4] ?? m[2];
  const a = parseFloat(m[1]) / (inches(unitA) ? 12 : 1);
  const b = m[3] != null ? parseFloat(m[3]) / (inches(unitB) ? 12 : 1) : a;
  const min = Math.min(a, b), max = Math.max(a, b);
  if (!(min > 0) || max > 200) return null;
  const r = (v: number) => Math.round(v * 100) / 100;
  return { min: r(min), max: r(max), med: r((min + max) / 2) };
}
export function formatSize(r: Range | undefined): string {
  if (!r) return '';
  const f = (v: number) => (v < 1 ? `${Math.round(v * 12)} in` : `${Math.round(v * 10) / 10} ft`);
  return r.min === r.max ? f(r.min) : `${f(r.min)} to ${f(r.max)}`;
}
/** Spread (feet) a plant is drawn at in this mode. */
export function plantSpread(p: Plant, mode: SizeMode): number {
  const w = p.width, h = p.height;
  if (mode === 'full') return w?.max || w?.med || h?.max || h?.med || 2;
  return w?.med || (w?.min && w?.max ? (w.min + w.max) / 2 : 0) || w?.max || h?.med || 2;
}
export function plantRadius(p: Plant, mode: SizeMode): number {
  return Math.max(0.5, snap(plantSpread(p, mode) / 2));
}
/** Full-size radius when it is bigger than what is drawn (for the dashed ring), else null. */
export function fullRingRadius(s: Shape): number | null {
  if (s.type !== 'circle' || !s.plantId) return null;
  const p = plantsById[s.plantId];
  if (!p) return null;
  const full = Math.max(0.5, plantSpread(p, 'full') / 2);
  return full > s.radius + 0.05 ? full : null;
}
/** A placed plant whose size came from plant data (not set by hand). */
export function isDataSized(s: Shape): s is CircleShape {
  if (s.type !== 'circle' || !s.plantId || s.sizeFrom === 'manual') return false;
  if (s.sizeFrom === 'plant') return true;
  const p = plantsById[s.plantId];
  return !!p && (s.radius === plantRadius(p, 'typical') || s.radius === plantRadius(p, 'full'));
}
/** Plants that would change size if the plan switched to `mode`. */
export function plantsToResize(shapes: Shape[], mode: SizeMode): CircleShape[] {
  return shapes.filter((s): s is CircleShape => {
    if (!isDataSized(s)) return false;
    const p = plantsById[s.plantId!];
    return !!p && plantRadius(p, mode) !== s.radius;
  });
}
/** Switch the plan's size mode and redraw data-sized plants (one undo step). */
export function applySizeMode(mode: SizeMode) {
  flushHistoryDebounce();
  for (const s of plantsToResize(state.shapes, mode)) {
    s.radius = plantRadius(plantsById[s.plantId!]!, mode);
    s.sizeFrom = 'plant';
  }
  state.sizeMode = mode;
  rememberSizeMode(mode);
  pushHistory();
  save();
}

// ---------- The library ----------
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
function range(v: unknown): Range | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const min = num(o.min), max = num(o.max), med = num(o.med);
  const lo = min ?? med ?? max, hi = max ?? med ?? min;
  if (lo == null || hi == null || lo <= 0 || hi > 200) return undefined;
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  return { min: a, max: b, med: med != null && med >= a && med <= b ? med : (a + b) / 2 };
}
/** Validate a stored or imported library plant; null if unusable. */
export function sanitizeMyPlant(raw: unknown): Plant | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.startsWith(MY_PREFIX) && o.id.length <= 40 ? o.id : null;
  const common = str(o.common, 80);
  const width = range(o.width);
  if (!id || !common || !width) return null;
  const sun = (v: unknown) => (SUNS.includes(v as SunLevel) ? (v as SunLevel) : undefined);
  let most = sun(o.sun_most), least = sun(o.sun_least);
  if (!most || !least) most = least = undefined;
  else if (SUNS.indexOf(most) > SUNS.indexOf(least)) [most, least] = [least, most];
  const bloom = o.bloom && typeof o.bloom === 'object' ? o.bloom as Record<string, unknown> : null;
  const month = (v: unknown) => { const n = num(v); return n != null && n >= 1 && n <= 12 ? Math.round(n) : undefined; };
  const bs = bloom ? month(bloom.start) : undefined, be = bloom ? month(bloom.end) : undefined;
  const form = typeof o.form === 'string' && o.form in FORM_COLORS ? o.form : undefined;
  const p: Plant = { id, common, width };
  const height = range(o.height);
  const botanical = str(o.botanical, 120), notes = str(o.notes, 2000), bloomColor = bloom ? str(bloom.color, 40) : undefined;
  if (botanical) p.botanical = botanical;
  if (height) p.height = height;
  if (most && least) { p.sun_most = most; p.sun_least = least; }
  if (form) p.form = form;
  if (bs != null) p.bloom = { start: bs, end: be ?? bs, ...(bloomColor ? { color: bloomColor } : {}) };
  if (notes) p.notes = notes;
  return p;
}
/** Load the library from storage into memory and the plant lookup. */
export function loadMyPlants() {
  for (const p of myPlants) delete plantsById[p.id];
  myPlants = storedMyPlants().map(sanitizeMyPlant).filter((p): p is Plant => !!p);
  for (const p of myPlants) plantsById[p.id] = p;
}
async function persist(next: Plant[]) {
  await writeMyPlants(next); // throws on failure: nothing changes in memory
  for (const p of myPlants) delete plantsById[p.id];
  myPlants = next;
  for (const p of myPlants) plantsById[p.id] = p;
}
export function newMyPlantId(): string { return MY_PREFIX + uid(); }
/** Add or replace a plant in the library. Throws if it couldn't be saved. */
export async function saveMyPlant(p: Plant): Promise<Plant> {
  const clean = sanitizeMyPlant(p);
  if (!clean) throw new Error('A plant needs a name and a spread.');
  const next = myPlants.some((x) => x.id === clean.id) ? myPlants.map((x) => (x.id === clean.id ? clean : x)) : [...myPlants, clean];
  next.sort((a, b) => a.common.localeCompare(b.common));
  await persist(next);
  return clean;
}
/**
 * Remove a plant from the library. Plants already placed keep their name and
 * size (they're stored on the plan), so no plan breaks.
 */
export async function deleteMyPlant(id: string) {
  await persist(myPlants.filter((p) => p.id !== id));
}
/** Library plants that `incoming` adds (by id; existing entries are kept as they are). */
export async function mergeMyPlants(incoming: unknown[]): Promise<number> {
  const have = new Set(myPlants.map((p) => p.id));
  const add = incoming.map(sanitizeMyPlant).filter((p): p is Plant => !!p && !have.has(p.id));
  if (!add.length) return 0;
  await persist([...myPlants, ...add].sort((a, b) => a.common.localeCompare(b.common)));
  return add.length;
}
/** Library plants a set of shapes uses (to carry them in a project file). */
export function myPlantsUsedBy(shapes: Shape[]): Plant[] {
  const ids = new Set(shapes.map((s) => s.plantId).filter((id): id is string => !!id && id.startsWith(MY_PREFIX)));
  return myPlants.filter((p) => ids.has(p.id));
}

/** Sun chips -> stored range. */
export function sunRange(levels: SunLevel[]): { sun_most?: SunLevel; sun_least?: SunLevel } {
  const sorted = SUNS.filter((l) => levels.includes(l));
  return sorted.length ? { sun_most: sorted[0], sun_least: sorted[sorted.length - 1] } : {};
}
export function sunLevels(p: Plant): SunLevel[] {
  if (!p.sun_most || !p.sun_least) return [];
  const a = SUNS.indexOf(p.sun_most as SunLevel), b = SUNS.indexOf(p.sun_least as SunLevel);
  return SUNS.slice(a, b + 1);
}

/** Resize placed plants (in the open plan) that use this plant and were sized from its data. */
export function placedUsing(id: string): CircleShape[] {
  return state.shapes.filter((s): s is CircleShape => s.type === 'circle' && s.plantId === id && isDataSized(s));
}
export function resizePlaced(p: Plant, oldName: string) {
  flushHistoryDebounce();
  for (const s of placedUsing(p.id)) {
    s.radius = plantRadius(p, state.sizeMode);
    s.sizeFrom = 'plant';
  }
  // Renamed in the library: rename placed plants still showing the old name.
  for (const s of state.shapes) if (s.plantId === p.id && s.label === oldName) s.label = p.common;
  pushHistory();
  save();
}
