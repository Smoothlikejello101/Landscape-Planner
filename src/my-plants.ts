import { flushHistoryDebounce, pushHistory } from './history';
import { aliases, applyAliases, FORM_COLORS, onCatalogLoaded, ownCopies, PLANTS, plantsById, speciesOf, type Plant } from './plants';
import { currentForm, INHERITED, wirePlant, type Provenance } from './catalog';
import { state } from './state';
import { getPlantSync, rememberSizeMode, save, storedMyPlants, writeMyPlants, type SyncRecord } from './storage';
import { fingerprint } from './sync/engine';
import type { CircleShape, Shape, SizeMode } from './types';
import { snap, uid } from './util';
import { setRadius } from './geometry';

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
 * "18-24\"", "3", "2.5 ft", ".5" (or "5." while it's typed), "1½ ft", "1 1/2". A bare number is in `defaultUnit`.
 * Returns null if unreadable.
 */
/**
 * Hardiness zones as a tag gives them ("5-9", "zones 6b to 9a", "7"), on the half-zone scale the catalog uses
 * (src/climate.ts): a coldest zone "5" is all of zone 5 (5), "5b" its warmer half (5.5); a warmest "9" is through 9b
 * (9.5), "9a" 9. Null if it can't be read, or the range runs backwards. (Jason, Oct 30: optional, for my plants.)
 */
export function parseZones(text: string): { zone_min: number; zone_max: number } | null {
  const parts = text.toLowerCase().replace(/zones?/g, ' ').trim().split(/\s*(?:-|–|—|to|through)\s*/).filter(Boolean);
  if (!parts.length || parts.length > 2) return null;
  const read = (s: string) => { const m = /^(\d{1,2})([ab])?$/.exec(s.trim()); return m && +m[1] >= 1 && +m[1] <= 13 ? { n: +m[1], half: m[2] as 'a' | 'b' | undefined } : null; };
  const a = read(parts[0]), b = read(parts[parts.length - 1]);
  if (!a || !b) return null;
  const zone_min = a.n + (a.half === 'b' ? 0.5 : 0), zone_max = b.n + (b.half === 'a' ? 0 : 0.5);
  if (parts.length === 1 && a.half) return { zone_min, zone_max: zone_min };
  return zone_min <= zone_max ? { zone_min, zone_max } : null;
}
/** A plant's zones as typed back into its form ("5-9", "6b-9a"); '' with none. */
export function zonesText(p: { zone_min?: number; zone_max?: number }): string {
  if (p.zone_min == null || p.zone_max == null) return '';
  const lo = p.zone_min % 1 ? `${Math.floor(p.zone_min)}b` : `${p.zone_min}`;
  const hi = p.zone_max % 1 ? `${Math.floor(p.zone_max)}` : `${p.zone_max}a`;
  if (p.zone_min === p.zone_max) return `${Math.floor(p.zone_min)}${p.zone_min % 1 ? 'b' : 'a'}`;
  return lo === hi ? lo : `${lo}-${hi}`;
}
/** Water needs a plant of mine can be given: the catalog's words. */
export const MY_WATER = ['Low', 'Moderate', 'High', 'Wetland'] as const;
/**
 * Flower colors a plant of mine can be given, as chips (Jason, Oct 30): the catalog's petal colors, drawn as the
 * catalog's are (src/looks.ts). Stored as `flower_color`, the catalog's own field, in the order chosen: the first is
 * the one drawn. Kept with or without bloom months; older plants have none, and their bloom color's words are read
 * for it (looks.ts ownBloomColors) until it's saved again.
 */
export const MY_FLOWER_COLORS = ['white', 'cream', 'yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'green'] as const;
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
export function parseSize(text: string, defaultUnit: 'ft' | 'in' = 'ft'): Range | null {
  const t = text.trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+to\s+/g, '-').replace(/,/g, '.')
    // (Fractions as numbers: "1½", "1 1/2", "3/4".)
    .replace(/(\d*)\s*([½¼¾⅓⅔])/g, (_, w: string, f: string) => String(Number(w || 0) + FRACTIONS[f]))
    .replace(/(\d+)\s+(\d+)\/(\d+)/g, (_, w: string, n: string, d: string) => String(Number(w) + Number(n) / Number(d)))
    .replace(/(^|[^\d.])(\d+)\/(\d+)/g, (_, pre: string, n: string, d: string) => pre + String(Number(n) / Number(d)));
  if (!t) return null;
  // (A number: "3", "2.5", ".5", or "5." as it's being typed.)
  const NUM = String.raw`(\d+(?:\.\d*)?|\.\d+)`, UNIT = String.raw`(ft|feet|foot|'|in|inch|inches|")?`;
  const m = t.match(new RegExp(String.raw`^${NUM}\s*${UNIT}\s*(?:-\s*${NUM}\s*${UNIT})?$`));
  if (!m) return null;
  const inches = (u?: string) => !!u && (u.startsWith('in') || u === '"');
  // "18-24 in": the unit after the second number applies to both.
  const unitA = m[2] ?? m[4] ?? defaultUnit, unitB = m[4] ?? m[2] ?? defaultUnit;
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
/** Radius drawn for a plant: half its spread, to the nearest quarter foot (so the diameter is to the half foot). */
export function plantRadius(p: Plant, mode: SizeMode): number {
  return Math.max(0.25, Math.round(plantSpread(p, mode) * 2) / 4);
}
/** Radius as earlier versions drew it (half foot steps); plants placed then still count as sized from data. */
function legacyRadius(p: Plant, mode: SizeMode): number {
  return Math.max(0.5, snap(plantSpread(p, mode) / 2));
}
/** Full-size radius when it is bigger than what is drawn (for the dashed ring), else null. */
export function fullRingRadius(s: Shape): number | null {
  if (s.type !== 'circle' || !s.plantId || s.canopy) return null; // a shaped canopy is kept pruned to its shape
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
  return !!p && [plantRadius(p, 'typical'), plantRadius(p, 'full'), legacyRadius(p, 'typical'), legacyRadius(p, 'full')].includes(s.radius);
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
    setRadius(s, plantRadius(plantsById[s.plantId!]!, mode));
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
  // (An older form name reads as today's: an understory or canopy tree is a tree.)
  const form = typeof o.form === 'string' && currentForm(o.form) in FORM_COLORS ? currentForm(o.form) : undefined;
  const p: Plant = { id, common, width };
  const height = range(o.height);
  const botanical = str(o.botanical, 120), notes = str(o.notes, 2000), bloomColor = bloom ? str(bloom.color, 40) : undefined;
  if (botanical) p.botanical = botanical;
  if (height) p.height = height;
  if (most && least) { p.sun_most = most; p.sun_least = least; }
  if (form) p.form = form;
  if (bs != null) p.bloom = { start: bs, end: be ?? bs, ...(bloomColor ? { color: bloomColor } : {}) };
  // (Its flower colors, chosen as chips (Oct 31): each once, in the order chosen; older plants have none.)
  if (Array.isArray(o.flower_color)) {
    const colors = [...new Set(o.flower_color.filter((c): c is string => (MY_FLOWER_COLORS as readonly unknown[]).includes(c)))];
    if (colors.length) p.flower_color = colors;
  }
  if (notes) p.notes = notes;
  // (Zones and water needs, given by hand (Oct 30); older plants have neither.)
  const half = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 13.5 && Number.isInteger(v * 2) ? v : undefined);
  const zmin = half(o.zone_min), zmax = half(o.zone_max);
  if (zmin != null && zmax != null && zmin <= zmax) { p.zone_min = zmin; p.zone_max = zmax; }
  if (MY_WATER.includes(o.water as typeof MY_WATER[number])) p.water = o.water as string;
  if (typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color)) p.color = o.color.toLowerCase();
  // (A catalog id, as the catalog writes them: lower case, digits, hyphens.)
  const ref = (v: unknown) => (typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(v) ? v : undefined);
  const sameAs = ref(o.sameAs), notSame = ref(o.notSame), species = ref(o.species);
  if (sameAs) p.sameAs = sameAs;
  else if (notSame) p.notSame = notSame;
  if (species) p.species = species;
  // (Male or female, said by hand for a species with separate sexes: Jason, Oct 31. Older plants have none.)
  if (o.sex === 'male' || o.sex === 'female') p.sex = o.sex;
  return p;
}
/** Load the library from storage into memory and the plant lookup. */
export function loadMyPlants() {
  for (const p of myPlants) delete plantsById[p.id];
  myPlants = storedMyPlants().map(sanitizeMyPlant).filter((p): p is Plant => !!p);
  // (The catalog loads after the library: the species links resolve then. Hooked here, at start-up, not on import:
  // plants.ts may not have run yet when this module is first imported, the two importing each other.)
  if (!hooked) { hooked = true; onCatalogLoaded(indexMine); }
  indexMine();
}
let hooked = false;
/** A plant of mine as stored (its own values only: none of its species'), for its form and for copying. */
export const rawMyPlant = (id: string): Plant | undefined => myPlants.find((p) => p.id === id);

