// The sync engine: one pass that brings this device's projects and the
// server's into step. It knows nothing about the page or Supabase; it works
// through two small interfaces, so it can be tested with a stand-in server
// and stand-in devices (tests/sync-engine.test.ts).
//
// The rules (see the Sync Design doc):
// - A project syncs as one unit. Each device remembers, per project, the
//   server revision its copy started from and a fingerprint of its content
//   then. Changed here = the fingerprint no longer matches.
// - Upload only from the revision the server has; otherwise it's a conflict.
// - A conflict keeps both: the server's version takes the project's place
//   and this device's version becomes a copy beside it. Nothing is merged,
//   nothing is lost.
// - Sync never removes a project that has changes here. A project deleted
//   elsewhere leaves this device only if it hasn't changed here; if it has,
//   it comes back out of the trash with this device's version.

export interface ProjectContent { [key: string]: unknown }
export interface LocalProject { id: string; name: string; content: ProjectContent }
export interface SyncRecord { revision: number; hash: string }
export interface ServerProject { id: string; name: string; revision: number; updated_by: string | null; updated_at: string; deleted_at: string | null }
export type PushResult =
  | { status: 'ok'; revision: number }
  | { status: 'conflict'; revision: number; name: string; content: ProjectContent; updated_by: string | null; updated_at: string }
  | { status: 'deleted'; revision: number }
  | { status: 'paused' }
  | { status: 'full' };

/** This device's side. */
export interface Local {
  /** Every project here, as it is now (the open one saved first). */
  projects(): Promise<LocalProject[]>;
  records(): Record<string, SyncRecord>;
  setRecord(id: string, rec: SyncRecord | null): Promise<void>;
  /** Synced projects deleted here, to move to the server's trash: id → revision. */
  tombstones(): Record<string, number>;
  clearTombstone(id: string): Promise<void>;
  /** Replace a project's content and name (false if it was edited meanwhile: try again next time). */
  replace(id: string, name: string, content: ProjectContent): Promise<boolean>;
  /** A project new to this device, under the server's id. */
  create(id: string, name: string, content: ProjectContent): Promise<void>;
  /** Remove a project deleted elsewhere (it's in the server's trash). */
  remove(id: string): Promise<void>;
  /** Keep this device's version of a project as a new project; returns its id. */
  keepCopy(name: string, content: ProjectContent): Promise<string>;
  rename(id: string, name: string): Promise<void>;
  /**
   * A name and content as this device will store and read them back (checked
   * and tidied, as any download is), so its fingerprint matches what the next
   * pass reads.
   */
  normalize(name: string, content: ProjectContent): { name: string; content: ProjectContent };
}
/** The server's side. */
export interface Remote {
  list(): Promise<ServerProject[]>;
  fetch(ids: string[]): Promise<Record<string, { name: string; revision: number; content: ProjectContent }>>;
  push(id: string, base: number | null, name: string, content: ProjectContent): Promise<PushResult>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<number | null>;
}

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  /** Projects changed on two devices: the copy this device kept. */
  conflicts: { name: string; copyName: string; otherDevice: string | null }[];
  /** Deleted elsewhere, removed here. */
  removed: string[];
  /** Deleted elsewhere while changed here: brought back. */
  restored: string[];
  /** The plan doesn't include sync now (trial ended, subscription lapsed). */
  paused: boolean;
  /** The account's project limit was reached. */
  full: boolean;
}

// ---------- Fingerprints ----------
/** JSON with object keys sorted, so the same content always reads the same (the server may reorder keys). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}
/** A fingerprint of a project's name and content (53-bit hash; collisions are vanishingly unlikely for edits). */
export function fingerprint(name: string, content: ProjectContent): string {
  const s = canonical({ name, content });
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + s.length.toString(36);
}

