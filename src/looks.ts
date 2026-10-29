import type { Plant } from './plants';
import { formsOf } from './plants';
import { summerLeafColors } from './seasons';

// How a plant is drawn on the plan (Jason, Oct 27–29: the canvas "Plant looks through the year", rounds 1–4): R5c,
// version 3. Leaves set along curving branches (sprigs); in flower, blooms at the outer branch tips, built of the
// sprig's own leaf, shaped by the kind of flower. How much is drawn goes by how big the plant is on the screen: close
// (a radius of 22 px and up: every leaf and bloom), mid (10 to 22 px: the branches and bold blooms, the leaves a soft
// mottle) and yard (under 10 px: its color and a few bold flower spots). Every kind of plant the catalog has gets its
// own drawing (grasses as blades, conifers as needle fans, ferns as fronds…), always inside the plant's circle.
//
// Until "garden over time" brings a month slider (Jason, Oct 29), every plant is drawn in bloom. A plant with no
// leaf color on record is drawn green (Jason: default green). Drawn at the origin, in screen pixels: the caller moves
// it into place. The same plant always draws the same way (`seed`), so it doesn't flicker as the plan redraws.

export type LookLevel = 'close' | 'mid' | 'yard';
export type LookForm = 'shrub' | 'perennial' | 'grass' | 'tree' | 'broadleaf' | 'conifer' | 'vine' | 'annual' | 'bulb' | 'fern' | 'aquatic' | 'cactus';
export type BloomKind = 'cup' | 'bigcup' | 'ball' | 'cone' | 'daisy' | 'spiky' | 'dome' | 'ribbon' | 'cup5' | 'trumpet' | 'lily' | 'spike' | 'plain';
export interface LookPalette {
  base: string; dark: string; light: string;
  /** Its flowers' color, or none: no showy flowers on record. */
  fl?: string;
  /** A bloom's center. */
  eye?: string;
  bloom?: BloomKind;
  evergreen?: boolean;
  /** Needles (a conifer) drawn as fans, or as scale sprays (a cedar or juniper). */
  scale?: boolean;
  /** A variegated plant: its leaves in its light tone more often. */
  variegated?: boolean;
}
export interface Look { form: LookForm; pal: LookPalette }

/** The level a plant is drawn at, by its radius on the screen. */
export function levelOf(rPx: number): LookLevel {
  return rPx >= 22 ? 'close' : rPx >= 10 ? 'mid' : 'yard';
}

