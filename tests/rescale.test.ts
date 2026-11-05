import { beforeEach, describe, expect, it } from 'vitest';
import {
  ASK_FT, farthestMove, listedThere, movedIds, movedWithPhoto, outline, overPhoto, partOf, rescalePlan, type Placement, type Placed,
} from '../src/rescale';
import { shapeCenter, worldPoints } from '../src/geometry';
import { measuredSides } from '../src/measured';
import { state } from '../src/state';
import type { CircleShape, LineShape, PolyShape, RectShape, Shape, TextShape } from '../src/types';

// Rescale with the photo (Jason's answers to the design, Nov 2): src/rescale.ts. A test for each row of the design's
// table, each numbered case of its example yard, and the cases the brief adds. Planned things follow his rule of Nov 4,
// "Follow in both directions unless typed": over the photo, a bed, path, patio, structure or pond follows it both ways,
// keeping its shape, but for its sides typed as numbers; that replaced the design's "runs with it, keeping its depth"
// (answer 1), and with it the cases that kept a planned thing's size: running with a wall, between two things, an island.
//
// The example yard: a photo 1040 × 880 px whose first scale was 8% small, said to cover 96 × 81 ft; it really covers
// 104 × 88 ft (0.1 ft a pixel). Its middle is at (0, 0). Everything was traced at the small scale: a spot that's really
// (x, y) feet from the middle was traced at (x, y) / K.

const K = 104 / 96;
const old = (v: number) => v / K;
const FROM: Placement = { cx: 0, cy: 0, rotation: 0, ftPerPx: 96 / 1040, naturalWidth: 1040, naturalHeight: 880 };
const TO: Placement = { ...FROM, ftPerPx: 0.1 };
const base = { color: '#57534e', label: '', opacity: 0.6, locked: false };

const rect = (id: string, x: number, y: number, width: number, height: number, extra: Partial<RectShape> = {}): RectShape =>
  ({ ...base, id, type: 'rect', x, y, width, height, rotation: 0, ...extra });
const circle = (id: string, x: number, y: number, radius: number, extra: Partial<CircleShape> = {}): CircleShape =>
  ({ ...base, id, type: 'circle', x, y, radius, ...extra });
const line = (id: string, pts: [number, number][], extra: Partial<LineShape> = {}): LineShape => {
  const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
  return { ...base, id, type: 'line', x: minX, y: minY, points: pts.map(([x, y]) => [x - minX, y - minY]), rotation: 0, ...extra };
};
const poly = (id: string, pts: [number, number][], extra: Partial<PolyShape> = {}): PolyShape =>
  ({ ...line(id, pts), type: 'poly', ...extra } as PolyShape);
const plant = (id: string, x: number, y: number, radius: number, extra: Partial<CircleShape> = {}) =>
  circle(id, x, y, radius, { role: 'plant', status: 'planned', plantId: 'itea-virginica', sizeFrom: 'plant', ...extra });

