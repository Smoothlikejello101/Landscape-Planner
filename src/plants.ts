import { recordError } from './error-log';
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
import { spreadsOnlyAs } from './spread';
import { setRadius } from './geometry';
import { isLocked } from './roles';
import { shownWith } from './status';
import { hardyEnough, zoneFit, zoneRange } from './climate';
import { gardenStateName, hostsHere, localBloom, nativeHere, nativeText, wildHere, wildNearby } from './wild';
import { bloomMonths } from './bloom';
import { byMatch, matchPlant, readQuery } from './search';

/**
 * One plant: a row of the catalog (plants.json), or one of the user's own
 * plants (which may also carry their own notes).
 */
/** A hybrid's parent species and how it's rated for people: `poison` a rating, null none listed, absent not rated. */
export interface PoisonParent { name: string; id?: string; common?: string; poison?: { severity?: 'low' | 'medium' | 'high'; parts?: string[]; skin?: true } | null }
/** A hybrid with no rating of its own, one of whose parents is rated poisonous to people. */
export const parentRated = (p: Pick<Plant, 'poison' | 'poison_parents'>): boolean => !p.poison && !!p.poison_parents?.parents.some((x) => x.poison);

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
  /**
   * The earlier list's dog warning given for another record of the same species (a cultivar, a strain): shown, and
   * filtered on, here too, since a cultivar keeps its species' chemistry (src: shareDogWarnings).
   */
  dogVia?: { id: string; common: string; dog: string };
  native?: string;
  water?: string;
  sun_most?: SunLevel;
  sun_least?: SunLevel;
  height?: { min?: number; max?: number; med?: number };
  width?: { min?: number; max?: number; med?: number };
  /** The earlier list's bloom months and color (a plant of mine: its own). */
  bloom?: { start?: number; end?: number; color?: string };
  /** When it blooms, as its sources say: seasons ("spring"), or USDA's "mid spring" (src/catalog.ts BLOOM_SEASONS). */
  bloom_season?: string[];
  /** Its flowers' colors (src/catalog.ts FLOWER_COLORS); `insignificant`: not showy. */
  flower_color?: string[];
  nectar?: string;
  bird?: string;
  deer?: string;
  maintenance?: string;
  self_seed?: string;
  /** The earlier list's caterpillar-host sentence (unverified). */
  host?: string;
  /** Caterpillars its sources name it a larval host for ("Monarch (Danaus plexippus)"). */
  hosts?: string[];
  /** Its genus, and how many native caterpillar species are recorded feeding on it (Shropshire & Tallamy). */
  host_genus?: { genus: string; species: number };
  edible?: boolean;
  fall_color?: boolean;
  /** Its fall leaf colors (src/catalog.ts FALL_COLORS). */
  fall_colors?: string[];
  /**
   * Its leaf colors (src/catalog.ts LEAF_COLORS), as its source lists them: NC State's take in the seasons and the
   * undersides (red maple: green, gold, orange), so a color here isn't necessarily the summer color.
   */
  leaf_color?: string[];
  /** Whether its leaves stay through winter (for an herb, deciduous is dying back; a grass goes dormant). */
  foliage?: 'evergreen' | 'semi-evergreen' | 'deciduous';
  /** Needled leaves (pines, junipers, arborvitae). */
  needles?: boolean;
  growth_rate?: 'slow' | 'medium' | 'fast';
  /** Who it attracts, as NC State lists them ("bees", "hummingbirds"): never a level (src/catalog.ts ATTRACTS). */
  attracts?: string[];
  /** What it tolerates, as NC State lists it ("drought", "rabbits", "black walnut"): src/catalog.ts TOLERATES. */
  tolerates?: string[];
  /** Animals NC State lists it as a problem for ("dogs", "cats", "horses"): a warning; one not listed isn't safe. */
  problem_for?: string[];
  /** Upkeep, as NC State rates it (the earlier list's `maintenance` is tasks, another scale). */
  maintenance_level?: 'low' | 'medium' | 'high';
  winter_interest?: boolean;
  /** Its bark as NC State lists it ("exfoliating", "furrowed") and the bark's colors ("red/burgundy"): src/catalog.ts BARK. */
  bark?: string[];
  bark_color?: string[];
  /** Its stems' colors, its fruit's, and when the fruit is there to see ("fall", "winter"), as NC State lists them. */
  stem_color?: string[];
  fruit_color?: string[];
  fruit_season?: string[];
  clay_ok?: boolean;
  wet_feet?: boolean;
  dry_shade?: boolean;
  taproot?: boolean;
  /** A tree that keeps its branches to the ground (an evergreen screen): nothing grows under it. */
  low_branched?: boolean;
  /** Widely invasive in the US: kept so existing ones can be mapped (and removed), never suggested. */
  invasive?: boolean;
  /** A shorter name for small circles on the plan ("'Haas' Halo' hydrangea"). */
  short?: string;
  /** Other names it goes by (its sources' other common names, or a name it had before: searched too). */
  synonyms?: string[];
  /**
   * My plants only: the catalog plant this one was switched to (src/my-plants.ts, switchToCatalog). Its id then
   * stands for that plant everywhere, in every plan; this record keeps the person's notes and color.
   */
  sameAs?: string;
  /** My plants only: a catalog plant the person said this isn't ("Keep mine"), so it isn't offered again. */
  notSame?: string;
  /**
   * My plants only: the catalog plant whose species this is ("Same species as", src/ui/plant-form.ts). What holds
   * for the whole species comes from it, as a catalog cultivar's does (src/my-plants.ts, withSpecies).
   */
  species?: string;
  /** A cultivar's species (catalog id). */
  parent?: string;
  /** Mature trunk diameter, feet (trees). */
  trunk?: number;
  /** Summers it handles: humid, needs dry, or either. */
  humidity?: 'humid' | 'dry' | 'either';
  /** Toxicity: ASPCA listings for animals; UC ANR class for people. */
  tox?: { dog?: ToxAnimal; cat?: ToxAnimal; horse?: ToxAnimal; people?: 'major' | 'minor' | 'oxalates' | 'dermatitis' | 'unlisted' };
  /** Poisonous to people, as its source (NC State) says: how severe, which parts, whether it irritates skin. */
  poison?: { severity?: 'low' | 'medium' | 'high'; parts?: string[]; skin?: true };
  /**
   * A hybrid no source rates for people: its parent species and how each is rated (written only where one is), by its
   * name ("Morus alba x rubra") or Kew's hybrid formula (scripts/catalog/hybrids.mjs).
   */
  poison_parents?: { via: 'name' | 'kew'; parents: PoisonParent[] };
  /** Thorns, spines or prickles. */
  thorns?: boolean;
  /** What its flowers look like, by part, as NC State's fields give them (src/catalog.ts FLOWER_FORM): sizes in inches. */
  flower_form?: { inflorescence?: string[]; shape?: string[]; petals?: string[]; size?: string[] };
  /** What its leaves look like, by part (src/catalog.ts LEAF_FORM): lengths in inches. */
  leaf_form?: { type?: string[]; shape?: string[]; arrangement?: string[]; margin?: string[]; length?: string[] };
  /** How fine its leaves look from a distance: fine, medium, coarse. */
  texture?: string[];
  /** Its shape, as NC State's "Habit/Form" gives it: erect, rounded, weeping… */
  habit_form?: string[];
  /** How a vine climbs: twining, tendrils, clinging, scrambler (NC State). */
  climbs_by?: string[];
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
export type DogFilter = '' | 'hideToxic' | 'nonToxic';
/** Plants of mine switched to a catalog plant: their id → the catalog plant's (src/my-plants.ts keeps these). */
export const aliases: Record<string, string> = {};
/** Catalog records folded into another (the catalog's `meta.moved`): the old id → the record it stands for now. */
export const movedIds: Record<string, string> = {};
/** A catalog plant → the plant of mine switched to it (its notes and color go on with it). */
export const ownCopies: Record<string, Plant> = {};
/** Run once the catalog has loaded (plants of mine linked to a species take its facts then: src/my-plants.ts). */
const catalogHooks: (() => void)[] = [];
/**
 * Whether the catalog is in (or couldn't be had): until then a plan is drawn without what rests on plant facts. On a
 * cold start the plan draws before plants.json is read, and crowding judged without plants' heights rang plants a
 * moment, then took the rings back (Jason, Oct 29: "a flash of dismissed warning rings when I first open the app").
 */
