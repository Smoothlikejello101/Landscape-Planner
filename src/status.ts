import { roleHidden } from './roles';
import type { Shape, ShapeFilter, Status } from './types';

// Where things stand in the real garden: planned, planted, to move, to
// remove, or gone (kept as a record, hidden by default). Plus phases: named
// stages of the project ("Fall 2026") that shapes can belong to.
//
// Filters (on screen and when printing) pick which PLANTS show. Everything
// else (beds, paths, the house) stays as context, except anything gone.

export const STATUSES: { key: Status; label: string }[] = [
  { key: 'planned', label: 'Planned' },
  { key: 'planted', label: 'Planted' },
  { key: 'move', label: 'To move' },
  { key: 'remove', label: 'To remove' },
  { key: 'gone', label: 'Gone' },
];
const KEYS = new Set<string>(STATUSES.map((s) => s.key));
export const isStatus = (v: unknown): v is Status => typeof v === 'string' && KEYS.has(v);
export const statusLabel = (k: Status | undefined) => STATUSES.find((s) => s.key === k)?.label ?? 'Not set';
/**
 * Statuses that make sense for these shapes. A house isn't "planted": for
 * anything that isn't a plant, 'planted' reads "Existing" (it's there), and
 * "To move" is left out. A mix of plants and other things gets both words.
 */
export function statusesFor(shapes: Pick<Shape, 'role'>[]): { key: Status; label: string }[] {
  const plants = shapes.filter((s) => s.role === 'plant').length;
  if (plants === shapes.length) return STATUSES;
  const planted = plants ? 'Planted / existing' : 'Existing';
  return STATUSES.filter((s) => plants || s.key !== 'move').map((s) => (s.key === 'planted' ? { ...s, label: planted } : s));
}
/** A shape's status in words that fit it ("Existing" for a house). */
export function statusLabelFor(s: Pick<Shape, 'role' | 'status'>): string {
  return statusesFor([s]).find((x) => x.key === s.status)?.label ?? statusLabel(s.status);
}
/**
 * Statuses that record a decision about something already there (to move it, to remove it, that it's gone). Setting
 * a status on several shapes at once asks before it overwrites one of these: marking a whole yard planted would
 * otherwise quietly unmark the one shrub you'd marked to take out.
 */
export const FLAGS: ReadonlySet<Status> = new Set<Status>(['move', 'remove', 'gone']);
/** The shapes whose flag (To move, To remove, Gone) setting `status` would overwrite. */
export function flaggedFor<S extends Pick<Shape, 'status'>>(shapes: S[], status: Status | undefined): S[] {
  return shapes.filter((s) => !!s.status && FLAGS.has(s.status) && s.status !== status);
}
/** Things a status means something for (not sun records, notes or measurements). */
export function hasStatus(s: Pick<Shape, 'role' | 'type'>): boolean {
  return s.type !== 'text' && s.role !== 'shade' && s.role !== 'other';
}

export const NO_FILTER: ShapeFilter = { status: '', phase: '', showGone: false };

/** Whether a shape passes a status/phase filter. */
export function passesFilter(s: Shape, f: ShapeFilter): boolean {
  if (s.status === 'gone' && !f.showGone && f.status !== 'gone') return false;
  if (s.role !== 'plant') return true;
  if (f.status && s.status !== f.status) return false;
  if (f.phase && s.phase !== f.phase) return false;
  return true;
}
/** Shown with this filter and the role views. */
export function shownWith(s: Shape, f: ShapeFilter): boolean {
  return !roleHidden(s) && passesFilter(s, f);
}
export function filterActive(f: ShapeFilter): boolean {
  return !!(f.status || f.phase || f.showGone);
}
/** "Planned plants in Fall 2026" for titles and notes ('' when unfiltered). */
export function filterText(f: Pick<ShapeFilter, 'status' | 'phase'>): string {
  if (!f.status && !f.phase) return '';
  const what = f.status ? `${statusLabel(f.status)} plants` : 'Plants';
  return f.phase ? `${what} in ${f.phase}` : what;
}

/** Today as YYYY-MM-DD (local). */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Status change: planting stamps today's date unless one is already set. */
export function statusPatch(s: Shape, status: Status | undefined): Partial<Shape> {
  if (!status) return { status: undefined };
  if (status === 'planted') return { status, plantedOn: s.plantedOn ?? today() };
  return { status };
}

export const MAX_PHASES = 50;
export function cleanPhaseName(v: string): string { return v.trim().replace(/\s+/g, ' ').slice(0, 40); }