/** The example yard, as traced. */
function yard(): Shape[] {
  const house = rect('house', old(-24), old(-14), old(40), old(28), { role: 'building', kind: 'building', status: 'existing', label: 'House',
    features: [{ id: 'door', kind: 'door', edge: 2, at: 0.3, width: 3 }] });
  const backBed = rect('back-bed', old(-24), old(-14) - 5, old(40), 5, { role: 'bed', kind: 'bed', status: 'planned', label: 'Back bed' });
  const sevens = Array.from({ length: 7 }, (_, i) => plant(`p${i}`, old(-24) + (i + 0.5) * old(40) / 7, old(-14) - 2.5, 1.25));
  const driveway = rect('drive', old(20), old(-6), old(12), old(48), { role: 'path', kind: 'driveway', status: 'existing', label: 'Driveway' });
  const sideBed = rect('side-bed', old(16), old(-4), old(4), 12, { role: 'bed', kind: 'bed', status: 'planned', label: 'Side bed' });
  const shrub = plant('shrub', old(10), old(14) + 4 + 2, 2);
  const island = rect('island', old(-12), old(22), 10, 12, { role: 'bed', kind: 'bed', status: 'planned', label: 'Island bed' });
  const fence = line('fence', [[old(-44), old(-36)], [old(44), old(-36)]], { role: 'boundary', kind: 'fence', status: 'existing', label: 'Fence' });
  const fenceBed = rect('fence-bed', old(-30), old(-36), old(40), 3, { role: 'bed', kind: 'bed', status: 'planned', label: 'Fence bed' });
  // (The lot from a survey: typed 100 by 84 ft, all four sides, its middle really 2 ft below the photo's.)
  const lot = poly('lot', [[-50, old(2) - 42], [50, old(2) - 42], [50, old(2) + 42], [-50, old(2) + 42]],
    { role: 'boundary', kind: 'property', status: 'existing', label: 'Lot line', measured: [{ side: 0, ft: 100 }, { side: 1, ft: 84 }, { side: 2, ft: 100 }, { side: 3, ft: 84 }] });
  const oak = circle('oak', old(-34), old(26), old(9), { role: 'plant', tree: true, sizeFrom: 'manual', status: 'existing', label: 'Oak' });
  return [lot, fence, house, driveway, backBed, ...sevens, sideBed, shrub, island, fenceBed, oak];
}
const kept = (shapes: Shape[]) => new Set(listedThere(shapes, FROM).filter((l) => l.typed.length).map((l) => l.id));
const moved = (shapes: Shape[], ticks = kept(shapes)) => rescalePlan(shapes, FROM, TO, { kept: ticks });
const at = (m: Map<string, Placed>, id: string) => m.get(id)!.shape;
const why = (m: Map<string, Placed>, id: string) => m.get(id)!.why;
const close = (v: number, want: number, digits = 2) => expect(v).toBeCloseTo(want, digits);
const box = (s: Shape) => { const r = s as RectShape; return { left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height, w: r.width, h: r.height }; };

beforeEach(() => { state.roleViews = {}; });

