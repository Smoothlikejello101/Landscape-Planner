import { recordError } from './error-log';
import { MAX_POINTS, MAX_TREE_HEIGHT, MAX_TRUNK, MAX_ZOOM, MIN_POINTS, MIN_TRUNK, MIN_ZOOM, STORAGE } from './constants';
import { sanitizeSubFeatures } from './features';
import { isStoredUtilityKind } from './utility-kinds';
import { DB_VERSION, del, NewerVersionError, openKV, put, type KV, type WriteOp } from './db';
import { cancelHistoryDebounce } from './history';
import { DEFAULT_PRINT, state } from './state';
import { isRole } from './roles';
import { cleanPhaseName, filterActive, isStatus, MAX_PHASES } from './status';
import type { BedConditions, BgImage, Clipboard, PathShape, PhotoRef, PlanBought, PlanDismissals, PlanHousehold, PlanSwitches, PrintSettings, SizeMode, ProjectData, ProjectMeta, RoleViews, Shape, ShapeFilter, SunInfo, UtilityKind, WarningSwitch } from './types';
import { setWorldPoints } from './geometry';
import { now, uid } from './util';
import { photoFingerprint } from './sync/photo';
import { canonical, coreHash, fingerprint, withoutClearedMarks } from './sync/engine';
import { sanitizeLocation } from './climate';
import { householdFromDevice } from './yard';
import { applySwitches, planSwitches, switchesAllOn, switchesFromDevice, WARNING_SWITCHES } from './view-settings';

// Persistence. Projects live in IndexedDB:
//   meta/<projectId>          ProjectMeta (name, dates, shape count)
//   projects/<projectId>      ProjectData without the background image bytes
//   images/<projectId>/<id>   { dataUrl } for the background image
//   kv/current, kv/clipboard, kv/lastBackupAt, kv/migratedFromLocalStorage,
//   kv/myPlants (the user's plant library), kv/myPlantSync (its sync state), kv/lastSizeMode,
//   kv/tookFromDevice (the yard and warning switches the plans here took from this device, and when: takeFromDevice),
//   kv/syncDeleted (the sync records of synced projects deleted here, until the server's trash has them),
//   kv/cleared/<projectId>    what Clear all took from that project, until something new is drawn there
// The current project is held in `state`; saves are debounced and also
// flushed when the page is hidden so a quick app switch can't lose an edit.
// What's stored changing in a way an older version would lose data saving over it raises src/db.ts DB_VERSION
// (docs/storage.md).

interface StoredBg extends Omit<BgImage, 'dataUrl'> { imageId: string }
interface StoredProject extends Omit<ProjectData, 'bgImage'> {
  bgImage: StoredBg | null;
  /**
   * The database version (src/db.ts DB_VERSION) of the app that wrote this plan record; none: 1, from before it was
   * kept. A journal from an older one is never put over it (replayJournals). A journal put in place keeps its own.
   */
  dbVersion?: number;
  /**
   * The page that wrote it, when, and that page's edit count then (`savedSeq`: a journal put in place, its own); none
   * from before they were kept. A journal of that page's with no more edits than that holds nothing the plan hasn't
   * (replayJournals: a count, not a time, so a clock set back can't make it look older).
   */
  savedByPage?: string;
  savedAt?: number;
  savedSeq?: number;
}
/** Who wrote a plan record, kept with it: this page and version, now, at its edit count, unless said (a journal put in place). */
interface WriteStamp { dbVersion: number; page?: string; at: number; seq?: number }
interface ImageRecord { dataUrl: string; createdAt?: number }

const SAVE_DEBOUNCE_MS = 250;
const IMAGE_GC_AGE_MS = 60 * 60 * 1000;
const imageKey = (projectId: string, imageId: string) => `${projectId}/${imageId}`;

let kv: KV | null = null;
let clipboardCache: Clipboard | null = null;
/** Image keys already written for the current project (avoid rewriting image bytes on every save). */
let storedImageKeys = new Set<string>();
/** Image keys known to be committed to disk for the current project. */
let committedImageKeys = new Set<string>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveChain: Promise<boolean> = Promise.resolve(true);
let quotaWarned = false;
/** Whether the last failed save failed for want of space on the device (the warning bar says so). */
export const outOfSpace = () => quotaWarned;
/** True after a save failed and nothing has saved successfully since. */
let saveFailing = false;
let onSaveStatus: (() => void) | null = null;
let lastFailureJournalAt = 0;
/** Called whenever saving starts or stops failing (to show/hide a warning). */
export function setSaveStatusListener(fn: () => void) { onSaveStatus = fn; }
export function saveIsFailing(): boolean { return saveFailing; }
function setSaveFailing(v: boolean) {
  if (saveFailing === v) return;
  saveFailing = v;
  onSaveStatus?.();
  onSaveState?.();
}
let onSaveState: (() => void) | null = null;
/** Called when changes start waiting to be saved, and when they're saved (the top bar's "Saved"). */
export function setSaveStateListener(fn: () => void) { onSaveState = fn; }
/** Edit counter vs. last edit known to be on disk; unequal means unsaved changes. */
let editSeq = 0;
let savedSeq = 0;
/**
 * The same for changes to the plan itself, not counting where it's looked at from (zoom, pan, Fit: saveView): only
 * these make it "last modified".
 */
let planSeq = 0;
let savedPlanSeq = 0;
/**
 * Synchronous safety copy of unsaved edits, written to localStorage when the
 * page hides. IndexedDB writes are asynchronous and browsers may abandon them
 * when a page unloads; this journal is replayed on the next start.
 *
 * Each page keeps its own, `lp-journal:<plan>@<page>`, and only ever clears its own: another tab's, or one an older
 * version wrote (`lp-journal:<plan>`, no page: release 3 and before), holds edits nothing else has, and is left for
 * the next start to sort out (replayJournals). (Keyed by plan alone, a save of the plan here cleared an older tab's
 * journal, the only copy of its edit, and the two overwrote each other: the review, Nov 1.)
 */
const JOURNAL_PREFIX = 'lp-journal:';
/** This page, for its journals and the plans it saves: new each time the app opens. */
let PAGE = newPageId();
function newPageId(): string { return (globalThis.crypto?.randomUUID?.() ?? uid() + uid() + uid()).replace(/[^A-Za-z0-9]/g, '').slice(0, 20); }
const journalKey = (projectId: string, page = PAGE) => `${JOURNAL_PREFIX}${projectId}@${page}`;
/**
 * `dbVersion`: the database version of the app that wrote it (src/db.ts DB_VERSION); none: 1, from before it was kept.
 * `page`: the page that wrote it (none: an older version's, keyed by its plan alone); `seq`, that page's edit count then.
 */
interface Journal { projectId: string; at: number; dbVersion?: number; page?: string; seq?: number; data: ProjectData }

/**
 * Set once a newer version of the app, in another tab or window, has taken the database (src/db.ts): this page saves
 * nothing more, not even a journal, and says so (src/main.ts).
 */
let superseded = false;
export const supersededByNewer = () => superseded;
let onNewer: ((lastWrite: Promise<boolean>) => void) | null = null;
/** Called once a newer version has taken the database, with the last write this page started before it closed. */
export function setNewerVersionListener(fn: (lastWrite: Promise<boolean>) => void) { onNewer = fn; }

function db(): KV {
  if (!kv) throw new Error('storage not initialized');
  return kv;
}
/** False when the browser won't let us save (changes are lost on reload). */
export function storageIsDurable(): boolean { return !!kv?.durable; }

// ---------- Validation of loaded/imported data ----------
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
/** Only plain hex colors: anything else could inject markup when rendered. */
export function safeColor(v: unknown, fallback = '#16a34a'): string {
  return typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback;
}
/** Only embedded images (no remote URLs). */
function safeImageUrl(v: unknown): string {
  return typeof v === 'string' && /^data:image\/[a-z+.-]+;base64,/i.test(v) ? v : '';
}

/** The plants a plant's been left close to on purpose: ids, each once (at most 200); null for none. */
function crowdOk(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const ids = [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 100))].slice(0, 200);
  return ids.length ? ids : null;
}

/** A word as a bed's conditions keep one: those this version asks, or one a later version adds (kept as it came). */
const conditionWord = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9-]{0,30}$/.test(v);
const plainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** The questions this version asks of a bed (src/types.ts BedConditions). */
const ASKED = new Set(['sun', 'soil', 'moisture', 'drip']);
/** A bed's answers to questions a later version asks, as kept: setting this version's leaves them as they are. */
export function laterQuestionsOf(c: BedConditions | undefined): BedConditions {
  return Object.fromEntries(Object.entries(c ?? {}).filter(([k]) => !ASKED.has(k)));
}
/** A question's name as a later version might add one: a word, no markup, nothing an object has of its own. */
const laterQuestion = (k: string): boolean => /^[a-z][A-Za-z0-9]{0,30}$/.test(k) && !(k in Object.prototype);
/** How many questions a later version may add that are kept (more than a bed could be asked: anything past is noise). */
const MAX_LATER_QUESTIONS = 12;
/**
 * A bed's conditions (src/types.ts BedConditions) as they're kept: each part checked on its own, the rest kept.
 * - A word this version doesn't ask is kept as it came (one a later version adds, as a utility's kind is).
 * - A question this version doesn't know (one a later version adds) is kept as it came when its answer is a word or
 *   true: dropped here, it would be lost for everyone when this device next sent the plan (the review, Nov 4).
 * - A part that isn't one is dropped: not a word, a sun without both its ends, `drip` other than true.
 * - `{}`, cleared on purpose, is kept: sync doesn't fill it back (src/sync/engine.ts withBedConditions).
 * Undefined, none: not an object; or one with parts, none of which could be kept. That's read as none, not as cleared
 * on purpose, so sync may still fill it back from a device that has it.
 */
export function sanitizeBedConditions(raw: unknown): BedConditions | undefined {
  if (!plainObject(raw)) return undefined;
  const out: BedConditions = {};
  const sun = raw.sun;
  if (conditionWord(sun)) out.sun = sun;
  else if (plainObject(sun) && conditionWord(sun.most) && conditionWord(sun.least)) out.sun = { most: sun.most, least: sun.least };
  if (conditionWord(raw.soil)) out.soil = raw.soil;
  if (conditionWord(raw.moisture)) out.moisture = raw.moisture;
  if (raw.drip === true) out.drip = true;
  let later = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (ASKED.has(k) || !laterQuestion(k) || !(conditionWord(v) || v === true)) continue;
    if (++later > MAX_LATER_QUESTIONS) break;
    out[k] = v;
  }
  const hadParts = Object.values(raw).some((v) => v !== undefined);
  return Object.keys(out).length || !hadParts ? out : undefined;
}

