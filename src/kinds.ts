import { FORM_COLORS } from './plants';
import { defaultLook } from './roles';
import { rotate, setWorldPoints } from './geometry';
import type { PathShape, Point, Role, Shape, UtilityKind } from './types';
import { uid } from './util';
import { utilityLook } from './utility-kinds';

// Kinds: what the user adds ("a bed", "a fence"), as opposed to the shape it
// is drawn with. Each kind saves as one of the existing roles with a starting
// label and look, and starts in its natural drawing method. Nothing about the
// kind itself is stored: a patio is a path-role shape labeled Patio.

/** How a shape is drawn, tap by tap. */
export type Method = 'poly' | 'line' | 'path' | 'rect' | 'circle' | 'oval' | 'triangle' | 'note' | 'trunk' | 'canopy';
export type KindKey =
  | 'plant' | 'bed' | 'tree' | 'lawn' | 'trellis' | 'arbor'
  | 'path' | 'patio' | 'driveway'
  | 'building' | 'fence' | 'property'
  | 'powerline' | 'buried' | 'septic'
  | 'sun' | 'water'
  | 'note' | 'measure' | 'plain';

export interface KindDef {
  key: KindKey;
  label: string;
  group: string;
  /** Role the shape is saved with (undefined = plain shape). */
  role?: Role;
  /** Drawing methods, the default first. Empty for plant and measure, which have their own flows. */
  methods: Method[];
  /** Keyboard shortcut (lowercase letter). */
  shortcut?: string;
  /** Starting label; may depend on what's already in the plan. */
  startLabel: (shapes: Shape[]) => string;
  /** Open the properties panel after adding (the point of the thing is in there). */
  openProps?: boolean;
  /** Path width in feet for the center-line method. */
  pathWidth?: number;
  /**
   * Status a new one starts with: things almost always already there are
   * Existing ('planted'); things being designed are Planned. None for sun
   * records, notes and plain shapes.
   */
  startStatus?: 'planned' | 'planted';
  /** A utility: which (stored on the shape, since what's checked near it depends on it: src/utilities.ts). */
  utility?: UtilityKind;
}

