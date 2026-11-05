import { bedOf, carriesPlants } from './beds';
import { drawnOutline, pathSize, rotate, setWorldPoints, shapeArea, shapeBBox, shapeCenter, textSize, worldPoints } from './geometry';
import { measuredSides } from './measured';
import type { BgImage, CircleShape, PathShape, Point, Role, Shape } from './types';

// Rescale with the photo (Jason's answers to the design, Nov 2): when a photo's scale is set again after a plan was
// drawn over it, where each thing on the plan goes if the person chooses to move the plan with the photo. These are
// the rules, with no page in them: src/ui/rescale-card.ts asks, shows them, and makes the move (one ordinary step).
//
// - Things already there (the house, lot lines, fences, the driveway, lawn, utilities, sun areas, old trees, anything
//   marked Existing) follow the photo: their place and size, as traced. Doors and gates keep their share of the way
//   along their wall and their widths (they're kept that way on the shape); notes keep their text size. One unticked
//   on the card (kept as measured: one with sides typed as numbers starts unticked) keeps its size and shape, its
//   middle where it was over the photo.
// - A planned thing touching two things already there, across from each other, keeps its length the other way and
//   takes the width between them, so it touches both (the side bed between the house and the driveway).
// - A planned thing within BESIDE_FT of something already there runs with it (answer 1): its depth out from that thing
//   and its distance from it kept, its length along it in step with it (a bed drawn the length of the house still runs
//   its length).
// - A planned thing touching another planned thing moves with it, so touching edges stay touching.
// - A path drawn as a line keeps its width; each end that touches something stays on it, the points between keeping
//   their share of the way.
// - A planned thing with nothing within BESIDE_FT keeps its size and shape, its middle where it was over the photo.
// - Plants never change size (the circle is the plant's spread): in a bed, their place in it; elsewhere, like any
//   planned thing. An existing tree's canopy follows the photo when it was drawn to it, and keeps its size when it's
//   the catalog's (answer 4: so does any plant marked Existing).
// - Locked and hidden things move by the same rules: locking only stops a drag by hand.
// Only what sits over the photo (where it was) is a tracing; what's off it stays, and planned things beside it with it.

/** "Beside" something: within this many feet of it (Jason's answer 5: "6ft sounds right as a starting place"). */
export const BESIDE_FT = 6;
/** Touching: edges this close (feet), as traced by eye, or overlapping. */
export const TOUCH_FT = 0.5;
/** The question is asked only when something would move farther than this (feet): 3 inches. */
export const ASK_FT = 0.25;
/** Two walls are across from each other when they face each other within about 37°. */
const ACROSS = -0.8;

/** How a photo sits on the plan: what the rules need of it. */
export type Placement = Pick<BgImage, 'cx' | 'cy' | 'rotation' | 'ftPerPx' | 'naturalWidth' | 'naturalHeight'>;
export const placementOf = (bg: Placement): Placement =>
  ({ cx: bg.cx, cy: bg.cy, rotation: bg.rotation || 0, ftPerPx: bg.ftPerPx, naturalWidth: bg.naturalWidth, naturalHeight: bg.naturalHeight });
/** The same placement (a move or turn too small to be one). */
export function samePlacement(a: Placement, b: Placement): boolean {
  return Math.abs(a.cx - b.cx) < 1e-6 && Math.abs(a.cy - b.cy) < 1e-6 && Math.abs((a.rotation || 0) - (b.rotation || 0)) < 1e-6
    && Math.abs(a.ftPerPx - b.ftPerPx) <= 1e-12 * Math.max(1, a.ftPerPx) && a.naturalWidth === b.naturalWidth && a.naturalHeight === b.naturalHeight;
}

// ---------- Maps of the plan ----------
/**
 * A map of the plan, the old to the new: a point's place along `u` from `o` (scaled by `su`) and across it (scaled by
 * `sn`) put at the same along and across from `o2`, along `u2`. The photo's own move is one with su = sn (it grows
 * about its middle and turns); a bed running with a wall scales only along the wall.
 */