let catalogSettled = false;
export const catalogReady = () => catalogSettled;
export function onCatalogLoaded(fn: () => void) { catalogHooks.push(fn); }
/** Each switched plant's id stands for its catalog plant, once the catalog has it (until then, for itself). */
export function applyAliases() {
  for (const [from, to] of Object.entries(aliases)) if (plantsById[to] && !to.startsWith('u-')) plantsById[from] = plantsById[to];
}
// Picker filter state lives outside `state` so it isn't saved with projects.
/** The earlier list's words for a plant native to North America (its regional and local-ecotype natives too). */
const NA_NATIVE = ['N. American native', 'Regional native', 'Local ecotype possible'];
/** A list filter's empty default: frozen, so a filter is only ever changed by a new list, never in place. */
const NONE = Object.freeze([]) as unknown as string[];
export const PLANT_FILTER_DEFAULTS = {
  q: '', form: '', water: '', sun: '',
  /** Blooming in: a month ('1' to '12') or a season ('spring', 'summer', 'fall', 'winter'): src/plants.ts bloomMatch. */
  bloomMonth: '',
  /** '' any; '@here' native to the garden's state (Kew's checklist); '@na' native to North America (the earlier list's word). */
  native: '',
  /**
   * Flower colors (a plant that comes in any of them: src/plants.ts trueToColor), leaf colors (any of them), and who it
   * attracts (any of them), in the catalog's words (src/catalog.ts). Decided with Jason, 2026-10-25.
   */
  flowerColors: NONE, leafColors: NONE, attracts: NONE,
  /** Growth rate: '' any; 'slow', 'medium' or 'fast'. */
  growth: '',
  /**
   * The ways of spreading the person is OK with (src/spread.ts spreadsOnlyAs: every way a plant spreads must be one of
   * them): 'stays' stays put; 'runs' spreads underground or by runners; 'aggressive' aggressively so; 'seed' self-sows
   * freely. Empty: any.
   */
  spread: NONE,
  /** Mature height (typical), "lo-hi" in feet, either end empty when open: src/ui/height-range.ts. */
  height: '',
  /** Toxic to dogs: '' any; 'hideToxic' leaves out plants with a warning (unrated ones stay); 'nonToxic' only plants rated non-toxic. */
  dogs: '' as DogFilter,
  /** Leaves out plants NC State lists as a problem for cats, for horses (one not listed stays: not "safe", just not flagged). */
  cats: false, horses: false,
  /** Only plants whose NC State page was read and lists no poison to people (one not rated is left out too, as the dog filter keeps only plants known safe). */
  noPoison: false,
  /**
   * Deer resistant (its rating); low maintenance (NC State's level); drought tolerant (NC State: drought or dry soil);
   * no thorns (leaves out plants listed with thorns, spines or prickles; one not listed stays).
   */
  deerResistant: false, lowMaintenance: false, drought: false, noThorns: false,
  wetFeet: false, clayOk: false,
  hostOnly: false, fallColor: false, winterInterest: false,
  /** Keeps its leaves through winter (evergreen; not semi-evergreen, which depends on the winter, nor a tender shrub, `tenderWoody`). */
  evergreen: false,
  edible: false, inPlan: false,
  /** Rated for the plan's zone (when the plan has a location). */
  hardyHere: false,
  /** Let what other sources say count where it differs from the value shown (a match only by it is flagged). */
  withReported: true,
};
export type PlantFilter = typeof PLANT_FILTER_DEFAULTS;
export const plantFilter: PlantFilter = { ...PLANT_FILTER_DEFAULTS };
/** Whether a filter is on (set to something other than its default; a list filter, with anything in it). */
export function filterOn(f: PlantFilter, k: keyof PlantFilter): boolean {
  const v = f[k];
  return Array.isArray(v) ? v.length > 0 : v !== PLANT_FILTER_DEFAULTS[k];
}
// ---------- Flower colors ----------
/** A plant's flower colors, the showy ones ("insignificant": not showy). */
export const showyColors = (p: Plant): string[] => (p.flower_color ?? []).filter((c) => c !== 'insignificant');
/**
 * Whether its flower color says what you'll get (decided with Jason, 2026-10-25): a cultivar's record, or a species
 * listing one color (white and cream count as one). A species listing several comes in them, depending on the plant
 * you buy: the picker lists those below a divider.
 */
