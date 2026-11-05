// A device of this version against one still on the release, run with the release's own sync engine
// (tests/fixtures/release-engine.ts: origin/release at bdeb911, verbatim), its reading of shapes and photos, and its
// placePhoto (a synced placement of the same photo laid over its own). Database version 5's two fields (Nov 4): a
// photo's rough scale and the sides of a shape typed as numbers; docs/storage.md. From the independent review's probes.
import { describe, expect, it } from 'vitest';
import { syncOnce, type Local, type LocalProject, type ProjectContent, type SyncRecord } from '../src/sync/engine';
import { syncOnce as releaseSyncOnce } from './fixtures/release-engine';
import { FakeServer } from './fake-sync-server';
import { migrateShape, sanitizePhotoRef } from '../src/storage';
import { releaseMigrateShape } from './fixtures/release-migrate-shape';
import { releaseSanitizePhotoRef } from './fixtures/release-photo';
import type { Shape } from '../src/types';

let nextId = 0;
const FP = 'c'.repeat(64);
const photoBytes = (fp: string) => `data:image/jpeg;base64,${btoa(fp)}`;

/** A device. `release`: reads as the release does, and lays a synced placement over its own photo (its placePhoto). */
class Dev implements Local {
  projectsById = new Map<string, LocalProject>();
  recs: Record<string, SyncRecord> = {};
  tombs: Record<string, number> = {};
  photos = new Map<string, string>();
  constructor(public name: string, public release: boolean) {}
  read(c: ProjectContent): ProjectContent {
    const out = structuredClone(c);
    const mig = this.release ? releaseMigrateShape : migrateShape;
    if (Array.isArray(out.shapes)) out.shapes = out.shapes.map((x) => mig(x)).filter((x) => x !== null);
    if ('photo' in out) out.photo = (this.release ? releaseSanitizePhotoRef : sanitizePhotoRef)(out.photo);
    return out;
  }
  add(name: string, shapes: unknown[], photo: object | null) {
    const id = `${this.name}-${++nextId}`;
    this.projectsById.set(id, { id, name, content: this.read({ shapes, photo }), token: 0 });
    if (photo) this.photos.set(id, FP);
    return id;
  }
  edit(id: string, f: (c: ProjectContent) => ProjectContent) { const p = this.projectsById.get(id)!; p.content = this.read(f(p.content)); p.token++; }
  async projects() { return [...this.projectsById.values()].map((p) => structuredClone(p)); }
  records() { return { ...this.recs }; }
  async setRecord(id: string, rec: SyncRecord | null) { if (rec) this.recs[id] = rec; else delete this.recs[id]; }
  tombstones() { return { ...this.tombs }; }
  async clearTombstone(id: string) { delete this.tombs[id]; }
  private place(id: string, prev: ProjectContent | undefined, content: ProjectContent): ProjectContent {
    const n = this.read(content);
    if (!('photo' in content)) return prev && 'photo' in prev ? { ...n, photo: prev.photo } : n;
    const ph = n.photo as Record<string, unknown> | null;
    const was = prev?.photo as Record<string, unknown> | null | undefined;
    if (ph && typeof ph.fingerprint === 'string') {
      this.photos.set(id, ph.fingerprint);
      // (The release's placePhoto: the same photo here keeps its fields, the incoming placement laid over them.)
      if (this.release && was && was.fingerprint === ph.fingerprint) n.photo = this.read({ photo: { ...was, ...ph } }).photo;
    }
    return n;
  }
  async replace(id: string, name: string, content: ProjectContent, token: number) {
    const p = this.projectsById.get(id);
    if (!p || p.token !== token) return false;
    this.projectsById.set(id, { id, name, content: this.place(id, p.content, content), token: token + 1 }); return true;
  }
  async create(id: string, name: string, content: ProjectContent) { this.projectsById.set(id, { id, name, content: this.place(id, undefined, content), token: 0 }); }
  async photoData(id: string, want: string) { const fp = this.photos.get(id); return fp ? (fp === want ? photoBytes(fp) : false) : null; }
  async hasPhoto(id: string, fp: string) { return this.photos.get(id) === fp; }
  async fillPhoto(id: string, token: number, fp: string) { const p = this.projectsById.get(id); if (!p || p.token !== token) return false; this.photos.set(id, fp); p.token++; return true; }
  async remove(id: string, token: number) { const p = this.projectsById.get(id); if (!p || p.token !== token) return false; this.projectsById.delete(id); return true; }
  async keepCopy(_from: string, name: string, content: ProjectContent) { const id = `${this.name}-${++nextId}`; this.projectsById.set(id, { id, name, content: structuredClone(content), token: 0 }); return { id, token: 0 }; }
  async rename(id: string, name: string, token: number) { const p = this.projectsById.get(id)!; const ok = p.token === token; p.name = name; p.token++; return ok ? p.token : -1; }
  normalize(name: string, content: ProjectContent) { return { name: name.trim() || 'Untitled', content: this.read(content) }; }
}
const sync = (d: Dev, s: FakeServer) => (d.release ? releaseSyncOnce : syncOnce)(d as never, s.remoteFor(d.name) as never, d.name);
const photo = (extra: object = {}) => ({ fingerprint: FP, naturalWidth: 400, naturalHeight: 300, ftPerPx: 0.25, cx: 0, cy: 0, rotation: 0, opacity: 0.6, visible: true, ...extra });
const house = (extra: object = {}) => ({ id: 'h1', type: 'rect', x: 0, y: 0, width: 30, height: 20, rotation: 0, color: '#78716c', label: 'House', opacity: 0.8, locked: false, role: 'building', ...extra });
const oak = (x = 50) => ({ id: 'o1', type: 'circle', x, y: 10, radius: 8, color: '#166534', label: 'Old oak', opacity: 0.5, locked: false });
const M = [{ side: 0, ft: 30 }, { side: 1, ft: 20 }, { side: 2, ft: 30 }, { side: 3, ft: 20 }];
const ph = (d: Dev, id: string) => d.projectsById.get(id)!.content.photo as Record<string, unknown>;
const shapes = (d: Dev, id: string) => d.projectsById.get(id)!.content.shapes as Shape[];
const typedOf = (s: Shape) => [...((s as { measured?: { side: number; ft: number }[] }).measured ?? [])].sort((a, b) => a.side - b.side);
async function still(server: FakeServer, ...devices: Dev[]) {
  for (let i = 0; i < 3; i++) for (const d of devices) expect(await sync(d, server)).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: [] });
}

