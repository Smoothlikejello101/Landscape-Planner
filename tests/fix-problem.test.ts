import { describe, expect, it } from 'vitest';
import { apartAt, crowdingOf, roomAt } from '../src/crowding';
import { bedWidth, moverOf, nudgeApart, sameSpecies, smallerForms, sourcedWidth, widerThanBed } from '../src/fix-problem';
import { bedOf } from '../src/beds';
import type { Plant } from '../src/plants';
import type { CircleShape, Shape } from '../src/types';

// Fix from the problem (Jason's UI review, Nov 2): Nudge apart, and smaller forms of the same plant first. Nothing but
// the plan and sourced catalog facts.

const byId: Record<string, Plant> = {
  shrub: { id: 'shrub', common: 'Shrub', form: 'Shrub', width: { min: 3, max: 5, med: 4 } } as Plant,
  small: { id: 'small', common: 'Small', form: 'Perennial', width: { min: 1, max: 3, med: 2 } } as Plant,
  // With heights: a 60 ft oak (its crown from 20 ft) and a 30 ft wax myrtle, which reaches 10 ft into it (a third of its own).
  oakH: { id: 'oakH', common: 'White oak', form: 'Tree', width: { min: 60, max: 80, med: 70 }, height: { min: 50, max: 70, med: 60 } } as Plant,
  bigShrub: { id: 'bigShrub', common: 'Wax myrtle', form: 'Shrub', width: { min: 15, max: 25, med: 20 }, height: { min: 20, max: 40, med: 30 } } as Plant,
};
const base = { color: '#16a34a', opacity: 0.65, locked: false };
const p = (id: string, x: number, extra: Partial<CircleShape> = {}): Shape =>
  ({ ...base, id, type: 'circle', x, y: 0, radius: 2, role: 'plant', label: id, plantId: 'shrub', ...extra } as Shape);
const bed = (id: string, x: number, y: number, width: number, height: number): Shape =>
  ({ ...base, id, type: 'rect', x, y, width, height, rotation: 0, role: 'bed', label: id } as Shape);
const at = (s: Shape, shapes: Shape[]) => shapes.find((x) => x.id === s.id)!;
/** The plan with the nudge made. */
function after(shapes: Shape[], r: ReturnType<typeof nudgeApart>): Shape[] {
  if (!r.ok) return shapes;
  return shapes.map((s) => (s.id === r.mover.id ? { ...s, x: r.to.x, y: r.to.y } : s));
}

