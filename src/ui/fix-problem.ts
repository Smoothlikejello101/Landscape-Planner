// Fix from the problem (Jason's UI review, Nov 2, marked Next), from a warning: in Warnings, in a plant's details, and in
// the crowding notice. Two plants that may grow into each other: Nudge apart. Too big for its spot (crowding, or wider
// than its bed): Swap, with smaller forms of the same plant first. Any warning a different plant would answer (sun,
// hardiness, poison, crowding): Swap opened already filtered by the rule that failed, as filters the gardener can take
// off, with a line saying why. Nothing but the plan and the catalog's sourced facts: no "plants like this" (Jason).
// The working out: src/fix-problem.ts.

import { crowdOptions } from '../crowd-here';
import { roomAt } from '../crowding';
import { bedWidth, moverOf, nudgeApart, nudgeTargets, widerThanBed, type Nudge } from '../fix-problem';
import { setCenter, shapeCenter } from '../geometry';
import { flushHistoryDebounce, pushHistory, stepNamed } from '../history';
import { bedOf } from '../beds';
import { plantFilter, plantsById, swapFiltersAside, type PlantFilter } from '../plants';
import { state } from '../state';
import { shownWith } from '../status';
import { save } from '../storage';
import { afternoonHours, formatHours, sunAt, sunLevel } from '../sun';
import { isTree } from '../trees';
import type { Shape } from '../types';
import { household } from '../yard';
import { el } from '../dom';
import { undoNotice } from './delete-selected';
import { render } from './render';
import { toast } from './toast';

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
const nameOf = (s: Shape) => (s.plantId && plantsById[s.plantId]?.common) || s.label?.trim() || 'a plant';
const shown = () => state.shapes.filter((x) => shownWith(x, state.viewFilter));

// ---------- Nudge apart ----------
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const inWords = (k: number) => NUMBER_WORDS[k] ?? String(k);
/** "A", "A and B", "A, B and C"; past three, "A, B and 2 more". */
function listed(items: string[]): string {
  if (items.length > 3) return `${items.slice(0, 2).join(', ')} and ${items.length - 2} more`;
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] ?? '';
}
/**
 * The plants a plant was nudged away from, in words: "Aster", "Aster and Sedge", "the other" (one of its own kind),
 * "the other two", "another Snowberry and Aster", "two Aster" (no guessed plural, as "Two Snowberry" in the crowding
 * notice: a plant's name as a nursery says it).
 */
export function awaySaid(m: Shape, others: Shape[]): string {
  const name = nameOf(m), same = others.filter((o) => nameOf(o) === name).length;
  const rest = new Map<string, number>();
  for (const o of others) if (nameOf(o) !== name) rest.set(nameOf(o), (rest.get(nameOf(o)) ?? 0) + 1);
  const restSaid = [...rest].map(([n, k]) => (k === 1 ? n : `${inWords(k)} ${n}`));
  const sameSaid = !same ? [] : !rest.size ? [same === 1 ? 'the other' : `the other ${inWords(same)}`] : [same === 1 ? `another ${name}` : `${inWords(same)} other ${name}`];
  return listed([...sameSaid, ...restSaid]);
}
/** What Nudge apart says when it can't: why, so nothing is left to guess. */
export function nudgeRefused(r: Extract<Nudge, { ok: false }>): string {
  if (r.why === 'apart') return 'They’re far enough apart already.';
  if (r.why === 'fixed') return 'Neither can be nudged: each is locked, or already in the ground.';
  const m = r.mover!;
  const away = `${nameOf(m)} away from ${awaySaid(m, r.others ?? [r.other!])}`;
  if (r.why === 'bed') {
    const bed = r.bed?.label?.trim() || 'its bed';
    return bedOf(m, state.shapes) ? `No room to nudge ${away} without leaving ${bed}.` : `No room to nudge ${away} without going into ${r.bed?.label?.trim() || 'a bed'}.`;
  }
  return `No room to nudge ${away}: it would crowd ${nameOf(r.third!)}.`;
}
/** Every plant `s` is close to or crowding (not those dismissed), `first` leading: what its Nudge apart moves it from. */
export const nudgeList = (s: Shape, first?: Shape): Shape[] => nudgeTargets(s, shown(), plantsById, crowdOptions(), first);
/**
 * A crowded pair's Nudge apart (Warnings): the one of the two that moves (the one selected, else the newer), away from
 * every plant it's close to, the other first (Jason, Nov 4).
 */