describe("a photo's rough scale and sides typed as numbers, against the release's own engine (Nov 4)", () => {
  it('the release takes a plan with both fields and sends nothing back for them, pass after pass', async () => {
    const server = new FakeServer(), phone = new Dev('phone', false), laptop = new Dev('laptop', true);
    phone.add('Back Yard', [house({ measured: M }), oak()], photo({ roughScale: true }));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(laptop, server)).toMatchObject({ downloaded: 1 });
    await still(server, laptop, phone);
  });

  it('the release ticks a plant and moves the photo while the phone reshapes the house: the phone keeps both fields; no copy anywhere; it settles', async () => {
    const server = new FakeServer(), phone = new Dev('phone', false), laptop = new Dev('laptop', true);
    const id = phone.add('Back Yard', [house({ measured: M }), oak()], photo({ roughScale: true }));
    await sync(phone, server); await sync(laptop, server);
    laptop.edit(id, (c) => ({ ...c, bought: { 'pl:1': { n: 1, at: 5 } }, photo: photo({ cx: 4 }) }));
    phone.edit(id, (c) => ({ ...c, shapes: [house({ width: 31, measured: [{ side: 1, ft: 20 }, { side: 3, ft: 20 }] }), oak()] })); // (its typed width forgotten)
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(phone, server)).toMatchObject({ conflicts: [] });
    expect(await sync(laptop, server)).toMatchObject({ conflicts: [] });
    await sync(phone, server);
    await still(server, phone, laptop);
    expect(shapes(phone, id)[0]).toMatchObject({ width: 31, measured: [{ side: 1, ft: 20 }, { side: 3, ft: 20 }] });
    expect(ph(phone, id)).toMatchObject({ cx: 4, roughScale: true });
    expect([phone.projectsById.size, laptop.projectsById.size]).toEqual([1, 1]);
  });

  it("the review's R4: the release's tick takes the house's typed sides away on the server; a tablet of this version, never having had them, types the Width; the phone keeps its typed Length, still 20, beside the tablet's Width", async () => {
    const server = new FakeServer(), phone = new Dev('phone', false), laptop = new Dev('laptop', true), tablet = new Dev('tablet', false);
    const id = phone.add('Back Yard', [house({ measured: M }), oak()], null);
    await sync(phone, server); await sync(laptop, server);
    laptop.edit(id, (c) => ({ ...c, bought: { 'pl:1': { n: 1, at: 5 } } }));
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(tablet, server)).toMatchObject({ downloaded: 1 });
    expect(typedOf(shapes(tablet, id)[0])).toEqual([]);
    tablet.edit(id, (c) => ({ ...c, shapes: [house({ width: 32, measured: [{ side: 0, ft: 32 }, { side: 2, ft: 32 }] }), oak()] }));
    expect(await sync(tablet, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(shapes(phone, id)[0]).toMatchObject({ width: 32, height: 20 });
    expect(typedOf(shapes(phone, id)[0])).toEqual([{ side: 0, ft: 32 }, { side: 1, ft: 20 }, { side: 2, ft: 32 }, { side: 3, ft: 20 }]);
    // Its next edit sends them; the tablet takes them all.
    phone.edit(id, (c) => ({ ...c, shapes: [(c.shapes as Shape[])[0], oak(60)] }));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    await sync(tablet, server); await sync(laptop, server);
    await still(server, phone, tablet, laptop);
    expect(typedOf(shapes(tablet, id)[0])).toEqual([{ side: 0, ft: 32 }, { side: 1, ft: 20 }, { side: 2, ft: 32 }, { side: 3, ft: 20 }]);
  });

  it("a side changed and changed back on one device may count again from another device's copy: it's that length (docs/storage.md)", async () => {
    const server = new FakeServer(), phone = new Dev('phone', false), tablet = new Dev('tablet', false);
    const W = [{ side: 0, ft: 30 }, { side: 2, ft: 30 }];
    const id = phone.add('Back Yard', [house({ measured: W }), oak()], null);
    await sync(phone, server); await sync(tablet, server);
    // The tablet: dragged to 31 (its typed width forgotten), back to 30 (still forgotten there), then the oak moved.
    tablet.edit(id, (c) => ({ ...c, shapes: [house({ width: 31 }), oak()] }));
    await sync(tablet, server);
    tablet.edit(id, (c) => ({ ...c, shapes: [house(), oak(52)] }));
    await sync(tablet, server);
    // The phone, offline through both: the house is its width again, side for side: its typed width stays, and goes back.
    expect(await sync(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(shapes(phone, id)[0]).toMatchObject({ width: 30, measured: W });
    phone.edit(id, (c) => ({ ...c, shapes: [(c.shapes as Shape[])[0], oak(60)] }));
    await sync(phone, server); await sync(tablet, server);
    expect(shapes(tablet, id)[0]).toMatchObject({ width: 30, measured: W });
  });

  it('a scale set here (rough) on a photo the release has as "not to scale yet": the release sends "not to scale yet" back by itself on its next pass; the scale set here stays, the rough scale goes, and it settles', async () => {
    const server = new FakeServer(), phone = new Dev('phone', false), laptop = new Dev('laptop', true);
    const id = phone.add('Back Yard', [house()], photo({ uncalibrated: true }));
    await sync(phone, server); await sync(laptop, server);
    expect(ph(laptop, id)).toMatchObject({ uncalibrated: true });
    phone.edit(id, (c) => ({ ...c, photo: photo({ ftPerPx: 0.3, roughScale: true }) }));
    expect(await sync(phone, server)).toMatchObject({ uploaded: 1 });
    expect(await sync(laptop, server)).toMatchObject({ downloaded: 1 });
    expect(ph(laptop, id)).toMatchObject({ ftPerPx: 0.3, uncalibrated: true }); // (its placePhoto kept its own flag)
    expect(await sync(laptop, server)).toMatchObject({ uploaded: 1 }); // (no edit there: its next pass)
    expect(await sync(phone, server)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(ph(phone, id)).toEqual(photo({ ftPerPx: 0.3, uncalibrated: true }));
    await still(server, phone, laptop);
  });
});