// ---------- The same species as a catalog plant ----------
// "Same species as Hydrangea paniculata": a plant of mine then has what holds for the whole species, from the
// catalog, as a catalog cultivar has its species' (src/catalog.ts, INHERITED): hardiness, toxicity, poison,
// native status, value to wildlife. Its own values stand where it has them (its sun, its form); its size, color
// and bloom months are its own. Only the link is stored (and synced); the species' facts are read from the
// catalog each time, so they follow the catalog as it's corrected. Its species' id is its `parent`, so records
// kept by species (flowering months and native status where the garden is, what the law says: src/wild.ts)
// apply to it too.

/** A plant of mine seen with its species' facts (`sp`: the catalog plant it's linked to; none: as it is). */
export function withSpecies(mine: Plant, sp: Plant | undefined): Plant {
  if (!sp) return mine;
  const out: Plant = { ...mine, parent: sp.id };
  const prov: Record<string, Provenance> = {};
  for (const key of INHERITED) {
    if (mine[key] != null) continue; // (its own value stands)
    const pv = sp.prov?.[key];
    if (sp[key] == null && !pv?.unknown) continue;
    if (sp[key] != null) out[key] = sp[key];
    if (pv) prov[key] = { ...pv, inherited: true };
  }
  if (!mine.form && sp.forms) out.forms = sp.forms;
  // (The earlier list's dog warning given for its species' other records.)
  if (sp.dogVia && out.dog == null) out.dogVia = sp.dogVia;
  if (Object.keys(prov).length) out.prov = prov;
  return out;
}
/** The catalog plant a link names (never one of mine). */
const catalogPlant = (id: string | undefined): Plant | undefined =>
  id && !id.startsWith(MY_PREFIX) && plantsById[id]?.id === id ? plantsById[id] : undefined;
