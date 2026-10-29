import { describe, expect, it } from 'vitest';
import type { Plant } from '../src/plants';
import type { CircleShape, Shape } from '../src/types';
import { crowdingOf } from '../src/crowding';
import { withLocalParts } from '../src/sync/engine';
import { arborCover, isVine, offerFor, strandedVines, supportFrom, supportOf, supportsNear, vineBand, vinesFor, VINE_BASE_RADIUS } from '../src/vines';
import { latticePath, slatsPath } from '../src/structures';
import { kindOfShape } from '../src/kinds';

// Vines on what they climb (Jason, Oct 28–29): a band along a fence, a wall or a tree's crown, offered when the
// vine's base is close (3 ft from a trunk's edge, 2 ft from a line), never a shrub; a groundcover otherwise.

const byId: Record<string, Plant> = {
  jessamine: { id: 'jessamine', common: 'Carolina jessamine', form: 'Vine', width: { min: 20, max: 30, med: 25 }, height: { med: 15 } } as Plant,
  maple: { id: 'maple', common: 'Red maple', form: 'Tree', width: { med: 40 }, height: { med: 50 } } as Plant,
  holly: { id: 'holly', common: 'Yaupon', form: 'Shrub', width: { med: 8 }, height: { med: 10 } } as Plant,
  aster: { id: 'aster', common: 'Aster', form: 'Perennial', width: { med: 2 }, height: { med: 2 } } as Plant,
};
const circle = (id: string, plantId: string, x: number, y: number, radius: number, extra: Partial<CircleShape> = {}): CircleShape =>
  ({ id, type: 'circle', role: 'plant', plantId, x, y, radius, color: '#16a34a', label: '', opacity: 0.65, locked: false, ...extra });
const fence = (id: string, pts: [number, number][], label = 'Fence'): Shape =>
  ({ id, type: 'line', role: 'boundary', x: 0, y: 0, points: pts, color: '#44403c', label, opacity: 1, locked: false } as unknown as Shape);