export function nudgePair(a: Shape, b: Shape, prefer?: string): boolean {
  const pair = moverOf(a, b, state.shapes, prefer);
  return pair ? nudgeNow(pair[0], nudgeList(pair[0], pair[1]), pair[0].id) : nudgeNow(a, b, prefer);
}
/**
 * Nudge apart, now: `a` moved clear of `b` (several: of them all, `a` moving; one: the newer of the two, or `prefer`,
 * the one selected or just placed), one step, with a notice and its Undo. While placing, the step goes with the plant's
 * placing: an Undo on the place bar takes back the plant, its nudge with it (src/place.ts undoPlace). Whether it moved.
 */
export function nudgeNow(a: Shape, b: Shape | Shape[], prefer?: string): boolean {
  const r = nudgeApart(a, b, shown(), plantsById, { ...crowdOptions(), prefer, all: state.shapes });
  if (!r.ok) { toast(nudgeRefused(r), 6000); return false; }
  const m = state.shapes.find((x) => x.id === r.mover.id);
  if (!m) return false;
  flushHistoryDebounce();
  setCenter(m, r.to);
  pushHistory(`nudge ${stepNamed([m])} apart`);
  const placed = state.placing?.placed.find((x) => x.id === m.id);
  if (placed) (placed.also ??= []).push(state.history[state.historyIndex]);
  save();
  render();
  const one = r.others.some((o) => nameOf(o) === nameOf(m));
  undoNotice(`Nudged ${one ? 'one ' : ''}${nameOf(m)} ${f1(r.by)} ft away from ${awaySaid(m, r.others)}.`, undefined, 'nudge-notice');
  const n = document.getElementById('toast-action');
  if (n) n.dataset.about = m.id; // (gone with the plant; kept off it: src/ui/toast.ts)
  return true;
}

// ---------- Swap, filtered by what failed ----------
/** What a Swap opened from a warning is filtered for, and why; too big for its spot, its smaller forms first. */
export interface SwapFix {
  /** "Filtered for part shade, the sun where it's planted". */
  line: string;
  /** The filters it set: the line stays while any is still on. */
  set: Partial<PlantFilter>;
  /** Too big for its spot: the plant swapped, and the width that fits where it's planted (null: no limit found). */
  smaller?: { plantId: string; room: number | null };
}
let fix: SwapFix | null = null;
/** The Swap that's open, if it came from a warning. */
export const swapFix = (): SwapFix | null => fix;
/** The picker closed (src/ui/plants-panel.ts pickerClosed). */
export function swapFixClosed() { fix = null; }
/** Whether any of a Swap's filters is still on (the gardener may take them all off). */
export function swapFixOn(f: SwapFix): boolean {
  return Object.entries(f.set).some(([k, v]) => JSON.stringify(plantFilter[k as keyof PlantFilter]) === JSON.stringify(v));
}

/**
 * The picker, to swap these plants for another (as their details' Swap does: src/ui/props-panel.ts openSwap), its
 * filters set aside and the warning's on (src/plants.ts swapFiltersAside); they're selected, so closing it goes back to
 * their details.
 */
function openSwapWith(shapes: Shape[], why: SwapFix) {
  if (!shapes.length) return;
  state.pickerLinkId = shapes[0].id;
  state.pickerLinkAlso = shapes.slice(1).map((x) => x.id);
  state.pickerLinkLocked = true;
  state.selectedIds = shapes.map((x) => x.id);
  swapFiltersAside(why.set);
  fix = why;
  state.menu = null;
  state.panel = 'plants';
  render();
}

