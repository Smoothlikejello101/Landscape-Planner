import type { GardenLocation } from './climate';
// Core data types shared across the app.
import type { KindKey } from './kinds';

export type ShapeType = 'circle' | 'rect' | 'oval' | 'triangle' | 'poly' | 'line' | 'text';
/** What a shape represents. Undefined = not yet assigned (shapes from older versions). */
export type Role = 'plant' | 'bed' | 'boundary' | 'building' | 'structure' | 'shade' | 'path' | 'lawn' | 'water' | 'utility' | 'other';
/** (A garden structure, role 'structure': a trellis drawn as a line, an arbor or pergola as an area. What vines climb: src/vines.ts.) */
/** A utility (role 'utility', src/utilities.ts): a line overhead or buried, or a septic drainfield (an area). */
export type UtilityKind = 'overhead' | 'buried' | 'septic';
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
  /**
   * Beds (role 'bed') only: its conditions, as answered, for Plant this bed (Nov 2). Only the answers: the sun worked
   * out from the sun areas over a bed is never stored. Not answered is unset; 'unsure' is an answer (asked: Not sure).
   * `{}` is cleared on purpose (every answer taken away, or taken by Undo), so sync can tell it from a copy an older
   * version sent without the field, and doesn't fill it back. A word or a question a later version adds is kept as it
   * came, unchecked: a reader passes over one it doesn't know. Read and written as src/storage.ts
   * sanitizeBedConditions has it.
   *
   * Plans before Nov 2 have none. A version without it (database version 3 and before) drops it from every plan it
   * saves or syncs; on this device the database version keeps such a page from saving at all (src/db.ts), and through
   * sync each device that has it keeps its own when the server's copy of that bed has none (src/sync/engine.ts
   * withBedConditions). The bed stops being one (its role changed): the field goes with it, in the same step.
   */
  conditions?: BedConditions;
  /** Shade areas: observed direct sun. */
  sun?: SunInfo;
  /**
   * Plants: a sun warning the user dismissed, as its message. Hidden while
   * the warning reads the same; it comes back if the plant moves or the
   * recorded sun changes.
   */
  sunDismissed?: string;
  /** A hardiness warning dismissed for this plant (its words, src/plants.ts hardinessWarning): back if they change. */
  hardyDismissed?: string;
  /** The poison warning this copy was dismissed for (what it said: it comes back if who's in the yard changes); src/dismissals.ts. */
  poisonDismissed?: string;
  /**
   * A fruit-partner warning dismissed for this copy alone (its words, src/fruit-partners.ts fruitNeed): back if they
   * change. Plans before Nov 1 have none (none dismissed). '' when shown again on purpose (Show again, Undo), so sync
   * can tell it from a copy an older version sent without it: a version before Nov 1 drops it from every plan it
   * saves or syncs, even over a newer dismissal; each device that has it keeps its own then (src/sync/engine.ts
   * withFruitDismissals), and the server's copy is without it until one of those sends the plan again.
   */
  fruitDismissed?: string;
  /**
   * What it was added as (src/kinds.ts KindKey: "path", "patio"…), kept when it's renamed; dropped when what it is
   * changes. Shapes from before Oct 30 have none: their kind is worked out (kindOfShape).
   */
  kind?: string;
  /**
   * Utilities: which (an overhead power line, a buried line, a septic field; one a later version adds is kept as it
   * came, unchecked). Kept on one made something else since, which is that again if turned back.
   */
  utility?: UtilityKind;
  /**
   * Plants: the utility warnings dismissed, as which utilities and rules they were (src/utilities.ts issuesKey); ''
   * when shown again on purpose, so sync can tell it from a copy an older version sent without one.
   */
  utilityDismissed?: string;
  /** Where it stands in the real garden (unset = not tracked). */
  status?: Status;
  /** YYYY-MM-DD it went in the ground (status 'planted'). */
  plantedOn?: string;
  /**
   * YYYY-MM-DD it came out or died (status 'gone'): set when marked gone, removed if it's marked otherwise. '' when
   * cleared by hand (so sync can tell it from a copy an older version sent without one).
   */
  goneOn?: string;
  /** A phase of the project this belongs to, e.g. "Fall 2026" (one of the project's phases). */
  phase?: string;
}
/** A bed's sun, answered where no sun area covers it: full sun (6 h and up), part shade (3 to 6 h), shade (under 3). */
export type SunAnswer = 'Full' | 'Part' | 'Shade';
/**
 * A word a later version may have stored where this one asks for one of its own (a bed's conditions): code reading
 * them meets it, and passes over one it doesn't know.
 */