/** Fill defaults and drop anything that would break rendering. Returns null for unusable input. */
export function migrateShape(raw: unknown): Shape | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const base = {
    id: str(s.id) || uid(),
    x: num(s.x, 0), y: num(s.y, 0),
    color: safeColor(s.color),
    label: str(s.label),
    opacity: num(s.opacity, 0.65),
    locked: s.locked === true,
    ...(typeof s.plantId === 'string' ? { plantId: s.plantId } : {}),
    // Shapes placed from the plant picker are plants; others stay unassigned until tagged.
    ...(isRole(s.role) ? { role: s.role } : typeof s.plantId === 'string' ? { role: 'plant' as const } : {}),
    ...(s.carryPlants === false ? { carryPlants: false } : {}),
    // (A bed's conditions, as answered (Nov 2): on a bed only, left out of anything else. Older plans have none, and
    // versions before it drop it. {} is cleared on purpose: kept, so sync doesn't fill it back from this device's copy
    // (src/sync/engine.ts withBedConditions), which it does when the server's has none, an older version having
    // dropped it.)
    ...(s.role === 'bed' && sanitizeBedConditions(s.conditions) ? { conditions: sanitizeBedConditions(s.conditions)! } : {}),
    ...(sanitizeSun(s.sun) ? { sun: sanitizeSun(s.sun)! } : {}),
    ...(typeof s.sunDismissed === 'string' && s.sunDismissed ? { sunDismissed: s.sunDismissed.slice(0, 300) } : {}),
    ...(typeof s.hardyDismissed === 'string' && s.hardyDismissed ? { hardyDismissed: s.hardyDismissed.slice(0, 300) } : {}),
    ...(typeof s.poisonDismissed === 'string' && s.poisonDismissed ? { poisonDismissed: s.poisonDismissed.slice(0, 300) } : {}),
    // (A fruit-partner warning dismissed for this copy alone; older plans have none. '' is one shown again on purpose:
    // kept, so sync doesn't fill it back from this device's copy (src/sync/engine.ts withFruitDismissals), which it does
    // when the server's has none, an older version having dropped it.)
    ...(typeof s.fruitDismissed === 'string' ? { fruitDismissed: s.fruitDismissed.slice(0, 300) } : {}),
    // (What it was added as; older shapes have none. A word only: src/kinds.ts reads it, and ignores one it doesn't know.)
    ...(typeof s.kind === 'string' && /^[a-z]{2,12}$/.test(s.kind) ? { kind: s.kind } : {}),
    // (A utility's kind: a power line, a buried line, a septic field; kept on one made something else since, which is
    // that again if turned back. Older versions had neither.)
    // (One a later version adds, a short word, is kept as it came: not checked here, but not taken away.)
    ...(s.type !== 'circle' && s.type !== 'text' && isStoredUtilityKind(s.utility) ? { utility: s.utility as UtilityKind } : {}),
    // ('' is a warning shown again on purpose: kept, so sync doesn't fill it back from an older copy.)
    ...(typeof s.utilityDismissed === 'string' && s.utilityDismissed.length <= 2000 ? { utilityDismissed: s.utilityDismissed } : {}),
    // (Before Existing was a status of its own, a house, a fence or a tree drawn as one already there was "planted":
    // read as Existing. A tree with a planting date was planted, and stays so. Jason, Oct 31.)
    ...(isStatus(s.status) ? { status: s.status === 'planted' && ((isRole(s.role) && s.role !== 'plant') || (s.tree === true && typeof s.plantedOn !== 'string')) ? 'existing' as const : s.status } : {}),
    ...(typeof s.plantedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.plantedOn) ? { plantedOn: s.plantedOn } : {}),
    // (Only on a gone shape: a date left from before it was marked otherwise isn't kept.)
    // ('' is a date cleared on purpose: kept, so sync doesn't fill it back from an older copy.)
    ...(s.status === 'gone' && typeof s.goneOn === 'string' && /^(\d{4}-\d{2}-\d{2})?$/.test(s.goneOn) ? { goneOn: s.goneOn } : {}),
    ...(typeof s.phase === 'string' && cleanPhaseName(s.phase) ? { phase: cleanPhaseName(s.phase) } : {}),
  };
  const size = (v: unknown, d: number) => Math.max(0.1, num(v, d));
  // (Doors, windows, gates and the like, on a shape with edges; [] kept: they were all taken off. Older versions had none.)
  const subs = sanitizeSubFeatures(s.features);
  const featured = subs ? { features: subs } : {};
  switch (s.type) {
    case 'circle': {
      // Trees: a trunk size set by hand, and an outline for a canopy pruned into a shape.
      const canopy: [number, number][] = [];
      if (Array.isArray(s.canopy)) {
        for (const p of s.canopy.slice(0, MAX_POINTS)) {
          if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 1000 && Math.abs(p[1]) <= 1000) canopy.push([p[0], p[1]]);
        }
      }
      const shaped = canopy.length >= 3;
      // The outline must fit inside the radius used for sizes and spacing.
      const reach = shaped ? Math.max(...canopy.map(([x, y]) => Math.hypot(x, y))) : 0;
      const radius = size(s.radius, 2);
      return {
        ...base, type: 'circle', radius: reach > radius + 0.01 ? Math.ceil(reach * 4) / 4 : radius,
        ...(s.sizeFrom === 'plant' || s.sizeFrom === 'manual' ? { sizeFrom: s.sizeFrom } : {}),
        ...(s.tree === true ? { tree: true } : {}),
        ...(typeof s.trunk === 'number' && s.trunk >= MIN_TRUNK && s.trunk <= MAX_TRUNK ? { trunk: s.trunk } : {}),
        // (Trees: a height and lowest branches set by hand; older versions stored neither.)
        ...(typeof s.treeHeight === 'number' && s.treeHeight >= 1 && s.treeHeight <= MAX_TREE_HEIGHT ? { treeHeight: s.treeHeight } : {}),
        ...(typeof s.lowestBranch === 'number' && s.lowestBranch >= 0 && s.lowestBranch <= MAX_TREE_HEIGHT ? { lowestBranch: s.lowestBranch } : {}),
        ...(shaped ? { canopy } : {}),
        // (Plants left close to others on purpose, by id; older versions had none.)
        ...(crowdOk(s.crowdOk) ? { crowdOk: crowdOk(s.crowdOk)! } : {}),
        // (Vines: what it climbs, by id, or '' for none set by hand; older versions had neither: a groundcover.)
        ...(typeof s.climbsOn === 'string' && s.climbsOn.length <= 100 ? { climbsOn: s.climbsOn } : {}),
        // (A color chosen by hand, which pictures draw its leaves in; older versions had none: the catalog's colors.)
        ...(s.colorSet === true ? { colorSet: true } : {}),
        // (A flower color chosen among its sources' (a word, which the picture draws only where they list it); older
        // versions had none: the one its sources give most.)
        ...(typeof s.flowerColor === 'string' && /^[a-z]{3,12}$/.test(s.flowerColor) ? { flowerColor: s.flowerColor } : {}),
      };
    }
    case 'rect':
    case 'oval':
      return { ...base, type: s.type, width: size(s.width, 4), height: size(s.height, 3), rotation: num(s.rotation, 0), ...featured };
    case 'triangle': {
      const ra = s.rightAngle;
      return {
        ...base, type: 'triangle', width: size(s.width, 4), height: size(s.height, 3), rotation: num(s.rotation, 0),
        rightAngle: ra === 'br' || ra === 'tl' || ra === 'tr' ? ra : 'bl', ...featured,
      };
    }
    case 'poly':
    case 'line': {
      // Points must be finite pairs; too few to make the shape means it's unusable.
      const pts: { x: number; y: number }[] = [];
      if (Array.isArray(s.points)) {
        for (const p of s.points.slice(0, MAX_POINTS)) {
          if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push({ x: num(base.x, 0) + p[0], y: num(base.y, 0) + p[1] });
        }
      }
      if (pts.length < MIN_POINTS[s.type]) return null;
      const shape = {
        ...base, type: s.type, points: [], rotation: num(s.rotation, 0),
        ...(s.type === 'line' && s.showLength === true ? { showLength: true } : {}),
        // Paths: a width in feet (a quarter foot to 50 ft); anything else draws as a thin line.
        ...(s.type === 'line' && typeof s.pathWidth === 'number' && s.pathWidth >= 0.25 && s.pathWidth <= 50 ? { pathWidth: s.pathWidth } : {}),
        ...featured,
      } as PathShape;
      setWorldPoints(shape, pts); // re-normalize, whatever the file said
      return shape;
    }
    case 'text':
      return { ...base, type: 'text', fontSize: Math.min(50, Math.max(0.25, num(s.fontSize, 1))), rotation: num(s.rotation, 0) };
    default:
      return null;
  }
}
export function migrateBgImage(raw: Partial<BgImage>): BgImage {
  return {
    dataUrl: safeImageUrl(raw.dataUrl),
    ...(raw.imageId ? { imageId: raw.imageId } : {}),
    naturalWidth: Math.max(1, num(raw.naturalWidth, 1000)),
    naturalHeight: Math.max(1, num(raw.naturalHeight, 1000)),
    ftPerPx: num(raw.ftPerPx, 0.1) > 0 ? num(raw.ftPerPx, 0.1) : 0.1,
    cx: num(raw.cx, 0), cy: num(raw.cy, 0),
    rotation: num(raw.rotation, 0),
    opacity: Math.min(1, Math.max(0.05, num(raw.opacity, 0.6))),
    visible: raw.visible !== false,
    ...(isFingerprint(raw.fingerprint) ? { fingerprint: raw.fingerprint } : {}),
    ...(raw.deviceOnly === true ? { deviceOnly: true } : {}),
    // (Not to scale yet; older photos have no word on it, and are taken as calibrated.)
    ...(raw.uncalibrated === true ? { uncalibrated: true as const } : {}),
  };
}
const isFingerprint = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
/** Validate a synced photo reference; null if absent or unusable. */
export function sanitizePhotoRef(raw: unknown): PhotoRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.deviceOnly === true) return { deviceOnly: true };
  if (!isFingerprint(o.fingerprint)) return null;
  const { dataUrl: _d, fingerprint: _f, deviceOnly: _o, ...placed } = migrateBgImage({ ...(o as Partial<BgImage>), dataUrl: '' });
  return { fingerprint: o.fingerprint, ...placed };
}
/** How a background photo is synced: its fingerprint and placement (`fingerprint` known), or kept here. */
export function photoRefOf(bg: BgImage, fingerprint: string): PhotoRef {
  if (bg.deviceOnly) return { deviceOnly: true };
  const { naturalWidth, naturalHeight, ftPerPx, cx, cy, rotation, opacity, visible, uncalibrated } = migrateBgImage(bg);
  return { fingerprint, naturalWidth, naturalHeight, ftPerPx, cx, cy, rotation, opacity, visible, ...(uncalibrated ? { uncalibrated } : {}) };
}
const MINUTES_PER_DAY = 24 * 60;
/** Validate observed-sun data; null if unusable. */
export function sanitizeSun(raw: unknown): SunInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const periods: [number, number][] = [];
  if (Array.isArray(o.periods)) {
    for (const p of o.periods.slice(0, 6)) {
      if (!Array.isArray(p)) continue;
      const a = Math.max(0, Math.min(MINUTES_PER_DAY, num(p[0], NaN)));
      const b = Math.max(0, Math.min(MINUTES_PER_DAY, num(p[1], NaN)));
      if (Number.isFinite(a) && Number.isFinite(b)) periods.push(a <= b ? [a, b] : [b, a]);
    }
  }
  const date = typeof o.observedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.observedOn) ? o.observedOn : undefined;
  return {
    mode: o.mode === 'hours' ? 'hours' : 'times',
    periods: periods.length ? periods : [[540, 780]],
    hours: Math.max(0, Math.min(16, num(o.hours, 4))),
    dappled: o.dappled === true,
    ...(date ? { observedOn: date } : {}),
    ...(typeof o.note === 'string' && o.note ? { note: o.note.slice(0, 500) } : {}),
  };
}
/**
 * Warnings dismissed for a plant across the plan: kinds known, plant ids and what was said as short strings. Undefined
 * for a plan that never had any (it reads, and syncs, as before they existed); an object, empty or not, once it has.
 */