/** "Back Yard — copy from Pixel 7, Oct 17, 9:40 AM" */
export function copyName(name: string, device: string, at = new Date()): string {
  const when = at.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${name} — copy from ${device || 'this device'}, ${when}`;
}

/** One sync pass. Never throws for a single project's trouble; a server failure ends the pass (try again later). */
export async function syncOnce(local: Local, remote: Remote, device: string): Promise<SyncReport> {
  const report: SyncReport = { uploaded: 0, downloaded: 0, conflicts: [], removed: [], restored: [], paused: false, full: false };

  // 1. Deletions made here go to the server's trash.
  for (const id of Object.keys(local.tombstones())) {
    await remote.trash(id);
    await local.clearTombstone(id);
  }

  const server = new Map((await remote.list()).map((s) => [s.id, s]));
  const projects = await local.projects();
  const records = local.records();
  const here = new Set(projects.map((p) => p.id));
  const liveNames = new Set([...server.values()].filter((s) => !s.deleted_at).map((s) => s.name));

  /** Upload; true if stored. Handles every answer. */
  const upload = async (p: LocalProject, base: number | null, hash: string): Promise<boolean> => {
    let res = await remote.push(p.id, base, p.name, p.content);
    if (res.status === 'deleted') {
      // Trashed while we worked: this device has changes, so it comes back.
      const rev = await remote.restore(p.id);
      report.restored.push(p.name);
      res = await remote.push(p.id, rev, p.name, p.content);
    }
    switch (res.status) {
      case 'ok':
        await local.setRecord(p.id, { revision: res.revision, hash });
        report.uploaded++;
        return true;
      case 'conflict':
        await conflict(p, res.name, res.revision, res.content, res.updated_by);
        return false;
      case 'paused': report.paused = true; return false;
      case 'full': report.full = true; return false;
      default: return false;
    }
  };
  /** Changed on two devices: the server's version takes this place; ours becomes a copy beside it. */
  const conflict = async (p: LocalProject, serverName: string, serverRev: number, serverContent: ProjectContent, by: string | null) => {
    const copy = copyName(p.name, device);
    // The copy is saved first, so this device's version is never only in the project being replaced.
    const copyId = await local.keepCopy(copy, p.content);
    if (!(await local.replace(p.id, serverName, serverContent))) {
      // Edited again meanwhile: the original still holds this device's version (and more);
      // drop the copy, and the next pass meets the same conflict with the newer edits.
      await local.remove(copyId);
      return;
    }
    const n = local.normalize(serverName, serverContent);
    await local.setRecord(p.id, { revision: serverRev, hash: fingerprint(n.name, n.content) });
    report.conflicts.push({ name: serverName, copyName: copy, otherDevice: by });
    const copied: LocalProject = { id: copyId, name: copy, content: p.content };
    if (!report.paused && !report.full) await upload(copied, null, fingerprint(copy, p.content));
  };

  const toDownload: string[] = [];
  for (const p of projects) {
    if (report.paused) break;
    const hash = fingerprint(p.name, p.content);
    const rec = records[p.id];
    const s = server.get(p.id);
    const changed = !rec || rec.hash !== hash;
    if (!s) {
      // New to the server (or gone from its trash after 30 days): upload. A first upload
      // whose name another synced project already has is marked as this device's.
      if (!rec && liveNames.has(p.name)) {
        const name = `${p.name} (from ${device || 'this device'})`;
        await local.rename(p.id, name);
        p.name = name;
      }
      if (!report.full) await upload(p, null, fingerprint(p.name, p.content));
    } else if (s.deleted_at) {
      if (changed) {
        const rev = await remote.restore(p.id);
        report.restored.push(p.name);
        await upload(p, rev, hash);
      } else {
        await local.remove(p.id);
        report.removed.push(p.name);
      }
    } else if (rec && rec.revision === s.revision) {
      if (changed) await upload(p, rec.revision, hash);
    } else if (rec && !changed) {
      toDownload.push(p.id); // changed elsewhere only
    } else {
      // Changed here and elsewhere (or never synced from here, under a server id: compare first).
      const got = (await remote.fetch([p.id]))[p.id];
      if (!got) continue;
      const n = local.normalize(got.name, got.content);
      if (fingerprint(n.name, n.content) === hash) await local.setRecord(p.id, { revision: got.revision, hash });
      else await conflict(p, got.name, got.revision, got.content, s.updated_by);
    }
  }

  // 2. Projects changed or made elsewhere come down.
  if (!report.paused) {
    for (const s of server.values()) if (!s.deleted_at && !here.has(s.id) && !(s.id in local.tombstones())) toDownload.push(s.id);
    if (toDownload.length) {
      const got = await remote.fetch(toDownload);
      for (const id of toDownload) {
        const g = got[id];
        if (!g) continue;
        const ok = here.has(id) ? await local.replace(id, g.name, g.content) : (await local.create(id, g.name, g.content), true);
        if (ok) {
          const n = local.normalize(g.name, g.content);
          await local.setRecord(id, { revision: g.revision, hash: fingerprint(n.name, n.content) });
          report.downloaded++;
        }
      }
    }
  }
  return report;
}
