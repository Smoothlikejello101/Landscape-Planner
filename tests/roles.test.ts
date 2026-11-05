import { beforeEach, describe, expect, it } from 'vitest';
import { drawnHeight, hiddenCovers, hiddenIds, labelRuns, paintOrder, PLANT_NAMES_MIN_ZOOM, plantNamesShown, runLabelSpot, seeThroughIds } from '../src/canvas';
import { plantsById, type Plant } from '../src/plants';
import { setRoleForIds, setRoleView } from '../src/mutations';
import { defaultLook, isLocked } from '../src/roles';
import { state } from '../src/state';
import { sanitizeProjectData } from '../src/storage';
import type { CircleShape, Shape } from '../src/types';

const sh = (id: string, extra: Partial<Shape> = {}): Shape =>
  ({ id, type: 'rect', x: 0, y: 0, width: 2, height: 2, rotation: 0, color: '#78350f', label: id, opacity: 0.65, locked: false, ...extra } as Shape);

beforeEach(() => {
  state.shapes = [];
  state.roleViews = {};
  state.selectedIds = [];
  state.history = [];
  state.historyIndex = -1;
  state.currentProjectId = null; // storage not initialized: saves are no-ops
});

describe('drawing order', () => {
  it('draws ground roles first, shade under plants, and keeps list order within a tier', () => {
    state.shapes = [
      sh('plantA', { role: 'plant' }), sh('shade', { role: 'shade' }), sh('bed', { role: 'bed' }),
      sh('lawn', { role: 'lawn' }), sh('old'), sh('building', { role: 'building' }), sh('plantB', { role: 'plant' }),
      sh('lockedOld', { locked: true }),
    ];
    expect(paintOrder(state.shapes).map((s) => s.id)).toEqual(
      ['lawn', 'bed', 'shade', 'building', 'lockedOld', 'plantA', 'old', 'plantB']);
  });
  it('draws plants tallest on top, whatever order they were placed in; a note and a vine on a fence where they were (Jason, Oct 30)', () => {
    const c = (id: string, radius: number, extra: Partial<Shape> = {}) => ({ id, type: 'circle', x: 0, y: 0, radius, color: '#16a34a', label: id, opacity: 0.65, locked: false, role: 'plant', ...extra } as Shape);
    plantsById['t-hazel'] = { id: 't-hazel', common: 'Witch hazel', form: 'Shrub', height: { min: 10, max: 15, med: 12 }, width: { min: 6, max: 10, med: 8 } } as Plant;
    plantsById['t-ginger'] = { id: 't-ginger', common: 'Wild ginger', form: 'Perennial', height: { min: 0.3, max: 0.5, med: 0.4 }, width: { min: 1, max: 2, med: 1.5 } } as Plant;
    // (A wide groundcover under a narrower, taller shrub: the shrub on top; with no height known, the spread stands in.)
    state.shapes = [c('hazel', 4, { plantId: 't-hazel' }), c('ginger', 5, { plantId: 't-ginger' }), sh('note', { type: 'text' } as Partial<Shape>), c('crocus', 0.25), c('blueberry', 3), c('vine', 10, { climbsOn: 'fence' } as Partial<Shape>), sh('bed', { role: 'bed' })];
    expect(paintOrder(state.shapes).map((s) => s.id)).toEqual(['bed', 'ginger', 'crocus', 'note', 'blueberry', 'hazel', 'vine']);
    expect(drawnHeight(state.shapes[0] as CircleShape)).toBe(12);
    expect(drawnHeight(state.shapes[4] as CircleShape)).toBe(6); // (3 ft radius, no height: its spread)
  });
  it('draws every plant solid, tall ones too, and pins what a plant covers the middle of; with Layers\' "See through tall plants", 5 ft or taller see-through, as from Oct 30 (Jason, Nov 4)', () => {
    const c = (id: string, x: number, radius: number, extra: Partial<Shape> = {}) => ({ id, type: 'circle', x, y: 0, radius, color: '#16a34a', label: id, opacity: 0.65, locked: false, role: 'plant', ...extra } as Shape);
    plantsById['t-hazel'] = { id: 't-hazel', common: 'Witch hazel', form: 'Shrub', height: { min: 10, max: 15, med: 12 } } as Plant;
    plantsById['t-mint'] = { id: 't-mint', common: 'Mountain mint', form: 'Perennial', height: { min: 3, max: 4, med: 3.5 } } as Plant;
    plantsById['t-ginger'] = { id: 't-ginger', common: 'Wild ginger', form: 'Perennial', height: { min: 0.3, max: 0.5, med: 0.4 } } as Plant;
    const hazel = { plantId: 't-hazel' }, mint = { plantId: 't-mint' }, ginger = { plantId: 't-ginger' };
    state.shapes = [
      c('hazel', 0, 3, hazel), c('hazel2', 20, 3, hazel), c('underHazel', 1, 0.75, ginger), // (a canopy, with or without one under it)
      c('mint', 40, 1.25, mint), c('underMint', 40.5, 0.75, ginger), c('besideMint', 42, 0.75, ginger), // (beside: its middle clear)
      c('mint2', 60, 1.25, mint), c('goneUnder', 60, 0.5, { ...ginger, status: 'gone' }),
      c('wide', 80, 3), // (no height known: its spread, 6 ft, stands in)
      c('mint3', 100, 1.25, mint), c('mint4', 100.5, 1.25, mint), // (a mass planting: a mint under a mint isn't marked)
    ];
    // (Solid, as the plan rests, Layers' switch off: the witch hazel like the mint, the ginger under it pinned.)
    expect([...seeThroughIds(state.shapes, state.viewFilter, null)]).toEqual([]);
    expect([...hiddenIds(state.shapes, state.viewFilter, new Set())].sort()).toEqual(['underHazel', 'underMint']);
    expect(hiddenCovers(state.shapes, state.viewFilter, new Set()).get('underHazel')).toEqual(['hazel']);
    // (The switch on, from 5 ft: as from Oct 30 to Nov 4. Under a canopy, seen through it; under the solid mint, marked;
    // a gone plant counts for nothing, nor one under its own kind.)
    const thin = seeThroughIds(state.shapes, state.viewFilter, 5);
    expect([...thin].sort()).toEqual(['hazel', 'hazel2', 'wide']);
    expect([...hiddenIds(state.shapes, state.viewFilter, thin)].sort()).toEqual(['underMint']);
    expect(hiddenCovers(state.shapes, state.viewFilter, thin).get('underMint')).toEqual(['mint']);
    // (From 10 ft, the witch hazel, 12 ft, alone; the 6 ft stand-in solid. From 3 ft, the mints too.)
    expect([...seeThroughIds(state.shapes, state.viewFilter, 10)].sort()).toEqual(['hazel', 'hazel2']);
    expect([...seeThroughIds(state.shapes, state.viewFilter, 3)].sort()).toEqual(['hazel', 'hazel2', 'mint', 'mint2', 'mint3', 'mint4', 'wide']);
  });
  it('names a run of the same plant once: twelve liriope in a column are one run; a gap, another name or two alone are not (Jason, Oct 30)', () => {
    const c = (id: string, label: string, x: number, y: number) => ({ id, type: 'circle', x, y, radius: 0.75, color: '#16a34a', label, opacity: 0.65, locked: false, role: 'plant' } as CircleShape);
    const column = Array.from({ length: 12 }, (_, i) => c('l' + i, 'Creeping liriope', 1, -27.5 + i * 1.5));
    const runs = labelRuns([...column, c('far', 'Creeping liriope', 40, 0), c('a', 'Snowdrops', 0, 0), c('b', 'Snowdrops', 1.5, 0)]);
    expect(runs.map((r) => r.length)).toEqual([12]);
    // (A gap twice their width splits it in two runs of six.)
    const split = column.map((s, i) => (i >= 6 ? { ...s, y: s.y + 3 } : s));
    expect(labelRuns(split).map((r) => r.length)).toEqual([6, 6]);
  });
  it("moves a run's name off another name: onto the plant nearest the middle that's clear, else beside it (Jason, Oct 30)", () => {
    const c = (id: string, x: number, y: number) => ({ id, type: 'circle', x, y, radius: 0.75, color: '#16a34a', label: 'Creeping liriope', opacity: 0.65, locked: false, role: 'plant' } as CircleShape);
    const column = Array.from({ length: 12 }, (_, i) => c('l' + i, 1, -27.5 + i * 1.5));
    const ppf = 33, w = 110, h = 13;
    // (Clear: its middle.)
    expect(runLabelSpot(column, w, h, ppf, [])).toEqual({ x: 1, y: -19.25 });
    // (The Carport bed's name, 1.5 ft wide, at the same middle: the plant just past it.)
    const bed = { x0: 0.75 * ppf - 25, x1: 0.75 * ppf + 25, y0: -19.25 * ppf - 7, y1: -19.25 * ppf + 7 };
    const at = runLabelSpot(column, w, h, ppf, [bed])!;
    expect(at.x).toBe(1);
    expect(Math.abs(at.y + 19.25)).toBe(0.75);
    // (A name across the whole column: beside it, to the left, else the right.)
    const across = { x0: 0, x1: 1.75 * ppf, y0: -30 * ppf, y1: -10 * ppf };
    const beside = runLabelSpot(column, w, h, ppf, [across])!;
    expect(beside.x).toBeGreaterThan(1.75 + w / 2 / ppf);
    // (Nowhere clear: none.)
    expect(runLabelSpot(column, w, h, ppf, [{ x0: -1e4, x1: 1e4, y0: -1e4, y1: 1e4 }])).toBeNull();
  });
  it("keeps a run's name off the plants drawn over it, not only off names (Jason, Nov 4: it sat under them)", () => {
    const c = (id: string, x: number) => ({ id, type: 'circle', x, y: 0, radius: 0.75, color: '#16a34a', label: 'Cardinal flower', opacity: 0.65, locked: false, role: 'plant' } as CircleShape);
    const row = [1, 2.5, 4, 5.5, 7].map((x, i) => c('c' + i, x));
    const ppf = 24, w = 115, h = 14;
    expect(runLabelSpot(row, w, h, ppf, [])).toEqual({ x: 4, y: 0 });
    // A buttonbush just below the row's middle: its name above the row, clear of it.
    const bush = { x: 4, y: 1.8, r: 2 };
    const at = runLabelSpot(row, w, h, ppf, [], [bush])!;
    expect(at.x).toBe(4);
    expect(at.y).toBeLessThan(-0.75);
    // (Grazing its rim is fine: a tenth of it.)
    expect(runLabelSpot(row, w, h, ppf, [], [{ x: 4, y: 2.18, r: 2 }])).toEqual({ x: 4, y: 0 });
    // Plants all round: none clear of them, the first spot clear of the names, over a plant (its middle here), never
    // none: none was its plants named one by one (Jason, Nov 4, his note 4: a stack of "Creeping liriope").
    expect(runLabelSpot(row, w, h, ppf, [], [{ x: 4, y: 0, r: 8 }])).toEqual({ x: 4, y: 0 });
    // (A name at its middle too: the plant next to it.)
    expect(runLabelSpot(row, w, h, ppf, [{ x0: 4 * ppf - 5, x1: 4 * ppf + 5, y0: -5, y1: 5 }], [{ x: 4, y: 0, r: 8 }])).toEqual({ x: 1, y: 0 });
  });
  it("names Jason's liriope once at every zoom down to where plants' names go: a pear's crown beside it no longer splits it into a stack (his note 4)", () => {
    // (His plan, Nov 1: twelve creeping liriope 1.5 ft apart down the 1.5 ft Carport bed, two Callery pears' 25 ft crowns
    // to their west, drawn over them, the run's middle in neither.)
    const c = (id: string, y: number) => ({ id, type: 'circle', x: 1, y, radius: 0.75, color: '#16a34a', label: 'Creeping liriope', opacity: 0.65, locked: false, role: 'plant' } as CircleShape);
    const column = Array.from({ length: 12 }, (_, i) => c('l' + i, -27.5 + i * 1.5));
    const pears = [{ x: -12, y: -11.5, r: 12.5 }, { x: -12, y: -28, r: 12.5 }];
    const w = 102, h = 12.65; // ("Creeping Liriope ×12" at 11 px: the same px at every zoom)
    // (And, as it was drawn till now, the Carport bed's name, 36 px, moved clear of the plants to the bed's right, at
    // its middle: on the run's middle and the two plants either side of it.)
    const carport = (ppf: number) => ({ x0: 1.5 * ppf + 3, x1: 1.5 * ppf + 39, y0: -19.25 * ppf - 6, y1: -19.25 * ppf + 6 });
    for (const zoom of [0.7, 0.6, 0.54, 0.4, 0.3, 0.2]) {
      const ppf = 24 * zoom;
      // Where nothing's clear of the crowns (60% and 54%, as Jason saw it), on the column all the same, never none: none
      // was its twelve plants named one by one.
      const at = runLabelSpot(column, w, h, ppf, [carport(ppf)], pears);
      expect(at, `at ${zoom * 100}%`).not.toBeNull();
      expect(at!.x).toBe(1);
    }
  });
  it("tries past a run's ends last: above a column's top plant, below its bottom one", () => {
    const c = (id: string, y: number) => ({ id, type: 'circle', x: 0, y, radius: 0.75, color: '#16a34a', label: 'Phlox', opacity: 0.65, locked: false, role: 'plant' } as CircleShape);
    const column = [0, 1.5, 3, 4.5].map((y, i) => c('p' + i, y));
    const ppf = 24, w = 60, h = 13;
    // (Every spot on or beside the column taken by a name, all but the strip above its top plant.)
    const taken = [{ x0: -1e4, x1: 1e4, y0: -0.8 * ppf, y1: 1e4 }];
    const at = runLabelSpot(column, w, h, ppf, taken)!;
    expect(at.x).toBe(0);
    expect(at.y * ppf + h / 2).toBeLessThanOrEqual(-0.8 * ppf);
  });
  it("draws no plant's name zoomed out past 20% (Jason, Nov 4: at 5% a name twice the size of the house)", () => {
    expect(PLANT_NAMES_MIN_ZOOM).toBe(0.2);
    state.showNames = true;
    expect(plantNamesShown(24 * 0.2)).toBe(true);
    expect(plantNamesShown(24 * 0.19)).toBe(false);
    expect(plantNamesShown(24 * 0.05)).toBe(false);
    state.showNames = false;
    expect(plantNamesShown(24)).toBe(false);
    state.showNames = true;
  });
  it('leaves hidden roles out', () => {
    state.shapes = [sh('a', { role: 'shade' }), sh('b', { role: 'bed' })];
    state.roleViews = { shade: { hidden: true } };
    expect(paintOrder(state.shapes).map((s) => s.id)).toEqual(['b']);
  });
});