const named = (s: string) => () => s;
export const KINDS: KindDef[] = [
  { key: 'plant', label: 'Plant', group: 'Garden', role: 'plant', methods: [], shortcut: 'p', startLabel: named(''), startStatus: 'planned' },
  { key: 'bed', label: 'Bed', group: 'Garden', role: 'bed', methods: ['poly', 'rect', 'circle', 'oval'], shortcut: 'b', startLabel: named('Bed'), startStatus: 'planned' },
  { key: 'tree', label: 'Existing tree', group: 'Garden', role: 'plant', methods: ['trunk', 'canopy'], shortcut: 't', startLabel: named('Tree'), startStatus: 'planted' },
  { key: 'lawn', label: 'Lawn', group: 'Garden', role: 'lawn', methods: ['poly', 'rect'], shortcut: 'l', startLabel: named('Lawn'), startStatus: 'planted' },
  // What vines climb (src/vines.ts; the Backlog's vine plan, Oct 28–29): a trellis, a line a vine bands along; an arbor
  // or pergola, an area a vine covers. Planned to start: a structure is more often built for the plan than there.
  { key: 'trellis', label: 'Trellis', group: 'Garden', role: 'structure', methods: ['line'], startLabel: named('Trellis'), startStatus: 'planned' },
  { key: 'arbor', label: 'Arbor or pergola', group: 'Garden', role: 'structure', methods: ['rect', 'poly'], startLabel: named('Arbor'), startStatus: 'planned' },
  { key: 'path', label: 'Path', group: 'Paths and paving', role: 'path', methods: ['path', 'poly'], shortcut: 'w', startLabel: named('Path'), pathWidth: 3, startStatus: 'planned' },
  { key: 'patio', label: 'Patio or deck', group: 'Paths and paving', role: 'path', methods: ['rect', 'poly'], startLabel: named('Patio'), startStatus: 'planned' },
  { key: 'driveway', label: 'Driveway', group: 'Paths and paving', role: 'path', methods: ['rect', 'poly', 'path'], startLabel: named('Driveway'), pathWidth: 10, startStatus: 'planted' },
  {
    key: 'building', label: 'Building', group: 'Buildings and boundaries', role: 'building', methods: ['rect', 'poly'], shortcut: 'h', startStatus: 'planted',
    // The first building in a plan is almost always the house.
    startLabel: (shapes) => (shapes.some((s) => s.role === 'building') ? 'Building' : 'House'),
  },
  { key: 'fence', label: 'Fence', group: 'Buildings and boundaries', role: 'boundary', methods: ['line'], shortcut: 'f', startLabel: named('Fence'), startStatus: 'planted' },
  // Open by default: a stretch along one neighbor is often all that matters (who draws the far edge of acreage?).
  { key: 'property', label: 'Property line', group: 'Buildings and boundaries', role: 'boundary', methods: ['line', 'poly'], startLabel: named('Property line'), startStatus: 'planted' },
  // Utilities (sub-features part 2, decided with Jason, 2026-10-25): what's near them is checked (src/utilities.ts).
  { key: 'powerline', label: 'Overhead power line', group: 'Utilities', role: 'utility', methods: ['line'], startLabel: named('Power line'), startStatus: 'planted', utility: 'overhead' },
  { key: 'buried', label: 'Buried line', group: 'Utilities', role: 'utility', methods: ['line'], startLabel: named('Buried line'), startStatus: 'planted', utility: 'buried' },
  { key: 'septic', label: 'Septic field', group: 'Utilities', role: 'utility', methods: ['rect', 'poly'], startLabel: named('Septic field'), startStatus: 'planted', utility: 'septic' },
  { key: 'sun', label: 'Sun exposure', group: 'Site conditions', role: 'shade', methods: ['poly', 'circle'], shortcut: 's', startLabel: named(''), openProps: true },
  { key: 'water', label: 'Pond, water', group: 'Site conditions', role: 'water', methods: ['poly', 'circle', 'oval'], startLabel: named('Pond'), startStatus: 'planned' },
  { key: 'note', label: 'Note', group: 'Notes and tools', role: 'other', methods: ['note'], shortcut: 'n', startLabel: named(''), openProps: true },
  { key: 'measure', label: 'Measure', group: 'Notes and tools', methods: [], shortcut: 'm', startLabel: named('') },
  { key: 'plain', label: 'Plain shape', group: 'Notes and tools', methods: ['circle', 'rect', 'oval', 'triangle', 'poly', 'line'], startLabel: named('') },
];
const BY_KEY = Object.fromEntries(KINDS.map((k) => [k.key, k])) as Record<KindKey, KindDef>;
export const kindDef = (k: KindKey): KindDef => BY_KEY[k];
export const isKindKey = (v: unknown): v is KindKey => typeof v === 'string' && v in BY_KEY;
export const KIND_GROUPS = [...new Set(KINDS.map((k) => k.group))];
export function kindForShortcut(key: string): KindDef | undefined {
  const k = key.toLowerCase();
  return KINDS.find((d) => d.shortcut === k);
}

/**
 * The kind a shape was most likely added as (kinds aren't stored: a patio is
 * a path-role shape labeled Patio), for adding another of the same. Plants
 * have their own way (placing), so they're null here.
 */
export function kindOfShape(s: Shape): KindKey | null {
  const label = s.label.toLowerCase();
  if (s.type === 'text') return 'note';
  switch (s.role) {
    case 'plant': return null;
    case 'bed': return 'bed';
    case 'lawn': return 'lawn';
    case 'water': return 'water';
    case 'shade': return 'sun';
    case 'building': return 'building';
    case 'structure': return s.type === 'line' ? 'trellis' : 'arbor';
    case 'boundary': return label.includes('property') ? 'property' : 'fence';
    case 'path':
      if (label.includes('drive')) return 'driveway';
      if (label.includes('patio') || label.includes('deck')) return 'patio';
      if (label.includes('path') || label.includes('walk')) return 'path'; // a path drawn as an outline
      return s.type === 'line' ? 'path' : 'patio';
    case 'utility': return s.utility === 'overhead' ? 'powerline' : s.utility === 'buried' ? 'buried' : s.utility === 'septic' ? 'septic' : 'plain';
    case 'other': return s.type === 'line' && s.showLength ? 'measure' : 'plain';
    default: return 'plain';
  }
}

