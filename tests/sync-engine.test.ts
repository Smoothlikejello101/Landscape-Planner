import { describe, expect, it } from 'vitest';
import { canonical, coreHash, fingerprint, planHash, settleBought, settleHousehold, settleSwitches, syncOnce, type Local, type LocalProject, type ProjectContent, type Remote, type SyncRecord } from '../src/sync/engine';
import { FakeServer } from './fake-sync-server';

// The sync engine against a stand-in server (the same rules as
// supabase/02-sync.sql) and stand-in devices: two devices editing offline,
// a lost connection mid-upload, a lapsed plan, a deleted project with
// unsynced edits.

let nextId = 0;
/** A stand-in photo's bytes, by its (stand-in) fingerprint. */
const photoBytes = (fp: string) => `data:image/jpeg;base64,${btoa(fp)}`;
const placed = { naturalWidth: 100, naturalHeight: 80, ftPerPx: 0.5, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true };
class FakeDevice implements Local {
  projectsById = new Map<string, LocalProject>();
  recs: Record<string, SyncRecord> = {};
  tombs: Record<string, number> = {};
  /** The photo each project has on this device (by fingerprint). */
  photos = new Map<string, string>();
  /** The open plan is in use on screen (replace and remove wait). */
  busy = new Set<string>();
  /** `withPhotos`: this device's app version syncs photos (its content always says which photo it has). */
  constructor(public name: string, public withPhotos = false) {}
  private bump(id: string) { const p = this.projectsById.get(id); if (p) p.token++; }
  add(name: string, shapes: unknown[] = []) {
    const id = `${this.name}-${++nextId}`;
    this.projectsById.set(id, { id, name, content: this.withPhotos ? { shapes, photo: null } : { shapes }, token: 0 });
    return id;
  }
  edit(id: string, shapes: unknown[]) { const p = this.projectsById.get(id)!; p.content = { ...p.content, shapes }; this.bump(id); }
  /** Change one part of a plan (the Plant list's ticks, who's in the yard), as the app does. */
  setPart(id: string, part: string, value: unknown) { const p = this.projectsById.get(id)!; p.content = { ...p.content, [part]: value }; this.bump(id); }
  part(id: string, part: string) { return this.projectsById.get(id)!.content[part]; }
  /** Give a project a photo (null: remove it; 'kept': keep it on this device only). */
  setPhoto(id: string, fp: string | null | 'kept') {
    const p = this.projectsById.get(id)!;
    if (fp === 'kept') p.content = { ...p.content, photo: { deviceOnly: true } };
    else if (fp) { p.content = { ...p.content, photo: { fingerprint: fp, ...placed } }; this.photos.set(id, fp); }
    else { p.content = { ...p.content, photo: null }; this.photos.delete(id); }
    this.bump(id);
  }
  /** Deleted here (as the app does: a synced one leaves a tombstone; one sync is still uploading gets it when the upload lands). */
  del(id: string) { if (this.recs[id]) this.tombs[id] = this.recs[id].revision; delete this.recs[id]; this.projectsById.delete(id); }
  names() { return [...this.projectsById.values()].map((p) => p.name).sort(); }
  byName(n: string) { return [...this.projectsById.values()].find((p) => p.name === n)!; }
  shapes(id: string) { return this.projectsById.get(id)!.content.shapes; }
  async projects() {
    return [...this.projectsById.values()].map((p) => {
      const c = structuredClone(p);
      const fp = (p.content.photo as { fingerprint?: string } | null | undefined)?.fingerprint;
      if (fp && this.photos.get(p.id) !== fp) c.pendingPhoto = fp;
      return c;
    });
  }
  records() { return { ...this.recs }; }
  async setRecord(id: string, rec: SyncRecord | null) {
    if (rec && !this.projectsById.has(id)) { this.tombs[id] = rec.revision; delete this.recs[id]; return; }
    if (rec) this.recs[id] = rec; else delete this.recs[id];
  }
  tombstones() { return { ...this.tombs }; }
  async clearTombstone(id: string) { delete this.tombs[id]; }
  /** As the app does: a photo arrives with its bytes, or waits; content saying nothing about a photo keeps this one. */
  private place(id: string, prev: ProjectContent | undefined, content: ProjectContent, bytes?: string): ProjectContent {
    const n = this.normalize('x', content).content;
    if (!('photo' in content)) return prev && 'photo' in prev ? { ...n, photo: prev.photo } : n;
    const ph = content.photo as { fingerprint?: string; deviceOnly?: boolean } | null;
    const mineKept = (prev?.photo as { deviceOnly?: boolean } | null | undefined)?.deviceOnly === true;
    if (!ph) this.photos.delete(id);
    else if (ph.deviceOnly && !mineKept) this.photos.delete(id); // kept on another device: this one lets go of its copy
    else if (ph.fingerprint && (bytes || this.photos.get(id) === ph.fingerprint)) this.photos.set(id, ph.fingerprint);
    else if (ph.fingerprint) this.photos.delete(id);
    return n;
  }
  async replace(id: string, name: string, content: ProjectContent, token: number, bytes?: string) {
    const p = this.projectsById.get(id);
    if (!p || p.token !== token || this.busy.has(id)) return false;
    this.projectsById.set(id, { id, name: this.normalize(name, content).name, content: this.place(id, p.content, content, bytes), token: token + 1 }); return true;
  }
  async create(id: string, name: string, content: ProjectContent, bytes?: string) {
    this.projectsById.set(id, { id, name: this.normalize(name, content).name, content: this.place(id, undefined, content, bytes), token: 0 });
  }
  async photoData(id: string, want: string) { const fp = this.photos.get(id); return fp ? (fp === want ? photoBytes(fp) : false) : null; }
  async hasPhoto(id: string, fp: string) { return this.photos.get(id) === fp; }
  async fillPhoto(id: string, token: number, fp: string, _bytes: string) {
    const p = this.projectsById.get(id);
    if (!p || p.token !== token) return false;
    this.photos.set(id, fp); p.token++; return true;
  }
  async remove(id: string, token: number) {
    const p = this.projectsById.get(id);
    if (!p || p.token !== token || this.busy.has(id)) return false;
    this.projectsById.delete(id); delete this.recs[id]; return true;
  }
  async keepCopy(from: string, name: string, content: ProjectContent) {
    const id = `${this.name}-${++nextId}`;
    this.projectsById.set(id, { id, name, content: structuredClone(content), token: 0 });
    const fp = this.photos.get(from); if (fp) this.photos.set(id, fp);
    return { id, token: 0 };
  }
  async rename(id: string, name: string, token: number) { const p = this.projectsById.get(id)!; const ok = p.token === token; p.name = name; p.token++; return ok ? p.token : -1; }
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

describe('renaming on a first upload', () => {
  it('doesn’t hide an edit made after the plan was read', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone');
    const first = phone.add('First', [0]);
    const id = phone.add('My Garden', ['a']);
    server.rows.set('elsewhere', { name: 'My Garden', content: { shapes: [] }, revision: 1, updated_by: 'tablet', deleted: false });
    const base = server.remoteFor('phone');
    const remote: Remote = {
      ...base,
      push: async (pid, ...a) => {
        if (pid === first) phone.edit(id, ['a', 'b (mid-sync)']);
        // Another device uploads this very project a moment before us: a conflict.
        if (pid === id) server.rows.set(id, { name: 'Other', content: { shapes: ['tablet'] }, revision: 1, updated_by: 'tablet', deleted: false });
        return base.push(pid, ...a);
      },
    };
    await syncOnce(phone, remote, 'phone');
    expect(JSON.stringify([...phone.projectsById.values()].map((p) => p.content))).toContain('b (mid-sync)');
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

describe('background photos', () => {
  const pair = () => ({ server: new FakeServer(), phone: new FakeDevice('phone', true), laptop: new FakeDevice('laptop', true) });
  const serverPhoto = (server: FakeServer, id: string) => (server.rows.get(id)!.content as { photo?: unknown }).photo;

  it('go up once, before their plan, and come down with it', async () => {
    const { server, phone, laptop } = pair();
    const id = phone.add('Back Yard', [1]);
    phone.setPhoto(id, 'f1');
    await sync(phone, server);
    expect(server.photos.has('f1')).toBe(true);
    expect(server.photoUploads).toBe(1);
    await sync(laptop, server);
    expect(laptop.photos.get(id)).toBe('f1');
    // Edits to the plan don't send the photo again.
    phone.edit(id, [1, 2]);
    await sync(phone, server); await sync(laptop, server);
    expect(server.photoUploads).toBe(1);
    expect(laptop.shapes(id)).toEqual([1, 2]);
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 0 });
    // The same photo in another plan isn't sent again either.
    const other = phone.add('Front', [3]); phone.setPhoto(other, 'f1');
    await sync(phone, server);
    expect(server.photoUploads).toBe(1);
  });

  it('a photo changed on one device and the plan on another: both kept, no conflict', async () => {
    const { server, phone, laptop } = pair();
    const id = phone.add('Back Yard', [1]); phone.setPhoto(id, 'f1');
    await sync(phone, server); await sync(laptop, server);
    phone.setPhoto(id, 'f2');
    laptop.edit(id, [1, 'laptop']);
    await sync(laptop, server);
    const r = await sync(phone, server);
    expect(r.conflicts).toEqual([]);
    expect(phone.shapes(id)).toEqual([1, 'laptop']);
    expect(phone.photos.get(id)).toBe('f2');
    await sync(laptop, server);
    expect(laptop.photos.get(id)).toBe('f2');
    expect(serverPhoto(server, id)).toMatchObject({ fingerprint: 'f2' });
  });

  it('different photos chosen on two devices: a conflict, both kept', async () => {
    const { server, phone, laptop } = pair();
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    phone.setPhoto(id, 'f1'); laptop.setPhoto(id, 'f2');
    await sync(phone, server);
    const r = await sync(laptop, server);
    expect(r.conflicts).toHaveLength(1);
    expect(laptop.photos.get(laptop.byName(r.conflicts[0].copyName).id)).toBe('f2');
    expect(laptop.photos.get(id)).toBe('f1');
  });

  it('a photo removed on one device leaves the others', async () => {
    const { server, phone, laptop } = pair();
    const id = phone.add('Back Yard', [1]); phone.setPhoto(id, 'f1');
    await sync(phone, server); await sync(laptop, server);
    laptop.setPhoto(id, null);
    await sync(laptop, server); await sync(phone, server);
    expect(phone.photos.has(id)).toBe(false);
    expect(phone.projectsById.get(id)!.content.photo).toBeNull();
  });

  it('one kept on this device never goes up; the others hear it’s kept elsewhere', async () => {
    const { server, phone, laptop } = pair();
    const id = phone.add('Back Yard', [1]); phone.setPhoto(id, 'f1'); phone.setPhoto(id, 'kept');
    await sync(phone, server); await sync(laptop, server);
    expect(server.photoUploads).toBe(0);
    expect(serverPhoto(server, id)).toEqual({ deviceOnly: true });
    expect(laptop.projectsById.get(id)!.content.photo).toEqual({ deviceOnly: true });
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0 });
  });

  it('switched to "this device only" later: the other devices let go of their copies', async () => {
    const { server, phone, laptop } = pair();
    const id = phone.add('Back Yard', [1]); phone.setPhoto(id, 'f1');
    await sync(phone, server); await sync(laptop, server);
    expect(laptop.photos.get(id)).toBe('f1');
    phone.setPhoto(id, 'kept');
    await sync(phone, server); await sync(laptop, server);
    expect(laptop.photos.has(id)).toBe(false);
    expect(phone.photos.get(id)).toBe('f1');
  });

  it('a photo changed while sync works isn’t sent under the old one’s fingerprint', async () => {
    const { server, phone } = pair();
    const first = phone.add('First', [0]);
    const id = phone.add('Back Yard', [1]); phone.setPhoto(id, 'f1');
    const remote = server.remoteFor('phone');
    await syncOnce(phone, { ...remote, push: async (pid, ...a) => { if (pid === first) phone.setPhoto(id, 'f2'); return remote.push(pid, ...a); } }, 'phone');
    expect(server.photos.has('f1')).toBe(false);
    expect(server.rows.has(id)).toBe(false); // not this time
    await sync(phone, server);
    expect(serverPhoto(server, id)).toMatchObject({ fingerprint: 'f2' });
    expect(server.photos.get('f2')).toBe(photoBytes('f2'));
  });

  it('one the server had no room for stays here, and goes up once there is room', async () => {
    const { server, phone, laptop } = pair();
    server.photoRoom = false;
    const id = phone.add('Back Yard', [1]); phone.setPhoto(id, 'f1');
    await sync(phone, server);
    // Another device edits the plan: this device's photo isn't taken as "kept elsewhere".
    await sync(laptop, server); laptop.edit(id, [1, 'laptop']); await sync(laptop, server);
    await sync(phone, server);
    expect(phone.shapes(id)).toEqual([1, 'laptop']);
    expect(phone.photos.get(id)).toBe('f1');
    expect(phone.projectsById.get(id)!.content.photo).toMatchObject({ fingerprint: 'f1' });
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0 }); // no churn while there's no room
    server.photoRoom = true;
    await sync(phone, server);
    expect(serverPhoto(server, id)).toMatchObject({ fingerprint: 'f1' });
    await sync(laptop, server);
    expect(laptop.photos.get(id)).toBe('f1');
  });

  it('a plan whose server copy says nothing of its photo (an older server) keeps the photo here, and sends it back', async () => {
    const { server, phone } = pair();
    const id = phone.add('Back Yard', [1]); phone.setPhoto(id, 'f1');
    await sync(phone, server);
    const row = server.rows.get(id)!;
    const { photo: _p, ...rest } = row.content; row.content = { ...rest, shapes: [1, 'elsewhere'] }; row.revision++;
    await sync(phone, server);
    expect(phone.shapes(id)).toEqual([1, 'elsewhere']);
    expect(phone.photos.get(id)).toBe('f1');
    await sync(phone, server);
    expect(serverPhoto(server, id)).toMatchObject({ fingerprint: 'f1' });
  });

  it('one too large for the server stays here; the plan still syncs, once', async () => {
    const { server, phone, laptop } = pair();
    server.maxPhoto = 1;
    const id = phone.add('Back Yard', [1]); phone.setPhoto(id, 'f1');
    const r = await sync(phone, server);
    expect(r.photosKept).toEqual(['Back Yard']);
    expect(serverPhoto(server, id)).toEqual({ deviceOnly: true });
    const asked = server.reservations;
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, photosKept: [] });
    expect(server.reservations).toBe(asked); // too large: not asked again every pass
    expect(phone.photos.get(id)).toBe('f1'); // still here
    await sync(laptop, server);
    expect(laptop.shapes(id)).toEqual([1]);
  });

  it('a photo the server can’t give yet: the plan arrives, the photo follows later', async () => {
    const { server, phone, laptop } = pair();
    const id = phone.add('Back Yard', [1]); phone.setPhoto(id, 'f1');
    await sync(phone, server);
    const bytes = server.photos.get('f1')!; server.photos.delete('f1');
    await sync(laptop, server);
    expect(laptop.shapes(id)).toEqual([1]);
    expect(laptop.photos.has(id)).toBe(false);
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0 }); // waiting isn't a change
    server.photos.set('f1', bytes);
    await sync(laptop, server);
    expect(laptop.photos.get(id)).toBe('f1');
  });

  it('upgrading from before photos synced: no conflicts, and the photo reaches the other device', async () => {
    // Synced by the earlier version: records hold the plan's fingerprint only; the server's content has no photo.
    for (const order of ['phone first', 'laptop first'] as const) {
      const server = new FakeServer(), oldPhone = new FakeDevice('phone'), oldLaptop = new FakeDevice('laptop');
      const id = oldPhone.add('Back Yard', [1]);
      await sync(oldPhone, server); await sync(oldLaptop, server);
      // Both update. The phone had a photo all along; the laptop also edited the plan.
      const phone = new FakeDevice('phone', true), laptop = new FakeDevice('laptop', true);
      for (const [d, old] of [[phone, oldPhone], [laptop, oldLaptop]] as const) {
        d.recs = structuredClone(old.recs);
        for (const [pid, p] of old.projectsById) d.projectsById.set(pid, { ...structuredClone(p), content: { ...p.content, photo: null } });
      }
      phone.setPhoto(id, 'f1'); phone.recs = structuredClone(oldPhone.recs);
      laptop.edit(id, [1, 'laptop']);
      const first = order === 'phone first' ? [phone, laptop] : [laptop, phone];
      for (const d of [...first, ...first]) expect((await sync(d, server)).conflicts).toEqual([]);
      for (const d of [phone, laptop]) {
        expect(d.shapes(id)).toEqual([1, 'laptop']);
        expect(d.photos.get(id)).toBe('f1');
      }
    }
  });

  it('a plan from a device on the earlier version keeps the photo (the server keeps it with the plan)', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone', true), oldLaptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]); phone.setPhoto(id, 'f1');
    await sync(phone, server); await sync(oldLaptop, server);
    oldLaptop.projectsById.get(id)!.content = { shapes: [1, 'old laptop'] }; // its content knows nothing of photos
    await sync(oldLaptop, server);
    expect(serverPhoto(server, id)).toMatchObject({ fingerprint: 'f1' });
    expect(await sync(phone, server)).toMatchObject({ downloaded: 1, uploaded: 0 });
    expect(phone.shapes(id)).toEqual([1, 'old laptop']);
    expect(phone.photos.get(id)).toBe('f1');
  });
});

