// How the plan is shown, and its warning switches.
//
// Kept on this device across reloads (not saved with the plan): full-size rings on every plant; plants drawn as
// illustrations (src/looks.ts) or as plain circles (drawn unless turned off), set in Layers; the zoom buttons; tall
// plants seen through, from a height, set in Layers.
//
// Kept with the plan since Nov 4, with its other print settings (Jason: "Add the storage to keep this print option to
// the plan"): how paper and pictures draw the plants under taller ones (printUnder, below). A plan that has never had
// it chosen starts from what this device had before.
//
// Kept with the plan since Nov 1 (Jason approved the Warnings mock-ups: "What's checked (and dismissed) goes with this
// plan, on all your devices"): Settings → Warnings' switches. Plants close to others ringed amber and crowded ones red,
// and a notice as one is placed too close (both on unless turned off: decided with Jason, 2026-10-25); hardiness,
// poison and fruit partners. Switching plans switches them (src/storage.ts switchProject), and they sync, settling one
// by one when two devices switch them (src/sync/engine.ts settleSwitches). Before Nov 1 they were kept per device, in
// the keys below: a plan from before takes what this device had there (switchesFromDevice), so nobody's warnings
// change with the update; the keys are only read for that now, and left in place for an older version of the app.
import { state } from './state';
import { save } from './storage';
import type { PlanSwitches, PrintSettings, PrintUnder, WarningSwitch } from './types';
import { now } from './util';

const FULL_RINGS = 'lp-full-rings', LOOKS = 'lp-plant-looks';
// (The + and − zoom buttons: off on a phone, where a pinch zooms, unless turned on; on elsewhere. Jason, Oct 30: "clutter,
// given pinch/scroll to zoom", kept a switch away for anyone zooming with one finger, as accessibility asks: WCAG 2.5.1.)
const ZOOM_BTNS = 'lp-zoom-buttons';
/**
 * The warning switches, with the keys this device kept them in before plans kept them. (Hardiness and poison, on
 * unless turned off: Jason, Oct 30, "too hot and too cold should get warnings by default", with every kind of warning
 * switchable in one place, Settings → Warnings, since Oct 31. Fruit partners, on unless turned off: Jason, Oct 30.)
 */
export const WARNING_SWITCHES: Record<WarningSwitch, string> = {
  showCrowding: 'lp-crowding', crowdWarnings: 'lp-crowd-warn', hardyWarnings: 'lp-warn-hardy', poisonWarnings: 'lp-warn-poison', fruitWarnings: 'lp-warn-fruit',
};
const SWITCHES = Object.keys(WARNING_SWITCHES) as WarningSwitch[];
/** A phone or tablet: no hover, a finger to point with. */
const touchOnly = (): boolean => { try { return matchMedia('(hover: none) and (pointer: coarse)').matches; } catch { return false; } };
const read = (key: string, fallback: boolean): boolean => {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === 'on'; } catch { return fallback; }
};
const write = (key: string, on: boolean) => { try { localStorage.setItem(key, on ? 'on' : 'off'); } catch { /* this session only */ } };

/**
 * Tall plants (Jason, Nov 4, answering the options page: "D" on the screen, "C" on paper, and a Layers switch "maybe with
 * a few height options"): Layers' "See through tall plants", off unless turned on, and the height it goes from. Kept on
 * this device, as the switches beside them in Layers are.
 */
const SEE_THROUGH = 'lp-see-through', SEE_THROUGH_FROM = 'lp-see-through-from';
/** The heights (ft) "See through tall plants" can go from: 5, as every plant that tall was drawn until Nov 4. */
export const SEE_THROUGH_HEIGHTS = [3, 5, 10] as const;
export const SEE_THROUGH_DEFAULT = 5;
const readHeight = (): number => {
  try { const v = Number(localStorage.getItem(SEE_THROUGH_FROM)); return (SEE_THROUGH_HEIGHTS as readonly number[]).includes(v) ? v : SEE_THROUGH_DEFAULT; } catch { return SEE_THROUGH_DEFAULT; }
};

/**
 * How paper and pictures draw the plants under taller ones (Jason, Nov 4: "C by default, but with a printing option for
 * same as on screen with numbered dots"): the open plan's, PrintSettings `under`, Show through unless picked in Print or
 * Export, and kept with the plan since Nov 4 (database version 6). Before that, on Next (#228), it was kept on this device
 * instead, in 'lp-print-under': a plan that has never had one picked starts from what this device had there,
 * read once as the app starts (underFromThisDevice). Nothing is written to the plan for that, not even when it's saved
 * for another edit: only picking one in Print or Export writes the plan's (setPrintUnder). And nothing writes the
 * device's any more: it stays as #228 left it, read only for this (src/support.ts lists it).
 */
