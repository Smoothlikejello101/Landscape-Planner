// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { openKV } from '../src/db';
import { state } from '../src/state';
import { _resetStorageForTests, createProject, deleteProject, flushSave, getSyncRecords, getSyncTombstones, getSyncUser, initStorage, readProject, renameProject, resetSyncState, save, switchProject } from '../src/storage';
import { syncOnce, type Remote } from '../src/sync/engine';
import { storageLocal } from '../src/sync/local';
import { FakeServer } from './fake-sync-server';
import type { Shape } from '../src/types';

// Sync against this device's real storage (in a stand-in IndexedDB) and a stand-in server.

let n = 0;
async function device() {
  _resetStorageForTests();
  globalThis.indexedDB = new IDBFactory();
  await initStorage(await openKV('sync-' + ++n));
}
/** Restart the app on the same device (same storage). */
async function restart() {
  _resetStorageForTests();
  await initStorage(await openKV('sync-' + n));
}
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
/** A server whose answer arrives after the user does something (the network is slow). */
function slow(r: Remote, step: 'fetch' | 'push', during: () => Promise<unknown>): Remote {
  let done = false;
  const once = async () => { if (!done) { done = true; await during(); } };
  return { ...r, fetch: async (ids) => { if (step === 'fetch') await once(); return r.fetch(ids); }, push: async (...a) => { if (step === 'push') await once(); return r.push(...a); } };
}
const labels = async (id: string) => (await readProject(id))!.shapes.map((s) => s.label);
const bed = (id: string, label: string): Shape => ({ id, type: 'rect', x: 0, y: 0, width: 4, height: 3, rotation: 0, color: '#92400e', label, opacity: 0.3, locked: false, role: 'bed' });
let opened = 0;
const local = (busy = false) => storageLocal(() => busy, () => { opened++; });

beforeEach(() => { localStorage.clear(); opened = 0; });

