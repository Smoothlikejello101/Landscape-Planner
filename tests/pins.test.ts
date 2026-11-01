import { describe, expect, it } from 'vitest';
import { PIN_FULL_ZOOM, PIN_MAX_R, PIN_MIN_ZOOM, pinRadius } from '../src/pins';

// A hidden plant's pin, sized by the plant as drawn (Jason, Oct 31: "scale pins with screen size, and hide them
// entirely at some point"), and by the zoom (Nov 1: "smaller as you zoom out, and disappear quicker"; never reached
// for below about 85%; "hide or fade in no-labels view").

describe('pins on hidden plants', () => {
  it('are about half the plant as drawn, never more than the full pin', () => {
    expect(pinRadius(30, PIN_FULL_ZOOM)).toBe(PIN_MAX_R);
    expect(pinRadius(30, 3)).toBe(PIN_MAX_R);
    expect(pinRadius(6, 2)).toBe(3);
    expect(pinRadius(3, 2)).toBe(1.5);
  });
  it('shrink as the plan zooms out, to half at 85%, and go below it', () => {
    expect(pinRadius(30, 1)).toBeLessThan(PIN_MAX_R);
    expect(pinRadius(30, 1)).toBeGreaterThan(PIN_MAX_R / 2);
    expect(pinRadius(30, PIN_MIN_ZOOM)).toBe(2.3); // (half of 4.5, rounded)
    expect(pinRadius(30, PIN_MIN_ZOOM - 0.01)).toBeNull();
    expect(pinRadius(30, 0.5)).toBeNull();
  });
  it('go where the plant is a speck, and with the names hidden', () => {
    expect(pinRadius(2.5, 2)).toBeNull();
    expect(pinRadius(30, 2, false)).toBeNull();
  });
});
