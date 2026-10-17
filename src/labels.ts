import type { Plant } from './plants';

// Plant names inside their circles. A name is wrapped onto up to three lines
// and shrunk until it fits inside the circle; if even a shorter form of the
// name won't fit at a readable size, it isn't drawn (it shows when the plant
// is selected, or zoomed in), instead of spilling over its neighbors.

/** Font sizes in screen px: names start at the largest and shrink to the smallest. */
export const LABEL_MAX_PX = 14;
export const LABEL_MIN_PX = 10;
/** Shortened names may go one size smaller before giving up. */
export const SHORT_MIN_PX = 9;
export const LABEL_LINE_HEIGHT = 1.15;
const MAX_LINES = 3;

export interface FittedLabel { lines: string[]; fontSize: number; dy: number }

// ---------- Measuring text ----------
/** Average glyph width as a share of the font size, when the browser can't measure. */
const CHAR_WIDTH = 0.55;
let ctx: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();
/** Width of `text` at 1 px (labels are 500-weight sans-serif); scale by the font size. */
export function textWidth1(text: string): number {
  let w = widths.get(text);
  if (w != null) return w;
  if (ctx === undefined) {
    ctx = null;
    // jsdom has no canvas; tests use the estimate.
    if (typeof document !== 'undefined' && !/jsdom/i.test(navigator.userAgent)) {
      try { ctx = document.createElement('canvas').getContext('2d'); } catch { ctx = null; }
      if (ctx) ctx.font = '500 100px sans-serif';
    }
  }
  w = ctx ? ctx.measureText(text).width / 100 : text.length * CHAR_WIDTH;
  if (widths.size > 5000) widths.clear();
  widths.set(text, w);
  return w;
}

// ---------- Fitting ----------
/** Every way to split `words` into `n` lines (in order). Names are short, so this stays small. */
function splits(words: string[], n: number): string[][] {
  if (n === 1) return [[words.join(' ')]];
  const out: string[][] = [];
  for (let i = 1; i <= words.length - n + 1; i++) {
    const head = words.slice(0, i).join(' ');
    for (const rest of splits(words.slice(i), n - 1)) out.push([head, ...rest]);
  }
  return out;
}
/**
 * Where the block of lines goes: centered `dy` px below the circle's center,
 * or (`below`) with its top that many px below the center, e.g. under a trunk.
 */
export interface Placement { dy?: number; below?: number }
/**
 * The largest font (and fewest lines at that size) at which `text` fits inside
 * a circle of radius `r` px. Null if it can't fit at `minPx`. The result's
 * `dy` is where the block's center sits, below the circle's center.
 */
export function fitInCircle(text: string, r: number, place: Placement = {}, minPx = LABEL_MIN_PX): FittedLabel | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const inner = r - 2; // keep clear of the circle's edge
  if (inner <= 0) return null;
  const n = Math.min(MAX_LINES, words.length);
  const options: string[][][] = [];
  for (let k = 1; k <= n; k++) options.push(words.length > 8 && k > 1 ? [] : splits(words, k));
  for (let fs = LABEL_MAX_PX; fs >= minPx; fs--) {
    const lh = fs * LABEL_LINE_HEIGHT;
    for (let k = 1; k <= n; k++) {
      const dy = place.below != null ? place.below + (k * lh) / 2 : place.dy ?? 0;
      // The width available to each line is the circle's chord at that line's far edge.
      const room: number[] = [];
      let ok = true;
      for (let i = 0; i < k; i++) {
        const mid = dy + (i - (k - 1) / 2) * lh;
        const far = Math.abs(mid) + lh / 2;
        if (far >= inner) { ok = false; break; }
        room.push(2 * Math.sqrt(inner * inner - far * far));
      }
      if (!ok) continue;
      const fit = options[k - 1].find((lines) => lines.every((l, i) => textWidth1(l) * fs <= room[i]));
      if (fit) return { lines: fit, fontSize: fs, dy };
    }
  }
  return null;
}

// ---------- Shorter forms of a name ----------
/**
 * Shorter ways to write a plant's name, best first:
 * "Smooth hydrangea 'Haas' Halo'" → "'Haas' Halo' hydrangea", "'Haas' Halo'";
 * "Purple passionflower (maypop)" → "Purple passionflower".
 * A catalog short name, when there is one, comes first.
 */
export function shortNames(label: string, plant?: Plant): string[] {
  const out: string[] = [];
  const add = (s: string | undefined) => {
    const t = s?.replace(/\s+/g, ' ').trim();
    if (t && t !== label.trim() && !out.includes(t)) out.push(t);
  };
  if (plant?.short && label.trim() === plant.common) add(plant.short);
  const noParens = label.replace(/\s*\([^)]*\)/g, '');
  add(noParens);
  // A cultivar: 'Name' (straight or curly quotes), from the first quote to the last.
  const m = noParens.match(/^(.*?)\s*(['‘’].+['‘’])\s*(.*)$/);
  if (m) {
    // The cultivar with the plant's kind: "'Haas' Halo' hydrangea", "'Julia Child' Rose";
    // not "'American Gold Rush' Susan", where the last word alone isn't the kind.
    const words = (m[1] + ' ' + m[3]).trim().split(/\s+/).filter(Boolean);
    const last = words.at(-1) ?? '';
    if (last && (words.length === 1 || last === last.toLowerCase())) add(`${m[2]} ${last}`);
    add(m[2]);
  }
  return out;
}

/**
 * What to write inside a plant's circle: its name if it fits, else the best
 * shorter form that does, else nothing (null).
 */
export function plantLabelFit(label: string, r: number, place: Placement = {}, plant?: Plant): FittedLabel | null {
  if (!label.trim()) return null;
  const full = fitInCircle(label, r, place, LABEL_MIN_PX);
  if (full) return full;
  for (const s of shortNames(label, plant)) {
    const f = fitInCircle(s, r, place, SHORT_MIN_PX);
    if (f) return f;
  }
  return null;
}
