// @vitest-environment jsdom
// Sides typed as numbers (Nov 4), remembered on the shape for Rescale (a later change): src/measured.ts. Which sides
// are kept, from drawing and from the edit pane, and when one is forgotten: the rule in docs/storage.md.
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/render', () => ({ render: () => {}, updateStatusReadout: () => {} }));
vi.mock('../src/storage', async (orig) => ({ ...(await orig() as object), save: () => {} }));
import { convertToOutline, deleteSelectedVertex, drawTap, finishDraw, insertVertex, moveVertex, notePointer, setDrawKind, setTypedLength, startDraw, undoDrawPoint } from '../src/draw';
import { state } from '../src/state';
import { bakeRotation, pathPoints, resizedPoints } from '../src/geometry';
import { setSnapOn, setSquareOn } from '../src/tidy';
import { pushHistory, redo, undo } from '../src/history';
import { copyShapes, duplicateShapesByIds, paste } from '../src/mutations';
import { migrateShape, sanitizeProjectData } from '../src/storage';
import {
  afterPointInserted, afterPointRemoved, BOX_SIDES, forgetChangedSides, markTypedSides, measuredSides, MEASURED_TOL, sanitizeMeasured, setTypedSides,
} from '../src/measured';
import type { PathShape, RectShape, Shape } from '../src/types';

const FT = 24; // (screen px per foot at zoom 1, the canvas at the window's corner)
const tap = (x: number, y: number) => drawTap(x * FT, y * FT);
/** A typed side: the length, then a tap toward where it goes. */
const typed = (ft: number, x: number, y: number) => { setTypedLength(ft); return tap(x, y); };
const made = () => state.shapes.find((s) => s.id === state.selectedIds[0])!;
const poly = (points: [number, number][], extra: Record<string, unknown> = {}) =>
  sanitizeProjectData({ shapes: [{ id: 'p', type: 'poly', x: 0, y: 0, points, rotation: 0, color: '#a16207', label: 'Bed', opacity: 0.5, locked: false, role: 'bed', ...extra }] }).shapes[0] as PathShape;
const line = (points: [number, number][], extra: Record<string, unknown> = {}) =>
  sanitizeProjectData({ shapes: [{ id: 'l', type: 'line', x: 0, y: 0, points, rotation: 0, color: '#78716c', label: 'Fence', opacity: 1, locked: false, role: 'boundary', ...extra }] }).shapes[0] as PathShape;
const rect = (extra: Record<string, unknown> = {}) =>
  sanitizeProjectData({ shapes: [{ id: 'r', type: 'rect', x: 0, y: 0, width: 10, height: 6, rotation: 0, color: '#a16207', label: 'Patio', opacity: 0.5, locked: false, role: 'path', ...extra }] }).shapes[0] as RectShape;
const sides = (s: Shape) => measuredSides(s).map((m) => [m.side, m.ft]);

beforeEach(() => {
  notePointer('touch');
  document.body.innerHTML = '<svg id="canvas-svg"></svg>';
  state.zoom = 1; state.offsetX = 0; state.offsetY = 0;
  state.shapes = []; state.history = []; state.historyIndex = -1; state.draw = null; state.editPoints = null; state.selectedIds = [];
  state.viewFilter = { status: '', phase: '', showGone: false }; state.roleViews = {};
  setSnapOn(true); setSquareOn(true);
});

