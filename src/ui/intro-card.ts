// The guided introduction's card (src/intro.ts has the steps and their rules): one card at the foot of the plan (in
// the corner with a keyboard and mouse; at the top while a sheet is open), a line or two of words, the step's own
// button, Back, Skip and Exit, and a pulse on the thing to tap. Each step ends when it's done: the card checks after
// every redraw (render's last call), and moves on by itself.

import { recordError } from '../error-log';
import { state } from '../state';
import { el, hasKeyboard } from '../dom';
import { I } from '../icons';
import { startKind } from '../draw';
import { shapeCenter } from '../geometry';
import { hintShown } from '../hints';
import { PLANT_FILTER_DEFAULTS, plantFilter, plantMatches, plantsById, plantTakesSun } from '../plants';
import { hardyEnough, zoneFit } from '../climate';
import { nativeHere, regulatedHere } from '../wild';
import { sunAt, sunLevel } from '../sun';
import { applyYard, noteAsked, saveHardy, saveYard, toggleYard, yardFilter, yardOf, type Yard } from '../yard';
import {
  NEW_RECORD, STEP_NUMBER, STEP_TITLE, UNSCALED, applies, nextStep, parseIntroRecord, plantCardText, prevStep, resumeStep, shrubToFind,
  stepDone, type IntroRecord, type Snapshot, type StepId,
} from '../intro';
import { openLocation } from './location-panel';
import { updateBgImage } from '../background';
import { toast } from './toast';
import { flushHistoryDebounce, pushHistory } from '../history';
import { save as savePlan } from '../storage';
import { fullRingRadius } from '../my-plants';
import type { Shape } from '../types';
import type { SunLevel } from '../sun';
import { render } from './render';

const KEY = 'lp-intro';
function load(): IntroRecord {
  try { return parseIntroRecord(localStorage.getItem(KEY)); } catch { return { ...NEW_RECORD }; }
}
let rec: IntroRecord = load();
function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* no storage: it lasts this visit */ }
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
  };
}

/** Whether the empty plan offers it ("New here? Show me around"): not once it's been started, finished or declined. */
export const introOffered = (): boolean => rec.status === 'never';
export const introActive = (): boolean => rec.status === 'active';
/** "I'll explore": not offered again (it stays in ⋮). */
export function declineIntro(): void { rec.status = 'declined'; save(); }

/** Begin at the first step (or `at`), fresh: what's done on the plan before it counts from here on. */
function begin(at: StepId | null): void {
  const s = snapshot();
  rec = { ...rec, status: 'active', done: at ? rec.done : [], skipped: at ? rec.skipped : [], base: s, project: state.currentProjectId };
  rec.step = at ?? nextStep(null, rec, s);
  choosing = false;
  save();
}
/** Whether the card is asking "pick up or start over" (⋮ "Show me around" after an Exit). */
let choosing = false;
/**
 * "Show me around" (⋮, or the empty plan's card). Left part way: asks whether to pick up where they left or start
 * over. Otherwise it starts from step 1.
 */
