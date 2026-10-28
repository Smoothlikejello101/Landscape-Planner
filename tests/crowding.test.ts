import { describe, expect, it } from 'vitest';
import { bulbPartner, crowdedIds, crowdPairs, crowdRelation, crowdingOf, crowdLevels, sharedHeight, springBulb, treeBranches } from '../src/crowding';
import type { Plant } from '../src/plants';
import type { CircleShape, Shape } from '../src/types';

const byId: Record<string, Plant> = {
  shrub: { id: 'shrub', common: 'Shrub', width: { min: 3, max: 5, med: 4 } } as Plant,
  oak: { id: 'oak', common: 'Bur oak', form: 'Tree', width: { min: 60, max: 80, med: 70 } } as Plant,
  redbud: { id: 'redbud', common: 'Redbud', form: 'Tree', width: { min: 25, max: 35, med: 30 } } as Plant,
  // With heights: a 60 ft oak (crown from 20 ft), a 25 ft redbud (from 8⅓ ft), shrubs of 6 and 30 ft, a 2 ft perennial.
  oakH: { id: 'oakH', common: 'White oak', form: 'Tree', width: { min: 60, max: 80, med: 70 }, height: { min: 50, max: 70, med: 60 } } as Plant,
  redbudH: { id: 'redbudH', common: 'Redbud', form: 'Tree', width: { min: 25, max: 35, med: 30 }, height: { min: 20, max: 30, med: 25 } } as Plant,
  shrubH: { id: 'shrubH', common: 'Spicebush', form: 'Shrub', width: { min: 4, max: 8, med: 6 }, height: { min: 4, max: 8, med: 6 } } as Plant,
  bigShrub: { id: 'bigShrub', common: 'Wax myrtle', form: 'Shrub', width: { min: 15, max: 25, med: 20 }, height: { min: 20, max: 40, med: 30 } } as Plant,
  low: { id: 'low', common: 'Coreopsis', form: 'Perennial', width: { min: 1, max: 3, med: 2 }, height: { min: 1, max: 3, med: 2 } } as Plant,
  arbor: { id: 'arbor', common: 'Arborvitae', form: 'Tree', low_branched: true, width: { min: 12, max: 20, med: 16 }, height: { min: 40, max: 60, med: 50 } } as Plant,
};
const base = { color: '#16a34a', opacity: 0.65, locked: false };
const p = (id: string, x: number, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id, type: 'circle', x, y: 0, radius: 2, role: 'plant', label: id, plantId: 'shrub', ...extra } as Shape);