// The Plant list's ticks and who's in the yard (Jason, Nov 1): parts of the plan that settle on their own when two
// devices change them, never a conflict copy. Ticks kind by kind, the later change to each; the yard by the later set
// in the plan, or, where neither was set in the plan (each device took its own with the update), everyone either had.
describe("the Plant list's ticks on two devices", () => {
  const tick = (n: number, at: number) => ({ n, at });
  it('ticked on two phones at once at the nursery: both kept, on both, with no copy', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), partner = new FakeDevice('partner');
    const id = phone.add('Back Yard', [1]);
    phone.setPart(id, 'bought', { yaupon: tick(2, 100) });
    await sync(phone, server); await sync(partner, server);
    phone.setPart(id, 'bought', { yaupon: tick(2, 100), aster: tick(3, 200) });
    partner.setPart(id, 'bought', { yaupon: tick(2, 100), sedge: tick(5, 210) });
    await sync(phone, server);
    const r = await sync(partner, server);
    expect(r.conflicts).toEqual([]);
    await sync(phone, server);
    const all = { yaupon: tick(2, 100), aster: tick(3, 200), sedge: tick(5, 210) };
    expect([phone.part(id, 'bought'), partner.part(id, 'bought'), server.rows.get(id)!.content.bought]).toEqual([all, all, all]);
    expect(phone.names()).toEqual(['Back Yard']);
    expect(partner.names()).toEqual(['Back Yard']);
    // Settled: nothing moves.
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 0 });
    expect(await sync(partner, server)).toMatchObject({ uploaded: 0, downloaded: 0 });
  });
  it('the same kind on both: the later change wins, an untick too', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    phone.setPart(id, 'bought', { yaupon: tick(2, 100), aster: tick(3, 100) });
    await sync(phone, server); await sync(laptop, server);
    phone.setPart(id, 'bought', { yaupon: tick(0, 300), aster: tick(3, 100) }); // unticked at the nursery, later
    laptop.setPart(id, 'bought', { yaupon: tick(1, 200), aster: tick(1, 250) });
    await sync(laptop, server);
    expect((await sync(phone, server)).conflicts).toEqual([]);
    await sync(laptop, server);
    for (const d of [phone, laptop]) expect(d.part(id, 'bought')).toEqual({ yaupon: tick(0, 300), aster: tick(1, 250) });
  });
  it('ticked on one device while the plan is edited on another: both kept, no copy', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    phone.setPart(id, 'bought', { yaupon: tick(2, 100) });
    laptop.edit(id, [1, 'a new bed']);
    for (const order of [[laptop, phone], [laptop, phone]]) for (const d of order) expect((await sync(d, server)).conflicts).toEqual([]);
    for (const d of [phone, laptop]) {
      expect(d.shapes(id)).toEqual([1, 'a new bed']);
      expect(d.part(id, 'bought')).toEqual({ yaupon: tick(2, 100) });
    }
  });
  it('the plan edited on both as well: a copy as before, and the plan keeps both devices\' ticks', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    phone.edit(id, ['phone edit']); phone.setPart(id, 'bought', { yaupon: tick(2, 100) });
    laptop.edit(id, ['laptop edit']); laptop.setPart(id, 'bought', { aster: tick(1, 120) });
    await sync(phone, server);
    const r = await sync(laptop, server);
    expect(r.conflicts).toHaveLength(1);
    const original = laptop.projectsById.get(id)!.content;
    expect(original.shapes).toEqual(['phone edit']);
    expect(original.bought).toEqual({ yaupon: tick(2, 100), aster: tick(1, 120) });
    expect(laptop.byName(r.conflicts[0].copyName).content).toEqual({ shapes: ['laptop edit'], bought: { aster: tick(1, 120) } }); // (this device's, whole)
    await sync(laptop, server); await sync(phone, server);
    expect(phone.part(id, 'bought')).toEqual({ yaupon: tick(2, 100), aster: tick(1, 120) });
  });
  it('synced by a version before ticks (its record has no core): ticks on both still settle, no copy', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    for (const d of [phone, laptop]) d.recs[id] = { revision: d.recs[id].revision, hash: d.recs[id].hash }; // (as that version recorded it)
    phone.setPart(id, 'bought', { yaupon: tick(2, 100) });
    laptop.setPart(id, 'bought', { aster: tick(1, 120) });
    await sync(phone, server);
    expect((await sync(laptop, server)).conflicts).toEqual([]);
    expect(laptop.part(id, 'bought')).toEqual({ yaupon: tick(2, 100), aster: tick(1, 120) });
  });
  it('settle the same either way round', () => {
    const a = { yaupon: tick(2, 100), aster: tick(3, 200), same: tick(1, 50) }, b = { yaupon: tick(4, 150), sedge: tick(5, 1), same: tick(2, 50), bad: { n: 'x' } };
    expect(settleBought(a, b)).toEqual(settleBought(b, a));
    expect(settleBought(a, b)).toEqual({ yaupon: tick(4, 150), aster: tick(3, 200), same: tick(2, 50), sedge: tick(5, 1) });
    expect([settleBought(undefined, undefined), settleBought(a, undefined), settleBought('x', b)]).toEqual([undefined, a, { yaupon: tick(4, 150), sedge: tick(5, 1), same: tick(2, 50) }]);
  });
});

