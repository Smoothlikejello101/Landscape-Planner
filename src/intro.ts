// The guided introduction (decided with Jason, Oct 25 and Oct 28; the doc "FullGrown guided introduction"): from an
// empty plan to a first plant on their own yard, in eight short steps, like a game's tutorial. Optional, offered on an
// empty plan; one small task per step; each step ends when it's done, not when it's read. Skip and Exit on every
// step, Back after the first; Exit keeps the step they were on. Kept per device, as the hints are.
//
// This file is the steps and their rules, with no page in it (src/ui/intro-card.ts draws the card).

import type { SunLevel } from './sun';

export type StepId = 'zip' | 'photo' | 'turn' | 'house' | 'bed' | 'fade' | 'sun' | 'who' | 'plant' | 'ring';
/** In order. "turn" and "fade" are the photo's own steps (2b, 4b): only with a photo. */
export const STEPS: StepId[] = ['zip', 'photo', 'turn', 'house', 'bed', 'fade', 'sun', 'who', 'plant', 'ring'];
/** The step's number as the card says it: eight main steps, two of them with a "b". */
export const STEP_NUMBER: Record<StepId, string> = { zip: '1', photo: '2', turn: '2b', house: '3', bed: '4', fade: '4b', sun: '5', who: '6', plant: '7', ring: '8' };
export const STEP_TITLE: Record<StepId, string> = {
  zip: "Where's the garden?", photo: 'A photo from above', turn: 'Turn it square', house: 'Your house', bed: 'A bed',
  fade: 'Fade the photo', sun: 'Sun and shade', who: "Who's in your yard?", plant: 'Find a plant', ring: 'The ring',
};

/** What the plan looks like now, as far as the steps care. */
export interface Snapshot {
  zip: string | null;
  /** The photo's feet per pixel (null: no photo). A photo just picked is 0.1 (src/background.ts) until it's scaled. */
  scale: number | null;
  rotation: number; opacity: number; visible: boolean;
  buildings: number; beds: number;
  /** Sun exposure areas with sun recorded. */
  sunAreas: number;
  /** Plants placed (not existing trees). */
  plants: number;
  /** Something under way that the step waits out: drawing, placing, setting the scale, moving the photo. */
  busy: boolean;
  /** The sheet open, if any. */
  panel: string | null;
  bgEditMode: boolean;
}
/** A photo's scale before it's set (src/background.ts handleBgImageFile). */
export const UNSCALED = 0.1;

export interface Choices { kids: boolean; dogs: boolean; cats: boolean; horses: boolean }
export const NO_CHOICES: Choices = { kids: false, dogs: false, cats: false, horses: false };

/** The introduction's record on this device. */
export interface IntroRecord {
  /** never: not started; declined: "I'll explore"; active: under way; exited: left part way (kept); finished. */
  status: 'never' | 'declined' | 'active' | 'exited' | 'finished';
  step: StepId | null;
  done: StepId[];
  skipped: StepId[];
  /** The plan as it was when the step began: a step is done by what changed since (so Back doesn't count it again). */
  base: Snapshot | null;
  /** The answer to "Who's in your yard?". */
  who: Choices;
  /** The plan the step began on: another opened since, the step counts from what that one has. */
  project?: string | null;
}
export const NEW_RECORD: IntroRecord = { status: 'never', step: null, done: [], skipped: [], base: null, who: NO_CHOICES };
const STATUSES: IntroRecord['status'][] = ['never', 'declined', 'active', 'exited', 'finished'];
const SNAPSHOT_NUMBERS = ['rotation', 'opacity', 'buildings', 'beds', 'sunAreas', 'plants'] as const;
/**
 * The record as kept on this device (localStorage 'lp-intro'), checked: anything this version doesn't know (a step
 * renamed or dropped by another version, a broken value) reads as a fresh record, or as "left part way" where only the
 * step is unknown. It never stops the plan from drawing.
 */
export function parseIntroRecord(raw: string | null): IntroRecord {
  let v: unknown;
  try { v = JSON.parse(raw ?? 'null'); } catch { return { ...NEW_RECORD }; }
  if (!v || typeof v !== 'object') return { ...NEW_RECORD };
  const r = v as Record<string, unknown>;
  if (!STATUSES.includes(r.status as IntroRecord['status'])) return { ...NEW_RECORD };
  const steps = (x: unknown): StepId[] => (Array.isArray(x) ? x.filter((st): st is StepId => STEPS.includes(st as StepId)) : []);
  const b = r.base as Record<string, unknown> | null | undefined;
  const base = b && typeof b === 'object' && SNAPSHOT_NUMBERS.every((k) => typeof b[k] === 'number') ? (b as unknown as Snapshot) : null;
  const w = r.who as Record<string, unknown> | undefined;
  const who: Choices = w && typeof w === 'object' ? { kids: !!w.kids, dogs: !!w.dogs, cats: !!w.cats, horses: !!w.horses } : NO_CHOICES;
  const step = STEPS.includes(r.step as StepId) ? (r.step as StepId) : null;
  let status = r.status as IntroRecord['status'];
  // (Under way at a step this version doesn't have, or with no plan to count from: left part way, to pick up from ⋮.)
  if (status === 'active' && (!step || !base)) status = 'exited';
  return { status, step, done: steps(r.done), skipped: steps(r.skipped), base, who, project: typeof r.project === 'string' ? r.project : null };
}

/**
 * Whether a step is on the way for this plan: the photo's own steps only with a photo, and turning it only when the
 * photo step was done in this run (a photo already traced over is never moved: the plan's shapes would no longer line
 * up with it).
 */