describe('Nudge apart', () => {
  it('moves the newer plant along the line between them, just far enough that their typical circles no longer overlap', () => {
    // Two 4 ft shrubs 2 ft apart: they touch at 4 ft.
    const a = p('a', 0), b = p('b', 2, { y: 0 });
    const shapes = [a, b];
    const r = nudgeApart(a, b, shapes, byId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mover.id).toBe('b'); // (the newer: later in the plan)
    expect(r.to.y).toBe(0); // (along the line)
    expect(r.to.x).toBeGreaterThanOrEqual(4);
    expect(r.to.x).toBeLessThan(4.05); // (just far enough)
    const moved = after(shapes, r);
    expect(crowdingOf(at(b, moved), moved, byId, { close: true })).toEqual([]);
    // Their typical circles no longer overlap.
    expect(Math.hypot(r.to.x - a.x, r.to.y - a.y)).toBeGreaterThanOrEqual(2 + 2);
    expect(r.by).toBeCloseTo(2.01, 5);
  });
  it('moves the selected one when asked, along a slanted line too', () => {
    const a = p('a', 0), b = p('b', 1, { y: 1 });
    const r = nudgeApart(a, b, [a, b], byId, { prefer: 'a' });
    expect(r.ok && r.mover.id).toBe('a');
    if (!r.ok) return;
    // Away from b, on the line through both: down and to the left, as far one way as the other.
    expect(r.to.x).toBeCloseTo(r.to.y, 9);
    expect(r.to.x).toBeLessThan(0);
    expect(Math.hypot(r.to.x - 1, r.to.y - 1)).toBeGreaterThanOrEqual(4);
  });
  it('uses the spacing the warning gives: less where one grows partly under a tree’s raised crown', () => {
    const oak = p('oak', 0, { plantId: 'oakH', radius: 35 }), myrtle = p('myrtle', 10, { plantId: 'bigShrub', radius: 10 });
    const need = apartAt(oak, myrtle, [oak, myrtle], byId)!;
    expect(need).toBeCloseTo((35 + 10) / 3, 9); // (a third of its height in the oak's crown: a third of the usual spacing)
    const r = nudgeApart(oak, myrtle, [oak, myrtle], byId);
    expect(r.ok && r.mover.id).toBe('myrtle');
    if (r.ok) expect(r.to.x).toBeGreaterThanOrEqual(need);
    // Already that far apart: nothing to do.
    const far = p('far', 16, { plantId: 'bigShrub', radius: 10 });
    expect(nudgeApart(oak, far, [oak, far], byId)).toMatchObject({ ok: false, why: 'apart' });
  });
  it('stays inside its bed: room in the bed, it moves; none, it says so and nothing moves', () => {
    const roomy = bed('Front bed', -5, -5, 20, 10);
    const a = p('a', 0), b = p('b', 2);
    const ok = nudgeApart(a, b, [roomy, a, b], byId);
    expect(ok.ok).toBe(true);
    const moved = after([roomy, a, b], ok);
    expect(bedOf(at(b, moved), moved)?.id).toBe('Front bed');
    // A bed whose edge is 3 ft from b: the 4 ft it needs takes it out of the bed.
    const tight = bed('Narrow bed', -5, -5, 8, 10);
    const no = nudgeApart(a, b, [tight, a, b], byId);
    expect(no).toMatchObject({ ok: false, why: 'bed' });
    if (!no.ok) expect(no.bed?.id).toBe('Narrow bed');
    // Not in a bed, it isn't pushed into one either.
    const beside = bed('Next bed', 1, -5, 10, 10);
    const c = p('c', 0), d = p('d', -2);
    expect(nudgeApart(c, d, [beside, c, d], byId, { prefer: 'c' })).toMatchObject({ ok: false, why: 'bed' });
  });
  it('never into a third plant: none it wasn’t close to, and none closer than it was', () => {
    // b would land at 4, 1 ft from c at 5: crowding c, which it wasn't close to before.
    const a = p('a', 0), b = p('b', 2), c = p('c', 5.5, { plantId: 'small', radius: 1 });
    const into = nudgeApart(a, b, [a, b, c], byId);
    expect(into).toMatchObject({ ok: false, why: 'plant' });
    if (!into.ok) expect(into.third?.id).toBe('c');
    // c already close to b, and the nudge goes toward it: still no.
    const c2 = p('c2', 4.5, { plantId: 'small', radius: 1 });
    expect(crowdingOf(b, [a, b, c2], byId, { close: true }).map((x) => x.other.id)).toContain('c2');
    expect(nudgeApart(a, b, [a, b, c2], byId)).toMatchObject({ ok: false, why: 'plant' });
    // c close to b but behind it (the nudge goes away from it): fine.
    const c3 = p('c3', 0.5, { y: 2.5, plantId: 'small', radius: 1 });
    const away = nudgeApart(c3, b, [c3, b], byId, { prefer: 'b' });
    expect(away.ok).toBe(true);
    // A pair left close on purpose counts too: not pushed into it.
    const d = p('d', 5.5, { plantId: 'small', radius: 1, crowdOk: ['b'] });
    expect(nudgeApart(a, b, [a, b, d], byId)).toMatchObject({ ok: false, why: 'plant' });
  });
  it('a locked plant, or one already in the ground, stays: the other moves; neither can, and it says so', () => {
    const a = p('a', 0), b = p('b', 2, { locked: true });
    expect(moverOf(a, b, [a, b])?.[0].id).toBe('a');
    const r = nudgeApart(a, b, [a, b], byId);
    expect(r.ok && r.mover.id).toBe('a');
    const old = p('old', 2, { status: 'existing' });
    expect(nudgeApart(a, old, [a, old], byId)).toMatchObject({ ok: true, mover: { id: 'a' } });
    const l2 = p('l2', 0, { locked: true });
    expect(nudgeApart(l2, b, [l2, b], byId)).toEqual({ ok: false, why: 'fixed' });
  });
  it('two on one spot: east first, then round the compass', () => {
    const a = p('a', 0), b = p('b', 0);
    const r = nudgeApart(a, b, [a, b], byId);
    expect(r.ok && r.to.x).toBeGreaterThanOrEqual(4);
    // East blocked by a third plant: west.
    const c = p('c', 5, { plantId: 'small', radius: 1 });
    const w = nudgeApart(a, b, [a, b, c], byId);
    expect(w.ok && w.to.x).toBeLessThanOrEqual(-4);
  });
});

