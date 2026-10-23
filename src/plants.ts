import { redrawCanvas } from './canvas';
import { flushHistoryDebounce, pushHistory } from './history';
import { state } from './state';
import { save } from './storage';
import { render } from './ui/render';
import { toast } from './ui/toast';
import type { CircleShape, Point, Shape } from './types';
import { snap, uid } from './util';
import { isDataSized, plantRadius } from './my-plants';
import { currentForm, isCatalogV2, resolveCatalog, type Provenance } from './catalog';
import { spreadsAs } from './spread';
import { setRadius } from './geometry';
import { isLocked } from './roles';
import { shownWith } from './status';
import { hardyEnough, zoneFit, zoneRange } from './climate';
import { gardenStateName, nativeHere, wildHere, wildNearby } from './wild';
import { bloomMonths, bloomSpan } from './bloom';
import { byMatch, matchPlant, readQuery } from './search';

/**
 * One plant: a row of the catalog (plants.json), or one of the user's own
 * plants (which may also carry their own notes).
 */
export interface Plant {
  id: string;
  common: string;
  botanical?: string;
  /** Its growth form (the first of `forms`, for its color and symbol). */
  form?: string;
  /** Every form it takes, primary first (redbud: tree and shrub). */
  forms?: string[];
  habit?: string;
  /** USDA hardiness zones it's rated for. */
  zone_min?: number;
  zone_max?: number;
  dog?: string;
  native?: string;
  water?: string;
  sun_most?: SunLevel;
  sun_least?: SunLevel;
  height?: { min?: number; max?: number; med?: number };
  width?: { min?: number; max?: number; med?: number };
  bloom?: { start?: number; end?: number; color?: string };
  nectar?: string;
  bird?: string;
  deer?: string;
  maintenance?: string;
  self_seed?: string;
  host?: string;
  edible?: boolean;
  fall_color?: boolean;
  winter_interest?: boolean;
  clay_ok?: boolean;
  wet_feet?: boolean;
  dry_shade?: boolean;
  taproot?: boolean;
  /** Widely invasive in the US: kept so existing ones can be mapped (and removed), never suggested. */
  invasive?: boolean;
  /** A shorter name for small circles on the plan ("'Haas' Halo' hydrangea"). */
  short?: string;
  /** A cultivar's species (catalog id). */
  parent?: string;
  /** Mature trunk diameter, feet (trees). */
  trunk?: number;
  /** Summers it handles: humid, needs dry, or either. */
  humidity?: 'humid' | 'dry' | 'either';
  /** Toxicity: ASPCA listings for animals; UC ANR class for people. */
  tox?: { dog?: ToxAnimal; cat?: ToxAnimal; horse?: ToxAnimal; people?: 'major' | 'minor' | 'oxalates' | 'dermatitis' | 'unlisted' };
  /** Thorns, spines or prickles. */
  thorns?: boolean;
  /** Catalog plants: where each value came from (see src/catalog.ts). */
  prov?: Record<string, Provenance>;
  /** What other sources say where they differ from the value shown (its sources are in `prov[key].alt`). */
  reported?: Partial<Record<string, unknown>>;
  /** Catalog plants the audit hasn't re-derived from sources yet. */
  unverified?: boolean;
  /** Catalog plants the audit has reached, with some details still from the older, unsourced list. */
  partlyChecked?: boolean;
  /** Color it's drawn in (My plants; catalog plants are colored by form). */
  color?: string;
  /** The user's own notes (My plants only; the catalog holds no notes). */
  notes?: string;
  [key: string]: unknown;
}
export type ToxAnimal = 'nontoxic' | 'toxic' | 'unlisted';
export interface PlantMeta {
  title?: string;
  version?: string;
  count?: number;
  enums?: Record<string, string[]>;
  /** The catalog's sources, by id (for saying where a value came from). */
  sources?: Record<string, { title: string; trust?: string }>;
}
type SunLevel = 'Full' | 'Part' | 'Shade';