export function trueToColor(p: Plant): boolean {
  // (A cultivar: its record names its species, or its name is in quotes, "Coneflower 'Magnus'"; not a possessive, "Bush's".)
  if (p.parent || [p.botanical, p.common].some((n) => /['\u2018][A-Z][^'\u2018\u2019]*['\u2019]/.test(n ?? ''))) return true;
  const c = showyColors(p);
  return c.filter((x) => !(x === 'cream' && c.includes('white'))).length <= 1;
}
// ---------- Blooming in ----------
const SEASON_MONTHS: Record<string, number[]> = { spring: [3, 4, 5], summer: [6, 7, 8], fall: [9, 10, 11], winter: [12, 1, 2] };
export const SEASONS = ['spring', 'summer', 'fall', 'winter'];
/**
 * The months a season word covers ("summer": June to August; "mid summer": July). Our reading, not a source's (the
 * months a season covers shift with place): where it decides a month's match, the row says "by season".
 */
export function seasonMonths(word: string): number[] {
  const [part, season] = word.includes(' ') ? word.split(' ') : ['', word];
  const m = SEASON_MONTHS[season];
  if (!m) return [];
  return part === 'early' ? [m[0]] : part === 'mid' ? [m[1]] : part === 'late' ? [m[2]] : m;
}
/**
 * How a plant meets "Blooming in" (`v`: a month, '1' to '12', or a season): by its months where the garden is
 * (flowering records there: they decide), by its sources' season, or by the earlier list's months; null: it doesn't.
 */
export function bloomMatch(p: Plant, v: string): 'local' | 'season' | 'earlier' | null {
  const want = /^\d+$/.test(v) ? [Number(v)] : SEASON_MONTHS[v] ?? [];
  const hit = (ms: number[]) => ms.some((m) => want.includes(m));
  if (localBloom(p)) return hit(bloomMonths(p)) ? 'local' : null;
  if (p.bloom_season?.length && hit(p.bloom_season.flatMap(seasonMonths))) return 'season';
  return p.bloom?.start && hit(bloomMonths(p)) ? 'earlier' : null;
}
/** "Blooming in June", "Blooming in spring". */
export const bloomWhen = (v: string): string => (/^\d+$/.test(v) ? MONTH_NAMES[Number(v)] ?? '' : v);
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
      for (const k of Object.keys(movedIds)) delete movedIds[k];
      Object.assign(movedIds, d.meta.moved ?? {});
    } else {
      const old = d as { plants?: Plant[]; meta?: PlantMeta };
      // (Its forms by today's names: src/catalog.ts, LEGACY_FORMS.)
      PLANTS = (old.plants || []).map((p) => (p.form ? { ...p, form: currentForm(p.form) } : p));
      PLANT_META = old.meta || null;
    }
    shareDogWarnings(PLANTS);
    for (const p of PLANTS) plantsById[p.id] = p;
    // (A plant placed from a record since folded into another shows that one's facts.)
    for (const [from, to] of Object.entries(movedIds)) if (!plantsById[from] && plantsById[to]) plantsById[from] = plantsById[to];
    catalogSettled = true;
    for (const fn of catalogHooks) fn();
    applyAliases(); // (plants of mine switched to these)
    if (state.panel === 'plants') render(); // refresh picker if already open
    else redrawCanvas(); // sun-check badges need plant data (canvas only: keyboard safe)
  })
  .catch((err) => { console.error('plants.json load failed', err); recordError(err, 'catalog'); catalogSettled = true; redrawCanvas(); });
}
// ============================================================
// PLANT PICKER
// ============================================================
/** Whether the picker leaves invasive plants out: while browsing. A search finds them by name, and "In this plan" shows those placed. */
export const invasivesLeftOut = (f: Pick<PlantFilter, 'q' | 'inPlan'>): boolean => !readQuery(f.q) && !f.inPlan;
/** A count as the picker writes it: 3,622. */
export const countWord = (n: number): string => n.toLocaleString('en-US');
/**
 * The picker's count line: how many plants show, of how many it offers, and, while browsing, that the invasive
 * ones it leaves out turn up when searched for (so the gap never reads as a filter left on).
 */
