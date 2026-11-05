import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HIDDEN_NAME_GAP, HIDDEN_NAME_NEAR, hiddenCovers, hiddenNameSpots, paperUnder, peekCovers, seeThroughIds, tallIds, windowsOver } from '../src/canvas';
import { buildExportSVG } from '../src/export';
import { plantsById, type Plant } from '../src/plants';
import { buildPlanSvg, dotKey, planLayout, printContent } from '../src/print';
import { underLegendText } from '../src/print-pdf';
import { state } from '../src/state';
import type { Shape, ShapeFilter } from '../src/types';

// Tall plants (Jason, Nov 4, answering the options page: "1) D 2) C by default, but with a printing option for same as on
// screen with numbered dots. 3) yes, maybe with a few height options"). On the screen every plant is solid and what's
// under a taller one is pinned, seen through while it's selected; on paper a tall plant is solid, with a window over each
// plant under it, or as on the screen with numbered dots and a key.

const ALL: ShapeFilter = { status: '', phase: '', showGone: false };
const kinds: Record<string, Partial<Plant>> = {
  't-viburnum': { common: 'Witherod viburnum', form: 'Shrub', height: { min: 5, max: 8, med: 6 } },
  't-coneflower': { common: 'Giant coneflower', form: 'Perennial', height: { min: 5, max: 7, med: 6 } },
  't-crocus': { common: 'Crocus', form: 'Bulb', height: { min: 0.2, max: 0.4, med: 0.3 }, botanical: 'Crocus vernus' },
  't-aster': { common: 'Aster', form: 'Perennial', height: { min: 1, max: 3, med: 2 } },
  't-mint': { common: 'Mountain mint', form: 'Perennial', height: { min: 3, max: 4, med: 3.5 } },
  't-ginger': { common: 'Wild ginger', form: 'Perennial', height: { min: 0.3, max: 0.5, med: 0.4 } },
  't-oak': { common: 'Southern red oak', form: 'Tree, deciduous', height: { min: 60, max: 80, med: 70 } },
};
const plant = (id: string, plantId: string, x: number, radius: number, extra: Partial<Shape> = {}): Shape =>
  ({ id, type: 'circle', x, y: 0, radius, color: '#16a34a', label: kinds[plantId].common!, opacity: 0.65, locked: false, role: 'plant', plantId, ...extra } as Shape);
// A viburnum with a crocus under its middle and an aster a little under its edge, another just meeting it; a viburnum
// with nothing under it but a gone crocus; two giant coneflowers over each other; an oak with a crocus under it; a
// mountain mint (short, solid) over a wild ginger.
const SHAPES: Shape[] = [
  plant('vib', 't-viburnum', 0, 3), plant('crocus', 't-crocus', 0.5, 0.25), plant('aster', 't-aster', 3.5, 1), plant('asterNear', 't-aster', 3.95, 1),
  plant('vib2', 't-viburnum', 20, 3), plant('goneCrocus', 't-crocus', 20.5, 0.25, { status: 'gone' }),
  plant('cone1', 't-coneflower', 30, 1.5), plant('cone2', 't-coneflower', 31, 1.5),
  plant('oak', 't-oak', 60, 10), plant('crocusOak', 't-crocus', 61, 0.25),
  plant('mint', 't-mint', 80, 1.25), plant('ginger', 't-ginger', 80.5, 0.5),
];
const sorted = <T>(s: Iterable<T>) => [...s].sort();

beforeEach(() => {
  for (const [id, p] of Object.entries(kinds)) plantsById[id] = { id, ...p } as Plant;
  state.shapes = [];
  state.selectedIds = [];
  state.viewFilter = { ...ALL };
  state.roleViews = {};
  state.showNames = true;
  state.seeThroughTall = false;
  state.seeThroughFrom = 5;
  state.printUnder = 'windows';
});
afterEach(() => { for (const id of Object.keys(kinds)) delete plantsById[id]; state.shapes = []; state.printUnder = 'windows'; });

