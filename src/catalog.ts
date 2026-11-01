import { HABIT_SPREAD } from './spread';
import type { Plant } from './plants';

// The plant catalog file (public/plants.json), version 2: plant facts, each
// with where it came from. See docs/catalog-format.md.
//
// The rest of the app works with flat Plant objects; `resolveCatalog` turns
// records into those (cultivars filled in from their species), and keeps,
// per plant, where each value came from and whether the record has been
// audited.

/** reference: a published reference (extension, USDA, botanical garden); nursery: a grower's or seller's own listing; observation: a gardener's record; unverified: the first compendium. */
export type Trust = 'reference' | 'nursery' | 'observation' | 'unverified';
export interface SourceDef { title: string; url?: string; trust: Trust }
/**
 * How sure a value is (docs/catalog-sources.md, "Deciding each fact"): `agree` / `confirmed` (an authority,
 * and an independent source agrees), `single` (one authority), `likely` (no authority behind it; two or more
 * nurseries agree, outnumbering any authority that says otherwise), `reported` (one nursery), `disputed`.
 */
export type Check = 'agree' | 'confirmed' | 'disputed' | 'single' | 'likely' | 'reported';
/**
 * Forms by an older name: trees were understory or canopy until 2026-10 and are one "Tree" now (how a tree
 * layers with what's under it is worked out from its height: src/crowding.ts). A plant of my own saved
 * with either, or a catalog from before, reads as "Tree".
 */
export const LEGACY_FORMS: Record<string, string> = { 'Tree (canopy)': 'Tree', 'Tree (understory)': 'Tree' };
export const currentForm = (f: string): string => LEGACY_FORMS[f] ?? f;
/**
 * A form as it goes to other devices and into files, for now: a version from before 2026-10 knows no plain
 * "Tree" and drops a form it doesn't know, so a plant of mine synced to it would lose its form, and its
 * edit would carry the loss back. A tree goes as "Tree (canopy)", which every version reads (this one as
 * "Tree"). Fingerprints are taken the same way, so a canopy tree's rename uploads nothing; an understory
 * tree's uploads once, as "Tree (canopy)" (to an older version, a canopy tree from then on: its form kept).
 * Drop this once no device can still be running a version from before.
 */
export const WIRE_FORMS: Record<string, string> = { Tree: 'Tree (canopy)' };
export const wirePlant = (p: Plant): Plant => (p.form && WIRE_FORMS[p.form] ? { ...p, form: WIRE_FORMS[p.form] } : p);
/**
 * What other sources say where they differ from the value shown (shown beside it, labeled with who says it,
 * and usable in filters by the user's choice): the side that didn't lead (docs/catalog-sources.md, "Where
 * sources disagree"). Only for the garden facts decided that way; never toxicity, invasiveness or native
 * status (a form where sources differ keeps both forms instead). A pair (sun_most and sun_least, zone_min and
 * zone_max) is one source's whole range: an `alt` on each half where it differs from the value shown.
 */
export const REPORTABLE = new Set(['height', 'width', 'zone_min', 'zone_max', 'sun_most', 'sun_least', 'water', 'deer']);
export interface Reported<T = unknown> { v: T; src: string[]; check: 'confirmed' | 'single' | 'likely' | 'reported' }
/** A fact with its own sourcing (else a plain value, sourced by its record). */
export interface SourcedFact<T = unknown> {
  v: T; src?: string[]; at?: string; check?: Check; alt?: Reported<T>;
  /** Where in its source it was read: 'description', a sentence of the source's description (docs/catalog-format.md). */
  from?: 'description';
}
export interface CatalogRecord {
  id: string;
  common: string;
  botanical?: string;
  short?: string;
  synonyms?: string[];
  usda?: string;
  /** Species of a cultivar. */
  parent?: string;
  /**
   * Facts a cultivar takes from its species beyond those every cultivar does (INHERITED): only its size, `height` and
   * `width`, for a cultivar split from a record of several that has no page of its own, until a source gives its own
   * (scripts/catalog/split.mjs; decided with Jason, 2026-10-25).
   */
  inherits?: string[];
  /** Sources of facts that don't name their own. */
  src?: string[];
  /** Date (YYYY-MM-DD) the audit re-derived this record from sources; null until then. */
  audited?: string | null;
  facts: Record<string, unknown>;
}
export interface CatalogMeta {
  format: 'lp-catalog';
  version: 2;
  updated?: string;
  /** "half": zones are on the half-zone scale (zone_max 9.5 is through 9b). Files without it rated zone_max in whole zones (9 was through 9b). */
  zones?: 'half';
  title?: string;
  sources: Record<string, SourceDef>;
  enums?: Record<string, string[]>;
  notes?: string;
  /**
   * Records folded into another (scripts/catalog/decisions.json `fold`): the old id → the record it stands for now,
   * so a plant placed from it keeps its facts.
   */
  moved?: Record<string, string>;
}
export interface CatalogFile { meta: CatalogMeta; plants: CatalogRecord[] }

