import { lookOf, lookSvg, type Look, type LookLevel } from './looks';
import { plantsById } from './plants';
import { state } from './state';
import type { CircleShape, Shape } from './types';

// The app's side of plant looks (src/looks.ts): which shapes are drawn as illustrations, and their markup, kept so a
// redraw (a pan's release, a tap) doesn't draw every plant again. Each plant is drawn its own way (seeded by the
// shape), and a plant of the user's own takes its shape's color.

/** A placed plant drawn as an illustration (Layers: plants drawn, the default). */
export function lookShown(s: Shape): boolean {
  return state.plantLooks && s.type === 'circle' && s.role === 'plant' && !!s.plantId;
}
/** How a placed plant is drawn. */
export const lookFor = (s: CircleShape): Look => lookOf(s.plantId ? plantsById[s.plantId] : undefined, s.color);

/**
 * The largest radius (screen pixels) a plant is drawn at: bigger, the drawing is scaled up, its leaves and blooms with
 * it, as the design was drawn (a tree zoomed in isn't a disc of tiny leaves), and it stays as quick to draw.
 */
export const LOOK_MAX_R = 110;
const cache = new Map<string, string>();
/** A placed plant's illustration at `rPx` (screen pixels), at the origin: SVG markup (src/looks.ts lookSvg). */
export function lookMarkup(s: CircleShape, rPx: number, level: LookLevel): string {
  const r = Math.min(rPx, LOOK_MAX_R), k = rPx / r;
  const key = `${s.id}|${s.plantId}|${s.color}|${Math.round(r * 4)}|${level}`;
  let out = cache.get(key);
  if (out == null) {
    if (cache.size > 3000) cache.clear(); // (zoomed through many sizes: start again)
    out = lookSvg(lookFor(s), r, s.id, level);
    cache.set(key, out);
  }
  return k > 1.001 ? `<g transform="scale(${Math.round(k * 1000) / 1000})">${out}</g>` : out;
}
