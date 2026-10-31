import { describe, expect, it } from 'vitest';
import {
  buildPlanSvg, gridStep, legendEntries, pdfSafe, planLayout, plantKeys, plantSchedule, printContent, scaleBarFeet, scaleText,
} from '../src/print';
import type { Plant } from '../src/plants';
import { buildExportSVG, exportCaption, shapeToSvgString } from '../src/export';
import { state } from '../src/state';
import type { Shape } from '../src/types';

const base = { color: '#16a34a', label: '', opacity: 0.65, locked: false };
const bed = (id: string, label: string, x: number, y: number, w: number, h: number): Shape =>
  ({ ...base, id, type: 'rect', x, y, width: w, height: h, rotation: 0, role: 'bed', label, color: '#92400e' } as Shape);
const plant = (id: string, label: string, x: number, y: number, plantId?: string): Shape =>
  ({ ...base, id, type: 'circle', x, y, radius: 1, role: 'plant', label, ...(plantId ? { plantId } : {}) } as Shape);

describe('sheet layout', () => {
  it('picks the largest standard scale that fits', () => {
    // 40 x 30 ft on landscape letter: the drawing area is about 7 x 7.7 in -> needs 5.7 ft/in -> 8.
    const l = planLayout('letter', 'landscape', { minX: 0, maxX: 40, minY: 0, maxY: 30 });
    expect(l.ftPerIn).toBe(8);
    expect(l.window.maxX - l.window.minX).toBeCloseTo(l.plan.w * 8);
    expect((l.window.minX + l.window.maxX) / 2).toBeCloseTo(20); // centered
    expect(l.plan.x + l.plan.w).toBeLessThan(l.side.x);
  });
  it('auto-orients to draw a tall yard bigger', () => {
    const tall = { minX: 0, maxX: 30, minY: 0, maxY: 90 };
    expect(planLayout('tabloid', 'auto', tall).orientation).toBe('portrait');
    expect(planLayout('tabloid', 'auto', tall).ftPerIn).toBe(8);
    expect(planLayout('tabloid', 'auto', { minX: 0, maxX: 90, minY: 0, maxY: 30 }).orientation).toBe('landscape');
    expect(planLayout('tabloid', 'portrait', tall).ftPerIn).toBeLessThan(planLayout('letter', 'portrait', tall).ftPerIn);
  });
  it('falls back to a round scale for very large areas', () => {
    expect(planLayout('letter', 'landscape', { minX: 0, maxX: 10000, minY: 0, maxY: 10 }).ftPerIn).toBe(1500);
  });
  it('labels scales and scale bars sensibly', () => {
    expect(scaleText(8)).toBe('1 in = 8 ft (1/8 in = 1 ft)');
    expect(scaleText(20)).toBe('1 in = 20 ft');
    expect(scaleBarFeet(8)).toBe(10);
    expect(scaleBarFeet(20)).toBe(40);
    expect(scaleBarFeet(4)).toBe(5);
    expect(gridStep(4)).toBe(1);
    expect(gridStep(40)).toBe(5);
  });
});

describe('plant list', () => {
  const plants: Record<string, Plant> = { cf: { id: 'cf', common: 'Coneflower', botanical: 'Echinacea purpurea' } as Plant };
  const shapes = [
    bed('b1', 'Front', 0, 0, 10, 10), bed('b2', '', 20, 0, 10, 10),
    plant('p1', 'Coneflower', 2, 2, 'cf'), plant('p2', 'Coneflower', 4, 2, 'cf'), plant('p3', 'Aster', 22, 2),
    plant('p4', 'Coneflower', 50, 50, 'cf'), plant('p5', '', 51, 50),
  ];
  it('counts plants by name within each bed, beds by name, loose plants last', () => {
    const groups = plantSchedule(shapes, plants);
    expect(groups.map((g) => [g.bed, g.total])).toEqual([['Front', 2], ['Unnamed bed 1', 1], ['Not in a bed', 2]]);
    expect(groups[0].rows).toEqual([{ label: 'Coneflower', botanical: 'Echinacea purpurea', count: 2, key: 1 }]);
    expect(groups[2].rows.map((r) => r.label)).toEqual(['Coneflower', 'Unlabeled plant']);
  });
  it('gives each plant name one key number everywhere, in the order the plan got them: a rename renumbers nothing else (Grace)', () => {
    expect([...plantKeys(shapes)]).toEqual([['Coneflower', 1], ['Aster', 2], ['Unlabeled plant', 3]]);
    const renamed = shapes.map((s) => (s.id === 'p3' ? { ...s, label: 'Aromatic aster' } : s));
    expect([...plantKeys(renamed)]).toEqual([['Coneflower', 1], ['Aromatic aster', 2], ['Unlabeled plant', 3]]);
    // (Drawn in another order, tallest last: numbered by the plan's order all the same.)
    expect([...plantKeys([...shapes].reverse(), shapes)]).toEqual([['Coneflower', 1], ['Aster', 2], ['Unlabeled plant', 3]]);
    const svg = buildPlanSvg(planLayout('letter', 'auto', printContent(shapes, null, false).bounds!), shapes, null,
      { includeBackground: false, includeGrid: false, includePlantList: true }, 100).svg;
    expect(svg.match(/>1<\/text>/g)).toHaveLength(3); // three coneflowers
    expect(svg).not.toContain('>Coneflower<');
  });
  it('groups plants by their beds even when the beds themselves are left out (hidden in Layers: round 3, Jordan)', () => {
    const groups = plantSchedule(shapes.filter((s) => s.role !== 'bed'), plants, shapes);
    expect(groups.map((g) => [g.bed, g.total])).toEqual([['Front', 2], ['Unnamed bed 1', 1], ['Not in a bed', 2]]);
  });
  it('is empty without plants', () => {
    expect(plantSchedule([bed('b', 'B', 0, 0, 1, 1)], {})).toEqual([]);
  });
});

