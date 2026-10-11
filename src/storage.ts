import { STORAGE } from './constants';
import { state } from './state';
import type { BgImage, Clipboard, ProjectData, ProjectMeta, Shape } from './types';
import { cancelHistoryDebounce } from './history';
import { now, uid } from './util';

// ============================================================
// STORAGE
// ============================================================
export function loadProjectList(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE.PROJECTS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
export function saveProjectList() {
  try {
    localStorage.setItem(STORAGE.PROJECTS, JSON.stringify(state.projects));
  } catch (e) { console.error('saveProjectList', e); }
}
export function loadProjectData(id: string): ProjectData | null {
  try {
    const raw = localStorage.getItem(STORAGE.project(id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
export function saveCurrentProject() {
  if (!state.currentProjectId) return;
  try {
    localStorage.setItem(STORAGE.project(state.currentProjectId), JSON.stringify({
      shapes: state.shapes,
      zoom: state.zoom,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
      bgImage: state.bgImage
    }));
    const proj = state.projects.find(p => p.id === state.currentProjectId);
    if (proj) {
      proj.lastModified = now();
      saveProjectList();
    }
  } catch (e) {
    if (e instanceof Error && (e.name === 'QuotaExceededError' || /quota/i.test(String(e)))) {
      alert('Storage full. This usually means the satellite image is too large. Try removing it from Background image, or delete unused projects.');
    }
    console.error('saveCurrentProject', e);
  }
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCurrentProject, 250);
}
export function setCurrentProjectId(id: string) {
  state.currentProjectId = id;
  try { localStorage.setItem(STORAGE.CURRENT, id); } catch { /* storage unavailable */ }
}
export function loadProject(id: string) {
  const data = loadProjectData(id);
  if (!data) {
    state.shapes = [];
    state.zoom = 1;
    state.offsetX = -10;
    state.offsetY = -10;
    state.bgImage = null;
  } else {
    state.shapes = (data.shapes || []).map((s) => migrateShape(s));
    state.zoom = typeof data.zoom === 'number' ? data.zoom : 1;
    state.offsetX = typeof data.offsetX === 'number' ? data.offsetX : -10;
    state.offsetY = typeof data.offsetY === 'number' ? data.offsetY : -10;
    state.bgImage = data.bgImage ? migrateBgImage(data.bgImage) : null;
  }
  cancelHistoryDebounce();
  state.selectedIds = [];
  state.history = [];
  state.historyIndex = -1;
  state.bgEditMode = false;
  state.bgCalibrate = null;
  setCurrentProjectId(id);
}
export function migrateShape(s: object): Shape {
  const base: Record<string, unknown> = Object.assign({
    opacity: 0.65,
    locked: false,
    rotation: 0,
    label: ''
  }, s);
  // Ensure type-specific fields exist with defaults
  if (base.type === 'triangle' && !base.rightAngle) base.rightAngle = 'bl';
  return base as unknown as Shape;
}
export function migrateBgImage(b: Partial<BgImage>): BgImage {
  // Fill in any missing defaults on old / partial data
  return Object.assign({
    dataUrl: '',
    naturalWidth: 1000,
    naturalHeight: 1000,
    ftPerPx: 0.1,
    cx: 0,
    cy: 0,
    rotation: 0,
    opacity: 0.6,
    visible: true
  }, b);
}
export function createProject(name: string, initialData?: ProjectData): string {
  const id = uid();
  const proj: ProjectMeta = { id, name: name || 'Untitled', lastModified: now() };
  state.projects.unshift(proj);
  saveProjectList();
  if (initialData) {
    try { localStorage.setItem(STORAGE.project(id), JSON.stringify(initialData)); } catch { /* storage unavailable */ }
  } else {
    try { localStorage.setItem(STORAGE.project(id), JSON.stringify({ shapes: [], zoom: 1, offsetX: -10, offsetY: -10 })); } catch { /* storage unavailable */ }
  }
  return id;
}
export function deleteProject(id: string) {
  state.projects = state.projects.filter(p => p.id !== id);
  saveProjectList();
  try { localStorage.removeItem(STORAGE.project(id)); } catch { /* storage unavailable */ }
}
export function renameProject(id: string, name: string) {
  const proj = state.projects.find(p => p.id === id);
  if (proj) {
    proj.name = name || 'Untitled';
    proj.lastModified = now();
    saveProjectList();
  }
}
export function currentProject(): ProjectMeta | null {
  return state.projects.find(p => p.id === state.currentProjectId) || null;
}
export function init() {
  state.projects = loadProjectList();
  // Migrate legacy data
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(STORAGE.LEGACY); } catch { /* storage unavailable */ }
  if (legacy) {
    try {
      const data = JSON.parse(legacy);
      const id = createProject('My Garden', {
        shapes: data.shapes || [],
        zoom: data.zoom || 1,
        offsetX: data.offsetX || -10,
        offsetY: data.offsetY || -10
      });
      localStorage.removeItem(STORAGE.LEGACY);
      setCurrentProjectId(id);
    } catch (e) { console.error('legacy migration failed', e); }
  }
  // Ensure at least one project exists
  if (state.projects.length === 0) {
    const id = createProject('My Garden');
    setCurrentProjectId(id);
  }
  // Restore previously open project
  let currentId: string | null = null;
  try { currentId = localStorage.getItem(STORAGE.CURRENT); } catch { /* storage unavailable */ }
  if (!currentId || !state.projects.find(p => p.id === currentId)) {
    currentId = state.projects[0].id;
  }
  loadProject(currentId);
}
export function getClipboard(): Clipboard | null {
  try {
    const raw = localStorage.getItem(STORAGE.CLIPBOARD);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function setClipboard(data: Clipboard) {
  try { localStorage.setItem(STORAGE.CLIPBOARD, JSON.stringify(data)); } catch { /* storage unavailable */ }
}