describe('the helper: measuredSides, only the sides still the length typed', () => {
  it('a rectangle\'s Width is its top and bottom, its Length its sides; each counts while it is that long, within 0.05 ft', () => {
    const r = rect({ measured: [{ side: 2, ft: 10 }, { side: 0, ft: 10 }, { side: 1, ft: 6.04 }, { side: 3, ft: 5.9 }] });
    expect(sides(r)).toEqual([[0, 10], [1, 6.04], [2, 10]]); // (in side order; 5.9 is 0.1 ft off)
    expect(MEASURED_TOL).toBe(0.05);
    r.width = 10.05;
    expect(sides(r)).toEqual([[0, 10], [1, 6.04], [2, 10]]);
    r.width = 10.06;
    expect(sides(r)).toEqual([[1, 6.04]]);
  });
  it("an outline's side i runs from point i to the next, its last back to its first; a line's, one fewer", () => {
    const p = poly([[0, 0], [10, 0], [10, 6], [2.5, 6]], { measured: [{ side: 0, ft: 10 }, { side: 2, ft: 7.5 }, { side: 3, ft: Math.hypot(2.5, 6) }] });
    expect(sides(p)).toEqual([[0, 10], [2, 7.5], [3, Math.hypot(2.5, 6)]]);
    const l = line([[0, 0], [12, 0], [12, 9]], { measured: [{ side: 0, ft: 12 }, { side: 1, ft: 9 }] });
    expect(sides(l)).toEqual([[0, 12], [1, 9]]);
    // (Where it is and how it's turned don't change a side's length.)
    p.x += 40; p.y -= 3; p.rotation = 30; l.rotation = 200;
    expect([sides(p).length, sides(l).length]).toEqual([3, 2]);
    // Nothing for a shape with no sides it keeps, or none typed.
    expect(measuredSides({ ...rect(), type: 'oval', measured: [{ side: 0, ft: 10 }] } as Shape)).toEqual([]);
    expect(measuredSides(rect())).toEqual([]);
  });
  it('forgets, for good, a side no longer the length typed: the field goes when none is left', () => {
    const p = poly([[0, 0], [10, 0], [10, 6], [0, 6]], { measured: [{ side: 0, ft: 10 }, { side: 1, ft: 6 }, { side: 2, ft: 10 }] });
    expect(forgetChangedSides(p)).toBe(false);
    p.points[1] = [12, 0];
    expect(forgetChangedSides(p)).toBe(true);
    expect(p.measured).toEqual([{ side: 2, ft: 10 }]);
    p.points[1] = [10, 0]; // (back where it was: still forgotten)
    expect(sides(p)).toEqual([[2, 10]]);
    p.points[2] = [10, 9];
    forgetChangedSides(p);
    expect('measured' in p).toBe(false);
  });
  it('typed again: the new length; typed as something that is no length: forgotten; the other sides as they were', () => {
    const r = rect();
    setTypedSides(r, BOX_SIDES.width, 10);
    setTypedSides(r, BOX_SIDES.height, 6);
    expect(r.measured).toEqual([{ side: 0, ft: 10 }, { side: 1, ft: 6 }, { side: 2, ft: 10 }, { side: 3, ft: 6 }]);
    setTypedSides(r, BOX_SIDES.width, 12); r.width = 12;
    expect(sides(r)).toEqual([[0, 12], [1, 6], [2, 12], [3, 6]]);
    setTypedSides(r, BOX_SIDES.height, null);
    expect(r.measured).toEqual([{ side: 0, ft: 12 }, { side: 2, ft: 12 }]);
  });
});

describe('a point added or taken out never moves a number onto another side', () => {
  const m = (list: [number, number][]) => list.map(([side, ft]) => ({ side, ft }));
  const with_ = (list: [number, number][]) => ({ ...poly([[0, 0], [10, 0], [10, 6], [5, 9], [0, 6]]), measured: m(list) }) as PathShape;
  it('added on a side: that side, now two, is forgotten; the sides after it move up one', () => {
    const s = with_([[0, 10], [1, 6], [3, 6]]);
    afterPointInserted(s, 1);
    expect(s.measured).toEqual(m([[0, 10], [4, 6]]));
    const t = with_([[4, 6]]); // (the closing side, last to first)
    afterPointInserted(t, 4);
    expect('measured' in t).toBe(false);
  });
  it('taken out: the two sides that met there, one now, are forgotten; the sides after it move down one; round the end of an outline too', () => {
    const s = with_([[0, 10], [1, 6], [2, 1], [3, 2], [4, 6]]);
    afterPointRemoved(s, 2, 5, true); // (sides 1 and 2 met at point 2)
    expect(s.measured).toEqual(m([[0, 10], [2, 2], [3, 6]]));
    const t = with_([[0, 10], [1, 6], [2, 1], [3, 2], [4, 6]]);
    afterPointRemoved(t, 0, 5, true); // (the last side and the first met at point 0)
    expect(t.measured).toEqual(m([[0, 6], [1, 1], [2, 2]]));
  });
  it("on a line: its end point takes only its end side; one between, the two either side", () => {
    const l = (list: [number, number][]) => ({ ...line([[0, 0], [5, 0], [5, 5], [9, 5]]), measured: m(list) }) as PathShape;
    const a = l([[0, 5], [1, 5], [2, 4]]); afterPointRemoved(a, 0, 4, false);
    expect(a.measured).toEqual(m([[0, 5], [1, 4]]));
    const b = l([[0, 5], [1, 5], [2, 4]]); afterPointRemoved(b, 3, 4, false);
    expect(b.measured).toEqual(m([[0, 5], [1, 5]]));
    const c = l([[0, 5], [1, 5], [2, 4]]); afterPointRemoved(c, 1, 4, false);
    expect(c.measured).toEqual(m([[1, 4]]));
  });
  it('as the points are edited: a point added on a typed side, dragged so its first half is that long, is not taken for it', () => {
    const s = poly([[0, 0], [10, 0], [10, 6], [2.5, 6]], { role: 'boundary', measured: [{ side: 0, ft: 10 }, { side: 2, ft: 7.5 }] });
    state.shapes = [s];
    const i = insertVertex(s, 0, { x: 5, y: 0 });
    expect(sides(s)).toEqual([[3, 7.5]]);
    moveVertex(s, i, { x: 6, y: -8 }); // (0,0) to (6,-8): 10 ft, as side 0 was
    pushHistory();
    expect(sides(s)).toEqual([[3, 7.5]]);
    // Taken out again: the two sides that met there, and the rest renumbered.
    state.editPoints = { id: s.id, vertex: i };
    deleteSelectedVertex();
    expect(pathPoints(s)).toHaveLength(4);
    expect(sides(s)).toEqual([[2, 7.5]]);
    // A point added on another side: the typed one keeps its number, renumbered.
    insertVertex(s, 1, { x: 10, y: 3 });
    expect(sides(s)).toEqual([[3, 7.5]]);
  });
});

