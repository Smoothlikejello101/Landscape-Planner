// Every warning in the plan now, in one list (Jason, Oct 31, from round 3: Owen had no whole-plan check for plants
// still missing a partner; Jason's answer: "a collapsible section in warnings that shows all current warnings", by
// kind, active above dismissed). Since Nov 1 it's the Warnings sheet's, a plan tool of its own (src/ui/warnings-sheet.ts:
// Jason approved the mock-ups), kind by kind, safety first: poison, utilities, hardiness, sun, crowding, fruit partners.
//
// The same warnings the plan shows, worked out the same way: poison to who's in the yard, utilities, hardiness, sun,
// crowding (pairs, and the pairs dismissed), fruit partners. A kind switched off isn't listed: its switch says so.
// Plants filtered out of the plan or in a hidden layer aren't either, as on the plan, and the sheet says so
// (hiddenFromChecks), so an empty list is never taken for an all-clear (the review of Settings → Warnings, Nov 1).
//
// Each can be dismissed, and each kind all at once, or shown all again (Jason, Nov 1). A row is dismissed as the plan
// dismisses it: a crowded pair, that pair; sun and utilities, that copy where it stands; hardiness, poison and fruit
// partners, the plant across the plan. A dismissed row says which of those it is. Each row reads as the plant's own
// details say it: its name first, then the problem (poison with its severity; sun naming the sun area).

import { crowdOptions, hardyHere } from './crowd-here';
import { crowdPairs, type CrowdLevel } from './crowding';
import { clearForPlan, dismissedForPlan, dismissForPlan, poisonLine, poisonSaid } from './dismissals';
import { fruitNeed } from './fruit-partners';
import { displayLabel, shapeCenter } from './geometry';
import { flushHistoryDebounce, pushHistory, undo } from './history';
import { hardinessWarning, PLANTS, plantsById, type Plant } from './plants';
import { roleHidden } from './roles';
import { state } from './state';
import { alreadyThere, passesFilter, shownWith, statusLabel } from './status';
import { save } from './storage';
import { checkPlantSun, sunAt, sunDismissedFor } from './sun';
import type { Shape } from './types';
import { issuesKey, prepareUtilities, utilityIssues, utilityOf } from './utilities';
import { household, yardSet } from './yard';

export type WarningKind = 'crowding' | 'sun' | 'hardy' | 'poison' | 'utility' | 'fruit';
/**
 * Each kind's name, in the order they're listed: safety first (Jason approved the mock-ups, Nov 1). "Utilities", not
 * "Utility lines": a septic field is one of them (Jason).
 */
export const WARNING_KINDS: { kind: WarningKind; name: string }[] = [
  { kind: 'poison', name: 'Poison' }, { kind: 'utility', name: 'Utilities' }, { kind: 'hardy', name: 'Hardiness' },
  { kind: 'sun', name: 'Sun' }, { kind: 'crowding', name: 'Crowding' }, { kind: 'fruit', name: 'Fruit partners' },
];
const ORDER = new Map(WARNING_KINDS.map((k, i) => [k.kind, i]));
/** Each kind in a sentence ("Dismissed 5 crowding warnings"). */
export const KIND_WORDS: Record<WarningKind, string> = { crowding: 'crowding', sun: 'sun', hardy: 'hardiness', poison: 'poison', utility: 'utility', fruit: 'fruit partner' };
/** The kinds dismissed for the plant across the plan, its copies added later too (src/dismissals.ts). */
export const acrossPlan = (kind: WarningKind): kind is 'hardy' | 'poison' | 'fruit' => kind === 'hardy' || kind === 'poison' || kind === 'fruit';

