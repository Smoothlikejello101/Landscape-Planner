import { describe, expect, it } from 'vitest';
import type { Plant } from '../src/plants';
import { bandBlooms, bloomKind, coverBlooms, flowerColorOf, levelOf, lookOf, lookSvg } from '../src/looks';
import { LOOK_MAX_R, lookMarkup } from '../src/plant-looks';
import type { CircleShape } from '../src/types';
import { withLocalParts } from '../src/sync/engine';

// Plant looks (Jason, Oct 27–29: R5c, version 3, every plant in bloom until garden over time brings a month
// slider; no leaf color on record: default green).

const plant = (extra: Partial<Plant>): Plant => ({ id: 'p', common: 'Plant', form: 'Shrub', ...extra } as Plant);
const count = (svg: string, tag: string) => (svg.match(new RegExp(`<${tag}\\b`, 'g')) ?? []).length;

describe('how much of a plant is drawn, by its size on the screen', () => {
  it('every leaf close up (22 px and up), branches and bold blooms in between, spots from the whole yard', () => {
    expect([levelOf(40), levelOf(22), levelOf(21.9), levelOf(10), levelOf(9.9)]).toEqual(['close', 'close', 'mid', 'mid', 'yard']);
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
  });
});
