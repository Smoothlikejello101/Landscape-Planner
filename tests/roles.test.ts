import { beforeEach, describe, expect, it } from 'vitest';
import { drawnHeight, paintOrder, seeThroughIds } from '../src/canvas';
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
  it('draws a plant see-through where a shorter one grows under it (its middle within the circle), not where they only touch', () => {
    const c = (id: string, x: number, radius: number, extra: Partial<Shape> = {}) => ({ id, type: 'circle', x, y: 0, radius, color: '#16a34a', label: id, opacity: 0.65, locked: false, role: 'plant', ...extra } as Shape);
    state.shapes = [c('shrub', 0, 3), c('under', 1, 1), c('beside', 6.5, 3), c('far', 30, 2), c('gone', 30, 0.5, { status: 'gone' })];
    expect([...seeThroughIds(state.shapes)].sort()).toEqual(['shrub']); // (beside touches shrub's edge; far has only a gone plant under it)
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
