// A device of this version against one still on the release, run with the release's own sync engine
// (tests/fixtures/release-engine.ts: origin/release at bdeb911, verbatim), its reading of shapes and photos, and its
// placePhoto (a synced placement of the same photo laid over its own): tests/release-device.ts. Database version 5's two
// fields (Nov 4): a photo's rough scale and the sides of a shape typed as numbers; docs/storage.md. From the
// independent review's probes.
import { describe, expect, it } from 'vitest';
import { FakeServer } from './fake-sync-server';
import { Dev, FP, sync } from './release-device';
import type { Shape } from '../src/types';

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
