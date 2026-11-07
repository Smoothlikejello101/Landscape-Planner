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

import { MEASURED_TOL } from '../measured';

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
  /**
   * The shapes, by id, that had a bed's conditions or a fruit-partner dismissal in the server's copy this record
   * describes (Nov 4): where a mark of something taken away ({} or '') may go on this device, since another device can
   * have that field (src/marks.ts mayMark). Absent: none had either (and in every record from before it: release 3
   * never had the fields, and Next doesn't sync).
   */
  marks?: { conditions?: string[]; fruit?: string[] };
  /**
   * The core's fingerprint with every bed's conditions left out (bareHash, Nov 5), made with `core` from the same copy:
   * a server's copy with no conditions at all (an older version's, which drops them from every bed) is compared by it,
   * so conditions filled in from here aren't taken for a change there (asRecordedButConditions). Absent in a record from
   * before it, and in any an older version wrote (it keeps only the fields it knows): such a copy is compared as before,
   * a needless copy at worst.
   */
  bare?: string;
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
/**
 * A plan as fingerprinted: a fruit-partner warning shown again on purpose (`fruitDismissed: ''`) reads as none. So a
 * dismissal taken back before the plan synced (Undo, Show again) isn't taken for a change, which against another
 * device's edit made a conflict copy (the second review, Nov 1); dismissed words to '' still differ, as words to none
 * do, so a Show again still goes up. Likewise a bed's conditions cleared on purpose (`conditions: {}`, Nov 2): set to
 * {} is a change, as set to none is; none to {} isn't. And Show through picked for the plants under taller ones
 * (`print.under: 'windows'`, Nov 4) reads as none picked, which prints the same: As on screen and back before the plan
 * synced isn't a change of its own, while As on screen to Show through still is, and goes up. A plan with none of these
 * is fingerprinted exactly as before (the same object).
 */
function forHash(c: ProjectContent): ProjectContent {
  let out = c;
  if (Array.isArray(c.shapes)) {
    const cleared = withoutClearedMarks(c.shapes);
    const shapes = withoutMeasured(cleared ?? c.shapes) ?? cleared;
    if (shapes) out = { ...out, shapes };
  }
  const print = c.print;
  if (isObject(print) && print.under === 'windows') {
    const { under: _u, ...rest } = print;
    out = { ...out, print: rest };
  }
  return out;
}
/**
 * The shapes with their sides typed as numbers (`measured`, Nov 4: src/measured.ts) left out, for the fingerprints;
 * null when none has them. This version changes them only with the shape's sides (typing a rectangle's Width, drawing
 * it, reshaping it), which the fingerprint sees anyway; an older version drops them from every plan it sends. Seen,
 * a device on the release ticking a plant bought, or moving the photo, would read on this device as a change to the
 * plan there, and a copy of it would be made if this device had reshaped a shape since. (Withdrawn from the plan by
 * an older version, they're kept from here: withMeasuredSides. Typed again as the same length, they go up with the
 * next edit.)
 */
function withoutMeasured<T>(shapes: readonly T[]): T[] | null {
  const has = (s: unknown) => !!s && typeof s === 'object' && 'measured' in s;
  if (!shapes.some(has)) return null;
  return shapes.map((s) => { if (!has(s)) return s; const { measured: _m, ...rest } = s as Record<string, unknown>; return rest as T; });
}

// ---------- Marks of something taken away on purpose ----------
// Kept on a shape so sync can tell them from a copy an older version sent without the field (docs/storage.md): a
// fruit-partner warning shown again (`fruitDismissed: ''`) and a bed's conditions cleared (`conditions: {}`). Where two
// copies of a plan are compared for what they hold (the fingerprints here, a journal against its plan in
// src/storage.ts, an imported plan against one already here in src/backup.ts), each reads as none.
/** Whether a shape carries either mark. */
function marked(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false;
  const o = s as { fruitDismissed?: unknown; conditions?: unknown };
  const k = o.conditions;
  return o.fruitDismissed === '' || (!!k && typeof k === 'object' && !Array.isArray(k) && Object.keys(k).length === 0);
}

