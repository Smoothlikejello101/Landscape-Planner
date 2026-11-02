// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { finishPlacing, placeTap, recentPlants, startPlacing, switchPlacingPlant, undoPlace } from '../src/place';
import { linkFromPicker, plantsById, type Plant } from '../src/plants';
import { canFinishDraw, finishDraw, startTreeDraw } from '../src/draw';
import { state } from '../src/state';
import { pushHistory, redo, undo } from '../src/history';
import type { CircleShape } from '../src/types';

const cone: Plant = { id: 'u-cone', common: 'Coneflower', width: { min: 1.5, max: 2, med: 1.75 }, form: 'Perennial' };
const oak: Plant = { id: 'u-oak', common: 'White Oak', width: { min: 50, max: 80, med: 65 }, form: 'Tree' };
const aster: Plant = { id: 'u-aster', common: 'Aromatic aster', width: { min: 1, max: 3, med: 2 }, form: 'Perennial' };
const PPF = 24; // px per foot at zoom 1

beforeEach(() => {
  state.shapes = []; state.selectedIds = []; state.panel = null; state.draw = null; state.editPoints = null; state.placing = null;
  state.history = []; state.historyIndex = -1;
  state.zoom = 1; state.offsetX = 0; state.offsetY = 0; state.sizeMode = 'typical';
  state.viewFilter = { status: '', phase: '', showGone: false };
  plantsById[cone.id] = cone; plantsById[oak.id] = oak; plantsById[aster.id] = aster;
  pushHistory(); // the plan as opened is the first undo step, as in the app
  localStorage.clear();
  document.body.innerHTML = '<svg id="canvas-svg"></svg>';
  document.getElementById('canvas-svg')!.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
});
const tapFt = (x: number, y: number) => placeTap(x * PPF, y * PPF);

