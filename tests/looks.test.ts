import { describe, expect, it } from 'vitest';
import type { Plant } from '../src/plants';
import { bandBlooms, bandLeaves, bloomKind, coverBlooms, flowerChoices, flowerColorOf, levelOf, lookOf, lookSvg, nearestFlower, ownBloomColors } from '../src/looks';
import { LOOK_MAX_R, lookFor, lookMarkup, plannedEdge } from '../src/plant-looks';
import { plantsById } from '../src/plants';
import type { CircleShape } from '../src/types';
import { withLocalParts } from '../src/sync/engine';

// Plant looks (Jason, Oct 27–29: R5c, version 3, every plant in bloom until garden over time brings a month
// slider; no leaf color on record: default green).

const plant = (extra: Partial<Plant>): Plant => ({ id: 'p', common: 'Plant', form: 'Shrub', ...extra } as Plant);
const count = (svg: string, tag: string) => (svg.match(new RegExp(`<${tag}\\b`, 'g')) ?? []).length;

describe('how much of a plant is drawn, by its size on the screen', () => {
  it('every leaf close up (16 px and up: Jason, Oct 30), branches and bold blooms in between, spots from the whole yard', () => {
    expect([levelOf(40), levelOf(16), levelOf(15.9), levelOf(10), levelOf(9.9)]).toEqual(['close', 'close', 'mid', 'mid', 'yard']);
  });
  it('draws far less at yard size, and the same plant the same way every time', () => {
    const look = lookOf(plant({ flower_color: ['pink'], flower_form: { inflorescence: ['umbel'] } }), '#16a34a');
    const close = lookSvg(look, 40, 'a'), yard = lookSvg(look, 8, 'a');
    expect(count(close, 'path')).toBeGreaterThan(40);
    expect(count(yard, 'path')).toBe(0);
    expect(lookSvg(look, 40, 'a')).toBe(close);
    expect(lookSvg(look, 40, 'b')).not.toBe(close); // (each placed plant its own)
  });
});

