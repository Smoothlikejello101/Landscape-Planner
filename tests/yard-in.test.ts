// @vitest-environment jsdom
// Getting the yard in (Jason's UI review, approved Nov 2): the parts of it that are rules, not looks.
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/render', () => ({ render: () => {}, updateStatusReadout: () => {}, calibrationSeen: () => {} }));
vi.mock('../src/storage', async (orig) => ({ ...(await orig() as object), save: () => {} }));
import { drawTap, notePointer, startDraw } from '../src/draw';
import { LEVEL_SNAP_DEG, levelTaps, rectFromTaps } from '../src/kinds';
import { undo } from '../src/history';
import { state } from '../src/state';
import { setSnapOn, setSquareOn } from '../src/tidy';
import type { BoxShape, Point, Shape } from '../src/types';

const FT = 24; // (screen px per foot at zoom 1, the canvas at the window's corner)
const tap = (x: number, y: number) => drawTap(x * FT, y * FT);
const notice = () => document.getElementById('toast-action');
const button = (label: string) => [...(notice()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label) as HTMLButtonElement | undefined;
const made = () => state.shapes.find((s) => s.id === state.selectedIds[0]) as BoxShape;
/** A point `len` feet from `a` at `deg` degrees. */
const at = (a: Point, len: number, deg: number) => ({ x: a.x + len * Math.cos(deg * Math.PI / 180), y: a.y + len * Math.sin(deg * Math.PI / 180) });

beforeEach(() => {
  notePointer('touch');
  document.body.innerHTML = '<svg id="canvas-svg"></svg>';
  state.zoom = 1; state.offsetX = 0; state.offsetY = 0;
  state.shapes = []; state.history = []; state.historyIndex = -1; state.draw = null; state.editPoints = null; state.selectedIds = [];
  state.viewFilter = { status: '', phase: '', showGone: false }; state.roleViews = {};
  localStorage.clear();
  setSnapOn(true); setSquareOn(true);
});

describe('near-level sides snap level (item 6)', () => {
  it('turns a side within 4° of level, or of upright, level about its first corner', () => {
    const a = { x: 0, y: 0 };
    for (const deg of [3, -3, 4, 87, 92, 183]) {
      const b = at(a, 40, deg), c = at(b, 10, deg + 90);
      const lv = levelTaps([a, b, c])!;
      expect(lv, `${deg}°`).not.toBeNull();
      expect(lv.pts[0]).toEqual(a); // (its first corner stays where it was tapped)
      const box = rectFromTaps(lv.pts[0], lv.pts[1], lv.pts[2])!;
      expect(box.rotation, `${deg}°`).toBe(0);
      // (The same sides: 40 by 10, whichever way round.)
      expect([box.width, box.height].sort((p, q) => p - q)).toEqual([10, 40]);
    }
  });
  it('leaves a side already level, or one turned more than 4° (meant to be turned)', () => {
    const a = { x: 0, y: 0 };
    expect(levelTaps([a, { x: 30, y: 0 }, { x: 30, y: 8 }])).toBeNull();
    for (const deg of [4.5, 6, 30, 45, 84]) expect(levelTaps([a, at(a, 30, deg), at(at(a, 30, deg), 8, deg + 90)]), `${deg}°`).toBeNull();
    expect(LEVEL_SNAP_DEG).toBe(4);
  });
  it('keeps to a turned wall its first taps landed on, squaring to it instead of the grid', () => {
    const a = { x: 0, y: 0 }, wall = 3 * Math.PI / 180;
    // Along the wall already: left as it is (not set level, off the wall).
    expect(levelTaps([a, at(a, 20, 3), at(at(a, 20, 3), 6, 93)], [wall])).toBeNull();
    // A degree off the wall: square to it, not level.
    const lv = levelTaps([a, at(a, 20, 4), at(at(a, 20, 4), 6, 94)], [wall])!;
    expect(lv.along).toBe(true);
    expect(rectFromTaps(lv.pts[0], lv.pts[1], lv.pts[2])!.rotation).toBeCloseTo(3, 5);
  });
  it('a driveway tapped 3° off comes out level, said, with an Undo back to as tapped', () => {
    startDraw('rect', 'driveway');
    const a = { x: 10, y: 10 }, b = at(a, 30, 3);
    tap(a.x, a.y); tap(b.x, b.y); tap(b.x - 0.5, b.y + 10);
    expect(made().rotation).toBe(0);
    expect(notice()?.textContent).toContain('Set it level (it was 3° off).');
    button('Undo')!.click();
    expect(made().rotation).not.toBe(0);
  });
  it("doesn't level a rectangle with squaring turned off, and 'Stop leveling' turns it off", () => {
    setSquareOn(false);
    startDraw('rect', 'driveway');
    tap(10, 10); tap(40, 11.5); tap(39.5, 21.5);
    expect(made().rotation).not.toBe(0);
    expect(notice()).toBeNull();
    setSquareOn(true);
    startDraw('rect', 'driveway');
    tap(10, 30); tap(40, 31.5); tap(39.5, 41.5);
    expect(made().rotation).toBe(0);
    button('Stop leveling')!.click();
    startDraw('rect', 'driveway');
    tap(10, 50); tap(40, 51.5); tap(39.5, 61.5);
    expect(made().rotation).not.toBe(0);
    undo();
  });
  it('a rectangle drawn along a turned house squares to the house', () => {
    const house = { id: 'house', type: 'rect', x: 0, y: 0, width: 40, height: 20, rotation: 3, label: 'House', role: 'building', color: '#000', opacity: 1, locked: false } as Shape;
    state.shapes = [house];
    // Its top wall, from the house's center (20, 10), turned 3°: two taps on it, a bed 6 ft out from it.
    const c = { x: 20, y: 10 }, t = 3 * Math.PI / 180;
    const onTop = (u: number) => ({ x: c.x + u * Math.cos(t) + 10 * Math.sin(t), y: c.y + u * Math.sin(t) - 10 * Math.cos(t) });
    const p = onTop(-12), q = onTop(8);
    startDraw('rect', 'bed');
    tap(p.x, p.y); tap(q.x, q.y + 0.3); tap(q.x + 0.2, q.y - 6);
    expect(made().rotation).toBeCloseTo(3, 1);
  });
});
