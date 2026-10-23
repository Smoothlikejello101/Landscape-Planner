import type { GardenLocation } from './climate';
// Core data types shared across the app.
import type { KindKey } from './kinds';

export type ShapeType = 'circle' | 'rect' | 'oval' | 'triangle' | 'poly' | 'line' | 'text';
/** What a shape represents. Undefined = not yet assigned (shapes from older versions). */
export type Role = 'plant' | 'bed' | 'boundary' | 'building' | 'shade' | 'path' | 'lawn' | 'water' | 'other';
/** Per-project display state for a role (or 'unassigned'). */
export interface RoleView { hidden?: boolean; locked?: boolean }
export type RoleKey = Role | 'unassigned';
export type RoleViews = Partial<Record<RoleKey, RoleView>>;
/** Which corner of a right triangle holds the right angle. */
export type Corner = 'bl' | 'br' | 'tl' | 'tr';

interface ShapeBase {
  id: string;
  /** Circles: center. Other shapes: top-left of the unrotated box. Feet. */
  x: number;
  y: number;
  color: string;
  label: string;
  opacity: number;
  /** Locked shapes render in the background tier and can't be dragged. */
  locked: boolean;
  /** Link back to a plant index row when placed from the plant picker. */
  plantId?: string;
  role?: Role;
  /** Beds: plants inside move with the bed (default true). */
  carryPlants?: boolean;
  /** Shade areas: observed direct sun. */
  sun?: SunInfo;
  /**
   * Plants: a sun warning the user dismissed, as its message. Hidden while
   * the warning reads the same; it comes back if the plant moves or the
   * recorded sun changes.
   */
  sunDismissed?: string;
  /** Where it stands in the real garden (unset = not tracked). */
  status?: Status;
  /** YYYY-MM-DD it went in the ground (status 'planted'). */
  plantedOn?: string;
  /** A phase of the project this belongs to, e.g. "Fall 2026" (one of the project's phases). */
  phase?: string;
}
/** Planned = not in the ground yet; gone = removed or died (kept as a record, hidden by default). */
export type Status = 'planned' | 'planted' | 'move' | 'remove' | 'gone';
/** Which plants to show (view or print). Other shapes always show, except gone ones. */
export interface ShapeFilter { status: '' | Status; phase: string; showGone: boolean }
/** Direct sun observed on a shade area. Times are minutes after midnight. */
export interface SunInfo {
  /** 'times': sunny periods; 'hours': just a total. */
  mode: 'times' | 'hours';
  periods: [number, number][];
  hours: number;
  /** Filtered light through foliage. */
  dappled: boolean;
  /** YYYY-MM-DD */
  observedOn?: string;
  note?: string;
}
export interface CircleShape extends ShapeBase {
  type: 'circle';
  radius: number;
  /**
   * Plants: 'plant' = the size came from plant data (redrawn when the plan's
   * size mode changes); 'manual' = set by hand (left alone). Missing on
   * plants placed before this existed: treated as 'plant' when the radius
   * still matches the plant data.
   */
  sizeFrom?: 'plant' | 'manual';
  /**
   * Drawn as a tree: a trunk at the center under the canopy. Set for trees
   * added as trees; plants whose catalog form is a tree show one too.
   */
  tree?: boolean;
  /** Trees: trunk diameter in feet, set by hand (unset = in proportion to the canopy). */
  trunk?: number;
  /**
   * Trees pruned into a shape: the canopy outline, in feet relative to the
   * trunk (x, y). `radius` is then the farthest the outline reaches, so the
   * outline always fits inside the circle used for sizes and spacing.
   */
  canopy?: [number, number][];
  /** Ignored for circles; tolerated so old data and patches stay valid. */
  rotation?: number;
}
export interface BoxShape<T extends 'rect' | 'oval' = 'rect' | 'oval'> extends ShapeBase {
  type: T;
  width: number;
  height: number;
  /** Degrees, clockwise, around the box center. */
  rotation: number;
}
export interface TriangleShape extends ShapeBase {
  type: 'triangle';
  width: number;
  height: number;
  rotation: number;
  rightAngle: Corner;
}
/**
 * Freeform outline (closed) or line (open). Points are in feet, relative to
 * (x, y), and kept normalized so the smallest x and y are 0: (x, y) is the
 * top-left of the unrotated bounding box. Rotation (degrees, clockwise)
 * turns the points around that box's center, like the other shapes; editing
 * points first bakes the rotation into them.
 */
export interface PathShape<T extends 'poly' | 'line' = 'poly' | 'line'> extends ShapeBase {
  type: T;
  points: [number, number][];
  rotation: number;
  /** Lines: show the length on the plan (dimension lines). */
  showLength?: boolean;
  /**
   * Lines: drawn as a band this many feet wide (paths, driveways). Unset =
   * a thin line, as fences and measurements have always been drawn.
   */
  pathWidth?: number;
}
/**
 * A text note on the plan. The text is `label`; (x, y) is the top-left of its
 * box, whose size follows from the text and `fontSize` (feet, so it scales
 * with the plan and prints at the right size).
 */
