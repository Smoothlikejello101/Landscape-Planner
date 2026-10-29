import { describe, expect, it } from 'vitest';
import { cornerPoint, frameOf, radiusPatch, readoutText, resizePatch, rotatePatch, angleTo } from '../src/handle-math';
import { applyHandleDrag, handleDragChanged, handlePositions, handleTarget, startHandleDrag } from '../src/handles';
import { state } from '../src/state';
import type { CircleShape, LineShape, PolyShape, RectShape, Shape, TextShape } from '../src/types';

const base = { color: '#888', label: '', opacity: 0.65, locked: false };
const rect = (x: number, y: number, width: number, height: number, rotation = 0): RectShape => ({ ...base, id: 'r', type: 'rect', x, y, width, height, rotation });
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('resizing by a corner', () => {
  it('moves the corner dragged and keeps the opposite one where it was', () => {
    const r = rect(0, 0, 4, 3);
    expect(resizePatch(r, 'br', { x: 6, y: 4 })).toEqual({ x: 0, y: 0, width: 6, height: 4 });
    expect(resizePatch(r, 'tl', { x: -2, y: -1 })).toEqual({ x: -2, y: -1, width: 6, height: 4 });
  });
  it('snaps the sides to the half foot, and stops at the smallest rather than turning inside out', () => {
    const r = rect(0, 0, 4, 3);
    expect(resizePatch(r, 'br', { x: 5.3, y: 3.1 })).toMatchObject({ width: 5.5, height: 3 });
    expect(resizePatch(r, 'br', { x: -3, y: -3 })).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 });
  });
  it('works along a turned shape\'s own sides', () => {
    // 4 × 2, turned 90°: its corners lie a quarter turn round its center (2, 1).
    const r = rect(0, 0, 4, 2, 90);
    const f = frameOf(r);
    const fixed = cornerPoint(f, 'tl');
    const br = cornerPoint(f, 'br');
    // Pull its bottom-right corner 2 ft further along its own width (which now runs down the plan).
    const out = resizePatch(r, 'br', { x: br.x, y: br.y + 2 });
    expect(out).toMatchObject({ width: 6, height: 2 });
    const after = cornerPoint(frameOf({ ...r, ...out } as RectShape), 'tl');
    close(after.x, fixed.x); close(after.y, fixed.y);
  });
  it('changes a side in half-foot steps from what it was, and leaves a side it doesn\'t pull alone', () => {
    expect(resizePatch(rect(0, 0, 7.3, 4.2), 'br', { x: 8, y: 4.2 })).toMatchObject({ width: 7.8, height: 4.2 });
    expect(resizePatch(rect(0, 0, 10, 0.2), 'br', { x: 12, y: 0.2 })).toMatchObject({ width: 12, height: 0.2 }); // (thin, and kept so)
  });
  it('keeps the proportions with Shift', () => {
    const out = resizePatch(rect(0, 0, 4, 2), 'br', { x: 8, y: 2 }, true);
    expect(out.width! / out.height!).toBeCloseTo(2, 6);
    expect(out).toMatchObject({ x: 0, y: 0 });
    // A thin shape grows by as much as it's pulled, not up to half a foot across.
    expect(resizePatch(rect(0, 0, 10, 0.2), 'br', { x: 10.3, y: 0.2 }, true)).toMatchObject({ width: 10.3, height: 0.21 });
  });
  it('stretches an outline\'s points, and keeps a straight line straight', () => {
    const poly: PolyShape = { ...base, id: 'p', type: 'poly', x: 0, y: 0, rotation: 0, points: [[0, 0], [4, 0], [4, 2], [0, 2]] };
    expect(resizePatch(poly, 'br', { x: 8, y: 4 })).toEqual({ x: 0, y: 0, points: [[0, 0], [8, 0], [8, 4], [0, 4]] });
    const line: LineShape = { ...base, id: 'l', type: 'line', x: 0, y: 0, rotation: 0, points: [[0, 0], [10, 0]] };
    expect(resizePatch(line, 'br', { x: 15, y: 3 })).toEqual({ x: 0, y: 0, points: [[0, 0], [15, 0]] });
  });
  it('scales a text note by its letters\' height, in quarter feet', () => {
    const t: TextShape = { ...base, id: 't', type: 'text', x: 0, y: 0, rotation: 0, label: 'Patio', fontSize: 1 };
    const f = frameOf(t);
    const out = resizePatch(t, 'br', { x: f.w * 2, y: f.h * 2 });
    expect(out.fontSize).toBe(2);
    expect(out).toMatchObject({ x: 0, y: 0 });
    expect(out.width).toBeUndefined();
  });
});

describe('sizing a circle by its edge', () => {
  it('takes the radius out to the pointer, in quarter feet', () => {
    const c: CircleShape = { ...base, id: 'c', type: 'circle', x: 10, y: 10, radius: 2 };
    expect(radiusPatch(c, { x: 13, y: 14 })).toEqual({ radius: 5 });
    expect(radiusPatch(c, { x: 10.05, y: 10 })).toEqual({ radius: 0.25 });
  });
});

