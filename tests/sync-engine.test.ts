import { describe, expect, it } from 'vitest';
import { canonical, fingerprint, syncOnce, type Local, type LocalProject, type ProjectContent, type Remote, type SyncRecord } from '../src/sync/engine';
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
  /** The open plan is in use on screen (replace and remove wait). */
  busy = new Set<string>();
  constructor(public name: string) {}
  private bump(id: string) { const p = this.projectsById.get(id); if (p) p.token++; }
  add(name: string, shapes: unknown[] = []) { const id = `${this.name}-${++nextId}`; this.projectsById.set(id, { id, name, content: { shapes }, token: 0 }); return id; }
  edit(id: string, shapes: unknown[]) { this.projectsById.get(id)!.content = { shapes }; this.bump(id); }
  /** Deleted here (as the app does: a synced one leaves a tombstone; one sync is still uploading gets it when the upload lands). */
  del(id: string) { if (this.recs[id]) this.tombs[id] = this.recs[id].revision; delete this.recs[id]; this.projectsById.delete(id); }
  names() { return [...this.projectsById.values()].map((p) => p.name).sort(); }
  byName(n: string) { return [...this.projectsById.values()].find((p) => p.name === n)!; }
  async projects() { return [...this.projectsById.values()].map((p) => structuredClone(p)); }
  records() { return { ...this.recs }; }
  async setRecord(id: string, rec: SyncRecord | null) {
    if (rec && !this.projectsById.has(id)) { this.tombs[id] = rec.revision; delete this.recs[id]; return; }
    if (rec) this.recs[id] = rec; else delete this.recs[id];
  }
  tombstones() { return { ...this.tombs }; }
  async clearTombstone(id: string) { delete this.tombs[id]; }
  async replace(id: string, name: string, content: ProjectContent, token: number) {
    const p = this.projectsById.get(id);
    if (!p || p.token !== token || this.busy.has(id)) return false;
    this.projectsById.set(id, { id, ...this.normalize(name, content), token: token + 1 }); return true;
  }
  async create(id: string, name: string, content: ProjectContent) { this.projectsById.set(id, { id, ...this.normalize(name, content), token: 0 }); }
  async remove(id: string, token: number) {
    const p = this.projectsById.get(id);
    if (!p || p.token !== token || this.busy.has(id)) return false;
    this.projectsById.delete(id); delete this.recs[id]; return true;
  }
  async keepCopy(_from: string, name: string, content: ProjectContent) { const id = `${this.name}-${++nextId}`; this.projectsById.set(id, { id, name, content: structuredClone(content), token: 0 }); return { id, token: 0 }; }
  async rename(id: string, name: string) { const p = this.projectsById.get(id)!; p.name = name; p.token++; return p.token; }
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
    expect((await sync(phone, server)).failed).toEqual([{ name: 'Back Yard', message: 'Failed to fetch' }]);
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

/** A server whose answers arrive after something happens on the device (the network is slow). */
function slow(r: Remote, step: 'fetch' | 'push', during: () => void): Remote {
  let done = false;
  const once = () => { if (!done) { done = true; during(); } };
  return {
    ...r,
    fetch: async (ids) => { if (step === 'fetch') once(); return r.fetch(ids); },
    push: async (...a) => { if (step === 'push') once(); return r.push(...a); },
  };
}

