// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/render', () => ({ render: () => {}, updateStatusReadout: () => {} }));
import { openKV } from '../src/db';
import { cancelHistoryDebounce, pushHistory, redo, undo, undoLabel } from '../src/history';
import { copyShapes, duplicateShapesByIds, paste, setBedConditions, setRoleForIds } from '../src/mutations';
import { state } from '../src/state';
import { _resetStorageForTests, flushSave, initStorage, readProject, sanitizeProjectData } from '../src/storage';
import type { BedConditions, Shape } from '../src/types';

// A bed's conditions, as Plant this bed will set them (Nov 2: the storage part, no UI yet): setBedConditions, one undo
// step and a save, and how the answers travel with the bed: Undo and Redo, Duplicate, Copy and Paste, a bed made
// something else (docs/storage.md, "A bed's conditions, and older versions").

const ALL: BedConditions = { sun: { most: 'Full', least: 'Part' }, soil: 'clay', moisture: 'average', drip: true };
const bed = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'rect', x: 0, y: 0, width: 12, height: 4, rotation: 0, color: '#a16207', label: 'Front bed', opacity: 0.4, locked: false, role: 'bed', ...extra });
const lawn = { id: 'lawn', type: 'rect', x: 0, y: 10, width: 20, height: 8, rotation: 0, color: '#65a30d', label: 'Lawn', opacity: 0.3, locked: false, role: 'lawn' };
const shape = (id: string) => state.shapes.find((s) => s.id === id)!;
const saved = async (id: string) => { await flushSave(); return (await readProject(state.currentProjectId!))!.shapes.find((s) => s.id === id); };

let n = 0;
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  _resetStorageForTests();
  await initStorage(await openKV('bed-conditions-' + ++n));
  state.shapes = sanitizeProjectData({ shapes: [bed('bed'), lawn] }).shapes as Shape[];
  state.selectedIds = [];
  state.history = []; state.historyIndex = -1;
  pushHistory();
});
afterEach(() => { cancelHistoryDebounce(); state.shapes = []; state.history = []; state.historyIndex = -1; });

describe("a bed's conditions, set (setBedConditions)", () => {
  it('sets them as one undo step, saved; Undo of the first answers leaves none, as the bed was opened; Redo sets them again', async () => {
    expect(setBedConditions('bed', ALL)).toBe(true);
    expect(shape('bed').conditions).toEqual(ALL);
    expect(state.historyIndex).toBe(1);
    expect(undoLabel()).toBe('set the conditions of Front bed');
    expect((await saved('bed'))!.conditions).toEqual(ALL);
    // (Not {}: that would go up with the next edit and take away, everywhere, answers another device has that this
    // one never got, an older version having dropped them on the way. The review, Nov 4: src/history.ts inFirstStep.)
    undo();
    expect(shape('bed').conditions).toBeUndefined();
    expect((await saved('bed'))!.conditions).toBeUndefined();
    redo();
    expect(shape('bed').conditions).toEqual(ALL);
    // A new answer replaces them, one step; Undo goes back to the answers before it, not to {}.
    expect(setBedConditions('bed', { ...ALL, soil: 'loam' })).toBe(true);
    expect(shape('bed').conditions).toEqual({ ...ALL, soil: 'loam' });
    undo();
    expect(shape('bed').conditions).toEqual(ALL);
    expect((await saved('bed'))!.conditions).toEqual(ALL);
  });

  it('Undo leaves {}, cleared on purpose (so sync won\'t fill them back), on a bed that had answers in the first step, the plan as opened', async () => {
    state.shapes = sanitizeProjectData({ shapes: [bed('bed', { conditions: ALL }), lawn] }).shapes as Shape[];
    state.history = []; state.historyIndex = -1;
    pushHistory(); // (as opened: answered)
    delete shape('bed').conditions; pushHistory(); // (taken away, as an older version's copy would have them)
    shape('bed').conditions = { soil: 'loam' }; pushHistory();
    undo();
    expect(shape('bed').conditions).toEqual({});
    expect((await saved('bed'))!.conditions).toEqual({});
    redo();
    expect(shape('bed').conditions).toEqual({ soil: 'loam' });
  });

  it('unticking drip is no answer: { drip: false } on a bed whose only answer is drip clears it to {}', () => {
    expect(setBedConditions('bed', { drip: true })).toBe(true);
    expect(setBedConditions('bed', { drip: false } as unknown as BedConditions)).toBe(true);
    expect(shape('bed').conditions).toEqual({});
    expect(setBedConditions('bed', { soil: 'clay', drip: false } as unknown as BedConditions)).toBe(true);
    expect(shape('bed').conditions).toEqual({ soil: 'clay' });
  });

  it('reads them as a stored plan\'s are: a word a later version adds kept, a part that isn\'t one dropped; nothing it could keep refused, no step', () => {
    expect(setBedConditions('bed', { soil: 'silt', moisture: 7 } as unknown as BedConditions)).toBe(true);
    expect(shape('bed').conditions).toEqual({ soil: 'silt' });
    const steps = state.historyIndex;
    expect(setBedConditions('bed', { soil: 7 } as unknown as BedConditions)).toBe(false);
    expect(setBedConditions('bed', 'clay' as unknown as BedConditions)).toBe(false);
    expect(shape('bed').conditions).toEqual({ soil: 'silt' });
    expect(state.historyIndex).toBe(steps);
  });

  it('{} clears them on purpose; on a bed with none it does nothing (no {} that would take away answers another device has); the same again does nothing', async () => {
    expect(setBedConditions('bed', {})).toBe(false);
    expect('conditions' in shape('bed')).toBe(false);
    expect(state.historyIndex).toBe(0);
    expect(setBedConditions('bed', ALL)).toBe(true);
    expect(setBedConditions('bed', { drip: true, moisture: 'average', soil: 'clay', sun: { least: 'Part', most: 'Full' } })).toBe(false); // (the same, in another order)
    expect(setBedConditions('bed', {})).toBe(true);
    expect(shape('bed').conditions).toEqual({});
    expect((await saved('bed'))!.conditions).toEqual({});
    expect(setBedConditions('bed', {})).toBe(false);
    expect(state.historyIndex).toBe(2);
  });

  it('not a bed, or no such shape: nothing', () => {
    expect(setBedConditions('lawn', ALL)).toBe(false);
    expect(setBedConditions('nothing', ALL)).toBe(false);
    expect('conditions' in shape('lawn')).toBe(false);
    expect(state.historyIndex).toBe(0);
  });
});

