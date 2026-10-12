// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { bedOf, patchBedCarryingPlants } from '../src/beds';
import {
  bakeRotation, boxSize, outlineOf, pathLabelPoint, pointInShape, polygonArea, resizedPoints,
  shapeArea, shapeBBox, shapeCenter, shapePerimeter, worldPoints,
} from '../src/geometry';
import {
  canDeleteVertex, canFinishDraw, convertToOutline, deleteSelectedVertex, edgeMidpoints, finishDraw,
  insertVertex, moveVertex, startDraw, startEditPoints, undoDrawPoint,
} from '../src/draw';
import { state } from '../src/state';
import { shapeToSvgString } from '../src/export';
import { displayLabel, textSize } from '../src/geometry';
import { measuredFeet, setDrawKind } from '../src/draw';
import type { PathShape, Shape } from '../src/types';

const base = { color: '#000000', label: '', opacity: 1, locked: false };
const poly = (id: string, x: number, y: number, points: [number, number][], extra: Partial<PathShape> = {}): PathShape =>
  ({ ...base, id, type: 'poly', x, y, points, rotation: 0, ...extra } as PathShape);
const lshape = () => poly('L', 0, 0, [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]); // an L-shaped bed

beforeEach(() => {
  state.shapes = []; state.selectedIds = []; state.panel = null; state.draw = null; state.editPoints = null;
  state.history = []; state.historyIndex = -1;
});

describe('outline geometry', () => {
  it('measures area, perimeter and size', () => {
    const s = lshape();
    expect(polygonArea(s.points)).toBe(64);
    expect(shapeArea(s)).toBe(64);
    expect(shapePerimeter(s)).toBe(40);
    expect(boxSize(s)).toEqual({ w: 10, h: 10 });
    const line = { ...lshape(), type: 'line' } as PathShape;
    expect(shapePerimeter(line)).toBe(30); // open: no closing edge
    expect(shapeArea(line)).toBe(0);
  });
  it('knows inside from outside, including the notch of an L', () => {
    const s = lshape();
    expect(pointInShape(s, { x: 2, y: 8 })).toBe(true);
    expect(pointInShape(s, { x: 8, y: 8 })).toBe(false); // in the box but in the notch
    expect(pointInShape({ ...s, type: 'line' } as Shape, { x: 2, y: 2 })).toBe(false);
  });
  it('rotates around the box center', () => {
    const s = poly('r', 0, 0, [[0, 0], [4, 0], [4, 2], [0, 2]], { rotation: 90 }); // center (2,1)
    const b = shapeBBox(s);
    expect(b.minX).toBeCloseTo(1); expect(b.maxX).toBeCloseTo(3);
    expect(b.minY).toBeCloseTo(-1); expect(b.maxY).toBeCloseTo(3);
    expect(pointInShape(s, { x: 2, y: 2.5 })).toBe(true);
    expect(pointInShape(s, { x: 3.5, y: 1 })).toBe(false);
    const before = worldPoints(s);
    bakeRotation(s);
    expect(s.rotation).toBe(0);
    const after = worldPoints(s);
    after.forEach((p, i) => { expect(p.x).toBeCloseTo(before[i].x, 2); expect(p.y).toBeCloseTo(before[i].y, 2); });
  });
  it('labels an L at a point inside it', () => {
    const s = lshape();
    expect(pointInShape(s, pathLabelPoint(s))).toBe(true);
    const line = poly('l', 0, 0, [[0, 0], [10, 0]], { type: 'line' } as Partial<PathShape>);
    expect(pathLabelPoint(line)).toEqual({ x: 5, y: 0 });
  });
  it('resizes by scaling points', () => {
    expect(resizedPoints([[0, 0], [4, 0], [2, 2]], 8, 1)).toEqual([[0, 0], [8, 0], [4, 1]]);
    expect(resizedPoints([[0, 0], [4, 0]], 2, 5)).toEqual([[0, 0], [2, 0]]); // no height to scale
  });
  it('outlines rectangles, ovals and triangles with the same box', () => {
    const r = { ...base, id: 'r', type: 'rect', x: 1, y: 2, width: 4, height: 3, rotation: 0 } as const;
    expect(outlineOf(r)).toEqual([{ x: 1, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 5 }, { x: 1, y: 5 }]);
    const o = { ...base, id: 'o', type: 'oval', x: 0, y: 0, width: 6, height: 4, rotation: 0 } as const;
    const pts = outlineOf(o);
    expect(pts).toHaveLength(24);
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(0); expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(4);
  });
});

describe('beds drawn as outlines', () => {
  it('know their plants and carry them', () => {
    const bed = lshape(); bed.role = 'bed';
    const inArm = { ...base, id: 'p1', type: 'circle', x: 2, y: 8, radius: 0.5, role: 'plant' } as Shape;
    const inNotch = { ...base, id: 'p2', type: 'circle', x: 8, y: 8, radius: 0.5, role: 'plant' } as Shape;
    const shapes = [bed, inArm, inNotch];
    expect(bedOf(inArm, shapes)).toBe(bed);
    expect(bedOf(inNotch, shapes)).toBe(null);
    patchBedCarryingPlants(bed, { x: 5 }, shapes);
    expect(shapeCenter(inArm)).toEqual({ x: 7, y: 8 });
    expect(shapeCenter(inNotch)).toEqual({ x: 8, y: 8 });
  });
});

