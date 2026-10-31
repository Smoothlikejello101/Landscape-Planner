import { beforeEach, describe, expect, it } from 'vitest';
import { drawnHeight, hiddenIds, labelRuns, paintOrder, runLabelSpot, seeThroughIds } from '../src/canvas';
import { plantsById, type Plant } from '../src/plants';
import { setRoleForIds, setRoleView } from '../src/mutations';
import { defaultLook, isLocked } from '../src/roles';
import { state } from '../src/state';
import { sanitizeProjectData } from '../src/storage';
import type { CircleShape, Shape } from '../src/types';

const sh = (id: string, extra: Partial<Shape> = {}): Shape =>
  ({ id, type: 'rect', x: 0, y: 0, width: 2, height: 2, rotation: 0, color: '#78350f', label: id, opacity: 0.65, locked: false, ...extra } as Shape);

beforeEach(() => {
  state.shapes = [];
  state.roleViews = {};
  state.selectedIds = [];
  state.history = [];
  state.historyIndex = -1;
  state.currentProjectId = null; // storage not initialized: saves are no-ops
});

describe('drawing order', () => {
  it('draws ground roles first, shade under plants, and keeps list order within a tier', () => {
    state.shapes = [
      sh('plantA', { role: 'plant' }), sh('shade', { role: 'shade' }), sh('bed', { role: 'bed' }),
      sh('lawn', { role: 'lawn' }), sh('old'), sh('building', { role: 'building' }), sh('plantB', { role: 'plant' }),
      sh('lockedOld', { locked: true }),
    ];
    expect(paintOrder(state.shapes).map((s) => s.id)).toEqual(
      ['lawn', 'bed', 'shade', 'building', 'lockedOld', 'plantA', 'old', 'plantB']);
  });
  it('draws plants tallest on top, whatever order they were placed in; a note and a vine on a fence where they were (Jason, Oct 30)', () => {
    const c = (id: string, radius: number, extra: Partial<Shape> = {}) => ({ id, type: 'circle', x: 0, y: 0, radius, color: '#16a34a', label: id, opacity: 0.65, locked: false, role: 'plant', ...extra } as Shape);
    plantsById['t-hazel'] = { id: 't-hazel', common: 'Witch hazel', form: 'Shrub', height: { min: 10, max: 15, med: 12 }, width: { min: 6, max: 10, med: 8 } } as Plant;
    plantsById['t-ginger'] = { id: 't-ginger', common: 'Wild ginger', form: 'Perennial', height: { min: 0.3, max: 0.5, med: 0.4 }, width: { min: 1, max: 2, med: 1.5 } } as Plant;
    // (A wide groundcover under a narrower, taller shrub: the shrub on top; with no height known, the spread stands in.)
    state.shapes = [c('hazel', 4, { plantId: 't-hazel' }), c('ginger', 5, { plantId: 't-ginger' }), sh('note', { type: 'text' } as Partial<Shape>), c('crocus', 0.25), c('blueberry', 3), c('vine', 10, { climbsOn: 'fence' } as Partial<Shape>), sh('bed', { role: 'bed' })];
    expect(paintOrder(state.shapes).map((s) => s.id)).toEqual(['bed', 'ginger', 'crocus', 'note', 'blueberry', 'hazel', 'vine']);
    expect(drawnHeight(state.shapes[0] as CircleShape)).toBe(12);
    expect(drawnHeight(state.shapes[4] as CircleShape)).toBe(6); // (3 ft radius, no height: its spread)
  });
  it('draws a plant 5 ft or taller see-through, every copy alike; under a shorter, solid one, a plant whose middle it covers is outlined over it (Jason, Oct 30)', () => {
    const c = (id: string, x: number, radius: number, extra: Partial<Shape> = {}) => ({ id, type: 'circle', x, y: 0, radius, color: '#16a34a', label: id, opacity: 0.65, locked: false, role: 'plant', ...extra } as Shape);
    plantsById['t-hazel'] = { id: 't-hazel', common: 'Witch hazel', form: 'Shrub', height: { min: 10, max: 15, med: 12 } } as Plant;
    plantsById['t-mint'] = { id: 't-mint', common: 'Mountain mint', form: 'Perennial', height: { min: 3, max: 4, med: 3.5 } } as Plant;
    plantsById['t-ginger'] = { id: 't-ginger', common: 'Wild ginger', form: 'Perennial', height: { min: 0.3, max: 0.5, med: 0.4 } } as Plant;
    const hazel = { plantId: 't-hazel' }, mint = { plantId: 't-mint' }, ginger = { plantId: 't-ginger' };
    state.shapes = [
      c('hazel', 0, 3, hazel), c('hazel2', 20, 3, hazel), c('underHazel', 1, 0.75, ginger), // (a canopy, with or without one under it)
      c('mint', 40, 1.25, mint), c('underMint', 40.5, 0.75, ginger), c('besideMint', 42, 0.75, ginger), // (beside: its middle clear)
      c('mint2', 60, 1.25, mint), c('goneUnder', 60, 0.5, { ...ginger, status: 'gone' }),
      c('wide', 80, 3), // (no height known: its spread, 6 ft, stands in)
    ];
    expect([...seeThroughIds(state.shapes)].sort()).toEqual(['hazel', 'hazel2', 'wide']);
    // (Under a canopy, seen through it; under the solid mint, outlined; a gone plant counts for nothing.)
    expect([...hiddenIds(state.shapes)].sort()).toEqual(['underMint']);
  });
  it('names a run of the same plant once: twelve liriope in a column are one run; a gap, another name or two alone are not (Jason, Oct 30)', () => {
    const c = (id: string, label: string, x: number, y: number) => ({ id, type: 'circle', x, y, radius: 0.75, color: '#16a34a', label, opacity: 0.65, locked: false, role: 'plant' } as CircleShape);
    const column = Array.from({ length: 12 }, (_, i) => c('l' + i, 'Creeping liriope', 1, -27.5 + i * 1.5));
    const runs = labelRuns([...column, c('far', 'Creeping liriope', 40, 0), c('a', 'Snowdrops', 0, 0), c('b', 'Snowdrops', 1.5, 0)]);
    expect(runs.map((r) => r.length)).toEqual([12]);
    // (A gap twice their width splits it in two runs of six.)
    const split = column.map((s, i) => (i >= 6 ? { ...s, y: s.y + 3 } : s));
    expect(labelRuns(split).map((r) => r.length)).toEqual([6, 6]);
  });
  it("moves a run's name off another name: onto the plant nearest the middle that's clear, else beside it (Jason, Oct 30)", () => {
    const c = (id: string, x: number, y: number) => ({ id, type: 'circle', x, y, radius: 0.75, color: '#16a34a', label: 'Creeping liriope', opacity: 0.65, locked: false, role: 'plant' } as CircleShape);
    const column = Array.from({ length: 12 }, (_, i) => c('l' + i, 1, -27.5 + i * 1.5));
    const ppf = 33, w = 110, h = 13;
    // (Clear: its middle.)
    expect(runLabelSpot(column, w, h, ppf, [])).toEqual({ x: 1, y: -19.25 });
    // (The Carport bed's name, 1.5 ft wide, at the same middle: the plant just past it.)
    const bed = { x0: 0.75 * ppf - 25, x1: 0.75 * ppf + 25, y0: -19.25 * ppf - 7, y1: -19.25 * ppf + 7 };
    const at = runLabelSpot(column, w, h, ppf, [bed])!;
    expect(at.x).toBe(1);
    expect(Math.abs(at.y + 19.25)).toBe(0.75);
    // (A name across the whole column: beside it, to the left, else the right.)
    const across = { x0: 0, x1: 1.75 * ppf, y0: -30 * ppf, y1: -10 * ppf };
    const beside = runLabelSpot(column, w, h, ppf, [across])!;
    expect(beside.x).toBeGreaterThan(1.75 + w / 2 / ppf);
    // (Nowhere clear: none.)
    expect(runLabelSpot(column, w, h, ppf, [{ x0: -1e4, x1: 1e4, y0: -1e4, y1: 1e4 }])).toBeNull();
  });
  it('leaves hidden roles out', () => {
    state.shapes = [sh('a', { role: 'shade' }), sh('b', { role: 'bed' })];
    state.roleViews = { shade: { hidden: true } };
    expect(paintOrder(state.shapes).map((s) => s.id)).toEqual(['b']);
  });
});