export function showMeAround(): void {
  // (Under way already, or left part way: pick up there, or start over.)
  // (Kept as left until they pick: a reload meanwhile doesn't count what was done since against the old plan.)
  // (Not where picking up is starting over: "Pick up at step 1" beside "Start over" read as the same thing. Round 3, Ruth.)
  const at = rec.status === 'exited' || rec.status === 'active' ? resumeStep(rec, snapshot()) : null;
  if (at && at !== 'zip') { choosing = true; rec.status = 'exited'; save(); return; }
  begin(null);
}
function exit(): void { if (rec.status === 'active') rec.status = 'exited'; choosing = false; save(); }
function finish(): void {
  rec.status = 'finished'; rec.step = null; choosing = false; save();
  toast(`That's the tour. Add more plants, or open Add for paths, lawn, fences and the rest. "Show me around" is in ⋮.`, 9000);
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
/** The house the bed step offers to lock, and the plant the ring step talks about: the newest of each. */
const newestHouse = () => [...state.shapes].reverse().find((s) => s.role === 'building') ?? null;
const newestPlant = () => [...state.shapes].reverse().find((s) => s.type === 'circle' && s.role === 'plant') ?? null;
/** The bed step's button: lock the house, and say how it unlocks. */
function lockHouse(house: Shape): HTMLElement {
  const b = el('button', { className: 'intro-chip', 'data-testid': 'intro-lock-house', html: `${I.lock}<span>Lock the house</span>` });
  b.addEventListener('click', () => {
    flushHistoryDebounce();
    house.locked = true;
    pushHistory(); savePlan();
    toast('Locked: it stays put. To move it again, open it and tap Locked at the top.', 6000);
    render();
  });
  return el('div', { className: 'intro-chips' }, b);
}
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
    case 'bed': {
      // (Locking taught here, on the house just drawn (Jason, Oct 29): locked, it stays put, and a press on it goes to
      // what's drawn on it.)
      const house = newestHouse();
      const lock = house && !house.locked;
      return {
        text: `${lock ? 'Lock your house, so it stays put while you draw around it. ' : ''}Now a bed, where you'd like plants. ${Tap()} around its edge.${hasKeyboard() ? ' (B starts one.)' : ''}`,
        action: { label: 'Draw a bed', run: () => startKind('bed') },
        ...(lock ? { extra: lockHouse(house) } : {}),
      };
    }
    case 'fade': return {
      text: 'Photo making it busy? Fade it, or hide it. Background image in ⋮ brings it back any time.',
      short: 'Slide Opacity to suit, or Hide image. Then close this with its ×.',
      // (It fades it, as it says, then opens the panel to fine-tune it: round 3, Dana tapped it and saw nothing change.)
      action: { label: 'Fade it', run: () => { if (state.bgImage && state.bgImage.opacity > FADED) updateBgImage({ opacity: FADED }); state.panel = 'bg'; } },
      done: 'Done',
    };
    case 'sun': return {
      text: 'Where does it get shade? Draw that part, then show when direct sun reaches it.',
      short: state.panel === 'add' ? `${Tap()} Sun exposure, then draw the shady part.` : `Drag across the hours it gets sun, then close this with its ×.`,
      action: { label: 'Draw the shade', run: () => startKind('sun') },
    };
    case 'who': return { text: "Kids, dogs, cats, horses? We'll hide plants that are a problem for them. Change it any time in Filters.", extra: whoChips(), done: 'Next' };
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
      // (Not every plant has a ring (Jason, Oct 29): one whose sources give one size, or a plan showing full sizes.)
      const placed = newestPlant();
      const ring = !!placed && fullRingRadius(placed) != null;
      return {
        // (No plant placed, the step before skipped: said of plants in general, not of an "it" that isn't there.
        // Round 3, Diego.)
        text: !placed
          ? "A plant's circle is its typical size, with a dashed ring for how big it gets full-grown (one whose sources give one size has just its circle). Give plants room: plant two closer than usual and the app tells you."
          : ring
          ? 'The circle is its typical size. The dashed ring is how big it gets full-grown. Give it room: plant two closer than usual and the app tells you.'
          : 'Its circle is how big it gets full-grown. (A plant whose size has a range shows its typical size, with a dashed ring for full-grown.) Give it room: when circles overlap, the app tells you.',
        done: 'Got it',
      };
    }
  }
}
/**
 * Step 6's choices: each a toggle that sets the picker's filter for it at once and keeps it with the plan
 * (src/yard.ts); read from the filters each time, so a change made in Filters meanwhile shows.
 */
function whoChips(): HTMLElement {
  const row = el('div', { className: 'intro-chips', role: 'group', 'aria-label': "Who's in your yard" });
  const chips: [keyof Yard, string][] = [['kids', 'Kids'], ['dogs', 'Dogs'], ['cats', 'Cats'], ['horses', 'Horses']];
  const isOn = (k: keyof Yard) => { const y = yardOf(plantFilter); return k === 'dogs' ? y.dogs !== '' : !!y[k]; };
  for (const [k, label] of chips) {
    const b = el('button', { className: 'intro-chip' + (isOn(k) ? ' on' : ''), 'aria-pressed': String(isOn(k)), 'data-testid': `intro-${k}` }, label);
    b.addEventListener('click', () => {
      // (Dogs back on: as it was set before, "only plants rated safe" kept if that's what it was. The picker's "Anyone
      // you need to protect?" does the same: src/yard.ts toggleYard.)
      const y = toggleYard(yardOf(plantFilter), k);
      applyYard(plantFilter, y);
      saveYard(y, k);
      b.classList.toggle('on', isOn(k)); b.setAttribute('aria-pressed', String(isOn(k)));
      note.hidden = !isOn('dogs');
    });
    row.appendChild(b);
  }
  // (Dogs: no dog warnings; a plant not yet rated still shows, which isn't the same as safe. Decided Oct 28.)
  const note = el('div', { className: 'intro-note', 'data-testid': 'intro-dogs-note' }, "Dogs: plants with a warning for dogs are hidden; plants not yet rated still show.");
  note.hidden = !isOn('dogs');
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
    case 'bed': return !p && !state.draw ? '.tool-btn.bed' : null;
    case 'fade': return p === 'bg' ? '[data-testid=bg-opacity]' : null;
    case 'sun': return p === 'add' ? '.kind-chip[data-kind=sun]' : p === 'props' ? '[data-testid=sun-empty]' : null;
    case 'plant': return p === 'plants' ? '[data-testid=plant-search]' : null;
    default: return null;
  }
}

