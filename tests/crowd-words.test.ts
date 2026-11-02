// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Crowd } from '../src/crowding';
import { plantsById, type Plant } from '../src/plants';
import type { Shape } from '../src/types';
import { crowdWords } from '../src/ui/crowd-notice';

// The crowding notice's words (src/ui/crowd-notice.ts): two of a kind read as "Two Abyssinian banana 'Maurelii'", not
// the name twice over (Jason's notes after release 3, from the general bug hunt).

const banana = { id: 'cw-banana', common: "Abyssinian banana 'Maurelii'", form: 'Perennial', width: { min: 6, max: 8, med: 7 }, height: { min: 8, max: 12, med: 10 } } as Plant;
const fern = { id: 'cw-fern', common: 'Christmas fern', form: 'Perennial', width: { min: 1, max: 2, med: 1.5 }, height: { min: 1, max: 2, med: 1.5 } } as Plant;
plantsById[banana.id] = banana; plantsById[fern.id] = fern;
const at = (id: string, p: Plant, x: number, radius: number): Shape =>
  ({ id, type: 'circle', role: 'plant', plantId: p.id, label: p.common, x, y: 0, radius, color: '#16a34a', opacity: 0.65 } as Shape);
const crowd = (other: Shape, level: Crowd['level'], distance: number): Crowd => ({ other, level, distance, recommended: 7, shared: 1 } as Crowd);

describe('the crowding notice, two of a kind', () => {
  const a = at('a', banana, 0, 3.5), b = at('b', banana, 6.1, 3.5);
  it('close: "Two … may quickly grow into each other"', () => {
    expect(crowdWords(a, crowd(b, 'close', 6.1), 0, false).detail)
      .toBe("Two Abyssinian banana 'Maurelii' may quickly grow into each other: 6.1 ft apart, where about 7 ft is usual for these two. A little of this can be fine, if you're after a quick, full look.");
  });
  it('crowded: "Two … will grow into each other"', () => {
    expect(crowdWords(a, crowd(b, 'crowded', 3), 0, true).detail).toBe("Two Abyssinian banana 'Maurelii' will grow into each other: 3 ft apart, where about 7 ft is usual for these two.");
  });
  it('one buried by a bigger one of its kind: "This … will be buried by the other" (a plant of no catalog\'s, sized by hand)', () => {
    const own = (id: string, radius: number): Shape => ({ id, type: 'circle', role: 'plant', label: 'Fig', x: 0, y: 0, radius, color: '#16a34a', opacity: 0.65 } as Shape);
    expect(crowdWords(own('s', 0.5), crowd(own('big', 3.5), 'crowded', 1), 0, true).detail)
      .toBe("This Fig will be buried by the other: 1 ft apart, where about 7 ft is usual for these two. Try moving it out toward the other's edge.");
    expect(crowdWords(own('big', 3.5), crowd(own('s', 0.5), 'crowded', 1), 0, true).detail)
      .toBe('This Fig will bury the other: 1 ft apart, where about 7 ft is usual for these two. Try moving it farther away, so the other is out at its edge.');
  });
  it('two different plants: named both, as before', () => {
    expect(crowdWords(at('f', fern, 0, 0.75), crowd(at('g', { ...fern, id: 'cw-fern2', common: 'Wild ginger' } as Plant, 1.2, 0.75), 'close', 1.2), 0, false).detail)
      .toMatch(/^Christmas fern and Wild ginger may quickly grow into one another: /);
  });
});