describe('crowding', () => {
  it('flags plants closer than 75% of the usual spacing (typical spreads touching)', () => {
    // Usual spacing for two 4-ft shrubs is 4 ft; crowded under 3 ft.
    const shapes = [p('a', 0), p('b', 2.9), p('c', 7), p('d', 30)];
    expect([...crowdedIds(shapes, byId)].sort()).toEqual(['a', 'b']);
    const c = crowdingOf(shapes[0], shapes, byId);
    expect(c.map((x) => [x.other.id, x.recommended])).toEqual([['b', 4]]);
  });
  it('ignores gone plants and non-plants; uses the drawn size without plant data', () => {
    const shapes = [p('a', 0), p('gone', 1, { status: 'gone' }), p('bed', 1, { role: 'bed' }), p('free', 1, { plantId: undefined, radius: 0.5 })];
    expect(crowdingOf(shapes[0], shapes, byId).map((x) => x.other.id)).toEqual(['free']); // 1 ft apart, usual 2.5 ft
    expect(crowdedIds(shapes, byId).has('gone')).toBe(false);
  });
  it('matches the pairwise check on a larger random layout', () => {
    const shapes = Array.from({ length: 200 }, (_, i) => p('s' + i, ((i * 7919) % 97) * 0.9, { y: ((i * 104729) % 89) * 0.9 } as Partial<Shape>));
    const brute = new Set(shapes.filter((s) => crowdingOf(s, shapes, byId).length).map((s) => s.id));
    expect(crowdedIds(shapes, byId)).toEqual(brute);
  });
  it('without a height, a tree is taken to be about as tall as it is wide; other plants crowd as before', () => {
    const shapes = [
      p('oak', 0, { plantId: 'oak', radius: 10, tree: true, sizeFrom: 'manual' } as Partial<Shape>), // 70 ft wide: crown 23⅓–70 ft
      p('shrub', 19), p('redbud', 20, { plantId: 'redbud' }), // (redbud 30 ft wide: 10–30 ft, a third of it in the oak's)
      p('oak2', 40, { plantId: 'oak' }), p('mystery', 5, { plantId: undefined, tree: true } as Partial<Shape>), // (4 ft wide: a young tree)
      p('bigUnknown', -25, { plantId: undefined, tree: true, radius: 20 } as Partial<Shape>), // (40 ft wide: 13⅓–40 ft)
    ];
    const near = (id: string) => crowdingOf(shapes.find((s) => s.id === id)!, shapes, byId).map((x) => x.other.id);
    expect(near('shrub')).toEqual([]); // (no height, not a tree: only other plants like it, as before)
    expect(near('redbud')).toEqual([]); // under the oak's edge: a third of the usual 50 ft, so fine at 20
    expect(near('mystery')).toEqual([]); // a young tree under the oak: nothing shared
    expect(near('oak')).toEqual(['oak2', 'bigUnknown']);
    expect([...crowdedIds(shapes, byId)].sort()).toEqual(['bigUnknown', 'oak', 'oak2']);
  });
  it('an evergreen screen keeps its branches to the ground; a tree can be given its own height and lowest branches', () => {
    const shapes = [p('arbor', 0, { plantId: 'arbor' }), p('shrub', 9, { plantId: 'shrubH' }), p('oak', 40, { plantId: 'oakH' }), p('shrub2', 46, { plantId: 'shrubH' })];
    const near = (id: string, list = shapes) => crowdingOf(list.find((s) => s.id === id)!, list, byId).map((x) => [x.other.id, x.shared]);
    // A spicebush 9 ft from an arborvitae: all its height in the arborvitae's (usual 11 ft, crowded under 8¼).
    expect(near('shrub')).toEqual([]); // (9 ft: just clear)
    const close = shapes.map((s) => (s.id === 'shrub' ? { ...s, x: 7 } : s));
    expect(near('shrub', close)).toEqual([['arbor', 1]]);
    // Under the oak, nothing shared, until its branches are set to reach the ground (never limbed up); at 5 ft up,
    // a sixth of the spicebush's height is in it, and 6 ft from the trunk is clear of that.
    expect(near('shrub2')).toEqual([]);
    const low = shapes.map((s) => (s.id === 'oak' ? { ...s, lowestBranch: 0 } as Shape : s));
    expect(near('shrub2', low)).toEqual([['oak', 1]]);
    const five = shapes.map((s) => (s.id === 'oak' ? { ...s, lowestBranch: 5 } as Shape : s));
    expect(near('shrub2', five)).toEqual([]);
    // A tree drawn without a plant, given its height: a 90 ft pine 30 ft wide, crown from 30 ft, clears a 25 ft redbud.
    const pine = [p('pine', 0, { plantId: undefined, tree: true, radius: 15 } as Partial<Shape>), p('redbud', 8, { plantId: 'redbudH' })];
    expect(near('redbud', pine).length).toBe(1); // (as tall as wide: 30 ft, crown from 10)
    const tall = pine.map((s) => (s.id === 'pine' ? { ...s, treeHeight: 90 } as Shape : s));
    expect(near('redbud', tall)).toEqual([]);
    const brute = new Set(low.filter((s) => crowdingOf(s, low, byId).length).map((s) => s.id));
    expect(crowdedIds(low, byId)).toEqual(brute);
  });
  it('says where a tree\'s height and lowest branches come from; a lowest branch at or above its height is ignored', () => {
    const t = (extra: Partial<Shape>, plantId?: string) => ({ ...p('t', 0, { plantId, tree: true, radius: 10, ...extra } as Partial<Shape>) }) as CircleShape;
    expect(treeBranches(t({}, 'oakH'), byId.oakH)).toMatchObject({ height: 60, lowest: 20, heightFrom: 'plant', lowestFrom: 'third' });
    expect(treeBranches(t({ treeHeight: 90 }, 'oakH'), byId.oakH)).toMatchObject({ height: 90, lowest: 30, heightFrom: 'hand' });
    expect(treeBranches(t({ lowestBranch: 0 }, 'oakH'), byId.oakH)).toMatchObject({ lowest: 0, lowestFrom: 'hand' });
    expect(treeBranches(t({}, 'arbor'), byId.arbor)).toMatchObject({ lowest: 0, lowestFrom: 'screen' });
    expect(treeBranches(t({}), undefined)).toMatchObject({ height: 20, heightFrom: 'spread' }); // (drawn 20 ft wide)
    expect(treeBranches(t({ lowestBranch: 70 }, 'oakH'), byId.oakH)).toMatchObject({ lowest: 20, lowestFrom: 'third' });
    // (So an oak whose lowest branches were set above its height still crowds the oak beside it.)
    const oaks = [p('a', 0, { plantId: 'oakH', lowestBranch: 70 } as Partial<Shape>), p('b', 1, { plantId: 'oakH' })];
    expect(crowdingOf(oaks[0], oaks, byId).map((x) => x.other.id)).toEqual(['b']);
  });
  it('a vine shares no height with a tree (planted to climb it), but crowds what else grows beside it', () => {
    const vines: Record<string, Plant> = { ...byId, vine: { id: 'vine', common: 'Crossvine', form: 'Vine', width: { min: 6, max: 10, med: 8 }, height: { min: 30, max: 50, med: 40 } } as Plant };
    const shapes = [p('oak', 0, { plantId: 'oakH' }), p('vine', 3, { plantId: 'vine' }), p('shrub', 8, { plantId: 'shrubH' })];
    const near = (id: string) => crowdingOf(shapes.find((s) => s.id === id)!, shapes, vines).map((x) => x.other.id);
    expect(near('vine')).toEqual(['shrub']); // (5 ft apart; usual 7, all their height shared)
    expect(near('oak')).toEqual([]);
  });
  it('with heights, crowds only as much as the leaves share heights: a tree\'s crown from a third of its height', () => {
    const band = (tree: boolean, h: number) => ({ tree, vine: false, band: [tree ? h / 3 : 0, h] as [number, number] });
    expect(sharedHeight(band(true, 60), band(false, 6))).toBe(0); // a shrub under an oak's raised crown
    expect(sharedHeight(band(true, 60), band(true, 25))).toBeCloseTo(5 / (25 - 25 / 3)); // a redbud's top 5 ft in it
    expect(sharedHeight(band(true, 60), band(true, 60))).toBe(1);
    expect(sharedHeight(band(false, 6), band(false, 2))).toBe(1); // a shrub and a perennial at its feet
    expect(sharedHeight(band(true, 60), band(false, 30))).toBeCloseTo(10 / 30);
    const shapes = [
      p('oak', 0, { plantId: 'oakH' }), p('shrub', 8, { plantId: 'shrubH' }), p('low', 10, { plantId: 'low' }),
      p('redbud', 20, { plantId: 'redbudH' }), p('redbud2', 9, { y: 0.1, plantId: 'redbudH' } as Partial<Shape>),
      p('myrtle', -10, { plantId: 'bigShrub' }), p('oak2', 45, { plantId: 'oakH' }),
    ];
    const near = (id: string) => crowdingOf(shapes.find((s) => s.id === id)!, shapes, byId);
    // The shrub and the perennial share no height with the oak: only with each other (2 ft apart; usual 4 ft).
    expect(near('shrub').map((c) => [c.other.id, c.recommended, c.shared])).toEqual([['low', 4, 1]]);
    // The redbud at 20 ft is under the oak's edge: three tenths of the spacing (15 ft), so fine at 20, not at 9.
    expect(near('redbud').map((c) => c.other.id)).toEqual(['redbud2']);
    expect(near('redbud2').map((c) => c.other.id)).toEqual(['redbud', 'oak']);
    expect(near('redbud2').find((c) => c.other.id === 'oak')?.recommended).toBeCloseTo((35 + 15) * 0.3);
    // A 30 ft wax myrtle reaches 10 ft into the oak's crown: a third of the usual 45 ft spacing.
    expect(near('myrtle').map((c) => [c.other.id, Math.round(c.recommended)])).toEqual([['oak', 15]]);
    // Two oaks share all their height: the usual spacing.
    expect(near('oak2').map((c) => c.other.id)).toEqual(['oak']);
    const brute = new Set(shapes.filter((s) => crowdingOf(s, shapes, byId).length).map((s) => s.id));
    expect(crowdedIds(shapes, byId)).toEqual(brute);
  });
});

