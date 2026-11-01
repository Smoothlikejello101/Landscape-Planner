// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markPlantedToday } from '../src/mutations';
import { pushHistory, undo } from '../src/history';
import { boughtText, dayOf, groupOf, kindKey, listText, listTotals, plantedText, plantList, plantsOfKind, tickEntry, totalsText } from '../src/plant-list';
import type { Plant } from '../src/plants';
import { state } from '../src/state';
import { today } from '../src/status';
import type { Shape } from '../src/types';

// The Plant list (Jason, Nov 1, from the UI review): a row a kind, grouped To buy · Planted · Existing, with what's
// bought ticked (kept with the plan) and Mark planted.

const base = { color: '#16a34a', opacity: 0.65, locked: false };
let at = 0;
const plant = (plantId: string | undefined, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id: `p${++at}`, type: 'circle', x: 0, y: 0, radius: 1, role: 'plant', label: plantId ?? '', ...(plantId ? { plantId } : {}), ...extra } as Shape);
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
    expect(totalsText({ ...t, bought: 10 })).toBe('16 plants to buy, 7 kinds · 10 bought');
    expect(totalsText({ ...t, bought: 16 })).toBe('16 plants to buy, 7 kinds · all bought');
    expect(totalsText({ ...t, toBuy: 0, kinds: 0, planted: 3 })).toBe('Nothing to buy');
    expect(totalsText({ ...t, toBuy: 0, kinds: 0 })).toBe('');
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
      '5 plants to buy, 2 kinds · 3 bought',
      '',
      'To buy',
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