export interface Frame { o: Point; o2: Point; u: Point; u2: Point; su: number; sn: number }
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const len = (a: Point) => Math.hypot(a.x, a.y);
const perp = (a: Point): Point => ({ x: -a.y, y: a.x });
const unit = (a: Point): Point => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const along = (a: Point, v: Point, k: number): Point => ({ x: a.x + v.x * k, y: a.y + v.y * k });
const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;
const RIGHT: Point = { x: 1, y: 0 };
export const STAY: Frame = { o: { x: 0, y: 0 }, o2: { x: 0, y: 0 }, u: RIGHT, u2: RIGHT, su: 1, sn: 1 };

export function mapPoint(f: Frame, p: Point): Point {
  const d = sub(p, f.o), a = dot(d, f.u) * f.su, b = dot(d, perp(f.u)) * f.sn, n2 = perp(f.u2);
  return { x: f.o2.x + a * f.u2.x + b * n2.x, y: f.o2.y + a * f.u2.y + b * n2.y };
}
/** A direction (or a length along it) through the map. */
function mapVector(f: Frame, v: Point): Point {
  const a = dot(v, f.u) * f.su, b = dot(v, perp(f.u)) * f.sn, n2 = perp(f.u2);
  return { x: a * f.u2.x + b * n2.x, y: a * f.u2.y + b * n2.y };
}
/** How far the map turns things (degrees, clockwise as the plan has it), in (-180, 180]. */
function turnOf(f: Frame): number {
  return normalDeg((Math.atan2(f.u2.y, f.u2.x) - Math.atan2(f.u.y, f.u.x)) * 180 / Math.PI);
}
function normalDeg(d: number): number {
  let a = ((d % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Math.abs(a) < 1e-9 ? 0 : a;
}
/** What the photo's move does to the plan: what was over a spot on the photo, over that spot again. */
export function photoFrame(from: Placement, to: Placement, rigid = false): Frame {
  const k = rigid ? 1 : to.ftPerPx / from.ftPerPx;
  return { o: { x: from.cx, y: from.cy }, o2: { x: to.cx, y: to.cy }, u: RIGHT, u2: rotate(1, 0, (to.rotation || 0) - (from.rotation || 0)), su: k, sn: k };
}
/** The same turn as `f`, sizes kept, `p` put where `f` puts it: a thing that keeps its size and shape. */
function rigidAt(p: Point, f: Frame): Frame {
  return { o: p, o2: mapPoint(f, p), u: f.u, u2: f.u2, su: 1, sn: 1 };
}

// ---------- What a shape is, for these rules ----------
/** Already there (follows the photo), planned (keeps its size, by what it's beside), or a note (its text size kept). */
export type Part = 'there' | 'planned' | 'note';
const THERE_STATUS = new Set<string>(['existing', 'move', 'remove', 'gone']);
const THERE_ROLES = new Set<Role | undefined>(['building', 'boundary', 'lawn', 'utility', 'shade', 'other', undefined]);
const isDriveway = (s: Shape) => s.role === 'path' && (s.kind === 'driveway' || (!s.kind && s.label.toLowerCase().includes('drive')));
/**
 * From its status, then what it is (src/kinds.ts starts each kind with its status): marked Existing, To move, To remove
 * or Gone, it's there; marked Planned or Planted, it's planned. With none: a tree drawn as one, a building, a fence or
 * lot line, the lawn, a utility, a sun area, a driveway or a plain shape is there; a bed, a path or patio, a structure,
 * a pond or a plant is planned.
 */
export function partOf(s: Shape): Part {
  if (s.type === 'text') return 'note';
  if (s.status && THERE_STATUS.has(s.status)) return 'there';
  if (s.status === 'planned' || s.status === 'planted') return 'planned';
  if (s.type === 'circle' && s.tree) return 'there';
  if (THERE_ROLES.has(s.role) || isDriveway(s)) return 'there';
  return 'planned';
}
/**
 * Something already there that planned things go by: not the ground they're laid on (lawn, sun areas), a note or a
 * plain shape, nor something gone.
 */
function goesBy(s: Shape): boolean {
  return partOf(s) === 'there' && s.status !== 'gone' && !!s.role && s.role !== 'lawn' && s.role !== 'shade' && s.role !== 'other';
}
export interface RescaleOptions {
  /** Things already there unticked on the card: kept as measured. */
  kept?: ReadonlySet<string>;
  /** Whether a plant's size came from the catalog (src/my-plants.ts isDataSized). Default: its sizeFrom says so. */
  catalogSized?: (s: CircleShape) => boolean;
  /** Whether a plant is a tree (src/trees.ts isTree). Default: drawn as one. */
  treeOf?: (s: Shape) => boolean;
}
const sizedByCatalog = (o: RescaleOptions) => o.catalogSized ?? ((s: CircleShape) => s.sizeFrom === 'plant');
const treeIs = (o: RescaleOptions) => o.treeOf ?? ((s: Shape) => s.type === 'circle' && !!s.tree);
/** Whether its size follows the photo when it does: not a plant's (but an existing tree's drawn canopy), nor a note's. */
function sizeFollows(s: Shape, o: RescaleOptions): boolean {
  if (s.type === 'text') return false;
  if (s.type === 'circle' && s.role === 'plant') return treeIs(o)(s) && !sizedByCatalog(o)(s);
  return true;
}

// ---------- Outlines, and how near ----------
/** A shape's outline as drawn (world feet), and whether it's closed: a note's box too. */
export function outline(s: Shape): { pts: Point[]; closed: boolean } {
  const o = drawnOutline(s);
  if (o) return o;
  const t = s as Extract<Shape, { type: 'text' }>, { w, h } = textSize(t), c = shapeCenter(s);
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => { const r = rotate(x, y, t.rotation || 0); return { x: c.x + r.x, y: c.y + r.y }; });
  return { pts, closed: true };
}
/** Half a path's band (a line drawn as a path or a driveway), past its center line. */
const band = (s: Shape) => (s.type === 'line' && s.pathWidth ? s.pathWidth / 2 : 0);
/** Whether any of it sits over the photo where it was. */
export function overPhoto(s: Shape, at: Placement): boolean {
  const hw = (at.naturalWidth * at.ftPerPx) / 2, hh = (at.naturalHeight * at.ftPerPx) / 2, b = band(s);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of outline(s).pts) {
    const q = rotate(p.x - at.cx, p.y - at.cy, -(at.rotation || 0));
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
  }
  return !(maxX + b < -hw || minX - b > hw || maxY + b < -hh || minY - b > hh);
}
const segments = (o: { pts: Point[]; closed: boolean }) => {
  const n = o.pts.length, out: [Point, Point, number][] = [];
  for (let i = 0; i < (o.closed ? n : n - 1); i++) out.push([o.pts[i], o.pts[(i + 1) % n], i]);
  return out;
};
function pointSeg(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a), l2 = dot(ab, ab);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  return len(sub(p, along(a, ab, t)));
}
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
function segSeg(a: Point, b: Point, c: Point, d: Point): number {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s);
  if (Math.abs(den) > 1e-12) {
    const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b));
}
/** Edge to edge (feet), bands counted; 0 where they cross or one lies inside the other's outline. */
function gap(s: Shape, t: Shape): number {
  const a = outline(s), b = outline(t);
  let d = Infinity;
  for (const [p, q] of segments(a)) for (const [r, w] of segments(b)) d = Math.min(d, segSeg(p, q, r, w));
  if (d > 0 && ((b.closed && a.pts.length && pointInPoly(b.pts, a.pts[0])) || (a.closed && b.pts.length && pointInPoly(a.pts, b.pts[0])))) d = 0;
  return Math.max(0, d - band(s) - band(t));
}
function pointInPoly(poly: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
const near = (a: Shape, b: Shape, ft: number) => {
  const p = shapeBBox(a), q = shapeBBox(b);
  return !(p.maxX + ft < q.minX || q.maxX + ft < p.minX || p.maxY + ft < q.minY || q.maxY + ft < p.minY);
};

// ---------- What a planned thing is beside ----------
/** Something already there, as it was and as it goes (its outline's points in the same order both ways). */
interface Anchor { s: Shape; was: { pts: Point[]; closed: boolean }; now: { pts: Point[]; closed: boolean }; band: number; band2: number }
/** Where a planned thing meets one of them: which edge, how near, how much of it runs along the edge, which side. */
interface Contact { a: Anchor; seg: number; d: number; overlap: number; side: number }
function contactWith(s: Shape, o: { pts: Point[]; closed: boolean }, a: Anchor): Contact | null {
  const c = shapeCenter(s), mine = segments(o), b = band(s);
  let best: Contact | null = null;
  for (const [A, B, i] of segments(a.was)) {
    const l = len(sub(B, A));
    if (l < 1e-6) continue;
    let d = Infinity;
    for (const [p, q] of mine) d = Math.min(d, segSeg(p, q, A, B));
    d = Math.max(0, d - b - a.band);
    const u = unit(sub(B, A));
    const ts = o.pts.map((p) => dot(sub(p, A), u));
    const overlap = Math.max(0, Math.min(l, Math.max(...ts)) - Math.max(0, Math.min(...ts)));
    const side = Math.sign(dot(sub(c, A), perp(u))) || 1;
    const cand = { a, seg: i, d, overlap, side };
    if (!best || better(cand, best)) best = cand;
  }
  return best;
}
/** Nearer first (to the tenth of a foot), then the one more of it runs along. */
const better = (x: Contact, y: Contact) => Math.round(x.d * 10) < Math.round(y.d * 10) || (Math.round(x.d * 10) === Math.round(y.d * 10) && x.overlap > y.overlap + 1e-9);
/** An edge of an anchor, as it was and as it goes: its ends, and its band's edge on `side`. */
function edgeOf(c: Contact) {
  const { a, seg } = c, n = a.was.pts.length;
  const A = a.was.pts[seg], B = a.was.pts[(seg + 1) % n], A2 = a.now.pts[seg], B2 = a.now.pts[(seg + 1) % n];
  const u = unit(sub(B, A)), u2 = unit(sub(B2, A2));
  return { A, B, A2, B2, u, u2, off: along({ x: 0, y: 0 }, perp(u), c.side * a.band), off2: along({ x: 0, y: 0 }, perp(u2), c.side * a.band2) };
}
/** Running with an edge: along it, in step with it; out from it, as far as it was. */
function runsWith(c: Contact): Frame {
  const e = edgeOf(c);
  const su = len(sub(e.B2, e.A2)) / len(sub(e.B, e.A));
  return { o: add(e.A, e.off), o2: add(e.A2, e.off2), u: e.u, u2: e.u2, su, sn: 1 };
}
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
/** Between two walls across from each other: the width between them taken, so it touches both; along, as it was. */
function between(c1: Contact, c2: Contact, s: Shape): Frame {
  const ctr = shapeCenter(s);
  const at = (c: Contact) => {
    const e = edgeOf(c), ab = sub(e.B, e.A), t = Math.max(0, Math.min(1, dot(sub(ctr, e.A), ab) / dot(ab, ab)));
    return { e, was: add(along(e.A, ab, t), e.off), now: add(along(e.A2, sub(e.B2, e.A2), t), e.off2) };
  };
  const w1 = at(c1), w2 = at(c2);
  const D = dot(sub(w2.was, w1.was), perp(w1.e.u)), D2 = dot(sub(w2.now, w1.now), perp(w1.e.u2));
  return { o: w1.was, o2: w1.now, u: w1.e.u, u2: w1.e.u2, su: 1, sn: Math.abs(D) > 0.05 && D2 / D > 0 ? D2 / D : 1 };
}
/** The way out from an edge toward the shape. */
const facing = (c: Contact) => { const e = edgeOf(c); return along({ x: 0, y: 0 }, perp(e.u), c.side); };

// ---------- A shape put through a map ----------
const turned = (rot: number, turn: number) => (turn ? r3(normalDeg((rot || 0) + turn)) : rot);
/**
 * The shape put where `f` puts it. `keepSize`: its size and shape as they are (a plant, a thing kept as measured, an
 * island), only its middle moved and its turn. Otherwise a map that scales evenly scales it; one that scales only one
 * way stretches a box along its sides as they lie, and an outline or line point by point. A circle can't stretch one
 * way: it keeps its size then. `widthToo`: a path's or driveway's band scales with it (one already there).
 */
export function placeThrough(s: Shape, f: Frame, keepSize: boolean, widthToo = false): Shape {
  const t = JSON.parse(JSON.stringify(s)) as Shape;
  const turn = turnOf(f), even = Math.abs(f.su - f.sn) < 1e-9, k = f.su;
  const c2 = mapPoint(f, shapeCenter(s));
  if (t.type === 'circle') {
    t.x = r3(c2.x); t.y = r3(c2.y);
    const g = !keepSize && even ? k : 1;
    if (g !== 1) { t.radius *= g; if (t.trunk) t.trunk *= g; }
    if (t.canopy && (g !== 1 || turn)) t.canopy = t.canopy.map(([x, y]) => { const r = rotate(x * g, y * g, turn); return [r.x, r.y] as [number, number]; });
    return t;
  }
  if (t.type === 'text') {
    const { w, h } = textSize(t);
    t.x = r3(c2.x - w / 2); t.y = r3(c2.y - h / 2); t.rotation = turned(t.rotation, turn);
    return t;
  }
  if (t.type === 'poly' || t.type === 'line') {
    if (keepSize || even) {
      const g = keepSize ? 1 : k;
      if (g !== 1) {
        t.points = t.points.map(([x, y]) => [r3(x * g), r3(y * g)]);
        if (widthToo && t.pathWidth) t.pathWidth = r3(t.pathWidth * g);
      }
      t.rotation = turned(t.rotation, turn);
      const { w, h } = pathSize(t.points);
      t.x = r3(c2.x - w / 2); t.y = r3(c2.y - h / 2);
    } else {
      const pts = worldPoints(s as PathShape).map((p) => mapPoint(f, p));
      t.rotation = 0;
      setWorldPoints(t, pts);
    }
    return t;
  }
  let w = t.width, h = t.height;
  if (!keepSize) {
    if (even) { w *= k; h *= k; } else {
      w *= len(mapVector(f, rotate(1, 0, t.rotation || 0)));
      h *= len(mapVector(f, rotate(0, 1, t.rotation || 0)));
    }
    t.width = r3(w); t.height = r3(h);
  }
  t.rotation = turned(t.rotation, turn);
  t.x = r3(c2.x - t.width / 2); t.y = r3(c2.y - t.height / 2);
  return t;
}

// ---------- The rules ----------
/** Why a shape goes where it does. `by`: the ids it goes by. */
export interface Why { how: 'follows' | 'measured' | 'between' | 'runs' | 'with' | 'island' | 'bed' | 'path' | 'stays'; by?: string[] }
export interface Placed { shape: Shape; why: Why }
const isPathLine = (s: Shape) => s.type === 'line' && s.role === 'path';

/**
 * Where everything goes, if the plan moves with the photo from `from` to `to`: each shape's id, its new geometry (the
 * shape itself where it stays) and why. Pure: nothing on the plan changes.
 */
export function rescalePlan(shapes: Shape[], from: Placement, to: Placement, opts: RescaleOptions = {}): Map<string, Placed> {
  const T = photoFrame(from, to), kept = opts.kept ?? new Set<string>();
  const over = new Set(shapes.filter((s) => overPhoto(s, from)).map((s) => s.id));
  const out = new Map<string, Placed>(), frames = new Map<string, Frame>();
  const done = (s: Shape, f: Frame, shape: Shape, why: Why) => { frames.set(s.id, f); out.set(s.id, { shape, why }); };

  // Already there, and notes: they follow the photo (or, kept as measured, their middle does).
  for (const s of shapes) {
    const part = partOf(s);
    if (part === 'planned') continue;
    if (!over.has(s.id)) done(s, STAY, s, { how: 'stays' });
    else if (part === 'note') done(s, T, placeThrough(s, T, true), { how: 'follows' });
    else if (sizeFollows(s, opts) && kept.has(s.id)) { const f = rigidAt(shapeCenter(s), T); done(s, f, placeThrough(s, f, true), { how: 'measured' }); }
    else done(s, T, placeThrough(s, T, !sizeFollows(s, opts), true), { how: 'follows' });
  }
  const anchors: Anchor[] = shapes.filter(goesBy).map((s) => {
    const now = out.get(s.id)!.shape;
    return { s, was: outline(s), now: outline(now), band: band(s), band2: band(now) };
  });
  /** Where a planned thing meets the things already there near it, the nearest edge of each. */
  const contacts = (s: Shape): Contact[] => {
    const o = outline(s);
    return anchors.filter((a) => near(s, a.s, BESIDE_FT)).map((a) => contactWith(s, o, a)).filter((c): c is Contact => !!c && c.d <= BESIDE_FT);
  };
  /** By what's already there: between two across from each other, or running with the nearest. Whether it was. */
  const byWhatsThere = (s: Shape): boolean => {
    const cs = contacts(s);
    if (!cs.length) return false;
    const keep = s.role === 'plant' || s.type === 'circle';
    const touching = cs.filter((c) => c.d <= TOUCH_FT);
    let pair: [Contact, Contact] | null = null, most = ACROSS;
    for (let i = 0; i < touching.length; i++) for (let j = i + 1; j < touching.length; j++) {
      const d = dot(facing(touching[i]), facing(touching[j]));
      if (d <= most) { most = d; pair = better(touching[j], touching[i]) ? [touching[j], touching[i]] : [touching[i], touching[j]]; }
    }
    if (pair) { const f = between(pair[0], pair[1], s); done(s, f, placeThrough(s, f, keep), { how: 'between', by: [pair[0].a.s.id, pair[1].a.s.id] }); return true; }
    const best = cs.reduce((x, y) => (better(y, x) ? y : x));
    const f = runsWith(best);
    done(s, f, placeThrough(s, f, keep), { how: 'runs', by: [best.a.s.id] });
    return true;
  };

  const planned = shapes.filter((s) => partOf(s) === 'planned');
  const bedOfPlant = new Map<string, string>();
  for (const s of planned) {
    if (s.role !== 'plant') continue;
    const bed = bedOf(s, shapes);
    if (bed && carriesPlants(bed)) bedOfPlant.set(s.id, bed.id);
  }
  const free = planned.filter((s) => !bedOfPlant.has(s.id) && !isPathLine(s));
  for (const s of free) byWhatsThere(s);
  // Touching another planned thing: with it (the same map, so where they touch, they still do). A plant goes with
  // anything planned; anything else, not with a plant. Then, of what's left, the largest keeps its size and its middle's
  // place over the photo, and what touches it goes with it, and so on.
  const plannedFrame = (s: Shape): { id: string; f: Frame } | null => {
    for (const t of planned) {
      const f = frames.get(t.id);
      if (!f || t.id === s.id || isPathLine(t) || bedOfPlant.has(t.id) || (t.role === 'plant' && s.role !== 'plant')) continue;
      if (near(s, t, TOUCH_FT) && gap(s, t) <= TOUCH_FT) return { id: t.id, f };
    }
    return null;
  };
  let rest = free.filter((s) => !frames.has(s.id));
  while (rest.length) {
    for (let grew = true; grew;) {
      grew = false;
      for (const s of rest) {
        if (frames.has(s.id)) continue;
        const w = plannedFrame(s);
        if (w) { done(s, w.f, placeThrough(s, w.f, s.role === 'plant' || s.type === 'circle'), { how: 'with', by: [w.id] }); grew = true; }
      }
      rest = rest.filter((s) => !frames.has(s.id));
    }
    if (!rest.length) break;
    const s = rest.reduce((a, b) => (sizeOf(b) > sizeOf(a) ? b : a));
    const f = over.has(s.id) ? rigidAt(shapeCenter(s), T) : STAY;
    done(s, f, f === STAY ? s : placeThrough(s, f, true), { how: over.has(s.id) ? 'island' : 'stays' });
    rest = rest.filter((x) => x !== s);
  }
  // Plants in a bed: their place in it.
  for (const [id, bed] of bedOfPlant) {
    const s = shapes.find((x) => x.id === id)!, f = frames.get(bed) ?? STAY;
    done(s, f, f === STAY ? s : placeThrough(s, f, true), { how: 'bed', by: [bed] });
  }
  // Paths drawn as lines: each end that touches something stays on it; the points between keep their share of the way.
  for (const s of planned.filter(isPathLine)) {
    const pts = worldPoints(s as PathShape), ends = [pts[0], pts[pts.length - 1]];
    const on = ends.map((e) => endOn(e, s, shapes, frames));
    if (!on[0] && !on[1]) {
      if (byWhatsThere(s)) continue;
      const f = over.has(s.id) ? rigidAt(shapeCenter(s), T) : STAY;
      done(s, f, f === STAY ? s : placeThrough(s, f, true), { how: over.has(s.id) ? 'island' : 'stays' });
      continue;
    }
    let f: Frame;
    if (on[0] && on[1] && len(sub(ends[1], ends[0])) > 1e-6) {
      const a = mapPoint(on[0].f, ends[0]), b = mapPoint(on[1].f, ends[1]);
      const k = len(sub(b, a)) / len(sub(ends[1], ends[0]));
      f = { o: ends[0], o2: a, u: unit(sub(ends[1], ends[0])), u2: unit(sub(b, a)), su: k, sn: k };
    } else {
      const i = on[0] ? 0 : 1, by = on[i]!;
      f = rigidAt(ends[i], by.f);
    }
    done(s, f, placeThrough(s, f, false), { how: 'path', by: on.map((x) => x?.id ?? '') });
  }
  return out;
}
/** How big a thing is, for which of a cluster keeps its place: its area, or a line's reach. */
const sizeOf = (s: Shape) => { const b = shapeBBox(s); return shapeArea(s) || (b.maxX - b.minX) * (b.maxY - b.minY) * 1e-3; };
/** What a path's end touches (the nearest, within TOUCH_FT or inside it), and its map: not a plant, nor the ground. */
function endOn(e: Point, path: Shape, shapes: Shape[], frames: Map<string, Frame>): { id: string; f: Frame } | null {
  let best: { id: string; f: Frame; d: number } | null = null;
  for (const t of shapes) {
    const f = frames.get(t.id);
    if (!f || t.id === path.id || t.role === 'plant' || isPathLine(t) || (partOf(t) === 'there' ? !goesBy(t) : false) || t.type === 'text') continue;
    const o = outline(t);
    let d = o.closed && pointInPoly(o.pts, e) ? 0 : Infinity;
    for (const [a, b] of segments(o)) d = Math.min(d, pointSeg(e, a, b));
    d = Math.max(0, d - band(t));
    if (d <= TOUCH_FT && (!best || d < best.d)) best = { id: t.id, f, d };
  }
  return best;
}

// ---------- The card's list, and the question's threshold ----------
/** Something already there over the photo whose size follows it: listed on the card, and the lengths typed for it. */
export interface Listed { id: string; typed: number[] }
/**
 * What the card lists: the things already there over the photo whose size would follow it (not a plant that keeps its
 * size, nor a note, nor something gone, which follows the photo unlisted), in plan order. Each with its sides typed as
 * numbers (src/measured.ts), the feet once each: one with any is unticked to start (Jason's answer 3).
 */
export function listedThere(shapes: Shape[], from: Placement, opts: RescaleOptions = {}): Listed[] {
  return shapes.filter((s) => partOf(s) === 'there' && s.status !== 'gone' && sizeFollows(s, opts) && overPhoto(s, from))
    .map((s) => ({ id: s.id, typed: [...new Set(measuredSides(s).map((m) => m.ft))] }));
}
/** The farthest any point of anything goes (feet), from `before` to where `after` puts it. */
export function farthestMove(before: Shape[], after: Map<string, Placed>): number {
  let most = 0;
  for (const s of before) {
    const a = after.get(s.id)?.shape;
    if (!a || a === s) continue;
    const p = outline(s).pts, q = outline(a).pts;
    if (p.length !== q.length) { most = Math.max(most, len(sub(shapeCenter(a), shapeCenter(s)))); continue; }
    for (let i = 0; i < p.length; i++) most = Math.max(most, len(sub(q[i], p[i])));
  }
  return most;
}
/** The ids that move at all (by more than a thousandth of a foot). */
export function movedIds(before: Shape[], after: Map<string, Placed>): Set<string> {
  const ids = new Set<string>();
  for (const s of before) if (farthestMove([s], after) > 1e-3) ids.add(s.id);
  return ids;
}

// ---------- The photo dragged or turned (answer 6: asked, and nothing changed unless they say) ----------
/**
 * Everything over the photo where it was (and the plants in a bed that is), moved and turned by exactly what the photo
 * was, sizes kept: no rules needed. The ids, each with its new geometry; none when nothing sits over the photo.
 */
export function movedWithPhoto(shapes: Shape[], from: Placement, to: Placement): Map<string, Shape> {
  const f = photoFrame(from, to, true);
  const ids = new Set(shapes.filter((s) => overPhoto(s, from)).map((s) => s.id));
  for (const s of shapes) {
    if (s.role !== 'plant' || ids.has(s.id)) continue;
    const bed = bedOf(s, shapes);
    if (bed && carriesPlants(bed) && ids.has(bed.id)) ids.add(s.id);
  }
  return new Map(shapes.filter((s) => ids.has(s.id)).map((s) => [s.id, placeThrough(s, f, true)]));
}
