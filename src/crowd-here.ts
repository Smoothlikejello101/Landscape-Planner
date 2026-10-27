// Crowding where the garden is: a spring bulb counts as one only where it's hardy (src/crowding.ts).
import { hardyEnough, zoneFit } from './climate';
import type { CrowdOptions } from './crowding';
import type { Plant } from './plants';
import { state } from './state';

/** Whether a plant is hardy where the garden is; with no location yet, every plant is. */
export const hardyHere = (p: Plant): boolean => !state.location || hardyEnough(zoneFit(p, state.location));
/** The options crowding takes for this plan. */
export const crowdOptions = (): CrowdOptions => ({ hardy: hardyHere });