export const METHOD_LABELS: Record<Method, string> = {
  poly: 'Outline', line: 'Line', path: 'Center line', rect: 'Rectangle', circle: 'Circle', oval: 'Oval', triangle: 'Triangle', note: 'Note',
  trunk: 'Round canopy', canopy: 'Shaped canopy',
};
/** Taps that complete a shape by themselves (null = finish with Done). */
export const TAPS_TO_FINISH: Record<Method, number | null> = {
  poly: null, line: null, path: null, rect: 3, circle: 2, oval: 3, triangle: 3, note: 1, trunk: 2, canopy: null,
};
/** A shaped canopy: the trunk, then at least three points around the edge. */
export const CANOPY_MIN_TAPS = 4;
/** What to tap next, by method and taps so far. */
export function nextTapPrompt(m: Method, taps: number): string {
  switch (m) {
    case 'rect': return ['Tap a corner', 'Tap the next corner along the same side', 'Tap anywhere on the opposite side'][Math.min(taps, 2)];
    // Edge to edge: round things traced off a photo show their edges, not their centers.
    case 'circle': return taps === 0 ? 'Tap one edge' : 'Tap the opposite edge';
    // A tree is the other way round: the trunk is what you know.
    case 'trunk': return taps === 0 ? 'Tap the trunk' : 'Tap the edge of the canopy';
    case 'canopy': return taps === 0 ? 'Tap the trunk' : taps === 1 ? 'Tap around the edge of the canopy' : taps < CANOPY_MIN_TAPS ? 'Tap the next point on the edge' : 'Tap the first edge point, or Done, to finish';
    case 'oval': return ['Tap one end of the long side', 'Tap the other end', 'Tap the edge of the short side'][Math.min(taps, 2)];
    case 'triangle': return ['Tap a corner', 'Tap the second corner', 'Tap the third corner'][Math.min(taps, 2)];
    case 'note': return 'Tap where the note goes';
    case 'poly': return taps === 0 ? 'Tap each corner' : taps < 3 ? 'Tap the next corner' : 'Tap the first point, or Done, to finish';
    case 'line': return taps < 2 ? 'Tap each point along it' : 'Tap the next point, or Done to finish';
    case 'path': return taps < 2 ? 'Tap along the middle of the path' : 'Tap the next bend, or Done to finish';
  }
}

// ---------- Geometry from taps (pure; feet) ----------
const r2 = (v: number) => Math.round(v * 100) / 100 + 0; // + 0 turns -0 into 0
/** The smallest size (feet) a tapped shape can have; smaller taps are ignored. */
export const MIN_SIZE = 0.25;

/** A rectangle from three taps: two corners along one side, then a point on the opposite side. */
export function rectFromTaps(a: Point, b: Point, c: Point): { x: number; y: number; width: number; height: number; rotation: number } | null {
  const ux = b.x - a.x, uy = b.y - a.y;
  const len = Math.hypot(ux, uy);
  if (len < MIN_SIZE) return null;
  const deg = Math.atan2(uy, ux) * 180 / Math.PI;
  const n = rotate(0, 1, deg); // the side's normal
  const d = (c.x - a.x) * n.x + (c.y - a.y) * n.y;
  if (Math.abs(d) < MIN_SIZE) return null;
  const cx = a.x + ux / 2 + n.x * d / 2, cy = a.y + uy / 2 + n.y * d / 2;
  const { width, height, rotation } = levelBox(deg, len, Math.abs(d));
  return { x: r2(cx - width / 2), y: r2(cy - height / 2), width, height, rotation };
}
/**
 * A box's turn kept within 45° either way, its sides swapped to match: a box turned 90° is the same box
 * unturned, its width and height swapped. So a bed started on its short end, tapped top to bottom, is stored
 * unturned (its Rotation 0°, its name level), however its corners were tapped.
 */
