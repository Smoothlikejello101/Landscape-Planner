import { state } from './state';
import { createProject, currentProjectData, readProject, sanitizeProjectData, setLastBackupAt } from './storage';
import type { ProjectData } from './types';
import { myPlants, myPlantsUsedBy } from './my-plants';
import { wirePlant } from './catalog';
import { now, stamp } from './util';
import { rawCopy } from './db';

// Project files: a single project, or a backup of every project, as JSON.
// Background images are embedded as data URLs so a file is self-contained.

export const PROJECT_FORMAT = 'landscape-planner-project';
export const BACKUP_FORMAT = 'landscape-planner-backup';
const FILE_VERSION = 1;

export interface ExportedProject { name: string; lastModified: number; data: ProjectData }
/** Files also carry "My plants": every one in a backup, the ones the project uses in a project file. */
export interface ProjectFile { format: typeof PROJECT_FORMAT; version: number; exportedAt: string; project: ExportedProject; myPlants?: unknown[] }
export interface BackupFile { format: typeof BACKUP_FORMAT; version: number; exportedAt: string; projects: ExportedProject[]; myPlants?: unknown[] }

function forExport(data: ProjectData): ProjectData {
  const bgImage = data.bgImage ? { ...data.bgImage } : null;
  if (bgImage) delete bgImage.imageId; // storage detail; a new id is assigned on import
  // (The Plant list's ticks, who's in the yard and the warning switches go with the plan, Jason, Nov 1. A file from
  // before has none of them: it opens with nothing ticked, and the yard and the switches as the device opening it had
  // them: src/yard.ts householdFromDevice, src/view-settings.ts switchesFromDevice.)
  return {
    shapes: data.shapes, zoom: data.zoom, offsetX: data.offsetX, offsetY: data.offsetY, roleViews: data.roleViews ?? {}, print: data.print, sizeMode: data.sizeMode, sunWarnings: data.sunWarnings,
    ...(data.dismissed ? { dismissed: data.dismissed } : {}), ...(data.bought ? { bought: data.bought } : {}), ...(data.household ? { household: data.household } : {}),
    ...(data.switches ? { switches: data.switches } : {}),
    phases: data.phases, location: data.location, bgImage,
  };
}
async function exportedProject(id: string): Promise<ExportedProject | null> {
  const meta = state.projects.find((p) => p.id === id);
  if (!meta) return null;
  // The open project is exported from memory: always the latest edits, even if a save is failing.
  const data = id === state.currentProjectId
    ? currentProjectData()
    : await readProject(id);
  if (!data) return null;
  return { name: meta.name, lastModified: meta.lastModified, data: forExport(data) };
}
export function safeFileName(name: string): string {
  // (A run of dashes is one: "Grace - shady oak yard" came out "grace---shady-oak-yard". Round 3, Grace.)
  return (name.trim().replace(/[^a-z0-9-_ ]+/gi, '').replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'project').slice(0, 60);
}
/** The date in a file's name, as the person's own calendar has it (src/util.ts stamp). */
export { stamp };

export async function buildProjectFile(id: string): Promise<{ filename: string; text: string } | null> {
  const project = await exportedProject(id);
  if (!project) return null;
  const file: ProjectFile = { format: PROJECT_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(), project, myPlants: myPlantsUsedBy(project.data.shapes).map(wirePlant) };
  return { filename: `${safeFileName(project.name)}-${stamp()}.fullgrown.json`, text: JSON.stringify(file) };
}
/** Every project, as a file holds it (the open one from memory). */
export async function allExportedProjects(): Promise<ExportedProject[]> {
  const projects: ExportedProject[] = [];
  for (const p of state.projects) {
    const e = await exportedProject(p.id);
    if (e) projects.push(e);
  }
  return projects;
}
export async function buildBackupFile(): Promise<{ filename: string; text: string; count: number }> {
  const projects = await allExportedProjects();
  const file: BackupFile = { format: BACKUP_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(), projects, myPlants: myPlants.map(wirePlant) }; // (forms any version reads: WIRE_FORMS)
  return { filename: `fullgrown-backup-${stamp()}.fullgrown.json`, text: JSON.stringify(file), count: projects.length };
}