export function pickerCount(shown: number, offered: number, invasivesOut: number): string {
  const head = shown === offered ? `All ${countWord(offered)} plants` : `${countWord(shown)} of ${countWord(offered)} plants match`;
  return head + (invasivesOut ? ` \u00b7 ${countWord(invasivesOut)} invasive plant${invasivesOut === 1 ? ' shows' : 's show'} only when searched by name` : '');
}
/** Whether a plant passes the picker's filters. `inPlan`: ids of plants placed in the open plan. */
export function plantMatches(p: Plant, f: PlantFilter, inPlan?: Set<string>): boolean {
  // Invasives are never suggested; they turn up when searched by name (to map one already in the yard).
  if (p.invasive && invasivesLeftOut(f)) return false;
  if (f.dogs === 'hideToxic' && toxicToDogs(p)) return false;
  if (f.dogs === 'nonToxic' && !nonToxicToDogs(p)) return false;
  if (f.cats && p.problem_for?.includes('cats')) return false;
  if (f.horses && p.problem_for?.includes('horses')) return false;
  // (A hybrid none rates whose parent is rated: not "not listed", whatever its own page says.)
  if (f.noPoison && (!(p.prov?.poison?.unknown && !p.poison) || parentRated(p))) return false;
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
  // ("@here": native to the garden's state, by Kew's checklist; until its state is known, no filter. "@na": native to
  // North America, the earlier list's word, its regional and local-ecotype natives included.)
  if (f.native === '@here') { if (gardenStateName()) { const n = nativeHere(p); if (!n || n.status === 'I') return false; } }
  else if (f.native === '@na' && !NA_NATIVE.includes(p.native ?? '')) return false;
  if (f.deerResistant && p.deer !== 'Resistant') return false;
  if (f.lowMaintenance && p.maintenance_level !== 'low') return false;
  if (f.drought && !p.tolerates?.some((x) => x === 'drought' || x === 'dry soil')) return false;
  if (f.noThorns && p.thorns === true) return false;
  if (f.spread.length && !spreadsOnlyAs(p, f.spread)) return false;
  // (Any of the colors, or of who it attracts: a plant that comes in red or pink, one that draws bees or butterflies.)
  if (f.flowerColors.length && !showyColors(p).some((c) => f.flowerColors.includes(c))) return false;
  if (f.leafColors.length && !(p.leaf_color ?? []).some((c) => f.leafColors.includes(c))) return false;
  // (Bees take in NC State's "specialized bees": bees too.)
  const attracts = f.attracts.includes('bees') ? [...f.attracts, 'specialized bees'] : f.attracts;
  if (attracts.length && !(p.attracts ?? []).some((a) => attracts.includes(a))) return false;
  if (f.growth && p.growth_rate !== f.growth) return false;
  if (f.height) {
    // (By its typical mature height: a plant of 2 to 4 ft is a 3 ft plant.)
    const h = p.height && p.height.med, [lo, hi] = f.height.split('-');
    if (h == null || (lo && h < Number(lo)) || (hi && h > Number(hi))) return false;
  }
  if (f.wetFeet && !p.wet_feet) return false;
  if (f.clayOk && !p.clay_ok) return false;
  if (f.hostOnly && !hostPlant(p)) return false;
  if (f.fallColor && !p.fall_color) return false;
  if (f.evergreen && (p.foliage !== 'evergreen' || tenderWoody(p))) return false;
  if (f.winterInterest && !p.winter_interest) return false;
  if (f.edible && !p.edible) return false;
  if (f.inPlan && !inPlan?.has(p.id)) return false;
  // (Where the garden is, from flowering records there; else its season, or the earlier list's months: bloomMatch.)
  if (f.bloomMonth && !bloomMatch(p, f.bloomMonth)) return false;
  const q = readQuery(f.q);
  if (q && !matchPlant(p, q, true)) return false;
  return true;
}
/**
 * Why a plant counts as a caterpillar host, if it does: a source names caterpillars it feeds (`named`); it's native
 * to the garden's state, in a genus native caterpillars there are recorded on (`genus`: Shropshire & Tallamy, so a
 * genus-wide count says something of the plant only where the plant belongs); or only the earlier list says so.
 */
