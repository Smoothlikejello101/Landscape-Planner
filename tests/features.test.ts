import { describe, expect, it } from 'vitest';
import { afterPointAdded, afterPointDeleted, featureHitPart, featureParts, featureSpot, kindsFor, knownFeatures, nearestOnEdge, sanitizeSubFeatures } from '../src/features';
import { pointInPolygon } from '../src/geometry';
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
  it('faces out at every corner, whichever way round the outline was drawn, an inside corner too', () => {
    // A U-shaped house, drawn clockwise on screen and then the other way round.
    const u: [number, number][] = [[0, 0], [30, 0], [30, 20], [20, 20], [20, 8], [10, 8], [10, 20], [0, 20]];
    for (const pts of [u, [...u].reverse()]) {
      const poly: PolyShape = { ...base, id: 'u', type: 'poly', role: 'building', x: 0, y: 0, rotation: 0, points: pts };
      for (let edge = 0; edge < pts.length; edge++) {
        for (const at of [0, 0.5, 1]) {
          const spot = featureSpot(poly, { id: 's', kind: 'downspout', edge, at })!;
          // (A little out along the wall's own outward side, from just inside its ends, is outside the house.)
          const along = Math.min(Math.max(at * spot.edgeLen, 0.1), spot.edgeLen - 0.1);
          const p = { x: spot.a.x + spot.u.x * along + spot.n.x * 0.05, y: spot.a.y + spot.u.y * along + spot.n.y * 0.05 };
          expect(pointInPolygon(pts.map(([x, y]) => ({ x, y })), p), `edge ${edge} at ${at}`).toBe(false);
        }
      }
    }
  });
  it('keeps a stretch on its edge as drawn, a wall shortened since', () => {
    // A 3 ft door stored at the very start of the top wall: drawn from 0 to 3 ft, not hanging off the corner.
    const at = featureSpot(house(), door(0, 0))!;
    close(at.from.x, 0); close(at.to.x, 3);
    // An 8 ft garage door on a 5 ft wall: the whole wall.
    const short: RectShape = { ...house(), width: 5 };
    const g = featureSpot(short, { id: 'g', kind: 'garage', edge: 0, at: 0.9, width: 8 })!;
    close(g.from.x, 0); close(g.to.x, 5);
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
    // (A kind from a later version: kept, not drawn.)
    const later = { id: 'p', kind: 'pool', edge: 0, at: 0.5 } as unknown as SubFeature;
    expect(featureParts(house(), later, toPx, 10)).toEqual([]);
    expect(featureHitPart(house(), later, toPx, 10)).toBeNull();
    expect(knownFeatures([door(0, 0.5), later])).toEqual([door(0, 0.5)]);
  });
  it('hinges a door at either end of its opening, swinging out or in', () => {
    const toPx = (p: { x: number; y: number }) => ({ x: p.x * 10, y: p.y * 10 });
    // (The house's top wall, a 3 ft door at its middle: from x 8.5 to 11.5 ft, y 0; out is up, -y.)
    const leaf = (f: Partial<SubFeature>) => featureParts(house(), { ...door(0, 0.5), ...f }, toPx, 10)[1].attrs;
    expect(leaf({})).toMatchObject({ x1: 85, y1: 0, x2: 85, y2: -30 }); // (as before: hinged where it starts, out)
    expect(leaf({ hinge: 'end' })).toMatchObject({ x1: 115, y1: 0, x2: 115, y2: -30 });
    expect(leaf({ swing: 'in' })).toMatchObject({ x1: 85, y1: 0, x2: 85, y2: 30 });
    expect(leaf({ hinge: 'end', swing: 'in' })).toMatchObject({ x1: 115, x2: 115, y2: 30 });
    // (A window has neither: kept off it.)
    expect(sanitizeSubFeatures([{ id: 'w', kind: 'window', edge: 0, at: 0.5, hinge: 'end', swing: 'in' }])).toEqual([{ id: 'w', kind: 'window', edge: 0, at: 0.5, width: 3 }]);
  });
  it("takes taps no wider than a line's band zoomed far out, a finger's close in", () => {
    const toPx = (k: number) => (p: { x: number; y: number }) => ({ x: p.x * k, y: p.y * k });
    // (At 5% zoom, about 1.2 px a foot, a line's band is 6 px.)
    const far = featureHitPart(house(), door(0, 0.5), toPx(1.2), 1.2, 6)!;
    expect(far.attrs['stroke-width']).toBe(6);
    const tap = featureHitPart(house(), { id: 's', kind: 'spigot', edge: 0, at: 0.5 }, toPx(1.2), 1.2, 6)!;
    expect(tap.attrs.r).toBe(4);
    expect(featureHitPart(house(), door(0, 0.5), toPx(24), 24, 18)!.attrs['stroke-width']).toBe(18);
  });
});

