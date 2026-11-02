import type { Plant } from './plants';
import { formsOf } from './plants';
import { catkins, showyFlowers, summerLeafColors } from './seasons';

// How a plant is drawn on the plan (Jason, Oct 27–29: the canvas "Plant looks through the year", rounds 1–4): R5c,
// version 3. Leaves set along curving branches (sprigs); in flower, blooms at the outer branch tips, built of the
// sprig's own leaf, shaped by the kind of flower. How much is drawn goes by how big the plant is on the screen: close
// (a radius of 16 px and up: every leaf and bloom), mid (10 to 16 px: the branches and bold blooms, the leaves a soft
// mottle) and yard (under 10 px: its color and a few bold flower spots). Every kind of plant the catalog has gets its
// own drawing (grasses as blades, conifers as needle fans, ferns as fronds…), always inside the plant's circle.
//
// With no month (the slider closed), every plant is drawn in bloom (Jason, Oct 29). In a month (garden over time:
// `LookMonth`, from src/seasons.ts monthLook), it's drawn as it is then: leafing out, in its fall color, bare twigs, a
// perennial died back to its crown, a grass standing in straw; in bloom only in its months (faint where they're only
// "around": a season word); fruit where it's showing. A plant with no leaf color on record is drawn green (Jason). Drawn at the origin, in screen pixels: the caller moves
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
/**
 * A look, and the words for its colors (a catalog plant, or one of the user's own): its flowers' color as drawn, where
 * they're drawn; its leaves' (summer's leading color, else green), and whether they're variegated. None for a shape
 * drawn in its own color.
 */
export interface Look { form: LookForm; pal: LookPalette; said?: { flower?: string; leaf: string; variegated: boolean } }
/**
 * A plant in one month, as drawn (src/plant-looks.ts lookMonthOf, from src/seasons.ts monthLook): its leaves (on,
 * coming out, coloring with its fall color `fall` and how far through fall `progress`, bare twigs, died back, or not
 * known); whether it's in bloom (`around`: its months from a season word only, drawn faint); its fruit's color, showing.
 */
export interface LookMonth {
  leaves: 'on' | 'emerging' | 'turning' | 'bare' | 'dormant' | 'unknown';
  fall?: string;
  progress?: number;
  bloom: 'yes' | 'around' | 'no';
  fruit?: string;
}

/** The level a plant is drawn at, by its radius on the screen. */
/**
 * The radius on screen, in px, from which a plant is drawn close up, every leaf and bloom. 16 (Jason, Oct 30: at 22,
 * 'Prairie Princess' ironweed lost its flowers at 70% zoom and giant coneflower at 49%; about 53% and 35% felt right).
 */