describe("a bed's conditions, carried with the bed", () => {
  it('Duplicate copies them with the bed, its own copy', () => {
    setBedConditions('bed', ALL);
    const [id] = duplicateShapesByIds(['bed']);
    expect(shape(id).conditions).toEqual(ALL);
    (shape(id).conditions as BedConditions).soil = 'sand';
    expect(shape('bed').conditions).toEqual(ALL);
  });

  it('Copy and Paste carry them, {} too', () => {
    state.shapes.push(...(sanitizeProjectData({ shapes: [bed('b2', { label: 'Back bed', conditions: {} })] }).shapes as Shape[]));
    setBedConditions('bed', ALL);
    expect(copyShapes([shape('bed'), shape('b2')])).toBe(true);
    expect(paste()).toBe(true);
    const pasted = state.shapes.slice(-2);
    expect(pasted.map((s) => [s.id !== 'bed' && s.id !== 'b2', s.label, s.conditions])).toEqual([[true, 'Front bed', ALL], [true, 'Back bed', {}]]);
  });

  it('a bed made something else loses them, in that step, and Undo brings them back; a shape made a bed starts with {}; a bed made a bed again is left as it is', () => {
    setBedConditions('bed', ALL);
    setRoleForIds(['bed'], 'lawn');
    expect('conditions' in shape('bed')).toBe(false);
    undo();
    expect(shape('bed')).toMatchObject({ role: 'bed', conditions: ALL });
    redo();
    expect(shape('bed').role).toBe('lawn');
    expect('conditions' in shape('bed')).toBe(false);
    // (Made a bed again: none on purpose, so a device offline through both changes doesn't fill back what it had.)
    setRoleForIds(['bed', 'lawn'], 'bed');
    expect([shape('bed').conditions, shape('lawn').conditions]).toEqual([{}, {}]);
    setBedConditions('bed', ALL);
    setRoleForIds(['bed'], 'bed');
    expect(shape('bed').conditions).toEqual(ALL);
  });

  it("Undo of a bed's making, or Redo of its deletion, leaves no bed to clear; Undo of a deletion brings it back with them", () => {
    setBedConditions('bed', ALL);
    state.shapes = state.shapes.filter((s) => s.id !== 'bed');
    pushHistory('delete Front bed');
    undo();
    expect(shape('bed').conditions).toEqual(ALL);
    redo();
    expect(state.shapes.some((s) => s.id === 'bed')).toBe(false);
  });
});