export function sanitizeDismissed(raw: unknown): PlanDismissals | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: PlanDismissals = {};
  for (const kind of ['hardy', 'poison', 'fruit'] as const) {
    const m = (raw as Record<string, unknown>)[kind];
    if (!m || typeof m !== 'object') continue;
    const kept = Object.entries(m as Record<string, unknown>)
      .filter(([id, said]) => /^[\w:.-]{1,120}$/.test(id) && typeof said === 'string' && said.length > 0 && said.length <= 300)
      .slice(0, 500) as [string, string][];
    if (kept.length) out[kind] = Object.fromEntries(kept);
  }
  return out;
}
/** The most kinds a plan's ticks keep (the newest changes, if ever more). */
const MAX_BOUGHT = 2000;
/**
 * The Plant list's ticks: kinds by id, each a whole number bought (0, unticked, kept: it syncs) and when it changed.
 * Undefined for a plan that never had any (it reads, and syncs, as before they existed); an object once it has.
 */
export function sanitizeBought(raw: unknown): PlanBought | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const kept: [string, { n: number; at: number }][] = [];
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[\w:.-]{1,120}$/.test(id) || !v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (typeof o.n !== 'number' || !Number.isFinite(o.n) || typeof o.at !== 'number' || !Number.isFinite(o.at) || o.at < 0) continue;
    kept.push([id, { n: Math.min(9999, Math.max(0, Math.floor(o.n))), at: o.at }]);
  }
  if (kept.length > MAX_BOUGHT) kept.sort((a, b) => b[1].at - a[1].at).splice(MAX_BOUGHT);
  return Object.fromEntries(kept);
}
/** Who's in a plan's yard; undefined if absent or not an object (then it's read as this device had it: src/yard.ts). */
export function sanitizeHousehold(raw: unknown): PlanHousehold | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  return {
    kids: o.kids === true, dogs: o.dogs === 'hideToxic' || o.dogs === 'nonToxic' ? o.dogs : '', cats: o.cats === true, horses: o.horses === true,
    answered: o.answered === true,
    ...(typeof o.at === 'number' && Number.isFinite(o.at) && o.at >= 0 ? { at: o.at } : {}),
  };
}
/**
 * A plan's warning switches (src/view-settings.ts): the ones this version knows, each on or off, with when it was
 * switched in the plan if it was. Undefined if absent or not an object (then they're read as this device had them).
 */
export function sanitizeSwitches(raw: unknown): PlanSwitches | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: PlanSwitches = {};
  for (const k of Object.keys(WARNING_SWITCHES) as WarningSwitch[]) {
    const v = o[k] as Record<string, unknown> | undefined;
    if (!v || typeof v !== 'object' || typeof v.on !== 'boolean') continue;
    out[k] = typeof v.at === 'number' && Number.isFinite(v.at) && v.at >= 0 ? { on: v.on, at: v.at } : { on: v.on };
  }
  return out;
}
function sanitizeRoleViews(raw: unknown): RoleViews {
  const out: RoleViews = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if ((isRole(k) || k === 'unassigned') && v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      out[k] = { ...(o.hidden === true ? { hidden: true } : {}), ...(o.locked === true ? { locked: true } : {}) };
    }
  }
  return out;
}
/** Validate printable-plan options; anything missing or odd gets the default. */
export function sanitizePrint(raw: unknown): PrintSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PRINT;
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  return {
    paper: o.paper === 'tabloid' || o.paper === 'a4' || o.paper === 'a3' ? o.paper : 'letter',
    orientation: o.orientation === 'portrait' || o.orientation === 'landscape' ? o.orientation : 'auto',
    title: str(o.title).slice(0, 120),
    subtitle: str(o.subtitle).slice(0, 200),
    includeBackground: bool(o.includeBackground, d.includeBackground),
    includeGrid: bool(o.includeGrid, d.includeGrid),
    includePlantList: bool(o.includePlantList, d.includePlantList),
    includeFullRings: bool(o.includeFullRings, d.includeFullRings),
    northDeg: ((num(o.northDeg, 0) % 360) + 360) % 360,
    statusFilter: isStatus(o.statusFilter) ? o.statusFilter : '',
    phaseFilter: str(o.phaseFilter).slice(0, 40),
  };
}
/** Phase names: unique, trimmed, capped; any phase a shape uses is kept in the list. */
export function sanitizePhases(raw: unknown, shapes: Shape[]): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    const n = typeof v === 'string' ? cleanPhaseName(v) : '';
    if (n && !out.includes(n) && out.length < MAX_PHASES) out.push(n);
  };
  if (Array.isArray(raw)) raw.forEach(add);
  shapes.forEach((s) => add(s.phase));
  return out;
}
/** The open project's data, as stored. */
export function currentProjectData(): ProjectData {
  return {
    shapes: state.shapes, zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY,
    roleViews: state.roleViews, print: state.print, sizeMode: state.sizeMode, sunWarnings: state.sunWarnings, phases: state.phases, bgImage: state.bgImage,
    photoElsewhere: state.photoElsewhere, location: state.location, dismissed: state.dismissed, bought: state.bought, household: state.household,
    switches: planSwitches(),
    ...(filterActive(state.viewFilter) ? { viewFilter: state.viewFilter } : {}),
  };
}
/** Normalize project data from storage, an old version, or an imported file. */
export function sanitizeProjectData(raw: unknown): ProjectData {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const shapes = Array.isArray(d.shapes) ? d.shapes.map(migrateShape).filter((s): s is Shape => !!s) : [];
  const bg = d.bgImage && typeof d.bgImage === 'object' ? migrateBgImage(d.bgImage as Partial<BgImage>) : null;
  const phases = sanitizePhases(d.phases, shapes);
  return {
    shapes,
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, num(d.zoom, 1))),
    offsetX: num(d.offsetX, -10),
    offsetY: num(d.offsetY, -10),
    roleViews: sanitizeRoleViews(d.roleViews),
    print: sanitizePrint(d.print),
    sizeMode: d.sizeMode === 'full' ? 'full' : 'typical',
    sunWarnings: d.sunWarnings !== false,
    dismissed: sanitizeDismissed(d.dismissed),
    bought: sanitizeBought(d.bought),
    household: sanitizeHousehold(d.household),
    switches: sanitizeSwitches(d.switches),
    phases,
    bgImage: bg && bg.dataUrl ? bg : null,
    photoElsewhere: bg && bg.dataUrl ? null : sanitizePhotoRef(d.photoElsewhere),
    location: d.location === null ? null : sanitizeLocation(d.location) ?? undefined,
    ...viewFilterOf(d.viewFilter, phases),
  };
}
/**
 * A plan's Layers → Show plants filter, as stored: a known status, one of the plan's phases, Gone shown or not. Anything
 * else, or no filter on at all, is none (absent: a plan from before it was kept, read as it was).
 */
export function viewFilterOf(raw: unknown, phases: string[]): { viewFilter?: ShapeFilter } {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const f: ShapeFilter = {
    status: isStatus(o.status) ? o.status : '',
    phase: typeof o.phase === 'string' && phases.includes(o.phase) ? o.phase : '',
    showGone: o.showGone === true,
  };
  return filterActive(f) ? { viewFilter: f } : {};
}

// ---------- Writing ----------
/** Ops that store `data` for project `id`, splitting the image bytes into their own record. */
function projectWriteOps(id: string, data: ProjectData, knownImageKeys?: Set<string>, stamp: WriteStamp = { dbVersion: DB_VERSION, page: PAGE, at: now(), seq: editSeq }): WriteOp[] {
  const ops: WriteOp[] = [];
  let storedBg: StoredBg | null = null;
  if (data.bgImage) {
    const { dataUrl, ...rest } = data.bgImage;
    const imageId = rest.imageId || uid();
    data.bgImage.imageId = imageId;
    const key = imageKey(id, imageId);
    if (!knownImageKeys?.has(key)) {
      ops.push(put('images', key, { dataUrl, createdAt: now() } satisfies ImageRecord));
      knownImageKeys?.add(key);
    }
    storedBg = { ...rest, imageId };
  }
  const stored: StoredProject = {
    shapes: data.shapes, zoom: data.zoom, offsetX: data.offsetX, offsetY: data.offsetY, roleViews: data.roleViews ?? {},
    print: data.print ?? { ...DEFAULT_PRINT }, sizeMode: data.sizeMode ?? 'typical', sunWarnings: data.sunWarnings !== false, phases: data.phases ?? [], bgImage: storedBg,
    photoElsewhere: storedBg ? null : data.photoElsewhere ?? null,
    location: data.location,
    ...(data.dismissed ? { dismissed: data.dismissed } : {}),
    ...(data.bought ? { bought: data.bought } : {}),
    ...(data.household ? { household: data.household } : {}),
    ...(data.switches ? { switches: data.switches } : {}),
    ...(data.viewFilter ? { viewFilter: data.viewFilter } : {}),
    dbVersion: stamp.dbVersion, ...(stamp.page ? { savedByPage: stamp.page } : {}), savedAt: stamp.at,
    ...(typeof stamp.seq === 'number' ? { savedSeq: stamp.seq } : {}),
  };
  ops.push(put('projects', id, stored));
  return ops;
}
function metaFor(id: string): ProjectMeta | undefined {
  return state.projects.find((p) => p.id === id);
}

function writeCurrent(): Promise<boolean> { return writeCurrentKnowing(storedImageKeys); }
/** `known`: image keys whose bytes needn't be written again. */
async function writeCurrentKnowing(known: Set<string>): Promise<boolean> {
  // (A newer version has the database: nothing more is saved here. False: not saved, so a switch or a sync waits.)
  if (superseded) return false;
  const id = state.currentProjectId;
  if (!id || !kv) return true;
  const seq = editSeq, plan = planSeq;
  const hadEdits = seq !== savedSeq; // (a flush with nothing new still writes; sync only hears of real edits)
  // Snapshot synchronously so later edits don't race with this write.
  const data = currentProjectData();
  const ops = projectWriteOps(id, data, known, { dbVersion: DB_VERSION, page: PAGE, at: now(), seq });
  const meta = metaFor(id);
  if (meta) {
    // (Only an edit makes it "last modified": opening a plan and leaving it moved it to the top of the list, under
    // the finger, and a quick tap opened the wrong one. Sam, Oct 30. Nor does a zoom, pan or Fit: saveView.)
    if (plan !== savedPlanSeq) meta.lastModified = now();
    meta.shapeCount = state.shapes.length;
    ops.push(put('meta', id, { ...meta }));
  }
  try {
    await kv.write(ops);
    for (const op of ops) if (op.store === 'images') committedImageKeys.add(op.key);
    savedSeq = Math.max(savedSeq, seq);
    savedPlanSeq = Math.max(savedPlanSeq, plan);
    if (savedSeq === editSeq) onSaveState?.();
    if (savedSeq === editSeq && state.currentProjectId === id) clearJournal(id);
    setSaveFailing(false);
    quotaWarned = false;
    if (hadEdits) afterSave?.();
    return true;
  } catch (e) {
    // The write didn't happen; forget image keys from this batch so they're retried.
    for (const op of ops) if (op.store === 'images') storedImageKeys.delete(op.key);
    console.error('save failed', e); recordError(e, 'save');
    // (Out of space: the warning bar says so, src/ui/save-warning.ts. Never a dialog: it would take the focus from a
    // field being typed in, and close the phone's keyboard.)
    if (e instanceof DOMException && e.name === 'QuotaExceededError') quotaWarned = true;
    // Keep a copy of the edits in case the app is closed now (at most every few
    // seconds: with a large unsaved image this is expensive). Page hide always writes one.
    if (now() - lastFailureJournalAt > 5000) { lastFailureJournalAt = now(); writeJournalIfDirty(); }
    setSaveFailing(true);
    return false;
  }
}
// ---- What Clear all took (Jason, Oct 30, from Sam: Clear all, a reload, and the plan was gone for good) ----
/** A project's shapes and photo as Clear all left them, offered back on its empty plan until something new is drawn. */
export interface ClearedPlan { shapes: Shape[]; bgImage: BgImage | null; photoElsewhere: ProjectData['photoElsewhere']; at: number }
const clearedKey = (id: string) => `cleared/${id}`;
/** Read from disk once a project is opened; null: nothing kept. */
const cleared = new Map<string, ClearedPlan | null>();
/** Keep what Clear all is about to take from the open project (its shapes, its photo with the bytes). */
export function keepCleared(plan: Omit<ClearedPlan, 'at'>): void {
  const id = state.currentProjectId;
  if (!id || !plan.shapes.length && !plan.bgImage) return;
  const c: ClearedPlan = { ...plan, at: now() };
  cleared.set(id, c);
  void kv?.write([put('kv', clearedKey(id), c)]).catch((e) => recordError(e, 'keep cleared'));
}
/** What Clear all took from the open project, if it's still on offer (its plan still empty). */
export function clearedNow(): ClearedPlan | null {
  const id = state.currentProjectId;
  return id && !state.shapes.length ? cleared.get(id) ?? null : null;
}
/** Read what Clear all left for a project (on opening it); `then` runs when there's something. */
export async function loadCleared(id: string, then?: () => void): Promise<void> {
  if (cleared.has(id) || !kv) return;
  try {
    const raw = await kv.get<unknown>('kv', clearedKey(id));
    if (!raw || typeof raw !== 'object') { cleared.set(id, null); return; }
    const r = raw as Partial<ClearedPlan>;
    const data = sanitizeProjectData({ shapes: r.shapes, bgImage: r.bgImage, photoElsewhere: r.photoElsewhere });
    cleared.set(id, { shapes: data.shapes, bgImage: data.bgImage ?? null, photoElsewhere: data.photoElsewhere ?? null, at: typeof r.at === 'number' ? r.at : 0 });
    then?.();
  } catch (e) { recordError(e, 'load cleared'); }
}
/** Done with it: brought back, or something new drawn in its place. */
export function forgetCleared(id = state.currentProjectId): void {
  if (!id || !cleared.get(id)) return;
  cleared.set(id, null);
  void kv?.write([del('kv', clearedKey(id))]).catch((e) => recordError(e, 'forget cleared'));
}

