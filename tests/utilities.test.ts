import { describe, expect, it } from 'vitest';
import type { Plant } from '../src/plants';
import { withLocalParts } from '../src/sync/engine';
import type { Shape } from '../src/types';
import { distanceToLine, issuesKey, matureHeight, prepareUtilities, utilityIssues, utilityWarningShown, woody } from '../src/utilities';

const byId: Record<string, Plant> = {
  oak: { id: 'oak', common: 'White oak', form: 'Tree', width: { min: 60, max: 80, med: 70 }, height: { min: 50, max: 70, med: 60 } } as Plant,
  redbud: { id: 'redbud', common: 'Redbud', form: 'Tree', width: { min: 25, max: 35, med: 30 }, height: { min: 20, max: 30, med: 25 } } as Plant,
  maple: { id: 'maple', common: 'Red maple', form: 'Tree', width: { min: 30, max: 50, med: 40 }, height: { min: 30, max: 50, med: 40 } } as Plant,
  shrub: { id: 'shrub', common: 'Spicebush', form: 'Shrub', width: { min: 4, max: 8, med: 6 }, height: { min: 4, max: 8, med: 6 } } as Plant,
  bee: { id: 'bee', common: 'Bee balm', form: 'Perennial', width: { min: 2, max: 3, med: 2.5 }, height: { min: 2, max: 4, med: 3 } } as Plant,
  basil: { id: 'basil', common: 'Basil', form: 'Annual', edible: true, width: { min: 1, max: 2, med: 1.5 }, height: { min: 1, max: 2, med: 1.5 } } as Plant,
  vine: { id: 'vine', common: 'Crossvine', form: 'Vine', width: { min: 6, max: 9, med: 7.5 }, height: { min: 30, max: 50, med: 40 } } as Plant,
  myrtle: { id: 'myrtle', common: 'Wax myrtle', form: 'Shrub', width: { min: 15, max: 25, med: 20 }, height: { min: 20, max: 40, med: 30 } } as Plant,
};
const base = { color: '#16a34a', opacity: 0.65, locked: false, label: '' };
const plant = (id: string, plantId: string | undefined, x: number, y = 0, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id, type: 'circle', x, y, radius: 2, role: 'plant', ...(plantId ? { plantId } : {}), ...extra } as Shape);
// A power line along y = 0, from x = -100 to 100; a buried line the same; a 20 × 10 ft septic field from (0, 20).
const wire = (utility: 'overhead' | 'buried'): Shape => ({ ...base, id: utility, type: 'line', role: 'utility', utility, x: -100, y: 0, rotation: 0, points: [[0, 0], [200, 0]] } as Shape);
const field: Shape = { ...base, id: 'septic', type: 'rect', role: 'utility', utility: 'septic', x: 0, y: 20, width: 20, height: 10, rotation: 0 } as Shape;
const issues = (s: Shape, shapes: Shape[]) => utilityIssues(s, prepareUtilities(shapes), byId);
const at = (s: Shape, shapes: Shape[]) => issues(s, shapes).map((i) => i.line);