// ============================================================
// PLANT CATALOG DATA (plants.json)
// ============================================================
export let PLANTS: Plant[] = [];
export let PLANT_META: PlantMeta | null = null;
export const plantsById: Record<string, Plant> = {};
// Picker filter state lives outside `state` so it isn't saved with projects.
export const PLANT_FILTER_DEFAULTS = {
  q: '', form: '', water: '', bloomMonth: '', sun: '',
  native: '', deer: '', nectar: '', bird: '', maintenance: '',
  /** How it spreads (src/spread.ts): '' any; 'stays' stays put; 'seed' self-sows freely; 'runs' spreads underground or by runners; 'aggressive' aggressively so. */
  spread: '',
  /** Mature height (typical), "lo-hi" in feet, either end empty when open: src/ui/height-range.ts. */
  height: '',
  dogSafeOnly: false, dryShade: false, wetFeet: false, clayOk: false,
  hostOnly: false, fallColor: false, winterInterest: false,
  edible: false, noTaproot: false, inPlan: false,
  /** Rated for the plan's zone (when the plan has a location). */
  hardyHere: false,
  /** Let what other sources say count where it differs from the value shown (a match only by it is flagged). */
  withReported: true,
  advanced: false      // UI: is the "More filters" section expanded
};
export type PlantFilter = typeof PLANT_FILTER_DEFAULTS;
export const plantFilter: PlantFilter = { ...PLANT_FILTER_DEFAULTS };
// Sun tolerance is stored as a range: sun_most = most sun tolerated,
// sun_least = least. A plant suits a level if the level falls in that span.
export const SUN_RANK: Record<SunLevel, number> = { Full: 0, Part: 1, Shade: 2 };
export function plantTakesSun(p: Plant, level: string): boolean {
  if (!level) return true;
  const want = SUN_RANK[level as SunLevel];
  const most = p.sun_most ? SUN_RANK[p.sun_most] : null, least = p.sun_least ? SUN_RANK[p.sun_least] : null;
  if (most == null || least == null) return false;
  return most <= want && want <= least;
}