describe('the room a plant has where it stands (Swap: a width that fits)', () => {
  it('is the widest typical spread that would be close to no neighbor', () => {
    const s = p('s', 0), n1 = p('n1', 5), n2 = p('n2', -4, { plantId: 'small', radius: 1 });
    const room = roomAt(s, [s, n1, n2], byId)!;
    // n1: 5 − 2 = 3 ft of radius, 6 across; n2: 4 − 1 = 3, 6 across; the first found of the two.
    expect(room.width).toBeCloseTo(6, 9);
    const n3 = p('n3', 3, { plantId: 'small', radius: 1 });
    expect(roomAt(s, [s, n1, n2, n3], byId)).toMatchObject({ width: 4, by: { id: 'n3' } });
    // One left close on purpose doesn't count.
    expect(roomAt(p('s', 0, { crowdOk: ['n3'] }), [s, n3], byId)).toBeNull();
  });
});

const SOURCES = { compendium: { title: 'earlier list', trust: 'unverified' }, ncsu: { title: 'NC State', trust: 'authority' }, nursery: { title: 'A nursery', trust: 'nursery' } };
const sized = (id: string, common: string, botanical: string, med: number | null, src: string[] = ['ncsu'], extra: Partial<Plant> = {}): Plant =>
  ({ id, common, botanical, ...(med != null ? { width: { min: med - 1, max: med + 1, med } } : {}), prov: med != null ? { width: { src } } : {}, ...extra } as Plant);
const russianSage = sized('salvia-yangii-2', 'Russian Sage', 'Salvia yangii', 3);
const CATALOG: Plant[] = [
  russianSage,
  sized('salvia-yangii', "Russian sage 'Denim 'n Lace'", 'Salvia yangii', 2.5, ['nursery']),
  sized('bjb', "Russian sage 'Blue Jean Baby'", "Salvia yangii 'Blue Jean Baby'", 2),
  sized('little-spire', "Russian sage 'Little Spire'", 'Salvia yangii', 1.5, ['ncsu'], { parent: 'salvia-yangii-2', botanical: undefined }),
  sized('big-one', "Russian sage 'Big'", 'Salvia yangii', 4), // (bigger: not offered)
  sized('earlier', "Russian sage 'Unchecked'", 'Salvia yangii', 1, ['compendium']), // (the earlier list's size alone)
  sized('nosize', "Russian sage 'No size'", 'Salvia yangii', null),
  { ...sized('unknown', "Russian sage 'Looked up'", 'Salvia yangii', 1), prov: { width: { src: ['ncsu'], unknown: true } } } as Plant,
  sized('salvia-nemorosa', 'Woodland sage', 'Salvia nemorosa', 1.5), // (the same genus, another species: never)
  sized('lavender', 'Lavender', 'Lavandula angustifolia', 1), // ("plants like this": never)
  sized('u-mine', "My sage 'Tiny'", 'Salvia yangii', 1, ['ncsu']), // (a plant of my own: not the catalog's word)
];

