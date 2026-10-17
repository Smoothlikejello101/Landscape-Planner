// @vitest-environment jsdom
// Background photos at the edges, from the reviews of sync step 3: a photo
// the server couldn't take (held here), conflicts around it, undo, a busy screen.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it } from 'vitest';
import { openKV } from '../src/db';
import { state } from '../src/state';
import { _resetStorageForTests, flushSave, getSyncRecords, initStorage, readProject, save, setSyncHooks, switchProject } from '../src/storage';
import { syncOnce, type Remote } from '../src/sync/engine';
import { storageLocal } from '../src/sync/local';
import { photoFingerprint } from '../src/sync/photo';
import { pushHistory, redo, undo } from '../src/history';
import { setPhotoDeviceOnly } from '../src/background';
import { FakeServer } from './fake-sync-server';

const bed = (id: string, label: string) => ({ id, type: 'rect', x: 0, y: 0, width: 4, height: 3, rotation: 0, color: '#92400e', label, opacity: 0.3, locked: false, role: 'bed' }) as any;
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const IMG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
const bg = (dataUrl: string) => ({ dataUrl, naturalWidth: 40, naturalHeight: 30, ftPerPx: 0.25, cx: 3, cy: 4, rotation: 10, opacity: 0.5, visible: true });
let n = 0;
async function use(name: string) { _resetStorageForTests(); await initStorage(await openKV('r5-' + name)); }
const local = (busy = false) => storageLocal(() => busy, () => {});
beforeEach(() => { localStorage.clear(); globalThis.indexedDB = new IDBFactory(); n++; });
async function photosOn() {
  const out: string[] = [];
  for (const p of state.projects) { const d = await readProject(p.id); out.push(`${p.name}: ${d?.bgImage?.dataUrl === IMG ? 'IMG' : d?.bgImage?.dataUrl === IMG2 ? 'IMG2' : d?.photoElsewhere ? 'elsewhere ' + JSON.stringify(d.photoElsewhere).slice(0, 30) : 'none'}`); }
  return out;
}
/** Phone with a held photo (server refused it), laptop has the plan. */
async function heldSetup(server: FakeServer) {
  server.maxPhoto = 1;
  await use('phone' + n);
  const id = state.currentProjectId!;
  state.bgImage = bg(IMG); state.shapes = [bed('a', 'a')]; save(); await flushSave();
  await syncOnce(local(), server.remoteFor('phone'), 'phone');
  expect(getSyncRecords()[id].held).toBeTruthy();
  await use('laptop' + n);
  await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
  await switchProject(id);
  return id;
}

it('a conflict keeps a held photo held: a later edit elsewhere isn’t another conflict', async () => {
  const server = new FakeServer();
  const id = await heldSetup(server);
  state.shapes = [bed('b', 'laptop 1')]; save(); await flushSave();
  await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
  await use('phone' + n); await switchProject(id);
  state.shapes = [bed('c', 'phone 1')]; save(); await flushSave();
  expect((await syncOnce(local(), server.remoteFor('phone'), 'phone')).conflicts).toHaveLength(1); // a real one
  expect(getSyncRecords()[id].held).toBeTruthy();
  await use('laptop' + n); await syncOnce(local(), server.remoteFor('laptop'), 'laptop'); await switchProject(id);
  state.shapes = [bed('d', 'laptop 2')]; save(); await flushSave();
  await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
  await use('phone' + n);
  const r2 = await syncOnce(local(), server.remoteFor('phone'), 'phone'); // no edits on the phone since
  expect(r2.conflicts).toHaveLength(0);
});

it('removing a held photo while another device edits the plan: the removal goes up', async () => {
  const server = new FakeServer();
  const id = await heldSetup(server);
  state.shapes = [bed('b', 'laptop 1')]; save(); await flushSave();
  await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
  await use('phone' + n); await switchProject(id);
  state.bgImage = null; save(); await flushSave();
  await syncOnce(local(), server.remoteFor('phone'), 'phone');
  await syncOnce(local(), server.remoteFor('phone'), 'phone');
  expect(server.rows.get(id)!.content.photo).toBeNull();
});

it('a held photo in a conflict is copied once, not twice', async () => {
  const server = new FakeServer();
  const id = await heldSetup(server);
  server.maxPhoto = 5 * 1024 * 1024;
  state.bgImage = bg(IMG2); state.photoElsewhere = null; save(); await flushSave();
  await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
  server.maxPhoto = 1;
  await use('phone' + n); await switchProject(id);
  state.bgImage = { ...state.bgImage!, cx: 9 }; save(); await flushSave();
  expect((await syncOnce(local(), server.remoteFor('phone'), 'phone')).conflicts).toHaveLength(1);
  const on = await photosOn();
  expect(on.filter((s) => s.endsWith(': IMG'))).toHaveLength(1);
});

it('while the open plan is busy, no copy is made (and nothing is scheduled)', async () => {
  const server = new FakeServer();
  const id = await heldSetup(server);
  server.maxPhoto = 5 * 1024 * 1024;
  state.bgImage = bg(IMG2); state.photoElsewhere = null; save(); await flushSave();
  await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
  await use('phone' + n); await switchProject(id);
  let projectsChanged = 0;
  setSyncHooks(() => {}, () => projectsChanged++);
  for (let i = 0; i < 3; i++) await syncOnce(local(true), server.remoteFor('phone'), 'phone');
  expect(projectsChanged).toBe(0);
});

it('undo and redo past picking a photo keep "this device only" on (nothing is uploaded)', async () => {
  const server = new FakeServer();
  await use('phone' + n);
  state.history = []; state.historyIndex = -1; pushHistory();
  state.bgImage = bg(IMG); pushHistory(); save();
  setPhotoDeviceOnly(true); await flushSave();
  undo(); undo(); redo(); await flushSave();
  await syncOnce(local(), server.remoteFor('phone'), 'phone');
  expect(server.photos.size).toBe(0);
});

it('an upload refused because another device just stored the same photo isn’t taken as "kept here"', async () => {
  const server = new FakeServer();
  await use('phone' + n);
  const id = state.currentProjectId!;
  state.bgImage = bg(IMG); save(); await flushSave();
  const base = server.remoteFor('phone');
  const fp = await photoFingerprint(IMG);
  const remote: Remote = { ...base, putPhoto: async () => { server.photos.set(fp, IMG); throw new Error('new row violates row-level security policy'); } };
  expect((await syncOnce(local(), remote, 'phone')).photosKept).toEqual([]);
  expect(server.rows.get(id)!.content.photo).not.toEqual({ deviceOnly: true });
});