/**
 * The catalog's record of a species, by a botanical name that names it ("Hydrangea paniculata 'Limelight'":
 * Hydrangea paniculata's): the record whose botanical name is the species alone. Undefined when it has none.
 */
export function speciesRecordFor(botanical: string | undefined, catalog: Plant[] = PLANTS): Plant | undefined {
  const sp = speciesOf(botanical);
  return sp ? catalog.find((p) => !p.parent && p.botanical?.trim() === sp) : undefined;
}
/**
 * The species a plant to start from stands for: one of mine, its link; a catalog cultivar, its species; a catalog
 * species, itself (a cultivar with no species record: its species by botanical name, else the cultivar).
 */
export function speciesLinkFor(source: Plant): Plant | undefined {
  if (isMine(source)) return catalogPlant(rawMyPlant(source.id)?.species ?? source.species);
  return catalogPlant(source.parent) ?? speciesRecordFor(source.botanical) ?? catalogPlant(source.id);
}
/** Plants of mine into the plant lookup, each with its species' facts where it's linked to one. */
function indexMine() {
  for (const p of myPlants) plantsById[p.id] = p.species ? withSpecies(p, catalogPlant(p.species)) : p;
  indexSwitched();
}
// ---------- Switching a plant of mine to the catalog's ----------
// When the catalog adds a plant someone had to add themselves ("Hydrangea 'Limelight'" off a nursery tag), they
// can switch to the catalog's, with its sourced facts. The plant of mine stays, marked `sameAs`: its id then
// stands for the catalog plant in every plan and on every device (plants.ts, aliases), so no other plan is
// rewritten, and it keeps the person's notes and color. In the open plan, placed plants are relinked as one
// undo step.

