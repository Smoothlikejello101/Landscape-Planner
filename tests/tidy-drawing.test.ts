// @vitest-environment jsdom
// Tidy drawing as it's used: taps on a house whose walls are off the half-foot grid (measured), and a turned one.
// What the dots show is what's made; only squaring is said after, and its Undo is one step back.
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/render', () => ({ render: () => {}, updateStatusReadout: () => {} }));
vi.mock('../src/storage', async (orig) => ({ ...(await orig() as object), save: () => {} }));
import { drawTap, lastSnap, notePointer, moveVertex, startDraw, startEditPoints, undoDrawPoint, unsnapLast, unsnapVertex, vertexSnap, wallDirection } from '../src/draw';
import { state } from '../src/state';
import { pathPoints, shapeBBox } from '../src/geometry';
import { setSnapOn, setSquareOn } from '../src/tidy';
import type { PathShape, Point, Shape } from '../src/types';

const FT = 24; // (screen px per foot at zoom 1, the canvas at the window's corner)
const tap = (x: number, y: number) => drawTap(x * FT, y * FT);
// The house: its right wall at x = 30.47, its top at y = 0.13.
const house = { id: 'house', type: 'rect', x: 0.17, y: 0.13, width: 30.3, height: 20.4, rotation: 0, label: 'House', role: 'building', color: '#000', opacity: 1, locked: false } as Shape;
const notice = () => document.getElementById('toast-action');
const button = (label: string) => [...(notice()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label) as HTMLButtonElement | undefined;
const outline = (id: string) => pathPoints(state.shapes.find((x) => x.id === id) as PathShape);
const near = (a: Point[], b: Point[], tol = 0.002) => a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i].x) < tol && Math.abs(p.y - b[i].y) < tol);

beforeEach(() => {
  notePointer('touch');
  document.body.innerHTML = '<svg id="canvas-svg"></svg>';
  state.zoom = 1; state.offsetX = 0; state.offsetY = 0;
  state.shapes = [JSON.parse(JSON.stringify(house))]; state.history = []; state.historyIndex = -1; state.draw = null; state.editPoints = null;
  state.viewFilter = { status: '', phase: '', showGone: false }; state.roleViews = {};
  setSnapOn(true); setSquareOn(true);
});

