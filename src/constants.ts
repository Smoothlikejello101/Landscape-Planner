// ============================================================
// CONSTANTS
// ============================================================
export const PX_PER_FOOT_BASE = 24;
export const SNAP = 0.5;
export const ROT_SNAP = 5;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const DOUBLE_TAP_MS = 350;
export const DRAG_THRESHOLD_PX = 4;
export const BG_COLOR = '#ede0c8';
export const GRID_MINOR = '#dccaa2';
export const GRID_MAJOR = '#c2a976';
export const AXIS_LABEL = '#7c5c2a';
export const MAX_HISTORY = 50;
export const HISTORY_DEBOUNCE_MS = 600;
export const SWATCHES = [
  '#16a34a','#65a30d','#84cc16','#14b8a6',
  '#0ea5e9','#6366f1','#a855f7','#ec4899',
  '#ef4444','#f97316','#f59e0b','#fbbf24',
  '#78350f','#57534e','#94a3b8','#ffffff'
];
export const SHAPE_TYPES = ['circle', 'rect', 'oval', 'triangle'] as const;
// Background image constraints
export const BG_MAX_IMAGE_DIM = 2000;   // downscale so longer edge is <= this
export const BG_JPEG_QUALITY = 0.85;    // re-encode as JPEG at this quality
export const BG_ROT_HANDLE_OFFSET_PX = 32;  // rotation handle sits this far above image top
export const BG_HANDLE_RADIUS_PX = 14;      // touch-friendly hit target for handles
export const STORAGE = {
  PROJECTS: 'lp-projects',
  CURRENT: 'lp-current',
  CLIPBOARD: 'lp-clipboard',
  LEGACY: 'landscape-planner-v1',
  project: (id: string) => 'lp-project-' + id
};
