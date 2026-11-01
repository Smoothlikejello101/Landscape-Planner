// The sync engine: one pass that brings this device's projects and the
// server's into step. It knows nothing about the page or Supabase; it works
// through two small interfaces, so it can be tested with a stand-in server
// and stand-in devices (tests/sync-engine.test.ts).
//
// The rules (see the Sync Design doc):
// - A project syncs as one unit. Each device remembers, per project, the
//   server revision its copy started from, a fingerprint of its content then,
//   and which background photo it had. Changed here = either no longer matches.
// - Upload only from the revision the server has; otherwise compare. A change
//   on one side only is taken as it is; changes on both sides to the same part
//   (the plan, or its photo) are a conflict.
// - A conflict keeps both: the server's version takes the project's place
//   and this device's version becomes a copy beside it. Nothing is lost.
// - Parts of a plan never conflict (Jason, Nov 1): the Plant list's ticks,
//   who's in the yard and the warning switches settle on their own, whichever
//   devices changed them (settleParts); a conflict is the rest of the plan
//   changed on both. An upload never replaces the server's parts with ones
//   this device didn't know: a record keeps the parts as the server had
//   them, and one from a version before them makes the upload settle with
//   the server first.
// - Sync never removes a project that has changes here. A project deleted
//   elsewhere leaves this device only if it hasn't changed here; if it has,
//   it comes back out of the trash with this device's version.
// - A photo goes up before the project that shows it, and only once (it's
//   known by a fingerprint of its bytes). A project whose photo can't be
//   fetched yet arrives without it and gets it at a later pass.

export interface ProjectContent { [key: string]: unknown }
/**
 * A project as sync read it. `token` marks the moment: sync changes or
 * removes a project only if it hasn't changed since (an edit made while a
 * sync works always wins; the next sync takes it from there).
 */
export interface LocalProject {
  id: string; name: string; content: ProjectContent; token: number;
  /** The fingerprint of its synced photo, when the photo isn't on this device yet. */
  pendingPhoto?: string;
}
/**
 * `held`: this device's photo couldn't be stored on the server, so the
 * server's plan says it's kept here: 'room' (the account's photo space was
 * full: tried again later) or 'refused' (too large, or a kind of image storage won't take).
 */
export interface SyncRecord {
  revision: number; hash: string; photo?: string; held?: 'room' | 'refused';
  /**
   * The fingerprint of the plan without the parts that settle on their own (coreHash). Absent in a record from before
   * them: its plan had neither part then, so `hash` is that.
   */
  core?: string;
  /**
   * The parts that settle on their own (`bought`, `household`, `switches`) as the server had them at `revision`, where
   * it had any. Absent in a record from before them: a version that didn't know them left them out of what it stored,
   * so what the server has of them isn't known here (an upload settles with the server first).
   */
  parts?: ProjectContent;
}
export interface ServerProject { id: string; name: string; revision: number; updated_by: string | null; updated_at: string; deleted_at: string | null }
export type PushResult =
  | { status: 'ok'; revision: number }
  | { status: 'conflict'; revision: number; name: string; content: ProjectContent; updated_by: string | null; updated_at: string }
  | { status: 'deleted'; revision: number }
  | { status: 'paused' }
  | { status: 'full' };

/** This device's side. */
export interface Local {
  /** Every project here, as it is now (the open one saved first). */
  projects(): Promise<LocalProject[]>;
  records(): Record<string, SyncRecord>;
  setRecord(id: string, rec: SyncRecord | null): Promise<void>;
  /** Synced projects deleted here, to move to the server's trash: id → the revision deleted. */
  tombstones(): Record<string, number>;
  /**
   * The record a project deleted here had (its sync state as it was deleted), if kept: a deletion is undone only by a
   * change made elsewhere since, not by the parts another device took from what it had when plans got their own.
   */
  deletedRecord?(id: string): SyncRecord | undefined;
  clearTombstone(id: string): Promise<void>;
  /**
   * Replace a project's content and name, if unchanged since `token` (else
   * false: try again next time). Content without a `photo` keeps the photo
   * here; `photo` is the fetched bytes of a photo this device didn't have.
   * `copied`: this device's version was just kept as a copy (no need for another).
   */
  replace(id: string, name: string, content: ProjectContent, token: number, photo?: string, copied?: boolean): Promise<boolean>;
  /** A project new to this device, under the server's id. */
  create(id: string, name: string, content: ProjectContent, photo?: string): Promise<void>;
  /**
   * The bytes (a data URL) of a project's photo here, to upload: null if
   * none here, false if the photo here is no longer the one with this fingerprint.
   */
  photoData(id: string, fingerprint: string): Promise<string | null | false>;
  /** Whether a project here has the photo with this fingerprint. */
  hasPhoto(id: string, fingerprint: string): Promise<boolean>;
  /** Put a photo's fetched bytes in place for a project waiting for them, if unchanged since `token`. */
  fillPhoto(id: string, token: number, fingerprint: string, bytes: string): Promise<boolean>;
  /** Remove a project deleted elsewhere (it's in the server's trash), if unchanged since `token`. */
  remove(id: string, token: number): Promise<boolean>;
  /** Keep this device's version of a project (`from`) as a new project. */
  keepCopy(from: string, name: string, content: ProjectContent): Promise<{ id: string; token: number }>;
  /** Rename; returns the project's new token (or a stale one if it had changed since `token`). */
  rename(id: string, name: string, token: number): Promise<number>;
  /**
   * A name and content as this device will store and read them back (checked
   * and tidied, as any download is), so its fingerprint matches what the next
   * pass reads.
   */
  normalize(name: string, content: ProjectContent): { name: string; content: ProjectContent };
}
/** The server's side. */
export interface Remote {
  list(): Promise<ServerProject[]>;
  fetch(ids: string[]): Promise<Record<string, { name: string; revision: number; content: ProjectContent }>>;
  push(id: string, base: number | null, name: string, content: ProjectContent): Promise<PushResult>;
  /** To the trash, unless changed since revision `base` ('changed'). */
  trash(id: string, base: number): Promise<'ok' | 'changed' | 'paused'>;
  /** Out of the trash: the new revision (null if it isn't there, or sync is paused). */
  restore(id: string): Promise<number | null>;
  /** Make room for a photo: 'stored' (already there), 'send' (upload it), or why not. */
  reservePhoto(fingerprint: string, size: number): Promise<'stored' | 'send' | 'paused' | 'too_big' | 'full'>;
  /** Upload a reserved photo (and note that it's there). */
  putPhoto(fingerprint: string, dataUrl: string): Promise<void>;
  /** A photo's bytes as a data URL; null if the server doesn't have it (or what it has doesn't match the fingerprint). */
  getPhoto(fingerprint: string): Promise<string | null>;
}

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  /** Projects changed on two devices: the copy this device kept. */
  conflicts: { name: string; copyName: string; otherDevice: string | null }[];
  /** Deleted elsewhere, removed here. */
  removed: string[];
  /** Deleted elsewhere while changed here: brought back. */
  restored: string[];
  /** Deleted here, but changed on another device since: back on this device. */
  undeleted: string[];
  /** Projects whose photo couldn't be stored (too large, or the account's photo space is full): it stays on this device. */
  photosKept: string[];
  /** Projects that couldn't sync this time (tried again next time). */
  failed: { name: string; message: string }[];
  /** The server's trash after this pass. */
  trash: ServerProject[];
  /** The plan doesn't include sync now (trial ended, subscription lapsed). */
  paused: boolean;
  /** The account's project limit was reached. */
  full: boolean;
}