describe('drawing', () => {
  const tap = (x: number, y: number) => state.draw!.points.push({ x, y });
  it('needs 3 corners for an outline, 2 for a line', () => {
    startDraw('poly');
    tap(0, 0); tap(4, 0);
    expect(canFinishDraw()).toBe(false);
    state.draw!.kind = 'line';
    expect(canFinishDraw()).toBe(true);
    state.draw!.kind = 'poly';
    tap(4, 3);
    undoDrawPoint();
    expect(state.draw!.points).toHaveLength(2);
    tap(2, 3);
    const s = finishDraw() as PathShape;
    expect(s).toMatchObject({ type: 'poly', x: 0, y: 0, points: [[0, 0], [4, 0], [2, 3]] });
    expect(state.draw).toBe(null);
    expect(state.selectedIds).toEqual([s.id]);
    expect(state.panel).toBe('props');
    expect(state.historyIndex).toBe(0);
  });
  it('makes lines boundaries by default', () => {
    startDraw('line');
    tap(10, 10); tap(20, 10); tap(20, 30);
    const s = finishDraw()!;
    expect(s).toMatchObject({ type: 'line', role: 'boundary', x: 10, y: 10 });
  });
});

describe('editing points', () => {
  it('moves, inserts and deletes points (never below the minimum)', () => {
    const s = poly('t', 0, 0, [[0, 0], [4, 0], [0, 4]]);
    state.shapes = [s];
    startEditPoints('t');
    moveVertex(s, 0, { x: -2.2, y: -1.9 }); // snaps to 0.5 ft and re-normalizes
    expect(s).toMatchObject({ x: -2, y: -2, points: [[0, 0], [6, 2], [2, 6]] });
    expect(edgeMidpoints(s)).toHaveLength(3);
    const i = insertVertex(s, 0, { x: 2, y: -3 });
    expect(i).toBe(1);
    expect(s.points).toHaveLength(4);
    state.editPoints!.vertex = 1;
    expect(canDeleteVertex()).toBe(true);
    deleteSelectedVertex();
    expect(s.points).toHaveLength(3);
    state.editPoints!.vertex = 0;
    expect(canDeleteVertex()).toBe(false);
  });
  it('bakes rotation before editing', () => {
    const s = poly('r', 0, 0, [[0, 0], [4, 0], [4, 2], [0, 2]], { rotation: 90 });
    state.shapes = [s];
    startEditPoints('r');
    expect(s.rotation).toBe(0);
    expect(boxSize(s).w).toBeCloseTo(2); expect(boxSize(s).h).toBeCloseTo(4);
  });
  it('converts a rotated rectangle to an outline that looks the same', () => {
    state.shapes = [{ ...base, id: 'r', type: 'rect', x: 0, y: 0, width: 4, height: 2, rotation: 30, role: 'bed', label: 'Bed' } as Shape];
    const before = shapeBBox(state.shapes[0]);
    const p = convertToOutline('r')!;
    expect(p).toMatchObject({ id: 'r', type: 'poly', rotation: 30, role: 'bed', label: 'Bed' });
    expect('width' in p).toBe(false);
    const after = shapeBBox(p);
    expect(after.minX).toBeCloseTo(before.minX); expect(after.maxY).toBeCloseTo(before.maxY);
    expect(shapeArea(p)).toBeCloseTo(8);
  });
});

describe('export', () => {
  it('writes outlines as polygons and lines as polylines', () => {
    const p = { ...lshape(), label: 'Bed <1>' };
    const svg = shapeToSvgString(p, 0, 0, 10);
    expect(svg).toContain('<polygon points="0,0 100,0 100,40 40,40 40,100 0,100"');
    expect(svg).toContain('Bed &lt;1&gt;');
    const line = poly('l', 1, 1, [[0, 0], [5, 0]], { type: 'line', role: 'boundary' } as Partial<PathShape>);
    expect(shapeToSvgString(line, 0, 0, 10)).toMatch(/^<polyline points="10,10 60,10" fill="none".*stroke-dasharray="8 4"/);
  });
});

describe('measuring', () => {
  it('measures between two taps and keeps a dimension line', () => {
    startDraw('measure');
    state.draw!.points.push({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(measuredFeet()).toBe(5);
    const s = finishDraw() as PathShape;
    expect(s).toMatchObject({ type: 'line', showLength: true, points: [[0, 0], [3, 4]] });
    expect(displayLabel(s)).toBe('5 ft');
    expect(displayLabel({ ...s, label: 'Fence' })).toBe('Fence · 5 ft');
    expect(state.draw).toMatchObject({ kind: 'measure', points: [] }); // still measuring
    expect(state.shapes).toHaveLength(1);
  });
  it('switching between measuring and drawing starts fresh', () => {
    startDraw('poly');
    state.draw!.points.push({ x: 0, y: 0 });
    setDrawKind('line');
    expect(state.draw!.points).toHaveLength(1);
    setDrawKind('measure');
    expect(state.draw!.points).toHaveLength(0);
  });
});

describe('text notes', () => {
  const note = (label: string, fontSize = 1) => ({ ...base, id: 'n', type: 'text', x: 0, y: 0, label, fontSize, rotation: 0 } as Shape);
  it('size by their longest line and line count', () => {
    expect(textSize({ label: 'abcd\nab', fontSize: 2 })).toEqual({ w: 4 * 0.55 * 2, h: 2 * 2 * 1.25 });
    expect(boxSize(note('Hi') as never).h).toBe(1.25);
    expect(pointInShape(note('Hello'), { x: 1, y: 0.5 })).toBe(true);
    expect(shapeArea(note('Hello'))).toBe(0);
  });
  it('export as text with one tspan per line, escaped', () => {
    const svg = shapeToSvgString(note('A & B\nC', 1), 0, 0, 10);
    expect(svg).toContain('<tspan x="0" y="10">A &amp; B</tspan><tspan x="0" y="22.5">C</tspan>');
    expect(svg).toContain('font-size="10"');
  });
});
