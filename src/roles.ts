import { state } from './state';
import type { Role, RoleKey, RoleView, Shape, ShapeType } from './types';

// Roles say what a shape represents (bed, shade, building...). A role sets a
// shape's default look and its place in the drawing order, and every shape of
// a role can be hidden or locked together.

export interface RoleDef {
  key: Role;
  label: string;
  /** Default fill for new shapes of this role. */
  color: string;
  opacity: number;
  /** Drawn as an outline (no fill), e.g. fences and property lines. */
  outline?: boolean;
}

export const ROLES: RoleDef[] = [
  { key: 'plant', label: 'Plant', color: '#16a34a', opacity: 0.65 },
  { key: 'bed', label: 'Bed', color: '#92400e', opacity: 0.3 },
  { key: 'lawn', label: 'Lawn', color: '#84cc16', opacity: 0.3 },
  { key: 'path', label: 'Path / hardscape', color: '#a8a29e', opacity: 0.7 },
  { key: 'water', label: 'Water', color: '#0ea5e9', opacity: 0.5 },
  { key: 'shade', label: 'Shade', color: '#334155', opacity: 0.3 },
  { key: 'building', label: 'Building', color: '#57534e', opacity: 0.8 },
  { key: 'boundary', label: 'Boundary', color: '#44403c', opacity: 1, outline: true },
  { key: 'other', label: 'Note / other', color: '#94a3b8', opacity: 0.6 },
];
const BY_KEY = Object.fromEntries(ROLES.map((r) => [r.key, r])) as Record<Role, RoleDef>;
export const ROLE_KEYS = ROLES.map((r) => r.key);

export function roleDef(role: Role): RoleDef { return BY_KEY[role]; }
export function roleKey(s: Shape): RoleKey { return s.role ?? 'unassigned'; }
export function roleLabel(k: RoleKey): string { return k === 'unassigned' ? 'Unassigned' : BY_KEY[k].label; }
export function isRole(v: unknown): v is Role { return typeof v === 'string' && v in BY_KEY; }

/**
 * Drawing order, back to front: ground cover, then beds, shade over the
 * ground, structures, and plants (with unassigned/other shapes) on top so
 * they stay readable and easy to tap.
 */
const RANK: Record<RoleKey, number> = {
  lawn: 0, water: 1, path: 2, bed: 3, shade: 4, boundary: 5, building: 6,
  plant: 7, other: 7, unassigned: 7,
};
export function roleRank(s: Shape): number { return RANK[roleKey(s)]; }

function view(k: RoleKey): RoleView { return state.roleViews[k] ?? {}; }
export function roleHidden(s: Shape): boolean { return !!view(roleKey(s)).hidden; }
export function roleLocked(s: Shape): boolean { return !!view(roleKey(s)).locked; }
/** Can't be moved: locked individually or through its role. */
export function isLocked(s: Shape): boolean { return s.locked || roleLocked(s); }

/** Default fill for a new shape (plants keep the per-shape-type colors). */
export function defaultLook(role: RoleKey, type: ShapeType): { color: string; opacity: number } {
  if (role === 'unassigned' || role === 'plant') {
    const byType: Record<ShapeType, string> = { circle: '#16a34a', rect: '#78350f', oval: '#0891b2', triangle: '#7c3aed' };
    return { color: byType[type], opacity: 0.65 };
  }
  return { color: BY_KEY[role].color, opacity: BY_KEY[role].opacity };
}