/** Plants of mine in use as themselves (not switched to a catalog plant the catalog has), as the app sees them. */
export const activeMyPlants = (): Plant[] => myPlants.filter((p) => plantsById[p.id]?.id === p.id).map((p) => plantsById[p.id]);
function indexSwitched() {
  for (const k of Object.keys(aliases)) delete aliases[k];
  for (const k of Object.keys(ownCopies)) delete ownCopies[k];
  for (const p of myPlants) if (p.sameAs) { aliases[p.id] = p.sameAs; ownCopies[p.sameAs] ??= p; }
  applyAliases();
}
/** A name's words, for comparing: lower case, no accents, quotes, marks or brackets ("Hydrangea 'Limelight'": hydrangea, limelight). */
export function nameWords(s: string | undefined): string[] {
  return (s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™'"‘’“”().,]/g, ' ').replace(/(^|\s)x(\s|$)/g, '$1×$2').split(/\s+/).filter(Boolean);
}
/**
 * The catalog plant a plant of mine is, when there's exactly one: the same botanical name (cultivar included);
 * or, with no botanical name, every word of its name in the catalog plant's names ("Hydrangea 'Limelight'":
 * Limelight Hydrangea), two words at least. Not one the person said it isn't. Null when unsure.
 */
export function catalogMatchFor(mine: Plant, catalog: Plant[] = PLANTS): Plant | null {
  if (mine.sameAs) return null;
  const pick = (hits: Plant[]) => {
    const left = hits.filter((p) => p.id !== mine.notSame);
    return left.length === 1 && hits.length === 1 ? left[0] : null;
  };
  const bot = nameWords(mine.botanical).join(' ');
  if (bot.split(' ').length >= 2) return pick(catalog.filter((p) => nameWords(p.botanical).join(' ') === bot));
  const want = nameWords(mine.common);
  if (want.length < 2) return null;
  const hits = catalog.filter((p) => { const have = new Set([...nameWords(p.common), ...nameWords(p.botanical)]); return want.every((w) => have.has(w)); });
  // (Several: the one whose common name is exactly these words, if there's one.)
  const exact = hits.filter((p) => nameWords(p.common).sort().join(' ') === [...want].sort().join(' '));
  return pick(exact.length ? exact : hits);
}
/**
 * Switch a plant of mine to the catalog's: the library record is marked (and synced); placed plants in the open
 * plan take the catalog plant's id, and its name where they showed mine; with `resize`, those sized from the
 * plant's data take the catalog's size, the rest keep theirs (then sized by hand). Returns how many were placed
 * here. Throws if the library couldn't be saved: nothing changes.
 */
export async function switchToCatalog(seen: Plant, target: Plant, resize: boolean): Promise<number> {
  const mine = rawMyPlant(seen.id) ?? seen; // (as stored: none of its species' facts)
  const before = state.shapes.filter((s) => s.plantId === mine.id).map((s) => s.id);
  const dataSized = new Set(state.shapes.filter((s) => s.plantId === mine.id && isDataSized(s)).map((s) => s.id));
  const { notSame: _drop, ...rest } = mine;
  await applyPlantChanges([{ id: mine.id, plant: { ...rest, sameAs: target.id } }]);
  flushHistoryDebounce();
  let n = 0;
  for (const s of state.shapes) {
    if (!before.includes(s.id) || s.plantId !== mine.id) continue;
    n++;
    s.plantId = target.id;
    if (s.label === mine.common) s.label = target.common;
    if (s.type !== 'circle' || s.tree) continue;
    if (resize && dataSized.has(s.id)) { setRadius(s, plantRadius(target, state.sizeMode)); s.sizeFrom = 'plant'; }
    else s.sizeFrom = s.radius === plantRadius(target, state.sizeMode) ? 'plant' : 'manual';
  }
  if (n) pushHistory();
  save();
  return n;
}
/** Not the same plant after all: the plant of mine is itself again (placed plants relinked here stay linked to the catalog's). */
export async function unswitch(seen: Plant): Promise<void> {
  const { sameAs: _drop, ...rest } = rawMyPlant(seen.id) ?? seen;
  await applyPlantChanges([{ id: seen.id, plant: rest }]);
}
/** "Keep mine": this catalog plant isn't offered for it again. */
export async function keepMine(seen: Plant, target: Plant): Promise<void> {
  const mine = rawMyPlant(seen.id) ?? seen;
  await applyPlantChanges([{ id: mine.id, plant: { ...mine, notSame: target.id } }]);
}

/** A plant's fingerprint (sync tells by it whether a plant changed). */
/** A plant's fingerprint, as it's sent (src/catalog.ts, WIRE_FORMS): the same for a tree before and after the rename. */
export const plantHash = (p: Plant) => fingerprint('', wirePlant(p) as unknown as Record<string, unknown>);
/**
 * A change to the library. `plant`: the new version, null to delete, or
 * undefined to leave it (only its sync record changes). From sync: `expect`
 * is the fingerprint the plant had when sync read it (null: absent); the
 * change is skipped if it has changed since. `edited`: the edit time to
 * keep; `record`: its sync record (null: none); `requires`: made only if
 * the change to that plant id (earlier in the batch) was.
 */
export interface PlantChange { id: string; plant?: Plant | null; expect?: string | null; edited?: number; record?: SyncRecord | null; requires?: string }
let writing: Promise<unknown> = Promise.resolve();
/**
 * Apply changes to the library, one batch at a time (each sees the one
 * before), and store it with its sync state in one write. Returns the ids
 * changed. Throws if it couldn't be saved: nothing changes in memory.
 * `bySync`: from sync (keeps the given edit times); otherwise the user's own
 * edits, timed now.
 */
export function applyPlantChanges(changes: PlantChange[], bySync = false): Promise<string[]> {
  const run = writing.then(async () => {
    const cur = new Map(myPlants.map((p) => [p.id, p]));
    const sync = getPlantSync();
    const done: string[] = [];
    for (const c of changes) {
      if (c.requires && !done.includes(c.requires)) continue; // goes only with a change that was made
      if (c.expect !== undefined) {
        const have = cur.get(c.id);
        if ((have ? plantHash(have) : null) !== c.expect) continue; // changed meanwhile: next time
      }
      if (c.plant) cur.set(c.id, c.plant);
      else if (c.plant === null) cur.delete(c.id);
      if (c.edited !== undefined) sync.edited[c.id] = c.edited;
      else if (!bySync && c.plant !== undefined) sync.edited[c.id] = Date.now();
      if (c.record) sync.records[c.id] = c.record;
      else if (c.record === null) delete sync.records[c.id];
      done.push(c.id);
    }
    const next = [...cur.values()].sort((a, b) => a.common.localeCompare(b.common));
    await writeMyPlants(next, sync); // throws on failure: nothing changes in memory
    for (const p of myPlants) delete plantsById[p.id];
    myPlants = next;
    indexMine();
    if (done.length && !bySync) afterPlantEdit();
    return done;
  });
  writing = run.catch(() => undefined);
  return run;
}
let afterPlantEdit: () => void = () => {};
/** Sync hears of every edit to the library. */
export function setPlantEditHook(fn: () => void) { afterPlantEdit = fn; }
export function newMyPlantId(): string { return MY_PREFIX + uid(); }
/** Add or replace a plant in the library. Throws if it couldn't be saved. */
export async function saveMyPlant(p: Plant): Promise<Plant> {
  const clean = sanitizeMyPlant(p);
  if (!clean) throw new Error('A plant needs a name and a spread.');
  await applyPlantChanges([{ id: clean.id, plant: clean }]);
  return clean;
}
/**
 * Remove a plant from the library. Plants already placed keep their name and
 * size (they're stored on the plan), so no plan breaks.
 */
export async function deleteMyPlant(id: string) {
  await applyPlantChanges([{ id, plant: null }]);
}
/** Library plants that `incoming` adds (by id; existing entries are kept as they are). */
export async function mergeMyPlants(incoming: unknown[]): Promise<number> {
  const have = new Set(myPlants.map((p) => p.id));
  const add = incoming.map(sanitizeMyPlant).filter((p): p is Plant => !!p && !have.has(p.id));
  if (!add.length) return 0;
  // Only if still absent when written. Not timed as an edit now: an old file mustn't win over newer edits elsewhere.
  return (await applyPlantChanges(add.map((p) => ({ id: p.id, plant: p, expect: null, edited: 0 })))).length;
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
/** Recolored in the library: placed plants still in the old color take the new one (one undo step). */
/** Placed plants of this one drawn in any of its old colors take the new one. */
export function recolorPlaced(id: string, oldColors: string[], newColor: string) {
  const old = new Set(oldColors.map((c) => c.toLowerCase()).filter((c) => c !== newColor.toLowerCase()));
  const hit = state.shapes.filter((s) => s.plantId === id && old.has(s.color.toLowerCase()));
  if (!hit.length) return;
  flushHistoryDebounce();
  for (const s of hit) s.color = newColor;
  pushHistory();
  save();
}
export function resizePlaced(p: Plant) {
  flushHistoryDebounce();
  for (const s of placedUsing(p.id)) {
    setRadius(s, plantRadius(p, state.sizeMode));
    s.sizeFrom = 'plant';
  }
  pushHistory();
  save();
}
/** Renamed in the library: placed plants still showing the old name take the new one (one undo step). How many. */
export function renamePlaced(p: Plant, oldName: string): number {
  if (!oldName || oldName === p.common) return 0;
  const these = state.shapes.filter((s) => s.plantId === p.id && s.label === oldName);
  if (!these.length) return 0;
  flushHistoryDebounce();
  for (const s of these) s.label = p.common;
  pushHistory();
  save();
  return these.length;
}