/** Schedule a save of the current project: an edit, which makes it "last modified". */
export function save() {
  planSeq++;
  scheduleSave();
}
/**
 * Schedule a save of where the plan is looked at from (zoom, pan, Fit): kept, so it opens where it was left, but not
 * a change to the plan, so it isn't "last modified" by it (the UI review, 2026-11-01: Fit, tapped after the app
 * updated, showed the plan "last modified" that minute before anything in it had changed).
 */
export function saveView() {
  scheduleSave();
}
function scheduleSave() {
  // (Something new drawn on a cleared plan: what was cleared isn't offered back any more.)
  if (state.shapes.length && state.currentProjectId && cleared.get(state.currentProjectId)) forgetCleared();
  const was = editSeq === savedSeq;
  editSeq++;
  if (was) onSaveState?.();
  if (state.currentProjectId) bumpChange(state.currentProjectId);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; void flushSave(); }, SAVE_DEBOUNCE_MS);
}
/** Write any pending changes now. Resolves true once they're on disk, false if the write failed. */
export function flushSave(): Promise<boolean> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  saveChain = saveChain.then(writeCurrent, writeCurrent);
  return saveChain;
}

export function hasUnsavedChanges(): boolean { return editSeq !== savedSeq; }
/** This page's own journal for a plan, saved now: gone. Never another page's, nor one an older version wrote. */
function clearJournal(projectId: string) {
  try { localStorage.removeItem(journalKey(projectId)); } catch { /* unavailable */ }
}
/**
 * Call when the page is being hidden or unloaded: synchronously records
 * unsaved edits so they survive even if the async write is abandoned.
 */
export function writeJournalIfDirty() {
  if (superseded) return; // (a newer version has the plans: its journal would be an older version's copy)
  const id = state.currentProjectId;
  if (!id || !hasUnsavedChanges() || !kv?.durable) return;
  // (A new view alone isn't kept here: replayed, a journal makes its plan "last modified" when it was written. The
  // write that's under way keeps it, unless the page dies first, and then only the zoom is lost.)
  if (planSeq === savedPlanSeq) return;
  const bg = state.bgImage;
  const imageOnDisk = !!(bg?.imageId && committedImageKeys.has(imageKey(id, bg.imageId)));
  const journal = (withImage: boolean): Journal => ({
    projectId: id, at: now(), dbVersion: DB_VERSION, page: PAGE, seq: editSeq,
    data: { ...currentProjectData(), bgImage: bg ? { ...bg, dataUrl: withImage ? bg.dataUrl : '' } : null },
  });
  try {
    localStorage.setItem(journalKey(id), JSON.stringify(journal(!imageOnDisk)));
  } catch {
    // Too big with the image bytes (localStorage holds ~5 MB): keep the shapes at least.
    try { localStorage.setItem(journalKey(id), JSON.stringify(journal(false))); } catch { /* give up */ }
  }
}
function journalKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(JOURNAL_PREFIX)) keys.push(k);
    }
    return keys;
  } catch { return []; }
}
/**
 * The parts of a plan that, once it has them, every save of it keeps (currentProjectData): its location (set, or
 * cleared: null), the warnings dismissed for a plant, the Plant list's ticks, who's in the yard, the warning switches.
 * A journal without one the stored plan has was written by a page that never had it: a version from before it, or a
 * page that read the plan before another tab gave it one. Put over the plan, it would take it away.
 */
const KEPT_ONCE_SET = ['location', 'dismissed', 'bought', 'household', 'switches'] as const;
/** A record's or journal's database version (src/db.ts DB_VERSION); none, or anything odd: 1, from before it was kept. */
const versionOf = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : 1);
/**
 * Whether a journal's plan (`raw`, from a page at database version `version`), put over the plan as stored, would lose
 * something: it's from an older version than the one that wrote the plan, or it lacks a part the plan has
 * (KEPT_ONCE_SET).
 */
function journalWouldLose(stored: Record<string, unknown>, raw: Record<string, unknown>, version: number): boolean {
  return version < versionOf(stored.dbVersion) || lacksParts(stored, raw);
}
/** Whether a copy of a plan (`raw`) lacks a part the plan as stored has (KEPT_ONCE_SET): put over it, it would take it away. */
function lacksParts(stored: Record<string, unknown>, raw: Record<string, unknown>): boolean {
  return KEPT_ONCE_SET.some((k) => stored[k] !== undefined && raw[k] === undefined);
}
/**
 * A plan's content as journals are compared with it: what it holds and which photo, where (not where it's looked at
 * from, nor the photo's bytes or fingerprint). `bg`: its photo as stored or as the journal has it.
 */
function contentKey(d: ProjectData, bg: Partial<BgImage> | StoredBg | null | undefined): string {
  let photo: unknown = null;
  if (bg) {
    const { dataUrl: _d, fingerprint: _f, ...placed } = migrateBgImage({ ...(bg as Partial<BgImage>), dataUrl: '' });
    photo = { ...placed, imageId: bg.imageId ?? null };
  }
  // (A bed's conditions cleared on purpose, {}, and a fruit warning shown again, '', read as none: as the sync
  // fingerprints have them. Otherwise a journal differing only by one was kept apart as a copy: the review, Nov 4.)
  const synced = syncedContent(d);
  const shapes = withoutClearedMarks(synced.shapes);
  return canonical({ ...synced, ...(shapes ? { shapes } : {}), photo, photoElsewhere: d.photoElsewhere ?? null });
}
/** What a journal's plan is kept as when it isn't put over its plan: "<name> (from an older tab)", a second "(2)", and so on. */
const OLDER_TAB_SUFFIX = ' (from an older tab)';
/** Pages starting together (a browser restoring its tabs) go through the journals one at a time (Web Locks). */
const JOURNAL_LOCK = 'fullgrown-journals';
/** How long a page waits for that turn before going on without it (safe: a journal kept apart twice is one plan). */
let JOURNAL_LOCK_WAIT_MS = 5000;
/** Test hook: a shorter wait for the journals' turn (none: as the app has it). */
export function _setJournalLockWaitForTests(ms = 5000) { JOURNAL_LOCK_WAIT_MS = ms; }
/**
 * Apply journals left by pages that closed before their saves finished, one page at a time where the browser can say
 * so (Web Locks), each journal read again inside. For each:
 * - the same as its plan as stored: nothing to do;
 * - written after the plan last changed: put in place, unless that would lose something (journalWouldLose: an older
 *   version's, or one without a part the plan has), when it's kept as a plan of its own beside it instead;
 * - written before the plan last changed: dropped only when the page that wrote it saved the plan after (its save
 *   holds everything the journal had); else (an older version's, another page's, or the plan renamed or synced since)
 *   kept as a plan of its own. Never dropped unseen: the review, Nov 1.
 * The names of plans kept apart are returned, to be told.
 */
