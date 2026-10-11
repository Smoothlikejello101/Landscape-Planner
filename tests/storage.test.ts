// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openKV } from '../src/db';
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
    expect(() => parseImportFile('{"hello":1}')).toThrow(/isn't a Landscape Planner/);
    expect(() => parseImportFile(JSON.stringify({ format: 'landscape-planner-project', version: 99, project: {} }))).toThrow(/newer version/);
  });

  it('picks non-colliding names', () => {
    expect(uniqueName('A', [])).toBe('A');
    expect(uniqueName('A', ['A', 'A (2)'])).toBe('A (3)');
  });
});