describe('assigning roles', () => {
  it('gives a default-looking shape the new role look', () => {
    state.shapes = [sh('r')]; // unassigned rect default look
    setRoleForIds(['r'], 'shade');
    expect(state.shapes[0].role).toBe('shade');
    expect(state.shapes[0].color).toBe(defaultLook('shade', 'rect').color);
    expect(state.shapes[0].opacity).toBe(defaultLook('shade', 'rect').opacity);
  });
  it('keeps colors the user chose', () => {
    state.shapes = [sh('r', { color: '#ef4444', opacity: 0.4 })];
    setRoleForIds(['r'], 'bed');
    expect(state.shapes[0]).toMatchObject({ role: 'bed', color: '#ef4444', opacity: 0.4 });
  });
  it('can clear a role', () => {
    state.shapes = [sh('r', { role: 'bed' })];
    setRoleForIds(['r'], undefined);
    expect(state.shapes[0].role).toBeUndefined();
  });
});

describe('role views', () => {
  it('locking a role locks its shapes; hiding deselects them', () => {
    state.shapes = [sh('a', { role: 'shade' }), sh('b', { role: 'bed' })];
    state.selectedIds = ['a', 'b'];
    setRoleView('shade', { locked: true });
    expect(isLocked(state.shapes[0])).toBe(true);
    expect(isLocked(state.shapes[1])).toBe(false);
    setRoleView('shade', { hidden: true });
    expect(state.selectedIds).toEqual(['b']);
    setRoleView('shade', { hidden: false, locked: false });
    expect(state.roleViews.shade).toEqual({});
  });
});

