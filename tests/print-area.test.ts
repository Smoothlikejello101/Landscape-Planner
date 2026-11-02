import { describe, expect, it } from 'vitest';
import { buildPlanSvg, NICE_SCALES, planLayout, plantSchedule, printContent, scaleBarFeet, scaleText } from '../src/print';
import { areaWords, bedChoices, bedMargin, frameArea, viewBounds, WHOLE_PLAN, type PrintArea } from '../src/print-area';
import { buildExportSVG } from '../src/export';
import { state } from '../src/state';
import type { Shape } from '../src/types';

// "Print what you're looking at" (Jason, Nov 2, from the UI review): the whole plan, what's on screen, or one bed,
// scaled to fill the page; the picture follows.

const base = { color: '#16a34a', label: '', opacity: 0.65, locked: false };
const bed = (id: string, label: string, x: number, y: number, w: number, h: number): Shape =>
  ({ ...base, id, type: 'rect', x, y, width: w, height: h, rotation: 0, role: 'bed', label, color: '#92400e' } as Shape);
const plant = (id: string, label: string, x: number, y: number, radius = 1): Shape =>
  ({ ...base, id, type: 'circle', x, y, radius, role: 'plant', label } as Shape);

// Front bed (12 × 4 ft) with four plants and a trellis in it; Back bed far off with three; a house between.
const front = bed('front', 'Front bed', 0, 0, 12, 4);
const back = bed('back', 'Back bed', 100, 100, 10, 6);
const house = { ...bed('house', 'House', 30, 30, 40, 30), role: 'building', color: '#78716c' } as Shape;
const trellis = { ...base, id: 't', type: 'line', x: 0, y: 0, points: [[2, 0.5], [10, 0.5]], rotation: 0, role: 'structure', color: '#78350f' } as Shape;
const plants = [
  plant('c1', 'Coneflower', 2, 2), plant('c2', 'Coneflower', 5, 2), plant('a1', 'Aster', 8, 2), plant('c3', 'Coneflower', 11, 2),
  plant('b1', 'Aster', 102, 103), plant('b2', 'Hosta', 105, 103), plant('b3', 'Hosta', 108, 103),
];
const shapes = [front, back, house, trellis, ...plants];
const shown = printContent(shapes, null, false).shapes;
const whole = printContent(shapes, null, false).bounds!;
const area = (a: Partial<PrintArea>): PrintArea => ({ ...WHOLE_PLAN, ...a });
const ids = (l: Shape[]) => l.map((s) => s.id).sort();

describe('framing the area chosen', () => {
  it('the whole plan: everything, as before', () => {
    const f = frameArea(WHOLE_PLAN, shown, shapes, whole);
    expect(f.bounds).toEqual(whole);
    expect(f.shapes).toHaveLength(shapes.length);
    expect(f.plants).toHaveLength(7);
    expect(f.exact).toBe(false);
    expect(areaWords(f)).toBe('');
  });
  it('one bed: the bed, its plants and what lies in it, with a small margin; nothing else', () => {
    const f = frameArea(area({ kind: 'bed', bedId: 'front' }), shown, shapes, whole);
    expect(ids(f.shapes)).toEqual(['a1', 'c1', 'c2', 'c3', 'front', 't']);
    expect(ids(f.plants)).toEqual(['a1', 'c1', 'c2', 'c3']);
    expect(f.bounds).toEqual({ minX: -1, maxX: 13, minY: -1, maxY: 5 }); // (a foot all round: bedMargin)
    expect(f.exact).toBe(true);
    expect(areaWords(f)).toBe('Front bed: 4 plants');
    // (A plant hanging over the bed's edge is framed whole.)
    const wide = frameArea(area({ kind: 'bed', bedId: 'front' }), [...shown, plant('big', 'Oak', 12, 2, 4)], [...shapes, plant('big', 'Oak', 12, 2, 4)], whole);
    expect(wide.bounds!.maxX).toBe(16 + 1);
    // A bed that's gone (another plan open): nothing to frame.
    expect(frameArea(area({ kind: 'bed', bedId: 'nope' }), shown, shapes, whole).bounds).toBeNull();
    // In a round bed: a birdbath in it, not one in the corner of its box.
    const round = { ...base, id: 'r', type: 'circle', x: 0, y: 0, radius: 5, role: 'bed', label: 'Round bed', color: '#92400e' } as Shape;
    const bath = (id: string, x: number, y: number) => ({ ...bed(id, 'Birdbath', x, y, 1, 1), role: 'structure' } as Shape);
    const yard = [round, bath('in', -0.5, -0.5), bath('corner', 3.9, 3.9)];
    expect(ids(frameArea(area({ kind: 'bed', bedId: 'r' }), yard, yard, null).shapes)).toEqual(['in', 'r']);
    // A long bed's margin grows with it.
    expect(bedMargin({ minX: 0, maxX: 60, minY: 0, maxY: 5 })).toBe(3);
  });
  it('what\'s on screen: the screen\'s part of the plan exactly; what reaches into it drawn, the plants whose middle is in it listed', () => {
    // A phone's plan, 412 × 650 px at 100% (24 px a foot), its top left at (98, 98) ft: Back bed and its plants.
    const view = viewBounds(98, 98, 412, 650, 24);
    expect(view).toEqual({ minX: 98, minY: 98, maxX: 98 + 412 / 24, maxY: 98 + 650 / 24 });
    const edge = plant('e', 'Fern', 115.5, 110); // (its middle off the screen's right edge, 115.17 ft; its leaves on it)
    const f = frameArea(area({ kind: 'screen', view, ppf: 24 }), [...shown, edge], [...shapes, edge], whole);
    expect(f.bounds).toEqual(view);
    expect(ids(f.shapes)).toEqual(['b1', 'b2', 'b3', 'back', 'e']);
    expect(ids(f.plants)).toEqual(['b1', 'b2', 'b3']);
    expect(areaWords(f)).toBe('Part of the plan: 3 plants');
  });
  it('names the beds to pick from as the plant list does, unnamed ones by their place in the plan', () => {
    expect(bedChoices([bed('x', '', 0, 0, 1, 1), back, bed('y', ' ', 0, 0, 1, 1), front])).toEqual([
      { id: 'back', name: 'Back bed' }, { id: 'front', name: 'Front bed' }, { id: 'x', name: 'Unnamed bed 1' }, { id: 'y', name: 'Unnamed bed 2' },
    ]);
  });
});