export type LaterWord = string & { readonly laterWord?: never };
/**
 * A bed's conditions, as answered (ShapeBase `conditions`; docs/storage.md). Each question unset until answered.
 * - sun: asked only where no sun area covers the bed: from most to least (the same for a bed that doesn't vary), or
 *   Not sure;
 * - soil: Clay, Loam, Sandy, or Not sure (Jason, Nov 2: all four asked);
 * - moisture: Dry, Average, Wet, or Not sure;
 * - drip: drip irrigated (it lifts only the limits that keep out thirstier plants: Jason, Nov 2); unset when it isn't.
 * A question a later version asks is kept as it came, its answer a word or true (src/storage.ts sanitizeBedConditions):
 * dropped here, it would be lost for everyone the next time this device sends the plan.
 */
export interface BedConditions {
  sun?: { most: SunAnswer | LaterWord; least: SunAnswer | LaterWord } | 'unsure' | LaterWord;
  soil?: 'clay' | 'loam' | 'sand' | 'unsure' | LaterWord;
  moisture?: 'dry' | 'average' | 'wet' | 'unsure' | LaterWord;
  drip?: true;
  /**
   * A question a later version asks. A rule for those versions: its answer must be a word or true, or its question
   * needs a sync guard of its own like withBedConditions; anything else, this version drops, and with its next upload
   * every device loses it. The same goes for a new form of an answer this version asks (a sun with hours, say).
   */
  [later: string]: { most: string; least: string } | string | true | undefined;
}
/**
 * A bed's conditions as this version sets them (setBedConditions): the questions it asks, and only those, so a typo
 * doesn't pass for a later version's question. Drip false is no answer, as unset is.
 */
export interface BedAnswers {
  sun?: { most: SunAnswer; least: SunAnswer } | 'unsure';
  soil?: 'clay' | 'loam' | 'sand' | 'unsure';
  moisture?: 'dry' | 'average' | 'wet' | 'unsure';
  drip?: boolean;
}
/** Planned = not in the ground yet; gone = removed or died (kept as a record, hidden by default). */
/**
 * Where a thing is in its life on the plan (Jason, Oct 31, from round 3): not yet (planned); in the ground, put there
 * by you (planted, with its date) or there before the plan (existing: a house, a fence, an old oak); with a change
 * coming (to move, to remove); gone.
 */
