// The guided introduction's card (src/intro.ts has the steps and their rules): one card at the foot of the plan (in
// the corner with a keyboard and mouse; at the top while a sheet is open), a line or two of words, the step's own
// button, Back, Skip and Exit, and a pulse on the thing to tap. Each step ends when it's done: the card checks after
// every redraw (render's last call), and moves on by itself.

import { recordError } from '../error-log';
import { state } from '../state';
import { el, hasKeyboard } from '../dom';
import { I } from '../icons';
import { startKind } from '../draw';
import { pxPerFoot, rotatedBoxBounds, shapeBBox, shapeCenter } from '../geometry';
import { pulseShape, resizeCanvas } from '../canvas';
import { MIN_ZOOM, PX_PER_FOOT_BASE } from '../constants';
import { hintShown } from '../hints';
import { PLANT_FILTER_DEFAULTS, plantFilter, plantMatches, plantsById, plantTakesSun } from '../plants';
import { hardyEnough, zoneFit } from '../climate';
import { nativeHere, regulatedHere } from '../wild';
import { sunAt, sunLevel } from '../sun';
import { NO_YARD, applyYard, household, noteAsked, saveHardy, saveYard, toggleYard, yardFilter, yardOf, yardSet, type Yard } from '../yard';
import {
  NEW_RECORD, STEP_NUMBER, STEP_TITLE, UNSCALED, applies, nextStep, parseIntroRecord, plantCardText, prevStep, resumeStep, ringCardText, shrubToFind,
  stepDone, type IntroRecord, type Snapshot, type StepId,
} from '../intro';
import { openLocation } from './location-panel';
import { updateBgImage } from '../background';
import { toast } from './toast';
import { fullRingRadius } from '../my-plants';
import { isLocked } from '../roles';
import type { Bounds, Shape } from '../types';
import type { SunLevel } from '../sun';
import { render } from './render';

const KEY = 'lp-intro';
function load(): IntroRecord {
  try { return parseIntroRecord(localStorage.getItem(KEY)); } catch { return { ...NEW_RECORD }; }
}
let rec: IntroRecord = load();
function save(): void {
  // (The house's lock is read live, as the steps go: not kept with the record.)
  const base = rec.base ? { ...rec.base } : null;
  if (base) delete base.houseLocked;
  try { localStorage.setItem(KEY, JSON.stringify({ ...rec, base })); } catch { /* no storage: it lasts this visit */ }
}
/** The card's choice of words where a mouse clicks what a finger taps. */
/** Step 4b's "Fade it": the photo's opacity. */
const FADED = 0.35;
const tap = () => (hasKeyboard() ? 'click' : 'tap');
const Tap = () => (hasKeyboard() ? 'Click' : 'Tap');

/** The plan now, as the steps see it. */
export function snapshot(): Snapshot {
  const bg = state.bgImage;
  return {
    zip: state.location?.zip ?? null,
    scale: bg ? bg.ftPerPx : null,
    rotation: bg?.rotation ?? 0, opacity: bg?.opacity ?? 1, visible: bg ? bg.visible !== false : true,
    buildings: state.shapes.filter((s) => s.role === 'building').length,
    beds: state.shapes.filter((s) => s.role === 'bed').length,
    sunAreas: state.shapes.filter((s) => s.role === 'shade' && !!s.sun).length,
    plants: state.shapes.filter((s) => s.role === 'plant' && !!s.plantId && !('tree' in s && s.tree)).length,
    busy: !!(state.draw || state.placing || state.bgCalibrate || state.featurePlace || state.editPoints),
    panel: state.panel ?? null,
    bgEditMode: !!state.bgEditMode,
    houseLocked: (() => { const h = newestHouse(); return h ? isLocked(h) : null; })(),
  };
}

/** Whether the empty plan offers it at the top of its card ("New here? Guided start"): not once it's been started, finished or declined. */
export const introOffered = (): boolean => rec.status === 'never';
/**
 * The plan it's under way on (Jason, Nov 4: it stays with the plan it was started on; another plan opened, its card
 * waits there). A record from before it kept its plan goes with the plan open now.
 */
const onThisPlan = (): boolean => rec.project == null || rec.project === state.currentProjectId;
/** Under way on the open plan: its card is up (or steps aside while drawing). On another plan, it waits there. */
export const introActive = (): boolean => rec.status === 'active' && onThisPlan();
/**
 * "I'll explore": not offered at the top of the card again. It stays in ⋮ → Help, and a blank plan's card still has
 * it, small (guidedStartSmall).
 */