describe('scaled to fill the page', () => {
  it('draws one bed as itself, at its proportions, as big as a round scale allows, the page turned to suit', () => {
    const f = frameArea(area({ kind: 'bed', bedId: 'front' }), shown, shapes, whole);
    const l = planLayout('letter', 'auto', f.bounds!, f.exact);
    // 14 × 6 ft: on a portrait page (the legend along the bottom) the drawing's room is 7.7 in across, on a landscape
    // one 7 in (the legend down the side): 1 in = 2 ft on portrait, 2.5 on landscape.
    expect(l.orientation).toBe('portrait');
    expect(l.ftPerIn).toBe(2);
    expect(l.window).toEqual(f.bounds); // (the bed and its margin, no more)
    expect(l.plan.w).toBeCloseTo(7);
    expect(l.plan.h).toBeCloseTo(3);
    // In the middle of the room for it, within the page's margins, clear of the legend below.
    expect(l.plan.x).toBeCloseTo((8.5 - 7) / 2);
    expect(l.plan.y + l.plan.h).toBeLessThan(l.side.y);
    // It fills the room across: 7 of 7.7 in. (At the old scales, 1, 2, 4, 5, 8..., a 20 ft bed went to 4 ft an inch,
    // 5.5 in across; it's 1 in = 3 ft now, 7.3 in.)
    const long = planLayout('letter', 'auto', { minX: 0, maxX: 22, minY: 0, maxY: 6 }, true);
    expect(long.ftPerIn).toBe(3);
    expect(long.plan.w).toBeGreaterThan(7);
  });
  it('turns the page for a tall area, and keeps it whole', () => {
    const tall = planLayout('letter', 'auto', { minX: 0, maxX: 10, minY: 0, maxY: 30 }, true);
    expect(tall.orientation).toBe('landscape'); // (7.7 in down beside the legend, against 7.3 above it)
    expect(tall.ftPerIn).toBe(4);
    expect(tall.plan.h).toBeCloseTo(7.5);
    expect(tall.plan.w / tall.plan.h).toBeCloseTo(10 / 30);
  });
  it('the whole plan still fills the drawing box with the yard around it', () => {
    const l = planLayout('letter', 'auto', whole);
    expect(l.window.maxX - l.window.minX).toBeGreaterThan(whole.maxX - whole.minX);
    expect(l.plan.w).toBeCloseTo(8.5 - 0.8);
  });
  it('every scale is one a ruler can check, and its scale bar is true to it, about 1 to 2 in long', () => {
    for (const s of NICE_SCALES) {
      const barIn = scaleBarFeet(s) / s;
      expect(barIn, `1 in = ${s} ft`).toBeLessThanOrEqual(2);
      expect(barIn, `1 in = ${s} ft`).toBeGreaterThanOrEqual(1);
    }
    expect(scaleText(0.5)).toBe('2 in = 1 ft');
    expect(scaleText(1.5)).toBe('1 in = 1.5 ft');
    expect(scaleText(4)).toBe('1 in = 4 ft (1/4 in = 1 ft)');
    // A small bed, 3 × 2 ft with its margin: 2 in to the foot.
    expect(planLayout('letter', 'auto', { minX: 0, maxX: 3, minY: 0, maxY: 2 }, true).ftPerIn).toBe(0.5);
  });
});

