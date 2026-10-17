import { redrawCanvas } from './canvas';
import { flushHistoryDebounce, pushHistory } from './history';
import { state } from './state';
import { save } from './storage';
import { render } from './ui/render';
import type { CircleShape, Point } from './types';
import { snap, uid } from './util';
import { plantRadius } from './my-plants';
import { isCatalogV2, resolveCatalog, type Provenance } from './catalog';
import { setRadius } from './geometry';
import { zoneFit, zoneRange } from './climate';

/**
 * One plant: a row of the catalog (plants.json), or one of the user's own
 * plants (which may also carry their own notes).
 */
export interface Plant {
  id: string;
  common: string;
  botanical?: string;
  form?: string;
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
  /** Catalog plants the audit hasn't re-derived from sources yet. */
  unverified?: boolean;
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
  selfSeed: '', maxHeight: '',
  dogSafeOnly: false, dryShade: false, wetFeet: false, clayOk: false,
  hostOnly: false, fallColor: false, winterInterest: false,
  edible: false, noTaproot: false, inPlan: false,
  /** Rated for the plan's zone (when the plan has a location). */
  hardyHere: false,
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
      PLANT_META = { title: d.meta.title, version: d.meta.updated, count: d.plants.length, enums: d.meta.enums };
    } else {
      const old = d as { plants?: Plant[]; meta?: PlantMeta };
      PLANTS = old.plants || [];
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
  if (p.invasive && !f.q.trim() && !f.inPlan) return false;
  if (f.dogSafeOnly && !nonToxicToDogs(p)) return false;
  if (f.hardyHere && state.location && zoneFit(p, state.location) !== 'fits') return false;
  if (f.form && p.form !== f.form) return false;
  if (f.water && p.water !== f.water) return false;
  if (f.sun && !plantTakesSun(p, f.sun)) return false;
  if (f.native && p.native !== f.native) return false;
  if (f.deer && p.deer !== f.deer) return false;
  if (f.maintenance && p.maintenance !== f.maintenance) return false;
  if (f.selfSeed && p.self_seed !== f.selfSeed) return false;
  if (f.nectar) {
    // 'High' = high only; 'Med' = med or better
    if (f.nectar === 'High' && p.nectar !== 'High') return false;
    if (f.nectar === 'Med' && !(p.nectar === 'High' || p.nectar === 'Med')) return false;
  }
  if (f.bird) {
    if (f.bird === 'High' && p.bird !== 'High') return false;
    if (f.bird === 'Med' && !(p.bird === 'High' || p.bird === 'Med')) return false;
  }
  if (f.maxHeight) {
    const h = p.height && p.height.med;
    if (h == null || h > Number(f.maxHeight)) return false;
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
  if (f.bloomMonth) {
    const m = Number(f.bloomMonth);
    if (!p.bloom || p.bloom.start == null || p.bloom.end == null) return false;
    if (!(p.bloom.start <= m && m <= p.bloom.end)) return false;
  }
  if (f.q.trim() && searchRank(p, f.q) < 0) return false;
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
 * How well a plant matches a search, best first: 0 its name starts with it
 * (or a word in its name does), 1 its name contains it, 2 its botanical name,
 * 3 only what it hosts ("monarch" finds milkweed); -1 no match.
 */
export function searchRank(p: Plant, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const name = p.common.toLowerCase();
  if (name.startsWith(q) || name.split(/[\s'‘’(-]+/).some((w) => w.startsWith(q))) return 0;
  if (name.includes(q)) return 1;
  if ((p.botanical || '').toLowerCase().includes(q)) return 2;
  if ((p.host || '').toLowerCase().includes(q)) return 3;
  return -1;
}
export function matchedBy(p: Plant, query: string): MatchedBy | null {
  const r = searchRank(p, query);
  return r < 0 ? null : r <= 1 ? 'name' : r === 2 ? 'botanical' : 'host';
}
/** Plants placed in the open plan (not counting ones marked gone). */
export function plantIdsInPlan(): Set<string> {
  return new Set(state.shapes.filter((s) => s.status !== 'gone').map((s) => s.plantId).filter((id): id is string => !!id));
}
export function filteredPlants(): Plant[] {
  const inPlan = plantIdsInPlan();
  const out = PLANTS.filter(p => plantMatches(p, plantFilter, inPlan));
  // Name matches first, then botanical, then host plants; alphabetical within each.
  const q = plantFilter.q;
  const rank = new Map(out.map((p) => [p.id, searchRank(p, q)]));
  out.sort((a, b) => rank.get(a.id)! - rank.get(b.id)! || a.common.localeCompare(b.common));
  return out;
}
// Canvas color by growth form, drawn from the existing swatch palette
export const FORM_COLORS: Record<string, string> = {
  'Tree (canopy)': '#78350f', 'Tree (understory)': '#57534e', 'Shrub': '#16a34a',
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
/** The color a plant is drawn in: its own (My plants), else by form, else green. */
export function plantColor(p: Plant | undefined): string {
  return p?.color || (p?.form && FORM_COLORS[p.form]) || '#16a34a';
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
  const s = state.shapes.find((sh) => sh.id === shapeId);
  if (!s || s.type !== 'circle') return;
  flushHistoryDebounce();
  s.plantId = p.id;
  s.label = p.common;
  s.role = 'plant';
  // A tree already in the yard keeps the size it was drawn at; other circles take the plant's size.
  if (!(s.tree && s.sizeFrom === 'manual')) {
    setRadius(s, plantRadius(p, state.sizeMode));
    s.sizeFrom = 'plant';
  }
  pushHistory();
  save();
}
export const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** After a plant's zones: whether they suit the plan's location (if it has one). */
export function zoneNote(p: Plant): string {
  const fit = zoneFit(p, state.location);
  if (!fit || fit === 'fits' || !state.location) return '';
  return fit === 'cold' ? ` (zone ${state.location.zone} winters are too cold)` : ` (zone ${state.location.zone} may be too warm)`;
}
export function plantMetaLine(p: Plant): string {
  const bits: string[] = [];
  if (p.form) bits.push(p.form);
  const spread = p.width && p.width.med;
  const ht = p.height && p.height.med;
  if (ht || spread) bits.push((ht ? ht + "'" : '?') + ' x ' + (spread ? spread + "'" : '?'));
  if (p.bloom && p.bloom.start) {
    bits.push('blooms ' + MONTH_NAMES[p.bloom.start] + (p.bloom.end && p.bloom.end !== p.bloom.start ? '-' + MONTH_NAMES[p.bloom.end] : ''));
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