describe('assigning roles', () => {
  it('gives a default-looking shape the new role look', () => {
    state.shapes = [sh('r')]; // unassigned rect default look
    setRoleForIds(['r'], 'shade');
    expect(state.shapes[0].role).toBe('shade');
    expect(state.shapes[0].color).toBe(defaultLook('shade', 'rect').color);
    expect(state.shapes[0].opacity).toBe(defaultLook('shade', 'rect').opacity);
  });
  it('keeps colors the user chose', () => {
    state.shapes = [sh('r', { color: '#ef4444', opacity: 0.4 })];
    setRoleForIds(['r'], 'bed');
    expect(state.shapes[0]).toMatchObject({ role: 'bed', color: '#ef4444', opacity: 0.4 });
  });
  it('can clear a role', () => {
    state.shapes = [sh('r', { role: 'bed' })];
    setRoleForIds(['r'], undefined);
    expect(state.shapes[0].role).toBeUndefined();
  });
});

describe('role views', () => {
  it('locking a role locks its shapes; hiding deselects them', () => {
    state.shapes = [sh('a', { role: 'shade' }), sh('b', { role: 'bed' })];
    state.selectedIds = ['a', 'b'];
    setRoleView('shade', { locked: true });
    expect(isLocked(state.shapes[0])).toBe(true);
    expect(isLocked(state.shapes[1])).toBe(false);
    setRoleView('shade', { hidden: true });
    expect(state.selectedIds).toEqual(['b']);
    setRoleView('shade', { hidden: false, locked: false });
    expect(state.roleViews.shade).toEqual({});
  });
});

