import { drawnOutline } from './geometry';
import type { Point, Role, Shape, SubFeature, SubFeatureKind } from './types';

// Sub-features (decided with Jason, 2026-10-25): what sits on a building's wall, a fence or a deck's edge. Doors,
// windows, garage doors, steps and gates take a stretch of an edge; downspouts, hose bibs, AC units and meters sit at
// a point on it. Each is kept by its edge and how far along it it is (`edge`, `at`), so it stays on its wall when the
// shape is moved, turned, resized or reshaped point by point.

export interface KindInfo {
  label: string;
  /** Feet along the edge: [default, least, most]. None: it sits at a point. */
  width?: [number, number, number];
  /** What it's added to, by role. */
  hosts: Role[];
}
export const SUB_FEATURES: Record<SubFeatureKind, KindInfo> = {
  door: { label: 'Door', width: [3, 2, 8], hosts: ['building'] },
  window: { label: 'Window', width: [3, 1, 20], hosts: ['building'] },
  garage: { label: 'Garage door', width: [9, 6, 20], hosts: ['building'] },
  steps: { label: 'Steps', width: [4, 2, 20], hosts: ['building', 'path'] },
  gate: { label: 'Gate', width: [4, 2, 20], hosts: ['boundary'] },
  downspout: { label: 'Downspout', hosts: ['building'] },
  spigot: { label: 'Hose bib', hosts: ['building'] },
  ac: { label: 'AC unit', hosts: ['building'] },
  meter: { label: 'Meter', hosts: ['building'] },
};
export const SUB_FEATURE_ORDER: SubFeatureKind[] = ['door', 'window', 'garage', 'steps', 'gate', 'downspout', 'spigot', 'ac', 'meter'];
export const isSubFeatureKind = (v: unknown): v is SubFeatureKind => typeof v === 'string' && Object.hasOwn(SUB_FEATURES, v);
/** The sub-features this version knows (one from a later version is kept, but not drawn, listed or changed). */
export const knownFeatures = (fs: SubFeature[] | undefined): SubFeature[] => (fs ?? []).filter((f) => isSubFeatureKind(f.kind));
/** Most sub-features a shape keeps. */
export const MAX_SUB_FEATURES = 200;

/**
 * What can go on a shape: by its role, and only on an edge it has (not a circle or a note). A path's band takes
 * none, a patio or deck takes steps.
 */
export function kindsFor(s: Shape): SubFeatureKind[] {
  if (!s.role || s.type === 'circle' || s.type === 'text') return [];
  if (s.role === 'path' && s.type === 'line') return [];
  return SUB_FEATURE_ORDER.filter((k) => SUB_FEATURES[k].hosts.includes(s.role!));
}
/** What can go on a shape of this role drawn this way (the drawing bar's switch): none on a path's band. */
export function drawFeatureKinds(role: Role | undefined, method: string): SubFeatureKind[] {
  if (!role || method === 'circle' || method === 'note' || method === 'measure' || method === 'trunk' || method === 'canopy') return [];
  if (role === 'path' && (method === 'path' || method === 'line')) return [];
  return SUB_FEATURE_ORDER.filter((k) => SUB_FEATURES[k].hosts.includes(role));
}
/** How to name what goes on it, for its panel and the drawing bar: "doors, windows and more", "gates", "steps". */
export function kindsPhrase(s: { role?: Role }): string {
  if (s.role === 'building') return 'doors, windows and more';
  if (s.role === 'boundary') return 'gates';
  if (s.role === 'path') return 'steps';
  return '';
}

/** The edges a sub-feature can sit on: the shape's outline as drawn (turned), and whether it closes on itself. */
export function hostOutline(s: Shape): { pts: Point[]; closed: boolean } | null {
  if (s.type === 'circle' || s.type === 'text') return null;
  return drawnOutline(s);
}
export const edgeCount = (o: { pts: Point[]; closed: boolean }) => (o.closed ? o.pts.length : o.pts.length - 1);
/** Whether an outline goes clockwise on screen (y down): its shoelace sum is positive. */
export function turnsClockwise(pts: Point[]): boolean {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; sum += p.x * q.y - q.x * p.y; }
  return sum > 0;
}

