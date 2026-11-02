// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, DB_VERSION, MemoryKV, NewerVersionError, openKV, put, setOpenBlockedListener } from '../src/db';
import { state } from '../src/state';
import {
  _resetStorageForTests, clearedNow, createProject, deleteProject, emptyProjectData, flushSave, getClipboard, initStorage, keepCleared, loadCleared,
  readProject, sanitizeBought, sanitizeHousehold, sanitizeProjectData, sanitizeSwitches, save, saveView, setHouseholdListener, switchProject, writeJournalIfDirty,
  migrateBgImage, photoRefOf, sanitizePhotoRef, sanitizeDismissed, syncedContent } from '../src/storage';
import {
  currentProjectData, getSyncDeletedRecord, getSyncRecords, getSyncTombstones, getSyncUser, projectNow, setNewerVersionListener, storageIsDurable,
  supersededByNewer } from '../src/storage';
import { renameProject } from '../src/storage';
import { buildRawCopyFile, RAW_COPY_FORMAT } from '../src/backup';
import type { Shape } from '../src/types';
import { allExportedProjects, buildBackupFile, importProjects, importSaid, parseImportFile, planContent, sameName, uniqueName } from '../src/backup';
import { sanitizeMyPlant } from '../src/my-plants';
import type { ProjectData } from '../src/types';
import { buildSupportFile } from '../src/support';
import { ERROR_LOG_KEY, readErrors, recordError } from '../src/error-log';
import { NEW_RECORD, parseIntroRecord } from '../src/intro';
import { NO_YARD, applyYard, household, householdCopy, loadYard, saveYard } from '../src/yard';
import { PLANT_FILTER_DEFAULTS, plantFilter } from '../src/plants';
import {
  allSwitchesOn, loadViewSettings, planSwitches, setCrowdWarnings, setFruitWarnings, setHardyWarnings, setPoisonWarnings, setShowCrowding, setShowFullSize,
  setZoomButtons, switchesCopy,
} from '../src/view-settings';

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

  it('picks up edits an older version made after the migration: beside a plan with parts the older copy lacks, else in its place', async () => {
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
    // (The plan here took this device's yard and warning switches at the first start, which the older copy can't have:
    // put over it, the copy would take them away. Kept beside it: the review, Nov 1.)
    expect(state.shapes.map((s) => s.label)).toEqual(['before']);
    expect(state.projects.map((p) => p.name).sort()).toEqual(['Made in old app', 'Yard', 'Yard (from older version)']);
    const copy = state.projects.find((p) => p.name === 'Yard (from older version)')!;
    expect((await readProject(copy.id))!.shapes.map((s) => s.label)).toEqual(['before', 'after']);
    expect(await kv.get('projects', 'p1')).toMatchObject({ household: expect.any(Object), switches: expect.any(Object) });
    // A plan here with nothing the older copy lacks (as one stored before plans kept the yard): put in its place.
    const p1 = (await kv.get<Record<string, unknown>>('projects', 'p1'))!;
    const { household: _h, switches: _s, ...without } = p1;
    await kv.write([put('projects', 'p1', without)]);
    const later2 = later + 60_000;
    localStorage.setItem('lp-projects', JSON.stringify([{ id: 'p1', name: 'Yard', lastModified: later2 }]));
    localStorage.setItem('lp-project-p1', JSON.stringify({ shapes: [circle('before'), circle('after'), circle('again')] }));
    _resetStorageForTests();
    await initStorage(kv);
    expect(state.shapes.map((s) => s.label)).toEqual(['before', 'after', 'again']);
    expect(state.projects).toHaveLength(3);
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

describe("a plant of my own's flower colors, chosen as chips (Jason, Oct 30)", () => {
  const base = { id: 'u-abc', common: "Strawberry 'Albion'", width: { min: 1, max: 2, med: 1.5 } };
  it('keeps them with or without bloom months, in the order chosen, each once; only colors the chips offer', () => {
    expect(sanitizeMyPlant({ ...base, flower_color: ['pink', 'white'] })).toMatchObject({ flower_color: ['pink', 'white'] });
    expect(sanitizeMyPlant({ ...base, flower_color: ['pink', 'white'] })).not.toHaveProperty('bloom'); // (no months: kept all the same)
    expect(sanitizeMyPlant({ ...base, flower_color: ['white', 'white', 'chartreuse', 3, 'blue'] })?.flower_color).toEqual(['white', 'blue']);
    expect(sanitizeMyPlant({ ...base, flower_color: ['insignificant'] })).not.toHaveProperty('flower_color');
    expect(sanitizeMyPlant({ ...base, flower_color: 'pink' })).not.toHaveProperty('flower_color');
  });
  it("an older plant, from before the chips: read as it was stored, its words left as they were (read for its color when drawn)", () => {
    const old = { ...base, bloom: { start: 3, end: 4, color: 'White aging to pink' } };
    const p = sanitizeMyPlant(old)!;
    expect(p).not.toHaveProperty('flower_color'); // (nothing added on reading: a synced plant reads the same on every version)
    expect(p.bloom).toEqual({ start: 3, end: 4, color: 'White aging to pink' });
    // (And one saved by a later version, read here again, keeps both.)
    expect(sanitizeMyPlant({ ...old, flower_color: ['white', 'pink'] })).toMatchObject({ flower_color: ['white', 'pink'], bloom: { color: 'White aging to pink' } });
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

describe('last modified', () => {
  it('is a change to the plan, not the app opening it again after an update, nor a zoom, pan or Fit (the UI review, 2026-11-01)', async () => {
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = sanitizeProjectData({ shapes: [circle('oak')] }).shapes; save(); await flushSave();
    const edited = state.projects[0].lastModified;
    const stored = async () => (await kv.get<{ lastModified: number }>('meta', id))!.lastModified;
    // The app updates: it opens again on the same storage, a minute later.
    laterBy(60_000);
    _resetStorageForTests();
    await initStorage(kv);
    await flushSave();
    expect(await stored()).toBe(edited);
    // Fit, a zoom, a pan: saved, so the plan opens where it was left, but nothing in it changed.
    laterBy(60_000);
    state.zoom = 2.5; state.offsetX = 7; saveView(); await flushSave();
    expect((await readProject(id))!.zoom).toBe(2.5);
    expect(state.projects[0].lastModified).toBe(edited);
    expect(await stored()).toBe(edited);
    // An edit is a change.
    laterBy(60_000);
    state.shapes = sanitizeProjectData({ shapes: [circle('oak'), circle('ash')] }).shapes; save(); await flushSave();
    expect(await stored()).toBeGreaterThanOrEqual(edited + 180_000);
    expect(state.projects[0].lastModified).toBe(await stored());
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

  it('keeps no journal for a new view alone: replayed, it would make the plan "last modified" (the UI review, 2026-11-01)', async () => {
    await freshStorage();
    state.zoom = 3; saveView();
    writeJournalIfDirty();
    expect(journals()).toBe('');
    state.shapes = sanitizeProjectData({ shapes: [circle('new')] }).shapes; save();
    writeJournalIfDirty();
    expect(journals()).toContain('"new"');
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
    const { ids } = await importProjects(parseImportFile(text));
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
    const { ids } = await importProjects(parseImportFile(text));
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

  // Jason, Nov 1, from the list bug hunt (B2, B5): a full backup brought back while its plans are still here made a copy
  // of each, and every plan read "last modified" at the moment of the import.
  const OCT20 = new Date(2026, 9, 20, 9).getTime(), OCT25 = new Date(2026, 9, 25, 9).getTime(), NOV1 = new Date(2026, 10, 1, 18).getTime();
  const at = (t: number) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(t); };
  it('a full backup where its plans still are: one just like a plan here is skipped, one deleted comes back, one that differs comes in as a copy; each keeps when it last changed', async () => {
    at(OCT20);
    await freshStorage();
    state.shapes = sanitizeProjectData({ shapes: [circle('oak')] }).shapes;
    state.bgImage = { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 30, opacity: 0.6, visible: true };
    state.bought = { 'ilex-vomitoria': { n: 2, at: OCT20 } };
    save();
    await flushSave();
    at(OCT25);
    const side = await createProject('Side yard', sanitizeProjectData({ shapes: [circle('fern')], zoom: 2, bgImage: { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 0, opacity: 0.5, visible: true } }));
    const cabin = await createProject('Cabin', sanitizeProjectData({ shapes: [circle('pine'), circle('birch')] }));
    const { text } = await buildBackupFile();
    at(NOV1);
    // Since the backup: the open plan zoomed and panned (not a change to it), and Cabin deleted.
    state.zoom = 3; state.offsetX = 40; state.offsetY = -7;
    await deleteProject(cabin);
    // The file's Side yard zoomed and its photo's storage id other: still the same plan. Its My Garden's oak moved: not.
    const file = JSON.parse(text);
    const fileSide = file.projects.find((p: { name: string }) => p.name === 'Side yard');
    Object.assign(fileSide.data, { zoom: 0.5, offsetX: 99 });
    fileSide.data.bgImage.imageId = 'elsewhere';
    const fileGarden = file.projects.find((p: { name: string }) => p.name === 'My Garden');
    fileGarden.data.shapes[0].x += 5;
    const { ids, skipped } = await importProjects(parseImportFile(JSON.stringify(file)));
    expect(skipped).toBe(1);
    expect(ids.map((id) => state.projects.find((p) => p.id === id)!.name).sort()).toEqual(['Cabin', 'My Garden (2)']);
    expect(state.projects.map((p) => p.name).sort()).toEqual(['Cabin', 'My Garden', 'My Garden (2)', 'Side yard']);
    expect(state.projects.find((p) => p.id === side)).toBeTruthy();
    // When each last changed, from the file: not the import's time.
    const meta = (name: string) => state.projects.find((p) => p.name === name)!;
    expect(meta('Cabin').lastModified).toBe(OCT25);
    expect(meta('My Garden (2)').lastModified).toBe(OCT20);
    expect((await readProject(meta('Cabin').id))!.shapes.map((x) => x.label)).toEqual(['pine', 'birch']);
    // Brought back again: all here now, nothing new.
    expect(await importProjects(parseImportFile(JSON.stringify(file)))).toEqual({ ids: [], skipped: 3 });
  });

  it('the same plan is its name, give or take a "(2)", and its content as a file has it: not how it is viewed on a device', () => {
    const bg = { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 30, opacity: 0.6, visible: true };
    const base = sanitizeProjectData({ shapes: [circle('oak'), circle('ash')], bgImage: bg, bought: { 'ilex-vomitoria': { n: 2, at: 5 } }, phases: ['Fall'] });
    const same = planContent(base);
    const with_ = (patch: Partial<ProjectData>) => planContent({ ...base, ...patch });
    const shapes = (...labels: string[]) => sanitizeProjectData({ shapes: labels.map(circle) }).shapes;
    // How it's viewed, and where its photo is kept: the same.
    expect(with_({ zoom: 4, offsetX: 1, offsetY: 2, viewFilter: { status: 'planned', phase: '', showGone: false }, photoElsewhere: null })).toBe(same);
    expect(with_({ bgImage: { ...bg, imageId: 'abc', fingerprint: 'f00', deviceOnly: true } })).toBe(same);
    // (Its keys in another order, as another version might write them: the same.)
    expect(planContent(sanitizeProjectData(JSON.parse(JSON.stringify({ phases: ['Fall'], bought: { 'ilex-vomitoria': { at: 5, n: 2 } }, bgImage: bg, shapes: [circle('oak'), circle('ash')] }))))).toBe(same);
    // Its name, or a copy's: one name. Another name: another plan.
    expect([sameName('Back yard', ' Back yard '), sameName('Back yard', 'Back yard (2)'), sameName('Back yard (3)', 'Back yard')]).toEqual([true, true, true]);
    expect([sameName('Back yard', 'Front yard'), sameName('Back yard', 'Back yard 2'), sameName('Back yard', 'back yard')]).toEqual([false, false, false]);
    // Anything else: another plan.
    expect(with_({ shapes: shapes('oak') })).not.toBe(same);
    expect(with_({ shapes: shapes('ash', 'oak') })).not.toBe(same); // (drawn in another order)
    expect(with_({ bought: { 'ilex-vomitoria': { n: 1, at: 5 } } })).not.toBe(same);
    expect(with_({ bgImage: { ...bg, opacity: 0.7 } })).not.toBe(same);
    expect(with_({ bgImage: { ...bg, dataUrl: IMG + 'B' } })).not.toBe(same);
    expect(with_({ bgImage: null })).not.toBe(same);
    expect(with_({ phases: [] })).not.toBe(same);
    expect(with_({ location: { zip: '71923', zone: '8a' } })).not.toBe(same);
    expect(with_({ household: { kids: true, dogs: '', cats: false, horses: false, answered: true, at: 3 } })).not.toBe(same);
  });

  it('a file\'s "last modified": kept; none, or one from before FullGrown made plans, is the import\'s time; one ahead of the clock is now', () => {
    at(NOV1);
    const file = (lastModified: unknown) => JSON.stringify({ format: 'landscape-planner-project', version: 1, project: { name: 'P', lastModified, data: { shapes: [] } } });
    expect(parseImportFile(file(OCT20))[0].lastModified).toBe(OCT20);
    for (const v of [undefined, 1, 0, -5, 'yesterday', Number.NaN]) expect(parseImportFile(file(v))[0].lastModified).toBe(NOV1);
    expect(parseImportFile(file(NOV1 + 86_400_000))[0].lastModified).toBe(NOV1);
  });

  it('says what came in, and what was here already', () => {
    expect(importSaid(1, 0, 0)).toBe('Imported 1 project');
    expect(importSaid(3, 0, 2)).toBe('Imported 3 projects and 2 of your plants');
    expect(importSaid(1, 2, 0)).toBe('Imported 1 project; 2 already here, skipped');
    expect(importSaid(0, 1, 0)).toBe('That project is already here, so none were imported');
    expect(importSaid(0, 3, 1)).toBe('All 3 projects are already here, so none were imported; added 1 of your plants');
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
    await kv.write([put('kv', 'syncRecords', { ok: { revision: 2, hash: 'h' }, bad: { revision: 'x' }, worse: null, core: { revision: 3, hash: 'a1:b', core: 'c2:d' }, oddCore: { revision: 3, hash: 'h', core: 'not one!' } })]);
    _resetStorageForTests();
    await initStorage(kv);
    // (The plan's fingerprint without its ticks and yard is kept with the rest: src/sync/engine.ts coreHash.)
    expect(getSyncRecords()).toEqual({ ok: { revision: 2, hash: 'h' }, core: { revision: 3, hash: 'a1:b', core: 'c2:d' }, oddCore: { revision: 3, hash: 'h' } });
    expect(getSyncTombstones()).toEqual({ [id]: 4 });
    expect(await installId()).toBe(install); // the same install, after a restart
  });

  it("keeps a record's parts (the ticks, yard and switches the server had) and a deleted plan's record, checked; clears them with its tombstone", async () => {
    const { setSyncRecord, getSyncRecords, getSyncTombstones, getSyncDeletedRecord, deleteProject, createProject, clearSyncTombstone, resetSyncState } = await import('../src/storage');
    const kv = await freshStorage();
    const parts = { household: { ...NO_YARD, dogs: 'hideToxic', answered: true, at: 5 }, switches: { poisonWarnings: { on: false } }, bought: { yaupon: { n: 2, at: 9 } } };
    const id = await createProject('Synced one'), gone = await createProject('Gone');
    await setSyncRecord(id, { revision: 4, hash: 'a1:b', core: 'c2:d', parts });
    await setSyncRecord(gone, { revision: 2, hash: 'e3:f', core: 'g4:h', parts });
    await deleteProject(gone);
    expect(getSyncDeletedRecord(gone)).toEqual({ revision: 2, hash: 'e3:f', core: 'g4:h', parts });
    // Odd parts are dropped, as a plan's are; a deleted plan's record goes once its tombstone does (an older version cleared it).
    await kv.write([put('kv', 'syncRecords', { [id]: { revision: 4, hash: 'a1:b', parts: { ...parts, household: 'kids', switches: { odd: 1 } } }, none: { revision: 1, hash: 'x', parts: 'no' } }),
      put('kv', 'syncDeleted', { [gone]: { revision: 2, hash: 'e3:f', parts }, stale: { revision: 1, hash: 'y' } })]);
    _resetStorageForTests();
    await initStorage(kv);
    expect(getSyncRecords()).toEqual({ [id]: { revision: 4, hash: 'a1:b', parts: { bought: parts.bought, switches: {} } }, none: { revision: 1, hash: 'x' } });
    expect([getSyncDeletedRecord(gone), getSyncDeletedRecord('stale')]).toEqual([{ revision: 2, hash: 'e3:f', parts }, undefined]);
    // (An older version cleared that tombstone and deleted the plan again, later: the first deletion's record isn't this one's.)
    await kv.write([put('kv', 'syncTombstones', { [gone]: 6 })]);
    _resetStorageForTests();
    await initStorage(kv);
    expect([getSyncTombstones(), getSyncDeletedRecord(gone)]).toEqual([{ [gone]: 6 }, undefined]);
    await kv.write([put('kv', 'syncTombstones', { [gone]: 2 }), put('kv', 'syncDeleted', { [gone]: { revision: 2, hash: 'e3:f', parts } })]);
    _resetStorageForTests();
    await initStorage(kv);
    await clearSyncTombstone(gone);
    expect([getSyncTombstones(), getSyncDeletedRecord(gone), await kv.get('kv', 'syncDeleted')]).toEqual([{}, undefined, {}]);
    await setSyncRecord('deleted-meanwhile', { revision: 3, hash: 'x' }); // (deleted while uploading: its record too)
    expect(getSyncDeletedRecord('deleted-meanwhile')).toEqual({ revision: 3, hash: 'x' });
    await resetSyncState('someone-else');
    expect([getSyncDeletedRecord('deleted-meanwhile'), await kv.get('kv', 'syncDeleted')]).toEqual([undefined, {}]);
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

/** Storage as the version before the Plant list's ticks and the plan's own household left it: these plans, saved then. */
async function storageFromBefore(plans: { id: string; name: string; data: Record<string, unknown> }[]) {
  _resetStorageForTests();
  const kv = await openKV('test-' + ++dbCount);
  await kv.write(plans.flatMap((p, i) => [
    put('meta', p.id, { id: p.id, name: p.name, lastModified: 1000 + i, shapeCount: 1 }),
    put('projects', p.id, { zoom: 1, offsetX: 0, offsetY: 0, roleViews: {}, sizeMode: 'typical', sunWarnings: true, phases: [], bgImage: null, photoElsewhere: null, ...p.data }),
  ]));
  await initStorage(kv);
  return kv;
}
const stored = async (kv: Awaited<ReturnType<typeof openKV>>, id: string) => (await kv.get<Record<string, unknown>>('projects', id))!;
const lastChanged = async (kv: Awaited<ReturnType<typeof openKV>>, id: string) => (await kv.get<{ lastModified: number }>('meta', id))!.lastModified;

// The Plant list's ticks (Jason, Nov 1: kept with the plan, so plants bought online at the computer, the rest at the
// nursery, and a partner's phone all tick one list): by kind, how many are bought and when that changed.
describe("the Plant list's ticks, kept with the plan (Jason, Nov 1)", () => {
  it('a plan from before has none: it opens with nothing ticked, and saves and syncs as before', async () => {
    const kv = await storageFromBefore([{ id: 'p1', name: 'Back Yard', data: { shapes: [circle('oak')] } }]);
    expect(state.bought).toBeUndefined();
    expect((await readProject('p1'))!.bought).toBeUndefined();
    expect('bought' in syncedContent((await readProject('p1'))!)).toBe(false);
    saveView(); await flushSave(); // (written again, as the app does when it's looked at)
    expect('bought' in (await stored(kv, 'p1'))).toBe(false);
    expect(await lastChanged(kv, 'p1')).toBe(1000);
  });
  it('keep kinds by id, a whole number bought and when; drop the rest', () => {
    expect(sanitizeBought({
      'ilex-vomitoria-2': { n: 3, at: 5 }, 'u-abc12345': { n: 2.7, at: 6 }, gone: { n: -4, at: 7 }, lots: { n: 1e9, at: 8 },
      'bad id!': { n: 1, at: 1 }, words: { n: 'two', at: 1 }, when: { n: 1 }, before: { n: 1, at: -1 }, odd: 7,
    })).toEqual({ 'ilex-vomitoria-2': { n: 3, at: 5 }, 'u-abc12345': { n: 2, at: 6 }, gone: { n: 0, at: 7 }, lots: { n: 9999, at: 8 } });
    expect([sanitizeBought('no'), sanitizeBought([1]), sanitizeBought(null), sanitizeBought({})]).toEqual([undefined, undefined, undefined, {}]);
    // (Ever more than 2,000 kinds: the latest changes kept.)
    const many = Object.fromEntries(Array.from({ length: 2005 }, (_, i) => [`k${i}`, { n: 1, at: i }]));
    const kept = sanitizeBought(many)!;
    expect(Object.keys(kept)).toHaveLength(2000);
    expect(kept.k0).toBeUndefined();
    expect(kept.k2004).toEqual({ n: 1, at: 2004 });
  });
  it('are saved with the plan, unticked ones too, each plan its own, and back when it opens again', async () => {
    const kv = await freshStorage();
    const a = state.currentProjectId!;
    state.bought = { 'ilex-vomitoria': { n: 2, at: 10 }, 'salvia-greggii': { n: 0, at: 11 } };
    save(); await flushSave();
    expect((await stored(kv, a)).bought).toEqual(state.bought);
    const b = await createProject('Front');
    await switchProject(b);
    expect(state.bought).toBeUndefined();
    await switchProject(a);
    expect(state.bought).toEqual({ 'ilex-vomitoria': { n: 2, at: 10 }, 'salvia-greggii': { n: 0, at: 11 } });
    _resetStorageForTests();
    await initStorage(kv);
    expect(state.bought).toEqual({ 'ilex-vomitoria': { n: 2, at: 10 }, 'salvia-greggii': { n: 0, at: 11 } });
    // (Kept, and synced, even with every kind unticked: so unticking reaches the other devices.)
    expect(syncedContent(sanitizeProjectData({ shapes: [], bought: {} })).bought).toEqual({});
  });
  it('go with the plan in backups and plan files; a backup from before restores with nothing ticked', async () => {
    await freshStorage();
    state.shapes = sanitizeProjectData({ shapes: [circle('one')] }).shapes;
    state.bought = { 'ilex-vomitoria': { n: 2, at: 10 } };
    const { text } = await buildBackupFile();
    expect(JSON.parse(text).projects[0].data.bought).toEqual({ 'ilex-vomitoria': { n: 2, at: 10 } });
    await freshStorage();
    const { ids: [id] } = await importProjects(parseImportFile(text));
    expect((await readProject(id))!.bought).toEqual({ 'ilex-vomitoria': { n: 2, at: 10 } });
    // A backup made by the version before: the same file, with no ticks in it.
    const old = JSON.parse(text);
    delete old.projects[0].data.bought;
    const { ids: [oldId] } = await importProjects(parseImportFile(JSON.stringify(old)));
    const restored = (await readProject(oldId))!;
    expect(restored.bought).toBeUndefined();
    expect(restored.shapes.map((x) => x.label)).toEqual(['one']);
  });
});

// Who's in the yard, kept with the plan (Jason, Nov 1: it's the yard's, not the device's), with whether "Anyone you need
// to protect?" was answered for it. Before, it was kept per device ('lp-yard'): a plan from before takes that.
describe("who's in the yard, kept with the plan (Jason, Nov 1)", () => {
  const dogsAndKids = { kids: true, dogs: 'hideToxic' as const, cats: false, horses: false };
  afterEach(() => { setHouseholdListener(() => {}); Object.assign(plantFilter, PLANT_FILTER_DEFAULTS); });
  it("a plan from before takes this device's, never set in the plan: the update changes nobody's setting, nor when the plan last changed", async () => {
    localStorage.setItem('lp-yard', JSON.stringify(dogsAndKids));
    const kv = await storageFromBefore([
      { id: 'p1', name: 'Back Yard', data: { shapes: [circle('oak')] } },
      { id: 'p2', name: 'Front', data: { shapes: [circle('ash')] } },
    ]);
    expect(state.currentProjectId).toBe('p2'); // (the one changed last)
    expect(household()).toEqual({ ...dogsAndKids, answered: true }); // (no time: never set in the plan)
    expect((await readProject('p1'))!.household).toEqual({ ...dogsAndKids, answered: true });
    expect(syncedContent((await readProject('p1'))!).household).toEqual({ ...dogsAndKids, answered: true });
    saveView(); await flushSave();
    expect((await stored(kv, 'p2')).household).toEqual({ ...dogsAndKids, answered: true }); // (written with the next save)
    expect([await lastChanged(kv, 'p1'), await lastChanged(kv, 'p2')]).toEqual([1000, 1001]);
    // 'lp-yard' is left as it was, for an older version of the app; nothing writes it now.
    saveYard({ ...NO_YARD, cats: true });
    expect(loadYard()).toEqual(dogsAndKids);
  });
  it("a plan from before on a device that answered with no one, or dismissed the question: answered, or still to ask (the × is the device's)", async () => {
    localStorage.setItem('lp-protect-line', 'answered');
    await storageFromBefore([{ id: 'p1', name: 'Back Yard', data: { shapes: [] } }]);
    expect(household()).toEqual({ ...NO_YARD, answered: true });
    localStorage.setItem('lp-protect-line', 'dismissed');
    await storageFromBefore([{ id: 'p1', name: 'Back Yard', data: { shapes: [] } }]);
    expect(household()).toEqual({ ...NO_YARD, answered: false });
  });
  it("each plan its own: opening another switches who's in the yard, and the picker's filters follow; kept across a restart", async () => {
    localStorage.setItem('lp-yard', JSON.stringify({ ...NO_YARD, dogs: 'nonToxic' }));
    const kv = await storageFromBefore([
      { id: 'p1', name: 'Back Yard', data: { shapes: [] } },
      { id: 'p2', name: 'Front', data: { shapes: [] } },
    ]);
    setHouseholdListener(() => applyYard(plantFilter, household()));
    await switchProject('p1');
    saveYard({ ...NO_YARD, kids: true });
    expect(household()).toEqual({ ...NO_YARD, kids: true, answered: true, at: expect.any(Number) });
    await switchProject('p2');
    expect(household()).toEqual({ ...NO_YARD, dogs: 'nonToxic', answered: true });
    expect([plantFilter.noPoison, plantFilter.dogs]).toEqual([false, 'nonToxic']);
    await switchProject('p1');
    expect([plantFilter.noPoison, plantFilter.dogs]).toEqual([true, '']);
    _resetStorageForTests();
    await initStorage(kv);
    expect(state.currentProjectId).toBe('p1');
    expect(household()).toMatchObject({ ...NO_YARD, kids: true, answered: true });
    expect((await readProject('p2'))!.household).toEqual({ ...NO_YARD, dogs: 'nonToxic', answered: true });
  });
  it('a new plan has no one in its yard and asks; one of the same garden copies it, answered or not', async () => {
    await freshStorage();
    expect(household()).toEqual({ ...NO_YARD, answered: false, at: expect.any(Number) }); // (a new device's first plan)
    expect(emptyProjectData().household).toEqual({ ...NO_YARD, answered: false, at: expect.any(Number) });
    saveYard({ ...NO_YARD, horses: true });
    const same = await createProject('Same garden', { ...emptyProjectData(), household: householdCopy() });
    const other = await createProject('Somewhere else');
    expect((await readProject(same))!.household).toEqual({ ...NO_YARD, horses: true, answered: true, at: expect.any(Number) });
    expect((await readProject(other))!.household).toEqual({ ...NO_YARD, answered: false, at: expect.any(Number) });
    // (Answered with no one: the copy is answered too, so it doesn't ask.)
    state.household = { ...NO_YARD, answered: true, at: 5 };
    const answered = await createProject('Same, no one', { ...emptyProjectData(), household: householdCopy() });
    expect((await readProject(answered))!.household).toMatchObject({ ...NO_YARD, answered: true });
  });
  it("goes with the plan in backups and plan files; a file from before restores with this device's; odd values read as no one", async () => {
    await freshStorage();
    saveYard(dogsAndKids);
    const { text } = await buildBackupFile();
    localStorage.setItem('lp-yard', JSON.stringify({ ...NO_YARD, cats: true })); // (the device it's restored on)
    await freshStorage();
    const { ids: [id] } = await importProjects(parseImportFile(text));
    expect((await readProject(id))!.household).toEqual({ ...dogsAndKids, answered: true, at: expect.any(Number) });
    const old = JSON.parse(text);
    delete old.projects[0].data.household;
    const { ids: [oldId] } = await importProjects(parseImportFile(JSON.stringify(old)));
    expect((await readProject(oldId))!.household).toEqual({ ...NO_YARD, cats: true, answered: true });
    expect(sanitizeHousehold({ kids: 'yes', dogs: 'wolves', cats: true, horses: 1, answered: 'no', at: -3 })).toEqual({ ...NO_YARD, cats: true, answered: false });
    expect([sanitizeHousehold('kids'), sanitizeHousehold([true])]).toEqual([undefined, undefined]);
  });
});

// The update takes each plan's yard and warning switches from this device once, as they were then: a plan opened later
// takes the same, whatever was done on the device meanwhile.
describe('plans on the device at the update take its yard and warnings then, once', () => {
  it("each plan takes them at the first start, not when it's next opened; nothing else changes, nor when it last changed", async () => {
    localStorage.setItem('lp-protect-line', 'answered'); // (answered with no one: nothing in 'lp-yard')
    localStorage.setItem('lp-warn-fruit', 'off');
    const kv = await storageFromBefore([
      { id: 'p1', name: 'Back Yard', data: { shapes: [circle('oak')], dismissed: { hardy: { x: 'y' } } } },
      { id: 'p2', name: 'Front', data: { shapes: [] } },
    ]);
    const taken = { household: { ...NO_YARD, answered: true }, switches: { showCrowding: { on: true }, crowdWarnings: { on: true }, hardyWarnings: { on: true }, poisonWarnings: { on: true }, fruitWarnings: { on: false } } };
    for (const id of ['p1', 'p2']) expect(await stored(kv, id)).toMatchObject(taken);
    expect(await stored(kv, 'p1')).toMatchObject({ shapes: [circle('oak')], dismissed: { hardy: { x: 'y' } } });
    expect('bought' in (await stored(kv, 'p1'))).toBe(false);
    expect([await lastChanged(kv, 'p1'), await lastChanged(kv, 'p2')]).toEqual([1000, 1001]);
    // Later, on this device: the question dismissed (for a new plan), the introduction done. The plans keep what they took.
    localStorage.setItem('lp-protect-line', 'dismissed');
    localStorage.setItem('lp-warn-fruit', 'on');
    _resetStorageForTests();
    await initStorage(kv);
    await switchProject('p1');
    expect(household()).toEqual({ ...NO_YARD, answered: true });
    expect(state.fruitWarnings).toBe(false);
    expect((await readProject('p2'))!.household).toEqual({ ...NO_YARD, answered: true });
  });
  it('a plan that came later from before (a file, another device on an older version) takes what was taken at the update, every time it is read', async () => {
    localStorage.setItem('lp-yard', JSON.stringify({ ...NO_YARD, horses: true }));
    localStorage.setItem('lp-warn-hardy', 'off');
    const kv = await freshStorage(); // (the update: its first start)
    await kv.write([put('projects', 'later', { shapes: [], zoom: 1, offsetX: 0, offsetY: 0 }), put('meta', 'later', { id: 'later', name: 'Later', lastModified: 5, shapeCount: 0 })]);
    _resetStorageForTests();
    await initStorage(kv);
    expect('household' in (await stored(kv, 'later'))).toBe(false); // (the update's pass was long ago)
    const d = (await readProject('later'))!;
    expect(d.household).toEqual({ ...NO_YARD, horses: true, answered: true });
    expect(d.switches!.hardyWarnings).toEqual({ on: false });
    // What the device's keys say now doesn't move it: the question's × (the introduction run again likewise), or an
    // older version writing 'lp-yard' meanwhile. Read again, after a restart too, it's the same, so it doesn't go up again.
    localStorage.setItem('lp-protect-line', 'dismissed');
    localStorage.setItem('lp-yard', JSON.stringify({ ...NO_YARD, cats: true }));
    _resetStorageForTests();
    await initStorage(kv);
    expect((await readProject('later'))!.household).toEqual({ ...NO_YARD, horses: true, answered: true });
    await switchProject('later');
    expect(household()).toEqual({ ...NO_YARD, horses: true, answered: true });
    expect(state.hardyWarnings).toBe(false);
  });
  it('the update is one transaction: a plan saved meanwhile (another tab) is never put back as it was read; once only', async () => {
    for (const kv of [await openKV('test-' + ++dbCount), new MemoryKV()]) {
      await kv.write([put('projects', 'a', { n: 1 }), put('projects', 'b', { n: 1 })]);
      const pass = kv.changeAllOnce('flag', 'done', 'projects', (v) => ({ ...(v as object), took: true }));
      const meanwhile = kv.write([put('projects', 'a', { n: 2 })]);
      expect(await pass).toBeUndefined();
      await meanwhile;
      expect(await kv.get('projects', 'a')).toMatchObject({ n: 2 });
      expect(await kv.get('projects', 'b')).toEqual({ n: 1, took: true });
      // (Done: the flag's value, and nothing changed.)
      expect(await kv.changeAllOnce('flag', 'again', 'projects', () => ({ x: 1 }))).toBe('done');
      expect(await kv.get('projects', 'b')).toEqual({ n: 1, took: true });
    }
  });
  it('what was taken is kept with the flag; a test build\'s flag (a time) takes what the device has now, kept from then on', async () => {
    localStorage.setItem('lp-warn-poison', 'off');
    const kv = await storageFromBefore([{ id: 'p1', name: 'Back Yard', data: { shapes: [circle('oak')] } }]);
    expect(await kv.get('kv', 'tookFromDevice')).toMatchObject({ at: expect.any(Number), household: { ...NO_YARD, answered: false }, switches: { poisonWarnings: { on: false } } });
    // A flag from a build of this branch before it kept what it took: what this device has now is kept from here on.
    await kv.write([put('kv', 'tookFromDevice', 12345)]);
    localStorage.setItem('lp-yard', JSON.stringify({ ...NO_YARD, kids: true }));
    _resetStorageForTests();
    await initStorage(kv);
    expect(await kv.get('kv', 'tookFromDevice')).toMatchObject({ household: { ...NO_YARD, kids: true, answered: true } });
  });
});

// From storage as the current release writes it (src/storage.ts on `release`): plans with none of the three parts, sync
// records of revision and fingerprints only, a deletion still to send. The review of the storage change (Nov 1) asked
// for a start from the release itself, with sync records; this is that release's storage, written as it writes it.
describe("from the current release's storage, with sync records", () => {
  it("each plan takes this device's yard and switches, nothing else changes, and sync's records and tombstone are left for sync to settle", async () => {
    localStorage.setItem('lp-yard', JSON.stringify({ ...NO_YARD, dogs: 'nonToxic' }));
    localStorage.setItem('lp-crowding', 'off');
    _resetStorageForTests();
    const kv = await openKV('test-' + ++dbCount);
    const plan = (shapes: unknown[]) => ({ shapes, zoom: 1, offsetX: 0, offsetY: 0, roleViews: {}, print: { includeLegend: true }, sizeMode: 'typical', sunWarnings: true, phases: [], bgImage: null, photoElsewhere: null });
    await kv.write([
      put('meta', 'synced', { id: 'synced', name: 'Back Yard', lastModified: 1000, shapeCount: 1 }), put('projects', 'synced', plan([circle('oak')])),
      put('meta', 'local', { id: 'local', name: 'Sketch', lastModified: 1001, shapeCount: 0 }), put('projects', 'local', plan([])),
      put('kv', 'syncRecords', { synced: { revision: 7, hash: 'a1:b', photo: 'none' } }), put('kv', 'syncTombstones', { trashed: 3 }), put('kv', 'syncUser', 'u1'),
    ]);
    await initStorage(kv);
    const { getSyncRecords, getSyncTombstones, getSyncDeletedRecord, getSyncUser } = await import('../src/storage');
    for (const id of ['synced', 'local']) {
      expect(await stored(kv, id)).toMatchObject({ household: { ...NO_YARD, dogs: 'nonToxic', answered: true }, switches: { showCrowding: { on: false }, poisonWarnings: { on: true } } });
      expect('bought' in (await stored(kv, id))).toBe(false);
    }
    expect([await lastChanged(kv, 'synced'), await lastChanged(kv, 'local')]).toEqual([1000, 1001]);
    // (Left as that version wrote them: a record without the parts sends the plan the long way, settling with the server's:
    // tests/sync-local.test.ts. The tombstone goes as before, without a record to tell carried-over parts by.)
    expect(getSyncRecords()).toEqual({ synced: { revision: 7, hash: 'a1:b', photo: 'none' } });
    expect([getSyncTombstones(), getSyncDeletedRecord('trashed'), getSyncUser()]).toEqual([{ trashed: 3 }, undefined, 'u1']);
  });
  it("the update's pass failing (a full disk) leaves every plan as it was, filled as each is read, and runs at the next start", async () => {
    localStorage.setItem('lp-yard', JSON.stringify({ ...NO_YARD, kids: true }));
    _resetStorageForTests();
    const inner = await openKV('test-' + ++dbCount);
    await inner.write([put('meta', 'p1', { id: 'p1', name: 'Back Yard', lastModified: 1000, shapeCount: 0 }), put('projects', 'p1', { shapes: [], zoom: 1, offsetX: 0, offsetY: 0 })]);
    let fail = true;
    const flaky = Object.assign(Object.create(inner) as typeof inner, {
      changeAllOnce: (...a: Parameters<typeof inner.changeAllOnce>) => (fail ? Promise.reject(new DOMException('full', 'QuotaExceededError')) : inner.changeAllOnce(...a)),
    });
    await initStorage(flaky);
    expect(household()).toEqual({ ...NO_YARD, kids: true, answered: true }); // (read as it is, all the same)
    expect([await inner.get('kv', 'tookFromDevice'), 'household' in (await stored(inner, 'p1'))]).toEqual([undefined, false]);
    fail = false;
    _resetStorageForTests();
    await initStorage(flaky);
    expect(await stored(inner, 'p1')).toMatchObject({ household: { ...NO_YARD, kids: true, answered: true } });
    expect(await inner.get('kv', 'tookFromDevice')).toMatchObject({ household: { ...NO_YARD, kids: true, answered: true } });
  });
});

// Settings → Warnings' switches, kept with the plan (Jason approved "What's checked (and dismissed) goes with this plan,
// on all your devices", Nov 1). Before, each was kept per device ('lp-crowding', 'lp-crowd-warn', 'lp-warn-hardy',
// 'lp-warn-poison', 'lp-warn-fruit'): a plan from before takes those. Text size, zoom buttons and snap stay the device's.
describe('the warning switches, kept with the plan (Jason, Nov 1)', () => {
  const SWITCHES = ['showCrowding', 'crowdWarnings', 'hardyWarnings', 'poisonWarnings', 'fruitWarnings'] as const;
  const on = () => SWITCHES.map((k) => state[k]);
  afterEach(() => { for (const k of SWITCHES) state[k] = true; state.switchedAt = {}; });
  it("a plan from before takes this device's, never switched in the plan; the device's keys are left for an older version", async () => {
    localStorage.setItem('lp-crowding', 'off');
    localStorage.setItem('lp-warn-poison', 'off');
    localStorage.setItem('lp-warn-hardy', 'on');
    const kv = await storageFromBefore([{ id: 'p1', name: 'Back Yard', data: { shapes: [circle('oak')] } }]);
    expect(on()).toEqual([false, true, true, false, true]);
    expect(state.switchedAt).toEqual({});
    expect((await stored(kv, 'p1')).switches).toEqual({ showCrowding: { on: false }, crowdWarnings: { on: true }, hardyWarnings: { on: true }, poisonWarnings: { on: false }, fruitWarnings: { on: true } });
    expect(syncedContent((await readProject('p1'))!).switches).toEqual((await stored(kv, 'p1')).switches);
    expect(await lastChanged(kv, 'p1')).toBe(1000);
    // Switched in the plan: saved with it (an edit), with when; the device's key is left as it was.
    setPoisonWarnings(true);
    await flushSave();
    expect((await stored(kv, 'p1')).switches).toMatchObject({ poisonWarnings: { on: true, at: expect.any(Number) }, showCrowding: { on: false } });
    expect(await lastChanged(kv, 'p1')).toBeGreaterThan(1000);
    expect(localStorage.getItem('lp-warn-poison')).toBe('off');
  });
  it('each plan its own: opening another switches them; kept across a restart', async () => {
    const kv = await storageFromBefore([
      { id: 'p1', name: 'Back Yard', data: { shapes: [] } },
      { id: 'p2', name: 'Front', data: { shapes: [] } },
    ]);
    await switchProject('p1');
    setShowCrowding(false); setCrowdWarnings(false); setHardyWarnings(false);
    await switchProject('p2');
    expect(on()).toEqual([true, true, true, true, true]);
    setFruitWarnings(false);
    await switchProject('p1');
    expect(on()).toEqual([false, false, false, true, true]);
    _resetStorageForTests();
    await initStorage(kv);
    expect(state.currentProjectId).toBe('p1');
    expect(on()).toEqual([false, false, false, true, true]);
    expect(Object.keys(state.switchedAt).sort()).toEqual(['crowdWarnings', 'hardyWarnings', 'showCrowding']);
    expect((await readProject('p2'))!.switches!.fruitWarnings).toEqual({ on: false, at: expect.any(Number) });
    // (Nothing written to the device's keys.)
    expect(['lp-crowding', 'lp-crowd-warn', 'lp-warn-hardy', 'lp-warn-poison', 'lp-warn-fruit'].map((k) => localStorage.getItem(k))).toEqual([null, null, null, null, null]);
  });
  it('a new plan starts with every warning on; one of the same garden copies the open plan\'s', async () => {
    localStorage.setItem('lp-warn-poison', 'off'); // (a device's, from before: not for a new plan)
    await freshStorage();
    expect(on()).toEqual([true, true, true, true, true]); // (a new device's first plan)
    expect(state.switchedAt).toEqual(Object.fromEntries(SWITCHES.map((k) => [k, expect.any(Number)])));
    expect(allSwitchesOn()).toBe(true);
    setHardyWarnings(false);
    expect(allSwitchesOn()).toBe(false);
    const same = await createProject('Same garden', { ...emptyProjectData(), switches: switchesCopy() });
    const other = await createProject('Somewhere else');
    expect((await readProject(same))!.switches!.hardyWarnings).toEqual({ on: false, at: expect.any(Number) });
    expect(Object.values((await readProject(other))!.switches!).map((x) => x.on)).toEqual([true, true, true, true, true]);
    await switchProject(same);
    expect(on()).toEqual([true, true, false, true, true]);
  });
  it("go with the plan in backups and plan files; a file from before restores with this device's; odd values are dropped", async () => {
    await freshStorage();
    setPoisonWarnings(false);
    expect(planSwitches().poisonWarnings).toEqual({ on: false, at: expect.any(Number) });
    const { text } = await buildBackupFile();
    expect(JSON.parse(text).projects[0].data.switches.poisonWarnings).toEqual({ on: false, at: expect.any(Number) });
    localStorage.setItem('lp-crowd-warn', 'off'); // (the device it's restored on)
    await freshStorage();
    const { ids: [id] } = await importProjects(parseImportFile(text));
    await switchProject(id);
    expect(on()).toEqual([true, true, true, false, true]);
    const old = JSON.parse(text);
    delete old.projects[0].data.switches;
    const { ids: [oldId] } = await importProjects(parseImportFile(JSON.stringify(old)));
    await switchProject(oldId);
    expect(on()).toEqual([true, false, true, true, true]);
    expect(sanitizeSwitches({ showCrowding: { on: false, at: 3 }, crowdWarnings: { on: 'no' }, hardyWarnings: { on: true, at: -1 }, sunWarnings: { on: false }, poisonWarnings: 7 }))
      .toEqual({ showCrowding: { on: false, at: 3 }, hardyWarnings: { on: true } });
    expect([sanitizeSwitches('on'), sanitizeSwitches([1]), sanitizeSwitches(null)]).toEqual([undefined, undefined, undefined]);
  });
  it("the device's own settings stay on the device: full-size rings, the zoom buttons", async () => {
    const kv = await freshStorage();
    setShowFullSize(true); setZoomButtons(false);
    save(); await flushSave();
    const s = await stored(kv, state.currentProjectId!);
    expect(Object.keys(s.switches as object).sort()).toEqual([...SWITCHES].sort());
    expect(JSON.stringify(s)).not.toMatch(/showFullSize|zoomButtons/);
    const b = await createProject('Front');
    await switchProject(b);
    loadViewSettings();
    expect([state.showFullSize, state.zoomButtons]).toEqual([true, false]);
    setShowFullSize(false); setZoomButtons(true);
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

// An older version of the app saving over a newer one's data (Nov 1: a buried line lost its role and became a plain
// shape, saved over by a tab left open on an older version). The guard is the database's version (src/db.ts
// DB_VERSION), raised whenever what's stored changes so an older version would lose data saving over it.
describe('an older version never saves over a newer one (src/db.ts DB_VERSION)', () => {
  const STORES = ['meta', 'projects', 'images', 'kv'];
  /** A connection of its own, as another page's (`version`: undefined, the database's own). */
  const rawOpen = (name: string, version?: number, upgrade?: (db: IDBDatabase) => void) => new Promise<IDBDatabase>((resolve, reject) => {
    const r = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
    r.onupgradeneeded = () => upgrade?.(r.result);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  /** A database at `version` holding `records`, as a page of that version left it; its connection, still open. */
  async function dbAt(name: string, version: number, records: Record<string, Record<string, unknown>>): Promise<IDBDatabase> {
    const db = await rawOpen(name, version, (d) => { for (const s of STORES) d.createObjectStore(s); });
    const tx = db.transaction(STORES, 'readwrite');
    for (const [s, recs] of Object.entries(records)) for (const [k, v] of Object.entries(recs)) tx.objectStore(s).put(v, k);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    return db;
  }
  /** Every store's records, by key. */
  async function dump(db: IDBDatabase): Promise<Record<string, Record<string, unknown>>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const s of [...db.objectStoreNames]) {
      const os = db.transaction(s).objectStore(s);
      const [keys, values] = await Promise.all([os.getAllKeys(), os.getAll()].map((r) => new Promise<unknown[]>((res) => { r.onsuccess = () => res(r.result as unknown[]); })));
      out[s] = Object.fromEntries(keys.map((k, i) => [String(k), values[i]]));
    }
    return out;
  }
  const localNow = () => Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).map((k) => [k, localStorage.getItem(k)]));
  const labels = (shapes: { label?: string }[]) => shapes.map((s) => s.label);
  const shapesOf = (...l: string[]) => sanitizeProjectData({ shapes: l.map(circle) }).shapes;
  const BG = { imageId: 'img1', naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true };
  const SW = { showCrowding: { on: true }, crowdWarnings: { on: true }, hardyWarnings: { on: false, at: 8 }, poisonWarnings: { on: true }, fruitWarnings: { on: true } };
  const BURIED = { id: 'line1', type: 'line', x: 0, y: 0, points: [[0, 0], [10, 0]], rotation: 0, color: '#7c3aed', label: 'buried line', opacity: 0.8, locked: false, role: 'utility', utility: 'buried' };
  // A device as release 3 (Nov 1) left it, at database version 1: a plan with a photo, a buried line, its ticks, yard
  // and switches; sync's records with core and parts, a deletion still to send; the rest of kv.
  const plan = (extra: Record<string, unknown>) => ({ zoom: 1, offsetX: 0, offsetY: 0, roleViews: {}, print: { paper: 'letter' }, sizeMode: 'typical', sunWarnings: true, phases: [], bgImage: null, photoElsewhere: null, ...extra });
  const RELEASE3 = {
    meta: { p1: { id: 'p1', name: 'Back Yard', lastModified: 1000, shapeCount: 2 }, p2: { id: 'p2', name: 'Front', lastModified: 900, shapeCount: 0 } },
    projects: {
      p1: plan({
        shapes: [circle('oak'), BURIED], zoom: 1.5, bgImage: BG, location: null,
        dismissed: { hardy: { 'pl:1': 'Zone 9' } }, bought: { 'pl:1': { n: 2, at: 5 } },
        household: { ...NO_YARD, dogs: 'hideToxic', answered: true, at: 7 }, switches: SW,
      }),
      p2: plan({ shapes: [], household: { ...NO_YARD, answered: false }, switches: SW }),
    },
    images: { 'p1/img1': { dataUrl: IMG, createdAt: 3 } },
    kv: {
      current: 'p1', lastBackupAt: 11, migratedFromLocalStorage: 12, installId: 'abcdefghijklmnop1234', lastSizeMode: 'full',
      clipboard: { shapes: [circle('clip')], sourceProjectId: 'p1', timestamp: 1 },
      syncRecords: { p1: { revision: 4, hash: 'h1:x', photo: 'none', core: 'c1:y', parts: { bought: { 'pl:1': { n: 2, at: 5 } } } } },
      syncTombstones: { gone: 2 }, syncDeleted: { gone: { revision: 2, hash: 'h2:z' } }, syncUser: 'u1',
      tookFromDevice: { at: 6, household: { ...NO_YARD, answered: true }, switches: SW },
      myPlants: [], myPlantSync: { records: {}, edited: {} },
      'cleared/p2': { shapes: [circle('was')], bgImage: null, photoElsewhere: null, at: 9 },
    },
  };
  afterEach(() => { setNewerVersionListener(() => {}); setOpenBlockedListener(null); });

  it('the upgrade from 1 keeps every store and record as release 3 left them, and the plans open as they were', async () => {
    expect(DB_VERSION).toBe(2);
    const name = 'test-' + ++dbCount;
    const old = await dbAt(name, 1, RELEASE3);
    const before = await dump(old);
    old.close();
    _resetStorageForTests();
    const kv = await openKV(name);
    const raw = await rawOpen(name);
    expect(raw.version).toBe(DB_VERSION);
    expect(await dump(raw)).toEqual(before);
    await initStorage(kv);
    // (Opening them writes nothing but which plan is open, as it was.)
    expect(await dump(raw)).toEqual(before);
    expect(state.currentProjectId).toBe('p1');
    expect(labels(state.shapes)).toEqual(['oak', 'buried line']);
    expect(state.shapes[1]).toMatchObject({ role: 'utility', utility: 'buried' });
    expect([state.bgImage?.dataUrl, state.zoom, state.bought, state.dismissed]).toEqual([IMG, 1.5, { 'pl:1': { n: 2, at: 5 } }, { hardy: { 'pl:1': 'Zone 9' } }]);
    expect(household()).toEqual({ ...NO_YARD, dogs: 'hideToxic', answered: true, at: 7 });
    expect(state.hardyWarnings).toBe(false);
    expect([getSyncRecords(), getSyncTombstones(), getSyncDeletedRecord('gone'), getSyncUser()])
      .toEqual([RELEASE3.kv.syncRecords, { gone: 2 }, { revision: 2, hash: 'h2:z' }, 'u1']);
    expect(state.projects.map((p) => p.name)).toEqual(['Back Yard', 'Front']);
    // A plan saved from now on, and a journal, carry this version.
    state.shapes = [...state.shapes, ...shapesOf('new')]; save();
    writeJournalIfDirty();
    const ownJournal = Object.keys(localStorage).find((k) => k.startsWith('lp-journal:p1@'))!;
    expect(JSON.parse(localStorage.getItem(ownJournal)!)).toMatchObject({ dbVersion: DB_VERSION, page: ownJournal.slice('lp-journal:p1@'.length) });
    await flushSave();
    expect((await stored(kv, 'p1')).dbVersion).toBe(DB_VERSION);
    expect((await stored(kv, 'p1')).shapes).toEqual(['oak', 'line1', 'new'].map((id) => expect.objectContaining({ id })));
    raw.close();
  });

  it('a page open when a newer version opens the database writes its edits not yet saved first, then closes it and saves nothing more, not even a journal', async () => {
    const name = 'test-' + ++dbCount;
    _resetStorageForTests();
    const kv = await openKV(name);
    await initStorage(kv);
    const id = state.currentProjectId!;
    const heard: { last?: Promise<boolean> } = {};
    setNewerVersionListener((last) => { heard.last = last; });
    state.shapes = shapesOf('saved'); save(); await flushSave();
    state.shapes = shapesOf('saved', 'not yet'); save(); // (waiting for the save's debounce)
    // A newer version opens it, in another tab: it isn't kept waiting.
    let blocked = false;
    const newer = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name, DB_VERSION + 1);
      r.onblocked = () => { blocked = true; };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    expect(blocked).toBe(false);
    expect(await heard.last).toBe(true);
    expect(supersededByNewer()).toBe(true);
    const after = await dump(newer);
    expect(labels((after.projects[id] as { shapes: Shape[] }).shapes)).toEqual(['saved', 'not yet']);
    expect(journals()).toBe(''); // (written as it closed, cleared once the write was in)
    // Nothing more from this page: an edit and its save, the page hiding, sync reading the open plan, a new plan.
    state.shapes = shapesOf('after'); save();
    expect(await flushSave()).toBe(false);
    writeJournalIfDirty();
    await expect(projectNow(id)).rejects.toBeInstanceOf(NewerVersionError);
    await expect(createProject('More')).rejects.toBeInstanceOf(NewerVersionError);
    await new Promise((r) => setTimeout(r, 300)); // (a save's debounce)
    expect(await dump(newer)).toEqual(after);
    expect(journals()).toBe('');
    newer.close();
  });

  it("a page opened after a newer version has the database stops before reading or writing anything, and isn't put in memory", async () => {
    const newer = await dbAt(DB_NAME, DB_VERSION + 1, RELEASE3);
    const before = await dump(newer);
    newer.close();
    localStorage.setItem('lp-idb-in-use', '1');
    localStorage.setItem('lp-journal:p1', JSON.stringify({ projectId: 'p1', at: Date.now() + 1000, dbVersion: DB_VERSION + 1, data: { shapes: [circle('newer')] } }));
    const local = localNow();
    _resetStorageForTests();
    const t = Date.now();
    await expect(initStorage()).rejects.toBeInstanceOf(NewerVersionError);
    expect(Date.now() - t).toBeLessThan(250); // (not tried again)
    expect(storageIsDurable()).toBe(false);
    expect(localNow()).toEqual(local);
    const raw = await rawOpen(DB_NAME);
    expect(raw.version).toBe(DB_VERSION + 1);
    expect(await dump(raw)).toEqual(before);
    raw.close();
  });

  it("waits for an older page that holds the database and can't answer (frozen, say), says so, and goes on once it closes, nothing lost", async () => {
    const name = 'test-' + ++dbCount;
    const old = await dbAt(name, 1, RELEASE3); // (it never closes by itself)
    const before = await dump(old);
    const heard: boolean[] = [];
    setOpenBlockedListener((b) => { heard.push(b); });
    let opened = false;
    const opening = openKV(name).then((k) => { opened = true; return k; });
    await vi.waitFor(() => expect(heard).toEqual([true]));
    await new Promise((r) => setTimeout(r, 50));
    expect(opened).toBe(false);
    old.close();
    const kv = await opening;
    expect([heard, kv.durable]).toEqual([[true, false], true]);
    const raw = await rawOpen(name);
    expect(raw.version).toBe(DB_VERSION);
    expect(await dump(raw)).toEqual(before);
    raw.close();
  });

  it("an older tab's unsaved changes (its journal) are never put over a plan this version has saved: kept as a plan of their own, its photo too, both whole", async () => {
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    state.bgImage = { ...BG, dataUrl: IMG };
    state.shapes = shapesOf('both'); save(); await flushSave();
    // The older tab's copy, read then: as release 3 writes a journal (no version: 1), the photo's bytes on disk already.
    const older = { ...currentProjectData(), shapes: shapesOf('both', 'older tab'), bgImage: { ...state.bgImage, dataUrl: '' } };
    state.shapes = shapesOf('both', 'newer'); state.bought = { 'pl:1': { n: 1, at: 5 } }; save(); await flushSave();
    const newerPlan = await stored(kv, id);
    expect(newerPlan.dbVersion).toBe(DB_VERSION);
    // (Written as it closed, after this version's last save; the ticks too, so only its version tells.)
    localStorage.setItem('lp-journal:' + id, JSON.stringify({ projectId: id, at: Date.now() + 1000, data: { ...older, bought: { 'pl:1': { n: 1, at: 5 } } } }));
    _resetStorageForTests();
    const { keptApart } = await initStorage(kv);
    expect(keptApart).toEqual(['My Garden (from an older tab)']);
    expect(state.currentProjectId).toBe(id);
    expect(labels(state.shapes)).toEqual(['both', 'newer']);
    expect(await stored(kv, id)).toEqual(newerPlan);
    const copy = state.projects.find((p) => p.name === keptApart![0])!;
    const kept = (await readProject(copy.id))!;
    expect([labels(kept.shapes), kept.bgImage?.dataUrl, copy.shapeCount]).toEqual([['both', 'older tab'], IMG, 2]);
    expect(journals()).toBe('');
    // (Once: the next start has nothing to keep, and a second one is named apart.)
    _resetStorageForTests();
    expect((await initStorage(kv)).keptApart).toBeUndefined();
    localStorage.setItem('lp-journal:' + id, JSON.stringify({ projectId: id, at: Date.now() + 2000, data: older }));
    _resetStorageForTests();
    expect((await initStorage(kv)).keptApart).toEqual(['My Garden (from an older tab) (2)']);
    expect(state.projects).toHaveLength(3);
  });

  it("a journal from before plans kept their ticks, yard and switches (release 2) is kept apart from a plan that has them, one release 3 saved too", async () => {
    const name = 'test-' + ++dbCount;
    (await dbAt(name, 1, RELEASE3)).close();
    // (A release 2 tab, open since before the update, its plan read then: none of the three parts.)
    const r2 = plan({ shapes: [circle('oak'), { ...BURIED, role: undefined, utility: undefined, label: 'release 2 line' }], bgImage: { ...BG, dataUrl: '' } });
    localStorage.setItem('lp-journal:p1', JSON.stringify({ projectId: 'p1', at: Date.now(), data: r2 }));
    _resetStorageForTests();
    const kv = await openKV(name);
    const { keptApart } = await initStorage(kv);
    expect(keptApart).toEqual(['Back Yard (from an older tab)']);
    expect(await stored(kv, 'p1')).toEqual(RELEASE3.projects.p1);
    expect(labels(state.shapes)).toEqual(['oak', 'buried line']);
    expect(state.bought).toEqual({ 'pl:1': { n: 2, at: 5 } });
  });

  it("a release 3 page's journal, over its plan as release 3 left it (this version opened since, saving nothing), is put in place as before", async () => {
    const name = 'test-' + ++dbCount;
    (await dbAt(name, 1, RELEASE3)).close();
    const r3 = { ...RELEASE3.projects.p1, shapes: [circle('oak'), BURIED, circle('late')], bgImage: { ...BG, dataUrl: '' } };
    localStorage.setItem('lp-journal:p1', JSON.stringify({ projectId: 'p1', at: Date.now(), data: r3 }));
    _resetStorageForTests();
    const kv = await openKV(name);
    const { keptApart } = await initStorage(kv);
    expect(keptApart).toBeUndefined();
    expect(labels(state.shapes)).toEqual(['oak', 'buried line', 'late']);
    expect(state.shapes[1]).toMatchObject({ role: 'utility', utility: 'buried' });
    expect([state.bgImage?.dataUrl, state.bought, household().dogs]).toEqual([IMG, { 'pl:1': { n: 2, at: 5 } }, 'hideToxic']);
    expect(state.projects).toHaveLength(2);
    expect(journals()).toBe('');
    // Stamped as the journal's own version, which wrote it (1: release 3): that tab's next journal, more of the same
    // edits, goes in place too, not apart as a near-copy (the review, Nov 1).
    expect((await stored(kv, 'p1')).dbVersion).toBe(1);
    localStorage.setItem('lp-journal:p1', JSON.stringify({ projectId: 'p1', at: Date.now() + 1000, data: { ...r3, shapes: [...r3.shapes, circle('later')] } }));
    _resetStorageForTests();
    expect((await initStorage(kv)).keptApart).toBeUndefined();
    expect(labels(state.shapes)).toEqual(['oak', 'buried line', 'late', 'later']);
    expect(state.projects).toHaveLength(2);
    // Saved here, it's this version's again.
    save(); await flushSave();
    expect((await stored(kv, 'p1')).dbVersion).toBe(DB_VERSION);
  });

  it('a journal from a newer version than this one is left as it is, for that version', async () => {
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    const j = JSON.stringify({ projectId: id, at: Date.now() + 1000, dbVersion: DB_VERSION + 1, data: { ...currentProjectData(), shapes: [circle('newer')] } });
    localStorage.setItem('lp-journal:' + id, j);
    _resetStorageForTests();
    await initStorage(kv);
    expect(state.shapes).toEqual([]);
    state.shapes = shapesOf('here'); save(); await flushSave();
    expect(localStorage.getItem('lp-journal:' + id)).toBe(j);
  });

  // The data-safety review of this guard (Nov 1): an older tab's edit, kept in its journal alone, is never dropped unseen.
  const journalKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('lp-journal:')).sort();
  const keptLabels = async () => Promise.all(state.projects.filter((p) => p.name.includes('(from an older tab)'))
    .map(async (p) => labels((await readProject(p.id))!.shapes)));

  it("a save here never clears another tab's journal, nor an older version's (the only copy of its edit); this page's own goes once saved", async () => {
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = shapesOf('saved'); save(); await flushSave();
    // A release 3 tab's edit pending at the upgrade: its save failed (the database closed), so only its journal has it.
    const r3 = JSON.stringify({ projectId: id, at: Date.now() - 1000, data: { ...currentProjectData(), shapes: [circle('saved'), circle('r3 late')] } });
    localStorage.setItem('lp-journal:' + id, r3);
    // Another tab of this version, with its own.
    const other = JSON.stringify({ projectId: id, at: Date.now() - 1000, dbVersion: DB_VERSION, page: 'otherpage', data: { ...currentProjectData(), shapes: [circle('saved'), circle('other tab')] } });
    localStorage.setItem(`lp-journal:${id}@otherpage`, other);
    // This page: an edit, its own journal (the page hidden), then saved. Three journals, none over another.
    state.shapes = shapesOf('saved', 'here'); save(); writeJournalIfDirty();
    expect(journalKeys()).toHaveLength(3);
    expect(await flushSave()).toBe(true);
    expect(journalKeys()).toEqual([`lp-journal:${id}`, `lp-journal:${id}@otherpage`]);
    expect([localStorage.getItem('lp-journal:' + id), localStorage.getItem(`lp-journal:${id}@otherpage`)]).toEqual([r3, other]);
    // The next start: both written before the plan last changed, by pages that didn't save it since: kept apart.
    _resetStorageForTests();
    const { keptApart } = await initStorage(kv);
    expect(keptApart).toHaveLength(2);
    expect(labels(state.shapes)).toEqual(['saved', 'here']);
    expect((await keptLabels()).sort()).toEqual([['saved', 'other tab'], ['saved', 'r3 late']]);
    expect(journals()).toBe('');
  });

  it('a journal written before its plan changed again (renamed, synced) is kept apart, not dropped; one the same as the plan is only removed', async () => {
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = shapesOf('saved'); save(); await flushSave();
    const same = currentProjectData();
    localStorage.setItem('lp-journal:' + id, JSON.stringify({ projectId: id, at: Date.now() - 1000, data: { ...same, shapes: [circle('saved'), circle('r3 late')] } }));
    await new Promise((r) => setTimeout(r, 5));
    await renameProject(id, 'Back yard');
    _resetStorageForTests();
    expect((await initStorage(kv)).keptApart).toEqual(['Back yard (from an older tab)']);
    expect(await keptLabels()).toEqual([['saved', 'r3 late']]);
    expect(labels(state.shapes)).toEqual(['saved']);
    // The same as the plan, written before its last change or after: removed, with nothing written and nothing kept.
    const before = [await stored(kv, id), await kv.get('meta', id)];
    for (const at of [Date.now() - 1000, Date.now() + 1000]) {
      localStorage.setItem('lp-journal:' + id, JSON.stringify({ projectId: id, at, data: same }));
      _resetStorageForTests();
      expect((await initStorage(kv)).keptApart).toBeUndefined();
      expect(journals()).toBe('');
      expect([await stored(kv, id), await kv.get('meta', id)]).toEqual(before);
    }
    expect(state.projects).toHaveLength(2);
  });

  it("a page's own journal from before its own later save of the plan is only removed; another page's is kept apart", async () => {
    const kv = await freshStorage();
    const id = state.currentProjectId!;
    state.shapes = shapesOf('saved', 'more'); save(); await flushSave();
    const rec = await stored(kv, id);
    const page = rec.savedByPage as string;
    expect(page).toMatch(/^[A-Za-z0-9]{8,}$/);
    const older = (p: string) => JSON.stringify({ projectId: id, at: (rec.savedAt as number) - 1000, dbVersion: DB_VERSION, page: p, data: { ...currentProjectData(), shapes: [circle('saved')] } });
    localStorage.setItem(`lp-journal:${id}@${page}`, older(page));
    _resetStorageForTests();
    expect((await initStorage(kv)).keptApart).toBeUndefined();
    expect([journals(), state.projects.length]).toEqual(['', 1]);
    localStorage.setItem(`lp-journal:${id}@elsewhere`, older('elsewhere'));
    _resetStorageForTests();
    expect((await initStorage(kv)).keptApart).toEqual(['My Garden (from an older tab)']);
    expect(await keptLabels()).toEqual([['saved']]);
  });

  it("two pages starting at once (a browser restoring its tabs) keep an older tab's journal apart once, with Web Locks or without", async () => {
    for (const withLocks of [false, true]) {
      const name = 'test-' + ++dbCount;
      _resetStorageForTests();
      await initStorage(await openKV(name));
      const id = state.currentProjectId!;
      state.shapes = shapesOf('newer'); save(); await flushSave();
      localStorage.setItem('lp-journal:' + id, JSON.stringify({ projectId: id, at: Date.now() + 1000, data: { ...currentProjectData(), shapes: [circle('older tab')] } }));
      let locked = 0;
      if (withLocks) {
        // (A stand-in for the browser's Web Locks: one holder at a time, in turn.)
        let tail: Promise<unknown> = Promise.resolve();
        const request = (_name: string, cb: () => Promise<unknown>) => { locked++; const run = tail.then(cb); tail = run.catch(() => {}); return run; };
        Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
      }
      try {
        // Two pages, each its own copy of the app's code and state, starting together.
        const page = async () => { vi.resetModules(); return { storage: await import('../src/storage'), db: await import('../src/db') }; };
        const a = await page(), b = await page();
        const results = await Promise.all([a, b].map(async (p) => p.storage.initStorage(await p.db.openKV(name))));
        const kept = (await (await openKV(name)).getAll<{ name: string }>('meta')).filter((m) => m.name.includes('(from an older tab)'));
        expect(kept).toHaveLength(1);
        if (withLocks) expect([locked, results.flatMap((r) => r.keptApart ?? [])]).toEqual([2, ['My Garden (from an older tab)']]);
        expect(journals()).toBe('');
      } finally {
        if (withLocks) delete (navigator as unknown as { locks?: unknown }).locks;
      }
    }
  });

  it("the last write's journal goes once it's in, even with an edit after it (a drag let go under the message)", async () => {
    const name = 'test-' + ++dbCount;
    _resetStorageForTests();
    await initStorage(await openKV(name));
    const id = state.currentProjectId!;
    state.shapes = shapesOf('a'); save(); await flushSave();
    state.shapes = shapesOf('a', 'b'); save();
    const heard: { last?: Promise<boolean> } = {};
    setNewerVersionListener((last) => { heard.last = last; state.shapes = shapesOf('a', 'b', 'dragged'); save(); });
    const newer = await rawOpen(name, DB_VERSION + 1);
    expect(await heard.last).toBe(true);
    expect(journals()).toBe('');
    expect(labels(((await dump(newer)).projects[id] as { shapes: Shape[] }).shapes)).toEqual(['a', 'b']);
    newer.close();
  });

  it("a raw copy of the database at a newer version holds every record as stored, and changes nothing; none is made where there's no database", async () => {
    const newer = await dbAt(DB_NAME, DB_VERSION + 1, RELEASE3);
    const before = await dump(newer);
    newer.close();
    const file = (await buildRawCopyFile())!;
    expect(file.filename).toMatch(/^fullgrown-raw-copy-.+\.json$/);
    const parsed = JSON.parse(file.text);
    expect(parsed).toMatchObject({ format: RAW_COPY_FORMAT, databaseVersion: DB_VERSION + 1 });
    expect(parsed.stores).toEqual(JSON.parse(JSON.stringify(before)));
    expect(parsed.stores.images['p1/img1'].dataUrl).toBe(IMG);
    const raw = await rawOpen(DB_NAME);
    expect(raw.version).toBe(DB_VERSION + 1);
    expect(await dump(raw)).toEqual(before);
    raw.close();
    expect(await buildRawCopyFile('nothing-here')).toBeNull();
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain('nothing-here');
  });
});