/** Load the plant index (served next to index.html). */
export function loadPlants(): Promise<void> {
  return fetch('plants.json')
  .then((r) => r.json())
  .then((d: unknown) => {
    // Version 2 (sourced facts) is resolved into plants; the old flat list still loads.
    if (isCatalogV2(d)) {
      PLANTS = resolveCatalog(d);
      PLANT_META = { title: d.meta.title, version: d.meta.updated, count: d.plants.length, enums: d.meta.enums, sources: d.meta.sources };
    } else {
      const old = d as { plants?: Plant[]; meta?: PlantMeta };
      // (Its forms by today's names: src/catalog.ts, LEGACY_FORMS.)
      PLANTS = (old.plants || []).map((p) => (p.form ? { ...p, form: currentForm(p.form) } : p));
      PLANT_META = old.meta || null;
    }
    for (const p of PLANTS) plantsById[p.id] = p;
    if (state.panel === 'plants') render(); // refresh picker if already open
    else redrawCanvas(); // sun-check badges need plant data (canvas only: keyboard safe)
  })
  .catch((err) => console.error('plants.json load failed', err));
}
// ============================================================
// PLANT PICKER
// ============================================================
/** Whether a plant passes the picker's filters. `inPlan`: ids of plants placed in the open plan. */
export function plantMatches(p: Plant, f: PlantFilter, inPlan?: Set<string>): boolean {
  // Invasives are never suggested; they turn up when searched by name (to map one already in the yard).
  if (p.invasive && !readQuery(f.q) && !f.inPlan) return false;
  if (f.dogSafeOnly && !nonToxicToDogs(p)) return false;
  // (Plants at the edge of their range count: the list marks them. So does a plant rated for cooler zones that's
  // recorded growing wild in the garden's county or one bordering it: it has been found living through those
  // summers. Not one rated for warmer zones: a record of an escaped garden annual says nothing about winters.)
  if (f.hardyHere && state.location) {
    const fit = zoneFit(p, state.location);
    if (!hardyEnough(fit) && !(fit === 'warm' && wildNearby(p))) return false;
  }
  if (f.form && !formsOf(p).includes(f.form)) return false;
  if (f.water && p.water !== f.water) return false;
  if (f.sun && !plantTakesSun(p, f.sun)) return false;
  // ("@here": native to the garden's state, by Kew's checklist; until its state is known, no filter.)
  if (f.native === '@here') { if (gardenStateName()) { const n = nativeHere(p); if (!n || n.status === 'I') return false; } }
  else if (f.native && p.native !== f.native) return false;
  if (f.deer && p.deer !== f.deer) return false;
  if (f.maintenance && p.maintenance !== f.maintenance) return false;
  if (f.spread && !spreadsAs(p, f.spread)) return false;
  if (f.nectar) {
    // 'High' = high only; 'Med' = med or better
    if (f.nectar === 'High' && p.nectar !== 'High') return false;
    if (f.nectar === 'Med' && !(p.nectar === 'High' || p.nectar === 'Med')) return false;
  }
  if (f.bird) {
    if (f.bird === 'High' && p.bird !== 'High') return false;
    if (f.bird === 'Med' && !(p.bird === 'High' || p.bird === 'Med')) return false;
  }
  if (f.height) {
    // (By its typical mature height: a plant of 2 to 4 ft is a 3 ft plant.)
    const h = p.height && p.height.med, [lo, hi] = f.height.split('-');
    if (h == null || (lo && h < Number(lo)) || (hi && h > Number(hi))) return false;
  }
  if (f.dryShade && !p.dry_shade) return false;
  if (f.wetFeet && !p.wet_feet) return false;
  if (f.clayOk && !p.clay_ok) return false;
  if (f.hostOnly && !p.host) return false;
  if (f.fallColor && !p.fall_color) return false;
  if (f.winterInterest && !p.winter_interest) return false;
  if (f.edible && !p.edible) return false;
  if (f.noTaproot && p.taproot) return false;
  if (f.inPlan && !inPlan?.has(p.id)) return false;
  // (Where the garden is, from flowering records there, else the catalog's months; a Dec–Feb bloom wraps.)
  if (f.bloomMonth && !bloomMonths(p).includes(Number(f.bloomMonth))) return false;
  const q = readQuery(f.q);
  if (q && !matchPlant(p, q, true)) return false;
  return true;
}
/** The older list's dog rating, when it's a warning (anything but "Safe" or "Unverified"). */
export function oldDogWarning(p: Plant): string | null {
  return p.dog && p.dog !== 'Safe' && p.dog !== 'Unverified' ? p.dog : null;
}
/**
 * Non-toxic to dogs: listed non-toxic by the ASPCA (not merely unlisted:
 * unlisted isn't safe); until a plant has been checked against the ASPCA,
 * the older list's "Safe". Any warning from the older list still holds
 * until the audit removes it, so the two can only agree to call a plant safe.
 */
export function nonToxicToDogs(p: Plant): boolean {
  if (oldDogWarning(p)) return false;
  return p.tox?.dog ? p.tox.dog === 'nontoxic' : p.dog === 'Safe';
}
/** Why a plant matched a search: by its name, its botanical name, or what it hosts. */
export type MatchedBy = 'name' | 'botanical' | 'host';
/**
 * How well a plant matches a search, best first (see search.ts): 0 every word starts a word of its name; 1 its
 * name has every word; 2 its name and botanical name together do; 3 only what it hosts ("monarch" finds milkweed);
 * 4 or 5 a word is spelled a little differently (from its name, its botanical name); -1 no match. No search: 0.
 */
export function searchRank(p: Plant, query: string): number {
  const q = readQuery(query);
  return q ? matchPlant(p, q, true)?.rank ?? -1 : 0;
}
export function matchedBy(p: Plant, query: string): MatchedBy | null {
  const r = searchRank(p, query);
  return r < 0 ? null : r === 2 || r === 5 ? 'botanical' : r === 3 ? 'host' : 'name';
}
/** Plants placed in the open plan (not counting ones marked gone). */
export function plantIdsInPlan(): Set<string> {
  return new Set(state.shapes.filter((s) => s.status !== 'gone').map((s) => s.plantId).filter((id): id is string => !!id));
}
/**
 * The filters another source's value (a fact's `alt`) can count for, the
 * facts each reads, and what the flag calls them. Safety and status facts
 * (toxicity, invasive, native) have none: the catalog takes them from
 * authorities only.
 */