describe('smaller forms of the same plant (Russian sage → a compact cultivar)', () => {
  it('only the same species: its own cultivars and records, never a genus mate or a look-alike', () => {
    expect(sameSpecies(russianSage, CATALOG[1])).toBe(true); // (by botanical name)
    expect(sameSpecies(russianSage, CATALOG[2])).toBe(true); // (a cultivar's name)
    expect(sameSpecies(russianSage, CATALOG[3])).toBe(true); // (its parent, with no botanical name)
    const index = Object.fromEntries(CATALOG.map((x) => [x.id, x]));
    expect(sameSpecies(CATALOG[1], CATALOG[3], index)).toBe(true); // (by its parent's botanical name)
    expect(sameSpecies(russianSage, CATALOG[8])).toBe(false);
    expect(sameSpecies(russianSage, CATALOG[9])).toBe(false);
    const hostaA = sized('ha', "Hosta 'Halcyon'", "Hosta 'Halcyon'", 2), hostaB = sized('hb', "Hosta 'June'", "Hosta 'June'", 1);
    expect(sameSpecies(hostaA, hostaB)).toBe(false); // (a genus alone says nothing of the species)
    expect(sameSpecies(russianSage, russianSage)).toBe(false);
  });
  it('only sourced sizes: not the earlier list alone, not one looked up and unknown, not inherited', () => {
    expect(sourcedWidth(CATALOG[1], SOURCES)).toBe(2.5);
    expect(sourcedWidth(CATALOG[5], SOURCES)).toBeNull();
    expect(sourcedWidth(CATALOG[6], SOURCES)).toBeNull();
    expect(sourcedWidth(CATALOG[7], SOURCES)).toBeNull();
    expect(sourcedWidth({ ...CATALOG[2], prov: { width: { src: ['ncsu'], inherited: true } } } as Plant, SOURCES)).toBeNull();
  });
  it('smaller than it, smallest first; those that fit the room marked so', () => {
    const forms = smallerForms(russianSage, CATALOG, 2, SOURCES);
    expect(forms.map((x) => [x.plant.id, x.width, x.fits])).toEqual([
      ['little-spire', 1.5, true], ['bjb', 2, true], ['salvia-yangii', 2.5, false],
    ]);
    // No room given: each fits as far as anything says.
    expect(smallerForms(russianSage, CATALOG, null, SOURCES).every((x) => x.fits)).toBe(true);
    // From a smaller form, only the smaller ones still.
    expect(smallerForms(CATALOG[1], CATALOG, null, SOURCES).map((x) => x.plant.id)).toEqual(['little-spire', 'bjb']);
  });
  it('none where the plant’s own size has no source: smaller than what isn’t known is a guess', () => {
    const unsourced = { ...russianSage, prov: { width: { src: ['compendium'] } } } as Plant;
    expect(smallerForms(unsourced, CATALOG, null, SOURCES)).toEqual([]);
  });
});

describe('a plant wider than its bed', () => {
  it('a bed’s width is the widest circle that fits in it', () => {
    expect(bedWidth(bed('strip', 0, 0, 20, 3))).toBe(3);
    expect(bedWidth({ ...base, id: 'round', type: 'circle', x: 0, y: 0, radius: 4, role: 'bed', label: '' } as Shape)).toBe(8);
    // An L of two 3 ft arms: a little more than 3 ft at its corner, where a circle reaches into both arms (3.51 ft).
    const ell = { ...base, id: 'ell', type: 'poly', x: 0, y: 0, rotation: 0, role: 'bed', label: '', points: [[0, 0], [12, 0], [12, 3], [3, 3], [3, 12], [0, 12]] } as Shape;
    const w = bedWidth(ell);
    expect(w).toBeGreaterThan(3.48);
    expect(w).toBeLessThan(3.54);
  });
  it('is said for a plant whose typical spread is wider than its bed, not a tree, nor one that fits', () => {
    const strip = bed('Strip', 0, 0, 20, 3);
    const s = p('s', 5, { y: 1.5 });
    expect(widerThanBed(s, [strip, s], byId)).toMatchObject({ bed: { id: 'Strip' }, width: 3, spread: 4 });
    const fits = p('f', 5, { y: 1.5, plantId: 'small', radius: 1 });
    expect(widerThanBed(fits, [strip, fits], byId)).toBeNull();
    const tree = p('t', 5, { y: 1.5, plantId: 'oakH', radius: 35 });
    expect(widerThanBed(tree, [strip, tree], byId)).toBeNull();
    const out = p('o', 5, { y: 10 });
    expect(widerThanBed(out, [strip, out], byId)).toBeNull();
  });
});
