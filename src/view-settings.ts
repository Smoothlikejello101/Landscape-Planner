// How the plan is shown, kept on this device across reloads (not saved with the plan): full-size rings on
// every plant; plants close to others ringed amber and crowded ones red, and a notice as one is placed too close
// (both on unless turned off: decided with Jason, 2026-10-25); plants drawn as illustrations (src/looks.ts) or as
// plain circles (drawn unless turned off). Set in Layers.
import { state } from './state';

const FULL_RINGS = 'lp-full-rings', CROWDING = 'lp-crowding', CROWD_WARN = 'lp-crowd-warn', LOOKS = 'lp-plant-looks';
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
}
export function setShowFullSize(on: boolean) { state.showFullSize = on; write(FULL_RINGS, on); }
export function setShowCrowding(on: boolean) { state.showCrowding = on; write(CROWDING, on); }
export function setCrowdWarnings(on: boolean) { state.crowdWarnings = on; write(CROWD_WARN, on); }
export function setPlantLooks(on: boolean) { state.plantLooks = on; write(LOOKS, on); }