export function declineIntro(): void { rec.status = 'declined'; save(); }

/**
 * Whether a blank plan's card offers Guided start small (Jason, Nov 4: "we should add 'take the tour' to the canvas of a
 * blank plan"): whenever it isn't offered at the top and isn't under way here, after "I'll explore", an Exit or the end
 * too (it went for good after "I'll explore"). Not while the card asks "pick up or start over".
 */
export const guidedStartSmall = (): boolean => !introOffered() && !introActive() && !choosing;
/** Begin at the first step (or `at`), fresh: what's done on the plan before it counts from here on. */
function begin(at: StepId | null): void {
  const s = snapshot();
  rec = { ...rec, status: 'active', done: at ? rec.done : [], skipped: at ? rec.skipped : [], base: s, project: state.currentProjectId };
  rec.step = at ?? nextStep(null, rec, s);
  choosing = false;
  save();
}
/** Whether the card is asking "pick up or start over" (⋮ → Help → Guided start after an Exit). */
let choosing = false;
/**
 * Guided start (⋮ → Help, or a blank plan's card: "New here? Guided start", or the small one). Left part way: asks
 * whether to pick up where they left or start over. Otherwise it starts from step 1.
 */
export function showMeAround(): void {
  // (Under way already, or left part way: pick up there, or start over.)
  // (Kept as left until they pick: a reload meanwhile doesn't count what was done since against the old plan.)
  // (Not where picking up is starting over: "Pick up at step 1" beside "Start over" read as the same thing. Round 3, Ruth.)
  const at = rec.status === 'exited' || rec.status === 'active' ? resumeStep(rec, snapshot()) : null;
  if (at && at !== 'zip') { choosing = true; rec.status = 'exited'; save(); return; }
  begin(null);
}
function exit(): void { if (rec.status === 'active') rec.status = 'exited'; choosing = false; wasHere = false; save(); }
function finish(): void {
  rec.status = 'finished'; rec.step = null; choosing = false; save();
  toast('That\'s the end of the guided start. Add more plants, or open Add for paths, lawn, fences and the rest. To go through it again: \u22ee \u2192 Help \u2192 Guided start.', 9000);
}
/** Move on from the current step: done or skipped. */
function advance(how: 'done' | 'skipped'): void {
  const step = rec.step;
  if (!step) return;
  if (how === 'done') { if (!rec.done.includes(step)) rec.done = [...rec.done, step]; noteHints(step); } else if (!rec.skipped.includes(step)) rec.skipped = [...rec.skipped, step];
  const s = snapshot();
  rec.step = nextStep(step, rec, s);
  rec.base = s;
  if (!rec.step) { finish(); return; }
  save();
}
function back(): void {
  if (!rec.step) return;
  const s = snapshot();
  const prev = prevStep(rec.step, s, rec.done);
  if (!prev) return;
  rec.step = prev;
  rec.done = rec.done.filter((x) => x !== prev);
  rec.skipped = rec.skipped.filter((x) => x !== prev);
  rec.base = s;
  save();
}
/**
 * A step done counts its tool's hint as shown (they've just learned it); one skipped leaves it due. Of the steps' tools
 * only the ring has a hint of its own today (render.ts maybeExplainFullSize); the photo, sun and filters explain
 * themselves where they're used.
 */
function noteHints(step: StepId): void {
  if (step === 'ring') hintShown('lp-hint-full-size');
}

