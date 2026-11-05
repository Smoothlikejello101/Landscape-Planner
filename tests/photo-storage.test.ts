// @vitest-environment jsdom
// Database version 5's two fields (Nov 4), a photo's rough scale and the sides of a shape typed as numbers, through
// this device's real storage (fake IndexedDB) and sync (src/sync/local.ts) against a stand-in server, and odd values
// stored or synced. From the independent review's probes (docs/storage.md).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { openKV } from '../src/db';
import { state } from '../src/state';
import { _resetStorageForTests, flushSave, initStorage, migrateBgImage, migrateShape, readProject, sanitizePhotoRef, sanitizeProjectData, save, writeJournalIfDirty } from '../src/storage';
import { photoKey, planHash, syncOnce, withLocalParts } from '../src/sync/engine';
import { storageLocal } from '../src/sync/local';
import { FakeServer } from './fake-sync-server';
import type { Shape } from '../src/types';
import { afterPointInserted, afterPointRemoved, forgetChangedSides, measuredSides, setTypedSides } from '../src/measured';

let n = 0;
async function device() { _resetStorageForTests(); globalThis.indexedDB = new IDBFactory(); await initStorage(await openKV('ps-' + ++n)); }
async function restart() { _resetStorageForTests(); await initStorage(await openKV('ps-' + n)); }
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const local = () => storageLocal(() => false, () => {});
const pass = (server: FakeServer) => syncOnce(local(), server.remoteFor('phone'), 'phone');
const bg = (extra: object = {}) => ({ dataUrl: IMG, naturalWidth: 40, naturalHeight: 30, ftPerPx: 0.25, cx: 3, cy: 4, rotation: 0, opacity: 0.5, visible: true, ...extra });
const ALL = [{ side: 0, ft: 30 }, { side: 1, ft: 20 }, { side: 2, ft: 30 }, { side: 3, ft: 20 }];
const house = (extra: object = {}): Shape => ({ id: 'h1', type: 'rect', x: 0, y: 0, width: 30, height: 20, rotation: 0, color: '#78716c', label: 'House', opacity: 0.8, locked: false, role: 'building', ...extra } as Shape);
const strip = (s: Record<string, unknown>) => { const { measured: _m, ...rest } = s; return rest; };
const typed = (s: Shape) => [...((s as { measured?: { side: number; ft: number }[] }).measured ?? [])].sort((a, b) => a.side - b.side);
/** Another device's upload, as the server then has it: `f` of its content. */
function uploadThere(server: FakeServer, id: string, f: (c: Record<string, unknown>) => Record<string, unknown>, by = 'laptop') {
  const row = server.rows.get(id)!;
  row.content = f(row.content); row.revision++; row.updated_by = by;
}

beforeEach(() => { localStorage.clear(); });

