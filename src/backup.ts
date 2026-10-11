import { state } from './state';
import { createProject, readProject, sanitizeProjectData, setLastBackupAt } from './storage';
import type { ProjectData } from './types';
import { now } from './util';

// Project files: a single project, or a backup of every project, as JSON.
// Background images are embedded as data URLs so a file is self-contained.

export const PROJECT_FORMAT = 'landscape-planner-project';
export const BACKUP_FORMAT = 'landscape-planner-backup';
const FILE_VERSION = 1;

export interface ExportedProject { name: string; lastModified: number; data: ProjectData }
export interface ProjectFile { format: typeof PROJECT_FORMAT; version: number; exportedAt: string; project: ExportedProject }
export interface BackupFile { format: typeof BACKUP_FORMAT; version: number; exportedAt: string; projects: ExportedProject[] }

function forExport(data: ProjectData): ProjectData {
  const bgImage = data.bgImage ? { ...data.bgImage } : null;
  if (bgImage) delete bgImage.imageId; // storage detail; a new id is assigned on import
  return { shapes: data.shapes, zoom: data.zoom, offsetX: data.offsetX, offsetY: data.offsetY, bgImage };
}
async function exportedProject(id: string): Promise<ExportedProject | null> {
  const meta = state.projects.find((p) => p.id === id);
  if (!meta) return null;
  // The open project is exported from memory: always the latest edits, even if a save is failing.
  const data = id === state.currentProjectId
    ? { shapes: state.shapes, zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY, bgImage: state.bgImage }
    : await readProject(id);
  if (!data) return null;
  return { name: meta.name, lastModified: meta.lastModified, data: forExport(data) };
}
export function safeFileName(name: string): string {
  return (name.trim().replace(/[^a-z0-9-_ ]+/gi, '').replace(/\s+/g, '-').toLowerCase() || 'project').slice(0, 60);
}
function stamp() { return new Date().toISOString().slice(0, 10); }

export async function buildProjectFile(id: string): Promise<{ filename: string; text: string } | null> {
  const project = await exportedProject(id);
  if (!project) return null;
  const file: ProjectFile = { format: PROJECT_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(), project };
  return { filename: `${safeFileName(project.name)}-${stamp()}.landscape.json`, text: JSON.stringify(file) };
}
export async function buildBackupFile(): Promise<{ filename: string; text: string; count: number }> {
  const projects: ExportedProject[] = [];
  for (const p of state.projects) {
    const e = await exportedProject(p.id);
    if (e) projects.push(e);
  }
  const file: BackupFile = { format: BACKUP_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(), projects };
  return { filename: `landscape-backup-${stamp()}.landscape.json`, text: JSON.stringify(file), count: projects.length };
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
  return { filename: `landscape-recovery-${stamp()}.landscape.json`, text: JSON.stringify(file), count: projects.length };
}

/** Parse a project or backup file. Throws an Error with a user-facing message. */
export function parseImportFile(text: string): ExportedProject[] {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("This file isn't a Landscape Planner project (it isn't valid JSON)."); }
  if (!raw || typeof raw !== 'object') throw new Error("This file isn't a Landscape Planner project.");
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
  throw new Error("This file isn't a Landscape Planner project or backup.");
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
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
/** Whether the system share sheet can take a file (Android/iOS). */
export function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] });
  } catch { return false; }
}
export async function shareText(filename: string, text: string): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([text], filename, { type: 'application/json' })], title: filename });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false; // user cancelled
    throw e;
  }
}
/** Save a full backup and record when it happened. */
export async function backupAll(via: 'download' | 'share'): Promise<number> {
  const { filename, text, count } = await buildBackupFile();
  if (via === 'share') {
    try {
      if (!(await shareText(filename, text))) return 0;
    } catch (e) {
      // e.g. the share sheet refused because preparing the file took too long
      if (!(e instanceof DOMException && e.name === 'NotAllowedError')) throw e;
      downloadText(filename, text);
    }
  } else downloadText(filename, text);
  await setLastBackupAt(now());
  return count;
}