describe('sync with this device’s storage', () => {
  it('uploads, then brings another device’s edit into the open plan, keeping this device’s view', async () => {
    const server = new FakeServer();
    await device();
    const id = state.currentProjectId!;
    state.shapes = [bed('b1', 'Front bed')]; state.zoom = 2; save(); await flushSave();
    expect(await syncOnce(local(), server.remoteFor('phone'), 'phone')).toMatchObject({ uploaded: 1 });
    expect(getSyncRecords()[id]).toMatchObject({ revision: 1 });
    // The laptop renames the bed.
    const row = server.rows.get(id)!;
    row.content = { ...row.content, shapes: [bed('b1', 'Back bed')] }; row.revision = 2; row.updated_by = 'laptop';
    expect(await syncOnce(local(), server.remoteFor('phone'), 'phone')).toMatchObject({ downloaded: 1, uploaded: 0 });
    expect(state.shapes.map((s) => s.label)).toEqual(['Back bed']);
    expect(state.zoom).toBe(2); // the view is this device's own
    expect(opened).toBe(1);
    // Read back from storage, it fingerprints the same: nothing to upload.
    expect(await syncOnce(local(), server.remoteFor('phone'), 'phone')).toMatchObject({ uploaded: 0, downloaded: 0 });
  });

  it('never replaces the open plan while it’s in use, and loses nothing in a conflict', async () => {
    const server = new FakeServer();
    await device();
    const id = state.currentProjectId!;
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    const row = server.rows.get(id)!;
    row.content = { ...row.content, shapes: [bed('x', 'From laptop')] }; row.revision = 2;
    expect(await syncOnce(local(true), server.remoteFor('phone'), 'phone')).toMatchObject({ downloaded: 0 }); // busy: waits
    // Meanwhile an edit here: now both changed.
    state.shapes = [bed('y', 'From phone')]; save(); await flushSave();
    const r = await syncOnce(local(), server.remoteFor('phone'), 'phone');
    expect(r.conflicts).toHaveLength(1);
    expect(state.shapes.map((s) => s.label)).toEqual(['From laptop']); // the server's version keeps the place
    const copy = state.projects.find((p) => p.name.startsWith('My Garden — copy from phone'))!;
    expect((await readProject(copy.id))!.shapes.map((s) => s.label)).toEqual(['From phone']); // ours, kept
    expect(server.rows.get(copy.id)).toBeTruthy(); // and synced
  });

  it('a project deleted here goes to the server’s trash; one deleted there leaves here', async () => {
    const server = new FakeServer();
    await device();
    const other = await createProject('Side yard');
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    await deleteProject(other);
    expect(getSyncTombstones()).toEqual({ [other]: 1 });
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    expect(server.rows.get(other)!.deleted).toBe(true);
    expect(getSyncTombstones()).toEqual({});
    // Deleted elsewhere: the open project. Another opens; nothing else goes.
    const open = state.currentProjectId!;
    server.rows.get(open)!.deleted = true;
    const r = await syncOnce(local(), server.remoteFor('phone'), 'phone');
    expect(r.removed).toEqual(['My Garden']);
    expect(state.projects.map((p) => p.name)).toEqual(['My Garden']); // a fresh one, so there's always a plan
    expect(state.currentProjectId).not.toBe(open);
  });

  it('projects from another device arrive as they were, under the same id', async () => {
    const server = new FakeServer();
    await device();
    server.rows.set('far-away', { name: 'Cabin', content: { shapes: [bed('c', 'Cabin bed')], phases: ['Spring 2027'] }, revision: 3, updated_by: 'laptop', deleted: false });
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    const got = await readProject('far-away');
    expect(got!.shapes.map((s) => s.label)).toEqual(['Cabin bed']);
    expect(got!.phases).toEqual(['Spring 2027']);
    expect(getSyncRecords()['far-away']).toMatchObject({ revision: 3 });
    await switchProject('far-away');
    expect(await syncOnce(local(), server.remoteFor('phone'), 'phone')).toMatchObject({ uploaded: 0, downloaded: 0 });
  });
});

