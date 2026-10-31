// The pin on a plant hidden under a solid one (src/canvas.ts liftHidden), sized by how big that plant is drawn
// (Jason, Oct 31, on his whole plan at 20%: "Can we scale pins with screen size, and hide them entirely at some
// point?"). A pin no bigger than about half the plant it marks; none for a plant drawn smaller than a few pixels, and
// none at all zoomed out past PIN_MIN_ZOOM, where they were a field of dots.

/** The pin's largest radius (px), as it was before: a plant drawn big enough gets the full pin. */
export const PIN_MAX_R = 4.5;
/** Its smallest (px): smaller than this, it isn't drawn. */
export const PIN_MIN_R = 1.5;
/** Below this zoom (1 = 100%), no pins at all. */
export const PIN_MIN_ZOOM = 0.3;

/** A hidden plant's pin radius (px) for its radius as drawn (px), at this zoom; null: none. */
export function pinRadius(plantRpx: number, zoom: number): number | null {
  if (zoom < PIN_MIN_ZOOM) return null;
  const r = Math.min(PIN_MAX_R, plantRpx * 0.5);
  return r >= PIN_MIN_R ? Math.round(r * 10) / 10 : null;
}