describe("who's in the yard on two devices", () => {
  const none = { kids: false, dogs: '', cats: false, horses: false, answered: false };
  it('two devices update, each taking what it had: no copy, and both end with everyone either had', async () => {
    for (const order of ['phone first', 'laptop first'] as const) {
      const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
      const id = phone.add('Back Yard', [1]);
      await sync(phone, server); await sync(laptop, server);
      // (The update: each plan takes its device's own, with no time: never set in the plan.)
      phone.setPart(id, 'household', { ...none, dogs: 'hideToxic', answered: true });
      laptop.setPart(id, 'household', { ...none, kids: true, answered: true });
      const first = order === 'phone first' ? [phone, laptop] : [laptop, phone];
      for (const d of [...first, ...first]) expect((await sync(d, server)).conflicts).toEqual([]);
      for (const d of [phone, laptop]) expect(d.part(id, 'household')).toEqual({ ...none, kids: true, dogs: 'hideToxic', answered: true });
      expect(phone.names()).toEqual(['Back Yard']);
    }
  });
  it('a computer that never asked takes a phone\'s dog, and asks no more; the phone keeps it', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    laptop.setPart(id, 'household', none);
    phone.setPart(id, 'household', { ...none, dogs: 'nonToxic', answered: true });
    await sync(laptop, server); await sync(phone, server); await sync(laptop, server);
    for (const d of [phone, laptop]) expect(d.part(id, 'household')).toEqual({ ...none, dogs: 'nonToxic', answered: true });
  });
  it('one set in the plan wins over one a device only took, and the later of two set in the plan wins', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    phone.setPart(id, 'household', { ...none, dogs: 'hideToxic', answered: true }); // (taken with the update)
    laptop.setPart(id, 'household', { ...none, cats: true, answered: true, at: 500 }); // (set in the plan)
    for (const d of [phone, laptop, phone, laptop]) expect((await sync(d, server)).conflicts).toEqual([]);
    for (const d of [phone, laptop]) expect(d.part(id, 'household')).toEqual({ ...none, cats: true, answered: true, at: 500 });
    phone.setPart(id, 'household', { ...none, horses: true, answered: true, at: 700 });
    laptop.setPart(id, 'household', { ...none, kids: true, answered: true, at: 600 });
    for (const d of [laptop, phone, laptop]) expect((await sync(d, server)).conflicts).toEqual([]);
    for (const d of [phone, laptop]) expect(d.part(id, 'household')).toEqual({ ...none, horses: true, answered: true, at: 700 });
  });
  it('a plan deleted on another device doesn\'t come back for a household this one only took; one set in the plan keeps it', async () => {
    for (const set of [false, true]) {
      const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
      const id = phone.add('Old plan', [1]);
      await sync(phone, server); await sync(laptop, server);
      laptop.del(id); await sync(laptop, server);
      phone.setPart(id, 'household', { ...none, dogs: 'hideToxic', answered: true, ...(set ? { at: 5 } : {}) });
      const r = await sync(phone, server);
      expect({ set, removed: r.removed, restored: r.restored }).toEqual(set ? { set, removed: [], restored: ['Old plan'] } : { set, removed: ['Old plan'], restored: [] });
    }
  });
  it('settles the same either way round; dogs at the stricter of the two', () => {
    const a = { ...none, dogs: 'hideToxic', answered: true }, b = { ...none, dogs: 'nonToxic', cats: true, answered: true };
    expect(settleHousehold(a, b)).toEqual(settleHousehold(b, a));
    expect(settleHousehold(a, b)).toEqual({ ...none, dogs: 'nonToxic', cats: true, answered: true });
    const x = { ...none, kids: true, answered: true, at: 9 }, y = { ...none, cats: true, answered: true, at: 9 };
    expect(settleHousehold(x, y)).toEqual(settleHousehold(y, x)); // (the same moment)
    expect([settleHousehold(undefined, a), settleHousehold('odd', undefined)]).toEqual([a, undefined]);
  });
  it('a plan\'s core leaves out its ticks and yard (and photo); a plan with neither has the same core as its whole', () => {
    const c = { shapes: [1], phases: [] };
    expect(coreHash('X', c)).toBe(planHash('X', c));
    expect(coreHash('X', { ...c, bought: { a: { n: 1, at: 1 } }, household: none, photo: null })).toBe(planHash('X', c));
    expect(coreHash('X', { ...c, shapes: [2] })).not.toBe(coreHash('X', c));
  });
});

