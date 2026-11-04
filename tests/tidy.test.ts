// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { ANGLED_MIN, SQUARE_TOL, STICK_DEG, snapTargets, snapToShapes, squareStick, squareUp } from '../src/tidy';
import { maxSquareMove } from '../src/draw';
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
    expect(snapToShapes({ x: 40.4, y: -0.3 }, targets(), 1)).toMatchObject({ point: { x: 40, y: 0 }, to: 'corner', shapeId: 'house' });
    // A bed drawn against the house's right wall, a tap 0.6 ft short of it: on the wall.
    expect(snapToShapes({ x: 39.4, y: 12.3 }, targets(), 1)).toMatchObject({ point: { x: 40, y: 12.3 }, to: 'edge', shapeId: 'house', seg: [{ x: 40, y: 0 }, { x: 40, y: 30 }] });
    expect(snapToShapes({ x: 42, y: 12 }, targets(), 1)).toBeNull();
    state.roleViews = { building: { hidden: true } };
    expect(targets()).toEqual([]);
  });
  it('leaves out sun zones, kept measurements and paths, but not a fence showing its length', () => {
    const line = (id: string, more: Partial<Shape>) => ({ id, type: 'line', x: 0, y: 0, points: [[0, 0], [10, 0]], rotation: 0, label: id, color: '#000', opacity: 1, locked: false, ...more }) as Shape;
    const shapes = [
      { ...house, id: 'sun', role: 'shade' } as Shape,
      line('measure', { role: 'other', showLength: true }),
      line('walk', { role: 'path', pathWidth: 3 }),
      line('fence', { role: 'boundary', showLength: true }),
    ];
    expect(snapTargets(shapes).map((t) => t.id)).toEqual(['fence']);
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
  it('squares to a wall that is off the grid when given its direction', () => {
    // A wall at 20°: two corners on it, the other two tapped by hand about 6 ft out, a little off square.
    const t = (20 * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const at = (u: number, v: number) => ({ x: u * c - v * s, y: u * s + v * c });
    const pts = [at(0, 0), at(10, 0), { ...at(10, 6), x: at(10, 6).x + 0.3 }, at(0, 6.2)];
    const out = squareUp(pts, 1.5, [true, true, false, false], t)!;
    for (const i of [0, 1]) { expect(out[i].x).toBeCloseTo(pts[i].x, 2); expect(out[i].y).toBeCloseTo(pts[i].y, 2); }
    const ang = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);
    expect(ang(out[1], out[2]) - ang(out[0], out[1])).toBeCloseTo(Math.PI / 2, 3);
    expect(ang(out[2], out[3])).toBeCloseTo(t - Math.PI, 3);
  });
  it('won\'t pull corners off the two different things they landed on', () => {
    // One corner on a wall at y = 0, the next on a fence at y = 0.4: squaring would move one off its shape.
    expect(squareUp([{ x: 0, y: 0 }, { x: 10, y: 0.4 }, { x: 10.2, y: 6 }, { x: 0, y: 6.1 }], 1.5, [true, true, false, false])).toBeNull();
  });
  it("leaves alone a tiny wobble of a step, and an outline that would move too far", () => {
    // An L with a step a twentieth of a foot: no step to square.
    expect(squareUp([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 5.05 }, { x: 5.02, y: 5.1 }, { x: 0, y: 5.1 }], 1.5)).toBeNull();
    expect(squareUp([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 34 }], 1.5)).toBeNull();
  });
});