describe('what a vine climbs', () => {
  const maple = circle('m', 'maple', 0, 0, 20); // (trunk 2 ft across by the rule of thumb: its edge 1 ft out)
  const back = fence('f', [[-50, 10], [50, 10]]);

  it('knows a vine by its form, and measures from its base to a trunk\'s edge or a line\'s nearest point', () => {
    expect(isVine(circle('v', 'jessamine', 0, 0, 12.5), byId)).toBe(true);
    expect(isVine(circle('a', 'aster', 0, 0, 1), byId)).toBe(false);
    const t = supportFrom(maple, { x: 4, y: 0 }, byId)!;
    expect(t.kind).toBe('tree');
    expect(t.dist).toBeCloseTo(3);
    expect(t.at).toEqual({ x: 1, y: 0 });
    const f = supportFrom(back, { x: 5, y: 8.5 }, byId)!;
    expect(f.kind).toBe('line');
    expect(f.at.x).toBeCloseTo(5);
    expect(f.at.y).toBeCloseTo(10);
    expect(f.dist).toBeCloseTo(1.5);
    // (Not a property line, a path or a dimension.)
    expect(supportFrom(fence('p', [[-50, 10], [50, 10]], 'Property line'), { x: 0, y: 9 }, byId)).toBeNull();
  });

  it('offers a tree within 3 ft of its trunk, a line within 2 ft, never a shrub; one set to none by hand, never', () => {
    const shapes = (v: CircleShape, ...more: Shape[]) => [maple, back, ...more, v];
    expect(offerFor(circle('v', 'jessamine', 3.9, 0, 12.5), shapes(circle('v', 'jessamine', 3.9, 0, 12.5)), byId)?.shape.id).toBe('m');
    const far = circle('v', 'jessamine', 4.5, -9, 12.5);
    expect(offerFor(far, shapes(far), byId)).toBeNull(); // (8.6 ft from the trunk's edge, 19 from the fence)
    const byFence = circle('v', 'jessamine', 30, 8.2, 12.5);
    expect(offerFor(byFence, shapes(byFence), byId)?.shape.id).toBe('f');
    const nearShrub = circle('v', 'jessamine', 30, -20, 12.5);
    const holly = circle('h', 'holly', 30, -22, 4);
    expect(offerFor(nearShrub, shapes(nearShrub, holly), byId)).toBeNull();
    expect(supportsNear(nearShrub, shapes(nearShrub, holly), byId).map((s) => s.shape.id)).toContain('h'); // (pickable by hand)
    const decided = circle('v', 'jessamine', 3.9, 0, 12.5, { climbsOn: '' });
    expect(offerFor(decided, shapes(decided), byId)).toBeNull();
    // A tree placed by a groundcover vine: offered to it.
    const vine = circle('v', 'jessamine', 3.9, 0, 12.5);
    expect(vinesFor(maple, [maple, vine], byId).map((v) => v.id)).toEqual(['v']);
  });

  it('draws it along a line as long as its spread, around a corner, stopping at the line\'s end', () => {
    const v = circle('v', 'jessamine', 5, 9, 12.5, { climbsOn: 'f' });
    const sup = supportOf(v, [back, v], byId)!;
    const { band, connector } = vineBand(v, sup);
    expect(band[0].x).toBeCloseTo(-7.5);
    expect(band.at(-1)!.x).toBeCloseTo(17.5);
    expect(band.every((p) => Math.abs(p.y - 10) < 1e-9)).toBe(true);
    expect(connector[1].x).toBeCloseTo(5);
    expect(connector[1].y).toBeCloseTo(10);
    const corner = fence('c', [[0, 0], [10, 0], [10, 30]]);
    const atCorner = circle('w', 'jessamine', 8, -1, 12.5, { climbsOn: 'c' });
    const b2 = vineBand(atCorner, supportOf(atCorner, [corner, atCorner], byId)!).band;
    expect(b2[0]).toEqual({ x: 0, y: 0 }); // (the line ends 8 ft back)
    expect(b2.some((p) => Math.hypot(p.x - 10, p.y) < 1e-9)).toBe(true); // (around the corner)
    expect(b2.at(-1)!.x).toBeCloseTo(10);
    expect(b2.at(-1)!.y).toBeCloseTo(10.5); // (12.5 ft on: 2 to the corner, 10.5 up)
  });

  it('draws it on a tree as an arc on the crown toward it, no more than half the crown', () => {
    const v = circle('v', 'jessamine', 0, 3, 12.5, { climbsOn: 'm' });
    const { band, connector } = vineBand(v, supportOf(v, [maple, v], byId)!);
    expect(connector[1]).toEqual({ x: 0, y: 1 }); // (to the trunk's edge, up it…)
    expect(connector[2].x).toBeCloseTo(0);
    expect(connector[2].y).toBeCloseTo(18.4); // (…and out to just inside the crown's edge, toward the vine)
    for (const p of band) expect(Math.hypot(p.x, p.y)).toBeCloseTo(18.4);
    const arc = Math.atan2(band.at(-1)!.y, band.at(-1)!.x) - Math.atan2(band[0].y, band[0].x);
    expect(arc * 20).toBeCloseTo(25, 0); // (its spread, along the crown)
  });

  it('a vine whose support is gone or moved out of its reach is a groundcover again', () => {
    const v = circle('v', 'jessamine', 3.9, 0, 12.5, { climbsOn: 'm' });
    expect(strandedVines([maple, v], byId)).toEqual([]);
    expect(strandedVines([{ ...maple, x: 40 }, v], byId).map((x) => x.id)).toEqual(['v']);
    expect(strandedVines([v], byId).map((x) => x.id)).toEqual(['v']);
    expect(supportOf(v, [v], byId)).toBeNull();
  });

  it('crowds, climbing, only around its base', () => {
    const v = circle('v', 'jessamine', 3.9, 0, 12.5, { climbsOn: 'm' });
    const aster = circle('a', 'aster', 5, 0, 1);
    expect(crowdingOf(aster, [maple, v, aster], byId).map((c) => c.other.id)).toEqual(['v']); // (1.1 ft from its base)
    const farther = circle('a', 'aster', 9, 0, 1);
    expect(crowdingOf(farther, [maple, v, farther], byId)).toEqual([]); // (as a groundcover patch, 12.5 ft across, it would)
    expect(crowdingOf(farther, [maple, { ...v, climbsOn: undefined }, farther], byId).map((c) => c.other.id)).toEqual(['v']);
    expect(VINE_BASE_RADIUS).toBe(1);
  });

  it("keeps what a vine climbs through an older version's sync, which drops it; none set by hand ('') stays none", () => {
    const v = (climbsOn?: string) => circle('v', 'jessamine', 3.9, 0, 12.5, climbsOn === undefined ? {} : { climbsOn });
    expect(withLocalParts({ shapes: [v()] }, { shapes: [v('m')] }).shapes).toEqual([v('m')]);
    expect(withLocalParts({ shapes: [v('')] }, { shapes: [v('m')] }).shapes).toEqual([v('')]);
    expect(withLocalParts({ shapes: [v('m')] }, { shapes: [v('')] }).shapes).toEqual([v('m')]);
  });
});