describe('snapping, shown as it happens', () => {
  it('lands a tap on the off-grid wall where the dot shows, offers Unsnap, and says nothing after', () => {
    startDraw('poly', 'bed');
    tap(30.47, 5); tap(30.6, 12); // (the second 0.13 ft off the wall)
    expect(state.draw!.points).toEqual([{ x: 30.47, y: 5 }, { x: 30.47, y: 12 }]);
    expect(lastSnap()).toMatchObject({ shapeId: 'house', to: 'edge', alt: { x: 30.5, y: 12 } });
    tap(36, 12); tap(36, 5); tap(30.47, 5); // (closes it: square already)
    const id = state.selectedIds[0];
    expect(near(outline(id), [{ x: 30.47, y: 5 }, { x: 30.47, y: 12 }, { x: 36, y: 12 }, { x: 36, y: 5 }])).toBe(true);
    expect(notice()).toBeNull(); // (nothing changed after the dots: nothing to say)
  });
  it('unsnaps the last tap onto the grid, and Undo point takes the tap back', () => {
    startDraw('poly', 'bed');
    tap(30.6, 5);
    expect(state.draw!.points).toEqual([{ x: 30.47, y: 5 }]);
    unsnapLast();
    expect(state.draw!.points).toEqual([{ x: 30.5, y: 5 }]);
    expect(lastSnap()).toBeNull();
    undoDrawPoint();
    expect(state.draw!.points).toEqual([]);
  });
  it('reaches a fingertip (32 px on screen), a foot and a quarter at most', () => {
    startDraw('poly', 'bed');
    tap(31.6, 5); // (1.13 ft, 27 px off)
    expect(state.draw!.points).toEqual([{ x: 30.47, y: 5 }]);
    tap(31.9, 9); // (1.43 ft off)
    expect(state.draw!.points[1]).toEqual({ x: 32, y: 9 });
    state.zoom = 4; // (96 px a foot: 32 px is a third of a foot)
    startDraw('poly', 'bed');
    drawTap(30.9 * 96, 6 * 96);
    expect(state.draw!.points).toEqual([{ x: 31, y: 6 }]);
  });
  it('with a mouse, reaches only 14 px (it lands where it points)', () => {
    notePointer('mouse');
    startDraw('poly', 'bed');
    tap(31.2, 5); // (0.73 ft, 17.5 px off)
    expect(state.draw!.points).toEqual([{ x: 31, y: 5 }]);
  });
  it('closes an outline by a tap where its first point was tapped, before it snapped', () => {
    startDraw('poly', 'bed');
    tap(31.5, 5); tap(36, 5); tap(36, 12); tap(31.5, 12); // (both near-wall corners onto the wall at 30.47)
    tap(31.5, 5); // (where the first was tapped: 25 px from its dot)
    expect(state.draw).toBeNull();
    expect(outline(state.selectedIds[0])).toHaveLength(4);
  });
  it('tapping again where the last tap was, after it snapped, is the same tap; a near miss beside the wall closes', () => {
    startDraw('poly', 'bed');
    tap(31.5, 5); // (onto the wall at 30.47)
    state.draw!.lastTap!.t -= 1000; // (a second later: "did it register?")
    tap(31.5, 5);
    expect(state.draw!.points).toHaveLength(1);
    tap(36, 5); tap(36, 12); tap(31.5, 12);
    tap(31.3, 5.3); // (21 px from the first dot, landing on the wall a grid step from it)
    expect(state.draw).toBeNull();
    expect(outline(state.selectedIds[0])).toHaveLength(4);
  });
  it('a tap landing on the last point, from a foot away, goes on the grid rather than nowhere', () => {
    startDraw('measure');
    tap(30.47, 6); tap(31.5, 6); // (a foot out from the wall: would land on the wall, on the first point)
    expect(state.draw!.points).toEqual([{ x: 30.47, y: 6 }, { x: 31.5, y: 6 }]);
  });
  it("reaches a corner only at a corner's reach: off an edge's end isn't on the edge", () => {
    startDraw('poly', 'bed');
    tap(31.2, 21.2); // (past the house's bottom-right corner, 30.47 × 20.53: 0.99 ft off it)
    expect(state.draw!.points).toEqual([{ x: 31, y: 21 }]);
    state.draw!.lastTap!.t -= 1000; // (a moment later: not a double tap)
    tap(30.8, 20.8); // (0.43 ft off: on the corner)
    expect(state.draw!.points[1]).toEqual({ x: 30.47, y: 20.53 });
  });
  it('lands on a turned wall where the finger is, not where its grid point would project', () => {
    state.shapes = [{ ...house, x: 0, y: 0, width: 30, height: 20, rotation: 10 } as Shape];
    startDraw('poly', 'bed');
    // A point on the turned right wall, tapped a little outside it.
    const c = { x: 15, y: 10 }, t = (10 * Math.PI) / 180, onWall = { x: c.x + 15 * Math.cos(t) - 2 * Math.sin(t), y: c.y + 15 * Math.sin(t) + 2 * Math.cos(t) };
    tap(onWall.x + 0.2 * Math.cos(t), onWall.y + 0.2 * Math.sin(t));
    const p = state.draw!.points[0];
    expect(Math.hypot(p.x - onWall.x, p.y - onWall.y)).toBeLessThan(0.01);
  });
  it("never refuses a tap because of where it snapped: a triangle's third corner on the same wall goes on the grid", () => {
    startDraw('triangle', 'bed');
    tap(30.47, 4); tap(30.47, 10); tap(30.8, 7); // (would land on the wall, in line with the first two)
    expect(state.draw).toBeNull(); // (made)
    expect(state.shapes).toHaveLength(2);
  });
  it('tells a double tap by the finger: two taps either side of the wall, apart, are two taps', () => {
    startDraw('poly', 'bed');
    drawTap(30.47 * FT, 6 * FT); drawTap(30.47 * FT + 5, 6 * FT); // (5 px: the same tap)
    expect(state.draw!.points).toHaveLength(1);
    drawTap(30.47 * FT + 15, 6 * FT + 9); // (a shaky second tap, 17 px off: still the same tap)
    expect(state.draw!.points).toHaveLength(1);
    // Later, the same spot is another tap; landing on the same point as the last, it's the same spot again.
    state.draw!.lastTap!.t -= 1000;
    drawTap(30.47 * FT + 5, 6 * FT);
    expect(state.draw!.points).toHaveLength(1);
    tap(32, 6);
    expect(state.draw!.points).toEqual([{ x: 30.47, y: 6 }, { x: 32, y: 6 }]);
  });
  it('after a pan, a tap in the same spot on screen is a new tap', async () => {
    const { forgetLastTap } = await import('../src/draw');
    startDraw('poly', 'bed');
    tap(40, 6);
    state.offsetX = 3; forgetLastTap(); // (panned 3 ft)
    tap(40, 6);
    expect(state.draw!.points).toEqual([{ x: 40, y: 6 }, { x: 43, y: 6 }]);
  });
  it('a shape that finishes on its last tap says where that tap landed, and Undo puts it on the grid', () => {
    startDraw('rect', 'bed');
    tap(36, 5); tap(36, 12); tap(30.6, 9); // (the last, unseen, onto the wall)
    const id = state.selectedIds[0];
    const left = () => shapeBBox(state.shapes.find((x) => x.id === id)!).minX;
    expect(left()).toBeCloseTo(30.47);
    expect(notice()?.textContent).toContain('Last point on House.');
    button('Undo')!.click();
    expect(left()).toBeCloseTo(30.5);
    expect(notice()).toBeNull();
  });
  it('snaps a dragged point, lit, with Unsnap as its own step', () => {
    state.shapes.push({ id: 'bed', type: 'poly', x: 0, y: 0, points: [[32, 5], [36, 5], [36, 9], [32, 9]], rotation: 0, label: 'Bed', role: 'bed', color: '#0f0', opacity: 1, locked: false } as unknown as Shape);
    startEditPoints('bed');
    state.editPoints!.vertex = 0;
    moveVertex(state.shapes[1] as PathShape, 0, { x: 30.6, y: 5 });
    expect(outline('bed')[0]).toEqual({ x: 30.47, y: 5 });
    expect(vertexSnap()).toMatchObject({ shapeId: 'house', index: 0, alt: { x: 30.5, y: 5 } });
    unsnapVertex();
    expect(outline('bed')[0]).toEqual({ x: 30.5, y: 5 });
  });
  it("offers no Unsnap for a dragged point that's been moved back since (the toolbar's Undo)", () => {
    state.shapes.push({ id: 'bed', type: 'poly', x: 0, y: 0, points: [[32, 5], [36, 5], [36, 9], [32, 9]], rotation: 0, label: 'Bed', role: 'bed', color: '#0f0', opacity: 1, locked: false } as unknown as Shape);
    startEditPoints('bed');
    state.editPoints!.vertex = 0;
    const before = JSON.parse(JSON.stringify(state.shapes[1]));
    moveVertex(state.shapes[1] as PathShape, 0, { x: 30.6, y: 5 });
    expect(vertexSnap()).not.toBeNull();
    state.shapes[1] = before; // (as the toolbar's Undo puts it back)
    expect(vertexSnap()).toBeNull();
    unsnapVertex();
    expect(outline('bed')[0]).toEqual({ x: 32, y: 5 });
  });
  it('turned off, lands on the grid', () => {
    setSnapOn(false);
    startDraw('poly', 'bed');
    tap(30.47, 5);
    expect(state.draw!.points).toEqual([{ x: 30.5, y: 5 }]);
  });
});

