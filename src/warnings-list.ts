// Every warning in the plan now, in one list (Jason, Oct 31, from round 3: Owen had no whole-plan check for plants
// still missing a partner; Jason's answer: "a collapsible section in warnings that shows all current warnings", by
// kind when there are more than a handful, active above dismissed, each fold saying "x active, y dismissed").
//
// The same warnings the plan shows, worked out the same way: crowding (pairs, and the pairs left close on purpose),
// sun, hardiness, poison to who's in the yard, utilities, fruit partners. A kind switched off in Settings isn't listed:
// its switch says so. Plants filtered out of the plan or in a hidden layer aren't either, as on the plan.

import { crowdOptions, hardyHere } from './crowd-here';
import { crowdPairs, type CrowdLevel } from './crowding';
import { dismissedForPlan, poisonSaid, showAgainForPlan } from './dismissals';
import { fruitNeed } from './fruit-partners';
import { displayLabel } from './geometry';
import { pushHistory } from './history';
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

export interface WarningRow {
  kind: WarningKind;
  /** The shapes it's about (a tap selects them). */
  ids: string[];
  /** Whose it is ("Fig ×3", "Buttonbush and Oakleaf hydrangea"); '' where `said` names them already. */
  name: string;
  /** What it says. */
  said: string;
  dismissed: boolean;
  /** A dismissed row: warn again. Saved, with a step to undo where it changes a shape. */
  again?: () => void;
}

/** "Fig", or "Fig ×3" for copies. */
const named = (s: Shape[]): string => `${displayLabel(s[0]) || 'A plant'}${s.length > 1 ? ` ×${s.length}` : ''}`;
const plantOf = (s: Shape): Plant | undefined => (s.role === 'plant' && s.plantId ? plantsById[s.plantId] : undefined);
/** A plant in the ground or going in: not gone, not coming out. */
const living = (s: Shape) => s.status !== 'gone' && s.status !== 'remove';
const leftClose = (a: Shape, b: Shape) => !!(a.type === 'circle' && a.crowdOk?.includes(b.id)) || !!(b.type === 'circle' && b.crowdOk?.includes(a.id));
/** "crowded, 2 ft apart": how far, to tell one pair of the same plants from another. */
const crowdSaid = (level: CrowdLevel, a: Shape, b: Shape) => `${level}, ${Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10} ft apart`;

/** Flag a pair left close on purpose again (only that pair). */
function flagPairAgain(a: Shape, b: Shape) {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    if (x.type !== 'circle' || !x.crowdOk) continue;
    const keep = x.crowdOk.filter((id) => id !== y.id);
    if (keep.length) x.crowdOk = keep; else delete x.crowdOk;
  }
  pushHistory(); save();
}
/** Show a copy's own dismissed warning again (sun, utilities: a copy's own, where it stands). */
function againOn(shapes: Shape[], field: 'sunDismissed' | 'utilityDismissed') {
  for (const s of shapes) delete s[field];
  pushHistory(); save();
}

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
    for (const p of active) rows.push({ kind: 'crowding', ids: [p.a.id, p.b.id], name: `${named([p.a])} and ${named([p.b])}`, said: crowdSaid(p.level, p.a, p.b), dismissed: false });
    const bare = shown.map((s) => (s.type === 'circle' && s.crowdOk ? { ...s, crowdOk: undefined } : s));
    const real = new Map(shown.map((s) => [s.id, s]));
    for (const p of crowdPairs(bare, plantsById, crowdOptions())) {
      const a = real.get(p.a.id)!, b = real.get(p.b.id)!;
      if (!leftClose(a, b)) continue;
      rows.push({ kind: 'crowding', ids: [a.id, b.id], name: `${named([a])} and ${named([b])}`, said: `${crowdSaid(p.level, a, b)}, left close on purpose`, dismissed: true, again: () => flagPairAgain(a, b) });
    }
  }

  // Sun: a copy's own, by where it stands (in a sun area recorded).
  if (state.sunWarnings) {
    const off: WarningRow[] = [];
    for (const s of plants) {
      const check = checkPlantSun(s, plantOf(s), state.shapes);
      if (!check || check.ok) continue;
      const gone = sunDismissedFor(check, s);
      (gone ? off : rows).push({ kind: 'sun', ids: [s.id], name: '', said: check.message, dismissed: gone, ...(gone ? { again: () => againOn([s], 'sunDismissed') } : {}) });
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
      if (on.length) rows.push({ kind, ids: on.map((s) => s.id), name: named(on), said: line, dismissed: false });
      if (quiet.length) off.push({ kind, ids: quiet.map((s) => s.id), name: named(quiet), said: line, dismissed: true, again: () => showAgainForPlan(kind, id) });
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
      const gone = s.utilityDismissed === issuesKey(issues);
      (gone ? off : rows).push({ kind: 'utility', ids: [s.id], name: named([s]), said: issues.map((i) => i.line).join('; '), dismissed: gone, ...(gone ? { again: () => againOn([s], 'utilityDismissed') } : {}) });
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
      (gone ? off : rows).push({ kind: 'fruit', ids: copies.map((s) => s.id), name: '', said: need.line, dismissed: gone, ...(gone ? { again: () => showAgainForPlan('fruit', id) } : {}) });
    }
    rows.push(...off);
  }
  return rows;
}

/** "3 active, 1 dismissed" (each part only when there are some). */
export function countSaid(rows: WarningRow[]): string {
  const on = rows.filter((r) => !r.dismissed).length, off = rows.length - on;
  return [on ? `${on} active` : '', off ? `${off} dismissed` : ''].filter(Boolean).join(', ') || 'none';
}