/** The shapes with those marks read as none; null when none has one (so a caller can keep its object as it was). */
export function withoutClearedMarks<T>(shapes: readonly T[]): T[] | null {
  if (!shapes.some(marked)) return null;
  return shapes.map((s) => {
    if (!marked(s)) return s;
    const rest = { ...(s as Record<string, unknown>) };
    if (rest.fruitDismissed === '') delete rest.fruitDismissed;
    const k = rest.conditions;
    if (!!k && typeof k === 'object' && !Array.isArray(k) && Object.keys(k).length === 0) delete rest.conditions;
    return rest as T;
  });
}

/** Fingerprint of the name and plan (the photo apart). Records made before photos synced hold exactly this. */
export const planHash = (name: string, c: ProjectContent) => fingerprint(name, forHash(planOf(c)));
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
/** Fingerprint of the name and the plan's core (coreOf), '' read as none (forHash). */
export const coreHash = (name: string, c: ProjectContent) => fingerprint(name, forHash(coreOf(c)));
/** A record's core fingerprint; one from before the parts that settle on their own had none, its plan neither part. */
const coreOfRecord = (rec: SyncRecord) => rec.core ?? rec.hash;
/** Whether a shape has a bed's conditions, answers or {} (any shape: reading keeps them on a bed only). */
const hasConditions = (s: unknown) => !!s && typeof s === 'object' && 'conditions' in s;
/**
 * The core's fingerprint (coreHash) with every bed's conditions left out, answers and {} alike: a record's `bare`. A plan
 * with none has the same as its core.
 */
export function bareHash(name: string, c: ProjectContent): string {
  if (!Array.isArray(c.shapes) || !c.shapes.some(hasConditions)) return coreHash(name, c);
  const shapes = c.shapes.map((s) => { if (!hasConditions(s)) return s; const { conditions: _k, ...rest } = s as Record<string, unknown>; return rest; });
  return coreHash(name, { ...c, shapes });
}
/**
 * Whether a plan's core (`c`, named `name`) is as the record has it. A record without `core` holds the whole plan's
 * fingerprint: one from a version before the parts (the plan had none, so that's its core), or one of this version's
 * that an older version open on this device wrote back without its core and parts (it keeps a record's revision and
 * hash only). Then the fingerprint is the core with the parts as they were, which are still this plan's, or the other
 * side's (`other`), unless both changed them since: so a tick here and an edit there aren't taken for a conflict (the
 * second review of the storage change, Nov 1).
 */
function coreAsRecorded(rec: SyncRecord, name: string, c: ProjectContent, other: ProjectContent): boolean {
  const core = coreHash(name, c);
  if (rec.core !== undefined || rec.hash === core) return coreOfRecord(rec) === core;
  const bare = coreOf(c);
  return rec.hash === planHash(name, { ...bare, ...partsOf(c) }) || rec.hash === planHash(name, { ...bare, ...partsOf(other) });
}
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
  // (A rough scale, Nov 4, left out: it's set and cleared only with the scale, which is here; the release drops it from
  // the photo it sends with any edit of its own, which would read as the photo changed there, a copy made against a
  // scale set again here. Kept from here meanwhile: withRoughScale. A photo without one is fingerprinted as before.)
  const { fingerprint: fp, roughScale: _r, ...placement } = ph as Record<string, unknown>;
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
  const rec: SyncRecord = { revision, hash: planHash(name, c), core: coreHash(name, c), bare: bareHash(name, c) };
  const parts = partsOf(c);
  if (Object.keys(parts).length) rec.parts = parts;
  const marks = marksOf(c);
  if (marks) rec.marks = marks;
  return photo === undefined ? rec : { ...rec, photo };
};
/**
 * The shapes of a copy of a plan with a bed's conditions or a fruit-partner dismissal (marks included), by id: a
 * record's `marks`. Only from the server's copy (what another device can take): a download's record describes the copy
 * as kept here, with this device's own parts filled in, so it takes them from the server's copy itself.
 */
