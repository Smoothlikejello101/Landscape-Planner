// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildShape, isKindKey, kindDef, kindForShortcut, KINDS, nextTapPrompt, ovalFromTaps, radiusFromTaps, rectFromTaps, tapAccepted,
} from '../src/kinds';
import { canFinishDraw, drawTap, finishDraw, recentKinds, setDrawKind, setDrawPathWidth, startDraw, startKind } from '../src/draw';
import { shapeBBox, shapeCenter } from '../src/geometry';
import { state } from '../src/state';
import { shapeToSvgString } from '../src/export';
import type { BoxShape, CircleShape, PathShape, Shape } from '../src/types';

beforeEach(() => {
  state.shapes = []; state.selectedIds = []; state.panel = null; state.draw = null; state.editPoints = null;
  state.history = []; state.historyIndex = -1;
  localStorage.clear();
});
const tap = (x: number, y: number) => state.draw!.points.push({ x, y });

describe('rectangles from three taps', () => {
  it('make a square-on rectangle from two corners and the far side', () => {
    expect(rectFromTaps({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 3, y: 4 })).toEqual({ x: 0, y: 0, width: 10, height: 4, rotation: 0 });
    // the third tap can be anywhere on the far side, and on either side of the first
    expect(rectFromTaps({ x: 0, y: 4 }, { x: 10, y: 4 }, { x: 12, y: 0 })).toEqual({ x: 0, y: 0, width: 10, height: 4, rotation: 0 });
  });
  it('turn to follow the first side, like a house traced from a photo', () => {
    const r = rectFromTaps({ x: 0, y: 0 }, { x: 6, y: 8 }, { x: -8, y: 6 })!; // side 10 long at 53.1°, 10 deep
    expect(r.width).toBe(10); expect(r.height).toBe(10);
    expect(r.rotation).toBeCloseTo(53.1, 1);
    expect(r.x + r.width / 2).toBeCloseTo(-1); expect(r.y + r.height / 2).toBeCloseTo(7);
  });
  it('keep the angle between -90 and 90 whichever way the side was tapped', () => {
    const fwd = rectFromTaps({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 4 })!;
    const back = rectFromTaps({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 4 })!;
    expect(back).toEqual(fwd);
  });
  it('refuse a side or depth too small to see', () => {
    expect(rectFromTaps({ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0, y: 4 })).toBe(null);
    expect(rectFromTaps({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 })).toBe(null);
  });
});

