// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openKV, put } from '../src/db';
import { state } from '../src/state';
import {
  _resetStorageForTests, clearedNow, createProject, deleteProject, flushSave, getClipboard, initStorage, keepCleared, loadCleared,
  readProject, sanitizeProjectData, save, switchProject, writeJournalIfDirty, migrateBgImage, photoRefOf, sanitizePhotoRef, sanitizeDismissed, syncedContent } from '../src/storage';
import { allExportedProjects, buildBackupFile, importProjects, parseImportFile, uniqueName } from '../src/backup';
import { sanitizeMyPlant } from '../src/my-plants';
import { buildSupportFile } from '../src/support';
import { ERROR_LOG_KEY, readErrors, recordError } from '../src/error-log';
import { NEW_RECORD, parseIntroRecord } from '../src/intro';
import { NO_YARD, loadYard } from '../src/yard';

const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(64);
const circle = (label: string) => ({ id: label, type: 'circle', x: 1, y: 2, radius: 3, color: '#000', label, opacity: 0.5, locked: false });

let dbCount = 0;
async function freshStorage() {
  _resetStorageForTests();
  // A new database name per test keeps tests independent.
  const kv = await openKV('test-' + ++dbCount);
  await initStorage(kv);
  return kv;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); });
/** All journal entries currently in localStorage, as one string. */
const journals = () => Object.keys(localStorage).filter((k) => k.startsWith('lp-journal')).map((k) => localStorage.getItem(k)).join('');
const laterBy = (ms: number) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + ms); };

describe('migration from localStorage', () => {
  it('copies projects, the open project, images and the clipboard', async () => {
    localStorage.setItem('lp-projects', JSON.stringify([
      { id: 'p1', name: 'Back Yard', lastModified: 1000 },
      { id: 'p2', name: 'Front Yard', lastModified: 2000 },
    ]));
    localStorage.setItem('lp-project-p1', JSON.stringify({ shapes: [circle('oak')], zoom: 2, offsetX: 5, offsetY: 6 }));
    localStorage.setItem('lp-project-p2', JSON.stringify({
      shapes: [circle('a'), circle('b')], zoom: 1, offsetX: 0, offsetY: 0,
      bgImage: { dataUrl: IMG, naturalWidth: 10, naturalHeight: 20, ftPerPx: 0.5, cx: 1, cy: 2, rotation: 15, opacity: 0.4, visible: true },
    }));
    localStorage.setItem('lp-current', 'p2');
    localStorage.setItem('lp-clipboard', JSON.stringify({ shapes: [circle('clip')], sourceProjectId: 'p1', timestamp: 1 }));

    await freshStorage();
    expect(state.projects.map((p) => p.name).sort()).toEqual(['Back Yard', 'Front Yard']);
    expect(state.currentProjectId).toBe('p2');
    expect(state.shapes.map((s) => s.label)).toEqual(['a', 'b']);
    expect(state.bgImage?.dataUrl).toBe(IMG);
    expect(state.bgImage?.rotation).toBe(15);
    expect(getClipboard()?.shapes[0].label).toBe('clip');
    const p1 = await readProject('p1');
    expect(p1?.zoom).toBe(2);
    expect(p1?.shapes[0].label).toBe('oak');
    // localStorage is kept as a fallback copy
    expect(localStorage.getItem('lp-project-p1')).not.toBeNull();
  });

  it('migrates the original single-project format', async () => {
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes: [circle('legacy')], zoom: 1, offsetX: 0, offsetY: 0 }));
    await freshStorage();
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0].name).toBe('My Garden');
    expect(state.shapes[0].label).toBe('legacy');
  });

  it('runs only once', async () => {
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes: [circle('legacy')] }));
    const kv = await freshStorage();
    _resetStorageForTests();
    await initStorage(kv);
    expect(state.projects).toHaveLength(1);
  });

  it('picks up edits an older version made after the migration', async () => {
    localStorage.setItem('lp-projects', JSON.stringify([{ id: 'p1', name: 'Yard', lastModified: 1000 }]));
    localStorage.setItem('lp-project-p1', JSON.stringify({ shapes: [circle('before')] }));
    const kv = await freshStorage();
    expect(state.shapes.map((s) => s.label)).toEqual(['before']);
    // The old app runs once more (stale cache) and saves an edit.
    const later = Date.now() + 60_000;
    localStorage.setItem('lp-projects', JSON.stringify([
      { id: 'p1', name: 'Yard', lastModified: later },
      { id: 'p9', name: 'Made in old app', lastModified: later },
    ]));
    localStorage.setItem('lp-project-p1', JSON.stringify({ shapes: [circle('before'), circle('after')] }));
    localStorage.setItem('lp-project-p9', JSON.stringify({ shapes: [circle('new')] }));
    _resetStorageForTests();
    await initStorage(kv);
    expect(state.shapes.map((s) => s.label)).toEqual(['before', 'after']);
    expect(state.projects.map((p) => p.name).sort()).toEqual(['Made in old app', 'Yard']);
  });

  it('does not overwrite newer work with an older localStorage copy', async () => {
    localStorage.setItem('lp-projects', JSON.stringify([{ id: 'p1', name: 'Yard', lastModified: 1000 }]));
    localStorage.setItem('lp-project-p1', JSON.stringify({ shapes: [circle('old')] }));
    const kv = await freshStorage();
    state.shapes = sanitizeProjectData({ shapes: [circle('new work')] }).shapes;
    save();
    await flushSave();
    _resetStorageForTests();
    await initStorage(kv);
    expect(state.shapes.map((s) => s.label)).toEqual(['new work']);
  });

  it('creates an empty "My Garden" on first run', async () => {
    await freshStorage();
    expect(state.projects.map((p) => p.name)).toEqual(['My Garden']);
    expect(state.shapes).toEqual([]);
  });
});

describe('what Clear all took (Jason, Oct 30)', () => {
  const settle = () => new Promise((r) => setTimeout(r, 20));
  it('is kept with the project, there after a reload, and forgotten once something new is drawn', async () => {
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [circle('a'), circle('b')] }).shapes;
    state.bgImage = { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true };
    keepCleared({ shapes: state.shapes, bgImage: state.bgImage, photoElsewhere: null });
    state.shapes = []; state.bgImage = null;
    save(); await flushSave(); await settle();
    // A reload: read from disk, offered while the plan is empty.
    _resetStorageForTests(); await initStorage(kv);
    expect(clearedNow()).toBeNull(); // (not read yet)
    await loadCleared(id);
    expect(clearedNow()?.shapes.map((x) => x.label)).toEqual(['a', 'b']);
    expect(clearedNow()?.bgImage?.dataUrl).toBe(IMG);
    // Something new drawn: no longer offered, and gone from disk.
    state.shapes = sanitizeProjectData({ shapes: [circle('c')] }).shapes;
    save(); await flushSave(); await settle();
    expect(await kv.get('kv', `cleared/${id}`)).toBeUndefined();
    _resetStorageForTests(); await initStorage(kv);
    state.shapes = [];
    await loadCleared(id);
    expect(clearedNow()).toBeNull();
  });
  it('goes with its project when the project is deleted', async () => {
    const kv = await freshStorage();
    const first = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [circle('a')] }).shapes;
    keepCleared({ shapes: state.shapes, bgImage: null, photoElsewhere: null });
    await settle();
    const other = await createProject('Other');
    await switchProject(other);
    await deleteProject(first);
    expect(await kv.get('kv', `cleared/${first}`)).toBeUndefined();
  });
});

