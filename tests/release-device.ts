// A device for sync tests, of this version or still on the release (tests/sync-release.test.ts,
// tests/photo-storage.test.ts): `release`, it reads shapes, photos and print settings as the release does, lays a synced placement of
// the same photo over its own (the release's placePhoto), and syncs with the release's own engine
// (tests/fixtures/release-engine.ts).
import { syncOnce, type Local, type LocalProject, type ProjectContent, type SyncRecord } from '../src/sync/engine';
import { syncOnce as releaseSyncOnce } from './fixtures/release-engine';
import type { FakeServer } from './fake-sync-server';
import { migrateShape, sanitizePhotoRef, sanitizePrint } from '../src/storage';
import { releaseMigrateShape } from './fixtures/release-migrate-shape';
import { releaseSanitizePhotoRef } from './fixtures/release-photo';
import { releaseSanitizePrint } from './fixtures/release-print';

let nextId = 0;
export const FP = 'c'.repeat(64);
const photoBytes = (fp: string) => `data:image/jpeg;base64,${btoa(fp)}`;

/** A device. `release`: reads as the release does, and lays a synced placement over its own photo (its placePhoto). */
export class Dev implements Local {
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
    if ('print' in out) out.print = (this.release ? releaseSanitizePrint : sanitizePrint)(out.print);
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
export const sync = (d: Dev, s: FakeServer) => (d.release ? releaseSyncOnce : syncOnce)(d as never, s.remoteFor(d.name) as never, d.name);