describe('ovals and circles from taps', () => {
  it('make an oval from the ends of its long side and its short edge', () => {
    expect(ovalFromTaps({ x: 0, y: 5 }, { x: 12, y: 5 }, { x: 6, y: 2 })).toEqual({ x: 0, y: 2, width: 12, height: 6, rotation: 0 });
    expect(ovalFromTaps({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 2, y: 5 })).toMatchObject({ width: 10, height: 4, rotation: 90 });
  });
  it('size a circle to the quarter foot from its center and edge', () => {
    expect(radiusFromTaps({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(radiusFromTaps({ x: 0, y: 0 }, { x: 1.5, y: 1.5 })).toBe(2); // 2.12 → 2
    expect(radiusFromTaps({ x: 0, y: 0 }, { x: 0.1, y: 0 })).toBe(null);
  });
  it('ignore a tap that would make a shape too small', () => {
    expect(tapAccepted('circle', [{ x: 0, y: 0 }], { x: 0.1, y: 0 })).toBe(false);
    expect(tapAccepted('rect', [{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 4, y: 0 })).toBe(false);
    expect(tapAccepted('rect', [{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 4, y: 3 })).toBe(true);
    expect(tapAccepted('triangle', [{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 20, y: 0 })).toBe(false); // in line: no area
    expect(tapAccepted('triangle', [{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 5, y: 2 })).toBe(true);
  });
});

describe('kinds', () => {
  it('each map to a role and a drawing method, with plants and measuring on their own', () => {
    for (const k of KINDS) {
      if (k.key === 'plant' || k.key === 'measure') expect(k.methods).toEqual([]);
      else expect(k.methods.length).toBeGreaterThan(0);
      if (k.key !== 'plain' && k.key !== 'measure') expect(k.role).toBeTruthy();
    }
    expect(kindDef('bed').methods[0]).toBe('poly');
    expect(kindDef('building').methods[0]).toBe('rect');
    expect(kindDef('path').methods[0]).toBe('path');
    expect(kindDef('sun').label).toBe('Sun exposure');
    expect(isKindKey('bed')).toBe(true); expect(isKindKey('house')).toBe(false);
  });
  it('have distinct one-letter shortcuts', () => {
    const keys = KINDS.map((k) => k.shortcut).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
    expect(kindForShortcut('B')?.key).toBe('bed');
    expect(kindForShortcut('a')).toBeUndefined(); // A opens the Add sheet
  });
  it('label the first building House and later ones Building', () => {
    const pts = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 30 }];
    const house = buildShape('rect', pts, kindDef('building'), [])!;
    expect(house).toMatchObject({ type: 'rect', role: 'building', label: 'House', width: 40, height: 30 });
    expect(buildShape('rect', pts, kindDef('building'), [house])!.label).toBe('Building');
  });
  it('make an existing tree a plant sized by hand', () => {
    const t = buildShape('trunk', [{ x: 5, y: 5 }, { x: 15, y: 5 }], kindDef('tree'), []) as CircleShape;
    expect(t).toMatchObject({ type: 'circle', role: 'plant', label: 'Tree', x: 5, y: 5, radius: 10, sizeFrom: 'manual', tree: true });
    expect(t.plantId).toBeUndefined();
  });
  it('make paths and driveways bands of their width, fences thin lines', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(buildShape('path', pts, kindDef('path'), [])).toMatchObject({ type: 'line', role: 'path', label: 'Path', pathWidth: 3 });
    expect(buildShape('path', pts, kindDef('driveway'), [])).toMatchObject({ pathWidth: 10, label: 'Driveway' });
    const fence = buildShape('line', pts, kindDef('fence'), []) as PathShape;
    expect(fence).toMatchObject({ type: 'line', role: 'boundary' });
    expect(fence.pathWidth).toBeUndefined();
    expect(buildShape('poly', pts, kindDef('path'), [])).toMatchObject({ type: 'poly', role: 'path' }); // outlined instead
  });
  it('leave plain shapes plain', () => {
    const tri = buildShape('triangle', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }], kindDef('plain'), []) as PathShape;
    expect(tri).toMatchObject({ type: 'poly', points: [[0, 0], [4, 0], [2, 3]] });
    expect(tri.role).toBeUndefined();
    const sun = buildShape('circle', [{ x: 0, y: 0 }, { x: 5, y: 0 }], kindDef('sun'), [])!;
    expect(sun).toMatchObject({ role: 'shade', label: '' });
  });
  it('put a note where it was tapped', () => {
    expect(buildShape('note', [{ x: 7, y: 9 }], kindDef('note'), [])).toMatchObject({ type: 'text', role: 'other', x: 7, y: 8.5, label: '' });
  });
  it('prompt for each tap', () => {
    expect(nextTapPrompt('rect', 1)).toBe('Tap the next corner along the same side');
    expect(nextTapPrompt('circle', 0)).toBe('Tap one edge');
    expect(nextTapPrompt('circle', 1)).toBe('Tap the opposite edge');
    expect(nextTapPrompt('trunk', 0)).toBe('Tap the trunk');
    expect(nextTapPrompt('canopy', 4)).toMatch(/first edge point/);
    expect(nextTapPrompt('poly', 3)).toMatch(/first point/);
  });
});

describe('adding by kind', () => {
  it('opens the picker for plants (and for trees, to name it first) and measures for Measure', () => {
    startKind('plant');
    expect(state.panel).toBe('plants'); expect(state.draw).toBe(null); expect(state.pickerForTree).toBe(false);
    startKind('tree');
    expect(state.panel).toBe('plants'); expect(state.pickerForTree).toBe(true);
    startKind('measure');
    expect(state.draw).toMatchObject({ kind: 'measure' }); expect(state.draw!.target).toBeUndefined();
  });
  it('starts in the default method, then the one last chosen for that kind', () => {
    startKind('bed');
    expect(state.draw).toMatchObject({ kind: 'poly', target: 'bed' });
    setDrawKind('rect');
    startKind('bed');
    expect(state.draw).toMatchObject({ kind: 'rect', target: 'bed' });
    startKind('lawn');
    expect(state.draw!.kind).toBe('poly'); // remembered per kind
  });
  it('finishes a rectangle on its third tap, selected with properties closed', () => {
    startKind('building');
    tap(0, 0); tap(40, 0);
    expect(canFinishDraw()).toBe(false);
    tap(10, 30);
    const s = finishDraw() as BoxShape;
    expect(s).toMatchObject({ type: 'rect', role: 'building', label: 'House', width: 40, height: 30 });
    expect(shapeCenter(s)).toEqual({ x: 20, y: 15 });
    expect(state.selectedIds).toEqual([s.id]);
    expect(state.panel).toBe(null);
    expect(recentKinds()).toEqual(['building']);
  });
  it('opens properties for sun exposure and notes', () => {
    startKind('note'); tap(1, 1);
    finishDraw();
    expect(state.panel).toBe('props');
  });
  it('uses the width typed while drawing a path', () => {
    startKind('path');
    setDrawPathWidth(4.5);
    tap(0, 0); tap(20, 0);
    expect((finishDraw() as PathShape).pathWidth).toBe(4.5);
  });
  it('finishes by itself on the last tap a shape needs', () => {
    document.body.innerHTML = '<svg id="canvas-svg"></svg>';
    const svg = document.getElementById('canvas-svg')!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    state.zoom = 1; state.offsetX = 0; state.offsetY = 0;
    startDraw('trunk', 'tree');
    const ppf = 24; // PX_PER_FOOT_BASE at zoom 1
    expect(drawTap(10 * ppf, 10 * ppf)).toBe(false);
    expect(drawTap(13 * ppf, 14 * ppf)).toBe(true);
    expect(state.shapes.at(-1)).toMatchObject({ type: 'circle', x: 10, y: 10, radius: 5, label: 'Tree' });
    // A shaped canopy: the trunk, then around the edge until the first edge point is tapped again.
    startDraw('canopy', 'tree');
    for (const [x, y] of [[30, 30], [26, 28], [34, 28], [34, 33], [26, 33]]) expect(drawTap(x * ppf, y * ppf)).toBe(false);
    expect(drawTap(26 * ppf, 28 * ppf)).toBe(true);
    expect(state.shapes.at(-1)).toMatchObject({ x: 30, y: 30, radius: 5, canopy: [[-4, -2], [4, -2], [4, 3], [-4, 3]], tree: true });
  });
});

describe('paths on the plan', () => {
  const path: Shape = { id: 'p', type: 'line', x: 0, y: 0, points: [[0, 0], [10, 0]], rotation: 0, color: '#a8a29e', label: 'Path', opacity: 0.7, locked: false, role: 'path', pathWidth: 4 };
  it('reach half their width past the center line', () => {
    expect(shapeBBox(path)).toEqual({ minX: -2, maxX: 12, minY: -2, maxY: 2 });
  });
  it('export as a band at their real width', () => {
    const svg = shapeToSvgString(path, 0, 0, 10, 1);
    expect(svg).toContain('stroke-width="40"');
    expect(svg).toContain('stroke-linecap="butt"');
  });
});

describe('statuses that fit the thing', () => {
  it('say Existing for things that are not plants, and leave out To move', async () => {
    const { statusesFor, statusLabelFor, hasStatus } = await import('../src/status');
    expect(statusesFor([{ role: 'plant' }]).map((s) => s.label)).toEqual(['Planned', 'Planted', 'To move', 'To remove', 'Gone']);
    expect(statusesFor([{ role: 'building' }]).map((s) => s.label)).toEqual(['Planned', 'Existing', 'To remove', 'Gone']);
    expect(statusesFor([{ role: 'plant' }, { role: 'bed' }]).map((s) => s.label)).toContain('Planted / existing');
    expect(statusLabelFor({ role: 'building', status: 'planted' })).toBe('Existing');
    expect(statusLabelFor({ role: 'plant', status: 'planted' })).toBe('Planted');
    expect(hasStatus({ role: 'shade', type: 'poly' })).toBe(false);
    expect(hasStatus({ role: 'other', type: 'text' })).toBe(false);
    expect(hasStatus({ role: 'bed', type: 'rect' })).toBe(true);
  });
  it('start existing things as Existing and designed things as Planned', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 6 }];
    expect(buildShape('rect', pts, kindDef('building'), [])!.status).toBe('planted');
    expect(buildShape('rect', pts, kindDef('bed'), [])!.status).toBe('planned');
    expect(buildShape('rect', pts, kindDef('patio'), [])!.status).toBe('planned');
    expect(buildShape('line', pts, kindDef('fence'), [])!.status).toBe('planted');
    expect(buildShape('circle', pts, kindDef('sun'), [])!.status).toBeUndefined();
    expect(buildShape('rect', pts, kindDef('plain'), [])!.status).toBeUndefined();
  });
  it('put a new plant in the status and phase the plan is filtered to', async () => {
    const { newPlantStatus } = await import('../src/plants');
    state.viewFilter = { status: '', phase: '', showGone: false };
    expect(newPlantStatus()).toEqual({ status: 'planned' });
    state.viewFilter = { status: 'planted', phase: 'Fall 2026', showGone: false };
    expect(newPlantStatus()).toEqual({ status: 'planted', phase: 'Fall 2026' });
    startDraw('circle', 'tree'); tap(0, 0); tap(5, 0);
    expect(finishDraw()).toMatchObject({ status: 'planted', phase: 'Fall 2026' });
    state.viewFilter = { status: '', phase: '', showGone: false };
  });
});