describe('saving and loading', () => {
  it('round-trips shapes, view and background image', async () => {
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = [sanitizeProjectData({ shapes: [circle('x')] }).shapes[0]];
    state.zoom = 1.5;
    state.bgImage = { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true };
    await flushSave();
    const loaded = await readProject(id);
    expect(loaded?.shapes[0].label).toBe('x');
    expect(loaded?.zoom).toBe(1.5);
    expect(loaded?.bgImage?.dataUrl).toBe(IMG);
    // image bytes live in their own record, not in the project record
    const stored = await kv.get<Record<string, unknown>>('projects', id);
    expect(JSON.stringify(stored)).not.toContain(IMG);
    expect(await kv.keys('images', id + '/')).toHaveLength(1);
    expect(state.projects[0].shapeCount).toBe(1);
  });

  it('cleans up a replaced background image when the project is reopened', async () => {
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    state.bgImage = { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true };
    await flushSave();
    state.bgImage = { ...state.bgImage, dataUrl: IMG + 'B', imageId: undefined };
    await flushSave();
    expect(await kv.keys('images', id + '/')).toHaveLength(2); // old one kept until reopen (undo may need it)
    await switchProject(id);
    await new Promise((r) => setTimeout(r, 20));
    expect(await kv.keys('images', id + '/')).toHaveLength(2); // too recent: another tab might use it
    laterBy(2 * 60 * 60 * 1000);
    await switchProject(id);
    await new Promise((r) => setTimeout(r, 20));
    expect(await kv.keys('images', id + '/')).toHaveLength(1);
    expect(state.bgImage?.dataUrl).toBe(IMG + 'B');
  });

  it('deleting a project removes its data and images', async () => {
    const kv = await freshStorage();
    const id = await createProject('Doomed', sanitizeProjectData({
      shapes: [circle('a')],
      bgImage: { dataUrl: IMG, naturalWidth: 1, naturalHeight: 1, ftPerPx: 1, cx: 0, cy: 0, rotation: 0, opacity: 1, visible: true },
    }));
    expect(await kv.keys('images', id + '/')).toHaveLength(1);
    await deleteProject(id);
    expect(await kv.get('projects', id)).toBeUndefined();
    expect(await kv.get('meta', id)).toBeUndefined();
    expect(await kv.keys('images', id + '/')).toHaveLength(0);
    expect(state.projects.some((p) => p.id === id)).toBe(false);
  });

  it('drops unusable shapes and clamps bad numbers from old or edited data', () => {
    const d = sanitizeProjectData({
      shapes: [circle('ok'), { type: 'hexagon' }, null, { type: 'rect', x: 'NaN', width: -5 }],
      zoom: 99, offsetX: 'x',
    });
    expect(sanitizeProjectData({ shapes: [], zoom: 0.01 }).zoom).toBe(0.05); // (as far out as it goes)
    expect(sanitizeProjectData({ shapes: [], zoom: 0.05 }).zoom).toBe(0.05);
    expect(d.shapes.map((s) => s.type)).toEqual(['circle', 'rect']);
    expect(d.shapes[1].x).toBe(0);
    expect((d.shapes[1] as { width: number }).width).toBe(0.1);
    expect(d.zoom).toBe(4);
    expect(d.offsetX).toBe(-10);
  });
});

describe('freeform outlines and lines', () => {
  const poly = (extra: Record<string, unknown> = {}) => ({ id: 'p', type: 'poly', x: 10, y: 20, points: [[0, 0], [4, 0], [2, 3]], rotation: 15, color: '#0d9488', label: 'Bed', opacity: 0.3, locked: false, role: 'bed', ...extra });
  it('round-trips through saving and backup files', async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [poly(), { ...poly(), id: 'l', type: 'line', points: [[0, 0], [10, 5]], role: 'boundary' }] }).shapes;
    await flushSave();
    const loaded = await readProject(id);
    expect(loaded?.shapes).toEqual(state.shapes);
    expect(loaded?.shapes[0]).toMatchObject({ type: 'poly', x: 10, y: 20, points: [[0, 0], [4, 0], [2, 3]], rotation: 15, role: 'bed' });
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
  it('drops bad points and shapes with too few to draw', () => {
    const shapes = sanitizeProjectData({ shapes: [
      poly({ id: 'ok', points: [[0, 0], ['x', 1], [4, 0], [null], [2, 3], [NaN, 1]] }),
      poly({ id: 'two', points: [[0, 0], [4, 0]] }),
      poly({ id: 'none', points: 'nope' }),
      { ...poly(), id: 'line1', type: 'line', points: [[0, 0]] },
    ] }).shapes;
    expect(shapes.map((s) => s.id)).toEqual(['ok']);
    expect(shapes[0]).toMatchObject({ points: [[0, 0], [4, 0], [2, 3]] });
  });
  it('re-normalizes points so the box starts at (x, y)', () => {
    const [s] = sanitizeProjectData({ shapes: [poly({ x: 0, y: 0, points: [[5, 7], [9, 7], [7, 10]] })] }).shapes;
    expect(s).toMatchObject({ x: 5, y: 7, points: [[0, 0], [4, 0], [2, 3]] });
  });
  it('caps the number of points', () => {
    const many = Array.from({ length: 2000 }, (_, i) => [i, i % 2]);
    const [s] = sanitizeProjectData({ shapes: [poly({ points: many })] }).shapes;
    expect(s.type === 'poly' && s.points.length).toBe(500);
  });
});

describe('text notes and dimension lines', () => {
  it('round-trip, with sizes clamped', async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [
      { id: 't', type: 'text', x: 1, y: 2, label: 'Rain barrel\nhere', fontSize: 1.5, rotation: 10, color: '#1c1917', opacity: 1, locked: false, role: 'other' },
      { id: 'd', type: 'line', x: 0, y: 0, points: [[0, 0], [12, 0]], rotation: 0, showLength: true, color: '#1c1917', label: '', opacity: 1, locked: false },
      { id: 'big', type: 'text', x: 0, y: 0, label: 'x', fontSize: 9999 },
      { id: 'bad', type: 'text', x: 0, y: 0, label: 'x', fontSize: 'huge' },
    ] }).shapes;
    await flushSave();
    const loaded = (await readProject(id))!.shapes;
    expect(loaded).toEqual(state.shapes);
    expect(loaded[0]).toMatchObject({ type: 'text', label: 'Rain barrel\nhere', fontSize: 1.5, rotation: 10 });
    expect(loaded[1]).toMatchObject({ type: 'line', showLength: true });
    expect(loaded[2]).toMatchObject({ fontSize: 50 });
    expect(loaded[3]).toMatchObject({ fontSize: 1 });
  });
});