describe('a plant drawn from its catalog facts', () => {
  it('in its summer leaf color, default green when none is on record, darker green when evergreen', () => {
    expect(lookOf(plant({}), '#000').pal.base).toBe('#6f9a4a');
    expect(lookOf(plant({ leaf_color: ['gold', 'green', 'orange'], fall_colors: ['gold', 'red'] }), '#000').pal.base).toBe('#6f9a4a'); // (red maple: green leads)
    expect(lookOf(plant({ leaf_color: ['purple'] }), '#000').pal.base).not.toBe('#6f9a4a');
    expect(lookOf(plant({ foliage: 'evergreen' }), '#000').pal.base).toBe('#3f6b3a');
    // A plant of the user's own, with no catalog record: its shape's color.
    expect(lookOf(undefined, '#123456').pal.base).toBe('#123456');
  });
  it("in a color chosen by hand, its leaves; its flowers keep theirs (Jason, Oct 29: plans' older colors aren't taken as chosen)", () => {
    const p = plant({ flower_color: ['yellow'], flower_form: { inflorescence: ['head'] } });
    expect(lookOf(p, '#7c3aed', true).pal.base).toBe('#7c3aed');
    expect(lookOf(p, '#7c3aed', true).pal.fl).toBe('#f2c230');
    expect(lookOf(p, '#7c3aed').pal.base).toBe('#6f9a4a');
  });
  it('in a flower color picked for it among its sources\' (Jason, Oct 30), never one they don\'t list', () => {
    const aster = plant({ common: 'New England aster', flower_color: ['purple', 'yellow', 'pink'], flower_form: { inflorescence: ['head'] } });
    expect(lookOf(aster, '#000').pal.fl).toBe('#8a62c9');
    expect(lookOf(aster, '#000', false, 'pink').pal.fl).toBe('#e0679f');
    expect(lookOf(aster, '#000', false, 'blue').pal.fl).toBe('#8a62c9');
    expect(flowerChoices(aster)).toEqual({ colors: ['purple', 'yellow', 'pink'], usual: 'purple' });
    expect(flowerChoices(plant({ flower_color: ['red', 'green'] }))).toEqual({ colors: ['red'], usual: 'red' }); // (green: a dull part)
    expect(flowerChoices(plant({ flower_color: ['red', 'white'], flower_form: { inflorescence: ['catkin'] } })).colors).toEqual([]);
  });
  it('drawn the way its form is: a conifer by its needles, an evergreen tree broadleaf, a grass by its blades', () => {
    expect(lookOf(plant({ form: 'Tree', needles: true }), '#000').form).toBe('conifer');
    expect(lookOf(plant({ form: 'Tree', foliage: 'evergreen' }), '#000').form).toBe('broadleaf');
    expect(lookOf(plant({ form: 'Tree' }), '#000').form).toBe('tree');
    expect(lookOf(plant({ form: 'Grass/Sedge' }), '#000').form).toBe('grass');
    expect(lookOf(plant({ form: 'Perennial' }), '#000').form).toBe('perennial');
  });
  it('blooms shaped by its flowers: a head a daisy, a flat cluster a dome, a spike a spike, a tube a trumpet', () => {
    expect(bloomKind({ flower_form: { inflorescence: ['head'], shape: ['radial'], petals: ['7-20'] } })).toBe('daisy');
    expect(bloomKind({ flower_form: { inflorescence: ['umbel'] } })).toBe('dome');
    expect(bloomKind({ flower_form: { inflorescence: ['spike'] } })).toBe('spike');
    expect(bloomKind({ flower_form: { inflorescence: ['raceme'], shape: ['tubular'] } })).toBe('spiky');
    expect(bloomKind({ flower_form: { shape: ['trumpet'] } })).toBe('trumpet');
    expect(bloomKind({ flower_form: { shape: ['cup'], petals: ['4-5'] } })).toBe('cup5');
    expect(bloomKind({})).toBe('plain');
  });
  it('no blooms for flowers that aren\'t showy: none on record, insignificant, or catkins', () => {
    expect(lookOf(plant({}), '#000').pal.fl).toBeUndefined();
    expect(lookOf(plant({ flower_color: ['insignificant'] }), '#000').pal.fl).toBeUndefined();
    expect(lookOf(plant({ flower_color: ['red'], flower_form: { inflorescence: ['catkin'] } }), '#000').pal.fl).toBeUndefined();
    expect(lookOf(plant({ flower_color: ['red'] }), '#000').pal.fl).toBeDefined();
  });
  it('its flowers in the color its name says, or else a petal\'s color, not a center\'s', () => {
    // (Purple coneflower's species lists every cultivar's colors, brown first.)
    expect(flowerColorOf('Purple coneflower', ['brown', 'yellow', 'orange', 'pink', 'purple'])).toBe('purple');
    expect(flowerColorOf('Black-eyed Susan', ['black', 'yellow'])).toBe('yellow');
    expect(flowerColorOf('Buttonbush', ['white'])).toBe('white');
    expect(flowerColorOf('Sedge', ['brown'])).toBe('brown');
    // A coneflower's eye from its brown.
    expect(lookOf(plant({ common: 'Purple coneflower', flower_color: ['brown', 'purple'], flower_form: { inflorescence: ['head'] } }), '#000').pal.eye).toBe('#6a3f1e');
  });
  it('in bloom: its flowers drawn in its flower color', () => {
    const look = lookOf(plant({ flower_color: ['yellow'], flower_form: { inflorescence: ['head'] } }), '#000');
    expect(lookSvg(look, 40, 'a')).toContain('#f2c230');
    expect(lookSvg(look, 15, 'a')).toContain('#f2c230');
    expect(lookSvg(look, 6, 'a')).toContain('#f2c230');
  });
  it("blooms no bigger than their share of a small plant: its green shows between them (Jason, Oct 29: 'blobs of color')", () => {
    const look = lookOf(plant({ form: 'Perennial', flower_color: ['pink'] }), '#000');
    const discs = (svg: string, fill: string) => [...svg.matchAll(/<circle[^>]*\br="([\d.]+)"[^>]*fill="([^"]+)"/g)].filter((m) => m[2] === fill).map((m) => Number(m[1]));
    const pink = '#e0679f';
    // (At mid zoom a 14 px perennial's blooms reach at most three eighths of it; a bigger one's keep their full size.)
    expect(Math.max(...discs(lookSvg(look, 14, 'a', 'mid'), pink))).toBeLessThanOrEqual(14 * 0.375 + 0.05);
    expect(Math.max(...discs(lookSvg(look, 28, 'a', 'mid'), pink))).toBeCloseTo(16 * 1.05 * 1.15 * 0.5, 1);
  });
  it("a plant of the user's own in the bloom color they gave it, else its plan color; a catalog plant's earlier list color until a source gives one (Jason, Oct 30)", () => {
    const mine = { id: 'u-abc', common: "Strawberry 'Albion'", form: 'Perennial', bloom: { start: 3, end: 4, color: 'White' }, color: '#ff0000' } as Plant;
    expect(lookOf(mine, '#ff0000').pal.fl).toBe('#f7f4ec');
    expect(lookOf({ ...mine, bloom: { color: 'Pale lavender' } }, '#ff0000').pal.fl).toBe('#8a62c9');
    // (No bloom color: the color picked for it on the plan, as the nearest flower color; none picked, no flowers.)
    expect(lookOf({ ...mine, bloom: undefined }, '#ff0000').pal.fl).toBe('#d7263d');
    expect(lookOf({ ...mine, bloom: undefined, color: '#ffff00' }, '#ffff00').pal.fl).toBe('#f2c230');
    expect(lookOf({ ...mine, bloom: undefined, color: '#f6f5f4' }, '#f6f5f4').pal.fl).toBe('#f7f4ec');
    expect(lookOf({ ...mine, bloom: undefined, color: '#ff00ff' }, '#ff00ff').pal.fl).toBe('#e0679f');
    expect(lookOf({ ...mine, bloom: undefined, color: undefined }, '#16a34a').pal.fl).toBeUndefined();
    // (A catalog plant: its sources' color; with none, the earlier list's words; never its plan color.)
    expect(lookOf(plant({ bloom: { start: 5, end: 10, color: 'Red' } }), '#000').pal.fl).toBe('#d7263d');
    expect(lookOf(plant({ bloom: { color: 'Hot pink fringe' } }), '#000').pal.fl).toBe('#e0679f');
    expect(lookOf(plant({ flower_color: ['white'], bloom: { color: 'Red' } }), '#000').pal.fl).toBe('#f7f4ec');
    expect(lookOf(plant({ bloom: { color: 'Tan seed heads' }, color: '#ff0000' }), '#ff0000').pal.fl).toBeUndefined();
    expect(ownBloomColors('Red and gold')).toEqual(['red', 'yellow']);
    expect(nearestFlower('#d463b4')).toBe('pink');
  });
});