describe('loading roles', () => {
  it('keeps valid roles, infers plants from the plant picker, ignores junk', () => {
    const d = sanitizeProjectData({
      shapes: [sh('a', { role: 'bed' }), { ...sh('b'), plantId: 'heuchera' }, { ...sh('c'), role: 'spaceship' }, sh('d')],
      roleViews: { shade: { hidden: true, locked: 'yes' }, nonsense: { hidden: true } },
    });
    expect(d.shapes.map((s) => s.role)).toEqual(['bed', 'plant', undefined, undefined]);
    expect(d.roleViews).toEqual({ shade: { hidden: true } });
  });
});

describe('loading bed and sun fields', () => {
  it('keeps "plants move with bed: off" and recorded sun, and repairs bad sun data', () => {
    const d = sanitizeProjectData({ shapes: [
      { ...sh('bed', { role: 'bed' }), carryPlants: false },
      { ...sh('shade', { role: 'shade' }), sun: { mode: 'times', periods: [[780, 540], ['x', 1]], hours: 3, dappled: true, observedOn: '2026-06-14', note: 'oak' } },
      { ...sh('junk', { role: 'shade' }), sun: { mode: 'weird', hours: 99, observedOn: 'June' } },
    ] });
    expect(d.shapes[0].carryPlants).toBe(false);
    expect(d.shapes[1].sun).toEqual({ mode: 'times', periods: [[540, 780]], hours: 3, dappled: true, observedOn: '2026-06-14', note: 'oak' });
    expect(d.shapes[2].sun).toMatchObject({ mode: 'times', hours: 16 });
    expect(d.shapes[2].sun?.observedOn).toBeUndefined();
  });
});