describe('paths with a width', () => {
  const line = (extra: Record<string, unknown> = {}) => ({ id: 'w', type: 'line', x: 0, y: 0, points: [[0, 0], [10, 0], [10, 8]], rotation: 0, color: '#a8a29e', label: 'Path', opacity: 0.7, locked: false, role: 'path', ...extra });
  it('round-trip their width, and older lines stay thin', async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [line({ pathWidth: 3 }), line({ id: 'fence', role: 'boundary' })] }).shapes;
    await flushSave();
    const loaded = (await readProject(id))!.shapes;
    expect(loaded).toEqual(state.shapes);
    expect(loaded[0]).toMatchObject({ type: 'line', pathWidth: 3 });
    expect('pathWidth' in loaded[1]).toBe(false);
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
  it('drop widths that are not a sensible number of feet', () => {
    const shapes = sanitizeProjectData({ shapes: [
      line({ id: 'zero', pathWidth: 0 }), line({ id: 'huge', pathWidth: 500 }), line({ id: 'text', pathWidth: '3' }),
      line({ id: 'nan', pathWidth: NaN }), line({ id: 'ok', pathWidth: 0.25 }),
      { ...line({ id: 'poly', pathWidth: 3 }), type: 'poly' },
    ] }).shapes;
    expect(shapes.map((s) => (s.type === 'line' ? s.pathWidth : 'poly'))).toEqual([undefined, undefined, undefined, undefined, 0.25, 'poly']);
    expect(shapes.filter((s) => s.id !== 'ok').some((s) => 'pathWidth' in s)).toBe(false); // dropped, not stored as undefined
  });
});

describe('printable-plan settings', () => {
  it('default for older projects, validate odd values, and round-trip', async () => {
    expect(sanitizeProjectData({ shapes: [] }).print).toEqual({
      paper: 'letter', orientation: 'auto', title: '', subtitle: '',
      includeBackground: false, includeGrid: true, includePlantList: true, includeFullRings: false, northDeg: 0, statusFilter: '', phaseFilter: '',
    });
    expect(sanitizeProjectData({ print: { paper: 'poster', orientation: 'sideways', northDeg: -90, includeGrid: 'no', title: 7 } }).print)
      .toMatchObject({ paper: 'letter', orientation: 'auto', northDeg: 270, includeGrid: true, title: '' });
    await freshStorage();
    const id = state.currentProjectId!;
    state.print = { ...state.print, paper: 'tabloid', title: 'Back yard', northDeg: 15, includePlantList: false };
    await flushSave();
    expect((await readProject(id))!.print).toMatchObject({ paper: 'tabloid', title: 'Back yard', northDeg: 15, includePlantList: false });
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.print).toMatchObject({ paper: 'tabloid', title: 'Back yard' });
  });
});

describe('Existing, a status of its own (Jason, Oct 31)', () => {
  it('reads what was "planted" but already there as Existing: anything not a plant, a tree drawn as one with no planting date', () => {
    const d = sanitizeProjectData({ shapes: [
      { id: 'house', type: 'rect', x: 0, y: 0, width: 10, height: 8, role: 'building', status: 'planted' },
      { id: 'oak', type: 'circle', x: 0, y: 0, radius: 12, role: 'plant', tree: true, status: 'planted' },
      { id: 'maple', type: 'circle', x: 0, y: 0, radius: 8, role: 'plant', tree: true, status: 'planted', plantedOn: '2024-04-01' },
      { id: 'aster', type: 'circle', x: 0, y: 0, radius: 1, role: 'plant', status: 'planted', plantedOn: '2025-05-01' },
      { id: 'shed', type: 'rect', x: 0, y: 0, width: 4, height: 4, role: 'building', status: 'remove' },
    ] });
    expect(d.shapes.map((s) => [s.id, s.status])).toEqual([['house', 'existing'], ['oak', 'existing'], ['maple', 'planted'], ['aster', 'planted'], ['shed', 'remove']]);
    // (And as it now is, kept.)
    expect(sanitizeProjectData({ shapes: [{ id: 'oak', type: 'circle', x: 0, y: 0, radius: 12, role: 'plant', status: 'existing' }] }).shapes[0].status).toBe('existing');
  });
});

describe('a plant of my own, male or female (Jason, Oct 31)', () => {
  it('keeps its sex when said, none for older plants or odd values', () => {
    const base = { id: 'u-abc', common: "Winterberry 'Jim Dandy'", width: { min: 6, max: 8, med: 7 } };
    expect(sanitizeMyPlant(base)?.sex).toBeUndefined();
    expect(sanitizeMyPlant({ ...base, sex: 'male' })?.sex).toBe('male');
    expect(sanitizeMyPlant({ ...base, sex: 'both' })?.sex).toBeUndefined();
  });
});

describe('the Show plants filter (Jason, Oct 31: kept with the plan, not synced)', () => {
  it('is none for older plans, keeps a valid one, drops odd values, round-trips on this device and stays out of sync', async () => {
    expect(sanitizeProjectData({ shapes: [] }).viewFilter).toBeUndefined();
    expect(sanitizeProjectData({ phases: ['Fall 2026'], viewFilter: { status: 'planned', phase: 'Fall 2026', showGone: false } }).viewFilter)
      .toEqual({ status: 'planned', phase: 'Fall 2026', showGone: false });
    // (A status not known, a phase the plan doesn't have: left out; nothing left on, no filter.)
    expect(sanitizeProjectData({ phases: [], viewFilter: { status: 'eaten', phase: 'Spring 2099', showGone: 'yes' } }).viewFilter).toBeUndefined();
    await freshStorage();
    const id = state.currentProjectId!;
    state.phases = ['Fall 2026'];
    state.viewFilter = { status: 'planted', phase: 'Fall 2026', showGone: false };
    save();
    await flushSave();
    expect((await readProject(id))!.viewFilter).toEqual({ status: 'planted', phase: 'Fall 2026', showGone: false });
    await switchProject(await createProject('Another plan'));
    expect(state.viewFilter).toEqual({ status: '', phase: '', showGone: false }); // (another plan: its own, none)
    await switchProject(id);
    expect(state.viewFilter).toEqual({ status: 'planted', phase: 'Fall 2026', showGone: false });
    expect('viewFilter' in syncedContent(sanitizeProjectData({ phases: ['Fall 2026'], viewFilter: { status: 'planted', phase: '', showGone: false } }))).toBe(false);
  });
});

describe('sun warning settings', () => {
  it('keep dismissals and the plan switch, and default to warnings on', () => {
    const d = sanitizeProjectData({ shapes: [
      { type: 'circle', radius: 1, role: 'plant', sunDismissed: 'Heuchera gets about 8 h of sun here; it prefers part sun to shade.' },
      { type: 'circle', radius: 1, sunDismissed: 42 },
    ] });
    expect(d.sunWarnings).toBe(true);
    expect(d.shapes[0].sunDismissed).toContain('prefers part sun');
    expect(d.shapes[1]).not.toHaveProperty('sunDismissed');
    expect(sanitizeProjectData({ sunWarnings: false }).sunWarnings).toBe(false);
    expect(sanitizeProjectData({ sunWarnings: 'no' }).sunWarnings).toBe(true);
  });
});