export function marksOf(c: ProjectContent): SyncRecord['marks'] {
  if (!Array.isArray(c.shapes)) return undefined;
  const conditions: string[] = [], fruit: string[] = [];
  for (const s of c.shapes) {
    if (!s || typeof s !== 'object') continue;
    const o = s as { id?: unknown; role?: unknown; conditions?: unknown; fruitDismissed?: unknown };
    if (typeof o.id !== 'string') continue;
    if (o.role === 'bed' && o.conditions !== undefined) conditions.push(o.id);
    if (o.fruitDismissed !== undefined) fruit.push(o.id);
  }
  if (!conditions.length && !fruit.length) return undefined;
  return { ...(conditions.length ? { conditions } : {}), ...(fruit.length ? { fruit } : {}) };
}
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
  return withPrintUnder(withRoughScale(withMeasuredSides(withBedConditions(withFruitDismissals(withChosenColors(withStructures(withVineSupports(withUtilities(withSubFeatures(withGoneDates(out, mine), mine), mine), mine), mine), mine), mine), mine), mine), mine), mine);
}
/**
 * A plan's print choice for the plants under taller ones (`print.under`, Nov 4: src/view-settings.ts printUnder), which
 * an older version drops from the print settings it sends (its sanitizePrint builds them from the fields it knows):
 * kept from here when the server's copy's print settings say nothing of it at all. Once picked, this version keeps one
 * (Show through too), so a copy without one is a plan never picked anywhere, or an older version's copy, or a copy of
 * that. Where the server's has one, it stands. The server's copy goes without it until a device that has it sends the
 * plan again (any edit). (Filled in from here, it isn't taken for a change there: asRecordedButUnder.)
 */
function withPrintUnder(server: ProjectContent, mine: ProjectContent): ProjectContent {
  const there = server.print, here = mine.print;
  if (!isObject(there) || 'under' in there || !isObject(here) || (here.under !== 'windows' && here.under !== 'screen')) return server;
  return { ...server, print: { ...there, under: here.under } };
}
/**
 * Whether the server's copy (`server`, as read here, this device's choice filled in) is the plan as this device's
 * record has it but for the print choice for the plants under taller ones, which the copy as sent (`sent`) doesn't have
 * at all: an older version's copy, with that field dropped and nothing else in the plan's core changed there (a tick,
 * the photo moved, or no edit of its own). Filled from here, the choice picked again here would read as changed there,
 * and a copy would be made against any other edit of the plan here (as for a bed's conditions: found Nov 4, building
 * this; asRecordedButConditions, Nov 5). Tried as recorded: none picked (or Show through: the same), or As on screen.
 */
function asRecordedButUnder(rec: SyncRecord, name: string, server: ProjectContent, sent: ProjectContent, mine: ProjectContent): boolean {
  return underAsRecorded(server, sent).some((c) => coreAsRecorded(rec, name, c, mine));
}
/**
 * The server's copy (`server`, as read here) with each print choice for the plants under taller ones it may have had as
 * recorded, where the copy as sent (`sent`) says nothing of it at all (asRecordedButUnder): none picked (or Show through:
 * the same), and As on screen. None where it says something of it.
 */
