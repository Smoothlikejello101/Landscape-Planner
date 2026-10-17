import type { Plant } from './plants';

// The plant catalog file (public/plants.json), version 2: plant facts, each
// with where it came from. See docs/catalog-format.md.
//
// The rest of the app works with flat Plant objects; `resolveCatalog` turns
// records into those (cultivars filled in from their species), and keeps,
// per plant, where each value came from and whether the record has been
// audited.

export type Trust = 'reference' | 'observation' | 'unverified';
export interface SourceDef { title: string; url?: string; trust: Trust }
export type Check = 'agree' | 'disputed' | 'single';
/** A fact with its own sourcing (else a plain value, sourced by its record). */
export interface SourcedFact<T = unknown> { v: T; src?: string[]; at?: string; check?: Check }
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
}

/** Facts a cultivar takes from its species when it doesn't state them: all but size. */
const NOT_INHERITED = new Set(['height', 'width']);

const isSourced = (f: unknown): f is SourcedFact =>
  !!f && typeof f === 'object' && !Array.isArray(f) && 'v' in (f as object);
/** A fact's value and provenance, given its record's default sources. */
export function factOf(rec: CatalogRecord, key: string): { v: unknown; prov: Provenance } | undefined {
  if (!(key in rec.facts)) return undefined;
  const f = rec.facts[key];
  if (isSourced(f)) return { v: f.v, prov: { src: f.src ?? rec.src ?? [], ...(f.at ? { at: f.at } : {}), ...(f.check ? { check: f.check } : {}) } };
  return { v: f, prov: { src: rec.src ?? [] } };
}

/**
 * Catalog records as the app's plants. A cultivar is completed from its
 * species; `prov` says where each value came from; `unverified` marks
 * records the audit hasn't reached.
 */
export function resolveCatalog(file: CatalogFile): Plant[] {
  const byId = new Map(file.plants.map((r) => [r.id, r]));
  return file.plants.map((rec) => {
    const parent = rec.parent ? byId.get(rec.parent) : undefined;
    const p: Plant = { id: rec.id, common: rec.common };
    if (rec.botanical) p.botanical = rec.botanical;
    if (rec.short) p.short = rec.short;
    if (rec.parent) p.parent = rec.parent;
    const prov: Record<string, Provenance> = {};
    const keys = new Set([...Object.keys(rec.facts), ...(parent ? Object.keys(parent.facts).filter((k) => !NOT_INHERITED.has(k)) : [])]);
    for (const key of keys) {
      const own = factOf(rec, key);
      const got = own ?? (parent ? factOf(parent, key) : undefined);
      if (!got || got.v == null) continue; // unknown: left out
      (p as unknown as Record<string, unknown>)[key] = got.v;
      prov[key] = own ? got.prov : { ...got.prov, inherited: true };
    }
    p.prov = prov;
    // Not yet audited, or (a cultivar) leaning on a species that isn't.
    if (!rec.audited || (parent && !parent.audited && Object.values(prov).some((x) => x.inherited))) p.unverified = true;
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
const isRange = (v: unknown) => {
  const r = v as { min?: unknown; max?: unknown; med?: unknown };
  return !!r && typeof r === 'object' && ['min', 'max', 'med'].every((k) => r[k as 'min'] == null || (typeof r[k as 'min'] === 'number' && (r[k as 'min'] as number) > 0));
};
const isMonth = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12;
/** Fact types: what a value must look like. Unknown fact names are errors (typos). */
const FACT_TYPES: Record<string, (v: unknown, enums: Record<string, string[]>) => boolean> = {
  form: (v, e) => typeof v === 'string' && (!e.form || e.form.includes(v)),
  habit: (v) => typeof v === 'string',
  height: isRange, width: isRange,
  zone_min: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 13,
  zone_max: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 13,
  sun_most: (v) => SUN.includes(v as string), sun_least: (v) => SUN.includes(v as string),
  water: (v, e) => typeof v === 'string' && (!e.water || e.water.includes(v)),
  bloom: (v) => {
    const b = v as { start?: unknown; end?: unknown; color?: unknown };
    return !!b && typeof b === 'object' && (b.start == null || isMonth(b.start)) && (b.end == null || isMonth(b.end)) && (b.color == null || typeof b.color === 'string');
  },
  humidity: (v) => v === 'humid' || v === 'dry' || v === 'either',
  tox: (v) => {
    const t = v as Record<string, unknown>;
    if (!t || typeof t !== 'object') return false;
    return Object.entries(t).every(([k, x]) => (k === 'people' ? TOX_PEOPLE : ['dog', 'cat', 'horse'].includes(k) ? TOX_ANIMAL : []).includes(x as string));
  },
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
const STATE = /^[A-Z]{2}$/;

/** Structural problems (the file mustn't ship with any). */
export function catalogErrors(file: CatalogFile): string[] {
  const errs: string[] = [];
  const enums = file.meta.enums ?? {};
  const sources = file.meta.sources ?? {};
  const ids = new Map<string, number>();
  for (const r of file.plants) ids.set(r.id, (ids.get(r.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) errs.push(`${id}: id used ${n} times`);
  const byId = new Map(file.plants.map((r) => [r.id, r]));
  for (const r of file.plants) {
    const at = r.id || '(no id)';
    if (!/^[a-z0-9-]+$/.test(r.id ?? '')) errs.push(`${at}: id must be lowercase letters, digits and dashes`);
    if (typeof r.common !== 'string' || !r.common.trim()) errs.push(`${at}: no common name`);
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
        if (raw.at != null && !STATE.test(raw.at)) errs.push(`${at}.${key}: "at" must be a state code`);
        if (raw.check != null && !['agree', 'disputed', 'single'].includes(raw.check)) errs.push(`${at}.${key}: unknown check ${raw.check}`);
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
