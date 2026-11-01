// Every warning in the plan now, in one list (Jason, Oct 31, from round 3: Owen had no whole-plan check for plants
// still missing a partner; Jason's answer: "a collapsible section in warnings that shows all current warnings", by
// kind when there are more than a handful, active above dismissed, each fold saying "x active, y dismissed").
//
// The same warnings the plan shows, worked out the same way: crowding (pairs, and the pairs left close on purpose),
// sun, hardiness, poison to who's in the yard, utilities, fruit partners. A kind switched off in Settings isn't listed:
// its switch says so. Plants filtered out of the plan or in a hidden layer aren't either, as on the plan.
//
// Each can be dismissed here, and each kind all at once, or shown all again (Jason, Nov 1: "for each warning type
// there are 'dismiss all' and (if relevant) 'reactivate all' buttons, and a 'dismiss' button in the same place we
// already have 'show again'"). A row is dismissed as the plan dismisses it: a pair left close on purpose, as Leave it
// does; sun and utilities, that copy where it stands; hardiness, poison and fruit partners, the plant across the plan.
// A dismissed row says which of those it is.

import { crowdOptions, hardyHere } from './crowd-here';
import { crowdPairs, type CrowdLevel } from './crowding';
import { clearForPlan, dismissedForPlan, dismissForPlan, poisonSaid } from './dismissals';
import { fruitNeed } from './fruit-partners';
import { displayLabel } from './geometry';
import { flushHistoryDebounce, pushHistory, undo } from './history';
import { hardinessWarning, PLANTS, plantsById, type Plant } from './plants';
import { state } from './state';
import { alreadyThere, shownWith } from './status';
import { save } from './storage';
import { checkPlantSun, sunDismissedFor } from './sun';
import type { Shape } from './types';
import { issuesKey, prepareUtilities, utilityIssues } from './utilities';

export type WarningKind = 'crowding' | 'sun' | 'hardy' | 'poison' | 'utility' | 'fruit';
/** Each kind's name, in the order they're listed. */
export const WARNING_KINDS: { kind: WarningKind; name: string }[] = [
  { kind: 'crowding', name: 'Crowding' }, { kind: 'sun', name: 'Sun' }, { kind: 'hardy', name: 'Hardiness' },
  { kind: 'poison', name: 'Poison' }, { kind: 'utility', name: 'Utilities' }, { kind: 'fruit', name: 'Fruit partners' },
];
/** Each kind in a sentence ("Dismissed 5 crowding warnings"). */
export const KIND_WORDS: Record<WarningKind, string> = { crowding: 'crowding', sun: 'sun', hardy: 'hardiness', poison: 'poison', utility: 'utility', fruit: 'fruit partner' };
/** The kinds dismissed for the plant across the plan, its copies added later too (src/dismissals.ts). */
export const acrossPlan = (kind: WarningKind): kind is 'hardy' | 'poison' | 'fruit' => kind === 'hardy' || kind === 'poison' || kind === 'fruit';

export interface WarningRow {
  kind: WarningKind;
  /** The shapes it's about (a tap selects them). */
  ids: string[];
  /** Whose it is ("Fig ×3", "Buttonbush and Oakleaf hydrangea"); '' where `said` names them already. */
  name: string;
  /** What it says. */
  said: string;
  dismissed: boolean;
  /**
   * A dismissed row: who it's dismissed for ("for this one", "for every Fig in this plan", "for this pair, left close on
   * purpose"), since a copy's own and a plant's across the plan otherwise look alike (the review of Settings → Warnings,
   * Nov 1).
   */
  scope?: string;
  /** Hardiness, poison and fruit partners: the catalog plant, whose warning is dismissed across the plan. */
  plantId?: string;
  /**
   * An active row: dismiss it, as the plan's own dismissal for its kind does. Only the change, without a step or a save
   * (setDismissed does those, once for several): whether a shape changed.
   */
  dismiss?: () => boolean;
  /** A dismissed row: warn again (likewise only the change: whether a shape changed). */
  again?: () => boolean;
}

/** "Fig", or "Fig ×3" for copies. */
const named = (s: Shape[]): string => `${displayLabel(s[0]) || 'A plant'}${s.length > 1 ? ` ×${s.length}` : ''}`;
const plantOf = (s: Shape): Plant | undefined => (s.role === 'plant' && s.plantId ? plantsById[s.plantId] : undefined);
/** A plant in the ground or going in: not gone, not coming out. */
const living = (s: Shape) => s.status !== 'gone' && s.status !== 'remove';
const leftClose = (a: Shape, b: Shape) => !!(a.type === 'circle' && a.crowdOk?.includes(b.id)) || !!(b.type === 'circle' && b.crowdOk?.includes(a.id));
/** "crowded, 2 ft apart": how far, to tell one pair of the same plants from another. */
const crowdSaid = (level: CrowdLevel, a: Shape, b: Shape) => `${level}, ${Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10} ft apart`;