// Jason's notes, Nov 4: "Squaring corners on an outline building probably needs to be more aggressive. Pushing lines
// into parallel might be something to consider too. Houses aren't always rectangles, but they're usually built from
// them, so we should make it easy to build that, and hard to accidentally build a trapezoid or a rhombus." Houses as
// a fingertip taps them at house scale (the Building tool opens where a house fits, about 10 px a foot on a phone): on
// the half-foot grid, each corner a foot or so out.
describe('squaring houses as they are tapped (Jason, Nov 4)', () => {
  type P = { x: number; y: number };
  const ang = (a: P, b: P) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  /** Each corner's angle, whole degrees. */
  const corners = (q: P[]) => q.map((c, i) => {
    const a = q[(i + q.length - 1) % q.length], b = q[(i + 1) % q.length];
    let t = ang(c, b) - ang(a, c); t = ((t % 360) + 540) % 360 - 180;
    return Math.round(180 - Math.abs(t));
  });
  /** Squared as it's finished: with the cap the drawing uses. */
  const finished = (q: P[]) => squareUp(q, maxSquareMove(q));
  const moved = (a: P[], b: P[]) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
  it('uses wider limits than before: 15°, and up to a quarter of the shortest side, 3/4 ft to 3 ft', () => {
    expect([SQUARE_TOL, ANGLED_MIN, STICK_DEG]).toEqual([15, 25, 4]);
    expect(maxSquareMove([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }])).toBe(3);
    expect(maxSquareMove([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 30 }, { x: 0, y: 30 }])).toBe(2);
    expect(maxSquareMove([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }, { x: 0, y: 4 }])).toBe(0.75);
  });
  it('a rectangle a foot out at its corners: square, its opposite sides parallel, with the grid', () => {
    const tapped = [{ x: 0, y: 0 }, { x: 40.5, y: 1 }, { x: 39.5, y: 30.5 }, { x: -0.5, y: 29 }];
    const out = finished(tapped)!;
    expect(corners(out)).toEqual([90, 90, 90, 90]);
    expect(out[0].y).toBeCloseTo(out[1].y, 2); expect(out[2].y).toBeCloseTo(out[3].y, 2); // (with the grid: within 3°)
    expect(out[1].x).toBeCloseTo(out[2].x, 2); expect(out[0].x).toBeCloseTo(out[3].x, 2);
    expect(moved(out, tapped)).toBeLessThan(1.5);
  });
  it('an L whose short wall was tapped a foot out (13° off at its corners, past the old 10°): square', () => {
    const L = [{ x: 0, y: 0 }, { x: 30, y: 0.5 }, { x: 29.5, y: 10 }, { x: 24, y: 11 }, { x: 23, y: 30 }, { x: 0.5, y: 29.5 }];
    expect(Math.abs(corners(L)[2] - 90)).toBeGreaterThan(10);
    const l = finished(L)!;
    expect(corners(l)).toEqual([90, 90, 90, 90, 90, 90]);
    expect(l[1].x).toBeCloseTo(l[2].x, 2); expect(l[2].y).toBeCloseTo(l[3].y, 2); expect(l[3].x).toBeCloseTo(l[4].x, 2);
    expect(moved(l, L)).toBeLessThan(1);
  });
  it('a T: every corner square, its shoulders on one line', () => {
    const T = [{ x: 0, y: 0 }, { x: 40, y: 0.5 }, { x: 39.5, y: 12 }, { x: 25, y: 12.5 }, { x: 25.5, y: 30 }, { x: 15, y: 29.5 }, { x: 14.5, y: 12 }, { x: 0.5, y: 11.5 }];
    const t = finished(T)!;
    expect(corners(t)).toEqual([90, 90, 90, 90, 90, 90, 90, 90]);
    // (The two short walls under the top bar on one line, half a foot apart as tapped: the bar's underside is straight.)
    expect(t[2].y).toBeCloseTo(t[3].y, 2); expect(t[6].y).toBeCloseTo(t[7].y, 2); expect(t[3].y).toBeCloseTo(t[6].y, 2);
  });
  it('a rectangle with a bay window: the walls squared, the bay\'s 45° walls kept at their angle', () => {
    const bay = [{ x: 0, y: 0 }, { x: 40, y: 0.5 }, { x: 39.5, y: 30 }, { x: 24, y: 30.5 }, { x: 21, y: 33.5 }, { x: 15, y: 33 }, { x: 12, y: 30 }, { x: 0.5, y: 29.5 }];
    const out = finished(bay)!;
    expect(out).not.toBeNull();
    const c = corners(out);
    expect([c[0], c[1], c[2], c[7]]).toEqual([90, 90, 90, 90]);
    // The bay's walls run as they were tapped; the wall either side of it, one line.
    expect(ang(out[3], out[4])).toBeCloseTo(ang(bay[3], bay[4]), 6);
    expect(ang(out[5], out[6])).toBeCloseTo(ang(bay[5], bay[6]), 6);
    expect(out[2].y).toBeCloseTo(out[3].y, 2); expect(out[6].y).toBeCloseTo(out[7].y, 2); expect(out[3].y).toBeCloseTo(out[6].y, 2);
    expect(out[4].y).toBeCloseTo(out[5].y, 2); // (the bay's front, parallel to the house's)
    expect(moved(out, bay)).toBeLessThan(1.5);
  });
  it('a point partway along a wall goes on the wall\'s line', () => {
    const out = squareUp([{ x: 0, y: 0 }, { x: 10, y: 0.4 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }])!;
    expect(out.map((p) => Math.round(p.y * 100) / 100)).toEqual([0.13, 0.13, 0.13, 10, 10]);
  });
  it('leaves as drawn what is meant otherwise: a curving bed, a 20° corner, a wedge, one that would move too far', () => {
    const bed = Array.from({ length: 9 }, (_, i) => ({ x: Math.round(12 * Math.cos((i * 2 * Math.PI) / 9) * 2) / 2, y: Math.round(7 * Math.sin((i * 2 * Math.PI) / 9) * 2) / 2 }));
    expect(finished(bed)).toBeNull();
    expect(finished([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 13, y: 8 }, { x: 0, y: 8 }])).toBeNull(); // (a 70° corner: neither)
    expect(finished([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 4 }, { x: 0, y: 12 }])).toBeNull(); // (a wedge: its slant is 22°)
    // A 4 by 20 ft bed whose long side leans 2.5 ft: square enough (7°), but more than a quarter of its 4 ft end.
    expect(finished([{ x: 60, y: 5 }, { x: 64, y: 5 }, { x: 66.5, y: 25 }, { x: 60, y: 25 }])).toBeNull();
    expect(finished([{ x: 60, y: 5 }, { x: 64, y: 5 }, { x: 65.5, y: 25 }, { x: 60, y: 25 }])).not.toBeNull(); // (1.5 ft: 3/4 ft each)
  });
});