describe('points added or taken out', () => {
  // A square outline: edges 0 (top), 1 (right), 2 (bottom), 3 (left), each 10 ft.
  const fs: SubFeature[] = [door(0, 0.2), { ...door(0, 0.8), id: 'd2' }, { ...door(2, 0.5), id: 'd3' }];
  it('a point put in splits its edge in two, each keeping its half', () => {
    expect(afterPointAdded(fs, 0).map((f) => [f.edge, f.at])).toEqual([[0, 0.4], [1, 0.6], [3, 0.5]]);
  });
  it('a point put in off the middle (where it was pressed) splits the edge there: each stays where it was', () => {
    // The top edge cut 3.5 ft along (of 10): the door 2 ft along stays 2 ft along; the one at 8 ft is 4.5 ft into
    // the second part, 6.5 ft long.
    const out = afterPointAdded(fs, 0, 0.35);
    expect(out.map((f) => f.edge)).toEqual([0, 1, 3]);
    expect(out[0].at * 3.5).toBeCloseTo(2, 2); expect(out[1].at * 6.5).toBeCloseTo(4.5, 2); // (stored to 4 places)
    // One right where the point goes in: on the longer part.
    expect(afterPointAdded([door(0, 0.35)], 0, 0.35)[0]).toMatchObject({ edge: 1, at: 0 });
    expect(afterPointAdded([door(0, 0.6)], 0, 0.6)[0]).toMatchObject({ edge: 0, at: 1 });
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
      { id: 'c', kind: 'pool', edge: 0, at: 0.5, depth: 6, note: { x: 1 } },
      { id: 'd', kind: 'window', edge: -1, at: 0.5 },
      { id: 'e', kind: '<script>', edge: 0, at: 0.5 },
    ])).toEqual([
      { id: 'a', kind: 'door', edge: 0, at: 0.5, width: 8 }, { id: 'b', kind: 'spigot', edge: 2, at: 1 },
      // (A later version's kind, kept as it came, its plain values only: not taken away by saving here.)
      { id: 'c', kind: 'pool', edge: 0, at: 0.5, depth: 6 },
    ]);
  });
  it("an older version's copy, without them, keeps this device's; one with none on purpose keeps none", () => {
    const poly = (features?: SubFeature[]): PolyShape => ({ ...base, id: 'p', type: 'poly', role: 'building', x: 0, y: 0, rotation: 0, points: [[0, 0], [10, 0], [10, 10]], ...(features ? { features } : {}) });
    const mine = { shapes: [poly([door(0, 0.5)])] };
    expect(withLocalParts({ shapes: [poly()] }, mine).shapes).toEqual([poly([door(0, 0.5)])]);
    expect(withLocalParts({ shapes: [poly([])] }, mine).shapes).toEqual([poly([])]);
    // (A rectangle turned into an outline on the older device keeps its edges in order: its doors come too.)
    const rect = { ...house(), features: [door(0, 0.5)] };
    const outline = { ...poly(), id: 'h', points: [[0, 0], [20, 0], [20, 10], [0, 10]] };
    expect((withLocalParts({ shapes: [outline] }, { shapes: [rect] }).shapes as object[])[0]).toMatchObject({ features: [door(0, 0.5)] });
    // (Not a fence turned into a bed outline: other edges.)
    const fence = { ...base, id: 'h', type: 'line', role: 'boundary', x: 0, y: 0, rotation: 0, points: [[0, 0], [20, 0]], features: [door(0, 0.5)] };
    expect((withLocalParts({ shapes: [outline] }, { shapes: [fence] }).shapes as object[])[0]).not.toHaveProperty('features');
  });
});
