// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openKV, put } from '../src/db';
import { state } from '../src/state';
import {
  _resetStorageForTests, createProject, deleteProject, flushSave, getClipboard, initStorage,
  readProject, sanitizeProjectData, save, switchProject, writeJournalIfDirty,
} from '../src/storage';
import { buildBackupFile, importProjects, parseImportFile, uniqueName } from '../src/backup';

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
