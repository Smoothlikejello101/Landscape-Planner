import { STORAGE } from './constants';
import { del, openKV, put, type KV, type WriteOp } from './db';
import { cancelHistoryDebounce } from './history';
import { state } from './state';
import type { BgImage, Clipboard, ProjectData, ProjectMeta, Shape } from './types';
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
interface ImageRecord { dataUrl: string }

const SAVE_DEBOUNCE_MS = 250;
const imageKey = (projectId: string, imageId: string) => `${projectId}/${imageId}`;

let kv: KV | null = null;
let clipboardCache: Clipboard | null = null;
/** Image keys already written for the current project (avoid rewriting image bytes on every save). */
let storedImageKeys = new Set<string>();
/** Image keys known to be committed to disk for the current project. */
let committedImageKeys = new Set<string>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveChain: Promise<void> = Promise.resolve();
let quotaWarned = false;
/** Edit counter vs. last edit known to be on disk; unequal means unsaved changes. */
let editSeq = 0;
let savedSeq = 0;
/**
 * Synchronous safety copy of unsaved edits, written to localStorage when the
 * page hides. IndexedDB writes are asynchronous and browsers may abandon them
 * when a page unloads; this journal is replayed on the next start.
 */
const JOURNAL_KEY = 'lp-journal';
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

/** Fill defaults and drop anything that would break rendering. Returns null for unusable input. */
export function migrateShape(raw: unknown): Shape | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const base = {
    id: str(s.id) || uid(),
    x: num(s.x, 0), y: num(s.y, 0),
    color: str(s.color, '#16a34a'),
    label: str(s.label),
    opacity: num(s.opacity, 0.65),
    locked: s.locked === true,
    ...(typeof s.plantId === 'string' ? { plantId: s.plantId } : {}),
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
    default:
      return null;
  }
}
export function migrateBgImage(raw: Partial<BgImage>): BgImage {
  return {
    dataUrl: str(raw.dataUrl),
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
      ops.push(put('images', key, { dataUrl } satisfies ImageRecord));
      knownImageKeys?.add(key);
    }
    storedBg = { ...rest, imageId };
  }
  const stored: StoredProject = { shapes: data.shapes, zoom: data.zoom, offsetX: data.offsetX, offsetY: data.offsetY, bgImage: storedBg };
  ops.push(put('projects', id, stored));
  return ops;
}
function metaFor(id: string): ProjectMeta | undefined {
  return state.projects.find((p) => p.id === id);
}

async function writeCurrent() {
  const id = state.currentProjectId;
  if (!id || !kv) return;
  const seq = editSeq;
  // Snapshot synchronously so later edits don't race with this write.
  const data: ProjectData = {
    shapes: state.shapes, zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY, bgImage: state.bgImage,
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
    if (savedSeq === editSeq) clearJournal();
  } catch (e) {
    // The write didn't happen; forget image keys from this batch so they're retried.
    for (const op of ops) if (op.store === 'images') storedImageKeys.delete(op.key);
    console.error('save failed', e);
    if (!quotaWarned && e instanceof DOMException && e.name === 'QuotaExceededError') {
      quotaWarned = true;
      alert('Your device is out of storage space for this app, so recent changes could not be saved. Free some space, remove a large background image, or export your projects.');
    }
  }
}
/** Schedule a save of the current project. */
export function save() {
  editSeq++;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; void flushSave(); }, SAVE_DEBOUNCE_MS);
}
/** Write any pending changes now. Resolves when they're on disk. */
export function flushSave(): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  saveChain = saveChain.then(writeCurrent, writeCurrent);
  return saveChain;
}

export function hasUnsavedChanges(): boolean { return editSeq !== savedSeq; }
function clearJournal() {
  try { localStorage.removeItem(JOURNAL_KEY); } catch { /* unavailable */ }
}
/**
 * Call when the page is being hidden or unloaded: synchronously records
 * unsaved edits so they survive even if the async write is abandoned.
 */
