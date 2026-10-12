import { MAX_POINTS, MIN_POINTS, STORAGE } from './constants';
import { del, openKV, put, type KV, type WriteOp } from './db';
import { cancelHistoryDebounce } from './history';
import { state } from './state';
import { isRole } from './roles';
import type { BgImage, Clipboard, PathShape, ProjectData, ProjectMeta, RoleViews, Shape, SunInfo } from './types';
import { setWorldPoints } from './geometry';
import { now, uid } from './util';

// Persistence. Projects live in IndexedDB:
//   meta/<projectId>          ProjectMeta (name, dates, shape count)
//   projects/<projectId>      ProjectData without the background image bytes
//   images/<projectId>/<id>   { dataUrl } for the background image
//   kv/current, kv/clipboard, kv/lastBackupAt, kv/migratedFromLocalStorage
// The current project is held in `state`; saves are debounced and also
// flushed when the page is hidden so a quick app switch can't lose an edit.

interface StoredBg extends Omit<BgImage, 'dataUrl'> { imageId: string }
interface StoredProject extends Omit<ProjectData, 'bgImage'> { bgImage: StoredBg | null }
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
/** True after a save failed and nothing has saved successfully since. */
let saveFailing = false;
let onSaveStatus: (() => void) | null = null;
let lastFailureJournalAt = 0;
/** Projects whose journal couldn't be replayed this session; don't clear those. */
const unreplayed = new Set<string>();
/** Called whenever saving starts or stops failing (to show/hide a warning). */
export function setSaveStatusListener(fn: () => void) { onSaveStatus = fn; }
export function saveIsFailing(): boolean { return saveFailing; }
function setSaveFailing(v: boolean) {
  if (saveFailing === v) return;
  saveFailing = v;
  onSaveStatus?.();
}
/** Edit counter vs. last edit known to be on disk; unequal means unsaved changes. */
let editSeq = 0;
let savedSeq = 0;
/**
 * Synchronous safety copy of unsaved edits, written to localStorage when the
 * page hides. IndexedDB writes are asynchronous and browsers may abandon them
 * when a page unloads; this journal is replayed on the next start.
 */
