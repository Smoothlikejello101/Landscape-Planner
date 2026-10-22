// Where catalog plants are recorded growing wild near the garden: the county its ZIP is in (from the ZIP
// tables, public/climate/) and the wild-record files (public/wild/1/<state FIPS>.json; 1 is the format) for
// its state and for any state over a county line from it (public/wild/1/index.json says which), from USDA PLANTS's county
// records and, for Arkansas, the Arkansas atlas's county maps: docs/wild-records.md. The state files are
// fetched as needed and kept on the device (src/sw.ts). Nothing is stored in the plan: the county comes from
// the ZIP (remembered on this device, so it works offline). County codes are five-digit FIPS as numbers
// (Clark County, Arkansas, 05019, is 5019).
import { state } from './state';
import type { ClimateFile } from './climate';
import { WILD_FORMAT } from './wild-format';

export interface WildFile {
  v: 1;
  /** The state's postal code and FIPS. */
  state: string;
  fips: number;
  /** The sources its records come from, by key. */
  sources: Record<string, { title: string; url?: string }>;
  /** The state's counties (their neighbors in any state), and counties over its line (`state`: theirs; neighbors in it). */
  counties: Record<string, { name: string; state?: string; near: number[] }>;
  /** Catalog id → the counties it's recorded in (its own taxon's records). */
  plants: Record<string, number[]>;
  /** Each plant's sources (keys of `sources`). */
  src?: Record<string, string[]>;
  /** Ids whose records are their species' (a cultivar, mix, or variety mapped only as its species). */
  species?: string[];
  /** Bloom months in the state from flowering records (scripts/catalog/bloom.mjs): the window holding 80% of them. */
  bloom?: Record<string, { start: number; end: number; peak: number; n: number; area: 'state' | 'region' }>;
  /** Ids whose bloom months are their species' records. */
  bloomSpecies?: string[];
  /** Native status in the state, from Kew's World Checklist (scripts/catalog/wcvp.mjs): N native, I introduced. */
  native?: Record<string, 'N' | 'I'>;
  /** Ids whose native status is their species' (a cultivar, mix, or variety). */
  nativeSpecies?: string[];
  /** Plants a law regulates here (the state's list, then the federal one): id → keys of `rules`. */
  regulated?: Record<string, string[]>;
  /** What each list says of the plants it names, and where it says it (scripts/catalog/regulated-plants.json). */
  rules?: Record<string, RuleLine>;
  /** For a plant a whole-genus entry took in, the genus, by rule key: { id: { "AR:lythrum": "Lythrum" } }. */
  genusWide?: Record<string, Record<string, string>>;
}
/**
 * A law's line: what it says of a plant ("Prohibited in Arkansas: …"), the rule, and when it was read. `tier`: "ban"
 * (the rule forbids selling, planting or moving it) or "listed" (it lists the plant, with lighter duties); files
 * from before tiers have none, read as a ban.
 */
export interface RuleLine { says: string; tier?: 'ban' | 'listed'; title: string; url: string; edition: string; read: string }
/** A law's line for a plant here, and, where the plant is native to the state all the same, why the law covers it. */
export interface RuleHere extends RuleLine {
  /** Its tier, read (a line from an older file, with none: shown as a ban). */
  tier: 'ban' | 'listed';
  /** Where the plant is native to the state all the same: why the law covers it, and the state's name. */
  native?: string;
  nativeTo?: string;
}
/** A plant's native status in the garden's state (`species`: its species', a cultivar's). */
export interface NativeHere { status: 'N' | 'I'; stateName: string; species: boolean; source: string }
/** A plant's bloom months where the garden is: its state's (or, with too few records there, its region's). */
export interface LocalBloom { start: number; end: number; peak: number; n: number; area: 'state' | 'region'; stateName: string; species: boolean; source: string }
export interface WildIndex { v: 1; states: Record<string, string>; border: Record<string, number[]> }
/** What the records say for a plant, from the garden's county. `species`: they're its species' records (a cultivar); `sources`: their titles. */
export type WildHere = { species: boolean; sources: string[] } & (
  | { where: 'county'; county: string }
  | { where: 'near'; counties: string[] }
  | { where: 'state'; count: number; stateName: string });

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
  VI: 'U.S. Virgin Islands', GU: 'Guam', AS: 'American Samoa', MP: 'Northern Mariana Islands',
};
/** A county as people name it: "Clark County", "Caddo Parish", "Baltimore (city)", Alaska's areas by name. */
export function countyName(name: string, fips: number): string {
  const short = shortCountyName(name, fips);
  const st = Math.floor(fips / 1000);
  return short !== name || NO_COUNTIES.has(st) || (CITY_STATES.has(st) && fips % 1000 >= 500 && name.endsWith('City')) ? short : `${name} County`;
}
/**
 * In a list of neighbors: the bare name, but an independent city (a code of 500 or more: Virginia's, Baltimore,
 * St. Louis, Carson City) or the District marked, so "Roanoke" the county and "Roanoke (city)" differ.
 */
