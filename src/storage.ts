import { MAX_POINTS, MAX_TRUNK, MIN_POINTS, MIN_TRUNK, STORAGE } from './constants';
import { del, openKV, put, type KV, type WriteOp } from './db';
import { cancelHistoryDebounce } from './history';
import { DEFAULT_PRINT, state } from './state';
import { isRole } from './roles';
import { cleanPhaseName, isStatus, MAX_PHASES } from './status';
import type { BgImage, Clipboard, PathShape, PhotoRef, PrintSettings, SizeMode, ProjectData, ProjectMeta, RoleViews, Shape, SunInfo } from './types';
import { setWorldPoints } from './geometry';
import { now, uid } from './util';
import { photoFingerprint } from './sync/photo';

// Persistence. Projects live in IndexedDB:
//   meta/<projectId>          ProjectMeta (name, dates, shape count)
//   projects/<projectId>      ProjectData without the background image bytes
//   images/<projectId>/<id>   { dataUrl } for the background image
//   kv/current, kv/clipboard, kv/lastBackupAt, kv/migratedFromLocalStorage,
//   kv/myPlants (the user's plant library), kv/myPlantSync (its sync state), kv/lastSizeMode
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
    ...(typeof s.sunDismissed === 'string' && s.sunDismissed ? { sunDismissed: s.sunDismissed.slice(0, 300) } : {}),
    ...(isStatus(s.status) ? { status: s.status } : {}),
    ...(typeof s.plantedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.plantedOn) ? { plantedOn: s.plantedOn } : {}),
    ...(typeof s.phase === 'string' && cleanPhaseName(s.phase) ? { phase: cleanPhaseName(s.phase) } : {}),
  };
  const size = (v: unknown, d: number) => Math.max(0.1, num(v, d));
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
        ...(shaped ? { canopy } : {}),
      };
    }
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
      const shape = {
        ...base, type: s.type, points: [], rotation: num(s.rotation, 0),
        ...(s.type === 'line' && s.showLength === true ? { showLength: true } : {}),
        // Paths: a width in feet (a quarter foot to 50 ft); anything else draws as a thin line.
        ...(s.type === 'line' && typeof s.pathWidth === 'number' && s.pathWidth >= 0.25 && s.pathWidth <= 50 ? { pathWidth: s.pathWidth } : {}),
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
  const { naturalWidth, naturalHeight, ftPerPx, cx, cy, rotation, opacity, visible } = migrateBgImage(bg);
  return { fingerprint, naturalWidth, naturalHeight, ftPerPx, cx, cy, rotation, opacity, visible };
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
    photoElsewhere: state.photoElsewhere,
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
    roleViews: sanitizeRoleViews(d.roleViews),
    print: sanitizePrint(d.print),
    sizeMode: d.sizeMode === 'full' ? 'full' : 'typical',
    sunWarnings: d.sunWarnings !== false,
    phases: sanitizePhases(d.phases, shapes),
    bgImage: bg && bg.dataUrl ? bg : null,
    photoElsewhere: bg && bg.dataUrl ? null : sanitizePhotoRef(d.photoElsewhere),
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
  const stored: StoredProject = {
    shapes: data.shapes, zoom: data.zoom, offsetX: data.offsetX, offsetY: data.offsetY, roleViews: data.roleViews ?? {},
    print: data.print ?? { ...DEFAULT_PRINT }, sizeMode: data.sizeMode ?? 'typical', sunWarnings: data.sunWarnings !== false, phases: data.phases ?? [], bgImage: storedBg,
    photoElsewhere: storedBg ? null : data.photoElsewhere ?? null,
  };
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
  const hadEdits = seq !== savedSeq; // (a flush with nothing new still writes; sync only hears of real edits)
  // Snapshot synchronously so later edits don't race with this write.
  const data = currentProjectData();
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
    if (hadEdits) afterSave?.();
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
  const data = sanitizeProjectData({ ...stored, bgImage });
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
  state.currentProjectId = id;
  state.shapes = data.shapes;
  state.zoom = data.zoom;
  state.offsetX = data.offsetX;
  state.offsetY = data.offsetY;
  state.roleViews = data.roleViews ?? {};
  state.print = data.print ?? { ...DEFAULT_PRINT };
  state.sizeMode = data.sizeMode ?? 'typical';
  state.sunWarnings = data.sunWarnings !== false;
  state.phases = data.phases ?? [];
  state.viewFilter = { status: '', phase: '', showGone: false };
  state.bgImage = data.bgImage ?? null;
  state.photoElsewhere = data.photoElsewhere ?? null;
  state.selectedIds = [];
  state.history = [];
  state.historyIndex = -1;
  state.bgEditMode = false;
  state.bgCalibrate = null;
  state.draw = null;
  state.placing = null;
  state.pickerForTree = false;
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
/** Create a project (empty, or from given data). Does not open it. `id`: one the server already knows (sync). */
export async function createProject(name: string, data?: ProjectData, id = uid()): Promise<string> {
  const projectData = data ?? { ...sanitizeProjectData({}), sizeMode: lastSizeMode };
  const meta: ProjectMeta = { id, name: name.trim() || 'Untitled', lastModified: now(), shapeCount: projectData.shapes.length };
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
  const ops = [del('meta', id), del('projects', id), ...imageKeys.map((k) => del('images', k))];
  // Sync state changes in memory first, then on disk in the same write, so
  // overlapping writes can't put back an older copy.
  const rec = syncRecords[id];
  if (rec) {
    const records = { ...syncRecords };
    delete records[id];
    syncRecords = records;
    if (!bySync) syncTombstones = { ...syncTombstones, [id]: rec.revision };
    ops.push(put('kv', 'syncRecords', syncRecords), put('kv', 'syncTombstones', syncTombstones));
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
 * as for projects synced before photos did).
 */
export interface SyncRecord { revision: number; hash: string; photo?: string; held?: 'room' | 'refused' }
let syncRecords: Record<string, SyncRecord> = {};
/** Synced projects deleted here, still to be moved to the server's trash: id → revision. */
let syncTombstones: Record<string, number> = {};
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
    await db().write([put('kv', 'syncRecords', syncRecords), put('kv', 'syncTombstones', syncTombstones)]);
    return;
  }
  const next = { ...syncRecords };
  if (rec) next[id] = rec; else delete next[id];
  syncRecords = next;
  await db().write([put('kv', 'syncRecords', next)]);
}
export async function clearSyncTombstone(id: string) {
  const next = { ...syncTombstones };
  delete next[id];
  syncTombstones = next;
  await db().write([put('kv', 'syncTombstones', next)]);
}
/** The account this device last synced with (null: none). */
export function getSyncUser(): string | null { return syncUserId; }
/** Forget all sync state and note whose it is now (a different account signed in on this device). Edit times stay. */
export async function resetSyncState(userId: string | null) {
  syncRecords = {}; syncTombstones = {}; syncUserId = userId;
  plantSync = { records: {}, edited: plantSync.edited };
  await db().write([put('kv', 'syncRecords', {}), put('kv', 'syncTombstones', {}), put('kv', 'syncUser', userId), put('kv', 'myPlantSync', plantSync)]);
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
export type SyncedContent = Pick<ProjectData, 'shapes' | 'roleViews' | 'print' | 'sizeMode' | 'sunWarnings' | 'phases'>;
export function syncedContent(d: ProjectData): SyncedContent {
  return { shapes: d.shapes, roleViews: d.roleViews ?? {}, print: d.print ?? { ...DEFAULT_PRINT }, sizeMode: d.sizeMode ?? 'typical', sunWarnings: d.sunWarnings !== false, phases: d.phases ?? [] };
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
  const metaNext = { ...meta, name: name.trim() || 'Untitled', lastModified: now(), shapeCount: data.shapes.length };
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
    state.phases = data.phases ?? [];
    if (state.bgImage !== data.bgImage) { state.bgImage = data.bgImage ?? null; if (!state.bgImage) state.bgEditMode = false; }
    state.photoElsewhere = data.photoElsewhere ?? null;
    state.selectedIds = state.selectedIds.filter((sid) => data.shapes.some((s) => s.id === sid));
    state.history = [];
    state.historyIndex = -1;
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
  if (state.currentProjectId === id) { await flushSave(); return currentProjectData(); }
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
  if (kv) clipboardCache = (await kv.get<Clipboard>('kv', 'clipboard')) ?? clipboardCache;
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
  const mp = await kv.get<unknown>('kv', 'myPlants');
  myPlantsRaw = Array.isArray(mp) ? mp : [];
  plantSync = sanitizePlantSync(await kv.get<unknown>('kv', 'myPlantSync'));
  lastSizeMode = (await kv.get<unknown>('kv', 'lastSizeMode')) === 'full' ? 'full' : 'typical';
  const recs = await kv.get<unknown>('kv', 'syncRecords');
  syncRecords = sanitizeSyncRecords(recs);
  const tombs = await kv.get<unknown>('kv', 'syncTombstones');
  syncTombstones = {};
  if (tombs && typeof tombs === 'object') for (const [k, v] of Object.entries(tombs)) if (typeof v === 'number' && Number.isFinite(v)) syncTombstones[k] = v;
  const su = await kv.get<unknown>('kv', 'syncUser');
  syncUserId = typeof su === 'string' ? su : null;
  if (state.projects.length === 0) await createProject('My Garden');
  let currentId = await kv.get<string>('kv', 'current');
  if (!currentId || !metaFor(currentId)) currentId = state.projects[0].id;
  await switchProject(currentId);
  return { migrationError };
}

function sanitizeSyncRecords(raw: unknown): Record<string, SyncRecord> {
  const out: Record<string, SyncRecord> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const r = v as Partial<SyncRecord> | null;
      if (r && typeof r.revision === 'number' && Number.isFinite(r.revision) && typeof r.hash === 'string') {
        out[k] = { revision: r.revision, hash: r.hash };
        if (typeof r.photo === 'string' && /^(none|kept|[0-9a-f]{64}@[0-9a-z]+:[0-9a-z]+)$/.test(r.photo)) out[k].photo = r.photo;
        if (r.held === 'room' || r.held === 'refused') out[k].held = r.held;
      }
    }
  }
  return out;
}
/** Test hook: forget module state between tests. */
export function _resetStorageForTests() {
  kv = null; clipboardCache = null; storedImageKeys = new Set(); committedImageKeys = new Set();
  quotaWarned = false; lastBackupAt = null; myPlantsRaw = []; lastSizeMode = 'typical'; editSeq = 0; savedSeq = 0; saveFailing = false;
  lastFailureJournalAt = 0; unreplayed.clear(); syncRecords = {}; syncTombstones = {}; syncUserId = null; changeCounts.clear(); plantSync = { records: {}, edited: {} };
  saveChain = Promise.resolve(true);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}
