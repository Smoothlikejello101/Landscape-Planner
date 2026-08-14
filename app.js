(function () {
'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const PX_PER_FOOT_BASE = 24;
const SNAP = 0.5;
const ROT_SNAP = 5;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 350;
const DRAG_THRESHOLD_PX = 4;
const BG_COLOR = '#ede0c8';
const GRID_MINOR = '#dccaa2';
const GRID_MAJOR = '#c2a976';
const AXIS_LABEL = '#7c5c2a';
const MAX_HISTORY = 50;
const HISTORY_DEBOUNCE_MS = 600;
const SWATCHES = [
  '#16a34a','#65a30d','#84cc16','#14b8a6',
  '#0ea5e9','#6366f1','#a855f7','#ec4899',
  '#ef4444','#f97316','#f59e0b','#fbbf24',
  '#78350f','#57534e','#94a3b8','#ffffff'
];
const SHAPE_TYPES = ['circle', 'rect', 'oval', 'triangle'];
const STORAGE = {
  PROJECTS: 'lp-projects',
  CURRENT: 'lp-current',
  CLIPBOARD: 'lp-clipboard',
  LEGACY: 'landscape-planner-v1',
  project: (id) => 'lp-project-' + id
};

// ============================================================
// ICONS
// ============================================================
const I = {
  circle: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
  square: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
  oval: '<svg class="icon" viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="6"/></svg>',
  triangle: '<svg class="icon" viewBox="0 0 24 24"><polygon points="3,21 21,21 3,3"/></svg>',
  zoomIn: '<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  zoomOut: '<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  download: '<svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  reset: '<svg class="icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  layers: '<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  lock: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  unlock: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
  x: '<svg class="icon icon-lg" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>',
  edit: '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  paste: '<svg class="icon" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  undo: '<svg class="icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 0 0 13.91-7"/></svg>',
  redo: '<svg class="icon" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 6.58 9"/></svg>',
  more: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" class="icon-fill"/><circle cx="12" cy="12" r="1.5" class="icon-fill"/><circle cx="12" cy="19" r="1.5" class="icon-fill"/></svg>',
  hand: '<svg class="icon" viewBox="0 0 24 24"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
  lasso: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/></svg>',
  chevronDown: '<svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  rotate: '<svg class="icon" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 18 6"/></svg>',
  leaf: '<svg class="icon" viewBox="0 0 24 24"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
  folder: '<svg class="icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  arrangeFront: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="10" height="10" rx="1" fill="#d6d3d1" stroke="#d6d3d1"/><rect x="9" y="9" width="12" height="12" rx="1" fill="#fff"/></svg>',
  arrangeBack: '<svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="1" fill="#d6d3d1" stroke="#d6d3d1"/><rect x="3" y="3" width="10" height="10" rx="1" fill="#fff"/></svg>',
  arrangeForward: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="10" height="10" rx="1" fill="#d6d3d1"/><rect x="9" y="9" width="12" height="12" rx="1" fill="#fff"/><polyline points="14 6 17 3 20 6" stroke="#16a34a"/></svg>',
  arrangeBackward: '<svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="1" fill="#d6d3d1"/><rect x="3" y="3" width="10" height="10" rx="1" fill="#fff"/><polyline points="14 18 17 21 20 18" stroke="#16a34a"/></svg>',
};

// ============================================================
// UTILITIES
// ============================================================
function uid() { return Math.random().toString(36).slice(2, 10); }
function snap(v) { return Math.round(v / SNAP) * SNAP; }
function snapRot(v) { return Math.round(v / ROT_SNAP) * ROT_SNAP; }
function escapeHtml(s) {
  return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
}
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (k === 'className') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === false || v === null || v === undefined) continue;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  }
  return e;
}
function svgEl(tag, attrs, ...children) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  }
  return e;
}
function now() { return Date.now(); }
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// ============================================================
// STATE
// ============================================================
const state = {
  // Project list
  projects: [], // { id, name, lastModified }
  currentProjectId: null,
  // Current project content
  shapes: [],
  zoom: 1,
  offsetX: -10,
  offsetY: -10,
  canvasW: 800,
  canvasH: 600,
  // Selection
  selectedIds: [],
  // Modes
  selectMode: false,
  // Marquee in progress (in feet)
  marquee: null,
  // Undo history (per-project, in memory only)
  history: [],
  historyIndex: -1,
  // UI
  panel: null,
  panelArgs: null,
  exportPreview: null,
  menu: null, // { x, y, items } floating menu
};
const gesture = { current: null };
const tapTracker = { id: null, time: 0 };
let historyTimer = null;

// ============================================================
// PLANT INDEX DATA (Caddo Valley Plant Index -> plants.json)
// ============================================================
let PLANTS = [];
let PLANT_META = null;
const plantsById = {};
// Picker filter state lives outside `state` so it isn't saved with projects.
const plantFilter = {
  q: '', form: '', water: '', bloomMonth: '',
  dogSafeOnly: true, dryShade: false, wetFeet: false,
  showArchived: false // rejected rows, zone-fails, hard-no dog plants
};

fetch('plants.json')
  .then(r => r.json())
  .then(d => {
    PLANTS = d.plants || [];
    PLANT_META = d.meta || null;
    for (const p of PLANTS) plantsById[p.id] = p;
    if (state.panel === 'plants') render(); // refresh picker if already open
  })
  .catch(err => console.error('plants.json load failed', err));