const CITY_STATES = new Set([24, 29, 32, 51]);
/** Places with no counties as such (Alaska's boroughs and areas, DC, Puerto Rico's and the island territories'). */
const NO_COUNTIES = new Set([2, 11, 60, 66, 69, 72, 78]);
export function shortCountyName(name: string, fips: number): string {
  const st = Math.floor(fips / 1000);
  if (st === 22) return `${name} Parish`;
  // (Independent cities: Virginia's, Baltimore, St. Louis, Carson City. Texas's counties run past 500.)
  if (fips % 1000 >= 500 && CITY_STATES.has(st) && !/City$/.test(name)) return `${name} (city)`;
  return name;
}

const COUNTY_KEY = 'lp-zip-county';
const WILD = `wild/${WILD_FORMAT}`;
let loaded: { zip: string; county: number; files: WildFile[] } | null = null;
let pending: Promise<void> | null = null;
let waiting: (() => void)[] = [];
/** A lookup that came back with nothing (offline, say) is tried again after this long. */
const RETRY_MS = 60_000;
let failed: { zip: string; at: number } | null = null;

/** The county a ZIP is in, from its ZIP table; remembered on this device. */
async function countyOf(zip: string, fetcher: typeof fetch): Promise<number | null> {
  // ([zip, county] pairs, the latest last: a ZIP-keyed object would sort numerically.)
  let saved: [string, number][] = [];
  try { const v = JSON.parse(localStorage.getItem(COUNTY_KEY) ?? '[]'); if (Array.isArray(v)) saved = v.filter((x) => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'number'); } catch { /* none */ }
  const known = saved.find(([z]) => z === zip);
  if (known) return known[1];
  try {
    const res = await fetcher(`climate/${zip.slice(0, 3)}.json`);
    if (!res.ok) return null;
    const f = await res.json() as ClimateFile;
    const c = f?.zips?.[zip]?.[3];
    if (typeof c !== 'number' || !(c > 0)) return null;
    // (A few ZIPs, for plans in different places; the latest kept.)
    const keep = saved.filter(([z]) => z !== zip).slice(-19);
    try { localStorage.setItem(COUNTY_KEY, JSON.stringify([...keep, [zip, c]])); } catch { /* looked up again next time */ }
    return c;
  } catch { return null; }
}
async function getJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  try { const res = await fetcher(url); return res.ok ? await res.json() : null; } catch { return null; }
}
const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);
/** Valid enough to use (anything else, or a newer format, is left alone). */
const isWildFile = (d: unknown): d is WildFile => isObj(d) && d.v === 1 && typeof d.state === 'string' && typeof d.fips === 'number' && isObj(d.sources) && isObj(d.counties) && isObj(d.plants);
const isIndex = (d: unknown): d is WildIndex => isObj(d) && d.v === 1 && isObj(d.states) && isObj(d.border);

/**
 * Load the records for the garden's county (if it has a location), then call `done` (to redraw what shows
 * them). Safe to call often: it looks up once per ZIP (offline or not found: again when the ZIP changes or
 * the app restarts).
 */
export function loadWild(done?: () => void, fetcher: typeof fetch = fetch): Promise<void> {
  const zip = state.location?.zip;
  if (!zip) { loaded = null; return Promise.resolve(); }
  if (loaded?.zip === zip) return Promise.resolve();
  if (failed?.zip === zip && Date.now() - failed.at < RETRY_MS) return Promise.resolve();
  if (done && !waiting.includes(done)) waiting.push(done); // (every caller is told, those that joined a lookup under way too)
  if (pending) return pending;
  pending = (async () => {
    const county = await countyOf(zip, fetcher);
    const files: WildFile[] = [];
    let index: unknown = null, wanted = 0;
    if (county) {
      index = await getJson(`${WILD}/index.json`, fetcher);
      if (isIndex(index)) {
        const own = Math.floor(county / 1000);
        const want = new Set([...(index.states[own] ? [own] : []), ...(index.border[county] ?? [])]);
        wanted = want.size;
        for (const s of want) {
          const f = await getJson(`${WILD}/${String(s).padStart(2, '0')}.json`, fetcher);
          if (isWildFile(f)) files.push(f);
        }
      }
    }
    // (Nothing found, offline say: tried again after a while, or when the ZIP changes.)
    if (!county || !isIndex(index) || files.length < wanted) failed = { zip, at: Date.now() };
    else if (state.location?.zip === zip) { loaded = { zip, county, files }; failed = null; }
  })().finally(() => {
    pending = null;
    const ws = waiting; waiting = [];
    for (const w of ws) w();
    // (The ZIP changed while this one was looked up: look up the new one.)
    if (state.location?.zip && state.location.zip !== zip && loaded?.zip !== state.location.zip) void loadWild(ws[0]);
  });
  return pending;
}