describe('on the screen (D): every plant solid, what\'s under one seen through on demand', () => {
  it('draws only trees see-through as the plan rests; Layers\' switch adds every plant from its height', () => {
    expect(sorted(seeThroughIds(SHAPES, ALL, null))).toEqual(['oak']);
    expect(sorted(seeThroughIds(SHAPES, ALL, 5))).toEqual(['cone1', 'cone2', 'oak', 'vib', 'vib2']);
    expect(sorted(seeThroughIds(SHAPES, ALL, 10))).toEqual(['oak']);
    expect(sorted(seeThroughIds(SHAPES, ALL, 3))).toEqual(['cone1', 'cone2', 'mint', 'oak', 'vib', 'vib2']);
    // (The switch, from the state: off, then on.)
    expect(sorted(seeThroughIds(SHAPES, ALL))).toEqual(['oak']);
    state.seeThroughTall = true;
    expect(sorted(seeThroughIds(SHAPES, ALL))).toEqual(['cone1', 'cone2', 'oak', 'vib', 'vib2']);
  });
  it('pins a plant under a tall one; selecting it makes what covers it see-through, selecting the tall one doesn\'t', () => {
    const covers = hiddenCovers(SHAPES, ALL, seeThroughIds(SHAPES, ALL, null));
    // (The crocus under the viburnum's middle, the ginger under the mint's; not the aster at its edge, nor the crocus
    // under the oak, seen through.)
    expect(sorted(covers.keys())).toEqual(['crocus', 'ginger']);
    expect(covers.get('crocus')).toEqual(['vib']);
    expect([...peekCovers(covers, ['crocus'])]).toEqual(['vib']);
    expect([...peekCovers(covers, ['vib'])]).toEqual([]);
    expect([...peekCovers(covers, ['aster'])]).toEqual([]);
    expect(sorted(peekCovers(covers, ['crocus', 'ginger']))).toEqual(['mint', 'vib']);
    expect([...peekCovers(covers, [])]).toEqual([]);
  });
  it('keeps a hidden plant\'s name on its pin or just beside it; selected (outlined), by its outline too', () => {
    const box = { x0: 80, x1: 120, y0: 93, y1: 107 }; // (40 × 14 px, its middle at the pin's: 100, 100)
    const spots = hiddenNameSpots(100, 100, box);
    expect(spots[0]).toEqual({ dx: 0, dy: 0 });
    expect(spots).toHaveLength(9);
    // (How far each spot's box is from the pin's middle: just clear of the largest pin, then a fingertip off; never
    // further, whatever the plant's size.)
    const reach = (s: { dx: number; dy: number }) => {
      const nx = Math.max(box.x0 + s.dx, Math.min(100, box.x1 + s.dx)), ny = Math.max(box.y0 + s.dy, Math.min(100, box.y1 + s.dy));
      return Math.round(Math.hypot(nx - 100, ny - 100) * 10) / 10;
    };
    expect(spots.map(reach)).toEqual([0, ...Array(4).fill(HIDDEN_NAME_GAP), ...Array(4).fill(HIDDEN_NAME_NEAR)]);
    expect(hiddenNameSpots(100, 100, box, 0)).toEqual(spots);
    // (Selected, its outline 30 px round: just below and above that as well, after the pin's.)
    const sel = hiddenNameSpots(100, 100, box, 30);
    expect(sel.slice(0, 9)).toEqual(spots);
    expect(sel.slice(9)).toEqual([{ dx: 0, dy: 39 }, { dx: 0, dy: -39 }]);
  });
});

describe('on paper and in pictures (C): a tall plant solid, a window over each plant under it', () => {
  it('finds the tall plants: not trees, not shorter than 5 ft', () => {
    expect(sorted(tallIds(SHAPES, ALL))).toEqual(['cone1', 'cone2', 'vib', 'vib2']);
  });
  it('cuts windows only where a tall plant covers a shorter one: not its own kind, a plant just meeting its edge, or a gone one', () => {
    const w = windowsOver(SHAPES, ALL, tallIds(SHAPES, ALL));
    expect([...w.keys()]).toEqual(['vib']);
    expect(sorted(w.get('vib')!)).toEqual(['aster', 'crocus']);
    // (None without tall plants; the mint over the ginger isn't one.)
    expect(windowsOver(SHAPES, ALL, new Set()).size).toBe(0);
    expect(windowsOver(SHAPES, ALL, new Set(['mint'])).get('mint')).toEqual(['ginger']);
  });
  it('windows by default: what\'s under a tall plant shows through it, not pinned; under a short solid one, pinned', () => {
    const p = paperUnder(SHAPES, ALL, 'windows', null);
    expect(sorted(p.thin)).toEqual(['oak']);
    expect(sorted(p.windows.keys())).toEqual(['vib']);
    expect(sorted(p.hidden)).toEqual(['ginger']);
  });
  it('as on screen: solid, no windows, what\'s under pinned; Layers\' switch on, as the screen has it', () => {
    const p = paperUnder(SHAPES, ALL, 'screen', null);
    expect(sorted(p.thin)).toEqual(['oak']);
    expect(p.windows.size).toBe(0);
    expect(sorted(p.hidden)).toEqual(['crocus', 'ginger']);
    const on = paperUnder(SHAPES, ALL, 'screen', 5);
    expect(sorted(on.thin)).toEqual(['cone1', 'cone2', 'oak', 'vib', 'vib2']);
    expect(sorted(on.hidden)).toEqual(['ginger']);
    // (Windows, the switch on all the same: windows, from 5 ft, as ever.)
    expect(sorted(paperUnder(SHAPES, ALL, 'windows', 3).windows.keys())).toEqual(['vib']);
  });
});