describe('squaring, said after, with Undo one step back', () => {
  it('squares an almost-rectangle, says how far it moved, and Undo gives back the dots as drawn', () => {
    startDraw('poly', 'bed');
    tap(30.47, 5); tap(36, 5); tap(36, 12.5); tap(30.47, 12); tap(30.47, 5);
    const id = state.selectedIds[0];
    expect(notice()?.textContent).toContain('Squared the corners (moved up to 0.5 ft).');
    expect(near(outline(id), [{ x: 30.47, y: 5 }, { x: 36, y: 5 }, { x: 36, y: 12 }, { x: 30.47, y: 12 }])).toBe(true);
    const steps = state.historyIndex;
    button('Undo')!.click();
    expect(state.historyIndex).toBe(steps - 1); // (the toolbar's Undo: the same step)
    expect(near(outline(id), [{ x: 30.47, y: 5 }, { x: 36, y: 5 }, { x: 36, y: 12.5 }, { x: 30.47, y: 12 }])).toBe(true);
  });
  it("its notice's Undo does nothing once something else has changed, and says so", () => {
    startDraw('poly', 'bed');
    tap(30.47, 5); tap(36, 5); tap(36, 12.5); tap(30.47, 12); tap(30.47, 5);
    state.shapes[0].label = 'Home'; state.history.push({ shapes: JSON.parse(JSON.stringify(state.shapes)), bgImage: null, photoElsewhere: null }); state.historyIndex++;
    button('Undo')!.click();
    expect(document.getElementById('toast')?.textContent).toContain('It has changed since');
  });
  it('squares to a turned wall it was drawn against, even with one corner on it', () => {
    state.shapes = [{ ...house, x: 0, y: 0, width: 30, height: 20, rotation: 2 } as Shape];
    const t = (2 * Math.PI) / 180, c = { x: 15, y: 10 };
    const wall = (v: number) => ({ x: c.x + 15 * Math.cos(t) - v * Math.sin(t), y: c.y + 15 * Math.sin(t) + v * Math.cos(t) }); // (the right wall, v along it)
    const a = wall(-6);
    startDraw('poly', 'bed');
    tap(a.x, a.y); tap(a.x + 5, a.y + 0.2); tap(a.x + 5, a.y + 6); tap(a.x + 0.25, a.y + 6); tap(a.x, a.y);
    const pts = outline(state.selectedIds[0]);
    // The side by the wall runs with it: its far corner on the wall too, no sliver.
    const ang = Math.atan2(pts[3].y - pts[0].y, pts[3].x - pts[0].x);
    expect(Math.abs(ang - (t + Math.PI / 2))).toBeLessThan(0.001);
    expect(wallDirection([a, { x: a.x + 5, y: a.y }, { x: a.x + 5, y: a.y + 6 }, { x: a.x, y: a.y + 6 }], [{ to: 'edge', shapeId: 'h', seg: [a, a], angles: [t + Math.PI / 2], alt: a }, null, null, null])).toBeCloseTo(t + Math.PI / 2);
  });
  it("doesn't reshape a small bed much: a tenth of its shortest side, a grid step at least", () => {
    startDraw('poly', 'bed');
    tap(40, 5); tap(43, 5); tap(43, 9.5); tap(40.5, 9.4); tap(40, 5); // (its 0.5 ft lean fine; not more)
    expect(notice()?.textContent).toContain('Squared');
    startDraw('poly', 'bed');
    tap(50, 5); tap(53, 5); tap(53, 9.5); tap(50.8, 9.4); tap(50, 5);
    expect(notice()).toBeNull(); // (0.8 ft off: more than it may move, left as drawn)
  });
  it('turned off, leaves the outline as drawn', () => {
    setSquareOn(false);
    startDraw('poly', 'bed');
    tap(30.47, 5); tap(36, 5); tap(36, 12.5); tap(30.47, 12); tap(30.47, 5);
    expect(notice()).toBeNull();
    expect(outline(state.selectedIds[0])[2]).toEqual({ x: 36, y: 12.5 });
  });
  it("'Stop squaring' turns it off and leaves the Undo", () => {
    startDraw('poly', 'bed');
    tap(30.47, 5); tap(36, 5); tap(36, 12.5); tap(30.47, 12); tap(30.47, 5);
    button('Stop squaring')!.click();
    expect(button('Undo')).toBeDefined();
    startDraw('poly', 'bed');
    tap(40, 5); tap(46, 5); tap(46, 12.5); tap(40, 12); tap(40, 5);
    expect(notice()).toBeNull();
  });
});
