import { describe, expect, it } from 'vitest';
import { canopyInnerRadius, fullTrunkDiameter, isTree, setRadius, trunkDiameter, trunkFor } from '../src/trees';
import { plantsById, type Plant } from '../src/plants';
import { canopyFromTaps, circleFromEdges } from '../src/kinds';
import { migrateShape } from '../src/storage';
import { pointInShape, shapeArea } from '../src/geometry';
import type { CircleShape } from '../src/types';

const oak: Plant = { id: 't-oak', common: 'White oak', form: 'Tree (canopy)', width: { min: 30, max: 40, med: 35 } };
plantsById[oak.id] = oak;
const tree = (over: Partial<CircleShape> = {}): CircleShape => ({ id: 'a', type: 'circle', x: 0, y: 0, radius: 10, color: '#000', label: '', opacity: 1, locked: false, role: 'plant', ...over });

describe('trees', () => {
  it('are trees when added as one, or when the plant is a tree', () => {
    expect(isTree(tree({ tree: true }))).toBe(true);
    expect(isTree(tree({ plantId: 't-oak' }))).toBe(true);
    expect(isTree(tree())).toBe(false);
    expect(isTree(tree({ role: 'bed', tree: true }))).toBe(false);
  });
  it('have a trunk in proportion to the canopy, unless set by hand', () => {
    expect(trunkFor(40)).toBe(2);
    expect(trunkDiameter(tree({ radius: 10 }))).toBe(1);
    expect(trunkDiameter(tree({ radius: 1 }))).toBe(0.25); // never smaller than a quarter foot
    expect(trunkDiameter(tree({ trunk: 3 }))).toBe(3);
  });
  it('show their full-grown trunk when drawn below full size, scaled the same way', () => {
    // 40 ft full spread, drawn at 20 ft: a 1 ft trunk now, 2 ft full-grown.
    expect(fullTrunkDiameter(tree({ plantId: 't-oak', radius: 10 }))).toBe(2);
    // Jason's example: 3 ft trunk set by hand on a half-size canopy → 6 ft full-grown.
    expect(fullTrunkDiameter(tree({ plantId: 't-oak', radius: 10, trunk: 3 }))).toBe(6);
    expect(fullTrunkDiameter(tree({ plantId: 't-oak', radius: 20 }))).toBe(null); // already full size
    expect(fullTrunkDiameter(tree({ radius: 10, tree: true }))).toBe(null); // unknown tree: as drawn
  });
  it('can have a canopy pruned into a shape, which scales about the trunk', () => {
    const c = canopyFromTaps({ x: 0, y: 0 }, [{ x: -4, y: -2 }, { x: 4, y: -2 }, { x: 4, y: 3 }, { x: -4, y: 3 }])!;
    expect(c).toEqual({ canopy: [[-4, -2], [4, -2], [4, 3], [-4, 3]], radius: 5 });
    const s = tree({ ...c, tree: true });
    expect(shapeArea(s)).toBe(40);
    expect(pointInShape(s, { x: 0, y: 4 })).toBe(false); // inside the circle, outside the outline
    expect(pointInShape(s, { x: 3.5, y: 2.5 })).toBe(true);
    expect(canopyInnerRadius(s)).toBe(2);
    setRadius(s, 10);
    expect(s.canopy).toEqual([[-8, -4], [8, -4], [8, 6], [-8, 6]]);
  });
  it('round circles are drawn edge to edge', () => {
    expect(circleFromEdges({ x: -4, y: 0 }, { x: 4, y: 6 })).toEqual({ x: 0, y: 3, radius: 5 });
    expect(circleFromEdges({ x: 0, y: 0 }, { x: 0.2, y: 0 })).toBe(null); // too small
  });
  it('load safely from a file', () => {
    const s = migrateShape({ type: 'circle', x: 1, y: 1, radius: 2, role: 'plant', tree: true, trunk: 1.5, canopy: [[-4, 0], [0, -4], [4, 0], [0, 4], ['x', 1]] }) as CircleShape;
    expect(s).toMatchObject({ tree: true, trunk: 1.5, canopy: [[-4, 0], [0, -4], [4, 0], [0, 4]], radius: 4 }); // radius grows to hold the outline
    const bad = migrateShape({ type: 'circle', radius: 2, tree: 'yes', trunk: 500, canopy: [[1, 1], [2, 2]] }) as CircleShape;
    expect(bad.tree).toBeUndefined(); expect(bad.trunk).toBeUndefined(); expect(bad.canopy).toBeUndefined();
  });
});

describe('trees with a catalog trunk size', () => {
  it('draw the mature trunk scaled to the canopy drawn', () => {
    const bur: Plant = { id: 't-bur', common: 'Bur oak', form: 'Tree (canopy)', width: { min: 60, max: 80, med: 70 }, trunk: 4 };
    plantsById[bur.id] = bur;
    const t = (radius: number, over: Partial<CircleShape> = {}) => ({ id: 'b', type: 'circle', x: 0, y: 0, radius, color: '#000', label: '', opacity: 1, locked: false, role: 'plant', plantId: 't-bur', ...over }) as CircleShape;
    expect(trunkDiameter(t(20))).toBe(2); // drawn at half its 80 ft full spread: half its 4 ft trunk
    expect(trunkDiameter(t(40))).toBe(4);
    expect(trunkDiameter(t(50))).toBe(4); // never bigger than mature
    expect(fullTrunkDiameter(t(20))).toBe(4);
    expect(fullTrunkDiameter(t(1))).toBe(4); // the catalog's size, not a tiny trunk's rounding scaled up
    expect(trunkDiameter(t(20, { trunk: 1 }))).toBe(1); // by hand wins
  });
});