describe('typed while drawing (the bar\'s length for the next side)', () => {
  it("an outline: each side typed, as typed; squaring leaves them so; Undo point takes one back", () => {
    startDraw('poly', 'bed');
    tap(0, 0);
    typed(10, 10.2, 0.1); // (straight right: stuck to it)
    tap(10, 6);
    typed(7.5, 2.3, 6.2);
    expect(state.draw!.typedSides).toEqual([{ from: 0, ft: 10 }, { from: 2, ft: 7.5 }]);
    tap(0, 0); // (closes it)
    expect(sides(made())).toEqual([[0, 10], [2, 7.5]]);
    // Undo point: a side typed to the point taken back isn't one of its sides now.
    startDraw('poly', 'bed');
    tap(20, 0); typed(10, 30.3, 0);
    undoDrawPoint();
    expect(state.draw!.typedSides).toEqual([]);
    tap(30, 0); tap(30, 6); tap(20, 6); tap(20, 0);
    expect('measured' in made()).toBe(false);
  });
  it('a house squared after: its typed side stays as typed, the corners tapped by eye moved square', () => {
    startDraw('poly', 'building');
    tap(0, 0);
    typed(30, 30.5, 0);
    tap(30.5, 20); tap(0.5, 20.5); // (two corners tapped half a foot out)
    tap(0, 0);
    expect(document.getElementById('toast-action')?.textContent).toContain('Squared the corners');
    const s = made() as PathShape;
    const [, , c, d] = pathPoints(s);
    expect(pathPoints(s).map((p) => Math.round(p.x * 100) / 100)).toEqual([0, 30, 30, 0]); // (square: its far side level)
    expect(Math.abs(c.y - d.y)).toBeLessThan(0.01);
    expect(sides(s)).toEqual([[0, 30]]);
  });
  it('the side that closes an outline, typed: kept as long as it came out that long; a typed side by the first point that came out otherwise, not', () => {
    startDraw('poly', 'bed');
    tap(0, 0); tap(8, 0); tap(8, 5); tap(0, 5);
    typed(5, 0, -1); // (from (0, 5) to the first point: the outline closes)
    expect(state.draw).toBeNull();
    expect(sides(made())).toEqual([[3, 5]]);
    startDraw('poly', 'bed');
    tap(20, 0); tap(28, 0); tap(28, 5); tap(20, 5);
    typed(5.4, 20, -1); // (it would end 0.4 ft past the first point: closed there, 5 ft long)
    expect(state.draw).toBeNull();
    expect('measured' in made()).toBe(false);
  });
  it('a line (a fence) and a path: their sides typed', () => {
    startDraw('line', 'fence');
    tap(0, 0); typed(12, 12.3, 0.2); tap(12, 9);
    finishDraw();
    expect(sides(made())).toEqual([[0, 12]]);
    startDraw('path', 'path');
    tap(0, 20); tap(0, 26); typed(14.5, 15, 26);
    finishDraw();
    expect(sides(made())).toEqual([[1, 14.5]]);
    // (Switched between outline and line keeps the taps, and the sides typed with them; to a rectangle, neither.)
    startDraw('poly', 'fence');
    tap(0, 40); typed(6, 6, 40);
    setDrawKind('line');
    expect(state.draw!.typedSides).toEqual([{ from: 0, ft: 6 }]);
    setDrawKind('rect');
    expect(state.draw!.typedSides).toBeUndefined();
  });
  it('a rectangle: its first side typed is its Width or its Length by the way it runs, and its other side the other; both of each pair', () => {
    startDraw('rect', 'building');
    tap(2, 10); typed(10, 14, 10.1); typed(6, 8, 13);
    const r = made() as RectShape;
    expect([r.width, r.height]).toEqual([10, 6]);
    expect(sides(r)).toEqual([[0, 10], [1, 6], [2, 10], [3, 6]]);
    // Its first side drawn upright: that's its Length (the box is stored unturned, its sides swapped).
    startDraw('rect', 'patio');
    tap(30, 0); typed(10, 30.1, 12); tap(34, 5);
    const u = made() as RectShape;
    expect([u.width, u.height, u.rotation]).toEqual([4, 10, 0]);
    expect(sides(u)).toEqual([[1, 10], [3, 10]]);
  });
  it('a rectangle set level after it is drawn keeps its typed side (turned whole)', () => {
    startDraw('rect', 'patio');
    const a = (3.5 * Math.PI) / 180;
    tap(0, 0); typed(10, 20 * Math.cos(a), 20 * Math.sin(a)); // (3.5° off level: not stuck, then set level)
    tap(-0.5, 6);
    const r = made() as RectShape;
    expect(r.rotation).toBe(0);
    expect(sides(r)).toEqual([[0, 10], [2, 10]]);
    undo(); // (the leveling: the rectangle as drawn, 3.5° turned, still with its typed Width)
    const drawn = made() as RectShape;
    expect(drawn.rotation).toBe(3.5);
    expect(sides(drawn)).toEqual([[0, 10], [2, 10]]);
  });
  it('a markTypedSides with nothing typed, or on a shape without sides, does nothing', () => {
    const r = rect();
    markTypedSides(r, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }], []);
    markTypedSides(r, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }], undefined);
    expect('measured' in r).toBe(false);
  });
});

