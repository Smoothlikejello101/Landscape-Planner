import { describe, expect, it } from 'vitest';
import { movedWith } from '../src/beds';
import type { Shape } from '../src/types';

const base = { color: '#16a34a', label: '', opacity: 0.65, locked: false };
const bed = { ...base, id: 'bed', type: 'rect', x: 0, y: 0, width: 10, height: 10, rotation: 0, role: 'bed' } as Shape;
const plant = (id: string, x: number) => ({ ...base, id, type: 'circle', x, y: 5, radius: 1, role: 'plant' } as Shape);
const shapes = [bed, plant('a', 2), plant('b', 5), plant('c', 8)];

describe('what moves with a selection (Jason, Oct 31, from round 3: Hank)', () => {
  it('a bed alone brings its plants', () => {
    expect(movedWith([bed], shapes).sort()).toEqual(['a', 'b', 'bed', 'c']);
  });
  it('with plants among the selection, only what is selected', () => {
    expect(movedWith([bed, shapes[1]], shapes).sort()).toEqual(['a', 'bed']);
  });
});
