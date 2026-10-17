import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectContent, PushResult, Remote, ServerProject } from './engine';
import { blobToDataUrl, dataUrlBytes, dataUrlType, photoFingerprint } from './photo';
import type { PlantPushResult, RemotePlants, ServerPlant } from './plants';

// The server's side of sync: the functions in supabase/02-sync.sql.

const fail = (error: { message?: string } | null) => { if (error) throw new Error(error.message || 'Sync failed'); };

/** Where a photo's file lives: <account>/<fingerprint>.jpg (whatever its type). */
const photoPath = (userId: string, fingerprint: string) => `${userId}/${fingerprint}.jpg`;

export function supabaseRemote(c: SupabaseClient, device: string, userId: string): Remote {
  const bucket = () => c.storage.from('photos');
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
    async trash(id, base) {
      const { data, error } = await c.rpc('trash_project', { p_id: id, p_base: base, p_device: device });
      fail(error);
      return data === 'changed' || data === 'paused' ? data : 'ok';
    },
    async restore(id) {
      const { data, error } = await c.rpc('restore_project', { p_id: id, p_device: device });
      fail(error);
      return data == null ? null : Number(data);
    },
    async reservePhoto(fingerprint, size) {
      const { data, error } = await c.rpc('reserve_photo', { p_fp: fingerprint, p_size: size });
      fail(error);
      return data === 'stored' || data === 'send' || data === 'paused' || data === 'too_big' || data === 'full' ? data : 'paused';
    },
    async putPhoto(fingerprint, dataUrl) {
      const bytes = dataUrlBytes(dataUrl);
      const { error } = await bucket().upload(photoPath(userId, fingerprint), new Blob([bytes as BlobPart], { type: dataUrlType(dataUrl) }), { contentType: dataUrlType(dataUrl), upsert: false });
      // Already there (sent before, the answer lost): the same bytes, by its name.
      if (error && !/exists|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`)) fail(error);
      fail((await c.rpc('photo_stored', { p_fp: fingerprint })).error);
    },
    async getPhoto(fingerprint) {
      const { data, error } = await bucket().download(photoPath(userId, fingerprint));
      if (error) {
        if (/not.?found|404|400/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`)) return null;
        fail(error);
      }
      if (!data) return null;
      const url = await blobToDataUrl(data);
      return (await photoFingerprint(url)) === fingerprint ? url : null; // damaged or not the photo it says: as if missing
    },
  };
}

/** The server's side of My plants sync (push_plant and plant_list in 03-photos-plants.sql). */
export function supabasePlants(c: SupabaseClient, device: string): RemotePlants {
  return {
    async plantList() {
      const { data, error } = await c.rpc('plant_list');
      fail(error);
      return ((data ?? []) as ServerPlant[]).map((r) => ({ ...r, revision: Number(r.revision) }));
    },
    async fetchPlants(ids) {
      const out: Record<string, { revision: number; plant: unknown; edited_at: string | null }> = {};
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await c.from('my_plants').select('id, revision, plant, edited_at').in('id', ids.slice(i, i + 100)).is('deleted_at', null);
        fail(error);
        for (const r of (data ?? []) as { id: string; revision: number; plant: unknown; edited_at: string | null }[]) out[r.id] = { revision: Number(r.revision), plant: r.plant, edited_at: r.edited_at };
      }
      return out;
    },
    async pushPlant(id, base, plant, edited) {
      const { data, error } = await c.rpc('push_plant', { p_id: id, p_base: base, p_plant: plant, p_edited: edited ? new Date(edited).toISOString() : null, p_device: device });
      fail(error);
      const r = data as PlantPushResult;
      if ('revision' in r && r.revision != null) (r as { revision: number }).revision = Number(r.revision);
      return r;
    },
  };
}

/** Remove photo files no project uses any more (see unused_photos in 03-photos-plants.sql). */
export async function cleanUpPhotos(c: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await c.rpc('unused_photos');
  fail(error);
  let n = 0;
  for (const fp of (data ?? []) as string[]) {
    const forgot = await c.rpc('forget_photo', { p_fp: fp });
    fail(forgot.error);
    if (!forgot.data) continue; // in use again
    const { error: rmErr } = await c.storage.from('photos').remove([photoPath(userId, fp)]);
    fail(rmErr);
    n++;
  }
  return n;
}