export function hostPlant(p: Plant): 'named' | 'genus' | 'earlier' | null {
  if (p.hosts?.length) return 'named';
  if (hostsHere(p) && nativeHere(p)?.status === 'N') return 'genus';
  return p.host ? 'earlier' : null;
}
/** The earlier list's dog rating, when it's a warning (anything but "Safe" or "Unverified"). */
export function oldDogWarning(p: Plant): string | null {
  return p.dog && p.dog !== 'Safe' && p.dog !== 'Unverified' ? p.dog : null;
}
/**
 * Non-toxic to dogs: listed non-toxic by the ASPCA (not merely unlisted:
 * unlisted isn't safe); until a plant has been checked against the ASPCA,
 * the earlier list's "Safe". Any warning from the earlier list still holds
 * until the audit removes it, so the two can only agree to call a plant safe.
 */
export function nonToxicToDogs(p: Plant): boolean {
  if (oldDogWarning(p) || p.dogVia || p.problem_for?.includes('dogs')) return false;
  return p.tox?.dog ? p.tox.dog === 'nontoxic' : p.dog === 'Safe';
}
/**
 * Any warning for dogs: listed toxic, NC State's "Problem for Dogs", the earlier list's warning, or that warning given
 * for its species' other record.
 */
export const toxicToDogs = (p: Plant): boolean => p.tox?.dog === 'toxic' || !!p.problem_for?.includes('dogs') || !!oldDogWarning(p) || !!p.dogVia;
/**
 * A plant's species from its botanical name ("Asclepias tuberosa (clay strain)", "Ilex verticillata 'Red Sprite'":
 * "Asclepias tuberosa", "Ilex verticillata"; a hybrid keeps its ×). Null for a genus alone ("Hosta 'Halcyon'").
 */
export function speciesOf(botanical: string | undefined): string | null {
  const m = /^([A-Z][a-z-]+)\s+(?:([×x])\s+)?([a-z][a-z-]+)\b/.exec(botanical?.trim() ?? '');
  if (!m || m[3] === 'spp' || m[3] === 'sp') return null;
  return `${m[1]} ${m[2] ? '× ' : ''}${m[3]}`;
}
/**
 * Where the earlier list warns for one record of a species, its other records carry the warning too (`dogVia`):
 * otherwise one butterfly weed says "toxic" and the next says nothing, which reads as safe. Each gets the
 * warning of the species' own record if it has one, else of the first record that does. Records with their own
 * warning keep it.
 */
export function shareDogWarnings(plants: Plant[]): void {
  const warned = new Map<string, Plant>();
  for (const p of plants) {
    const sp = speciesOf(p.botanical);
    if (!sp || !oldDogWarning(p)) continue;
    const had = warned.get(sp);
    if (!had || (speciesOf(had.botanical) !== had.botanical?.trim() && p.botanical?.trim() === sp)) warned.set(sp, p);
  }
  for (const p of plants) {
    const sp = speciesOf(p.botanical), from = sp ? warned.get(sp) : undefined;
    if (from && from !== p && !oldDogWarning(p)) p.dogVia = { id: from.id, common: from.common, dog: from.dog! };
  }
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
  return new Set(state.shapes.filter((s) => s.status !== 'gone').map((s) => s.plantId).filter((id): id is string => !!id).map((id) => movedIds[id] ?? id));
}
/**
 * The filters another source's value (a fact's `alt`) can count for, the
 * facts each reads, and what the flag calls them. Safety and status facts
 * (toxicity, invasive, native) have none: the catalog takes them from
 * authorities only.
 */