/** Where a sub-feature is, in feet: its edge's ends, its center, along the edge and out from the shape (unit vectors). */
export interface FeatureSpot { a: Point; b: Point; mid: Point; u: Point; n: Point; edgeLen: number; span: number; from: Point; to: Point }
/**
 * Where a sub-feature is on its shape, or null (an edge it no longer has: the outline lost points another way). `n`
 * points out of a closed shape (the side a door swings to, steps lead down to), or to the left of a line's direction.
 * A stretch is kept on its edge as drawn (a wall shortened since, or a point put in beside it), not stored moved.
 */
export function featureSpot(s: Shape, f: SubFeature): FeatureSpot | null {
  const o = hostOutline(s);
  if (!o || !isSubFeatureKind(f.kind) || f.edge < 0 || f.edge >= edgeCount(o)) return null;
  const a = o.pts[f.edge], b = o.pts[(f.edge + 1) % o.pts.length];
  const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
  if (edgeLen < 1e-6) return null;
  const u = { x: (b.x - a.x) / edgeLen, y: (b.y - a.y) / edgeLen };
  // (Out of a closed outline by the way round it goes, the same for every edge: a test at the point itself fails at
  // a corner, where it sits on the next wall's line too.)
  const n = !o.closed || turnsClockwise(o.pts) ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
  const span = Math.min(edgeLen, f.width ?? 0);
  const along = Math.max(span / 2, Math.min(edgeLen - span / 2, f.at * edgeLen));
  const mid = { x: a.x + u.x * along, y: a.y + u.y * along };
  const from = { x: mid.x - (u.x * span) / 2, y: mid.y - (u.y * span) / 2 };
  const to = { x: mid.x + (u.x * span) / 2, y: mid.y + (u.y * span) / 2 };
  return { a, b, mid, u, n, edgeLen, span, from, to };
}

/**
 * The nearest place on the shape's edges to `p` (feet): which edge, how far along it (in half-foot steps from its
 * start, and so a stretch of `width` stays on it), and how far `p` is from it.
 */
export function nearestOnEdge(s: Shape, p: Point, width = 0): { edge: number; at: number; dist: number } | null {
  const o = hostOutline(s);
  if (!o) return null;
  let best: { edge: number; at: number; dist: number } | null = null;
  for (let i = 0; i < edgeCount(o); i++) {
    const a = o.pts[i], b = o.pts[(i + 1) % o.pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)));
    const dist = Math.hypot(a.x + (b.x - a.x) * t - p.x, a.y + (b.y - a.y) * t - p.y);
    if (best && dist >= best.dist) continue;
    // (Half-foot steps from the edge's start, kept far enough in that the whole stretch fits, if it can.)
    const half = Math.min(width, len) / 2;
    const along = Math.max(half, Math.min(len - half, Math.round((t * len) / 0.5) * 0.5));
    best = { edge: i, at: Math.round((along / len) * 1e4) / 1e4, dist };
  }
  return best;
}

/** A new sub-feature of a kind, at a place on an edge. */
export function newSubFeature(kind: SubFeatureKind, edge: number, at: number, id: string): SubFeature {
  const w = SUB_FEATURES[kind].width;
  return { id, kind, edge, at, ...(w ? { width: w[0] } : {}) };
}

/**
 * Sub-features after a point is put in after point `after`, `t` of the way along the edge it splits (as projected on
 * it): the edge becomes two, one taking what was before the point, one what was after it, and the edges after it move
 * up one. One right at the point goes to the longer of the two.
 */
export function afterPointAdded(fs: SubFeature[], after: number, t = 0.5): SubFeature[] {
  const cut = Math.max(0.001, Math.min(0.999, Number.isFinite(t) ? t : 0.5));
  return fs.map((f) => {
    if (f.edge < after) return f;
    if (f.edge > after) return { ...f, edge: f.edge + 1 };
    const first = f.at < cut || (f.at === cut && cut >= 0.5);
    return first ? { ...f, at: round4(f.at / cut) } : { ...f, edge: f.edge + 1, at: round4((f.at - cut) / (1 - cut)) };
  });
}
/**
 * Sub-features after point `i` is taken out of an outline whose edges were `lens` long (before): the two edges that
 * met there become one, each sub-feature kept where it was along it; the edges after move down one. On an open
 * line's end point, what was on its end edge goes to the end of the edge left.
 */
