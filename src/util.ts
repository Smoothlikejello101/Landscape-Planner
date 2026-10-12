import { ROT_SNAP, SNAP } from './constants';
import type { ShapeType } from './types';

// ============================================================
// UTILITIES
// ============================================================
export function uid(): string { return Math.random().toString(36).slice(2, 10); }
export function snap(v: number): number { return Math.round(v / SNAP) * SNAP; }
export function snapRot(v: number): number { return Math.round(v / ROT_SNAP) * ROT_SNAP; }
export function now(): number { return Date.now(); }
export function deepClone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }
export function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }
const TYPE_NAMES: Record<ShapeType, string> = { circle: 'circle', rect: 'rectangle', oval: 'oval', triangle: 'triangle', poly: 'outline', line: 'line', text: 'text' };
/** "outline", "rectangle"... for showing a shape's kind to people. */
export function typeName(t: ShapeType): string { return TYPE_NAMES[t]; }
