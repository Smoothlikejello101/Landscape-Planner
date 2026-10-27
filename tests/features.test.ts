import { describe, expect, it } from 'vitest';
import { afterPointAdded, afterPointDeleted, featureParts, featureSpot, kindsFor, nearestOnEdge, sanitizeSubFeatures } from '../src/features';
import { withLocalParts } from '../src/sync/engine';
import type { PolyShape, RectShape, LineShape, SubFeature } from '../src/types';

const base = { color: '#888', label: '', opacity: 0.65, locked: false };
const house = (rotation = 0): RectShape => ({ ...base, id: 'h', type: 'rect', role: 'building', x: 0, y: 0, width: 20, height: 10, rotation });
const door = (edge: number, at: number, width = 3): SubFeature => ({ id: 'd', kind: 'door', edge, at, width });
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('what goes where', () => {
  it('doors and windows on buildings, gates on fences, steps on decks; none on a bed, a path or a circle', () => {
    expect(kindsFor(house())).toEqual(['door', 'window', 'garage', 'steps', 'downspout', 'spigot', 'ac', 'meter']);
    const fence: LineShape = { ...base, id: 'f', type: 'line', role: 'boundary', x: 0, y: 0, rotation: 0, points: [[0, 0], [30, 0]] };
    expect(kindsFor(fence)).toEqual(['gate']);
    expect(kindsFor({ ...house(), role: 'path' })).toEqual(['steps']);
    expect(kindsFor({ ...fence, role: 'path', pathWidth: 3 })).toEqual([]);
    expect(kindsFor({ ...house(), role: 'bed' })).toEqual([]);
    expect(kindsFor({ ...base, id: 'c', type: 'circle', role: 'building', x: 0, y: 0, radius: 5 })).toEqual([]);
  });
});

describe('a sub-feature on its edge', () => {
  it('sits along its edge, facing out of the shape', () => {
    // The house's top wall runs from (0, 0) to (20, 0); outside is up (y less than 0).
    const at = featureSpot(house(), door(0, 0.5))!;
    close(at.mid.x, 10); close(at.mid.y, 0);
    close(at.n.x, 0); close(at.n.y, -1);
    close(at.from.x, 8.5); close(at.to.x, 11.5);
    // Its bottom wall, (20, 10) to (0, 10): outside is down.
    const bottom = featureSpot(house(), door(2, 0.25))!;
    close(bottom.mid.x, 15); close(bottom.mid.y, 10); close(bottom.n.y, 1);
  });
  it('turns with the shape', () => {
    // Turned 90° around its center (10, 5): the top wall now runs down the plan's right side.
    const at = featureSpot(house(90), door(0, 0.5))!;
    close(at.mid.x, 15); close(at.mid.y, 5);
    close(at.n.x, 1); close(at.n.y, 0);
  });
  it('lands where tapped on the nearest edge, in half-foot steps, a door kept whole on its wall', () => {
    expect(nearestOnEdge(house(), { x: 6.2, y: -0.4 }, 3)).toEqual({ edge: 0, at: 0.3, dist: 0.4 });
    expect(nearestOnEdge(house(), { x: 0.2, y: -0.1 }, 3)!.at).toBe(0.075); // (1.5 ft in: the door fits)
    expect(nearestOnEdge(house(), { x: 20.3, y: 4 }, 0)).toMatchObject({ edge: 1, at: 0.4 });
  });
  it('draws a symbol for each kind', () => {
    const toPx = (p: { x: number; y: number }) => ({ x: p.x * 10, y: p.y * 10 });
    for (const kind of ['door', 'window', 'garage', 'steps', 'downspout', 'spigot', 'ac', 'meter'] as const) {
      expect(featureParts(house(), { id: 'x', kind, edge: 0, at: 0.5, width: 3 }, toPx, 10).length).toBeGreaterThan(0);
    }
    expect(featureParts(house(), door(9, 0.5), toPx, 10)).toEqual([]); // (an edge it doesn't have)
  });
});

describe('points added or taken out', () => {
  // A square outline: edges 0 (top), 1 (right), 2 (bottom), 3 (left), each 10 ft.
  const fs: SubFeature[] = [door(0, 0.2), { ...door(0, 0.8), id: 'd2' }, { ...door(2, 0.5), id: 'd3' }];
  it('a point put in splits its edge in two, each keeping its half', () => {
    expect(afterPointAdded(fs, 0).map((f) => [f.edge, f.at])).toEqual([[0, 0.4], [1, 0.6], [3, 0.5]]);
  });
  it('a point taken out joins its two edges, each keeping its place along them', () => {
    // Point 1 (between the top and right edges) taken out: they become one edge 0, 20 ft long.
    const out = afterPointDeleted(fs, 1, [10, 10, 10, 10], true);
    expect(out.map((f) => [f.edge, f.at])).toEqual([[0, 0.1], [0, 0.4], [1, 0.5]]);
    // Point 0, at the wrap: the left and top edges join, as the last edge.
    const wrap = afterPointDeleted(fs, 0, [10, 10, 10, 10], true);
    expect(wrap.map((f) => [f.edge, f.at])).toEqual([[2, 0.6], [2, 0.9], [1, 0.5]]);
  });
  it("an open line's end point taken out: what was on its end edge goes to the end of the edge left", () => {
    const gates: SubFeature[] = [{ id: 'g', kind: 'gate', edge: 0, at: 0.5, width: 4 }, { id: 'g2', kind: 'gate', edge: 1, at: 0.5, width: 4 }];
    expect(afterPointDeleted(gates, 0, [10, 10], false).map((f) => [f.edge, f.at])).toEqual([[0, 0], [0, 0.5]]);
    expect(afterPointDeleted(gates, 2, [10, 10], false).map((f) => [f.edge, f.at])).toEqual([[0, 0.5], [0, 1]]);
  });
});

describe('stored and synced', () => {
  it('keeps only well-formed sub-features, widths within bounds; [] kept as none', () => {
    expect(sanitizeSubFeatures(undefined)).toBeNull();
    expect(sanitizeSubFeatures([])).toEqual([]);
    expect(sanitizeSubFeatures([
      { id: 'a', kind: 'door', edge: 0, at: 0.5, width: 99 },
      { id: 'b', kind: 'spigot', edge: 2, at: 1.5, width: 3 },
      { id: 'a', kind: 'window', edge: 1, at: 0.5 }, // (the same id again)
      { id: 'c', kind: 'pool', edge: 0, at: 0.5 },
      { id: 'd', kind: 'window', edge: -1, at: 0.5 },
    ])).toEqual([{ id: 'a', kind: 'door', edge: 0, at: 0.5, width: 8 }, { id: 'b', kind: 'spigot', edge: 2, at: 1 }]);
  });
  it("an older version's copy, without them, keeps this device's; one with none on purpose keeps none", () => {
    const poly = (features?: SubFeature[]): PolyShape => ({ ...base, id: 'p', type: 'poly', role: 'building', x: 0, y: 0, rotation: 0, points: [[0, 0], [10, 0], [10, 10]], ...(features ? { features } : {}) });
    const mine = { shapes: [poly([door(0, 0.5)])] };
    expect(withLocalParts({ shapes: [poly()] }, mine).shapes).toEqual([poly([door(0, 0.5)])]);
    expect(withLocalParts({ shapes: [poly([])] }, mine).shapes).toEqual([poly([])]);
  });
});