const FILTER_FACTS: [keyof PlantFilter, string[], string][] = [
  ['sun', ['sun_most', 'sun_least'], 'sun'], ['hardyHere', ['zone_min', 'zone_max'], 'hardiness zones'], ['water', ['water'], 'water'],
  ['deer', ['deer'], 'deer resistance'], ['height', ['height'], 'height'], ['bloomMonth', ['bloom'], 'bloom time'], ['form', ['form'], 'form'],
];
/** The plant as the other sources describe these facts (each pair as a whole: one source's sun range, not half of one). */
function asReported(p: Plant, facts: string[]): Plant {
  const r = p.reported ?? {};
  const q: Plant = { ...p };
  for (const k of facts) if (k in r) (q as unknown as Record<string, unknown>)[k] = r[k];
  if ('form' in r && facts.includes('form')) { const fs = [r.form].flat() as string[]; q.form = fs[0]; q.forms = fs; }
  return q;
}
/**
 * Whether a plant matches, and if only by what other sources say (a fact's
 * `alt`, where sources disagree): null (no match), [] (a match on the
 * values shown), or the filters the match rests on ("sun", "hardiness
 * zones"). Each filter is judged on its own: it passes on the value shown,
 * or failing that on the other one; every other filter must pass on the
 * values shown.
 */
export function reportedMatch(p: Plant, f: PlantFilter, inPlan?: Set<string>): string[] | null {
  if (plantMatches(p, f, inPlan)) return [];
  if (!f.withReported || !p.reported) return null;
  const reportable = Object.fromEntries(FILTER_FACTS.map(([k]) => [k, PLANT_FILTER_DEFAULTS[k]]));
  if (!plantMatches(p, { ...f, ...reportable }, inPlan)) return null; // (the rest must pass as published)
  const needed: string[] = [];
  for (const [k, facts, label] of FILTER_FACTS) {
    if (f[k] === PLANT_FILTER_DEFAULTS[k]) continue;
    const only = { ...PLANT_FILTER_DEFAULTS, [k]: f[k], q: '', inPlan: false };
    if (plantMatches(p, only)) continue;
    if (!facts.some((x) => x in p.reported!) || !plantMatches(asReported(p, facts), only)) return null;
    needed.push(label);
  }
  return needed.length ? needed : null;
}
/** Plants in the last list that match only by what other sources say, and on what. */
export const reportedOnly = new Map<string, string[]>();
/**
 * The catalog plants the picker lists: searched, then filtered. `near`: whether near spellings count, decided over
 * everything searched before any filter (search.ts: closeMatchIn). Best matches first, then alphabetical.
 */
export function filteredPlants(near = true): Plant[] {
  const inPlan = plantIdsInPlan();
  reportedOnly.clear();
  const q = readQuery(plantFilter.q);
  // (The search first, so the filters, and any near spellings, are worked out only for plants it found.)
  const found = q ? PLANTS.flatMap((plant) => { const hit = matchPlant(plant, q, near); return hit ? [{ plant, hit }] : []; })
    : PLANTS.map((plant) => ({ plant, hit: { rank: 0, order: 0 } }));
  const out = found.filter(({ plant }) => {
    const m = reportedMatch(plant, plantFilter, inPlan);
    if (m?.length) reportedOnly.set(plant.id, m);
    return m !== null;
  });
  if (q) out.sort(byMatch);
  else out.sort((a, b) => a.plant.common.localeCompare(b.plant.common));
  return out.map((x) => x.plant);
}
// Canvas color by growth form, drawn from the existing swatch palette
export const FORM_COLORS: Record<string, string> = {
  'Tree': '#78350f', 'Shrub': '#16a34a',
  'Perennial': '#a855f7', 'Grass/Sedge': '#f59e0b', 'Vine': '#14b8a6',
  'Bulb': '#ec4899', 'Fern': '#65a30d', 'Annual': '#fbbf24',
  // Water plants: deep green, not blue, since they sit in or beside a pond.
  'Aquatic/Emergent': '#047857', 'Cactus': '#84cc16'
};
/**
 * Status and phase a newly placed plant starts with: Planned, unless the plan
 * is filtered to a status or phase, in which case it joins what's in view
 * (so it doesn't vanish from the filtered view the moment it's placed).
 */