export function afterPointDeleted(fs: SubFeature[], i: number, lens: number[], closed: boolean): SubFeature[] {
  const m = lens.length; // (edges before)
  if (!closed && (i === 0 || i === m)) {
    // An end point: its edge goes; what was on it moves to the nearest end of the edge left.
    const gone = i === 0 ? 0 : m - 1;
    return fs.map((f) => {
      if (f.edge !== gone) return i === 0 ? { ...f, edge: f.edge - 1 } : f;
      return i === 0 ? { ...f, edge: 0, at: 0 } : { ...f, edge: m - 2, at: 1 };
    }).filter((f) => f.edge >= 0);
  }
  // The edges into and out of point i: (i - 1) and i, around a closed outline.
  const into = (i - 1 + m) % m, out = i % m;
  const total = lens[into] + lens[out];
  const merged = (f: SubFeature): SubFeature => {
    const along = f.edge === into ? f.at * lens[into] : lens[into] + f.at * lens[out];
    return { ...f, edge: into, at: total > 0 ? round4(along / total) : 0.5 };
  };
  return fs.map((f) => {
    const g = f.edge === into || f.edge === out ? merged(f) : f;
    // Edges after the one taken out move down one; at the wrap (i = 0) the last edge becomes edge m - 2.
    if (i === 0) return g.edge === into ? { ...g, edge: m - 2 } : { ...g, edge: g.edge - 1 };
    return g.edge > out ? { ...g, edge: g.edge - 1 } : g;
  });
}
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Read sub-features as stored, synced or pasted: only well-formed ones, at most 200; [] kept as a choice (none). One
 * of a kind this version doesn't know (a later version's) is kept as it came, its plain values only, so opening and
 * saving a plan here doesn't take it away.
 */
export function sanitizeSubFeatures(raw: unknown): SubFeature[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SubFeature[] = [];
  const ids = new Set<string>();
  for (const f of raw.slice(0, MAX_SUB_FEATURES)) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
    const o = f as Record<string, unknown>;
    if (typeof o.kind !== 'string' || !/^[a-z][a-z0-9-]{0,30}$/.test(o.kind)) continue;
    if (typeof o.id !== 'string' || !o.id || o.id.length > 100 || ids.has(o.id)) continue;
    if (!Number.isInteger(o.edge) || (o.edge as number) < 0 || (o.edge as number) > 10000) continue;
    if (typeof o.at !== 'number' || !Number.isFinite(o.at)) continue;
    ids.add(o.id);
    if (!isSubFeatureKind(o.kind)) {
      const plain = Object.entries(o).filter(([k, v]) => k.length <= 40 && (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 200))).slice(0, 20);
      out.push(Object.fromEntries(plain) as unknown as SubFeature);
      continue;
    }
    const w = SUB_FEATURES[o.kind].width;
    const swings = o.kind === 'door' || o.kind === 'gate';
    out.push({
      id: o.id, kind: o.kind, edge: o.edge as number, at: Math.max(0, Math.min(1, o.at)),
      ...(w ? { width: typeof o.width === 'number' && Number.isFinite(o.width) ? Math.max(w[1], Math.min(w[2], o.width)) : w[0] } : {}),
      // (Which way a door or gate opens: its hinge, its swing. Absent, as before they could be turned: hinged where
      // its opening starts, swinging out.)
      ...(swings && o.hinge === 'end' ? { hinge: 'end' as const } : {}),
      ...(swings && o.swing === 'in' ? { swing: 'in' as const } : {}),
    });
  }
  return out;
}

// ---------- Drawing ----------
export interface FeaturePart { tag: 'line' | 'path' | 'polygon' | 'circle'; attrs: Record<string, string | number> }
/**
 * The colors they're drawn in: muted (Jason, 2026-10-27: they're there to say where things are, and shouldn't
 * draw the eye from the garden). Grays with a little of each one's own color left: water bluish, a meter's tan.
 */
const C = {
  ink: '#64748b', swing: '#94a3b8', opening: '#ffffff',
  glass: '#bfdbe9', frame: '#5b7f93',
  treads: '#eeece9', tread: '#a8a29e',
  pipe: '#9aa5b4', water: '#8ba3bd',
  meter: '#f3efe6', meterInk: '#a08f78',
  unit: '#eef1f4', unitInk: '#94a3b8',
};
/**
 * A sub-feature drawn as plan symbols, in px (`toPx` maps feet; `ppf` px a foot; `k` scales strokes, for print).
 * Doors and gates: the wall opened, the leaf and its swing; windows: glass in the wall; garage doors: a dashed
 * opening; steps: treads out from the edge; downspouts with where the water goes; hose bibs, AC units and meters as
 * small marks out from the wall, never smaller than a few pixels so they show zoomed out.
 */
