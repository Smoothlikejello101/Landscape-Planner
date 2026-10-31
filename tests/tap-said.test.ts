import { describe, expect, it } from 'vitest';
import { tapSaid } from '../src/dom';

// Words for a touch, as the device does it (round 3, Alex: prompts said "Tap" on a computer).

describe('tap, said as the device does it', () => {
  it('keeps "tap" on a touch screen', () => {
    expect(tapSaid('Tap where the note goes', false)).toBe('Tap where the note goes');
  });
  it('says "click" with a mouse, in every form, a double tap a double-click, and leaves other words alone', () => {
    expect(tapSaid('Tap where the note goes', true)).toBe('Click where the note goes');
    expect(tapSaid('Place a plant, then tap the plan where it goes; tap a plant for its details', true))
      .toBe('Place a plant, then click the plan where it goes; click a plant for its details');
    expect(tapSaid('the two points you just tapped', true)).toBe('the two points you just clicked');
    expect(tapSaid('Measuring — tap two points; taps and tapping', true)).toBe('Measuring — click two points; clicks and clicking');
    expect(tapSaid('A double tap opens it. Double tap.', true)).toBe('A double-click opens it. Double-click.');
    expect(tapSaid('A tape measure, a tapir, the Tappan Zee', true)).toBe('A tape measure, a tapir, the Tappan Zee');
  });
});