describe('edits made while a sync works', () => {
  it('a download never overwrites an edit made while it was fetched', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    laptop.edit(id, ['laptop']); await sync(laptop, server);
    const r = await syncOnce(phone, slow(server.remoteFor('phone'), 'fetch', () => phone.edit(id, ['phone, mid-sync'])), 'phone');
    expect(r.downloaded).toBe(0);
    expect(phone.projectsById.get(id)!.content).toEqual({ shapes: ['phone, mid-sync'] });
    // Next time it's an ordinary conflict: both kept.
    const r2 = await sync(phone, server);
    expect(r2.conflicts).toHaveLength(1);
    expect(phone.byName(r2.conflicts[0].copyName).content).toEqual({ shapes: ['phone, mid-sync'] });
    expect(phone.projectsById.get(id)!.content).toEqual({ shapes: ['laptop'] });
  });

  it('a conflict never replaces an edit made while it was settled', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    laptop.edit(id, ['laptop']); await sync(laptop, server);
    phone.edit(id, ['phone']);
    const r = await syncOnce(phone, slow(server.remoteFor('phone'), 'fetch', () => phone.edit(id, ['phone', 'more'])), 'phone');
    expect(r.conflicts).toEqual([]);
    expect(phone.names()).toEqual(['Back Yard']); // no stray copy
    expect(phone.projectsById.get(id)!.content).toEqual({ shapes: ['phone', 'more'] });
    const r2 = await sync(phone, server);
    expect(phone.byName(r2.conflicts[0].copyName).content).toEqual({ shapes: ['phone', 'more'] });
  });

  it('a project deleted elsewhere stays if it’s edited here while the sync works', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const other = phone.add('Other', [0]); // listed first
    const id = phone.add('Old plan', [1]);
    await sync(phone, server); await sync(laptop, server);
    laptop.del(id); await sync(laptop, server);
    phone.edit(other, [0, 1]); // so this pass uploads it first; the edit lands during that upload
    const r = await syncOnce(phone, slow(server.remoteFor('phone'), 'push', () => phone.edit(id, ['still using it'])), 'phone');
    expect(r.removed).toEqual([]);
    expect(phone.names()).toEqual(['Old plan', 'Other']);
    expect(await sync(phone, server)).toMatchObject({ restored: ['Old plan'] });
    expect(server.rows.get(id)).toMatchObject({ deleted: false, content: { shapes: ['still using it'] } });
  });

  it('a project deleted here while its first upload was under way goes to the trash, not back', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone');
    const id = phone.add('Scratch', [1]);
    await syncOnce(phone, slow(server.remoteFor('phone'), 'push', () => phone.del(id)), 'phone');
    expect(phone.tombs).toEqual({ [id]: 1 });
    await sync(phone, server);
    expect(server.rows.get(id)!.deleted).toBe(true);
    expect(phone.names()).toEqual([]);
  });
});

describe('deleting', () => {
  it('a delete here doesn’t trash changes another device made since; the project comes back', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Shared', [1]);
    await sync(phone, server); await sync(laptop, server);
    laptop.edit(id, ['newer']); await sync(laptop, server);
    phone.del(id); // without having seen the laptop's change
    const r = await sync(phone, server);
    expect(r.undeleted).toEqual(['Shared']);
    expect(server.rows.get(id)!.deleted).toBe(false);
    expect(phone.projectsById.get(id)!.content).toEqual({ shapes: ['newer'] });
    expect(phone.tombs).toEqual({});
  });

  it('the server’s trash comes back with the pass (no second list)', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone');
    const id = phone.add('Gone', [1]); phone.add('Kept', [2]);
    await sync(phone, server);
    phone.del(id);
    const r = await sync(phone, server);
    expect(r.trash.map((t) => t.id)).toEqual([id]);
  });
});

describe('trouble with one project', () => {
  it('doesn’t stop the others', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone');
    const bad = phone.add('Broken', [1]); phone.add('Fine', [2]);
    const remote = server.remoteFor('phone');
    const r = await syncOnce(phone, { ...remote, push: async (id, ...a) => { if (id === bad) throw new Error('bad project content'); return remote.push(id, ...a); } }, 'phone');
    expect(r.uploaded).toBe(1);
    expect(r.failed).toEqual([{ name: 'Broken', message: 'bad project content' }]);
    expect([...server.rows.values()].map((x) => x.name)).toEqual(['Fine']);
  });

  it('a lost connection ends the pass after a few tries', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone');
    for (let i = 0; i < 6; i++) phone.add(`P${i}`, [i]);
    let pushes = 0;
    const remote = server.remoteFor('phone');
    await expect(syncOnce(phone, { ...remote, push: async () => { pushes++; throw new TypeError('Failed to fetch'); } }, 'phone')).rejects.toThrow();
    expect(pushes).toBe(3);
  });
});

describe('a second device’s first sign-in', () => {
  it('its empty starter plan doesn’t become a duplicate', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    phone.add('My Garden', [1]);
    laptop.add('My Garden'); // the new install's empty plan
    await sync(phone, server);
    await sync(laptop, server);
    expect([...server.rows.values()].map((x) => x.name)).toEqual(['My Garden']);
    expect(laptop.names()).toEqual(['My Garden', 'My Garden']); // its own (unsynced, empty) and the phone’s
    // Once drawn on, it syncs like any other.
    laptop.edit([...laptop.projectsById.values()].find((p) => !server.rows.has(p.id))!.id, ['drawn']);
    await sync(laptop, server);
    expect([...server.rows.values()].map((x) => x.name).sort()).toEqual(['My Garden', 'My Garden (from laptop)']);
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