export function applies(step: StepId, s: Snapshot, done: readonly StepId[] = []): boolean {
  if (step === 'turn') return s.scale != null && done.includes('photo');
  if (step === 'fade') return s.scale != null;
  return true;
}

/**
 * Whether the step's task is done: by what changed since it began (base), and nothing still under way. "turn",
 * "fade", "who" and "ring" also end with the card's own button (src/ui/intro-card.ts), since turning and fading the
 * photo don't redraw the page as they go.
 */
export function stepDone(step: StepId, base: Snapshot, now: Snapshot): boolean {
  if (now.busy) return false;
  switch (step) {
    case 'zip': return !!now.zip && now.zip !== base.zip;
    case 'photo': return now.scale != null && now.scale !== UNSCALED && now.scale !== base.scale;
    case 'turn': return now.rotation !== base.rotation && !now.bgEditMode;
    case 'house': return now.buildings > base.buildings;
    case 'bed': return now.beds > base.beds;
    case 'fade': return (now.opacity < base.opacity || (!now.visible && base.visible)) && now.panel !== 'bg';
    // (Once the sun's recorded and the sheet closed: the times are set in the sheet.)
    case 'sun': return now.sunAreas > base.sunAreas && now.panel !== 'props';
    case 'plant': return now.plants > base.plants;
    default: return false;
  }
}

/** The next step after `from` (null: from the start) that's on the way and not yet done or skipped. */
export function nextStep(from: StepId | null, rec: Pick<IntroRecord, 'done' | 'skipped'>, s: Snapshot): StepId | null {
  const start = from ? STEPS.indexOf(from) + 1 : 0;
  for (const st of STEPS.slice(start)) if (applies(st, s, rec.done) && !rec.done.includes(st) && !rec.skipped.includes(st)) return st;
  return null;
}
/** The step before `from` that's on the way (done or skipped ones too: Back goes back to it). */
export function prevStep(from: StepId, s: Snapshot, done: readonly StepId[] = []): StepId | null {
  for (const st of STEPS.slice(0, STEPS.indexOf(from)).reverse()) if (applies(st, s, done)) return st;
  return null;
}
/** Where "Show me around" picks up: the step they left, or the first not done. */
export function resumeStep(rec: IntroRecord, s: Snapshot): StepId | null {
  if (rec.step && applies(rec.step, s, rec.done) && !rec.done.includes(rec.step)) return rec.step;
  return nextStep(null, rec, s);
}

// ---------- Step 7's shrub ----------
/**
 * The flowering shrubs step 7 names for them to find, most familiar first (Jason's to change; the doc's last section).
 * Its zones and sun are the catalog's sourced facts (NC State). Roses aren't on it (unverified zones and sun);
 * crapemyrtle is more tree than shrub. `name` is what the card calls it, which the search finds.
 */
export const SHRUBS_TO_FIND: { id: string; name: string }[] = [
  { id: 'hydrangea-macrophylla', name: 'a French hydrangea' },
  { id: 'hydrangea-quercifolia', name: 'an oakleaf hydrangea' },
  { id: 'syringa-vulgaris', name: 'a common lilac' },
  { id: 'forsythia-x-intermedia', name: 'a forsythia' },
  { id: 'gardenia-jasminoides', name: 'a gardenia' },
  { id: 'camellia-japonica', name: 'a Japanese camellia' },
  { id: 'weigela-florida', name: 'a weigela' },
  { id: 'hydrangea-paniculata', name: 'a panicled hydrangea' },
  { id: 'kalmia-latifolia', name: 'a mountain laurel' },
  { id: 'calycanthus-floridus', name: 'an eastern sweetshrub' },
];
export interface ShrubCheck {
  /** Hardy in their zone (null: no ZIP, so none is named). */
  hardy: (id: string) => boolean | null;
  /** Takes the bed's sun (null: no sun recorded over the bed: any). */
  takesSun: (id: string) => boolean | null;
  /** Native to their state (Kew's checklist). */
  native: (id: string) => boolean;
  /** Listed invasive in the lower 48 (USGS's register), or named by a law in their state. */
  flagged: (id: string) => boolean;
  /** Not hidden by the yard's filters (kids, dogs, cats, horses). */
  yardOk: (id: string) => boolean;
}
/**
 * The shrub to name: the first that is hardy in their zone, takes the bed's sun, isn't flagged in their state and isn't
 * hidden by the yard's filters (step 6); one
 * native to their state first where one fits (Jason, Oct 28: "as long as it's easy"). None without a ZIP.
 */
export function shrubToFind(check: ShrubCheck): { id: string; name: string } | null {
  const fits = SHRUBS_TO_FIND.filter((s) => check.hardy(s.id) === true && check.takesSun(s.id) !== false && !check.flagged(s.id) && check.yardOk(s.id));
  return fits.find((s) => check.native(s.id)) ?? fits[0] ?? null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** What step 7's card says, by what the earlier steps set (Jason, Oct 28: it changes if they skipped the ZIP, the bed or the sun). */
export function plantCardText(o: { bed: boolean; zip: boolean; sun: SunLevel | null; shrub: { name: string } | null; tap: string }): string {
  const where = o.bed ? 'in the bed' : 'on the plan';
  const find = `Find something ${o.bed ? 'for the bed' : 'to plant'}: search for a plant you know, or try the filters.`;
  if (!o.shrub) return `${find} ${cap(o.tap)} Place, then ${o.tap} ${where}.`;
  const why = [o.zip ? "it's hardy here" : '', o.sun && o.bed ? "takes this bed's sun" : ''].filter(Boolean).join(' and ');
  return `${find} Not sure? Try ${o.shrub.name}${why ? `: ${why}` : ''}. Find it, ${o.tap} Place, then ${o.tap} ${where}.`;
}