function underAsRecorded(server: ProjectContent, sent: ProjectContent): ProjectContent[] {
  if (!isObject(sent.print) || 'under' in sent.print || !isObject(server.print)) return [];
  const { under: _u, ...rest } = server.print;
  return [rest, { ...rest, under: 'screen' }].map((print) => ({ ...server, print }));
}
/**
 * Whether the server's copy (`server`, as read here, this device's parts filled in) is the plan as this device's record
 * has it but for beds' conditions, of which the copy as sent (`sent`) has none at all, on any shape: an older version's
 * copy (the release, an older tab), which drops them from every bed, with nothing else in the plan's core changed there
 * (a tick, the photo moved, or no edit of its own). Filled in from here (withBedConditions), they are this device's
 * conditions as they are now: changed here since the record, the server's copy read as changed there, and a copy was
 * made against any other edit of the plan here (found Nov 4, building asRecordedButUnder). So the record's core without
 * them (`bare`) is compared with the copy's, as read here, without them; with the print choice for the plants under
 * taller ones as recorded too, where the copy dropped that as well (the same versions drop both).
 *
 * Why this can't take a real change there for none: every other part of the core (the name, every other field of every
 * shape, the print settings) must be exactly as recorded, and the copy says nothing of conditions. A version that drops
 * them can't have changed them; a device of this version sends every bed's it has, so a copy from it with none at all is
 * one from a device that had none on any bed: one that took the plan after an older version dropped them (nothing to
 * take away), or one that took them away where its record said the server's copy had none (src/marks.ts mayMark: no
 * {}). That last is the window docs/storage.md keeps: a copy made for it held this device's conditions, filled in, in the
 * original as in the copy, so neither kept that device's change. A record without `bare` (from before it, or written by
 * an older version) isn't compared this way.
 */
function asRecordedButConditions(rec: SyncRecord, name: string, server: ProjectContent, sent: ProjectContent): boolean {
  if (rec.core === undefined || rec.bare === undefined || !Array.isArray(sent.shapes) || sent.shapes.some(hasConditions)) return false;
  return [server, ...underAsRecorded(server, sent)].some((c) => bareHash(name, c) === rec.bare);
}
/**
 * Whether `here` has a print choice for the plants under taller ones that `there`'s print settings say nothing of at
 * all. The fingerprints read Show through picked as none picked, but a server's copy without it isn't one that has it:
 * a device still holding As on screen, from before an older version dropped it, would fill its own back in
 * (withPrintUnder) and send it with its next edit, over the pick (the review's R1, Nov 4).
 */
function pickNotThere(here: ProjectContent, there: ProjectContent): boolean {
  return isObject(here.print) && 'under' in here.print && isObject(there.print) && !('under' in there.print);
}
/**
 * Whether `here` has a mark of something taken away on purpose, a bed's conditions cleared ({}) or a fruit-partner
 * warning shown again (''), where `there`'s copy of that shape says nothing of that field at all. The fingerprints read
 * either as none, but a server's copy without the field isn't one that has the mark: a device still holding the answers
 * or the dismissal, from before an older version dropped them, would fill its own back in (withBedConditions,
 * withFruitDismissals) and send it with its next edit, over the mark, everywhere (found Nov 5, as pickNotThere: the
 * review's R1). `there` is the server's copy as it sent it, not as read here: a field there in a form this version
 * can't read (and drops, reading it) is still something there, never sent over for a mark.
 */
function markNotThere(here: ProjectContent, there: ProjectContent): boolean {
  if (!Array.isArray(here.shapes) || !Array.isArray(there.shapes)) return false;
  type Marked = { id?: unknown; role?: unknown; conditions?: unknown; fruitDismissed?: unknown };
  const theirs = new Map<unknown, Marked>();
  for (const s of there.shapes as Marked[]) if (s && typeof s === 'object') theirs.set(s.id, s);
  return (here.shapes as Marked[]).some((s) => {
    const t = s && typeof s === 'object' ? theirs.get(s.id) : undefined;
    if (!t) return false;
    const cleared = s.role === 'bed' && isObject(s.conditions) && Object.keys(s.conditions).length === 0 && !('conditions' in t);
    return cleared || (s.fruitDismissed === '' && !('fruitDismissed' in t));
  });
}
/**
 * The sides of a shape typed as numbers (`measured`, Nov 4: src/measured.ts), which an older version drops from every
 * shape it sends, side by side: the server's copy's own entries stand, and one here for a side they don't name is kept
 * only where that side is provably the same side, and still the length typed (within MEASURED_TOL): a rectangle with
 * that dimension the same (its Width for sides 0 and 2, its Length for 1 and 3), or an outline or a line with as many
 * points and both ends of that side exactly where they are here. Moved or turned there, each side is the same; a point
 * added or taken out there (the sides perhaps renumbered), none is kept, so a number never lands on another side, nor
 * on a side another device changed (the honest rule: docs/storage.md). So a typed Length here stays beside a Width
 * typed on another device that never had it (the review's R4: an older version had sent the plan without them).
 * Nothing marks them taken away on purpose: this version takes a side away only when its length changes, which this
 * tells.
 */