/** The bed the plant step talks about: the newest one. */
const newestBed = () => [...state.shapes].reverse().find((s) => s.role === 'bed') ?? null;
/** The house step 3b locks, and the plant the ring step talks about: the newest of each. */
function newestHouse() { return [...state.shapes].reverse().find((s) => s.role === 'building') ?? null; }
const newestPlant = () => [...state.shapes].reverse().find((s) => s.type === 'circle' && s.role === 'plant') ?? null;
/** The plant selected, alone, if one is: the one whose ring step 8 explains. */
const selectedPlant = () => {
  const s = state.selectedIds.length === 1 ? state.shapes.find((x) => x.id === state.selectedIds[0]) : null;
  return s && s.type === 'circle' && s.role === 'plant' ? s : null;
};
/** Whether the house is what's selected, alone. */
const houseSelected = (h: Shape | null) => !!h && state.selectedIds.length === 1 && state.selectedIds[0] === h.id;
/** The sun recorded over the middle of that bed, if any. */
function bedSun(): SunLevel | null {
  const bed = newestBed();
  if (!bed) return null;
  const at = sunAt(shapeCenter(bed), state.shapes);
  return at ? sunLevel(at.info) : null;
}
/** Step 7's shrub, for this garden: hardy here, takes the bed's sun, not listed invasive or named by a law in the state; a native first. */
function shrubForGarden() {
  const loc = state.location;
  const sun = bedSun();
  const yardOnly = yardFilter(PLANT_FILTER_DEFAULTS, yardOf(plantFilter)); // (the step-6 answer, or as since changed in Filters)
  return shrubToFind({
    hardy: (id) => { const p = plantsById[id]; return loc && p ? hardyEnough(zoneFit(p, loc)) : null; },
    takesSun: (id) => { const p = plantsById[id]; return sun && p ? plantTakesSun(p, sun) : null; },
    native: (id) => { const p = plantsById[id]; return !!p && nativeHere(p)?.status === 'N'; },
    // (Not one USGS's register lists as invasive in the lower 48, though the picker offers it: this is the app's own
    // suggestion.)
    flagged: (id) => { const p = plantsById[id]; return !p || p.wild_us === 'invasive' || p.wild_us === 'widespread invasive' || regulatedHere(p).length > 0; },
    // (Not one the yard's own filters hide: no hydrangea to find with kids or dogs in it.)
    yardOk: (id) => { const p = plantsById[id]; return !!p && plantMatches(p, yardOnly); },
  });
}