describe('placing plants by tapping', () => {
  it('places one per tap where tapped, then leaves the batch selected', () => {
    startPlacing(cone);
    expect(state.placing).toEqual({ plantId: 'u-cone', placed: [] });
    tapFt(2, 3); tapFt(4.2, 3); tapFt(6, 3);
    expect(state.shapes).toHaveLength(3);
    expect(state.shapes[1]).toMatchObject({ type: 'circle', x: 4, y: 3, label: 'Coneflower', role: 'plant', plantId: 'u-cone', status: 'planned', sizeFrom: 'plant' });
    expect((state.shapes[0] as CircleShape).radius).toBe(1); // 1.75 ft spread → 1 ft radius (quarter-foot steps)
    expect(state.historyIndex).toBe(3); // each one its own undo step
    finishPlacing();
    expect(state.placing).toBe(null);
    expect(state.selectedIds).toEqual(state.shapes.map((s) => s.id));
  });
  it('a quick second tap on the same spot is one plant; a new go\'s first tap there is another (CI, Oct 30)', () => {
    startPlacing(cone);
    tapFt(2, 3); tapFt(2, 3); // (a double tap)
    expect(state.shapes).toHaveLength(1);
    finishPlacing();
    startPlacing(cone);
    tapFt(2, 3); // (at once, in a new go: meant)
    expect(state.shapes).toHaveLength(2);
    finishPlacing();
  });
  it('takes back the last one with Undo', () => {
    startPlacing(cone);
    tapFt(2, 3); tapFt(4, 3);
    undoPlace();
    expect(state.shapes).toHaveLength(1);
    expect(state.placing!.placed).toHaveLength(1);
    undoPlace(); undoPlace(); // nothing more to take back: earlier work is left alone
    expect(state.shapes).toHaveLength(0);
    expect(state.placing!.placed).toEqual([]);
  });
  it('never rolls back work done before placing, whatever happened in between', () => {
    state.shapes.push({ id: 'bed', type: 'rect', x: 0, y: 0, width: 4, height: 4, rotation: 0, color: '#000', label: 'Bed', opacity: 1, locked: false, role: 'bed' });
    pushHistory(); // earlier work
    startPlacing(cone);
    tapFt(1, 1); tapFt(2, 1);
    // Something else moves the history (a setting changed elsewhere, an undo from the top bar)...
    state.shapes[0].label = 'Front bed'; pushHistory();
    undoPlace(); // ...so this removes just the last plant
    expect(state.shapes.map((s) => s.label)).toEqual(['Front bed', 'Coneflower']);
    // Two plain undos from elsewhere, then the bar's Undo with nothing of its own left to take back.
    undo(); undo();
    undoPlace(); undoPlace();
    expect(state.shapes.find((s) => s.id === 'bed')).toBeTruthy(); // the earlier bed is never undone
    // ...and the rename made while placing is still there to redo, without the plants taken back.
    redo(); redo();
    expect(state.shapes.map((s) => s.label)).toEqual(['Front bed']);
  });
  it('is a sandbox: plants taken back never return through undo after Done', () => {
    startPlacing(cone);
    tapFt(1, 1); tapFt(2, 1); tapFt(3, 1); tapFt(4, 1);
    const xs = () => state.shapes.map((s) => s.x);
    undoPlace(); undoPlace(); // take back 4, then 3
    expect(xs()).toEqual([1, 2]);
    finishPlacing();
    undo(); expect(xs()).toEqual([1]); // the first undo removes plant 2
    undo(); expect(xs()).toEqual([]);
    undo(); expect(xs()).toEqual([]); // nothing from before
    // Redo brings back only the kept ones.
    for (let i = 0; i < 5; i++) redo();
    expect(xs()).toEqual([1, 2]);
  });
  it('switches plants without losing the ones placed', () => {
    startPlacing(cone);
    tapFt(2, 3);
    switchPlacingPlant(oak);
    tapFt(40, 40);
    expect(state.shapes.map((s) => s.label)).toEqual(['Coneflower', 'White Oak']);
    finishPlacing();
    expect(state.selectedIds).toHaveLength(2);
  });
  it('joins the status and phase the plan is filtered to', () => {
    state.viewFilter = { status: 'planted', phase: 'Fall 2026', showGone: false };
    startPlacing(cone);
    tapFt(1, 1);
    expect(state.shapes[0]).toMatchObject({ status: 'planted', phase: 'Fall 2026' });
  });
  it('remembers the plants placed most recently (not just picked)', () => {
    startPlacing(cone); tapFt(1, 1); finishPlacing();
    startPlacing(oak); tapFt(40, 40); finishPlacing();
    startPlacing(cone); tapFt(3, 1); finishPlacing();
    startPlacing(oak); finishPlacing(); // picked, nothing placed
    expect(recentPlants().map((p) => p.id)).toEqual(['u-cone', 'u-oak']);
  });
  it('counts a plant swapped in as placed: first in Recent (the UI review, 2026-11-01)', () => {
    startPlacing(cone); tapFt(1, 1); finishPlacing();
    state.pickerLinkId = state.shapes[0].id; state.pickerLinkAlso = []; // (its sheet's "Swap for another plant…")
    linkFromPicker(aster);
    expect(state.shapes[0]).toMatchObject({ plantId: 'u-aster' });
    expect(recentPlants().map((p) => p.id)).toEqual(['u-aster', 'u-cone']);
    // (Linked, a circle drawn before the catalog isn't placed: Recent as it was.)
    state.shapes.push({ ...state.shapes[0], id: 'drawn', plantId: undefined, label: 'Oak' } as CircleShape);
    state.pickerLinkId = 'drawn';
    linkFromPicker(oak);
    expect(recentPlants().map((p) => p.id)).toEqual(['u-aster', 'u-cone']);
  });
  it('draws a picked existing tree at the size tapped, named for the plant', () => {
    startTreeDraw('u-oak');
    state.draw!.points.push({ x: 10, y: 10 }, { x: 10, y: 22 });
    expect(canFinishDraw()).toBe(true);
    expect(finishDraw()).toMatchObject({ label: 'White Oak', plantId: 'u-oak', radius: 12, sizeFrom: 'manual', status: 'existing' });
  });
});