export function writeJournalIfDirty() {
  const id = state.currentProjectId;
  if (!id || !hasUnsavedChanges()) return;
  const bg = state.bgImage;
  const imageOnDisk = !!(bg?.imageId && committedImageKeys.has(imageKey(id, bg.imageId)));
  const journal = (withImage: boolean): Journal => ({
    projectId: id, at: now(),
    data: {
      shapes: state.shapes, zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY,
      bgImage: bg ? { ...bg, dataUrl: withImage ? bg.dataUrl : '' } : null,
    },
  });
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal(!imageOnDisk)));
  } catch {
    // Too big with the image bytes (localStorage holds ~5 MB): keep the shapes at least.
    try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal(false))); } catch { /* give up */ }
  }
}
/** Apply a journal left by a page that closed before its save finished. */
async function replayJournal(k: KV) {
  let j: Journal | null = null;
  try { j = JSON.parse(localStorage.getItem(JOURNAL_KEY) || 'null'); } catch { j = null; }
  if (!j || typeof j.projectId !== 'string') return;
  const meta = await k.get<ProjectMeta>('meta', j.projectId);
  // Skip if the project is gone, or was saved after this journal (e.g. by another tab).
  if (meta && num(j.at, 0) >= meta.lastModified) {
    const rawBg = (j.data?.bgImage ?? null) as Partial<BgImage> | null;
    const data = sanitizeProjectData({ ...j.data, bgImage: null });
    const ops: WriteOp[] = [];
    if (rawBg && rawBg.dataUrl) {
      data.bgImage = migrateBgImage(rawBg);
      ops.push(...projectWriteOps(j.projectId, data));
    } else {
      ops.push(...projectWriteOps(j.projectId, data));
      if (rawBg && rawBg.imageId) {
        // Image bytes are already stored; re-attach the reference.
        const { dataUrl: _d, ...rest } = migrateBgImage(rawBg);
        const stored = ops.find((o) => o.store === 'projects')!.value as StoredProject;
        stored.bgImage = { ...rest, imageId: rawBg.imageId };
      }
    }
    ops.push(put('meta', j.projectId, { ...meta, lastModified: num(j.at, now()), shapeCount: data.shapes.length }));
    await k.write(ops);
  }
  clearJournal();
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
/** Make `id` the open project. Saves the previous one first. */
export async function switchProject(id: string) {
  await flushSave();
  const data = (await readProject(id)) ?? sanitizeProjectData({});
  cancelHistoryDebounce();
  state.currentProjectId = id;
  state.shapes = data.shapes;
  state.zoom = data.zoom;
  state.offsetX = data.offsetX;
  state.offsetY = data.offsetY;
  state.bgImage = data.bgImage ?? null;
  state.selectedIds = [];
  state.history = [];
  state.historyIndex = -1;
  state.bgEditMode = false;
  state.bgCalibrate = null;
  storedImageKeys = new Set(data.bgImage?.imageId ? [imageKey(id, data.bgImage.imageId)] : []);
  committedImageKeys = new Set(storedImageKeys);
  savedSeq = editSeq;
  await db().write([put('kv', 'current', id)]);
  void collectImageGarbage(id, storedImageKeys);
}
/** Delete stored images of a project that its saved state no longer uses. */
async function collectImageGarbage(projectId: string, keep: Set<string>) {
  try {
    const keys = await db().keys('images', projectId + '/');
    const stale = keys.filter((k) => !keep.has(k));
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
  const consider = async (meta: { id?: unknown; name?: unknown; lastModified?: unknown }, raw: unknown) => {
    const id = str(meta.id) || uid();
    const localModified = num(meta.lastModified, 0);
    if (migratedAt !== undefined) {
      if (localModified <= migratedAt) return; // nothing new since the last check
      const existing = await k.get<ProjectMeta>('meta', id);
      if (existing && existing.lastModified >= localModified) return; // newer in IndexedDB
    }
    const data = sanitizeProjectData(raw);
    const m: ProjectMeta = { id, name: str(meta.name, 'Untitled'), lastModified: localModified || now(), shapeCount: data.shapes.length };
    ops.push(...projectWriteOps(id, data), put('meta', id, m));
    copied.push(id);
  };
  const list = readLocal(STORAGE.PROJECTS);
  if (Array.isArray(list)) {
    for (const m of list) if (m && typeof m === 'object') await consider(m, readLocal(STORAGE.project(str((m as ProjectMeta).id))));
  }
  // The single-project format from before multiple projects existed.
  const legacy = readLocal(STORAGE.LEGACY);
  if (legacy && migratedAt === undefined) await consider({ name: 'My Garden' }, legacy);
  if (migratedAt === undefined) {
    const current = (() => { try { return localStorage.getItem(STORAGE.CURRENT); } catch { return null; } })();
    if (current && copied.includes(current)) ops.push(put('kv', 'current', current));
    else if (legacy && copied.length) ops.push(put('kv', 'current', copied[copied.length - 1]));
    const clip = readLocal(STORAGE.CLIPBOARD);
    if (clip) ops.push(put('kv', 'clipboard', clip));
  }
  if (migratedAt !== undefined && !copied.length) return;
  ops.push(put('kv', 'migratedFromLocalStorage', now()));
  await k.write(ops);
}

/** Open storage, migrate old data, and load the last-open project into `state`. */
export async function initStorage(kvOverride?: KV) {
  kv = kvOverride ?? (await openKV());
  state.currentProjectId = null; // nothing is open yet; nothing to save
  try {
    await migrateFromLocalStorage(kv);
  } catch (e) {
    console.error('migration from localStorage failed', e);
  }
  try {
    await replayJournal(kv);
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
}

/** Test hook: forget module state between tests. */
export function _resetStorageForTests() {
  kv = null; clipboardCache = null; storedImageKeys = new Set(); committedImageKeys = new Set();
  quotaWarned = false; lastBackupAt = null; editSeq = 0; savedSeq = 0;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null; saveChain = Promise.resolve();
}