describe('the example yard, moved with the photo', () => {
  const m = moved(yard());

  it('the house, driveway, fence and oak take their true size and place again; the door keeps its share of the wall and its width', () => {
    const h = box(at(m, 'house'));
    close(h.left, -24); close(h.top, -14); close(h.w, 40); close(h.h, 28);
    expect((at(m, 'house') as RectShape).features).toEqual([{ id: 'door', kind: 'door', edge: 2, at: 0.3, width: 3 }]);
    const d = box(at(m, 'drive'));
    close(d.left, 20); close(d.top, -6); close(d.w, 12); close(d.h, 48);
    const f = worldPoints(at(m, 'fence') as LineShape);
    close(f[0].x, -44); close(f[0].y, -36); close(f[1].x, 44);
    const oak = at(m, 'oak') as CircleShape;
    close(oak.x, -34); close(oak.y, 26); close(oak.radius, 9);
    for (const id of ['house', 'drive', 'fence', 'oak']) expect(why(m, id).how).toBe('follows');
  });

  it('1 · the back bed follows the photo both ways, keeping its shape: still against the house and its length, 5 ft deep now 5.4; its seven plants keep their size and their place in it', () => {
    const b = box(at(m, 'back-bed'));
    close(b.h, 5 * K); close(b.bottom, -14); close(b.left, -24); close(b.right, 16);
    expect(why(m, 'back-bed')).toEqual({ how: 'follows' });
    const xs = Array.from({ length: 7 }, (_, i) => at(m, `p${i}`) as CircleShape);
    for (const p of xs) { expect(p.radius).toBe(1.25); close(p.y, -14 - 2.5 * K); expect(why(m, p.id)).toEqual({ how: 'bed', by: ['back-bed'] }); }
    close(xs[1].x - xs[0].x, 40 / 7); // (5.7 ft apart, from 5.3)
    close(xs[0].x, -24 + 20 / 7);
  });

  it('2 · the side bed touches the house and the driveway: following the photo, it still touches both, 3.7 ft wide now 4, and its length follows too, 12 ft now 13', () => {
    expect(box(yard().find((s) => s.id === 'side-bed')!).w).toBeCloseTo(3.69, 2);
    const s = box(at(m, 'side-bed'));
    close(s.left, 16); close(s.right, 20); close(s.w, 4); close(s.h, 12 * K);
    expect(why(m, 'side-bed')).toEqual({ how: 'follows' });
  });

  it('3 · the island bed, with nothing near it, follows the photo like the rest: its shape kept, 10 by 12 ft now 10.8 by 13, its middle where it was over the photo', () => {
    const was = shapeCenter(yard().find((s) => s.id === 'island')!), i = at(m, 'island');
    close(box(i).w, 10 * K); close(box(i).h, 12 * K);
    close(shapeCenter(i).x, was.x * K); close(shapeCenter(i).y, was.y * K);
    expect(why(m, 'island').how).toBe('follows');
  });

  it('4 · a shrub 4 ft off the front of the house keeps its size; its middle follows the photo, so it ends up 4.5 ft off', () => {
    const s = at(m, 'shrub') as CircleShape;
    expect(s.radius).toBe(2);
    close(s.y - s.radius - 14, 6 * K - 2); // (the house's front is at 14 ft now; the shrub's middle was 6 ft from it)
    close(s.x, 10);
    expect(why(m, 'shrub')).toEqual({ how: 'follows' });
  });

  it('5 · the fence bed stays against the fence, following the photo: 3 ft deep now 3.25, the fence\'s 40 ft along it', () => {
    const f = box(at(m, 'fence-bed'));
    close(f.top, -36); close(f.h, 3 * K); close(f.left, -30); close(f.w, 40);
    expect(why(m, 'fence-bed')).toEqual({ how: 'follows' });
  });

  it('the lot line, typed from a survey, is listed unticked and kept as measured: its size and shape, its middle where it was over the photo', () => {
    const list = listedThere(yard(), FROM);
    expect(list.map((l) => l.id)).toEqual(['lot', 'fence', 'house', 'drive', 'oak']);
    expect(list.find((l) => l.id === 'lot')!.typed).toEqual([100, 84]);
    expect(list.filter((l) => l.id !== 'lot').every((l) => !l.typed.length)).toBe(true);
    const lot = at(m, 'lot') as PolyShape;
    expect(lot.points).toEqual(yard()[0].type === 'poly' ? (yard()[0] as PolyShape).points : null);
    close(shapeCenter(lot).y, 2); close(shapeCenter(lot).x, 0);
    expect(why(m, 'lot').how).toBe('measured');
  });

  it('ticked, the typed lot line follows the photo like the rest', () => {
    const t = moved(yard(), new Set());
    const b = box({ ...at(t, 'lot'), width: 100 * K, height: 84 * K } as RectShape);
    close(worldPoints(at(t, 'lot') as PolyShape)[1].x - worldPoints(at(t, 'lot') as PolyShape)[0].x, 100 * K);
    close(b.top, -40 - 42 * (K - 1), 1);
    expect(why(t, 'lot').how).toBe('follows');
  });

  it('asks: things over the photo would move by far more than 3 inches', () => {
    expect(farthestMove(yard(), m)).toBeGreaterThan(ASK_FT);
  });
});

