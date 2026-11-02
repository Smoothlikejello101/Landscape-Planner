// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markNotPlanted, markPlantedToday } from '../src/mutations';
import { pushHistory, redo, undo } from '../src/history';
import { boughtText, buyHead, dayOf, groupOf, keepBought, kindKey, labelsText, listText, listTotals, ownLabel, plantedText, plantList, plantsOfKind, tickEntry, totalsText } from '../src/plant-list';
import type { Plant } from '../src/plants';
import { state } from '../src/state';
import { today } from '../src/status';
import type { Shape } from '../src/types';

// The Plant list (Jason, Nov 1, from the UI review): a row a kind, grouped To buy · Planted · Existing, with what's
// bought ticked (kept with the plan) and Mark planted.

const base = { color: '#16a34a', opacity: 0.65, locked: false };
let at = 0;
const plant = (plantId: string | undefined, extra: Partial<Shape> = {}): Shape =>
  // (Labeled as placing it labels it: its plant's name.)
  ({ ...base, id: `p${++at}`, type: 'circle', x: 0, y: 0, radius: 1, role: 'plant', label: plantId ? byId[plantId]?.common ?? plantId : '', ...(plantId ? { plantId } : {}), ...extra } as Shape);
const bed = (label: string, x: number): Shape => ({ ...base, id: `bed-${label || x}`, type: 'rect', x, y: -5, width: 10, height: 10, rotation: 0, role: 'bed', label } as Shape);
const yaupon = { id: 'ilex-vomitoria-nana', common: "Yaupon 'Nana'", botanical: "Ilex vomitoria 'Nana'", height: { min: 3, max: 5 }, width: { min: 3, max: 6 } } as unknown as Plant;
const columbine = { id: 'aquilegia-canadensis', common: 'Wild columbine', botanical: 'Aquilegia canadensis', height: { min: 1, max: 2 } } as unknown as Plant;
const mine = { id: 'u-abc12345', common: "Grandma's peony", botanical: '' } as unknown as Plant;
// (A record folded into another: its old id stands for the new one, as src/plants.ts does with meta.moved.)
const byId: Record<string, Plant | undefined> = { [yaupon.id]: yaupon, [columbine.id]: columbine, 'ilex-dwarf-old': yaupon, [mine.id]: mine };

beforeEach(() => { state.shapes = []; state.selectedIds = []; state.history = []; state.historyIndex = -1; state.bought = undefined; at = 0; });
afterEach(() => { vi.useRealTimers(); });