describe('edits made while a sync works (real storage)', () => {
  /** This device and the server in step, with another device's change waiting on the server. */
  async function changedElsewhere(server: FakeServer, id: string, label: string) {
    const row = server.rows.get(id)!;
    row.content = { ...row.content, shapes: [bed('l', label)] }; row.revision++; row.updated_by = 'laptop';
  }

  it('the open plan: an edit made while a download is fetched is kept', async () => {
    const server = new FakeServer(); await device();
    const id = state.currentProjectId!;
    state.shapes = [bed('a', 'v1')]; save(); await flushSave();
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    await changedElsewhere(server, id, 'laptop');
    const r = await syncOnce(local(), slow(server.remoteFor('phone'), 'fetch', async () => { state.shapes = [...state.shapes, bed('p', 'phone, mid-sync')]; save(); }), 'phone');
    expect(r.downloaded).toBe(0);
    expect(state.shapes.map((s) => s.label)).toEqual(['v1', 'phone, mid-sync']);
    await flushSave();
    expect(await labels(id)).toEqual(['v1', 'phone, mid-sync']);
    // The next pass: a conflict, both kept.
    const r2 = await syncOnce(local(), server.remoteFor('phone'), 'phone');
    const copy = state.projects.find((p) => p.name === r2.conflicts[0].copyName)!;
    expect(await labels(copy.id)).toEqual(['v1', 'phone, mid-sync']);
    expect(state.shapes.map((s) => s.label)).toEqual(['laptop']);
  });

  it('a plan edited and then switched away from during a download is kept', async () => {
    const server = new FakeServer(); await device();
    const a = state.currentProjectId!;
    state.shapes = [bed('a', 'v1')]; save();
    const b = await createProject('Other');
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    await changedElsewhere(server, a, 'laptop');
    await syncOnce(local(), slow(server.remoteFor('phone'), 'fetch', async () => { state.shapes = [bed('p', 'phone edit')]; save(); await switchProject(b); }), 'phone');
    expect(await labels(a)).toEqual(['phone edit']);
  });

  it('a conflict’s copy holds everything, even an edit made while it was settled', async () => {
    const server = new FakeServer(); await device();
    const id = state.currentProjectId!;
    state.shapes = [bed('a', 'v1')]; save(); await flushSave();
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    await changedElsewhere(server, id, 'laptop');
    state.shapes = [bed('p1', 'phone 1')]; save(); await flushSave();
    const r = await syncOnce(local(), slow(server.remoteFor('phone'), 'fetch', async () => { state.shapes = [...state.shapes, bed('p2', 'phone 2')]; save(); await flushSave(); }), 'phone');
    expect(r.conflicts).toEqual([]); // waits: the plan moved on
    expect(state.projects).toHaveLength(1); // no stray copy
    const r2 = await syncOnce(local(), server.remoteFor('phone'), 'phone');
    const copy = state.projects.find((p) => p.name === r2.conflicts[0].copyName)!;
    expect(await labels(copy.id)).toEqual(['phone 1', 'phone 2']);
  });

  it('the open plan deleted elsewhere stays if it’s edited while the sync works', async () => {
    const server = new FakeServer(); await device();
    const a = state.currentProjectId!;
    state.shapes = [bed('a', 'v1')]; save();
    const b = await createProject('Other'); // listed first
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    server.rows.get(a)!.deleted = true;
    await renameProject(b, 'Other, renamed'); // so the pass uploads it first; the edit lands during that upload
    const r = await syncOnce(local(), slow(server.remoteFor('phone'), 'push', async () => { state.shapes = [bed('p', 'PHONE EDIT')]; save(); }), 'phone');
    expect(r.removed).toEqual([]);
    expect(state.currentProjectId).toBe(a);
    expect(state.shapes.map((s) => s.label)).toEqual(['PHONE EDIT']);
  });

  it('the open plan deleted elsewhere waits while it’s in use on screen', async () => {
    const server = new FakeServer(); await device();
    const a = state.currentProjectId!;
    state.shapes = [bed('a', 'v1')]; save();
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    server.rows.get(a)!.deleted = true;
    expect((await syncOnce(local(true), server.remoteFor('phone'), 'phone')).removed).toEqual([]);
    expect(state.currentProjectId).toBe(a);
  });

  it('a project deleted while its first upload was under way goes to the trash, even after a restart', async () => {
    const server = new FakeServer(); await device();
    const side = await createProject('Side yard');
    await syncOnce(local(), slow(server.remoteFor('phone'), 'push', () => deleteProject(side)), 'phone');
    expect(getSyncTombstones()).toEqual({ [side]: 1 });
    await restart();
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    expect(server.rows.get(side)!.deleted).toBe(true);
    expect(state.projects.map((p) => p.name)).toEqual(['My Garden']);
  });
});