export type SwapFor = 'sun' | 'hardy' | 'poison' | 'big';
const SUN_SAID: Record<string, string> = { Full: 'full sun', Part: 'part shade', Shade: 'shade' };
/** Who's in the yard, in words: "kids and dogs". */
function yardSaid(): string {
  const y = household();
  const who = [y.kids ? 'kids' : '', y.dogs ? 'dogs' : '', y.cats ? 'cats' : '', y.horses ? 'horses' : ''].filter(Boolean);
  return who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who.at(-1)}` : who[0] ?? '';
}
/**
 * The width that fits where a plant stands, and what sets it: the plants near it (at the height each shares with it),
 * and its bed's width if it's in one (not a tree's: its crown is over the bed). Null with neither.
 */
export function roomFor(s: Shape): { width: number; by: Shape; bed: boolean } | null {
  const near = roomAt(s, shown(), plantsById);
  const bed = !isTree(s, plantsById) ? bedOf(s, state.shapes) : null;
  const w = bed ? bedWidth(bed) : null;
  if (bed && w != null && (!near || w < near.width)) return { width: w, by: bed, bed: true };
  return near ? { ...near, bed: false } : null;
}
/** What a Swap from this warning is filtered for, or null where the plan says nothing to filter by. */
export function swapFixFor(kind: SwapFor, shapes: Shape[]): SwapFix | null {
  const s = shapes[0];
  if (!s) return null;
  if (kind === 'sun') {
    const at = sunAt(shapeCenter(s), state.shapes);
    if (!at) return null;
    const level = sunLevel(at.info), pm = afternoonHours(at.info);
    // (2 h or more of sun from 1 to 6 pm scorches a plant not rated for full sun, whatever the day's total: src/sun.ts.)
    const hot = level !== 'Full' && pm != null && pm >= 2;
    return { set: { sun: level, ...(hot ? { afternoonSun: true } : {}) },
      line: `Filtered for ${SUN_SAID[level]}${hot ? ` with ${formatHours(pm)} of hot afternoon sun` : ''}, the sun where it’s planted` };
  }
  if (kind === 'hardy') {
    if (!state.location) return null;
    return { set: { hardyHere: true }, line: `Filtered for plants hardy in zone ${state.location.zone}, the garden’s zone` };
  }
  if (kind === 'poison') {
    const y = household(), who = yardSaid();
    if (!who) return null;
    const set: Partial<PlantFilter> = {};
    if (y.kids) set.noPoison = true;
    if (y.dogs) set.dogs = y.dogs;
    if (y.cats) set.cats = true;
    if (y.horses) set.horses = true;
    return { set, line: `Filtered for the ${who} in the yard` };
  }
  // Too big for its spot: a width that fits there, its smaller forms first (src/ui/plants-panel.ts).
  if (!s.plantId || !plantsById[s.plantId]) return null;
  const room = roomFor(s);
  const smaller = { plantId: s.plantId, room: room ? Math.max(0, room.width) : null };
  if (!room) return { set: {}, line: '', smaller };
  // (Down to the half foot: "up to 2.5 ft", never a width that doesn't fit.)
  const w = Math.floor(room.width * 2 + 1e-9) / 2;
  const where = room.bed ? `the width of ${room.by.label?.trim() || 'its bed'}` : `the room it has beside ${nameOf(room.by)}`;
  if (w < 0.5) return { set: {}, line: `Too close to ${nameOf(room.by)} for any plant to fit there`, smaller };
  return { set: { width: `-${w}` }, line: `Filtered for plants up to ${w} ft wide, ${where}`, smaller };
}
/** Swap these plants, filtered by what failed; said so when the plan gives nothing to filter by. */
export function swapFiltered(kind: SwapFor, shapes: Shape[]) {
  const why = swapFixFor(kind, shapes) ?? { set: {}, line: '' };
  openSwapWith(shapes, why);
}

/** A warning's button: Swap, filtered by what failed (`label`: what it says; `testid` names its kind). */
export function swapButton(kind: SwapFor, shapes: Shape[], label: string, className = 'link-reset'): HTMLElement {
  const b = el('button', { className, 'data-testid': `fix-swap-${kind}` }, label);
  b.addEventListener('click', () => swapFiltered(kind, shapes));
  return b;
}

// ---------- Wider than its bed ----------
/**
 * In a plant's details: wider than its bed is anywhere (Jason, Nov 2: too big for its spot), with Swap for a smaller
 * plant. Said there only: not one of Warnings' kinds, and no badge on the plan.
 */
export function bedFitNote(s: Shape): HTMLElement | null {
  const w = widerThanBed(s, state.shapes, plantsById);
  if (!w) return null;
  const bed = w.bed.label?.trim() || 'its bed';
  return el('div', { className: 'check-banner warn', 'data-testid': 'bed-fit' },
    el('div', {}, `Wider than ${bed}: it typically spreads ${f1(w.spread)} ft, and the bed is ${f1(w.width)} ft across at its widest.`),
    el('div', { className: 'dismiss-row' }, swapButton('big', [s], 'Swap for a smaller plant…')));
}