describe('the rows: a kind each, grouped To buy · Planted · Existing', () => {
  it('counts each kind once per group, with its variety, botanical name, size and beds; by name', () => {
    const front = bed('Front bed', -5), side = bed('', 20);
    const shapes = [front, side,
      plant(yaupon.id, { x: 0 }), plant('ilex-dwarf-old', { x: 1, status: 'planned' }), plant(yaupon.id, { x: 22, status: 'planted', plantedOn: '2026-10-30' }),
      plant(columbine.id, { x: 21 }), plant(columbine.id, { x: 100 }), plant(columbine.id, { x: 2 }),
      plant(mine.id, { status: 'existing', x: 100 }), plant(yaupon.id, { status: 'move', x: 100 }),
      plant(undefined, { label: 'Tomato', x: 100 }), plant(undefined, { label: 'Tomato ', x: 101 }),
      plant(columbine.id, { status: 'remove' }), plant(columbine.id, { status: 'gone' }),
    ];
    const l = plantList(shapes, byId, undefined);
    expect(l.buy.map((r) => [r.name, r.count, r.beds])).toEqual([
      ['Tomato', 2, ['Not in a bed']],
      ['Wild columbine', 3, ['Front bed', 'Unnamed bed 1', 'Not in a bed']],
      ["Yaupon 'Nana'", 2, ['Front bed']], // (one placed from a record since folded into it: the same kind)
    ]);
    expect(l.buy[2]).toMatchObject({ key: yaupon.id, botanical: "Ilex vomitoria 'Nana'", size: '3–5 ft tall, 3–6 ft wide' });
    expect(l.buy[1]).toMatchObject({ botanical: 'Aquilegia canadensis', size: '1–2 ft tall' });
    expect(l.buy[0]).toMatchObject({ key: 'n:tomato', botanical: '', size: '' });
    expect(l.planted.map((r) => [r.name, r.count, r.plantedOn])).toEqual([["Yaupon 'Nana'", 1, ['2026-10-30', '2026-10-30']]]);
    // (To move is in the ground already: with Existing. To remove and Gone aren't listed.)
    expect(l.existing.map((r) => [r.name, r.count, r.botanical])).toEqual([["Grandma's peony", 1, ''], ["Yaupon 'Nana'", 1, "Ilex vomitoria 'Nana'"]]);
    expect(listTotals(l)).toEqual({ toBuy: 7, kinds: 3, bought: 0, planted: 1, existing: 2 });
    expect(totalsText(listTotals(l))).toBe('7 plants to buy, 3 kinds');
  });
  it('groups by status: planned or none to buy; To move with Existing; To remove and Gone left out', () => {
    expect([undefined, 'planned', 'planted', 'existing', 'move', 'remove', 'gone'].map((status) => groupOf({ status } as Shape)))
      .toEqual(['buy', 'buy', 'planted', 'existing', 'existing', null, null]);
    expect([kindKey({ label: '  Old oak!! ' }, byId), kindKey({ label: '' }, byId), kindKey({ plantId: 'not-loaded', label: 'x' }, byId)])
      .toEqual(['n:old-oak', 'n:unlabeled', 'not-loaded']);
  });
  it('says the totals plainly', () => {
    const t = { toBuy: 16, kinds: 7, bought: 0, planted: 0, existing: 0 };
    expect(totalsText(t)).toBe('16 plants to buy, 7 kinds');
    expect(totalsText({ ...t, toBuy: 1, kinds: 1 })).toBe('1 plant to buy, 1 kind');
    expect(totalsText({ ...t, bought: 10 })).toBe('16 plants to buy, 7 kinds · 10 bought, not yet planted');
    expect(totalsText({ ...t, toBuy: 0, kinds: 0, bought: 16 })).toBe('Nothing left to buy · 16 bought, not yet planted');
    expect(totalsText({ ...t, toBuy: 0, kinds: 0, planted: 3 })).toBe('Nothing to buy');
    expect(totalsText({ ...t, toBuy: 0, kinds: 0 })).toBe('');
    expect([buyHead(t), buyHead({ ...t, toBuy: 0, kinds: 0, bought: 16 })]).toEqual(['To buy (16)', 'To buy (all bought)']);
    expect(plantedText(['2026-10-30', '2026-10-30'])).toBe('Oct 30');
    expect(plantedText(['2026-10-28', '2026-11-02'])).toBe('Oct 28 to Nov 2');
  });
});

describe('what is bought: kept with the plan, bought and not yet planted', () => {
  const NOV1 = new Date(2026, 10, 1, 10).getTime(), NOV3 = new Date(2026, 10, 3, 9).getTime();
  const row = (shapes: Shape[], bought: Parameters<typeof plantList>[2]) => plantList(shapes, byId, bought).buy.find((r) => r.key === yaupon.id);
  it('a tick is every one to buy; more added later read "3 of 5 bought", not a stale tick; an untick is none', () => {
    const shapes = [plant(yaupon.id), plant(yaupon.id), plant(yaupon.id)];
    const ticked = { [yaupon.id]: tickEntry(3, plantsOfKind(shapes, yaupon.id, byId), NOV1) };
    expect(boughtText(row(shapes, ticked)!)).toBe('Bought');
    shapes.push(plant(yaupon.id), plant(yaupon.id));
    expect(row(shapes, ticked)!.bought).toBe(3);
    expect(boughtText(row(shapes, ticked)!)).toBe('3 of 5 bought');
    expect(listTotals(plantList(shapes, byId, ticked)).bought).toBe(3);
    // (What's left to buy, not counting those bought: the list bug hunt, Nov 1, "23 plants to buy · 6 bought".)
    expect(listTotals(plantList([...shapes, plant(columbine.id)], byId, ticked))).toMatchObject({ toBuy: 3, kinds: 2, bought: 3 });
    expect(totalsText(listTotals(plantList(shapes, byId, ticked)))).toBe('2 plants to buy, 1 kind · 3 bought, not yet planted');
    expect(totalsText(listTotals(plantList(shapes.slice(0, 3), byId, ticked)))).toBe('Nothing left to buy · 3 bought, not yet planted');
    expect(row(shapes, { [yaupon.id]: tickEntry(0, shapes, NOV3) })!.bought).toBe(0);
  });
  it('planted on or after the day it was ticked uses it up: undone, it is back; more of the kind added later are still to buy', () => {
    const shapes = [plant(yaupon.id), plant(yaupon.id)];
    const bought = { [yaupon.id]: tickEntry(2, plantsOfKind(shapes, yaupon.id, byId), NOV1) };
    // Planted two days later: the row has gone from To buy; the two bought went in the ground.
    for (const s of shapes) Object.assign(s, { status: 'planted', plantedOn: '2026-11-03' });
    expect(row(shapes, bought)).toBeUndefined();
    shapes.push(plant(yaupon.id), plant(yaupon.id));
    expect(row(shapes, bought)!.bought).toBe(0); // (not a stale tick)
    // Undone (back to planned, the date left as statusPatch leaves it): bought again.
    for (const s of shapes.slice(0, 2)) s.status = 'planned';
    expect(row(shapes, bought)!.bought).toBe(2);
  });
  it('plants planted before the tick don\'t use it up; ticked the day some went in, they\'re counted so the rest read bought', () => {
    const shapes = [plant(yaupon.id, { status: 'planted', plantedOn: '2026-10-20' }), plant(yaupon.id)];
    expect(row(shapes, { [yaupon.id]: tickEntry(1, plantsOfKind(shapes, yaupon.id, byId), NOV1) })!.bought).toBe(1);
    const same = [plant(yaupon.id, { status: 'planted', plantedOn: '2026-11-01' }), plant(yaupon.id)];
    const entry = tickEntry(1, plantsOfKind(same, yaupon.id, byId), NOV1);
    expect(entry).toEqual({ n: 2, at: NOV1 });
    expect(row(same, { [yaupon.id]: entry })!.bought).toBe(1);
    expect(dayOf(NOV1)).toBe('2026-11-01');
  });
});

