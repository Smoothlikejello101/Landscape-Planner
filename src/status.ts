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
/**
 * The shapes whose flag (To move, To remove, Gone) setting `status` would overwrite. Not To remove becoming Gone:
 * that's the usual next step, as Planned becoming Planted is.
 */
export function flaggedFor<S extends Pick<Shape, 'status'>>(shapes: S[], status: Status | undefined): S[] {
  return shapes.filter((s) => !!s.status && FLAGS.has(s.status) && s.status !== status && !(s.status === 'remove' && status === 'gone'));
}
/**
 * Whether setting `status` on these shapes asks first: several are selected and some, not all, would lose a flag.
 * (All of them flagged: they're the ones being changed, chosen as such.)
 */
export function asksFirst(shapes: Pick<Shape, 'status'>[], status: Status | undefined): boolean {
  const n = flaggedFor(shapes, status).length;
  return shapes.length > 1 && n > 0 && n < shapes.length;
}
/** Things a status means something for (not sun records, notes or measurements). */
export function hasStatus(s: Pick<Shape, 'role' | 'type'>): boolean {
  return s.type !== 'text' && s.role !== 'shade' && s.role !== 'other';
}

export const NO_FILTER: ShapeFilter = { status: '', phase: '', showGone: false };

/** Whether a shape passes a status/phase filter. */
export function passesFilter(s: Shape, f: ShapeFilter): boolean {
  if (s.status === 'gone' && !f.showGone && f.status !== 'gone') return false;
  // (A bed, a path, anything given a phase follows the phase shown, as plants do: Jordan's Phase 2 bed drew, empty,
  // under Phase 1. Jason, Oct 31. With no phase of its own, it always shows; the status filter is for plants.)
  if (s.role !== 'plant') return !(f.phase && s.phase && s.phase !== f.phase);
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
/**
 * Status change: planting a plant stamps today's date unless one is already set; becoming gone stamps today (one already
 * gone keeps what it has, no date included). A gone date goes when it's marked anything else (`undefined` in the
 * patch: the key is removed).
 */
export function statusPatch(s: Shape, status: Status | undefined): Partial<Shape> {
  const ungone = s.goneOn !== undefined && status !== 'gone' ? { goneOn: undefined } : {};
  if (!status) return { status: undefined, ...ungone };
  // (Only a plant is planted: a patio marked existing gets no planting date.)
  if (status === 'planted') return s.role === 'plant' ? { status, plantedOn: s.plantedOn ?? today(), ...ungone } : { status, ...ungone };
  if (status === 'gone') return s.status === 'gone' ? { status } : { status, goneOn: today() }; // (already gone: as it was)
  return { status, ...ungone };
}

export const MAX_PHASES = 50;
export function cleanPhaseName(v: string): string { return v.trim().replace(/\s+/g, ' ').slice(0, 40); }