export interface TextShape extends ShapeBase {
  type: 'text';
  fontSize: number;
  rotation: number;
}
export type PolyShape = PathShape<'poly'>;
export type LineShape = PathShape<'line'>;
export type RectShape = BoxShape<'rect'>;
export type OvalShape = BoxShape<'oval'>;
export type Shape = CircleShape | RectShape | OvalShape | TriangleShape | PolyShape | LineShape | TextShape;
/** Any subset of fields from any shape kind (used by property editors). */
export type ShapePatch = Partial<Omit<CircleShape, 'type'> & Omit<BoxShape, 'type'> & Omit<TriangleShape, 'type'> & Omit<PathShape, 'type'> & Omit<TextShape, 'type'>>;

export interface BgImage {
  /** Image bytes as a data URL. Kept in memory; stored separately on disk. */
  dataUrl: string;
  /** Key of the stored image record; assigned when the image is first saved. */
  imageId?: string;
  naturalWidth: number;
  naturalHeight: number;
  /** World feet per image pixel, set by calibration. */
  ftPerPx: number;
  /** Image center in world feet. */
  cx: number;
  cy: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  /** SHA-256 of the image bytes (hex), once known. Sync names the photo by it. */
  fingerprint?: string;
  /** Keep this photo on this device: the project syncs without it. */
  deviceOnly?: boolean;
}
/**
 * A project's background photo as sync carries it: the photo's fingerprint and
 * how it sits on the plan, or a note that it's kept on one device only.
 */
export type PhotoRef =
  | { fingerprint: string; naturalWidth: number; naturalHeight: number; ftPerPx: number; cx: number; cy: number; rotation: number; opacity: number; visible: boolean }
  | { deviceOnly: true };

export interface ProjectMeta {
  id: string;
  name: string;
  lastModified: number;
  shapeCount?: number;
}
/** Plants drawn at the middle of their size range, or at full (maximum) size. */
export type SizeMode = 'typical' | 'full';
export type PaperSize = 'letter' | 'tabloid' | 'a4' | 'a3';
/** Printable-plan options, remembered per project. */
export interface PrintSettings {
  paper: PaperSize;
  orientation: 'auto' | 'portrait' | 'landscape';
  /** Title on the sheet; empty = the project name. */
  title: string;
  /** A line under the title (address, designer, notes). */
  subtitle: string;
  includeBackground: boolean;
  includeGrid: boolean;
  includePlantList: boolean;
  /** Dashed rings at full size around plants drawn smaller. */
  includeFullRings: boolean;
  /** Direction of north on the plan, degrees clockwise from straight up. */
  northDeg: number;
  /** Only plants with this status ('' = all but gone). */
  statusFilter: '' | Status;
  /** Only plants in this phase ('' = all). */
  phaseFilter: string;
}
/** Everything stored for one project. */
export interface ProjectData {
  shapes: Shape[];
  /** Hidden/locked state per role. */
  roleViews?: RoleViews;
  print?: PrintSettings;
  sizeMode?: SizeMode;
  /** Sun warning badges on plants (default on). */
  sunWarnings?: boolean;
  /** Phases of the project, in order ("Fall 2026", "Spring 2027"). */
  phases?: string[];
  /** Where the garden is (from its ZIP): hardiness zone and frost dates. Null: cleared; absent: never set. */
  location?: GardenLocation | null;
  zoom: number;
  offsetX: number;
  offsetY: number;
  bgImage?: BgImage | null;
  /**
   * The synced plan's photo when it isn't on this device: kept on another
   * device, or not downloaded yet. Null when there's no photo, or it's here.
   */
  photoElsewhere?: PhotoRef | null;
}

export interface HistorySnapshot {
  shapes: Shape[];
  bgImage: BgImage | null;
  /** The synced photo not on this device at that step (so undo never makes it look removed). */
  photoElsewhere?: PhotoRef | null;
}

export interface Clipboard {
  shapes: Omit<Shape, 'id'>[];
  sourceProjectId: string | null;
  timestamp: number;
}

export interface Point { x: number; y: number }
export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

export type PanelName =
  | 'props' | 'arrange' | 'layers' | 'projects' | 'rename' | 'export'
  | 'preview' | 'reset' | 'plants' | 'bg' | 'bgDistance' | 'print' | 'plantForm' | 'bloom' | 'add' | 'shortcuts' | 'location';
/** What the plant form is doing: a new plant (maybe from a search or a copy), or editing one of yours. */
export interface PlantFormArgs { editId?: string; name?: string; copyFromId?: string; place: boolean }

export interface RenameArgs {
  renamingId: string | null;
  originalName: string;
  returnTo?: PanelName | null;
}

export interface ExportPreview {
  format: 'png' | 'svg';
  dataUrl: string;
  svgText: string;
  filename: string;
}

export interface Calibration {
  step: 'point1' | 'point2' | 'distance';
  /** Image-pixel coordinates of the tapped points. */
  p1: Point | null;
  p2: Point | null;
}

export interface Marquee { x1: number; y1: number; x2: number; y2: number }