describe('the numbered dots and their key', () => {
  const named = (id: string, label: string, x: number) => ({ ...plant(id, 't-crocus', x, 0.25), label } as Shape);
  const queen = named('q1', "Crocus 'Queen Bee'", 0), queen2 = named('q2', "Crocus 'Queen Bee'", 1), aster = { ...plant('a1', 't-aster', 2, 1), label: 'Aster' } as Shape;
  it('numbers them 1, 2, 3 among themselves, one number a plant, in the order the plan got them, with a key', () => {
    const order = [aster, queen, queen2];
    const k = dotKey([queen, queen2, aster], plantsById, null, order);
    expect(k.inList).toBe(false);
    expect([...k.numbers]).toEqual([['q1', 2], ['q2', 2], ['a1', 1]]);
    expect(k.rows.map((r) => [r.key, r.label, r.count, r.botanical])).toEqual([[1, 'Aster', 1, ''], [2, "Crocus 'Queen Bee'", 2, 'Crocus vernus']]);
  });
  it('numbers them as the plant list does where the sheet has one: the list is their key', () => {
    const list = new Map([['Witherod viburnum', 1], ["Crocus 'Queen Bee'", 4], ['Aster', 7]]);
    const k = dotKey([queen, queen2, aster], plantsById, list, [queen, queen2, aster]);
    expect(k.inList).toBe(true);
    expect([...k.numbers.values()]).toEqual([4, 4, 7]);
    expect(k.rows.map((r) => r.key)).toEqual([4, 7]);
  });
  it('says what they are in the legend', () => {
    expect(underLegendText({ marks: 2, dots: null })).toBe('Plant under a taller one');
    expect(underLegendText({ marks: 2, dots: { numbers: new Map(), rows: [], inList: true } })).toBe('Plant under a taller one, numbered as in the plant list');
    expect(underLegendText({ marks: 2, dots: { numbers: new Map(), rows: [], inList: false } })).toBe('Plant under a taller one, numbered (see the key)');
  });
});

describe('the printed drawing and the picture', () => {
  const layout = () => planLayout('letter', 'auto', printContent(SHAPES, null, false).bounds!);
  const opts = { includeBackground: false, includeGrid: false, includePlantList: false, order: SHAPES };
  it('prints windows by default: a mask over the viburnum with the crocus and aster in it; the ginger a pin', () => {
    const { svg, under } = buildPlanSvg(layout(), SHAPES, null, opts, 100);
    expect(svg.match(/<mask [^>]*data-role="tall-window"/g)).toHaveLength(1);
    const mask = /<mask [^>]*data-role="tall-window"[^>]*>(.*?)<\/mask>/.exec(svg)![1];
    expect(mask.match(/<circle /g)).toHaveLength(2);
    expect(svg).not.toContain('data-role="numbered-dot"');
    expect(under).toEqual({ marks: 1, dots: null });
    // (With the plant list's numbers: the ginger's dot numbered as in the list.)
    const listed = buildPlanSvg(layout(), SHAPES, null, { ...opts, includePlantList: true }, 100);
    expect(listed.svg.match(/data-role="numbered-dot"/g)).toHaveLength(1);
    expect(listed.under.dots?.inList).toBe(true);
  });
  it('prints as on screen when asked: no windows, the crocus and ginger numbered dots, with their key', () => {
    const { svg, under } = buildPlanSvg(layout(), SHAPES, null, { ...opts, under: 'screen' }, 100);
    expect(svg).not.toContain('tall-window');
    expect(svg.match(/data-role="numbered-dot" data-n="\d+"/g)).toHaveLength(2);
    expect(under.marks).toBe(2);
    expect(under.dots!.inList).toBe(false);
    expect(under.dots!.rows.map((r) => [r.key, r.label])).toEqual([[1, 'Crocus'], [2, 'Wild ginger']]);
    // (Their names left off, under the plants over them: the key has them. The aster at the viburnum's edge keeps its.)
    expect(svg).not.toMatch(/>Wild ginger</);
    expect(svg.match(/>Crocus</g)).toHaveLength(2); // (the gone one's and the one under the oak, seen through)
    expect(svg).toMatch(/>Aster</);
    // (Names hidden: plain pins, no numbers, no key.)
    const plain = buildPlanSvg(layout(), SHAPES, null, { ...opts, under: 'screen', names: false }, 100);
    expect(plain.svg).not.toContain('numbered-dot');
    expect(plain.under).toEqual({ marks: 2, dots: null });
  });
  it('draws the picture the same way, its key in a band under the drawing', () => {
    state.shapes = SHAPES;
    const windows = buildExportSVG()!;
    expect(windows.svg).toContain('data-role="tall-window"');
    expect(windows.svg).not.toContain('data-role="dot-key"');
    state.printUnder = 'screen';
    const screen = buildExportSVG()!;
    expect(screen.svg).not.toContain('tall-window');
    expect(screen.svg.match(/data-role="numbered-dot"/g)).toHaveLength(4); // (two on the plan, two in the key)
    // (The key after the drawing: its words, and each name.)
    const key = screen.svg.slice(screen.svg.indexOf('<g data-role="dot-key">'));
    expect(key).toContain('Under taller plants:');
    expect(key).toMatch(/>Crocus<\/text>/);
    expect(key).toMatch(/>Wild ginger<\/text>/);
    expect(screen.heightPx).toBeGreaterThan(windows.heightPx);
  });
});