// ============================================================
// STORAGE
// ============================================================
function loadProjectList() {
  try {
    const raw = localStorage.getItem(STORAGE.PROJECTS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveProjectList() {
  try {
    localStorage.setItem(STORAGE.PROJECTS, JSON.stringify(state.projects));
  } catch (e) { console.error('saveProjectList', e); }
}
function loadProjectData(id) {
  try {
    const raw = localStorage.getItem(STORAGE.project(id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function saveCurrentProject() {
  if (!state.currentProjectId) return;
  try {
    localStorage.setItem(STORAGE.project(state.currentProjectId), JSON.stringify({
      shapes: state.shapes,
      zoom: state.zoom,
      offsetX: state.offsetX,
      offsetY: state.offsetY
    }));
    const proj = state.projects.find(p => p.id === state.currentProjectId);
    if (proj) {
      proj.lastModified = now();
      saveProjectList();
    }
  } catch (e) { console.error('saveCurrentProject', e); }
}
let saveTimer = null;
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCurrentProject, 250);
}
function setCurrentProjectId(id) {
  state.currentProjectId = id;
  try { localStorage.setItem(STORAGE.CURRENT, id); } catch (e) {}
}
function loadProject(id) {
  const data = loadProjectData(id);
  if (!data) {
    state.shapes = [];
    state.zoom = 1;
    state.offsetX = -10;
    state.offsetY = -10;
  } else {
    state.shapes = (data.shapes || []).map(migrateShape);
    state.zoom = typeof data.zoom === 'number' ? data.zoom : 1;
    state.offsetX = typeof data.offsetX === 'number' ? data.offsetX : -10;
    state.offsetY = typeof data.offsetY === 'number' ? data.offsetY : -10;
  }
  state.selectedIds = [];
  state.history = [];
  state.historyIndex = -1;
  setCurrentProjectId(id);
}
function migrateShape(s) {
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
function createProject(name, initialData) {
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
function deleteProject(id) {
  state.projects = state.projects.filter(p => p.id !== id);
  saveProjectList();
  try { localStorage.removeItem(STORAGE.project(id)); } catch (e) {}
}
function renameProject(id, name) {
  const proj = state.projects.find(p => p.id === id);
  if (proj) {
    proj.name = name || 'Untitled';
    proj.lastModified = now();
    saveProjectList();
  }
}
function currentProject() {
  return state.projects.find(p => p.id === state.currentProjectId) || null;
}
function init() {
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
function getClipboard() {
  try {
    const raw = localStorage.getItem(STORAGE.CLIPBOARD);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function setClipboard(data) {
  try { localStorage.setItem(STORAGE.CLIPBOARD, JSON.stringify(data)); } catch (e) {}
}

// ============================================================
// HISTORY (undo/redo)
// ============================================================
function pushHistory() {
  // Truncate any redo branch
  state.history = state.history.slice(0, state.historyIndex + 1);
  // Push deep snapshot of shapes
  state.history.push(deepClone(state.shapes));
  // Cap
  if (state.history.length > MAX_HISTORY) {
    state.history.shift();
  } else {
    state.historyIndex++;
  }
}
function pushHistoryDebounced() {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => { pushHistory(); historyTimer = null; }, HISTORY_DEBOUNCE_MS);
}
function flushHistoryDebounce() {
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = null;
    pushHistory();
  }
}
function undo() {
  flushHistoryDebounce();
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  state.shapes = deepClone(state.history[state.historyIndex]);
  // Clean selection (any ids that no longer exist)
  state.selectedIds = state.selectedIds.filter(id => state.shapes.find(s => s.id === id));
  save();
}
function redo() {
  flushHistoryDebounce();
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  state.shapes = deepClone(state.history[state.historyIndex]);
  state.selectedIds = state.selectedIds.filter(id => state.shapes.find(s => s.id === id));
  save();
}
function canUndo() { return state.historyIndex > 0; }
function canRedo() { return state.historyIndex < state.history.length - 1; }

// ============================================================
// GEOMETRY HELPERS
// ============================================================
function pxPerFoot() { return PX_PER_FOOT_BASE * state.zoom; }
function screenToFeet(clientX, clientY) {
  const rect = document.getElementById('canvas-svg').getBoundingClientRect();
  return {
    x: (clientX - rect.left) / pxPerFoot() + state.offsetX,
    y: (clientY - rect.top) / pxPerFoot() + state.offsetY
  };
}
function viewCenterFeet() {
  return {
    x: state.offsetX + state.canvasW / pxPerFoot() / 2,
    y: state.offsetY + state.canvasH / pxPerFoot() / 2
  };
}
function shapeCenter(s) {
  if (s.type === 'circle') return { x: s.x, y: s.y };
  return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
}
function shapeBBox(s) {
  // Axis-aligned bounding box in feet, accounting for rotation
  if (s.type === 'circle') {
    return { minX: s.x - s.radius, maxX: s.x + s.radius, minY: s.y - s.radius, maxY: s.y + s.radius };
  }
  const w = s.width, h = s.height;
  if (!s.rotation) {
    return { minX: s.x, maxX: s.x + w, minY: s.y, maxY: s.y + h };
  }
  const cx = s.x + w / 2, cy = s.y + h / 2;
  const rad = s.rotation * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const hw = w / 2, hh = h / 2;
  const corners = [
    { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of corners) {
    const rx = c.x * cos - c.y * sin;
    const ry = c.x * sin + c.y * cos;
    minX = Math.min(minX, cx + rx);
    maxX = Math.max(maxX, cx + rx);
    minY = Math.min(minY, cy + ry);
    maxY = Math.max(maxY, cy + ry);
  }
  return { minX, maxX, minY, maxY };
}
function rectsIntersect(a, b) {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}
// Triangle vertex generator for rendering and export
function trianglePoints(s) {
  const x = s.x, y = s.y, w = s.width, h = s.height;
  switch (s.rightAngle) {
    case 'br': return [[x + w, y + h], [x, y + h], [x + w, y]];
    case 'tl': return [[x, y], [x + w, y], [x, y + h]];
    case 'tr': return [[x + w, y], [x, y], [x + w, y + h]];
    case 'bl':
    default:   return [[x, y + h], [x + w, y + h], [x, y]];
  }
}

// ============================================================
// SELECTION HELPERS
// ============================================================
function isSelected(id) { return state.selectedIds.includes(id); }
function selectOnly(id) {
  if (id === null) state.selectedIds = [];
  else state.selectedIds = [id];
}
function toggleSelect(id) {
  const i = state.selectedIds.indexOf(id);
  if (i === -1) state.selectedIds.push(id);
  else state.selectedIds.splice(i, 1);
}
function clearSelection() { state.selectedIds = []; }
function getSelected() {
  return state.selectedIds.map(id => state.shapes.find(s => s.id === id)).filter(Boolean);
}
function singleSelected() {
  const sel = getSelected();
  return sel.length === 1 ? sel[0] : null;
}

// ============================================================
// MUTATIONS
// ============================================================
function addShape(type) {
  flushHistoryDebounce();
  const c = viewCenterFeet();
  const id = uid();
  let shape;
  if (type === 'circle') {
    shape = { id, type, x: snap(c.x), y: snap(c.y), radius: 2, color: '#16a34a', label: '', opacity: 0.65, locked: false };
  } else if (type === 'rect') {
    shape = { id, type, x: snap(c.x - 2), y: snap(c.y - 1.5), width: 4, height: 3, color: '#78350f', label: '', opacity: 0.65, locked: false, rotation: 0 };
  } else if (type === 'oval') {
    shape = { id, type, x: snap(c.x - 2.5), y: snap(c.y - 1.5), width: 5, height: 3, color: '#0891b2', label: '', opacity: 0.65, locked: false, rotation: 0 };
  } else if (type === 'triangle') {
    shape = { id, type, x: snap(c.x - 2), y: snap(c.y - 1.5), width: 4, height: 3, color: '#7c3aed', label: '', opacity: 0.65, locked: false, rotation: 0, rightAngle: 'bl' };
  } else { return; }
  state.shapes.push(shape);
  state.selectedIds = [id];
  state.panel = 'props';
  pushHistory();
  save();
}
function updateSelected(patch) {
  const s = singleSelected();
  if (!s) return;
  Object.assign(s, patch);
  save();
  pushHistoryDebounced();
  // Re-render so panel UI (selected swatch, lock state, triangle corner,
  // arrange-button enabled state, etc.) reflects the new value.
  render();
}
// Silent: update the shape AND redraw the canvas, but do not rebuild any panel
// DOM (so input focus / keyboard stays put on Android).
function updateSelectedSilent(patch) {
  const s = singleSelected();
  if (!s) return;
  Object.assign(s, patch);
  save();
  pushHistoryDebounced();
  const svg = document.getElementById('canvas-svg');
  if (svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    renderGrid(svg);
    renderShapes(svg);
  }
}
function deleteShapesByIds(ids) {
  flushHistoryDebounce();
  if (!ids.length) return;
  state.shapes = state.shapes.filter(s => !ids.includes(s.id));
  state.selectedIds = state.selectedIds.filter(id => !ids.includes(id));
  pushHistory();
  save();
}
function deleteSelected() {
  deleteShapesByIds(state.selectedIds.slice());
  state.panel = null;
}
function duplicateShapesByIds(ids, offset) {
  flushHistoryDebounce();
  if (!ids.length) return [];
  const off = offset || { x: 1, y: 1 };
  const newIds = [];
  for (const id of ids) {
    const s = state.shapes.find(sh => sh.id === id);
    if (!s) continue;
    const copy = Object.assign(deepClone(s), {
      id: uid(),
      x: snap(s.x + off.x),
      y: snap(s.y + off.y),
      locked: false
    });
    state.shapes.push(copy);
    newIds.push(copy.id);
  }
  state.selectedIds = newIds;
  pushHistory();
  save();
  return newIds;
}
function duplicateSelected() {
  duplicateShapesByIds(state.selectedIds.slice());
}
function copySelected() {
  const sel = getSelected();
  if (!sel.length) return false;
  // Strip IDs (paste regenerates them) and locked flag
  const data = {
    shapes: sel.map(s => {
      const copy = deepClone(s);
      delete copy.id;
      return copy;
    }),
    sourceProjectId: state.currentProjectId,
    timestamp: now()
  };
  setClipboard(data);
  return true;
}
function paste() {
  const data = getClipboard();
  if (!data || !data.shapes || !data.shapes.length) return false;
  flushHistoryDebounce();
  // Compute bbox of clipboard shapes
  const tempShapes = data.shapes.map(s => Object.assign({ id: '_tmp' }, s));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of tempShapes) {
    const b = shapeBBox(s);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  const bboxCx = (minX + maxX) / 2;
  const bboxCy = (minY + maxY) / 2;
  const target = viewCenterFeet();
  const sameProject = data.sourceProjectId === state.currentProjectId;
  // Translate: cross-project → center on view. Same project → small offset so paste is visible.
  let dx, dy;
  if (sameProject) { dx = 1; dy = 1; }
  else { dx = snap(target.x - bboxCx); dy = snap(target.y - bboxCy); }
  const newIds = [];
  for (const s of data.shapes) {
    const copy = Object.assign(deepClone(s), {
      id: uid(),
      x: snap(s.x + dx),
      y: snap(s.y + dy),
      locked: false
    });
    state.shapes.push(copy);
    newIds.push(copy.id);
  }
  state.selectedIds = newIds;
  pushHistory();
  save();
  return true;
}
function setLockedForIds(ids, locked) {
  flushHistoryDebounce();
  for (const id of ids) {
    const s = state.shapes.find(sh => sh.id === id);
    if (s) s.locked = locked;
  }
  pushHistory();
  save();
}
function findNextSameTier(arr, fromIndex, direction) {
  const tier = arr[fromIndex].locked;
  for (let i = fromIndex + direction; i >= 0 && i < arr.length; i += direction) {
    if (arr[i].locked === tier) return i;
  }
  return -1;
}
function bringForward(id) {
  const i = state.shapes.findIndex(s => s.id === id);
  if (i === -1) return;
  const j = findNextSameTier(state.shapes, i, 1);
  if (j === -1) return;
  const tmp = state.shapes[i]; state.shapes[i] = state.shapes[j]; state.shapes[j] = tmp;
  pushHistory();
  save();
}
function sendBackward(id) {
  const i = state.shapes.findIndex(s => s.id === id);
  if (i === -1) return;
  const j = findNextSameTier(state.shapes, i, -1);
  if (j === -1) return;
  const tmp = state.shapes[i]; state.shapes[i] = state.shapes[j]; state.shapes[j] = tmp;
  pushHistory();
  save();
}
function bringToFront(id) {
  const i = state.shapes.findIndex(s => s.id === id);
  if (i === -1) return;
  const shape = state.shapes[i];
  state.shapes.splice(i, 1);
  let lastSameTier = -1;
  for (let k = 0; k < state.shapes.length; k++) {
    if (state.shapes[k].locked === shape.locked) lastSameTier = k;
  }
  state.shapes.splice(lastSameTier + 1, 0, shape);
  pushHistory();
  save();
}
function sendToBack(id) {
  const i = state.shapes.findIndex(s => s.id === id);
  if (i === -1) return;
  const shape = state.shapes[i];
  state.shapes.splice(i, 1);
  let firstSameTier = state.shapes.length;
  for (let k = 0; k < state.shapes.length; k++) {
    if (state.shapes[k].locked === shape.locked) { firstSameTier = k; break; }
  }
  state.shapes.splice(firstSameTier, 0, shape);
  pushHistory();
  save();
}
function centerOnShape(id) {
  const s = state.shapes.find(s => s.id === id);
  if (!s) return;
  const c = shapeCenter(s);
  state.offsetX = c.x - state.canvasW / pxPerFoot() / 2;
  state.offsetY = c.y - state.canvasH / pxPerFoot() / 2;
  save();
}
function zoomBy(factor, anchorScreenX, anchorScreenY) {
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.zoom * factor));
  if (newZoom === state.zoom) return;
  const rect = document.getElementById('canvas-svg').getBoundingClientRect();
  // Use the live rect, not state.canvasW/H (which can lag behind layout)
  const ax = anchorScreenX !== undefined ? anchorScreenX - rect.left : rect.width / 2;
  const ay = anchorScreenY !== undefined ? anchorScreenY - rect.top : rect.height / 2;
  const feetAtAnchor = { x: state.offsetX + ax / pxPerFoot(), y: state.offsetY + ay / pxPerFoot() };
  const newPxPerFoot = PX_PER_FOOT_BASE * newZoom;
  state.offsetX = feetAtAnchor.x - ax / newPxPerFoot;
  state.offsetY = feetAtAnchor.y - ay / newPxPerFoot;
  state.zoom = newZoom;
  save();
}
function resetCurrentProject() {
  flushHistoryDebounce();
  state.shapes = [];
  state.selectedIds = [];
  state.zoom = 1;
  state.offsetX = -10;
  state.offsetY = -10;
  state.panel = null;
  pushHistory();
  save();
}

// ============================================================
// GESTURES
// ============================================================
// Track every active pointer (finger / mouse) by pointerId. Required for
// pinch — pointer events don't have an e.touches list like touch events do;
// each finger fires its own pointerdown/move/up with a unique pointerId, so
// we have to assemble multi-touch state ourselves.
const activePointers = new Map();

function getPinchInfo() {
  if (activePointers.size !== 2) return null;
  const pts = Array.from(activePointers.values());
  return {
    cx: (pts[0].clientX + pts[1].clientX) / 2,
    cy: (pts[0].clientY + pts[1].clientY) / 2,
    dist: Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY)
  };
}
function startPinchGesture() {
  const info = getPinchInfo();
  if (!info) return;
  // Clear any in-flight single-finger gesture (pan/marquee/drag-shape) so
  // it doesn't keep applying a delta as the second finger arrives.
  gesture.current = {
    type: 'pinch',
    startDist: info.dist,
    startZoom: state.zoom,
    centerScreen: { x: info.cx, y: info.cy },
    centerFeetAtStart: screenToFeet(info.cx, info.cy)
  };
  state.marquee = null;
}

function onCanvasPointerDown(e) {
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

  // Second finger lands → pinch, regardless of where the first one is
  if (activePointers.size === 2) {
    startPinchGesture();
    return;
  }
  // Ignore 3+ pointers (palm rejection)
  if (activePointers.size > 2) return;

  // Only the SVG root and the grid backdrop start canvas gestures.
  // (Shape taps go through onShapePointerDown, buttons handle their own events.)
  if (e.target.id !== 'canvas-svg' && e.target.dataset.role !== 'grid') return;

  const clientX = e.clientX, clientY = e.clientY;
  if (state.selectMode) {
    const feet = screenToFeet(clientX, clientY);
    gesture.current = {
      type: 'marquee',
      startX: clientX, startY: clientY,
      startFeet: feet,
      currentFeet: feet,
      moved: false
    };
    state.marquee = { x1: feet.x, y1: feet.y, x2: feet.x, y2: feet.y };
  } else {
    gesture.current = {
      type: 'pan',
      startX: clientX, startY: clientY,
      startOffset: { x: state.offsetX, y: state.offsetY },
      moved: false
    };
  }
}

function onCanvasPointerMove(e) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  }
  const g = gesture.current;
  if (!g) return;

  if (g.type === 'pinch') {
    const info = getPinchInfo();
    if (!info) return; // one finger lifted; we'll deal with that on pointerup
    const ratio = info.dist / g.startDist;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, g.startZoom * ratio));
    const newPxPerFoot = PX_PER_FOOT_BASE * newZoom;
    const rect = document.getElementById('canvas-svg').getBoundingClientRect();
    state.offsetX = g.centerFeetAtStart.x - (g.centerScreen.x - rect.left) / newPxPerFoot;
    state.offsetY = g.centerFeetAtStart.y - (g.centerScreen.y - rect.top) / newPxPerFoot;
    state.zoom = newZoom;
    e.preventDefault();
    render();
    return;
  }

  const clientX = e.clientX, clientY = e.clientY;
  if (g.type === 'pan') {
    const dxPx = clientX - g.startX;
    const dyPx = clientY - g.startY;
    if (Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD_PX) g.moved = true;
    state.offsetX = g.startOffset.x - dxPx / pxPerFoot();
    state.offsetY = g.startOffset.y - dyPx / pxPerFoot();
    render();
  } else if (g.type === 'marquee') {
    const dxPx = clientX - g.startX;
    const dyPx = clientY - g.startY;
    if (Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD_PX) g.moved = true;
    const feet = screenToFeet(clientX, clientY);
    g.currentFeet = feet;
    state.marquee = {
      x1: g.startFeet.x, y1: g.startFeet.y,
      x2: feet.x, y2: feet.y
    };
    render();
    e.preventDefault();
  } else if (g.type === 'drag-shape') {
    const dxPx = clientX - g.startX;
    const dyPx = clientY - g.startY;
    if (Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD_PX) g.moved = true;
    if (g.moved) {
      const cur = screenToFeet(clientX, clientY);
      const dxFt = snap(cur.x - g.grabOffset.x) - g.primaryStart.x;
      const dyFt = snap(cur.y - g.grabOffset.y) - g.primaryStart.y;
      for (const item of g.shapeStarts) {
        const shape = state.shapes.find(s => s.id === item.id);
        if (!shape || shape.locked) continue;
        shape.x = snap(item.startX + dxFt);
        shape.y = snap(item.startY + dyFt);
      }
      render();
    }
    e.preventDefault();
  }
}

function handleShapeTap(shape) {
  if (state.selectMode) {
    toggleSelect(shape.id);
    return;
  }
  // Pan mode: single-select on tap, double-tap opens props
  const now_ = now();
  if (tapTracker.id === shape.id && now_ - tapTracker.time < DOUBLE_TAP_MS) {
    selectOnly(shape.id);
    state.panel = 'props';
    tapTracker.id = null; tapTracker.time = 0;
  } else {
    selectOnly(shape.id);
    tapTracker.id = shape.id; tapTracker.time = now_;
  }
}

function onCanvasPointerUp(e) {
  if (e && e.pointerId !== undefined) {
    activePointers.delete(e.pointerId);
  }
  const g = gesture.current;
  if (!g) return;

  if (g.type === 'pinch') {
    // Pinch is only "live" while two fingers are down. When one lifts, end
    // pinch. If a finger remains, smoothly transition into a pan from that
    // finger's position (otherwise the still-down finger would do nothing
    // until lifted-and-re-tapped, which feels broken).
    if (activePointers.size < 2) {
      gesture.current = null;
      if (activePointers.size === 1) {
        const p = Array.from(activePointers.values())[0];
        gesture.current = {
          type: 'pan',
          startX: p.clientX, startY: p.clientY,
          startOffset: { x: state.offsetX, y: state.offsetY },
          moved: true  // skip "tap on empty" path on release
        };
      } else {
        save();
      }
    }
    return;
  }

  gesture.current = null;

  if (g.type === 'drag-shape') {
    if (g.moved) {
      flushHistoryDebounce();
      pushHistory();
      save();
    } else {
      const shape = state.shapes.find(s => s.id === g.id);
      if (shape) handleShapeTap(shape);
    }
    render();
  } else if (g.type === 'pan') {
    if (g.moved) save();
    else {
      clearSelection();
      state.panel = null;
      tapTracker.id = null; tapTracker.time = 0;
    }
    render();
  } else if (g.type === 'marquee') {
    if (g.moved && state.marquee) {
      const m = state.marquee;
      const rect = {
        minX: Math.min(m.x1, m.x2), maxX: Math.max(m.x1, m.x2),
        minY: Math.min(m.y1, m.y2), maxY: Math.max(m.y1, m.y2)
      };
      const hits = [];
      for (const s of state.shapes) {
        const b = shapeBBox(s);
        if (rectsIntersect(b, rect)) hits.push(s.id);
      }
      state.selectedIds = hits;
    } else {
      clearSelection();
    }
    state.marquee = null;
    render();
  }
}

function onShapePointerDown(e, shape) {
  e.stopPropagation();
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

  // If this is the second finger landing (first one might be elsewhere on
  // the canvas, or even on another shape), switch to pinch.
  if (activePointers.size === 2) {
    startPinchGesture();
    return;
  }
  if (activePointers.size > 2) return;

  const clientX = e.clientX, clientY = e.clientY;
  const cur = screenToFeet(clientX, clientY);

  let dragIds;
  if (isSelected(shape.id) && state.selectedIds.length > 1) {
    dragIds = state.selectedIds.slice();
  } else {
    dragIds = [shape.id];
  }
  const shapeStarts = dragIds.map(id => {
    const s = state.shapes.find(sh => sh.id === id);
    return s ? { id, startX: s.x, startY: s.y } : null;
  }).filter(Boolean);

  gesture.current = {
    type: 'drag-shape',
    id: shape.id,
    ids: dragIds,
    grabOffset: { x: cur.x - shape.x, y: cur.y - shape.y },
    primaryStart: { x: shape.x, y: shape.y },
    shapeStarts,
    startX: clientX, startY: clientY,
    moved: false
  };
}

function onWheel(e) {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0015);
  zoomBy(factor, e.clientX, e.clientY);
  render();
}

// ============================================================
// EXPORT
// ============================================================
function computeAllBBox() {
  if (state.shapes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of state.shapes) {
    const b = shapeBBox(s);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  return { minX, minY, maxX, maxY };
}
function shapeToSvgString(s, originX, originY, scale) {
  const opacity = s.opacity !== undefined ? s.opacity : 0.65;
  const dash = s.locked ? ' stroke-dasharray="4 2"' : '';
  const stroke = 'rgba(0,0,0,0.3)';
  const strokeWidth = 1;
  if (s.type === 'circle') {
    const cx = (s.x - originX) * scale, cy = (s.y - originY) * scale, r = s.radius * scale;
    let out = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>`;
    if (s.label) {
      const fs = Math.max(10, Math.min(14, r * 0.4));
      out += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="#0f172a" font-family="sans-serif">${escapeHtml(s.label)}</text>`;
    }
    return out;
  }
  const px = (s.x - originX) * scale, py = (s.y - originY) * scale;
  const w = s.width * scale, h = s.height * scale;
  const cx = px + w / 2, cy = py + h / 2;
  const rotAttr = s.rotation ? ` transform="rotate(${s.rotation} ${cx} ${cy})"` : '';
  let shapeStr = '';
  if (s.type === 'rect') {
    shapeStr = `<rect x="${px}" y="${py}" width="${w}" height="${h}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}${rotAttr}/>`;
  } else if (s.type === 'oval') {
    shapeStr = `<ellipse cx="${cx}" cy="${cy}" rx="${w/2}" ry="${h/2}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}${rotAttr}/>`;
  } else if (s.type === 'triangle') {
    const pts = trianglePoints(s).map(p => `${(p[0] - originX) * scale},${(p[1] - originY) * scale}`).join(' ');
    shapeStr = `<polygon points="${pts}" fill="${s.color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}${rotAttr}/>`;
  }
  let out = shapeStr;
  if (s.label) {
    const fs = Math.max(10, Math.min(14, Math.min(w, h) * 0.2));
    const labelRot = s.rotation ? ` transform="rotate(${s.rotation} ${cx} ${cy})"` : '';
    out += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="#0f172a" font-family="sans-serif"${labelRot}>${escapeHtml(s.label)}</text>`;
  }
  return out;
}
function buildExportSVG() {
  const bbox = computeAllBBox();
  if (!bbox) return null;
  const pad = 2;
  const minX = Math.floor(bbox.minX - pad);
  const minY = Math.floor(bbox.minY - pad);
  const maxX = Math.ceil(bbox.maxX + pad);
  const maxY = Math.ceil(bbox.maxY + pad);
  const scale = PX_PER_FOOT_BASE;
  const widthFt = maxX - minX;
  const heightFt = maxY - minY;
  const widthPx = widthFt * scale;
  const heightPx = heightFt * scale;
  let grid = '';
  for (let fx = minX; fx <= maxX; fx++) {
    const px = (fx - minX) * scale;
    const isMajor = fx % 10 === 0;
    grid += `<line x1="${px}" y1="0" x2="${px}" y2="${heightPx}" stroke="${isMajor?GRID_MAJOR:GRID_MINOR}" stroke-width="${isMajor?1:0.5}"/>`;
  }
  for (let fy = minY; fy <= maxY; fy++) {
    const py = (fy - minY) * scale;
    const isMajor = fy % 10 === 0;
    grid += `<line x1="0" y1="${py}" x2="${widthPx}" y2="${py}" stroke="${isMajor?GRID_MAJOR:GRID_MINOR}" stroke-width="${isMajor?1:0.5}"/>`;
  }
  let labels = '';
  for (let fx = minX; fx <= maxX; fx++) {
    if (fx % 10 !== 0) continue;
    const px = (fx - minX) * scale;
    labels += `<text x="${px+3}" y="12" font-size="10" fill="${AXIS_LABEL}" font-family="sans-serif">${fx}ft</text>`;
  }
  for (let fy = minY; fy <= maxY; fy++) {
    if (fy % 10 !== 0) continue;
    const py = (fy - minY) * scale;
    labels += `<text x="3" y="${py+12}" font-size="10" fill="${AXIS_LABEL}" font-family="sans-serif">${fy}ft</text>`;
  }
  const sorted = [...state.shapes].sort((a, b) => (a.locked ? 0 : 1) - (b.locked ? 0 : 1));
  let shapesSvg = '';
  for (const s of sorted) shapesSvg += shapeToSvgString(s, minX, minY, scale);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
<rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="${BG_COLOR}"/>
${grid}${labels}${shapesSvg}
</svg>`;
  return { svg, widthPx, heightPx };
}
async function svgToPngDataUrl(svgString, widthPx, heightPx, scale) {
  return new Promise((resolve, reject) => {
    let svgDataUrl;
    try {
      const utf8 = unescape(encodeURIComponent(svgString));
      svgDataUrl = 'data:image/svg+xml;base64,' + btoa(utf8);
    } catch (e) { reject(new Error('SVG encode failed: ' + e.message)); return; }
    const img = new Image();
    const timeout = setTimeout(() => reject(new Error('SVG load timeout')), 10000);
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(widthPx * scale));
        canvas.height = Math.max(1, Math.round(heightPx * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) { reject(new Error('Canvas render failed: ' + e.message)); }
    };
    img.onerror = () => { clearTimeout(timeout); reject(new Error('Image load blocked')); };
    img.src = svgDataUrl;
  });
}
async function doExport(format) {
  const result = buildExportSVG();
  if (!result) return;
  const { svg, widthPx, heightPx } = result;
  const proj = currentProject();
  const safeName = (proj && proj.name ? proj.name : 'landscape').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    let dataUrl;
    if (format === 'svg') {
      dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } else {
      dataUrl = await svgToPngDataUrl(svg, widthPx, heightPx, 2);
    }
    state.exportPreview = { format, dataUrl, svgText: svg, filename: `${safeName}-${stamp}.${format}` };
    state.panel = 'preview';
    render();
  } catch (e) {
    alert('Export failed: ' + e.message);
  }
}
async function copySvg() {
  if (!state.exportPreview || !state.exportPreview.svgText) return;
  try {
    await navigator.clipboard.writeText(state.exportPreview.svgText);
    alert('SVG copied to clipboard');
  } catch (e) {
    alert('Copy failed — use the "show SVG text" box below to select and copy manually');
  }
}