describe('each row of the design\'s table', () => {
  it('anything already there follows the photo, its place and size: buildings, lot lines, fences, the driveway, lawn, utilities, existing trees, sun areas, anything marked Existing, plain shapes', () => {
    const shapes: Shape[] = [
      rect('b', 0, 0, 10, 8, { role: 'building' }),
      line('l', [[-20, -20], [20, -20], [20, 20]], { role: 'boundary', label: 'Property Line' }),
      line('d', [[-30, 0], [-30, 30]], { role: 'path', kind: 'driveway', pathWidth: 10 }), // (a driveway drawn by its middle)
      poly('lawn', [[-10, 10], [5, 10], [5, 20], [-10, 20]], { role: 'lawn' }),
      line('u', [[-25, -25], [25, -25]], { role: 'utility', utility: 'overhead' }),
      circle('sun', 12, 12, 4, { role: 'shade' }),
      rect('eb', 2, -10, 6, 3, { role: 'bed', status: 'existing' }),
      rect('plain', -5, -5, 2, 2),
    ];
    const m = rescalePlan(shapes, FROM, TO);
    for (const s of shapes) {
      expect(m.get(s.id)!.why.how, s.id).toBe('follows');
      const a = outline(s).pts, b = outline(m.get(s.id)!.shape).pts;
      a.forEach((p, i) => { close(b[i].x, p.x * K); close(b[i].y, p.y * K); }); // (to the thousandth of a foot, as points are kept)
    }
    close((m.get('d')!.shape as LineShape).pathWidth!, 10 * K, 3);
  });

  it('doors, gates and the like keep their share of the way along the wall, and their widths; notes keep their text size', () => {
    const fence = line('f', [[0, 0], [20, 0]], { role: 'boundary', features: [{ id: 'g', kind: 'gate', edge: 0, at: 0.25, width: 4 }] });
    const note: TextShape = { ...base, id: 'n', type: 'text', x: 5, y: 5, fontSize: 1, rotation: 0, label: 'Old well', role: 'other' };
    const m = rescalePlan([fence, note], FROM, TO);
    expect((m.get('f')!.shape as LineShape).features).toEqual([{ id: 'g', kind: 'gate', edge: 0, at: 0.25, width: 4 }]);
    const n = m.get('n')!.shape as TextShape;
    expect(n.fontSize).toBe(1);
    close(shapeCenter(n).x, shapeCenter(note).x * K); close(shapeCenter(n).y, shapeCenter(note).y * K);
    expect(partOf(note)).toBe('note');
  });

  it('a planned bed, path, patio, trellis or pond over the photo follows it both ways, keeping its shape: 2 ft off the house is 2.2 ft off, 4 ft deep is 4.3', () => {
    const house = rect('h', 0, 0, 30, 20, { role: 'building' });
    const bed = rect('bed', 5, 22, 20, 4, { role: 'bed' }); // (2 ft off the front, 4 deep)
    const trellis = line('t', [[-3, 2], [-3, 18]], { role: 'structure', status: 'planned' }); // (3 ft off the side)
    const m = rescalePlan([house, bed, trellis], FROM, TO);
    const b = box(m.get('bed')!.shape);
    close(b.top - 20 * K, 2 * K); close(b.h, 4 * K); close(b.w, 20 * K); close(b.left, 5 * K);
    const t = worldPoints(m.get('t')!.shape as LineShape);
    close(t[0].x, -3 * K); close(t[1].y - t[0].y, 16 * K); close(t[0].y, 2 * K);
    expect(m.get('bed')!.why).toEqual({ how: 'follows' });
    expect(m.get('t')!.why).toEqual({ how: 'follows' });
  });

  it('a planned thing touching two things already there still touches both: the width between them and its length the other way both follow the photo', () => {
    const house = rect('h', 0, 0, 20, 20, { role: 'building' }), shed = rect('s', 26, 0, 8, 8, { role: 'building', label: 'Shed' });
    const path = rect('w', 20, 2, 6, 4, { role: 'path', label: 'Walk', status: 'planned' }); // (6 ft between them, 4 ft wide)
    const m = rescalePlan([house, shed, path], FROM, TO);
    const p = box(m.get('w')!.shape);
    close(p.left, 20 * K); close(p.right, 26 * K); close(p.h, 4 * K);
    expect(m.get('w')!.why.how).toBe('follows');
  });

  it('a planned thing touching another planned thing still touches it: both follow the photo (a bed against the new patio)', () => {
    const house = rect('h', 0, 0, 30, 20, { role: 'building' });
    const patio = rect('pat', 5, 20, 12, 10, { role: 'path', label: 'Patio', status: 'planned' }); // (against the house, 10 deep)
    const bed = rect('bed', 3, 30, 16, 3, { role: 'bed' }); // (against the patio's far edge: 10 ft from the house)
    const m = rescalePlan([house, patio, bed], FROM, TO);
    const pa = box(m.get('pat')!.shape), be = box(m.get('bed')!.shape);
    close(pa.top, 20 * K); close(pa.h, 10 * K);
    close(be.top, pa.bottom, 3); close(be.h, 3 * K);
    expect(m.get('bed')!.why).toEqual({ how: 'follows' });
  });

  it('a path drawn as a line follows the photo, its width too; each end that touches something stays on it; the points between keep their share of the way', () => {
    const house = rect('h', 0, 0, 20, 20, { role: 'building' });
    const drive = rect('d', 40, -10, 10, 40, { role: 'path', kind: 'driveway' });
    const walk = line('w', [[20, 10], [30, 14], [40, 10]], { role: 'path', status: 'planned', pathWidth: 3 }); // (house to driveway)
    const spur = line('s', [[10, 20], [10, 30]], { role: 'path', status: 'planned', pathWidth: 2 }); // (from the front, out)
    const m = rescalePlan([house, drive, walk, spur], FROM, TO);
    const w = m.get('w')!.shape as LineShape, p = worldPoints(w);
    close(w.pathWidth!, 3 * K, 3);
    close(p[0].x, 20 * K); close(p[0].y, 10 * K); close(p[2].x, 40 * K); close(p[2].y, 10 * K);
    close(p[1].x, 30 * K); close(p[1].y, 14 * K); // (halfway, as it was)
    expect(m.get('w')!.why).toEqual({ how: 'path', by: ['h', 'd'] });
    // One end on the house: it stays on it, the path following the photo from there.
    const s = worldPoints(m.get('s')!.shape as LineShape);
    close(s[0].x, 10 * K); close(s[0].y, 20 * K); close(s[1].y - s[0].y, 10 * K);
    close((m.get('s')!.shape as LineShape).pathWidth!, 2 * K, 3);
    expect(m.get('s')!.why).toEqual({ how: 'path', by: ['h', ''] });
  });

  it('a planned thing with nothing near it follows the photo too, its shape kept, its middle where it was over the photo', () => {
    const house = rect('h', 0, 0, 20, 20, { role: 'building' });
    const pond = poly('pond', [[-20, -20], [-14, -21], [-12, -15], [-19, -13]], { role: 'water' });
    const m = rescalePlan([house, pond], FROM, TO);
    const p = m.get('pond')!.shape as PolyShape;
    (pond as PolyShape).points.forEach(([x, y], i) => { close(p.points[i][0], x * K); close(p.points[i][1], y * K); });
    close(shapeCenter(p).x, shapeCenter(pond).x * K); close(shapeCenter(p).y, shapeCenter(pond).y * K);
    expect(m.get('pond')!.why.how).toBe('follows');
  });

  it('plants keep their size, always: in a bed, their place in it as it follows the photo; elsewhere, their middle follows it', () => {
    const bed = rect('bed', -10, -10, 8, 4, { role: 'bed' });
    const inIt = plant('in', -4, -8, 1);
    const alone = plant('alone', 20, 20, 1.5, { status: 'planted' }); // (planted: as planned things are)
    const m = rescalePlan([bed, inIt, alone], FROM, TO);
    const a = m.get('in')!.shape as CircleShape;
    expect(a.radius).toBe(1);
    const c = shapeCenter(bed);
    close(a.x - shapeCenter(m.get('bed')!.shape).x, (-4 - c.x) * K); // (the same share of the way across its bed)
    expect(m.get('in')!.why).toEqual({ how: 'bed', by: ['bed'] });
    const b = m.get('alone')!.shape as CircleShape;
    expect(b.radius).toBe(1.5); close(b.x, 20 * K);
    expect(m.get('alone')!.why.how).toBe('follows');
  });

  it('an existing tree: a canopy sized from the catalog keeps its size, its trunk follows; a canopy drawn to the photo follows', () => {
    const dogwood = circle('dog', 10, 10, 6, { role: 'plant', tree: true, status: 'existing', plantId: 'cornus-florida', sizeFrom: 'plant' });
    const drawn = circle('elm', -10, 10, 5, { role: 'plant', tree: true, sizeFrom: 'manual', canopy: [[0, -5], [4, 0], [0, 3], [-3, 0]], trunk: 1 });
    const azalea = plant('az', 0, -12, 2, { status: 'existing' }); // (an existing plant sized from the catalog: answer 4)
    const m = rescalePlan([dogwood, drawn, azalea], FROM, TO);
    const d = m.get('dog')!.shape as CircleShape;
    expect(d.radius).toBe(6); close(d.x, 10 * K); close(d.y, 10 * K);
    const e = m.get('elm')!.shape as CircleShape;
    close(e.radius, 5 * K); close(e.x, -10 * K); close(e.canopy![0][1], -5 * K); close(e.trunk!, K);
    const z = m.get('az')!.shape as CircleShape;
    expect(z.radius).toBe(2); close(z.y, -12 * K);
    expect(listedThere([dogwood, drawn, azalea], FROM).map((l) => l.id)).toEqual(['elm']); // (the only size that follows)
  });
});