/** The words on the card, and its own button. */
function stepContent(step: StepId): { text: string; short?: string; action?: { label: string; run: () => void }; done?: string; extra?: HTMLElement } {
  switch (step) {
    case 'zip': return rec.base?.zip ? {
      // (Set already, from ⋮ on a plan that has one: say so, and go on.)
      text: `This plan's garden is at ZIP ${rec.base.zip}. Change it if that's not where the garden is.`,
      short: 'Enter your ZIP, then Look up.',
      action: { label: 'Change it', run: () => openLocation() },
      done: 'Next',
    } : {
      // (How to leave a panel, said once, at the first one (Jason, Oct 29: "do I need to save somehow?"). Its ×, not
      // the plan: on a phone the panel covers all but a sliver of it (round 3: Ruth, Priya, Lena and Dana).)
      text: `Your ZIP gives the garden's hardiness zone and frost dates. Looking it up sends only its first three digits. When you're done with a panel, close it with its ×: everything saves as you go.`,
      short: state.location?.zip ? 'Your zone and frost dates are below. Close this with its × to go on.' : 'Enter your ZIP, then Look up.',
      action: { label: 'Enter your ZIP', run: () => openLocation() },
    };
    case 'photo': return rec.base?.scale != null && rec.base.scale !== UNSCALED ? {
      // (A photo set to scale already, from ⋮ on a plan that has one: say so, and go on. It isn't moved: 2b is skipped.)
      text: 'This plan already has a photo, set to scale. Background image in ⋮ changes it.',
      done: 'Next',
    } : {
      text: `Got a satellite or drone photo of your yard? Trace over it and your plan comes out to scale. Then ${tap()} two points you know the distance between.`,
      short: `Choose an image, then ${tap()} two points you know the distance between.`,
      action: { label: 'Choose a photo', run: () => { state.panel = 'bg'; } },
    };
    case 'turn': return {
      text: 'Now turn the photo until your house sits square to the grid. We recommend it: walls along grid lines are easier to draw.',
      short: 'Edit position & rotation, then turn it square to the grid.',
      action: { label: 'Turn it', run: () => { state.bgEditMode = true; state.panel = null; } },
      done: 'Done turning',
    };
    case 'house': return {
      text: `${Tap()} Add, then Building. Draw your house: ${tap()} one corner, the next corner, then the far side. For a more complex shape, choose Outline and ${tap()} each corner.`,
      short: `${Tap()} Building, then draw your house.`,
      action: { label: 'Add a building', run: () => { state.panel = 'add'; } },
    };
    case 'lock': return {
      // (Taught from the house's own panel, where it's undone too (Jason, Nov 4: "should it teach them to open the edit
      // pane and lock from there rather than doing it for them?"). It was a chip on the bed's card that locked it.)
      // Locked, it stays put, and a press on it goes to what's drawn on it (Oct 29).
      text: `Lock your house, so it stays put while you draw around it: ${tap()} it, then Edit, then Unlocked at the top of its panel. ${Tap()} it there again to move it.`,
      // (Over its panel; over another sheet, the whole of it.)
      short: state.panel === 'props' ? `${Tap()} Unlocked at the top, so it reads Locked.` : undefined,
    };
    case 'bed': return {
      text: `Now a bed, where you'd like plants. ${Tap()} around its edge.${hasKeyboard() ? ' (B starts one.)' : ''}`,
      // (Just locked in its panel, step 3b: what to do next, over it.)
      short: state.panel === 'props' && houseSelected(newestHouse()) && newestHouse()?.locked ? 'Locked: it stays put. Close this with its \u00d7, then draw a bed.' : undefined,
      action: { label: 'Draw a bed', run: () => startKind('bed') },
    };
    case 'fade': return {
      text: 'Photo making it busy? Fade it, or hide it. Background image in ⋮ brings it back any time.',
      short: 'Slide Opacity to suit, or Hide image. Then close this with its ×.',
      // (It fades it, as it says, then opens the panel to fine-tune it: round 3, Dana tapped it and saw nothing change.)
      action: { label: 'Fade it', run: () => { if (state.bgImage && state.bgImage.opacity > FADED) updateBgImage({ opacity: FADED }); state.panel = 'bg'; } },
      done: 'Done',
    };
    case 'sun': return {
      // (In Jason's words, Nov 4: "Step 5 reads funny. Maybe something like 'Is it a shady spot? Sunny? Draw an area and
      // indicate how much sun it gets.'")
      text: 'Is it a shady spot? Sunny? Draw an area and show how much sun it gets.',
      short: state.panel === 'add' ? `${Tap()} Sun exposure, then draw the area.` : `Drag across the hours it gets sun, then close this with its ×.`,
      action: { label: 'Draw an area', run: () => startKind('sun') },
    };
    case 'who': return { text: "Kids, dogs, cats, horses? We'll hide plants that are toxic to them. Change it any time in Filters.", extra: whoChips(), done: 'Next' };
    case 'plant': {
      const bed = !!newestBed(), zip = !!state.location?.zip, sun = bedSun();
      const shrub = zip ? shrubForGarden() : null;
      const text = plantCardText({ bed, zip, sun, shrub, tap: tap() }) + (hasKeyboard() ? ' (P opens the plants.)' : '');
      return {
        text,
        short: shrub ? `Not sure? Search for ${shrub.name.replace(/^an? /, '')}, then ${tap()} Place.` : `Search for a plant you know, or try the filters. Then ${tap()} Place.`,
        action: {
          label: 'Find a plant',
          run: () => {
            startKind('plant');
            // (The picker opens with what the earlier steps set: hardy here, and the bed's sun.)
            if (zip) { plantFilter.hardyHere = true; saveHardy(true); }
            if (sun) plantFilter.sun = sun;
          },
        },
      };
    }
    case 'ring': {
      // (The ring shows on the plant selected, or on all with full sizes shown (Layers): none selected, select one first.
      // Jason, Nov 4. Not every plant has a ring (Oct 29): one whose sources give one size. No plant at all, the step
      // before skipped: said of plants in general, not of an "it" that isn't there. Round 3, Diego.)
      const looking = selectedPlant() ?? (state.showFullSize ? newestPlant() : null);
      return {
        text: ringCardText(looking
          ? { looking: 'plant', planned: looking.status === 'planned', ring: fullRingRadius(looking) != null, tap: tap() }
          : { looking: newestPlant() ? 'unselected' : 'nothing', justPlaced: rec.done.includes('plant'), tap: tap() }),
        done: 'Got it',
      };
    }
  }
}
/**
 * Step 6's choices: each a toggle that sets the picker's filter for it at once and keeps it with the plan
 * (src/yard.ts); read from the filters each time, so a change made in Filters meanwhile shows. And "None of these"
 * (Jason, Nov 4: "there should be a way to say 'none of the above'"): the four off, and the question answered for the
 * plan, so the picker keeps "Anyone you need to protect?" under its Filters fold and the warnings know no one's at
 * risk. It shows chosen while the plan's answer is no one; one of the four chosen, it isn't.
 */