export const CLOSE_PX = 16;
export function levelOf(rPx: number): LookLevel {
  return rPx >= CLOSE_PX ? 'close' : rPx >= 10 ? 'mid' : 'yard';
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
/** Fall leaf colors (src/catalog.ts FALL_COLORS) as drawn. */
export const FALL_HEX: Record<string, string> = {
  gold: '#d4a017', red: '#c0392b', orange: '#d9702a', purple: '#7a3b5e', copper: '#a0602e', cream: '#d8c99a', silver: '#b8b8a8', pink: '#cf6f8a',
};
/** Fruit colors (src/catalog.ts PART_COLORS) as drawn. */
export const FRUIT_HEX: Record<string, string> = {
  'red/burgundy': '#b3202e', orange: '#e0782a', 'gold/yellow': '#e3b52a', green: '#7aa04a', blue: '#3f5fa8', 'purple/lavender': '#5e3a7a',
  pink: '#e07a9a', white: '#f2efe6', 'cream/tan': '#d9c79a', 'brown/copper': '#7a4f2a', 'gray/silver': '#a8a8a0', black: '#2a2224',
};
/** Winter's ground: bare twigs over it; mulch where a plant died back (the design's BARE_BG, MULCH, BROWN). */
const BARE_BG = '#ebe0c9', MULCH = '#cdb894', BROWN = '#7a5a3c';
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

/** A plant of the user's own (src/my-plants.ts; imported from there, it would bring the whole library in). */
const MY_PREFIX = 'u-';
/** Words a person might write for a flower's color, to the colors drawn (FLOWER_HEX's). */
const COLOR_WORDS: Record<string, string> = {
  lavender: 'purple', violet: 'purple', lilac: 'purple', mauve: 'purple', plum: 'purple', magenta: 'pink', rose: 'pink', fuchsia: 'pink',
  raspberry: 'pink', scarlet: 'red', crimson: 'red', burgundy: 'red', maroon: 'red', gold: 'yellow', golden: 'yellow', lemon: 'yellow',
  ivory: 'cream', apricot: 'orange', peach: 'orange', coral: 'orange', salmon: 'orange', tangerine: 'orange',
};
/** The flower color drawn nearest a color picked on the plan ("#ffff00": yellow). */
export function nearestFlower(color: string): string {
  const [r, g, b] = hx(color);
  let best = 'white', d = Infinity;
  for (const [name, h] of Object.entries(FLOWER_HEX)) {
    if (name === 'variegated') continue;
    const [r2, g2, b2] = hx(h), e = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (e < d) { d = e; best = name; }
  }
  return best;
}
/** The colors in a bloom color written by hand ("White", "Pale pink", "Red and yellow"), in order. */
export function ownBloomColors(text: string | undefined): string[] {
  const out: string[] = [];
  for (const w of (text ?? '').toLowerCase().split(/[^a-z]+/)) {
    const c = FLOWER_HEX[w] ? w : COLOR_WORDS[w];
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
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
/**
 * The flower colors a placed plant may be drawn in, chosen on the plan: its sources' petal colors (not a center's or
 * dull parts'), and the one it's drawn in unless another is chosen; a plant of the user's own, the colors they gave
 * it (src/my-plants.ts MY_FLOWER_COLORS). None for a plant whose flowers don't show.
 */
export function flowerChoices(p: Plant | undefined): { colors: string[]; usual?: string } {
  const listed = (p?.flower_color ?? []).filter((c) => c !== 'insignificant' && FLOWER_HEX[c] && !NOT_PETALS.has(c));
  if (!p || !listed.length || !showyFlowers(p) || catkins(p)) return { colors: [] };
  return { colors: listed, usual: flowerColorOf(p.common ?? '', p.flower_color!.filter((c) => c !== 'insignificant' && FLOWER_HEX[c])) };
}
/** A flower color as drawn ("purple": its hex); undefined for a word that isn't one. */
export const flowerHex = (c: string): string | undefined => FLOWER_HEX[c];
/**
 * How a plant is drawn: its kind of drawing and its colors, from its catalog facts (or its shape's color). `chosen`: a
 * color the user set (Jason, Oct 29), which its leaves are drawn in; its flowers keep theirs. `flower`: a flower
 * color chosen for it, drawn where its sources list it.
 */
export function lookOf(p: Plant | undefined, shapeColor: string, chosen = false, flower?: string): Look {
  const form0 = p ? formsOf(p)[0] ?? '' : '';
  const evergreen = p?.foliage === 'evergreen';
  // (Its summer leaf color, the dominant one (src/seasons.ts): green unless another color leads; a darker green if
  // evergreen; a plant of the user's own, with no catalog record, or one given a color by hand, its shape's color.)
  const summer = p ? summerLeafColors(p) : { colors: [], variegated: false };
  const variegated = summer.variegated;
  const first = summer.colors[0];
  const base = !p || chosen ? shapeColor : first && first !== 'green' && LEAF_HEX[first] ? LEAF_HEX[first] : evergreen ? EVERGREEN_GREEN : LEAF_HEX.green;
  // (Its flowers' colors: its sources'; else the earlier list's words, or the bloom color a person gave their own
  // plant ("White bells", "Pale pink"); else, for a plant of the user's own, the color picked for it on the plan
  // (Jason, Oct 30: "use the old list color if available, plan color if not").)
  const sourced = p?.flower_color ?? [];
  const words = sourced.length ? [] : ownBloomColors(p?.bloom?.color);
  // (The plan color only for one that blooms, by its months: one with no flower colors and no bloom months has no
  // flowers to draw. Jason, Nov 1: a false cypress of his own, copied from Sawara cypress, was drawn in yellow flowers.)
  const picked = !sourced.length && !words.length && p?.id?.startsWith(MY_PREFIX) && p.color && p.bloom?.start != null ? [nearestFlower(p.color)] : [];
  const listed = (sourced.length ? sourced : words.length ? words : picked).filter((c) => c !== 'insignificant' && FLOWER_HEX[c]);
  const insignificant = !!p && (!listed.length || !showyFlowers(p) || catkins(p));
  // (A color its sources list, chosen for this one plant on the plan (Jason, Oct 30): a cultivar not in the catalog.)
  const color = p ? (flower && listed.includes(flower) ? flower : flowerColorOf(p.common ?? '', listed)) : undefined;
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
  const said = p && !chosen ? { ...(fl ? { flower: color } : {}), leaf: first && first !== 'green' && LEAF_HEX[first] ? first : 'green', variegated } : undefined;
  return { form, pal, ...(said ? { said } : {}) };
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
/** Blooms drawn faint: a month it's only "around" in bloom (a season word); set by lookSvg while it draws. */
let faintBlooms = false;
const fb = (s: string) => (faintBlooms && s ? `<g opacity="0.45">${s}</g>` : s);
const bloom = (kind: BloomKind | undefined, px: number, py: number, s: number, cols: string[], eye: string | undefined, a0: number, rng: Rng) => fb(bloomRaw(kind, px, py, s, cols, eye, a0, rng));
function bloomRaw(kind: BloomKind | undefined, px: number, py: number, s: number, cols: string[], eye: string | undefined, a0: number, rng: Rng): string {
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
/**
 * A bloom's size, no bigger than its share of the plant (Jason, Oct 29: on a small perennial at mid zoom, blooms of
 * a fixed size covered it two or three times over, a disc of flower color): at most three quarters of the plant's
 * radius (a mid bloom's disc reaches three eighths of it), so its green shows between them.
 */
const fit = (s: number, r: number) => Math.min(s, r * 0.75);
/** The same bloom at mid size: a bold disc in its color, a lighter heart, the eye. */
const midBloom = (px: number, py: number, s: number, cols: string[], eye?: string) => fb(disc(px, py, s * 0.5, cols[0]) + disc(px - s * 0.1, py - s * 0.1, s * 0.24, cols[1]) + (eye ? disc(px, py, s * 0.13, eye) : ''));
/** Yard size: bold spots of its flower color, pulled in from the tips. */
const yardSpots = (spots: [number, number][], r: number, cols: string[], k = 0.24) => fb(spots.map(([px, py], i) => disc(px * 0.85, py * 0.85, r * k, cols[i % 2])).join(''));

// ---------- each kind of plant ----------
/** A shrub or a perennial (R5c, version 3): sprigs; five bigger blooms at the outer tips, six on a perennial. */
function sprigPlant(rng: Rng, r: number, pal: LookPalette, L: LookLevel, perennial: boolean): string {
  const { d, segs, tips } = branches(rng, r * (perennial ? 0.8 : 1));
  const bl = pickTips(tips, perennial ? 6 : 5);
  const cols = pal.fl ? tones2(pal.fl) : null;
  const s = 16 * (perennial ? 1.05 : 1);
  let out = disc(0, 0, r, pal.base);
  if (L === 'yard') return out + roundness(r, pal) + (cols ? yardSpots(bl.slice(0, 5), r, cols) : '');
  if (L === 'mid') return out + mottle(rng, r, pal) + stems(d, pal.dark, 2) + (cols ? bl.map(([px, py]) => midBloom(px, py, fit(s * 1.15, r), cols, pal.eye)).join('') : '');
  out += stems(d, pal.dark, perennial ? 1 : 1.4) + sprigLeaves(rng, segs, pal);
  if (cols) for (const [px, py] of bl) out += bloom(pal.bloom, px, py, fit(s, r), cols, pal.eye, rng.u(0, TAU), rng);
  return out;
}
/** Blades from the crown; in flower, a haze of plume at the blade tips. */
function grass(rng: Rng, r: number, pal: LookPalette, L: LookLevel): string {
  let out = disc(0, 0, r, pal.base);
  const cols = pal.fl ? tones2(pal.fl) : null;
  if (L === 'yard') return out + roundness(r, pal) + (cols ? fb(disc(0, 0, r * 0.95, cols[0], ' opacity="0.8"') + disc(0, 0, r * 0.42, pal.base, ' opacity="0.6"')) : '');
  const nb = L === 'close' ? 34 : 16;
  for (const c of [pal.dark, pal.light, shade(pal.base, 0.15)]) out += blades(rng, r, c, Math.floor(nb / 3), L === 'close' ? 1 : 2.2);
  if (cols) {
    let plume = '';
    if (L === 'close') for (let j = 0; j < 140; j++) { const [px, py] = inDisc(rng, r * 0.98, 0.45); plume += path(leafAt(px, py, rng.u(0, TAU), 3.2, 0.9), rng.pick(cols), ' opacity="0.7"'); }
    else for (const [px, py] of spaced(rng, r * 0.95, 22, r * 0.14, 0.4)) plume += disc(px, py, r * 0.13, rng.pick(cols), ' opacity="0.75"');
    out += fb(plume);
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
  if (L === 'mid') return out + mottle(rng, r, pal, 9) + stems(d, pal.dark, 3) + (cols ? bl.map(([px, py]) => midBloom(px, py, fit(15, r), cols, pal.eye)).join('') : '');
  out += stems(d, pal.dark, 2.2);
  out += broadleaf
    ? sprigLeaves(rng, segs, pal, { cols: [pal.light, shade(pal.base, -0.15), shade(pal.base, -0.3), '#9a6a3a'], ln: [8, 10.5], wd: 3.8, every: 3.6 })
    : sprigLeaves(rng, segs, pal, { ln: [5.5, 7], wd: 3.4, every: 4.2 });
  if (cols) for (const [px, py] of bl) out += bloom(pal.bloom, px, py, fit(15, r), cols, pal.eye, rng.u(0, TAU), rng);
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
  if (L === 'mid') return out + mottle(rng, r, pal) + stems(d, pal.dark, 2.2) + (cols ? bl.map(([px, py]) => midBloom(px, py, fit(13, r), cols, pal.eye)).join('') : '');
  out += stems(d, pal.dark, 1) + sprigLeaves(rng, segs, pal);
  if (cols) for (const [px, py] of bl) out += bloom(pal.bloom, px, py, fit(12, r), cols, pal.eye, rng.u(0, TAU), rng);
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
  if (cols) out += bl.map(([px, py]) => (L === 'close' ? bloom(pal.bloom, px, py, fit(15, r), cols, pal.eye, rng.u(0, TAU), rng) : midBloom(px, py, fit(18, r), cols, pal.eye))).join('');
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
  if (cols) for (const [px, py] of bl) { const a = Math.atan2(py, px); out += L === 'close' ? bloom('spike', px - Math.cos(a) * 3, py - Math.sin(a) * 3, fit(16, r), cols, undefined, a, rng) : midBloom(px, py, fit(16, r), cols); }
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
  if (cols) out += bl.map(([px, py]) => (L === 'close' ? bloom('cup5', px, py, fit(11, r), cols, pal.eye ?? '#d8702a', rng.u(0, TAU), rng) : midBloom(px, py, fit(13, r), cols, pal.eye))).join('');
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
  if (cols) out += bl.map(([px, py]) => (L === 'close' ? bloom(pal.bloom, px, py, fit(13, r), cols, pal.eye, rng.u(0, TAU), rng) : midBloom(px, py, fit(14, r), cols, pal.eye))).join('');
  return out;
}

// ---------- the months (garden over time) ----------
/** Forms with woody stems that stand bare in winter; the rest die back. */
const WOODY: LookForm[] = ['shrub', 'tree', 'broadleaf', 'conifer', 'vine'];
/** Twigs forking from the center, for a bare plant drawn small (the design's twigs). */
function twigs(rng: Rng, r: number, col: string, w: number, n: number): string {
  const d: string[] = [];
  const br = (bx: number, by: number, a: number, ln: number, depth: number) => {
    const ex = bx + Math.cos(a) * ln, ey = by + Math.sin(a) * ln;
    d.push(`M${P(bx, by)} L${P(ex, ey)}`);
    if (depth < 3) for (const da of [-0.5, 0.45]) br(ex, ey, a + da + rng.u(-0.15, 0.15), ln * rng.u(0.5, 0.65), depth + 1);
  };
  const a0 = rng.u(0, TAU);
  for (let i = 0; i < n; i++) br(0, 0, a0 + (i * TAU) / n + rng.u(-0.2, 0.2), r * rng.u(0.38, 0.48), 1);
  return stems(d, col, w);
}
/** A woody plant in winter: its limbs bare (the same limbs as in leaf: the same seed, the same first draws). */
function bare(rng: Rng, r: number, form: LookForm, L: LookLevel): string {
  const tree = form === 'tree' || form === 'broadleaf' || form === 'conifer';
  const main = branches(rng, r * (tree ? 0.95 : 1)), more = tree && L === 'close' && r > 50 ? branches(rng, r * 0.9) : null;
  const d = [...main.d, ...(more?.d ?? [])];
  const out = disc(0, 0, r, BARE_BG, tree ? CANOPY : ' opacity="0.75"');
  if (L === 'yard') return out + twigs(rng, r, BROWN, 1.6, tree ? 6 : 5);
  return out + stems(d, BROWN, L === 'close' ? (tree ? 2.2 : 1.6) : 3) + (L === 'close' ? twigs(rng, r * 0.9, BROWN, 0.8, 7) : '');
}
/**
 * An herb in winter: died back to its crown, on mulch; seed heads left standing where its blooms are a coneflower's or
 * a daisy's (the mockup's "standing through winter"); a grass's blades standing in straw; bulbs, just their tips.
 */
function diedBack(rng: Rng, r: number, look: Look, L: LookLevel): string {
  const { form, pal } = look;
  if (form === 'grass') {
    const straw = ['#b8a878', '#d8c89a', '#a89060'];
    let out = disc(0, 0, r, '#c8b88a');
    if (L === 'yard') return out + roundness(r, palOf('#c8b88a'));
    for (const c of straw) out += blades(rng, r, c, Math.floor((L === 'close' ? 34 : 16) / 3), L === 'close' ? 1 : 2.2);
    return out;
  }
  let out = disc(0, 0, r, MULCH);
  if (form === 'bulb') return out + (L === 'yard' ? '' : spaced(rng, r * 0.5, 7, 6).map(([px, py]) => disc(px, py, 1.4, '#c4a87a')).join(''));
  if (form !== 'perennial' && form !== 'annual') return out;
  const { d, tips } = branches(rng, r * 0.8);
  const seeds = pal.fl && (pal.bloom === 'cone' || pal.bloom === 'daisy') ? '#4a3220' : undefined;
  const bl = pickTips(tips, 6);
  if (L === 'yard') return out + (seeds ? bl.slice(0, 4).map(([px, py]) => disc(px * 0.8, py * 0.8, r * 0.12, seeds)).join('') : '');
  out += stems(d, '#9a8058', L === 'close' ? 1 : 2);
  if (seeds) out += bl.map(([px, py]) => disc(px, py, L === 'close' ? 2.6 : 4, seeds)).join('');
  return out;
}
/** Its palette in a month: lighter as it leafs out; its fall color as it colors, more of it the further into fall. */
function monthPal(pal: LookPalette, m: LookMonth): LookPalette {
  const keep = { fl: m.bloom === 'no' ? undefined : pal.fl, eye: pal.eye, bloom: pal.bloom, evergreen: pal.evergreen, scale: pal.scale, variegated: pal.variegated };
  if (m.leaves === 'emerging') return palOf(shade(pal.base, -0.25), keep);
  if (m.leaves === 'turning') {
    // (Mostly its fall color from the start, as the design drew fall: a straight blend of green and red is mud. No
    // fall color on record: a tan, and only so far.)
    const to = m.fall ?? '#b5a35a', t = m.fall ? 0.72 + 0.28 * (m.progress ?? 0.5) : 0.5 * (m.progress ?? 0.5);
    return palOf(mix(pal.base, to, t), keep);
  }
  return { ...pal, fl: keep.fl };
}
/** A plant's color in a month, as one color (a climbing vine's band): its leaves', its fall color's, or bare twigs'. */
export function colorIn(look: Look, m: LookMonth): string {
  if (m.leaves === 'bare' || m.leaves === 'dormant') return WOODY.includes(look.form) && m.leaves === 'bare' ? BROWN : MULCH;
  return monthPal(look.pal, m).base;
}
/** Fruit showing: a few berries, in its fruit's color. */
function fruitOf(seed: string, r: number, col: string, L: LookLevel): string {
  const rng = rngOf(seed + ':fruit');
  if (L === 'yard') return spaced(rng, r * 0.7, 3, r * 0.4).map(([px, py]) => disc(px, py, r * 0.12, col)).join('');
  return spaced(rng, r * 0.8, L === 'close' ? 9 : 5, L === 'close' ? 7 : 10, 0.25).map(([px, py]) => disc(px, py, L === 'close' ? 2.2 : 3.2, col, ` stroke="${shade(col, 0.35)}" stroke-width="0.6"`)).join('');
}

/**
 * A plant drawn from above, at the origin, in screen pixels: SVG markup inside a circle of radius `r` (the caller
 * clips it to the plant's outline and draws its rim). `seed`: the same plant draws the same way every time. `month`:
 * as it is in a month (garden over time); none, in bloom. Its winter not known (`unknown`): drawn faint, and the
 * caller says so with the not-known ring.
 */
export function lookSvg(look: Look, r: number, seed: string, level: LookLevel = levelOf(r), month?: LookMonth): string {
  if (!month) return drawn(look, r, seed, level);
  const fruit = month.fruit ? fruitOf(seed, r, month.fruit, level) : '';
  if (month.leaves === 'bare' || month.leaves === 'dormant') {
    const woody = WOODY.includes(look.form) && month.leaves === 'bare';
    return (woody ? bare(rngOf(seed), r, look.form, level) : diedBack(rngOf(seed), r, look, level)) + fruit;
  }
  faintBlooms = month.bloom === 'around';
  try {
    const out = drawn({ ...look, pal: monthPal(look.pal, month) }, r, seed, level) + fruit;
    return month.leaves === 'unknown' ? `<g opacity="0.55">${out}</g>` : out;
  } finally { faintBlooms = false; }
}
function drawn(look: Look, r: number, seed: string, level: LookLevel): string {
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
/** A point every `step` px along a polyline (pixels), the first half a step in, with its direction there (radians). */
function along(pts: { x: number; y: number }[], step: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  let carry = step / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    let t = carry;
    for (; t <= len; t += step) out.push([a.x + ((b.x - a.x) * t) / len, a.y + ((b.y - a.y) * t) / len, ang]);
    carry = t - len;
  }
  return out;
}
/** A bloom along a vine, as its plant's are drawn at `level`: in its kind's shape close up, a bold disc at mid, a spot far out. */
function vineBloom(level: LookLevel, x: number, y: number, s: number, cols: string[], look: Look, rng: Rng): string {
  if (level === 'close') return bloom(look.pal.bloom, x, y, s, cols, look.pal.eye, rng.u(0, TAU), rng);
  if (level === 'mid') return midBloom(x, y, s, cols, look.pal.eye);
  return disc(x, y, s * 0.3, cols[0]);
}
/**
 * A climbing vine's leaves along its band (src/vines.ts), in pixels, `width` across, as its plant's leaves are drawn at
 * `level` (Jason, Oct 30: "only color blobs while everything else gets flowers"): close up, its stem and leaves of the
 * size every plant's are, in lanes across the band; at mid, a mottle of its tones; far out, none (the band alone). As
 * in `month` (garden over time): none while it's bare or died back.
 */
export function bandLeaves(pts: { x: number; y: number }[], width: number, look: Look, level: LookLevel, seed: string, month?: LookMonth): string {
  if (level === 'yard' || pts.length < 2 || (month && (month.leaves === 'bare' || month.leaves === 'dormant'))) return '';
  const pal = month ? monthPal(look.pal, month) : look.pal;
  const rng = rngOf(seed + ':band');
  const across = (x: number, y: number, a: number, off: number): [number, number] => [x - Math.sin(a) * off, y + Math.cos(a) * off];
  if (level === 'mid') {
    return along(pts, Math.max(4, width * 0.45)).map(([x, y, a]) => {
      const [px, py] = across(x, y, a, rng.u(-0.22, 0.22) * width);
      return disc(px, py, width * rng.u(0.18, 0.26), rng.pick([pal.light, shade(pal.base, 0.15)]), ' opacity="0.55"');
    }).join('');
  }
  const cols = [pal.light, shade(pal.base, 0.2), shade(pal.light, -0.12)];
  const lanes = Math.max(1, Math.round(width / 9)), reach = Math.max(0, width / 2 - 4);
  let out = stems([`M${pts.map((p) => P(p.x, p.y)).join(' L')}`], pal.dark, 1.2);
  for (let l = 0; l < lanes; l++) {
    const off = lanes === 1 ? 0 : -reach + (2 * reach * l) / (lanes - 1);
    let side = l % 2 ? 1 : -1;
    for (const [x, y, a] of along(pts, 4.6)) {
      side = -side;
      const [px, py] = across(x, y, a, off + rng.u(-1.5, 1.5));
      const col = pal.variegated && rng.r() < 0.4 ? pal.light : rng.pick(cols);
      out += path(leaf(px, py, a + side * rng.u(0.55, 0.95) + (rng.r() < 0.5 ? 0 : Math.PI), rng.u(5, 6.8), 2.8 * rng.u(0.9, 1.1)), col);
    }
  }
  return out;
}
/**
 * A climbing vine's blooms along its band (src/vines.ts), in pixels, `width` across: one about every `step` px (a foot),
 * on either side of its middle by turns, drawn as its plant's are at `level` (vineBloom).
 */
export function bandBlooms(pts: { x: number; y: number }[], width: number, look: Look, step = 22, level: LookLevel = 'mid', seed = ''): string {
  const fl = look.pal.fl;
  if (!fl || pts.length < 2) return '';
  const cols = tones2(fl);
  const rng = rngOf(seed + ':band-blooms');
  // (Its size: close up, a plant's bloom, no wider than most of the band; at mid, about a third of the band's width, as
  // its discs have been since Oct 30, "oversized to my eye".)
  const s = level === 'close' ? Math.min(16, Math.max(8, width * 0.6)) : Math.max(4, width * 0.36);
  let k = 0;
  return along(pts, Math.max(step, s * 1.5)).map(([x, y, a]) => {
    const off = (k % 2 ? 1 : -1) * width * 0.16;
    return vineBloom(level, x - Math.sin(a) * off, y + Math.cos(a) * off, s, [cols[k % 2], cols[(k++ + 1) % 2]], look, rng);
  }).join('');
}
/** A vine covering an arbor (src/vines.ts): its blooms over the part it covers, every `step` px, in pixels, as at `level`. */
export function coverBlooms(poly: { x: number; y: number }[], look: Look, step = 24, level: LookLevel = 'mid', seed = ''): string {
  const fl = look.pal.fl;
  if (!fl || poly.length < 3) return '';
  const cols = tones2(fl);
  const rng = rngOf(seed + ':cover-blooms');
  const s = level === 'close' ? Math.min(16, Math.max(8, step * 0.6)) : Math.max(5, step * 0.36);
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  let out = '', k = 0;
  for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step * 0.87) {
    const shift = (Math.round(y / step) % 2) * step * 0.5; // (staggered, as a planting grid)
    for (let x = Math.min(...xs) + step / 2 + shift; x < Math.max(...xs); x += step) {
      if (inside(poly, x, y)) out += vineBloom(level, x, y, s, [cols[k % 2], cols[(k++ + 1) % 2]], look, rng);
    }
  }
  return out;
}