// Bought means bought and not yet planted: a tick used up by planting stays used up whatever happens to the plant after
// (the list bug hunt, Nov 1: a planted Goldsturm deleted made one of the two placed since read "1 of 2 bought").
describe('what is bought, through the plan\'s changes: only planting uses a tick up, and only un-planting gives it back', () => {
  const G = 'rudbeckia-fulgida-goldsturm';
  const row = (key = G) => plantList(state.shapes, byId, state.bought).buy.find((r) => r.key === key);
  const get = (id: string) => state.shapes.find((s) => s.id === id)!;
  const del = (id: string) => { state.shapes = state.shapes.filter((s) => s.id !== id); pushHistory(`delete ${id}`); };
  const tick = (key: string, n: number) => { state.bought = { ...(state.bought ?? {}), [key]: tickEntry(n, plantsOfKind(state.shapes, key, byId), Date.now()) }; };

  it('a planted one deleted gives no tick back: the two placed since stay unbought, through Undo and Redo', () => {
    const three = [plant(G), plant(G), plant(G)];
    state.shapes = [...three];
    pushHistory();
    tick(G, 3);
    markPlantedToday(three.map((s) => s.id));
    expect(row()).toBeUndefined();
    state.shapes.push(plant(G), plant(G));
    pushHistory('add 2');
    expect(row()).toMatchObject({ count: 2, bought: 0 });
    del(three[0].id);
    expect(row()).toMatchObject({ count: 2, bought: 0 });
    undo();
    expect(row()).toMatchObject({ count: 2, bought: 0 });
    redo();
    expect(row()).toMatchObject({ count: 2, bought: 0 });
    // Undone back past Mark planted: the three bought, as they were ticked; done again, used up.
    undo(); undo(); undo();
    expect(row()).toMatchObject({ count: 3, bought: 3 });
    redo();
    expect(row()).toBeUndefined();
    redo(); redo();
    expect(row()).toMatchObject({ count: 2, bought: 0 });
    // (Kept as the plan keeps it: how many and when, nothing new.)
    expect(Object.keys(state.bought![G]).sort()).toEqual(['at', 'n']);
  });

  it('partly planted: one of those planted deleted leaves the rest bought as they were, Undo and Redo too', () => {
    const five = [plant(G), plant(G), plant(G), plant(G), plant(G)];
    state.shapes = [...five];
    pushHistory();
    tick(G, 5);
    markPlantedToday(five.slice(0, 3).map((s) => s.id));
    expect(row()).toMatchObject({ count: 2, bought: 2 });
    del(five[0].id);
    expect(row()!.bought).toBe(2);
    undo();
    expect(row()!.bought).toBe(2);
    redo();
    expect(row()!.bought).toBe(2);
    // Mark planted undone: the three back, bought.
    undo(); undo();
    expect(row()).toMatchObject({ count: 5, bought: 5 });
  });

  it('a planted one swapped for another plant takes no tick with it, nor uses up the other plant\'s', () => {
    const iris = 'iris-virginica', flag = 'iris-versicolor';
    const irises = [plant(iris), plant(iris), plant(iris)], flags = [plant(flag)];
    state.shapes = [...irises, ...flags];
    pushHistory();
    tick(iris, 3); tick(flag, 1);
    markPlantedToday([irises[0].id, irises[1].id]);
    expect([row(iris)!.bought, row(flag)!.bought]).toEqual([1, 1]);
    // (Swapped as src/plants.ts linkShapesToPlant does: its plant, the same status and planting date.)
    Object.assign(get(irises[0].id), { plantId: flag, label: flag });
    pushHistory('swap');
    expect([row(iris)!.bought, row(flag)!.bought]).toEqual([1, 1]);
    undo();
    expect([row(iris)!.bought, row(flag)!.bought]).toEqual([1, 1]);
    redo();
    expect([row(iris)!.bought, row(flag)!.bought]).toEqual([1, 1]);
  });

  it('un-planting by hand gives the tick back, as Undo does; a planting date changed, or a bought one not yet planted deleted, changes nothing', () => {
    const three = [plant(G), plant(G), plant(G)];
    state.shapes = [...three];
    pushHistory();
    tick(G, 3);
    markPlantedToday(three.map((s) => s.id));
    get(three[0].id).status = 'planned'; // (set back to Planned: statusPatch leaves its date)
    pushHistory('set to Planned');
    expect(row()).toMatchObject({ count: 1, bought: 1 });
    get(three[1].id).plantedOn = '2026-01-01'; // (before the tick: still planted, still bought then)
    pushHistory('date');
    expect(row()).toMatchObject({ count: 1, bought: 1 });
    const was = state.bought;
    del(three[0].id); // (bought, not planted: still in hand)
    expect(state.bought).toBe(was);
    state.shapes.push(plant(G));
    pushHistory('add');
    expect(row()).toMatchObject({ count: 1, bought: 1 });
  });

  it('across days: ticked Nov 1, planted Nov 3, one deleted Nov 5; Undo back past the planting gives the ticks back', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 1, 10));
    const three = [plant(G), plant(G), plant(G)];
    state.shapes = [...three];
    pushHistory();
    tick(G, 3);
    vi.setSystemTime(new Date(2026, 10, 3, 10));
    markPlantedToday(three.map((s) => s.id));
    state.shapes.push(plant(G));
    pushHistory('add');
    vi.setSystemTime(new Date(2026, 10, 5, 10));
    del(three[2].id);
    expect(row()).toMatchObject({ count: 1, bought: 0 });
    expect(dayOf(state.bought![G].at)).toBe('2026-11-01'); // (its day kept: the plantings on Nov 3 still use it up)
    undo(); undo(); undo();
    expect(row()).toMatchObject({ count: 3, bought: 3 });
  });

  it('keepBought: nothing ticked, or nothing planted moved, is the same ticks', () => {
    const shapes = [plant(G, { status: 'planted', plantedOn: '2026-11-01' })];
    expect(keepBought(undefined, shapes, [], byId)).toBeUndefined();
    const bought = { other: { n: 2, at: 5 } };
    expect(keepBought(bought, shapes, [], byId)).toBe(bought);
  });
});