describe('what keeps them, and what forgets them, step by step', () => {
  const typedHouse = () => {
    startDraw('rect', 'building');
    tap(0, 0); typed(10, 12, 0); typed(6, 5, 3);
    return made() as RectShape;
  };
  it('moved or turned whole: kept; resized: the sides it changed are forgotten; Undo and Redo take them back and forth with the shape', () => {
    const r = typedHouse();
    expect(sides(r)).toHaveLength(4);
    r.x += 20; r.y -= 4; r.rotation = 45; pushHistory();
    expect(sides(made())).toHaveLength(4);
    // Stretched along its Width only (a handle, or the edit pane): its Length stays as typed.
    Object.assign(made(), { width: 12 }); pushHistory();
    expect(sides(made())).toEqual([[1, 6], [3, 6]]);
    Object.assign(made(), { width: 10 }); pushHistory(); // (back to 10: forgotten, for good)
    expect(sides(made())).toEqual([[1, 6], [3, 6]]);
    undo(); undo();
    expect(sides(made())).toHaveLength(4);
    redo();
    expect(sides(made())).toEqual([[1, 6], [3, 6]]);
  });
  it('an outline: a corner dragged forgets the two sides at it; scaled, the sides it changed; points edited unturned (its turn baked in) keeps them', () => {
    setSquareOn(false);
    const p = poly([[0, 0], [10, 0], [10, 6], [0, 6]], { measured: [0, 1, 2, 3].map((side) => ({ side, ft: side % 2 ? 6 : 10 })), rotation: 30 });
    state.shapes = [p];
    bakeRotation(p);
    expect(sides(p)).toHaveLength(4);
    moveVertex(p, 1, { x: p.x + 12, y: p.y }); pushHistory(); // (a corner: its two sides change)
    expect(sides(p).map(([i]) => i)).toEqual([2, 3]);
    const q = poly([[0, 0], [10, 0], [10, 6], [0, 6]], { measured: [0, 1, 2, 3].map((side) => ({ side, ft: side % 2 ? 6 : 10 })) });
    state.shapes = [q];
    q.points = resizedPoints(q.points, 10, 9); pushHistory(); // (taller: its upright sides change)
    expect(sides(q)).toEqual([[0, 10], [2, 10]]);
  });
  it('Duplicate, Copy and Paste carry them; a rectangle made an outline keeps them, its sides in the same order', () => {
    const r = typedHouse();
    const [dup] = duplicateShapesByIds([r.id]);
    expect(sides(state.shapes.find((s) => s.id === dup)!)).toHaveLength(4);
    copyShapes([r]);
    expect(paste()).toBe(true);
    expect(sides(made())).toEqual(sides(r));
    const outline = convertToOutline(r.id)!;
    expect(outline.type).toBe('poly');
    expect(sides(outline)).toEqual([[0, 10], [1, 6], [2, 10], [3, 6]]);
    // (An oval's outline, which has no such sides, gets none, whatever it had.)
    state.shapes.push({ ...rect({ id: 'o', type: 'oval' }), measured: [{ side: 0, ft: 10 }] } as Shape);
    expect(convertToOutline('o')!.measured).toBeUndefined();
  });
});