describe('Jason\'s bed along the side of the house (Nov 4): a rough photo\'s first real scale', () => {
  // His report: "I had a bed attached to the side of the house that was 8.5' x 30'. After rescale it's 8.5 x 12.6,
  // which is a completely different shape." The photo came out at 0.42 times its rough size; the house shrank with
  // it and the bed's length along the house followed, but its depth out from the house stayed 8.5 ft (the design's
  // "runs with it"). His rule since: "Follow in both directions unless typed".
  const k = 0.42;
  const from: Placement = { cx: 0, cy: 0, rotation: 0, ftPerPx: 0.1, naturalWidth: 1500, naturalHeight: 2000 };
  const to: Placement = { ...from, ftPerPx: 0.1 * k };
  const house = rect('house', -20, -25, 40, 50, { role: 'building', kind: 'building', status: 'existing', label: 'House' });
  const sideBed = (extra: Partial<RectShape> = {}) => rect('bed', 20, -15, 8.5, 30, { role: 'bed', kind: 'bed', status: 'planned', label: 'Side bed', ...extra }); // (against the east wall)
  const inIt = [plant('a', 24.25, -10, 1.5), plant('b', 24.25, 10, 1.5)];
  const m = rescalePlan([house, sideBed(), ...inIt], from, to);

  it('the bed follows the photo both ways, keeping its shape: 8.5 by 30 ft becomes 3.6 by 12.6, not 8.5 by 12.6', () => {
    const b = box(at(m, 'bed'));
    close(b.h, 30 * k); // (12.6: along the house, as it shrank)
    close(b.w, 8.5 * k); // (3.57: out from it, the same share)
    close(b.w / b.h, 8.5 / 30, 3);
    expect(why(m, 'bed')).toEqual({ how: 'follows' });
  });

  it('it stays against the house, and its plants keep their size, inside it', () => {
    const h = box(at(m, 'house')), b = box(at(m, 'bed'));
    close(h.right, 20 * k); close(b.left, h.right);
    close(b.top, -15 * k); close(b.bottom, 15 * k);
    for (const p of inIt) {
      const q = at(m, p.id) as CircleShape;
      expect(q.radius).toBe(1.5);
      expect(q.x).toBeGreaterThan(b.left); expect(q.x).toBeLessThan(b.right);
      expect(q.y).toBeGreaterThan(b.top); expect(q.y).toBeLessThan(b.bottom);
    }
  });

  it('its long side typed as 30 ft: that side stays 30 ft, and the rest follows the photo (3.6 ft deep), still against the house', () => {
    const typed = sideBed({ measured: [{ side: 1, ft: 30 }, { side: 3, ft: 30 }] }); // (its Length typed: right and left)
    const t = rescalePlan([house, typed, ...inIt], from, to), b = box(at(t, 'bed'));
    close(b.h, 30); close(b.w, 8.5 * k);
    close(b.left, 20 * k); close(b.top, -15); // (against the house's wall where it touched it: the bed's middle along it)
    expect(why(t, 'bed')).toEqual({ how: 'typed', by: ['house'] });
    expect(measuredSides(at(t, 'bed'))).toEqual([{ side: 1, ft: 30 }, { side: 3, ft: 30 }]); // (still 30 ft, as typed)
  });

  it('both its sides typed: it keeps its size, against the house', () => {
    const typed = sideBed({ measured: [{ side: 0, ft: 8.5 }, { side: 1, ft: 30 }, { side: 2, ft: 8.5 }, { side: 3, ft: 30 }] });
    const b = box(at(rescalePlan([house, typed], from, to), 'bed'));
    close(b.w, 8.5); close(b.h, 30); close(b.left, 20 * k);
  });

  it('drawn as an outline of four square corners, its long side typed: the same', () => {
    const outlined = poly('bed', [[20, -15], [28.5, -15], [28.5, 15], [20, 15]], { role: 'bed', status: 'planned', measured: [{ side: 3, ft: 30 }] });
    const t = rescalePlan([house, outlined], from, to), p = worldPoints(at(t, 'bed') as PolyShape);
    close(p[1].x - p[0].x, 8.5 * k); close(p[2].y - p[1].y, 30); close(p[3].y - p[0].y, 30);
    close(p[0].x, 20 * k);
    expect(why(t, 'bed').how).toBe('typed');
  });

  it('the house kept as measured (unticked): the bed\'s size follows the photo, and it stays against the house where the house went', () => {
    const off: Placement = { ...from, cx: 10 }, offTo: Placement = { ...off, ftPerPx: 0.1 * k };
    const t = rescalePlan([house, sideBed()], off, offTo, { kept: new Set(['house']) });
    const h = box(at(t, 'house')), b = box(at(t, 'bed'));
    close(h.w, 40); close(h.right, 10 + (20 - 10) * k + 20 * (1 - k)); // (its size kept, its middle where it was over the photo)
    close(b.left, h.right); close(b.w, 8.5 * k); close(b.h, 30 * k);
    expect(why(t, 'bed')).toEqual({ how: 'against', by: ['house'] });
  });
});