export type Status = 'planned' | 'planted' | 'existing' | 'move' | 'remove' | 'gone';
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
  /**
   * Trees: its height in feet, set by hand (unset = the plant's typical height, or about as tall as it's wide:
   * the plant's spread, or as drawn, with no plant), and how high its lowest branches are, below its height
   * (0 = to the ground; unset = the most its
   * lower limbs can be taken up, a third of its height, or the ground for an evergreen screen). What can
   * grow under it is worked out from them (src/crowding.ts).
   */
  treeHeight?: number;
  lowestBranch?: number;
  /**
   * Plants: the ids of plants it's been left close to on purpose ("Leave it" on a crowding notice): that pair
   * isn't flagged as close or crowded (src/crowding.ts).
   */
  crowdOk?: string[];
  /**
   * Vines: the id of the shape it climbs (a fence or wall line, a building, a tree, a shrub), drawn along it
   * (src/vines.ts); '' when set to grow as a groundcover by hand (and not offered a support again); unset as placed,
   * or set to Nothing (a groundcover, which the app offers a support whenever it's moved near one).
   */
  climbsOn?: string;
  /**
   * A color the user chose for this plant (its properties' Color): with pictures on (src/looks.ts), its leaves are drawn
   * in it. Unset (every plant before Oct 29, and one put back to its default): the catalog's leaf color.
   */
  colorSet?: true;
  /**
   * A flower color chosen for this plant among those its sources list (Jason, Oct 30: a cultivar the catalog doesn't
   * have, or a species that comes in several): its picture's flowers are drawn in it. Unset: the color its sources
   * give most.
   */
  flowerColor?: string;
  /** Ignored for circles; tolerated so old data and patches stay valid. */
  rotation?: number;
}
/** What sits on a shape's edge (src/features.ts): a building's doors and windows, a fence's gates, a deck's steps. */
export type SubFeatureKind = 'door' | 'window' | 'garage' | 'steps' | 'gate' | 'downspout' | 'spigot' | 'ac' | 'meter';
/**
 * A sub-feature: on edge `edge` of its shape's outline (from point `edge` to the next), `at` the share of the way
 * along it (its middle); `width` in feet along the edge, for those that take a stretch of it (a door, not a hose bib).
 */
export interface SubFeature {
  id: string; kind: SubFeatureKind; edge: number; at: number; width?: number;
  /** A door's or gate's hinge: at the other end of its opening from where it starts ('end'), or where it starts (absent). */
  hinge?: 'end';
  /** A door or gate that swings in, into the building or across the line the other way ('in'), or out (absent). */
  swing?: 'in';
}
// (One of a kind this version doesn't know, from a later one, is kept as it came: not drawn, listed or changed, so
// it's still there when the plan is opened on that version again.)
/**
 * Sub-features of a shape with edges. [] where they were all taken off (so a copy from an older version, which
 * doesn't know them and leaves them out, can be told apart: src/sync/engine.ts).
 */
interface Featured { features?: SubFeature[] }
/**
 * A side whose length was typed as a number (Nov 4: so Rescale, a later change, can keep it as measured): which side,
 * and the feet typed. An outline's or a line's side `side` runs from point `side` to the next (an outline's last, to
 * its first); a rectangle's are 0 top, 1 right, 2 bottom, 3 left, as it is before it's turned (both of a pair: its
 * Width is 0 and 2), the order its outline has once it's made one.
 */
export interface MeasuredSide { side: number; ft: number }
/**
 * Sides typed as numbers, from Nov 4 on (nothing is worked out for older shapes): rectangles, outlines and lines only.
 * Each counts only while that side is still the length typed, within 0.05 ft (src/measured.ts measuredSides, the rule
 * in docs/storage.md): a step that changes its length forgets it; adding or taking out a point renumbers the sides
 * after it, and forgets the one split or the two joined. Moving or turning the whole shape keeps them. Absent: none.
 * Read and written as src/storage.ts sanitizeMeasured has it; versions before it (database version 4 and earlier)
 * drop it, and nothing else.
 */