/** Where one of a plant's values came from. */
export interface Provenance {
  src: string[];
  at?: string;
  check?: Check;
  /** Taken from the species (the plant is a cultivar that doesn't say). */
  inherited?: boolean;
  /** Looked up, and none of the sources say (the value is left out). */
  unknown?: boolean;
  /** What other sources say instead, where they differ. */
  alt?: Reported;
  /** Read from a sentence of the source's description, not its fields. */
  from?: 'description';
}

/**
 * Facts a cultivar takes from its species when it doesn't state them: what
 * comes with the species (where it's native, what it tolerates, what it
 * feeds, how toxic it is, whether it keeps its leaves in winter, when it blooms). Not size, trunk, flower or leaf
 * color, growth rate or habit, which cultivars are bred to change. (A reblooming cultivar's own season comes from a
 * page for it; its species' is labeled as such.)
 */
export const INHERITED = new Set([
  'form', 'zone_min', 'zone_max', 'sun_most', 'sun_least', 'water', 'humidity', 'tox', 'poison', 'dog', 'thorns', 'foliage', 'winter_leaves', 'needles',
  'poison_parents', 'native', 'native_na', 'botanical_synonyms', 'host', 'hosts', 'host_genus', 'nectar', 'bird', 'deer', 'edible', 'edible_parts', 'fruit_set', 'clay_ok', 'wet_feet', 'dry_shade', 'taproot', 'wild_us', 'bloom_season',
  'tolerates', 'problem_for', 'maintenance_level', 'bark', 'fruit_season', 'leaf_form', 'texture', 'climbs_by',
]);

const isSourced = (f: unknown): f is SourcedFact =>
  !!f && typeof f === 'object' && !Array.isArray(f) && 'v' in (f as object);
/** A fact's value and provenance, given its record's default sources. */
export function factOf(rec: CatalogRecord, key: string): { v: unknown; prov: Provenance } | undefined {
  if (!(key in rec.facts)) return undefined;
  const f = rec.facts[key];
  if (isSourced(f)) return { v: f.v, prov: { src: f.src ?? rec.src ?? [], ...(f.at ? { at: f.at } : {}), ...(f.check ? { check: f.check } : {}), ...(f.alt ? { alt: f.alt } : {}), ...(f.from ? { from: f.from } : {}) } };
  return { v: f, prov: { src: rec.src ?? [] } };
}

/**
 * Catalog records as the app's plants. A cultivar is completed from its
 * species; `prov` says where each value came from; `unverified` marks
 * records the audit hasn't reached.
 */
export function resolveCatalog(file: CatalogFile): Plant[] {
  const byId = new Map(file.plants.map((r) => [r.id, r]));
  // An older file (whole-zone zone_max) read by this code: its "9" meant through 9b.
  const wholeZoneMax = file.meta.zones !== 'half';
  return file.plants.map((rec) => {
    const parent = rec.parent ? byId.get(rec.parent) : undefined;
    const p: Plant = { id: rec.id, common: rec.common };
    if (rec.botanical) p.botanical = rec.botanical;
    if (rec.short) p.short = rec.short;
    if (rec.synonyms?.length) p.synonyms = rec.synonyms;
    if (rec.parent) p.parent = rec.parent;
    const prov: Record<string, Provenance> = {};
    const takes = (k: string) => INHERITED.has(k) || !!rec.inherits?.includes(k);
    const keys = new Set([...Object.keys(rec.facts), ...(parent ? Object.keys(parent.facts).filter(takes) : [])]);
    for (const key of keys) {
      const own = factOf(rec, key);
      const got = own ?? (parent ? factOf(parent, key) : undefined);
      if (!got) continue;
      const pv = own ? got.prov : { ...got.prov, inherited: true };
      // Known unknown: no value, but the record says the sources were checked.
      if (got.v == null) { prov[key] = { ...pv, unknown: true }; continue; }
      if (pv.alt && REPORTABLE.has(key)) (p.reported ??= {})[key] = key === 'zone_max' && wholeZoneMax && Number.isInteger(pv.alt.v) ? (pv.alt.v as number) + 0.5 : pv.alt.v;
      if (key === 'form') {
        const forms = [...new Set([got.v].flat().map((f) => currentForm(String(f))))];
        if (Array.isArray(got.v)) { p.form = forms[0]; p.forms = forms; prov[key] = pv; continue; }
        p.form = forms[0]; prov[key] = pv; continue;
      }
      (p as unknown as Record<string, unknown>)[key] = key === 'zone_max' && wholeZoneMax && Number.isInteger(got.v) ? (got.v as number) + 0.5 : got.v;
      prov[key] = pv;
    }
    p.prov = prov;
    // Not yet audited, or (a cultivar) leaning on a species that isn't.
    if (!rec.audited || (parent && !parent.audited && Object.values(prov).some((x) => x.inherited))) p.unverified = true;
    // Audited, but some details it shows still rest only on the older, unsourced list.
    else if (Object.values(prov).some((x) => !x.unknown && x.src.length > 0 && x.src.every((s) => file.meta.sources[s]?.trust === 'unverified'))) p.partlyChecked = true;
    return p;
  });
}