const FILTER_FACTS: [keyof PlantFilter, string[], string][] = [
  ['sun', ['sun_most', 'sun_least'], 'sun'], ['hardyHere', ['zone_min', 'zone_max'], 'hardiness zones'], ['water', ['water'], 'water'],
  ['deerResistant', ['deer'], 'deer resistance'], ['height', ['height'], 'height'], ['bloomMonth', ['bloom'], 'bloom time'], ['form', ['form'], 'form'],
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
    if (!filterOn(f, k)) continue;
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
 * Which facts each filter reads (for whether a match rests only on the earlier list), and what it's called. The
 * labels the other-sources filters share are theirs (FILTER_FACTS). Not the dog filter, which says unverified in its
 * own words, nor poison to people (always sourced), the search or "In this plan".
 */
const FILTER_READS: [keyof PlantFilter, (p: Plant, f: PlantFilter) => string[], string][] = [
  ['form', () => ['form'], 'form'], ['sun', () => ['sun_most', 'sun_least'], 'sun'], ['water', () => ['water'], 'water'],
  // (Months where the garden is come from flowering records; a native filter for the garden's state, from Kew's checklist.)
  ['bloomMonth', (p, f) => (bloomMatch(p, f.bloomMonth) === 'earlier' ? ['bloom'] : []), 'bloom time'], ['native', (_p, f) => (f.native === '@here' ? [] : ['native']), 'native status'],
  ['deerResistant', () => ['deer'], 'deer resistance'], ['spread', () => ['self_seed', 'habit'], 'how it spreads'], ['height', () => ['height'], 'height'],
  ['wetFeet', () => ['wet_feet'], 'wet feet'], ['clayOk', () => ['clay_ok'], 'clay'],
  ['hostOnly', (p) => (hostPlant(p) === 'earlier' ? ['host'] : []), 'host plant'], ['fallColor', () => ['fall_color'], 'fall color'], ['evergreen', () => ['foliage'], 'evergreen'],
  ['winterInterest', () => ['winter_interest'], 'winter interest'], ['edible', () => ['edible'], 'edible'],
  ['hardyHere', () => ['zone_min', 'zone_max'], 'hardiness zones'],
];
/** Whether a value rests only on the earlier list: its every source is the unsourced compendium. */
export function earlierListOnly(pv: Provenance | undefined, sources = PLANT_META?.sources): boolean {
  return !!pv && !pv.unknown && pv.src.length > 0 && pv.src.every((s) => sources?.[s]?.trust === 'unverified');
}
/**
 * The filters a catalog plant passes only on the earlier list's word (what the filter reads has no source but that
 * list), by name ("deer resistance"); empty where every filter it passes rests on a source. A filter it passes on
 * what other sources say (`reportedOnly`) rests on them. A plant of mine has its own word: none.
 */
export function earlierOnly(p: Plant, f: PlantFilter, sources = PLANT_META?.sources): string[] {
  if (!p.prov) return [];
  const via = new Set(reportedOnly.get(p.id) ?? []);
  return FILTER_READS.filter(([k, reads, label]) => filterOn(f, k) && !via.has(label) && reads(p, f).some((x) => earlierListOnly(p.prov?.[x], sources)))
    .map(([, , label]) => label);
}
/**
 * Each species' cultivars in the catalog (records naming it as their species, `parent`), and each cultivar's
 * species: worked out once for the catalog loaded. The picker folds a species' cultivars under it.
 *
 * A cultivar with no species record (a genus's or a hybrid's: "Rosa 'Julia Child'", "Camellia 'Winter's Charm'") is
 * gathered by its botanical name's genus, or species where it names one the catalog has no record of, under a
 * heading that isn't a plant (decided with Jason, 2026-10-26: "Roses"): a group, its id "group:" and that name.
 */
let folds: { from: Plant[]; byId: Map<string, Plant>; cultivars: Map<string, Plant[]>; groupOf: Map<string, Plant> } | null = null;
/** A cultivar by its name: in quotes after a capital ("Coneflower 'Magnus'", not "Bush's"), or a series or group. */
const NAMED_CULTIVAR = /['\u2018][A-Z][^'\u2018\u2019]*['\u2019]/;
export const namesACultivar = (p: Plant): boolean =>
  [p.botanical, p.common].some((n) => NAMED_CULTIVAR.test(n ?? '')) || /\b(series|group)\b/i.test(p.botanical ?? '');
/** What a cultivar's botanical name names besides it: its genus, or its species ("Rosa", "Juniperus communis"). */
export function groupKey(botanical: string): string {
  // (An intergeneric cross leads with its ×, "x Gordlinia grandiflora 'Sunshine'": its genus is the next word.)
  const w = botanical.replace(/\([^)]*\)/g, ' ').trim().replace(/^[x\u00d7]\s+(\S+)/, '\u00d7$1').split(/\s+/);
  if (/^[x\u00d7]$/.test(w[1] ?? '') && /^[a-z\u00eb-]+$/.test(w[2] ?? '')) return `${w[0]} \u00d7 ${w[2]}`;
  return /^[a-z\u00eb-]+$/.test(w[1] ?? '') && !/^(x|hybrids?|types?|series|group)$/.test(w[1]) ? `${w[0]} ${w[1]}` : w[0];
}
/** A plant name as a heading over several ("Rose" → Roses, "Holly" → Hollies; "Hibiscus", "Drift roses" as they are). */
export function pluralName(name: string): string {
  if (/(s|us)$/i.test(name) && !/(is)$/i.test(name)) return name;
  if (/(is|x|z|ch|sh)$/i.test(name)) return name + 'es';
  if (/[^aeiou]y$/i.test(name)) return name.slice(0, -1) + 'ies';
  return name + 's';
}
/**
 * Genera whose cultivars' other English name is a part of the genus, not another name for all of it (Jason,
 * 2026-10-26): "Rhododendrons (inc. Azaleas)", where Buddleja's is "Buddlejas (Butterfly Bushes)".
 */
const GROUP_INCLUDES = new Set(['rhododendron']);
/**
 * A group's name from its cultivars' own names: the words they share around the cultivar, the most of them alike
 * ("Rose 'Julia Child' (floribunda)", "Rose 'Belinda's Dream'" → Roses). Its genus written as a name ("Rosa
 * 'Abraham Darby'") counts for an English name that starts the same ("Rose"); on a tie the genus wins (always
 * right). Where the genus wins and two or more say another name, that name beside it (Jason, 2026-10-26):
 * "Buddlejas (Butterfly Bushes)". None: its botanical name. Returns the name, then the names for one ("Rose"):
 * a search for those isn't a search naming the cultivar.
 */
export function groupName(members: Pick<Plant, 'common'>[], key: string): [string, string[]] {
  const genus = key.split(' ')[0].toLowerCase();
  const votes = new Map<string, { n: number; as: string }>();
  for (const m of members) {
    const plant = m.common.replace(/['\u2018][A-Z].*['\u2019]/, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!plant || plant === m.common.trim()) continue; // (no cultivar named in quotes: its name is its own)
    const k = plant.toLowerCase();
    votes.set(k, { n: (votes.get(k)?.n ?? 0) + 1, as: votes.get(k)?.as ?? plant });
  }
  const g = votes.get(genus);
  const english = g && [...votes].find(([k]) => k !== genus && !k.includes(' ') && k.slice(0, 3) === genus.slice(0, 3));
  if (g && english) { english[1].n += g.n; votes.delete(genus); }
  const ranked = [...votes].sort(([ka, a], [kb, b]) => b.n - a.n || Number(kb === genus) - Number(ka === genus) || a.as.length - b.as.length);
  const best = ranked[0]?.[1];
  if (!best || (key.includes(' ') && best.as.toLowerCase() === key.toLowerCase())) return [key, [key]]; // (a species' botanical name: as it is)
  const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
  const one = cap(best.as);
  const other = ranked[0][0] === genus ? ranked.find(([k, v]) => k !== genus && v.n >= 2)?.[1] : undefined;
  if (!other) return [pluralName(one), [one]];
  const also = cap(other.as).split(' ').map((w, i) => (i ? cap(w) : w)).join(' '); // ("Butterfly Bush")
  return [`${pluralName(one)} (${GROUP_INCLUDES.has(genus) ? 'inc. ' : ''}${pluralName(also)})`, [one, also]];
}
function foldIndex() {
  if (folds?.from === PLANTS) return folds;
  const byId = new Map(PLANTS.map((p) => [p.id, p]));
  const cultivars = new Map<string, Plant[]>();
  for (const p of PLANTS) if (p.parent && byId.has(p.parent)) cultivars.set(p.parent, [...(cultivars.get(p.parent) ?? []), p]);
  // Groups: cultivars with no species record, by genus (or species with no record: one with a record is its own).
  const species = new Set(PLANTS.filter((p) => !p.parent && !namesACultivar(p) && p.botanical).map((p) => p.botanical));
  const byKey = new Map<string, Plant[]>();
  for (const p of PLANTS) {
    if ((p.parent && byId.has(p.parent)) || !p.botanical || !namesACultivar(p)) continue;
    const key = groupKey(p.botanical);
    if (key.includes(' ') && species.has(key)) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  const groupOf = new Map<string, Plant>();
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const [name, ones] = groupName(members, key);
    const head = { id: `group:${key}`, common: name, botanical: key, synonyms: ones } as Plant;
    cultivars.set(head.id, members);
    for (const m of members) groupOf.set(m.id, head);
  }
  return (folds = { from: PLANTS, byId, cultivars, groupOf });
}
/** A species' cultivars in the catalog, or a group's (none for a cultivar, or a plant of mine). */
export const cultivarsOf = (p: Plant): Plant[] => foldIndex().cultivars.get(p.id) ?? [];
/** A cultivar's species in the catalog, if it has one there. */
export const speciesOfCultivar = (p: Plant): Plant | undefined => (p.parent ? foldIndex().byId.get(p.parent) : undefined);
/** What a cultivar folds under: its species, else the group of its genus's cultivars (a heading, not a plant). */
export const foldHeadOf = (p: Plant): Plant | undefined => speciesOfCultivar(p) ?? foldIndex().groupOf.get(p.id);
/** Whether a fold's head is a group's heading (not a plant: nothing to place). */
export const isGroupHead = (p: Plant): boolean => p.id.startsWith('group:');
/** Plants in the last list that match only on the earlier list's word, and on what. */
export const earlierFor = new Map<string, string[]>();
/** Plants in the last list that come in a color asked for among others (a species: depends on the plant you buy), and which. */
export const comesIn = new Map<string, string[]>();
/** Plants in the last list that bloom in the month asked for by their season, not by months ("by season"). */
export const bySeason = new Set<string>();
/** What filters the other sources' values helped with: as the divider says it ("take shade", "are hardy here"). */
export function reportedPhrase(labels: Iterable<string>, f: PlantFilter): string {
  const FORMS: Record<string, string> = { Tree: 'trees', Shrub: 'shrubs', Perennial: 'perennials', 'Grass/Sedge': 'grasses or sedges', Vine: 'vines', Bulb: 'bulbs', Fern: 'ferns', Annual: 'annuals', 'Aquatic/Emergent': 'water plants', Cactus: 'cacti or succulents' };
  const say: Record<string, string> = {
    sun: `take ${SUN_SAID[f.sun] ?? f.sun.toLowerCase()}`, 'hardiness zones': 'are hardy here', water: `fit \u201cWater: ${f.water}\u201d`,
    'deer resistance': 'are deer resistant', height: 'fit the height range', 'bloom time': `bloom in ${bloomWhen(f.bloomMonth)}`,
    form: `are ${FORMS[f.form] ?? f.form.toLowerCase()}`,
  };
  const parts = [...new Set(labels)].map((l) => say[l] ?? `fit on ${l}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? 'fit';
}
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
  earlierFor.clear(); comesIn.clear(); bySeason.clear();
  const month = /^\d+$/.test(plantFilter.bloomMonth);
  const out = found.filter(({ plant }) => {
    const m = reportedMatch(plant, plantFilter, inPlan);
    if (m?.length) reportedOnly.set(plant.id, m);
    if (m !== null) {
      const e = earlierOnly(plant, plantFilter); if (e.length) earlierFor.set(plant.id, e);
      // (A species that comes in several colors, one of them asked for; a month met only by its season.)
      if (plantFilter.flowerColors.length && !trueToColor(plant)) comesIn.set(plant.id, showyColors(plant).filter((c) => plantFilter.flowerColors.includes(c)));
      if (month && bloomMatch(plant, plantFilter.bloomMonth) === 'season') bySeason.add(plant.id);
    }
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
/**
 * A tree or shrub its source also lists as an annual or perennial: woody where winters are mild, grown as one
 * that dies back where they aren't (lantana, castor bean). Its "evergreen" holds only in a mild winter.
 */
export const tenderWoody = (p: Pick<Plant, 'form' | 'forms'>): boolean => {
  const forms = formsOf(p);
  return forms.some((f) => f === 'Tree' || f === 'Shrub') && forms.some((f) => f === 'Annual' || f === 'Perennial');
};
/** The color a plant is drawn in: its own (My plants), else by form, else green. */
export function plantColor(p: Plant | undefined): string {
  return p?.color || (p && ownCopies[p.id]?.color) || (p?.form && FORM_COLORS[p.form]) || '#16a34a';
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
const capital = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
/** A length as a row says it: "3 ft", "2.5 ft", "8 in". */
const feetSaid = (x: number) => (x >= 1 ? `${+x.toFixed(1)} ft` : `${Math.round(x * 12)} in`);
/** A size as its sources give it, a range where they give one: "3–4 ft", "8–12 in", "8 in–1.5 ft", "6 ft". */
const sizeSaid = (r?: { min?: number; max?: number; med?: number }): string => {
  if (!r) return '';
  if (r.min != null && r.max != null && r.min !== r.max) {
    const a = feetSaid(r.min), b = feetSaid(r.max);
    return a.endsWith(' ft') === b.endsWith(' ft') ? `${a.replace(/ (ft|in)$/, '')}\u2013${b}` : `${a}\u2013${b}`;
  }
  const v = r.med ?? r.min ?? r.max;
  return v ? feetSaid(v) : '';
};
const SUN_SAID: Record<string, string> = { Full: 'full sun', Part: 'part shade', Shade: 'shade' };
/** "Full sun", "Full sun to part shade", "Shade". */
export function sunSaid(most?: string, least?: string): string {
  if (!most) return '';
  const a = SUN_SAID[most] ?? most, b = least ? SUN_SAID[least] ?? least : a;
  return capital(a === b ? a : `${a} to ${b}`);
}
/**
 * Its hardiness in a few words: where the garden is ("Hardy here"; "Too cold here", `ok` false), else its zones
 * ("Zones 5–9"). Null where no zones are known.
 */
export function hardinessSaid(p: Plant): { text: string; ok: boolean } | null {
  const fit = state.location ? zoneFit(p, state.location) : null;
  if (fit === 'fits') return { text: 'Hardy here', ok: true };
  if (fit === 'edge-cold') return { text: 'Hardy here, at its cold edge', ok: true };
  if (fit === 'edge-warm') return { text: 'Hardy here, at its warm edge', ok: true };
  if (fit === 'cold') return { text: 'Too cold here', ok: false };
  // (Rated for cooler zones, but found living wild nearby: those summers haven't killed it.)
  if (fit === 'warm') return wildNearby(p) ? { text: 'May be too warm here; recorded wild nearby', ok: true } : { text: 'May be too warm here', ok: false };
  const z = zoneRange(p);
  return z ? { text: capital(z), ok: true } : null;
}
/**
 * A picker row's lines (decided with Jason, 2026-10-25): its botanical name and forms; then its typical size, sun
 * and hardiness. Bloom time, toxicity to animals and poison to people are left to the filters and the details.
 */
export function rowLines(p: Plant): { names: string; size: string; sun: string; hardy: { text: string; ok: boolean } | null } {
  const forms = formsOf(p).join(' / ');
  const h = sizeSaid(p.height), w = sizeSaid(p.width);
  const size = [h && `${h} tall`, w && `${w} wide`].filter(Boolean).join(', ');
  // (Its botanical name, unless that's the name it goes by: "Adiantum × mairisii".)
  const bot = p.botanical && p.botanical.trim() !== p.common.trim() ? p.botanical : '';
  return { names: [bot, forms].filter(Boolean).join(' \u00b7 '), size, sun: sunSaid(p.sun_most, p.sun_least), hardy: hardinessSaid(p) };
}
/** A short mark on a row: native here, or something to know before choosing it. */
export interface RowFlag { text: string; kind: 'native' | 'warn' | 'bad' | 'check'; title?: string; testid: string }
/**
 * The row's marks, only those that apply: native to the garden's state (Kew's checklist: "AR native"); invasive;
 * irritates skin (a contact poison matters to anyone who handles it, unlike one that's eaten); and how far its
 * details are checked (Unverified, Partly checked). What the law says and an escape into the wild have lines of
 * their own (src/ui/plants-panel.ts).
 */
export function rowFlags(p: Plant): RowFlag[] {
  const out: RowFlag[] = [];
  const n = nativeHere(p);
  if (n?.status === 'N') out.push({ text: `${n.state} native`, kind: 'native', title: `${nativeText(n)} (${n.source})`, testid: 'row-native' });
  if (p.invasive) out.push({ text: 'Invasive: not for planting', kind: 'bad', testid: 'row-invasive' });
  if (p.poison?.skin) out.push({ text: 'Can irritate skin', kind: 'warn', title: 'NC State lists it as causing contact dermatitis', testid: 'row-skin' });
  if (p.unverified) out.push({ text: 'Unverified', kind: 'check', title: "From an earlier list with no sources; it's being checked", testid: 'unverified-badge' });
  else if (p.partlyChecked) out.push({ text: 'Partly checked', kind: 'check', title: 'Some details are checked against sources; those marked "earlier list" in its details are not yet', testid: 'partly-badge' });
  return out;
}