interface Measured { measured?: MeasuredSide[] }
export interface BoxShape<T extends 'rect' | 'oval' = 'rect' | 'oval'> extends ShapeBase, Featured, Measured {
  type: T;
  width: number;
  height: number;
  /** Degrees, clockwise, around the box center. */
  rotation: number;
}
export interface TriangleShape extends ShapeBase, Featured {
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
export interface PathShape<T extends 'poly' | 'line' = 'poly' | 'line'> extends ShapeBase, Featured, Measured {
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
  /**
   * Not calibrated yet: its scale is the first guess, not a measurement (Oct 30: Grace's photo, left half calibrated,
   * read "Current scale: 10.0 pixels per foot" after a reload as if measured). Unset once calibrated, and for photos
   * from before Oct 30, which may well have been.
   */
  uncalibrated?: true;
  /**
   * Its scale was set from a length said to be a rough guess (Nov 4, Jason on #209: "We should still build the 'rough'
   * checkbox during calibration so they get a reminder about it later"): Layers marks it "Rough scale" until the scale
   * is set again without it. Set and cleared only by setting the scale, so it goes with that scale (Undo takes it back
   * with it). Never with `uncalibrated`: a scale not set yet isn't rough, it's not set (that one wins, if both came).
   * Photos before Nov 4 have none. Versions before it (database version 4 and earlier) drop it, and nothing else; sync
   * keeps this device's when the server's copy of the same photo, at the same scale, has none (src/sync/engine.ts
   * withRoughScale).
   */
  roughScale?: true;
}
/**
 * A project's background photo as sync carries it: the photo's fingerprint and
 * how it sits on the plan, or a note that it's kept on one device only.
 */
export type PhotoRef =
  | { fingerprint: string; naturalWidth: number; naturalHeight: number; ftPerPx: number; cx: number; cy: number; rotation: number; opacity: number; visible: boolean; uncalibrated?: true; roughScale?: true }
  | { deviceOnly: true };

export interface ProjectMeta {
  id: string;
  name: string;
  lastModified: number;
  shapeCount?: number;
  /** A plan made from an older tab's unsaved changes, kept beside this one (src/storage.ts keepJournalApart). */
  keptFrom?: string;
}
/** Plants drawn at the middle of their size range, or at full (maximum) size. */
export type SizeMode = 'typical' | 'full';
export type PaperSize = 'letter' | 'tabloid' | 'a4' | 'a3';
/** How paper and pictures draw the plants under taller ones (AppState.printUnder): not part of PrintSettings, per device. */
export type PrintUnder = 'windows' | 'screen';
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
/**
 * Warnings dismissed for a plant across the plan (Jason, Oct 30: dismissed for one, it's dismissed for its other copies
 * and the ones added later): by kind, catalog plant id → what the warning said when dismissed, so it comes back if that
 * changes (a new ZIP, someone new in the yard).
 */
export type PlanDismissals = Partial<Record<DismissKind, Record<string, string>>>;
export type DismissKind = 'hardy' | 'poison' | 'fruit';
/**
 * What's been bought, for the Plant list's ticks (Jason, Nov 1: kept with the plan, so plants bought online at the
 * computer, the rest at the nursery, and a partner's phone all tick the same list). By kind (a catalog plant's id, or
 * one of my plants'): how many are bought, and when that last changed (ms), so two devices' ticks settle kind by kind
 * (src/sync/engine.ts settleParts). How many there are to buy is the plan's own plants: not kept here. An untick is
 * kept as 0, so it reaches the other devices too.
 */
export type PlanBought = Record<string, { n: number; at: number }>;
/**
 * Who's in the yard (src/yard.ts), for this plan (Jason, Nov 1: it's the yard's, not the device's), and whether
 * "Anyone you need to protect?" has been answered for it (with none of the four, too). `at`: when it was last set in
 * the plan (ms). Absent: taken, when plans got their own, from what this device had (and not set since).
 */
export interface PlanHousehold { kids: boolean; dogs: '' | 'hideToxic' | 'nonToxic'; cats: boolean; horses: boolean; answered: boolean; at?: number }
/**
 * Settings → Warnings' switches, kept with the plan since Nov 1 (Jason approved the Warnings mock-ups: "What's checked
 * (and dismissed) goes with this plan, on all your devices"), by the app state's names: crowding rings on the plan, the
 * crowding notice, hardiness, poison and fruit partners. (Sun's was the plan's already: `sunWarnings`.)
 */
export type WarningSwitch = 'showCrowding' | 'crowdWarnings' | 'hardyWarnings' | 'poisonWarnings' | 'fruitWarnings';
/**
 * A plan's warning switches, each on or off, with when it was last switched in the plan (ms), so two devices' switches
 * settle one by one (src/sync/engine.ts settleSwitches). No `at`: taken, when plans got their own, from what this device
 * had (and not switched since). One missing reads as this device has it (src/view-settings.ts).
 */
export type PlanSwitches = Partial<Record<WarningSwitch, { on: boolean; at?: number }>>;

export interface ProjectData {
  shapes: Shape[];
  /** Hidden/locked state per role. */
  roleViews?: RoleViews;
  print?: PrintSettings;
  sizeMode?: SizeMode;
  /** Sun warning badges on plants (default on). */
  sunWarnings?: boolean;
  /** Hardiness, poison and fruit-partner warnings dismissed for a plant, all its copies (absent: never any; then kept, if empty). */
  dismissed?: PlanDismissals;
  /** The Plant list's ticks: how many of each kind are bought (absent: never any; then kept, all unticked too). */
  bought?: PlanBought;
  /** Who's in the yard (absent: a plan from before plans kept one; read as this device had it: src/yard.ts). */
  household?: PlanHousehold;
  /** Settings → Warnings' switches (absent: a plan from before plans kept them; read as this device had them). */
  switches?: PlanSwitches;
  /** Phases of the project, in order ("Fall 2026", "Spring 2027"). */
  phases?: string[];
  /** Where the garden is (from its ZIP): hardiness zone and frost dates. Null: cleared; absent: never set. */
  location?: GardenLocation | null;
  /**
   * Layers → Show plants: the status and phase shown, kept with the plan on this device as its zoom is (Jason, Oct 31,
   * from round 3: Jordan and Priya found it reset by a reload, while hidden layers stayed). Not synced. Absent: none.
   */
  viewFilter?: ShapeFilter;
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
  /** What the step did, when it says ("delete Front bed"): src/history.ts. Never stored. */
  label?: string;
  /**
   * A step that narrowed a warning dismissed across the plan to the copies there then ("Just these 2": src/dismissals.ts
   * warnForNewOnes): that dismissal, as it was kept. Undo puts it back, Redo takes it away again (the plan's dismissals
   * are otherwise kept apart from the steps). `putBack`: the last Undo put it back (not so where one was made across
   * the plan since), so Redo takes it away; never stored.
   */
  narrowed?: { kind: DismissKind; plantId: string; said: string; putBack?: boolean };
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
  | 'preview' | 'reset' | 'plants' | 'bg' | 'bgDistance' | 'print' | 'plantForm' | 'bloom' | 'add' | 'shortcuts' | 'location' | 'switchPlant' | 'feedback' | 'settings' | 'whatsNew' | 'warnings' | 'plantList' | 'help'
  /** A bed's conditions, from the picker's bed box (Plant this bed: src/ui/bed-conditions.ts). */
  | 'bedConditions';
/** What the plant form is doing: a new plant (maybe from a search or a copy), or editing one of yours. */
/**
 * `name`, `botanical`: typed already (kept when starting from a plant). `back`: the panel to go back to when the form is
 * done or closed (it was opened from there: the bloom calendar).
 */
export interface PlantFormArgs { editId?: string; name?: string; botanical?: string; copyFromId?: string; place: boolean; back?: PanelName }

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
  /** The length about to be typed is a rough guess (its box's checkbox, kept here so a redraw keeps it). Never stored. */
  rough?: boolean;
}

export interface Marquee { x1: number; y1: number; x2: number; y2: number }

export type Gesture =
  | { type: 'pinch'; startDist: number; startZoom: number; centerScreen: Point; centerFeetAtStart: Point }
  // (`look`: the plan behind the plant picker, which only pans: a tap there does nothing. src/ui/picker-view.ts.)
  | { type: 'pan'; startX: number; startY: number; startOffset: Point; moved: boolean; tapShapeId?: string; overShape?: boolean; look?: boolean }
  // (`add`: Shift, Ctrl or Cmd held: a tap toggles one shape and a box adds what it touches; the rest stays selected.)
  | { type: 'marquee'; startX: number; startY: number; startFeet: Point; currentFeet: Point; moved: boolean; tapShapeId?: string; add?: boolean }
  | {
      type: 'drag-shape'; id: string; ids: string[]; grabOffset: Point; primaryStart: Point;
      shapeStarts: { id: string; startX: number; startY: number }[];
      startX: number; startY: number; moved: boolean;
    }
  | { type: 'bg-drag'; startX: number; startY: number; grabOffset: Point; startCenter: Point; moved: boolean }
  | { type: 'bg-rot'; startAngle: number; startRotation: number; angleAt: (x: number, y: number) => number }
  | { type: 'bg-calibrate-tap'; startX: number; startY: number; startOffset: Point; moved: boolean }
  /** `atX`, `atY`: where the pointer is now (client px), for the numbers kept clear of a finger (src/draw.ts). */
  | { type: 'drag-vertex'; id: string; index: number; startX: number; startY: number; atX: number; atY: number; moved: boolean; inserted: boolean }
  // A sub-feature dragged along its shape's edges (src/features.ts): `start`, the shape's sub-features as it began.
  // A sub-feature dragged along its shape's edges: `grab`, where on it it was pressed (feet from its middle);
  // `historyAt`, the undo step it began on (an Undo mid-drag ends it).
  | { type: 'drag-feature'; id: string; featureId: string; start: SubFeature[]; grab: Point; historyAt: number; startX: number; startY: number; moved: boolean }
  // A handle on the selected shape (src/handles.ts): `start`, the shape as the drag began; `carried`, a bed's plants
  // as they were (they turn with it); `grab`, where on the handle it was pressed (feet from its point); `historyAt`,
  // the undo step it began at.
  | { type: 'shape-resize'; id: string; handle: 'tl' | 'tr' | 'bl' | 'br' | 'radius'; start: Shape; carried: Shape[]; grab: Point; startX: number; startY: number; moved: boolean; historyAt: number }
  | { type: 'shape-rotate'; id: string; start: Shape; carried: Shape[]; center: Point; startAngle: number; startX: number; startY: number; moved: boolean; historyAt: number };

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
  /** Once it's finished, go on to add its doors, windows, gates or steps (the drawing bar's switch, off to start). */
  thenFeatures?: boolean;
  /** A length typed for the next side (feet): the next tap gives only its direction (src/draw-numbers.ts). */
  typed?: number;
  /** Each tap: true where it went down at a typed length (squaring leaves it where it is). */
  exact?: boolean[];
  /**
   * The sides typed so far: from tap `from` to the next (the first, for an outline closed by its typed side), and the
   * feet typed. Kept with the shape once it's made (its `measured`, src/measured.ts markTypedSides).
   */
  typedSides?: { from: number; ft: number }[];
}
/**
 * A tap or a dragged point that landed on another shape: which shape, its corner or edge there (`seg`, lit while
 * drawing), the directions of its edges there (`angles`, for squaring), and where it would have gone on the
 * grid instead (`alt`, for Unsnap).
 */
