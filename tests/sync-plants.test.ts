import { describe, expect, it } from 'vitest';
import type { PlantChange } from '../src/my-plants';
import type { Plant } from '../src/plants';
import { fingerprint, type SyncRecord } from '../src/sync/engine';
import { syncPlants, type LocalPlants, type RemotePlants } from '../src/sync/plants';
import { FakePlantServer } from './fake-sync-server';

// My plants sync against a stand-in server (the same rules as push_plant in
// supabase/03-photos-plants.sql) and stand-in devices with their own clocks.

const hash = (p: Plant) => fingerprint('', p as unknown as Record<string, unknown>);
const plant = (id: string, common: string): Plant => ({ id, common, width: { min: 2, max: 3, med: 2.5 } });
class Device implements LocalPlants {
  lib = new Map<string, Plant>();
  recs: Record<string, SyncRecord> = {};
  times: Record<string, number> = {};
  clock = 1_000_000;
  /** Something the user does while sync waits on the server. */
  during: (() => void) | null = null;
  tick() { return (this.clock += 1000); }
  save(p: Plant) { this.lib.set(p.id, p); this.times[p.id] = this.tick(); }
  del(id: string) { this.lib.delete(id); this.times[id] = this.tick(); }
  names() { return [...this.lib.values()].map((p) => p.common).sort(); }
  plants() { return [...this.lib.values()].map((p) => ({ id: p.id, plant: p, hash: hash(p), edited: this.times[p.id] ?? 0 })); }
  records() { return { ...this.recs }; }
  edited(id: string) { return this.times[id] ?? 0; }
  async apply(changes: PlantChange[]) {
    this.during?.(); this.during = null;
    const done: string[] = [];
    for (const c of changes) {
      if (c.expect !== undefined) { const h = this.lib.has(c.id) ? hash(this.lib.get(c.id)!) : null; if (h !== c.expect) continue; }
      if (c.plant) this.lib.set(c.id, c.plant); else if (c.plant === null) this.lib.delete(c.id);
      if (c.edited !== undefined) this.times[c.id] = c.edited;
      if (c.record) this.recs[c.id] = c.record; else if (c.record === null) delete this.recs[c.id];
      done.push(c.id);
    }
    return done;
  }
  normalize(raw: unknown) { const p = raw as Plant; return p && typeof p.id === 'string' ? { plant: p, hash: hash(p) } : null; }
}
const sync = (d: Device, s: FakePlantServer, remote: RemotePlants = s.remote()) => syncPlants(d, remote);

describe('My plants sync', () => {
  it('plants added on two devices end up on both', async () => {
    const server = new FakePlantServer(), phone = new Device(), laptop = new Device();
    phone.save(plant('u-a', 'Aster')); laptop.save(plant('u-b', 'Bee balm'));
    await sync(phone, server); await sync(laptop, server); await sync(phone, server);
    expect(phone.names()).toEqual(['Aster', 'Bee balm']);
    expect(laptop.names()).toEqual(['Aster', 'Bee balm']);
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, downloaded: 0 });
  });

  it('an edit reaches the other device', async () => {
    const server = new FakePlantServer(), phone = new Device(), laptop = new Device();
    phone.save(plant('u-a', 'Aster'));
    await sync(phone, server); await sync(laptop, server);
    phone.save(plant('u-a', 'Aromatic aster'));
    await sync(phone, server);
    expect(await sync(laptop, server)).toMatchObject({ downloaded: 1 });
    expect(laptop.names()).toEqual(['Aromatic aster']);
  });

  it('edited on both: the later edit wins, whichever syncs first', async () => {
    for (const first of ['earlier', 'later'] as const) {
      const server = new FakePlantServer(), phone = new Device(), laptop = new Device();
      phone.save(plant('u-a', 'Aster'));
      await sync(phone, server); await sync(laptop, server);
      laptop.clock = phone.clock;
      phone.save(plant('u-a', 'Earlier edit'));
      laptop.clock = phone.clock + 5000;
      laptop.save(plant('u-a', 'Later edit'));
      const order = first === 'earlier' ? [phone, laptop] : [laptop, phone];
      for (const d of [...order, ...order]) await sync(d, server);
      expect(phone.names()).toEqual(['Later edit']);
      expect(laptop.names()).toEqual(['Later edit']);
    }
  });

  it('deleted on one device leaves the other, unless edited there afterwards', async () => {
    const server = new FakePlantServer(), phone = new Device(), laptop = new Device();
    phone.save(plant('u-a', 'Aster')); phone.save(plant('u-b', 'Bee balm'));
    await sync(phone, server); await sync(laptop, server);
    phone.del('u-a'); phone.del('u-b');
    laptop.clock = phone.clock + 5000;
    laptop.save(plant('u-b', 'Bee balm, still wanted'));
    await sync(phone, server);
    const r = await sync(laptop, server);
    expect(r.removed).toBe(1);
    expect(laptop.names()).toEqual(['Bee balm, still wanted']);
    await sync(phone, server);
    expect(phone.names()).toEqual(['Bee balm, still wanted']); // back on the phone too
  });

  it('deleted here, but edited on another device later: it comes back', async () => {
    const server = new FakePlantServer(), phone = new Device(), laptop = new Device();
    phone.save(plant('u-a', 'Aster'));
    await sync(phone, server); await sync(laptop, server);
    phone.del('u-a');
    laptop.clock = phone.clock + 5000;
    laptop.save(plant('u-a', 'Aster, edited'));
    await sync(laptop, server);
    await sync(phone, server);
    expect(phone.names()).toEqual(['Aster, edited']);
  });

  it('a device’s first sync only adds: nothing it has is removed', async () => {
    const server = new FakePlantServer(), phone = new Device();
    phone.save(plant('u-a', 'Aster'));
    server.rows.set('u-a', { plant: plant('u-a', 'Aster'), revision: 3, edited_at: new Date(9e12).toISOString(), deleted_at: new Date().toISOString() });
    await sync(phone, server);
    expect(phone.names()).toEqual(['Aster']);
    expect(server.rows.get('u-a')!.deleted_at).toBeNull();
  });

  it('an edit made while sync works is never overwritten', async () => {
    const server = new FakePlantServer(), phone = new Device(), laptop = new Device();
    phone.save(plant('u-a', 'Aster'));
    await sync(phone, server); await sync(laptop, server);
    phone.save(plant('u-a', 'From phone')); await sync(phone, server);
    laptop.clock = phone.clock + 5000;
    laptop.during = () => laptop.save(plant('u-a', 'Laptop, mid-sync'));
    await sync(laptop, server);
    expect(laptop.names()).toEqual(['Laptop, mid-sync']);
    await sync(laptop, server); await sync(phone, server);
    expect(phone.names()).toEqual(['Laptop, mid-sync']); // the later edit
  });

  it('a lost answer: nothing duplicated, nothing lost', async () => {
    const server = new FakePlantServer(), phone = new Device();
    phone.save(plant('u-a', 'Aster'));
    server.dropNextAnswer = true;
    expect((await sync(phone, server)).failed).toHaveLength(1);
    expect(await sync(phone, server)).toMatchObject({ uploaded: 0, failed: [] });
    expect(phone.recs['u-a']).toMatchObject({ revision: 1 });
  });

  it('a lapsed plan: nothing moves', async () => {
    const server = new FakePlantServer(), phone = new Device();
    phone.save(plant('u-a', 'Aster'));
    server.allowed = false;
    expect(await sync(phone, server)).toMatchObject({ paused: true, uploaded: 0 });
    expect(phone.names()).toEqual(['Aster']);
  });
});
