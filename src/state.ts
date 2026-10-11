// ============================================================
// STATE
// ============================================================
export const state = {
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
  // Background image (satellite / survey to trace over) — per-project.
  // Shape: { dataUrl, naturalWidth, naturalHeight, ftPerPx, cx, cy,
  //          rotation, opacity, visible }
  // Position is CENTER of image in world feet; rotation degrees around center.
  bgImage: null,
  // Ephemeral: are we in bg edit mode (drag/rotate handles active, shapes locked)?
  bgEditMode: false,
  // Ephemeral: calibration flow state, null or { step, p1, p2 }.
  // Steps: 'point1' -> tap first known point, 'point2' -> tap second,
  // 'distance' -> distance-entry modal is open. p1/p2 are image-pixel coords.
  bgCalibrate: null,
};
export const gesture = { current: null };
export const tapTracker = { id: null, time: 0 };
