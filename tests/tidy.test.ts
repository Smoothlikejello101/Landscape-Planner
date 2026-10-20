// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { snapTargets, snapToShapes, squareUp } from '../src/tidy';
import { state } from '../src/state';
import type { Shape } from '../src/types';

// Tidying what's drawn: taps landing on other shapes' corners and edges, nearly square outlines squared.

const house = { id: 'house', type: 'rect', x: 0, y: 0, width: 40, height: 30, rotation: 0, label: 'House', role: 'building', color: '#000', opacity: 1, locked: false } as Shape;
const close = (a: { x: number; y: number }[], b: { x: number; y: number }[]) => a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-6 && Math.abs(p.y - b[i].y) < 1e-6);

beforeEach(() => { state.viewFilter = { status: '', phase: '', showGone: false }; state.roleViews = {}; });

describe('landing on another shape', () => {
  const targets = () => snapTargets([house, { id: 'p', type: 'circle', x: 60, y: 0, radius: 1, role: 'plant', label: 'x', color: '#0f0', opacity: 1, locked: false } as Shape]);
  it('lands on a corner first, else the nearest edge, within the reach; plants and hidden things aren\'t targets', () => {
    expect(targets().map((t) => t.id)).toEqual(['house']);
    expect(snapToShapes({ x: 40.4, y: -0.3 }, targets(), 1)).toEqual({ point: { x: 40, y: 0 }, to: 'corner', shapeId: 'house' });
    // A bed drawn against the house's right wall, a tap 0.6 ft short of it: on the wall.
    expect(snapToShapes({ x: 39.4, y: 12.3 }, targets(), 1)).toEqual({ point: { x: 40, y: 12.3 }, to: 'edge', shapeId: 'house' });
    expect(snapToShapes({ x: 42, y: 12 }, targets(), 1)).toBeNull();
    state.roleViews = { building: { hidden: true } };
    expect(targets()).toEqual([]);
  });
});

describe('squaring up', () => {
  it('squares a nearly square four-sided outline, lined up with the grid when nearly so', () => {
    const out = squareUp([{ x: 0, y: 0 }, { x: 10.3, y: 0.2 }, { x: 10, y: 8 }, { x: 0.2, y: 7.8 }]);
    expect(out).not.toBeNull();
    // Opposite sides parallel to the grid: a true rectangle.
    expect(out![0].y).toBeCloseTo(out![1].y); expect(out![1].x).toBeCloseTo(out![2].x);
    expect(out![2].y).toBeCloseTo(out![3].y); expect(out![3].x).toBeCloseTo(out![0].x);
  });
  it('keeps a turned outline\'s own direction, squares an L-shaped house, and leaves alone what isn\'t nearly square', () => {
    const t = (deg: number) => (deg * Math.PI) / 180;
    const rot = (p: { x: number; y: number }) => ({ x: p.x * Math.cos(t(30)) - p.y * Math.sin(t(30)), y: p.x * Math.sin(t(30)) + p.y * Math.cos(t(30)) });
    const turned = squareUp([{ x: 0, y: 0 }, { x: 10, y: 0.3 }, { x: 10, y: 6 }, { x: 0, y: 6 }].map(rot))!;
    const ang = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    expect(Math.abs(ang(turned[0], turned[1]) - 30)).toBeLessThan(1.5);
    expect(Math.abs(Math.abs(ang(turned[1], turned[2]) - ang(turned[0], turned[1])) - 90)).toBeLessThan(0.05); // (corners rounded to a thousandth of a foot)
    const L = squareUp([{ x: 0, y: 0 }, { x: 20, y: 0.4 }, { x: 20, y: 10 }, { x: 10.3, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }]);
    expect(L).not.toBeNull();
    expect(L!.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10])).toEqual([[0, 0.2], [20, 0.2], [20, 10], [10.2, 10], [10.2, 20], [0, 20]]);
    expect(squareUp([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 13, y: 8 }, { x: 0, y: 8 }])).toBeNull(); // (a 70° corner)
    expect(squareUp([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }])).toBeNull(); // (a triangle)
    expect(squareUp([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }])).toBeNull(); // (square already)
    expect(squareUp([{ x: 0, y: 0 }, { x: 10.3, y: 0.2 }, { x: 10, y: 8 }, { x: 0.2, y: 7.8 }], 0.05)).toBeNull(); // (would move too far)
  });
  it('keeps the corners that landed on another shape, and takes its direction from the edge between them', () => {
    // A bed against the house wall (x = 40): two corners on the wall, two tapped by hand, slightly off.
    const out = squareUp([{ x: 40, y: 5 }, { x: 46.4, y: 5.3 }, { x: 46, y: 15.2 }, { x: 40, y: 15 }], Infinity, [true, false, false, true])!;
    expect(close([out[0], out[3]], [{ x: 40, y: 5 }, { x: 40, y: 15 }])).toBe(true);
    expect(out[1].y).toBeCloseTo(5); expect(out[2].y).toBeCloseTo(15); expect(out[1].x).toBeCloseTo(out[2].x);
  });
});