function withMeasuredSides(server: ProjectContent, mine: ProjectContent): ProjectContent {
  if (!Array.isArray(server.shapes) || !Array.isArray(mine.shapes)) return server;
  const kept = new Map<unknown, Sided>();
  for (const s of mine.shapes as Sided[]) if (s && Array.isArray(s.measured) && s.measured.length) kept.set(s.id, s);
  if (!kept.size) return server;
  let filled = false;
  const shapes = (server.shapes as Sided[]).map((s) => {
    const k = s && typeof s === 'object' ? kept.get(s.id) : undefined;
    if (!k) return s;
    const theirs: unknown[] = Array.isArray(s.measured) ? s.measured : [];
    const named = new Set(theirs.map((m) => (m && typeof m === 'object' ? (m as { side?: unknown }).side : undefined)));
    const add = (k.measured as { side?: unknown; ft?: unknown }[]).filter((m) => m && !named.has(m.side) && sameSide(s, k, m));
    if (!add.length) return s;
    filled = true;
    return { ...s, measured: [...JSON.parse(JSON.stringify(theirs)), ...add.map((m) => ({ side: m.side, ft: m.ft }))] };
  });
  return filled ? { ...server, shapes } : server;
}
type Sided = { id?: unknown; type?: unknown; width?: unknown; height?: unknown; points?: unknown; measured?: unknown };
/**
 * Whether side `m.side` of the server's copy (`there`) is provably that side here (`here`), and the length typed: see
 * withMeasuredSides.
 */
function sameSide(there: Sided, here: Sided, m: { side?: unknown; ft?: unknown }): boolean {
  const i = m.side, ft = m.ft;
  if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || typeof ft !== 'number' || there.type !== here.type) return false;
  const near = (len: number) => Math.abs(len - ft) <= MEASURED_TOL + 1e-9;
  if (there.type === 'rect') {
    const dim = i % 2 === 0 ? 'width' : 'height', len = there[dim];
    return i < 4 && typeof len === 'number' && len === here[dim] && near(len);
  }
  if (there.type !== 'poly' && there.type !== 'line') return false;
  const a = there.points, b = here.points;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const n = a.length, j = (i + 1) % n;
  if (i >= (there.type === 'poly' ? n : n - 1)) return false;
  const at = (p: unknown): [number, number] | null => (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' ? [p[0], p[1]] : null);
  const p = at(a[i]), q = at(a[j]), p2 = at(b[i]), q2 = at(b[j]);
  if (!p || !q || !p2 || !q2 || p[0] !== p2[0] || p[1] !== p2[1] || q[0] !== q2[0] || q[1] !== q2[1]) return false;
  return near(Math.hypot(q[0] - p[0], q[1] - p[1]));
}
/**
 * A photo's rough scale (`roughScale`, Nov 4), which an older version drops from the photo it sends: kept from here
 * when the server's copy is the same photo (its fingerprint) at exactly the same scale and says neither that it's rough
 * nor that it isn't to scale yet. Only setting the scale sets or clears it, and setting it again gives another scale,
 * so the same scale without it is an older version's copy (moved, turned, made fainter, or the plan edited). Where the
 * server's has it, or another scale, it stands.
 */
