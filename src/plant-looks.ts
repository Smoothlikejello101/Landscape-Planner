import { colorIn, FALL_HEX, FRUIT_HEX, lookOf, lookSvg, shade, type Look, type LookLevel, type LookMonth } from './looks';
import { hereFor, monthLook } from './seasons';
import { plantsById } from './plants';
import { state } from './state';
import type { CircleShape, Shape } from './types';

// The app's side of plant looks (src/looks.ts): which shapes are drawn as illustrations, and their markup, kept so a
// redraw (a pan's release, a tap) doesn't draw every plant again. Each plant is drawn its own way (seeded by the
// shape), and a plant of the user's own, or one given a color by hand (`colorSet`), takes its shape's color.

/** A placed plant drawn as an illustration (Layers: plants drawn, the default; always through the year). */
export function lookShown(s: Shape): boolean {
  // (Once its record is here: drawn before the catalog is in, a plant would show in its shape's color, then change.)
  return (state.plantLooks || state.month != null) && s.type === 'circle' && s.role === 'plant' && !!s.plantId && !!plantsById[s.plantId];
}
/**
 * A placed plant in the month shown (garden over time, src/seasons.ts monthLook with the records near the garden), as
 * drawn; undefined with no month (in bloom), or for a plant of the user's own with no record. Its winter not known
 * (no foliage fact, nothing standing in for one): known in leaf April to October, not known the rest of the year.
 */
export function lookMonthOf(s: CircleShape, month = state.month): LookMonth | undefined {
  const p = month != null && s.plantId ? plantsById[s.plantId] : undefined;
  if (!p || month == null) return undefined;
  const m = monthLook(p, month, hereFor(p)), l = m.leaves;
  const leaves: LookMonth['leaves'] = l.state === 'off' ? 'bare' : l.state ?? (month >= 4 && month <= 10 ? 'on' : 'unknown');
  const fall = l.state === 'turning' ? l.fall?.map((c) => FALL_HEX[c]).find(Boolean) : undefined;
  const bloom: LookMonth['bloom'] = m.flowers.state === 'bloom' ? (m.flowers.basis === 'season' ? 'around' : 'yes') : 'no';
  const fruit = m.fruit.state === 'showing' ? m.fruit.colors.map((c) => FRUIT_HEX[c]).find(Boolean) : undefined;
  return { leaves, ...(fall ? { fall } : {}), ...(l.progress != null ? { progress: l.progress } : {}), bloom, ...(fruit ? { fruit } : {}) };
}
/** How a placed plant is drawn. */
export const lookFor = (s: CircleShape): Look => lookOf(s.plantId ? plantsById[s.plantId] : undefined, s.color, !!s.colorSet);
/**
 * A planned plant drawn as a picture: its dashed edge in the picture's dark leaf color (the month's, through the
 * year), not its shape's color. Drawn as a picture, a plain red strawberry's red edge read as a warning, as To
 * remove's is (Jason, Oct 29).
 */
export function plannedEdge(s: CircleShape): string {
  const look = lookFor(s), m = lookMonthOf(s);
  return m ? shade(colorIn(look, m), 0.38) : look.pal.dark;
}

/**
 * The largest radius (screen pixels) a plant is drawn at: bigger, the drawing is scaled up, its leaves and blooms with
 * it, as the design was drawn (a tree zoomed in isn't a disc of tiny leaves), and it stays as quick to draw.
 */
export const LOOK_MAX_R = 110;
const cache = new Map<string, string>();
/** A placed plant's illustration at `rPx` (screen pixels), at the origin: SVG markup (src/looks.ts lookSvg). */
export function lookMarkup(s: CircleShape, rPx: number, level: LookLevel): string {
  const r = Math.min(rPx, LOOK_MAX_R), k = rPx / r;
  const month = lookMonthOf(s);
  const key = `${s.id}|${s.plantId}|${s.color}|${s.colorSet ? 1 : 0}|${Math.round(r * 4)}|${level}|${month ? JSON.stringify(month) : ''}`;
  let out = cache.get(key);
  if (out == null) {
    if (cache.size > 3000) cache.clear(); // (zoomed through many sizes: start again)
    out = lookSvg(lookFor(s), r, s.id, level, month);
    cache.set(key, out);
  }
  return k > 1.001 ? `<g transform="scale(${Math.round(k * 1000) / 1000})">${out}</g>` : out;
}
