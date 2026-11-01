// The pin on a plant hidden under a solid one (src/canvas.ts liftHidden), sized by how big that plant is drawn
// (Jason, Oct 31, on his whole plan at 20%: "Can we scale pins with screen size, and hide them entirely at some
// point?"). A pin no bigger than about half the plant it marks; none for a plant drawn smaller than a few pixels.
// Then, on his real plan (Nov 1): "if I'm less than about 85% zoomed, I'm never reaching for those pins", they should
// be "smaller as you zoom out, and disappear quicker", and "hide or fade in no-labels view". So: full size from
// PIN_FULL_ZOOM in, half that at PIN_MIN_ZOOM, none below it; and none with the plan's names and badges hidden (a
// plain picture of the plan: the plant under is still picked by a tap at its middle).

/** The pin's largest radius (px): a plant drawn big enough, zoomed in from PIN_FULL_ZOOM, gets the full pin. */
export const PIN_MAX_R = 4.5;
/** Its smallest (px): smaller than this, it isn't drawn. */
export const PIN_MIN_R = 1.5;
/** Below this zoom (1 = 100%), no pins at all; at it, pins at most half size. */
export const PIN_MIN_ZOOM = 0.85;
/** From this zoom in, pins at full size. */
export const PIN_FULL_ZOOM = 1.25;

/** A hidden plant's pin radius (px) for its radius as drawn (px), at this zoom, names shown or not; null: none. */
export function pinRadius(plantRpx: number, zoom: number, named = true): number | null {
  if (!named || zoom < PIN_MIN_ZOOM) return null;
  const k = Math.min(1, 0.5 + 0.5 * (zoom - PIN_MIN_ZOOM) / (PIN_FULL_ZOOM - PIN_MIN_ZOOM));
  const r = Math.min(PIN_MAX_R * k, plantRpx * 0.5);
  return r >= PIN_MIN_R ? Math.round(r * 10) / 10 : null;
}
