// @vitest-environment jsdom
// Regression tests for failure paths found in review: storage errors,
// interrupted saves, hostile imports, and conflicting older-version edits.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryKV, openKV, type KV, type WriteOp } from '../src/db';
import { state } from '../src/state';
import { pushHistory, redo, undo } from '../src/history';
import {
  _resetStorageForTests, createProject, flushSave, initStorage, readProject, sanitizeProjectData,
  save, saveIsFailing, StorageUnavailableError, switchProject, writeJournalIfDirty,
} from '../src/storage';
import { buildBackupFile, buildProjectFile, parseImportFile, safeFileName, stamp } from '../src/backup';
import { pdfName } from '../src/ui/print-panel';
import type { BgImage } from '../src/types';

const IMG_A = 'data:image/jpeg;base64,' + 'A'.repeat(64);
const IMG_B = 'data:image/jpeg;base64,' + 'B'.repeat(64);
const bg = (dataUrl: string, extra: Partial<BgImage> = {}): BgImage =>
  ({ dataUrl, naturalWidth: 10, naturalHeight: 10, ftPerPx: 0.1, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true, ...extra });
const circle = (label: string) => ({ id: label, type: 'circle', x: 1, y: 2, radius: 3, color: '#000000', label, opacity: 0.5, locked: false });
const shapes = (...labels: string[]) => sanitizeProjectData({ shapes: labels.map(circle) }).shapes;

/** Wraps a KV so writes can be made to fail on demand. */
class FlakyKV implements KV {
  failWrites = false;
  constructor(private inner: KV) {}
  get durable() { return this.inner.durable; }
  get<T>(s: Parameters<KV['get']>[0], k: string) { return this.inner.get<T>(s, k); }
  getAll<T>(s: Parameters<KV['getAll']>[0]) { return this.inner.getAll<T>(s); }
  keys(s: Parameters<KV['keys']>[0], p?: string) { return this.inner.keys(s, p); }
  write(ops: WriteOp[]) {
    if (this.failWrites) return Promise.reject(new DOMException('disk full', 'UnknownError'));
    return this.inner.write(ops);
  }
  changeAllOnce(...a: Parameters<KV['changeAllOnce']>) {
    if (this.failWrites) return Promise.reject(new DOMException('disk full', 'UnknownError'));
    return this.inner.changeAllOnce(...a);
  }
}

let n = 0;
async function fresh(): Promise<FlakyKV> {
  _resetStorageForTests();
  const kv = new FlakyKV(await openKV('f' + ++n));
  await initStorage(kv);
  return kv;
}
async function restart(kv: KV) { _resetStorageForTests(); await initStorage(kv); }
const journals = () => Object.keys(localStorage).filter((k) => k.startsWith('lp-journal')).map((k) => localStorage.getItem(k)).join('');

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); vi.spyOn(window, 'alert').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('journal replay never loses an existing background image', () => {
  it('keeps the stored image when the journal could not hold the new one', async () => {
    const kv = await fresh();
    state.bgImage = bg(IMG_A); save(); await flushSave();
    await restart(kv);
    // Replace the image, then the page dies before the write; localStorage too full for the bytes.
    state.bgImage = bg(IMG_B); save();
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (v.includes('BBBB')) throw new DOMException('full', 'QuotaExceededError');
      return setItem.call(this, k, v);
    });
    writeJournalIfDirty();
    vi.restoreAllMocks();
    await restart(kv);
    expect(state.bgImage?.dataUrl).toBe(IMG_A);
  });
});

describe('storage that fails to open', () => {
  it('refuses to show stale data when IndexedDB held the projects before', async () => {
    await fresh(); // marks IndexedDB as in use
    localStorage.setItem('lp-journal:p1', '{"projectId":"p1","at":1,"data":{}}');
    _resetStorageForTests();
    await expect(initStorage(new MemoryKV())).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(localStorage.getItem('lp-journal:p1')).not.toBeNull(); // pending edits untouched
  });
  it('still runs in memory on a browser that never had IndexedDB', async () => {
    _resetStorageForTests();
    await initStorage(new MemoryKV());
    expect(state.projects).toHaveLength(1);
  });
});