export function newPlantStatus(): Pick<CircleShape, 'status' | 'phase'> {
  const f = state.viewFilter;
  return {
    status: f.status && f.status !== 'gone' ? f.status : 'planned',
    ...(f.phase ? { phase: f.phase } : {}),
  };
}
/** Every form a plant takes, primary first. */
export const formsOf = (p: Pick<Plant, 'form' | 'forms'>): string[] => p.forms?.length ? p.forms : p.form ? [p.form] : [];
/** The color a plant is drawn in: its own (My plants), else by form, else green. */
export function plantColor(p: Plant | undefined): string {
  return p?.color || (p?.form && FORM_COLORS[p.form]) || '#16a34a';
}
/**
 * Every color a plant may be drawn in on a plan: its color now, and for a tree with no color of its own, the
 * understory gray it took before trees were one form (2026-10), which plans may still show.
 */
export function plantColors(p: Plant | undefined): string[] {
  return [plantColor(p), ...(p && !p.color && p.form === 'Tree' ? ['#57534e'] : [])];
}
/** A new placed plant centered on `at` (feet, snapped), sized and colored from its data. */
export function plantShapeAt(p: Plant, at: Point): CircleShape {
  return {
    id: uid(), type: 'circle',
    x: snap(at.x), y: snap(at.y),
    radius: plantRadius(p, state.sizeMode),
    sizeFrom: 'plant',
    color: plantColor(p),
    label: p.common,
    opacity: 0.65, locked: false,
    role: 'plant',
    plantId: p.id, // permanent link back to the plant index row
    ...newPlantStatus(),
  };
}
/**
 * Make an existing circle (say, a labeled circle standing in for a plant) a
 * placed plant: it takes the plant's name, data link and size; its center stays.
 */
export function linkShapeToPlant(shapeId: string, p: Plant) {
  linkShapesToPlant([shapeId], p);
}
/**
 * Make circles this plant (its name and role), as one step to undo. Returns how many were linked. A tree
 * keeps the size it was drawn at, as an existing tree does (its full size shows as the dashed ring); other
 * plants take the plant's size.
 */
export function linkShapesToPlant(shapeIds: string[], p: Plant): number {
  const ids = new Set(shapeIds);
  const circles = state.shapes.filter((sh) => ids.has(sh.id) && sh.type === 'circle' && canLinkToPlant(sh));
  if (!circles.length) return 0;
  const asTree = !!formsOf(p)[0]?.startsWith('Tree');
  flushHistoryDebounce();
  for (const s of circles) {
    if (s.type !== 'circle') continue;
    // (Sized from the plant it was linked to before: that size says nothing about this one as it stands.)
    const dataSized = isDataSized(s);
    s.plantId = p.id;
    s.label = p.common;
    s.role = 'plant';
    if (asTree) {
      // A tree as it stands: the size it was drawn at (the dashed ring shows its full size).
      if (dataSized && !s.canopy) setRadius(s, plantRadius(p, state.sizeMode));
      s.tree = true;
      s.sizeFrom = 'manual';
    } else if (!s.canopy) {
      // Not a tree (a mislinked tree put right, too): the plant's size, and no trunk.
      s.tree = undefined;
      s.trunk = undefined;
      setRadius(s, plantRadius(p, state.sizeMode));
      s.sizeFrom = 'plant';
    }
  }
  pushHistory();
  save();
  return circles.length;
}
/**
 * The picker was opened to link circles (one, or several selected): link them to this plant and select
 * them. Linking one, the other unlinked circles that had its label are offered next (state.linkOffer).
 */
