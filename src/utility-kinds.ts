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
export const utilityLabel = (k: UtilityKind): string => UTILITY_KINDS.find((x) => x.key === k)!.label;