const JOURNAL_PREFIX = 'lp-journal:';
const journalKey = (projectId: string) => JOURNAL_PREFIX + projectId;
interface Journal { projectId: string; at: number; data: ProjectData }

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
    ...(sanitizeSun(s.sun) ? { sun: sanitizeSun(s.sun)! } : {}),
  };
  const size = (v: unknown, d: number) => Math.max(0.1, num(v, d));
  switch (s.type) {
    case 'circle':
      return { ...base, type: 'circle', radius: size(s.radius, 2) };
    case 'rect':
    case 'oval':
      return { ...base, type: s.type, width: size(s.width, 4), height: size(s.height, 3), rotation: num(s.rotation, 0) };
    case 'triangle': {
      const ra = s.rightAngle;
      return {
        ...base, type: 'triangle', width: size(s.width, 4), height: size(s.height, 3), rotation: num(s.rotation, 0),
        rightAngle: ra === 'br' || ra === 'tl' || ra === 'tr' ? ra : 'bl',
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
      const shape = { ...base, type: s.type, points: [], rotation: num(s.rotation, 0) } as PathShape;
      setWorldPoints(shape, pts); // re-normalize, whatever the file said
      return shape;
    }
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
  };
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
/** Normalize project data from storage, an old version, or an imported file. */
export function sanitizeProjectData(raw: unknown): ProjectData {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const shapes = Array.isArray(d.shapes) ? d.shapes.map(migrateShape).filter((s): s is Shape => !!s) : [];
  const bg = d.bgImage && typeof d.bgImage === 'object' ? migrateBgImage(d.bgImage as Partial<BgImage>) : null;
  return {
    shapes,
    zoom: Math.min(4, Math.max(0.25, num(d.zoom, 1))),
    offsetX: num(d.offsetX, -10),
    offsetY: num(d.offsetY, -10),
    roleViews: sanitizeRoleViews(d.roleViews),
    bgImage: bg && bg.dataUrl ? bg : null,
  };
}

// ---------- Writing ----------
/** Ops that store `data` for project `id`, splitting the image bytes into their own record. */
function projectWriteOps(id: string, data: ProjectData, knownImageKeys?: Set<string>): WriteOp[] {
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
  const stored: StoredProject = { shapes: data.shapes, zoom: data.zoom, offsetX: data.offsetX, offsetY: data.offsetY, roleViews: data.roleViews ?? {}, bgImage: storedBg };
  ops.push(put('projects', id, stored));
  return ops;
}
function metaFor(id: string): ProjectMeta | undefined {
  return state.projects.find((p) => p.id === id);
}

async function writeCurrent(): Promise<boolean> {
  const id = state.currentProjectId;
  if (!id || !kv) return true;
  const seq = editSeq;
  // Snapshot synchronously so later edits don't race with this write.
  const data: ProjectData = {
    shapes: state.shapes, zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY, roleViews: state.roleViews, bgImage: state.bgImage,
  };
  const ops = projectWriteOps(id, data, storedImageKeys);
  const meta = metaFor(id);
  if (meta) {
    meta.lastModified = now();
    meta.shapeCount = state.shapes.length;
    ops.push(put('meta', id, { ...meta }));
  }
  try {
    await kv.write(ops);
    for (const op of ops) if (op.store === 'images') committedImageKeys.add(op.key);
    savedSeq = Math.max(savedSeq, seq);
    if (savedSeq === editSeq && state.currentProjectId === id) clearJournal(id);
    setSaveFailing(false);
    return true;
  } catch (e) {
    // The write didn't happen; forget image keys from this batch so they're retried.
    for (const op of ops) if (op.store === 'images') storedImageKeys.delete(op.key);
    console.error('save failed', e);
    if (!quotaWarned && e instanceof DOMException && e.name === 'QuotaExceededError') {
      quotaWarned = true;
      alert('Your device is out of storage space for this app, so recent changes could not be saved. Free some space, remove a large background image, or export your projects.');
    }
    // Keep a copy of the edits in case the app is closed now (at most every few
    // seconds: with a large unsaved image this is expensive). Page hide always writes one.
    if (now() - lastFailureJournalAt > 5000) { lastFailureJournalAt = now(); writeJournalIfDirty(); }
    setSaveFailing(true);
    return false;
  }
}
/** Schedule a save of the current project. */
export function save() {
  editSeq++;
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
function clearJournal(projectId: string) {
  if (unreplayed.has(projectId)) return; // still holds edits not yet in IndexedDB
  try { localStorage.removeItem(journalKey(projectId)); } catch { /* unavailable */ }
}
/**
 * Call when the page is being hidden or unloaded: synchronously records
 * unsaved edits so they survive even if the async write is abandoned.
 */
export function writeJournalIfDirty() {
  const id = state.currentProjectId;
  if (!id || !hasUnsavedChanges() || !kv?.durable) return;
  const bg = state.bgImage;
  const imageOnDisk = !!(bg?.imageId && committedImageKeys.has(imageKey(id, bg.imageId)));
  const journal = (withImage: boolean): Journal => ({
    projectId: id, at: now(),
    data: {
      shapes: state.shapes, zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY, roleViews: state.roleViews,
      bgImage: bg ? { ...bg, dataUrl: withImage ? bg.dataUrl : '' } : null,
    },
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
/** Apply journals left by pages that closed before their saves finished. */
async function replayJournals(k: KV) {
  if (!k.durable) return; // can't apply them now; keep them for a session that can
  for (const key of journalKeys()) {
    let j: Journal | null = null;
    try { j = JSON.parse(localStorage.getItem(key) || 'null'); } catch { j = null; }
    if (!j || typeof j.projectId !== 'string' || key !== journalKey(j.projectId)) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      continue;
    }
    const meta = await k.get<ProjectMeta>('meta', j.projectId);
    // Skip if the project is gone, or was saved after this journal (e.g. by another tab).
    if (meta && num(j.at, 0) >= meta.lastModified) {
      const raw = (j.data && typeof j.data === 'object' ? j.data : {}) as Record<string, unknown>;
      const rawBg = (raw.bgImage ?? null) as Partial<BgImage> | null;
      const data = sanitizeProjectData({ ...raw, bgImage: null });
      if (rawBg && safeImageUrl(rawBg.dataUrl)) data.bgImage = migrateBgImage(rawBg);
      const ops = projectWriteOps(j.projectId, data);
      const stored = ops.find((o) => o.store === 'projects')!.value as StoredProject;
      if (rawBg && !data.bgImage) {
        // The journal has no image bytes. Point at the stored image if it exists;
        // otherwise keep whatever background the saved project already had.
        const ref = rawBg.imageId && (await k.get<ImageRecord>('images', imageKey(j.projectId, rawBg.imageId)));
        if (ref && rawBg.imageId) {
          const { dataUrl: _d, ...rest } = migrateBgImage({ ...rawBg, dataUrl: 'data:image/png;base64,' });
          stored.bgImage = { ...rest, imageId: rawBg.imageId };
        } else {
          stored.bgImage = (await k.get<StoredProject>('projects', j.projectId))?.bgImage ?? null;
        }
      }
      ops.push(put('meta', j.projectId, { ...meta, lastModified: num(j.at, now()), shapeCount: data.shapes.length }));
      try {
        await k.write(ops);
      } catch (e) {
        console.error('could not apply unsaved edits; will retry next start', e);
        unreplayed.add(j.projectId);
        continue; // keep this journal
      }
    }
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
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
  return sanitizeProjectData({ ...stored, bgImage });
}
/**
 * Make `id` the open project. Saves the previous one first; if that save
 * fails, stays on the current project and returns false.
 */
export async function switchProject(id: string): Promise<boolean> {
  let data: ProjectData | null;
  // Edits can land while we read; keep saving until a read finishes with nothing pending.
  for (;;) {
    const seq = editSeq;
    if (!(await flushSave())) return false;
    data = await readProject(id);
    if (seq === editSeq) break;
  }
  data ??= sanitizeProjectData({});
  cancelHistoryDebounce();
  state.currentProjectId = id;
  state.shapes = data.shapes;
  state.zoom = data.zoom;
  state.offsetX = data.offsetX;
  state.offsetY = data.offsetY;
  state.roleViews = data.roleViews ?? {};
  state.bgImage = data.bgImage ?? null;
  state.selectedIds = [];
  state.history = [];
  state.historyIndex = -1;
  state.bgEditMode = false;
  state.bgCalibrate = null;
  state.draw = null;
  state.editPoints = null;
  storedImageKeys = new Set(data.bgImage?.imageId ? [imageKey(id, data.bgImage.imageId)] : []);
  committedImageKeys = new Set(storedImageKeys);
  savedSeq = editSeq;
  try { await db().write([put('kv', 'current', id)]); } catch (e) { console.warn('could not remember open project', e); }
  void collectImageGarbage(id, storedImageKeys);
  return true;
}
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
/** Create a project (empty, or from given data). Does not open it. */
export async function createProject(name: string, data?: ProjectData): Promise<string> {
  const id = uid();
  const projectData = data ?? sanitizeProjectData({});
  const meta: ProjectMeta = { id, name: name.trim() || 'Untitled', lastModified: now(), shapeCount: projectData.shapes.length };
  await db().write([...projectWriteOps(id, projectData), put('meta', id, meta)]);
  state.projects.unshift(meta);
  return id;
}
export async function deleteProject(id: string) {
  const imageKeys = await db().keys('images', id + '/');
  await db().write([del('meta', id), del('projects', id), ...imageKeys.map((k) => del('images', k))]);
  state.projects = state.projects.filter((p) => p.id !== id);
}
export async function renameProject(id: string, name: string) {
  const meta = metaFor(id);
  if (!meta) return;
  meta.name = name.trim() || 'Untitled';
  meta.lastModified = now();
  await db().write([put('meta', id, { ...meta })]);
}

// ---------- Clipboard (shared across projects and tabs) ----------
export function getClipboard(): Clipboard | null { return clipboardCache; }
export function setClipboard(data: Clipboard) {
  clipboardCache = data;
  if (kv) kv.write([put('kv', 'clipboard', data)]).catch((e) => console.warn('clipboard save failed', e));
}
/** Pick up a clipboard written by another tab. */
export async function refreshClipboard() {
  if (kv) clipboardCache = (await kv.get<Clipboard>('kv', 'clipboard')) ?? clipboardCache;
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
      if (existing && existing.lastModified > migratedAt) {
        // Changed in both versions since the last sync: keep both.
        id = uid();
        name = `${name} (from older version)`;
      }
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
 * `state`. Returns a message if old data couldn't be migrated.
 */
export async function initStorage(kvOverride?: KV): Promise<{ migrationError?: string }> {
  kv = kvOverride ?? (await openKV());
  state.currentProjectId = null; // nothing is open yet; nothing to save
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
    console.error('migration from localStorage failed', e);
    migrationError = e instanceof Error ? e.message : String(e);
  }
  try {
    await replayJournals(kv);
  } catch (e) {
    console.error('replaying unsaved edits failed', e);
  }
  state.projects = (await kv.getAll<ProjectMeta>('meta')).sort((a, b) => b.lastModified - a.lastModified);
  clipboardCache = (await kv.get<Clipboard>('kv', 'clipboard')) ?? null;
  lastBackupAt = (await kv.get<number>('kv', 'lastBackupAt')) ?? null;
  if (state.projects.length === 0) await createProject('My Garden');
  let currentId = await kv.get<string>('kv', 'current');
  if (!currentId || !metaFor(currentId)) currentId = state.projects[0].id;
  await switchProject(currentId);
  return { migrationError };
}

/** Test hook: forget module state between tests. */
export function _resetStorageForTests() {
  kv = null; clipboardCache = null; storedImageKeys = new Set(); committedImageKeys = new Set();
  quotaWarned = false; lastBackupAt = null; editSeq = 0; savedSeq = 0; saveFailing = false;
  lastFailureJournalAt = 0; unreplayed.clear();
  saveChain = Promise.resolve(true);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}