export type Gesture =
  | { type: 'pinch'; startDist: number; startZoom: number; centerScreen: Point; centerFeetAtStart: Point }
  | { type: 'pan'; startX: number; startY: number; startOffset: Point; moved: boolean; tapShapeId?: string }
  | { type: 'marquee'; startX: number; startY: number; startFeet: Point; currentFeet: Point; moved: boolean; tapShapeId?: string }
  | {
      type: 'drag-shape'; id: string; ids: string[]; grabOffset: Point; primaryStart: Point;
      shapeStarts: { id: string; startX: number; startY: number }[];
      startX: number; startY: number; moved: boolean;
    }
  | { type: 'bg-drag'; startX: number; startY: number; grabOffset: Point; startCenter: Point; moved: boolean }
  | { type: 'bg-rot'; startAngle: number; startRotation: number; angleAt: (x: number, y: number) => number }
  | { type: 'bg-calibrate-tap'; startX: number; startY: number; startOffset: Point; moved: boolean }
  | { type: 'drag-vertex'; id: string; index: number; startX: number; startY: number; moved: boolean; inserted: boolean };

/**
 * Adding something by tapping on the plan: the drawing method, the points
 * tapped so far (world feet), and the kind being added (absent for a measurement).
 */
export interface DrawState {
  kind: 'poly' | 'line' | 'path' | 'rect' | 'circle' | 'oval' | 'triangle' | 'note' | 'trunk' | 'canopy' | 'measure';
  points: Point[];
  target?: KindKey;
  /** Center-line method: the path's width in feet (else the kind's default). */
  pathWidth?: number;
  /** Existing tree: the plant it is, when picked from the catalog. */
  plantId?: string;
  /** Each tap: where it landed on another shape (src/tidy.ts), or null. */
  snaps?: (TapSnap | null)[];
  /** Where (screen px) and when the last tap was, so a double tap is told by the finger, not where it landed. */
  lastTap?: { x: number; y: number; t: number };
}
/**
 * A tap or a dragged point that landed on another shape: which shape, its corner or edge there (`seg`, lit while
 * drawing), the directions of its edges there (`angles`, for squaring), and where it would have gone on the
 * grid instead (`alt`, for Unsnap).
 */
export interface TapSnap { to: 'corner' | 'edge'; shapeId: string; seg: [Point, Point]; angles: number[]; alt: Point }
/** Editing the points of one outline/line; `vertex` is the selected point; `snap`, a point dragged onto another shape. */
export interface EditPoints { id: string; vertex: number | null; snap?: TapSnap & { index: number; at: Point } }

export interface AppState {
  projects: ProjectMeta[];
  currentProjectId: string | null;
  shapes: Shape[];
  zoom: number;
  offsetX: number;
  offsetY: number;
  canvasW: number;
  canvasH: number;
  selectedIds: string[];
  selectMode: boolean;
  marquee: Marquee | null;
  history: HistorySnapshot[];
  historyIndex: number;
  panel: PanelName | null;
  panelArgs: RenameArgs | null;
  exportPreview: ExportPreview | null;
  menu: 'more' | null;
  bgImage: BgImage | null;
  /** The open plan's synced photo that isn't on this device (see ProjectData). */
  photoElsewhere: PhotoRef | null;
  /** The open plan's garden location (null: cleared; undefined: never set). */
  location?: GardenLocation | null;
  roleViews: RoleViews;
  print: PrintSettings;
  sizeMode: SizeMode;
  sunWarnings: boolean;
  phases: string[];
  /** View: which plants show (not saved). */
  viewFilter: ShapeFilter;
  /** View: full-size rings on every plant (not saved). */
  showFullSize: boolean;
  /** View: outline plants planted closer than usual (not saved). */
  showCrowding: boolean;
  /**
   * View: names on the plan, with line lengths, sun hours and the badges on plants (not saved). Off, the plan shows
   * its shapes alone, to step back and see it whole; a selected shape still shows its own.
   */
  showNames: boolean;
  /** The add/edit-a-plant form, when open. */
  plantForm: PlantFormArgs | null;
  /** Picker opened to link this shape to a plant. */
  pickerLinkId: string | null;
  /** More shapes to link along with it (several selected: "Link all to a plant…"). */
  pickerLinkAlso: string[];
  /** After linking a circle: the other unlinked circles that had the same label, offered for the same plant. */
  linkOffer: { fromId: string; plantId: string; label: string; ids: string[]; locked: string[] } | null;
  /** "Link all" chosen with the locked circles too. */
  pickerLinkLocked: boolean;
  /** Picker opened from Add, Existing tree: pick the tree (or an unknown one), then draw its canopy. */
  pickerForTree: boolean;
  /** Placing a plant by tapping: the plant in hand and what's been placed so far (not saved). */
  placing: { plantId: string; placed: { id: string; snap: HistorySnapshot }[] } | null;
  bgEditMode: boolean;
  bgCalibrate: Calibration | null;
  draw: DrawState | null;
  editPoints: EditPoints | null;
}