// ---------- Fingerprints ----------
/** JSON with object keys sorted, so the same content always reads the same (the server may reorder keys). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}
/** A fingerprint of a project's name and content (53-bit hash; collisions are vanishingly unlikely for edits). */
export function fingerprint(name: string, content: ProjectContent): string {
  const s = canonical({ name, content });
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + s.length.toString(36);
}

/** "Back Yard — copy from Pixel 7, Oct 17, 9:40 AM" */
export function copyName(name: string, device: string, at = new Date()): string {
  const when = at.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${name} — copy from ${device || 'this device'}, ${when}`;
}

// ---------- A project's two parts: the plan, and its photo ----------
/** Content without the photo. */
export function planOf(c: ProjectContent): ProjectContent {
  const { photo: _p, ...rest } = c;
  return rest;
}
/** Fingerprint of the name and plan (the photo apart). Records made before photos synced hold exactly this. */
export const planHash = (name: string, c: ProjectContent) => fingerprint(name, planOf(c));
/** Parts of a plan that settle on their own when two devices change them (settleParts), not a conflict. */
const OWN_PARTS = ['bought', 'household', 'switches'] as const;
/** The plan without its photo and the parts that settle on their own: what two devices changing is a conflict. */
function coreOf(c: ProjectContent): ProjectContent {
  const out = { ...planOf(c) };
  for (const k of OWN_PARTS) delete out[k];
  return out;
}
/** The parts of a plan that settle on their own, those it has (a copy). */
function partsOf(c: ProjectContent): ProjectContent {
  const out: ProjectContent = {};
  for (const k of OWN_PARTS) if (c[k] !== undefined) out[k] = JSON.parse(JSON.stringify(c[k]));
  return out;
}
/** Fingerprint of the name and the plan's core (coreOf). */
export const coreHash = (name: string, c: ProjectContent) => fingerprint(name, coreOf(c));
/** A record's core fingerprint; one from before the parts that settle on their own had none, its plan neither part. */
const coreOfRecord = (rec: SyncRecord) => rec.core ?? rec.hash;
/**
 * Which photo content shows, and how it's placed: 'none', 'kept' (on one
 * device only), or "<photo fingerprint>@<placement fingerprint>". Undefined
 * when content says nothing about a photo (from a version of the app before
 * photos synced): the photo here stands.
 */
export function photoKey(c: ProjectContent): string | undefined {
  if (!('photo' in c)) return undefined;
  const ph = c.photo as { fingerprint?: unknown; deviceOnly?: unknown } | null | undefined;
  if (!ph) return 'none';
  if (ph.deviceOnly === true) return 'kept';
  if (typeof ph.fingerprint !== 'string') return 'none';
  const { fingerprint: fp, ...placement } = ph as Record<string, unknown>;
  return `${fp}@${fingerprint('', placement)}`;
}
/** The fingerprint of the photo content shows (none if it shows none, or keeps it on one device). */
export function photoFp(c: ProjectContent): string | undefined {
  const ph = c.photo as { fingerprint?: unknown; deviceOnly?: unknown } | null | undefined;
  return ph && ph.deviceOnly !== true && typeof ph.fingerprint === 'string' ? ph.fingerprint : undefined;
}
/** The record for content as the server has it at `revision`. */
const recordFor = (name: string, c: ProjectContent, revision: number): SyncRecord => {
  const photo = photoKey(c);
  const rec: SyncRecord = { revision, hash: planHash(name, c), core: coreHash(name, c) };
  const parts = partsOf(c);
  if (Object.keys(parts).length) rec.parts = parts;
  return photo === undefined ? rec : { ...rec, photo };
};
/** Size in bytes of a data URL's contents. */
const byteSize = (dataUrl: string) => { const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1); return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0); };

/** A connection that dropped (as opposed to the server refusing something). */
/** A refusal that will happen every time (a kind of image storage won't take, or too large). */
const isRefusal = (e: unknown) => /mime|content.?type|not supported|too large|maximum allowed size|payload|413|415/i.test(`${e instanceof Error ? e.message : String(e)} ${(e as { statusCode?: unknown })?.statusCode ?? ''}`);
const isConnectionTrouble = (e: unknown) => e instanceof TypeError || /fetch|network|load failed|timed? ?out/i.test(e instanceof Error ? e.message : String(e));
/** Parts of a plan an older app version doesn't know about, so leaves out of what it sends. */
const NEWER_PARTS = ['location', ...OWN_PARTS];
/** The server's content with the parts it says nothing about kept as they are here (so they don't look changed, or get lost). */
export function withLocalParts(server: ProjectContent, mine: ProjectContent | undefined): ProjectContent {
  if (!mine) return server;
  let out = server;
  for (const k of NEWER_PARTS) if (!(k in server) && k in mine) out = { ...out, [k]: mine[k] };
  return withChosenColors(withStructures(withVineSupports(withUtilities(withSubFeatures(withGoneDates(out, mine), mine), mine), mine), mine), mine);
}
/**
 * A shape's sub-features (doors, windows, gates: src/features.ts), which an older version leaves out of a shape it
 * sends: kept from here when the server's copy of that shape has none at all. (All taken off on purpose is [], and
 * stays so.) The shape must still have the same edges: the same kind of shape, or one turned into an outline there
 * (which keeps its edges in order).
 */
function withSubFeatures(server: ProjectContent, mine: ProjectContent): ProjectContent {
  if (!Array.isArray(server.shapes) || !Array.isArray(mine.shapes)) return server;
  type Featured = { id?: unknown; type?: unknown; features?: unknown };
  const kept = new Map<unknown, { type: unknown; features: unknown[] }>();
  for (const s of mine.shapes as Featured[]) if (s && Array.isArray(s.features) && s.features.length) kept.set(s.id, { type: s.type, features: s.features });
  if (!kept.size) return server;
  let filled = false;
  const shapes = (server.shapes as Featured[]).map((s) => {
    const k = s ? kept.get(s.id) : undefined;
    const sameEdges = s?.type === k?.type || (s?.type === 'poly' && ['rect', 'oval', 'triangle'].includes(k?.type as string));
    if (!s || !k || 'features' in s || !sameEdges) return s;
    filled = true;
    return { ...s, features: k.features };
  });
  return filled ? { ...server, shapes } : server;
}
/**
 * A utility (a power line, a buried line, a septic field: src/utilities.ts), whose role an older version doesn't know
 * and drops, with its kind, from a shape it sends: kept from here when the server's copy of that shape, the same
 * kind of shape, has neither. (One made something else here keeps its kind, so isn't mistaken for that.) Likewise a
 * plant's dismissed utility warning, which an older version drops: kept from here when the server's copy has none at
 * all ('' is one shown again on purpose, and stays so).
 */
function withUtilities(server: ProjectContent, mine: ProjectContent): ProjectContent {
  if (!Array.isArray(server.shapes) || !Array.isArray(mine.shapes)) return server;
  type Util = { id?: unknown; type?: unknown; role?: unknown; utility?: unknown; utilityDismissed?: unknown };
  const kept = new Map<unknown, Util>();
  for (const s of mine.shapes as Util[]) {
    if (s && ((s.role === 'utility' && typeof s.utility === 'string') || (typeof s.utilityDismissed === 'string' && s.utilityDismissed))) kept.set(s.id, s);
  }
  if (!kept.size) return server;
  let filled = false;
  const shapes = (server.shapes as Util[]).map((s) => {
    const k = s && typeof s === 'object' ? kept.get(s.id) : undefined;
    if (!k || s.type !== k.type) return s;
    let out = s;
    if (k.role === 'utility' && typeof k.utility === 'string' && !('role' in s) && !('utility' in s)) out = { ...out, role: 'utility', utility: k.utility };
    if (typeof k.utilityDismissed === 'string' && k.utilityDismissed && !('utilityDismissed' in s)) out = { ...out, utilityDismissed: k.utilityDismissed };
    if (out !== s) filled = true;
    return out;
  });
  return filled ? { ...server, shapes } : server;
}
/**
 * A garden structure (a trellis, an arbor: src/structures.ts), whose role an older version doesn't know and drops from
 * a shape it sends: kept from here when the server's copy of that shape, the same kind of shape, has no role at all.
 * (One given another role there keeps it.)
 */
function withStructures(server: ProjectContent, mine: ProjectContent): ProjectContent {
  if (!Array.isArray(server.shapes) || !Array.isArray(mine.shapes)) return server;
  type Built = { id?: unknown; type?: unknown; role?: unknown };
  const kept = new Map<unknown, unknown>();
  for (const s of mine.shapes as Built[]) if (s && s.role === 'structure') kept.set(s.id, s.type);
  if (!kept.size) return server;
  let filled = false;
  const shapes = (server.shapes as Built[]).map((s) => {
    if (!s || typeof s !== 'object' || 'role' in s || !kept.has(s.id) || kept.get(s.id) !== s.type) return s;
    filled = true;
    return { ...s, role: 'structure' };
  });
  return filled ? { ...server, shapes } : server;
}
/**
 * What a vine climbs (src/vines.ts), which an older version leaves out of a shape it sends: kept from here when the
 * server's copy of that circle has none at all. (Set to none by hand is '', and stays so.)
 */
function withVineSupports(server: ProjectContent, mine: ProjectContent): ProjectContent {
  if (!Array.isArray(server.shapes) || !Array.isArray(mine.shapes)) return server;
  type Vine = { id?: unknown; type?: unknown; climbsOn?: unknown };
  const kept = new Map<unknown, string>();
  for (const s of mine.shapes as Vine[]) if (s && s.type === 'circle' && typeof s.climbsOn === 'string') kept.set(s.id, s.climbsOn);
  if (!kept.size) return server;
  let filled = false;
  const shapes = (server.shapes as Vine[]).map((s) => {
    if (!s || s.type !== 'circle' || 'climbsOn' in s || !kept.has(s.id)) return s;
    filled = true;
    return { ...s, climbsOn: kept.get(s.id) };
  });
  return filled ? { ...server, shapes } : server;
}
/**
 * A color chosen by hand for a plant (`colorSet`: its picture's leaves drawn in it), which an older version leaves out
 * of a shape it sends: kept from here when the server's copy of that circle has none and the same color (a color
 * changed there is that version's, and isn't taken as chosen).
 */
function withChosenColors(server: ProjectContent, mine: ProjectContent): ProjectContent {
  if (!Array.isArray(server.shapes) || !Array.isArray(mine.shapes)) return server;
  type Colored = { id?: unknown; type?: unknown; color?: unknown; colorSet?: unknown };
  const kept = new Map<unknown, unknown>();
  for (const s of mine.shapes as Colored[]) if (s && s.type === 'circle' && s.colorSet === true) kept.set(s.id, s.color);
  if (!kept.size) return server;
  let filled = false;
  const shapes = (server.shapes as Colored[]).map((s) => {
    if (!s || s.type !== 'circle' || 'colorSet' in s || !kept.has(s.id) || kept.get(s.id) !== s.color) return s;
    filled = true;
    return { ...s, colorSet: true };
  });
  return filled ? { ...server, shapes } : server;
}
/**
 * A gone shape's date (goneOn), which an older version leaves out of a shape it sends: kept from here when the
 * server's copy of that shape is still gone and has no date at all. (A date cleared on purpose is '' and stays so.)
 */
function withGoneDates(server: ProjectContent, mine: ProjectContent): ProjectContent {
  if (!Array.isArray(server.shapes) || !Array.isArray(mine.shapes)) return server;
  type Gone = { id?: unknown; status?: unknown; goneOn?: unknown };
  const dates = new Map<unknown, string>();
  for (const s of mine.shapes as Gone[]) if (s && s.status === 'gone' && typeof s.goneOn === 'string') dates.set(s.id, s.goneOn);
  if (!dates.size) return server;
  let filled = false;
  const shapes = (server.shapes as Gone[]).map((s) => {
    if (!s || s.status !== 'gone' || 'goneOn' in s || !dates.has(s.id)) return s;
    filled = true;
    return { ...s, goneOn: dates.get(s.id) };
  });
  return filled ? { ...server, shapes } : server;
}
// ---------- The parts that settle on their own ----------
type Bought = Record<string, { n: number; at: number }>;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const tickOk = (v: unknown): v is { n: number; at: number } => isObject(v) && typeof v.n === 'number' && Number.isFinite(v.n) && typeof v.at === 'number' && Number.isFinite(v.at);
/**
 * Two devices' Plant list ticks, kind by kind: the later change to each (an untick is a change: 0 bought); the same
 * moment, the more bought. Either way round, the same answer, so both devices end with the same list.
 */
export function settleBought(a: unknown, b: unknown): Bought | undefined {
  if (!isObject(a) && !isObject(b)) return undefined;
  const out: Bought = {};
  for (const side of [a, b]) {
    if (!isObject(side)) continue;
    for (const [id, v] of Object.entries(side)) {
      if (!tickOk(v)) continue;
      const was = out[id];
      if (!was || v.at > was.at || (v.at === was.at && v.n > was.n)) out[id] = { n: v.n, at: v.at };
    }
  }
  return out;
}
type Household = { kids: boolean; dogs: string; cats: boolean; horses: boolean; answered: boolean; at?: number };
const householdOk = (v: unknown): v is Household => isObject(v) && typeof v.kids === 'boolean' && typeof v.cats === 'boolean' && typeof v.horses === 'boolean' && typeof v.dogs === 'string';
const DOG_STRICTNESS = ['', 'hideToxic', 'nonToxic'];
/**
 * Two devices' "who's in the yard": the one set in the plan more lately (`at`); one set in the plan over one a device
 * only took from what it had when plans got their own; and two taken that way, everyone either had (Jason, Nov 1:
 * nobody's setting changes with the update, and a dog kept on one phone isn't dropped by a computer that never asked),
 * answered if either was. Either way round, the same answer.
 */
export function settleHousehold(a: unknown, b: unknown): Household | undefined {
  const x = householdOk(a) ? a : undefined, y = householdOk(b) ? b : undefined;
  if (!x || !y) return x ?? y;
  const xa = typeof x.at === 'number' ? x.at : undefined, ya = typeof y.at === 'number' ? y.at : undefined;
  if (xa !== undefined || ya !== undefined) {
    if (ya === undefined || (xa !== undefined && xa > ya)) return x;
    if (xa === undefined || ya > xa) return y;
    return canonical(x) >= canonical(y) ? x : y; // (the same moment: either, so long as it's the same on both)
  }
  const dogs = DOG_STRICTNESS[Math.max(DOG_STRICTNESS.indexOf(x.dogs), DOG_STRICTNESS.indexOf(y.dogs), 0)];
  return { kids: x.kids || y.kids, dogs, cats: x.cats || y.cats, horses: x.horses || y.horses, answered: x.answered === true || y.answered === true || x.kids || y.kids || dogs !== '' || x.cats || y.cats || x.horses || y.horses };
}
type Switch = { on: boolean; at?: number };
const switchOk = (v: unknown): v is Switch => isObject(v) && typeof v.on === 'boolean' && (v.at === undefined || (typeof v.at === 'number' && Number.isFinite(v.at)));
/**
 * Two devices' warning switches, one by one: the one switched in the plan more lately (`at`); one switched in the plan
 * over one a device only took from what it had when plans got their own; and two taken that way, or switched at the
 * same moment, off if either is off. (A device's "on" taken that way is almost always only the default, never
 * touched; its "off" was always someone's choice, so the update doesn't switch back on a warning anyone turned off.
 * As with who's in the yard: a device that never set it doesn't override one that did.) Either way round, the same
 * answer.
 */
export function settleSwitches(a: unknown, b: unknown): Record<string, Switch> | undefined {
  if (!isObject(a) && !isObject(b)) return undefined;
  const x = isObject(a) ? a : {}, y = isObject(b) ? b : {};
  const out: Record<string, Switch> = {};
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const p = switchOk(x[k]) ? x[k] : undefined, q = switchOk(y[k]) ? y[k] : undefined;
    if (!p || !q) { const one = p ?? q; if (one) out[k] = { ...one }; continue; }
    const pa = p.at, qa = q.at;
    if (pa !== undefined && (qa === undefined || pa > qa)) out[k] = { ...p };
    else if (qa !== undefined && (pa === undefined || qa > pa)) out[k] = { ...q };
    else out[k] = pa === undefined ? { on: p.on && q.on } : { on: p.on && q.on, at: pa };
  }
  return out;
}
/** The parts that settle on their own, as they come out of this device's content and the server's. */
export function settleParts(mine: ProjectContent, theirs: ProjectContent): ProjectContent {
  const out: ProjectContent = {};
  const bought = settleBought(mine.bought, theirs.bought);
  if (bought) out.bought = bought;
  const household = settleHousehold(mine.household, theirs.household);
  if (household) out.household = household;
  const switches = settleSwitches(mine.switches, theirs.switches);
  if (switches) out.switches = switches;
  return out;
}
/** Has a time it was set in the plan: someone set it, rather than a device carrying over what it had. */
const setInPlan = (v: unknown): boolean => isObject(v) && typeof v.at === 'number';
/**
 * Whether `now`'s parts differ from `was`'s only by values carried over from a device, never set in the plan (no `at`):
 * the ticks the same, and who's in the yard and each warning switch the same or carried over. (Every change a person
 * makes is stamped with when; only the update, or a version before it leaving them out, gives a value without one.)
 */
function onlyCarriedOver(now: ProjectContent, was: ProjectContent): boolean {
  if (canonical(now.bought ?? null) !== canonical(was.bought ?? null)) return false;
  if (canonical(now.household ?? null) !== canonical(was.household ?? null) && setInPlan(now.household)) return false;
  const a = isObject(now.switches) ? now.switches : {}, b = isObject(was.switches) ? was.switches : {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (canonical(a[k] ?? null) !== canonical(b[k] ?? null) && setInPlan(a[k])) return false;
  return true;
}
/**
 * Changed here only by taking this device's household and warning switches when plans got their own (no `at`: never
 * set in the plan), the photo as it was: not an edit, so no reason to bring back a plan deleted elsewhere. Judged on
 * the record's core and parts where it has them (a record of this version), else, a record from before the parts, on
 * the rest of the plan as that record has it.
 */
function onlyTakenFromDevice(p: LocalProject, rec: SyncRecord | undefined): boolean {
  if (!rec || (photoKey(p.content) ?? 'none') !== (rec.photo ?? 'none')) return false;
  if (rec.parts) return coreHash(p.name, p.content) === coreOfRecord(rec) && onlyCarriedOver(p.content, rec.parts);
  const { household: h, switches: sw, ...rest } = p.content;
  const taken = (h === undefined || (householdOk(h) && typeof h.at !== 'number'))
    && (sw === undefined || (isObject(sw) && Object.values(sw).every((v) => switchOk(v) && v.at === undefined)));
  if (!taken || (h === undefined && sw === undefined)) return false;
  return planHash(p.name, rest) === rec.hash;
}
/**
 * Parts this device had at its last sync (`was`, as the server had them) that its plan has since lost to values carried
 * over from the device, or to nothing: a version before them on this device saved the plan without them, and the
 * update filled them in again. Each comes back as it was; a change made here since (stamped with when) stays. Null when
 * nothing was lost.
 */
function lostParts(mine: ProjectContent, was: ProjectContent): ProjectContent | null {
  const out: ProjectContent = {};
  // (Ticks are never taken away here, only set to 0: any missing were dropped.)
  if (isObject(was.bought)) {
    const here = isObject(mine.bought) ? mine.bought : {};
    const missing = Object.keys(was.bought).filter((k) => !(k in here));
    if (missing.length) out.bought = { ...here, ...Object.fromEntries(missing.map((k) => [k, (was.bought as Record<string, unknown>)[k]])) };
  }
  if (setInPlan(was.household) && !setInPlan(mine.household)) out.household = was.household;
  if (isObject(was.switches)) {
    const here = isObject(mine.switches) ? mine.switches : {};
    const back = Object.keys(was.switches).filter((k) => setInPlan((was.switches as Record<string, unknown>)[k]) && !setInPlan(here[k]));
    if (back.length) out.switches = { ...here, ...Object.fromEntries(back.map((k) => [k, (was.switches as Record<string, unknown>)[k]])) };
  }
  return Object.keys(out).length ? out : null;
}
const isEmpty = (c: ProjectContent) => Array.isArray(c.shapes) && c.shapes.length === 0 && (photoKey(c) ?? 'none') === 'none';
/** After this many failures in a row, the trouble is likely the connection: end the pass. */
const FAILS_IN_A_ROW = 3;

/** One sync pass. One project's trouble doesn't stop the others; a server that can't be reached ends the pass (try again later). */
export async function syncOnce(local: Local, remote: Remote, device: string): Promise<SyncReport> {
  const report: SyncReport = { uploaded: 0, downloaded: 0, conflicts: [], removed: [], restored: [], undeleted: [], photosKept: [], failed: [], trash: [], paused: false, full: false };
  let failsInARow = 0;
  const attempt = async (name: string, step: () => Promise<void>) => {
    try {
      await step();
      failsInARow = 0;
    } catch (e) {
      report.failed.push({ name, message: e instanceof Error ? e.message : String(e) });
      if (++failsInARow >= FAILS_IN_A_ROW) throw e;
    }
  };

  // 1. Deletions made here go to the server's trash (unless changed elsewhere since: then they come back).
  const undeleted = new Set<string>();
  for (const [id, rev] of Object.entries(local.tombstones())) {
    await attempt('a deleted project', async () => {
      let answer = await remote.trash(id, rev);
      // Changed on the server since: by an edit there, it comes back here. Only by what another device carried over
      // when plans got their own (the yard and the warning switches it had, never set in the plan), it was still the plan
      // deleted here: trashed after all, at the server's revision.
      const was = answer === 'changed' ? local.deletedRecord?.(id) : undefined;
      if (was) {
        const got = (await remote.fetch([id]))[id];
        const n = got ? local.normalize(got.name, got.content) : undefined;
        if (got && n && (photoKey(n.content) ?? was.photo ?? 'none') === (was.photo ?? 'none') && coreHash(n.name, n.content) === coreOfRecord(was)
          && onlyCarriedOver(n.content, was.parts ?? {})) answer = await remote.trash(id, got.revision);
      }
      if (answer === 'paused') { report.paused = true; return; }
      if (answer === 'changed') undeleted.add(id);
      await local.clearTombstone(id);
    });
    if (report.paused) return report;
  }

  const server = new Map((await remote.list()).map((s) => [s.id, s]));
  const projects = await local.projects();
  const records = local.records();
  const here = new Map(projects.map((p) => [p.id, p]));
  const liveNames = new Set([...server.values()].filter((s) => !s.deleted_at).map((s) => s.name));
  const restoredIds = new Set<string>();

  // ---- Photos ----
  const photosUp = new Set<string>();
  /**
   * Make sure the server has a project's photo: 'ok'; 'kept' (it can't be
   * stored: the plan goes up saying it's kept here); 'changed' (the photo
   * changed since this pass read the plan: next time); or 'paused'.
   */
  const sendPhoto = async (p: LocalProject): Promise<'ok' | 'room' | 'refused' | 'changed' | 'paused'> => {
    const fp = photoFp(p.content);
    if (!fp || photosUp.has(fp)) return 'ok';
    const data = await local.photoData(p.id, fp);
    if (data === false) return 'changed';
    if (!data) return 'ok'; // not on this device: it came from the server, which has it
    const answer = await remote.reservePhoto(fp, byteSize(data));
    if (answer === 'paused') return 'paused';
    if (answer === 'full') return 'room';
    if (answer === 'too_big') return 'refused';
    if (answer === 'send') {
      try {
        await remote.putPhoto(fp, data);
      } catch (e) {
        if (isConnectionTrouble(e)) throw e;
        if (isRefusal(e)) return 'refused'; // a kind of image storage won't take: it stays here
        // Anything else: perhaps another device sent it a moment ago. Look again; otherwise it's a
        // failure this project reports (and tries again next time).
        const again = await remote.reservePhoto(fp, byteSize(data));
        if (again === 'paused') return 'paused';
        if (again !== 'stored') throw e;
        photosUp.add(fp);
        return 'ok';
      }
    }
    photosUp.add(fp);
    return 'ok';
  };
  /** The bytes of the photo `c` shows, if this project (or a new one: id null) doesn't have them; none if they can't be had now (the plan comes without, the photo later). */
  const photoFor = async (id: string | null, c: ProjectContent): Promise<string | undefined> => {
    const fp = photoFp(c);
    if (!fp || (id && (await local.hasPhoto(id, fp)))) return undefined;
    try { return (await remote.getPhoto(fp)) ?? undefined; } catch { return undefined; }
  };
  /** The server's content as this device should take it: a "kept here" that is this device's own held photo isn't a change. */
  const asSeenHere = (c: ProjectContent, rec: SyncRecord | undefined): ProjectContent => (rec?.held && photoKey(c) === 'kept' ? planOf(c) : c);
  /** The record for content the server has, keeping "held" when the photo here is the held one. */
  const recordAfter = (name: string, onServer: ProjectContent, revision: number, rec: SyncRecord | undefined, photoHere: string | undefined): SyncRecord => {
    const r = recordFor(name, onServer, revision);
    return rec?.held && photoKey(onServer) === 'kept' && photoHere === rec.photo ? { ...r, photo: rec.photo, held: rec.held } : r;
  };

  /** Upload; true if stored. Handles every answer. */
  const upload = async (p: LocalProject, base: number | null): Promise<boolean> => {
    const ph = await sendPhoto(p);
    if (ph === 'paused') { report.paused = true; return false; }
    if (ph === 'changed') return false;
    // A photo the server can't take stays here; the plan goes up saying so.
    const held = ph === 'room' || ph === 'refused' ? ph : undefined;
    const content = held ? { ...p.content, photo: { deviceOnly: true } } : p.content;
    if (held && records[p.id]?.held !== held) report.photosKept.push(p.name);
    let res = await remote.push(p.id, base, p.name, content);
    if (res.status === 'deleted') {
      // Trashed while we worked: this device has changes, so it comes back.
      const rev = await remote.restore(p.id);
      if (rev != null) { report.restored.push(p.name); restoredIds.add(p.id); }
      res = await remote.push(p.id, rev, p.name, content);
    }
    switch (res.status) {
      case 'ok':
        // (Recorded as this device has it, so a photo kept here isn't sent again until there's room.)
        await local.setRecord(p.id, held ? { ...recordFor(p.name, p.content, res.revision), held } : recordFor(p.name, p.content, res.revision));
        report.uploaded++;
        return true;
      case 'conflict':
        await merge(p, records[p.id], res.revision, res.name, res.content, res.updated_by);
        return false;
      case 'paused': report.paused = true; return false;
      case 'full': report.full = true; return false;
      default: return false;
    }
  };
  /** Changed on two devices: the server's version takes this place; ours becomes a copy beside it. */
  const conflict = async (p: LocalProject, serverName: string, serverRev: number, serverContent: ProjectContent, by: string | null, asOnServer = serverContent) => {
    const copyLabel = local.normalize(copyName(p.name, device), {}).name;
    // The copy is saved first, so this device's version is never only in the project being replaced.
    const copy = await local.keepCopy(p.id, copyLabel, p.content);
    if (!(await local.replace(p.id, serverName, serverContent, p.token, await photoFor(p.id, serverContent), true))) {
      // Edited again meanwhile: the original still holds this device's version (and more);
      // drop the copy, and the next pass meets the same conflict with the newer edits.
      await local.remove(copy.id, copy.token);
      return;
    }
    const n = local.normalize(serverName, asOnServer);
    // What the server has (anything else here goes up next time), still holding this device's photo if the original kept it.
    await local.setRecord(p.id, recordAfter(n.name, n.content, serverRev, records[p.id], photoKey(serverContent)));
    report.conflicts.push({ name: serverName, copyName: copyLabel, otherDevice: by });
    const copied: LocalProject = { id: copy.id, name: copyLabel, content: p.content, token: copy.token };
    if (!report.paused && !report.full) await upload(copied, null);
  };
  /**
   * Changed here and on the server since the last sync (or never synced from
   * here, under an id the server has). Each part (the plan, the photo) is
   * taken from the side that changed it; both changing the same part is a conflict.
   */
  const merge = async (p: LocalProject, rec: SyncRecord | undefined, serverRev: number, serverName: string, sent: ProjectContent, by: string | null) => {
    const rawContent = withLocalParts(sent, p.content); // (for telling what changed where)
    const serverContent = asSeenHere(rawContent, rec);
    const n = local.normalize(serverName, serverContent);
    // The Plant list's ticks, who's in the yard and the warning switches settle on their own, the same on both sides
    // (settleParts); what's compared for a conflict is the rest of the plan, its core.
    const parts = settleParts(p.content, n.content);
    const mine = { ...p.content, ...parts }, theirs = { ...n.content, ...parts };
    const basePhoto = rec?.photo ?? 'none';
    const localPlan = coreHash(p.name, p.content), serverPlan = coreHash(n.name, n.content);
    const localPhoto = photoKey(p.content) ?? 'none', serverPhoto = photoKey(n.content);
    const planHere = !rec || coreOfRecord(rec) !== localPlan, planThere = !rec || coreOfRecord(rec) !== serverPlan;
    const photoHere = localPhoto !== basePhoto, photoThere = serverPhoto !== undefined && serverPhoto !== basePhoto;
    const photoClash = photoHere && photoThere && localPhoto !== serverPhoto;
    if ((planHere && planThere && localPlan !== serverPlan) || photoClash) {
      // The original takes the server's plan, with the settled parts; its photo follows the usual rule unless the
      // photos clash too. (The copy keeps this device's version whole.)
      const photoSource = !photoClash && (photoHere || !photoThere) ? p.content : serverContent;
      const original = { ...planOf(theirs), ...('photo' in photoSource ? { photo: photoSource.photo } : {}) };
      return conflict(p, serverName, serverRev, original, by, sent); // (recorded as the server really has it)
    }
    const planFromServer = !planHere && localPlan !== serverPlan;
    const photoFromServer = !photoHere && photoThere && localPhoto !== serverPhoto;
    const merged: LocalProject = {
      ...p,
      name: planFromServer ? n.name : p.name,
      content: { ...(planFromServer ? planOf(theirs) : planOf(mine)) },
    };
    const photoSource = photoFromServer ? n.content : p.content;
    if ('photo' in photoSource) merged.content.photo = photoSource.photo;
    // (Ticks, the yard or the switches taken from the server change the plan here too, with nothing else from there.)
    const partsFromServer = planHash(merged.name, merged.content) !== planHash(p.name, p.content);
    if (planFromServer || photoFromServer || partsFromServer) {
      const bytes = photoFromServer ? await photoFor(p.id, n.content) : undefined;
      if (!(await local.replace(p.id, merged.name, merged.content, p.token, bytes))) return; // edited meanwhile: next time
      merged.token = -1; // (it moved on: nothing more is replaced this pass)
      report.downloaded++;
    }
    // Whether the server already has the result: judged by what it sent, not with this device's parts filled in.
    const raw = local.normalize(serverName, sent);
    const samePlan = merged.name === raw.name && planHash(merged.name, merged.content) === planHash(raw.name, raw.content);
    const mergedPhoto = photoKey(merged.content) ?? 'none', rawPhoto = photoKey(raw.content) ?? 'none';
    if (samePlan && (mergedPhoto === rawPhoto || (rawPhoto === 'kept' && rec?.held && mergedPhoto === rec.photo))) {
      await local.setRecord(p.id, recordAfter(raw.name, raw.content, serverRev, rec, mergedPhoto)); // the server has it (or the held photo stands)
    } else await upload(merged, serverRev);
  };

  const toDownload: string[] = [];
  for (const p of projects) {
    if (report.paused) break;
    await attempt(p.name, async () => {
      const rec = records[p.id];
      const s = server.get(p.id);
      const changed = !rec || rec.hash !== planHash(p.name, p.content) || (photoKey(p.content) ?? 'none') !== (rec.photo ?? 'none');
      if (!s) {
        // New to the server (or gone from its trash after 30 days: it comes back rather than
        // risk losing it). A first upload whose name another synced project already has is
        // marked as this device's, unless it's empty (a new device's starter plan): that stays here.
        if (!rec && liveNames.has(p.name)) {
          if (isEmpty(p.content)) return;
          const name = local.normalize(`${p.name} (from ${device || 'this device'})`, {}).name;
          p.token = await local.rename(p.id, name, p.token);
          p.name = name;
        }
        if (!report.full) await upload(p, null);
      } else if (s.deleted_at) {
        if (changed && !onlyTakenFromDevice(p, rec)) {
          const rev = await remote.restore(p.id);
          if (rev != null) { report.restored.push(p.name); restoredIds.add(p.id); }
          await upload(p, rev);
        } else if (await local.remove(p.id, p.token)) {
          report.removed.push(p.name);
        }
      } else if (rec && rec.revision === s.revision && !(changed && !rec.parts && OWN_PARTS.some((k) => p.content[k] !== undefined))) {
        // (The server as this device last saw it. A record that doesn't say which parts the server had (a version before
        // them recorded it, leaving them out of what it stored) goes the long way instead: fetched and settled, below, so
        // the yard, switches and ticks another device sent aren't replaced by what this one carried over.)
        if (changed) {
          // Parts lost here since (a version before them saved the plan on this device): back as they were, then up.
          const lost = rec.parts ? lostParts(p.content, rec.parts) : null;
          let q = p;
          if (lost) {
            const content = { ...p.content, ...lost };
            if (!(await local.replace(p.id, p.name, content, p.token))) return; // (edited meanwhile: next time)
            q = { ...p, content, token: -1 };
          }
          await upload(q, rec.revision);
        } else if (rec.held === 'room' && (await sendPhoto(p)) === 'ok') await upload(p, rec.revision); // room for it now
      } else if (rec && !changed) {
        toDownload.push(p.id); // changed elsewhere only
      } else {
        const got = (await remote.fetch([p.id]))[p.id];
        if (got) await merge(p, rec, got.revision, got.name, got.content, s.updated_by);
      }
    });
  }

  // 2. Projects changed or made elsewhere come down.
  const filled = new Set<string>();
  if (!report.paused) {
    const tombstones = local.tombstones();
    for (const s of server.values()) if (!s.deleted_at && !here.has(s.id) && !(s.id in tombstones)) toDownload.push(s.id);
    if (toDownload.length) {
      const got = await remote.fetch(toDownload);
      for (const id of toDownload) {
        const g = got[id];
        if (!g) continue;
        await attempt(g.name, async () => {
          const mine = here.get(id);
          const rec = records[id];
          const whole = withLocalParts(g.content, mine?.content);
          const content = asSeenHere(whole, rec);
          const bytes = await photoFor(mine ? id : null, content);
          const ok = mine ? await local.replace(id, g.name, content, mine.token, bytes) : (await local.create(id, g.name, content, bytes), true);
          if (!ok) return;
          filled.add(id);
          const n = local.normalize(g.name, content);
          await local.setRecord(id, recordAfter(n.name, local.normalize(g.name, whole).content, g.revision, rec, rec?.photo));
          report.downloaded++;
          if (undeleted.has(id)) report.undeleted.push(n.name);
        });
      }
    }
    // 3. Photos that didn't come down before: try again.
    for (const p of projects) {
      if (!p.pendingPhoto || filled.has(p.id)) continue;
      await attempt(p.name, async () => {
        const bytes = await remote.getPhoto(p.pendingPhoto!);
        if (bytes && (await local.fillPhoto(p.id, p.token, p.pendingPhoto!, bytes))) report.downloaded++;
      });
    }
  }
  report.trash = [...server.values()].filter((s) => s.deleted_at && !restoredIds.has(s.id));
  return report;
}
