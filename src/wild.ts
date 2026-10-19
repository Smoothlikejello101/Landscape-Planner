// Where catalog plants are recorded growing wild near the garden: the county its ZIP is in (from the ZIP
// tables, public/climate/) and the wild-record files (public/wild/<state FIPS>.json) for its state and for
// any state over a county line from it (public/wild/index.json says which). Only Arkansas so far, from the
// Arkansas atlas's county maps: docs/wild-records.md. Nothing is stored in the plan: the county comes from
// the ZIP (remembered on this device, so it works offline). County codes are five-digit FIPS as numbers
// (Clark County, Arkansas, 05019, is 5019).
import { state } from './state';
import type { ClimateFile } from './climate';

export interface WildFile {
  v: 1;
  /** The state's postal code and FIPS. */
  state: string;
  fips: number;
  source: { title: string; url?: string; counties?: string };
  /** The state's counties (their neighbors in any state), and counties over its line (`state`: theirs; neighbors in it). */
  counties: Record<string, { name: string; state?: string; near: number[] }>;
  /** Catalog species id → the counties it's recorded in. */
  plants: Record<string, number[]>;
}
export interface WildIndex { v: 1; states: Record<string, string>; border: Record<string, number[]> }
/** What the records say for a plant, from the garden's county. `species`: they're its species' records (a cultivar). */
export type WildHere =
  | { where: 'county'; county: string; species: boolean }
  | { where: 'near'; counties: string[]; species: boolean }
  | { where: 'state'; count: number; stateName: string; species: boolean };

const STATE_NAMES: Record<string, string> = { AR: 'Arkansas' };
const COUNTY_KEY = 'lp-zip-county';
let loaded: { zip: string; county: number; files: WildFile[] } | null = null;
let pending: Promise<void> | null = null;

/** The county a ZIP is in, from its ZIP table; remembered on this device. */
async function countyOf(zip: string, fetcher: typeof fetch): Promise<number | null> {
  let saved: Record<string, number> = {};
  try { saved = JSON.parse(localStorage.getItem(COUNTY_KEY) ?? '{}') ?? {}; } catch { /* none */ }
  if (typeof saved[zip] === 'number') return saved[zip];
  try {
    const res = await fetcher(`climate/${zip.slice(0, 3)}.json`);
    if (!res.ok) return null;
    const f = await res.json() as ClimateFile;
    const c = f?.zips?.[zip]?.[3];
    if (typeof c !== 'number' || !(c > 0)) return null;
    try { localStorage.setItem(COUNTY_KEY, JSON.stringify({ [zip]: c })); } catch { /* looked up again next time */ }
    return c;
  } catch { return null; }
}
async function getJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  try { const res = await fetcher(url); return res.ok ? await res.json() : null; } catch { return null; }
}
const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);
/** Valid enough to use (anything else, or a newer format, is left alone). */
const isWildFile = (d: unknown): d is WildFile => isObj(d) && d.v === 1 && typeof d.state === 'string' && typeof d.fips === 'number' && isObj(d.counties) && isObj(d.plants);
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
  if (pending) return pending;
  pending = (async () => {
    const county = await countyOf(zip, fetcher);
    const files: WildFile[] = [];
    if (county) {
      const index = await getJson('wild/index.json', fetcher);
      if (isIndex(index)) {
        const own = Math.floor(county / 1000);
        const want = new Set([...(index.states[own] ? [own] : []), ...(index.border[county] ?? [])]);
        for (const s of want) {
          const f = await getJson(`wild/${String(s).padStart(2, '0')}.json`, fetcher);
          if (isWildFile(f)) files.push(f);
        }
      }
    }
    if (state.location?.zip === zip) loaded = { zip, county: county ?? 0, files };
  })().finally(() => { pending = null; done?.(); });
  return pending;
}

/** For tests: forget what was loaded, here and on the device. */
export function resetWild() { loaded = null; pending = null; try { localStorage.removeItem(COUNTY_KEY); } catch { /* none */ } }

/** Where a plant (a cultivar: its species) is recorded growing wild, said from the garden's county. Null: nothing to say. */
export function wildHere(p: { id: string; parent?: string }): WildHere | null {
  if (!loaded || loaded.zip !== state.location?.zip || !loaded.county || !loaded.files.length) return null;
  const { county: here, files } = loaded;
  const recordsFor = (id: string) => files.flatMap((f) => f.plants[id] ?? []);
  let records = recordsFor(p.id), species = false;
  if (!records.length && p.parent) { records = recordsFor(p.parent); species = records.length > 0; }
  if (!records.length) return null;
  const info = (c: number) => files.map((f) => f.counties[c]).find(Boolean);
  const hereState = Math.floor(here / 1000);
  if (records.includes(here)) return { where: 'county', county: info(here)?.name ?? '', species };
  // (The garden's county as each file knows it: its own, or as a county over its line.)
  const near = [...new Set(files.flatMap((f) => f.counties[here]?.near ?? []))].filter((c) => records.includes(c));
  if (near.length) {
    // (Over a state line: "Miller, AR".)
    const named = near.map((c) => { const i = info(c); return !i ? '' : Math.floor(c / 1000) === hereState ? i.name : `${i.name}, ${files.find((f) => f.fips === Math.floor(c / 1000))?.state ?? i.state ?? ''}`; });
    return { where: 'near', counties: named.filter(Boolean).sort(), species };
  }
  const ownFile = files.find((f) => f.fips === hereState);
  if (!ownFile) return null;
  const count = (ownFile.plants[species ? p.parent! : p.id] ?? []).length;
  return count ? { where: 'state', count, stateName: STATE_NAMES[ownFile.state] ?? ownFile.state, species } : null;
}

/** Recorded wild in the garden's county or one bordering it (in any state): it lives through the local climate. */
export const wildNearby = (p: { id: string; parent?: string }) => { const w = wildHere(p); return !!w && w.where !== 'state'; };

/** The plant's line, in words ("Recorded growing wild in Clark County"). */
export function wildText(w: WildHere): string {
  const who = w.species ? 'Its species is recorded' : 'Recorded';
  if (w.where === 'county') return `${who} growing wild in ${w.county} County`;
  if (w.where === 'near') return `${who} growing wild in a neighboring county (${w.counties.join(w.counties.some((c) => c.includes(',')) ? '; ' : ', ')})`;
  return `${who} growing wild in ${w.count} ${w.stateName} ${w.count === 1 ? 'county' : 'counties'}, none near you`;
}
/** The sources, as a details line names them. */
export const wildSource = () => [...new Set(loaded?.files.map((f) => f.source.title) ?? [])].join('; ');
