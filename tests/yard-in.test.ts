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
import { allTraced, asksRealSize, clearOfBox, HOUSE_VIEW_FT, houseScaleZoom, SMALL_BUILDING_SQFT, TRACE_ITEMS, traced } from '../src/yard-in';
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

describe('the Building tool opens at house scale (item 1)', () => {
  it('zooms out, never in, to show 70 ft across the plan, for the first building with no photo showing', () => {
    // A phone's plan, 412 px across, at the opening view (17 ft across): out to 70 ft, a whole percent.
    expect(houseScaleZoom({ w: 412, h: 640, zoom: 1 }, { buildings: 0, photoShown: false })).toBe(0.24);
    expect(412 / (0.24 * 24)).toBeGreaterThanOrEqual(HOUSE_VIEW_FT);
    // A computer's, wider than it's tall: by its height.
    expect(houseScaleZoom({ w: 1280, h: 700, zoom: 1 }, { buildings: 0, photoShown: false })).toBe(0.41);
    // Seeing more than that already: left as it is.
    expect(houseScaleZoom({ w: 412, h: 640, zoom: 0.2 }, { buildings: 0, photoShown: false })).toBeNull();
    // Not for a second building (a shed), nor over a photo, whose view is the person's own.
    expect(houseScaleZoom({ w: 412, h: 640, zoom: 1 }, { buildings: 1, photoShown: false })).toBeNull();
    expect(houseScaleZoom({ w: 412, h: 640, zoom: 1 }, { buildings: 0, photoShown: true })).toBeNull();
  });
});

describe('a small building is asked about, if it is the only one (item 1)', () => {
  const box = (id: string, w: number, h: number, role: Shape['role'] = 'building') =>
    ({ id, type: 'rect', x: 0, y: 0, width: w, height: h, rotation: 0, label: 'House', role, color: '#000', opacity: 1, locked: false }) as Shape;
  it('under 300 sq ft and the only building: asked; a shed beside a house, or a house-sized one, not', () => {
    const tiny = box('a', 12, 10);
    expect(SMALL_BUILDING_SQFT).toBe(300);
    expect(asksRealSize(tiny, [tiny])).toBe(true);
    expect(asksRealSize(box('b', 15, 19.9), [box('b', 15, 19.9)])).toBe(true); // (298.5 sq ft)
    expect(asksRealSize(box('c', 15, 20), [box('c', 15, 20)])).toBe(false); // (300: not under)
    expect(asksRealSize(tiny, [box('house', 50, 30), tiny])).toBe(false); // ("sheds really are that small")
    expect(asksRealSize(box('bed', 4, 3, 'bed'), [box('bed', 4, 3, 'bed')])).toBe(false); // (not a building)
  });
  it('drawn small with nothing else, the question comes up; Draw it again takes it away and starts the tool again', () => {
    startDraw('rect', 'building');
    tap(10, 10); tap(20, 10); tap(20, 18);
    expect(notice()?.textContent).toContain('Is that the real size? At 10 × 8 ft, it’s small for a house.');
    button('Draw it again')!.click();
    expect(state.shapes).toHaveLength(0);
    expect(state.draw).toMatchObject({ target: 'building' });
    // A house, then a shed: the shed isn't asked about.
    state.draw = null;
    startDraw('rect', 'building');
    tap(0, 0); tap(50, 0); tap(50, 30);
    expect(notice()?.textContent ?? '').not.toContain('real size');
    startDraw('rect', 'building');
    tap(60, 0); tap(70, 0); tap(70, 8);
    expect(state.shapes).toHaveLength(2);
    expect(notice()?.textContent ?? '').not.toContain('real size');
  });
});

describe('what the "Now trace" banner lists, ticked as each is drawn (item 2)', () => {
  it('house, driveway, trees, lot line and beds, each by what it was added as', () => {
    expect(TRACE_ITEMS.map((t) => t.label)).toEqual(['House', 'Driveway', 'Trees', 'Lot line', 'Beds']);
    const shapes = [
      { id: 'h', type: 'rect', x: 0, y: 0, width: 40, height: 30, rotation: 0, label: 'House', role: 'building', kind: 'building' },
      { id: 'd', type: 'rect', x: 0, y: 0, width: 10, height: 30, rotation: 0, label: 'Driveway', role: 'path', kind: 'driveway' },
    ] as Shape[];
    expect(TRACE_ITEMS.filter((t) => traced(t.key, shapes)).map((t) => t.key)).toEqual(['building', 'driveway']);
    expect(allTraced(shapes)).toBe(false);
    shapes.push(
      { id: 't', type: 'circle', x: 0, y: 0, radius: 10, label: 'Tree', role: 'plant', tree: true } as Shape,
      { id: 'p', type: 'line', x: 0, y: 0, points: [[0, 0], [10, 0]], rotation: 0, label: 'Property line', role: 'boundary', kind: 'property' } as unknown as Shape,
      { id: 'b', type: 'poly', x: 0, y: 0, points: [[0, 0], [4, 0], [4, 4]], rotation: 0, label: 'Bed', role: 'bed', kind: 'bed' } as unknown as Shape,
    );
    expect(allTraced(shapes)).toBe(true);
    // (A fence isn't a lot line; a plant placed isn't an existing tree.)
    expect(traced('property', [{ id: 'f', type: 'line', label: 'Fence', role: 'boundary', kind: 'fence' } as unknown as Shape])).toBe(false);
    expect(traced('tree', [{ id: 'x', type: 'circle', radius: 2, label: 'Holly', role: 'plant', plantId: 'ilex' } as unknown as Shape])).toBe(false);
  });
});

describe('the scale box keeps clear of A and B (item 3)', () => {
  const box = { left: 8, top: 8, right: 404, bottom: 300 };
  const room = { top: 57, bottom: 780 };
  it('leaves the plan be when the points are clear of it', () => {
    expect(clearOfBox([{ x: 100, y: 500 }, { x: 300, y: 520 }], box, room)).toBeNull();
    // (On a computer the box is narrower than the plan: points beside it are clear of it.)
    expect(clearOfBox([{ x: 600, y: 100 }, { x: 900, y: 120 }], { left: 440, top: 8, right: 840, bottom: 300 }, { top: 57, bottom: 780 })).toEqual({ zoom: 1, dy: expect.any(Number) });
    expect(clearOfBox([{ x: 900, y: 100 }, { x: 1100, y: 120 }], { left: 440, top: 8, right: 840, bottom: 300 }, { top: 57, bottom: 780 })).toBeNull();
  });
  it('moves points under the box down to just below it, at the same zoom', () => {
    const m = clearOfBox([{ x: 100, y: 200 }, { x: 300, y: 260 }], box, room)!;
    expect(m.zoom).toBe(1);
    expect(200 + m.dy).toBe(300 + 24); // (the higher point just under the box)
  });
  it('zooms out about their middle when they are too far apart to fit below it', () => {
    const m = clearOfBox([{ x: 100, y: 100 }, { x: 120, y: 1100 }], box, room)!;
    expect(m.zoom).toBeCloseTo((780 - 24 - 324) / 1000);
    const mid = 600, half = 500 * m.zoom;
    expect(mid - half + m.dy).toBeCloseTo(324);
    expect(mid + half + m.dy).toBeCloseTo(780 - 24);
  });
});