export function featureParts(s: Shape, f: SubFeature, toPx: (p: Point) => Point, ppf: number, k = 1): FeaturePart[] {
  const at = featureSpot(s, f);
  if (!at) return [];
  const { u, n, mid, span } = at;
  const P = (p: Point) => toPx(p);
  const off = (p: Point, along: number, out: number): Point => ({ x: p.x + u.x * along + n.x * out, y: p.y + u.y * along + n.y * out });
  const xy = (p: Point) => { const q = P(p); return `${q.x},${q.y}`; };
  const line = (a: Point, b: Point, attrs: Record<string, string | number>): FeaturePart => {
    const pa = P(a), pb = P(b);
    return { tag: 'line', attrs: { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, 'stroke-linecap': 'butt', ...attrs } };
  };
  const from = at.from, to = at.to;
  // (A mark's size: its feet, or a few pixels zoomed out; past 25% (6 px a foot), those pixels shrink with the plan,
  // as badges do, so a street of houses isn't all marks.)
  const shrink = ppf >= 6 ? 1 : Math.max(0.4, ppf / 6);
  const atLeast = (ft: number, px: number) => Math.max(ft, (px * shrink) / ppf);
  switch (f.kind) {
    case 'window':
      return [
        line(from, to, { stroke: C.glass, 'stroke-width': Math.max(4 * shrink, 0.35 * ppf) * k }),
        line(from, to, { stroke: C.frame, 'stroke-width': 1.2 * k }),
      ];
    case 'door':
    case 'gate': {
      // The opening, the leaf standing open from its hinge, and the arc it swings through: hinged at either end of
      // the opening, swinging out or in.
      const [hinge, latch] = f.hinge === 'end' ? [to, from] : [from, to];
      const tip = off(hinge, 0, f.swing === 'in' ? -span : span);
      const ph = P(hinge), pa = P(tip), pb = P(latch);
      const r = span * ppf;
      const cross = (pb.x - ph.x) * (pa.y - ph.y) - (pb.y - ph.y) * (pa.x - ph.x);
      return [
        line(from, to, { stroke: C.opening, 'stroke-width': Math.max(4 * shrink, 0.3 * ppf) * k }),
        line(hinge, tip, { stroke: C.ink, 'stroke-width': 1.6 * k }),
        { tag: 'path', attrs: { d: `M${pa.x},${pa.y}A${r},${r} 0 0 ${cross > 0 ? 0 : 1} ${pb.x},${pb.y}`, fill: 'none', stroke: C.swing, 'stroke-width': 1 * k, 'stroke-dasharray': `${3 * k} ${2 * k}` } },
      ];
    }
    case 'garage':
      return [
        line(from, to, { stroke: C.opening, 'stroke-width': Math.max(4 * shrink, 0.3 * ppf) * k }),
        line(off(from, 0, 0.4), off(to, 0, 0.4), { stroke: C.ink, 'stroke-width': 2 * k, 'stroke-dasharray': `${6 * k} ${3 * k}` }),
      ];
    case 'steps': {
      // Three treads, a foot each, out from the edge.
      const depth = 3;
      const parts: FeaturePart[] = [{ tag: 'polygon', attrs: { points: [from, to, off(to, 0, depth), off(from, 0, depth)].map(xy).join(' '), fill: C.treads, stroke: C.tread, 'stroke-width': 1 * k } }];
      for (let t = 1; t < depth; t++) parts.push(line(off(from, 0, t), off(to, 0, t), { stroke: C.tread, 'stroke-width': 1 * k }));
      return parts;
    }
    case 'downspout': {
      // The pipe at the wall, and a dashed arrow where the water runs (about 3 ft out: a splash block's length).
      const d = atLeast(0.5, 7), c = off(mid, 0, d / 2);
      const end = off(mid, 0, d + atLeast(2.5, 18)), pe = P(end), w = atLeast(0.6, 5) * ppf;
      return [
        { tag: 'polygon', attrs: { points: [off(c, -d / 2, -d / 2), off(c, d / 2, -d / 2), off(c, d / 2, d / 2), off(c, -d / 2, d / 2)].map(xy).join(' '), fill: C.pipe, stroke: '#fff', 'stroke-width': 1 * k } },
        line(off(mid, 0, d), end, { stroke: C.water, 'stroke-width': 1.5 * k, 'stroke-dasharray': `${3 * k} ${2 * k}` }),
        { tag: 'path', attrs: { d: `M${pe.x - (n.x * w - u.x * w) / 2},${pe.y - (n.y * w - u.y * w) / 2}L${pe.x},${pe.y}L${pe.x - (n.x * w + u.x * w) / 2},${pe.y - (n.y * w + u.y * w) / 2}`, fill: 'none', stroke: C.water, 'stroke-width': 1.5 * k } },
      ];
    }
    case 'spigot': {
      const r = atLeast(0.35, 5), c = P(off(mid, 0, r));
      return [{ tag: 'circle', attrs: { cx: c.x, cy: c.y, r: r * ppf, fill: C.water, stroke: '#fff', 'stroke-width': 1.5 * k } }];
    }
    case 'meter': {
      const r = atLeast(0.45, 5), c = P(off(mid, 0, r));
      return [
        { tag: 'circle', attrs: { cx: c.x, cy: c.y, r: r * ppf, fill: C.meter, stroke: C.meterInk, 'stroke-width': 1.5 * k } },
        line(off(mid, -r * 0.5, r), off(mid, r * 0.5, r), { stroke: C.meterInk, 'stroke-width': 1.2 * k }),
      ];
    }
    case 'ac': {
      // About 3 ft square, a little out from the wall, with its fan.
      const side = atLeast(3, 10), gap = 0.3;
      const box = [off(mid, -side / 2, gap), off(mid, side / 2, gap), off(mid, side / 2, gap + side), off(mid, -side / 2, gap + side)];
      const c = P(off(mid, 0, gap + side / 2));
      return [
        { tag: 'polygon', attrs: { points: box.map(xy).join(' '), fill: C.unit, stroke: C.unitInk, 'stroke-width': 1.2 * k } },
        { tag: 'circle', attrs: { cx: c.x, cy: c.y, r: side * 0.35 * ppf, fill: 'none', stroke: C.unitInk, 'stroke-width': 1 * k } },
      ];
    }
    default:
      return [];
  }
}
/**
 * Where a sub-feature takes taps (px), invisible: a band along a door, window or gate, the steps themselves, a disc
 * around a point mark. As wide as a line's band (`band`, px: a finger's width close in, a few feet at most zoomed
 * far out, so a pan there moves the plan), or the mark if it's wider.
 */