describe('unsaved-edit journal', () => {
  it('recovers edits whose async save never finished', async () => {
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [circle('late')] }).shapes;
    state.bgImage = { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true };
    save();                 // debounced; never gets to run
    writeJournalIfDirty();  // what pagehide does
    _resetStorageForTests(); // the page is gone
    await initStorage(kv);
    expect(state.currentProjectId).toBe(id);
    expect(state.shapes.map((s) => s.label)).toEqual(['late']);
    expect(state.bgImage?.dataUrl).toBe(IMG);
    expect(journals()).toBe('');
  });

  it('keeps a stored image reference without copying its bytes into the journal', async () => {
    const kv = await freshStorage();
    state.bgImage = { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true };
    save();
    await flushSave();
    state.bgImage = { ...state.bgImage!, rotation: 45 };
    save();
    writeJournalIfDirty();
    expect(journals()).toContain('"rotation":45');
    expect(journals()).not.toContain(IMG);
    _resetStorageForTests();
    await initStorage(kv);
    expect(state.bgImage?.rotation).toBe(45);
    expect(state.bgImage?.dataUrl).toBe(IMG);
  });

  it('writes nothing when there are no unsaved changes', async () => {
    await freshStorage();
    writeJournalIfDirty();
    expect(journals()).toBe('');
  });

  it('ignores a journal older than the saved project', async () => {
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    localStorage.setItem('lp-journal:' + id, JSON.stringify({ projectId: id, at: 1, data: { shapes: [circle('stale')] } }));
    _resetStorageForTests();
    await initStorage(kv);
    expect(state.shapes).toEqual([]);
    expect(journals()).toBe('');
  });
});

describe('backup files', () => {
  it('round-trips every project through a backup file', async () => {
    await freshStorage();
    state.shapes = sanitizeProjectData({ shapes: [circle('one')] }).shapes;
    state.bgImage = { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 30, opacity: 0.6, visible: true };
    await createProject('Second', sanitizeProjectData({ shapes: [circle('two'), circle('three')] }));
    const { text, count } = await buildBackupFile();
    expect(count).toBe(2);

    // Restore into a different, empty device
    await freshStorage();
    const ids = await importProjects(parseImportFile(text));
    expect(ids).toHaveLength(2);
    const names = state.projects.map((p) => p.name).sort();
    expect(names).toEqual(['My Garden', 'My Garden (2)', 'Second']);
    const restored = await Promise.all(ids.map((id) => readProject(id)));
    const garden = restored.find((d) => d?.shapes[0]?.label === 'one');
    expect(garden?.bgImage?.dataUrl).toBe(IMG);
    expect(garden?.bgImage?.rotation).toBe(30);
    expect(restored.find((d) => d?.shapes.length === 2)).toBeTruthy();
  });

  it("a support file (Send feedback) holds every project from storage and imports like a backup, its images left out unless asked; nothing in storage changes", async () => {
    await freshStorage();
    state.shapes = sanitizeProjectData({ shapes: [circle('one')] }).shapes;
    state.bgImage = { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 30, opacity: 0.6, visible: true };
    await createProject('Second', sanitizeProjectData({ shapes: [circle('two'), circle('three')] }));
    await flushSave();
    localStorage.setItem('lp-auth', '{"access_token":"secret"}');
    const before = await Promise.all(state.projects.map((p) => readProject(p.id)));
    const info = { myPlants: [], app: { version: 'test', built: 'now', catalog: null }, device: {}, storage: {}, sync: {}, settings: {}, localData: [], otherKeys: [], errors: [] };
    const projects = await allExportedProjects();
    const text = JSON.stringify(buildSupportFile({ ...info, projects, includeImages: false, now: new Date() }));
    expect(text).not.toContain(IMG);
    expect(text).not.toContain('secret');
    expect(JSON.stringify(buildSupportFile({ ...info, projects, includeImages: true, now: new Date() }))).toContain(IMG);
    // (Taking it changed nothing: the projects, their image too, are as they were.)
    expect(await Promise.all(state.projects.map((p) => readProject(p.id)))).toEqual(before);
    expect(state.bgImage?.dataUrl).toBe(IMG);

    await freshStorage();
    const ids = await importProjects(parseImportFile(text));
    expect(ids).toHaveLength(2);
    const restored = await Promise.all(ids.map((id) => readProject(id)));
    expect(restored.map((d) => d?.shapes.length).sort()).toEqual([1, 2]);
    expect(restored.every((d) => !d?.bgImage)).toBe(true);
  });

  it('keeps the error log apart from projects: garbage in it reads as no errors', async () => {
    await freshStorage();
    localStorage.setItem(ERROR_LOG_KEY, '{oops');
    expect(readErrors()).toEqual([]);
    recordError(new Error('save failed'), 'save');
    expect(readErrors().map((e) => e.message)).toEqual(['Error: save failed']);
    expect(state.projects).toHaveLength(1);
  });

  it('rejects files that are not project files, or are from a newer version', () => {
    expect(() => parseImportFile('not json')).toThrow(/valid JSON/);
    expect(() => parseImportFile('{"hello":1}')).toThrow(/isn't a FullGrown/);
    expect(() => parseImportFile(JSON.stringify({ format: 'landscape-planner-project', version: 99, project: {} }))).toThrow(/newer version/);
  });

  it('picks non-colliding names', () => {
    expect(uniqueName('A', [])).toBe('A');
    expect(uniqueName('A', ['A', 'A (2)'])).toBe('A (3)');
  });
});

describe("a building's doors and windows, a fence's gates (sub-features)", () => {
  const house = (extra: Record<string, unknown> = {}) => ({ id: 'h', type: 'rect', x: 0, y: 0, width: 20, height: 10, rotation: 0, color: '#78716c', label: 'House', opacity: 0.65, locked: false, role: 'building', ...extra });
  it("round-trip, through a backup too; older shapes have none; [] is kept; malformed ones are dropped, a later version's kept", async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    const door = { id: 'd', kind: 'door', edge: 0, at: 0.5, width: 3 };
    state.shapes = sanitizeProjectData({ shapes: [
      house({ features: [door, { id: 'w', kind: 'window', edge: 2, at: 0.25, width: 4 }, { id: 'x', kind: 'chimney', edge: 0, at: 0.5 }, { id: 'y', kind: 'window', edge: -1, at: 0.5 }] }),
      house({ id: 'old' }),
      house({ id: 'none', features: [] }),
      { id: 'fence', type: 'line', x: 0, y: 20, rotation: 0, points: [[0, 0], [30, 0]], color: '#444', label: 'Fence', opacity: 1, locked: false, role: 'boundary', features: [{ id: 'g', kind: 'gate', edge: 0, at: 0.4, width: 4 }] },
    ] }).shapes;
    await flushSave();
    const loaded = (await readProject(id))!.shapes;
    expect(loaded).toEqual(state.shapes);
    // (The chimney is a kind a later version might add: kept as it came, so saving here doesn't take it away.)
    expect(loaded[0]).toMatchObject({ features: [door, { id: 'w', kind: 'window', edge: 2, at: 0.25, width: 4 }, { id: 'x', kind: 'chimney', edge: 0, at: 0.5 }] });
    expect('features' in loaded[1]).toBe(false);
    expect(loaded[2]).toMatchObject({ features: [] });
    expect(loaded[3]).toMatchObject({ features: [{ id: 'g', kind: 'gate', edge: 0, at: 0.4, width: 4 }] });
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
  it("keep which way a door or gate opens; older ones open as before (hinged where they start, swinging out)", async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [
      house({ features: [
        { id: 'd1', kind: 'door', edge: 0, at: 0.5, width: 3, hinge: 'end', swing: 'in' },
        { id: 'd2', kind: 'door', edge: 1, at: 0.5, width: 3 },
        { id: 'd3', kind: 'door', edge: 2, at: 0.5, width: 3, hinge: 'left', swing: 'sideways' },
        { id: 'w', kind: 'window', edge: 3, at: 0.5, width: 3, hinge: 'end', swing: 'in' },
      ] }),
    ] }).shapes;
    await flushSave();
    const loaded = (await readProject(id))!.shapes;
    expect(loaded).toEqual(state.shapes);
    const fs = (loaded[0] as unknown as { features: Record<string, unknown>[] }).features;
    expect(fs[0]).toMatchObject({ hinge: 'end', swing: 'in' });
    for (const f of fs.slice(1)) expect(['hinge', 'swing'].some((k) => k in f), String(f.id)).toBe(false);
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
});

describe('utilities: power lines, buried lines and septic fields', () => {
  const line = (extra: Record<string, unknown> = {}) => ({ id: 'w', type: 'line', x: 0, y: 0, rotation: 0, points: [[0, 0], [40, 0]], color: '#ea580c', label: 'Power line', opacity: 1, locked: false, role: 'utility', utility: 'overhead', ...extra });
  it("round-trip, through a backup too; a later version's kind is kept, a malformed one dropped; one made something else keeps its kind", async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [
      line(),
      line({ id: 'b', utility: 'buried', label: 'Gas line' }),
      { id: 's', type: 'rect', x: 0, y: 20, width: 20, height: 10, rotation: 0, color: '#78716c', label: 'Septic field', opacity: 0.2, locked: false, role: 'utility', utility: 'septic' },
      line({ id: 'x', utility: 'sewer-ish' }), // (a kind a later version might add)
      line({ id: 'y', utility: '<script>' }),
      line({ id: 'p', role: undefined }), // (made a plain line: still says which it was)
      { id: 'tree', type: 'circle', x: 5, y: 5, radius: 6, color: '#78350f', label: 'Oak', opacity: 0.5, locked: false, role: 'plant', utility: 'overhead', utilityDismissed: 'Grows to 60 ft, 5 ft from a power line' },
    ] }).shapes;
    await flushSave();
    const loaded = (await readProject(id))!.shapes;
    expect(loaded).toEqual(state.shapes);
    expect(loaded.map((s) => [s.id, s.role, s.utility])).toEqual([
      ['w', 'utility', 'overhead'], ['b', 'utility', 'buried'], ['s', 'utility', 'septic'], ['x', 'utility', 'sewer-ish'], ['y', 'utility', undefined], ['p', undefined, 'overhead'], ['tree', 'plant', undefined],
    ]);
    expect(loaded[6]).toMatchObject({ utilityDismissed: 'Grows to 60 ft, 5 ft from a power line' });
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
});