// ============================================================
// CANVAS RENDERING
// ============================================================
function renderGrid(svg) {
  const w = state.canvasW, h = state.canvasH;
  const ppf = pxPerFoot();
  const startFx = Math.floor(state.offsetX);
  const endFx = Math.ceil(state.offsetX + w / ppf);
  const startFy = Math.floor(state.offsetY);
  const endFy = Math.ceil(state.offsetY + h / ppf);
  const minorEvery = ppf < 10 ? 5 : 1;
  const majorEvery = 10;
  svg.appendChild(svgEl('rect', { 'data-role': 'grid', x: 0, y: 0, width: w, height: h, fill: BG_COLOR }));
  for (let fx = startFx; fx <= endFx; fx++) {
    if (fx % minorEvery !== 0 && fx % majorEvery !== 0) continue;
    const px = (fx - state.offsetX) * ppf;
    const isMajor = fx % majorEvery === 0;
    svg.appendChild(svgEl('line', { x1: px, y1: 0, x2: px, y2: h, stroke: isMajor ? GRID_MAJOR : GRID_MINOR, 'stroke-width': isMajor ? 1 : 0.5 }));
  }
  for (let fy = startFy; fy <= endFy; fy++) {
    if (fy % minorEvery !== 0 && fy % majorEvery !== 0) continue;
    const py = (fy - state.offsetY) * ppf;
    const isMajor = fy % majorEvery === 0;
    svg.appendChild(svgEl('line', { x1: 0, y1: py, x2: w, y2: py, stroke: isMajor ? GRID_MAJOR : GRID_MINOR, 'stroke-width': isMajor ? 1 : 0.5 }));
  }
  if (ppf >= 6) {
    for (let fx = startFx; fx <= endFx; fx++) {
      if (fx % majorEvery !== 0) continue;
      const px = (fx - state.offsetX) * ppf;
      svg.appendChild(svgEl('text', { x: px + 2, y: 10, 'font-size': 10, fill: AXIS_LABEL, 'pointer-events': 'none' }, fx + "'"));
    }
    for (let fy = startFy; fy <= endFy; fy++) {
      if (fy % majorEvery !== 0) continue;
      const py = (fy - state.offsetY) * ppf;
      svg.appendChild(svgEl('text', { x: 2, y: py + 10, 'font-size': 10, fill: AXIS_LABEL, 'pointer-events': 'none' }, fy + "'"));
    }
  }
}

