import { describe, expect, it } from 'vitest';
import { bareHash, canonical, coreHash, fingerprint, photoKey, planHash, planOf, settleBought, settleHousehold, settleSwitches, syncOnce, withLocalParts, type Local, type LocalProject, type ProjectContent, type Remote, type SyncRecord } from '../src/sync/engine';
import { FakeServer } from './fake-sync-server';
import { keepBought, plantList } from '../src/plant-list';
import type { PlanBought, PrintSettings, PrintUnder, Shape } from '../src/types';
import { migrateShape, sanitizePhotoRef } from '../src/storage';
import { releaseMigrateShape } from './fixtures/release-migrate-shape';
import { releaseSanitizePhotoRef } from './fixtures/release-photo';
import { releaseSanitizePrint } from './fixtures/release-print';
import { Dev, FP, sync as syncDev } from './release-device';
import { DEFAULT_PRINT } from '../src/state';

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
  /** The records of projects deleted here, as the app keeps them with their tombstones. */
  deleted: Record<string, SyncRecord> = {};
  del(id: string) { if (this.recs[id]) { this.tombs[id] = this.recs[id].revision; this.deleted[id] = this.recs[id]; } delete this.recs[id]; this.projectsById.delete(id); }
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
    if (rec && !this.projectsById.has(id)) { this.tombs[id] = rec.revision; this.deleted[id] = rec; delete this.recs[id]; return; }
    if (rec) this.recs[id] = rec; else delete this.recs[id];
  }
  tombstones() { return { ...this.tombs }; }
  deletedRecord(id: string) { return this.deleted[id]; }
  async clearTombstone(id: string) { delete this.tombs[id]; delete this.deleted[id]; }
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
  // A planted plant deleted gives no tick back (the list bug hunt, Nov 1): its kind's count goes down with it, a moment
  // later than the tick, so it reaches the other devices; Undo's count likewise.
  it('a planted plant deleted on one device: the other device\'s list agrees, no tick given back; Undo there reaches it too', async () => {
    const T = new Date(2026, 10, 1, 10).getTime();
    const p = (id: string, extra: Partial<Shape> = {}) => ({ id, type: 'circle', role: 'plant', plantId: 'goldsturm', label: 'Goldsturm', x: 0, y: 0, radius: 1, color: '#000', opacity: 1, locked: false, ...extra } as Shape);
    const planted = { status: 'planted', plantedOn: '2026-11-01' } as const;
    const all = [p('a', planted), p('b', planted), p('c', planted), p('d'), p('e')];
    const bought = (d: FakeDevice, id: string) => plantList(d.shapes(id) as Shape[], {}, d.part(id, 'bought') as PlanBought).buy[0].bought;
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', all);
    phone.setPart(id, 'bought', { goldsturm: tick(3, T) });
    await sync(phone, server); await sync(laptop, server);
    expect(bought(laptop, id)).toBe(0);
    // The phone deletes a planted one; the laptop ticks another kind meanwhile.
    const less = all.filter((s) => s.id !== 'a');
    const after = keepBought(phone.part(id, 'bought') as PlanBought, all, less, {})!;
    expect(after.goldsturm).toEqual(tick(2, T + 1));
    phone.edit(id, less); phone.setPart(id, 'bought', after);
    laptop.setPart(id, 'bought', { ...(laptop.part(id, 'bought') as object), aster: tick(1, T + 500) });
    await sync(phone, server);
    expect((await sync(laptop, server)).conflicts).toEqual([]);
    await sync(phone, server);
    for (const d of [phone, laptop]) {
      expect(d.part(id, 'bought')).toEqual({ goldsturm: tick(2, T + 1), aster: tick(1, T + 500) });
      expect(bought(d, id)).toBe(0); // (not "1 of 2 bought")
    }
    // Undo on the phone: the plant back, the count with it, later still, so it reaches the laptop too.
    const back = keepBought(phone.part(id, 'bought') as PlanBought, less, all, {})!;
    phone.edit(id, all); phone.setPart(id, 'bought', back);
    await sync(phone, server); await sync(laptop, server);
    expect(laptop.part(id, 'bought')).toEqual({ goldsturm: tick(3, T + 2), aster: tick(1, T + 500) });
    expect(bought(laptop, id)).toBe(0);
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

// A device that synced while still on the version before plans kept their ticks, yard and switches, then updates (the
// review of the storage change, Nov 1). That version stored a download without those parts and recorded it without
// them, so the server's are unknown to it: its first upload after the update must settle with them, not replace them.
const PARTS = ['bought', 'household', 'switches'];
/** A device on the version before, until `update()`: it drops the parts it doesn't know, and records as that version did. */
class OlderDevice extends FakeDevice {
  old = true;
  update() { this.old = false; }
  normalize(name: string, content: ProjectContent) {
    const r = super.normalize(name, content);
    if (this.old) for (const k of PARTS) delete r.content[k];
    return r;
  }
  async setRecord(id: string, rec: SyncRecord | null) {
    // (That version's records had no core, nor the parts.)
    await super.setRecord(id, rec && this.old ? { revision: rec.revision, hash: rec.hash, ...(rec.photo ? { photo: rec.photo } : {}) } : rec);
  }
}
describe('a device that synced on the version before, then updates', () => {
  const none = { kids: false, dogs: '', cats: false, horses: false, answered: false };
  const taken = (on: Record<string, boolean>) => Object.fromEntries(Object.entries(on).map(([k, v]) => [k, { on: v }]));
  const all = { showCrowding: true, crowdWarnings: true, hardyWarnings: true, poisonWarnings: true, fruitWarnings: true };
  /** A plan on both, the phone updated with what it had (a dog; crowding rings off), the laptop synced since on the old version. */
  async function phoneFirst() {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new OlderDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    await sync(phone, server); await sync(laptop, server);
    phone.setPart(id, 'household', { ...none, dogs: 'hideToxic', answered: true });
    phone.setPart(id, 'switches', taken({ ...all, showCrowding: false }));
    await sync(phone, server);
    await sync(laptop, server);
    expect(laptop.recs[id]).not.toHaveProperty('parts'); // (that version's record: the server's parts unknown to it)
    return { server, phone, laptop, id };
  }
  it("its yard and switches, carried over, settle with the other device's: no copy, a dog either had stays, crowding rings either had off stay off", async () => {
    const { server, phone, laptop, id } = await phoneFirst();
    laptop.update(); // (its plans take what it had: no one in the yard, every warning on)
    laptop.setPart(id, 'household', { ...none });
    laptop.setPart(id, 'switches', taken(all));
    expect((await sync(laptop, server)).conflicts).toEqual([]);
    await sync(phone, server); await sync(laptop, server);
    const yard = { ...none, dogs: 'hideToxic', answered: true }, sw = taken({ ...all, showCrowding: false });
    for (const c of [server.rows.get(id)!.content, phone.projectsById.get(id)!.content, laptop.projectsById.get(id)!.content]) {
      expect(c.household).toEqual(yard);
      expect(c.switches).toEqual(sw);
    }
    expect([phone.names(), laptop.names()]).toEqual([['Back Yard'], ['Back Yard']]);
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 0 });
  });
  it("the other device's ticks aren't lost: the updated device's first upload settles, and its own ticks join them", async () => {
    for (const tickFirst of [false, true]) {
      const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new OlderDevice('laptop');
      const id = phone.add('Back Yard', [1]);
      await sync(phone, server); await sync(laptop, server);
      phone.setPart(id, 'bought', { yaupon: { n: 3, at: 100 } });
      await sync(phone, server);
      await sync(laptop, server); // (on the old version: the ticks dropped)
      laptop.update();
      laptop.setPart(id, 'household', { ...none }); laptop.setPart(id, 'switches', taken(all));
      if (tickFirst) laptop.setPart(id, 'bought', { aster: { n: 1, at: 200 } }); // (ticked before its first sync since)
      await sync(laptop, server);
      if (!tickFirst) { laptop.setPart(id, 'bought', { ...(laptop.part(id, 'bought') as object), aster: { n: 1, at: 200 } }); await sync(laptop, server); }
      await sync(phone, server);
      const both = { yaupon: { n: 3, at: 100 }, aster: { n: 1, at: 200 } };
      expect({ tickFirst, phone: phone.part(id, 'bought'), laptop: laptop.part(id, 'bought'), server: server.rows.get(id)!.content.bought })
        .toEqual({ tickFirst, phone: both, laptop: both, server: both });
    }
  });
  it('the yard set on the other device in the meantime wins over what this one carried over', async () => {
    const { server, phone, laptop, id } = await phoneFirst();
    phone.setPart(id, 'household', { ...none, cats: true, answered: true, at: 700 });
    await sync(phone, server);
    await sync(laptop, server); // (still old)
    laptop.update();
    laptop.setPart(id, 'household', { ...none, kids: true, answered: true });
    laptop.setPart(id, 'switches', taken(all));
    await sync(laptop, server); await sync(phone, server);
    for (const d of [phone, laptop]) expect(d.part(id, 'household')).toEqual({ ...none, cats: true, answered: true, at: 700 });
  });
  it('parts this device lost to a version before it, saving the plan here after the update, come back as they were before going up', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = laptop.add('Back Yard', [1]);
    laptop.setPart(id, 'household', { ...none, kids: true, answered: true, at: 500 });
    laptop.setPart(id, 'switches', { ...taken(all), poisonWarnings: { on: false, at: 510 } });
    laptop.setPart(id, 'bought', { yaupon: { n: 2, at: 520 } });
    await sync(laptop, server); await sync(phone, server);
    // An older version open on the laptop saved the plan without them; this version filled in what the device had.
    laptop.setPart(id, 'household', { ...none });
    laptop.setPart(id, 'switches', taken(all));
    laptop.setPart(id, 'bought', undefined);
    laptop.edit(id, [1, 'a new bed']);
    await sync(laptop, server); await sync(phone, server);
    for (const c of [server.rows.get(id)!.content, laptop.projectsById.get(id)!.content, phone.projectsById.get(id)!.content]) {
      expect(c.shapes).toEqual([1, 'a new bed']);
      expect(c.household).toEqual({ ...none, kids: true, answered: true, at: 500 });
      expect((c.switches as Record<string, unknown>).poisonWarnings).toEqual({ on: false, at: 510 });
      expect(c.bought).toEqual({ yaupon: { n: 2, at: 520 } });
    }
  });
  it("a plan deleted here before another device's update reached the server stays deleted: carried-over parts aren't an edit", async () => {
    for (const edit of ['none', 'tick', 'shapes'] as const) {
      const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
      const id = phone.add('Old plan', [1]);
      await sync(phone, server); await sync(laptop, server);
      // The laptop updated: the plan goes up with what it took (or with an edit made there too).
      laptop.setPart(id, 'household', { ...none });
      laptop.setPart(id, 'switches', taken(all));
      if (edit === 'tick') laptop.setPart(id, 'bought', { aster: { n: 1, at: 300 } });
      if (edit === 'shapes') laptop.edit(id, [1, 2]);
      await sync(laptop, server);
      phone.del(id); // (before the phone's next sync)
      const r = await sync(phone, server);
      expect({ edit, undeleted: r.undeleted, names: phone.names(), deleted: server.rows.get(id)!.deleted })
        .toEqual(edit === 'none' ? { edit, undeleted: [], names: [], deleted: true } : { edit, undeleted: ['Old plan'], names: ['Old plan'], deleted: false });
    }
  });
  it("a plan deleted elsewhere doesn't come back for a carried-over yard that changed here since this version recorded it; a set one brings it back", async () => {
    for (const set of [false, true]) {
      const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
      const id = phone.add('Old plan', [1]);
      await sync(phone, server); await sync(laptop, server);
      laptop.setPart(id, 'household', { ...none, answered: true });
      laptop.setPart(id, 'switches', taken(all));
      await sync(laptop, server); await sync(phone, server);
      expect(laptop.recs[id].parts).toBeTruthy(); // (this version's record, with the parts it had)
      phone.del(id); await sync(phone, server);
      laptop.setPart(id, 'household', { ...none, answered: false, ...(set ? { at: 900 } : {}) });
      const r = await sync(laptop, server);
      expect({ set, removed: r.removed, restored: r.restored }).toEqual(set ? { set, removed: [], restored: ['Old plan'] } : { set, removed: ['Old plan'], restored: [] });
    }
  });
});

