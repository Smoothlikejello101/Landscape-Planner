import { describe, expect, it } from 'vitest';
import { canonical, fingerprint, syncOnce, type Local, type LocalProject, type ProjectContent, type SyncRecord } from '../src/sync/engine';
import { FakeServer } from './fake-sync-server';

// The sync engine against a stand-in server (the same rules as
// supabase/02-sync.sql) and stand-in devices: two devices editing offline,
// a lost connection mid-upload, a lapsed plan, a deleted project with
// unsynced edits.

let nextId = 0;
class FakeDevice implements Local {
  projectsById = new Map<string, LocalProject>();
  recs: Record<string, SyncRecord> = {};
  tombs: Record<string, number> = {};
  /** Simulates an edit landing while sync works on this project (replace refuses). */
  busy = new Set<string>();
  constructor(public name: string) {}
  add(name: string, shapes: unknown[] = []) { const id = `${this.name}-${++nextId}`; this.projectsById.set(id, { id, name, content: { shapes } }); return id; }
  edit(id: string, shapes: unknown[]) { this.projectsById.get(id)!.content = { shapes }; }
  del(id: string) { if (this.recs[id]) this.tombs[id] = this.recs[id].revision; delete this.recs[id]; this.projectsById.delete(id); }
  names() { return [...this.projectsById.values()].map((p) => p.name).sort(); }
  byName(n: string) { return [...this.projectsById.values()].find((p) => p.name === n)!; }
  async projects() { return [...this.projectsById.values()].map((p) => structuredClone(p)); }
  records() { return { ...this.recs }; }
  async setRecord(id: string, rec: SyncRecord | null) { if (rec) this.recs[id] = rec; else delete this.recs[id]; }
  tombstones() { return { ...this.tombs }; }
  async clearTombstone(id: string) { delete this.tombs[id]; }
  async replace(id: string, name: string, content: ProjectContent) {
    if (this.busy.has(id)) return false;
    this.projectsById.set(id, { id, ...this.normalize(name, content) }); return true;
  }
  async create(id: string, name: string, content: ProjectContent) { this.projectsById.set(id, { id, ...this.normalize(name, content) }); }
  async remove(id: string) { this.projectsById.delete(id); delete this.recs[id]; }
  async keepCopy(name: string, content: ProjectContent) { const id = `${this.name}-${++nextId}`; this.projectsById.set(id, { id, name, content: structuredClone(content) }); return id; }
  async rename(id: string, name: string) { this.projectsById.get(id)!.name = name; }
  /** As the app does: downloads are checked and tidied (here: names trimmed). */
  normalize(name: string, content: ProjectContent) { return { name: name.trim() || 'Untitled', content: structuredClone(content) }; }
}
const sync = (d: FakeDevice, s: FakeServer) => syncOnce(d, s.remoteFor(d.name), d.name);