describe('opening a project while sync changes it', () => {
  it('sync replaces it: the opened plan shows the new version, and nothing goes back up', async () => {
    for (const delay of [0, 3, 8]) {
      const server = new FakeServer(); await device();
      const home = state.currentProjectId!;
      const z = await createProject('Z');
      await switchProject(z); state.shapes = [bed('z1', 'mine')]; save(); await flushSave(); await switchProject(home);
      await syncOnce(local(), server.remoteFor('phone'), 'phone');
      const row = server.rows.get(z)!;
      row.content = { ...row.content, shapes: [bed('z1', 'mine'), bed('z2', 'laptop')] }; row.revision++;
      let opening: Promise<boolean> | null = null;
      const base = server.remoteFor('phone');
      const remote: Remote = { ...base, fetch: async (ids) => { const got = await base.fetch(ids); opening = switchProject(z); for (let i = 0; i < delay; i++) await Promise.resolve(); return got; } };
      await syncOnce(local(), remote, 'phone');
      expect(await opening).toBe(true);
      expect(state.shapes.map((s) => s.label)).toEqual(['mine', 'laptop']);
      expect(await syncOnce(local(), server.remoteFor('phone'), 'phone')).toMatchObject({ uploaded: 0, conflicts: [] });
    }
  });

  it('sync removes it: it doesn’t open (no edits go into a project that’s gone)', async () => {
    for (const delay of [0, 3, 8]) {
      const server = new FakeServer(); await device();
      const home = state.currentProjectId!;
      const z = await createProject('Z');
      await syncOnce(local(), server.remoteFor('phone'), 'phone');
      server.rows.get(z)!.deleted = true;
      const loc = local();
      const remove = loc.remove;
      let opening: Promise<boolean> | null = null;
      loc.remove = async (id, token) => { if (id === z) { opening = switchProject(z); for (let i = 0; i < delay; i++) await Promise.resolve(); } return remove(id, token); };
      await syncOnce(loc, server.remoteFor('phone'), 'phone');
      expect(await opening).toBe(false);
      expect(state.currentProjectId).toBe(home);
      expect(state.projects.map((p) => p.id)).toEqual([home]);
    }
  });
});

describe('what the server can store', () => {
  it('text the server can’t hold is left out, and nothing looks changed afterwards', async () => {
    const server = new FakeServer(); await device();
    state.shapes = [bed('a', 'Rose\u0000 bed 🌹'.slice(0, 11))]; save(); // NUL, and a cut that splits the emoji
    const r = await syncOnce(local(), server.remoteFor('phone'), 'phone');
    expect(r).toMatchObject({ uploaded: 1, failed: [] });
    expect(await syncOnce(local(), server.remoteFor('phone'), 'phone')).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: [] });
  });

  it('a very long name doesn’t look like a conflict', async () => {
    const server = new FakeServer(); await device();
    await renameProject(state.currentProjectId!, 'Back yard '.repeat(30));
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    expect([...server.rows.values()][0].name).toHaveLength(199); // 200, less the trailing space
    expect(await syncOnce(local(), server.remoteFor('phone'), 'phone')).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: [] });
  });
});

describe('sync state on the device', () => {
  it('whose it is is kept with the plans', async () => {
    await device();
    expect(getSyncUser()).toBeNull();
    await resetSyncState('user-a');
    await restart();
    expect(getSyncUser()).toBe('user-a');
  });

  it('a conflict copy keeps the background photo', async () => {
    const server = new FakeServer(); await device();
    const id = state.currentProjectId!;
    state.bgImage = { dataUrl: IMG, naturalWidth: 4, naturalHeight: 4, ftPerPx: 1, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true };
    state.shapes = [bed('a', 'v1')]; save(); await flushSave();
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    const row = server.rows.get(id)!; row.content = { ...row.content, shapes: [bed('l', 'laptop')] }; row.revision++;
    state.shapes = [bed('p', 'phone')]; save(); await flushSave();
    const r = await syncOnce(local(), server.remoteFor('phone'), 'phone');
    const copy = state.projects.find((p) => p.name === r.conflicts[0].copyName)!;
    expect((await readProject(copy.id))!.bgImage?.dataUrl).toBe(IMG);
    expect(state.bgImage?.dataUrl).toBe(IMG); // and the original keeps its own
  });
});