/** Leave a pair close on purpose, as Leave it does (src/ui/crowd-notice.ts leaveClose: on the first, if a circle). */
function leavePair(a: Shape, b: Shape): boolean {
  const [x, y] = a.type === 'circle' ? [a, b] : [b, a];
  if (x.type !== 'circle') return false;
  x.crowdOk = [...new Set([...(x.crowdOk ?? []), y.id])];
  return true;
}
/** Flag a pair left close on purpose again (only that pair). */
function flagPairAgain(a: Shape, b: Shape): boolean {
  let changed = false;
  for (const [x, y] of [[a, b], [b, a]] as const) {
    if (x.type !== 'circle' || !x.crowdOk?.includes(y.id)) continue;
    const keep = x.crowdOk.filter((id) => id !== y.id);
    if (keep.length) x.crowdOk = keep; else delete x.crowdOk;
    changed = true;
  }
  return changed;
}
/**
 * Show a copy's own dismissed warning again (sun, utilities: a copy's own, where it stands), as its pane does: a sun
 * warning's goes; a utility warning's is left '', shown again on purpose, so sync doesn't fill it back from an older copy
 * (src/sync/engine.ts withUtilities).
 */
function againOn(s: Shape, field: 'sunDismissed' | 'utilityDismissed'): boolean {
  if (field === 'utilityDismissed') s.utilityDismissed = ''; else delete s.sunDismissed;
  return true;
}

/** "for every Barbados aloe in this plan": a plant's warning dismissed across the plan, its copies added later too. */
const everyOne = (plantId: string) => `for every ${plantsById[plantId]?.common ?? 'one'} in this plan`;

/** Plants grouped by catalog plant, in plan order. */
function byPlant(shapes: Shape[]): Map<string, Shape[]> {
  const out = new Map<string, Shape[]>();
  for (const s of shapes) if (s.role === 'plant' && s.plantId && plantsById[s.plantId]) out.set(s.plantId, [...(out.get(s.plantId) ?? []), s]);
  return out;
}

/** Every warning in the plan now, kind by kind, each kind's active ones first. */
export function planWarnings(): WarningRow[] {
  const shown = state.shapes.filter((s) => shownWith(s, state.viewFilter));
  const plants = shown.filter((s) => s.role === 'plant' && living(s));
  const rows: WarningRow[] = [];

  // Crowding: the pairs flagged, then those left close on purpose that would be (worked out without their Leave it).
  if (state.showCrowding || state.crowdWarnings) {
    const active = crowdPairs(shown, plantsById, crowdOptions());
    for (const p of active) rows.push({ kind: 'crowding', ids: [p.a.id, p.b.id], name: `${named([p.a])} and ${named([p.b])}`, said: crowdSaid(p.level, p.a, p.b), dismissed: false, dismiss: () => leavePair(p.a, p.b) });
    const bare = shown.map((s) => (s.type === 'circle' && s.crowdOk ? { ...s, crowdOk: undefined } : s));
    const real = new Map(shown.map((s) => [s.id, s]));
    for (const p of crowdPairs(bare, plantsById, crowdOptions())) {
      const a = real.get(p.a.id)!, b = real.get(p.b.id)!;
      if (!leftClose(a, b)) continue;
      rows.push({ kind: 'crowding', ids: [a.id, b.id], name: `${named([a])} and ${named([b])}`, said: crowdSaid(p.level, a, b), dismissed: true, scope: 'for this pair, left close on purpose', again: () => flagPairAgain(a, b) });
    }
  }

  // Sun: a copy's own, by where it stands (in a sun area recorded), dismissed in what it says now, as its pane does.
  if (state.sunWarnings) {
    const off: WarningRow[] = [];
    for (const s of plants) {
      const check = checkPlantSun(s, plantOf(s), state.shapes);
      if (!check || check.ok) continue;
      const gone = sunDismissedFor(check, s);
      (gone ? off : rows).push({ kind: 'sun', ids: [s.id], name: '', said: check.message, dismissed: gone,
        ...(gone ? { scope: 'for this one', again: () => againOn(s, 'sunDismissed') } : { dismiss: () => { s.sunDismissed = check.message; return true; } }) });
    }
    rows.push(...off);
  }

  // Hardiness and poison: the plant's (every copy), dismissed across the plan or copy by copy.
  const perPlant = byPlant(plants.filter((s) => !(s.type === 'circle' && s.tree)));
  const plantRows = (kind: 'hardy' | 'poison', said: (p: Plant) => string, field: 'hardyDismissed' | 'poisonDismissed', skip: (s: Shape) => boolean = () => false) => {
    const off: WarningRow[] = [];
    for (const [id, copies] of perPlant) {
      const line = said(plantsById[id]!);
      if (!line) continue;
      const here = copies.filter((s) => !skip(s));
      const all = dismissedForPlan(kind, id, line);
      const on = all ? [] : here.filter((s) => s[field] !== line), quiet = all ? here : here.filter((s) => s[field] === line);
      // (Dismissed, it's the plant across the plan, as from its pane: every copy, and the ones added later.)
      if (on.length) rows.push({ kind, ids: on.map((s) => s.id), name: named(on), said: line, dismissed: false, plantId: id, dismiss: () => { dismissForPlan(kind, id, line); return false; } });
      if (quiet.length) off.push({ kind, ids: quiet.map((s) => s.id), name: named(quiet), said: line, dismissed: true, scope: all ? everyOne(id) : quiet.length === 1 ? 'for this one' : `for these ${quiet.length}`, plantId: id, again: () => clearForPlan(kind, id) });
    }
    rows.push(...off);
  };
  if (state.hardyWarnings) plantRows('hardy', (p) => hardinessWarning(p)?.line ?? '', 'hardyDismissed', (s) => s.status === 'existing' || alreadyThere(s));
  if (state.poisonWarnings) plantRows('poison', poisonSaid, 'poisonDismissed');

  // Utilities: a copy's own, by where it stands (no switch: a power line, a buried line, a septic field).
  const utils = prepareUtilities(shown.filter((s) => s.role === 'utility'));
  if (utils.length) {
    const off: WarningRow[] = [];
    for (const s of plants) {
      const issues = utilityIssues(s, utils, plantsById);
      if (!issues.length) continue;
      const key = issuesKey(issues), gone = s.utilityDismissed === key;
      (gone ? off : rows).push({ kind: 'utility', ids: [s.id], name: named([s]), said: issues.map((i) => i.line).join('; '), dismissed: gone,
        ...(gone ? { scope: 'for this one', again: () => againOn(s, 'utilityDismissed') } : { dismiss: () => { s.utilityDismissed = key; return true; } }) });
    }
    rows.push(...off);
  }

  // Fruit partners: plants still without one (the whole plan counts as partners, as when placing).
  if (state.fruitWarnings) {
    const plan = state.shapes.flatMap((s) => (s.role === 'plant' && s.status !== 'gone' && plantOf(s) ? [plantOf(s)!] : []));
    const off: WarningRow[] = [];
    for (const [id, copies] of perPlant) {
      const need = fruitNeed(plantsById[id]!, plan, PLANTS, hardyHere);
      if (!need) continue;
      const gone = dismissedForPlan('fruit', id, need.line);
      (gone ? off : rows).push({ kind: 'fruit', ids: copies.map((s) => s.id), name: '', said: need.line, dismissed: gone, plantId: id,
        ...(gone ? { scope: everyOne(id), again: () => clearForPlan('fruit', id) } : { dismiss: () => { dismissForPlan('fruit', id, need.line); return false; } }) });
    }
    rows.push(...off);
  }
  return rows;
}