function renderOneShape(svg, s) {
  const ppf = pxPerFoot();
  const sel = isSelected(s.id);
  const stroke = sel ? '#0f172a' : 'rgba(0,0,0,0.3)';
  const strokeWidth = sel ? 2 : 1;
  const opacity = s.opacity !== undefined ? s.opacity : 0.65;
  const cursor = s.locked ? 'pointer' : 'move';
  const dashAttrs = s.locked ? { 'stroke-dasharray': '4 2' } : {};
  let shapeEl, labelX, labelY, fs, rotTransform = '';

  if (s.type === 'circle') {
    const cx = (s.x - state.offsetX) * ppf;
    const cy = (s.y - state.offsetY) * ppf;
    const r = s.radius * ppf;
    shapeEl = svgEl('circle', Object.assign({
      cx, cy, r, fill: s.color, 'fill-opacity': opacity,
      stroke, 'stroke-width': strokeWidth,
      style: `cursor:${cursor};touch-action:none;`
    }, dashAttrs));
    labelX = cx; labelY = cy;
    fs = Math.max(10, Math.min(14, r * 0.4));
  } else {
    const px = (s.x - state.offsetX) * ppf;
    const py = (s.y - state.offsetY) * ppf;
    const w = s.width * ppf, h = s.height * ppf;
    const cx = px + w / 2, cy = py + h / 2;
    rotTransform = s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : '';
    const common = Object.assign({
      fill: s.color, 'fill-opacity': opacity,
      stroke, 'stroke-width': strokeWidth,
      style: `cursor:${cursor};touch-action:none;`
    }, dashAttrs);
    if (rotTransform) common.transform = rotTransform;
    if (s.type === 'rect') {
      shapeEl = svgEl('rect', Object.assign({ x: px, y: py, width: w, height: h }, common));
    } else if (s.type === 'oval') {
      shapeEl = svgEl('ellipse', Object.assign({ cx, cy, rx: w / 2, ry: h / 2 }, common));
    } else if (s.type === 'triangle') {
      const pts = trianglePoints(s).map(p => `${(p[0] - state.offsetX) * ppf},${(p[1] - state.offsetY) * ppf}`).join(' ');
      shapeEl = svgEl('polygon', Object.assign({ points: pts }, common));
    }
    labelX = cx; labelY = cy;
    fs = Math.max(10, Math.min(14, Math.min(w, h) * 0.2));
  }
  if (shapeEl) {
    shapeEl.addEventListener('pointerdown', (e) => onShapePointerDown(e, s));
    svg.appendChild(shapeEl);
  }
  if (s.label) {
    const textAttrs = {
      x: labelX, y: labelY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': fs, fill: '#0f172a', 'pointer-events': 'none',
      style: 'user-select:none;font-weight:500;'
    };
    if (rotTransform) textAttrs.transform = rotTransform;
    svg.appendChild(svgEl('text', textAttrs, s.label));
  }
}

function renderShapes(svg) {
  const sorted = [...state.shapes].sort((a, b) => (a.locked ? 0 : 1) - (b.locked ? 0 : 1));
  for (const s of sorted) renderOneShape(svg, s);
  // Marquee overlay
  if (state.marquee) {
    const m = state.marquee;
    const ppf = pxPerFoot();
    const x = Math.min(m.x1, m.x2);
    const y = Math.min(m.y1, m.y2);
    const w = Math.abs(m.x2 - m.x1);
    const h = Math.abs(m.y2 - m.y1);
    svg.appendChild(svgEl('rect', {
      x: (x - state.offsetX) * ppf,
      y: (y - state.offsetY) * ppf,
      width: w * ppf, height: h * ppf,
      fill: 'rgba(5,150,105,0.1)', stroke: '#059669', 'stroke-width': 1.5,
      'stroke-dasharray': '5 3', 'pointer-events': 'none'
    }));
  }
}

// ============================================================
// PANELS
// ============================================================

