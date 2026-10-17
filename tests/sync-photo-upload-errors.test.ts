// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it } from 'vitest';
import { openKV, put } from '../src/db';
import { state } from '../src/state';
import { _resetStorageForTests, flushSave, getSyncRecords, initStorage, readProject, save, switchProject } from '../src/storage';
import { syncOnce, type Remote } from '../src/sync/engine';
import { storageLocal } from '../src/sync/local';
import { FakeServer } from './fake-sync-server';

const bed = (id: string, label: string) => ({ id, type: 'rect', x: 0, y: 0, width: 4, height: 3, rotation: 0, color: '#92400e', label, opacity: 0.3, locked: false, role: 'bed' }) as any;
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const bg = (dataUrl: string) => ({ dataUrl, naturalWidth: 40, naturalHeight: 30, ftPerPx: 0.25, cx: 3, cy: 4, rotation: 10, opacity: 0.5, visible: true });
let n = 0;
async function use(name: string) { _resetStorageForTests(); await initStorage(await openKV('r6-' + name)); }
const local = (busy = false) => storageLocal(() => busy, () => {});
beforeEach(() => { localStorage.clear(); globalThis.indexedDB = new IDBFactory(); n++; });

it('an upload error that keeps happening is reported, not silent', async () => {
  const server = new FakeServer();
  await use('phone' + n);
  const id = state.currentProjectId!;
  state.bgImage = bg(IMG); state.shapes = [bed('a', 'a')]; save(); await flushSave();
  const base = server.remoteFor('phone');
  const remote: Remote = { ...base, putPhoto: async () => { throw new Error('Bucket not found'); } };
  const reports = [];
  for (let i = 0; i < 3; i++) reports.push(await syncOnce(local(), remote, 'phone'));
  expect(server.rows.has(id)).toBe(false); // (the plan waits for its photo)
  expect(reports.every((r) => r.failed.length === 1)).toBe(true); // and the status line says so
});

it('a record from an early test build (held: true) still protects the photo', async () => {
  const server = new FakeServer();
  server.maxPhoto = 1;
  await use('phone' + n);
  const id = state.currentProjectId!;
  state.bgImage = bg(IMG); state.shapes = [bed('a', 'a')]; save(); await flushSave();
  await syncOnce(local(), server.remoteFor('phone'), 'phone');
  const rec = getSyncRecords()[id];
  expect(rec.held).toBe('refused');
  // As the earlier build stored it.
  await (await openKV('r6-phone' + n)).write([put('kv', 'syncRecords', { [id]: { ...rec, held: true } })]);
  await use('laptop' + n);
  await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
  await switchProject(id);
  state.shapes = [bed('b', 'laptop')]; save(); await flushSave();
  await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
  await use('phone' + n);
  await syncOnce(local(), server.remoteFor('phone'), 'phone');
  const photos = [];
  for (const p of state.projects) { const d = await readProject(p.id); photos.push(`${p.name}: ${d?.bgImage?.dataUrl === IMG ? 'IMG' : JSON.stringify(d?.photoElsewhere)}`); }
  expect(photos.some((s) => s.endsWith('IMG'))).toBe(true);
});