export interface TapSnap { to: 'corner' | 'edge'; shapeId: string; seg: [Point, Point]; angles: number[]; alt: Point }
/** Editing the points of one outline/line; `vertex` is the selected point; `snap`, a point dragged onto another shape. */
export interface EditPoints {
  id: string; vertex: number | null; snap?: TapSnap & { index: number; at: Point };
  /** A dragged corner stuck square (src/tidy.ts squareStick): which, and which of its walls. While dragging only. */
  square?: { index: number; walls: ('before' | 'after')[] };
}

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
  /** The open plan's warnings dismissed for a plant, all its copies (src/dismissals.ts); undefined while it never had any. */
  dismissed: PlanDismissals | undefined;
  /** The open plan's Plant list ticks (see ProjectData); undefined while it never had any. */
  bought: PlanBought | undefined;
  /** Who's in the open plan's yard (src/yard.ts household). */
  household: PlanHousehold;
  phases: string[];
  /** View: which plants show (not saved). */
  viewFilter: ShapeFilter;
  /** View: full-size rings on every plant (not saved). */
  showFullSize: boolean;
  /** Plants drawn as illustrations (src/looks.ts), or as plain circles: per device (src/view-settings.ts). */
  plantLooks: boolean;
  /** View: garden over time, the month (1–12) the plants are drawn in; null: in bloom (not saved). */
  month: number | null;
  // The open plan's warning switches (PlanSwitches; src/view-settings.ts), each on unless turned off.
  /** Ring plants planted close (amber) or crowded (red) on the plan. */
  showCrowding: boolean;
  /** A notice as a plant is placed close to another or crowding it. */
  crowdWarnings: boolean;
  /** Warnings for a plant too cold or too warm where the garden is: placing, and a badge on the plan. */
  hardyWarnings: boolean;
  /** Warnings for plants poisonous to the people and pets in the yard (src/yard.ts): rows, the plan, the plant. */
  poisonWarnings: boolean;
  /** A notice as a plant is placed that needs a partner to fruit, until the plan has one (src/fruit-partners.ts). */
  fruitWarnings: boolean;
  /** When each of the open plan's warning switches was last switched in the plan (ms); absent: taken from this device. */
  switchedAt: Partial<Record<WarningSwitch, number>>;
  /** The + and − zoom buttons shown (src/view-settings.ts): off on a phone unless turned on, on elsewhere. */
  zoomButtons: boolean;
  /**
   * Layers' "See through tall plants" (src/view-settings.ts, per device): every plant `seeThroughFrom` ft or taller
   * drawn see-through on the plan, as all of them 5 ft or taller were until Nov 4. Off: solid (src/canvas.ts).
   */
  seeThroughTall: boolean;
  /** The height (ft) "See through tall plants" goes from: one of SEE_THROUGH_HEIGHTS. */
  seeThroughFrom: number;
  /**
   * On paper and in pictures, the plants under taller ones (src/print.ts, per device): 'windows', each taller plant
   * faded where it covers one; 'screen', as on the screen, solid, the plants under them numbered dots with a key.
   */
  printUnder: PrintUnder;
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
  /** A status tapped for several shapes, some of them flagged: waiting on whether to change those too (ui/status-section.ts). */
  statusAsk: { ids: string[]; key: string } | null;
  /** "Link all" chosen with the locked circles too. */
  pickerLinkLocked: boolean;
  /** Picker opened from Add, Existing tree: pick the tree (or an unknown one), then draw its canopy. */
  pickerForTree: boolean;
  /**
   * Placing a plant by tapping: the plant in hand and what's been placed so far (not saved). `also`: the steps made on a
   * plant since it was placed (a Nudge apart: src/ui/fix-problem.ts), taken back with it.
   */
  placing: { plantId: string; placed: { id: string; snap: HistorySnapshot; also?: HistorySnapshot[] }[]; warnedClose?: boolean; warnedHardy?: string; warnedFruit?: string } | null;
  bgEditMode: boolean;
  bgCalibrate: Calibration | null;
  draw: DrawState | null;
  editPoints: EditPoints | null;
  /**
   * Adding sub-features to a shape by tapping its edges (src/feature-edit.ts): which shape, the kind, those added, and
   * the flips made to the one just added (each with how many had been added then: Undo takes back whichever came last).
   */
  featurePlace: { id: string; kind: SubFeatureKind; added: string[]; flips: { id: string; which: 'hinge' | 'swing'; n: number }[] } | null;
}