describe('legend and text', () => {
  it('has one entry per role on the plan, in role order', () => {
    const fence = { ...base, id: 'f', type: 'line', x: 0, y: 0, points: [[0, 0], [5, 0]], rotation: 0, role: 'boundary', color: '#44403c' } as Shape;
    const note = { ...base, id: 'n', type: 'text', x: 0, y: 0, label: 'hi', fontSize: 1, rotation: 0, role: 'other' } as Shape;
    const e = legendEntries([plant('p', 'A', 0, 0), bed('b', 'B', 0, 0, 1, 1), fence, note]);
    expect(e.map((x) => [x.key, x.outline])).toEqual([['plant', false], ['bed', false], ['boundary', true]]);
  });
  it('gives each kind of utility its own line: a power line solid, a buried line dashed, a septic field filled', () => {
    const wire = (id: string, utility: string, color: string) => ({ ...base, id, type: 'line', x: 0, y: 0, points: [[0, 0], [5, 0]], rotation: 0, role: 'utility', utility, color } as Shape);
    const field = { ...bed('s', 'Septic field', 0, 0, 4, 4), role: 'utility', utility: 'septic', color: '#78716c' } as Shape;
    const e = legendEntries([wire('w', 'overhead', '#ea580c'), wire('b', 'buried', '#a16207'), field]);
    expect(e.map((x) => [x.label, x.outline, !!x.solid])).toEqual([['Overhead power line', true, true], ['Buried line', true, false], ['Septic field', false, false]]);
  });
  it('makes text safe for the PDF fonts', () => {
    expect(pdfSafe('Heuchera ‘Autumn Bride’ — 3× ☀ café')).toBe("Heuchera 'Autumn Bride' - 3×  café");
  });
});

describe('the exported picture', () => {
  it('says what Layers leaves out of it, and nothing when it shows everything (Priya, Oct 30)', () => {
    state.shapes = [plant('p1', 'Aster', 0, 0), { ...bed('b', 'Front', 0, 0, 4, 4), role: 'lawn' } as Shape];
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = {};
    expect(exportCaption()).toBe('');
    state.viewFilter = { status: 'planned', phase: 'Spring 2027', showGone: false };
    state.roleViews = { lawn: { hidden: true }, water: { hidden: true } }; // (no water on the plan: not said)
    expect(exportCaption()).toBe('Showing planned plants in Spring 2027 only · Hidden in Layers: Lawn');
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = {};
  });
  it('names a run of one small plant once, as the plan does (round 3, Jordan: ten names over each other)', () => {
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = {};
    state.shapes = Array.from({ length: 10 }, (_, i) => ({ ...plant(`l${i}`, 'Big blue lilyturf', i * 1.2, 0), radius: 0.6 } as Shape));
    const svg = buildExportSVG()!.svg;
    expect(svg.match(/Big blue lilyturf/g)).toHaveLength(1);
    expect(svg).toContain('Big blue lilyturf \u00d710');
    state.shapes = [];
  });
  it('marks a locked shape with a padlock, not a dashed edge; a sun area with its hours', () => {
    const house = { ...bed('h', 'House', 0, 0, 10, 8), role: 'building', locked: true } as Shape;
    const svg = shapeToSvgString(house, 0, 0, 10);
    expect(svg).toContain('data-role="locked-badge"');
    expect(svg).not.toContain('stroke-dasharray');
    const sun = { ...bed('s', 'Front of house', 0, 0, 10, 8), role: 'shade', sun: { mode: 'hours', hours: 6 } } as Shape;
    expect(shapeToSvgString(sun, 0, 0, 10)).toContain('Front of house · ☀ 6 h');
    // (A round one too: round 3, Tom's "East lawn" printed without its hours.)
    const round = { id: 'c', type: 'circle', x: 20, y: 20, radius: 13, color: '#64748b', opacity: 0.3, locked: false, label: 'East lawn', role: 'shade', sun: { mode: 'hours', hours: 6 } } as Shape;
    expect(shapeToSvgString(round, 0, 0, 10)).toContain('East lawn · ☀ 6 h');
  });
});