function withRoughScale(server: ProjectContent, mine: ProjectContent): ProjectContent {
  type Placed = { fingerprint?: unknown; ftPerPx?: unknown; uncalibrated?: unknown; roughScale?: unknown };
  const there = server.photo as Placed | null | undefined, here = mine.photo as Placed | null | undefined;
  if (!isObject(there) || !isObject(here) || here.roughScale !== true || 'roughScale' in there || 'uncalibrated' in there) return server;
  if (typeof there.fingerprint !== 'string' || there.fingerprint !== here.fingerprint || typeof there.ftPerPx !== 'number' || there.ftPerPx !== here.ftPerPx) return server;
  return { ...server, photo: { ...there, roughScale: true } };
}
/**
 * A bed's conditions (Nov 2: its soil, moisture, drip, and sun where no sun area covers it), which an older version
 * drops from a shape it sends: kept from here when the server's copy of that shape, still a bed (its id and role), has
 * none at all. Without it, a device on an older version with an edit of its own sends the plan over newer conditions,
 * its merge not seeing them, and every device then loses them. The server's copy goes without them until a device that
 * has them sends the plan again. {} (cleared on purpose) is kept the same way, so a device that cleared them says so
 * again as it next sends the plan; where the server has some, {} or answers, they stand. (Filled in from here into a
 * copy with none at all, they aren't taken for a change there: asRecordedButConditions.)
 *
 * What's left (as for fruitDismissed, docs/storage.md): a device offline through another device's change to a bed's
 * conditions (set, changed or cleared), with a device on an older version sending the plan between, still has its own,
 * which the server's copy no longer contradicts: it keeps them, and they go to everyone if it sends the plan before the
 * device that made the change does. Only while one of the account's devices is on database version 3 or before
 * (docs/storage.md has the other windows).
 */