describe('background photos (real storage)', () => {
  const IMG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  const bg = (dataUrl: string) => ({ dataUrl, naturalWidth: 40, naturalHeight: 30, ftPerPx: 0.25, cx: 3, cy: 4, rotation: 10, opacity: 0.5, visible: true });

  it('go up with their plan and arrive on another device, placed the same', async () => {
    const server = new FakeServer(); await device();
    const id = state.currentProjectId!;
    state.bgImage = bg(IMG); state.shapes = [bed('a', 'bed')]; save(); await flushSave();
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    expect(server.photoUploads).toBe(1);
    const fp = [...server.photos.keys()][0];
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(server.rows.get(id)!.content.photo).toMatchObject({ fingerprint: fp, ftPerPx: 0.25, rotation: 10 });
    // A second device (its own storage).
    await device();
    await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
    const got = await readProject(id);
    expect(got!.bgImage).toMatchObject({ dataUrl: IMG, ftPerPx: 0.25, cx: 3, cy: 4, rotation: 10, opacity: 0.5 });
    expect(await syncOnce(local(), server.remoteFor('laptop'), 'laptop')).toMatchObject({ uploaded: 0, downloaded: 0 });
    // Recalibrated on this device: only the placement travels, not the photo again.
    await switchProject(id);
    state.bgImage = { ...state.bgImage!, ftPerPx: 0.3 }; save(); await flushSave();
    await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
    expect(server.photoUploads).toBe(1);
    expect(server.rows.get(id)!.content.photo).toMatchObject({ ftPerPx: 0.3 });
  });

  it('a photo that isn’t on the server yet: the plan arrives without it and it fills in later', async () => {
    const server = new FakeServer(); await device();
    const id = state.currentProjectId!;
    state.bgImage = bg(IMG); save(); await flushSave();
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    const [fp, bytes] = [...server.photos][0]; server.photos.delete(fp);
    await device();
    await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
    await switchProject(id);
    expect(state.bgImage).toBeNull();
    expect(state.photoElsewhere).toMatchObject({ fingerprint: fp });
    expect(await syncOnce(local(), server.remoteFor('laptop'), 'laptop')).toMatchObject({ uploaded: 0 }); // waiting isn't an edit
    server.photos.set(fp, bytes);
    await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
    expect(state.bgImage?.dataUrl).toBe(IMG);
    expect(state.photoElsewhere).toBeNull();
    await restart();
    expect((await readProject(id))!.bgImage?.dataUrl).toBe(IMG);
  });

  it('kept on this device: never uploaded; another device’s new photo doesn’t lose it', async () => {
    const server = new FakeServer(); await device();
    const id = state.currentProjectId!;
    state.bgImage = { ...bg(IMG), deviceOnly: true }; state.shapes = [bed('a', 'bed')]; save(); await flushSave();
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    expect(server.photoUploads).toBe(0);
    expect(server.rows.get(id)!.content.photo).toEqual({ deviceOnly: true });
    // Another device puts a different photo on the plan.
    const row = server.rows.get(id)!;
    server.photos.set('f'.repeat(64), IMG2);
    row.content = { ...row.content, photo: { fingerprint: 'f'.repeat(64), ...bg(IMG2), dataUrl: undefined } }; row.revision++;
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    expect(state.bgImage?.dataUrl).toBe(IMG2);
    const copy = state.projects.find((p) => p.name.includes('with this device’s photo'))!;
    expect((await readProject(copy.id))!.bgImage).toMatchObject({ dataUrl: IMG, deviceOnly: true });
  });

  it('a photo whose stored bytes went missing comes back from the server', async () => {
    const server = new FakeServer(); await device();
    const home = state.currentProjectId!;
    const id = await createProject('Side');
    await switchProject(id);
    state.bgImage = bg(IMG); save(); await flushSave();
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    await switchProject(home);
    await restart();
    const { openKV: open } = await import('../src/db');
    const kv = await open('sync-' + n);
    const keys = await kv.keys('images', id + '/');
    await kv.write(keys.map((k) => ({ store: 'images' as const, key: k, value: undefined })));
    await restart();
    expect((await readProject(id))!.photoElsewhere).toMatchObject({ fingerprint: [...server.photos.keys()][0] });
    await syncOnce(local(), server.remoteFor('phone'), 'phone');
    expect((await readProject(id))!.bgImage?.dataUrl).toBe(IMG);
  });
});