async function replayJournals(k: KV): Promise<string[]> {
  if (!k.durable) return []; // can't apply them now; keep them for a session that can
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks?.request && typeof AbortController !== 'undefined') {
    // (Not waited for long: a page holding it that's stuck, or frozen, mustn't stop this one starting.)
    const waited = new AbortController();
    const timer = setTimeout(() => waited.abort(), JOURNAL_LOCK_WAIT_MS);
    let ran = false;
    try {
      return await locks.request(JOURNAL_LOCK, { signal: waited.signal }, () => { ran = true; clearTimeout(timer); return replayJournalsNow(k); });
    } catch (e) {
      clearTimeout(timer);
      if (ran) throw e;
      console.warn('journals without a lock', e);
    }
  }
  return replayJournalsNow(k);
}
/** The journals there are, newest first (by when each was written: localStorage's own order is anything). */
function journalKeysNewestFirst(): string[] {
  const at = (key: string) => { try { return num((JSON.parse(localStorage.getItem(key) || 'null') as Journal | null)?.at, 0); } catch { return 0; } };
  return journalKeys().map((key) => ({ key, at: at(key) })).sort((a, b) => b.at - a.at).map((x) => x.key);
}
async function replayJournalsNow(k: KV): Promise<string[]> {
  const keptApart: string[] = [];
  // Newest first: of two journals for one plan from pages that never saw each other's edit, the newer is put in place
  // and the older, now from before the plan's last change, kept apart. The other way round, the newer would have gone
  // over the older, its edit lost (the second review, Nov 1).
  for (const key of journalKeysNewestFirst()) {
    let j: Journal | null = null;
    try { j = JSON.parse(localStorage.getItem(key) || 'null'); } catch { j = null; }
    if (!j) continue; // (taken by another page meanwhile)
    // (Keyed by its plan and page, or, an older version's, its plan alone.)
    const keyed = j && typeof j.projectId === 'string' && (key === JOURNAL_PREFIX + j.projectId || (typeof j.page === 'string' && key === journalKey(j.projectId, j.page)));
    if (!keyed) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      continue;
    }
    const version = versionOf(j.dbVersion);
    // (From a newer version than this one, which can't read all of it: left as it is. It can't be here with a database
    // this version could open, as that version would have raised it.)
    if (version > DB_VERSION) continue;
    try {
      const meta = await k.get<ProjectMeta>('meta', j.projectId);
      // (The plan gone since: deleted on purpose. Its journal goes with it.)
      if (meta) {
        const storedNow = await k.get<StoredProject>('projects', j.projectId);
        const at = num(j.at, 0);
        const raw = (j.data && typeof j.data === 'object' ? j.data : {}) as Record<string, unknown>;
        const rawBg = (raw.bgImage ?? null) as Partial<BgImage> | null;
        const data = sanitizeProjectData({ ...raw, bgImage: null });
        if (rawBg && safeImageUrl(rawBg.dataUrl)) data.bgImage = migrateBgImage(rawBg);
        const stored = (storedNow ?? {}) as Record<string, unknown>;
        const same = !!storedNow && contentKey(data, rawBg) === contentKey(sanitizeProjectData({ ...stored, bgImage: null }), storedNow.bgImage);
        // (Its page saved the plan since, with at least the edits the journal had: by that page's own edit count.)
        const savedSinceByItsPage = typeof j.page === 'string' && storedNow?.savedByPage === j.page
          && typeof j.seq === 'number' && typeof storedNow.savedSeq === 'number' && storedNow.savedSeq >= j.seq;
        if (same || (at < meta.lastModified && savedSinceByItsPage)) {
          // Nothing it has that the plan hasn't.
        } else if (storedNow && (at < meta.lastModified || journalWouldLose(stored, raw, version))) {
          const name = await keepJournalApart(k, key, j.projectId, meta.name, at || now(), data, rawBg);
          if (name) keptApart.push(name);
        } else {
          // (Stamped as the journal's: its version and page wrote it. An older version's next journal for this plan, more
          // of the same edits, then goes in place too, not apart: the review, Nov 1.)
          const ops = projectWriteOps(j.projectId, data, undefined, { dbVersion: version, page: j.page, at, ...(typeof j.seq === 'number' ? { seq: j.seq } : {}) });
          const record = ops.find((o) => o.store === 'projects')!.value as StoredProject;
          if (rawBg && !data.bgImage) {
            // The journal has no image bytes. Point at the stored image if it exists;
            // otherwise keep whatever background the saved project already had.
            const ref = rawBg.imageId && (await k.get<ImageRecord>('images', imageKey(j.projectId, rawBg.imageId)));
            if (ref && rawBg.imageId) {
              const { dataUrl: _d, ...rest } = migrateBgImage({ ...rawBg, dataUrl: 'data:image/png;base64,' });
              record.bgImage = { ...rest, imageId: rawBg.imageId };
            } else {
              record.bgImage = storedNow?.bgImage ?? null;
            }
          }
          ops.push(put('meta', j.projectId, { ...meta, lastModified: at || now(), shapeCount: data.shapes.length }));
          await k.write(ops);
        }
      }
    } catch (e) {
      console.error('could not apply unsaved edits; will retry next start', e); recordError(e, 'unsaved edits');
      continue; // keep this journal
    }
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
  return keptApart;
}
/**
 * A journal's plan (`data`), kept as a new plan beside the one it was for (`fromId`, left as it is), last modified when
 * the journal was written. A photo the journal shows without its bytes is the plan's stored one, copied with it (if
 * it's gone, the copy has none: the plan keeps its own). Its name; null if it was kept already.
 *
 * Its id comes from the journal (`key`, `at`): two pages keeping the same journal at once (no Web Locks) make one plan,
 * not two, and one kept already is left as it is. Nor is one made when a plan kept apart from the same plan already
 * holds the same (`keptFrom`): a release 3 tab left open with an unsaved edit writes its journal again each time it's
 * hidden, and each start would keep another copy of it (the second review, Nov 1).
 */