export interface WarningRow {
  kind: WarningKind;
  /** The shapes it's about (a tap selects them). */
  ids: string[];
  /** Whose it is ("Fig ×3", "2 Spicebush, 2 ft apart", "Buttonbush and Oakleaf hydrangea, 3 ft apart"). */
  name: string;
  /** What it says, as the plant's details say it, without a closing period ("Too cold for zone 8a: it's rated for…"). */
  said: string;
  /**
   * What's kept when it's dismissed, where that isn't the words shown: a sun warning's message, a poison warning's flags
   * ("Poisonous to people; A problem for dogs"), a fruit partner's line. Kept as before, so dismissals stay as stored.
   */
  key?: string;
  /** Feet around its plants to show too, when it's shown on the plan: a utility warning's distance to the line. */
  pad?: number;
  dismissed: boolean;
  /**
   * A dismissed row: who it's dismissed for ("for this one", "for every Fig in this plan", "for this pair"), since a
   * copy's own and a plant's across the plan otherwise look alike (the review of Settings → Warnings, Nov 1).
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
const nameOf = (s: Shape): string => displayLabel(s) || (s.plantId && plantsById[s.plantId]?.common) || 'A plant';
const named = (s: Shape[]): string => `${nameOf(s[0])}${s.length > 1 ? ` ×${s.length}` : ''}`;
const plantOf = (s: Shape): Plant | undefined => (s.role === 'plant' && s.plantId ? plantsById[s.plantId] : undefined);
/** A plant in the ground or going in: not gone, not coming out. */
const living = (s: Shape) => s.status !== 'gone' && s.status !== 'remove';
const leftClose = (a: Shape, b: Shape) => !!(a.type === 'circle' && a.crowdOk?.includes(b.id)) || !!(b.type === 'circle' && b.crowdOk?.includes(a.id));
/**
 * A pair by name and how far apart, to tell one pair of the same plants from another: "2 American beautyberry, 1.5 ft
 * apart" (not "American beautyberry and American beautyberry": the review, Nov 1), "Buttonbush and Fig, 3 ft apart".
 */
function pairName(a: Shape, b: Shape): string {
  const x = nameOf(a), y = nameOf(b), d = Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10;
  return `${x === y ? `2 ${x}` : `${x} and ${y}`}, ${d} ft apart`;
}
/** What a crowded or close pair's row says. */
const CROWD_SAID: Record<CrowdLevel, string> = { crowded: 'Crowded: they’ll grow into each other', close: 'Close: they may quickly grow into one another' };
/** A line without its closing period (a row's words; its label for screen readers adds one: no "..", the review). */
const unstop = (t: string) => t.replace(/\.\s*$/, '');
/** A line that starts with the plant's name, from there on, capitalized ("Fig gets 8 h…": "Gets 8 h…"). */
function afterName(line: string, name: string): string {
  if (!name || !line.startsWith(name + ' ')) return line;
  const rest = line.slice(name.length + 1).replace(/^is /, '');
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
/** A sun warning in the words of the plant's details, naming the sun area it's in (two rows alike otherwise: the review). */
function sunWords(message: string, s: Shape, p: Plant | undefined): string {
  const area = sunAt(shapeCenter(s), state.shapes)?.area;
  const said = afterName(unstop(message), p?.common ?? '');
  return area?.label ? said.replace(/ here(?=[;,]|$)/, ` in ${area.label}`) : said;
}

/** Dismiss a pair, as the crowding notice's Dismiss does (src/ui/crowd-notice.ts leaveClose: on the first, if a circle). */
function leavePair(a: Shape, b: Shape): boolean {
  const [x, y] = a.type === 'circle' ? [a, b] : [b, a];
  if (x.type !== 'circle') return false;
  x.crowdOk = [...new Set([...(x.crowdOk ?? []), y.id])];
  return true;
}
/** Show a dismissed pair again (only that pair). */
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

  // Crowding: the pairs flagged, then those dismissed that would be (worked out without their dismissal).
  if (state.showCrowding || state.crowdWarnings) {
    const active = crowdPairs(shown, plantsById, crowdOptions());
    for (const p of active) rows.push({ kind: 'crowding', ids: [p.a.id, p.b.id], name: pairName(p.a, p.b), said: CROWD_SAID[p.level], dismissed: false, dismiss: () => leavePair(p.a, p.b) });
    const bare = shown.map((s) => (s.type === 'circle' && s.crowdOk ? { ...s, crowdOk: undefined } : s));
    const real = new Map(shown.map((s) => [s.id, s]));
    for (const p of crowdPairs(bare, plantsById, crowdOptions())) {
      const a = real.get(p.a.id)!, b = real.get(p.b.id)!;
      if (!leftClose(a, b)) continue;
      rows.push({ kind: 'crowding', ids: [a.id, b.id], name: pairName(a, b), said: CROWD_SAID[p.level], dismissed: true, scope: 'for this pair', again: () => flagPairAgain(a, b) });
    }
  }

  // Sun: a copy's own, by where it stands (in a sun area recorded), dismissed in what it says now, as its pane does.
  if (state.sunWarnings) {
    const off: WarningRow[] = [];
    for (const s of plants) {
      const check = checkPlantSun(s, plantOf(s), state.shapes);
      if (!check || check.ok) continue;
      const gone = sunDismissedFor(check, s);
      (gone ? off : rows).push({ kind: 'sun', ids: [s.id], name: named([s]), said: sunWords(check.message, s, plantOf(s)), key: check.message, dismissed: gone,
        ...(gone ? { scope: 'for this one', again: () => againOn(s, 'sunDismissed') } : { dismiss: () => { s.sunDismissed = check.message; return true; } }) });
    }
    rows.push(...off);
  }

  // Hardiness and poison: the plant's (every copy), dismissed across the plan or copy by copy.
  const perPlant = byPlant(plants.filter((s) => !(s.type === 'circle' && s.tree)));
  const plantRows = (kind: 'hardy' | 'poison', key: (p: Plant) => string, words: (p: Plant) => string, field: 'hardyDismissed' | 'poisonDismissed', skip: (s: Shape) => boolean = () => false) => {
    const off: WarningRow[] = [];
    for (const [id, copies] of perPlant) {
      const line = key(plantsById[id]!);
      if (!line) continue;
      const said = unstop(words(plantsById[id]!));
      const here = copies.filter((s) => !skip(s));
      const all = dismissedForPlan(kind, id, line);
      const on = all ? [] : here.filter((s) => s[field] !== line), quiet = all ? here : here.filter((s) => s[field] === line);
      // (Dismissed, it's the plant across the plan, as from its pane: every copy, and the ones added later.)
      if (on.length) rows.push({ kind, ids: on.map((s) => s.id), name: named(on), said, key: line, dismissed: false, plantId: id, dismiss: () => { dismissForPlan(kind, id, line); return false; } });
      if (quiet.length) off.push({ kind, ids: quiet.map((s) => s.id), name: named(quiet), said, key: line, dismissed: true, scope: all ? everyOne(id) : quiet.length === 1 ? 'for this one' : `for these ${quiet.length}`, plantId: id, again: () => clearForPlan(kind, id) });
    }
    rows.push(...off);
  };
  const hardyLine = (p: Plant) => hardinessWarning(p)?.line ?? '';
  if (state.hardyWarnings) plantRows('hardy', hardyLine, hardyLine, 'hardyDismissed', (s) => s.status === 'existing' || alreadyThere(s));
  // (Poison in its details' words, its severity and parts: "Poisonous if eaten (high severity: leaves); a problem for
  // dogs". Kept dismissed by its flags, as before: src/dismissals.ts poisonSaid.)
  if (state.poisonWarnings) plantRows('poison', poisonSaid, poisonLine, 'poisonDismissed');

  // Utilities: a copy's own, by where it stands (no switch: a power line, a buried line, a septic field).
  const utils = prepareUtilities(shown.filter((s) => s.role === 'utility'));
  if (utils.length) {
    const off: WarningRow[] = [];
    for (const s of plants) {
      const issues = utilityIssues(s, utils, plantsById);
      if (!issues.length) continue;
      const key = issuesKey(issues), gone = s.utilityDismissed === key;
      (gone ? off : rows).push({ kind: 'utility', ids: [s.id], name: named([s]), said: issues.map((i) => i.line).join('; '), key, dismissed: gone,
        pad: Math.min(40, Math.max(...issues.map((i) => i.distance)) + 3),
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
      (gone ? off : rows).push({ kind: 'fruit', ids: copies.map((s) => s.id), name: named(copies), said: afterName(unstop(need.line), plantsById[id]!.common), key: need.line, dismissed: gone, plantId: id,
        ...(gone ? { scope: everyOne(id), again: () => clearForPlan('fruit', id) } : { dismiss: () => { dismissForPlan('fruit', id, need.line); return false; } }) });
    }
    rows.push(...off);
  }
  // (Kind by kind, safety first; within a kind, as found: active above dismissed.)
  return rows.map((r, i) => [r, i] as const).sort(([a, i], [b, j]) => ORDER.get(a.kind)! - ORDER.get(b.kind)! || i - j).map(([r]) => r);
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

/**
 * Why a kind that's on can't run yet, and so finds nothing (the review, Nov 1: Hardiness and Poison said "on" with no ZIP
 * or nobody chosen, with no way to fix it): the yard has nobody chosen in it (poison: Jason, "I'm there, I just don't
 * have poison warnings turned on", so it's said "Off until you choose kids or pets"), no ZIP (hardiness), no sun
 * recorded (sun), no utilities drawn.
 */
export type CantRun = 'yard' | 'zip' | 'sun' | 'utilities';
export interface KindState {
  kind: WarningKind;
  /** Switched on (Utilities have no switch: always). */
  on: boolean;
  /** On, but it can't run yet: what it needs first. */
  cantRun?: CantRun;
}
/** Each kind's state, in the sheet's order. */
export function kindStates(): KindState[] {
  const needs: Record<WarningKind, [boolean, CantRun | undefined]> = {
    poison: [state.poisonWarnings, yardSet(household()) ? undefined : 'yard'],
    utility: [true, state.shapes.some((s) => !!utilityOf(s) && s.status !== 'gone') ? undefined : 'utilities'],
    hardy: [state.hardyWarnings, state.location ? undefined : 'zip'],
    sun: [state.sunWarnings, state.shapes.some((s) => s.role === 'shade' && !!s.sun) ? undefined : 'sun'],
    crowding: [state.showCrowding || state.crowdWarnings, undefined],
    fruit: [state.fruitWarnings, undefined],
  };
  return WARNING_KINDS.map(({ kind }) => {
    const [on, cant] = needs[kind];
    return on && cant ? { kind, on, cantRun: cant } : { kind, on };
  });
}

/**
 * What the plan's Layers hide from the checks, if anything: plants filtered out or their layer hidden ("Planted",
 * "Plants hidden"), or the utilities' layer hidden. The checks go by what's shown, as the plan's badges do, so the
 * sheet says so, with a way to show them (the review, Nov 1: "none" said with Layers on Planted, and 12 in the plan).
 */
export function hiddenFromChecks(): { plants: boolean; utilities: boolean; said: string } | null {
  const f = state.viewFilter;
  const plants = state.shapes.some((s) => s.role === 'plant' && living(s) && !shownWith(s, f));
  const utilities = state.shapes.some((s) => !!utilityOf(s) && s.status !== 'gone' && roleHidden(s));
  if (!plants && !utilities) return null;
  const why: string[] = [];
  if (plants) {
    if (state.shapes.some((s) => s.role === 'plant' && living(s) && roleHidden(s))) why.push('Plants hidden');
    else {
      if (f.status) why.push(statusLabel(f.status));
      if (f.phase) why.push(f.phase);
      if (!why.length && state.shapes.some((s) => s.role === 'plant' && living(s) && !passesFilter(s, f))) why.push('some plants left out');
    }
  }
  if (utilities) why.push('Utilities hidden');
  return { plants, utilities, said: `Layers: ${why.join(', ')}` };
}

/** The plan's warnings at a glance: the Warnings button, ⋮ and the sheet's first line. */
export interface WarningsSummary {
  /** To look at (active rows). */
  active: number;
  dismissed: number;
  /** Kinds switched on that can't run yet. */
  cantRun: number;
  hidden: ReturnType<typeof hiddenFromChecks>;
}
export function warningsSummary(rows: WarningRow[] = planWarnings()): WarningsSummary {
  const active = rows.filter((r) => !r.dismissed).length;
  return { active, dismissed: rows.length - active, cantRun: kindStates().filter((k) => k.cantRun).length, hidden: hiddenFromChecks() };
}
/** "4 checks can't run", "1 check can't run". */
export const cantRunSaid = (n: number): string => `${n} check${n === 1 ? '' : 's'} can’t run`;
/**
 * What the Warnings button says to a screen reader: "Warnings: 12 to look at", "Warnings: all clear", "Warnings: none
 * found, 4 checks can't run yet"; and, with Layers hiding some, "Warnings: none in the plants shown (some plants
 * hidden)", never an all-clear (the warnings bug hunt, Nov 1).
 */
export function buttonSaid(w: WarningsSummary): string {
  if (w.active) return `Warnings: ${w.active} to look at`;
  const cant = w.cantRun ? `, ${cantRunSaid(w.cantRun)} yet` : '';
  if (w.hidden) {
    const { plants, utilities } = w.hidden;
    const what = plants && utilities ? 'plants and utilities' : plants ? 'plants' : 'utilities';
    return `Warnings: ${plants ? 'none in the plants shown' : 'none found'} (some ${what} hidden)${cant}`;
  }
  return w.cantRun ? `Warnings: none found${cant}` : 'Warnings: all clear';
}
