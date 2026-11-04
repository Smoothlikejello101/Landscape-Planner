// @vitest-environment jsdom
// Nudge apart's words for several plants (Jason, Nov 4: "Nudged X 0.8 ft away from Y and Z"), no guessed plurals.
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/render', () => ({ render: () => {}, updateStatusReadout: () => {} }));
import { awaySaid, nudgeRefused } from '../src/ui/fix-problem';
import type { Shape } from '../src/types';

const p = (id: string, label: string): Shape => ({ id, type: 'circle', x: 0, y: 0, radius: 1, role: 'plant', label, color: '#0f0', opacity: 1, locked: false } as Shape);
const snow = p('s', 'Snowberry');

describe('the plants a nudge went away from, in words', () => {
  it('one: by name, or "the other" of its own kind', () => {
    expect(awaySaid(snow, [p('a', 'Aster')])).toBe('Aster');
    expect(awaySaid(snow, [p('t', 'Snowberry')])).toBe('the other');
  });
  it('several: "Y and Z", "the other two", "another Snowberry and Aster", "two Aster"', () => {
    expect(awaySaid(snow, [p('a', 'Aster'), p('b', 'Sedge')])).toBe('Aster and Sedge');
    expect(awaySaid(snow, [p('t', 'Snowberry'), p('u', 'Snowberry')])).toBe('the other two');
    expect(awaySaid(snow, [p('t', 'Snowberry'), p('a', 'Aster')])).toBe('another Snowberry and Aster');
    expect(awaySaid(snow, [p('a', 'Aster'), p('b', 'Aster'), p('c', 'Sedge')])).toBe('two Aster and Sedge');
    expect(awaySaid(snow, [p('a', 'Aster'), p('b', 'Sedge'), p('c', 'Phlox'), p('d', 'Iris')])).toBe('Aster, Sedge and 2 more');
  });
  it('"no room" names them all too', () => {
    expect(nudgeRefused({ ok: false, why: 'plant', mover: snow, other: p('a', 'Aster'), others: [p('a', 'Aster'), p('b', 'Sedge')], third: p('c', 'Phlox') }))
      .toBe('No room to nudge Snowberry away from Aster and Sedge: it would crowd Phlox.');
  });
});