/** For tests: forget what was loaded, here and on the device. */
export function resetWild() { loaded = null; pending = null; waiting = []; failed = null; try { localStorage.removeItem(COUNTY_KEY); } catch { /* none */ } }

/** Where a plant (a cultivar: its species) is recorded growing wild, said from the garden's county. Null: nothing to say. */
export function wildHere(p: { id: string; parent?: string }): WildHere | null {
  if (!loaded || loaded.zip !== state.location?.zip || !loaded.county || !loaded.files.length) return null;
  const { county: here, files } = loaded;
  const recordsFor = (id: string) => files.flatMap((f) => f.plants[id] ?? []);
  let id = p.id, records = recordsFor(id), species = files.some((f) => f.plants[id] && f.species?.includes(id));
  if (!records.length && p.parent) { id = p.parent; records = recordsFor(id); species = records.length > 0; }
  if (!records.length) return null;
  const sources = [...new Set(files.flatMap((f) => (f.plants[id] ? (f.src?.[id] ?? Object.keys(f.sources)).map((k) => f.sources[k]?.title).filter(Boolean) : [])))] as string[];
  const info = (c: number) => files.map((f) => f.counties[c]).find(Boolean);
  const hereState = Math.floor(here / 1000);
  if (records.includes(here)) return { where: 'county', county: countyName(info(here)?.name ?? '', here), species, sources };
  // (The garden's county as each file knows it: its own, or as a county over its line.)
  const near = [...new Set(files.flatMap((f) => f.counties[here]?.near ?? []))].filter((c) => records.includes(c));
  if (near.length) {
    // (Over a state line: "Miller, AR".)
    const named = near.map((c) => { const i = info(c); if (!i) return ''; const n = shortCountyName(i.name, c); return Math.floor(c / 1000) === hereState ? n : `${n}, ${files.find((f) => f.fips === Math.floor(c / 1000))?.state ?? i.state ?? ''}`; });
    return { where: 'near', counties: named.filter(Boolean).sort(), species, sources };
  }
  const ownFile = files.find((f) => f.fips === hereState);
  if (!ownFile) return null;
  const count = (ownFile.plants[id] ?? []).length;
  return count ? { where: 'state', count, stateName: STATE_NAMES[ownFile.state] ?? ownFile.state, species, sources } : null;
}

/** When a plant (a cultivar: its species) blooms where the garden is, from flowering records; null where there are too few. */
export function localBloom(p: { id: string; parent?: string }): LocalBloom | null {
  if (!loaded || loaded.zip !== state.location?.zip || !loaded.county) return null;
  const own = loaded.files.find((f) => f.fips === Math.floor(loaded!.county / 1000));
  if (!own?.bloom) return null;
  let id = p.id, b = own.bloom[id], species = !!b && !!own.bloomSpecies?.includes(id);
  if (!b && p.parent) { id = p.parent; b = own.bloom[id]; species = !!b; }
  if (!b) return null;
  return { ...b, stateName: STATE_NAMES[own.state] ?? own.state, species, source: own.sources.gbifBloom?.title ?? 'GBIF.org' };
}

/** The garden's state, by name, once its county is known and its file has native status ("Arkansas"); null before. */
export function gardenStateName(): string | null {
  if (!loaded || loaded.zip !== state.location?.zip || !loaded.county) return null;
  const own = loaded.files.find((f) => f.fips === Math.floor(loaded!.county / 1000));
  return own?.native ? STATE_NAMES[own.state] ?? own.state : null;
}
/** Whether a plant (a cultivar: its species) is native to the garden's state, by Kew's checklist; null where it doesn't list it there. */
export function nativeHere(p: { id: string; parent?: string }): NativeHere | null {
  if (!loaded || loaded.zip !== state.location?.zip || !loaded.county) return null;
  const own = loaded.files.find((f) => f.fips === Math.floor(loaded!.county / 1000));
  if (!own?.native) return null;
  let id = p.id, s = own.native[id], species = !!s && !!own.nativeSpecies?.includes(id);
  if (!s && p.parent) { id = p.parent; s = own.native[id]; species = !!s; }
  if (!s) return null;
  return { status: s, stateName: STATE_NAMES[own.state] ?? own.state, species, source: own.sources.wcvp?.title ?? 'World Checklist of Vascular Plants (Kew)' };
}
/**
 * What the law says of a plant (a cultivar: its species, which the law names) in the garden's state: its state's
 * list's line, then the federal list's. Empty where no list we've read names it (not "allowed": docs/regulated-plants.md).
 */