function whoChips(): HTMLElement {
  const row = el('div', { className: 'intro-chips', role: 'group', 'aria-label': "Who's in your yard" });
  const chips: [keyof Yard, string][] = [['kids', 'Kids'], ['dogs', 'Dogs'], ['cats', 'Cats'], ['horses', 'Horses']];
  const isOn = (k: keyof Yard) => { const y = yardOf(plantFilter); return k === 'dogs' ? y.dogs !== '' : !!y[k]; };
  const noOne = () => { const h = household(); return h.answered && !yardSet(h); };
  const shown: [HTMLElement, () => boolean][] = [];
  const show = () => {
    for (const [b, on] of shown) { b.classList.toggle('on', on()); b.setAttribute('aria-pressed', String(on())); }
    note.hidden = !isOn('dogs');
  };
  for (const [k, label] of chips) {
    const b = el('button', { className: 'intro-chip', 'data-testid': `intro-${k}` }, label);
    b.addEventListener('click', () => {
      // (Dogs back on: as it was set before, "only plants rated safe" kept if that's what it was. The picker's "Anyone
      // you need to protect?" does the same: src/yard.ts toggleYard.)
      const y = toggleYard(yardOf(plantFilter), k);
      applyYard(plantFilter, y);
      saveYard(y, k);
      show();
    });
    shown.push([b, () => isOn(k)]);
    row.appendChild(b);
  }
  const none = el('button', { className: 'intro-chip', 'data-testid': 'intro-none' }, 'None of these');
  none.addEventListener('click', () => {
    applyYard(plantFilter, NO_YARD);
    saveYard({ ...NO_YARD }); // (all four off, answered: src/yard.ts)
    show();
  });
  shown.push([none, noOne]);
  row.appendChild(none);
  // (Dogs: no dog warnings; a plant not yet rated still shows, which isn't the same as safe. Decided Oct 28.)
  const note = el('div', { className: 'intro-note', 'data-testid': 'intro-dogs-note' }, "Dogs: plants with a warning for dogs are hidden; plants not yet rated still show.");
  show();
  return el('div', {}, row, note);
}

/**
 * Whether the ZIP sheet's field holds a whole ZIP. Till it does, the field pulses, then Look up (the UI review,
 * 2026-11-01: Look up pulsing over an empty field read as the focus being there).
 */
const zipTyped = () => /^\d{5}$/.test(document.querySelector<HTMLInputElement>('[data-testid=zip]')?.value ?? '');
/** What to pulse, for the step and what's open now. */
function pulseTarget(step: StepId): string | null {
  const p = state.panel;
  switch (step) {
    case 'zip': return p === 'location' ? (zipTyped() ? '[data-testid=zip-lookup]' : '[data-testid=zip]') : null;
    case 'photo': return p === 'bg' && !state.bgImage ? '[data-testid=bg-choose]' : null;
    case 'turn': return p === 'bg' ? '[data-testid=bg-edit]' : null;
    case 'house': return p === 'add' ? '.kind-chip[data-kind=building]' : null;
    // (The house, on the plan, till it's selected (introAfterRender pulses it there); then Edit; then the toggle.)
    case 'lock': return !houseSelected(newestHouse()) ? null : p === 'props' ? '[data-testid=lock-toggle]' : p ? null : '.sel-pill .edit';
    case 'bed': return !p && !state.draw ? '.tool-btn.bed' : null;
    case 'fade': return p === 'bg' ? '[data-testid=bg-opacity]' : null;
    case 'sun': return p === 'add' ? '.kind-chip[data-kind=sun]' : p === 'props' ? '[data-testid=sun-empty]' : null;
    // (The search and Filters together, till something's typed or Filters is opened: Jason, Nov 4, "should we pulse
    // filters as well? At the very least if they open filters we should stop pulsing search.")
    case 'plant': {
      if (p !== 'plants') return null;
      const open = document.querySelector('[data-testid=filters]')?.getAttribute('aria-expanded') === 'true';
      return plantFilter.q.trim() || open ? null : '[data-testid=plant-search], [data-testid=filters]';
    }
    default: return null;
  }
}

/**
 * After every redraw: move on if the step's task is done, then draw the card (or the "pick up or start over" card),
 * and pulse what to tap.
 */