describe('loading roles', () => {
  it('keeps valid roles, infers plants from the plant picker, ignores junk', () => {
    const d = sanitizeProjectData({
      shapes: [sh('a', { role: 'bed' }), { ...sh('b'), plantId: 'heuchera' }, { ...sh('c'), role: 'spaceship' }, sh('d')],
      roleViews: { shade: { hidden: true, locked: 'yes' }, nonsense: { hidden: true } },
    });
    expect(d.shapes.map((s) => s.role)).toEqual(['bed', 'plant', undefined, undefined]);
    expect(d.roleViews).toEqual({ shade: { hidden: true } });
  });
});

describe('loading bed and sun fields', () => {
  it('keeps "plants move with bed: off" and recorded sun, and repairs bad sun data', () => {
    const d = sanitizeProjectData({ shapes: [
      { ...sh('bed', { role: 'bed' }), carryPlants: false },
      { ...sh('shade', { role: 'shade' }), sun: { mode: 'times', periods: [[780, 540], ['x', 1]], hours: 3, dappled: true, observedOn: '2026-06-14', note: 'oak' } },
      { ...sh('junk', { role: 'shade' }), sun: { mode: 'weird', hours: 99, observedOn: 'June' } },
    ] });
    expect(d.shapes[0].carryPlants).toBe(false);
    expect(d.shapes[1].sun).toEqual({ mode: 'times', periods: [[540, 780]], hours: 3, dappled: true, observedOn: '2026-06-14', note: 'oak' });
    expect(d.shapes[2].sun).toMatchObject({ mode: 'times', hours: 16 });
    expect(d.shapes[2].sun?.observedOn).toBeUndefined();
  });
});