describe('through this device\'s storage and sync', () => {
  it('a release device moves the photo: the rough scale here is kept; nothing goes up, no copy', async () => {
    const server = new FakeServer(); await device();
    const id = state.currentProjectId!;
    state.bgImage = bg({ roughScale: true }); state.shapes = [house()]; save(); await flushSave();
    expect(await pass(server)).toMatchObject({ uploaded: 1 });
    expect(server.rows.get(id)!.content.photo).toMatchObject({ roughScale: true });
    uploadThere(server, id, (c) => { const { roughScale: _r, ...ph } = c.photo as Record<string, unknown>; return { ...c, photo: { ...ph, cx: 9 } }; });
    expect(await pass(server)).toMatchObject({ downloaded: 1, uploaded: 0, conflicts: [] });
    expect(state.bgImage).toMatchObject({ cx: 9, roughScale: true, dataUrl: IMG });
    expect(await pass(server)).toMatchObject({ downloaded: 0, uploaded: 0 });
  });

  it("the cost of the placePhoto fix (docs/storage.md): a build from before Oct 30, which has no word for \"not to scale yet\", moving the same photo clears it here", async () => {
    const server = new FakeServer(); await device();
    const id = state.currentProjectId!;
    state.bgImage = bg({ uncalibrated: true }); state.shapes = [house()]; save(); await flushSave();
    await pass(server);
    uploadThere(server, id, (c) => { const { uncalibrated: _u, ...ph } = c.photo as Record<string, unknown>; return { ...c, photo: { ...ph, cx: 9 } }; }, 'old-laptop');
    await pass(server);
    expect(state.bgImage).toMatchObject({ cx: 9 });
    expect(state.bgImage).not.toHaveProperty('uncalibrated');
  });

  it('a release device moves the house: its typed sides here kept (the same size); nothing goes up, no copy', async () => {
    const server = new FakeServer(); await device();
    const id = state.currentProjectId!;
    state.shapes = [house({ measured: ALL })]; save(); await flushSave();
    await pass(server);
    uploadThere(server, id, (c) => ({ ...c, shapes: (c.shapes as Record<string, unknown>[]).map((s) => ({ ...strip(s), x: 5 })) }));
    expect(await pass(server)).toMatchObject({ downloaded: 1, uploaded: 0, conflicts: [] });
    expect(state.shapes[0]).toMatchObject({ x: 5, measured: ALL });
  });

  it("the review's R4: a device of this version that never had them types the Width (32); the typed Length here, still 20, is kept beside it", async () => {
    const server = new FakeServer(); await device();
    const id = state.currentProjectId!;
    state.shapes = [house({ measured: ALL })]; save(); await flushSave();
    await pass(server);
    // (A release device's edit had gone up without them, and a tablet of this version took the plan then: it has none.)
    uploadThere(server, id, (c) => ({ ...c, shapes: [{ ...strip((c.shapes as Record<string, unknown>[])[0]), width: 32, measured: [{ side: 0, ft: 32 }, { side: 2, ft: 32 }] }] }), 'tablet');
    expect(await pass(server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(state.shapes[0]).toMatchObject({ width: 32, height: 20 });
    expect(typed(state.shapes[0])).toEqual([{ side: 0, ft: 32 }, { side: 1, ft: 20 }, { side: 2, ft: 32 }, { side: 3, ft: 20 }]);
    expect(typed((await readProject(id))!.shapes[0])).toEqual(typed(state.shapes[0]));
  });

  it('a side typed again at the length it has, alone, left in a journal, is put in place at the next start', async () => {
    await device();
    const id = state.currentProjectId!;
    state.shapes = [house()]; save(); await flushSave();
    setTypedSides(state.shapes[0], [0, 2], 30); save(); // (not saved yet)
    writeJournalIfDirty();
    await restart();
    expect(typed((await readProject(id))!.shapes[0])).toEqual([{ side: 0, ft: 30 }, { side: 2, ft: 30 }]);
    expect(state.projects.map((p) => p.name)).toEqual(['My Garden']);
  });

  it('the windows left (docs/storage.md): a side typed again at its length waits for an edit to go up; the scale set again unticked at exactly the same scale, another copy\'s rough scale comes back', async () => {
    const server = new FakeServer(); await device();
    const id = state.currentProjectId!;
    state.shapes = [house({ measured: [{ side: 1, ft: 20 }, { side: 3, ft: 20 }] })]; state.bgImage = bg({ roughScale: true }); save(); await flushSave();
    await pass(server);
    setTypedSides(state.shapes[0], [0, 2], 30); delete state.bgImage!.roughScale; save(); await flushSave();
    expect(await pass(server)).toMatchObject({ uploaded: 0 });
    // Another device of this version moves the house and the photo: its copy comes down, its sides typed standing.
    uploadThere(server, id, (c) => ({ ...c, shapes: [{ ...(c.shapes as Record<string, unknown>[])[0], x: 3 }], photo: { ...(c.photo as object), cx: 7 } }), 'tablet');
    await pass(server);
    expect(typed(state.shapes[0])).toEqual([{ side: 0, ft: 30 }, { side: 1, ft: 20 }, { side: 2, ft: 30 }, { side: 3, ft: 20 }]); // (side by side: kept)
    expect(state.bgImage).toMatchObject({ cx: 7, roughScale: true });
  });
});

describe('odd values, stored or synced', () => {
  it('nothing throws; only sound entries survive, on the shapes that keep them', () => {
    const rect = (measured: unknown) => ({ id: 'r', type: 'rect', x: 0, y: 0, width: 30, height: 20, rotation: 0, measured });
    const poly = (measured: unknown, points: unknown = [[0, 0], [10, 0], [10, 10], [0, 10]]) => ({ id: 'p', type: 'poly', x: 0, y: 0, points, rotation: 0, measured });
    const weird: unknown[] = [
      null, 1, 'x', {}, [], [null], [1, 'a'], [{ side: '0', ft: 1 }], [{ side: 0.5, ft: 1 }], [{ side: -1, ft: 1 }], [{ side: 4, ft: 1 }],
      [{ side: 0, ft: 0 }], [{ side: 0, ft: -1 }], [{ side: 0, ft: Infinity }], [{ side: 0, ft: NaN }], [{ side: 0, ft: 5001 }], [{ side: 0, ft: '3' }],
      [{ side: 0, ft: 3 }, { side: 0, ft: 4 }], [[0, 3]], [{ side: 1e308, ft: 3 }], [{ side: -0, ft: 3 }],
      Array.from({ length: 100000 }, (_, i) => ({ side: i % 4, ft: 1 })),
      JSON.parse('[{"side":1,"ft":2,"__proto__":{"polluted":true}}]'),
    ];
    for (const m of weird) {
      for (const s of [migrateShape(rect(m)), migrateShape(poly(m))] as ({ measured?: { side: number; ft: number }[] } & Shape)[]) {
        expect(s).toBeTruthy();
        for (const e of s.measured ?? []) {
          expect(Object.keys(e).sort()).toEqual(['ft', 'side']);
          expect(Number.isInteger(e.side) && e.side >= 0 && e.side < 4).toBe(true);
          expect(e.ft > 0 && e.ft <= 5000).toBe(true);
        }
        expect(() => { measuredSides(s); forgetChangedSides(s); afterPointInserted(s, 1); afterPointRemoved(s, 1, 4, true); }).not.toThrow();
      }
    }
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    for (const t of ['oval', 'triangle', 'circle', 'text']) expect(migrateShape({ ...rect([{ side: 0, ft: 3 }]), type: t, radius: 2 })).not.toHaveProperty('measured');
    expect(migrateShape(poly([{ side: 2, ft: 10 }], [[0, 0], [10, 0], ['x', 1], [10, 10], [0, 10]]))).not.toHaveProperty('measured');
  });

  it('a rough scale only as true, never with "not to scale yet", through sync references too', () => {
    for (const v of [1, 'true', {}, [], false, null]) {
      expect(migrateBgImage({ dataUrl: '', roughScale: v as never })).not.toHaveProperty('roughScale');
      expect(sanitizePhotoRef({ fingerprint: 'a'.repeat(64), roughScale: v })).not.toHaveProperty('roughScale');
    }
    expect(migrateBgImage({ dataUrl: '', roughScale: true, uncalibrated: true })).not.toHaveProperty('roughScale');
    expect(sanitizePhotoRef({ fingerprint: 'a'.repeat(64), roughScale: true })).toMatchObject({ roughScale: true });
  });

  it("odd copies on the server, kept from here: nothing throws; nothing put on another kind of shape", () => {
    const mine = { shapes: [migrateShape({ id: 'r', type: 'rect', x: 0, y: 0, width: 30, height: 20, rotation: 0, measured: [{ side: 0, ft: 30 }] })!, migrateShape({ id: 'p', type: 'poly', x: 0, y: 0, points: [[0, 0], [10, 0], [10, 10], [0, 10]], rotation: 0, measured: [{ side: 1, ft: 10 }] })!], photo: { fingerprint: 'a'.repeat(64), ftPerPx: 0.25, roughScale: true } };
    const servers: unknown[] = [
      { shapes: [null, 1, 'x', { id: 'r' }, { id: 'r', type: 'rect', width: '30', height: 20 }, { id: { toString: () => 'r' } }] },
      { shapes: [{ id: 'r', type: 'rect', width: 30, height: 20, measured: null }] },
      { shapes: [{ id: 'r', type: 'rect', width: 30, height: 20, measured: 'x' }, { id: 'p', type: 'poly', points: [[0, 0], 'x', [10, 10], [0, 10]], measured: [7] }] },
      { shapes: 'nope', photo: 'nope' },
      { shapes: [{ id: 'p', type: 'poly', points: 'x' }], photo: { fingerprint: 'a'.repeat(64), ftPerPx: '0.25' } },
      { shapes: [{ id: 'p', type: 'line', points: [[0, 0], [10, 0], [10, 10], [0, 10]] }] },
    ];
    for (const s of servers) {
      const out = withLocalParts(s as never, mine as never);
      expect(() => sanitizeProjectData(out)).not.toThrow();
      const sh = Array.isArray((out as { shapes?: unknown }).shapes) ? (out as { shapes: Record<string, unknown>[] }).shapes : [];
      for (const x of sh) if (x && typeof x === 'object' && Array.isArray(x.measured) && x.measured.length) expect(x).toMatchObject({ type: x.id === 'r' ? 'rect' : 'poly' });
      expect(() => [planHash('x', out as never), photoKey(out as never)]).not.toThrow();
    }
  });
});