export function regulatedHere(p: { id: string; parent?: string }): RuleHere[] {
  if (!loaded || loaded.zip !== state.location?.zip || !loaded.county) return [];
  const own = loaded.files.find((f) => f.fips === Math.floor(loaded!.county / 1000));
  if (!own?.regulated || !own.rules) return [];
  const id = own.regulated[p.id] ? p.id : p.parent && own.regulated[p.parent] ? p.parent : null;
  if (!id) return [];
  // Native here, by Kew's checklist, and listed all the same: say why, or the two lines read as a contradiction.
  const native = nativeHere(p);
  return own.regulated[id].flatMap((k) => {
    const r = own.rules![k];
    if (!r || typeof r.says !== 'string' || typeof r.url !== 'string' || !r.url.startsWith('https://')) return [];
    // (Shown red unless the file says "listed"; but said in words only as the file says it: a line from an older
    // file, with no tier, is "covered", never "banned", which a listing isn't.)
    const tier = r.tier === 'listed' ? 'listed' : 'ban';
    const said = r.tier === 'listed' || r.tier === 'ban' ? r.tier : undefined;
    return [native?.status === 'N'
      ? { ...r, tier, native: nativeAndListed(native, said, own.genusWide?.[id]?.[k], k.startsWith('US:')), nativeTo: native.stateName }
      : { ...r, tier }];
  });
}
/**
 * Why a law covers a plant native to the state: "Native to Arkansas, but this rule bans every Lythrum species,
 * natives included." (a whole-genus entry), or "Native to Arkansas, and still banned by this rule." (one it names).
 */
export function nativeAndListed(n: NativeHere, tier: 'ban' | 'listed' | undefined, genus?: string, federal = false): string {
  const who = n.species ? `Its species is native to ${n.stateName}` : `Native to ${n.stateName}`;
  // (The federal list governs moving a plant into or between states, not growing it: said as what it is.)
  if (federal) return genus ? `${who}, but every ${genus} species is a federal noxious weed.` : `${who}, and still a federal noxious weed.`;
  const [does, done] = tier === 'ban' ? ['bans', 'banned'] : tier === 'listed' ? ['lists', 'listed'] : ['covers', 'covered'];
  return genus ? `${who}, but this rule ${does} every ${genus} species, natives included.` : `${who}, and still ${done} by this rule.`;
}
/**
 * A plant's law lines in short, for its row in the picker: "Prohibited in Arkansas"; where it's native to the state
 * all the same, once, at the end: "Prohibited in Arkansas, though native to Arkansas".
 */
export function lawShort(lines: RuleHere[]): string {
  const short = lines.map((r) => r.says.split(':')[0]).join('; ');
  const nativeTo = lines.find((r) => r.native)?.nativeTo;
  return nativeTo ? `${short}, though native to ${nativeTo}` : short;
}
/** Native status in words: "Native to Arkansas", "Introduced in Arkansas (not native)". */
export function nativeText(n: NativeHere): string {
  const who = n.species ? 'Its species is ' : '';
  const say = n.status === 'N' ? `native to ${n.stateName}` : `introduced in ${n.stateName} (not native there)`;
  return who ? who + say : say[0].toUpperCase() + say.slice(1);
}

/** Recorded wild in the garden's county or one bordering it (in any state). */
export const wildNearby = (p: { id: string; parent?: string }) => { const w = wildHere(p); return !!w && w.where !== 'state'; };

/** The plant's line, in words ("Recorded growing wild in Clark County"). */
export function wildText(w: WildHere): string {
  const who = w.species ? 'Its species is recorded' : 'Recorded';
  if (w.where === 'county') return `${who} growing wild in ${w.county}`;
  if (w.where === 'near') return `${who} growing wild in a neighboring county (${w.counties.join(w.counties.some((c) => c.includes(',')) ? '; ' : ', ')})`;
  return `${who} growing wild in ${w.count} ${w.stateName} ${w.count === 1 ? 'county' : 'counties'}, none recorded in or next to yours`;
}