describe('sides typed as numbers, and touching edges', () => {
  it('a bed against a patio with its depth typed still touches it: the patio keeps its 10 ft, and the bed follows the photo against its far edge', () => {
    const house = rect('h', 0, 0, 30, 20, { role: 'building' });
    const patio = rect('pat', 5, 20, 12, 10, { role: 'path', label: 'Patio', status: 'planned', measured: [{ side: 1, ft: 10 }, { side: 3, ft: 10 }] });
    const bed = rect('bed', 3, 30, 16, 3, { role: 'bed' });
    const m = rescalePlan([house, patio, bed], FROM, TO);
    const pa = box(m.get('pat')!.shape), be = box(m.get('bed')!.shape);
    close(pa.top, 20 * K); close(pa.h, 10); close(pa.w, 12 * K);
    close(be.top, pa.bottom, 3); close(be.h, 3 * K); close(be.w, 16 * K);
    expect(m.get('pat')!.why).toEqual({ how: 'typed', by: ['h'] });
    expect(m.get('bed')!.why).toEqual({ how: 'against', by: ['pat'] });
  });

  it('a trellis line with one side typed: that side keeps its length, the other follows the photo, each the way it ran', () => {
    const house = rect('h', 0, 0, 30, 20, { role: 'building' });
    const t = line('t', [[2, 22], [12, 22], [12, 28]], { role: 'structure', status: 'planned', measured: [{ side: 0, ft: 10 }] }); // (2 ft off the front)
    const m = rescalePlan([house, t], FROM, TO), p = worldPoints(m.get('t')!.shape as LineShape);
    close(p[1].x - p[0].x, 10); close(p[1].y - p[0].y, 0);
    close(p[2].y - p[1].y, 6 * K); close(p[2].x - p[1].x, 0);
    expect(measuredSides(m.get('t')!.shape)).toEqual([{ side: 0, ft: 10 }]);
    expect(m.get('t')!.why).toEqual({ how: 'typed' });
  });

  it('a planned bed off the photo, against a building over it, goes with the building at its own size', () => {
    const shed = rect('shed', 44, 0, 10, 10, { role: 'building' }); // (over the photo's right edge, at 48 ft)
    const bed = rect('bed', 54, 2, 4, 6, { role: 'bed' }); // (off it, against the shed)
    const m = rescalePlan([shed, bed], FROM, TO);
    const s = box(m.get('shed')!.shape), b = box(m.get('bed')!.shape);
    close(b.left, s.right); close(b.w, 4); close(b.h, 6);
    expect(m.get('bed')!.why).toEqual({ how: 'with', by: ['shed'] });
  });
});

