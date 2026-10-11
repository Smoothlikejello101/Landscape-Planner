import { describe, expect, it } from 'vitest';
import { attachedPlants, bedOf, patchBedCarryingPlants, plantSummary, plantsInBed } from '../src/beds';
import { pointInShape, shapeArea, shapePerimeter, shapeCenter } from '../src/geometry';
import { afternoonHours, checkPlantSun, formatTime, shadeOpacity, sunHours, sunLevel } from '../src/sun';
import type { Plant } from '../src/plants';
import type { Shape, SunInfo } from '../src/types';

const base = { color: '#000000', label: '', opacity: 1, locked: false };
const rect = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id, type: 'rect', x, y, width: w, height: h, rotation: 0, ...extra } as Shape);
const plant = (id: string, x: number, y: number, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id, type: 'circle', x, y, radius: 1, role: 'plant', label: id, ...extra } as Shape);
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('point in shape', () => {
  it('handles rotated rectangles, ovals and triangles', () => {
    const r = rect('r', 0, 0, 10, 2, { rotation: 90 }); // center (5,1); rotated it spans x 4..6, y -4..6
    expect(pointInShape(r, { x: 5, y: 5 })).toBe(true);
    expect(pointInShape(r, { x: 9, y: 1 })).toBe(false);
    const o = { ...base, id: 'o', type: 'oval', x: 0, y: 0, width: 4, height: 2, rotation: 0 } as Shape;
    expect(pointInShape(o, { x: 2, y: 1 })).toBe(true);
    expect(pointInShape(o, { x: 0.2, y: 0.2 })).toBe(false); // box corner, outside the ellipse
    const t = { ...base, id: 't', type: 'triangle', x: 0, y: 0, width: 4, height: 4, rotation: 0, rightAngle: 'bl' } as Shape;
    expect(pointInShape(t, { x: 1, y: 3 })).toBe(true);
    expect(pointInShape(t, { x: 3, y: 1 })).toBe(false);
  });
  it('measures area and perimeter', () => {
    expect(shapeArea(rect('r', 0, 0, 4, 3))).toBe(12);
    expect(shapePerimeter(rect('r', 0, 0, 4, 3))).toBe(14);
    close(shapePerimeter({ ...base, id: 'o', type: 'oval', x: 0, y: 0, width: 4, height: 4, rotation: 0 } as Shape), 4 * Math.PI);
  });
});

describe('bed membership', () => {
  const big = rect('big', 0, 0, 20, 10, { role: 'bed' });
  const small = rect('small', 2, 2, 4, 4, { role: 'bed' });
  const shapes = [big, small, plant('a', 3, 3), plant('b', 15, 5), plant('c', 30, 30), plant('d', 15, 6, { label: 'b' })];
  it('assigns each plant to the smallest bed containing its center', () => {
    expect(bedOf(shapes[2], shapes)).toBe(small);
    expect(bedOf(shapes[3], shapes)).toBe(big);
    expect(bedOf(shapes[4], shapes)).toBeNull();
    expect(plantsInBed(big, shapes).map((p) => p.id)).toEqual(['b', 'd']);
    expect(plantSummary(plantsInBed(big, shapes))).toEqual([{ label: 'b', count: 2 }]);
  });
  it('does not carry locked plants or when carrying is off', () => {
    const locked = plant('l', 15, 5, { locked: true });
    expect(attachedPlants(big, [big, locked])).toEqual([]);
    expect(attachedPlants({ ...big, carryPlants: false }, [{ ...big, carryPlants: false }, plant('x', 1, 1)])).toEqual([]);
  });
  it('moving a bed moves its plants; resizing does not', () => {
    const bed = rect('bed', 0, 0, 10, 10, { role: 'bed' });
    const p = plant('p', 2, 3);
    const all = [bed, p];
    expect(patchBedCarryingPlants(bed, { x: 5, y: -1 }, all)).toEqual(['p']);
    expect([p.x, p.y]).toEqual([7, 2]);
    patchBedCarryingPlants(bed, { width: 30 }, all);
    expect([p.x, p.y]).toEqual([7, 2]);
  });
  it('rotating a bed swings its plants around the bed center', () => {
    const bed = rect('bed', 0, 0, 10, 10, { role: 'bed' }); // center (5,5)
    const p = plant('p', 8, 5);
    patchBedCarryingPlants(bed, { rotation: 90 }, [bed, p]);
    close(shapeCenter(p).x, 5); close(shapeCenter(p).y, 8);
  });
});

