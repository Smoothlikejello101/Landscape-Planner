// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { openKV } from '../src/db';
import { state } from '../src/state';
import { _resetStorageForTests, createProject, deleteProject, flushSave, getSyncRecords, getSyncTombstones, initStorage, readProject, save, switchProject } from '../src/storage';
import { syncOnce } from '../src/sync/engine';
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
