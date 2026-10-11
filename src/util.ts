import { ROT_SNAP, SNAP } from './constants';

// ============================================================
// UTILITIES
// ============================================================
export function uid() { return Math.random().toString(36).slice(2, 10); }
export function snap(v) { return Math.round(v / SNAP) * SNAP; }
export function snapRot(v) { return Math.round(v / ROT_SNAP) * ROT_SNAP; }
export function now() { return Date.now(); }
export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