/** A raw copy's format: not a backup Import reads, but everything the device stores, as it's stored. */
export const RAW_COPY_FORMAT = 'fullgrown-raw-database';
/**
 * Every record of the app's database as stored, whatever its version, as a file (src/db.ts rawCopy): for a page that
 * can't open the plans, a newer version having them (src/main.ts), to save them all the same. Null: none stored.
 */
export async function buildRawCopyFile(name?: string): Promise<{ filename: string; text: string } | null> {
  const copy = await rawCopy(name);
  if (!copy) return null;
  const file = { format: RAW_COPY_FORMAT, savedAt: new Date().toISOString(), databaseVersion: copy.version, stores: copy.stores };
  return { filename: `fullgrown-raw-copy-${stamp()}.json`, text: JSON.stringify(file) };
}

/**
 * Everything readable without IndexedDB: projects saved by the previous
 * version (localStorage) and unsaved-change journals. Used when the main
 * storage won't open. Returns null if there is nothing.
 */
export function buildEmergencyBackup(): { filename: string; text: string; count: number } | null {
  const projects: ExportedProject[] = [];
  const read = (k: string): unknown => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const list = read('lp-projects');
  if (Array.isArray(list)) {
    for (const m of list as { id?: string; name?: string; lastModified?: number }[]) {
      if (!m?.id) continue;
      projects.push({ name: `${m.name || 'Untitled'} (older copy)`, lastModified: m.lastModified ?? 0, data: sanitizeProjectData(read('lp-project-' + m.id)) });
    }
  }
  const legacy = read('landscape-planner-v1');
  if (legacy) projects.push({ name: 'My Garden (oldest copy)', lastModified: 0, data: sanitizeProjectData(legacy) });
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith('lp-journal:')) continue;
    const j = read(k) as { at?: number; data?: unknown } | null;
    if (j) projects.push({ name: 'Unsaved changes ' + new Date(j.at ?? 0).toLocaleString(), lastModified: j.at ?? 0, data: sanitizeProjectData(j.data) });
  }
  if (!projects.length) return null;
  const file: BackupFile = { format: BACKUP_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(), projects };
  return { filename: `fullgrown-recovery-${stamp()}.fullgrown.json`, text: JSON.stringify(file), count: projects.length };
}

/** The largest file Import takes: a backup's photos are downscaled JPEGs (about 2000 px), so a real one is far
 *  smaller; a bigger file, read whole into memory, could freeze a phone. (Weekly security check, Nov 1: it read any
 *  file at all. 100 MB, not the check's 50, leaves room for a backup of many plans with photos.) */
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
/** What to say about a file too big to import, or null to go ahead. */
export function importTooBig(bytes: number): string | null {
  if (bytes <= MAX_IMPORT_BYTES) return null;
  const mb = Math.ceil(bytes / (1024 * 1024));
  return `That file is ${mb} MB, too big to be a FullGrown plan or backup (they're well under ${MAX_IMPORT_BYTES / (1024 * 1024)} MB). Pick the .json file you saved from FullGrown.`;
}