describe('garden structures: a trellis and an arbor', () => {
  it('round-trip, through a backup too, a vine climbing one included', async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [
      { id: 't', type: 'line', x: 0, y: 0, rotation: 0, points: [[0, 0], [6, 0]], color: '#8b5a2b', label: 'Trellis', opacity: 0.25, locked: false, role: 'structure', status: 'planned' },
      { id: 'a', type: 'rect', x: 10, y: 0, width: 8, height: 4, rotation: 15, color: '#8b5a2b', label: 'Arbor', opacity: 0.25, locked: false, role: 'structure', status: 'planned' },
      { id: 'v', type: 'circle', x: 12, y: 5, radius: 12.5, color: '#16a34a', label: 'Carolina jessamine', opacity: 0.65, locked: false, role: 'plant', plantId: 'gelsemium-sempervirens', climbsOn: 'a' },
    ] }).shapes;
    await flushSave();
    const loaded = (await readProject(id))!.shapes;
    expect(loaded).toEqual(state.shapes);
    expect(loaded.map((s) => [s.id, s.role])).toEqual([['t', 'structure'], ['a', 'structure'], ['v', 'plant']]);
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
});

describe('trees with a trunk and a shaped canopy', () => {
  const tree = (extra: Record<string, unknown> = {}) => ({ id: 't', type: 'circle', x: 5, y: 5, radius: 6, color: '#78350f', label: 'Tree', opacity: 0.5, locked: false, role: 'plant', sizeFrom: 'manual', ...extra });
  it('round-trip, and circles from older versions stay plain circles', async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [
      tree({ tree: true, trunk: 1.5, canopy: [[-4, -2], [4, -2], [4, 3], [-4, 3]] }),
      tree({ id: 'old' }),
    ] }).shapes;
    await flushSave();
    const loaded = (await readProject(id))!.shapes;
    expect(loaded).toEqual(state.shapes);
    expect(loaded[0]).toMatchObject({ tree: true, trunk: 1.5, canopy: [[-4, -2], [4, -2], [4, 3], [-4, 3]], radius: 6 });
    expect(['tree', 'trunk', 'canopy'].some((k) => k in loaded[1])).toBe(false);
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
  it('keep the plants a plant was left close to on purpose; older circles have none, and odd values are dropped', async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [
      tree({ id: 'a', crowdOk: ['b', 'c', 'b', 7, ''] }),
      tree({ id: 'b' }),
      tree({ id: 'c', crowdOk: 'b' }),
      tree({ id: 'd', crowdOk: [] }),
    ] }).shapes;
    expect(state.shapes[0]).toMatchObject({ crowdOk: ['b', 'c'] });
    for (const s of state.shapes.slice(1)) expect('crowdOk' in s).toBe(false);
    await flushSave();
    expect((await readProject(id))!.shapes).toEqual(state.shapes);
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
  it("keep what a vine climbs, or '' for none set by hand; older circles have neither (a groundcover), and odd values are dropped", async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [
      tree({ id: 'v', climbsOn: 'm' }),
      tree({ id: 'w', climbsOn: '' }),
      tree({ id: 'x' }),
      tree({ id: 'y', climbsOn: 7 }),
      tree({ id: 'z', climbsOn: 'q'.repeat(101) }),
    ] }).shapes;
    expect(state.shapes[0]).toMatchObject({ climbsOn: 'm' });
    expect(state.shapes[1]).toMatchObject({ climbsOn: '' });
    for (const s of state.shapes.slice(2)) expect('climbsOn' in s).toBe(false);
    await flushSave();
    expect((await readProject(id))!.shapes).toEqual(state.shapes);
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
  it('keep a flower color chosen among its sources\' (Jason, Oct 30); older circles have none, and odd values are dropped', async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [
      tree({ id: 'v', flowerColor: 'purple' }),
      tree({ id: 'x' }),
      tree({ id: 'y', flowerColor: 'Purple!' }),
      tree({ id: 'z', flowerColor: 3 }),
    ] }).shapes;
    expect(state.shapes[0]).toMatchObject({ flowerColor: 'purple' });
    for (const s of state.shapes.slice(1)) expect('flowerColor' in s).toBe(false);
    await flushSave();
    expect((await readProject(id))!.shapes).toEqual(state.shapes);
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
  it('keep what a shape was added as (Oct 30), and drop an odd one; older shapes have none', () => {
    const d = sanitizeProjectData({ shapes: [tree({ id: 'a', kind: 'path' }), tree({ id: 'b', kind: 'Path; drop' }), tree({ id: 'c' })] });
    expect(d.shapes[0]).toMatchObject({ kind: 'path' });
    expect('kind' in d.shapes[1]).toBe(false);
    expect('kind' in d.shapes[2]).toBe(false);
  });
  it('keep a hardiness warning dismissed (Oct 30), and drop an odd one', () => {
    const d = sanitizeProjectData({ shapes: [tree({ id: 'a', hardyDismissed: "Too cold for zone 8a: it's rated for zones 9–11" }), tree({ id: 'b', hardyDismissed: 7 })] });
    expect(d.shapes[0]).toMatchObject({ hardyDismissed: "Too cold for zone 8a: it's rated for zones 9–11" });
    expect('hardyDismissed' in d.shapes[1]).toBe(false);
  });
  it('keep warnings dismissed for a plant across the plan (Oct 30); a plan that never had any reads, and syncs, as before', async () => {
    const said = "Too cold for zone 8a: it's rated for zones 9–11";
    // (An older plan: none, and nothing new in what it syncs.)
    const old = sanitizeProjectData({ shapes: [tree({ id: 'a' })] });
    expect(old.dismissed).toBeUndefined();
    expect('dismissed' in syncedContent(old)).toBe(false);
    // Kinds known, plant ids and what was said; the rest dropped.
    expect(sanitizeDismissed({ hardy: { 'ficus-carica': said, 'bad id!': 'x', ok: 7 }, poison: { lantana: 'Poisonous to people' }, sun: { x: 'y' } }))
      .toEqual({ hardy: { 'ficus-carica': said }, poison: { lantana: 'Poisonous to people' } });
    expect([sanitizeDismissed('no'), sanitizeDismissed([1]), sanitizeDismissed({})]).toEqual([undefined, undefined, {}]);
    // (Once it's had any, kept and synced even empty: showing them all again reaches other devices.)
    expect(syncedContent(sanitizeProjectData({ shapes: [], dismissed: {} })).dismissed).toEqual({});
    // A copy's own poison dismissal is kept; an odd one dropped.
    const d = sanitizeProjectData({ shapes: [tree({ id: 'p', poisonDismissed: 'Poisonous to people' }), tree({ id: 'q', poisonDismissed: 3 })] });
    expect(d.shapes[0]).toMatchObject({ poisonDismissed: 'Poisonous to people' });
    expect('poisonDismissed' in d.shapes[1]).toBe(false);
    // Saved with the plan, and back when it's opened again.
    await freshStorage();
    const id = state.currentProjectId!;
    state.dismissed = { hardy: { 'ficus-carica': said } };
    save();
    await flushSave();
    expect((await readProject(id))?.dismissed).toEqual({ hardy: { 'ficus-carica': said } });
  });
  it('keep a color chosen by hand (a picture draws its leaves in it); older circles have none, and odd values are dropped', async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [
      tree({ id: 'v', colorSet: true }),
      tree({ id: 'x' }),
      tree({ id: 'y', colorSet: 'yes' }),
      tree({ id: 'z', colorSet: false }),
    ] }).shapes;
    expect(state.shapes[0]).toMatchObject({ colorSet: true });
    for (const s of state.shapes.slice(1)) expect('colorSet' in s).toBe(false);
    await flushSave();
    expect((await readProject(id))!.shapes).toEqual(state.shapes);
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
  it('keep a height and lowest branches set by hand; older circles have neither, and odd values are dropped', async () => {
    await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [
      tree({ tree: true, treeHeight: 85, lowestBranch: 0 }),
      tree({ id: 'old', tree: true }),
      tree({ id: 'odd', tree: true, treeHeight: -3, lowestBranch: 'high' }),
      tree({ id: 'big', tree: true, treeHeight: 5000, lowestBranch: 30 }),
    ] }).shapes;
    await flushSave();
    const loaded = (await readProject(id))!.shapes;
    expect(loaded).toEqual(state.shapes);
    expect(loaded[0]).toMatchObject({ treeHeight: 85, lowestBranch: 0 });
    for (const s of loaded.slice(1, 3)) expect(['treeHeight', 'lowestBranch'].some((k) => k in s)).toBe(false);
    expect(loaded[3]).toMatchObject({ lowestBranch: 30 });
    expect('treeHeight' in loaded[3]).toBe(false);
    const file = await buildBackupFile();
    expect(parseImportFile(file.text)[0].data.shapes).toEqual(state.shapes);
  });
});