export function featureHitPart(s: Shape, f: SubFeature, toPx: (p: Point) => Point, ppf: number, band = 18): FeaturePart | null {
  const at = featureSpot(s, f);
  if (!at) return null;
  const { mid, n, u } = at;
  const P = toPx;
  if (SUB_FEATURES[f.kind].width && f.kind !== 'steps') {
    const a = P(at.from), b = P(at.to);
    return { tag: 'line', attrs: { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: 'transparent', 'stroke-width': Math.max(band, 0.6 * ppf), 'stroke-linecap': 'round' } };
  }
  if (f.kind === 'steps' || f.kind === 'ac') {
    const depth = f.kind === 'steps' ? 3 : Math.max(3, 10 / ppf) + 0.3;
    const half = f.kind === 'steps' ? at.span / 2 : Math.max(3, 10 / ppf) / 2;
    const pts = [[-half, 0], [half, 0], [half, depth], [-half, depth]].map(([x, y]) => P({ x: mid.x + u.x * x + n.x * y, y: mid.y + u.y * x + n.y * y }));
    return { tag: 'polygon', attrs: { points: pts.map((q) => `${q.x},${q.y}`).join(' '), fill: 'transparent' } };
  }
  const c = P({ x: mid.x + n.x * 0.4, y: mid.y + n.y * 0.4 });
  return { tag: 'circle', attrs: { cx: c.x, cy: c.y, r: Math.max((band * 2) / 3, 0.6 * ppf), fill: 'transparent' } };
}
/** Parts as SVG text (export and print). */
export function featurePartsSvg(parts: FeaturePart[]): string {
  return parts.map((p) => `<${p.tag} ${Object.entries(p.attrs).map(([a, v]) => `${a}="${v}"`).join(' ')}/>`).join('');
}