describe('the plant list and numbers of a part of the plan', () => {
  it('lists only the bed\'s plants, numbered as on the whole plan\'s sheet', () => {
    const f = frameArea(area({ kind: 'bed', bedId: 'back' }), shown, shapes, whole);
    const list = plantSchedule(f.plants, {}, shapes, shown);
    expect(list.map((g) => [g.bed, g.total])).toEqual([['Back bed', 3]]);
    // (Coneflower is 1 and Aster 2 on the whole plan: here too, though no coneflower is in this bed.)
    expect(list[0].rows.map((r) => [r.key, r.label, r.count])).toEqual([[2, 'Aster', 1], [3, 'Hosta', 2]]);
  });
  it('numbers on the drawing only the plants listed', () => {
    const view = viewBounds(98, 98, 412, 650, 24);
    const edge = plant('e', 'Fern', 115.5, 110);
    const all = [...shapes, edge], seen = [...shown, edge];
    const f = frameArea(area({ kind: 'screen', view, ppf: 24 }), seen, all, whole);
    const l = planLayout('letter', 'auto', f.bounds!, true);
    const svg = buildPlanSvg(l, f.shapes, null, { includeBackground: false, includeGrid: false, includePlantList: true, order: all, keyFrom: seen, listed: new Set(f.plants.map((s) => s.id)) }, 100).svg;
    expect(svg.match(/>2<\/text>/g)).toHaveLength(1); // the aster
    expect(svg.match(/>3<\/text>/g)).toHaveLength(2); // the hostas
    expect(svg).not.toMatch(/>4<\/text>/); // (the fern, cut by the edge)
  });
});

describe('the picture follows', () => {
  const at = (a: PrintArea) => {
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = {};
    state.showNames = true;
    state.bgImage = null;
    state.shapes = shapes;
    try { return buildExportSVG(a)!; } finally { state.shapes = []; }
  };
  it('of one bed: just the bed and its plants, big, saying so', () => {
    const p = at(area({ kind: 'bed', bedId: 'front' }));
    // 14 × 6 ft, 1200 px across.
    expect([p.widthPx, p.heightPx]).toEqual([1200, Math.round((6 * 1200) / 14)]);
    expect(p.svg).toContain('Front bed: 4 plants');
    expect(p.svg).toContain('>Coneflower<');
    expect(p.svg).not.toContain('Hosta');
    expect(p.svg).not.toContain('>House<');
  });
  it('of what\'s on screen: that part of the plan, at the size it was shown', () => {
    const view = viewBounds(98, 98, 412, 650, 24);
    const p = at(area({ kind: 'screen', view, ppf: 24 }));
    expect([p.widthPx, p.heightPx]).toEqual([412, 650]);
    expect(p.svg).toContain('Part of the plan: 3 plants');
    expect(p.svg).toContain('>Hosta<');
    expect(p.svg).not.toContain('Coneflower');
    // Zoomed out to a quarter: the same picture size, the grid every 5 ft, not every foot.
    const far = at(area({ kind: 'screen', view: viewBounds(0, 0, 412, 650, 6), ppf: 6 }));
    expect([far.widthPx, far.heightPx]).toEqual([412, 650]);
    expect(far.svg.match(/<line /g)!.length).toBeLessThan(40);
  });
  it('of the whole plan: as before', () => {
    // 0–110 ft across and 0–106 down, 2 ft round it, at 24 px a foot.
    const p = at(WHOLE_PLAN);
    expect([p.widthPx, p.heightPx]).toEqual([114 * 24, 110 * 24]);
    expect(p.svg).toContain('>Coneflower<');
    expect(p.svg).toContain('>Hosta<');
    expect(p.svg).not.toContain('plants</text>');
  });
});