describe('My plants with their own color', () => {
  it('keep a plain hex color across a restart, and drop anything else', async () => {
    const mp = await import('../src/my-plants'); // a namespace, so myPlants stays a live binding
    const { loadMyPlants, saveMyPlant, sanitizeMyPlant } = mp;
    const name = 'colors-' + ++dbCount;
    _resetStorageForTests();
    await initStorage(await openKV(name));
    loadMyPlants();
    await saveMyPlant({ id: 'u-red', common: 'Red one', width: { min: 2, max: 2, med: 2 }, color: '#DC2626' });
    _resetStorageForTests();
    await initStorage(await openKV(name));
    loadMyPlants();
    expect(mp.myPlants.find((p) => p.id === 'u-red')?.color).toBe('#dc2626');
    const base = { id: 'u-x', common: 'X', width: { min: 1, max: 1, med: 1 } };
    for (const bad of ['red', '#12', 'url(x)', '#1234567', 7]) expect(sanitizeMyPlant({ ...base, color: bad })).not.toHaveProperty('color');
  });
  it('a plant switched to the catalog\u2019s, or kept as mine, stays so across a restart; a library from before reads as before', async () => {
    const mp = await import('../src/my-plants');
    const { writeMyPlants } = await import('../src/storage');
    const name = 'switched-' + ++dbCount;
    _resetStorageForTests();
    await initStorage(await openKV(name));
    const width = { min: 6, max: 8, med: 7 };
    await writeMyPlants([
      { id: 'u-lime', common: "Hydrangea 'Limelight'", width, sameAs: 'hydrangea-paniculata-limelight', notes: 'co-op sale' },
      { id: 'u-mine', common: 'Our milkweed', width, notSame: 'asclepias-tuberosa' },
      { id: 'u-old', common: 'Before switching existed', width },
    ]);
    _resetStorageForTests();
    await initStorage(await openKV(name));
    mp.loadMyPlants();
    const got = (id: string) => mp.myPlants.find((p) => p.id === id);
    expect(got('u-lime')).toMatchObject({ sameAs: 'hydrangea-paniculata-limelight', notes: 'co-op sale' });
    expect(got('u-mine')).toMatchObject({ notSame: 'asclepias-tuberosa' });
    expect(got('u-old')).not.toHaveProperty('sameAs');
    expect(got('u-old')).not.toHaveProperty('notSame');
  });
  it('a plant linked to its species keeps the link across a restart; a library from before, and a bad link, read as before', async () => {
    const mp = await import('../src/my-plants');
    const { writeMyPlants } = await import('../src/storage');
    const name = 'species-' + ++dbCount;
    _resetStorageForTests();
    await initStorage(await openKV(name));
    const width = { min: 6, max: 8, med: 7 };
    await writeMyPlants([
      { id: 'u-lime', common: "Our 'Limelight'", width, species: 'hydrangea-paniculata', notSame: 'hydrangea-paniculata-limelight' },
      { id: 'u-old', common: 'Before species links', width },
      { id: 'u-bad', common: 'Bad link', width, species: '../etc' },
    ]);
    _resetStorageForTests();
    await initStorage(await openKV(name));
    mp.loadMyPlants();
    const got = (id: string) => mp.myPlants.find((p) => p.id === id);
    expect(got('u-lime')).toMatchObject({ species: 'hydrangea-paniculata', notSame: 'hydrangea-paniculata-limelight' });
    expect(got('u-old')).not.toHaveProperty('species');
    expect(got('u-bad')).not.toHaveProperty('species');
    expect(got('u-bad')?.common).toBe('Bad link'); // (the plant itself is kept)
  });
  it('saved as an understory or canopy tree by an older version, read as a tree, nothing else changed', async () => {
    const mp = await import('../src/my-plants');
    const { writeMyPlants } = await import('../src/storage');
    const name = 'old-trees-' + ++dbCount;
    _resetStorageForTests();
    await initStorage(await openKV(name));
    const width = { min: 25, max: 35, med: 30 };
    await writeMyPlants([
      { id: 'u-redbud', common: 'Our redbud', width, height: { min: 20, max: 30, med: 25 }, form: 'Tree (understory)', color: '#57534e' },
      { id: 'u-oak', common: 'Big oak', width, form: 'Tree (canopy)' },
      { id: 'u-odd', common: 'Odd one', width, form: 'Tree (somewhere)' },
    ]);
    _resetStorageForTests();
    await initStorage(await openKV(name));
    mp.loadMyPlants();
    const got = (id: string) => mp.myPlants.find((p) => p.id === id);
    expect(got('u-redbud')).toMatchObject({ form: 'Tree', color: '#57534e', height: { min: 20, max: 30, med: 25 } });
    expect(got('u-oak')?.form).toBe('Tree');
    expect(got('u-odd')).not.toHaveProperty('form'); // (an unknown form was always dropped)
  });
});

