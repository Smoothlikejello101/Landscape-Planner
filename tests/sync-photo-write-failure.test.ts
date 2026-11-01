// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it } from 'vitest';
import { openKV, type KV, type WriteOp } from '../src/db';
import { state } from '../src/state';
import { _resetStorageForTests, flushSave, getSyncRecords, initStorage, readProject, save, switchProject } from '../src/storage';
import { syncOnce } from '../src/sync/engine';
import { storageLocal } from '../src/sync/local';
import { FakeServer } from './fake-sync-server';

const bed = (id: string, label: string) => ({ id, type: 'rect', x: 0, y: 0, width: 4, height: 3, rotation: 0, color: '#92400e', label, opacity: 0.3, locked: false, role: 'bed' }) as any;
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const IMG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
const bg = (dataUrl: string) => ({ dataUrl, naturalWidth: 40, naturalHeight: 30, ftPerPx: 0.25, cx: 3, cy: 4, rotation: 10, opacity: 0.5, visible: true });
class FlakyKV implements KV {
  failWhen: ((ops: WriteOp[]) => boolean) | null = null;
  constructor(private inner: KV) {}
  get durable() { return this.inner.durable; }
  get<T>(s: any, k: string) { return this.inner.get<T>(s, k); }
  getAll<T>(s: any) { return this.inner.getAll<T>(s); }
  keys(s: any, p?: string) { return this.inner.keys(s, p); }
  write(ops: WriteOp[]) { if (this.failWhen?.(ops)) return Promise.reject(new DOMException('full', 'QuotaExceededError')); return this.inner.write(ops); }
  changeAllOnce(...a: Parameters<KV['changeAllOnce']>) { return this.inner.changeAllOnce(...a); }
}
let n = 0;
const kvs = new Map<string, FlakyKV>();
async function use(name: string) { _resetStorageForTests(); let kv = kvs.get(name); if (!kv) { kv = new FlakyKV(await openKV('r6b-' + name)); kvs.set(name, kv); } await initStorage(kv); return kv; }
const local = () => storageLocal(() => false, () => {});
beforeEach(() => { localStorage.clear(); globalThis.indexedDB = new IDBFactory(); n++; kvs.clear(); });

it('a failed write while another device’s photo arrives keeps the copy holding this device’s photo', async () => {
  const server = new FakeServer();
  server.maxPhoto = 1;
  await use('phone');
  const id = state.currentProjectId!;
  state.bgImage = bg(IMG); state.shapes = [bed('a', 'a')]; save(); await flushSave();
  await syncOnce(local(), server.remoteFor('phone'), 'phone');
  expect(getSyncRecords()[id].held).toBe('refused');
  await use('laptop');
  await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
  await switchProject(id);
  server.maxPhoto = 5e6;
  state.bgImage = bg(IMG2); state.photoElsewhere = null; save(); await flushSave();
  await syncOnce(local(), server.remoteFor('laptop'), 'laptop');
  const kv = await use('phone');
  expect(state.currentProjectId).toBe(id);
  // The replace's write (the original's project record) fails: storage full.
  kv.failWhen = (ops) => ops.some((o) => o.store === 'projects' && o.key === id && o.value !== undefined);
  expect((await syncOnce(local(), server.remoteFor('phone'), 'phone')).failed).toHaveLength(1);
  kv.failWhen = null;
  await flushSave(); // the next save (the plan on screen is kept unsaved)
  await use('phone');
  const out = [];
  for (const p of state.projects) { const d = await readProject(p.id); out.push(`${p.name}: ${d?.bgImage?.dataUrl === IMG ? 'IMG' : d?.bgImage?.dataUrl === IMG2 ? 'IMG2' : JSON.stringify(d?.photoElsewhere)}`); }
  expect(out.some((s) => s.endsWith(': IMG'))).toBe(true); // this device's photo (on no server) is kept
});