// A trellis and an arbor (the vine plan's last part, Oct 29): garden structures. A trellis is climbed as a fence is;
// an arbor or pergola is covered from its nearer end, as far as the vine's spread reaches.
describe('a trellis and an arbor', () => {
  const trellis = { id: 't', type: 'line', role: 'structure', x: 0, y: 0, points: [[0, 0], [6, 0]], color: '#8b5a2b', label: 'Trellis', opacity: 0.25, locked: false } as unknown as Shape;
  // (An arbor 8 ft long and 4 deep, its corners (0, 10), (8, 10), (8, 14), (0, 14).)
  const arbor = { id: 'a', type: 'rect', role: 'structure', x: 0, y: 10, width: 8, height: 4, rotation: 0, color: '#8b5a2b', label: 'Arbor', opacity: 0.25, locked: false } as unknown as Shape;
  it('are what they were added as', () => {
    expect(kindOfShape(trellis)).toBe('trellis');
    expect(kindOfShape(arbor)).toBe('arbor');
  });
  it('a vine by a trellis is offered it, and drawn along it, as by a fence', () => {
    const v = circle('v', 'jessamine', 3, 1, 12.5);
    expect(offerFor(v, [trellis, v], byId)?.shape.id).toBe('t');
    const band = vineBand({ ...v, climbsOn: 't' }, supportOf({ ...v, climbsOn: 't' }, [trellis, v], byId)!).band;
    expect(band[0]).toEqual({ x: 0, y: 0 });
    expect(band.at(-1)).toEqual({ x: 6, y: 0 }); // (cut at its ends: 6 ft, though the vine spreads 25)
  });
  it('a vine within 2 ft of an arbor, or under it, is offered it; farther, not', () => {
    const near = circle('v', 'jessamine', 4, 15.5, 12.5); // (1.5 ft from its edge)
    expect(supportFrom(arbor, near, byId)).toMatchObject({ kind: 'arbor', dist: 1.5, at: { x: 4, y: 14 } });
    expect(offerFor(near, [arbor, near], byId)?.shape.id).toBe('a');
    const under = circle('v', 'jessamine', 1, 12, 12.5);
    expect(supportFrom(arbor, under, byId)!.dist).toBe(0);
    const far = circle('v', 'jessamine', 4, 17, 12.5);
    expect(offerFor(far, [arbor, far], byId)).toBeNull();
    expect(supportsNear(far, [arbor, far], byId).map((s) => s.shape.id)).toEqual(['a']); // (pickable by hand)
  });
  it("a vine on an arbor covers its top as far as its spread reaches, from the nearer end", () => {
    const v = circle('v', 'jessamine', 4, 15.5, 12.5, { climbsOn: 'a' });
    const { band, cover } = vineBand(v, supportOf(v, [arbor, v], byId)!);
    expect(band).toEqual([]);
    expect(cover).toEqual([{ x: 0, y: 10 }, { x: 8, y: 10 }, { x: 8, y: 14 }, { x: 0, y: 14 }]); // (25 ft: all of it)
    // A small vine at the right end: 3 ft of it, from that end.
    const part = arborCover([{ x: 0, y: 10 }, { x: 8, y: 10 }, { x: 8, y: 14 }, { x: 0, y: 14 }], { x: 9, y: 12 }, 3);
    expect(part.map((p) => [Math.round(p.x * 100) / 100, p.y])).toEqual([[8, 10], [5, 10], [5, 14], [8, 14]]);
    // Moved away past its spread: a groundcover again.
    expect(strandedVines([{ ...arbor, y: 40 } as Shape, v], byId).map((x) => x.id)).toEqual(['v']);
  });
  it("keeps a structure's role through an older version's sync, which drops it; one given another role keeps that", () => {
    const { role: _, ...dropped } = arbor as unknown as Record<string, unknown>;
    expect(withLocalParts({ shapes: [dropped] }, { shapes: [arbor] }).shapes).toEqual([arbor]);
    expect(withLocalParts({ shapes: [{ ...dropped, role: 'bed' }] }, { shapes: [arbor] }).shapes).toEqual([{ ...dropped, role: 'bed' }]);
    expect(withLocalParts({ shapes: [{ ...dropped, type: 'poly' }] }, { shapes: [arbor] }).shapes).toEqual([{ ...dropped, type: 'poly' }]);
  });
  it('draws a lattice along a trellis and slats across an arbor, spaced wider zoomed out', () => {
    const marks = (d: string) => (d.match(/M/g) ?? []).length;
    expect(marks(latticePath([{ x: 0, y: 0 }, { x: 60, y: 0 }], 10))).toBe(12); // (6 crosses, two strokes each)
    expect(marks(latticePath([{ x: 0, y: 0 }, { x: 60, y: 0 }], 2))).toBe(16); // (8 px apart at the least: 8 crosses)
    expect(marks(slatsPath(0, 0, 80, 40, 15))).toBe(5); // (across the depth, along its 80 px)
    expect(slatsPath(0, 0, 40, 80, 15)).toMatch(/^M0,\d/); // (turned: across its width)
  });
});