/** Whether a loaded file is a version 2 catalog (else the old flat list). */
export function isCatalogV2(d: unknown): d is CatalogFile {
  const m = (d as { meta?: { format?: unknown; version?: unknown } } | null)?.meta;
  return !!m && m.format === 'lp-catalog' && m.version === 2;
}

// ---------- Checks ----------
const SUN = ['Full', 'Part', 'Shade'];
const TOX_ANIMAL = ['nontoxic', 'toxic', 'unlisted'];
const TOX_PEOPLE = ['major', 'minor', 'oxalates', 'dermatitis', 'unlisted'];
const POISON_SEVERITY = ['low', 'medium', 'high'];
/** The parts NC State names (scripts/catalog/claims.mjs), as the catalog writes them. */
const POISON_PARTS = ['leaves', 'fruits', 'seeds', 'stems', 'flowers', 'roots', 'sap', 'bark'];
/** Leaf colors (NC State's "Leaf Color", USDA's "Foliage Color": scripts/catalog/claims.mjs). */
export const LEAF_COLORS = ['green', 'silver', 'gold', 'blue', 'purple', 'red', 'copper', 'white', 'variegated', 'orange', 'pink', 'cream', 'black'];
/** Fall leaf colors (NC State's "Deciduous Leaf Fall Color"). */
export const FALL_COLORS = ['gold', 'red', 'orange', 'purple', 'copper', 'cream', 'silver', 'pink'];
/** Whether the leaves stay through winter. For an herb, deciduous is dying back. */
export const FOLIAGE = ['evergreen', 'semi-evergreen', 'deciduous'];
export const GROWTH_RATES = ['slow', 'medium', 'fast'];
/** NC State's lists, as the catalog keeps them (scripts/catalog/claims.mjs): who visits, what it takes, animals it's a problem for. */
export const ATTRACTS = ['butterflies', 'pollinators', 'bees', 'specialized bees', 'hummingbirds', 'songbirds', 'moths', 'small mammals', 'predatory insects', 'frogs', 'reptiles', 'bats'];
export const TOLERATES = ['deer', 'rabbits', 'squirrels', 'voles', 'slugs', 'drought', 'dry soil', 'wet soil', 'poor soil', 'compaction', 'erosion', 'heat', 'humidity', 'salt', 'pollution', 'urban conditions', 'black walnut', 'heavy shade', 'wind', 'storm damage', 'foot traffic', 'fire', 'diseases', 'insect pests'];
export const PETS = ['dogs', 'cats', 'horses'];
export const MAINTENANCE_LEVELS = ['low', 'medium', 'high'];
/** What shows in winter, as NC State lists it (scripts/catalog/claims.mjs): bark, its colors; stem and fruit colors; when the fruit's there. */
export const BARK = ['smooth', 'furrowed', 'fissured', 'ridges', 'scaly', 'lenticels', 'bumpy', 'spongy', 'shiny', 'exfoliating', 'peeling', 'shredding', 'papery', 'shaggy', 'patchy'];
export const BARK_COLORS = ['light gray', 'dark gray', 'light brown', 'dark brown', 'red/burgundy', 'orange', 'green', 'black', 'white'];
export const PART_COLORS = ['red/burgundy', 'orange', 'gold/yellow', 'green', 'blue', 'purple/lavender', 'pink', 'white', 'cream/tan', 'brown/copper', 'gray/silver', 'black'];
export const FRUIT_SEASONS = ['spring', 'summer', 'fall', 'winter'];
/** The parts NC State marks edible (scripts/catalog/claims.mjs EDIBLE_PARTS). */
export const EDIBLE_PARTS = ['fruit', 'flowers', 'leaves'];
/** What it takes to fruit, and a cultivar's sex, read from its description (scripts/catalog/prose.mjs FRUIT_SET, SEXES). */
export const FRUIT_SET = ['separate', 'partner', 'better', 'self'];
export const SEXES = ['male', 'female'];
/**
 * What its flowers and leaves look like, by part, in the catalog's words for NC State's fields
 * (scripts/catalog/claims.mjs FORM_WORDS): flower sizes and leaf lengths in inches.
 */