/** Parse a project or backup file. Throws an Error with a user-facing message. */
export function parseImportFile(text: string): ExportedProject[] {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch {
    // (One that starts as ours and doesn't finish: a download cut short. Said so, not "isn't a FullGrown project".
    // Round 3, Sam.)
    if (/^\s*\{\s*"format"\s*:\s*"landscape-planner-(project|backup)"/.test(text.slice(0, 200))) {
      throw new Error('This FullGrown file is damaged or cut short: it doesn\u2019t end as it should. If it was downloaded, try saving it again.');
    }
    throw new Error("This file isn't a FullGrown project (it isn't valid JSON).");
  }
  if (!raw || typeof raw !== 'object') throw new Error("This file isn't a FullGrown project.");
  const f = raw as Record<string, unknown>;
  const version = typeof f.version === 'number' ? f.version : 0;
  if (version > FILE_VERSION) throw new Error('This file was made by a newer version of the app. Update the app and try again.');
  const one = (p: unknown): ExportedProject => {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    return {
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Imported project',
      lastModified: fileModified(o.lastModified),
      data: sanitizeProjectData(o.data),
    };
  };
  if (f.format === PROJECT_FORMAT) return [one(f.project)];
  if (f.format === BACKUP_FORMAT && Array.isArray(f.projects)) return f.projects.map(one);
  throw new Error("This file isn't a FullGrown project or backup.");
}
/** "My plants" carried in a project or backup file (validated when merged). */
export function parseImportPlants(text: string): unknown[] {
  try {
    const f = JSON.parse(text) as { myPlants?: unknown };
    return Array.isArray(f?.myPlants) ? f.myPlants : [];
  } catch { return []; }
}
/** Name that doesn't collide with existing projects: "Front Yard (2)". */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  for (let i = 2; ; i++) if (!taken.includes(`${name} (${i})`)) return `${name} (${i})`;
}
/** The earliest "last modified" a file's plan is taken at: FullGrown made none before it. Earlier, or none: unknown. */
const FIRST_PLAN = Date.UTC(2025, 0, 1);
/**
 * When a file's plan last changed, as the file says (the list bug hunt, Nov 1, B5: every plan brought back read "last
 * modified" at the moment of the import). Unknown (none, or before FullGrown made plans): now. One ahead of this
 * device's clock (another device's set ahead): now, so it doesn't sit above plans changed since.
 */
function fileModified(v: unknown): number {
  const t = now();
  return typeof v === 'number' && Number.isFinite(v) && v >= FIRST_PLAN ? Math.min(v, t) : t;
}

/** A value with its objects' keys in order, to compare as JSON whatever order they were written in. */
function ordered(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordered);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordered((v as Record<string, unknown>)[k])]));
}
/**
 * A plan's content as a file holds it, less how it's viewed on a device, to tell one already here from one that
 * differs (Jason, Nov 1, from the list bug hunt's B2: a full backup brought in copies of every plan still here): its
 * shapes, photo (its picture and where it sits), ticks, yard, warnings and their dismissals, phases, location, print
 * settings and layers, each as a file would have it. Not where it's zoomed and panned, nor the photo's storage id,
 * fingerprint (worked out from the picture) or whether it's kept on this device only.
 */
export function planContent(data: ProjectData): string {
  // (As a file has it and an import reads it, on both sides: what one leaves out or fills in, the other does too.)
  const d = sanitizeProjectData(JSON.parse(JSON.stringify(forExport(data)))) as Partial<ProjectData>;
  delete d.zoom; delete d.offsetX; delete d.offsetY; delete d.viewFilter; delete d.photoElsewhere;
  if (d.bgImage) { const bg = { ...d.bgImage }; delete bg.imageId; delete bg.fingerprint; delete bg.deviceOnly; d.bgImage = bg; }
  return JSON.stringify(ordered(d));
}
/**
 * Whether two plans' names are one name: the same, or one with the "(2)" an import or a new plan added to it, so a
 * copy brought in before ("Side yard (2)") counts as the plan it was a copy of. (An empty plan, or one whose name
 * isn't its own, isn't taken for another of the same content.)
 */
export function sameName(a: string, b: string): boolean {
  const base = (n: string) => n.trim().replace(/\s+\(\d+\)$/, '');
  return base(a) === base(b);
}
/**
 * Add imported projects as new projects; never overwrites. One just like a plan already here (its name, give or take a
 * "(2)": sameName; the same content: planContent) is skipped: restoring one lost plan from a full backup brings back
 * that one, not a copy of every other (Jason, Nov 1, from the list bug hunt's B2). One that differs comes in beside
 * it, as a copy ("Side yard (2)"). Each keeps when it last changed, from the file (B5). The ids added, and how many
 * were skipped.
 */