describe('as stored (sanitizeMeasured, in migrateShape)', () => {
  it("each a side the shape has, once, a length in feet; the rest dropped, the order as it came", () => {
    expect(sanitizeMeasured([{ side: 3, ft: 6 }, { side: 0, ft: 10 }], 4)).toEqual([{ side: 3, ft: 6 }, { side: 0, ft: 10 }]);
    expect(sanitizeMeasured([{ side: 0, ft: 10 }, { side: 0, ft: 12 }, { side: 4, ft: 1 }, { side: -1, ft: 1 }, { side: 1.5, ft: 1 }, { side: '1', ft: 1 }], 4)).toEqual([{ side: 0, ft: 10 }]);
    expect(sanitizeMeasured([{ side: 1, ft: 0 }, { side: 2, ft: -3 }, { side: 3, ft: Infinity }, { side: 0, ft: '10' }, { side: 1, ft: 5001 }, { side: 2, ft: 5000 }], 4)).toEqual([{ side: 2, ft: 5000 }]);
    expect(sanitizeMeasured([{ side: 0, ft: 10, at: 5, note: '<b>' }], 4)).toEqual([{ side: 0, ft: 10 }]);
    for (const odd of [null, 7, 'x', {}, { side: 0, ft: 10 }, [], [null, 3, [0, 10]]]) expect(sanitizeMeasured(odd, 4), JSON.stringify(odd)).toBeUndefined();
    expect(sanitizeMeasured([{ side: 0, ft: 10 }], 0)).toBeUndefined();
  });
  it('on a rectangle, an outline or a line only; on an outline or line only while every point came through', () => {
    const M = [{ side: 0, ft: 10 }];
    expect(migrateShape({ ...rect(), measured: M })).toMatchObject({ measured: M });
    expect(migrateShape({ ...rect(), type: 'oval', measured: M })).not.toHaveProperty('measured');
    expect(migrateShape({ ...rect(), type: 'triangle', rightAngle: 'bl', measured: M })).not.toHaveProperty('measured');
    expect(migrateShape({ id: 'c', type: 'circle', x: 0, y: 0, radius: 2, measured: M })).not.toHaveProperty('measured');
    expect(migrateShape({ id: 't', type: 'text', x: 0, y: 0, label: 'Note', fontSize: 1, measured: M })).not.toHaveProperty('measured');
    const pts = [[0, 0], [10, 0], [10, 6], [0, 6]];
    expect(migrateShape({ id: 'p', type: 'poly', x: 0, y: 0, points: pts, measured: [{ side: 3, ft: 6 }] })).toMatchObject({ measured: [{ side: 3, ft: 6 }] });
    expect(migrateShape({ id: 'l', type: 'line', x: 0, y: 0, points: pts, measured: [{ side: 3, ft: 6 }] })).not.toHaveProperty('measured'); // (a line of 4 points has 3 sides)
    // A point that can't be read is dropped, and the sides after it would shift: none kept.
    expect(migrateShape({ id: 'p', type: 'poly', x: 0, y: 0, points: [[0, 0], [10, 0], ['x', 1], [10, 6], [0, 6]], measured: [{ side: 0, ft: 10 }] })).not.toHaveProperty('measured');
    const many = Array.from({ length: 600 }, (_, i) => [i, i % 2]);
    expect(migrateShape({ id: 'p', type: 'poly', x: 0, y: 0, points: many, measured: [{ side: 0, ft: Math.SQRT2 }] })).not.toHaveProperty('measured');
  });
});
