import { describe, expect, it } from 'vitest';
import { PIN_MAX_R, PIN_MIN_ZOOM, pinRadius } from '../src/pins';

// A hidden plant's pin, sized by the plant as drawn (Jason, Oct 31: "scale pins with screen size, and hide them
// entirely at some point").

describe('pins on hidden plants', () => {
  it('are about half the plant as drawn, never more than the full pin', () => {
    expect(pinRadius(30, 1)).toBe(PIN_MAX_R);
    expect(pinRadius(6, 0.5)).toBe(3);
    expect(pinRadius(3, 0.5)).toBe(1.5);
  });
  it('go where the plant is a speck, and everywhere zoomed out past 30%', () => {
    expect(pinRadius(2.5, 0.5)).toBeNull();
    expect(pinRadius(30, PIN_MIN_ZOOM - 0.01)).toBeNull();
    expect(pinRadius(30, PIN_MIN_ZOOM)).toBe(PIN_MAX_R);
  });
});