function renderPropsPanelSingle(s) {
  const body = el('div', { className: 'sheet-body' });
  if (s.locked) {
    body.appendChild(el('div', { className: 'banner' },
      "This shape is locked. It stays in the background and can't be dragged. Tap Unlock above to edit freely."));
  }
  // Label
  const labelInput = el('input', { type: 'text', value: s.label || '', placeholder: 'e.g. Dwarf Alberta Spruce' });
  labelInput.addEventListener('input', e => updateSelectedSilent({ label: e.target.value }));
  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Label'), labelInput));

  // Dimensions
  if (s.type === 'circle') {
    const radInput = el('input', { type: 'number', step: '0.5', min: '0.1', value: s.radius });
    const diameterHint = el('div', { className: 'hint' }, 'Diameter: ' + (s.radius * 2).toFixed(1) + ' ft');
    radInput.addEventListener('input', e => {
      const newR = Math.max(0.1, parseFloat(e.target.value) || 0);
      updateSelectedSilent({ radius: newR });
      diameterHint.textContent = 'Diameter: ' + (newR * 2).toFixed(1) + ' ft';
    });
    body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Radius (ft)'), radInput, diameterHint));
  } else {
    const wInput = el('input', { type: 'number', step: '0.5', min: '0.1', value: s.width });
    wInput.addEventListener('input', e => updateSelectedSilent({ width: Math.max(0.1, parseFloat(e.target.value) || 0) }));
    const hInput = el('input', { type: 'number', step: '0.5', min: '0.1', value: s.height });
    hInput.addEventListener('input', e => updateSelectedSilent({ height: Math.max(0.1, parseFloat(e.target.value) || 0) }));
    body.appendChild(el('div', { className: 'row-2' },
      el('div', { className: 'field' }, el('label', {}, 'Width (ft)'), wInput),
      el('div', { className: 'field' }, el('label', {}, 'Height (ft)'), hInput)
    ));
  }

  // Position
  const xInput = el('input', { type: 'number', step: '0.5', value: s.x });
  xInput.addEventListener('input', e => updateSelectedSilent({ x: parseFloat(e.target.value) || 0 }));
  const yInput = el('input', { type: 'number', step: '0.5', value: s.y });
  yInput.addEventListener('input', e => updateSelectedSilent({ y: parseFloat(e.target.value) || 0 }));
  body.appendChild(el('div', { className: 'row-2' },
    el('div', { className: 'field' }, el('label', {}, 'X position (ft)'), xInput),
    el('div', { className: 'field' }, el('label', {}, 'Y position (ft)'), yInput)
  ));

  // Rotation (rect, oval, triangle)
  if (s.type !== 'circle') {
    const rotVal = s.rotation || 0;
    const rotInput = el('input', { type: 'number', step: '5', value: rotVal });
    const rotPct = el('span', { style: { fontSize: '12px', color: '#78716c' } }, rotVal + '°');
    rotInput.addEventListener('input', e => {
      const v = parseFloat(e.target.value) || 0;
      updateSelectedSilent({ rotation: v });
      rotPct.textContent = v + '°';
    });
    const quickBtns = el('div', { className: 'rot-quick' });
    [-90, -15, 15, 90].forEach(delta => {
      const b = el('button', {}, (delta > 0 ? '+' : '') + delta + '°');
      b.addEventListener('click', () => {
        const cur = s.rotation || 0;
        let newRot = snapRot(cur + delta);
        if (newRot >= 360) newRot -= 360;
        if (newRot < 0) newRot += 360;
        rotInput.value = newRot;
        rotPct.textContent = newRot + '°';
        updateSelectedSilent({ rotation: newRot });
      });
      quickBtns.appendChild(b);
    });
    const resetBtn = el('button', {}, 'Reset');
    resetBtn.addEventListener('click', () => {
      rotInput.value = 0;
      rotPct.textContent = '0°';
      updateSelectedSilent({ rotation: 0 });
    });
    body.appendChild(el('div', { className: 'field' },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
        el('label', {}, 'Rotation (degrees, around center)'), rotPct),
      rotInput,
      quickBtns,
      el('div', { style: { marginTop: '6px' } }, resetBtn)
    ));
  }

  // Triangle: right-angle corner
  if (s.type === 'triangle') {
    const corners = [
      { v: 'bl', label: 'Bottom-left' },
      { v: 'br', label: 'Bottom-right' },
      { v: 'tl', label: 'Top-left' },
      { v: 'tr', label: 'Top-right' }
    ];
    const grid = el('div', { className: 'tri-corners' });
    for (const c of corners) {
      const isSel = (s.rightAngle || 'bl') === c.v;
      const btn = el('button', { className: 'tri-corner-btn' + (isSel ? ' sel' : '') }, c.label);
      btn.addEventListener('click', () => updateSelected({ rightAngle: c.v }));
      grid.appendChild(btn);
    }
    body.appendChild(el('div', { className: 'field' },
      el('label', {}, 'Right angle corner'),
      grid
    ));
  }

  // Color
  const swatches = el('div', { className: 'swatches' });
  for (const c of SWATCHES) {
    const btn = el('button', { className: 'swatch' + (s.color === c ? ' sel' : ''), style: { background: c } });
    btn.addEventListener('click', () => updateSelected({ color: c }));
    swatches.appendChild(btn);
  }
  const colorInput = el('input', { type: 'color', value: s.color });
  colorInput.addEventListener('input', e => updateSelectedSilent({ color: e.target.value }));
  body.appendChild(el('div', { className: 'field' },
    el('label', {}, 'Color'),
    swatches,
    el('div', { style: { marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' } },
      el('label', { style: { fontSize: '12px', color: '#57534e' } }, 'Custom:'),
      colorInput)
  ));

  // Opacity
  const opacityVal = s.opacity !== undefined ? s.opacity : 0.65;
  const rangeInput = el('input', { type: 'range', min: '0.05', max: '1', step: '0.05', value: opacityVal });
  const opacityPct = el('span', { style: { fontSize: '12px', color: '#78716c' } }, Math.round(opacityVal * 100) + '%');
  rangeInput.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    updateSelectedSilent({ opacity: v });
    opacityPct.textContent = Math.round(v * 100) + '%';
  });
  body.appendChild(el('div', { className: 'field' },
    el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
      el('label', {}, 'Opacity'), opacityPct),
    rangeInput,
    el('div', { className: 'hint' }, 'Lower opacity is useful for background features like tree shade.')
  ));

  // Arrange button
  const arrangeBtn = el('button', { className: 'btn ghost' }, 'Arrange layer order…');
  arrangeBtn.addEventListener('click', () => { state.panel = 'arrange'; render(); });
  body.appendChild(arrangeBtn);

  // Duplicate / Delete
  const dupBtn = el('button', { className: 'btn ghost', html: I.copy + '<span style="margin-left:6px">Duplicate</span>' });
  dupBtn.addEventListener('click', duplicateSelected);
  const delBtn = el('button', { className: 'btn danger', html: I.trash + '<span style="margin-left:6px">Delete</span>' });
  delBtn.addEventListener('click', deleteSelected);
  body.appendChild(el('div', { className: 'btn-row' }, dupBtn, delBtn));

  return body;
}

function renderPropsPanelMulti(selected) {
  const body = el('div', { className: 'sheet-body' });
  body.appendChild(el('div', { className: 'banner' },
    selected.length + ' shapes selected. Use the buttons below to act on all of them. Edit individual properties one at a time.'));

  // Common locked state
  const allLocked = selected.every(s => s.locked);
  const anyLocked = selected.some(s => s.locked);
  const lockBtn = el('button', { className: 'btn ghost',
    html: (allLocked ? I.unlock : I.lock) + '<span style="margin-left:6px">' + (allLocked ? 'Unlock all' : 'Lock all') + '</span>' });
  lockBtn.addEventListener('click', () => {
    setLockedForIds(state.selectedIds, !allLocked);
    render();
  });
  body.appendChild(lockBtn);

  // Duplicate, copy, delete
  const dupBtn = el('button', { className: 'btn ghost', html: I.copy + '<span style="margin-left:6px">Duplicate</span>' });
  dupBtn.addEventListener('click', () => { duplicateSelected(); render(); });
  const copyBtn = el('button', { className: 'btn ghost', html: I.copy + '<span style="margin-left:6px">Copy to clipboard</span>' });
  copyBtn.addEventListener('click', () => { copySelected(); alert(selected.length + ' shapes copied. Use Paste in any project to bring them in.'); });
  const delBtn = el('button', { className: 'btn danger', html: I.trash + '<span style="margin-left:6px">Delete all</span>' });
  delBtn.addEventListener('click', () => { deleteSelected(); render(); });
  body.appendChild(dupBtn);
  body.appendChild(copyBtn);
  body.appendChild(delBtn);

  return body;
}