function levelBox(deg: number, w: number, h: number): { width: number; height: number; rotation: number } {
  let a = ((deg % 180) + 180) % 180; // (in [0, 180): a box turned half round is the same box)
  let width = w, height = h;
  if (a > 135) a -= 180;
  else if (a > 45) { a -= 90; [width, height] = [h, w]; }
  return { width: r2(width), height: r2(height), rotation: Math.abs(a) < 0.05 ? 0 : Math.round(a * 10) / 10 };
}
/** An oval from the two ends of its long side and a point on the edge of its short side. */
export function ovalFromTaps(a: Point, b: Point, c: Point): { x: number; y: number; width: number; height: number; rotation: number } | null {
  const ux = b.x - a.x, uy = b.y - a.y;
  const len = Math.hypot(ux, uy);
  if (len < MIN_SIZE) return null;
  const deg = Math.atan2(uy, ux) * 180 / Math.PI;
  const n = rotate(0, 1, deg);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const half = Math.abs((c.x - mx) * n.x + (c.y - my) * n.y);
  if (half * 2 < MIN_SIZE) return null;
  const { width, height, rotation } = levelBox(deg, len, half * 2);
  return { x: r2(mx - width / 2), y: r2(my - height / 2), width, height, rotation };
}
/** A circle's radius from its center and a tap on its edge, to the quarter foot. */
export function radiusFromTaps(center: Point, edge: Point): number | null {
  const r = Math.round(Math.hypot(edge.x - center.x, edge.y - center.y) * 4) / 4;
  return r >= MIN_SIZE ? r : null;
}
/** A circle from two opposite points on its edge: centered between them, radius to the quarter foot. */
export function circleFromEdges(a: Point, b: Point): { x: number; y: number; radius: number } | null {
  const r = Math.round(Math.hypot(b.x - a.x, b.y - a.y) * 2) / 4;
  if (r < MIN_SIZE) return null;
  return { x: r2((a.x + b.x) / 2), y: r2((a.y + b.y) / 2), radius: r };
}
/**
 * A shaped canopy from the trunk and the points around its edge: the outline
 * relative to the trunk, and the radius that just contains it (to the quarter foot, rounded up).
 */
export function canopyFromTaps(trunk: Point, edge: Point[]): { canopy: [number, number][]; radius: number } | null {
  if (edge.length < CANOPY_MIN_TAPS - 1) return null;
  const canopy = edge.map((p): [number, number] => [r2(p.x - trunk.x), r2(p.y - trunk.y)]);
  const reach = Math.max(...canopy.map(([x, y]) => Math.hypot(x, y)));
  const radius = Math.ceil(reach * 4 - 1e-9) / 4;
  return radius >= MIN_SIZE ? { canopy, radius } : null;
}
/** Would this tap be accepted as the next point of method `m`? (Size checks only.) */
export function tapAccepted(m: Method, pts: Point[], p: Point): boolean {
  const n = pts.length;
  if (m === 'circle' && n === 1) return circleFromEdges(pts[0], p) != null;
  if (m === 'trunk' && n === 1) return radiusFromTaps(pts[0], p) != null;
  if ((m === 'rect' || m === 'oval') && n === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) >= MIN_SIZE;
  if (m === 'rect' && n === 2) return rectFromTaps(pts[0], pts[1], p) != null;
  if (m === 'oval' && n === 2) return ovalFromTaps(pts[0], pts[1], p) != null;
  if (m === 'triangle' && n === 2) { // not in line with the first two corners
    const area = Math.abs((pts[1].x - pts[0].x) * (p.y - pts[0].y) - (p.x - pts[0].x) * (pts[1].y - pts[0].y)) / 2;
    return area >= MIN_SIZE * MIN_SIZE;
  }
  return true;
}