// Jason's testing, Nov 1: "Right now I can't buy only 1 of my blueberries." How many are bought, by − and +, kept as
// the tick is: how many and when, nothing new.
describe('some of a kind bought, by count', () => {
  const B = 'vaccinium-tifblue';
  const row = () => plantList(state.shapes, byId, state.bought).buy.find((r) => r.key === B);
  const set = (n: number) => { state.bought = { ...(state.bought ?? {}), [B]: tickEntry(n, plantsOfKind(state.shapes, B, byId), Date.now()) }; };
  it('1 of 2 bought: Mark planted plants the one; the other stays to buy, unbought; the plan keeps {n, at} as before', () => {
    const two = [plant(B), plant(B)];
    state.shapes = [...two];
    pushHistory();
    set(1);
    expect(row()).toMatchObject({ count: 2, bought: 1 });
    expect(boughtText(row()!)).toBe('1 of 2 bought');
    expect(Object.keys(state.bought![B]).sort()).toEqual(['at', 'n']);
    markPlantedToday(row()!.ids.slice(0, 1));
    expect(row()).toMatchObject({ count: 1, bought: 0 });
    // One more bought, the next day's count: the one planted today is counted, so the other reads bought.
    set(1);
    expect(row()).toMatchObject({ count: 1, bought: 1 });
    expect(state.bought![B].n).toBe(2);
    // Down to none: none bought, and the planted one stays planted.
    set(0);
    expect(row()).toMatchObject({ count: 1, bought: 0 });
    expect(plantList(state.shapes, byId, state.bought).planted.map((r) => r.count)).toEqual([1]);
  });
});

