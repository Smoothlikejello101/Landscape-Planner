import { bedOf, isBed, isPlant } from './beds';
import { sizeLine, type Plant } from './plants';
import type { PlanBought, Shape } from './types';

// The Plant list (Jason, Nov 1, from the UI review: "get the shopping list into my hand at the nursery"): every kind of
// plant in the plan, a row each, with its variety and botanical name, how many, its size and which beds, grouped To buy
// (planned), Planted and Existing, with what's been bought ticked. What's bought is kept with the plan (src/types.ts
// PlanBought); everything else comes from the plants themselves.
//
// Bought means bought and not yet planted: plants of a kind planted on or after the day it was ticked use the tick up
// (their planting date says so). So marking them planted keeps nothing more, Undo brings the tick back as it was, and
// plants of that kind added later show as still to buy rather than as a stale tick.

export type ListGroup = 'buy' | 'planted' | 'existing';
export interface ListRow {
  /** The kind: its catalog plant (a record folded into another counts as that one), one of my plants, or by its name. */
  key: string;
  name: string;
  botanical: string;
  /** "3–5 ft tall, 3–6 ft wide", or ''. */
  size: string;
  /** The beds its plants are in, by name (as the printed plan's list orders them); "Not in a bed" last. */
  beds: string[];
  count: number;
  /** Its plants in this group, in the plan's order. */
  ids: string[];
  /** To buy: how many are bought and not yet planted. */
  bought: number;
  /** Planted: the first and last planting dates (YYYY-MM-DD), where known. */
  plantedOn?: [string, string];
}
export interface PlantList { buy: ListRow[]; planted: ListRow[]; existing: ListRow[] }
export const NO_BED = 'Not in a bed';

/** Which group a plant is listed in: planned (or no status) to buy; To move with Existing (it's in the ground); To remove and Gone not at all. */
export function groupOf(s: Pick<Shape, 'status'>): ListGroup | null {
  if (!s.status || s.status === 'planned') return 'buy';
  if (s.status === 'planted') return 'planted';
  if (s.status === 'existing' || s.status === 'move') return 'existing';
  return null;
}
/** A plant's kind, as the list groups it and keeps its tick: its plant's id, or "n:" and its name for one not linked to a plant. */
export function kindKey(s: Pick<Shape, 'plantId' | 'label'>, byId: Record<string, Plant | undefined>): string {
  if (s.plantId) return byId[s.plantId]?.id ?? s.plantId;
  const name = s.label.trim().toLowerCase().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  return 'n:' + (name || 'unlabeled');
}
/** The calendar day (YYYY-MM-DD, local) a time in ms falls on. */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** How many of a kind's plants were planted on or after the day of `at`: each uses up one bought then. */
function usedUp(at: number, kind: Shape[]): number {
  const day = dayOf(at);
  return kind.filter((s) => !!s.plantedOn && !!s.status && s.status !== 'planned' && s.plantedOn >= day).length;
}
/** How many of a kind are bought and not yet planted. */
export function boughtNow(entry: { n: number; at: number } | undefined, kind: Shape[]): number {
  return entry ? Math.max(0, entry.n - usedUp(entry.at, kind)) : 0;
}
/** A kind's tick, set at `at` to `n` bought (all its plants to buy, or none). */
export function tickEntry(n: number, kind: Shape[], at: number): { n: number; at: number } {
  return { n: n + usedUp(at, kind), at };
}
/** Every plant of a kind in the plan, whatever its status (its tick is measured against them). */
export function plantsOfKind(shapes: Shape[], key: string, byId: Record<string, Plant | undefined>): Shape[] {
  return shapes.filter((s) => isPlant(s) && kindKey(s, byId) === key);
}