describe('synced background photos', () => {
  const FP = 'a'.repeat(64);
  const ref = { fingerprint: FP, naturalWidth: 40, naturalHeight: 30, ftPerPx: 0.25, cx: 1, cy: 2, rotation: 0, opacity: 0.6, visible: true };
  it('a photo’s fingerprint and keep-here switch are kept; a plan waiting for its photo keeps waiting across a restart', async () => {
    const { createProject, readProject, switchProject } = await import('../src/storage');
    const kv = await freshStorage();
    state.bgImage = { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true, fingerprint: FP, deviceOnly: true };
    save(); await flushSave();
    const id = state.currentProjectId!;
    const waiting = await createProject('Waiting', { ...sanitizeProjectData({}), photoElsewhere: ref });
    _resetStorageForTests(); await initStorage(kv);
    expect((await readProject(id))!.bgImage).toMatchObject({ fingerprint: FP, deviceOnly: true });
    expect((await readProject(waiting))!.photoElsewhere).toEqual(ref);
    await switchProject(waiting);
    expect(state.photoElsewhere).toEqual(ref);
  });

  it('anything malformed about them reads as nothing (older versions stored none of it)', async () => {
    const { readProject } = await import('../src/storage');
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    const stored = await kv.get<Record<string, unknown>>('projects', id);
    await kv.write([put('projects', id, { ...stored, photoElsewhere: { fingerprint: 'not-hex' } })]);
    expect((await readProject(id))!.photoElsewhere).toBeNull();
    await kv.write([put('projects', id, { ...stored, photoElsewhere: { deviceOnly: 'yes' } })]);
    expect((await readProject(id))!.photoElsewhere).toBeNull();
    expect(sanitizeProjectData({ bgImage: { dataUrl: IMG, fingerprint: 'x', deviceOnly: 1 } }).bgImage).not.toHaveProperty('fingerprint');
    expect(sanitizeProjectData({ bgImage: { dataUrl: IMG, deviceOnly: 1 } }).bgImage).not.toHaveProperty('deviceOnly');
    // A photo here wins over a stale "elsewhere".
    expect(sanitizeProjectData({ bgImage: { dataUrl: IMG }, photoElsewhere: ref }).photoElsewhere).toBeNull();
  });

  it('sync records keep which photo was synced; anything malformed is dropped', async () => {
    const { getSyncRecords, createProject } = await import('../src/storage');
    const kv = await freshStorage();
    const a = await createProject('A'), b = await createProject('B');
    await kv.write([put('kv', 'syncRecords', { [a]: { revision: 2, hash: 'h', photo: `${FP}@abc:1x` }, [b]: { revision: 1, hash: 'h', photo: '../../x' }, old: { revision: 1, hash: 'h' } })]);
    _resetStorageForTests(); await initStorage(kv);
    expect(getSyncRecords()).toEqual({ [a]: { revision: 2, hash: 'h', photo: `${FP}@abc:1x` }, [b]: { revision: 1, hash: 'h' }, old: { revision: 1, hash: 'h' } });
  });
});

describe('a plan’s garden location', () => {
  it('is kept; anything malformed reads as never set (older versions stored none)', async () => {
    const { readProject } = await import('../src/storage');
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    expect((await readProject(id))!.location).toBeUndefined();
    state.location = { zip: '71923', zone: '8a' }; save(); await flushSave();
    _resetStorageForTests(); await initStorage(kv);
    expect((await readProject(id))!.location).toEqual({ zip: '71923', zone: '8a' });
    const stored = await kv.get<Record<string, unknown>>('projects', id);
    await kv.write([put('projects', id, { ...stored, location: { zip: 'nope', zone: '8a' } })]);
    expect((await readProject(id))!.location).toBeUndefined();
    await kv.write([put('projects', id, { ...stored, location: null })]);
    expect((await readProject(id))!.location).toBeNull();
  });
});

describe('My plants sync state', () => {
  it('is kept with the library; a different account clears its records but keeps edit times; malformed parts are dropped', async () => {
    const { writeMyPlants, getPlantSync, resetSyncState } = await import('../src/storage');
    const kv = await freshStorage();
    expect(getPlantSync()).toEqual({ records: {}, edited: {} }); // as on devices from before plants synced
    await writeMyPlants([{ id: 'u-a', common: 'A' }], { records: { 'u-a': { revision: 2, hash: 'h' } }, edited: { 'u-a': 5 } });
    _resetStorageForTests(); await initStorage(kv);
    expect(getPlantSync()).toEqual({ records: { 'u-a': { revision: 2, hash: 'h' } }, edited: { 'u-a': 5 } });
    await resetSyncState('someone-else');
    _resetStorageForTests(); await initStorage(kv);
    expect(getPlantSync()).toEqual({ records: {}, edited: { 'u-a': 5 } });
    await kv.write([put('kv', 'myPlantSync', { records: { x: { revision: 'no' } }, edited: { y: -1, z: 'later', ok: 7 } })]);
    _resetStorageForTests(); await initStorage(kv);
    expect(getPlantSync()).toEqual({ records: {}, edited: { ok: 7 } });
  });
});