// Two levels (decided with Jason, 2026-10-25): close where typical spreads touch, crowded past three quarters of that.
describe('close and crowded', () => {
  it('close where the typical spreads touch; crowded under three quarters of the usual spacing', () => {
    // Two 4 ft shrubs: usual spacing 4 ft; crowded under 3 ft, close from 3 to 4 ft.
    const shapes = [p('a', 0), p('b', 2.9), p('c', 6.5), p('d', 30)];
    expect([...crowdLevels(shapes, byId)].sort()).toEqual([['a', 'crowded'], ['b', 'crowded'], ['c', 'close']]);
    expect(crowdingOf(shapes[2], shapes, byId)).toEqual([]); // (crowded only, unless asked)
    expect(crowdingOf(shapes[2], shapes, byId, { close: true }).map((c) => [c.other.id, c.level])).toEqual([['b', 'close']]);
    expect(crowdingOf(shapes[1], shapes, byId, { close: true }).map((c) => [c.other.id, c.level])).toEqual([['a', 'crowded'], ['c', 'close']]);
  });
  it('matches the pairwise check, both levels, on a larger random layout', () => {
    const shapes = Array.from({ length: 200 }, (_, i) => p('s' + i, ((i * 7919) % 97) * 0.9, { y: ((i * 104729) % 89) * 0.9 } as Partial<Shape>));
    const worst = (s: Shape) => { const c = crowdingOf(s, shapes, byId, { close: true }); return c.some((x) => x.level === 'crowded') ? 'crowded' : c.length ? 'close' : null; };
    const brute = new Map(shapes.map((s) => [s.id, worst(s)] as const).filter(([, l]) => l));
    expect(crowdLevels(shapes, byId)).toEqual(brute);
  });
  it("which is buried by which: half again as tall, or wide where heights aren't known", () => {
    // A 2 ft coreopsis under a 6 ft spicebush; two spicebushes; plain shrubs of 4 ft and a drawn 1 ft circle.
    const low = p('low', 0, { plantId: 'low' }), sb = p('sb', 1, { plantId: 'shrubH' }), sb2 = p('sb2', 2, { plantId: 'shrubH' });
    expect([crowdRelation(low, sb, byId), crowdRelation(sb, low, byId), crowdRelation(sb, sb2, byId)]).toEqual(['under', 'over', 'even']);
    const free = p('free', 1, { plantId: undefined, radius: 0.5 });
    expect([crowdRelation(free, p('a', 0), byId), crowdRelation(p('a', 0), p('b', 1), byId)]).toEqual(['under', 'even']);
  });
  it('lists each pair flagged now once, both levels, not those left close', () => {
    const shapes = [p('a', 0), p('b', 2.9), p('c', 6.5), p('d', 30)];
    expect(crowdPairs(shapes, byId).map((x) => [x.a.id, x.b.id, x.level])).toEqual([['a', 'b', 'crowded'], ['b', 'c', 'close']]);
    const left = [{ ...shapes[0], crowdOk: ['b'] } as Shape, ...shapes.slice(1)];
    expect(crowdPairs(left, byId).map((x) => [x.a.id, x.b.id])).toEqual([['b', 'c']]);
  });
  it('a pair left close on purpose is not flagged, either way round', () => {
    const shapes = [p('a', 0, { crowdOk: ['b'] } as Partial<Shape>), p('b', 1), p('c', 4.5)];
    expect([...crowdLevels(shapes, byId)].sort()).toEqual([['b', 'close'], ['c', 'close']]); // (b and c: 3.5 apart, usual 4)
    expect(crowdingOf(shapes[1], shapes, byId, { close: true }).map((c) => c.other.id)).toEqual(['c']);
    expect(crowdingOf(shapes[1], shapes, byId, { close: true, includeLeft: true }).map((c) => [c.other.id, !!c.left])).toEqual([['a', true], ['c', false]]);
  });
});

