import { colorIn, FALL_HEX, FRUIT_HEX, lookOf, lookSvg, shade, type Look, type LookLevel, type LookMonth } from './looks';
import { hereFor, monthLook } from './seasons';
import { plantColor, plantsById, type Plant } from './plants';
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
export const lookFor = (s: CircleShape): Look => lookOf(s.plantId ? plantsById[s.plantId] : undefined, s.color, !!s.colorSet, s.flowerColor);
/** A plant's dot in lists and bars: its flowers' color as its picture draws them, else its own color. */
export const plantDot = (p: Plant): string => lookOf(p, plantColor(p)).pal.fl ?? plantColor(p);
/**
 * A plant's spot on a picker row (Jason, Nov 1, from the UI review: "replace the color spot with a flower icon in the
 * middle of a leaf-color circle"): a circle in its leaves' color with a small flower in its flowers' color, both as
 * its picture draws them; a plant without showy flowers on record, the circle alone. `said`, for screen readers:
 * "blue flowers, green leaves". Color says nothing here that words don't: the flowers' color is in its details too.
 */
export function plantSpot(p: Plant): { svg: string; said: string } {
  const look = lookOf(p, plantColor(p));
  const leaf = look.pal.base, fl = look.pal.fl, s = look.said;
  const leaves = s ? `${s.variegated ? 'variegated ' : ''}${s.leaf} leaves` : 'its own color';
  const said = s?.flower ? `${s.flower} flowers, ${leaves}` : leaves;
  // (Five petals around a center, edged a shade darker so white flowers show on pale leaves; a gold center, brown in a
  // yellow or orange flower.)
  const petals = fl ? [0, 1, 2, 3, 4].map((k) => {
    const a = (-90 + k * 72) * Math.PI / 180;
    return `<circle cx="${(10 + Math.cos(a) * 3.4).toFixed(2)}" cy="${(10 + Math.sin(a) * 3.4).toFixed(2)}" r="2.7"/>`;
  }).join('') : '';
  const eye = s?.flower === 'yellow' || s?.flower === 'orange' ? '#7c2d12' : '#eab308';
  const svg = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">`
    + `<circle cx="10" cy="10" r="9.5" fill="${leaf}" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>`
    + (fl ? `<g fill="${fl}" stroke="${shade(fl, 0.4)}" stroke-width="0.6" data-testid="spot-flower">${petals}</g><circle cx="10" cy="10" r="1.7" fill="${eye}"/>` : '')
    + '</svg>';
  return { svg, said };
}
/**
 * A placed shape's dot in the selection bar: a plant drawn as its picture, its picture's flowers (as the picker's dot:
 * round 3, Ruth saw every plant's dot purple, its shape's color); anything else, its own color.
 */
export const shapeDot = (s: Shape): string => (lookShown(s) ? lookFor(s as CircleShape).pal.fl ?? s.color : s.color);
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
  // (A plant of the user's own can change under the same id: its bloom color edited, its copies kept their old flowers
  // till a reload. Round 3, Lena, Owen. What it's drawn from is in the key.)
  const own = s.plantId?.startsWith('u-') ? plantsById[s.plantId] : undefined;
  const ownKey = own ? JSON.stringify([own.bloom, own.form, own.flower_color, own.leaf_color]) : '';
  const key = `${s.id}|${s.plantId}|${s.color}|${s.colorSet ? 1 : 0}|${s.flowerColor ?? ''}|${Math.round(r * 4)}|${level}|${month ? JSON.stringify(month) : ''}|${ownKey}`;
  let out = cache.get(key);
  if (out == null) {
    if (cache.size > 3000) cache.clear(); // (zoomed through many sizes: start again)
    out = lookSvg(lookFor(s), r, s.id, level, month);
    cache.set(key, out);
  }
  return k > 1.001 ? `<g transform="scale(${Math.round(k * 1000) / 1000})">${out}</g>` : out;
}