/**
 * After every redraw: move on if the step's task is done, then draw the card (or the "pick up or start over" card),
 * and pulse what to tap.
 */
export function introAfterRender(root: HTMLElement): void {
  document.documentElement.classList.remove('intro-top');
  // (Never in the way of the plan: anything amiss here leaves the introduction "left part way", to pick up from ⋮.)
  try { drawIntro(root); } catch (e) { console.error('guided introduction', e); recordError(e, 'guided introduction'); choosing = false; exit(); }
}
function drawIntro(root: HTMLElement): void {
  if (rec.status !== 'active' && !choosing) return;
  if (state.menu) return; // (⋮ open: the card would sit over its last rows)
  if (!choosing) {
    // (Another plan opened part way: the step counts from what that one has, not from the other's.)
    if (rec.project !== state.currentProjectId) { rec.project = state.currentProjectId; rec.base = snapshot(); save(); }
    // (A photo's own step with the photo gone: on to the next, not counted as done.)
    if (rec.step && !applies(rec.step, snapshot(), rec.done)) { rec.step = nextStep(rec.step, rec, snapshot()); rec.base = snapshot(); if (!rec.step) { finish(); return; } save(); }
    // (The ZIP looked up: its zone and frost dates stay to be read; the next step waits for the panel to close (testers,
    // Oct 30: step 2 came up over it, asking for a photo with no way to give one).)
    const reading = rec.step === 'zip' && state.panel === 'location';
    if (rec.step && rec.base && !reading && stepDone(rec.step, rec.base, snapshot())) advance('done');
    if (rec.status !== 'active' || !rec.step) return;
  }
  const card = choosing ? resumeCard() : stepCard();
  root.appendChild(card);
  placeCard(card);
  const step = rec.step;
  const sel = step && !choosing ? pulseTarget(step) : null;
  const target = sel ? root.querySelector<HTMLElement>(sel) : null;
  target?.classList.add('intro-pulse');
  // (The ZIP typed: the pulse moves on to Look up there and then, without a redraw, which typing never makes.)
  if (target?.dataset.testid === 'zip') target.addEventListener('input', () => {
    target.classList.toggle('intro-pulse', !zipTyped());
    root.querySelector('[data-testid=zip-lookup]')?.classList.toggle('intro-pulse', zipTyped());
  });
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
function cardShell(compact: boolean): HTMLElement {
  const where = state.panel ? ' at-top' : hasKeyboard() ? ' corner' : '';
  return el('section', { className: 'intro-card' + where + (compact || state.panel ? ' compact' : ''), 'data-testid': 'intro-card', 'aria-label': 'Guided introduction' });
}
function exitButton(): HTMLElement {
  const x = el('button', { className: 'intro-exit', html: I.x, 'aria-label': 'Exit the introduction', title: 'Exit (your progress is kept)', 'data-testid': 'intro-exit' });
  x.addEventListener('click', () => { exit(); render(); });
  return x;
}

function stepCard(): HTMLElement {
  const step = rec.step!;
  const s = snapshot();
  const card = cardShell(s.busy || s.bgEditMode);
  const head = el('div', { className: 'intro-head' },
    el('span', { className: 'intro-num', 'data-testid': 'intro-step' }, `Step ${STEP_NUMBER[step]} of 8`),
    el('span', { className: 'intro-title' }, STEP_TITLE[step]), exitButton());
  card.appendChild(head);
  // While drawing, placing or setting the scale, the plan's own banner says what to tap: the card keeps out of the way.
  if (s.busy) return card;
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
  card.appendChild(el('div', { className: 'intro-head' }, el('span', { className: 'intro-title' }, 'Show me around'), exitButton()));
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