function renderPropsPanel() {
  const selected = getSelected();
  if (selected.length === 0) return null;
  const single = selected.length === 1 ? selected[0] : null;
  const title = single ?
    (single.type.charAt(0).toUpperCase() + single.type.slice(1)) + ' properties' :
    selected.length + ' shapes selected';

  // Header
  const header = el('div', { className: 'sheet-header' });
  header.appendChild(el('div', { className: 'title' }, title));
  const headerRight = el('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } });
  if (single) {
    const lockBtn = el('button', {
      className: 'lockbtn ' + (single.locked ? 'on' : 'off'),
      html: (single.locked ? I.lock : I.unlock) + '<span style="margin-left:6px">' + (single.locked ? 'Locked' : 'Unlocked') + '</span>'
    });
    lockBtn.addEventListener('click', () => updateSelected({ locked: !single.locked }));
    headerRight.appendChild(lockBtn);
  }
  const closeBtn = el('button', { className: 'iconbtn', html: I.x });
  closeBtn.addEventListener('click', () => { state.panel = null; render(); });
  headerRight.appendChild(closeBtn);
  header.appendChild(headerRight);

  const body = single ? renderPropsPanelSingle(single) : renderPropsPanelMulti(selected);
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

function renderArrangePanel() {
  const s = singleSelected();
  if (!s) return null;
  const i = state.shapes.findIndex(sh => sh.id === s.id);
  const canFwd = findNextSameTier(state.shapes, i, 1) !== -1;
  const canBack = findNextSameTier(state.shapes, i, -1) !== -1;
  const grid = el('div', { className: 'arrange-grid' });
  const front = el('button', { html: I.arrangeFront + '<span>Bring to front</span>' });
  front.disabled = !canFwd;
  front.addEventListener('click', () => { bringToFront(s.id); state.panel = 'props'; render(); });
  const fwd = el('button', { html: I.arrangeForward + '<span>Bring forward</span>' });
  fwd.disabled = !canFwd;
  fwd.addEventListener('click', () => { bringForward(s.id); state.panel = 'props'; render(); });
  const back = el('button', { html: I.arrangeBackward + '<span>Send backward</span>' });
  back.disabled = !canBack;
  back.addEventListener('click', () => { sendBackward(s.id); state.panel = 'props'; render(); });
  const toBack = el('button', { html: I.arrangeBack + '<span>Send to back</span>' });
  toBack.disabled = !canBack;
  toBack.addEventListener('click', () => { sendToBack(s.id); state.panel = 'props'; render(); });
  grid.appendChild(front);
  grid.appendChild(fwd);
  grid.appendChild(back);
  grid.appendChild(toBack);
  const backBtn = el('button', { className: 'btn ghost' }, '← Back to properties');
  backBtn.addEventListener('click', () => { state.panel = 'props'; render(); });
  const body = el('div', { className: 'sheet-body' },
    el('div', { className: 'hint', style: { fontSize: '13px', color: '#57534e' } },
      s.locked ? 'Reorders within the locked (background) layer. Locked shapes always render behind unlocked ones.' :
      'Reorders within the unlocked layer. Locked shapes always render behind these.'),
    grid,
    backBtn
  );
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Arrange layer order'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = 'props'; render(); } });
  return overlay;
}

function renderLayersPanel() {
  const lockedCount = state.shapes.filter(s => s.locked).length;
  const headerTitle = `Shapes (${state.shapes.length}${lockedCount ? ' · ' + lockedCount + ' locked' : ''})`;
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, headerTitle),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );
  const list = el('div', {});
  if (state.shapes.length === 0) {
    list.appendChild(el('div', { style: { padding: '32px', textAlign: 'center', color: '#78716c', fontSize: '14px' } }, 'No shapes yet.'));
  } else {
    const reversed = [...state.shapes].reverse();
    for (const s of reversed) {
      const sel = isSelected(s.id);
      let dims;
      if (s.type === 'circle') dims = s.radius + ' ft radius';
      else dims = s.width + ' × ' + s.height + ' ft';
      const opacity = s.opacity !== undefined ? s.opacity : 0.65;
      const meta = dims + ' · at (' + s.x + ', ' + s.y + ') ft' +
        (opacity < 1 ? ' · ' + Math.round(opacity * 100) + '% opacity' : '') +
        (s.rotation ? ' · ' + s.rotation + '°' : '');
      // Visual swatch matches shape type
      let swatch;
      if (s.type === 'circle') {
        swatch = el('div', { className: 'layer-sw circle', style: { background: s.color, opacity: opacity } });
      } else if (s.type === 'rect') {
        swatch = el('div', { className: 'layer-sw rect', style: { background: s.color, opacity: opacity } });
      } else if (s.type === 'oval') {
        swatch = el('div', { className: 'layer-sw', style: { background: s.color, opacity: opacity, borderRadius: '50%/30%' } });
      } else if (s.type === 'triangle') {
        // Render an inline SVG triangle as the swatch
        const sw = el('div', { className: 'layer-sw', style: { background: 'transparent', border: 'none' } });
        sw.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32"><polygon points="2,30 30,30 2,2" fill="${s.color}" fill-opacity="${opacity}" stroke="#d6d3d1" stroke-width="1"/></svg>`;
        swatch = sw;
      }
      const info = el('div', { className: 'layer-info' },
        s.label
          ? el('div', { className: 'layer-label' }, s.label)
          : el('div', { className: 'layer-label empty' }, 'Unlabeled ' + s.type),
        el('div', { className: 'layer-meta' }, meta)
      );
      const lockBtn = el('button', {
        className: 'layer-lock ' + (s.locked ? 'on' : ''),
        html: s.locked ? I.lock : I.unlock,
        title: s.locked ? 'Unlock' : 'Lock'
      });
      lockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        s.locked = !s.locked;
        flushHistoryDebounce(); pushHistory();
        save(); render();
      });
      const row = el('div', { className: 'layer-row' + (sel ? ' sel' : '') }, swatch, info, lockBtn);
      row.addEventListener('click', () => {
        selectOnly(s.id);
        centerOnShape(s.id);
        state.panel = null;
        render();
      });
      list.appendChild(row);
    }
  }
  const sheet = el('div', { className: 'sheet' }, header, list);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

// ============================================================
// PLANT PICKER
// ============================================================
function plantMatches(p, f) {
  if (f.dogSafeOnly && p.dog !== 'Safe') return false;
  if (!f.showArchived) {
    if (p.status === 'Rejected') return false;
    if (p.dog === 'HARD NO') return false;
    if (p.notes && p.notes.indexOf('FAILS ZONE FILTER') !== -1) return false;
  }
  if (f.form && p.form !== f.form) return false;
  if (f.water && p.water !== f.water) return false;
  if (f.dryShade && !p.dry_shade) return false;
  if (f.wetFeet && !p.wet_feet) return false;
  if (f.bloomMonth) {
    const m = Number(f.bloomMonth);
    if (!p.bloom || p.bloom.start == null || p.bloom.end == null) return false;
    if (!(p.bloom.start <= m && m <= p.bloom.end)) return false;
  }
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = (p.common + ' ' + (p.botanical || '') + ' ' + (p.host || '') + ' ' + (p.bed || '') + ' ' + (p.notes || '')).toLowerCase();
    if (hay.indexOf(q) === -1) return false;
  }
  return true;
}
function filteredPlants() {
  const out = PLANTS.filter(p => plantMatches(p, plantFilter));
  out.sort((a, b) => a.common.localeCompare(b.common));
  return out;
}
// Canvas color by growth form, drawn from the existing swatch palette
const FORM_COLORS = {
  'Tree (canopy)': '#78350f', 'Tree (understory)': '#57534e', 'Shrub': '#16a34a',
  'Perennial': '#a855f7', 'Grass/Sedge': '#f59e0b', 'Vine': '#14b8a6',
  'Bulb': '#ec4899', 'Fern': '#65a30d', 'Annual': '#fbbf24',
  'Aquatic/Emergent': '#0ea5e9', 'Cactus': '#84cc16'
};
function addPlantShape(p) {
  flushHistoryDebounce();
  const c = viewCenterFeet();
  const id = uid();
  const spread = (p.width && p.width.med) || (p.height && p.height.med) || 2;
  const radius = Math.max(0.5, snap(spread / 2));
  const shape = {
    id, type: 'circle',
    x: snap(c.x), y: snap(c.y),
    radius,
    color: FORM_COLORS[p.form] || '#16a34a',
    label: p.common,
    opacity: 0.65, locked: false,
    plantId: p.id // permanent link back to the plant index row
  };
  state.shapes.push(shape);
  state.selectedIds = [id];
  pushHistory();
  save();
}
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function plantMetaLine(p) {
  const bits = [];
  if (p.form) bits.push(p.form);
  const spread = p.width && p.width.med;
  const ht = p.height && p.height.med;
  if (ht || spread) bits.push((ht ? ht + "'" : '?') + ' x ' + (spread ? spread + "'" : '?'));
  if (p.bloom && p.bloom.start) {
    bits.push('blooms ' + MONTH_NAMES[p.bloom.start] + (p.bloom.end && p.bloom.end !== p.bloom.start ? '-' + MONTH_NAMES[p.bloom.end] : ''));
  }
  if (p.dog && p.dog !== 'Safe') bits.push('dog: ' + p.dog);
  const tags = [];
  if (p.dry_shade) tags.push('dry shade');
  if (p.wet_feet) tags.push('wet ok');
  if (tags.length) bits.push(tags.join(', '));
  return bits.join(' \u00b7 ');
}
function renderPlantsPanel() {
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Plant Picker' + (PLANTS.length ? ' (' + PLANTS.length + ')' : '')),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );

  const body = el('div', { className: 'sheet-body' });

  if (!PLANTS.length) {
    body.appendChild(el('div', { className: 'hint' }, 'Plant index not loaded yet. If this persists, check that plants.json is deployed and the service worker cache version was bumped.'));
    const sheet0 = el('div', { className: 'sheet' }, header, body);
    const overlay0 = el('div', { className: 'overlay' }, sheet0);
    overlay0.addEventListener('click', e => { if (e.target === overlay0) { state.panel = null; render(); } });
    return overlay0;
  }

  // --- Results list (rebuilt in place so typing never destroys input focus) ---
  const countLine = el('div', { className: 'hint', style: { padding: '0 0 6px' } });
  const listWrap = el('div', {});
  function buildRow(p) {
    const info = el('div', { className: 'pinfo' },
      el('div', { className: 'pname' }, p.common),
      el('div', { className: 'pmeta' }, (p.botanical ? p.botanical + ' \u2014 ' : '') + plantMetaLine(p))
    );
    const dot = el('div', { style: {
      width: '14px', height: '14px', borderRadius: '50%', flex: 'none',
      background: FORM_COLORS[p.form] || '#16a34a', marginRight: '10px'
    } });
    const row = el('div', { className: 'proj-row', style: { alignItems: 'center' } }, dot, info);
    row.addEventListener('click', () => {
      addPlantShape(p);
      state.panel = null;
      render();
    });
    return row;
  }
  function rebuildList() {
    while (listWrap.firstChild) listWrap.removeChild(listWrap.firstChild);
    const hits = filteredPlants();
    countLine.textContent = hits.length + ' match' + (hits.length === 1 ? '' : 'es') + ' \u00b7 tap a plant to place it';
    for (const p of hits.slice(0, 60)) listWrap.appendChild(buildRow(p));
    if (hits.length > 60) {
      listWrap.appendChild(el('div', { className: 'hint', style: { padding: '8px 0' } },
        '+ ' + (hits.length - 60) + ' more \u2014 narrow the filters to see them'));
    }
    if (hits.length === 0) {
      listWrap.appendChild(el('div', { className: 'hint', style: { padding: '8px 0' } },
        'No matches. Loosen a filter \u2014 or check \u201cShow archived\u201d if you are hunting a rejected/zone-fail plant.'));
    }
  }

  // --- Filter controls (all update the list in place; no full render) ---
  const search = el('input', { type: 'text', value: plantFilter.q, placeholder: 'Search name, host, notes\u2026' });
  search.addEventListener('input', () => { plantFilter.q = search.value; rebuildList(); });

  const enums = (PLANT_META && PLANT_META.enums) || {};
  function mkSelect(label, key, options, display) {
    const sel = el('select', {});
    sel.appendChild(el('option', { value: '' }, label));
    for (const o of options) {
      const opt = el('option', { value: String(o) }, display ? display(o) : String(o));
      if (String(plantFilter[key]) === String(o)) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => { plantFilter[key] = sel.value; rebuildList(); });
    return el('div', { className: 'field', style: { flex: '1', minWidth: '0' } }, sel);
  }
  const selRow = el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
    mkSelect('Any form', 'form', enums.form || []),
    mkSelect('Any water', 'water', enums.water || [])
  );
  const selRow2 = el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
    mkSelect('Blooming in\u2026', 'bloomMonth', [1,2,3,4,5,6,7,8,9,10,11,12], m => MONTH_NAMES[m])
  );

  function mkCheck(label, key) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = !!plantFilter[key];
    cb.addEventListener('change', () => { plantFilter[key] = cb.checked; rebuildList(); });
    return el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '4px 0' } }, cb, label);
  }
  const checks = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px 16px', margin: '8px 0 10px' } },
    mkCheck('Dog-safe only', 'dogSafeOnly'),
    mkCheck('Dry shade', 'dryShade'),
    mkCheck('Wet feet', 'wetFeet'),
    mkCheck('Show archived', 'showArchived')
  );

  body.appendChild(el('div', { className: 'field' }, search));
  body.appendChild(selRow);
  body.appendChild(selRow2);
  body.appendChild(checks);
  body.appendChild(countLine);
  body.appendChild(listWrap);
  rebuildList();

  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

