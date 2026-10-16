import { FORM_COLORS } from './plants';
import { defaultLook } from './roles';
import { rotate, setWorldPoints } from './geometry';
import type { PathShape, Point, Role, Shape } from './types';
import { uid } from './util';

// Kinds: what the user adds ("a bed", "a fence"), as opposed to the shape it
// is drawn with. Each kind saves as one of the existing roles with a starting
// label and look, and starts in its natural drawing method. Nothing about the
// kind itself is stored: a patio is a path-role shape labeled Patio.

/** How a shape is drawn, tap by tap. */
export type Method = 'poly' | 'line' | 'path' | 'rect' | 'circle' | 'oval' | 'triangle' | 'note';
export type KindKey =
  | 'plant' | 'bed' | 'tree' | 'lawn'
  | 'path' | 'patio' | 'driveway'
  | 'building' | 'fence' | 'property'
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
}

const named = (s: string) => () => s;
export const KINDS: KindDef[] = [
  { key: 'plant', label: 'Plant', group: 'Garden', role: 'plant', methods: [], shortcut: 'p', startLabel: named('') },
  { key: 'bed', label: 'Bed', group: 'Garden', role: 'bed', methods: ['poly', 'rect', 'circle', 'oval'], shortcut: 'b', startLabel: named('Bed') },
  { key: 'tree', label: 'Existing tree', group: 'Garden', role: 'plant', methods: ['circle'], shortcut: 't', startLabel: named('Tree') },
  { key: 'lawn', label: 'Lawn', group: 'Garden', role: 'lawn', methods: ['poly', 'rect'], shortcut: 'l', startLabel: named('Lawn') },
  { key: 'path', label: 'Path', group: 'Paths and paving', role: 'path', methods: ['path', 'poly'], shortcut: 'w', startLabel: named('Path'), pathWidth: 3 },
  { key: 'patio', label: 'Patio or deck', group: 'Paths and paving', role: 'path', methods: ['rect', 'poly'], startLabel: named('Patio') },
  { key: 'driveway', label: 'Driveway', group: 'Paths and paving', role: 'path', methods: ['rect', 'poly', 'path'], startLabel: named('Driveway'), pathWidth: 10 },
  {
    key: 'building', label: 'Building', group: 'Buildings and boundaries', role: 'building', methods: ['rect', 'poly'], shortcut: 'h',
    // The first building in a plan is almost always the house.
    startLabel: (shapes) => (shapes.some((s) => s.role === 'building') ? 'Building' : 'House'),
  },
  { key: 'fence', label: 'Fence', group: 'Buildings and boundaries', role: 'boundary', methods: ['line'], shortcut: 'f', startLabel: named('Fence') },
  { key: 'property', label: 'Property line', group: 'Buildings and boundaries', role: 'boundary', methods: ['poly'], startLabel: named('Property line') },
  { key: 'sun', label: 'Sun exposure', group: 'Site conditions', role: 'shade', methods: ['poly', 'circle'], shortcut: 's', startLabel: named(''), openProps: true },
  { key: 'water', label: 'Pond, water', group: 'Site conditions', role: 'water', methods: ['poly', 'circle', 'oval'], startLabel: named('Pond') },
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

export const METHOD_LABELS: Record<Method, string> = {
  poly: 'Outline', line: 'Line', path: 'Center line', rect: 'Rectangle', circle: 'Circle', oval: 'Oval', triangle: 'Triangle', note: 'Note',
};
/** Taps that complete a shape by themselves (null = finish with Done). */
export const TAPS_TO_FINISH: Record<Method, number | null> = {
  poly: null, line: null, path: null, rect: 3, circle: 2, oval: 3, triangle: 3, note: 1,
};
/** What to tap next, by method and taps so far. */
export function nextTapPrompt(m: Method, taps: number): string {
  switch (m) {
    case 'rect': return ['Tap a corner', 'Tap the next corner along the same side', 'Tap anywhere on the opposite side'][Math.min(taps, 2)];
    case 'circle': return taps === 0 ? 'Tap the center' : 'Tap the edge';
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
  let deg = Math.atan2(uy, ux) * 180 / Math.PI;
  const n = rotate(0, 1, deg); // the side's normal
  const d = (c.x - a.x) * n.x + (c.y - a.y) * n.y;
  if (Math.abs(d) < MIN_SIZE) return null;
  const cx = a.x + ux / 2 + n.x * d / 2, cy = a.y + uy / 2 + n.y * d / 2;
  // A box turned 180° is the same box: keep the angle in (-90, 90].
  if (deg > 90) deg -= 180;
  else if (deg <= -90) deg += 180;
  const width = r2(len), height = r2(Math.abs(d));
  const rotation = Math.abs(deg) < 0.05 ? 0 : Math.round(deg * 10) / 10;
  return { x: r2(cx - width / 2), y: r2(cy - height / 2), width, height, rotation };
}
/** An oval from the two ends of its long side and a point on the edge of its short side. */
export function ovalFromTaps(a: Point, b: Point, c: Point): { x: number; y: number; width: number; height: number; rotation: number } | null {
  const ux = b.x - a.x, uy = b.y - a.y;
  const len = Math.hypot(ux, uy);
  if (len < MIN_SIZE) return null;
  let deg = Math.atan2(uy, ux) * 180 / Math.PI;
  const n = rotate(0, 1, deg);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const half = Math.abs((c.x - mx) * n.x + (c.y - my) * n.y);
  if (half * 2 < MIN_SIZE) return null;
  if (deg > 90) deg -= 180;
  else if (deg <= -90) deg += 180;
  const width = r2(len), height = r2(half * 2);
  const rotation = Math.abs(deg) < 0.05 ? 0 : Math.round(deg * 10) / 10;
  return { x: r2(mx - width / 2), y: r2(my - height / 2), width, height, rotation };
}
/** A circle's radius from its center and a tap on its edge, to the quarter foot. */
export function radiusFromTaps(center: Point, edge: Point): number | null {
  const r = Math.round(Math.hypot(edge.x - center.x, edge.y - center.y) * 4) / 4;
  return r >= MIN_SIZE ? r : null;
}
/** Would this tap be accepted as the next point of method `m`? (Size checks only.) */
export function tapAccepted(m: Method, pts: Point[], p: Point): boolean {
  const n = pts.length;
  if (m === 'circle' && n === 1) return radiusFromTaps(pts[0], p) != null;
  if ((m === 'rect' || m === 'oval') && n === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) >= MIN_SIZE;
  if (m === 'rect' && n === 2) return rectFromTaps(pts[0], pts[1], p) != null;
  if (m === 'oval' && n === 2) return ovalFromTaps(pts[0], pts[1], p) != null;
  if (m === 'triangle' && n === 2) { // not in line with the first two corners
    const area = Math.abs((pts[1].x - pts[0].x) * (p.y - pts[0].y) - (p.x - pts[0].x) * (pts[1].y - pts[0].y)) / 2;
    return area >= MIN_SIZE * MIN_SIZE;
  }
  return true;
}

/** Look for a new shape of this kind and type (colors follow the role, as before). */
export function kindLook(kind: KindDef, type: Shape['type']): { color: string; opacity: number } {
  if (kind.key === 'tree') return { color: FORM_COLORS['Tree (canopy)'], opacity: 0.5 };
  return defaultLook(kind.role && kind.key !== 'plain' ? kind.role : 'unassigned', type);
}

/**
 * The shape a finished drawing makes, or null if the taps don't make one yet.
 * `shapes` is the plan so far (for starting labels such as House).
 */
export function buildShape(m: Method, pts: Point[], kind: KindDef, shapes: Shape[], id = uid()): Shape | null {
  const role = kind.key === 'plain' ? undefined : kind.role;
  const base = { id, label: kind.startLabel(shapes), locked: false, ...(role ? { role } : {}) };
  switch (m) {
    case 'rect': case 'oval': {
      if (pts.length < 3) return null;
      const box = m === 'rect' ? rectFromTaps(pts[0], pts[1], pts[2]) : ovalFromTaps(pts[0], pts[1], pts[2]);
      if (!box) return null;
      return { ...base, ...kindLook(kind, m), type: m, ...box } as Shape;
    }
    case 'circle': {
      if (pts.length < 2) return null;
      const radius = radiusFromTaps(pts[0], pts[1]);
      if (radius == null) return null;
      return {
        ...base, ...kindLook(kind, 'circle'), type: 'circle', x: pts[0].x, y: pts[0].y, radius,
        // A tree already in the yard is the size it is, not a catalog size.
        ...(kind.key === 'tree' ? { sizeFrom: 'manual' as const } : {}),
      } as Shape;
    }
    case 'note': {
      if (pts.length < 1) return null;
      return { ...base, role: 'other', type: 'text', x: pts[0].x, y: r2(pts[0].y - 0.5), fontSize: 1, rotation: 0, color: '#1c1917', opacity: 1 } as Shape;
    }
    case 'poly': case 'triangle': case 'line': case 'path': {
      const closed = m === 'poly' || m === 'triangle';
      const p = pts.slice();
      // An outline's closing tap may repeat the first point; drop it.
      if (closed && p.length > 3 && p[0].x === p.at(-1)!.x && p[0].y === p.at(-1)!.y) p.pop();
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