describe('a placed plant', () => {
  const shape = (extra: Partial<CircleShape> = {}): CircleShape =>
    ({ id: 's1', type: 'circle', x: 0, y: 0, radius: 2, role: 'plant', plantId: 'nope', color: '#16a34a', label: '', opacity: 0.65, locked: false, ...extra });
  it("keeps a color chosen by hand through an older version's sync, which drops it, unless the color changed there", () => {
    const c = (color: string, colorSet?: true) => shape({ color, ...(colorSet ? { colorSet } : {}) });
    expect(withLocalParts({ shapes: [c('#7c3aed')] }, { shapes: [c('#7c3aed', true)] }).shapes).toEqual([c('#7c3aed', true)]);
    expect(withLocalParts({ shapes: [c('#dc2626')] }, { shapes: [c('#7c3aed', true)] }).shapes).toEqual([c('#dc2626')]);
    expect(withLocalParts({ shapes: [c('#7c3aed')] }, { shapes: [c('#7c3aed')] }).shapes).toEqual([c('#7c3aed')]);
  });
  it('drawn bigger than the largest size, is scaled up rather than thinned out', () => {
    expect(lookMarkup(shape(), LOOK_MAX_R, 'close')).not.toMatch(/^<g transform="scale/);
    expect(lookMarkup(shape(), LOOK_MAX_R * 3, 'close')).toMatch(/^<g transform="scale\(3\)">/);
  });
  it('a climbing vine: blooms along its band, and over the part of an arbor it covers', () => {
    const look = lookOf(plant({ form: 'Vine', flower_color: ['yellow'] }), '#000');
    expect(count(bandBlooms([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10, look, 20), 'circle')).toBe(5 * 2); // (two discs a bloom)
    expect(count(coverBlooms([{ x: 0, y: 0 }, { x: 96, y: 0 }, { x: 96, y: 48 }, { x: 0, y: 48 }], look, 24), 'circle')).toBeGreaterThan(4);
    expect(bandBlooms([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10, lookOf(plant({ form: 'Vine' }), '#000'))).toBe('');
    // (Each about a third of the band's width, not the whole of it: Jason, Oct 30, "oversized to my eye".)
    const radii = (svg: string) => [...svg.matchAll(/ r="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.max(...radii(bandBlooms([{ x: 0, y: 0 }, { x: 200, y: 0 }], 40, look, 40)))).toBeLessThanOrEqual(40 * 0.18 + 0.05);
    expect(Math.max(...radii(coverBlooms([{ x: 0, y: 0 }, { x: 96, y: 0 }, { x: 96, y: 48 }, { x: 0, y: 48 }], look, 24)))).toBeLessThanOrEqual(24 * 0.18 + 0.05);
  });
  it("a climbing vine close up: its leaves along the band and its blooms in their shape, as every plant's (Jason, Oct 30: \"only color blobs\")", () => {
    const look = lookOf(plant({ form: 'Vine', flower_color: ['white'], flower_form: 'Lacecap' } as Partial<Plant>), '#000');
    const line = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 60 }];
    // (Blooms: built of petals, not the mid size's two discs; the same each time it's drawn.)
    const close = bandBlooms(line, 24, look, 24, 'close', 'v1');
    expect(count(close, 'path')).toBeGreaterThan(count(close, 'circle'));
    expect(close).toBe(bandBlooms(line, 24, look, 24, 'close', 'v1'));
    expect(count(bandBlooms(line, 24, look, 24, 'yard', 'v1'), 'path')).toBe(0);
    // (Leaves: its stem and lanes of leaves close up; a mottle at mid; the band alone far out, or while it's bare.)
    const leaves = bandLeaves(line, 24, look, 'close', 'v1');
    expect(count(leaves, 'path')).toBeGreaterThan(60);
    expect(count(bandLeaves(line, 24, look, 'mid', 'v1'), 'circle')).toBeGreaterThan(5);
    expect(bandLeaves(line, 24, look, 'yard', 'v1')).toBe('');
    expect(bandLeaves(line, 24, look, 'close', 'v1', { leaves: 'bare', bloom: 'no' })).toBe('');
    // (All within the band: leaves of every plant's size, however wide it's drawn.)
    const ys = [...bandLeaves([{ x: 0, y: 0 }, { x: 200, y: 0 }], 60, look, 'close', 'v2').matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
    expect(Math.max(...ys.map(Math.abs))).toBeLessThanOrEqual(30 + 1);
  });
});

// Planned (Jason, Oct 29: his red strawberries' red dashed edge read as a warning, as To remove's is).
describe('a planned plant drawn as a picture', () => {
  it("is edged in its picture's dark leaf color, not its shape's color", () => {
    plantsById['looks-test-strawberry'] = plant({ id: 'looks-test-strawberry', common: 'Strawberry', form: 'Perennial' });
    const s = { id: 's', type: 'circle', role: 'plant', plantId: 'looks-test-strawberry', x: 0, y: 0, radius: 1, color: '#ef4444', status: 'planned', label: '' } as CircleShape;
    expect(plannedEdge(s)).toBe(lookFor(s).pal.dark);
    expect(plannedEdge(s)).not.toBe('#ef4444');
    expect(lookFor(s).pal.base).toBe('#6f9a4a'); // (green leaves: no leaf color on record)
    delete plantsById['looks-test-strawberry'];
  });
});

// Garden over time (Jason, Oct 29): each plant drawn as it is in a month.
describe('a plant in a month', () => {
  const shrub = lookOf(plant({ form: 'Shrub', flower_color: ['yellow'], flower_form: { inflorescence: ['head'] } }), '#000');
  const perennial = lookOf(plant({ form: 'Perennial', common: 'Purple coneflower', flower_color: ['brown', 'purple'], flower_form: { inflorescence: ['head'] } }), '#000');
  const on = { leaves: 'on', bloom: 'no' } as const;
  it('with no month, in bloom; in a month, in bloom only when it is, faint when only "around"', () => {
    expect(lookSvg(shrub, 40, 'a', 'close', undefined)).toBe(lookSvg(shrub, 40, 'a'));
    expect(lookSvg(shrub, 40, 'a', 'close', on)).not.toContain('#f2c230');
    expect(lookSvg(shrub, 40, 'a', 'close', { leaves: 'on', bloom: 'yes' })).toContain('#f2c230');
    const around = lookSvg(shrub, 40, 'a', 'close', { leaves: 'on', bloom: 'around' });
    expect(around).toContain('<g opacity="0.45">');
    expect(around).toContain('#f2c230');
  });
  it('bare twigs in winter for a woody plant, died back to mulch for an herb, its seed heads standing', () => {
    const bare = lookSvg(shrub, 40, 'a', 'close', { leaves: 'bare', bloom: 'no' });
    expect(bare).toContain('#ebe0c9'); // (winter's ground)
    expect(bare).toContain('#7a5a3c'); // (bare twigs)
    expect(bare).not.toContain(shrub.pal.base);
    const dormant = lookSvg(perennial, 40, 'a', 'close', { leaves: 'dormant', bloom: 'no' });
    expect(dormant).toContain('#cdb894'); // (mulch)
    expect(dormant).toContain('#4a3220'); // (a coneflower's seed heads)
  });
  it('its fall color as it colors, more of it later in fall; lighter as it leafs out', () => {
    const early = lookSvg(shrub, 40, 'a', 'yard', { leaves: 'turning', fall: '#c0392b', progress: 0, bloom: 'no' });
    const late = lookSvg(shrub, 40, 'a', 'yard', { leaves: 'turning', fall: '#c0392b', progress: 1, bloom: 'no' });
    expect(late).toContain('#c0392b');
    expect(early).not.toBe(late);
    expect(lookSvg(shrub, 40, 'a', 'yard', { leaves: 'emerging', bloom: 'no' })).not.toBe(lookSvg(shrub, 40, 'a', 'yard', on));
  });
  it('fruit where it shows, and a winter not known drawn faint', () => {
    expect(lookSvg(shrub, 40, 'a', 'close', { leaves: 'bare', bloom: 'no', fruit: '#b3202e' })).toContain('#b3202e');
    expect(lookSvg(shrub, 40, 'a', 'close', { leaves: 'unknown', bloom: 'no' })).toMatch(/^<g opacity="0.55">/);
  });
});