describe('sync', () => {
  it('first sign-in on two devices: each keeps its own plans and gets the other’s', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    phone.add('Back Yard', [1]); phone.add('Front', [2]);
    laptop.add('Back Yard', [9]); // same name, different plan
    expect(await sync(phone, server)).toMatchObject({ uploaded: 2, downloaded: 0 });
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1, downloaded: 2 });
    expect(laptop.names()).toEqual(['Back Yard', 'Back Yard (from laptop)', 'Front']);
    await sync(phone, server);
    expect(phone.names()).toEqual(laptop.names());
    // Nothing changed: nothing moves.
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 0 });
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 0 });
  });

  it('an edit on one device reaches the other, and doesn’t bounce back', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    phone.edit(id, [1, 2]);
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(laptop.projectsById.get(id)!.content).toEqual({ shapes: [1, 2] });
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 0 });
  });

  it('two devices editing offline: the first to sync keeps the place, the other keeps a copy', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    phone.edit(id, ['phone edit']);
    laptop.edit(id, ['laptop edit']);
    await sync(phone, server);
    const r = await sync(laptop, server);
    expect(r.conflicts).toEqual([{ name: 'Back Yard', copyName: expect.stringMatching(/^Back Yard — copy from laptop, /), otherDevice: 'phone' }]);
    expect(laptop.projectsById.get(id)!.content).toEqual({ shapes: ['phone edit'] });
    expect(laptop.byName(r.conflicts[0].copyName).content).toEqual({ shapes: ['laptop edit'] }); // nothing lost
    await sync(phone, server);
    expect(phone.names()).toEqual(laptop.names()); // the copy reached the phone too
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: [] });
  });

  it('a conflict on a plan being edited right then waits, keeping everything', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    phone.edit(id, ['phone']); await sync(phone, server);
    laptop.edit(id, ['laptop']);
    laptop.busy.add(id);
    const r = await sync(laptop, server);
    expect(r.conflicts).toEqual([]);
    expect(laptop.names()).toEqual(['Back Yard']); // no stray copy
    expect(laptop.projectsById.get(id)!.content).toEqual({ shapes: ['laptop'] });
    laptop.busy.clear();
    expect((await sync(laptop, server)).conflicts).toHaveLength(1);
  });

  it('a lost connection mid-upload loses nothing and duplicates nothing', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server);
    phone.edit(id, [1, 2]);
    server.dropNextAnswer = true; // stored, but the answer never arrives
    await expect(sync(phone, server)).rejects.toThrow();
    const r = await sync(phone, server);
    expect(r).toMatchObject({ uploaded: 0, conflicts: [] }); // recognized as already there
    expect(server.rows.get(id)!.revision).toBe(2);
    expect(phone.names()).toEqual(['Back Yard']);
    server.offline = true;
    phone.edit(id, [1, 2, 3]);
    await expect(sync(phone, server)).rejects.toThrow();
    server.offline = false;
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
  });

  it('a project deleted on one device leaves the others, unless they changed it', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop'), tablet = new FakeDevice('tablet');
    const id = phone.add('Old plan', [1]);
    await sync(phone, server); await sync(laptop, server); await sync(tablet, server);
    phone.del(id);
    await sync(phone, server);
    expect(server.rows.get(id)!.deleted).toBe(true); // in the trash, not gone
    expect(await sync(laptop, server)).toMatchObject({ removed: ['Old plan'] });
    expect(laptop.names()).toEqual([]);
    // The tablet had changed it offline: it comes back, with the tablet's version.
    tablet.edit(id, ['still using this']);
    expect(await sync(tablet, server)).toMatchObject({ restored: ['Old plan'] });
    expect(server.rows.get(id)).toMatchObject({ deleted: false, content: { shapes: ['still using this'] } });
    await sync(laptop, server);
    expect(laptop.names()).toEqual(['Old plan']);
    // Back on the device that deleted it too: it was still in use elsewhere.
    await sync(phone, server);
    expect(phone.names()).toEqual(['Old plan']);
  });

  it('a lapsed plan pauses sync: nothing uploads or downloads, nothing on the device changes', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone');
    phone.add('Back Yard', [1]);
    server.allowed = false;
    expect(await sync(phone, server)).toMatchObject({ paused: true, uploaded: 0, downloaded: 0 });
    expect(phone.names()).toEqual(['Back Yard']);
    server.allowed = true;
    expect(await sync(phone, server)).toMatchObject({ paused: false, uploaded: 1 });
  });

  it('downloads are fingerprinted as the device stores them, so they never look edited', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    phone.add('  Spaced  ', [1]);
    await sync(phone, server); await sync(laptop, server);
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0 });
  });
});

describe('fingerprints', () => {
  it('ignore key order (the server may reorder keys)', () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    expect(fingerprint('X', { shapes: [], phases: [] })).toBe(fingerprint('X', { phases: [], shapes: [] }));
    expect(fingerprint('X', { shapes: [1] })).not.toBe(fingerprint('X', { shapes: [2] }));
    expect(fingerprint('X', { shapes: [] })).not.toBe(fingerprint('Y', { shapes: [] }));
  });
});
