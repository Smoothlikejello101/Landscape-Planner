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
 * What other sources say where they differ from the value shown (shown beside it, labelled with who says it,
 * and usable in filters by the user's choice): the side that didn't lead (docs/catalog-sources.md, "Where
 * sources disagree"). Only for the garden facts decided that way; never toxicity, invasiveness or native
 * status (a form where sources differ keeps both forms instead). A pair (sun_most and sun_least, zone_min and
 * zone_max) is one source's whole range: an `alt` on each half where it differs from the value shown.
 */
export const REPORTABLE = new Set(['height', 'width', 'zone_min', 'zone_max', 'sun_most', 'sun_least', 'water', 'deer']);
export interface Reported<T = unknown> { v: T; src: string[]; check: 'confirmed' | 'single' | 'likely' | 'reported' }
/** A fact with its own sourcing (else a plain value, sourced by its record). */
export interface SourcedFact<T = unknown> { v: T; src?: string[]; at?: string; check?: Check; alt?: Reported<T> }
export interface CatalogRecord {
  id: string;
  common: string;
  botanical?: string;
  short?: string;
  synonyms?: string[];
  usda?: string;
  /** Species of a cultivar. */
  parent?: string;
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
}

/**
 * Facts a cultivar takes from its species when it doesn't state them: what
 * comes with the species (where it's native, what it tolerates, what it
 * feeds, how toxic it is). Not size, trunk, flower color or habit, which
 * cultivars are bred to change.
 */
export const INHERITED = new Set([
  'form', 'zone_min', 'zone_max', 'sun_most', 'sun_least', 'water', 'humidity', 'tox', 'dog', 'thorns',
  'native', 'host', 'nectar', 'bird', 'deer', 'edible', 'clay_ok', 'wet_feet', 'dry_shade', 'taproot', 'invasive',
]);

const isSourced = (f: unknown): f is SourcedFact =>
  !!f && typeof f === 'object' && !Array.isArray(f) && 'v' in (f as object);
/** A fact's value and provenance, given its record's default sources. */
export function factOf(rec: CatalogRecord, key: string): { v: unknown; prov: Provenance } | undefined {
  if (!(key in rec.facts)) return undefined;
  const f = rec.facts[key];
  if (isSourced(f)) return { v: f.v, prov: { src: f.src ?? rec.src ?? [], ...(f.at ? { at: f.at } : {}), ...(f.check ? { check: f.check } : {}), ...(f.alt ? { alt: f.alt } : {}) } };
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
    if (rec.parent) p.parent = rec.parent;
    const prov: Record<string, Provenance> = {};
    const keys = new Set([...Object.keys(rec.facts), ...(parent ? Object.keys(parent.facts).filter((k) => INHERITED.has(k)) : [])]);
    for (const key of keys) {
      const own = factOf(rec, key);
      const got = own ?? (parent ? factOf(parent, key) : undefined);
      if (!got) continue;
      const pv = own ? got.prov : { ...got.prov, inherited: true };
      // Known unknown: no value, but the record says the sources were checked.
      if (got.v == null) { prov[key] = { ...pv, unknown: true }; continue; }
      if (pv.alt && REPORTABLE.has(key)) (p.reported ??= {})[key] = key === 'zone_max' && wholeZoneMax && Number.isInteger(pv.alt.v) ? (pv.alt.v as number) + 0.5 : pv.alt.v;
      if (key === 'form' && Array.isArray(got.v)) { p.form = got.v[0]; p.forms = got.v as string[]; prov[key] = pv; continue; }
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
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isRange = (v: unknown) => {
  if (!isObj(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.every((k) => ['min', 'max', 'med'].includes(k) && typeof v[k] === 'number' && (v[k] as number) > 0);
};
const isHalfZone = (v: unknown) => typeof v === 'number' && Number.isInteger(v * 2) && v >= 1 && v <= 13.5;
const isMonth = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12;
/** Fact types: what a value must look like. Unknown fact names are errors (typos). */
const FACT_TYPES: Record<string, (v: unknown, enums: Record<string, string[]>) => boolean> = {
  // One form, or a short list, primary first (redbud: understory tree and shrub).
  form: (v, e) => [v].flat().length > 0 && [v].flat().length <= 3 && [v].flat().every((x) => typeof x === 'string' && (!e.form || e.form.includes(x))) && new Set([v].flat()).size === [v].flat().length,
  habit: (v) => typeof v === 'string',
  height: isRange, width: isRange,
  // (Half-zone scale: 7a is 7, 7b is 7.5; see src/climate.ts.)
  zone_min: (v) => isHalfZone(v), zone_max: (v) => isHalfZone(v),
  sun_most: (v) => SUN.includes(v as string), sun_least: (v) => SUN.includes(v as string),
  water: (v, e) => typeof v === 'string' && (!e.water || e.water.includes(v)),
  bloom: (v) => isObj(v) && Object.keys(v).every((k) => ['start', 'end', 'color'].includes(k))
    && (v.start == null || isMonth(v.start)) && (v.end == null || isMonth(v.end)) && (v.color == null || typeof v.color === 'string'),
  humidity: (v) => v === 'humid' || v === 'dry' || v === 'either',
  tox: (v) => isObj(v) && Object.keys(v).length > 0
    && Object.entries(v).every(([k, x]) => (k === 'people' ? TOX_PEOPLE : ['dog', 'cat', 'horse'].includes(k) ? TOX_ANIMAL : []).includes(x as string)),
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
  edible: (v) => typeof v === 'boolean', fall_color: (v) => typeof v === 'boolean', winter_interest: (v) => typeof v === 'boolean',
  clay_ok: (v) => typeof v === 'boolean', wet_feet: (v) => typeof v === 'boolean', dry_shade: (v) => typeof v === 'boolean',
  taproot: (v) => typeof v === 'boolean', invasive: (v) => typeof v === 'boolean',
};
export const FACT_NAMES = Object.keys(FACT_TYPES);
const RECORD_KEYS = new Set(['id', 'common', 'botanical', 'short', 'synonyms', 'usda', 'parent', 'src', 'audited', 'facts']);
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
        for (const k of Object.keys(raw)) if (!['v', 'src', 'at', 'check', 'alt'].includes(k)) errs.push(`${at}.${key}: unknown key ${k}`);
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
  // Rough tallest plausible height by form (feet), to catch unit slips (inches as feet).
  const MAX_HEIGHT: Record<string, number> = { Perennial: 15, Annual: 12, 'Grass/Sedge': 20, Fern: 8, Bulb: 8, Shrub: 30, Cactus: 25, Vine: 100, 'Aquatic/Emergent': 15, 'Tree (understory)': 60, 'Tree (canopy)': 200 };
  for (const r of file.plants) {
    const v = (k: string) => factOf(r, k)?.v as never;
    const form = v('form') as string | undefined;
    const h = v('height') as { min?: number; max?: number } | undefined, w = v('width') as { min?: number; max?: number } | undefined;
    for (const [k, rr] of [['height', h], ['width', w]] as const) {
      if (rr?.min != null && rr.max != null && rr.min > rr.max) out.push(`${r.id}: ${k} range backwards (${rr.min} > ${rr.max})`);
    }
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
    if (!v('width')) out.push(`${r.id}: no spread`);
  }
  return out;
}