// Jason's testing, Nov 1: marked planted too soon, a row goes back to To buy ("Not planted yet"), bought as it was.
describe('Not planted yet, from the Plant list', () => {
  const G = 'rudbeckia-fulgida-goldsturm';
  const row = (g: 'buy' | 'planted' = 'buy') => plantList(state.shapes, byId, state.bought)[g].find((r) => r.key === G);
  it('back to Planned, its date gone, as one step; the ticks it used up come back (keepBought), and Undo plants them again', () => {
    const three = [plant(G), plant(G), plant(G)];
    state.shapes = [...three];
    pushHistory();
    state.bought = { [G]: tickEntry(3, plantsOfKind(state.shapes, G, byId), Date.now()) };
    markPlantedToday(three.map((s) => s.id));
    expect(row()).toBeUndefined();
    const steps = state.history.length;
    markNotPlanted(row('planted')!.ids);
    expect(state.history).toHaveLength(steps + 1);
    expect(state.history.at(-1)!.label).toBe('set 3 plants to Planned');
    expect(state.shapes.map((s) => [s.status, s.plantedOn])).toEqual([['planned', undefined], ['planned', undefined], ['planned', undefined]]);
    expect(row()).toMatchObject({ count: 3, bought: 3 });
    expect(row('planted')).toBeUndefined();
    undo();
    expect(row()).toBeUndefined();
    expect(row('planted')).toMatchObject({ count: 3 });
    redo();
    expect(row()).toMatchObject({ count: 3, bought: 3 });
  });
  it('planted before the tick, or with none: back unbought; the tick for the rest stays as it was', () => {
    const old = plant(G, { status: 'planted', plantedOn: '2026-10-20' }), more = [plant(G), plant(G)];
    state.shapes = [old, ...more];
    pushHistory();
    state.bought = { [G]: tickEntry(2, plantsOfKind(state.shapes, G, byId), Date.now()) };
    expect(row()).toMatchObject({ count: 2, bought: 2 });
    markNotPlanted([old.id]);
    expect(row()).toMatchObject({ count: 3, bought: 2 });
    // (keepBought on its own: the same ticks, nothing to give back.)
    const before = state.history[state.history.length - 2].shapes;
    expect(keepBought(state.bought, before, state.shapes, byId)).toBe(state.bought);
    const none = plant(columbine.id, { status: 'planted', plantedOn: '2026-11-01' });
    state.shapes.push(none);
    pushHistory('add');
    markNotPlanted([none.id]);
    expect(plantList(state.shapes, byId, state.bought).buy.find((r) => r.key === columbine.id)).toMatchObject({ count: 1, bought: 0 });
  });
  it('only plants marked planted: one to buy or there already is left as it is', () => {
    const a = plant(G), b = plant(G, { status: 'existing' });
    state.shapes = [a, b];
    pushHistory();
    const steps = state.history.length;
    markNotPlanted([a.id, b.id]);
    expect(state.shapes.map((s) => s.status)).toEqual([undefined, 'existing']);
    expect(state.history).toHaveLength(steps + 1); // (a step, saying nothing)
  });
});