function withBedConditions(server: ProjectContent, mine: ProjectContent): ProjectContent {
  if (!Array.isArray(server.shapes) || !Array.isArray(mine.shapes)) return server;
  type Bed = { id?: unknown; role?: unknown; conditions?: unknown };
  const kept = new Map<unknown, unknown>();
  for (const s of mine.shapes as Bed[]) if (s && s.role === 'bed' && isObject(s.conditions)) kept.set(s.id, s.conditions);
  if (!kept.size) return server;
  let filled = false;
  const shapes = (server.shapes as Bed[]).map((s) => {
    if (!s || typeof s !== 'object' || s.role !== 'bed' || 'conditions' in s || !kept.has(s.id)) return s;
    filled = true;
    return { ...s, conditions: JSON.parse(JSON.stringify(kept.get(s.id))) };
  });
  return filled ? { ...server, shapes } : server;
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
 * A plant's fruit-partner warning dismissed for it alone (fruitDismissed, Nov 1), which an older version drops from a
 * shape it sends: kept from here when the server's copy of that shape, the same plant (its id and plantId), has none at
 * all. Without it, a device on the release with an edit of its own sends the plan over a newer dismissal, its merge not
 * seeing it (the review of the change, Nov 1), and every device then lost it. The server's copy goes without it until a
 * device that has it sends the plan again.
 *
 * '' (shown again on purpose) is kept the same way: a device that showed it again says so again, as it next sends the
 * plan, where the release dropped that too (the second review, Nov 1). Where the server has one, '' or words, it stands.
 * What's left: a device offline through another device's Show again, with a device on the release sending the plan
 * between, still has the words, which the server's copy no longer contradicts: it keeps them, and they come back for
 * everyone if it sends the plan before the device that showed it again does. Only while one of the account's devices
 * is still on the release (docs/storage.md).
 */
function withFruitDismissals(server: ProjectContent, mine: ProjectContent): ProjectContent {
  if (!Array.isArray(server.shapes) || !Array.isArray(mine.shapes)) return server;
  type Fruit = { id?: unknown; plantId?: unknown; fruitDismissed?: unknown };
  const kept = new Map<unknown, Fruit>();
  for (const s of mine.shapes as Fruit[]) if (s && typeof s.fruitDismissed === 'string' && typeof s.plantId === 'string') kept.set(s.id, s);
  if (!kept.size) return server;
  let filled = false;
  const shapes = (server.shapes as Fruit[]).map((s) => {
    const k = s && typeof s === 'object' ? kept.get(s.id) : undefined;
    if (!k || s.plantId !== k.plantId || 'fruitDismissed' in s) return s;
    filled = true;
    return { ...s, fruitDismissed: k.fruitDismissed };
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
      // deleted here: trashed after all, at the server's revision. Judged by the record it had as it was deleted, that
      // deletion's (an older version can clear a tombstone and delete the plan again, leaving the first one's record).
      const was = answer === 'changed' ? local.deletedRecord?.(id) : undefined;
      if (was && was.revision === rev) {
        const got = (await remote.fetch([id]))[id];
        const n = got ? local.normalize(got.name, got.content) : undefined;
        // (Only what this version can see: tidying it as stored here must leave it whole. A part of the plan, or of a
        // shape, that only a later version knows is left out by that, so an edit to it there would go unseen, into the
        // trash: then it comes back, as before. The second review of the storage change, Nov 1.)
        const whole = !!got && !!n && got.name === n.name && canonical(planOf(got.content)) === canonical(planOf(n.content));
        if (got && n && whole && (photoKey(n.content) ?? was.photo ?? 'none') === (was.photo ?? 'none') && coreHash(n.name, n.content) === coreOfRecord(was)
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
    // What the server has (anything else here goes up next time), still holding this device's photo if the original kept
    // it. But the print choice for the plants under taller ones, where the server's copy says nothing of it, as the
    // original has it, filled in from here (withPrintUnder), as a download records it: recorded without it, that fill
    // was a change made here at the next pass, and another edit there first made a second copy (the review's R2, Nov 4).
    // A bed's conditions filled in (withBedConditions) aren't recorded so: an edit there to the plan's core before the
    // original next goes up still makes that second copy; a tick or the photo moved there doesn't, with an edit here or
    // none (asRecordedButConditions, Nov 5). docs/storage.md.
    const n = local.normalize(serverName, withPrintUnder(asOnServer, serverContent));
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
    // (The other side's parts as each has them: the server's as it sent them, without this device's filled in.)
    const sentHere = local.normalize(serverName, sent).content;
    const planHere = !rec || !coreAsRecorded(rec, p.name, p.content, sentHere);
    const planThere = !rec || !(coreAsRecorded(rec, n.name, n.content, p.content) || asRecordedButUnder(rec, n.name, n.content, sent, p.content)
      || asRecordedButConditions(rec, n.name, n.content, sent));
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
    const samePlan = merged.name === raw.name && planHash(merged.name, merged.content) === planHash(raw.name, raw.content)
      && !pickNotThere(merged.content, raw.content) && !markNotThere(merged.content, sent);
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
          // The parts settled with the server's as recorded, before going up: a change made here since is stamped later
          // and stays; any part lost here since, or put back older (a version before them saving the plan on this device,
          // an unsaved copy of it replayed late), comes back as the server has it.
          const content = { ...p.content, ...settleParts(p.content, rec.parts ?? {}) };
          let q = p;
          if (planHash(p.name, content) !== planHash(p.name, p.content)) {
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
          // (Its marks from the server's copy, not this device's own parts filled in: src/marks.ts.)
          const r = recordAfter(n.name, local.normalize(g.name, whole).content, g.revision, rec, rec?.photo);
          const marks = marksOf(g.content);
          if (marks) r.marks = marks; else delete r.marks;
          await local.setRecord(id, r);
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
