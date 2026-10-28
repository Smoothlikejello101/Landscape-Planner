import type { UtilityKind } from './types';

// The kinds of utility a plan can show (sub-features part 2, decided with Jason, 2026-10-25): an overhead power line,
// a line buried in the ground (power, gas, water, sewer, cable), and a septic drainfield. Each is a shape with the
// role 'utility' and one of these; what's checked near each is in src/utilities.ts. (Kept apart, with nothing to
// import, so storage can check one without pulling in the checks.)

export const UTILITY_KINDS: { key: UtilityKind; label: string; lines: boolean }[] = [
  { key: 'overhead', label: 'Overhead power line', lines: true },
  { key: 'buried', label: 'Buried line', lines: true },
  { key: 'septic', label: 'Septic field', lines: false },
];
export const isUtilityKind = (v: unknown): v is UtilityKind => UTILITY_KINDS.some((k) => k.key === v);
/**
 * A kind as stored: one of these, or one a later version may add (a short word), kept as it came so this version
 * doesn't take it away. A kind this version doesn't know isn't checked.
 */
export const isStoredUtilityKind = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(v);
export const utilityLabel = (k: string | undefined): string => UTILITY_KINDS.find((x) => x.key === k)?.label ?? 'Utility';
/** Each kind's own look: a power line orange, a buried line brown (drawn dashed), a septic field gray and faint. */
export const UTILITY_COLORS: Record<UtilityKind, string> = { overhead: '#ea580c', buried: '#a16207', septic: '#78716c' };
export const utilityLook = (k: UtilityKind): { color: string; opacity: number } => ({ color: UTILITY_COLORS[k], opacity: k === 'septic' ? 0.2 : 1 });
