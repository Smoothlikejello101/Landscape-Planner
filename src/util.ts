import { ROT_SNAP, SNAP } from './constants';
import type { ShapeType } from './types';

// ============================================================
// UTILITIES
// ============================================================
export function uid(): string { return Math.random().toString(36).slice(2, 10); }
export function snap(v: number): number { return Math.round(v / SNAP) * SNAP; }
export function snapRot(v: number): number { return Math.round(v / ROT_SNAP) * ROT_SNAP; }
export function now(): number { return Date.now(); }
/**
 * A day as the person's own calendar has it, "2026-11-01": in UTC, a backup and a picture made at 11:25 PM in Arkansas
 * were dated the next day, beside a PDF dated that day (the UI review, 2026-11-01). Every file the app names (backups,
 * plan files, the PDF, pictures, the support file) takes its date from here, and so does the day the app was built
 * (src/whats-new.ts builtOn).
 */
export function stamp(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function deepClone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }
export function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }
const TYPE_NAMES: Record<ShapeType, string> = { circle: 'circle', rect: 'rectangle', oval: 'oval', triangle: 'triangle', poly: 'outline', line: 'line', text: 'text' };
/** "outline", "rectangle"... for showing a shape's kind to people. */
export function typeName(t: ShapeType): string { return TYPE_NAMES[t]; }

/** An area in square feet as every screen shows it: whole feet from 10 up, tenths below ("189", "4.5"). */
export const sqFt = (a: number): string => (a >= 10 ? Math.round(a) : Math.round(a * 10) / 10).toLocaleString();