describe('turning by the knob', () => {
  it('turns by as much as the knob went round, in whole degrees, sticking only near every 45°', () => {
    const r = rect(0, 0, 4, 2, 10);
    const c = { x: 2, y: 1 };
    const start = angleTo(c, { x: 2, y: -5 }); // straight up: 0°
    close(start, 0);
    expect(rotatePatch(r, start, angleTo(c, { x: 8, y: 1 }))).toEqual({ rotation: 100 }); // a quarter turn to the right
    expect(rotatePatch(r, start, 26)).toEqual({ rotation: 36 }); // (36° is reachable: no 15° steps)
    expect(rotatePatch(r, start, 33)).toEqual({ rotation: 43 });
    expect(rotatePatch(r, start, 34.2)).toEqual({ rotation: 45 }); // (within a degree of 45°: it sticks)
    expect(rotatePatch(r, start, -40.4)).toEqual({ rotation: 330 });
  });
  it('reads out the size or the turn as it goes', () => {
    expect(readoutText(rect(0, 0, 6, 4.25), 'br')).toBe('6 × 4.3 ft');
    expect(readoutText(rect(0, 0, 6, 4, 45), 'rotate')).toBe('45°');
    expect(readoutText({ ...base, id: 'c', type: 'circle', x: 0, y: 0, radius: 1.5 }, 'radius')).toBe('3 ft across');
  });
});

describe('a drag on the plan', () => {
  const bed = (): RectShape => ({ ...rect(0, 0, 10, 4), id: 'bed', role: 'bed' });
  const plant = (): CircleShape => ({ ...base, id: 'p', type: 'circle', role: 'plant', x: 2, y: 2, radius: 0.5 });
  const select = (shapes: Shape[], id: string) => { state.shapes = shapes; state.selectedIds = [id]; };
  it('turns a bed with its plants, and resizing one leaves them where they are', () => {
    select([bed(), plant()], 'bed');
    const turn = startHandleDrag('rotate', { x: 5, y: -10 }, 0, 0, state.shapes)!;
    expect(turn.carried.map((c) => c.id)).toEqual(['p']);
    // Half a turn, in two moves: each from where the drag began, so nothing drifts.
    applyHandleDrag(turn, { x: 15, y: 2 }, false, state.shapes);
    expect(applyHandleDrag(turn, { x: 5, y: 12 }, false, state.shapes)).toEqual(['bed', 'p']);
    expect(state.shapes[0]).toMatchObject({ rotation: 180, x: 0, y: 0 });
    close(state.shapes[1].x, 8); close(state.shapes[1].y, 2);

    select([bed(), plant()], 'bed');
    const grow = startHandleDrag('br', { x: 10, y: 4 }, 0, 0, state.shapes)!;
    expect(applyHandleDrag(grow, { x: 14, y: 6 }, false, state.shapes)).toEqual(['bed']);
    expect(state.shapes[0]).toMatchObject({ width: 14, height: 6 });
    expect(state.shapes[1]).toMatchObject({ x: 2, y: 2 });
  });
  it('moves the corner with the finger, from where on the handle it was pressed', () => {
    select([bed()], 'bed');
    const g = startHandleDrag('br', { x: 10.3, y: 4.2 }, 0, 0, state.shapes)!;
    applyHandleDrag(g, { x: 10.4, y: 4.2 }, false, state.shapes);
    expect(state.shapes[0]).toMatchObject({ width: 10, height: 4 }); // (not jumped under the finger)
    applyHandleDrag(g, { x: 12.3, y: 4.2 }, false, state.shapes);
    expect(state.shapes[0]).toMatchObject({ width: 12, height: 4 });
    expect(handleDragChanged(g, state.shapes)).toBe(true);
    applyHandleDrag(g, { x: 10.3, y: 4.2 }, false, state.shapes);
    expect(handleDragChanged(g, state.shapes)).toBe(false); // (a wiggle back: no undo step)
  });
  it("puts a nearly flat line's handles at its own ends, so the end not pulled stays put", () => {
    const line: LineShape = { ...base, id: 'l', type: 'line', x: 0, y: 0, rotation: 0, points: [[0, 0], [10, 0.1]] };
    select([line], 'l');
    const zoom = state.zoom;
    state.zoom = 0.25; // (zoomed out: its 0.1 ft rise is under a pixel)
    try {
      expect(handlePositions(state.shapes[0]).map((h) => h.kind)).toEqual(['tl', 'br']); // (no knob on a line)
      const g = startHandleDrag('br', { x: 10, y: 0.1 }, 0, 0, state.shapes)!;
      applyHandleDrag(g, { x: 11, y: 0.1 }, false, state.shapes);
      expect(state.shapes[0]).toMatchObject({ x: 0, y: 0, points: [[0, 0], [11, 0.1]] });
    } finally { state.zoom = zoom; }
  });
  it('sizes a tree drawn as an outline by its edge, its outline scaled with it', () => {
    const tree: CircleShape = { ...base, id: 't', type: 'circle', role: 'plant', tree: true, x: 0, y: 0, radius: 4, canopy: [[4, 0], [0, 3], [-2, 0], [0, -3]] };
    select([tree], 't');
    expect(handleTarget()?.id).toBe('t');
    const edge = 4 / Math.SQRT2;
    const g = startHandleDrag('radius', { x: edge, y: edge }, 0, 0, state.shapes)!;
    applyHandleDrag(g, { x: 8 / Math.SQRT2, y: 8 / Math.SQRT2 }, false, state.shapes);
    expect(state.shapes[0]).toMatchObject({ radius: 8, canopy: [[8, 0], [0, 6], [-4, 0], [0, -6]] });
  });
  it('shows no handles on a plant, a locked shape or two shapes at once', () => {
    select([plant()], 'p');
    expect(handleTarget()).toBeNull();
    select([{ ...bed(), locked: true }], 'bed');
    expect(handleTarget()).toBeNull();
    state.shapes = [bed(), { ...rect(20, 0, 2, 2), id: 'r2' }];
    state.selectedIds = ['bed', 'r2'];
    expect(handleTarget()).toBeNull();
    select([bed()], 'bed');
    expect(handleTarget()?.id).toBe('bed');
  });
});
