import { beforeEach, describe, expect, it } from 'vitest';
import { BED_VEIL, QUIET_OPACITY, quietBedName, quietInk } from '../src/canvas';
import { nameInside, nameSpot } from '../src/label-room';
import { state } from '../src/state';
import type { Shape } from '../src/types';

// Jason's notes of Nov 4, 9:02 PM: 2 (the placing look for a bed), 5 (bed names quiet under plants), 6 (labels zoomed
// far out no bigger than what they name). Note 4 (a run named once at every zoom) is in tests/roles.test.ts.

const base = { color: '#92400e', opacity: 0.3, locked: false, rotation: 0, label: 'x' };
const rect = (x: number, y: number, width: number, height: number, extra: object = {}) => ({ ...base, id: 'r', type: 'rect', x, y, width, height, ...extra } as Shape);
const line = (points: [number, number][], extra: object = {}) => ({ ...base, id: 'l', type: 'line', x: 0, y: 0, points, ...extra } as Shape);
const poly = (points: [number, number][], extra: object = {}) => ({ ...base, id: 'p', type: 'poly', x: 0, y: 0, points, ...extra } as Shape);
/** px a foot at a zoom. */
const at = (zoom: number) => 24 * zoom;

describe("a name zoomed far out fits inside its shape, or isn't drawn (Jason's note 6)", () => {
  it('a bed: inside it at 20%, not at 5% (a 4.5 × 10 ft bed is 5 px across there)', () => {
    const bed = rect(0, 0, 4.5, 10, { role: 'bed' });
    // ("Bed" at 10 px: 18.6 px long.)
    expect(nameInside(bed, 18.6, 10, at(0.2))).toBe(true);
    expect(nameInside(bed, 18.6, 10, at(0.05))).toBe(false);
  });
  it('a long, narrow bed: its name across it is outside it; along it (the bed turned on its side), inside', () => {
    // (Jason's Carport bed, 1.5 × 18.5 ft: "Carport" 37 px across it.)
    expect(nameInside(rect(0, 0, 1.5, 18.5, { role: 'bed' }), 37, 10, at(0.2))).toBe(false);
    // (Drawn 3 ft wide, turned a quarter: its name stays upright, along it now.)
    const turned = rect(0, 0, 3, 18.5, { role: 'bed', rotation: 90 });
    expect(nameSpot(turned).angle).toBe(0);
    expect(nameInside(turned, 37, 10, at(0.2))).toBe(true);
    // (Turned a little, its name turns with it, and still fits.)
    const tilted = rect(0, 0, 18.5, 3, { role: 'bed', rotation: 20 });
    expect(nameSpot(tilted).angle).toBe(20);
    expect(nameInside(tilted, 37, 10, at(0.2))).toBe(true);
  });
  it("a path: its name inside its band; Jason's path, turning a corner, has none at 5% or 20% (\"Path\" was 21 ft across it at 5%)", () => {
    const jasons = line([[2, 0], [0, 2.5], [0, 11], [0, 23], [0.5, 23.5], [24.5, 23.5]], { role: 'path', pathWidth: 2.5, label: 'Path' });
    expect(nameInside(jasons, 25.8, 12, at(0.05))).toBe(false);
    expect(nameInside(jasons, 25.8, 12, at(0.2))).toBe(false);
    // (A straight one across the plan: its name fits its 2.5 ft band at 20%, 12 px; not under that.)
    const straight = line([[0, 0], [30, 0]], { role: 'path', pathWidth: 2.5 });
    expect(nameInside(straight, 25.8, 12, at(0.2))).toBe(true);
    expect(nameInside(straight, 25.8, 12, at(0.19))).toBe(false);
  });
  it('a thin line (a utility, a trellis, a fence) and a boundary named along its line: no inside', () => {
    expect(nameInside(line([[0, 0], [70, 0]], { role: 'utility', utility: 'buried' }), 61, 12, at(0.2))).toBe(false);
    expect(nameInside(line([[0, 0], [70, 0]], { role: 'structure' }), 34, 12, at(0.2))).toBe(false);
    expect(nameInside(poly([[0, 0], [60, 0], [60, 160], [0, 160]], { role: 'boundary' }), 17, 12, at(0.2))).toBe(false);
  });
  it('an outline (a driveway, a house): its name inside where its shape puts it, the roomiest part', () => {
    // (A driveway 18 ft wide and 70 long: "Driveway" across it, 37 ft at 5%, sticks out both sides; 13 ft at 20%, inside.)
    const drive = poly([[0, 0], [18, 0], [18, 70], [0, 70]], { role: 'path' });
    expect(nameInside(drive, 44.8, 10, at(0.05))).toBe(false);
    expect(nameInside(drive, 62.4, 14, at(0.2))).toBe(true);
    // (A house 40 × 30 ft with a porch: "House", 32.5 px at 5%, 27 ft, inside it.)
    const house = poly([[0, 0], [40, 0], [40, 30], [24, 30], [24, 36], [16, 36], [16, 30], [0, 30]], { role: 'building' });
    expect(nameInside(house, 32.5, 10.6, at(0.05))).toBe(true);
  });
  it("a circle that isn't a plant: inside it", () => {
    const stump = { ...base, id: 'c', type: 'circle', x: 0, y: 0, radius: 0.65, role: 'other' } as Shape;
    expect(nameInside(stump, 31, 10, at(0.2))).toBe(false);
    expect(nameInside({ ...stump, radius: 20 } as Shape, 31, 10, at(0.2))).toBe(true);
  });
});

describe("bed names quiet, under their plants, while plants are shown (Jason's note 5)", () => {
  beforeEach(() => { state.roleViews = {}; });
  it('a bed with the Plants layer shown; not with it hidden; never another kind of area', () => {
    const bed = rect(0, 0, 4, 4, { role: 'bed' });
    expect(quietBedName(bed)).toBe(true);
    state.roleViews = { plant: { hidden: true } };
    expect(quietBedName(bed)).toBe(false);
    state.roleViews = {};
    for (const role of ['shade', 'path', 'lawn', 'building', 'other']) expect(quietBedName(rect(0, 0, 4, 4, { role })), role).toBe(false);
  });
  it("in a darker shade of the bed's own color, see-through: about 3:1 on Jason's beds, where it was near-black at 9:1", () => {
    expect(quietInk('#92400e')).toBe('#5d2e12');
    expect(quietInk('not a color')).toMatch(/^#[0-9a-f]{6}$/);
    // (The contrast, as WCAG measures it, on his beds: #92400e at 30% over the plan's ground, #ede0c8.)
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const over = (top: number[], a: number, under: number[]) => top.map((v, i) => v * a + under[i] * (1 - a));
    const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const contrast = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const bed = over(rgb('#92400e'), 0.3, rgb('#ede0c8'));
    const quiet = contrast(over(rgb(quietInk('#92400e')), QUIET_OPACITY, bed), bed);
    expect(quiet).toBeGreaterThan(2.5);
    expect(quiet).toBeLessThan(4);
    expect(contrast(rgb('#0f172a'), bed)).toBeGreaterThan(8);
  });
});

describe("placing For a bed, the rest of the plan dimmed, not tinted (Jason's note 2)", () => {
  it('a neutral veil: gray, its channels within a few steps of each other, dimming by about a third', () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(BED_VEIL.color.slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(6);
    expect(Math.max(r, g, b)).toBeLessThan(40);
    expect(BED_VEIL.opacity).toBeGreaterThanOrEqual(0.25);
    expect(BED_VEIL.opacity).toBeLessThanOrEqual(0.4);
  });
});