// Spring bulbs under bigger plants (decided with Jason, 2026-10-26).
describe('spring bulbs under a deciduous plant', () => {
  const sourced = { src: ['ncsu'], check: 'single' as const };
  const bulbs: Record<string, Plant> = {
    ...byId,
    daffodil: { id: 'daffodil', common: 'Daffodil', form: 'Bulb', bloom_season: ['early spring', 'mid spring'], width: { min: 0.5, max: 1, med: 0.75 }, height: { min: 1, max: 1.5, med: 1.25 }, zone_min: 4, zone_max: 8 } as Plant,
    lily: { id: 'lily', common: 'Lily', form: 'Bulb', bloom_season: ['summer'], width: { min: 1, max: 1, med: 1 }, height: { min: 3, max: 4, med: 3.5 } } as Plant,
    tender: { id: 'tender', common: 'Freesia', form: 'Bulb', bloom_season: ['spring'], width: { min: 0.5, max: 1, med: 0.75 }, height: { min: 1, max: 1.5, med: 1.25 }, zone_min: 9, zone_max: 10 } as Plant,
    joePye: { id: 'joePye', common: 'Joe Pye weed', form: 'Perennial', foliage: 'deciduous', prov: { foliage: sourced }, width: { min: 2, max: 4, med: 3 }, height: { min: 5, max: 7, med: 6 } } as Plant,
    earlier: { id: 'earlier', common: 'Aster', form: 'Perennial', foliage: 'deciduous', prov: { foliage: { src: ['compendium'] } }, width: { min: 2, max: 4, med: 3 }, height: { min: 4, max: 6, med: 5 } } as Plant,
    unknown: { id: 'unknown', common: 'Phlox', form: 'Perennial', width: { min: 2, max: 4, med: 3 }, height: { min: 3, max: 4, med: 3.5 } } as Plant,
    short: { id: 'short', common: 'Coreopsis', form: 'Perennial', foliage: 'deciduous', prov: { foliage: sourced }, width: { min: 2, max: 4, med: 3 }, height: { min: 1, max: 3, med: 2 } } as Plant,
    holly: { id: 'holly', common: 'Holly', form: 'Shrub', foliage: 'evergreen', prov: { foliage: sourced }, width: { min: 2, max: 4, med: 3 }, height: { min: 4, max: 6, med: 5 } } as Plant,
  };
  const at = (id: string, plantId: string, x: number) => p(id, x, { plantId });
  it('knows a spring bulb, and a plant one can grow under', () => {
    expect(springBulb(bulbs.daffodil)).toBe(true);
    expect(springBulb(bulbs.lily)).toBe(false); // (summer)
    expect(springBulb({ ...bulbs.daffodil, bloom_season: undefined })).toBe(false); // (when it blooms not known)
    expect(springBulb({ ...bulbs.daffodil, bloom_season: ['late winter'] })).toBe(true);
    expect(springBulb(bulbs.tender, (pl) => (pl.zone_min ?? 0) <= 8)).toBe(false); // (not hardy here)
    expect(bulbPartner(at('j', 'joePye', 0), bulbs)).toBe(true);
    for (const id of ['earlier', 'unknown', 'short', 'holly', 'daffodil']) expect(bulbPartner(at('x', id, 0), bulbs)).toBe(false);
  });
  it('a spring bulb under it is not close or crowded, except right at its base, where it is close', () => {
    // A 3 ft-wide Joe Pye weed: usual spacing to a daffodil 1.9 ft; its base is within 0.75 ft of its center.
    const shapes = [at('joe', 'joePye', 0), at('d1', 'daffodil', 1), at('d2', 'daffodil', 0.4), at('d3', 'daffodil', 3)];
    const near = (id: string) => crowdingOf(shapes.find((s) => s.id === id)!, shapes, bulbs, { close: true }).map((c) => [c.other.id, c.level, !!c.bulb]);
    expect(near('d1')).toEqual([['d2', 'close', false]]); // (the bulbs crowd each other as ever: 0.6 ft, usual 0.75)
    expect(near('d2')).toEqual([['joe', 'close', true], ['d1', 'close', false]]);
    expect(near('joe')).toEqual([['d2', 'close', true]]);
    expect(crowdLevels(shapes, bulbs).get('joe')).toBe('close');
    // Without a sourced leaf-drop fact, or under an evergreen, a bulb crowds it as any plant would.
    const plain = [at('x', 'unknown', 0), at('d', 'daffodil', 1)];
    expect(crowdingOf(plain[1], plain, bulbs, { close: true }).map((c) => c.level)).toEqual(['crowded']);
    const ever = [at('x', 'holly', 0), at('d', 'daffodil', 1)];
    expect(crowdingOf(ever[1], ever, bulbs, { close: true }).map((c) => c.level)).toEqual(['crowded']);
    // Not hardy here: crowds it.
    const tender = [at('joe', 'joePye', 0), at('f', 'tender', 1)];
    expect(crowdingOf(tender[1], tender, bulbs, { close: true, hardy: (pl) => (pl.zone_min ?? 0) <= 8 }).map((c) => c.level)).toEqual(['crowded']);
    expect(crowdingOf(tender[1], tender, bulbs, { close: true }).map((c) => c.level)).toEqual([]);
  });
});