function renderProjectsPanel() {
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Projects (' + state.projects.length + ')'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );
  const list = el('div', {});
  const sorted = [...state.projects].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  for (const p of sorted) {
    const isCurrent = p.id === state.currentProjectId;
    const modDate = p.lastModified ? new Date(p.lastModified).toLocaleString() : 'Never';
    const projData = loadProjectData(p.id);
    const shapeCount = projData ? (projData.shapes || []).length : 0;
    const info = el('div', { className: 'pinfo' },
      el('div', { className: 'pname' }, p.name + (isCurrent ? ' (current)' : '')),
      el('div', { className: 'pmeta' }, shapeCount + ' shapes · last modified ' + modDate)
    );
    const actions = el('div', { className: 'pactions' });
    // Rename button
    const renameBtn = el('button', { className: 'iconbtn', html: I.edit });
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.panelArgs = { renamingId: p.id, originalName: p.name };
      state.panel = 'rename';
      render();
    });
    actions.appendChild(renameBtn);
    // Delete button (only if not current and there's more than one project)
    if (!isCurrent && state.projects.length > 1) {
      const delBtn = el('button', { className: 'iconbtn', html: I.trash });
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete project "' + p.name + '"? This cannot be undone.')) {
          deleteProject(p.id);
          render();
        }
      });
      actions.appendChild(delBtn);
    }
    const row = el('div', { className: 'proj-row' + (isCurrent ? ' current' : '') }, info, actions);
    row.addEventListener('click', () => {
      if (p.id !== state.currentProjectId) {
        saveCurrentProject();
        loadProject(p.id);
      }
      state.panel = null;
      render();
    });
    list.appendChild(row);
  }
  // New project button
  const newBtn = el('button', { className: 'btn primary', style: { margin: '16px' },
    html: I.plus + '<span style="margin-left:6px">New project</span>' });
  newBtn.addEventListener('click', () => {
    const name = prompt('Name for new project:', 'Untitled');
    if (name === null) return;
    saveCurrentProject();
    const id = createProject(name || 'Untitled');
    loadProject(id);
    state.panel = null;
    render();
  });
  // Paste from clipboard
  const clip = getClipboard();
  let pasteBtn = null;
  if (clip && clip.shapes && clip.shapes.length) {
    pasteBtn = el('button', { className: 'btn ghost', style: { margin: '0 16px 16px' },
      html: I.paste + '<span style="margin-left:6px">Paste ' + clip.shapes.length + ' shape' + (clip.shapes.length !== 1 ? 's' : '') + ' here</span>' });
    pasteBtn.addEventListener('click', () => {
      paste();
      state.panel = null;
      render();
    });
  }
  const sheet = el('div', { className: 'sheet' }, header, list, newBtn);
  if (pasteBtn) sheet.appendChild(pasteBtn);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

function renderRenamePanel() {
  const args = state.panelArgs || {};
  const original = args.originalName || '';
  const renamingId = args.renamingId || state.currentProjectId;
  const input = el('input', { type: 'text', value: original });
  setTimeout(() => { input.focus(); input.select(); }, 50);
  const doRename = () => {
    const v = input.value.trim() || 'Untitled';
    renameProject(renamingId, v);
    state.panel = state.panelArgs.returnTo || 'projects';
    state.panelArgs = null;
    render();
  };
  const saveBtn = el('button', { className: 'btn primary' }, 'Save');
  saveBtn.addEventListener('click', doRename);
  const cancelBtn = el('button', { className: 'btn ghost' }, 'Cancel');
  cancelBtn.addEventListener('click', () => { state.panel = state.panelArgs?.returnTo || 'projects'; state.panelArgs = null; render(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doRename(); });
  const modal = el('div', { className: 'modal' },
    el('div', { className: 'sheet-header' },
      el('div', { className: 'title' }, 'Rename project'),
      (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = state.panelArgs?.returnTo || 'projects'; state.panelArgs = null; render(); }); return b; })()
    ),
    el('div', { className: 'sheet-body' },
      el('div', { className: 'field' }, el('label', {}, 'Project name'), input),
      el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, cancelBtn, saveBtn)
    )
  );
  const overlay = el('div', { className: 'overlay center' }, modal);
  return overlay;
}

function renderExportModal() {
  const pngBtn = el('button', { className: 'btn primary' }, 'Download PNG');
  pngBtn.addEventListener('click', () => doExport('png'));
  const svgBtn = el('button', { className: 'btn secondary' }, 'Download SVG');
  svgBtn.addEventListener('click', () => doExport('svg'));
  const cancelBtn = el('button', { className: 'btn ghost' }, 'Cancel');
  cancelBtn.addEventListener('click', () => { state.panel = null; render(); });
  const modal = el('div', { className: 'modal' },
    el('div', { className: 'sheet-header' },
      el('div', { className: 'title' }, 'Export plan'),
      (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
    ),
    el('div', { className: 'sheet-body' },
      el('div', { style: { fontSize: '14px', color: '#57534e' } }, 'Choose a format. PNG is good for sharing; SVG keeps vector quality for printing.'),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, pngBtn, svgBtn, cancelBtn)
    )
  );
  const overlay = el('div', { className: 'overlay center' }, modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

function renderPreviewModal() {
  const p = state.exportPreview;
  if (!p) return null;
  const img = el('img', { className: 'preview-img', src: p.dataUrl, alt: 'Export preview' });
  const previewWrap = el('div', { className: 'preview-wrap' }, img);
  const dlLink = el('a', { className: 'dl-link', href: p.dataUrl, download: p.filename, target: '_blank', rel: 'noopener' }, 'Download / Open in new tab');
  const buttons = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, dlLink);
  if (p.format === 'svg') {
    const copyBtn = el('button', { className: 'btn ghost' }, 'Copy SVG text to clipboard');
    copyBtn.addEventListener('click', copySvg);
    buttons.appendChild(copyBtn);
  }
  const doneBtn = el('button', { className: 'btn ghost' }, 'Done');
  doneBtn.addEventListener('click', () => { state.panel = null; state.exportPreview = null; render(); });
  buttons.appendChild(doneBtn);
  const body = el('div', { className: 'sheet-body' },
    el('div', { style: { fontSize: '13px', color: '#57534e', lineHeight: '1.5' } },
      el('b', {}, 'On phone:'), ' long-press the image, then choose "Save to Photos" or "Download Image."',
      el('br'), el('br'),
      el('b', {}, 'On desktop:'), ' right-click the image and choose "Save image as...", or tap the Download button.'),
    previewWrap,
    buttons
  );
  if (p.format === 'svg') {
    const ta = el('textarea', { readonly: true }, p.svgText);
    ta.addEventListener('click', e => e.target.select());
    body.appendChild(el('details', {},
      el('summary', {}, 'Backup: show SVG text (select all, copy)'),
      ta
    ));
  }
  const modal = el('div', { className: 'modal' },
    el('div', { className: 'sheet-header' },
      el('div', { className: 'title' }, 'Save your plan (' + p.format.toUpperCase() + ')'),
      (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; state.exportPreview = null; render(); }); return b; })()
    ),
    body
  );
  const overlay = el('div', { className: 'overlay center', style: { zIndex: 40 } }, modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; state.exportPreview = null; render(); } });
  return overlay;
}

function renderResetModal() {
  const cancelBtn = el('button', { className: 'btn ghost' }, 'Cancel');
  cancelBtn.addEventListener('click', () => { state.panel = null; render(); });
  const confirmBtn = el('button', { className: 'btn danger-solid' }, 'Clear all');
  confirmBtn.addEventListener('click', () => { resetCurrentProject(); render(); });
  const modal = el('div', { className: 'modal' },
    el('div', { className: 'sheet-body' },
      el('div', { style: { fontWeight: 600, color: '#292524', marginBottom: '8px' } }, 'Clear this project?'),
      el('div', { style: { fontSize: '14px', color: '#57534e', marginBottom: '16px' } },
        'This will delete all ' + state.shapes.length + ' shapes from "' + (currentProject()?.name || 'this project') + "\". You can undo immediately after if it's a mistake."),
      el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, cancelBtn, confirmBtn)
    )
  );
  const overlay = el('div', { className: 'overlay center' }, modal);
  return overlay;
}

function renderMoreMenu() {
  const items = [];
  // Select mode toggle
  items.push({
    icon: state.selectMode ? I.hand : I.lasso,
    label: state.selectMode ? 'Switch to pan mode' : 'Switch to select mode',
    onClick: () => {
      state.selectMode = !state.selectMode;
      if (!state.selectMode) clearSelection();
      state.menu = null;
      render();
    }
  });
  // Paste (if clipboard has data)
  const clip = getClipboard();
  if (clip && clip.shapes && clip.shapes.length) {
    items.push({
      icon: I.paste,
      label: 'Paste ' + clip.shapes.length + ' shape' + (clip.shapes.length !== 1 ? 's' : ''),
      onClick: () => { paste(); state.menu = null; render(); }
    });
  }
  items.push({ divider: true });
  items.push({
    icon: I.edit,
    label: 'Rename current project',
    onClick: () => {
      state.panelArgs = { renamingId: state.currentProjectId, originalName: currentProject()?.name || '', returnTo: null };
      state.panel = 'rename';
      state.menu = null;
      render();
    }
  });
  items.push({
    icon: I.reset,
    label: 'Clear all shapes in project',
    onClick: () => { state.panel = 'reset'; state.menu = null; render(); }
  });
  const menu = el('div', { className: 'menu' });
  for (const it of items) {
    if (it.divider) { menu.appendChild(el('div', { className: 'menu-divider' })); continue; }
    const btn = el('button', { className: 'menu-item' });
    btn.innerHTML = it.icon + '<span>' + it.label + '</span>';
    btn.addEventListener('click', it.onClick);
    menu.appendChild(btn);
  }
  const overlay = el('div', { className: 'overlay top' }, el('div', { style: { paddingRight: '8px', paddingTop: '4px' } }, menu));
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.menu = null; render(); } });
  return overlay;
}

