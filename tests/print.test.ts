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

/** Where a name was drawn in an SVG, and the room it takes (at the tests' estimate of 0.55 of the size a letter). */
function nameBox(svg: string, label: string): { x0: number; x1: number; y0: number; y1: number; at: number } {
  const m = new RegExp(`<text x="([-\\d.e]+)" y="([-\\d.e]+)"[^>]*font-size="([\\d.e]+)"[^>]*>${label.replace(/'/g, '&#39;')}</text>`).exec(svg);
  if (!m) throw new Error(`no ${label}`);
  const x = +m[1], y = +m[2], fs = +m[3], w = label.length * 0.55 * fs, h = fs * 1.2;
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, at: m.index };
}
const meets = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** A circle's place in an SVG, by the order it's drawn in. */
const circlesAt = (svg: string) => [...svg.matchAll(/<circle cx="([-\d.e]+)" cy="([-\d.e]+)" r="([\d.e]+)"/g)].map((m) => ({ x: +m[1], y: +m[2], r: +m[3], at: m.index }));

describe("the areas' names (the UI review, 2026-11-01: Driveway over Driveway flower bed; bed names under plants)", () => {
  // A driveway, a narrow bed of plants beside it, and a bed planted along its middle.
  const drive = { ...bed('d', 'Driveway', 60, 28, 10, 27), role: 'path', color: '#a8a29e' } as Shape;
  const beside = bed('db', 'Driveway flower bed', 71, 31, 5, 21);
  const front = bed('fb', 'Front shrub bed', 20, 28, 38, 6);
  const plants = [
    ...Array.from({ length: 6 }, (_, i) => plant(`c${i}`, 'Wild columbine', 73.5, 33 + i * 3.4)),
    ...[23, 30, 37, 44, 51].map((x, i) => ({ ...plant(`s${i}`, "Yaupon 'Dwarf'", x, 31), radius: 2 } as Shape)),
  ];
  // (On the whole lot, as Dana's printed, at 1 in = 16 ft or more: there the names are big beside the beds.)
  const lot = { ...bed('lot', '', -10, -60, 112, 123), role: 'boundary', color: '#57534e' } as Shape;
  const shapes = [lot, drive, beside, front, ...plants];
  it('prints "Driveway" and the bed beside it clear of each other', () => {
    const layout = planLayout('letter', 'landscape', printContent(shapes, null, false).bounds!);
    expect(layout.ftPerIn).toBeGreaterThanOrEqual(16);
    const svg = buildPlanSvg(layout, shapes, null, { includeBackground: false, includeGrid: false, includePlantList: true, order: shapes }, 100).svg;
    expect(meets(nameBox(svg, 'Driveway'), nameBox(svg, 'Driveway flower bed'))).toBe(false);
    expect(svg).toContain('>Front shrub bed<');
  });
  it('draws a bed\'s name over its plants, and clear of them where there\'s room, in a picture and on paper', () => {
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = {};
    state.showNames = true;
    state.shapes = shapes;
    const picture = buildExportSVG()!.svg;
    state.shapes = [];
    const layout = planLayout('letter', 'auto', printContent(shapes, null, false).bounds!);
    const paper = buildPlanSvg(layout, shapes, null, { includeBackground: false, includeGrid: false, includePlantList: true, order: shapes }, 100).svg;
    for (const svg of [picture, paper]) {
      const circles = circlesAt(svg);
      for (const name of ['Front shrub bed', 'Driveway flower bed']) {
        const b = nameBox(svg, name);
        expect(circles.every((c) => c.at < b.at)).toBe(true); // (drawn after every plant)
        expect(circles.some((c) => Math.hypot(Math.max(b.x0, Math.min(c.x, b.x1)) - c.x, Math.max(b.y0, Math.min(c.y, b.y1)) - c.y) < c.r)).toBe(false);
      }
    }
  });
});

describe('as the screen shows it (Jason, Oct 31: print and pictures start from the screen)', () => {
  it('with names hidden, no names, lengths, sun hours or plant numbers; a note keeps its text', () => {
    state.roleViews = {};
    const fence = { ...base, id: 'f', type: 'line', x: 0, y: 0, points: [[0, 0], [12, 0]], rotation: 0, role: 'boundary', color: '#44403c', label: 'Fence', showLength: true } as Shape;
    const sun = { ...bed('s', 'Front of house', 0, 2, 10, 8), role: 'shade', sun: { mode: 'hours', hours: 6 } } as Shape;
    const note = { ...base, id: 'n', type: 'text', x: 2, y: 12, label: 'Rain barrel', fontSize: 1, rotation: 0, role: 'other' } as Shape;
    const shapes = [bed('b', 'Front', 0, 2, 10, 10), fence, sun, note, plant('p1', 'Coneflower', 2, 4), plant('p2', 'Coneflower', 5, 4)];
    const layout = planLayout('letter', 'auto', printContent(shapes, null, false).bounds!);
    const opts = { includeBackground: false, includeGrid: false, includePlantList: true };
    const shown = buildPlanSvg(layout, shapes, null, opts, 100).svg;
    expect(shown).toContain('>Front<');
    expect(shown).toContain('>1</text>');
    expect(shown).toContain('6 h');
    const hidden = buildPlanSvg(layout, shapes, null, { ...opts, names: false }, 100).svg;
    for (const gone of ['>Front<', '>1</text>', '6 h', 'Fence', '12 ft']) expect(hidden).not.toContain(gone);
    expect(hidden).toContain('Rain barrel');
  });
  it('says the month a picture is drawn in, with what Layers leaves out', () => {
    state.shapes = [plant('p1', 'Aster', 0, 0)];
    state.viewFilter = { status: 'planned', phase: '', showGone: false };
    state.roleViews = {};
    state.month = 2;
    expect(exportCaption()).toBe('Showing planned plants only \u00b7 As in February');
    state.month = null;
    state.viewFilter = { status: '', phase: '', showGone: false };
    expect(exportCaption()).toBe('');
    state.shapes = [];
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
  it('draws a locked shape as it is, no padlock nor dashed edge (Jason, Oct 31); a sun area with its hours', () => {
    const house = { ...bed('h', 'House', 0, 0, 10, 8), role: 'building', locked: true } as Shape;
    const svg = shapeToSvgString(house, 0, 0, 10);
    expect(svg).not.toContain('data-role="locked-badge"');
    expect(svg).not.toContain('stroke-dasharray');
    const sun = { ...bed('s', 'Front of house', 0, 0, 10, 8), role: 'shade', sun: { mode: 'hours', hours: 6 } } as Shape;
    expect(shapeToSvgString(sun, 0, 0, 10)).toContain('Front of house · ☀ 6 h');
    // (A round one too: round 3, Tom's "East lawn" printed without its hours.)
    const round = { id: 'c', type: 'circle', x: 20, y: 20, radius: 13, color: '#64748b', opacity: 0.3, locked: false, label: 'East lawn', role: 'shade', sun: { mode: 'hours', hours: 6 } } as Shape;
    expect(shapeToSvgString(round, 0, 0, 10)).toContain('East lawn · ☀ 6 h');
  });
});