export const FLOWER_FORM = {
  inflorescence: ['raceme', 'panicle', 'cyme', 'solitary', 'head', 'spike', 'umbel', 'corymb', 'catkin', 'spadix', 'insignificant'],
  shape: ['tubular', 'cup', 'star', 'bell', 'radial', 'funnel', 'saucer', 'lipped', 'trumpet', 'dome', 'irregular', 'cross', 'urn', 'wheel', 'crown'],
  petals: ['2-3', '4-5', '6', '7-20', '20+', 'bracts', 'fused', 'sepals', 'tepals', 'asymmetrical'],
  size: ['<1', '1-3', '3-6', '>6'],
} as const;
export const LEAF_FORM = {
  type: ['simple', 'compound', 'needles', 'sheath', 'fronds'],
  shape: ['ovate', 'lanceolate', 'elliptical', 'linear', 'oblong', 'obovate', 'cordate', 'oblanceolate', 'orbicular', 'spatulate', 'deltoid', 'pinnatifid', 'palmatifid',
    'acicular', 'cuneate', 'palmasect', 'filiform', 'rhomboidal', 'reniform', 'obtuse', 'peltate', 'pinnatisect', 'subulate', 'auriculate', 'subcordate'],
  arrangement: ['alternate', 'opposite', 'rosulate', 'whorled', 'complex'],
  margin: ['entire', 'serrate', 'lobed', 'dentate', 'crenate', 'undulate', 'doubly serrate', 'sinuate', 'denticulate', 'crenulate', 'doubly dentate', 'doubly crenate'],
  length: ['<1', '1-3', '3-6', '>6'],
} as const;
/** How fine its leaves look from a distance; the plant's shape (NC State's "Habit/Form"). */
export const TEXTURES = ['fine', 'medium', 'coarse'];
export const HABIT_FORMS = ['erect', 'spreading', 'rounded', 'dense', 'clumping', 'multi-stemmed', 'mounding', 'arching', 'creeping', 'climbing', 'pyramidal', 'open',
  'horizontal', 'oval', 'prostrate', 'ascending', 'vase', 'columnar', 'cascading', 'broad', 'multi-trunked', 'irregular', 'weeping', 'conical'];
/** How a vine climbs (NC State's "Climbing Method"). */
export const CLIMBING = ['twining', 'tendrils', 'clinging', 'scrambler'];
/** When it blooms: a season, or USDA's finer "mid spring" (scripts/catalog/claims.mjs bloomSeasons). */
export const BLOOM_SEASONS = ['spring', 'summer', 'fall', 'winter'].flatMap((x) => [x, `early ${x}`, `mid ${x}`, `late ${x}`]);
/**
 * Flower colors (NC State's "Flower Color" groups, USDA's "Flower Color": scripts/catalog/claims.mjs flowerColors).
 * `insignificant`: the flowers aren't showy (NC State's word; USDA's "Flower Conspicuous: No").
 */
export const FLOWER_COLORS = ['white', 'yellow', 'pink', 'purple', 'red', 'orange', 'blue', 'green', 'cream', 'brown', 'silver', 'black', 'variegated', 'insignificant'];
/** A list of words from `words`, each once. */
const wordsOf = (words: string[]) => (v: unknown) =>
  Array.isArray(v) && v.length > 0 && new Set(v).size === v.length && v.every((x) => words.includes(x as string));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** { part: [words] }, each part one of `parts`, its words from that part's list, each once. */
const formOf = (parts: Record<string, readonly string[]>) => (v: unknown) =>
  isObj(v) && Object.keys(v).length > 0 && Object.entries(v).every(([k, l]) => !!parts[k] && wordsOf(parts[k] as string[])(l));