export function introAfterRender(root: HTMLElement): void {
  document.documentElement.classList.remove('intro-top');
  pulseShape(null); // (a shape on the plan pulses only while a step points to it: drawIntro)
  // (Never in the way of the plan: anything amiss here leaves the introduction "left part way", to pick up from ⋮.)
  try { drawIntro(root); } catch (e) { console.error('guided introduction', e); recordError(e, 'guided introduction'); choosing = false; exit(); }
}
/** Whether the card was last drawn on its own plan: leaving it from there says where it waits, once. */
let wasHere = false;
/**
 * Under way on another plan than the one open (Jason, Nov 4: "switching plans while taking the tour keeps the tour
 * going on the new plan, which probably isn't what we want"): its card isn't shown here, and nothing done here counts
 * toward its step; it's there again, at its step, on its own plan. Leaving that plan says so once, as it goes. Its plan
 * deleted, it's left part way, to pick up from ⋮ → Help on this one (pick up here, or start over).
 */
function waitsElsewhere(): boolean {
  if (rec.status !== 'active' || choosing) return false;
  if (rec.project == null && state.currentProjectId) { rec.project = state.currentProjectId; save(); }
  if (onThisPlan()) { wasHere = true; return false; }
  const its = state.projects.find((p) => p.id === rec.project);
  if (!its) { if (state.projects.length) exit(); wasHere = false; return true; }
  if (wasHere) toast(`Guided start waits on \u201c${its.name}\u201d. Switch back to it to go on.`, 7000);
  wasHere = false;
  return true;
}
function drawIntro(root: HTMLElement): void {
  if (waitsElsewhere()) return;
  if (rec.status !== 'active' && !choosing) return;
  if (state.menu) return; // (⋮ open: the card would sit over its last rows)
  if (!choosing) {
    // (The ZIP looked up: its zone and frost dates stay to be read; the next step waits for the panel to close (testers,
    // Oct 30: step 2 came up over it, asking for a photo with no way to give one).)
    const reading = rec.step === 'zip' && state.panel === 'location';
    // (Done first: the house just locked in step 3b is done, though "Lock the house" no longer applies to it.)
    if (rec.step && rec.base && !reading && stepDone(rec.step, rec.base, snapshot())) advance('done');
    if (rec.status !== 'active' || !rec.step) return;
    // (A photo's own step with the photo gone, or the house locked some other way: on to the next, not counted as done.)
    if (!applies(rec.step, snapshot(), rec.done)) { rec.step = nextStep(rec.step, rec, snapshot()); rec.base = snapshot(); if (!rec.step) { finish(); return; } save(); }
  }
  // While drawing, placing, adding doors or setting the scale, the strip above the plan says what to tap, and the card
  // steps aside altogether, off the plan where the taps go (Jason, Nov 2: a card never covers what the step is about).
  // It's back when that's done.
  if (!choosing && snapshot().busy) return;
  const card = choosing ? resumeCard() : stepCard();
  root.appendChild(card);
  placeCard(card);
  if (!choosing && rec.step) keepSubjectClear(rec.step, card);
  const step = rec.step;
  // (Step 3b: the house itself pulses, on the plan, till it's selected. Step 8: the plant placed last, till a plant is.)
  if (step === 'lock' && !choosing && !state.panel) { const h = newestHouse(); if (h && !houseSelected(h)) pulseShape(h.id); }
  if (step === 'ring' && !choosing && !state.panel && !selectedPlant() && !state.showFullSize) { const p = newestPlant(); if (p) pulseShape(p.id); }
  const sel = step && !choosing ? pulseTarget(step) : null;
  const targets = sel ? [...root.querySelectorAll<HTMLElement>(sel)] : [];
  for (const t of targets) t.classList.add('intro-pulse');
  const target = targets[0];
  // (The ZIP typed: the pulse moves on to Look up there and then, without a redraw, which typing never makes.)
  if (target?.dataset.testid === 'zip') target.addEventListener('input', () => {
    target.classList.toggle('intro-pulse', !zipTyped());
    root.querySelector('[data-testid=zip-lookup]')?.classList.toggle('intro-pulse', zipTyped());
  });
  // (Step 7: a search typed, or Filters opened, and neither pulses, there and then: neither redraws the page.)
  if (step === 'plant' && targets.length) {
    const stop = () => { for (const t of targets) t.classList.remove('intro-pulse'); };
    root.querySelector('[data-testid=plant-search]')?.addEventListener('input', stop);
    root.querySelector('[data-testid=filters]')?.addEventListener('click', stop);
  }
}

/**
 * Where the card sits: above the toolbar at the foot of the plan, and above a selected shape's chip or the bar for
 * several (never over their buttons); in the corner with a keyboard and mouse; at the top, small, while a sheet is open.
 */