describe('a corner dragged sticks square (Jason, Nov 4)', () => {
  const rect = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }];
  it('within a few degrees of square with both its walls: where they cross, a true rectangle', () => {
    expect(squareStick(rect, 2, { x: 20.4, y: 9.7 })).toEqual({ p: { x: 20, y: 10 }, walls: ['before', 'after'] });
  });
  it('one wall near square: on its line, its length in half feet; the other goes where the finger puts it', () => {
    const r = squareStick(rect, 2, { x: 20.3, y: 14.2 })!; // (the wall from (20, 0) within 4°; the other 23° off)
    expect(r).toEqual({ p: { x: 20, y: 14 }, walls: ['before'] });
  });
  it('past the stick, nothing: it goes where it is put', () => {
    expect(squareStick(rect, 2, { x: 22, y: 13 })).toBeNull();
  });
  it('a turned house sticks to its own directions, not the grid\'s', () => {
    const t = (30 * Math.PI) / 180, at = (u: number, v: number) => ({ x: u * Math.cos(t) - v * Math.sin(t), y: u * Math.sin(t) + v * Math.cos(t) });
    const turned = [at(0, 0), at(20, 0), at(20, 10), at(0, 10)];
    const r = squareStick(turned, 2, at(20.3, 10.2))!;
    expect(r.walls).toEqual(['before', 'after']);
    expect(r.p.x).toBeCloseTo(turned[2].x, 2); expect(r.p.y).toBeCloseTo(turned[2].y, 2);
  });
  it('an L\'s corner, and a bay\'s angled walls left out of the directions', () => {
    const L = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 15 }, { x: 15, y: 15 }, { x: 15, y: 30 }, { x: 0, y: 30 }];
    expect(squareStick(L, 3, { x: 15.6, y: 14.6 })).toEqual({ p: { x: 15, y: 15 }, walls: ['before', 'after'] });
    const bay = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 24, y: 30 }, { x: 21, y: 33 }, { x: 15, y: 33 }, { x: 12, y: 30 }, { x: 0, y: 30 }];
    expect(squareStick(bay, 1, { x: 40.5, y: -0.4 })?.p).toEqual({ x: 40, y: 0 });
  });
  it('not on a curving bed', () => {
    const bed = [{ x: 0, y: 0 }, { x: 6, y: -2 }, { x: 11, y: 1 }, { x: 12, y: 6 }, { x: 7, y: 9 }, { x: 1, y: 7 }];
    expect(squareStick(bed, 3, { x: 11.1, y: 6 })).toBeNull();
  });
});
