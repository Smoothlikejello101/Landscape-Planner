// Syncing the My plants library: one record per plant, so plants added on two
// devices never conflict. A plant changed on two devices keeps the later edit
// (by when it was made, not when it synced); a plant deleted on one device
// leaves the others unless it was edited there later. A device's first sync
// only adds: it never removes a plant the server hasn't seen it sync.

import type { PlantChange } from '../my-plants';
import type { Plant } from '../plants';
import type { SyncRecord } from './engine';

export interface LocalPlant { id: string; plant: Plant; hash: string; edited: number }
/** This device's library. */
export interface LocalPlants {
  plants(): LocalPlant[];
  records(): Record<string, SyncRecord>;
  /** When a plant was last edited or deleted here (ms; 0 if unknown). */
  edited(id: string): number;
  /** Apply changes (each skipped if its plant changed since sync read it). */
  apply(changes: PlantChange[]): Promise<string[]>;
  /** A downloaded plant, checked as any import is; null if unusable. */
  normalize(raw: unknown): { plant: Plant; hash: string } | null;
}
export interface ServerPlant { id: string; revision: number; edited_at: string | null; deleted_at: string | null }
export type PlantPushResult =
  | { status: 'ok'; revision: number | null }
  | { status: 'conflict'; revision: number; plant: unknown; edited_at: string | null; deleted_at: string | null }
  | { status: 'paused' }
  | { status: 'full' };
/** The server's side. */
export interface RemotePlants {
  plantList(): Promise<ServerPlant[]>;
  fetchPlants(ids: string[]): Promise<Record<string, { revision: number; plant: unknown; edited_at: string | null }>>;
  /** Upload a plant, or (plant null) its deletion; `edited`: when it was made here (ms). */
  pushPlant(id: string, base: number | null, plant: Plant | null, edited: number): Promise<PlantPushResult>;
}
export interface PlantReport { uploaded: number; downloaded: number; removed: number; failed: { name: string; message: string }[]; paused: boolean; full: boolean }

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);
const FAILS_IN_A_ROW = 3;

export async function syncPlants(local: LocalPlants, remote: RemotePlants): Promise<PlantReport> {
  const report: PlantReport = { uploaded: 0, downloaded: 0, removed: 0, failed: [], paused: false, full: false };
  const server = new Map((await remote.plantList()).map((s) => [s.id, s]));
  const mine = new Map(local.plants().map((p) => [p.id, p]));
  const records = local.records();
  const changes: PlantChange[] = [];
  /** id → why it comes down (and what it must still be here: its fingerprint then, or null if absent). */
  const toFetch = new Map<string, { expect: string | null; compare?: LocalPlant; deletedHere?: boolean }>();
  /** Uploads: a plant, or a deletion (plant null). */
  const toPush: { id: string; base: number | null; p: LocalPlant | null }[] = [];

  for (const p of mine.values()) {
    const rec = records[p.id];
    const s = server.get(p.id);
    const changed = !rec || rec.hash !== p.hash;
    if (!s) toPush.push({ id: p.id, base: null, p });
    else if (s.deleted_at) {
      // Deleted elsewhere: it goes, unless this device never synced it, or edited it later.
      if (!rec || (changed && p.edited > time(s.edited_at))) toPush.push({ id: p.id, base: s.revision, p });
      else { changes.push({ id: p.id, plant: null, expect: p.hash, record: null, edited: time(s.deleted_at) }); report.removed++; }
    } else if (rec && rec.revision === s.revision) {
      if (changed) toPush.push({ id: p.id, base: rec.revision, p });
    } else if (rec && !changed) toFetch.set(p.id, { expect: p.hash });
    else toFetch.set(p.id, { expect: p.hash, compare: p }); // changed on both (or never synced from here): compare
  }
  // Deleted here since the last sync.
  for (const [id, rec] of Object.entries(records)) {
    if (mine.has(id)) continue;
    const s = server.get(id);
    if (!s || s.deleted_at) changes.push({ id, record: null });
    else if (s.revision === rec.revision || local.edited(id) > time(s.edited_at)) toPush.push({ id, base: s.revision, p: null });
    else toFetch.set(id, { expect: null, deletedHere: true }); // edited elsewhere after: it comes back
  }
  // New elsewhere.
  for (const s of server.values()) if (!s.deleted_at && !mine.has(s.id) && !(s.id in records)) toFetch.set(s.id, { expect: null });

  let failsInARow = 0;
  const attempt = async (name: string, step: () => Promise<void>) => {
    try { await step(); failsInARow = 0; } catch (e) {
      report.failed.push({ name, message: e instanceof Error ? e.message : String(e) });
      if (++failsInARow >= FAILS_IN_A_ROW) throw e;
    }
  };

  // Downloads (and the comparisons).
  if (toFetch.size) {
    const got = await remote.fetchPlants([...toFetch.keys()]);
    for (const [id, why] of toFetch) {
      const g = got[id];
      if (!g) continue;
      const n = local.normalize(g.plant);
      if (!n) continue; // damaged on the server: leave it
      const record = { revision: g.revision, hash: n.hash };
      if (why.compare) {
        if (n.hash === why.compare.hash) { changes.push({ id, record }); continue; }
        if (why.compare.edited > time(g.edited_at)) { toPush.push({ id, base: g.revision, p: why.compare }); continue; }
      }
      changes.push({ id, plant: n.plant, expect: why.expect, record, edited: time(g.edited_at) });
      report.downloaded++;
    }
  }
  // Uploads.
  for (const u of toPush) {
    if (report.paused) break;
    await attempt(u.p?.plant.common ?? 'a deleted plant', async () => {
      const edited = u.p ? u.p.edited : local.edited(u.id);
      let res = await remote.pushPlant(u.id, u.base, u.p?.plant ?? null, edited);
      if (res.status === 'conflict') {
        // The server moved on since this pass looked: the later edit wins.
        if (edited > time(res.edited_at)) res = await remote.pushPlant(u.id, res.revision, u.p?.plant ?? null, edited);
        else {
          const n = res.deleted_at ? null : local.normalize(res.plant);
          if (res.deleted_at || n) {
            changes.push({ id: u.id, plant: n?.plant ?? null, expect: u.p?.hash ?? null, record: n ? { revision: res.revision, hash: n.hash } : null, edited: time(res.edited_at) });
            report.downloaded++;
          }
          return;
        }
      }
      if (res.status === 'ok') {
        changes.push({ id: u.id, record: u.p && res.revision != null ? { revision: res.revision, hash: u.p.hash } : null });
        report.uploaded++;
      } else if (res.status === 'paused') report.paused = true;
      else if (res.status === 'full') report.full = true;
    });
  }
  if (changes.length) await local.apply(changes);
  return report;
}
