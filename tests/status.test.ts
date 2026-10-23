// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { addPhase, deletePhase, setPhaseForIds, setStatusForIds, setViewFilter } from '../src/mutations';
import { plantSchedule, printContent } from '../src/print';
import { state } from '../src/state';
import { asksFirst, filterText, flaggedFor, passesFilter, statusPatch, today } from '../src/status';
import { nameList } from '../src/ui/status-section';
import { sanitizePhases, sanitizeProjectData } from '../src/storage';
import type { Shape } from '../src/types';

const base = { color: '#16a34a', label: '', opacity: 0.65, locked: false };
const plant = (id: string, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id, type: 'circle', x: 0, y: 0, radius: 1, role: 'plant', label: id, ...extra } as Shape);
const bed = (id: string, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id, type: 'rect', x: -5, y: -5, width: 10, height: 10, rotation: 0, role: 'bed', label: id, ...extra } as Shape);

beforeEach(() => {
  state.shapes = []; state.selectedIds = []; state.phases = []; state.history = []; state.historyIndex = -1;
  state.viewFilter = { status: '', phase: '', showGone: false };
});

describe('filters', () => {
  const shapes = [
    plant('a', { status: 'planned', phase: 'Fall 2026' }), plant('b', { status: 'planted' }), plant('c'),
    plant('d', { status: 'gone' }), bed('bed', { status: 'planned', phase: 'Spring 2027' }), bed('old', { status: 'gone' }),
  ];
  const shown = (f: Parameters<typeof passesFilter>[1]) => shapes.filter((s) => passesFilter(s, f)).map((s) => s.id);
  it('pick plants by status and phase; other shapes stay as context; gone stays hidden', () => {
    expect(shown({ status: '', phase: '', showGone: false })).toEqual(['a', 'b', 'c', 'bed']);
    expect(shown({ status: 'planned', phase: '', showGone: false })).toEqual(['a', 'bed']);
    expect(shown({ status: '', phase: 'Fall 2026', showGone: false })).toEqual(['a', 'bed']);
    expect(shown({ status: 'gone', phase: '', showGone: false })).toEqual(['d', 'bed', 'old']);
    expect(shown({ status: '', phase: '', showGone: true })).toEqual(['a', 'b', 'c', 'd', 'bed', 'old']);
  });
  it('describe themselves', () => {
    expect(filterText({ status: 'planned', phase: 'Fall 2026' })).toBe('Planned plants in Fall 2026');
    expect(filterText({ status: '', phase: 'Fall 2026' })).toBe('Plants in Fall 2026');
    expect(filterText({ status: '', phase: '' })).toBe('');
  });
  it('shape the printed plan and its plant list', () => {
    const all = [bed('B', { x: -10, y: -10, width: 20, height: 20 }), ...shapes.filter((s) => s.role === 'plant')];
    const fall = printContent(all, null, false, { status: '', phase: 'Fall 2026', showGone: false });
    expect(plantSchedule(fall.shapes, {})[0].rows.map((r) => r.label)).toEqual(['a']);
    const everything = printContent(all, null, false);
    expect(plantSchedule(everything.shapes, {})[0].total).toBe(3); // gone plant d isn't listed
  });
});

describe('setting status and phases', () => {
  it('planting stamps today unless a date is set; clearing removes the status', () => {
    const s = plant('a');
    expect(statusPatch(s, 'planted')).toEqual({ status: 'planted', plantedOn: today() });
    expect(statusPatch({ ...s, plantedOn: '2025-04-01' }, 'planted')).toEqual({ status: 'planted', plantedOn: '2025-04-01' });
    state.shapes = [plant('a'), plant('b')];
    state.selectedIds = ['a', 'b'];
    setStatusForIds(['a', 'b'], 'planned');
    expect(state.shapes.map((x) => x.status)).toEqual(['planned', 'planned']);
    setStatusForIds(['a'], undefined);
    expect(state.shapes[0]).not.toHaveProperty('status');
    setStatusForIds(['b'], 'gone');
    expect(state.selectedIds).toEqual(['a']); // gone shapes leave the view and the selection
    expect(state.historyIndex).toBe(2);
  });
  it('phases are added once, assigned, and removed cleanly', () => {
    state.shapes = [plant('a'), plant('b')];
    expect(addPhase('  Fall   2026 ')).toBe('Fall 2026');
    expect(addPhase('Fall 2026')).toBe('Fall 2026');
    expect(addPhase('   ')).toBe('');
    expect(state.phases).toEqual(['Fall 2026']);
    setPhaseForIds(['a', 'b'], 'Fall 2026');
    setViewFilter({ phase: 'Fall 2026' });
    deletePhase('Fall 2026');
    expect(state.phases).toEqual([]);
    expect(state.shapes.some((s) => s.phase)).toBe(false);
    expect(state.viewFilter.phase).toBe('');
  });
  it('changing the view filter deselects what disappears', () => {
    state.shapes = [plant('a', { status: 'planned' }), plant('b', { status: 'planted' })];
    state.selectedIds = ['a', 'b'];
    setViewFilter({ status: 'planned' });
    expect(state.selectedIds).toEqual(['a']);
  });
});

