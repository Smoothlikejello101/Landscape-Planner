// How the plan is shown, kept on this device across reloads (not saved with the plan): full-size rings on
// every plant; plants close to others ringed amber and crowded ones red, and a notice as one is placed too close
// (both on unless turned off: decided with Jason, 2026-10-25); plants drawn as illustrations (src/looks.ts) or as
// plain circles (drawn unless turned off). Set in Layers.
import { state } from './state';

const FULL_RINGS = 'lp-full-rings', CROWDING = 'lp-crowding', CROWD_WARN = 'lp-crowd-warn', LOOKS = 'lp-plant-looks';
// (Hardiness and poison warnings, on unless turned off: Jason, Oct 30, "too hot and too cold should get warnings by
// default", with every kind of warning switchable in one place, Layers → Warnings.)
const HARDY_WARN = 'lp-warn-hardy', POISON_WARN = 'lp-warn-poison';
// (Fruit partners, on unless turned off: Jason, Oct 30.)
const FRUIT_WARN = 'lp-warn-fruit';
// (The + and − zoom buttons: off on a phone, where a pinch zooms, unless turned on; on elsewhere. Jason, Oct 30: "clutter,
// given pinch/scroll to zoom", kept a switch away for anyone zooming with one finger, as accessibility asks: WCAG 2.5.1.)
const ZOOM_BTNS = 'lp-zoom-buttons';
/** A phone or tablet: no hover, a finger to point with. */
const touchOnly = (): boolean => { try { return matchMedia('(hover: none) and (pointer: coarse)').matches; } catch { return false; } };
const read = (key: string, fallback: boolean): boolean => {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === 'on'; } catch { return fallback; }
};
const write = (key: string, on: boolean) => { try { localStorage.setItem(key, on ? 'on' : 'off'); } catch { /* this session only */ } };

/** At start: the switches as they were left on this device. */
export function loadViewSettings() {
  state.showFullSize = read(FULL_RINGS, false);
  state.showCrowding = read(CROWDING, true);
  state.crowdWarnings = read(CROWD_WARN, true);
  state.plantLooks = read(LOOKS, true);
  state.hardyWarnings = read(HARDY_WARN, true);
  state.poisonWarnings = read(POISON_WARN, true);
  state.fruitWarnings = read(FRUIT_WARN, true);
  state.zoomButtons = read(ZOOM_BTNS, !touchOnly());
}
export function setShowFullSize(on: boolean) { state.showFullSize = on; write(FULL_RINGS, on); }
export function setShowCrowding(on: boolean) { state.showCrowding = on; write(CROWDING, on); }
export function setCrowdWarnings(on: boolean) { state.crowdWarnings = on; write(CROWD_WARN, on); }
export function setPlantLooks(on: boolean) { state.plantLooks = on; write(LOOKS, on); }
export function setHardyWarnings(on: boolean) { state.hardyWarnings = on; write(HARDY_WARN, on); }
export function setPoisonWarnings(on: boolean) { state.poisonWarnings = on; write(POISON_WARN, on); }
export function setFruitWarnings(on: boolean) { state.fruitWarnings = on; write(FRUIT_WARN, on); }
export function setZoomButtons(on: boolean) { state.zoomButtons = on; write(ZOOM_BTNS, on); }