/** The plan's plants, a row a kind in each group, each group by name. */
export function plantList(shapes: Shape[], byId: Record<string, Plant | undefined>, bought: PlanBought | undefined): PlantList {
  // (Beds named as the printed plan's list names them: an unnamed one numbered in the plan's order.)
  const bedName = new Map<Shape, string>();
  let unnamed = 0;
  for (const b of shapes.filter(isBed)) bedName.set(b, b.label.trim() || `Unnamed bed ${++unnamed}`);
  const groups: Record<ListGroup, Map<string, ListRow>> = { buy: new Map(), planted: new Map(), existing: new Map() };
  const kinds = new Map<string, Shape[]>();
  for (const s of shapes) {
    if (!isPlant(s)) continue;
    const key = kindKey(s, byId);
    kinds.set(key, [...(kinds.get(key) ?? []), s]);
    const g = groupOf(s);
    if (!g) continue;
    let row = groups[g].get(key);
    if (!row) {
      const p = s.plantId ? byId[s.plantId] : undefined;
      const name = p?.common.trim() || s.label.trim() || 'Unlabeled plant';
      const bot = p?.botanical?.trim() ?? '';
      row = { key, name, botanical: bot && bot !== name ? bot : '', size: p ? sizeLine(p) : '', beds: [], count: 0, ids: [], bought: 0 };
      groups[g].set(key, row);
    }
    row.count++;
    row.ids.push(s.id);
    const bed = bedOf(s, shapes);
    const where = bed ? bedName.get(bed)! : NO_BED;
    if (!row.beds.includes(where)) row.beds.push(where);
    if (g === 'planted' && s.plantedOn) {
      const [a, b] = row.plantedOn ?? [s.plantedOn, s.plantedOn];
      row.plantedOn = [s.plantedOn < a ? s.plantedOn : a, s.plantedOn > b ? s.plantedOn : b];
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const sorted = (g: ListGroup) => [...groups[g].values()].map((r) => ({ ...r, beds: [...r.beds.filter((b) => b !== NO_BED).sort(byName), ...r.beds.filter((b) => b === NO_BED)] }))
    .sort((a, b) => byName(a.name, b.name));
  const buy = sorted('buy');
  for (const r of buy) r.bought = boughtNow(bought?.[r.key], kinds.get(r.key) ?? []);
  return { buy, planted: sorted('planted'), existing: sorted('existing') };
}

export interface ListTotals { toBuy: number; kinds: number; bought: number; planted: number; existing: number }
const sum = (rows: ListRow[], f: (r: ListRow) => number) => rows.reduce((n, r) => n + f(r), 0);
export function listTotals(l: PlantList): ListTotals {
  return {
    toBuy: sum(l.buy, (r) => r.count), kinds: l.buy.length, bought: sum(l.buy, (r) => Math.min(r.bought, r.count)),
    planted: sum(l.planted, (r) => r.count), existing: sum(l.existing, (r) => r.count),
  };
}
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** "16 plants to buy, 7 kinds · 10 bought"; "Nothing to buy" once all are planted or already there. */
export function totalsText(t: ListTotals): string {
  if (!t.kinds) return t.planted || t.existing ? 'Nothing to buy' : '';
  return `${plural(t.toBuy, 'plant')} to buy, ${plural(t.kinds, 'kind')}` + (t.bought ? ` · ${t.bought >= t.toBuy ? 'all bought' : `${t.bought} bought`}` : '');
}
/** Where a row stands on buying: '' (none bought), "3 of 5 bought", or "Bought". */
export function boughtText(r: ListRow): string {
  return r.bought >= r.count ? 'Bought' : r.bought ? `${r.bought} of ${r.count} bought` : '';
}
/** "Oct 30", or "Oct 28 to Nov 2". */
export function plantedText(on: [string, string] | undefined): string {
  if (!on) return '';
  const say = (d: string) => { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  return on[0] === on[1] ? say(on[0]) : `${say(on[0])} to ${say(on[1])}`;
}
/** A row's size and beds: "3–5 ft tall, 3–6 ft wide · Front bed, Side bed". */
export const rowFacts = (r: ListRow): string => [r.size, r.beds.join(', ')].filter(Boolean).join(' · ');

/**
 * The list as text, to paste into a note or a message (Share as text): the plan's name and totals, then a line a kind,
 * a box to tick on each to buy.
 */
export function listText(l: PlantList, planName: string): string {
  const line = (mark: string, r: ListRow, after = '') => `${mark} ${r.name} × ${r.count}${after}` + [r.botanical, rowFacts(r)].filter(Boolean).map((x) => ` · ${x}`).join('');
  const out = [`${planName}: plant list`, totalsText(listTotals(l))];
  if (l.buy.length) {
    out.push('', 'To buy');
    for (const r of l.buy) out.push(line(r.bought >= r.count ? '☑' : '☐', r, r.bought && r.bought < r.count ? ` (${r.bought} bought)` : ''));
  }
  if (l.planted.length) {
    out.push('', 'Planted');
    for (const r of l.planted) out.push(line('•', r, r.plantedOn ? ` (${plantedText(r.plantedOn)})` : ''));
  }
  if (l.existing.length) {
    out.push('', 'Existing');
    for (const r of l.existing) out.push(line('•', r));
  }
  return out.filter((x, i) => x !== '' || i > 1).join('\n');
}