describe('failed saves', () => {
  it('are reported, keep a journal, and block switching away', async () => {
    const kv = await fresh();
    const a = state.currentProjectId!;
    const b = await createProject('B');
    state.shapes = shapes('unsaved on A');
    save();
    kv.failWrites = true;
    expect(await flushSave()).toBe(false);
    expect(saveIsFailing()).toBe(true);
    expect(journals()).toContain('unsaved on A');
    expect(await switchProject(b)).toBe(false);
    expect(state.currentProjectId).toBe(a);
    expect(state.shapes.map((s) => s.label)).toEqual(['unsaved on A']);
    // Storage recovers: the next save succeeds and clears the warning.
    kv.failWrites = false;
    expect(await switchProject(b)).toBe(true);
    expect(saveIsFailing()).toBe(false);
    expect((await readProject(a))?.shapes.map((s) => s.label)).toEqual(['unsaved on A']);
  });

  it("one project's save does not clear another project's journal", async () => {
    await fresh();
    localStorage.setItem('lp-journal:other', JSON.stringify({ projectId: 'other', at: Date.now(), data: {} }));
    state.shapes = shapes('x'); save(); await flushSave();
    expect(localStorage.getItem('lp-journal:other')).not.toBeNull();
  });
});

describe('edits during a project switch', () => {
  it('are saved to the project they were made in', async () => {
    await fresh();
    const a = state.currentProjectId!;
    const b = await createProject('B');
    const switching = switchProject(b);
    await Promise.resolve();
    state.shapes.push(...shapes('late edit')); save(); // e.g. a debounced input firing
    await switching;
    expect(state.currentProjectId).toBe(b);
    expect((await readProject(a))?.shapes.map((s) => s.label)).toEqual(['late edit']);
  });
});

describe('undo and redo around a background image', () => {
  it('do not store extra copies of the image', async () => {
    const kv = await fresh();
    const id = state.currentProjectId!;
    pushHistory();
    state.bgImage = bg(IMG_A, { imageId: 'img1' }); pushHistory(); save(); await flushSave();
    state.bgImage = { ...state.bgImage!, ftPerPx: 0.5 }; pushHistory(); save(); await flushSave();
    for (let i = 0; i < 3; i++) { undo(); await flushSave(); redo(); await flushSave(); }
    expect(await kv.keys('images', id + '/')).toHaveLength(1);
  });
});