/** An outline's closing tap may repeat the first point; drop it. */
function closedOutline(pts: Point[]): Point[] {
  const p = pts.slice();
  if (p.length > 3 && p[0].x === p.at(-1)!.x && p[0].y === p.at(-1)!.y) p.pop();
  return p;
}
/** A tree already in the yard is the size it is (not a catalog size), and is drawn with its trunk. */
function treeBits(kind: KindDef): { sizeFrom?: 'manual'; tree?: true } {
  return kind.key === 'tree' ? { sizeFrom: 'manual', tree: true } : {};
}

/** Look for a new shape of this kind and type (colors follow the role, as before). */
export function kindLook(kind: KindDef, type: Shape['type']): { color: string; opacity: number } {
  if (kind.key === 'tree') return { color: FORM_COLORS.Tree, opacity: 0.5 };
  if (kind.utility) return utilityLook(kind.utility);
  return defaultLook(kind.role && kind.key !== 'plain' ? kind.role : 'unassigned', type);
}

/**
 * The shape a finished drawing makes, or null if the taps don't make one yet.
 * `shapes` is the plan so far (for starting labels such as House).
 */
export function buildShape(m: Method, pts: Point[], kind: KindDef, shapes: Shape[], id = uid()): Shape | null {
  const role = kind.key === 'plain' ? undefined : kind.role;
  const base = { id, label: kind.startLabel(shapes), locked: false, ...(role ? { role } : {}), ...(kind.startStatus ? { status: kind.startStatus } : {}), ...(kind.utility ? { utility: kind.utility } : {}) };
  switch (m) {
    case 'rect': case 'oval': {
      if (pts.length < 3) return null;
      const box = m === 'rect' ? rectFromTaps(pts[0], pts[1], pts[2]) : ovalFromTaps(pts[0], pts[1], pts[2]);
      if (!box) return null;
      return { ...base, ...kindLook(kind, m), type: m, ...box } as Shape;
    }
    case 'circle': {
      if (pts.length < 2) return null;
      const c = circleFromEdges(pts[0], pts[1]);
      if (!c) return null;
      return { ...base, ...kindLook(kind, 'circle'), type: 'circle', ...c, ...treeBits(kind) } as Shape;
    }
    case 'trunk': {
      if (pts.length < 2) return null;
      const radius = radiusFromTaps(pts[0], pts[1]);
      if (radius == null) return null;
      return { ...base, ...kindLook(kind, 'circle'), type: 'circle', x: pts[0].x, y: pts[0].y, radius, ...treeBits(kind) } as Shape;
    }
    case 'canopy': {
      const c = canopyFromTaps(pts[0], closedOutline(pts.slice(1)));
      if (!c) return null;
      return { ...base, ...kindLook(kind, 'circle'), type: 'circle', x: pts[0].x, y: pts[0].y, ...c, ...treeBits(kind) } as Shape;
    }
    case 'note': {
      if (pts.length < 1) return null;
      return { ...base, role: 'other', type: 'text', x: pts[0].x, y: r2(pts[0].y - 0.5), fontSize: 1, rotation: 0, color: '#1c1917', opacity: 1 } as Shape;
    }
    case 'poly': case 'triangle': case 'line': case 'path': {
      const closed = m === 'poly' || m === 'triangle';
      const p = closed ? closedOutline(pts) : pts.slice();
      if (p.length < (closed ? 3 : 2)) return null;
      const type = closed ? 'poly' : 'line';
      const shape = {
        ...base, ...kindLook(kind, type), type, x: 0, y: 0, points: [], rotation: 0,
        ...(m === 'path' ? { pathWidth: kind.pathWidth ?? 3 } : {}),
      } as PathShape;
      setWorldPoints(shape, p);
      return shape;
    }
  }
}