// Jason's testing, Nov 1: Tifblue blueberries labeled with their real cultivars, and a plain Tifblue row he couldn't
// place. A row says its plants' own labels beside its kind's name.
describe('a plant\'s own label beside its kind', () => {
  const tifblue = { id: 'vaccinium-tifblue', common: "Rabbiteye blueberry 'Tifblue'", botanical: "Vaccinium virgatum 'Tifblue'" } as unknown as Plant;
  const ids = { ...byId, [tifblue.id]: tifblue };
  it('counts each label, by name, in its group; a label that is its kind\'s name (spaces, capitals) is none', () => {
    const shapes = [
      plant(tifblue.id, { label: 'Premier' }), plant(tifblue.id, { label: "Rabbiteye blueberry 'Tifblue'" }), plant(tifblue.id, { label: ' Climax ' }),
      plant(tifblue.id, { label: "rabbiteye  blueberry 'tifblue'" }), plant(tifblue.id, { label: 'climax' }), plant(tifblue.id, { label: '' }),
      plant(tifblue.id, { label: 'Premier', status: 'planted', plantedOn: '2026-10-30' }),
      plant(undefined, { label: 'Tomato' }), plant('not-loaded', { label: 'Mystery' }),
    ];
    const l = plantList(shapes, ids, undefined);
    const buy = l.buy.find((r) => r.key === tifblue.id)!;
    expect(buy).toMatchObject({ name: "Rabbiteye blueberry 'Tifblue'", count: 6, labels: [{ label: 'Climax', count: 2 }, { label: 'Premier', count: 1 }] });
    expect(labelsText(buy)).toBe('labeled Climax ×2, Premier ×1');
    expect(labelsText(l.planted[0])).toBe('labeled Premier ×1');
    // (Named by its label, a plant of no catalog plant has none; nor one whose catalog plant isn't here.)
    expect(l.buy.filter((r) => r.key !== tifblue.id).map((r) => r.labels)).toEqual([[], []]);
    expect([ownLabel({ plantId: tifblue.id, label: 'Climax' }, ids), ownLabel({ label: 'Climax' }, ids), ownLabel({ plantId: 'not-loaded', label: 'X' }, ids)]).toEqual(['Climax', '', '']);
    expect(listText(plantList(shapes.slice(0, 6), ids, undefined), 'Back Yard').split('\n')[4])
      .toBe("☐ Rabbiteye blueberry 'Tifblue' × 6 · labeled Climax ×2, Premier ×1 · Vaccinium virgatum 'Tifblue' · Not in a bed");
  });
});

describe('Mark planted (Jason, Nov 1)', () => {
  it("sets the kind's planned plants to Planted with today's date, a date set before too, as one step Undo brings back", () => {
    const a = plant(yaupon.id), b = plant(yaupon.id, { plantedOn: '2025-04-01' }), c = plant(columbine.id);
    state.shapes = [a, b, c];
    pushHistory();
    markPlantedToday([a.id, b.id]);
    expect(state.shapes.map((s) => [s.status, s.plantedOn])).toEqual([['planted', today()], ['planted', today()], [undefined, undefined]]);
    expect(state.history).toHaveLength(2);
    expect(state.history[1].label).toBe('set 2 plants to Planted');
    undo();
    expect(state.shapes.map((s) => [s.status, s.plantedOn])).toEqual([[undefined, undefined], [undefined, '2025-04-01'], [undefined, undefined]]);
  });
});

describe('Share as text', () => {
  it('the plan, its totals, a box a kind to buy (ticked when bought), then what is planted and there already', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 1, 10));
    const shapes = [bed('Front bed', -5), plant(yaupon.id), plant(yaupon.id), plant(columbine.id, { x: 100 }), plant(columbine.id, { x: 100 }), plant(columbine.id, { x: 100 }),
      plant(mine.id, { status: 'planted', plantedOn: '2026-10-30' }), plant(undefined, { label: 'Old oak', status: 'existing', x: 100 })];
    const bought = { [yaupon.id]: { n: 2, at: Date.now() }, [columbine.id]: { n: 1, at: Date.now() } };
    expect(listText(plantList(shapes, byId, bought), 'Back Yard')).toBe([
      'Back Yard: plant list',
      '2 plants to buy, 1 kind · 3 bought, not yet planted',
      '',
      'To buy (2)',
      '☐ Wild columbine × 3 (1 bought) · Aquilegia canadensis · 1–2 ft tall · Not in a bed',
      "☑ Yaupon 'Nana' × 2 · Ilex vomitoria 'Nana' · 3–5 ft tall, 3–6 ft wide · Front bed",
      '',
      'Planted',
      "• Grandma's peony × 1 (Oct 30) · Front bed",
      '',
      'Existing',
      '• Old oak × 1 · Not in a bed',
    ].join('\n'));
  });
});