describe('imported files', () => {
  it('says a file cut short is damaged, not that it isn\'t ours (round 3, Sam)', () => {
    const whole = JSON.stringify({ format: 'landscape-planner-project', version: 1, project: { name: 'x', data: { shapes: [] } } });
    expect(() => parseImportFile(whole.slice(0, 60))).toThrow(/damaged or cut short/);
    expect(() => parseImportFile('\u0089PNG...')).toThrow(/isn't valid JSON/);
  });
  it('names files without runs of dashes (round 3, Grace)', () => {
    expect(safeFileName('Grace - shady oak yard')).toBe('grace-shady-oak-yard');
    expect(safeFileName('  -- ')).toBe('project');
  });
  it('dates every file by the person\'s calendar, not UTC: at 11:25 PM in Arkansas, the 31st (the UI review, 2026-11-01)', async () => {
    const was = process.env.TZ;
    process.env.TZ = 'America/Chicago';
    try {
      const late = new Date('2026-11-01T04:25:00Z'); // 11:25 PM on Oct 31 in Arkansas; Nov 1 in UTC
      expect(stamp(late)).toBe('2026-10-31');
      expect(stamp(new Date('2026-11-01T05:05:00Z'))).toBe('2026-11-01'); // (just past midnight there)
      await fresh();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(late);
      expect((await buildBackupFile()).filename).toBe('fullgrown-backup-2026-10-31.fullgrown.json');
      expect((await buildProjectFile(state.currentProjectId!))?.filename).toBe('my-garden-2026-10-31.fullgrown.json');
      expect(pdfName('Back yard', stamp())).toBe('back-yard-plan-2026-10-31.pdf');
    } finally {
      if (was === undefined) delete process.env.TZ; else process.env.TZ = was;
    }
  });
  it('cannot inject markup through colors or load remote images', () => {
    const f = { format: 'landscape-planner-project', version: 1, project: { name: 'x', data: {
      shapes: [{ type: 'triangle', color: '"/><img src=x onerror=alert(1)>' }, { type: 'circle', color: '#a855F7' }],
      bgImage: { dataUrl: 'https://tracker.example/pixel.png', naturalWidth: 10, naturalHeight: 10 },
    } } };
    const [p] = parseImportFile(JSON.stringify(f));
    expect(p.data.shapes[0].color).toBe('#16a34a');
    expect(p.data.shapes[1].color).toBe('#a855F7');
    expect(p.data.bgImage).toBeNull();
  });
});

describe('edits from an older version after migration', () => {
  it('are kept as a separate project when both versions changed it', async () => {
    localStorage.setItem('lp-projects', JSON.stringify([{ id: 'p1', name: 'Yard', lastModified: 1000 }]));
    localStorage.setItem('lp-project-p1', JSON.stringify({ shapes: [circle('base')] }));
    const kv = await fresh();
    // Edited in the new version (a minute after migrating)...
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60_000);
    state.shapes = shapes('base', 'new-version edit'); save(); await flushSave();
    // ...and later in a stale old-version tab.
    const later = Date.now() + 60_000;
    vi.setSystemTime(later + 1000);
    localStorage.setItem('lp-projects', JSON.stringify([{ id: 'p1', name: 'Yard', lastModified: later }]));
    localStorage.setItem('lp-project-p1', JSON.stringify({ shapes: [circle('base'), circle('old-version edit')] }));
    await restart(kv);
    const byName = Object.fromEntries(await Promise.all(state.projects.map(async (p) =>
      [p.name, (await readProject(p.id))!.shapes.map((s) => s.label)] as const)));
    expect(byName['Yard']).toEqual(['base', 'new-version edit']);
    expect(byName['Yard (from older version)']).toEqual(['base', 'old-version edit']);
  });

  it('a clock in the future does not re-copy on every start', async () => {
    const future = Date.now() + 10 * 24 * 3600 * 1000;
    localStorage.setItem('lp-projects', JSON.stringify([{ id: 'p1', name: 'Yard', lastModified: future }]));
    localStorage.setItem('lp-project-p1', JSON.stringify({ shapes: [circle('x')] }));
    const kv = await fresh();
    await restart(kv);
    await restart(kv);
    expect(state.projects.map((p) => p.name)).toEqual(['Yard']);
  });
});

describe('when storage will not open', () => {
  it('can still save older copies and unsaved changes to a file', async () => {
    const { buildEmergencyBackup } = await import('../src/backup');
    expect(buildEmergencyBackup()).toBeNull();
    localStorage.setItem('lp-projects', JSON.stringify([{ id: 'p1', name: 'Yard', lastModified: 5 }]));
    localStorage.setItem('lp-project-p1', JSON.stringify({ shapes: [circle('old')] }));
    localStorage.setItem('lp-journal:p1', JSON.stringify({ projectId: 'p1', at: 10, data: { shapes: [circle('pending')] } }));
    const file = buildEmergencyBackup()!;
    const restored = parseImportFile(file.text);
    expect(restored.map((p) => p.data.shapes[0].label)).toEqual(['old', 'pending']);
    expect(restored[0].name).toBe('Yard (older copy)');
  });
});

describe('a journal that could not be applied', () => {
  it('survives the next successful save and is applied on a later start', async () => {
    const kv = await fresh();
    const id = state.currentProjectId!;
    localStorage.setItem('lp-journal:' + id, JSON.stringify({ projectId: id, at: Date.now() + 1000, data: { shapes: [circle('pending')] } }));
    kv.failWrites = true;
    _resetStorageForTests();
    await initStorage(kv).catch(() => {}); // replay (and more) fails
    kv.failWrites = false;
    state.currentProjectId = id; save(); await flushSave(); // storage recovers mid-session
    expect(localStorage.getItem('lp-journal:' + id)).not.toBeNull();
    await restart(kv);
    expect(state.shapes.map((s) => s.label)).toEqual(['pending']);
  });
});
