import { state } from './state';
import { createProject, currentProjectData, readProject, sanitizeProjectData, setLastBackupAt } from './storage';
import type { ProjectData } from './types';
import { myPlants, myPlantsUsedBy } from './my-plants';
import { wirePlant } from './catalog';
import { now } from './util';

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
  // (The Plant list's ticks and who's in the yard go with the plan, Jason, Nov 1. A file from before has neither: it
  // opens with nothing ticked, and the yard as the device opening it had it: src/yard.ts householdFromDevice.)
  return {
    shapes: data.shapes, zoom: data.zoom, offsetX: data.offsetX, offsetY: data.offsetY, roleViews: data.roleViews ?? {}, print: data.print, sizeMode: data.sizeMode, sunWarnings: data.sunWarnings,
    ...(data.dismissed ? { dismissed: data.dismissed } : {}), ...(data.bought ? { bought: data.bought } : {}), ...(data.household ? { household: data.household } : {}),
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
/**
 * The date in a file's name, as the person's own calendar has it: in UTC, a backup and a picture made at 11:25 PM in
 * Arkansas were dated the next day, beside a PDF dated that day (the UI review, 2026-11-01). Every file the app
 * names (backups, plan files, the PDF, pictures, the support file) takes its date from here.
 */
export function stamp(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
      lastModified: typeof o.lastModified === 'number' ? o.lastModified : now(),
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
/** Add imported projects as new projects (never overwrites). Returns their ids. */
export async function importProjects(list: ExportedProject[]): Promise<string[]> {
  const ids: string[] = [];
  for (const p of list) {
    const name = uniqueName(p.name, state.projects.map((x) => x.name));
    ids.push(await createProject(name, p.data));
  }
  return ids;
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