// ============================================================
// MAIN RENDER
// ============================================================
function render() {
  const root = document.getElementById('root');
  // Clear root
  while (root.firstChild) root.removeChild(root.firstChild);

  const app = el('div', { className: 'app' });

  // ===== TOP BAR =====
  const topbar = el('div', { className: 'topbar' });
  const proj = currentProject();
  const projName = proj ? proj.name : 'Untitled';
  const projBtn = el('button', { className: 'project-btn' },
    el('div', { className: 'pname' }, projName),
    el('div', { html: I.chevronDown, style: { display: 'flex', color: '#78716c' } }),
    el('div', { className: 'pinfo' }, state.shapes.length + ' shapes · ' + Math.round(state.zoom * 100) + '%')
  );
  projBtn.addEventListener('click', () => { state.panel = 'projects'; render(); });
  topbar.appendChild(projBtn);

  // Undo
  const undoBtn = el('button', { className: 'iconbtn', html: I.undo, title: 'Undo' });
  undoBtn.disabled = !canUndo();
  undoBtn.addEventListener('click', () => { undo(); render(); });
  topbar.appendChild(undoBtn);

  // Redo
  const redoBtn = el('button', { className: 'iconbtn', html: I.redo, title: 'Redo' });
  redoBtn.disabled = !canRedo();
  redoBtn.addEventListener('click', () => { redo(); render(); });
  topbar.appendChild(redoBtn);

  // Layers
  const layersBtn = el('button', { className: 'iconbtn', html: I.layers, title: 'Layers' });
  layersBtn.addEventListener('click', () => { state.panel = 'layers'; render(); });
  topbar.appendChild(layersBtn);

  // Export
  const exportBtn = el('button', { className: 'iconbtn', html: I.download, title: 'Export' });
  exportBtn.disabled = state.shapes.length === 0;
  exportBtn.addEventListener('click', () => { state.panel = 'export'; render(); });
  topbar.appendChild(exportBtn);

  // More menu
  const moreBtn = el('button', { className: 'iconbtn' + (state.selectMode ? ' active' : ''), html: I.more, title: 'More' });
  moreBtn.addEventListener('click', () => { state.menu = state.menu ? null : 'more'; render(); });
  topbar.appendChild(moreBtn);

  app.appendChild(topbar);

  // ===== CANVAS WRAP =====
  const canvasWrap = el('div', { className: 'canvas-wrap', id: 'canvas-wrap' });
  const svg = svgEl('svg', { id: 'canvas-svg', width: state.canvasW, height: state.canvasH });
  svg.addEventListener('pointerdown', onCanvasPointerDown);
  svg.addEventListener('pointermove', onCanvasPointerMove);
  svg.addEventListener('pointerup', onCanvasPointerUp);
  svg.addEventListener('pointercancel', onCanvasPointerUp);
  svg.addEventListener('touchstart', e => { if (e.touches && e.touches.length === 2) e.preventDefault(); }, { passive: false });
  svg.addEventListener('touchmove', e => { if (e.touches && e.touches.length === 2) e.preventDefault(); }, { passive: false });
  svg.addEventListener('wheel', onWheel, { passive: false });
  canvasWrap.appendChild(svg);

  // Mode banner (when select mode is on)
  if (state.selectMode) {
    const banner = el('div', { className: 'mode-banner' });
    banner.innerHTML = I.lasso + '<span>Select mode — drag to lasso, tap to toggle</span>';
    const closeX = el('button', { className: 'iconbtn', style: { width: '20px', height: '20px', padding: 0 }, html: I.x });
    closeX.addEventListener('click', () => {
      state.selectMode = false;
      clearSelection();
      render();
    });
    banner.appendChild(closeX);
    canvasWrap.appendChild(banner);
  }

  // Zoom buttons
  const zoomBtns = el('div', { className: 'zoombtns' });
  const zIn = el('button', { className: 'zoombtn', html: I.zoomIn });
  zIn.addEventListener('click', () => { zoomBy(1.25); render(); });
  const zOut = el('button', { className: 'zoombtn', html: I.zoomOut });
  zOut.addEventListener('click', () => { zoomBy(0.8); render(); });
  zoomBtns.appendChild(zIn); zoomBtns.appendChild(zOut);
  canvasWrap.appendChild(zoomBtns);

  // Empty hint
  if (state.shapes.length === 0) {
    canvasWrap.appendChild(el('div', { className: 'empty-hint' },
      'Tap a shape button below to add it.', el('br'),
      'Grid lines are ', el('b', {}, '1 ft'), '. Bold lines every ', el('b', {}, '10 ft'), '.'
    ));
  }

  // Multi-select action bar (floating, only when 2+ selected and no panel open)
  if (state.selectedIds.length >= 2 && !state.panel) {
    const bar = el('div', { className: 'multi-bar' });
    bar.appendChild(el('div', { className: 'count' }, state.selectedIds.length + ' selected'));
    const editAllBtn = el('button', { title: 'Edit' });
    editAllBtn.innerHTML = I.edit + '<span>Edit</span>';
    editAllBtn.addEventListener('click', () => { state.panel = 'props'; render(); });
    const copyBtn = el('button', { title: 'Copy' });
    copyBtn.innerHTML = I.copy;
    copyBtn.addEventListener('click', () => {
      copySelected();
      // brief visual feedback
      copyBtn.style.background = 'rgba(255,255,255,0.2)';
      setTimeout(() => { copyBtn.style.background = ''; }, 300);
    });
    const delBtn = el('button', { title: 'Delete' });
    delBtn.innerHTML = I.trash;
    delBtn.addEventListener('click', () => { deleteSelected(); render(); });
    const closeBtn = el('button', { title: 'Deselect' });
    closeBtn.innerHTML = I.x;
    closeBtn.addEventListener('click', () => { clearSelection(); render(); });
    bar.appendChild(editAllBtn);
    bar.appendChild(copyBtn);
    bar.appendChild(delBtn);
    bar.appendChild(closeBtn);
    canvasWrap.appendChild(bar);
  }

  // Single-select pill (only when exactly 1 selected, no panel open, no multi-bar)
  if (state.selectedIds.length === 1 && !state.panel) {
    const s = singleSelected();
    if (s) {
      const pill = el('div', { className: 'sel-pill' });
      pill.appendChild(el('div', { className: 'sw', style: { background: s.color } }));
      pill.appendChild(el('div', { className: 'name' }, s.label || ('Unlabeled ' + s.type)));
      const editBtn = el('button', { className: 'edit' });
      editBtn.innerHTML = I.edit + '<span>Edit</span>';
      editBtn.addEventListener('click', () => { state.panel = 'props'; render(); });
      pill.appendChild(editBtn);
      canvasWrap.appendChild(pill);
    }
  }

  app.appendChild(canvasWrap);

  // ===== BOTTOM TOOLBAR =====
  const bottomBar = el('div', { className: 'bottom-toolbar' });
  const mkShapeBtn = (type, cls, label, icon) => {
    const b = el('button', { className: 'tool-btn ' + cls });
    b.innerHTML = icon + '<div class="lbl">' + label + '</div>';
    b.addEventListener('click', () => { addShape(type); render(); });
    return b;
  };
  bottomBar.appendChild(mkShapeBtn('circle', 'circle', 'Circle', I.circle));
  bottomBar.appendChild(mkShapeBtn('rect', 'rect', 'Rect', I.square));
  bottomBar.appendChild(mkShapeBtn('oval', 'oval', 'Oval', I.oval));
  bottomBar.appendChild(mkShapeBtn('triangle', 'tri', 'Triangle', I.triangle));
  const plantsBtn = el('button', { className: 'tool-btn plants' });
  plantsBtn.innerHTML = I.leaf + '<div class="lbl">Plants</div>';
  plantsBtn.addEventListener('click', () => { state.panel = 'plants'; render(); });
  bottomBar.appendChild(plantsBtn);
  app.appendChild(bottomBar);

  root.appendChild(app);

  // ===== PANELS / MODALS / MENU =====
  let panelNode = null;
  if (state.panel === 'props') panelNode = renderPropsPanel();
  else if (state.panel === 'arrange') panelNode = renderArrangePanel();
  else if (state.panel === 'layers') panelNode = renderLayersPanel();
  else if (state.panel === 'projects') panelNode = renderProjectsPanel();
  else if (state.panel === 'rename') panelNode = renderRenamePanel();
  else if (state.panel === 'export') panelNode = renderExportModal();
  else if (state.panel === 'preview') panelNode = renderPreviewModal();
  else if (state.panel === 'reset') panelNode = renderResetModal();
  else if (state.panel === 'plants') panelNode = renderPlantsPanel();
  if (panelNode) root.appendChild(panelNode);
  if (state.menu === 'more') root.appendChild(renderMoreMenu());

  // Now that the SVG is in the DOM, size it and draw grid/shapes
  resizeCanvas();
}

// ============================================================
// RESIZE (CANVAS-ONLY — preserves Android keyboard fix)
// ============================================================
function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const svg = document.getElementById('canvas-svg');
  if (!wrap || !svg) return;
  const rect = wrap.getBoundingClientRect();
  state.canvasW = Math.max(100, Math.round(rect.width));
  state.canvasH = Math.max(100, Math.round(rect.height));
  svg.setAttribute('width', state.canvasW);
  svg.setAttribute('height', state.canvasH);
  // Clear and redraw only the SVG contents (grid + shapes) — do not touch panel DOM
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  renderGrid(svg);
  renderShapes(svg);
}

// ============================================================
// EVENT LISTENERS
// ============================================================
// IMPORTANT: window resize calls resizeCanvas ONLY, never render().
// Android keyboard appearing fires a viewport resize; a full render()
// destroys focused inputs.
window.addEventListener('resize', () => { resizeCanvas(); });
// Same goes for visualViewport resize (covers iOS keyboard + zoom)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => { resizeCanvas(); });
}

// Keyboard shortcuts (helpful on desktop, harmless on phone)
window.addEventListener('keydown', (e) => {
  // Don't capture while typing in inputs
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); undo(); render();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
    e.preventDefault(); redo(); render();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    if (state.selectedIds.length) { e.preventDefault(); copySelected(); }
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault(); paste(); render();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    if (state.selectedIds.length) { e.preventDefault(); duplicateSelected(); render(); }
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.selectedIds.length) { e.preventDefault(); deleteSelected(); render(); }
  } else if (e.key === 'Escape') {
    if (state.panel) { state.panel = null; render(); }
    else if (state.menu) { state.menu = null; render(); }
    else if (state.selectedIds.length) { clearSelection(); render(); }
  }
});

// ============================================================
// SERVICE WORKER
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// ============================================================
// INIT
// ============================================================
init();
// Seed history with the initial state
pushHistory();
render();

})();