// The second review of the storage change (Nov 1): the fixes to the first, checked at their edges.
describe('the parts with what this version can see, and older records', () => {
  const none = { kids: false, dogs: '', cats: false, horses: false, answered: false };
  const taken = (on: Record<string, boolean>) => Object.fromEntries(Object.entries(on).map(([k, v]) => [k, { on: v }]));
  const all = { showCrowding: true, crowdWarnings: true, hardyWarnings: true, poisonWarnings: true, fruitWarnings: true };
  /** This version, beside a later one: storing a plan leaves out what only the later one knows (a plan's notes, a shape's mood). */
  class ThisVersion extends FakeDevice {
    normalize(name: string, content: ProjectContent) {
      const r = super.normalize(name, content);
      delete r.content.notes;
      if (Array.isArray(r.content.shapes)) r.content.shapes = r.content.shapes.map((x) => { if (x && typeof x === 'object') { const { mood: _m, ...rest } = x as Record<string, unknown>; return rest; } return x; });
      return r;
    }
  }
  it("a plan deleted here comes back for an edit there to a part only a later version knows, of the plan or of a shape: not into the trash", async () => {
    for (const edit of ['plan', 'shape'] as const) {
      const server = new FakeServer(), phone = new ThisVersion('phone'), laptop = new FakeDevice('laptop');
      const id = phone.add('Old plan', [{ id: 'oak' }]);
      await sync(phone, server); await sync(laptop, server);
      // The laptop, on a later version, carried over what it had, and edited what this version can't see.
      laptop.setPart(id, 'household', { ...none }); laptop.setPart(id, 'switches', taken(all));
      if (edit === 'plan') laptop.setPart(id, 'notes', 'Gus dug here: replant in spring');
      else laptop.edit(id, [{ id: 'oak', mood: 'thriving' }]);
      await sync(laptop, server);
      phone.del(id);
      const r = await sync(phone, server);
      expect({ edit, undeleted: r.undeleted, deleted: server.rows.get(id)!.deleted }).toEqual({ edit, undeleted: ['Old plan'], deleted: false });
      const row = server.rows.get(id)!.content;
      expect(edit === 'plan' ? row.notes : row.shapes).toEqual(edit === 'plan' ? 'Gus dug here: replant in spring' : [{ id: 'oak', mood: 'thriving' }]);
    }
  });
  it("only the record of this deletion counts: an earlier deletion's, left by an older version, brings the plan back as before", async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Old plan', [1]);
    await sync(phone, server); await sync(laptop, server);
    laptop.setPart(id, 'household', { ...none }); laptop.setPart(id, 'switches', taken(all));
    await sync(laptop, server);
    phone.del(id);
    phone.deleted[id] = { ...phone.deleted[id], revision: phone.tombs[id] - 1 }; // (the record of an earlier deletion)
    const r = await sync(phone, server);
    expect([r.undeleted, server.rows.get(id)!.deleted]).toEqual([['Old plan'], false]);
  });
  it("a record an older version on this device wrote back without its core and parts: a tick here and an edit there are both kept, with no copy", async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = phone.add('Back Yard', [1]);
    phone.setPart(id, 'household', { ...none, answered: true, at: 5 });
    await sync(phone, server); await sync(laptop, server);
    laptop.recs[id] = { revision: laptop.recs[id].revision, hash: laptop.recs[id].hash }; // (an older tab kept only these)
    laptop.setPart(id, 'bought', { aster: { n: 1, at: 50 } });
    phone.edit(id, [1, 'new bed']); await sync(phone, server);
    const r = await sync(laptop, server);
    expect(r.conflicts).toEqual([]);
    await sync(phone, server);
    for (const d of [phone, laptop]) {
      expect(d.shapes(id)).toEqual([1, 'new bed']);
      expect(d.part(id, 'bought')).toEqual({ aster: { n: 1, at: 50 } });
      expect(d.names()).toEqual(['Back Yard']);
    }
  });
  it('a part put back older here (an unsaved copy replayed late) goes up settled: the newer one the server has stays', async () => {
    const server = new FakeServer(), phone = new FakeDevice('phone'), laptop = new FakeDevice('laptop');
    const id = laptop.add('Back Yard', [1]);
    laptop.setPart(id, 'household', { ...none, kids: true, answered: true, at: 300 });
    laptop.setPart(id, 'bought', { yaupon: { n: 2, at: 300 } });
    await sync(laptop, server); await sync(phone, server);
    phone.setPart(id, 'household', { ...none, dogs: 'hideToxic', answered: true, at: 500 });
    phone.setPart(id, 'bought', { yaupon: { n: 0, at: 500 } });
    await sync(phone, server); await sync(laptop, server);
    laptop.setPart(id, 'household', { ...none, kids: true, answered: true, at: 300 });
    laptop.setPart(id, 'bought', { yaupon: { n: 2, at: 300 }, aster: { n: 1, at: 600 } }); // (and a tick made since)
    laptop.edit(id, [1, 'x']);
    await sync(laptop, server); await sync(phone, server);
    for (const c of [server.rows.get(id)!.content, laptop.projectsById.get(id)!.content, phone.projectsById.get(id)!.content]) {
      expect(c.household).toEqual({ ...none, dogs: 'hideToxic', answered: true, at: 500 });
      expect(c.bought).toEqual({ yaupon: { n: 0, at: 500 }, aster: { n: 1, at: 600 } });
      expect(c.shapes).toEqual([1, 'x']);
    }
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

// A field the release doesn't know: a fruit-partner warning dismissed for one plant (fruitDismissed, Nov 1). Each device
// reads shapes as its version's migrateShape does, downloads and its own plans alike (src/sync/local.ts tidy): this
// version's, or the release's (tests/fixtures/release-migrate-shape.ts), which leaves the field out. A device on the
// release sends plans without it, even over a newer dismissal; a device of this version keeps its own then
// (src/sync/engine.ts withFruitDismissals), unless it was shown again on purpose (''). Nothing else is lost; nothing
// goes round and round.
describe("a field the release doesn't know, through a device or a tab on the release (fruitDismissed, Nov 1)", () => {
  const said = "American holly 'Clarendon Spreading' is a female: it needs a male of its kind nearby to fruit";
  const holly = (id: string, x: number, extra: object = {}) => ({ id, type: 'circle', x, y: 0, radius: 3, color: '#14532d', label: "American holly 'Clarendon Spreading'", opacity: 0.65, locked: false, role: 'plant', plantId: 'ilex-opaca-clarendon-spreading', ...extra });
  const bed = (x: number) => ({ id: 'bed', type: 'rect', x, y: -5, width: 20, height: 10, rotation: 0, color: '#a16207', label: 'Front bed', opacity: 0.4, locked: false, role: 'bed' });
  /** A device, or a tab, whose app reads shapes as `migrate` does; `sharing`: a tab on the same device (the same storage, its own records). */
  class VersionDevice extends FakeDevice {
    constructor(name: string, readonly migrate: (raw: unknown) => Shape | null, sharing?: FakeDevice) {
      super(name);
      if (sharing) this.projectsById = sharing.projectsById;
    }
    normalize(name: string, content: ProjectContent) {
      const n = super.normalize(name, content);
      return Array.isArray(n.content.shapes) ? { ...n, content: { ...n.content, shapes: n.content.shapes.map((x) => this.migrate(x)).filter((x) => x !== null) } } : n;
    }
    async projects() { return (await super.projects()).map((p) => ({ ...p, content: this.normalize(p.name, p.content).content })); }
  }
  /**
   * A tab of this version with a plan open: sync reads that plan from the tab's memory, as the app does (src/storage.ts
   * projectNow), which an old tab writing the storage they share doesn't change; an edit saves it to that storage.
   */
  class OpenTab extends VersionDevice {
    open: LocalProject | null = null;
    openPlan(id: string) { this.open = structuredClone(this.projectsById.get(id)!); }
    edit(id: string, shapes: unknown[]) { super.edit(id, shapes); if (this.open?.id === id) this.open = structuredClone(this.projectsById.get(id)!); }
    async projects() { return (await super.projects()).map((p) => (p.id === this.open?.id ? { ...p, content: this.normalize(p.name, this.open.content).content } : p)); }
    async replace(id: string, name: string, content: ProjectContent, token: number, bytes?: string) {
      const ok = await super.replace(id, name, content, token, bytes);
      if (ok && this.open?.id === id) this.open = structuredClone(this.projectsById.get(id)!);
      return ok;
    }
  }
  const shapesOf = (d: FakeDevice, id: string) => d.projectsById.get(id)!.content.shapes as Shape[];
  const onServer = (server: FakeServer, id: string) => server.rows.get(id)!.content.shapes as Shape[];
  /** Each synced, a few times over: nothing moves. */
  async function still(server: FakeServer, ...devices: FakeDevice[]) {
    for (let i = 0; i < 3; i++) {
      for (const d of devices) expect(await sync(d, server)).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: [], restored: [], removed: [] });
    }
  }
  /** The plan: two hollies (the first's own dismissal, `h1`), the bed moved to `bedX`, the second holly at `h2x`. */
  const plan = (h1: object = {}, bedX = 0, h2x = 10) => [holly('h1', 0, h1), holly('h2', h2x), bed(bedX)];
  const as = (migrate: (raw: unknown) => Shape | null, shapes: object[]) => shapes.map((x) => migrate(x));

  it("kept from here only for the same plant (its id and plantId), when the server's copy has none at all; one there, '' or words, stands", () => {
    const mine = { shapes: [holly('h1', 0, { fruitDismissed: said }), holly('h2', 10, { fruitDismissed: said }), bed(0)] };
    const there = (h1: object, h2: object) => ({ shapes: [holly('h1', 0, h1), holly('h2', 10, h2), bed(4)] });
    expect(withLocalParts(there({}, {}), mine)).toEqual(there({ fruitDismissed: said }, { fruitDismissed: said }));
    // Shown again there (''), or swapped there for another plant: left as the server has it.
    expect(withLocalParts(there({ fruitDismissed: '' }, { plantId: 'ilex-opaca' }), mine)).toEqual(there({ fruitDismissed: '' }, { plantId: 'ilex-opaca' }));
    // Shown again here: '' kept too, where the server's has none (the second review, Nov 1); not over words there.
    const shown = { shapes: [holly('h1', 0, { fruitDismissed: '' }), holly('h2', 10, { fruitDismissed: '' })] };
    expect(withLocalParts(there({}, { fruitDismissed: said }), shown)).toEqual(there({ fruitDismissed: '' }, { fruitDismissed: said }));
  });

  it("fingerprinted, '' reads as none: a plan without it as before, to the character; words to '' a change, as words to none", () => {
    const old = (name: string, c: ProjectContent) => fingerprint(name, planOf(c)); // (planHash before the second review)
    const withParts = (h1: object) => ({ shapes: plan(h1), household: { kids: true }, photo: null });
    for (const c of [withParts({}), withParts({ fruitDismissed: said }), { shapes: [] }, { shapes: [1, 2] }, {}]) {
      expect(planHash('Back Yard', c)).toBe(old('Back Yard', c));
      const { household: _h, ...core } = planOf(c);
      expect(coreHash('Back Yard', c)).toBe(fingerprint('Back Yard', core));
    }
    const h = (h1: object) => [planHash('X', withParts(h1)), coreHash('X', withParts(h1))];
    expect(h({ fruitDismissed: '' })).toEqual(h({}));
    expect(h({ fruitDismissed: said })).not.toEqual(h({ fruitDismissed: '' }));
    expect(h({ fruitDismissed: said })[0]).not.toBe(h({})[0]);
    // (Only what's hashed: the shape itself keeps its '', and goes up with it.)
    const c = withParts({ fruitDismissed: '' });
    planHash('X', c);
    expect((c.shapes[0] as { fruitDismissed?: string }).fruitDismissed).toBe('');
  });

  it("the review's RF7: dismissed for one and taken back before the plan synced, while another device edited it: no conflict copy, the edit taken", async () => {
    const server = new FakeServer(), phone = new VersionDevice('phone', migrateShape), tablet = new VersionDevice('tablet', migrateShape);
    const id = phone.add('Back Yard', plan());
    await sync(phone, server); await sync(tablet, server);
    phone.edit(id, plan({ fruitDismissed: said })); // (Dismiss for this one)
    phone.edit(id, plan({ fruitDismissed: '' })); // (Undo, or Show again, before its sync)
    tablet.edit(id, plan({}, 4));
    expect(await sync(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
    expect(phone.names()).toEqual(['Back Yard']);
    expect(shapesOf(phone, id)).toEqual(as(migrateShape, plan({ fruitDismissed: '' }, 4)));
    await still(server, phone, tablet);
    // A dismissal that had gone up, shown again: still a change, and the '' goes up.
    phone.edit(id, plan({ fruitDismissed: said }, 4));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    phone.edit(id, plan({ fruitDismissed: '' }, 4));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(onServer(server, id)[0].fruitDismissed).toBe('');
    expect(await sync(tablet, server)).toMatchObject({ downloaded: 1 });
    expect(shapesOf(tablet, id)[0].fruitDismissed).toBe('');
    await still(server, phone, tablet);
  });

  it("a device that showed it again keeps its '' where the release dropped it, and sends it with its next edit; a device offline through it then takes the ''. If that one sends first, its words come back (the window left, docs/storage.md)", async () => {
    for (const first of ['tablet', 'phone'] as const) {
      const server = new FakeServer(), phone = new VersionDevice('phone', migrateShape), tablet = new VersionDevice('tablet', migrateShape), laptop = new VersionDevice('laptop', releaseMigrateShape);
      const id = phone.add('Back Yard', plan({ fruitDismissed: said }));
      await sync(phone, server); await sync(tablet, server); await sync(laptop, server);
      // The phone goes offline. The tablet shows it again; the laptop (release) takes that and sends an edit, without it.
      tablet.edit(id, plan({ fruitDismissed: '' }));
      await sync(tablet, server);
      await sync(laptop, server);
      laptop.edit(id, as(releaseMigrateShape, plan({}, 4)));
      await sync(laptop, server);
      expect(onServer(server, id)[0]).not.toHaveProperty('fruitDismissed');
      // The tablet takes the edit and keeps its '' (before the second review: nothing, as the release left it).
      expect(await sync(tablet, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
      expect(shapesOf(tablet, id)[0].fruitDismissed).toBe('');
      // The phone, back, has its words, which the server's copy no longer contradicts: kept.
      await sync(phone, server);
      expect(shapesOf(phone, id)[0].fruitDismissed).toBe(said);
      // Whichever sends the plan first, with an edit, decides.
      const [a, b] = first === 'tablet' ? [tablet, phone] : [phone, tablet];
      a.edit(id, plan({ fruitDismissed: first === 'tablet' ? '' : said }, 4, 12));
      expect(await sync(a, server)).toMatchObject({ uploaded: 1 });
      expect(await sync(b, server)).toMatchObject({ downloaded: 1, conflicts: [] });
      expect([shapesOf(phone, id)[0].fruitDismissed, shapesOf(tablet, id)[0].fruitDismissed]).toEqual(first === 'tablet' ? ['', ''] : [said, said]);
      await sync(laptop, server);
      await still(server, phone, tablet, laptop);
    }
  });

  it('another device on the release never sends anything for it alone; its own edit goes up without it, and the device that dismissed it keeps it, and sends it again', async () => {
    const server = new FakeServer(), phone = new VersionDevice('phone', migrateShape), laptop = new VersionDevice('laptop', releaseMigrateShape);
    const id = phone.add('Back Yard', plan());
    await sync(phone, server); await sync(laptop, server);
    // Dismissed for one holly on the phone: up, and down to the laptop, which reads it without the field.
    phone.edit(id, plan({ fruitDismissed: said }));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(shapesOf(laptop, id)).toEqual(as(releaseMigrateShape, plan()));
    await still(server, laptop, phone);
    expect(onServer(server, id)[0].fruitDismissed).toBe(said); // (the laptop sent nothing back without it)
    // The laptop moves the bed: its plan goes up without the field. The phone takes the bed moved and keeps its
    // dismissal; no copy, no loop.
    laptop.edit(id, as(releaseMigrateShape, plan({}, 4)));
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1 });
    expect(onServer(server, id)[0]).not.toHaveProperty('fruitDismissed');
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
    expect(shapesOf(phone, id)).toEqual(as(migrateShape, plan({ fruitDismissed: said }, 4)));
    await still(server, phone, laptop);
    // The phone's next edit sends it again; the laptop takes the edit, as it reads it.
    phone.edit(id, plan({ fruitDismissed: said }, 4, 12));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(onServer(server, id)[0].fruitDismissed).toBe(said);
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(shapesOf(laptop, id)).toEqual(as(releaseMigrateShape, plan({}, 4, 12)));
    await still(server, phone, laptop);
    expect([phone.names(), laptop.names()]).toEqual([['Back Yard'], ['Back Yard']]);
  });

  it("the review's R1: the release, with an edit of its own not yet synced, sends it over a newer dismissal; each device that had the dismissal keeps it", async () => {
    const server = new FakeServer(), phone = new VersionDevice('phone', migrateShape), tablet = new VersionDevice('tablet', migrateShape), laptop = new VersionDevice('laptop', releaseMigrateShape);
    const id = phone.add('Back Yard', plan());
    await sync(phone, server); await sync(tablet, server); await sync(laptop, server);
    laptop.edit(id, as(releaseMigrateShape, plan({}, 4))); // (offline: the bed moved)
    phone.edit(id, plan({ fruitDismissed: said })); // (dismissed for one holly)
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(tablet, server)).toMatchObject({ downloaded: 1 });
    // The release's merge can't see a change on the server (only the field), so it's taken as changed here only: up over it.
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect(onServer(server, id)[0]).not.toHaveProperty('fruitDismissed');
    // The phone and the tablet take the bed moved, and keep the dismissal.
    for (const d of [phone, tablet]) {
      expect(await sync(d, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
      expect(shapesOf(d, id)).toEqual(as(migrateShape, plan({ fruitDismissed: said }, 4)));
    }
    await still(server, phone, tablet, laptop);
    // Shown again on the tablet ('', on purpose): that goes everywhere, and isn't filled back from the phone's copy.
    tablet.edit(id, plan({ fruitDismissed: '' }, 4));
    expect(await sync(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(shapesOf(phone, id)[0].fruitDismissed).toBe('');
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 1 }); // (the tablet's revision, as it reads it)
    await still(server, phone, tablet, laptop);
    expect([phone.names(), tablet.names(), laptop.names()]).toEqual([['Back Yard'], ['Back Yard'], ['Back Yard']]);
  });

  it('a tab on the release sharing the device\'s storage, the plan not open in the new tab: the old tab writes it back without the dismissal, the new tab sends that once, and it settles', async () => {
    const server = new FakeServer(), tab = new VersionDevice('Windows PC', migrateShape), old = new VersionDevice('Windows PC', releaseMigrateShape, tab);
    const id = tab.add('Back Yard', plan());
    await sync(tab, server); await sync(old, server);
    tab.edit(id, plan({ fruitDismissed: said }));
    expect(await sync(tab, server)).toMatchObject({ uploaded: 1 });
    // The old tab takes the server's plan into the storage they share, as it reads it; the new tab, reading it there
    // (not open in it), sends that: only the dismissal lost.
    expect(await sync(old, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(await sync(tab, server)).toMatchObject({ uploaded: 1, downloaded: 0 });
    expect(await sync(old, server)).toMatchObject({ uploaded: 0, downloaded: 1 }); // (that revision, the same plan)
    await still(server, old, tab);
    expect(shapesOf(tab, id)).toEqual(as(releaseMigrateShape, plan()));
    expect(onServer(server, id)).toEqual(as(releaseMigrateShape, plan()));
    expect(tab.names()).toEqual(['Back Yard']);
  });

  it("the old tab sends the new tab's other edit first (the plan not open in the new tab): no copy; the bed moved kept", async () => {
    const server = new FakeServer(), tab = new VersionDevice('Windows PC', migrateShape), old = new VersionDevice('Windows PC', releaseMigrateShape, tab);
    const id = tab.add('Back Yard', plan());
    await sync(tab, server); await sync(old, server);
    // Dismissed and the bed moved, in the new tab; the old tab's pass comes first and sends the bed moved, without the field.
    tab.edit(id, plan({ fruitDismissed: said }, 4));
    expect(await sync(old, server)).toMatchObject({ uploaded: 1 });
    // The new tab: the server's version is its own but for the field, which it keeps: no copy (before the review, a copy).
    expect(await sync(tab, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect(onServer(server, id)[0].fruitDismissed).toBe(said);
    for (let i = 0; i < 3; i++) { await sync(old, server); await sync(tab, server); }
    await still(server, old, tab);
    // (Then as above: the old tab wrote the storage they share without it, the plan not open in the new tab.)
    expect(onServer(server, id)).toEqual(as(releaseMigrateShape, plan({}, 4)));
    expect(tab.names()).toEqual(['Back Yard']);
  });

  it('a tab on the release, the plan open in the new tab: the dismissal stays there, goes up with its next edit, and no copy is made, whichever tab syncs first', async () => {
    const server = new FakeServer(), tab = new OpenTab('Windows PC', migrateShape), old = new VersionDevice('Windows PC', releaseMigrateShape, tab);
    const id = tab.add('Back Yard', plan());
    tab.openPlan(id);
    await sync(tab, server); await sync(old, server);
    tab.edit(id, plan({ fruitDismissed: said }));
    expect(await sync(tab, server)).toMatchObject({ uploaded: 1 });
    // The old tab writes the server's plan into storage as it reads it; the new tab reads its own from memory: unchanged.
    expect(await sync(old, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(await sync(tab, server)).toMatchObject({ uploaded: 0, downloaded: 0 });
    expect(tab.open!.content.shapes as Shape[]).toEqual(as(migrateShape, plan({ fruitDismissed: said })));
    // The new tab moves the bed (saved to storage, the dismissal with it), and the old tab's pass comes first: it sends
    // the bed moved without the field. The new tab keeps it and sends it again: no copy.
    tab.edit(id, plan({ fruitDismissed: said }, 4));
    expect(await sync(old, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(tab, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect(onServer(server, id)).toEqual(as(migrateShape, plan({ fruitDismissed: said }, 4)));
    expect(await sync(old, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    await still(server, old, tab);
    expect(tab.open!.content.shapes as Shape[]).toEqual(as(migrateShape, plan({ fruitDismissed: said }, 4)));
    expect(onServer(server, id)[0].fruitDismissed).toBe(said);
    expect(tab.names()).toEqual(['Back Yard']);
  });
});

// A bed's conditions (Plant this bed, Nov 2): a field an older version doesn't know, as fruitDismissed was. Each device
// reads shapes as its version's migrateShape does: this version's, or the release's (tests/fixtures/release-migrate-
// shape.ts), which leaves the field out as a version-3 device's does. A device on an older version sends plans without
// it, even over newer answers; a device of this version keeps its own then (src/sync/engine.ts withBedConditions), {}
// (cleared on purpose) included, and never over what the server has. Nothing else is lost; nothing goes round and round.
describe("a bed's conditions through a device or a tab on an older version (conditions, Nov 2)", () => {
  const ALL = { sun: { most: 'Full', least: 'Part' }, soil: 'clay', moisture: 'average', drip: true };
  const SAND = { soil: 'sand', moisture: 'dry' };
  const bed = (id: string, x: number, extra: object = {}) => ({ id, type: 'rect', x, y: -5, width: 20, height: 10, rotation: 0, color: '#a16207', label: 'Front bed', opacity: 0.4, locked: false, role: 'bed', ...extra });
  const aster = (x: number) => ({ id: 'a1', type: 'circle', x, y: 0, radius: 1, color: '#7c3aed', label: 'Aromatic aster', opacity: 0.65, locked: false, role: 'plant', plantId: 'symphyotrichum-oblongifolium' });
  /** The plan: the front bed (its conditions `c`, if any; moved to `bedX`), a back bed, and an aster at `ax`. */
  const plan = (c?: object, bedX = 0, ax = 2) => [bed('b1', bedX, c === undefined ? {} : { conditions: c }), bed('b2', 40, { label: 'Back bed' }), aster(ax)];
  /** A device, or a tab, whose app reads shapes as `migrate` does; `sharing`: a tab on the same device (the same storage, its own records). */
  class VersionDevice extends FakeDevice {
    constructor(name: string, readonly migrate: (raw: unknown) => Shape | null, sharing?: FakeDevice) {
      super(name);
      if (sharing) this.projectsById = sharing.projectsById;
    }
    normalize(name: string, content: ProjectContent) {
      const n = super.normalize(name, content);
      return Array.isArray(n.content.shapes) ? { ...n, content: { ...n.content, shapes: n.content.shapes.map((x) => this.migrate(x)).filter((x) => x !== null) } } : n;
    }
    async projects() { return (await super.projects()).map((p) => ({ ...p, content: this.normalize(p.name, p.content).content })); }
  }
  /** A tab of this version with a plan open: sync reads that plan from the tab's memory (src/storage.ts projectNow). */
  class OpenTab extends VersionDevice {
    open: LocalProject | null = null;
    openPlan(id: string) { this.open = structuredClone(this.projectsById.get(id)!); }
    edit(id: string, shapes: unknown[]) { super.edit(id, shapes); if (this.open?.id === id) this.open = structuredClone(this.projectsById.get(id)!); }
    async projects() { return (await super.projects()).map((p) => (p.id === this.open?.id ? { ...p, content: this.normalize(p.name, this.open.content).content } : p)); }
    async replace(id: string, name: string, content: ProjectContent, token: number, bytes?: string) {
      const ok = await super.replace(id, name, content, token, bytes);
      if (ok && this.open?.id === id) this.open = structuredClone(this.projectsById.get(id)!);
      return ok;
    }
  }
  const shapesOf = (d: FakeDevice, id: string) => d.projectsById.get(id)!.content.shapes as Shape[];
  const onServer = (server: FakeServer, id: string) => server.rows.get(id)!.content.shapes as Shape[];
  const front = (shapes: Shape[]) => shapes.find((s) => s.id === 'b1')!;
  async function still(server: FakeServer, ...devices: FakeDevice[]) {
    for (let i = 0; i < 3; i++) {
      for (const d of devices) expect(await sync(d, server)).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: [], restored: [], removed: [] });
    }
  }
  const as = (migrate: (raw: unknown) => Shape | null, shapes: object[]) => shapes.map((x) => migrate(x));
  const older = () => new VersionDevice('laptop', releaseMigrateShape);

  it("kept from here only for the same bed (its id, a bed there too), when the server's copy has none at all; one there, {} or answers, stands", () => {
    const mine = { shapes: [bed('b1', 0, { conditions: ALL }), bed('b2', 40, { conditions: {} }), aster(2)] };
    const there = (b1: object, b2: object) => ({ shapes: [bed('b1', 4, b1), bed('b2', 40, b2), aster(2)] });
    const filled = withLocalParts(there({}, {}), mine);
    expect(filled).toEqual(there({ conditions: ALL }, { conditions: {} }));
    // (Its own copy: nothing shared with this device's plan.)
    ((filled.shapes as Shape[])[0].conditions as { soil: string }).soil = 'loam';
    expect((mine.shapes[0] as { conditions?: unknown }).conditions).toEqual(ALL);
    // Some there ({} or answers): left as the server has them.
    expect(withLocalParts(there({ conditions: SAND }, { conditions: ALL }), mine)).toEqual(there({ conditions: SAND }, { conditions: ALL }));
    expect(withLocalParts(there({ conditions: {} }, {}), mine)).toEqual(there({ conditions: {} }, { conditions: {} }));
    // Made something else there: not a bed, nothing filled in.
    expect(withLocalParts(there({ role: 'lawn' }, { role: undefined }), mine)).toEqual(there({ role: 'lawn' }, { role: undefined }));
    // Nothing here to keep: as the server has it (the same object).
    const plain = there({}, {});
    expect(withLocalParts(plain, { shapes: [bed('b1', 0), aster(2)] })).toBe(plain);
  });

  it("fingerprinted, {} reads as none: a plan without it as before, to the character; answers to {} a change, as answers to none", () => {
    const old = (name: string, c: ProjectContent) => fingerprint(name, planOf(c)); // (planHash for a plan with neither '' nor {})
    const withParts = (c?: object) => ({ shapes: plan(c), household: { kids: true }, photo: null });
    for (const c of [withParts(), withParts(ALL), withParts(SAND), { shapes: [] }, { shapes: [1, 2] }, {}]) {
      expect(planHash('Back Yard', c)).toBe(old('Back Yard', c));
      const { household: _h, ...core } = planOf(c);
      expect(coreHash('Back Yard', c)).toBe(fingerprint('Back Yard', core));
    }
    const h = (c?: object) => [planHash('X', withParts(c)), coreHash('X', withParts(c))];
    expect(h({})).toEqual(h());
    expect(h(ALL)).not.toEqual(h({}));
    expect(h(ALL)[0]).not.toBe(h()[0]);
    expect(h(ALL)[0]).not.toBe(h(SAND)[0]);
    expect(h({ sun: 'unsure' })[0]).not.toBe(h({})[0]); // (Not sure is an answer)
    // With a fruit-partner warning shown again ('') too: both read as none.
    const both = { shapes: [...plan({}), { ...aster(9), id: 'a2', fruitDismissed: '' }] }, neither = { shapes: [...plan(), { ...aster(9), id: 'a2' }] };
    expect([planHash('X', both), coreHash('X', both)]).toEqual([planHash('X', neither), coreHash('X', neither)]);
    // (Only what's hashed: the shape itself keeps its {}, and goes up with it.)
    const c = withParts({});
    planHash('X', c);
    expect((c.shapes[0] as { conditions?: object }).conditions).toEqual({});
  });

  it("each record says which beds had them on the server, as this device last sent or took the plan: where a {} may go here (src/marks.ts)", async () => {
    const server = new FakeServer(), phone = new VersionDevice('phone', migrateShape), laptop = older(), tablet = new VersionDevice('tablet', migrateShape);
    const id = phone.add('Back Yard', plan());
    await sync(phone, server); await sync(laptop, server);
    expect(phone.recs[id].marks).toBeUndefined();
    phone.edit(id, [...plan(ALL), { ...aster(9), id: 'a2', fruitDismissed: '' }]);
    await sync(phone, server);
    expect(phone.recs[id].marks).toEqual({ conditions: ['b1'], fruit: ['a2'] }); // (sent: the server has them)
    // The laptop's edit goes up without them; the phone takes it and keeps its own answers, but its record says the
    // server's copy has none: a clear there leaves none, never a {} over answers it can't know another device has.
    await sync(laptop, server);
    laptop.edit(id, as(releaseMigrateShape, [...plan(undefined, 4), { ...aster(9), id: 'a2' }]));
    await sync(laptop, server);
    expect(onServer(server, id).map((x) => [x.id, 'conditions' in x, 'fruitDismissed' in x])).toEqual([['b1', false, false], ['b2', false, false], ['a1', false, false], ['a2', false, false]]);
    expect(await sync(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(front(shapesOf(phone, id)).conditions).toEqual(ALL);
    expect(phone.recs[id].marks).toBeUndefined();
    // A device signing in takes the server's copy: none.
    await sync(tablet, server);
    expect(tablet.recs[id].marks).toBeUndefined();
    // The phone's next edit sends them again (and its own '' too): marked again.
    phone.edit(id, [...plan(ALL, 4, 6), { ...aster(9), id: 'a2', fruitDismissed: '' }]);
    await sync(phone, server);
    expect(phone.recs[id].marks).toEqual({ conditions: ['b1'], fruit: ['a2'] });
    // A download of a copy with them: marked on the taking device too.
    await sync(tablet, server);
    expect(tablet.recs[id].marks).toEqual({ conditions: ['b1'], fruit: ['a2'] });
  });

  it('another device on an older version never sends anything for them alone; its own edit goes up without them, and the device that set them keeps them, and sends them again', async () => {
    const server = new FakeServer(), phone = new VersionDevice('phone', migrateShape), laptop = older();
    const id = phone.add('Back Yard', plan());
    await sync(phone, server); await sync(laptop, server);
    phone.edit(id, plan(ALL));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(shapesOf(laptop, id)).toEqual(as(releaseMigrateShape, plan()));
    await still(server, laptop, phone);
    expect(front(onServer(server, id)).conditions).toEqual(ALL); // (the laptop sent nothing back without them)
    // The laptop moves the bed: its plan goes up without the field. The phone takes the bed moved and keeps its answers.
    laptop.edit(id, as(releaseMigrateShape, plan(undefined, 4)));
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1 });
    expect(front(onServer(server, id))).not.toHaveProperty('conditions');
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
    expect(shapesOf(phone, id)).toEqual(as(migrateShape, plan(ALL, 4)));
    await still(server, phone, laptop);
    // The phone's next edit sends them again; the laptop takes the edit, as it reads it.
    phone.edit(id, plan(ALL, 4, 6));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(front(onServer(server, id)).conditions).toEqual(ALL);
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(shapesOf(laptop, id)).toEqual(as(releaseMigrateShape, plan(undefined, 4, 6)));
    await still(server, phone, laptop);
    expect([phone.names(), laptop.names()]).toEqual([['Back Yard'], ['Back Yard']]);
  });

  it('an older version, with an edit of its own not yet synced, sends it over newer answers: each device of this version that had them keeps them; cleared on one ({}), that goes everywhere, never filled back', async () => {
    const server = new FakeServer(), phone = new VersionDevice('phone', migrateShape), tablet = new VersionDevice('tablet', migrateShape), laptop = older();
    const id = phone.add('Back Yard', plan());
    await sync(phone, server); await sync(tablet, server); await sync(laptop, server);
    laptop.edit(id, as(releaseMigrateShape, plan(undefined, 4))); // (offline: the bed moved)
    phone.edit(id, plan(ALL));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(tablet, server)).toMatchObject({ downloaded: 1 });
    // The older merge can't see a change on the server (only the field), so it's taken as changed here only: up over it.
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect(front(onServer(server, id))).not.toHaveProperty('conditions');
    for (const d of [phone, tablet]) {
      expect(await sync(d, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
      expect(shapesOf(d, id)).toEqual(as(migrateShape, plan(ALL, 4)));
    }
    await still(server, phone, tablet, laptop);
    // Cleared on the tablet ({}, on purpose): that goes everywhere, and isn't filled back from the phone's copy.
    tablet.edit(id, plan({}, 4));
    expect(await sync(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(front(onServer(server, id)).conditions).toEqual({});
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(front(shapesOf(phone, id)).conditions).toEqual({});
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 1 }); // (the tablet's revision, as it reads it)
    await still(server, phone, tablet, laptop);
    expect([phone.names(), tablet.names(), laptop.names()]).toEqual([['Back Yard'], ['Back Yard'], ['Back Yard']]);
  });

  it('set and taken back by Undo ({}) before the plan synced, while another device edited it: no conflict copy, the edit taken; set and synced, then cleared: that goes up', async () => {
    const server = new FakeServer(), phone = new VersionDevice('phone', migrateShape), tablet = new VersionDevice('tablet', migrateShape);
    const id = phone.add('Back Yard', plan());
    await sync(phone, server); await sync(tablet, server);
    phone.edit(id, plan(ALL)); // (set)
    phone.edit(id, plan({})); // (Undo, before its sync: src/history.ts conditionsCleared)
    tablet.edit(id, plan(undefined, 4));
    expect(await sync(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
    expect(phone.names()).toEqual(['Back Yard']);
    expect(shapesOf(phone, id)).toEqual(as(migrateShape, plan({}, 4)));
    await still(server, phone, tablet);
    phone.edit(id, plan(ALL, 4));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    phone.edit(id, plan({}, 4));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(front(onServer(server, id)).conditions).toEqual({});
    expect(await sync(tablet, server)).toMatchObject({ downloaded: 1 });
    expect(front(shapesOf(tablet, id)).conditions).toEqual({});
    await still(server, phone, tablet);
  });

  it('the window left (docs/storage.md): a device offline through another\'s change (cleared, or other answers), with an older device sending the plan between, keeps its own; whichever sends the plan first decides', async () => {
    for (const change of [{}, SAND]) {
      for (const first of ['tablet', 'phone'] as const) {
        const server = new FakeServer(), phone = new VersionDevice('phone', migrateShape), tablet = new VersionDevice('tablet', migrateShape), laptop = older();
        const id = phone.add('Back Yard', plan(ALL));
        await sync(phone, server); await sync(tablet, server); await sync(laptop, server);
        // The phone goes offline. The tablet changes them; the laptop (older) takes that and sends an edit, without them.
        tablet.edit(id, plan(change));
        await sync(tablet, server);
        await sync(laptop, server);
        laptop.edit(id, as(releaseMigrateShape, plan(undefined, 4)));
        await sync(laptop, server);
        expect(front(onServer(server, id))).not.toHaveProperty('conditions');
        // The tablet takes the edit and keeps its change.
        expect(await sync(tablet, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
        expect(front(shapesOf(tablet, id)).conditions).toEqual(change);
        // The phone, back, has its own, which the server's copy no longer contradicts: kept.
        expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
        expect(front(shapesOf(phone, id)).conditions).toEqual(ALL);
        // Whichever sends the plan first, with an edit, decides for everyone.
        const [a, b] = first === 'tablet' ? [tablet, phone] : [phone, tablet];
        a.edit(id, plan(first === 'tablet' ? change : ALL, 4, 6));
        expect(await sync(a, server)).toMatchObject({ uploaded: 1 });
        expect(await sync(b, server)).toMatchObject({ downloaded: 1, conflicts: [] });
        const won = first === 'tablet' ? change : ALL;
        expect([front(shapesOf(phone, id)).conditions, front(shapesOf(tablet, id)).conditions], `${JSON.stringify(change)}, ${first} first`).toEqual([won, won]);
        await sync(laptop, server);
        await still(server, phone, tablet, laptop);
      }
    }
  });

  it("a device of this version that took the plan only after an older one sent it without them shows none until one that has them sends it again; answers set on it meanwhile go up and stand", async () => {
    const server = new FakeServer(), phone = new VersionDevice('phone', migrateShape), tablet = new VersionDevice('tablet', migrateShape), laptop = older();
    const id = phone.add('Back Yard', plan());
    await sync(phone, server); await sync(laptop, server);
    phone.edit(id, plan(ALL));
    await sync(phone, server);
    await sync(laptop, server);
    laptop.edit(id, as(releaseMigrateShape, plan(undefined, 4)));
    await sync(laptop, server);
    // The tablet signs in now: the plan as the server has it, none.
    expect(await sync(tablet, server)).toMatchObject({ downloaded: 1 });
    expect(front(shapesOf(tablet, id))).not.toHaveProperty('conditions');
    // Its edit to something else goes up without them; the phone keeps its own.
    tablet.edit(id, plan(undefined, 4, 6));
    expect(await sync(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
    expect(front(shapesOf(phone, id)).conditions).toEqual(ALL);
    // Answers set on the tablet: they go up, and stand on the phone.
    tablet.edit(id, plan(SAND, 4, 6));
    expect(await sync(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
    expect(front(shapesOf(phone, id)).conditions).toEqual(SAND);
    await sync(laptop, server);
    await still(server, phone, tablet, laptop);
  });

  it("a tab on an older version sharing the device's storage, the plan not open in the new tab: the old tab writes it back without them, the new tab sends that once, and it settles (at database version 4 such a tab can't write the storage at all: src/db.ts)", async () => {
    const server = new FakeServer(), tab = new VersionDevice('Windows PC', migrateShape), old = new VersionDevice('Windows PC', releaseMigrateShape, tab);
    const id = tab.add('Back Yard', plan());
    await sync(tab, server); await sync(old, server);
    tab.edit(id, plan(ALL));
    expect(await sync(tab, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(old, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(await sync(tab, server)).toMatchObject({ uploaded: 1, downloaded: 0 });
    expect(await sync(old, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    await still(server, old, tab);
    expect(shapesOf(tab, id)).toEqual(as(releaseMigrateShape, plan()));
    expect(onServer(server, id)).toEqual(as(releaseMigrateShape, plan()));
    expect(tab.names()).toEqual(['Back Yard']);
  });

  it('a tab on an older version, the plan open in the new tab: the answers stay there, go up with its next edit, and no copy is made, whichever tab syncs first', async () => {
    const server = new FakeServer(), tab = new OpenTab('Windows PC', migrateShape), old = new VersionDevice('Windows PC', releaseMigrateShape, tab);
    const id = tab.add('Back Yard', plan());
    tab.openPlan(id);
    await sync(tab, server); await sync(old, server);
    tab.edit(id, plan(ALL));
    expect(await sync(tab, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(old, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(await sync(tab, server)).toMatchObject({ uploaded: 0, downloaded: 0 });
    expect(tab.open!.content.shapes as Shape[]).toEqual(as(migrateShape, plan(ALL)));
    // The new tab moves the bed (saved, the answers with it); the old tab's pass comes first and sends the bed moved
    // without them. The new tab keeps them and sends them again: no copy.
    tab.edit(id, plan(ALL, 4));
    expect(await sync(old, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(tab, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect(onServer(server, id)).toEqual(as(migrateShape, plan(ALL, 4)));
    expect(await sync(old, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    await still(server, old, tab);
    expect(tab.open!.content.shapes as Shape[]).toEqual(as(migrateShape, plan(ALL, 4)));
    expect(tab.names()).toEqual(['Back Yard']);
  });
});

describe("a photo's rough scale and the sides typed as numbers, through a device on an older version (Nov 4)", () => {
  const FP = 'c'.repeat(64);
  const M = [{ side: 0, ft: 30 }, { side: 2, ft: 30 }];
  const FENCE_M = [{ side: 1, ft: 25 }];
  const house = (x = 0, extra: object = {}) => ({ id: 'h1', type: 'rect', x, y: 0, width: 30, height: 20, rotation: 0, color: '#78716c', label: 'House', opacity: 0.8, locked: false, role: 'building', ...extra });
  const fence = (points: number[][] = [[0, 0], [40, 0], [40, 25]], extra: object = {}) => ({ id: 'f1', type: 'line', x: 0, y: 30, points, rotation: 0, color: '#57534e', label: 'Fence', opacity: 1, locked: false, role: 'boundary', ...extra });
  const oak = (x = 50) => ({ id: 'o1', type: 'circle', x, y: 10, radius: 8, color: '#166534', label: 'Old oak', opacity: 0.5, locked: false });
  const photo = (extra: object = {}) => ({ fingerprint: FP, naturalWidth: 400, naturalHeight: 300, ftPerPx: 0.25, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true, ...extra });
  /** A device whose app reads shapes and its photo as `migrate` and `photoRef` do (this version's, or the release's). */
  class Device extends FakeDevice {
    constructor(name: string, readonly migrate: (raw: unknown) => Shape | null, readonly photoRef: (raw: unknown) => unknown) { super(name, true); }
    normalize(name: string, content: ProjectContent) {
      const n = super.normalize(name, content);
      const c = { ...n.content };
      if (Array.isArray(c.shapes)) c.shapes = c.shapes.map((x) => this.migrate(x)).filter((x) => x !== null);
      if ('photo' in c) c.photo = this.photoRef(c.photo);
      return { ...n, content: c };
    }
    async projects() { return (await super.projects()).map((p) => ({ ...p, content: this.normalize(p.name, p.content).content })); }
    /** A plan with its photo here (the bytes on this device), placed as `ph` says. */
    addWithPhoto(name: string, shapes: unknown[], ph: object) {
      const id = this.add(name, shapes);
      const p = this.projectsById.get(id)!;
      p.content = { ...p.content, photo: ph };
      this.photos.set(id, FP);
      return id;
    }
    /** How the photo sits changed here (moved, its scale set again). */
    setPlacement(id: string, ph: object) { const p = this.projectsById.get(id)!; p.content = { ...p.content, photo: ph }; p.token++; }
  }
  const newer = (name: string) => new Device(name, migrateShape, sanitizePhotoRef);
  const release = (name: string) => new Device(name, releaseMigrateShape, releaseSanitizePhotoRef);
  const shapesOf = (d: FakeDevice, id: string) => d.projectsById.get(id)!.content.shapes as Shape[];
  const photoOf = (d: FakeDevice, id: string) => d.projectsById.get(id)!.content.photo as Record<string, unknown>;
  const onServer = (server: FakeServer, id: string) => server.rows.get(id)!.content as { shapes: Shape[]; photo: Record<string, unknown> };
  const measuredOf = (shapes: Shape[]) => shapes.map((s) => (s as { measured?: unknown }).measured);
  async function still(server: FakeServer, ...devices: FakeDevice[]) {
    for (let i = 0; i < 3; i++) {
      for (const d of devices) expect(await sync(d, server)).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: [], restored: [], removed: [] });
    }
  }

  it("kept from here where the server's copy says nothing of them: a shape exactly as it is here, side for side (moved or turned only); the same photo at the same scale", () => {
    const mine = { shapes: [house(0, { measured: M }), fence(undefined, { measured: FENCE_M }), oak()], photo: photo({ roughScale: true }) };
    // An older version's copy: neither field; the house moved and turned, the photo moved and made fainter.
    const there = { shapes: [house(5, { rotation: 30 }), fence(), oak(52)], photo: photo({ cx: 3, opacity: 0.4 }) };
    const filled = withLocalParts(there, mine);
    expect(filled).toEqual({ shapes: [house(5, { rotation: 30, measured: M }), fence(undefined, { measured: FENCE_M }), oak(52)], photo: photo({ cx: 3, opacity: 0.4, roughScale: true }) });
    ((filled.shapes as { measured: { ft: number }[] }[])[0].measured[0]).ft = 1; // (its own copy)
    expect((mine.shapes[0] as unknown as { measured: { ft: number }[] }).measured[0].ft).toBe(30);
    // Reshaped there in any way: nothing kept, so no number lands on a side another device changed.
    const reshaped = { shapes: [house(0, { width: 31 }), fence([[0, 0], [40, 0], [40, 26]]), { ...house(0), type: 'poly', points: [[0, 0], [30, 0], [30, 20], [0, 20]] }] };
    expect(withLocalParts(reshaped, { shapes: [house(0, { measured: M }), fence(undefined, { measured: FENCE_M }), { ...house(0), id: 'x' }] })).toEqual(reshaped);
    expect(withLocalParts({ shapes: [{ ...house(0), type: 'poly', points: [[0, 0], [30, 0], [30, 20], [0, 20]] }] }, mine).shapes).toEqual([{ ...house(0), type: 'poly', points: [[0, 0], [30, 0], [30, 20], [0, 20]] }]);
    // Some there: they stand, and the sides they don't name are kept from here (the house the same size).
    expect((withLocalParts({ shapes: [house(0, { measured: [{ side: 1, ft: 20 }] })] }, mine).shapes as Shape[])[0]).toMatchObject({ measured: [{ side: 1, ft: 20 }, ...M] });
    expect((withLocalParts({ shapes: [house(0, { measured: [{ side: 0, ft: 30.02 }, { side: 2, ft: 30.02 }] })] }, mine).shapes as Shape[])[0]).toMatchObject({ measured: [{ side: 0, ft: 30.02 }, { side: 2, ft: 30.02 }] });
    // The photo: another scale there, "not to scale yet", rough already, another photo, kept elsewhere, none: as there.
    for (const ph of [photo({ ftPerPx: 0.3 }), photo({ uncalibrated: true }), photo({ roughScale: true, cx: 9 }), photo({ fingerprint: 'd'.repeat(64) }), { deviceOnly: true }, null]) {
      expect(withLocalParts({ shapes: [], photo: ph }, mine).photo, JSON.stringify(ph)).toEqual(ph);
    }
    // Nothing here to keep: as the server has it (the same object).
    const plain = { shapes: [house(), fence()], photo: photo() };
    expect(withLocalParts(plain, { shapes: [house(), fence()], photo: photo() })).toBe(plain);
    // Fingerprinted as before: a plan without them, to the character. With them, the same: this version changes them
    // only with the sides themselves, and an older version's copy, without them, isn't a change there.
    expect(planHash('X', plain)).toBe(fingerprint('X', planOf(plain)));
    const bare = { shapes: [house(), fence(), oak()], photo: photo() };
    expect([planHash('X', mine), coreHash('X', mine), photoKey(mine)]).toEqual([planHash('X', bare), coreHash('X', bare), photoKey(bare)]);
    expect(mine.shapes[0]).toHaveProperty('measured'); // (only what's hashed: the plan keeps them)
    expect(photoKey({ photo: photo({ roughScale: true }) })).toBe(photoKey({ photo: photo() }));
    expect(photoKey({ photo: photo({ ftPerPx: 0.3 }) })).not.toBe(photoKey({ photo: photo() }));
  });

  it("side by side, where the server's copy has some of its own (the review's R4): its entries stand; a side it doesn't name is kept from here only where it's provably the same side, still the length typed", () => {
    const all = [{ side: 0, ft: 30 }, { side: 1, ft: 20 }, { side: 2, ft: 30 }, { side: 3, ft: 20 }];
    const fill = (there: object, here: object) => (withLocalParts({ shapes: [there] }, { shapes: [here] }).shapes as Shape[])[0];
    const typed = (s: Shape) => [...((s as { measured?: { side: number; ft: number }[] }).measured ?? [])].sort((a, b) => a.side - b.side);
    // A rectangle: its Width typed again there (32); its Length unchanged, still typed here: kept.
    expect(typed(fill(house(0, { width: 32, measured: [{ side: 0, ft: 32 }, { side: 2, ft: 32 }] }), house(0, { measured: all }))))
      .toEqual([{ side: 0, ft: 32 }, { side: 1, ft: 20 }, { side: 2, ft: 32 }, { side: 3, ft: 20 }]);
    // Its Length changed there too (21): only the server's.
    expect(typed(fill(house(0, { width: 32, height: 21, measured: [{ side: 0, ft: 32 }, { side: 2, ft: 32 }] }), house(0, { measured: all }))))
      .toEqual([{ side: 0, ft: 32 }, { side: 2, ft: 32 }]);
    // A typed side there with another number than here: the server's stands.
    expect(typed(fill(house(0, { measured: [{ side: 1, ft: 20.04 }] }), house(0, { measured: all }))))
      .toEqual([{ side: 0, ft: 30 }, { side: 1, ft: 20.04 }, { side: 2, ft: 30 }, { side: 3, ft: 20 }]);
    // Nothing there, one dimension changed (a release device widened it): the other's sides kept, its own not.
    expect(typed(fill(house(0, { width: 31 }), house(0, { measured: all })))).toEqual([{ side: 1, ft: 20 }, { side: 3, ft: 20 }]);
    // A line: a point moved there that isn't an end of the typed side: that side kept (both its ends where they were);
    // one of its ends moved, or a point added (the sides renumbered, maybe), not.
    const l = (points: number[][], extra: object = {}) => fence(points, extra);
    const typedFence = l([[0, 0], [40, 0], [40, 25], [10, 25]], { measured: [{ side: 0, ft: 40 }, { side: 2, ft: 30 }] });
    expect(typed(fill(l([[0, 0], [40, 0], [40, 25], [12, 30]], { measured: [{ side: 1, ft: 25 }] }), typedFence))).toEqual([{ side: 0, ft: 40 }, { side: 1, ft: 25 }]);
    expect(typed(fill(l([[0, 0], [40, 0], [41, 25], [10, 25]]), typedFence))).toEqual([{ side: 0, ft: 40 }]);
    expect(typed(fill(l([[0, 0], [20, 0], [40, 0], [40, 25], [10, 25]]), typedFence))).toEqual([]);
    // (Its ends where they were, but no longer the length typed: not; another kind of shape there: not.)
    expect(typed(fill(l([[0, 0], [40, 0], [40, 25], [10, 25]]), l([[0, 0], [40, 0], [40, 25], [10, 25]], { measured: [{ side: 0, ft: 39 }] })))).toEqual([]);
    expect(typed(fill({ ...house(0), type: 'poly', points: [[0, 0], [30, 0], [30, 20], [0, 20]] }, house(0, { measured: all })))).toEqual([]);
  });

  it('between two devices of this version they go across; reshaped on one, the side is forgotten on both; the scale set again without the box ticked, the rough scale too', async () => {
    const server = new FakeServer(), phone = newer('phone'), tablet = newer('tablet');
    const id = phone.addWithPhoto('Back Yard', [house(0, { measured: M }), fence(undefined, { measured: FENCE_M })], photo({ roughScale: true }));
    await sync(phone, server); await sync(tablet, server);
    expect(measuredOf(shapesOf(tablet, id))).toEqual([M, FENCE_M]);
    expect(photoOf(tablet, id)).toMatchObject({ roughScale: true });
    await still(server, phone, tablet);
    // The tablet widens the house (its typed width forgotten there) and sets the scale again, measured.
    tablet.edit(id, [house(0, { width: 32 }), fence(undefined, { measured: FENCE_M })]);
    tablet.setPlacement(id, photo({ ftPerPx: 0.26 }));
    expect(await sync(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(measuredOf(shapesOf(phone, id))).toEqual([undefined, FENCE_M]);
    expect(photoOf(phone, id)).toEqual(photo({ ftPerPx: 0.26 }));
    await still(server, phone, tablet);
  });

  it('a device on the release takes the plan without them and sends nothing for that; its own edit goes up without them, and the device that has them keeps them, and sends them again', async () => {
    const server = new FakeServer(), phone = newer('phone'), laptop = release('laptop');
    const id = phone.addWithPhoto('Back Yard', [house(0, { measured: M }), fence(undefined, { measured: FENCE_M }), oak()], photo({ roughScale: true }));
    await sync(phone, server);
    expect(await sync(laptop, server)).toMatchObject({ downloaded: 1 });
    expect(measuredOf(shapesOf(laptop, id))).toEqual([undefined, undefined, undefined]);
    expect(photoOf(laptop, id)).toEqual(photo());
    await still(server, laptop, phone);
    expect(measuredOf(onServer(server, id).shapes)).toEqual([M, FENCE_M, undefined]); // (it sent nothing back without them)
    // The laptop moves the house and the oak, and the photo: all of it goes up without the fields.
    laptop.edit(id, [releaseMigrateShape(house(6)), releaseMigrateShape(fence()), releaseMigrateShape(oak(55))]);
    laptop.setPlacement(id, photo({ cx: 4 }));
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1 });
    expect(measuredOf(onServer(server, id).shapes)).toEqual([undefined, undefined, undefined]);
    expect(onServer(server, id).photo).not.toHaveProperty('roughScale');
    // The phone takes the moves and keeps both: the house and fence are side for side as they were, the photo at its scale.
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
    expect(shapesOf(phone, id)).toEqual([house(6, { measured: M }), fence(undefined, { measured: FENCE_M }), oak(55)].map(migrateShape));
    expect(photoOf(phone, id)).toEqual(photo({ cx: 4, roughScale: true }));
    await still(server, phone, laptop);
    // The phone's next edit sends them again; the laptop takes the edit, as it reads it.
    phone.edit(id, [house(6, { measured: M }), fence(undefined, { measured: FENCE_M }), oak(57)].map(migrateShape));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(measuredOf(onServer(server, id).shapes)).toEqual([M, FENCE_M, undefined]);
    expect(onServer(server, id).photo).toMatchObject({ roughScale: true, cx: 4 });
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 0, downloaded: 1 });
    await still(server, phone, laptop);
    // The laptop reshapes the house and sets the scale again (it has no box to tick): the phone keeps neither.
    laptop.edit(id, [releaseMigrateShape(house(6, { width: 33 })), releaseMigrateShape(fence()), releaseMigrateShape(oak(57))]);
    laptop.setPlacement(id, photo({ cx: 4, ftPerPx: 0.27 }));
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(measuredOf(shapesOf(phone, id))).toEqual([undefined, FENCE_M, undefined]);
    expect(photoOf(phone, id)).toEqual(photo({ cx: 4, ftPerPx: 0.27 }));
    await still(server, phone, laptop);
    expect([phone.names(), laptop.names()]).toEqual([['Back Yard'], ['Back Yard']]);
  });

  it("a typed shape reshaped here while the release ticked a plant bought, or moved the photo: no copy; the reshape goes up, the other sides typed kept", async () => {
    const server = new FakeServer(), phone = newer('phone'), laptop = release('laptop');
    const id = phone.addWithPhoto('Back Yard', [house(0, { measured: M }), fence(undefined, { measured: FENCE_M })], photo());
    await sync(phone, server); await sync(laptop, server);
    laptop.setPart(id, 'bought', { 'pl:1': { n: 1, at: 5 } });
    laptop.setPlacement(id, photo({ cx: 2 }));
    phone.edit(id, [house(0, { width: 34 }), fence(undefined, { measured: FENCE_M })].map(migrateShape)); // (its typed width forgotten)
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect(onServer(server, id)).toMatchObject({ shapes: [house(0, { width: 34 }), fence(undefined, { measured: FENCE_M })], photo: photo({ cx: 2 }), bought: { 'pl:1': { n: 1, at: 5 } } });
    expect(measuredOf(onServer(server, id).shapes)).toEqual([undefined, FENCE_M]);
    expect(await sync(laptop, server)).toMatchObject({ downloaded: 1 });
    await still(server, phone, laptop);
    expect(phone.names()).toEqual(['Back Yard']);
  });

  it("the photo's scale set again here, roughly, while the release moved the house: no copy; the plan from there, the photo from here, both fields kept", async () => {
    const server = new FakeServer(), phone = newer('phone'), laptop = release('laptop');
    const id = phone.addWithPhoto('Back Yard', [house(0, { measured: M })], photo({ roughScale: true }));
    await sync(phone, server); await sync(laptop, server);
    laptop.edit(id, [releaseMigrateShape(house(8))]);
    phone.setPlacement(id, photo({ ftPerPx: 0.2, roughScale: true }));
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect(shapesOf(phone, id)).toEqual([migrateShape(house(8, { measured: M }))]);
    expect(onServer(server, id)).toMatchObject({ shapes: [house(8, { measured: M })], photo: photo({ ftPerPx: 0.2, roughScale: true }) });
    expect(await sync(laptop, server)).toMatchObject({ downloaded: 1 });
    expect(photoOf(laptop, id)).toEqual(photo({ ftPerPx: 0.2 }));
    await still(server, phone, laptop);
    expect(phone.names()).toEqual(['Back Yard']);
  });
});

// The print choice for the plants under taller ones (`print.under`, Nov 4, database version 6), between two devices of
// this version, and through a device on the release, run with the release's own engine and its own reading of print
// settings (tests/release-device.ts: it drops the field, and nothing else). docs/storage.md.
describe('the print choice for the plants under taller ones (print.under, Nov 4)', () => {
  const house = (x = 0) => ({ id: 'h1', type: 'rect', x, y: 0, width: 30, height: 20, rotation: 0, color: '#78716c', label: 'House', opacity: 0.8, locked: false, role: 'building' });
  const oak = (x = 50) => ({ id: 'o1', type: 'circle', x, y: 10, radius: 8, color: '#166534', label: 'Old oak', opacity: 0.5, locked: false });
  const photo = (extra: object = {}) => ({ fingerprint: FP, naturalWidth: 400, naturalHeight: 300, ftPerPx: 0.25, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true, ...extra });
  /** Print settings: as a plan has them, with `under` picked or not. */
  const P = (under?: PrintUnder, extra: Partial<PrintSettings> = {}): PrintSettings => ({ ...DEFAULT_PRINT, ...extra, ...(under ? { under } : {}) });
  /** A plan on `d`: the house and the oak, its print settings `print`. */
  const addPlan = (d: Dev, print: PrintSettings, withPhoto = false) => {
    const id = d.add('Back Yard', [house(), oak()], withPhoto ? photo() : null);
    d.edit(id, (c) => ({ ...c, print }));
    return id;
  };
  const picked = (d: Dev, id: string) => (d.projectsById.get(id)!.content.print as PrintSettings).under;
  const onServer = (s: FakeServer, id: string) => s.rows.get(id)!.content;
  const pickOn = (d: Dev, id: string, under: PrintUnder) => d.edit(id, (c) => ({ ...c, print: { ...(c.print as PrintSettings), under } }));
  const moveOak = (d: Dev, id: string, x: number) => d.edit(id, (c) => ({ ...c, shapes: [(c.shapes as Shape[])[0], oak(x)] }));
  const oakX = (d: Dev, id: string) => (d.projectsById.get(id)!.content.shapes as Shape[])[1].x;
  async function settled(server: FakeServer, ...devices: Dev[]) {
    for (let i = 0; i < 3; i++) for (const d of devices) expect(await syncDev(d, server)).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: [] });
  }

  it('fingerprinted: a plan without it exactly as before; As on screen is a change; Show through picked reads as none picked', () => {
    const c = (print: object) => ({ shapes: [house(), oak()], photo: null, household: { kids: true }, print });
    for (const x of [c(P()), c(P(undefined, { paper: 'a4', title: 'Front' })), { shapes: [] }, {}]) {
      expect(planHash('Back Yard', x)).toBe(fingerprint('Back Yard', planOf(x)));
      const { household: _h, ...core } = planOf(x);
      expect(coreHash('Back Yard', x)).toBe(fingerprint('Back Yard', core));
    }
    const h = (print: object) => [planHash('X', c(print)), coreHash('X', c(print))];
    expect(h(P('windows'))).toEqual(h(P()));
    expect(h(P('screen'))[0]).not.toBe(h(P())[0]);
    expect(h(P('screen'))[1]).not.toBe(h(P())[1]);
    // (Only what's hashed: the plan keeps its pick, and sends it.)
    const kept = c(P('windows'));
    planHash('X', kept);
    expect((kept.print as PrintSettings).under).toBe('windows');
    // As the release reads a plan with it: none, and nothing else changed.
    expect(releaseSanitizePrint(P('screen', { paper: 'a3', northDeg: 30 }))).toEqual(P(undefined, { paper: 'a3', northDeg: 30 }));
  });

  it("kept from here when the server's print settings say nothing of it at all; one there, either, stands", () => {
    const mine = { shapes: [], print: P('screen') };
    expect(withLocalParts({ shapes: [], print: P(undefined, { paper: 'a4' }) }, mine)).toEqual({ shapes: [], print: P('screen', { paper: 'a4' }) });
    expect(withLocalParts({ shapes: [], print: P('windows') }, mine)).toEqual({ shapes: [], print: P('windows') });
    expect(withLocalParts({ shapes: [], print: P('windows') }, { shapes: [], print: P() })).toEqual({ shapes: [], print: P('windows') });
    expect(withLocalParts({ shapes: [], print: P() }, { shapes: [], print: P('windows') })).toEqual({ shapes: [], print: P('windows') });
    // (Its own copy: nothing shared with this device's plan.)
    const filled = withLocalParts({ shapes: [], print: P() }, mine);
    (filled.print as PrintSettings).under = 'windows';
    expect(mine.print.under).toBe('screen');
    // None here: as the server has it (the same object).
    const plain = { shapes: [], print: P() };
    expect(withLocalParts(plain, { shapes: [], print: P() })).toBe(plain);
  });

  it('two devices of this version: picked on one, it goes up by itself and the other takes it; As on screen back to Show through goes too, and nothing fills As on screen back', async () => {
    const server = new FakeServer(), phone = new Dev('phone', false), tablet = new Dev('tablet', false);
    const id = addPlan(phone, P());
    await syncDev(phone, server); await syncDev(tablet, server);
    pickOn(phone, id, 'screen');
    expect(await syncDev(phone, server)).toMatchObject({ uploaded: 1 });
    expect(await syncDev(tablet, server)).toMatchObject({ downloaded: 1, uploaded: 0 });
    expect(picked(tablet, id)).toBe('screen');
    await settled(server, phone, tablet);
    pickOn(tablet, id, 'windows');
    expect(await syncDev(tablet, server)).toMatchObject({ uploaded: 1 });
    expect((onServer(server, id).print as PrintSettings).under).toBe('windows');
    expect(await syncDev(phone, server)).toMatchObject({ downloaded: 1, uploaded: 0, conflicts: [] });
    expect([picked(phone, id), picked(tablet, id)]).toEqual(['windows', 'windows']);
    await settled(server, phone, tablet);
  });

  it('As on screen and back to Show through before the plan synced, while another device moved the oak: no copy, the move taken', async () => {
    const server = new FakeServer(), phone = new Dev('phone', false), tablet = new Dev('tablet', false);
    const id = addPlan(phone, P());
    await syncDev(phone, server); await syncDev(tablet, server);
    pickOn(phone, id, 'screen');
    pickOn(phone, id, 'windows');
    moveOak(tablet, id, 44);
    expect(await syncDev(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await syncDev(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect([phone.projectsById.size, oakX(phone, id), picked(phone, id)]).toEqual([1, 44, 'windows']);
    await settled(server, phone, tablet);
  });

  it('the release takes a plan with it picked and sends nothing back for it alone, pass after pass', async () => {
    const server = new FakeServer(), phone = new Dev('phone', false), laptop = new Dev('laptop', true);
    const id = addPlan(phone, P('screen', { paper: 'tabloid' }));
    expect(await syncDev(phone, server)).toMatchObject({ uploaded: 1 });
    expect(await syncDev(laptop, server)).toMatchObject({ downloaded: 1 });
    expect(laptop.projectsById.get(id)!.content.print).toEqual(P(undefined, { paper: 'tabloid' })); // (the rest as it was)
    await settled(server, laptop, phone);
    expect((onServer(server, id).print as PrintSettings).under).toBe('screen');
  });

  it('the release ticks a plant and moves the photo while the phone picks (or changes) the choice and moves the oak: no copy anywhere; the pick and the move go up; it settles', async () => {
    for (const [from, to] of [[undefined, 'screen'], ['screen', 'windows'], ['windows', 'screen']] as const) {
      const server = new FakeServer(), phone = new Dev('phone', false), laptop = new Dev('laptop', true);
      const id = addPlan(phone, P(from), true);
      await syncDev(phone, server); await syncDev(laptop, server);
      laptop.edit(id, (c) => ({ ...c, bought: { 'pl:1': { n: 1, at: 5 } }, photo: photo({ cx: 4 }) }));
      pickOn(phone, id, to);
      moveOak(phone, id, 60);
      expect(await syncDev(laptop, server)).toMatchObject({ uploaded: 1 });
      expect('under' in (onServer(server, id).print as object)).toBe(false); // (the release's copy: none)
      expect(await syncDev(phone, server), `${from} to ${to}`).toMatchObject({ uploaded: 1, conflicts: [] });
      expect(onServer(server, id)).toMatchObject({ print: P(to), bought: { 'pl:1': { n: 1, at: 5 } }, photo: photo({ cx: 4 }) });
      expect(await syncDev(laptop, server)).toMatchObject({ downloaded: 1, conflicts: [] });
      expect(oakX(laptop, id)).toBe(60);
      await settled(server, phone, laptop);
      expect([phone.projectsById.size, laptop.projectsById.size, picked(phone, id)]).toEqual([1, 1, to]);
    }
  });

  it('the release, with an edit of its own not yet synced, sends it over a newer pick: each device of this version that had it keeps it, and its next edit sends it again', async () => {
    const server = new FakeServer(), phone = new Dev('phone', false), tablet = new Dev('tablet', false), laptop = new Dev('laptop', true);
    const id = addPlan(phone, P());
    await syncDev(phone, server); await syncDev(tablet, server); await syncDev(laptop, server);
    moveOak(laptop, id, 44); // (offline)
    pickOn(phone, id, 'screen');
    expect(await syncDev(phone, server)).toMatchObject({ uploaded: 1 });
    expect(await syncDev(tablet, server)).toMatchObject({ downloaded: 1 });
    // The release's merge can't see a change on the server (only the field), so it's taken as changed there only: up over it.
    expect(await syncDev(laptop, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect('under' in (onServer(server, id).print as object)).toBe(false);
    for (const d of [phone, tablet]) {
      expect(await syncDev(d, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
      expect([oakX(d, id), picked(d, id)]).toEqual([44, 'screen']);
    }
    await settled(server, phone, tablet, laptop);
    // The phone's next edit sends it again; the tablet takes the edit, still As on screen.
    moveOak(phone, id, 46);
    expect(await syncDev(phone, server)).toMatchObject({ uploaded: 1 });
    expect((onServer(server, id).print as PrintSettings).under).toBe('screen');
    await syncDev(tablet, server); await syncDev(laptop, server);
    await settled(server, phone, tablet, laptop);
    expect([picked(tablet, id), oakX(laptop, id)]).toEqual(['screen', 46]);
    expect([phone.projectsById.size, tablet.projectsById.size, laptop.projectsById.size]).toEqual([1, 1, 1]);
  });

  it("the window left (docs/storage.md): a device offline through another's change, with the release sending the plan between, keeps its own; whichever sends the plan first decides", async () => {
    for (const first of ['tablet', 'phone'] as const) {
      const server = new FakeServer(), phone = new Dev('phone', false), tablet = new Dev('tablet', false), laptop = new Dev('laptop', true);
      const id = addPlan(phone, P('screen'));
      await syncDev(phone, server); await syncDev(tablet, server); await syncDev(laptop, server);
      // The phone goes offline. The tablet picks Show through; the release takes that and sends a tick, without it.
      pickOn(tablet, id, 'windows');
      await syncDev(tablet, server);
      await syncDev(laptop, server);
      laptop.edit(id, (c) => ({ ...c, bought: { 'pl:1': { n: 1, at: 5 } } }));
      await syncDev(laptop, server);
      expect('under' in (onServer(server, id).print as object)).toBe(false);
      expect(await syncDev(tablet, server)).toMatchObject({ downloaded: 1, conflicts: [] });
      expect(picked(tablet, id)).toBe('windows');
      // The phone, back, has its own, which the server's copy no longer contradicts: kept.
      expect(await syncDev(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
      expect(picked(phone, id)).toBe('screen');
      const [a, b] = first === 'tablet' ? [tablet, phone] : [phone, tablet];
      moveOak(a, id, 60);
      expect(await syncDev(a, server)).toMatchObject({ uploaded: 1 });
      expect(await syncDev(b, server)).toMatchObject({ downloaded: 1, conflicts: [] });
      const won = first === 'tablet' ? 'windows' : 'screen';
      expect([picked(phone, id), picked(tablet, id)], `${first} first`).toEqual([won, won]);
      await syncDev(laptop, server);
      await settled(server, phone, tablet, laptop);
    }
  });

  it("the review's R1: Show through picked here over a copy the release sent without it, not yet taken here, goes up and stands: a device that still had As on screen takes it, and nothing sends As on screen back; no copy anywhere", async () => {
    const server = new FakeServer(), phone = new Dev('phone', false), tablet = new Dev('tablet', false), laptop = new Dev('laptop', true);
    const id = addPlan(phone, P('screen'));
    await syncDev(phone, server); await syncDev(tablet, server); await syncDev(laptop, server);
    // The release ticks a plant: the server's copy has no choice now.
    laptop.edit(id, (c) => ({ ...c, bought: { 'pl:1': { n: 1, at: 5 } } }));
    expect(await syncDev(laptop, server)).toMatchObject({ uploaded: 1 });
    // The phone, before taking that, picks Show through (its only change), and syncs: the pick goes up, with the tick.
    pickOn(phone, id, 'windows');
    expect(await syncDev(phone, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect(onServer(server, id)).toMatchObject({ print: P('windows'), bought: { 'pl:1': { n: 1, at: 5 } } });
    // The tablet takes it, and its next edit sends it, not its As on screen.
    expect(await syncDev(tablet, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(picked(tablet, id)).toBe('windows');
    moveOak(tablet, id, 44);
    expect(await syncDev(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await syncDev(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect([picked(phone, id), oakX(phone, id)]).toEqual(['windows', 44]);
    await syncDev(laptop, server);
    await settled(server, phone, tablet, laptop);
    expect([phone.projectsById.size, tablet.projectsById.size, laptop.projectsById.size]).toEqual([1, 1, 1]);
  });

  it("the review's R2: after a real conflict (both moved something), another edit there before this device's next pass makes no second copy: this device's choice, kept in the original, isn't a change of its own", async () => {
    // Between two devices of this version: the phone picks As on screen and moves the house; the tablet, never picked,
    // moves the oak.
    {
      const server = new FakeServer(), phone = new Dev('phone', false), tablet = new Dev('tablet', false);
      const id = addPlan(phone, P());
      await syncDev(phone, server); await syncDev(tablet, server);
      phone.edit(id, (c) => ({ ...c, print: P('screen'), shapes: [house(5), (c.shapes as Shape[])[1]] }));
      moveOak(tablet, id, 44);
      await syncDev(tablet, server);
      expect((await syncDev(phone, server)).conflicts).toHaveLength(1);
      await syncDev(tablet, server);
      moveOak(tablet, id, 40);
      await syncDev(tablet, server);
      expect(await syncDev(phone, server)).toMatchObject({ conflicts: [] });
      expect([phone.projectsById.size, oakX(phone, id)]).toEqual([2, 40]);
      const copy = [...phone.projectsById.values()].find((x) => x.id !== id)!;
      expect(copy.content).toMatchObject({ print: P('screen') });
      expect((copy.content.shapes as Shape[])[0].x).toBe(5); // (the phone's own version, whole, beside)
      await settled(server, phone, tablet);
      expect(tablet.projectsById.size).toBe(2);
    }
    // Through the release: whatever the phone had (and kept), the laptop moves the oak twice.
    for (const under of [undefined, 'screen', 'windows'] as const) {
      const server = new FakeServer(), phone = new Dev('phone', false), laptop = new Dev('laptop', true);
      const id = addPlan(phone, P(under));
      await syncDev(phone, server); await syncDev(laptop, server);
      moveOak(laptop, id, 44);
      phone.edit(id, (c) => ({ ...c, shapes: [house(5), (c.shapes as Shape[])[1]] }));
      await syncDev(laptop, server);
      expect((await syncDev(phone, server)).conflicts, under).toHaveLength(1);
      await syncDev(laptop, server);
      moveOak(laptop, id, 40);
      await syncDev(laptop, server);
      expect(await syncDev(phone, server), under).toMatchObject({ conflicts: [] });
      expect([phone.projectsById.size, oakX(phone, id), picked(phone, id)], under).toEqual([2, 40, under]);
      await settled(server, phone, laptop);
    }
  });

  it('a device of this version that took the plan only after the release sent it without it prints Show through until one that has it sends it again; picked on it meanwhile, that goes up and stands', async () => {
    const server = new FakeServer(), phone = new Dev('phone', false), tablet = new Dev('tablet', false), laptop = new Dev('laptop', true);
    const id = addPlan(phone, P('windows', { paper: 'a4' }));
    await syncDev(phone, server);
    pickOn(phone, id, 'screen');
    await syncDev(phone, server); await syncDev(laptop, server);
    moveOak(laptop, id, 44);
    await syncDev(laptop, server);
    expect(await syncDev(tablet, server)).toMatchObject({ downloaded: 1 });
    expect(picked(tablet, id)).toBeUndefined();
    // Its edit to something else goes up without it; the phone keeps its own.
    tablet.edit(id, (c) => ({ ...c, shapes: [house(2), (c.shapes as Shape[])[1]] }));
    expect(await syncDev(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await syncDev(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(picked(phone, id)).toBe('screen');
    // Picked on the tablet (As on screen, synced, then Show through): each goes up, and stands on the phone.
    pickOn(tablet, id, 'screen');
    expect(await syncDev(tablet, server)).toMatchObject({ uploaded: 1 });
    pickOn(tablet, id, 'windows');
    expect(await syncDev(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await syncDev(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(picked(phone, id)).toBe('windows');
    await syncDev(laptop, server);
    await settled(server, phone, tablet, laptop);
  });
});

// A bed's conditions changed here while a device on the release (its own engine: tests/release-device.ts) edits the
// plan, sending it without any bed's conditions (Nov 5). Filled in from here (withBedConditions) they are this device's
// conditions as they are now, so the server's copy read as changed there, against the record, and with another edit
// here a copy was made (#230 found it, building the print choice: docs/storage.md). The record's `bare` (the core's
// fingerprint with every bed's conditions left out) compares a copy that has none at all without them.
describe("a bed's conditions changed here while the release edits the plan: no needless copy (Nov 5)", () => {
  const ALL = { sun: { most: 'Full', least: 'Part' }, soil: 'clay', moisture: 'average', drip: true };
  const SAND = { soil: 'sand', moisture: 'dry' };
  const LOAM = { soil: 'loam', moisture: 'average' };
  const bed = (id: string, x: number, c?: object) => ({ id, type: 'rect', x, y: -5, width: 20, height: 10, rotation: 0, color: '#a16207', label: id === 'b1' ? 'Front bed' : 'Back bed', opacity: 0.4, locked: false, role: 'bed', ...(c === undefined ? {} : { conditions: c }) });
  const aster = (x: number) => ({ id: 'a1', type: 'circle', x, y: 0, radius: 1, color: '#7c3aed', label: 'Aromatic aster', opacity: 0.65, locked: false, role: 'plant', plantId: 'symphyotrichum-oblongifolium' });
  const photo = (extra: object = {}) => ({ fingerprint: FP, naturalWidth: 400, naturalHeight: 300, ftPerPx: 0.25, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true, ...extra });
  /** The plan: the front bed (its conditions `c`, at `bx`), the back bed (its conditions `c2`, null for none; at `b2x`), the aster at `ax`. */
  const plan = (c: object | undefined, { bx = 0, b2x = 40, ax = 2, c2 = LOAM as object | null } = {}) => [bed('b1', bx, c), bed('b2', b2x, c2 ?? undefined), aster(ax)];
  const TICK = { 'pl:1': { n: 1, at: 5 } };
  const setPlan = (d: Dev, id: string, shapes: object[]) => d.edit(id, (c) => ({ ...c, shapes }));
  /** The release ticks a plant and moves the photo: edits that merge with anything, sent without any bed's conditions. */
  const releaseEdits = (d: Dev, id: string) => d.edit(id, (c) => ({ ...c, bought: TICK, photo: photo({ cx: 4 }) }));
  const contentOf = (d: Dev, id: string) => d.projectsById.get(id)!.content;
  const onServer = (s: FakeServer, id: string) => s.rows.get(id)!.content;
  /** The beds' conditions, front then back. */
  const conditions = (c: ProjectContent) => (c.shapes as Shape[]).filter((s) => s.role === 'bed').map((s) => s.conditions);
  const copyOf = (d: Dev, id: string) => [...d.projectsById.values()].find((p) => p.id !== id);
  async function settled(server: FakeServer, ...devices: Dev[]) {
    for (let i = 0; i < 3; i++) for (const d of devices) expect(await syncDev(d, server)).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: [] });
  }
  /** The phone (this version) with the plan, its front bed's conditions `from`, synced; the laptop (the release) and `others` have it too. */
  async function start(from: object | undefined, opts: { c2?: object | null } = {}, ...others: Dev[]) {
    const server = new FakeServer(), phone = new Dev('phone', false), laptop = new Dev('laptop', true);
    const id = phone.add('Back Yard', plan(from, opts), photo());
    for (const d of [phone, laptop, ...others]) await syncDev(d, server);
    return { server, phone, laptop, id };
  }
  /** Each change here to the front bed's conditions: set, changed, cleared. */
  const CHANGES = [[undefined, ALL], [ALL, SAND], [ALL, {}]] as const;

  it("the record keeps the core's fingerprint without any bed's conditions too (`bare`); a plan without them, the same as its core", async () => {
    const c = (front?: object, back: object | null = LOAM) => ({ shapes: plan(front, { c2: back }), household: { kids: true }, photo: null });
    expect(bareHash('X', c(undefined, null))).toBe(coreHash('X', c(undefined, null)));
    expect(bareHash('X', { shapes: [] })).toBe(coreHash('X', { shapes: [] }));
    for (const [front, back] of [[ALL, LOAM], [{}, null], [SAND, {}]] as const) {
      expect(bareHash('X', c(front, back))).toBe(coreHash('X', c(undefined, null)));
    }
    expect(bareHash('X', c(ALL))).not.toBe(coreHash('X', c(ALL)));
    expect(bareHash('Y', c(ALL))).not.toBe(bareHash('X', c(ALL))); // (the name, as in the core)
    expect(bareHash('X', { ...c(ALL), shapes: plan(ALL, { ax: 6 }) })).not.toBe(bareHash('X', c(ALL)));
    // (Only what's hashed: the plan keeps its conditions.)
    const kept = c(ALL);
    bareHash('X', kept);
    expect(conditions(kept)).toEqual([ALL, LOAM]);
    // Sent, taken: each record has it, made with its core.
    const { server, phone, laptop, id } = await start(ALL);
    expect(phone.recs[id]).toMatchObject({ core: coreHash('Back Yard', contentOf(phone, id)), bare: bareHash('Back Yard', contentOf(phone, id)) });
    const tablet = new Dev('tablet', false);
    await syncDev(tablet, server);
    expect(tablet.recs[id]).toMatchObject({ core: coreHash('Back Yard', contentOf(tablet, id)), bare: bareHash('Back Yard', contentOf(tablet, id)) });
    expect(laptop.recs[id]).not.toHaveProperty('bare'); // (the release's own record: as it was)
  });

  it("a record made by taking the release's copy (this device's conditions filled in), then conditions changed here with the aster moved, while the release moves the photo: no copy", async () => {
    const { server, phone, laptop, id } = await start(ALL);
    releaseEdits(laptop, id);
    await syncDev(laptop, server);
    expect(await syncDev(phone, server)).toMatchObject({ downloaded: 1, uploaded: 0 }); // (taken, its own kept: nothing sent)
    expect(conditions(contentOf(phone, id))).toEqual([ALL, LOAM]);
    laptop.edit(id, (c) => ({ ...c, photo: photo({ cx: 8 }) }));
    await syncDev(laptop, server);
    setPlan(phone, id, plan(SAND, { ax: 6 }));
    expect(await syncDev(phone, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect(onServer(server, id)).toMatchObject({ shapes: phone.read({ shapes: plan(SAND, { ax: 6 }) }).shapes, bought: TICK, photo: photo({ cx: 8 }) });
    await syncDev(laptop, server);
    await settled(server, phone, laptop);
    expect([phone.projectsById.size, laptop.projectsById.size]).toEqual([1, 1]);
  });

  it('the flaw, reproduced: the front bed\'s conditions changed here, alone or with the aster moved, while the release ticks a plant and moves the photo: no copy; all of it goes up; it settles', async () => {
    for (const [from, to] of CHANGES) {
      for (const moved of [false, true]) {
        const what = `${JSON.stringify(from)} to ${JSON.stringify(to)}${moved ? ', the aster moved' : ''}`;
        const { server, phone, laptop, id } = await start(from);
        releaseEdits(laptop, id);
        expect(await syncDev(laptop, server)).toMatchObject({ uploaded: 1 });
        expect(conditions(onServer(server, id))).toEqual([undefined, undefined]); // (the release's copy: none)
        setPlan(phone, id, plan(to, { ax: moved ? 6 : 2 }));
        const report = await syncDev(phone, server);
        expect(report.conflicts.map((c) => c.copyName.replace(/, .*/, '')), what).toEqual([]);
        expect(report, what).toMatchObject({ uploaded: 1 });
        const want = { shapes: phone.read({ shapes: plan(to, { ax: moved ? 6 : 2 }) }).shapes, bought: TICK, photo: photo({ cx: 4 }) };
        expect(contentOf(phone, id), what).toMatchObject(want);
        expect(onServer(server, id), what).toMatchObject(want);
        expect(await syncDev(laptop, server), what).toMatchObject({ downloaded: 1, conflicts: [] });
        await settled(server, phone, laptop);
        expect([phone.projectsById.size, laptop.projectsById.size], what).toEqual([1, 1]);
      }
    }
  });

  it('with the print choice for the plants under taller ones picked (or changed) here too, the release dropping both: no copy; both go up', async () => {
    const P = (under?: PrintUnder): PrintSettings => ({ ...DEFAULT_PRINT, ...(under ? { under } : {}) });
    for (const [from, to] of [[undefined, 'screen'], ['screen', 'windows'], ['windows', 'screen']] as const) {
      const server = new FakeServer(), phone = new Dev('phone', false), laptop = new Dev('laptop', true);
      const id = phone.add('Back Yard', plan(ALL), photo());
      phone.edit(id, (c) => ({ ...c, print: P(from) }));
      await syncDev(phone, server); await syncDev(laptop, server);
      releaseEdits(laptop, id);
      await syncDev(laptop, server);
      expect('under' in (onServer(server, id).print as object)).toBe(false); // (the release's copy: neither)
      phone.edit(id, (c) => ({ ...c, shapes: plan(SAND, { ax: 6 }), print: P(to) }));
      expect(await syncDev(phone, server), `${from} to ${to}`).toMatchObject({ uploaded: 1, conflicts: [] });
      expect(onServer(server, id)).toMatchObject({ shapes: phone.read({ shapes: plan(SAND, { ax: 6 }) }).shapes, print: P(to), bought: TICK });
      await syncDev(laptop, server);
      await settled(server, phone, laptop);
      expect([phone.projectsById.size, laptop.projectsById.size]).toEqual([1, 1]);
    }
  });

  it('still a copy where the release changed something else in the core: the same bed moved, or the other bed; both kept, nothing lost', async () => {
    for (const there of [{ bx: 4 }, { b2x: 44 }]) {
      for (const moved of [false, true]) {
        const what = `${JSON.stringify(there)}${moved ? ', the aster moved here' : ''}`;
        const { server, phone, laptop, id } = await start(ALL);
        setPlan(laptop, id, plan(undefined, there));
        await syncDev(laptop, server);
        setPlan(phone, id, plan(SAND, { ax: moved ? 6 : 2 }));
        expect((await syncDev(phone, server)).conflicts, what).toHaveLength(1);
        // The original: the release's edit, this device's conditions kept (filled in); the copy: this device's version.
        expect(contentOf(phone, id).shapes, what).toEqual(phone.read({ shapes: plan(SAND, there) }).shapes);
        expect(copyOf(phone, id)!.content.shapes, what).toEqual(phone.read({ shapes: plan(SAND, { ax: moved ? 6 : 2 }) }).shapes);
      }
    }
  });

  it('still a copy where a device of this version changed a bed\'s conditions there (set, changed or cleared), with another edit here', async () => {
    for (const [bedThere, theirs] of [['b1', LOAM], ['b1', {}], ['b2', {}], ['b2', ALL]] as const) {
      const what = `${bedThere} to ${JSON.stringify(theirs)} there`;
      const tablet = new Dev('tablet', false);
      const { server, phone, id } = await start(ALL, { c2: LOAM }, tablet);
      setPlan(tablet, id, bedThere === 'b1' ? plan(theirs) : plan(ALL, { c2: theirs }));
      expect(await syncDev(tablet, server), what).toMatchObject({ uploaded: 1 });
      setPlan(phone, id, plan(SAND, { ax: 6 }));
      expect((await syncDev(phone, server)).conflicts, what).toHaveLength(1);
      expect(conditions(contentOf(phone, id)), what).toEqual(bedThere === 'b1' ? [theirs, LOAM] : [ALL, theirs]);
      expect(conditions(copyOf(phone, id)!.content), what).toEqual([SAND, LOAM]);
    }
  });

  it('two devices of this version, as before: a tick and the photo moved there, conditions changed and the aster moved here: no copy; the back bed moved there: a copy', async () => {
    for (const there of ['tick', 'move'] as const) {
      const tablet = new Dev('tablet', false);
      const { server, phone, id } = await start(ALL, { c2: LOAM }, tablet);
      if (there === 'tick') releaseEdits(tablet, id); else setPlan(tablet, id, plan(ALL, { b2x: 44 }));
      expect(await syncDev(tablet, server)).toMatchObject({ uploaded: 1 });
      setPlan(phone, id, plan(SAND, { ax: 6 }));
      expect((await syncDev(phone, server)).conflicts, there).toHaveLength(there === 'tick' ? 0 : 1);
      await syncDev(tablet, server);
      await settled(server, phone, tablet);
      expect(conditions(contentOf(tablet, id)), there).toEqual(there === 'tick' ? [SAND, LOAM] : [ALL, LOAM]);
    }
  });

  it("after a real copy (the back bed moved there, conditions changed and the aster moved here), the release's tick before this device's next pass makes no second copy, with an edit here since too (before Nov 5 it did); a second move there still does, edit here or none (docs/storage.md: both kept)", async () => {
    for (const next of ['tick', 'move'] as const) {
      for (const editHere of [false, true]) {
        const what = `${next}${editHere ? ', the aster moved here again' : ''}`;
        const { server, phone, laptop, id } = await start(ALL);
        setPlan(laptop, id, plan(undefined, { b2x: 44 }));
        await syncDev(laptop, server);
        setPlan(phone, id, plan(SAND, { ax: 6 }));
        expect((await syncDev(phone, server)).conflicts).toHaveLength(1);
        await syncDev(laptop, server);
        if (next === 'tick') laptop.edit(id, (c) => ({ ...c, bought: TICK })); else setPlan(laptop, id, plan(undefined, { b2x: 48 }));
        await syncDev(laptop, server);
        // The original holds this device's conditions, filled in, which its record (the server's copy) hasn't: a change
        // here until it goes up. Edited here too, its plan is no longer the server's (as the tick finds it).
        if (editHere) setPlan(phone, id, plan(SAND, { b2x: 44, ax: 8 }));
        expect((await syncDev(phone, server)).conflicts, what).toHaveLength(next === 'tick' ? 0 : 1);
        expect(phone.projectsById.size, what).toBe(next === 'tick' ? 2 : 3);
        expect(conditions(contentOf(phone, id)), what).toEqual([SAND, LOAM]);
        if (next === 'tick') expect(onServer(server, id), what).toMatchObject({ shapes: phone.read({ shapes: plan(SAND, { b2x: 44, ax: editHere ? 8 : 2 }) }).shapes, bought: TICK });
        await syncDev(phone, server); await syncDev(laptop, server);
        await settled(server, phone, laptop);
      }
    }
  });

  it("a clear here ({}), alone, over a copy the release sent without them, not yet taken here, goes up and stands: a device that still had the answers takes it, and nothing sends them back (found Nov 5)", async () => {
    const tablet = new Dev('tablet', false);
    const { server, phone, laptop, id } = await start(ALL, { c2: null }, tablet);
    releaseEdits(laptop, id);
    await syncDev(laptop, server);
    // The phone, before taking that, clears the front bed's answers (its only change; marked: src/marks.ts), and syncs.
    setPlan(phone, id, plan({}, { c2: null }));
    expect(await syncDev(phone, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect(onServer(server, id)).toMatchObject({ shapes: phone.read({ shapes: plan({}, { c2: null }) }).shapes, bought: TICK, photo: photo({ cx: 4 }) });
    // The tablet, which had the answers, takes the clear; its next edit sends it, not the answers.
    expect(await syncDev(tablet, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(conditions(contentOf(tablet, id))).toEqual([{}, undefined]);
    setPlan(tablet, id, plan({}, { c2: null, ax: 9 }));
    expect(await syncDev(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await syncDev(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(conditions(contentOf(phone, id))).toEqual([{}, undefined]);
    await syncDev(laptop, server);
    await settled(server, phone, tablet, laptop);
    expect([phone.projectsById.size, tablet.projectsById.size, laptop.projectsById.size]).toEqual([1, 1, 1]);
  });

  it("the other side (docs/storage.md): a clear made offline, while another device of this version set new answers and the release sent the plan between, goes up at the next pass and replaces them, as answers set offline do", async () => {
    for (const offline of [{}, LOAM]) {
      const tablet = new Dev('tablet', false);
      const { server, phone, laptop, id } = await start(ALL, { c2: null }, tablet);
      setPlan(phone, id, plan(offline, { c2: null })); // (offline)
      setPlan(tablet, id, plan(SAND, { c2: null }));
      await syncDev(tablet, server);
      await syncDev(laptop, server);
      releaseEdits(laptop, id);
      await syncDev(laptop, server);
      expect(await syncDev(phone, server), JSON.stringify(offline)).toMatchObject({ uploaded: 1, conflicts: [] });
      await syncDev(tablet, server); await syncDev(laptop, server);
      await settled(server, phone, tablet, laptop);
      expect([conditions(contentOf(phone, id))[0], conditions(contentOf(tablet, id))[0]], JSON.stringify(offline)).toEqual([offline, offline]);
    }
  });

  it("a clear here isn't sent by the merge over a bed whose conditions the server's copy has in a form this version can't read (a later version's): judged by the copy as sent, not as read here", async () => {
    const { server, phone, id } = await start(ALL, { c2: null });
    // A later version's edit: soil as a list (this version drops it whole, reading it), and a tick.
    const LATER = { soil: ['clay', 'loam'] };
    const row = server.rows.get(id)!;
    row.content = { ...row.content, shapes: plan(LATER, { c2: null }), bought: TICK };
    row.revision++; row.updated_by = 'tablet';
    setPlan(phone, id, plan({}, { c2: null }));
    expect(await syncDev(phone, server)).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: [] });
    expect(conditions(onServer(server, id))).toEqual([LATER, undefined]);
    expect(conditions(contentOf(phone, id))).toEqual([{}, undefined]); // (its own, as any edit of its own is: docs/storage.md)
  });

  it("likewise a fruit-partner warning shown again here (''), alone, over a copy the release sent without it: it goes up, and a device that still had the dismissal takes it (found Nov 5)", async () => {
    const oak = (x = 50) => ({ id: 'o1', type: 'circle', x, y: 10, radius: 8, color: '#166534', label: 'Old oak', opacity: 0.5, locked: false });
    const shapes = (dismissed: string, oakX = 50) => [{ ...aster(2), fruitDismissed: dismissed }, oak(oakX)];
    const dismissal = (c: ProjectContent) => (c.shapes as Shape[])[0].fruitDismissed;
    const server = new FakeServer(), phone = new Dev('phone', false), laptop = new Dev('laptop', true), tablet = new Dev('tablet', false);
    const id = phone.add('Back Yard', shapes('Needs a partner'), null);
    for (const d of [phone, laptop, tablet]) await syncDev(d, server);
    laptop.edit(id, (c) => ({ ...c, bought: TICK }));
    await syncDev(laptop, server);
    setPlan(phone, id, shapes('')); // (Show again: its only change)
    expect(await syncDev(phone, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    expect([dismissal(onServer(server, id)), onServer(server, id).bought]).toEqual(['', TICK]);
    expect(await syncDev(tablet, server)).toMatchObject({ downloaded: 1 });
    tablet.edit(id, (c) => ({ ...c, shapes: [(c.shapes as Shape[])[0], oak(44)] }));
    expect(await syncDev(tablet, server)).toMatchObject({ uploaded: 1 });
    await syncDev(phone, server);
    expect([dismissal(contentOf(phone, id)), dismissal(contentOf(tablet, id))]).toEqual(['', '']);
    await syncDev(laptop, server);
    await settled(server, phone, tablet, laptop);
  });

  it('a record from before the fix (no `bare`): compared as before, a copy; both kept', async () => {
    const { server, phone, laptop, id } = await start(ALL);
    expect(phone.recs[id]).toHaveProperty('bare');
    delete (phone.recs[id] as { bare?: string }).bare;
    releaseEdits(laptop, id);
    await syncDev(laptop, server);
    setPlan(phone, id, plan(SAND, { ax: 6 }));
    expect((await syncDev(phone, server)).conflicts).toHaveLength(1);
    expect([conditions(contentOf(phone, id)), conditions(copyOf(phone, id)!.content)]).toEqual([[SAND, LOAM], [SAND, LOAM]]);
    // (The original's conditions, filled in, go up at the next pass: docs/storage.md, after a conflict.)
    expect(await syncDev(phone, server)).toMatchObject({ uploaded: 1, conflicts: [] });
    await syncDev(laptop, server);
    await settled(server, phone, laptop);
  });

  it("the window left (docs/storage.md), the same with or without the copy: a device of this version changed them and the release sent the plan between; this device's own change goes up over it, as its original did", async () => {
    for (const before of [false, true]) {
      const tablet = new Dev('tablet', false);
      const { server, phone, laptop, id } = await start(ALL, { c2: LOAM }, tablet);
      if (before) delete (phone.recs[id] as { bare?: string }).bare; // (as before the fix)
      setPlan(tablet, id, plan(LOAM));
      await syncDev(tablet, server);
      await syncDev(laptop, server);
      releaseEdits(laptop, id);
      await syncDev(laptop, server);
      setPlan(phone, id, plan(SAND, { ax: 6 }));
      expect((await syncDev(phone, server)).conflicts).toHaveLength(before ? 1 : 0);
      await syncDev(phone, server); await syncDev(tablet, server); await syncDev(laptop, server);
      await settled(server, phone, tablet, laptop);
      // Before, too, neither the original nor the copy had the tablet's LOAM: this device's SAND was filled into both.
      for (const d of [phone, tablet]) for (const p of d.projectsById.values()) expect(conditions(p.content)[0], `${before}`).toEqual(SAND);
    }
  });
});