export async function importProjects(list: ExportedProject[]): Promise<{ ids: string[]; skipped: number }> {
  const ids: string[] = [];
  let skipped = 0;
  const known = new Map<string, string | null>(); // (a plan here's content, read once, when a plan of its name comes)
  const contentOf = async (id: string): Promise<string | null> => {
    if (!known.has(id)) {
      const data = id === state.currentProjectId ? currentProjectData() : await readProject(id);
      known.set(id, data ? planContent(data) : null);
    }
    return known.get(id)!;
  };
  for (const p of list) {
    const content = planContent(p.data);
    let here = false;
    for (const m of state.projects.filter((x) => sameName(x.name, p.name))) {
      if (await contentOf(m.id) === content) { here = true; break; }
    }
    if (here) { skipped++; continue; }
    const name = uniqueName(p.name, state.projects.map((x) => x.name));
    ids.push(await createProject(name, p.data, undefined, p.lastModified));
  }
  return { ids, skipped };
}
/**
 * What an import's notice says: "Imported 2 projects and 3 of your plants; 1 already here, skipped", or, all of them
 * here, "All 3 projects are already here, so none were imported".
 */
export function importSaid(ids: number, skipped: number, plants: number): string {
  const mine = plants ? ` and ${plants} of your plants` : '';
  if (!ids && skipped) {
    return (skipped === 1 ? 'That project is already here' : `All ${skipped} projects are already here`) + ', so none were imported'
      + (plants ? `; added ${plants} of your plants` : '');
  }
  return `Imported ${ids} project${ids === 1 ? '' : 's'}${mine}` + (skipped ? `; ${skipped} already here, skipped` : '');
}

// ---------- Getting a file to the user ----------
export function downloadText(filename: string, text: string, type = 'application/json') {
  downloadBlob(filename, new Blob([text], { type }));
}
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
/** Whether the system share sheet can take a file (Android/iOS). */
export function canShareFiles(type = 'application/json', name = 'x.json'): boolean {
  try {
    return typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File(['{}'], name, { type })] });
  } catch { return false; }
}
/** Hand a file to the system share sheet. False if the user canceled. */
export async function shareBlob(filename: string, blob: Blob): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([blob], filename, { type: blob.type })], title: filename });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
    throw e;
  }
}
export async function shareText(filename: string, text: string): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([text], filename, { type: 'application/json' })], title: filename });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false; // user canceled
    throw e;
  }
}
/**
 * Whether the system share sheet takes words, to paste into a note or a message (the Plant list's Share as text; a
 * file, as shareText hands over, wouldn't paste).
 */
export function canShareWords(): boolean {
  try {
    return typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare({ text: 'x' }));
  } catch { return false; }
}
/** Hand words to the system share sheet. False if the person canceled. */
export async function shareWords(title: string, text: string): Promise<boolean> {
  try {
    await navigator.share({ title, text });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false; // (canceled)
    throw e;
  }
}
/** Save a full backup and record when it happened: how many projects, the file, and whether it was downloaded or shared (null: canceled). */
export async function backupAll(via: 'download' | 'share'): Promise<{ count: number; filename: string; via: 'download' | 'share' } | null> {
  const { filename, text, count } = await buildBackupFile();
  let went = via;
  if (via === 'share') {
    try {
      if (!(await shareText(filename, text))) return null;
    } catch (e) {
      // e.g. the share sheet refused because preparing the file took too long
      if (!(e instanceof DOMException && e.name === 'NotAllowedError')) throw e;
      downloadText(filename, text);
      went = 'download';
    }
  } else downloadText(filename, text);
  await setLastBackupAt(now());
  return { count, filename, via: went };
}
/** What a backup notice says: where the file went, and how to bring it back. */
export function backupSaid(b: { count: number; filename: string; via: 'download' | 'share' }): string {
  const what = `Backed up ${b.count} project${b.count === 1 ? '' : 's'}`;
  return (b.via === 'download' ? `${what} to your Downloads: ${b.filename}.` : `${what}: ${b.filename}.`)
    + ' To bring them back, open Projects and tap Import from file.';
}
