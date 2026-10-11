// Core data types shared across the app.

export type ShapeType = 'circle' | 'rect' | 'oval' | 'triangle';
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
}
export interface CircleShape extends ShapeBase {
  type: 'circle';
  radius: number;
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
export type RectShape = BoxShape<'rect'>;
export type OvalShape = BoxShape<'oval'>;
export type Shape = CircleShape | RectShape | OvalShape | TriangleShape;
/** Any subset of fields from any shape kind (used by property editors). */
export type ShapePatch = Partial<Omit<CircleShape, 'type'> & Omit<BoxShape, 'type'> & Omit<TriangleShape, 'type'>>;

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
}

export interface ProjectMeta {
  id: string;
  name: string;
  lastModified: number;
  shapeCount?: number;
}
/** Everything stored for one project. */
export interface ProjectData {
  shapes: Shape[];
  /** Hidden/locked state per role. */
  roleViews?: RoleViews;
  zoom: number;
  offsetX: number;
  offsetY: number;
  bgImage?: BgImage | null;
}

export interface HistorySnapshot {
  shapes: Shape[];
  bgImage: BgImage | null;
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
  | 'preview' | 'reset' | 'plants' | 'bg' | 'bgDistance';

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
  | { type: 'bg-calibrate-tap'; startX: number; startY: number; moved: boolean };

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
  roleViews: RoleViews;
  bgEditMode: boolean;
  bgCalibrate: Calibration | null;
}