describe('the gone date', () => {
  it('is stamped when marked gone, kept while gone, and goes when marked otherwise', () => {
    const s = plant('a', { status: 'remove' });
    expect(statusPatch(s, 'gone')).toEqual({ status: 'gone', goneOn: today() });
    expect(statusPatch({ ...s, status: 'gone', goneOn: '2026-09-30' }, 'gone')).toEqual({ status: 'gone', goneOn: '2026-09-30' });
    state.shapes = [plant('a', { status: 'remove', plantedOn: '2024-04-01' })];
    setStatusForIds(['a'], 'gone');
    expect(state.shapes[0]).toMatchObject({ status: 'gone', goneOn: today(), plantedOn: '2024-04-01' }); // (its planting date stays)
    setStatusForIds(['a'], 'planted'); // (marked gone by mistake)
    expect(state.shapes[0]).not.toHaveProperty('goneOn');
    expect(state.shapes[0]).toMatchObject({ status: 'planted', plantedOn: '2024-04-01' });
    setStatusForIds(['a'], 'gone');
    setStatusForIds(['a'], undefined);
    expect(state.shapes[0]).not.toHaveProperty('goneOn');
    expect(state.shapes[0]).not.toHaveProperty('status');
  });
});

describe('stored status data', () => {
  it('validates status, planted date and phases', () => {
    const d = sanitizeProjectData({
      phases: ['Fall 2026', 'Fall 2026', '', 7, 'x'.repeat(60)],
      shapes: [
        { type: 'circle', radius: 1, status: 'planted', plantedOn: '2026-10-15', phase: 'Spring 2027' },
        { type: 'circle', radius: 1, status: 'eaten', plantedOn: 'yesterday', phase: '   ' },
      ],
    });
    expect(d.shapes[0]).toMatchObject({ status: 'planted', plantedOn: '2026-10-15', phase: 'Spring 2027' });
    expect(d.shapes[1]).not.toHaveProperty('status');
    expect(d.shapes[1]).not.toHaveProperty('plantedOn');
    expect(d.shapes[1]).not.toHaveProperty('phase');
    expect(d.phases).toEqual(['Fall 2026', 'x'.repeat(40), 'Spring 2027']); // a phase a shape uses is kept
    expect(sanitizePhases(undefined, [])).toEqual([]);
  });
});

describe('a status set on several shapes at once', () => {
  it('finds the shapes it would unmark: to move, to remove or gone, and set to something else', () => {
    const shapes = [plant('a'), plant('b', { status: 'planned' }), plant('c', { status: 'remove' }), plant('d', { status: 'move' }), plant('e', { status: 'gone' })];
    const ids = (status: Parameters<typeof flaggedFor>[1]) => flaggedFor(shapes, status).map((s) => s.id);
    expect(ids('planted')).toEqual(['c', 'd', 'e']); // (planned to planted is the usual step: not asked)
    expect(ids(undefined)).toEqual(['c', 'd', 'e']); // (clearing them unmarks them too)
    expect(ids('remove')).toEqual(['d', 'e']); // (already to remove: nothing to unmark)
    expect(ids('gone')).toEqual(['d']); // (to remove, then gone: the usual next step)
  });
  it('asks only when some, not all, would lose their mark', () => {
    const marked = plant('m', { status: 'remove' }), other = plant('o', { status: 'planned' });
    expect(asksFirst([marked, other], 'planted')).toBe(true); // (the yard marked planted, a shrub to remove in it)
    expect(asksFirst([marked], 'planted')).toBe(false); // (one shape: it's the one tapped)
    expect(asksFirst([marked, plant('m2', { status: 'move' })], 'planted')).toBe(false); // (all marked: chosen as such)
    expect(asksFirst([marked, other], 'gone')).toBe(false);
    expect(asksFirst([plant('v', { status: 'move' }), other], 'gone')).toBe(true);
  });
  it('names them briefly, counting repeats', () => {
    expect(nameList([plant('Rose Camelia')])).toBe('Rose Camelia');
    expect(nameList([plant('Rose Camelia'), plant('Coneflower'), plant('Coneflower')])).toBe('Rose Camelia and Coneflower ×2');
    expect(nameList(['a', 'b', 'c', 'd', 'e', 'f'].map((n) => plant(n)))).toBe('a, b, c, d and 2 more');
    expect(nameList([bed(''), bed('')])).toBe('Unlabeled rectangle ×2');
  });
});