// The warning switches (Jason, Nov 1: "What's checked (and dismissed) goes with this plan, on all your devices"): they
// settle on their own, one by one, never a conflict copy. The one switched in the plan more lately; one switched in the
// plan over one a device only took with the update; two taken that way, off if either was (a device's "on" is mostly
// the default, never touched; its "off" was someone's choice).
describe('the warning switches on two devices', () => {
  const taken = (on: Record<string, boolean>) => Object.fromEntries(Object.entries(on).map(([k, v]) => [k, { on: v }]));
  const all = { showCrowding: true, crowdWarnings: true, hardyWarnings: true, poisonWarnings: true, fruitWarnings: true };
  it("two devices update, each taking what it had: no copy, and a warning either had off stays off on both", async () => {
    for (const order of ['phone first', 'laptop first'] as const) {
      const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
      const id = phone.add('Back Yard', [1]);
      await sync(phone, server); await sync(laptop, server);
      phone.setPart(id, 'switches', taken({ ...all, showCrowding: false }));
      laptop.setPart(id, 'switches', taken({ ...all, poisonWarnings: false }));
      const first = order === 'phone first' ? [phone, laptop] : [laptop, phone];
      for (const d of [...first, ...first]) expect((await sync(d, server)).conflicts).toEqual([]);
      for (const d of [phone, laptop]) expect(d.part(id, 'switches')).toEqual(taken({ ...all, showCrowding: false, poisonWarnings: false }));
      expect(phone.names()).toEqual(['Back Yard']);
      expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 0 });
    }
  });
  it('one switched in the plan wins over one only taken, and the later of two switched wins, switch by switch', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    phone.setPart(id, 'switches', taken({ ...all, hardyWarnings: false })); // (taken with the update)
    laptop.setPart(id, 'switches', { ...taken(all), hardyWarnings: { on: true, at: 500 } }); // (switched back on in the plan)
    for (const d of [phone, laptop, phone, laptop]) expect((await sync(d, server)).conflicts).toEqual([]);
    for (const d of [phone, laptop]) expect(d.part(id, 'switches')).toEqual({ ...taken(all), hardyWarnings: { on: true, at: 500 } });
    // Each switched on its own device, at once: each switch the later of its two.
    phone.setPart(id, 'switches', { ...taken(all), hardyWarnings: { on: false, at: 700 }, fruitWarnings: { on: false, at: 650 } });
    laptop.setPart(id, 'switches', { ...taken(all), hardyWarnings: { on: true, at: 600 }, fruitWarnings: { on: true, at: 900 } });
    for (const d of [laptop, phone, laptop]) expect((await sync(d, server)).conflicts).toEqual([]);
    for (const d of [phone, laptop]) expect(d.part(id, 'switches')).toEqual({ ...taken(all), hardyWarnings: { on: false, at: 700 }, fruitWarnings: { on: true, at: 900 } });
  });
  it('switched on one device while the plan is edited on another: both kept, no copy', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    phone.setPart(id, 'switches', { poisonWarnings: { on: false, at: 100 } });
    laptop.edit(id, [1, 'a new bed']);
    for (const d of [laptop, phone, laptop, phone]) expect((await sync(d, server)).conflicts).toEqual([]);
    for (const d of [phone, laptop]) {
      expect(d.shapes(id)).toEqual([1, 'a new bed']);
      expect(d.part(id, 'switches')).toEqual({ poisonWarnings: { on: false, at: 100 } });
    }
  });
  it("a plan deleted on another device doesn't come back for what this one only took (the yard, the switches); one switched in the plan keeps it", async () => {
    for (const set of [false, true]) {
      const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
      const id = phone.add('Old plan', [1]);
      await sync(phone, server); await sync(laptop, server);
      laptop.del(id); await sync(laptop, server);
      phone.setPart(id, 'household', { kids: false, dogs: '', cats: false, horses: false, answered: false });
      phone.setPart(id, 'switches', set ? { ...taken(all), poisonWarnings: { on: false, at: 5 } } : taken(all));
      const r = await sync(phone, server);
      expect({ set, removed: r.removed, restored: r.restored }).toEqual(set ? { set, removed: [], restored: ['Old plan'] } : { set, removed: ['Old plan'], restored: [] });
    }
  });
  it('settle the same either way round', () => {
    const a = { showCrowding: { on: false }, hardyWarnings: { on: true, at: 5 }, crowdWarnings: { on: true, at: 9 }, fruitWarnings: { on: true } };
    const b = { showCrowding: { on: true }, hardyWarnings: { on: false }, crowdWarnings: { on: false, at: 9 }, poisonWarnings: { on: false, at: 1 }, odd: { on: 'x' } };
    expect(settleSwitches(a, b)).toEqual(settleSwitches(b, a));
    expect(settleSwitches(a, b)).toEqual({
      showCrowding: { on: false }, hardyWarnings: { on: true, at: 5 }, crowdWarnings: { on: false, at: 9 }, fruitWarnings: { on: true }, poisonWarnings: { on: false, at: 1 },
    });
    expect([settleSwitches(undefined, undefined), settleSwitches(a, 'x')]).toEqual([undefined, a]);
  });
  it("a plan's core leaves out its switches too", () => {
    const c = { shapes: [1], phases: [] };
    expect(coreHash('X', { ...c, switches: taken(all) })).toBe(planHash('X', c));
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