describe('sun', () => {
  const times = (periods: [number, number][], extra: Partial<SunInfo> = {}): SunInfo => ({ mode: 'times', periods, hours: 0, dappled: false, ...extra });
  it('totals sunny periods, counting overlaps once', () => {
    expect(sunHours(times([[540, 720], [660, 780]]))).toBe(4); // 9–12 and 11–1 → 9–1
    expect(sunHours({ mode: 'hours', periods: [], hours: 5.5, dappled: false })).toBe(5.5);
  });
  it('measures afternoon sun only from times', () => {
    expect(afternoonHours(times([[600, 900]]))).toBe(2); // 10–3 pm → 1–3 pm
    expect(afternoonHours({ mode: 'hours', periods: [], hours: 8, dappled: false })).toBeNull();
  });
  it('classifies sun and caps dappled light at part', () => {
    expect(sunLevel(times([[480, 900]]))).toBe('Full');
    expect(sunLevel(times([[480, 900]], { dappled: true }))).toBe('Part');
    expect(sunLevel(times([[540, 720]]))).toBe('Part');
    expect(sunLevel(times([[540, 600]]))).toBe('Shade');
  });
  it('darkens the overlay for less sun', () => {
    expect(shadeOpacity(times([[540, 600]]))).toBeGreaterThan(shadeOpacity(times([[480, 900]])));
  });
  it('formats times', () => {
    expect(formatTime(540)).toBe('9 am');
    expect(formatTime(780)).toBe('1 pm');
    expect(formatTime(750)).toBe('12:30 pm');
  });
});

describe('plant sun check', () => {
  const shade = (sun: SunInfo) => rect('shade', 0, 0, 10, 10, { role: 'shade', sun });
  const heuchera: Plant = { id: 'h', common: 'Heuchera', sun_most: 'Part', sun_least: 'Shade' };
  const coneflower: Plant = { id: 'c', common: 'Coneflower', sun_most: 'Full', sun_least: 'Part' };
  const p = plant('p', 5, 5);
  it('flags too much and too little sun', () => {
    const sunny = shade({ mode: 'hours', periods: [], hours: 8, dappled: false });
    expect(checkPlantSun(p, heuchera, [sunny, p])).toMatchObject({ ok: false });
    const dark = shade({ mode: 'hours', periods: [], hours: 1, dappled: false });
    expect(checkPlantSun(p, coneflower, [dark, p])?.message).toMatch(/only about 1 h/);
  });
  it('flags hot afternoon sun for part-shade plants', () => {
    const pm = shade({ mode: 'times', periods: [[780, 1020]], hours: 0, dappled: false }); // 1–5 pm = 4 h
    expect(checkPlantSun(p, heuchera, [pm, p])?.message).toMatch(/afternoon/);
    const am = shade({ mode: 'times', periods: [[480, 720]], hours: 0, dappled: false }); // 8–noon
    expect(checkPlantSun(p, heuchera, [am, p])).toMatchObject({ ok: true });
  });
  it('says nothing outside recorded shade or without plant data', () => {
    expect(checkPlantSun(plant('far', 50, 50), heuchera, [shade({ mode: 'hours', periods: [], hours: 1, dappled: false })])).toBeNull();
    expect(checkPlantSun(p, undefined, [shade({ mode: 'hours', periods: [], hours: 1, dappled: false })])).toBeNull();
  });
  it('uses the darkest of overlapping shade areas', () => {
    const a = shade({ mode: 'hours', periods: [], hours: 7, dappled: false });
    const b = { ...shade({ mode: 'hours', periods: [], hours: 1, dappled: false }), id: 'b' };
    expect(checkPlantSun(p, coneflower, [a, b, p])?.ok).toBe(false);
  });
});