function placeCard(card: HTMLElement): void {
  if (card.classList.contains('at-top')) {
    // (An open sheet keeps clear of it: its height is kept as --intro-h, which the sheets' CSS leaves room for, so a
    // keyboard opening needs no redraw.)
    const html = document.documentElement;
    html.style.setProperty('--intro-h', `${Math.ceil(card.getBoundingClientRect().bottom + 8)}px`);
    html.classList.add('intro-top');
    return;
  }
  let top = window.innerHeight;
  for (const e of document.querySelectorAll('.bottom-toolbar, .sel-pill, .multi-bar, .filter-banner')) {
    const r = e.getBoundingClientRect();
    if (r.height > 0) top = Math.min(top, r.top);
  }
  card.style.bottom = `${Math.max(8, Math.round(window.innerHeight - top + 8))}px`;
}
/**
 * What the step is about, on the plan (feet): the photo it turns, fades or traces the house over; the house to lock,
 * and to draw a bed by; the bed a plant's to go in; the plant whose ring it explains. None for the rest.
 */
function subject(step: StepId): { key: string; at: Bounds } | null {
  const bg = state.bgImage;
  const shape = (s: Shape | null) => (s ? { key: s.id, at: shapeBBox(s) } : null);
  switch (step) {
    case 'turn': case 'fade': case 'house': return bg?.visible ? { key: 'photo', at: rotatedBoxBounds(bg.cx, bg.cy, bg.naturalWidth * bg.ftPerPx, bg.naturalHeight * bg.ftPerPx, bg.rotation) } : null;
    case 'lock': case 'bed': return shape(newestHouse());
    case 'plant': return shape(newestBed());
    case 'ring': {
      // (The plant to select, or selected: with its ring, and again once it's selected, the card moving up over its chip.)
      const p = selectedPlant() ?? newestPlant();
      if (!p || p.type !== 'circle') return null;
      const r = fullRingRadius(p) ?? p.radius;
      return { key: `${p.id}${selectedPlant() ? ':selected' : ''}`, at: { minX: p.x - r, minY: p.y - r, maxX: p.x + r, maxY: p.y + r } };
    }
    default: return null;
  }
}
/** The step and subject last kept clear of the card: once each, so the plan can be moved after as the person likes. */
let keptClear = '';
/**
 * The card never covers what the step is about (Jason, Nov 2, from the UI review): where the subject would be under the
 * card, the plan is moved so it shows in the room above the card, zoomed out (never in) if it must be to fit. Once per
 * step and subject.
 */
function keepSubjectClear(step: StepId, card: HTMLElement): void {
  const sub = card.classList.contains('at-top') ? null : subject(step);
  const key = sub ? `${step}:${sub.key}` : '';
  if (!sub || key === keptClear) return;
  keptClear = key;
  resizeCanvas(); // (the plan as laid out now: a strip of words above it may have just gone)
  const wrap = document.getElementById('canvas-wrap')?.getBoundingClientRect(), c = card.getBoundingClientRect();
  if (!wrap || !c.height) return;
  const m = 16, room = { left: wrap.left + m, top: wrap.top + m, right: wrap.right - m, bottom: Math.min(wrap.bottom, c.top) - m };
  const b = sub.at, ppf = pxPerFoot();
  const x = (f: number) => wrap.left + (f - state.offsetX) * ppf, y = (f: number) => wrap.top + (f - state.offsetY) * ppf;
  if (x(b.minX) >= room.left && x(b.maxX) <= room.right && y(b.minY) >= room.top && y(b.maxY) <= room.bottom) return;
  const w = room.right - room.left, h = room.bottom - room.top;
  if (w < 40 || h < 40) return;
  const fit = Math.min(w / (Math.max(b.maxX - b.minX, 1) * PX_PER_FOOT_BASE), h / (Math.max(b.maxY - b.minY, 1) * PX_PER_FOOT_BASE));
  state.zoom = Math.max(MIN_ZOOM, Math.min(state.zoom, fit));
  const p = pxPerFoot();
  state.offsetX = (b.minX + b.maxX) / 2 - (room.left + w / 2 - wrap.left) / p;
  state.offsetY = (b.minY + b.maxY) / 2 - (room.top + h / 2 - wrap.top) / p;
}
function cardShell(compact: boolean): HTMLElement {
  const where = state.panel ? ' at-top' : hasKeyboard() ? ' corner' : '';
  return el('section', { className: 'intro-card' + where + (compact || state.panel ? ' compact' : ''), 'data-testid': 'intro-card', 'aria-label': 'Guided start' });
}
function exitButton(): HTMLElement {
  const x = el('button', { className: 'intro-exit', html: I.x, 'aria-label': 'Exit Guided start', title: 'Exit (your place is kept)', 'data-testid': 'intro-exit' });
  x.addEventListener('click', () => {
    exit();
    render();
    // (Where it's kept, said as it goes: Jason, Nov 2, from the UI review.)
    toast('Guided start closed. To pick it up again: \u22ee \u2192 Help \u2192 Guided start.', 6000);
  });
  return x;
}

