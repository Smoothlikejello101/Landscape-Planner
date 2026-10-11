import { STORAGE } from './constants';
import { state } from './state';
import { now, uid } from './util';

// ============================================================
// STORAGE
// ============================================================
export function loadProjectList() {
  try {
    const raw = localStorage.getItem(STORAGE.PROJECTS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
export function saveProjectList() {
  try {
    localStorage.setItem(STORAGE.PROJECTS, JSON.stringify(state.projects));
  } catch (e) { console.error('saveProjectList', e); }
}
export function loadProjectData(id) {
  try {
    const raw = localStorage.getItem(STORAGE.project(id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
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
    if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e)))) {
      alert('Storage full. This usually means the satellite image is too large. Try removing it from Background image, or delete unused projects.');
    }
    console.error('saveCurrentProject', e);
  }
}
export let saveTimer = null;
export function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCurrentProject, 250);
}
export function setCurrentProjectId(id) {
  state.currentProjectId = id;
  try { localStorage.setItem(STORAGE.CURRENT, id); } catch (e) {}
}
export function loadProject(id) {
  const data = loadProjectData(id);
  if (!data) {
    state.shapes = [];
    state.zoom = 1;
    state.offsetX = -10;
    state.offsetY = -10;
    state.bgImage = null;
  } else {
    state.shapes = (data.shapes || []).map(migrateShape);
    state.zoom = typeof data.zoom === 'number' ? data.zoom : 1;
    state.offsetX = typeof data.offsetX === 'number' ? data.offsetX : -10;
    state.offsetY = typeof data.offsetY === 'number' ? data.offsetY : -10;
    state.bgImage = data.bgImage ? migrateBgImage(data.bgImage) : null;
  }
  state.selectedIds = [];
  state.history = [];
  state.historyIndex = -1;
  state.bgEditMode = false;
  state.bgCalibrate = null;
  setCurrentProjectId(id);
}
export function migrateShape(s) {
  const base = Object.assign({
    opacity: 0.65,
    locked: false,
    rotation: 0,
    label: ''
  }, s);
  // Ensure type-specific fields exist with defaults
  if (base.type === 'triangle' && !base.rightAngle) base.rightAngle = 'bl';
  return base;
}
export function migrateBgImage(b) {
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
export function createProject(name, initialData) {
  const id = uid();
  const proj = { id, name: name || 'Untitled', lastModified: now() };
  state.projects.unshift(proj);
  saveProjectList();
  if (initialData) {
    try { localStorage.setItem(STORAGE.project(id), JSON.stringify(initialData)); } catch (e) {}
  } else {
    try { localStorage.setItem(STORAGE.project(id), JSON.stringify({ shapes: [], zoom: 1, offsetX: -10, offsetY: -10 })); } catch (e) {}
  }
  return id;
}
export function deleteProject(id) {
  state.projects = state.projects.filter(p => p.id !== id);
  saveProjectList();
  try { localStorage.removeItem(STORAGE.project(id)); } catch (e) {}
}
export function renameProject(id, name) {
  const proj = state.projects.find(p => p.id === id);
  if (proj) {
    proj.name = name || 'Untitled';
    proj.lastModified = now();
    saveProjectList();
  }
}
export function currentProject() {
  return state.projects.find(p => p.id === state.currentProjectId) || null;
}
export function init() {
  state.projects = loadProjectList();
  // Migrate legacy data
  let legacy = null;
  try { legacy = localStorage.getItem(STORAGE.LEGACY); } catch (e) {}
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
  let currentId = null;
  try { currentId = localStorage.getItem(STORAGE.CURRENT); } catch (e) {}
  if (!currentId || !state.projects.find(p => p.id === currentId)) {
    currentId = state.projects[0].id;
  }
  loadProject(currentId);
}
export function getClipboard() {
  try {
    const raw = localStorage.getItem(STORAGE.CLIPBOARD);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export function setClipboard(data) {
  try { localStorage.setItem(STORAGE.CLIPBOARD, JSON.stringify(data)); } catch (e) {}
}
