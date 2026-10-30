import { beforeEach, describe, expect, it } from 'vitest';
import { paintOrder } from '../src/canvas';
import { setRoleForIds, setRoleView } from '../src/mutations';
import { defaultLook, isLocked } from '../src/roles';
import { state } from '../src/state';
import { sanitizeProjectData } from '../src/storage';
import type { Shape } from '../src/types';

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
  it('draws plants biggest first, whatever order they were placed in, a note and a vine on a fence where they were (Jason, Oct 30)', () => {
    const c = (id: string, radius: number, extra: Partial<Shape> = {}) => ({ id, type: 'circle', x: 0, y: 0, radius, color: '#16a34a', label: id, opacity: 0.65, locked: false, role: 'plant', ...extra } as Shape);
    state.shapes = [c('crocus', 0.25), c('blueberry', 3), sh('note', { type: 'text' } as Partial<Shape>), c('crocus2', 0.25), c('hazel', 4), c('vine', 10, { climbsOn: 'fence' } as Partial<Shape>), sh('bed', { role: 'bed' })];
    expect(paintOrder(state.shapes).map((s) => s.id)).toEqual(['bed', 'hazel', 'blueberry', 'note', 'crocus', 'crocus2', 'vine']);
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
