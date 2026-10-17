import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectContent, PushResult, Remote, ServerProject } from './engine';

// The server's side of sync: the functions in supabase/02-sync.sql.

const fail = (error: { message?: string } | null) => { if (error) throw new Error(error.message || 'Sync failed'); };

export function supabaseRemote(c: SupabaseClient, device: string): Remote {
  return {
    async list() {
      const { data, error } = await c.rpc('sync_list');
      fail(error);
      return (data ?? []) as ServerProject[];
    },
    async fetch(ids) {
      if (!ids.length) return {};
      const out: Record<string, { name: string; revision: number; content: ProjectContent }> = {};
      // A few at a time keeps each request small (a project can be up to 2 MB).
      for (let i = 0; i < ids.length; i += 20) {
        const { data, error } = await c.from('projects').select('id, name, revision, content').in('id', ids.slice(i, i + 20)).is('deleted_at', null);
        fail(error);
        for (const r of (data ?? []) as { id: string; name: string; revision: number; content: ProjectContent }[]) out[r.id] = { name: r.name, revision: Number(r.revision), content: r.content };
      }
      return out;
    },
    async push(id, base, name, content) {
      const { data, error } = await c.rpc('push_project', { p_id: id, p_base: base, p_name: name, p_content: content, p_device: device });
      fail(error);
      const r = data as PushResult;
      if ('revision' in r) (r as { revision: number }).revision = Number(r.revision);
      return r;
    },
    async trash(id) {
      const { error } = await c.rpc('trash_project', { p_id: id, p_device: device });
      fail(error);
    },
    async restore(id) {
      const { data, error } = await c.rpc('restore_project', { p_id: id, p_device: device });
      fail(error);
      return data == null ? null : Number(data);
    },
  };
}
