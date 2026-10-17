import type { ProjectContent, PushResult, Remote, ServerProject } from '../src/sync/engine';

// A stand-in for the sync functions in supabase/02-sync.sql (same rules).
export class FakeServer {
  rows = new Map<string, { name: string; content: ProjectContent; revision: number; updated_by: string | null; deleted: boolean }>();
  allowed = true;
  /** Store the next upload, then fail as if the connection dropped before the answer came back. */
  dropNextAnswer = false;
  offline = false;
  remoteFor(device: string): Remote {
    const check = () => { if (this.offline) throw new TypeError('Failed to fetch'); };
    return {
      list: async () => { check(); return [...this.rows].map(([id, r]): ServerProject => ({ id, name: r.name, revision: r.revision, updated_by: r.updated_by, updated_at: '', deleted_at: r.deleted ? '2026-10-17' : null })); },
      fetch: async (ids) => { check(); return Object.fromEntries(ids.filter((id) => this.rows.has(id) && !this.rows.get(id)!.deleted).map((id) => { const r = this.rows.get(id)!; return [id, { name: r.name, revision: r.revision, content: structuredClone(r.content) }]; })); },
      push: async (id, base, name, content): Promise<PushResult> => {
        check();
        if (!this.allowed) return { status: 'paused' };
        const r = this.rows.get(id);
        let out: PushResult;
        if (!r) { this.rows.set(id, { name, content: structuredClone(content), revision: 1, updated_by: device, deleted: false }); out = { status: 'ok', revision: 1 }; }
        else if (r.deleted) out = { status: 'deleted', revision: r.revision };
        else if (base !== r.revision) out = { status: 'conflict', revision: r.revision, name: r.name, content: structuredClone(r.content), updated_by: r.updated_by, updated_at: '' };
        else { Object.assign(r, { name, content: structuredClone(content), revision: r.revision + 1, updated_by: device }); out = { status: 'ok', revision: r.revision }; }
        if (this.dropNextAnswer) { this.dropNextAnswer = false; throw new TypeError('Failed to fetch'); }
        return out;
      },
      trash: async (id) => { check(); const r = this.rows.get(id); if (r) { r.deleted = true; r.revision++; } },
      restore: async (id) => { check(); const r = this.rows.get(id); if (!r) return null; r.deleted = false; r.revision++; return r.revision; },
    };
  }
}