// ---------- colors ----------
const hx = (h: string): number[] => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const tohex = (c: number[]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => { const A = hx(a), B = hx(b); return tohex(A.map((v, i) => v * (1 - t) + B[i] * t)); };
/** Darker (t > 0) or lighter (t < 0). */
export const shade = (c: string, t: number) => (t > 0 ? mix(c, '#000000', t) : mix(c, '#ffffff', -t));
const lum = (c: string) => { const [r, g, b] = hx(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
/** A bloom's two tones: its color and a lighter or darker one. */
const tones2 = (fl: string): [string, string] => [fl, lum(fl) > 0.82 ? shade(fl, 0.14) : shade(fl, -0.32)];

/** Leaf colors (src/catalog.ts PART_COLORS and the catalog's leaf words) as drawn. */
const LEAF_HEX: Record<string, string> = {
  green: '#6f9a4a', silver: '#9fae97', 'gray/silver': '#9fae97', gold: '#b5a842', 'gold/yellow': '#b5a842', blue: '#6c8f8a',
  purple: '#6e4a66', 'purple/lavender': '#6e4a66', red: '#8a3d3a', 'red/burgundy': '#8a3d3a', white: '#c9d3b8', copper: '#8f6239',
  'brown/copper': '#8f6239', orange: '#b8702e', pink: '#b07a86', cream: '#c9c79a', 'cream/tan': '#c9c79a', black: '#3b3530',
};
/** Flower colors (src/catalog.ts FLOWER_COLORS) as drawn. */
const FLOWER_HEX: Record<string, string> = {
  white: '#f7f4ec', yellow: '#f2c230', pink: '#e0679f', purple: '#8a62c9', red: '#d7263d', orange: '#f08a24', blue: '#5b7fd6',
  green: '#a8c46a', cream: '#f1e6c4', brown: '#8a5a3a', silver: '#d9dcd6', black: '#3a2a2a', variegated: '#e8b4c8',
};
const EVERGREEN_GREEN = '#3f6b3a';
const palOf = (base: string, extra: Partial<LookPalette> = {}): LookPalette => ({ base, dark: shade(base, 0.38), light: shade(base, -0.4), ...extra });

/**
 * The kind of bloom its flowers are drawn as, from the catalog's flower form (NC State's inflorescence, shape and
 * petals): a head of rays a daisy, a flat cluster a dome, a spike or raceme a spike, a tube or bell a trumpet…
 */
export function bloomKind(p: Pick<Plant, 'flower_form'>): BloomKind {
  const f = p.flower_form ?? {};
  const has = (part: 'inflorescence' | 'shape' | 'petals' | 'size', ...w: string[]) => (f[part] ?? []).some((x) => w.includes(x));
  if (has('inflorescence', 'head')) return has('shape', 'tubular', 'dome') && !has('petals', '7-20', '20+') ? 'ball' : has('shape', 'dome') ? 'cone' : 'daisy';
  if (has('inflorescence', 'umbel', 'corymb')) return 'dome';
  if (has('inflorescence', 'spike', 'raceme')) return has('shape', 'tubular', 'lipped') ? 'spiky' : 'spike';
  if (has('inflorescence', 'panicle')) return 'dome';
  if (has('shape', 'tubular', 'trumpet', 'funnel', 'bell', 'urn')) return 'trumpet';
  if (has('petals', '6', 'tepals') && has('shape', 'star', 'radial', 'cup')) return 'lily';
  if (has('shape', 'cup', 'saucer', 'wheel') && has('petals', '7-20', '20+')) return has('size', '>6') ? 'bigcup' : 'cup';
  if (has('shape', 'cup', 'saucer', 'wheel')) return has('size', '>6') ? 'bigcup' : 'cup5';
  if (has('petals', '4-5') && has('shape', 'star', 'cross') && has('size', '<1')) return 'ribbon';
  if (has('petals', '7-20', '20+')) return 'daisy';
  return 'plain';
}

/** Colors that are a flower's center or its dull parts, not its petals, where it lists others. */
const NOT_PETALS = new Set(['brown', 'green', 'black', 'silver', 'variegated']);
/**
 * The color a plant's flowers are drawn in: one its common name says, if the catalog lists it (purple coneflower,
 * whose species lists every cultivar's colors), else the first it lists that's a petal's color, not a center's.
 */
export function flowerColorOf(common: string, listed: string[]): string | undefined {
  const words = common.toLowerCase().split(/[^a-z]+/);
  return listed.find((c) => !NOT_PETALS.has(c) && words.includes(c)) ?? listed.find((c) => !NOT_PETALS.has(c)) ?? listed[0];
}
/** How a plant is drawn: its kind of drawing and its colors, from its catalog facts (or its shape's color). */
export function lookOf(p: Plant | undefined, shapeColor: string): Look {
  const form0 = p ? formsOf(p)[0] ?? '' : '';
  const evergreen = p?.foliage === 'evergreen';
  // (Its summer leaf color, the dominant one (src/seasons.ts): green unless another color leads; a darker green if
  // evergreen; a plant of the user's own, with no catalog record, its shape's color.)
  const summer = p ? summerLeafColors(p) : { colors: [], variegated: false };
  const variegated = summer.variegated;
  const first = summer.colors[0];
  const base = !p ? shapeColor : first && first !== 'green' && LEAF_HEX[first] ? LEAF_HEX[first] : evergreen ? EVERGREEN_GREEN : LEAF_HEX.green;
  const listed = (p?.flower_color ?? []).filter((c) => c !== 'insignificant' && FLOWER_HEX[c]);
  const insignificant = !!p && (!listed.length || (p.flower_form?.inflorescence ?? []).some((x) => x === 'insignificant' || x === 'catkin'));
  const color = p ? flowerColorOf(p.common ?? '', listed) : undefined;
  const fl = !p || insignificant || !color ? undefined : FLOWER_HEX[color];
  const bloom = p ? bloomKind(p) : 'plain';
  // (A daisy's eye: brown where its colors list brown (a coneflower's cone); dark under yellow or orange rays, as a
  // black-eyed Susan's; gold under others, as an aster's.)
  const eye = bloom === 'daisy' || bloom === 'cone' ? (listed.includes('brown') && color !== 'brown' ? '#6a3f1e' : color === 'yellow' || color === 'orange' ? '#3a2414' : '#e0a82a') : undefined;
  const pal = palOf(base, { fl, eye, bloom, evergreen, variegated, ...(variegated ? { light: '#e9ead2' } : {}) });
  const form: LookForm = (() => {
    switch (form0) {
      case 'Tree': return p?.needles ? 'conifer' : evergreen ? 'broadleaf' : 'tree';
      case 'Shrub': return p?.needles ? 'conifer' : 'shrub';
      case 'Grass/Sedge': return 'grass';
      case 'Vine': return 'vine';
      case 'Annual': return 'annual';
      case 'Bulb': return 'bulb';
      case 'Fern': return 'fern';
      case 'Aquatic/Emergent': return 'aquatic';
      case 'Cactus': case 'Succulent': return 'cactus';
      default: return 'perennial';
    }
  })();
  if (form === 'conifer') pal.scale = (p?.leaf_form?.type ?? []).includes('sheath') ? false : !(p?.leaf_form?.type ?? []).includes('needles');
  return { form, pal };
}

// ---------- marks (in pixels) ----------
const TAU = Math.PI * 2;
const f1 = (v: number) => String(Math.round(v * 10) / 10);
const P = (x: number, y: number) => `${f1(x)} ${f1(y)}`;
type Seg = [number, number, number, number, number, number];
interface Rng { u: (a: number, b: number) => number; r: () => number; pick: <T>(l: T[]) => T; int: (a: number, b: number) => number }
/** A seeded random: the same plant draws the same way every time. */
export function rngOf(seed: string): Rng {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, u: (lo, hi) => lo + (hi - lo) * r(), pick: (l) => l[Math.floor(r() * l.length)], int: (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)) };
}
/** A leaf from (x, y) toward `a`. */
function leaf(x: number, y: number, a: number, ln: number, wd: number, curl = 0): string {
  const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
  const tx = x + dx * ln, ty = y + dy * ln;
  const mx = x + dx * ln * 0.45 + px * curl * ln, my = y + dy * ln * 0.45 + py * curl * ln;
  return `M${P(x, y)} Q${P(mx + px * wd, my + py * wd)} ${P(tx, ty)} Q${P(mx - px * wd, my - py * wd)} ${P(x, y)}Z`;
}
/** A leaf centered on (x, y). */
const leafAt = (x: number, y: number, a: number, ln: number, wd: number, curl = 0) => leaf(x - (Math.cos(a) * ln) / 2, y - (Math.sin(a) * ln) / 2, a, ln, wd, curl);
/** A broad, rounded leaf from its stalk end. */
function roundLeaf(x: number, y: number, a: number, ln: number, wd: number): string {
  const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
  const at = (k: number, s: number) => P(x + dx * ln * k + px * wd * s, y + dy * ln * k + py * wd * s);
  return `M${P(x, y)} C${at(0.15, 1.15)} ${at(0.95, 0.95)} ${P(x + dx * ln, y + dy * ln)} C${at(0.95, -0.95)} ${at(0.15, -1.15)} ${P(x, y)}Z`;
}
const path = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const disc = (x: number, y: number, r: number, col: string, extra = '') => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${col}"${extra}/>`;
// (Its width on the screen whatever the drawing's scale: a big plant drawn scaled up keeps fine limbs.)
const stems = (d: string[], col: string, w: number) => `<path d="${d.join(' ')}" fill="none" stroke="${col}" stroke-width="${f1(w)}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
function inDisc(rng: Rng, r: number, lo = 0, x = 0, y = 0): [number, number] {
  const a = rng.u(0, TAU), t = Math.sqrt(rng.u(lo * lo, 1)) * r;
  return [x + Math.cos(a) * t, y + Math.sin(a) * t];
}
function spaced(rng: Rng, r: number, n: number, gap: number, lo = 0): [number, number][] {
  const pts: [number, number][] = [];
  for (let tries = 0; pts.length < n && tries < 900; tries++) {
    const p = inDisc(rng, r, lo);
    if (pts.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > gap)) pts.push(p);
  }
  return pts;
}
function quad(s: Seg, t: number): [number, number, number] {
  const [sx, sy, cx, cy, ex, ey] = s, u = 1 - t;
  const px = u * u * sx + 2 * u * t * cx + t * t * ex, py = u * u * sy + 2 * u * t * cy + t * t * ey;
  const dx = 2 * u * (cx - sx) + 2 * t * (ex - cx), dy = 2 * u * (cy - sy) + 2 * t * (ey - cy);
  return [px, py, Math.atan2(dy, dx)];
}
/** Curving limbs from near the crown, some forked: path data, the segments, and the tips. */
function branches(rng: Rng, r: number): { d: string[]; segs: Seg[]; tips: [number, number][] } {
  const d: string[] = [], segs: Seg[] = [], tips: [number, number][] = [];
  const n = rng.int(6, 8), a0 = rng.u(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + rng.u(-0.3, 0.3)) * TAU) / n;
    const r0 = r * rng.u(0.08, 0.3), r1 = r * rng.u(0.6, 0.85);
    const sx = Math.cos(a) * r0, sy = Math.sin(a) * r0, ex = Math.cos(a + 0.2) * r1, ey = Math.sin(a + 0.2) * r1;
    const b = rng.pick([-1, 1]) * r * 0.12;
    const cx = (sx + ex) / 2 - Math.sin(a) * b, cy = (sy + ey) / 2 + Math.cos(a) * b;
    d.push(`M${P(sx, sy)} Q${P(cx, cy)} ${P(ex, ey)}`); segs.push([sx, sy, cx, cy, ex, ey]); tips.push([ex, ey]);
    if (rng.r() < 0.5) {
      const mx = (sx + 2 * cx + ex) / 4, my = (sy + 2 * cy + ey) / 4, sa = a + rng.pick([-0.8, 0.8]);
      const fx = mx + Math.cos(sa) * r * 0.2, fy = my + Math.sin(sa) * r * 0.2;
      d.push(`M${P(mx, my)} L${P(fx, fy)}`); segs.push([mx, my, (mx + fx) / 2, (my + fy) / 2, fx, fy]); tips.push([fx, fy]);
    }
  }
  return { d, segs, tips };
}
function blades(rng: Rng, r: number, col: string, n: number, w: number, op = 1): string {
  const d: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = rng.u(0, TAU), ln = r * rng.u(0.6, 0.98), b = rng.pick([-1, 1]) * rng.u(0.1, 0.3);
    d.push(`M0 0 Q${P(Math.cos(a + b) * ln * 0.55, Math.sin(a + b) * ln * 0.55)} ${P(Math.cos(a) * ln, Math.sin(a) * ln)}`);
  }
  return `<path d="${d.join(' ')}" fill="none" stroke="${col}" stroke-width="${f1(w)}" stroke-linecap="round"${op < 1 ? ` opacity="${op}"` : ''}/>`;
}
/** The n outermost branch tips, spaced (the same ones at every size, so a bloom stays put as you zoom). */
function pickTips(tips: [number, number][], n: number): [number, number][] {
  const order = [...tips].sort((p, q) => Math.hypot(q[0], q[1]) - Math.hypot(p[0], p[1]));
  const out: [number, number][] = [];
  for (const t of order) {
    if (out.every((q) => Math.hypot(t[0] - q[0], t[1] - q[1]) > 13)) out.push(t);
    if (out.length === n) break;
  }
  return out;
}
function sprigLeaves(rng: Rng, segs: Seg[], pal: LookPalette, o: { cols?: string[]; ln?: [number, number]; wd?: number; every?: number } = {}): string {
  const { ln = [5, 6.8], wd = 2.8, every = 5 } = o;
  let out = '', side = 1;
  const cols = o.cols ?? [pal.light, shade(pal.base, 0.2), shade(pal.light, -0.12)];
  for (const s of segs) {
    const L = Math.hypot(s[4] - s[0], s[5] - s[1]), k = Math.max(2, Math.floor(L / every));
    for (let j = 0; j < k; j++) {
      const t = 0.22 + (0.76 * j) / Math.max(1, k - 1);
      const [px, py, a] = quad(s, t); side = -side;
      const col = pal.variegated && rng.r() < 0.4 ? pal.light : rng.pick(cols);
      out += path(leaf(px, py, a + side * rng.u(0.55, 0.85), rng.u(ln[0], ln[1]), wd * rng.u(0.9, 1.1)), col);
    }
  }
  return out;
}
/** Mid size: the leaves as a soft mottle of the plant's own tones. */
function mottle(rng: Rng, r: number, pal: LookPalette, n = 7): string {
  return spaced(rng, r * 0.7, n, r * 0.28).map(([px, py]) => disc(px, py, r * rng.u(0.2, 0.3), rng.pick([pal.light, shade(pal.base, 0.15)]), ' opacity="0.55"')).join('');
}
const roundness = (r: number, pal: LookPalette) => disc(-r * 0.18, -r * 0.18, r * 0.62, shade(pal.base, -0.1), ' opacity="0.7"');

// ---------- blooms, of the sprig's own leaf ----------
function bloomOfLeaves(px: number, py: number, ln: number, wd: number, n: number, cols: string[], eye: string | undefined, a0: number, rng: Rng): string {
  let out = '';
  for (let k = 0; k < n; k++) { const a = a0 + (k * TAU) / n; out += path(leaf(px + Math.cos(a) * 0.8, py + Math.sin(a) * 0.8, a, ln * rng.u(0.9, 1.08), wd), cols[k % 2]); }
  return out + (eye ? disc(px, py, ln * 0.24, eye) : '');
}
function headOfLeaves(px: number, py: number, s: number, cols: string[], rng: Rng): string {
  let out = '';
  const a1 = rng.u(0, TAU), a2 = rng.u(0, TAU);
  for (let i = 0; i < 9; i++) { const a = a1 + (i * TAU) / 9; out += path(leaf(px + Math.cos(a) * s * 0.18, py + Math.sin(a) * s * 0.18, a, s * 0.8, s * 0.3), cols[1]); }
  for (let i = 0; i < 6; i++) { const a = a2 + (i * TAU) / 6; out += path(leaf(px, py, a, s * 0.55, s * 0.24), cols[0]); }
  return out + disc(px, py, s * 0.13, shade(cols[0], 0.25));
}
/** One bloom, about `s` across, its kind's shape, built of the style's leaf. */
function bloom(kind: BloomKind | undefined, px: number, py: number, s: number, cols: string[], eye: string | undefined, a0: number, rng: Rng): string {
  const ring = (n: number, fn: (a: number, k: number) => string) => Array.from({ length: n }, (_, k) => fn(a0 + (k * TAU) / n, k)).join('');
  switch (kind) {
    case 'cup': return headOfLeaves(px, py, s * 0.95, cols, rng);
    case 'bigcup': return ring(6, (a, k) => path(leaf(px, py, a, s * 0.62, s * 0.32), cols[k % 2])) + disc(px, py, s * 0.16, '#d8c27a');
    case 'ball': return disc(px, py, s * 0.42, cols[0]) + Array.from({ length: 11 }, (_, i) => disc(px + Math.cos((i * TAU) / 11) * s * 0.36, py + Math.sin((i * TAU) / 11) * s * 0.36, s * 0.09, cols[1])).join('');
    case 'cone': return bloomOfLeaves(px, py, s * 0.55, s * 0.17, 10, cols, undefined, a0, rng) + disc(px, py, s * 0.2, eye ?? '#c4621e');
    case 'daisy': return bloomOfLeaves(px, py, s * 0.52, s * 0.12, 12, cols, undefined, a0, rng) + disc(px, py, s * 0.14, eye ?? '#3a2414');
    case 'spiky': return ring(13, (a, k) => path(leaf(px, py, a, s * rng.u(0.42, 0.56), s * 0.07), cols[k % 2])) + disc(px, py, s * 0.13, shade(cols[0], 0.3));
    case 'dome': {
      let g = '';
      for (let j = 0; j < 16; j++) { const [qx, qy] = inDisc(rng, s * 0.42, 0, px, py); g += path(leafAt(qx, qy, rng.u(0, TAU), s * 0.2, s * 0.09), rng.pick(cols)); }
      return g;
    }
    case 'ribbon': return ring(8, (a, k) => path(leaf(px, py, a, s * 0.5, s * 0.05, rng.u(-0.2, 0.2)), cols[k % 2])) + disc(px, py, s * 0.08, '#d9532b');
    case 'cup5': return bloomOfLeaves(px, py, s * 0.5, s * 0.26, 5, cols, eye, a0, rng);
    case 'trumpet': case 'lily': return bloomOfLeaves(px, py, s * 0.45, s * 0.2, kind === 'trumpet' ? 5 : 6, cols, undefined, a0, rng) + disc(px, py, s * 0.17, eye ?? shade(cols[0], 0.25));
    case 'spike': {
      let g = '';
      for (let j = 0; j < 7; j++) { const t = (j - 3) / 3; g += path(leafAt(px + Math.cos(a0) * t * s * 0.42, py + Math.sin(a0) * t * s * 0.42, a0 + (j % 2 ? 1.2 : -1.2), s * 0.24, s * 0.1), cols[j % 2]); }
      return g;
    }
    default: return bloomOfLeaves(px, py, s * 0.5, s * 0.2, 6, cols, eye, a0, rng);
  }
}
/** The same bloom at mid size: a bold disc in its color, a lighter heart, the eye. */
const midBloom = (px: number, py: number, s: number, cols: string[], eye?: string) => disc(px, py, s * 0.5, cols[0]) + disc(px - s * 0.1, py - s * 0.1, s * 0.24, cols[1]) + (eye ? disc(px, py, s * 0.13, eye) : '');
/** Yard size: bold spots of its flower color, pulled in from the tips. */
const yardSpots = (spots: [number, number][], r: number, cols: string[], k = 0.24) => spots.map(([px, py], i) => disc(px * 0.85, py * 0.85, r * k, cols[i % 2])).join('');

// ---------- each kind of plant ----------
/** A shrub or a perennial (R5c, version 3): sprigs; five bigger blooms at the outer tips, six on a perennial. */
function sprigPlant(rng: Rng, r: number, pal: LookPalette, L: LookLevel, perennial: boolean): string {
  const { d, segs, tips } = branches(rng, r * (perennial ? 0.8 : 1));
  const bl = pickTips(tips, perennial ? 6 : 5);
  const cols = pal.fl ? tones2(pal.fl) : null;
  const s = 16 * (perennial ? 1.05 : 1);
  let out = disc(0, 0, r, pal.base);
  if (L === 'yard') return out + roundness(r, pal) + (cols ? yardSpots(bl.slice(0, 5), r, cols) : '');
  if (L === 'mid') return out + mottle(rng, r, pal) + stems(d, pal.dark, 2) + (cols ? bl.map(([px, py]) => midBloom(px, py, s * 1.15, cols, pal.eye)).join('') : '');
  out += stems(d, pal.dark, perennial ? 1 : 1.4) + sprigLeaves(rng, segs, pal);
  if (cols) for (const [px, py] of bl) out += bloom(pal.bloom, px, py, s, cols, pal.eye, rng.u(0, TAU), rng);
  return out;
}
/** Blades from the crown; in flower, a haze of plume at the blade tips. */
function grass(rng: Rng, r: number, pal: LookPalette, L: LookLevel): string {
  let out = disc(0, 0, r, pal.base);
  const cols = pal.fl ? tones2(pal.fl) : null;
  if (L === 'yard') return out + roundness(r, pal) + (cols ? disc(0, 0, r * 0.95, cols[0], ' opacity="0.8"') + disc(0, 0, r * 0.42, pal.base, ' opacity="0.6"') : '');
  const nb = L === 'close' ? 34 : 16;
  for (const c of [pal.dark, pal.light, shade(pal.base, 0.15)]) out += blades(rng, r, c, Math.floor(nb / 3), L === 'close' ? 1 : 2.2);
  if (cols) {
    if (L === 'close') for (let j = 0; j < 140; j++) { const [px, py] = inDisc(rng, r * 0.98, 0.45); out += path(leafAt(px, py, rng.u(0, TAU), 3.2, 0.9), rng.pick(cols), ' opacity="0.7"'); }
    else for (const [px, py] of spaced(rng, r * 0.95, 22, r * 0.14, 0.4)) out += disc(px, py, r * 0.13, rng.pick(cols), ' opacity="0.75"');
  }
  return out;
}
/** A canopy's ground: faint, so what grows under the tree shows through (the plan's trees always have). */
const CANOPY = ' opacity="0.42"';
/** A deciduous tree: limbs from the trunk at the center, sprigs along them; its blooms at the outer tips. Drawn big
 * (zoomed in, a big tree), a second set of limbs fills the crown. */
function tree(rng: Rng, r: number, pal: LookPalette, L: LookLevel, broadleaf: boolean): string {
  const main = branches(rng, r * 0.95), more = L === 'close' && r > 50 ? branches(rng, r * 0.9) : null;
  const d = [...main.d, ...(more?.d ?? [])], segs = [...main.segs, ...(more?.segs ?? [])];
  const bl = pickTips([...main.tips, ...(more?.tips ?? [])], r > 50 ? 8 : 5);
  const cols = pal.fl ? tones2(pal.fl) : null;
  let out = disc(0, 0, r, pal.base, CANOPY);
  if (L === 'yard') return out + roundness(r, pal) + (cols ? yardSpots(bl.slice(0, 4), r, cols, 0.2) : '');
  if (L === 'mid') return out + mottle(rng, r, pal, 9) + stems(d, pal.dark, 3) + (cols ? bl.map(([px, py]) => midBloom(px, py, 15, cols, pal.eye)).join('') : '');
  out += stems(d, pal.dark, 2.2);
  out += broadleaf
    ? sprigLeaves(rng, segs, pal, { cols: [pal.light, shade(pal.base, -0.15), shade(pal.base, -0.3), '#9a6a3a'], ln: [8, 10.5], wd: 3.8, every: 3.6 })
    : sprigLeaves(rng, segs, pal, { ln: [5.5, 7], wd: 3.4, every: 4.2 });
  if (cols) for (const [px, py] of bl) out += bloom(pal.bloom, px, py, 15, cols, pal.eye, rng.u(0, TAU), rng);
  return out;
}
/** A conifer from above: limbs in whorls, needles as fans along them, or tight scale sprays (a cedar, a juniper). */
function conifer(rng: Rng, r: number, pal: LookPalette, L: LookLevel): string {
  let out = disc(0, 0, r, pal.base, CANOPY);
  if (L === 'yard') return out + roundness(r, pal);
  const main = branches(rng, r * 0.95), more = L === 'close' && r > 50 ? branches(rng, r * 0.9) : null;
  const d = [...main.d, ...(more?.d ?? [])], segs = [...main.segs, ...(more?.segs ?? [])];
  if (L === 'mid') return out + mottle(rng, r, pal, 9) + stems(d, pal.dark, 2.6);
  out += stems(d, pal.dark, 1.8);
  if (pal.scale) {
    for (const s of segs) for (let j = 0; j < 9; j++) {
      const [px, py, a] = quad(s, 0.2 + (0.8 * j) / 8);
      for (const sd of [-1, 1]) out += path(leaf(px, py, a + sd * 0.6, 5.5, 1.5), rng.pick([pal.light, pal.dark, shade(pal.base, 0.15)]));
    }
    return out;
  }
  const nd = shade(pal.base, -0.15);
  for (const s of segs) for (let j = 0; j < 6; j++) {
    const [px, py, a] = quad(s, 0.25 + (0.75 * j) / 5);
    const fan = [-0.9, -0.45, 0, 0.45, 0.9].map((da) => `M${P(px, py)} L${P(px + Math.cos(a + da) * 7.5, py + Math.sin(a + da) * 7.5)}`).join(' ');
    out += `<path d="${fan}" stroke="${rng.pick([nd, shade(nd, -0.25), pal.dark])}" stroke-width="0.8" fill="none" stroke-linecap="round"/>`;
  }
  return out;
}
/** An annual: as a perennial, with more blooms (it flowers all season). */
function annual(rng: Rng, r: number, pal: LookPalette, L: LookLevel): string {
  const { d, segs, tips } = branches(rng, r * 0.85);
  const bl = pickTips(tips, 9);
  const cols = pal.fl ? tones2(pal.fl) : null;
  let out = disc(0, 0, r, pal.base);
  if (L === 'yard') return out + roundness(r, pal) + (cols ? yardSpots(bl.slice(0, 6), r, cols, 0.25) : '');
  if (L === 'mid') return out + mottle(rng, r, pal) + stems(d, pal.dark, 2.2) + (cols ? bl.map(([px, py]) => midBloom(px, py, 13, cols, pal.eye)).join('') : '');
  out += stems(d, pal.dark, 1) + sprigLeaves(rng, segs, pal);
  if (cols) for (const [px, py] of bl) out += bloom(pal.bloom, px, py, 12, cols, pal.eye, rng.u(0, TAU), rng);
  return out;
}
/** A clump of bulbs: strap leaves from the center, blooms held at their tips. */
function bulb(rng: Rng, r: number, pal: LookPalette, L: LookLevel): string {
  let out = disc(0, 0, r, pal.base);
  const cols = pal.fl ? tones2(pal.fl) : null;
  const pts = Array.from({ length: 13 }, () => { const a = rng.u(0, TAU), ln = r * rng.u(0.6, 0.95); return [Math.cos(a) * ln * 0.85, Math.sin(a) * ln * 0.85, a, ln] as const; });
  const bl = pickTips(pts.map((p) => [p[0], p[1]]), 5);
  if (L === 'yard') return out + roundness(r, pal) + (cols ? yardSpots(bl, r, cols, 0.26) : '');
  for (const [, , a, ln] of pts) out += path(leaf(0, 0, a, ln, L === 'close' ? 2.6 : 4), rng.pick([pal.dark, pal.light, shade(pal.base, 0.15)]));
  if (cols) out += bl.map(([px, py]) => (L === 'close' ? bloom(pal.bloom, px, py, 15, cols, pal.eye, rng.u(0, TAU), rng) : midBloom(px, py, 18, cols, pal.eye))).join('');
  return out;
}
/** Fronds from the crown, each a sprig of paired leaflets. */
function fern(rng: Rng, r: number, pal: LookPalette, L: LookLevel): string {
  let out = disc(0, 0, r, pal.base);
  if (L === 'yard') return out + roundness(r, pal);
  const n = L === 'close' ? 9 : 6, a0 = rng.u(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * TAU) / n + rng.u(-0.15, 0.15), ln = r * rng.u(0.78, 0.95), bend = rng.pick([-1, 1]) * 0.18, sg = bend > 0 ? 1 : -1;
    const sx = Math.cos(a) * r * 0.06, sy = Math.sin(a) * r * 0.06, ex = Math.cos(a + bend) * ln, ey = Math.sin(a + bend) * ln;
    const cx = (sx + ex) / 2 - Math.sin(a) * ln * 0.12 * sg, cy = (sy + ey) / 2 + Math.cos(a) * ln * 0.12 * sg;
    out += `<path d="M${P(sx, sy)} Q${P(cx, cy)} ${P(ex, ey)}" stroke="${pal.dark}" stroke-width="${L === 'close' ? 0.9 : 2}" fill="none"/>`;
    if (L === 'close') {
      for (let j = 0; j < 11; j++) {
        const t = 0.12 + (0.85 * j) / 10, [px, py, ta] = quad([sx, sy, cx, cy, ex, ey], t), w = 6.2 * (1.05 - t * 0.7);
        for (const s of [-1, 1]) out += path(leaf(px, py, ta + s * 1.25, w, 1.5), rng.pick([pal.light, shade(pal.base, 0.12), shade(pal.light, -0.1)]));
      }
    } else out += `<path d="M${P(sx, sy)} Q${P(cx, cy)} ${P(ex, ey)}" stroke="${pal.light}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.6"/>`;
  }
  return out;
}
/** An emergent water plant: heart leaves on stalks from the crown; spikes of bloom at the stalk tips. */
function aquatic(rng: Rng, r: number, pal: LookPalette, L: LookLevel): string {
  let out = disc(0, 0, r, pal.base);
  const a0 = rng.u(0, TAU);
  const stalks = Array.from({ length: 10 }, (_, i) => { const a = a0 + (i * TAU) / 10 + rng.u(-0.2, 0.2), ln = r * rng.u(0.55, 0.8); return [Math.cos(a) * ln, Math.sin(a) * ln, a] as const; });
  const cols = pal.fl ? tones2(pal.fl) : null;
  const bl = pickTips(stalks.map((s) => [s[0], s[1]]), 5);
  if (L === 'yard') return out + roundness(r, pal) + (cols ? yardSpots(bl, r, cols, 0.22) : '');
  for (const [ex, ey, a] of stalks) {
    out += `<path d="M0 0 L${P(ex - Math.cos(a) * 8, ey - Math.sin(a) * 8)}" stroke="${pal.dark}" stroke-width="${L === 'close' ? 0.9 : 2}"/>`;
    const sx = ex - Math.cos(a) * 9, sy = ey - Math.sin(a) * 9;
    out += path(roundLeaf(sx - Math.cos(a) * 4, sy - Math.sin(a) * 4, a, L === 'close' ? 17 : 18, 8.5), rng.pick([shade(pal.base, -0.18), shade(pal.base, 0.1), shade(pal.base, -0.32), pal.light]), ` stroke="${pal.dark}" stroke-width="0.7"`);
  }
  if (cols) for (const [px, py] of bl) { const a = Math.atan2(py, px); out += L === 'close' ? bloom('spike', px - Math.cos(a) * 3, py - Math.sin(a) * 3, 16, cols, undefined, a, rng) : midBloom(px, py, 16, cols); }
  return out;
}
/** Pads from above, dotted with areoles; cups on the pad rims in flower. */
function cactus(rng: Rng, r: number, pal: LookPalette, L: LookLevel): string {
  const cols = pal.fl ? tones2(pal.fl) : null;
  const pads = spaced(rng, r * 0.62, 9, 11).map(([px, py]) => [px, py, rng.u(0, 180), rng.u(10, 13), rng.u(6.5, 8)] as const);
  const rims = pads.map(([px, py, a, rx]): [number, number] => [px + Math.cos((a * Math.PI) / 180) * rx * 0.9, py + Math.sin((a * Math.PI) / 180) * rx * 0.9]);
  const bl = pickTips(rims, 6);
  if (L === 'yard') return disc(0, 0, r, pal.base) + roundness(r, pal) + (cols ? yardSpots(bl.slice(0, 5), r, cols, 0.2) : '');
  let out = disc(0, 0, r, shade(pal.base, -0.25));
  for (const [px, py, a, rx, ry] of pads) {
    out += `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="${f1(rx)}" ry="${f1(ry)}" transform="rotate(${f1(a)} ${f1(px)} ${f1(py)})" fill="${rng.pick([pal.base, shade(pal.base, -0.12), shade(pal.base, 0.08)])}" stroke="${shade(pal.base, 0.35)}" stroke-width="0.8"/>`;
    if (L === 'close') for (let j = 0; j < 7; j++) { const [qx, qy] = inDisc(rng, ry * 0.75, 0, px, py); out += disc(qx, qy, 0.55, '#e8e0b8'); }
  }
  if (cols) out += bl.map(([px, py]) => (L === 'close' ? bloom('cup5', px, py, 11, cols, pal.eye ?? '#d8702a', rng.u(0, TAU), rng) : midBloom(px, py, 13, cols, pal.eye))).join('');
  return out;
}
/** A vine grown with no support: a patch of runners along the ground, its blooms at the runners' tips. */
function groundcover(rng: Rng, r: number, pal: LookPalette, L: LookLevel): string {
  let out = disc(0, 0, r, pal.base);
  const { d, segs, tips } = branches(rng, r);
  const bl = pickTips(tips, 5);
  const cols = pal.fl ? tones2(pal.fl) : null;
  if (L === 'yard') return out + roundness(r, pal) + (cols ? yardSpots(bl, r, cols, 0.2) : '');
  out += stems(d, pal.dark, L === 'close' ? 1 : 2);
  out += L === 'close' ? sprigLeaves(rng, segs, pal, { ln: [4.5, 6], wd: 2.4, every: 3.6 }) : mottle(rng, r, pal);
  if (cols) out += bl.map(([px, py]) => (L === 'close' ? bloom(pal.bloom, px, py, 13, cols, pal.eye, rng.u(0, TAU), rng) : midBloom(px, py, 14, cols, pal.eye))).join('');
  return out;
}

/**
 * A plant drawn from above, at the origin, in screen pixels: SVG markup inside a circle of radius `r` (the caller
 * clips it to the plant's outline and draws its rim). `seed`: the same plant draws the same way every time.
 */
export function lookSvg(look: Look, r: number, seed: string, level: LookLevel = levelOf(r)): string {
  const rng = rngOf(seed);
  const { form, pal } = look;
  switch (form) {
    case 'shrub': return sprigPlant(rng, r, pal, level, false);
    case 'perennial': return sprigPlant(rng, r, pal, level, true);
    case 'grass': return grass(rng, r, pal, level);
    case 'tree': return tree(rng, r, pal, level, false);
    case 'broadleaf': return tree(rng, r, pal, level, true);
    case 'conifer': return conifer(rng, r, pal, level);
    case 'vine': return groundcover(rng, r, pal, level);
    case 'annual': return annual(rng, r, pal, level);
    case 'bulb': return bulb(rng, r, pal, level);
    case 'fern': return fern(rng, r, pal, level);
    case 'aquatic': return aquatic(rng, r, pal, level);
    case 'cactus': return cactus(rng, r, pal, level);
  }
}
/** Whether `p` is inside the polygon `poly` (pixels). */
function inside(poly: { x: number; y: number }[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
/** A vine covering an arbor (src/vines.ts): its blooms over the part it covers, every `step` px, in pixels. */
export function coverBlooms(poly: { x: number; y: number }[], look: Look, step = 24): string {
  const fl = look.pal.fl;
  if (!fl || poly.length < 3) return '';
  const cols = tones2(fl);
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  let out = '', k = 0;
  for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step * 0.87) {
    const shift = (Math.round(y / step) % 2) * step * 0.5; // (staggered, as a planting grid)
    for (let x = Math.min(...xs) + step / 2 + shift; x < Math.max(...xs); x += step) {
      if (inside(poly, x, y)) out += midBloom(x, y, Math.max(8, step * 0.55), [cols[k % 2], cols[(k++ + 1) % 2]], look.pal.eye);
    }
  }
  return out;
}
/**
 * A climbing vine's blooms along its band (src/vines.ts), in pixels: bold ones spaced along it, as the yard and mid
 * steps draw them, every `step` px.
 */
export function bandBlooms(pts: { x: number; y: number }[], width: number, look: Look, step = 22): string {
  const fl = look.pal.fl;
  if (!fl || pts.length < 2) return '';
  const cols = tones2(fl);
  let out = '', carry = step / 2, k = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    let t = carry;
    for (; t <= len; t += step) out += midBloom(a.x + ((b.x - a.x) * t) / len, a.y + ((b.y - a.y) * t) / len, Math.max(6, width * 0.9), [cols[k % 2], cols[(k++ + 1) % 2]], look.pal.eye);
    carry = t - len;
  }
  return out;
}
