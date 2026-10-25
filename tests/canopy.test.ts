// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { canopiesAt, canopyHint, HINT_TIMES, TRUNK_HIT_PX, trunkHitPx } from '../src/canopy';
import { trunkReachPx } from '../src/trees';
import type { CircleShape, Shape } from '../src/types';

const tree = (over: Partial<CircleShape> = {}): CircleShape => ({ id: 'a', type: 'circle', x: 0, y: 0, radius: 10, color: '#000', label: '', opacity: 1, locked: false, role: 'plant', tree: true, ...over });
const bed: Shape = { id: 'b', type: 'rect', x: 2, y: 2, width: 4, height: 3, rotation: 0, color: '#000', label: '', opacity: 1, locked: false, role: 'bed' } as Shape;

describe('canopy taps', () => {
  beforeEach(() => localStorage.clear());
  it('give a trunk a tap target at least a fingertip, its drawn trunk if wider, never past the canopy', () => {
    expect(trunkHitPx(tree({ radius: 10 }), 24)).toBe(Math.max(TRUNK_HIT_PX, trunkReachPx(tree({ radius: 10 }), 24)));
    expect(trunkHitPx(tree({ radius: 10, trunk: 6 }), 24)).toBe(trunkReachPx(tree({ radius: 10, trunk: 6 }), 24));
    expect(trunkHitPx(tree({ radius: 0.5 }), 24)).toBe(12); // a sapling's whole canopy
  });
  it('find the trees a point is under (top-most first), not at the trunk, not outside a pruned outline', () => {
    const a = tree({ id: 'a' }), b = tree({ id: 'b', x: 4 });
    expect(canopiesAt({ x: 3, y: 3 }, [a, bed, b], 24).map((t) => t.id)).toEqual(['b', 'a']);
    expect(canopiesAt({ x: 0, y: 0 }, [a], 24)).toEqual([]); // the trunk
    expect(canopiesAt({ x: 11, y: 0 }, [a], 24)).toEqual([]);
    const pruned = tree({ canopy: [[-4, -2], [4, -2], [4, 3], [-4, 3]], radius: 5 });
    expect(canopiesAt({ x: 0, y: 4 }, [pruned], 24)).toEqual([]); // inside the circle, outside the outline
    expect(canopiesAt({ x: 3.5, y: 2.5 }, [pruned], 24)).toHaveLength(1);
    expect(canopiesAt({ x: 3, y: 3 }, [tree({ role: 'bed' })], 24)).toEqual([]); // not a tree
  });
  it('hint how to pick the tree the first few times, not for the tree just picked', () => {
    const a = tree({ label: 'Big oak' });
    canopyHint({ x: 5, y: 0 }, [a], 24, 'a');
    expect(localStorage.getItem('lp-canopy-hint')).toBe(null);
    for (let i = 0; i < HINT_TIMES + 2; i++) canopyHint({ x: 5, y: 0 }, [a], 24);
    expect(localStorage.getItem('lp-canopy-hint')).toBe(String(HINT_TIMES));
    expect(document.body.textContent).toContain('Under Big oak’s canopy. To pick the tree, tap its trunk.');
  });
});