const isRange = (v: unknown) => {
  if (!isObj(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.every((k) => ['min', 'max', 'med'].includes(k) && typeof v[k] === 'number' && (v[k] as number) > 0);
};
const isHalfZone = (v: unknown) => typeof v === 'number' && Number.isInteger(v * 2) && v >= 1 && v <= 13.5;
const isMonth = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12;
/** Fact types: what a value must look like. Unknown fact names are errors (typos). */
const FACT_TYPES: Record<string, (v: unknown, enums: Record<string, string[]>) => boolean> = {
  // One form, or a short list, primary first (redbud: tree and shrub).
  form: (v, e) => [v].flat().length > 0 && [v].flat().length <= 3 && [v].flat().every((x) => typeof x === 'string' && (!e.form || e.form.includes(x))) && new Set([v].flat()).size === [v].flat().length,
  habit: (v) => typeof v === 'string',
  height: isRange, width: isRange, spacing: isRange,
  // (Half-zone scale: 7a is 7, 7b is 7.5; see src/climate.ts.)
  zone_min: (v) => isHalfZone(v), zone_max: (v) => isHalfZone(v),
  sun_most: (v) => SUN.includes(v as string), sun_least: (v) => SUN.includes(v as string),
  water: (v, e) => typeof v === 'string' && (!e.water || e.water.includes(v)),
  bloom: (v) => isObj(v) && Object.keys(v).every((k) => ['start', 'end', 'color'].includes(k))
    && (v.start == null || isMonth(v.start)) && (v.end == null || isMonth(v.end)) && (v.color == null || typeof v.color === 'string'),
  humidity: (v) => v === 'humid' || v === 'dry' || v === 'either',
  tox: (v) => isObj(v) && Object.keys(v).length > 0
    && Object.entries(v).every(([k, x]) => (k === 'people' ? TOX_PEOPLE : ['dog', 'cat', 'horse'].includes(k) ? TOX_ANIMAL : []).includes(x as string)),
  // Poisonous to people, in its source's terms (NC State's): how severe, which parts, and whether it irritates skin.
  // {} is poisonous with nothing more said.
  poison: (v) => isObj(v) && Object.keys(v).every((k) => ['severity', 'parts', 'skin'].includes(k))
    && (!('severity' in v) || POISON_SEVERITY.includes(v.severity as string))
    && (!('parts' in v) || (Array.isArray(v.parts) && v.parts.length > 0 && new Set(v.parts).size === v.parts.length && v.parts.every((x) => POISON_PARTS.includes(x as string))))
    && (!('skin' in v) || v.skin === true),
  // A hybrid no source rates: its parents (a species name each) and each one's rating as `poison` takes it, null for
  // none listed, absent for not rated; by its name or Kew's formula (scripts/catalog/hybrids.mjs).
  poison_parents: (v) => isObj(v) && (v.via === 'name' || v.via === 'kew') && Object.keys(v).every((k) => k === 'via' || k === 'parents')
    && Array.isArray(v.parents) && v.parents.length >= 2 && v.parents.length <= 4
    && v.parents.every((x) => isObj(x) && typeof x.name === 'string' && /^[A-Z][a-z]+ [a-z][a-z-]+$/.test(x.name)
      && Object.keys(x).every((k) => ['name', 'id', 'common', 'poison'].includes(k))
      && (x.id === undefined || typeof x.id === 'string') && (x.common === undefined || typeof x.common === 'string')
      && (!('poison' in x) || x.poison === null || FACT_TYPES.poison(x.poison, {})))
    && v.parents.some((x) => isObj(x) && isObj(x.poison)),
  // What its flowers and leaves look like, by part (FLOWER_FORM, LEAF_FORM); its texture; its shape.
  flower_form: (v) => formOf(FLOWER_FORM)(v),
  leaf_form: (v) => formOf(LEAF_FORM)(v),
  texture: wordsOf(TEXTURES),
  habit_form: wordsOf(HABIT_FORMS),
  climbs_by: wordsOf(CLIMBING),
  thorns: (v) => typeof v === 'boolean',
  trunk: (v) => typeof v === 'number' && v > 0 && v <= 20,
  native: (v, e) => typeof v === 'string' && (!e.native || e.native.includes(v)),
  nativar: (v) => typeof v === 'boolean',
  dog: (v, e) => typeof v === 'string' && (!e.dog || e.dog.includes(v)),
  nectar: (v, e) => typeof v === 'string' && (!e.nectar || e.nectar.includes(v)),
  bird: (v, e) => typeof v === 'string' && (!(e.bird ?? e.nectar) || (e.bird ?? e.nectar).includes(v)),
  deer: (v, e) => typeof v === 'string' && (!e.deer || e.deer.includes(v)),
  maintenance: (v, e) => typeof v === 'string' && (!e.maintenance || e.maintenance.includes(v)),
  self_seed: (v, e) => typeof v === 'string' && (!e.self_seed || e.self_seed.includes(v)),
  host: (v) => typeof v === 'string',
  // Caterpillars its sources name it a host for (names, never a sentence); and its genus's count of native caterpillar
  // species (Shropshire & Tallamy), each state's own being in its state file.
  hosts: (v) => Array.isArray(v) && v.length > 0 && new Set(v).size === v.length && v.every((x) => typeof x === 'string' && x.length >= 3 && x.length <= 80),
  // Native to Canada or the US mainland, by Kew's checklist (written only where it is): the caterpillar-host rule's.
  native_na: (v) => v === true,
  // Its older botanical names, Kew's homotypic synonyms ("Mahonia aquifolium"): searched, as its own name is.
  botanical_synonyms: (v) => Array.isArray(v) && v.length > 0 && v.length <= 30 && v.every((x) => typeof x === 'string' && /^[A-Z][a-z-]+ (× )?[a-z][a-z-]+/.test(x) && x.length <= 80),
  host_genus: (v) => isObj(v) && Object.keys(v).every((k) => k === 'genus' || k === 'species') && typeof v.genus === 'string' && /^[A-Z][a-z]+$/.test(v.genus)
    && Number.isInteger(v.species) && (v.species as number) > 0,
  edible: (v) => typeof v === 'boolean', fall_color: (v) => typeof v === 'boolean', winter_interest: (v) => typeof v === 'boolean',
  clay_ok: (v) => typeof v === 'boolean', wet_feet: (v) => typeof v === 'boolean', dry_shade: (v) => typeof v === 'boolean',
  taproot: (v) => typeof v === 'boolean',
  // A plant's degree in USGS's register of introduced plants reproducing in the wild in the lower 48, in its own terms
  // (US-RIIS: scripts/catalog/riis.mjs). Stated in its details; never a reason to hide it (that's the state's law).
  wild_us: (v) => v === 'widespread invasive' || v === 'invasive' || v === 'established',
  // A tree that keeps its branches to the ground (NC State's tags: docs/catalog-sources.md).
  low_branched: (v) => typeof v === 'boolean',
  // Leaves: their colors, whether they stay through winter, needles; fall colors; how fast it grows.
  leaf_color: wordsOf(LEAF_COLORS), fall_colors: wordsOf(FALL_COLORS),
  foliage: (v) => FOLIAGE.includes(v as string), needles: (v) => typeof v === 'boolean',
  // (Where no source gives foliage: its species' USA-NPN records, or its relatives: scripts/catalog/winter.mjs.)
  winter_leaves: (v) => isObj(v) && FOLIAGE.includes(v.leaves as string) && (v.basis === 'records' || v.basis === 'relatives') && Number.isInteger(v.n) && (v.n as number) > 0,
  growth_rate: (v) => GROWTH_RATES.includes(v as string),
  // Who it attracts and what it tolerates, as NC State lists them (never a level); the animals it's a problem for (a
  // warning: one not listed isn't safe); its upkeep, as NC State rates it (the earlier list's `maintenance` is tasks).
  attracts: wordsOf(ATTRACTS), tolerates: wordsOf(TOLERATES), problem_for: wordsOf(PETS),
  maintenance_level: (v) => MAINTENANCE_LEVELS.includes(v as string),
  // What shows in winter: bark and its colors, stem and fruit colors, when the fruit's there (NC State's words).
  bark: wordsOf(BARK), bark_color: wordsOf(BARK_COLORS), stem_color: wordsOf(PART_COLORS),
  fruit_season: wordsOf(FRUIT_SEASONS), fruit_color: wordsOf(PART_COLORS),
  // Which parts are edible, as NC State marks them; written only beside `edible`.
  edible_parts: wordsOf(EDIBLE_PARTS),
  // What it takes to fruit (separate sexes, a partner needed, better with one, on its own); a cultivar's own sex.
  fruit_set: (v) => FRUIT_SET.includes(v as string), sex: (v) => SEXES.includes(v as string),
  // The cultivars its description names as its pollinizer, as named (a cultivar's own: never inherited).
  partners: (v) => Array.isArray(v) && v.length > 0 && v.length <= 8 && v.every((x) => typeof x === 'string' && x.length >= 2 && x.length <= 40),
  // Flowers: when (seasons; a bloom's months are `bloom`, the earlier list's) and their colors.
  bloom_season: wordsOf(BLOOM_SEASONS), flower_color: wordsOf(FLOWER_COLORS),
};
export const FACT_NAMES = Object.keys(FACT_TYPES);
const RECORD_KEYS = new Set(['id', 'common', 'botanical', 'short', 'synonyms', 'usda', 'parent', 'inherits', 'src', 'audited', 'facts']);
/** What `inherits` may name: a cultivar's size, which every other cultivar has from its own sources. */
const MAY_INHERIT = ['height', 'width'];
const STATE = /^[A-Z]{2}$/;

/** Structural problems (the file mustn't ship with any). */
export function catalogErrors(file: CatalogFile): string[] {
  const errs: string[] = [];
  const enums = file.meta.enums ?? {};
  const sources = file.meta.sources ?? {};
  if (file.meta.zones !== 'half') errs.push('meta.zones must be "half" (zones on the half-zone scale; see docs/catalog-format.md)');
  for (const [id, s] of Object.entries(sources)) {
    if (!s || typeof s.title !== 'string' || !['reference', 'nursery', 'observation', 'unverified'].includes(s.trust)) errs.push(`source ${id}: needs a title and a trust of reference, nursery, observation or unverified`);
  }
  const ids = new Map<string, number>();
  for (const r of file.plants) ids.set(r.id, (ids.get(r.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) errs.push(`${id}: id used ${n} times`);
  const byId = new Map(file.plants.map((r) => [r.id, r]));
  // (A folded record's id stands for a record that's there, and is no longer one itself.)
  for (const [from, to] of Object.entries(file.meta.moved ?? {})) {
    if (byId.has(from)) errs.push(`meta.moved: ${from} is still a record`);
    if (typeof to !== 'string' || !byId.has(to)) errs.push(`meta.moved: ${from} stands for ${String(to)}, which isn't a record`);
  }
  for (const r of file.plants) {
    const at = r.id || '(no id)';
    if (!/^[a-z0-9-]+$/.test(r.id ?? '')) errs.push(`${at}: id must be lowercase letters, digits and dashes`);
    if (typeof r.common !== 'string' || !r.common.trim()) errs.push(`${at}: no common name`);
    // Typos at the top level (a "parnet") would otherwise vanish silently.
    for (const k of Object.keys(r)) if (!RECORD_KEYS.has(k)) errs.push(`${at}: unknown key ${k}`);
    for (const k of ['botanical', 'short', 'usda', 'parent'] as const) if (r[k] != null && typeof r[k] !== 'string') errs.push(`${at}: ${k} must be text`);
    if (r.synonyms != null && !(Array.isArray(r.synonyms) && r.synonyms.every((x) => typeof x === 'string'))) errs.push(`${at}: synonyms must be a list of names`);
    if (r.src != null && !(Array.isArray(r.src) && r.src.every((x) => typeof x === 'string'))) errs.push(`${at}: src must be a list of source ids`);
    if (r.parent) {
      const p = byId.get(r.parent);
      if (!p) errs.push(`${at}: parent ${r.parent} isn't in the catalog`);
      else if (p.parent) errs.push(`${at}: parent ${r.parent} is itself a cultivar`);
      if (r.parent === r.id) errs.push(`${at}: its own parent`);
    }
    if (r.inherits != null) {
      if (!(Array.isArray(r.inherits) && r.inherits.length && r.inherits.every((k) => MAY_INHERIT.includes(k)))) errs.push(`${at}: inherits must list height or width`);
      if (!r.parent) errs.push(`${at}: inherits, but has no species to take it from`);
    }
    if (r.audited != null && !/^\d{4}-\d{2}-\d{2}$/.test(r.audited)) errs.push(`${at}: audited must be a date or null`);
    for (const s of r.src ?? []) if (!sources[s]) errs.push(`${at}: unknown source ${s}`);
    if (!r.facts || typeof r.facts !== 'object') { errs.push(`${at}: no facts`); continue; }
    for (const [key, raw] of Object.entries(r.facts)) {
      const check = FACT_TYPES[key];
      if (!check) { errs.push(`${at}: unknown fact ${key}`); continue; }
      const f = factOf(r, key)!;
      if (!f.prov.src.length) errs.push(`${at}.${key}: no source`);
      for (const s of f.prov.src) if (!sources[s]) errs.push(`${at}.${key}: unknown source ${s}`);
      if (isSourced(raw)) {
        for (const k of Object.keys(raw)) if (!['v', 'src', 'at', 'check', 'alt', 'from'].includes(k)) errs.push(`${at}.${key}: unknown key ${k}`);
        if (raw.from != null && (raw.from !== 'description' || raw.v == null)) errs.push(`${at}.${key}: from must be description, for a value read from one`);
        if (raw.alt != null) {
          const a = raw.alt as Partial<Reported>;
          if (!REPORTABLE.has(key)) errs.push(`${at}.${key}: no other value (alt) is taken for ${key}`);
          else if (!isObj(a) || !('v' in a) || a.v == null || !check(a.v, enums) || !Array.isArray(a.src) || !a.src.length || !['confirmed', 'single', 'likely', 'reported'].includes(a.check as string)) errs.push(`${at}.${key}: alt needs a value, its sources, and a check of confirmed, single, likely or reported`);
          else if (raw.v == null || JSON.stringify(a.v) === JSON.stringify(raw.v)) errs.push(`${at}.${key}: alt is for a value that differs from the one shown`);
          else for (const s of a.src) if (!sources[s]) errs.push(`${at}.${key}: unknown source ${s}`);
        }
        if (raw.at != null && !STATE.test(raw.at)) errs.push(`${at}.${key}: "at" must be a state code`);
        if (raw.check != null && !['agree', 'confirmed', 'disputed', 'single', 'likely', 'reported'].includes(raw.check)) errs.push(`${at}.${key}: unknown check ${raw.check}`);
      }
      if (f.v != null && !check(f.v, enums)) errs.push(`${at}.${key}: unexpected value ${JSON.stringify(f.v)}`);
    }
  }
  return errs;
}

/** Plausibility problems, for the audit's review list (they don't block shipping). */
export function catalogWarnings(file: CatalogFile): string[] {
  const out: string[] = [];
  const byBotanical = new Map(file.plants.filter((r) => !r.parent).map((r) => [(r.botanical ?? '').toLowerCase(), r]));
  const byIdW = new Map(file.plants.map((r) => [r.id, r])); // (a cultivar taking its species' spread: `inherits`)
  // Rough tallest plausible height by form (feet), to catch unit slips (inches as feet).
  const MAX_HEIGHT: Record<string, number> = { Perennial: 15, Annual: 12, 'Grass/Sedge': 20, Fern: 8, Bulb: 8, Shrub: 30, Cactus: 25, Vine: 100, 'Aquatic/Emergent': 15, Tree: 200 };
  for (const r of file.plants) {
    const v = (k: string) => factOf(r, k)?.v as never;
    const form = v('form') as string | undefined;
    const h = v('height') as { min?: number; max?: number } | undefined, w = v('width') as { min?: number; max?: number } | undefined;
    for (const [k, rr] of [['height', h], ['width', w]] as const) {
      if (rr?.min != null && rr.max != null && rr.min > rr.max) out.push(`${r.id}: ${k} range backwards (${rr.min} > ${rr.max})`);
    }
    // (A habit the spreading table doesn't know: said nothing of, rather than guessed at. Add it to src/spread.ts.)
    const habit = v('habit') as string | undefined;
    // (Worded without "spread": the audit's writer holds back a new width on a warning that mentions it.)
    if (typeof habit === 'string' && !(habit in HABIT_SPREAD)) out.push(`${r.id}: habit "${habit}" isn't in the habit table`);
    if (form && h?.max != null && MAX_HEIGHT[form] != null && h.max > MAX_HEIGHT[form]) out.push(`${r.id}: ${h.max} ft is tall for ${/^[aeiou]/i.test(form) ? 'an' : 'a'} ${form.toLowerCase()}`);
    if (h?.max != null && h.max < 0.25) out.push(`${r.id}: under 3 in tall (${Math.round(h.max * 12)} in): inches read as feet, or the other way?`);
    const zmin = v('zone_min') as number | undefined, zmax = v('zone_max') as number | undefined;
    if (zmin != null && zmax != null && zmin > zmax) out.push(`${r.id}: zones backwards (${zmin} > ${zmax})`);
    const sm = v('sun_most') as string | undefined, sl = v('sun_least') as string | undefined;
    if (sm && sl && SUN.indexOf(sm) > SUN.indexOf(sl)) out.push(`${r.id}: sun range backwards (${sm} to ${sl})`);
    if (!r.parent && /['‘’]/.test(r.botanical ?? '')) {
      const species = (r.botanical ?? '').split(/['‘’]/)[0].trim().toLowerCase();
      out.push(`${r.id}: a cultivar with ${byBotanical.has(species) ? 'a species record it could point to' : 'no species record in the catalog'}`);
    }
    if (/['‘’].+['‘’]/.test(r.common) && !/['‘’]/.test(r.botanical ?? '')) out.push(`${r.id}: named as a cultivar, but its botanical name doesn't say which`);
    // (A botanical name has no parentheses: a strain, a group or a note in them is the earlier list's way of writing
    // what the naming rules put otherwise, docs/catalog-format.md "Names". Worded the same for each, so the review
    // lists them together. Jason, from the UI review, 2026-11-01.)
    if (/[()]/.test(r.botanical ?? '')) out.push(`${r.id}: parentheses in its botanical name: a cultivar is quoted; a seed strain or ecotype is named "Common name (strain)"`);
    if (!v('width') && !(r.inherits?.includes('width') && r.parent && byIdW.get(r.parent) && factOf(byIdW.get(r.parent)!, 'width'))) out.push(`${r.id}: no spread`);
  }
  return out;
}