describe('sync state on the device', () => {
  it('keeps what was synced, and deletions still to send, across a restart; drops anything malformed', async () => {
    const { setSyncRecord, getSyncRecords, getSyncTombstones, deleteProject, createProject, installId } = await import('../src/storage');
    const kv = await freshStorage();
    const id = await createProject('Synced one');
    await setSyncRecord(id, { revision: 4, hash: 'abc' });
    const other = await createProject('Other');
    await setSyncRecord(other, { revision: 1, hash: 'x' });
    await setSyncRecord(other, null);
    expect(getSyncRecords()).toEqual({ [id]: { revision: 4, hash: 'abc' } });
    const install = await installId();
    expect(install).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    await deleteProject(id);
    expect(getSyncTombstones()).toEqual({ [id]: 4 }); // to move to the server's trash
    expect(getSyncRecords()).toEqual({});
    await kv.write([put('kv', 'syncRecords', { ok: { revision: 2, hash: 'h' }, bad: { revision: 'x' }, worse: null })]);
    _resetStorageForTests();
    await initStorage(kv);
    expect(getSyncRecords()).toEqual({ ok: { revision: 2, hash: 'h' } });
    expect(getSyncTombstones()).toEqual({ [id]: 4 });
    expect(await installId()).toBe(install); // the same install, after a restart
  });

  it('a project deleted while sync uploaded it gets a tombstone for the uploaded revision, not a record', async () => {
    const { setSyncRecord, getSyncRecords, getSyncTombstones } = await import('../src/storage');
    await freshStorage();
    await setSyncRecord('deleted-meanwhile', { revision: 3, hash: 'x' });
    expect(getSyncRecords()).toEqual({});
    expect(getSyncTombstones()).toEqual({ 'deleted-meanwhile': 3 });
  });

  it('remembers which account its sync state belongs to; anything malformed reads as none', async () => {
    const { resetSyncState, getSyncUser, setSyncRecord, createProject, getSyncRecords } = await import('../src/storage');
    const kv = await freshStorage();
    expect(getSyncUser()).toBeNull(); // before any sync (and on devices from before this existed)
    await setSyncRecord(await createProject('X'), { revision: 1, hash: 'h' });
    await resetSyncState('user-b');
    expect(getSyncRecords()).toEqual({});
    _resetStorageForTests(); await initStorage(kv);
    expect(getSyncUser()).toBe('user-b');
    await kv.write([put('kv', 'syncUser', { not: 'a string' })]);
    _resetStorageForTests(); await initStorage(kv);
    expect(getSyncUser()).toBeNull();
  });
});

describe('telling sync about edits', () => {
  it('only real edits and project changes count (a save with nothing new doesn’t start a sync)', async () => {
    const { setSyncHooks, createProject, renameProject } = await import('../src/storage');
    await freshStorage();
    let saves = 0, projects = 0;
    setSyncHooks(() => { saves++; }, () => { projects++; });
    await flushSave();
    expect(saves).toBe(0);
    state.shapes = []; save(); await flushSave();
    expect(saves).toBe(1);
    await flushSave(); await flushSave();
    expect(saves).toBe(1);
    const id = await createProject('Another');
    await renameProject(id, 'Renamed');
    expect(projects).toBe(2);
    setSyncHooks(() => {}, () => {});
  });
});

describe('a gone shape\'s date (goneOn)', () => {
  it('loads plans saved before it unchanged, keeps a valid date on a gone shape, and drops the rest', () => {
    const shape = (over: Record<string, unknown>) => ({ type: 'circle', x: 0, y: 0, radius: 1, label: 'Camellia', color: '#16a34a', ...over });
    const d = sanitizeProjectData({
      shapes: [
        shape({ id: 'old', status: 'gone' }), // (saved before the date existed)
        shape({ id: 'dated', status: 'gone', goneOn: '2026-10-23' }),
        shape({ id: 'bad', status: 'gone', goneOn: 'last week' }),
        shape({ id: 'back', status: 'planted', goneOn: '2026-10-01' }), // (not gone now: no gone date)
        shape({ id: 'cleared', status: 'gone', goneOn: '' }), // (cleared by hand: kept, so sync doesn't fill it back)
      ],
    });
    const byId = Object.fromEntries(d.shapes.map((s) => [s.id, s]));
    expect(byId.old).toMatchObject({ status: 'gone' });
    expect(byId.old).not.toHaveProperty('goneOn');
    expect(byId.dated).toMatchObject({ status: 'gone', goneOn: '2026-10-23' });
    expect(byId.bad).not.toHaveProperty('goneOn');
    expect(byId.back).not.toHaveProperty('goneOn');
    expect(byId.cleared).toMatchObject({ status: 'gone', goneOn: '' });
  });
});

// The guided introduction's record and "who's in your yard" (per device, beside the plans: src/intro.ts, src/yard.ts).
// Nothing to migrate (new keys); what another version left must never stop the plan from drawing.
describe('the guided introduction and the yard, as kept on this device', () => {
  const base = { zip: null, scale: null, rotation: 0, opacity: 1, visible: true, buildings: 0, beds: 1, sunAreas: 0, plants: 0, busy: false, panel: null, bgEditMode: false };
  it('reads a record back as written', () => {
    const r = { status: 'active', step: 'bed', done: ['zip', 'house'], skipped: ['photo'], base, who: { kids: true, dogs: false, cats: false, horses: false }, project: 'p1' };
    expect(parseIntroRecord(JSON.stringify(r))).toEqual(r);
  });
  it("a record this version can't read is a fresh one; a step it doesn't know is left part way", () => {
    for (const raw of [null, '', 'not json', '42', '{"status":"dancing"}']) expect(parseIntroRecord(raw)).toEqual(NEW_RECORD);
    const r = parseIntroRecord(JSON.stringify({ status: 'active', step: 'water', done: ['zip', 'water'], skipped: 7, base }));
    expect(r).toMatchObject({ status: 'exited', step: null, done: ['zip'], skipped: [] });
    expect(parseIntroRecord(JSON.stringify({ status: 'active', step: 'bed', done: [], base: { beds: 'one' } }))).toMatchObject({ status: 'exited', base: null });
  });
  it("the yard: a bad record reads as nobody", () => {
    localStorage.setItem('lp-yard', '{"kids":"yes","dogs":"wolves","horses":1}');
    expect(loadYard()).toEqual({ kids: true, dogs: '', cats: false, horses: true });
    localStorage.setItem('lp-yard', '[');
    expect(loadYard()).toEqual(NO_YARD);
    localStorage.removeItem('lp-yard');
  });
});

describe('a photo not to scale yet (Oct 30)', () => {
  it('keeps saying so, through a save and a sync, until calibrated; older photos are taken as calibrated', () => {
    const raw = { dataUrl: 'data:image/png;base64,AAAA', naturalWidth: 10, naturalHeight: 20, ftPerPx: 0.1, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true };
    expect(migrateBgImage({ ...raw, uncalibrated: true })).toMatchObject({ uncalibrated: true });
    expect('uncalibrated' in migrateBgImage(raw)).toBe(false);
    expect('uncalibrated' in migrateBgImage({ ...raw, uncalibrated: 'yes' as unknown as true })).toBe(false);
    const fp = 'a'.repeat(64);
    const ref = photoRefOf({ ...raw, uncalibrated: true }, fp);
    expect(ref).toMatchObject({ fingerprint: fp, uncalibrated: true });
    expect(sanitizePhotoRef(ref)).toMatchObject({ uncalibrated: true });
    expect('uncalibrated' in (sanitizePhotoRef(photoRefOf(raw, fp)) as object)).toBe(false);
  });
});