/**
 * Dismiss these rows (a row's Dismiss, a kind's Dismiss all), or show them again (Show again, Show all again): one step,
 * saved (Jason, Nov 1). How many, and `takeBack`, the notice's Undo: false, leaving it, if the plan has changed since.
 *
 * Warnings dismissed for a plant across the plan aren't in the undo history (src/history.ts keeps the shapes), so
 * `takeBack` puts those back as they were itself; the shapes' part, where there is one, is a step it undoes.
 */
export function setDismissed(rows: WarningRow[], dismissed: boolean): { n: number; takeBack: () => boolean } {
  const these = rows.filter((r) => r.dismissed !== dismissed && (dismissed ? r.dismiss : r.again));
  flushHistoryDebounce(); // (a step being gathered is its own)
  const before = state.dismissed;
  let changed = false;
  for (const r of these) changed = (dismissed ? r.dismiss! : r.again!)() || changed;
  if (changed) {
    // (What Undo says on a computer: "Undo: dismiss 5 crowding warnings".)
    const word = KIND_WORDS[these[0].kind], what = these.length === 1 ? `a ${word} warning` : `${these.length} ${word} warnings`;
    pushHistory(dismissed ? `dismiss ${what}` : `show ${what} again`);
  }
  if (these.length) save();
  const step = state.history[state.historyIndex], after = state.dismissed;
  return { n: these.length, takeBack: () => {
    flushHistoryDebounce();
    if (state.history[state.historyIndex] !== step || state.dismissed !== after) return false;
    if (changed) undo();
    // (Kept, though empty, once the plan has had any: so taking them back syncs too, as in src/dismissals.ts.)
    if (state.dismissed !== before) { state.dismissed = before ?? {}; save(); }
    return true;
  } };
}

/** "3 active, 1 dismissed" (each part only when there are some). */
export function countSaid(rows: WarningRow[]): string {
  const on = rows.filter((r) => !r.dismissed).length, off = rows.length - on;
  return [on ? `${on} active` : '', off ? `${off} dismissed` : ''].filter(Boolean).join(', ') || 'none';
}
