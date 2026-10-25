// How the plan is shown, kept on this device across reloads (not saved with the plan): full-size rings on
// every plant, and crowded plants outlined in red. Set in Layers.
import { state } from './state';

const FULL_RINGS = 'lp-full-rings', CROWDING = 'lp-crowding';
const read = (key: string, fallback: boolean): boolean => {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === 'on'; } catch { return fallback; }
};
const write = (key: string, on: boolean) => { try { localStorage.setItem(key, on ? 'on' : 'off'); } catch { /* this session only */ } };

/** At start: the switches as they were left on this device. */
export function loadViewSettings() {
  state.showFullSize = read(FULL_RINGS, false);
  state.showCrowding = read(CROWDING, false);
}
export function setShowFullSize(on: boolean) { state.showFullSize = on; write(FULL_RINGS, on); }
export function setShowCrowding(on: boolean) { state.showCrowding = on; write(CROWDING, on); }