export function linkFromPicker(p: Plant) {
  if (!state.pickerLinkId) return;
  // (Checked again now: shapes deleted or locked since the picker opened are left out; a lone circle is
  // linked as before, locked or not, since it was chosen on its own.)
  const several = state.pickerLinkAlso.length > 0, withLocked = state.pickerLinkLocked;
  const ids = [state.pickerLinkId, ...state.pickerLinkAlso].filter((id) => {
    const s = state.shapes.find((x) => x.id === id);
    return !!s && canLinkToPlant(s) && (!several || withLocked || !isLocked(s));
  });
  state.pickerLinkId = null;
  state.pickerLinkAlso = [];
  state.pickerLinkLocked = false;
  if (!ids.length) { state.selectedIds = []; state.linkOffer = null; return; }
  // (Its label before it takes the plant's name.)
  const label = state.shapes.find((s) => s.id === ids[0])?.label;
  const n = linkShapesToPlant(ids, p);
  state.selectedIds = ids;
  if (several) { state.linkOffer = null; toast(`${n} circle${n === 1 ? '' : 's'} linked to ${p.common}.`); return; }
  const same = unlinkedWithLabel(label, ids), locked = unlinkedWithLabel(label, ids, { locked: true });
  state.linkOffer = same.length || locked.length ? { fromId: ids[0], plantId: p.id, label: label!.trim(), ids: same, locked } : null;
}
/** Whether a shape could stand for a plant (a circle that isn't a pond, a trunk or another non-plant). */
export function canLinkToPlant(s: Shape): boolean {
  return s.type === 'circle' && (!s.role || s.role === 'plant' || s.role === 'other');
}
export const sameLabel = (a?: string, b?: string) => !!a?.trim() && !!b?.trim() && a.trim().toLowerCase() === b.trim().toLowerCase();
/**
 * The other circles labeled like this one that aren't linked to a plant yet (a plan from before the
 * catalog), among those on view: never a hidden layer, a filtered-out or gone plant. The unlocked ones,
 * or (`locked`) only the locked ones, which are offered separately.
 */
export function unlinkedWithLabel(label: string | undefined, exceptIds: string[], { locked = false } = {}): string[] {
  if (!label?.trim()) return [];
  const except = new Set(exceptIds);
  return state.shapes.filter((s) => !except.has(s.id) && s.type === 'circle' && !s.plantId && canLinkToPlant(s)
    && shownWith(s, state.viewFilter) && isLocked(s) === locked && sameLabel(s.label, label)).map((s) => s.id);
}
export const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** After a plant's zones: whether they suit the plan's location (if it has one). */
export function zoneNote(p: Plant): string {
  const fit = zoneFit(p, state.location);
  if (!fit || fit === 'fits' || !state.location) return '';
  const z = state.location.zone;
  const wild = fit === 'warm' ? wildHere(p) : null;
  const near = wild && wild.where !== 'state' ? `, though ${wild.species ? 'its species is' : 'it\'s'} recorded wild nearby` : '';
  return fit === 'cold' ? ` (zone ${z} winters are too cold)`
    : fit === 'warm' ? ` (zone ${z} may be too warm${near})`
    : fit === 'edge-cold' ? ` (at its cold edge in zone ${z})`
    : ` (at its warm edge in zone ${z})`;
}
export function plantMetaLine(p: Plant): string {
  const bits: string[] = [];
  if (p.form) bits.push(formsOf(p).join(' / '));
  const spread = p.width && p.width.med;
  const ht = p.height && p.height.med;
  if (ht || spread) bits.push((ht ? ht + "'" : '?') + ' x ' + (spread ? spread + "'" : '?'));
  const span = bloomSpan(p);
  if (span) {
    bits.push('blooms ' + MONTH_NAMES[span.start] + (span.end !== span.start ? '-' + MONTH_NAMES[span.end] : ''));
  }
  if (p.invasive) bits.push('INVASIVE: not for planting');
  if (p.tox?.dog === 'toxic') bits.push('toxic to dogs (ASPCA)');
  const oldDog = oldDogWarning(p);
  if (oldDog) bits.push('dog: ' + oldDog);
  else if (!p.tox?.dog && p.dog === 'Unverified') bits.push('dog: Unverified');
  if (p.sun_most) bits.push(p.sun_most === p.sun_least ? p.sun_most + ' sun' : p.sun_most + '-' + p.sun_least);
  const zones = zoneRange(p);
  if (zones) bits.push(zones + zoneNote(p));
  const tags: string[] = [];
  if (p.dry_shade) tags.push('dry shade');
  if (p.wet_feet) tags.push('wet ok');
  if (p.nectar === 'High') tags.push('high nectar');
  if (p.host) tags.push('host plant');
  if (tags.length) bits.push(tags.join(', '));
  return bits.join(' \u00b7 ');
}