async function keepJournalApart(k: KV, key: string, fromId: string, fromName: string, at: number, data: ProjectData, rawBg: Partial<BgImage> | null): Promise<string | null> {
  const id = 'kept' + fingerprint(key, { at }).replace(/[^A-Za-z0-9]/g, '');
  if (await k.get<ProjectMeta>('meta', id)) return null;
  const metas = await k.getAll<ProjectMeta>('meta');
  const content = contentKey(data, rawBg);
  for (const m of metas.filter((x) => x.keptFrom === fromId)) {
    const rec = await k.get<StoredProject>('projects', m.id);
    if (rec && contentKey(sanitizeProjectData({ ...rec, bgImage: null }), rec.bgImage) === content) return null;
  }
  if (rawBg && !data.bgImage && rawBg.imageId) {
    const img = await k.get<ImageRecord>('images', imageKey(fromId, rawBg.imageId));
    if (img && safeImageUrl(img.dataUrl)) data.bgImage = migrateBgImage({ ...rawBg, dataUrl: img.dataUrl });
  }
  const taken = new Set(metas.filter((m) => m.id !== id).map((m) => m.name));
  const base = fromName + OLDER_TAB_SUFFIX;
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base} (${i})`;
  // (Its photo's bytes written under its own id: projectWriteOps, with no image keys known.)
  await k.write([...projectWriteOps(id, data), put('meta', id, { id, name, lastModified: at, shapeCount: data.shapes.length, keptFrom: fromId } satisfies ProjectMeta)]);
  return name;
}

// ---------- Projects ----------
export function currentProject(): ProjectMeta | null {
  return state.projects.find((p) => p.id === state.currentProjectId) || null;
}
/** Read a project's full data (including background image bytes). */
export async function readProject(id: string): Promise<ProjectData | null> {
  const stored = await db().get<StoredProject>('projects', id);
  if (!stored) return null;
  let bgImage: BgImage | null = null;
  if (stored.bgImage) {
    const img = await db().get<ImageRecord>('images', imageKey(id, stored.bgImage.imageId));
    if (img) bgImage = migrateBgImage({ ...stored.bgImage, dataUrl: img.dataUrl });
    else console.warn('background image missing for project', id);
  }
  const data = sanitizeProjectData({ ...stored, bgImage });
  // (A plan from before plans kept who's in the yard and the warning switches, come since the update (an older file,
  // a version before on another device): as this device has them, from before too. Written with its next save. The
  // plans here at the update took them then: takeFromDevice.)
  data.household ??= takenHousehold();
  data.switches ??= takenSwitches();
  // The image bytes are missing, but sync knows the photo: it can bring it back.
  if (!bgImage && stored.bgImage && !data.photoElsewhere) {
    const bg = migrateBgImage({ ...stored.bgImage, dataUrl: '' });
    if (bg.fingerprint) data.photoElsewhere = photoRefOf(bg, bg.fingerprint);
  }
  return data;
}
/**
 * Make `id` the open project. Saves the previous one first; if that save
 * fails, or the project was deleted meanwhile (by sync), stays on the
 * current project and returns false.
 */
/** Each plan's undo steps while another is open (this session only). */
const undoKept = new Map<string, { history: typeof state.history; index: number; token: number }>();
export async function switchProject(id: string): Promise<boolean> {
  let data: ProjectData | null;
  // Edits can land while we read, and sync can replace or delete the project; read again until nothing moved.
  for (;;) {
    const seq = editSeq;
    const token = changeToken(id);
    if (!(await flushSave())) return false;
    data = await readProject(id);
    if (seq === editSeq && token === changeToken(id)) break;
  }
  if (!metaFor(id)) return false;
  data ??= sanitizeProjectData({});
  cancelHistoryDebounce();
  // This plan's undo steps, kept while the app is open: back to it, they're back (Sam, Oct 30: Clear all, another
  // plan, and back, and the shapes couldn't be had again), unless it has changed since (sync): then they'd undo that.
  // Only the steps to undo are kept, not the ones undone: back on the plan, no Redo for a change made before leaving
  // it (the UI review, 2026-11-01; Jason: "Agree on not showing it after a switch").
  if (state.currentProjectId) undoKept.set(state.currentProjectId, { history: state.history.slice(0, state.historyIndex + 1), index: state.historyIndex, token: changeToken(state.currentProjectId) });
  const kept = undoKept.get(id);
  undoKept.delete(id);
  const prev = state.currentProjectId;
  state.currentProjectId = id;
  state.shapes = data.shapes;
  state.zoom = data.zoom;
  state.offsetX = data.offsetX;
  state.offsetY = data.offsetY;
  state.roleViews = data.roleViews ?? {};
  state.print = data.print ?? { ...DEFAULT_PRINT };
  state.sizeMode = data.sizeMode ?? 'typical';
  state.sunWarnings = data.sunWarnings !== false;
  state.dismissed = data.dismissed;
  state.bought = data.bought;
  state.household = data.household ?? takenHousehold();
  applySwitches(data.switches, takenSwitches());
  state.phases = data.phases ?? [];
  state.viewFilter = data.viewFilter ? { ...data.viewFilter } : { status: '', phase: '', showGone: false };
  state.bgImage = data.bgImage ?? null;
  state.photoElsewhere = data.photoElsewhere ?? null;
  state.location = data.location;
  state.selectedIds = [];
  // (Unchanged since: no save, sync or rename has touched it, by its change count.)
  if (kept && kept.history[kept.index] && prev !== id && kept.token === changeToken(id)) { state.history = kept.history; state.historyIndex = kept.index; }
  else { state.history = []; state.historyIndex = -1; }
  state.bgEditMode = false;
  state.bgCalibrate = null;
  state.draw = null;
  state.placing = null;
  state.featurePlace = null;
  state.pickerForTree = false;
  state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; state.linkOffer = null; state.statusAsk = null; // (another plan's shapes)
  state.editPoints = null;
  storedImageKeys = new Set(data.bgImage?.imageId ? [imageKey(id, data.bgImage.imageId)] : []);
  committedImageKeys = new Set(storedImageKeys);
  savedSeq = editSeq;
  savedPlanSeq = planSeq;
  try { await db().write([put('kv', 'current', id)]); } catch (e) { console.warn('could not remember open project', e); }
  void collectImageGarbage(id, storedImageKeys);
  onHousehold?.();
  return true;
}
let onHousehold: (() => void) | null = null;
/** Called when the open plan's household is put in place from storage (another plan opened, or sync's copy): the picker's filters follow it. */
export function setHouseholdListener(fn: () => void) { onHousehold = fn; }
/** Delete stored images of a project that its saved state no longer uses. */
async function collectImageGarbage(projectId: string, keep: Set<string>) {
  try {
    const keys = (await db().keys('images', projectId + '/')).filter((k) => !keep.has(k));
    const stale: string[] = [];
    for (const k of keys) {
      const rec = await db().get<ImageRecord>('images', k);
      // Leave recent records alone: another open tab may be using one it just saved.
      if (!rec || now() - (rec.createdAt ?? 0) > IMAGE_GC_AGE_MS) stale.push(k);
    }
    if (stale.length) await db().write(stale.map((k) => del('images', k)));
  } catch (e) { console.warn('image cleanup failed', e); }
}
/**
 * A new plan's data: empty, at the size mode last chosen, with no one in the yard and "Anyone you need to protect?"
 * still to ask (Jason, Nov 1: a new plan may be another yard; New project's "Same garden?" copies the open plan's),
 * and every warning on (Jason, Nov 1; "Same garden?" copies those too).
 */
export function emptyProjectData(): ProjectData {
  return { ...sanitizeProjectData({}), sizeMode: lastSizeMode, household: { kids: false, dogs: '', cats: false, horses: false, answered: false, at: now() }, switches: switchesAllOn() };
}
/**
 * Create a project (empty, or from given data). Does not open it. `id`: one the server already knows (sync).
 * `lastModified`: when the plan itself last changed, for one brought back from a file (src/backup.ts); now otherwise.
 */
export async function createProject(name: string, data?: ProjectData, id = uid(), lastModified = now()): Promise<string> {
  const projectData = data ?? emptyProjectData();
  const meta: ProjectMeta = { id, name: name.trim() || 'Untitled', lastModified, shapeCount: projectData.shapes.length };
  await db().write([...projectWriteOps(id, projectData), put('meta', id, meta)]);
  state.projects.unshift(meta);
  afterProjectsChange?.();
  return id;
}
/**
 * Delete a project from this device. One that was synced is remembered (a
 * tombstone) so the next sync moves it to the server's trash too, unless
 * `bySync`: it was deleted elsewhere, and the server already knows. With a
 * `token` (sync), only if the project hasn't changed since and isn't open;
 * returns whether it was deleted.
 */
export async function deleteProject(id: string, bySync = false, token?: number): Promise<boolean> {
  const imageKeys = await db().keys('images', id + '/');
  if (token !== undefined && (changeToken(id) !== token || state.currentProjectId === id)) return false;
  if (!metaFor(id)) return false;
  cleared.delete(id);
  const ops = [del('meta', id), del('projects', id), ...imageKeys.map((k) => del('images', k)), del('kv', clearedKey(id))];
  // Sync state changes in memory first, then on disk in the same write, so
  // overlapping writes can't put back an older copy.
  const rec = syncRecords[id];
  if (rec) {
    const records = { ...syncRecords };
    delete records[id];
    syncRecords = records;
    if (!bySync) { syncTombstones = { ...syncTombstones, [id]: rec.revision }; syncDeleted = { ...syncDeleted, [id]: rec }; }
    ops.push(put('kv', 'syncRecords', syncRecords), put('kv', 'syncTombstones', syncTombstones), put('kv', 'syncDeleted', syncDeleted));
  }
  bumpChange(id);
  state.projects = state.projects.filter((p) => p.id !== id);
  const written = db().write(ops);
  afterProjectsChange?.();
  await written;
  return true;
}
export async function renameProject(id: string, name: string) {
  const meta = metaFor(id);
  if (!meta) return;
  meta.name = name.trim() || 'Untitled';
  meta.lastModified = now();
  bumpChange(id);
  await db().write([put('meta', id, { ...meta })]);
  afterProjectsChange?.();
}

// ---------- Sync support (see src/sync) ----------
/**
 * What a synced project was at its last sync: the server's revision, a
 * fingerprint of its content then (without the photo), and which photo it had
 * ('none', 'kept' on one device, or the photo's fingerprint; absent if unknown,
 * as for projects synced before photos did); `core`, the fingerprint without the
 * Plant list's ticks, who's in the yard and the warning switches too, and `parts`, those
 * three as the server had them (both absent from before them).
 */
export interface SyncRecord { revision: number; hash: string; photo?: string; held?: 'room' | 'refused'; core?: string; parts?: Record<string, unknown>; marks?: { conditions?: string[]; fruit?: string[] } }
let syncRecords: Record<string, SyncRecord> = {};
/** Synced projects deleted here, still to be moved to the server's trash: id → revision. */
let syncTombstones: Record<string, number> = {};
/**
 * The record each of those had as it was deleted (its revision, fingerprints, and the ticks, yard and switches the
 * server had then), so the next sync can tell another device's edit since from the parts it carried over when plans got
 * their own (src/sync/engine.ts). Kept apart from the tombstones, which an older version reads as numbers.
 */
let syncDeleted: Record<string, SyncRecord> = {};
/** The account this device's sync state belongs to. */
let syncUserId: string | null = null;
/**
 * Counts changes to each project in this session (edits, renames, sync's own
 * writes). Sync notes it when it reads a project and acts on that project
 * only if it hasn't moved since, so an edit made while a sync works is never
 * overwritten or deleted.
 */
const changeCounts = new Map<string, number>();
function bumpChange(id: string) { changeCounts.set(id, (changeCounts.get(id) ?? 0) + 1); }
function changeToken(id: string): number { return changeCounts.get(id) ?? 0; }
export { changeToken as projectChangeToken };
let afterProjectsChange: (() => void) | null = null;
let afterSave: (() => void) | null = null;
/** Sync hears about every saved edit, and every project made, renamed or deleted. */
export function setSyncHooks(onSave: () => void, onProjects: () => void) { afterSave = onSave; afterProjectsChange = onProjects; }
export function getSyncRecords(): Record<string, SyncRecord> { return { ...syncRecords }; }
export function getSyncTombstones(): Record<string, number> { return { ...syncTombstones }; }
/** The record a synced project deleted here had, if kept (src/sync/engine.ts Local.deletedRecord). */
export function getSyncDeletedRecord(id: string): SyncRecord | undefined { return syncDeleted[id]; }
/**
 * Note a project's sync state. A project deleted here while sync uploaded it
 * gets a tombstone for that revision instead, so the next sync trashes it on
 * the server too (rather than bringing it back).
 */
export async function setSyncRecord(id: string, rec: SyncRecord | null) {
  if (rec && !metaFor(id)) {
    const next = { ...syncRecords };
    delete next[id];
    syncRecords = next;
    syncTombstones = { ...syncTombstones, [id]: rec.revision };
    syncDeleted = { ...syncDeleted, [id]: rec };
    await db().write([put('kv', 'syncRecords', syncRecords), put('kv', 'syncTombstones', syncTombstones), put('kv', 'syncDeleted', syncDeleted)]);
    return;
  }
  const next = { ...syncRecords };
  if (rec) next[id] = rec; else delete next[id];
  syncRecords = next;
  await db().write([put('kv', 'syncRecords', next)]);
}
export async function clearSyncTombstone(id: string) {
  const next = { ...syncTombstones }, deleted = { ...syncDeleted };
  delete next[id];
  delete deleted[id];
  syncTombstones = next;
  syncDeleted = deleted;
  await db().write([put('kv', 'syncTombstones', next), put('kv', 'syncDeleted', deleted)]);
}
/** The account this device last synced with (null: none). */
export function getSyncUser(): string | null { return syncUserId; }
/** Forget all sync state and note whose it is now (a different account signed in on this device). Edit times stay. */
export async function resetSyncState(userId: string | null) {
  syncRecords = {}; syncTombstones = {}; syncDeleted = {}; syncUserId = userId;
  plantSync = { records: {}, edited: plantSync.edited };
  await db().write([put('kv', 'syncRecords', {}), put('kv', 'syncTombstones', {}), put('kv', 'syncDeleted', {}), put('kv', 'syncUser', userId), put('kv', 'myPlantSync', plantSync)]);
}
/** This app install's random id, made on first use and kept with the plans (trials count once per install). */
export async function installId(): Promise<string> {
  let id = await db().get<string>('kv', 'installId');
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
    id = (globalThis.crypto?.randomUUID?.() ?? uid() + uid() + uid()).replace(/[^A-Za-z0-9-]/g, '');
    await db().write([put('kv', 'installId', id)]);
  }
  return id;
}
/** The parts of a project that sync: everything but the view (zoom, scroll) and the background photo (synced on its own). */
export type SyncedContent = Pick<ProjectData, 'shapes' | 'roleViews' | 'print' | 'sizeMode' | 'sunWarnings' | 'phases' | 'location' | 'dismissed' | 'bought' | 'household' | 'switches'>;
export function syncedContent(d: ProjectData): SyncedContent {
  const out: SyncedContent = { shapes: d.shapes, roleViews: d.roleViews ?? {}, print: d.print ?? { ...DEFAULT_PRINT }, sizeMode: d.sizeMode ?? 'typical', sunWarnings: d.sunWarnings !== false, phases: d.phases ?? [] };
  // (Only once set or cleared: plans that never had one read exactly as before this existed, so nothing looks changed.)
  if (d.location !== undefined) out.location = d.location;
  // (Likewise warnings dismissed for a plant: once it's had any, even if all are shown again since, so that syncs too.)
  if (d.dismissed) out.dismissed = d.dismissed;
  // (And the Plant list's ticks, who's in the yard and the warning switches: each part settles on its own when two
  // devices change it, src/sync/engine.ts settleParts.)
  if (d.bought) out.bought = d.bought;
  if (d.household) out.household = d.household;
  if (d.switches) out.switches = d.switches;
  return out;
}
/**
 * Put a project's synced content in place (from the server), keeping this
 * device's view and background photo. Only if the project hasn't changed
 * since sync read it (`token`, from projectChangeToken), and, if it's the open
 * one, `mayReplaceOpen()` agrees (nothing in progress on screen); else false,
 * and the next sync sorts it out. The plan on screen is updated.
 */
export async function replaceProjectContent(
  id: string, name: string, content: unknown, token: number, mayReplaceOpen: () => boolean = () => true, photo?: IncomingPhoto,
): Promise<boolean> {
  if (!metaFor(id) || changeToken(id) !== token) return false;
  let saved: ProjectData | null = null;
  if (state.currentProjectId !== id) saved = await readProject(id);
  // Which photo is here now (to tell whether the incoming one is the same).
  const peek = state.currentProjectId === id ? state.bgImage : saved?.bgImage ?? null;
  const peekFp = peek ? await photoFingerprint(peek.dataUrl) : null;
  // From here to the write, nothing waits: no edit can slip in between the check and the write.
  const meta = metaFor(id);
  if (!meta || changeToken(id) !== token) return false;
  const isOpen = state.currentProjectId === id;
  if (isOpen && (hasUnsavedChanges() || !mayReplaceOpen())) return false;
  const base = isOpen ? currentProjectData() : saved ?? sanitizeProjectData({});
  if ((base.bgImage?.dataUrl ?? null) !== (peek?.dataUrl ?? null)) return false; // the photo changed meanwhile
  const incoming = sanitizeProjectData({ ...(content && typeof content === 'object' ? content : {}), zoom: base.zoom, offsetX: base.offsetX, offsetY: base.offsetY });
  const placed = photo ? placePhoto(base, peekFp, photo.ref, photo.bytes) : { bgImage: base.bgImage ?? null, photoElsewhere: base.photoElsewhere ?? null };
  const data: ProjectData = { ...base, ...syncedContent(incoming), ...placed };
  // A plan from a version before locations synced says nothing about one: the location here stays.
  if (!(content && typeof content === 'object' && 'location' in content)) data.location = base.location;
  // (Nor, before dismissals synced, or from a plan that never had any, about those: the ones here stay.)
  if (!(content && typeof content === 'object' && 'dismissed' in content)) data.dismissed = base.dismissed;
  // (Nor, from a version before them, about the Plant list's ticks, who's in the yard or the warning switches.)
  if (!(content && typeof content === 'object' && 'bought' in content)) data.bought = base.bought;
  if (!data.household) data.household = base.household;
  if (!data.switches) data.switches = base.switches;
  // (When only the ticks, the yard or the warning switches came, the plan keeps when it was last modified: what another
  // device carried over when plans got their own mustn't make every plan here "modified just now", and re-sort the list,
  // the day the first device updates. The review of the storage change, Nov 1.)
  const newName = name.trim() || 'Untitled';
  const onlyParts = newName === meta.name && coreHash('', syncedContent(base) as unknown as Record<string, unknown>) === coreHash('', syncedContent(data) as unknown as Record<string, unknown>)
    && samePhoto(base, data);
  const metaNext = { ...meta, name: newName, lastModified: onlyParts ? meta.lastModified : now(), shapeCount: data.shapes.length };
  bumpChange(id);
  // The write is queued before any later save's (and any read by a switch to this project), so they see it.
  const ops = [...projectWriteOps(id, data, isOpen ? storedImageKeys : undefined), put('meta', id, metaNext)];
  const written = db().write(ops);
  Object.assign(meta, metaNext);
  if (isOpen) {
    state.shapes = data.shapes;
    state.roleViews = data.roleViews ?? {};
    state.print = data.print ?? { ...DEFAULT_PRINT };
    state.sizeMode = data.sizeMode ?? 'typical';
    state.sunWarnings = data.sunWarnings !== false;
    state.dismissed = data.dismissed;
    state.bought = data.bought;
    state.household = data.household ?? state.household;
    if (data.switches) applySwitches(data.switches, takenSwitches());
    state.phases = data.phases ?? [];
    state.location = data.location;
    if (state.bgImage !== data.bgImage) { state.bgImage = data.bgImage ?? null; if (!state.bgImage) state.bgEditMode = false; }
    state.photoElsewhere = data.photoElsewhere ?? null;
    state.selectedIds = state.selectedIds.filter((sid) => data.shapes.some((s) => s.id === sid));
    state.history = [];
    state.historyIndex = -1;
    onHousehold?.();
  }
  try {
    await written;
  } catch (e) {
    // The plan on screen already shows the server's version (so later edits land on top of it);
    // keep it as unsaved so the next save writes it (image bytes included).
    if (isOpen) { for (const op of ops) if (op.store === 'images') storedImageKeys.delete(op.key); save(); }
    throw e;
  }
  return true;
}
/** Whether two versions of a plan show the same photo, placed the same (its bytes and placement; not storage details). */
function samePhoto(a: ProjectData, b: ProjectData): boolean {
  const placed = (bg: BgImage | null | undefined) => {
    if (!bg) return 'none';
    const { dataUrl: _d, imageId: _i, fingerprint: _f, ...placement } = bg;
    return canonical(placement);
  };
  return (a.bgImage?.dataUrl ?? '') === (b.bgImage?.dataUrl ?? '') && placed(a.bgImage) === placed(b.bgImage)
    && canonical(a.photoElsewhere ?? null) === canonical(b.photoElsewhere ?? null);
}
/**
 * Note a background photo's fingerprint with its project (not an edit), so a
 * photo whose stored bytes go missing can be fetched again. The open project
 * keeps it in memory until its next save.
 */
export async function notePhotoFingerprint(id: string, dataUrl: string, fingerprint: string) {
  if (state.currentProjectId === id) {
    if (state.bgImage?.dataUrl === dataUrl) state.bgImage.fingerprint = fingerprint;
    return;
  }
  const token = changeToken(id);
  const stored = await db().get<StoredProject>('projects', id);
  if (!stored?.bgImage || stored.bgImage.fingerprint) return;
  const img = await db().get<ImageRecord>('images', imageKey(id, stored.bgImage.imageId));
  // Only if nothing has touched the project meanwhile (the write is queued before any later save).
  if (img?.dataUrl !== dataUrl || changeToken(id) !== token || state.currentProjectId === id) return;
  await db().write([put('projects', id, { ...stored, bgImage: { ...stored.bgImage, fingerprint } })]);
}
/** A synced photo arriving with a project: how it sits, and its bytes if they were fetched. */
export interface IncomingPhoto { ref: PhotoRef | null; bytes?: string }
/**
 * Where a project's photo stands once a synced one arrives. `baseFp`: the
 * fingerprint of the photo here (if any). The same photo here keeps its bytes
 * and takes the new placement; a different one needs the fetched `bytes`, or
 * waits (photoElsewhere) for a later sync to bring them.
 */
export function placePhoto(base: ProjectData, baseFp: string | null, ref: PhotoRef | null, bytes?: string): { bgImage: BgImage | null; photoElsewhere: PhotoRef | null } {
  if (!ref) return { bgImage: null, photoElsewhere: null };
  // Kept on another device only: this device lets go of its copy (unless it's this device's own kept photo).
  if ('deviceOnly' in ref) return base.bgImage?.deviceOnly ? { bgImage: base.bgImage, photoElsewhere: null } : { bgImage: null, photoElsewhere: ref };
  const { fingerprint, ...placed } = ref;
  if (base.bgImage && baseFp === fingerprint) {
    const { deviceOnly: _o, ...bg } = base.bgImage;
    return { bgImage: { ...bg, ...placed, fingerprint }, photoElsewhere: null };
  }
  if (bytes) return { bgImage: migrateBgImage({ ...placed, dataUrl: bytes, imageId: uid(), fingerprint }), photoElsewhere: null };
  return { bgImage: null, photoElsewhere: ref };
}
/**
 * Put a downloaded photo in place of the one a project is waiting for
 * (photoElsewhere), if the project hasn't changed since `token`.
 */
export async function fillProjectPhoto(id: string, token: number, fingerprint: string, bytes: string, mayReplaceOpen: () => boolean = () => true): Promise<boolean> {
  if (!metaFor(id) || changeToken(id) !== token) return false;
  let saved: ProjectData | null = null;
  if (state.currentProjectId !== id) saved = await readProject(id);
  const meta = metaFor(id);
  if (!meta || changeToken(id) !== token) return false;
  const isOpen = state.currentProjectId === id;
  if (isOpen && (hasUnsavedChanges() || !mayReplaceOpen())) return false;
  const base = isOpen ? currentProjectData() : saved;
  const ref = base?.photoElsewhere;
  if (!base || base.bgImage || !ref || !('fingerprint' in ref) || ref.fingerprint !== fingerprint) return false;
  const placed = placePhoto(base, null, ref, bytes);
  const data: ProjectData = { ...base, ...placed };
  bumpChange(id);
  const ops = projectWriteOps(id, data, isOpen ? storedImageKeys : undefined);
  const written = db().write(ops);
  if (isOpen) {
    state.bgImage = data.bgImage ?? null;
    state.photoElsewhere = null;
    // Undo steps taken while the photo was on its way show it too (else undoing would remove it everywhere).
    for (const snap of state.history) {
      if (!snap.bgImage && snap.photoElsewhere && 'fingerprint' in snap.photoElsewhere && snap.photoElsewhere.fingerprint === fingerprint) {
        snap.bgImage = data.bgImage ? { ...data.bgImage } : null;
        snap.photoElsewhere = null;
      }
    }
  }
  try {
    await written;
  } catch (e) {
    if (isOpen) { for (const op of ops) if (op.store === 'images') storedImageKeys.delete(op.key); save(); }
    throw e;
  }
  return true;
}
/** Read a project as it is now (the open one from memory, saved first). */
export async function projectNow(id: string): Promise<ProjectData | null> {
  if (state.currentProjectId === id) {
    // (A newer version has the plans: this page's copy of the open one isn't the plan any more, so sync never sends it.)
    if (!(await flushSave()) && superseded) throw new NewerVersionError();
    return currentProjectData();
  }
  return readProject(id);
}

// ---------- Clipboard (shared across projects and tabs) ----------
export function getClipboard(): Clipboard | null { return clipboardCache; }
export function setClipboard(data: Clipboard) {
  clipboardCache = data;
  if (kv) kv.write([put('kv', 'clipboard', data)]).catch((e) => console.warn('clipboard save failed', e));
}
/** Pick up a clipboard written by another tab. */
export async function refreshClipboard() {
  // (Not once a newer version has the database: this page is about to reload, and can't read it.)
  if (kv && !superseded) clipboardCache = (await kv.get<Clipboard>('kv', 'clipboard')) ?? clipboardCache;
}

// ---------- My plants (the user's own plant library, shared by all projects) ----------
let myPlantsRaw: unknown[] = [];
/** The stored library, unvalidated (my-plants.ts validates it). */
export function storedMyPlants(): unknown[] { return myPlantsRaw; }
/**
 * The library's sync state: per plant, the server revision and fingerprint
 * at its last sync, and when it was last edited (or deleted) here, in ms.
 */
export interface PlantSyncState { records: Record<string, SyncRecord>; edited: Record<string, number> }
let plantSync: PlantSyncState = { records: {}, edited: {} };
export function getPlantSync(): PlantSyncState { return { records: { ...plantSync.records }, edited: { ...plantSync.edited } }; }
/** Replace the stored library (and its sync state) in one write. Throws if the write fails, so the caller can say so. */
export async function writeMyPlants(list: unknown[], sync?: PlantSyncState) {
  const ops = [put('kv', 'myPlants', list)];
  if (sync) ops.push(put('kv', 'myPlantSync', sync));
  await db().write(ops);
  myPlantsRaw = list;
  if (sync) plantSync = { records: { ...sync.records }, edited: { ...sync.edited } };
}
function sanitizePlantSync(raw: unknown): PlantSyncState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const edited: Record<string, number> = {};
  if (o.edited && typeof o.edited === 'object') {
    for (const [k, v] of Object.entries(o.edited as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v) && v >= 0) edited[k] = v;
  }
  return { records: sanitizeSyncRecords(o.records), edited };
}

// ---------- Size mode for new projects ----------
let lastSizeMode: SizeMode = 'typical';
export function rememberSizeMode(mode: SizeMode) {
  lastSizeMode = mode;
  kv?.write([put('kv', 'lastSizeMode', mode)]).catch((e) => console.warn('could not remember size mode', e));
}

// ---------- Backup bookkeeping ----------
let lastBackupAt: number | null = null;
export function getLastBackupAt(): number | null { return lastBackupAt; }
export async function setLastBackupAt(t: number) {
  lastBackupAt = t;
  await kv?.write([put('kv', 'lastBackupAt', t)]);
}

let persisted = false;
/** Whether the browser has agreed not to clear our data under storage pressure. */
export function isPersisted(): boolean { return persisted; }
/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch { persisted = false; }
  return persisted;
}
export async function storageStatus(): Promise<{ durable: boolean; persisted: boolean; usage?: number; quota?: number }> {
  let persisted = false, usage: number | undefined, quota: number | undefined;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
    const est = await navigator.storage?.estimate?.();
    usage = est?.usage; quota = est?.quota;
  } catch { /* not supported */ }
  return { durable: storageIsDurable(), persisted, usage, quota };
}

// ---------- One-time migration from localStorage (app versions before IndexedDB) ----------
function readLocal(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
/**
 * Copy projects saved by earlier versions (localStorage) into IndexedDB.
 * localStorage is left untouched as a fallback copy.
 *
 * Runs on every start, not just once: if an older version of the app runs
 * again after migration (a stale cached copy, another tab), its newer edits
 * are picked up. A project is copied when it's missing from IndexedDB or the
 * localStorage copy was modified later.
 */
async function migrateFromLocalStorage(k: KV) {
  const migratedAt = await k.get<number>('kv', 'migratedFromLocalStorage');
  const ops: WriteOp[] = [];
  const copied: string[] = [];
  let newest = 0;
  const consider = async (meta: { id?: unknown; name?: unknown; lastModified?: unknown }, readData: () => unknown) => {
    let id = str(meta.id) || uid();
    let name = str(meta.name, 'Untitled');
    const localModified = num(meta.lastModified, 0);
    if (migratedAt !== undefined) {
      if (localModified <= migratedAt) return; // nothing new since the last check
      const existing = await k.get<ProjectMeta>('meta', id);
      if (existing && existing.lastModified >= localModified) return; // newer in IndexedDB
      const stored = existing ? await k.get<Record<string, unknown>>('projects', id) : undefined;
      const local = readData();
      // Changed in both versions since the last sync: keep both. Likewise when the plan here has a part the older
      // copy can't have (its ticks, yard, switches...: given it since without an edit, by the update or by sync): the
      // copy put over it would take it away (the review, Nov 1).
      if (existing && (existing.lastModified > migratedAt || (stored && lacksParts(stored, (local && typeof local === 'object' ? local : {}) as Record<string, unknown>)))) {
        id = uid();
        name = `${name} (from older version)`;
      }
      readData = () => local;
    }
    const data = sanitizeProjectData(readData());
    newest = Math.max(newest, localModified);
    const m: ProjectMeta = { id, name, lastModified: localModified || now(), shapeCount: data.shapes.length };
    ops.push(...projectWriteOps(id, data), put('meta', id, m));
    copied.push(id);
  };
  const list = readLocal(STORAGE.PROJECTS);
  if (Array.isArray(list)) {
    for (const m of list) {
      if (m && typeof m === 'object') await consider(m, () => readLocal(STORAGE.project(str((m as ProjectMeta).id))));
    }
  }
  // The single-project format from before multiple projects existed.
  if (migratedAt === undefined) {
    const legacy = readLocal(STORAGE.LEGACY);
    if (legacy) await consider({ name: 'My Garden' }, () => legacy);
    const current = (() => { try { return localStorage.getItem(STORAGE.CURRENT); } catch { return null; } })();
    if (current && copied.includes(current)) ops.push(put('kv', 'current', current));
    else if (legacy && copied.length) ops.push(put('kv', 'current', copied[copied.length - 1]));
    const clip = readLocal(STORAGE.CLIPBOARD);
    if (clip) ops.push(put('kv', 'clipboard', clip));
  }
  if (migratedAt !== undefined && !copied.length) return;
  // max(): a clock skewed into the future mustn't make every start re-copy.
  ops.push(put('kv', 'migratedFromLocalStorage', Math.max(now(), newest)));
  await k.write(ops);
}

/** Thrown when IndexedDB that previously held this user's projects can't be opened. */
export class StorageUnavailableError extends Error {}
const IDB_MARKER = 'lp-idb-in-use';

/**
 * Open storage, migrate old data, and load the last-open project into
 * `state`. Returns a message if old data couldn't be migrated, and the names of plans made from an older tab's
 * unsaved changes (replayJournals). Throws NewerVersionError, having read and written nothing, when a newer version
 * of the app has the database (src/db.ts).
 */
export async function initStorage(kvOverride?: KV): Promise<{ migrationError?: string; keptApart?: string[] }> {
  kv = kvOverride ?? (await openKV());
  state.currentProjectId = null; // nothing is open yet; nothing to save
  // A newer version of the app opening the database in another tab or window (src/db.ts): edits not saved yet are
  // kept first, a journal (as when the page hides) and their write, started now, so it goes in before the newer
  // version's upgrade. (This version's copy, into this version's database: the newer one reads it as it reads any
  // plan from before.) Then nothing more is saved here.
  let lastWrite: Promise<boolean> = Promise.resolve(true);
  kv.onNewerVersion?.(() => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const id = state.currentProjectId;
    if (!id || !hasUnsavedChanges()) return;
    writeJournalIfDirty();
    // (Only image bytes known to be on disk are left out: a write still under way may yet fail.) Once it's in, the
    // journal goes, even if an edit came after it (a drag let go under the message): that edit can't be saved now, and
    // a newer version finding the journal would keep a near-copy of the plan apart (the review, Nov 1).
    lastWrite = writeCurrentKnowing(new Set(committedImageKeys)).then((ok) => { if (ok) clearJournal(id); return ok; });
  }, () => {
    superseded = true;
    onNewer?.(lastWrite);
  });
  if (!kv.durable) {
    let usedBefore = false;
    try { usedBefore = !!localStorage.getItem(IDB_MARKER); } catch { /* ignore */ }
    // The projects live in IndexedDB but it won't open right now. Don't show
    // stale data as if it were current.
    if (usedBefore) throw new StorageUnavailableError('Storage could not be opened');
  } else {
    try { localStorage.setItem(IDB_MARKER, '1'); } catch { /* ignore */ }
  }
  let migrationError: string | undefined;
  try {
    await migrateFromLocalStorage(kv);
  } catch (e) {
    console.error('migration from localStorage failed', e); recordError(e, 'migration');
    migrationError = e instanceof Error ? e.message : String(e);
  }
  let keptApart: string[] = [];
  try {
    keptApart = await replayJournals(kv);
  } catch (e) {
    console.error('replaying unsaved edits failed', e); recordError(e, 'unsaved edits');
  }
  try {
    await takeFromDevice(kv);
  } catch (e) {
    // (Not taken now: tried again next time. Meanwhile each plan takes them as it's read: readProject.)
    console.error('plans could not take the yard and warnings', e); recordError(e, 'yard and warnings');
  }
  state.projects = (await kv.getAll<ProjectMeta>('meta')).sort((a, b) => b.lastModified - a.lastModified);
  clipboardCache = (await kv.get<Clipboard>('kv', 'clipboard')) ?? null;
  lastBackupAt = (await kv.get<number>('kv', 'lastBackupAt')) ?? null;
  const mp = await kv.get<unknown>('kv', 'myPlants');
  myPlantsRaw = Array.isArray(mp) ? mp : [];
  plantSync = sanitizePlantSync(await kv.get<unknown>('kv', 'myPlantSync'));
  lastSizeMode = (await kv.get<unknown>('kv', 'lastSizeMode')) === 'full' ? 'full' : 'typical';
  const recs = await kv.get<unknown>('kv', 'syncRecords');
  syncRecords = sanitizeSyncRecords(recs);
  const tombs = await kv.get<unknown>('kv', 'syncTombstones');
  syncTombstones = {};
  if (tombs && typeof tombs === 'object') for (const [k, v] of Object.entries(tombs)) if (typeof v === 'number' && Number.isFinite(v)) syncTombstones[k] = v;
  // (Only for a tombstone still there, of the same deletion: one an older version cleared since is gone, and one it
  // made again for the plan, later, isn't the record's.)
  const deleted = sanitizeSyncRecords(await kv.get<unknown>('kv', 'syncDeleted'));
  syncDeleted = Object.fromEntries(Object.entries(deleted).filter(([k, r]) => syncTombstones[k] === r.revision));
  const su = await kv.get<unknown>('kv', 'syncUser');
  syncUserId = typeof su === 'string' ? su : null;
  if (state.projects.length === 0) await createProject('My Garden');
  let currentId = await kv.get<string>('kv', 'current');
  if (!currentId || !metaFor(currentId)) currentId = state.projects[0].id;
  await switchProject(currentId);
  return { migrationError, ...(keptApart.length ? { keptApart } : {}) };
}

/**
 * Once, on the first start of the version that keeps who's in the yard and the warning switches with each plan (Nov 1):
 * every plan on this device takes this device's, as they are now (src/yard.ts householdFromDevice, src/view-settings.ts
 * switchesFromDevice), added to what's stored and nothing else changed, not even when it last changed. At once rather
 * than as each plan is next opened, so a plan opened months later still takes them as they were at the update.
 *
 * What was taken is kept too (`fromDevice`): a plan that comes later without them (an older file, an older version on
 * another device or this one) takes the same, every time it's read. Read live, they'd move: the × on "Anyone you need to
 * protect?" turns 'answered' into 'dismissed', and the guided introduction run again changes 'lp-intro', so the same
 * plan would read differently and go up again, changed, to the other devices.
 *
 * One transaction: every plan or none (tried again next time), and nothing another tab saves meanwhile is put back.
 */
async function takeFromDevice(k: KV) {
  const taking: TakenFromDevice = { at: now(), household: householdFromDevice(), switches: switchesFromDevice() };
  const was = await k.changeAllOnce(TOOK_FROM_DEVICE, taking, 'projects', (v) => {
    if (!v || typeof v !== 'object') return undefined;
    const stored = v as Record<string, unknown>;
    const needs = { household: !sanitizeHousehold(stored.household), switches: !sanitizeSwitches(stored.switches) };
    if (!needs.household && !needs.switches) return undefined;
    return { ...stored, ...(needs.household ? { household: { ...taking.household } } : {}), ...(needs.switches ? { switches: deepCopy(taking.switches) } : {}) };
  });
  if (was === undefined) { fromDevice = taking; return; }
  // (Taken at an earlier start: as it was then. A test build of this branch kept only the time: what it would take now,
  // kept from here on.)
  fromDevice = sanitizeTaken(was);
  if (!fromDevice) { fromDevice = taking; await k.write([put('kv', TOOK_FROM_DEVICE, taking)]); }
}
const TOOK_FROM_DEVICE = 'tookFromDevice';
interface TakenFromDevice { at: number; household: PlanHousehold; switches: PlanSwitches }
/** What the plans here took from this device at the update (takeFromDevice); null until then, or if it couldn't be done. */
let fromDevice: TakenFromDevice | null = null;
function sanitizeTaken(raw: unknown): TakenFromDevice | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const household = sanitizeHousehold(o.household), switches = sanitizeSwitches(o.switches);
  return household && switches ? { at: num(o.at, 0), household, switches } : null;
}
/** Who's in the yard for a plan that comes without (from before plans kept it): as the plans here took it at the update. */
function takenHousehold(): PlanHousehold { return { ...(fromDevice?.household ?? householdFromDevice()) }; }
/** Likewise the warning switches (any the update didn't know: as this device had them). */
function takenSwitches(): PlanSwitches { return { ...switchesFromDevice(), ...deepCopy(fromDevice?.switches ?? {}) }; }
const deepCopy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A sync record's parts (the ticks, the yard, the switches), as a plan's are checked; null if none. */
function sanitizeRecordParts(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>, out: Record<string, unknown> = {};
  const bought = sanitizeBought(o.bought), household = sanitizeHousehold(o.household), switches = sanitizeSwitches(o.switches);
  if (bought) out.bought = bought;
  if (household) out.household = household;
  if (switches) out.switches = switches;
  return Object.keys(out).length ? out : null;
}
function sanitizeSyncRecords(raw: unknown): Record<string, SyncRecord> {
  const out: Record<string, SyncRecord> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const r = v as Partial<SyncRecord> | null;
      if (r && typeof r.revision === 'number' && Number.isFinite(r.revision) && typeof r.hash === 'string') {
        out[k] = { revision: r.revision, hash: r.hash };
        // (The plan's fingerprint without the parts that settle on their own, src/sync/engine.ts coreHash; records from
        // before have none.)
        if (typeof r.core === 'string' && /^[0-9a-z]+:[0-9a-z]+$/.test(r.core)) out[k].core = r.core;
        // (The ticks, yard and switches as the server had them then, src/sync/engine.ts SyncRecord.parts.)
        const parts = sanitizeRecordParts(r.parts);
        if (parts) out[k].parts = parts;
        if (typeof r.photo === 'string' && /^(none|kept|[0-9a-f]{64}@[0-9a-z]+:[0-9a-z]+)$/.test(r.photo)) out[k].photo = r.photo;
        if (r.held === 'room' || r.held === 'refused') out[k].held = r.held;
        // (Where a mark of something taken away may go, src/marks.ts: shape ids, plain words, as many as a plan has.)
        const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[\w:.-]{1,120}$/.test(x)).slice(0, 20000) : []);
        const marks = r.marks && typeof r.marks === 'object' ? { conditions: ids(r.marks.conditions), fruit: ids(r.marks.fruit) } : null;
        if (marks && (marks.conditions.length || marks.fruit.length)) {
          out[k].marks = { ...(marks.conditions.length ? { conditions: marks.conditions } : {}), ...(marks.fruit.length ? { fruit: marks.fruit } : {}) };
        }
        else if ((r.held as unknown) === true) out[k].held = 'room'; // (an early test build stored true)
      }
    }
  }
  return out;
}
/** Test hook: the sync records as they'd be kept (in memory only). */
export function _setSyncRecordsForTests(records: Record<string, SyncRecord>) { syncRecords = { ...records }; }
/** Test hook: forget module state between tests. */
export function _resetStorageForTests() {
  kv = null; clipboardCache = null; storedImageKeys = new Set(); committedImageKeys = new Set(); cleared.clear();
  quotaWarned = false; lastBackupAt = null; myPlantsRaw = []; lastSizeMode = 'typical'; editSeq = 0; savedSeq = 0; planSeq = 0; savedPlanSeq = 0; saveFailing = false;
  lastFailureJournalAt = 0; PAGE = newPageId(); syncRecords = {}; syncTombstones = {}; syncDeleted = {}; syncUserId = null; changeCounts.clear(); plantSync = { records: {}, edited: {} };
  fromDevice = null; superseded = false;
  saveChain = Promise.resolve(true);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}