describe('near a utility', () => {
  it('measures to the nearest point of a line, round a closed outline too', () => {
    expect(distanceToLine([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 5, y: 3 })).toBe(3);
    expect(distanceToLine([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 13, y: 4 })).toBe(5);
    expect(distanceToLine([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], { x: 0, y: 5 }, true)).toBeCloseTo(Math.SQRT1_2 * 5, 6);
  });
  it("knows a plant's mature height where a source or the person gave one, and what's woody", () => {
    expect(matureHeight(plant('o', 'oak', 0), byId)).toBe(60);
    expect(matureHeight(plant('t', undefined, 0, 0, { tree: true, radius: 10 }), byId)).toBeNull(); // (a stand-in, not a height)
    expect(matureHeight(plant('t', undefined, 0, 0, { tree: true, radius: 10, treeHeight: 35 }), byId)).toBe(35);
    expect([woody(plant('a', 'shrub', 0), byId), woody(plant('b', 'bee', 0), byId), woody(plant('t', undefined, 0, 0, { tree: true }), byId)]).toEqual([true, false, true]);
  });
  it('an overhead line: within 20 ft, 25 ft at most; to 50 ft, under 40 ft; taller trees farther (UF/IFAS)', () => {
    const line = wire('overhead');
    expect(at(plant('r', 'redbud', 0, 10), [line])).toEqual([]); // (25 ft: fine within 20 ft)
    expect(at(plant('m', 'maple', 0, 10), [line])).toEqual(['Grows to 40 ft, 10 ft from a power line']);
    expect(at(plant('m', 'maple', 0, 30), [line])).toEqual(['Grows to 40 ft, 30 ft from a power line']); // (40: not under 40)
    expect(at(plant('m', 'maple', 0, 50), [line])).toEqual([]);
    expect(at(plant('o', 'oak', 0, 49), [line])).toEqual(['Grows to 60 ft, 49 ft from a power line']);
    expect(at(plant('s', 'shrub', 0, 1), [line])).toEqual([]);
    expect(at(plant('w', 'myrtle', 0, 10), [line])).toEqual(['Grows to 30 ft, 10 ft from a power line']); // (a shrub grown tall)
    expect(at(plant('v', 'vine', 0, 8), [line])).toEqual([]); // (a vine's height is how far it climbs)
    expect(at(plant('t', undefined, 0, 5, { tree: true, radius: 20 }), [line])).toEqual([]); // (no height: not checked)
    expect(at(plant('g', 'oak', 0, 5, { status: 'gone' }), [line])).toEqual([]);
  });
  it('a buried line: trees and shrubs within 10 ft; smaller plants not', () => {
    const line = wire('buried');
    expect(at(plant('s', 'shrub', 0, 4), [line])).toEqual(['4 ft from a buried line']);
    expect(at(plant('s', 'shrub', 0, 10), [line])).toEqual([]);
    expect(at(plant('b', 'bee', 0, 1), [line])).toEqual([]);
  });
  it('a septic field: trees and shrubs nearer it than they grow tall, or on it; not the perennials UGA suggests for it', () => {
    expect(at(plant('s', 'shrub', 10, 25), [field])).toEqual(['On the septic field']);
    expect(at(plant('s', 'shrub', 10, 15), [field])).toEqual(['5 ft from the septic field, 6 ft tall']);
    expect(at(plant('s', 'shrub', 10, 13), [field])).toEqual([]); // (7 ft away, 6 ft tall)
    expect(at(plant('o', 'oak', 10, -30), [field])).toEqual(['50 ft from the septic field, 60 ft tall']);
    // (The catalog's "edible" takes in bee balm and yarrow, which UGA suggests for the field: the field's own note
    // says not to grow food on it, and no plant is flagged for it.)
    expect(at(plant('b', 'basil', 10, 25), [field])).toEqual([]);
    expect(at(plant('b', 'bee', 10, 25), [field])).toEqual([]);
  });
  it('a dismissed warning stays hidden while it reads the same, and comes back when it changes', () => {
    const line = wire('overhead');
    const m = plant('m', 'maple', 0, 10);
    const found = issues(m, [line]);
    expect(issuesKey(found)).toBe('overhead:near');
    expect(utilityWarningShown({ ...m, utilityDismissed: issuesKey(found) }, found)).toBe(false);
    // (Moved a little, the same rule: still dismissed. Moved out to 30 ft, another rule: shown again.)
    const nudged = { ...m, y: 12, utilityDismissed: issuesKey(found) };
    expect(utilityWarningShown(nudged, issues(nudged, [line]))).toBe(false);
    const moved = { ...m, y: 30, utilityDismissed: issuesKey(found) };
    expect(utilityWarningShown(moved, issues(moved, [line]))).toBe(true);
    // (Not checked unless it says which, as this version knows it: a plain line, or a later version's kind.)
    expect(at(m, [{ ...line, utility: undefined }])).toEqual([]);
    expect(at(m, [{ ...line, utility: 'gas' as never }])).toEqual([]);
  });
});

describe('synced through an older version', () => {
  it("an older version's copy, which drops the role it doesn't know and its kind, keeps this device's", () => {
    const mine = { shapes: [wire('overhead')] };
    const { role: _r, utility: _u, ...old } = wire('overhead') as Shape & { utility?: string };
    expect((withLocalParts({ shapes: [old] }, mine).shapes as object[])[0]).toMatchObject({ role: 'utility', utility: 'overhead' });
    // (Made something else on purpose: it keeps its kind, so isn't taken for that.)
    const plain = { ...old, utility: 'overhead' };
    expect((withLocalParts({ shapes: [plain] }, mine).shapes as object[])[0]).not.toHaveProperty('role');
    // A plant's dismissed warning likewise; one shown again on purpose ('') stays shown.
    const oak = plant('o', 'oak', 0, 5, { utilityDismissed: 'overhead:near' });
    const { utilityDismissed: _d, ...oldOak } = oak as Shape & { utilityDismissed?: string };
    expect((withLocalParts({ shapes: [oldOak] }, { shapes: [oak] }).shapes as object[])[0]).toMatchObject({ utilityDismissed: 'overhead:near' });
    expect((withLocalParts({ shapes: [{ ...oldOak, utilityDismissed: '' }] }, { shapes: [oak] }).shapes as object[])[0]).toMatchObject({ utilityDismissed: '' });
  });
});