describe('and the rest', () => {
  it('a locked shape moves by the same rules: locking only stops a drag by hand', () => {
    const shapes = yard().map((s) => (s.id === 'house' || s.id === 'back-bed' ? { ...s, locked: true } : s));
    const a = moved(shapes), b = moved(yard());
    for (const id of ['house', 'back-bed']) expect({ ...at(a, id), locked: false }).toEqual(at(b, id));
  });

  it('hidden shapes move by the same rules', () => {
    const b = moved(yard());
    state.roleViews = { building: { hidden: true }, bed: { hidden: true }, plant: { hidden: true } };
    const a = moved(yard());
    for (const s of yard()) expect(at(a, s.id)).toEqual(at(b, s.id));
  });

  it('something gone follows the photo but isn\'t listed, and nothing goes by it; what\'s off the photo stays', () => {
    const shed = rect('shed', 0, 0, 10, 10, { role: 'building', status: 'gone' });
    const bed = rect('bed', 0, 10, 10, 3, { role: 'bed', status: 'planned', measured: [{ side: 0, ft: 10 }, { side: 2, ft: 10 }] }); // (against where the shed was)
    const far = rect('far', 300, 300, 10, 10, { role: 'building' });
    const m = rescalePlan([shed, bed, far], FROM, TO);
    close(box(m.get('shed')!.shape).w, 10 * K);
    expect(m.get('bed')!.why).toEqual({ how: 'typed' }); // (its middle where it was over the photo: not kept against the shed)
    close(shapeCenter(m.get('bed')!.shape).y, 11.5 * K);
    expect(m.get('far')!.why.how).toBe('stays');
    expect(m.get('far')!.shape).toBe(far);
    expect(listedThere([shed, bed, far], FROM)).toEqual([]);
  });

  it('a photo turned: what\'s over it is what\'s within it as it lies, and it grows about its middle all the same', () => {
    const turned: Placement = { ...FROM, rotation: 45 };
    const corner = rect('c', 40, 34, 4, 4, { role: 'building' }); // (in the photo's box unturned; off it turned)
    const inner = rect('i', 0, 0, 8, 8, { role: 'building' });
    expect(overPhoto(corner, FROM)).toBe(true);
    expect(overPhoto(corner, turned)).toBe(false);
    const m = rescalePlan([corner, inner], turned, { ...turned, ftPerPx: 0.1 });
    expect(m.get('c')!.why.how).toBe('stays');
    close(box(m.get('i')!.shape).w, 8 * K);
  });

  it('a small new scale moves nothing past 3 inches: not asked', () => {
    const shapes = [rect('h', -10, -10, 20, 20, { role: 'building' })];
    const m = rescalePlan(shapes, FROM, { ...FROM, ftPerPx: FROM.ftPerPx * 1.005 });
    expect(farthestMove(shapes, m)).toBeLessThan(ASK_FT);
    expect(movedIds(shapes, m)).toEqual(new Set(['h']));
  });

  it('the photo dragged and turned: everything over it moves and turns with it exactly, sizes kept, with the plants in a bed over it', () => {
    const house = rect('h', 0, 0, 20, 10, { role: 'building' });
    const bed = rect('bed', -20, -20, 10, 4, { role: 'bed' });
    const p = plant('p', -15, -18, 1);
    const far = rect('far', 600, 0, 4, 4, { role: 'building' });
    const to: Placement = { ...FROM, cx: 5, cy: -3, rotation: 30 };
    const m = movedWithPhoto([house, bed, p, far], FROM, to);
    expect([...m.keys()].sort()).toEqual(['bed', 'h', 'p']);
    const h = m.get('h')! as RectShape;
    expect(h.width).toBe(20); expect(h.height).toBe(10); expect(h.rotation).toBe(30);
    // (Its middle, (10, 5), turned 30° about the photo's middle and moved with it.)
    const c = shapeCenter(h), r = (30 * Math.PI) / 180;
    close(c.x, 5 + 10 * Math.cos(r) - 5 * Math.sin(r)); close(c.y, -3 + 10 * Math.sin(r) + 5 * Math.cos(r));
    expect((m.get('p') as CircleShape).radius).toBe(1);
    expect(movedWithPhoto([far], FROM, to).size).toBe(0);
  });
});