function stepCard(): HTMLElement {
  const step = rec.step!;
  const s = snapshot();
  const card = cardShell(s.busy || s.bgEditMode);
  // (With a sheet open, its × is the one the card's words mean ("close it with its ×"): the card shows no × of its own
  // then, so there's one on the screen. Jason, Nov 2, from the UI review: step 1 showed two.)
  const head = el('div', { className: 'intro-head' },
    el('span', { className: 'intro-num', 'data-testid': 'intro-step' }, `Step ${STEP_NUMBER[step]} of 8`),
    el('span', { className: 'intro-title' }, STEP_TITLE[step]), ...(state.panel ? [] : [exitButton()]));
  card.appendChild(head);
  const c = stepContent(step);
  // A sheet open: what to do in it, in a line, clear of the sheet (its own buttons do the step; a pulse shows which).
  card.appendChild(el('p', { className: 'intro-text', 'data-testid': 'intro-text' }, state.panel ? c.short ?? c.text : c.text));
  if (state.panel) return card;
  if (c.extra) card.appendChild(c.extra);
  const actions = el('div', { className: 'intro-actions' });
  const prev = prevStep(step, s, rec.done);
  if (prev) {
    const b = el('button', { className: 'btn ghost', 'data-testid': 'intro-back' }, 'Back');
    b.addEventListener('click', () => { back(); render(); });
    actions.appendChild(b);
  }
  if (step !== 'ring') {
    const skip = el('button', { className: 'btn ghost', 'data-testid': 'intro-skip' }, 'Skip');
    skip.addEventListener('click', () => { advance('skipped'); render(); });
    actions.appendChild(skip);
  }
  actions.appendChild(el('span', { className: 'intro-gap' }));
  if (c.action) {
    const b = el('button', { className: 'btn ' + (c.done ? 'ghost' : 'primary'), 'data-testid': 'intro-go' }, c.action.label);
    b.addEventListener('click', () => { c.action!.run(); render(); });
    actions.appendChild(b);
  }
  if (c.done) {
    const b = el('button', { className: 'btn primary', 'data-testid': 'intro-done' }, c.done);
    b.addEventListener('click', () => {
      if (step === 'who') {
        const y = yardOf(plantFilter);
        rec.who = { kids: y.kids, dogs: y.dogs !== '', cats: y.cats, horses: y.horses };
        // (Answered, even with none ticked: the picker doesn't ask "Anyone you need to protect?" again at its top.
        // Jason, Nov 1, from the UI review. Kept with the plan, apart from this record, which Back and Start over clear.)
        noteAsked();
      }
      if (step === 'turn') state.bgEditMode = false;
      advance('done');
      render();
    });
    actions.appendChild(b);
  }
  card.appendChild(actions);
  return card;
}

function resumeCard(): HTMLElement {
  const card = cardShell(false);
  const s = snapshot();
  const at = resumeStep(rec, s);
  card.appendChild(el('div', { className: 'intro-head' }, el('span', { className: 'intro-title' }, 'Guided start'), exitButton()));
  const actions = el('div', { className: 'intro-actions column' });
  if (at) {
    const pick = el('button', { className: 'btn primary', 'data-testid': 'intro-resume' }, `Pick up at step ${STEP_NUMBER[at]}, ${STEP_TITLE[at]}`);
    pick.addEventListener('click', () => { rec = { ...rec, status: 'active', step: at, base: snapshot(), project: state.currentProjectId }; choosing = false; save(); render(); });
    actions.appendChild(pick);
  }
  const over = el('button', { className: 'btn ghost', 'data-testid': 'intro-over' }, 'Start over');
  over.addEventListener('click', () => { begin(null); render(); });
  actions.appendChild(over);
  card.appendChild(actions);
  return card;
}