const PRINT_UNDER = 'lp-print-under';
const readUnder = (): PrintUnder => {
  try { return localStorage.getItem(PRINT_UNDER) === 'screen' ? 'screen' : 'windows'; } catch { return 'windows'; }
};
let underHere: PrintUnder | undefined;
/** Where a plan that has never had it picked starts, on this device: As on screen where this device had chosen it before. */
export function underFromThisDevice(): PrintUnder { return (underHere ??= readUnder()); }
/** How print settings draw the plants under taller ones on this device: as picked for the plan, or where it starts. */
export const underOf = (p: Pick<PrintSettings, 'under'> | null | undefined): PrintUnder => p?.under ?? underFromThisDevice();
/** The open plan's, for Print and Export. */
export const printUnder = (): PrintUnder => underOf(state.print);
/** Picked in Print or Export: the open plan's, an edit of the plan, saved with it (Show through too, once picked). */
export function setPrintUnder(v: PrintUnder) {
  state.print = { ...state.print, under: v };
  save();
}

/** At start: this device's own settings, as they were left. (The warning switches come with the plan opened.) */
export function loadViewSettings() {
  state.showFullSize = read(FULL_RINGS, false);
  state.plantLooks = read(LOOKS, true);
  state.zoomButtons = read(ZOOM_BTNS, !touchOnly());
  state.seeThroughTall = read(SEE_THROUGH, false);
  state.seeThroughFrom = readHeight();
  underHere = readUnder();
}
export function setShowFullSize(on: boolean) { state.showFullSize = on; write(FULL_RINGS, on); }
export function setPlantLooks(on: boolean) { state.plantLooks = on; write(LOOKS, on); }
export function setZoomButtons(on: boolean) { state.zoomButtons = on; write(ZOOM_BTNS, on); }
export function setSeeThroughTall(on: boolean) { state.seeThroughTall = on; write(SEE_THROUGH, on); }
export function setSeeThroughFrom(ft: number) {
  if (!(SEE_THROUGH_HEIGHTS as readonly number[]).includes(ft)) return;
  state.seeThroughFrom = ft;
  try { localStorage.setItem(SEE_THROUGH_FROM, String(ft)); } catch { /* this session only */ }
}
/**
 * A plan from before plans kept the warning switches: as this device had them (on, where never turned off). No `at`:
 * never switched in the plan, so another device's, switched there or taken the same way, settles with it.
 */
export function switchesFromDevice(): Required<PlanSwitches> {
  return Object.fromEntries(SWITCHES.map((k) => [k, { on: read(WARNING_SWITCHES[k], true) }])) as Required<PlanSwitches>;
}
/** A new plan's: every warning on (Jason, Nov 1), as switched in it now. */
export function switchesAllOn(): Required<PlanSwitches> {
  const at = now();
  return Object.fromEntries(SWITCHES.map((k) => [k, { on: true, at }])) as Required<PlanSwitches>;
}
/** The open plan's switches, as kept with it. */
export function planSwitches(): Required<PlanSwitches> {
  return Object.fromEntries(SWITCHES.map((k) => {
    const at = state.switchedAt[k];
    return [k, at === undefined ? { on: state[k] } : { on: state[k], at }];
  })) as Required<PlanSwitches>;
}
/**
 * Put a plan's switches in place (one opened, or sync's copy): any it doesn't have, from `fallback` (src/storage.ts: as
 * the plans here took them from this device at the update), else as this device has them.
 */
export function applySwitches(sw: PlanSwitches | undefined, fallback: PlanSwitches = {}) {
  const device = switchesFromDevice();
  const at: Partial<Record<WarningSwitch, number>> = {};
  for (const k of SWITCHES) {
    const s = sw?.[k] ?? fallback[k] ?? device[k];
    state[k] = s.on;
    if (s.at !== undefined) at[k] = s.at;
  }
  state.switchedAt = at;
}
/** The open plan's switches, copied for a new plan of the same garden (New project's "Same garden?"), as switched now. */
export function switchesCopy(): Required<PlanSwitches> {
  const at = now();
  return Object.fromEntries(SWITCHES.map((k) => [k, { on: state[k], at }])) as Required<PlanSwitches>;
}
/** Whether every warning of the open plan is on, as a new plan's are. */
export const allSwitchesOn = (): boolean => SWITCHES.every((k) => state[k]);
/** Switch one of the open plan's warnings on or off: an edit of the plan, saved with it. */
function setSwitch(k: WarningSwitch, on: boolean) {
  state[k] = on;
  state.switchedAt = { ...state.switchedAt, [k]: now() };
  save();
}
export function setShowCrowding(on: boolean) { setSwitch('showCrowding', on); }
export function setCrowdWarnings(on: boolean) { setSwitch('crowdWarnings', on); }
export function setHardyWarnings(on: boolean) { setSwitch('hardyWarnings', on); }
export function setPoisonWarnings(on: boolean) { setSwitch('poisonWarnings', on); }
export function setFruitWarnings(on: boolean) { setSwitch('fruitWarnings', on); }
