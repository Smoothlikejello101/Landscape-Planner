// Plant this bed in the picker (Jason, Nov 2: the proposal "Plant this bed", answer B, the chip row): which bed it's
// For, at the picker's top in view while the list scrolls (beside its ✕ since Jason's notes of Nov 4), and the bed's box
// over the list: its conditions as chips, each with ×, and Edit. What a bed filters on: src/bed-plant.ts.

import { bedName, bedsToPlant, pickingBed, plantingFor, setPickingBed, setPlantingFor, type BedLayer, type BedPart } from '../bed-plant';
import { el, tapSaid } from '../dom';
import { I } from '../icons';
import { shapeDot } from '../plant-looks';
import { state } from '../state';
import { formatHours } from '../sun';
import { render } from './render';
import { toast } from './toast';
import type { Shape } from '../types';

/**
 * The For row: Anywhere, each bed by name, then Pick on the plan. Scrolls sideways with many beds. None in a plan with
 * no bed to choose (Jason, Nov 4, note 1: '"for: anywhere" probably doesn't need to be there if they don't have a bed';
 * it said "For: Anywhere · Draw a bed to plant for it"). `chosen`: a bed chosen in it (in place, the search keeping the
 * keyboard).
 */
export function forRow(chosen: (bed: Shape | null) => void): HTMLElement | null {
  const beds = bedsToPlant(state.shapes);
  const now = plantingFor();
  if (!beds.length) return null;
  const chips: HTMLButtonElement[] = [];
  const chip = (bed: Shape | null) => {
    const on = (bed?.id ?? null) === (now?.id ?? null);
    const b = el('button', { className: 'for-chip' + (on ? ' on' : ''), 'aria-pressed': String(on), 'data-testid': bed ? 'for-bed' : 'for-anywhere', 'data-bed': bed?.id ?? '' },
      bed ? el('span', { className: 'sw-dot', style: { background: shapeDot(bed) } }) : null, bed ? bedName(bed) : 'Anywhere');
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-pressed') === 'true') return;
      setPlantingFor(bed?.id ?? null);
      for (const c of chips) { const is = c === b; c.classList.toggle('on', is); c.setAttribute('aria-pressed', String(is)); }
      chosen(bed);
    });
    chips.push(b);
    return b;
  };
  const pick = el('button', { className: 'for-chip for-pick', 'data-testid': 'for-pick', title: tapSaid('Close the list, tap a bed on the plan, and come back') },
    el('span', { className: 'for-pick-icon', html: I.target }), 'Pick on the plan');
  pick.addEventListener('click', () => { startPickingBed(); render(); });
  return el('div', { className: 'for-row', role: 'group', 'aria-label': 'Plant for', 'data-testid': 'plant-for' },
    el('span', { className: 'for-label', 'aria-hidden': 'true' }, 'For'),
    el('div', { className: 'for-chips' }, chip(null), beds.map(chip), pick));
}

// ---------- Pick on the plan ----------
/** The picker closed for one tap on a bed (src/gestures.ts pickBedAt), and back after it. */
export function startPickingBed() { setPickingBed(true); state.panel = null; }
/** Back to the picker from picking a bed: For the bed tapped, or as it was (Cancel). */
export function stopPickingBed(bed?: Shape) {
  setPickingBed(false);
  if (bed) setPlantingFor(bed.id);
  state.panel = 'plants';
}
/** A tap on the plan while picking a bed: the smallest bed there, if any; anything else says so and waits. */
export function pickBedAt(at: { x: number; y: number }, bedAt: (p: { x: number; y: number }) => Shape | null) {
  if (!pickingBed()) return;
  const bed = bedAt(at);
  if (!bed) { toast(tapSaid('That isn’t a bed. Tap inside a bed, or Cancel.'), 3000); return; }
  stopPickingBed(bed);
}
/** The words on the strip while picking a bed. */
export const PICK_SAID = 'Tap the bed to plant for';

// ---------- The bed's box ----------
/** "3.5 to 7 h", "7 h". */
export function hoursSaid(a: number, b: number): string {
  return formatHours(a) === formatHours(b) ? formatHours(a) : `${formatHours(a).replace(/ h$/, '')} to ${formatHours(b)}`;
}
/** What the box says under its chips: where its sun comes from, what doesn't filter yet, and that nothing is ranked. */
export function boxNote(l: BedLayer): string {
  const parts: string[] = [];
  const s = l.sun;
  if (s) {
    const from = s.areas.length === 1 ? 'the sun area over it' : `the ${s.areas.length} sun areas over it`;
    parts.push(`Sun from ${from} (${hoursSaid(s.minH, s.maxH)})${s.covered < 1 ? '; part of the bed has none recorded' : ''}.`);
  } else if (l.rules.sun) parts.push('Sun as you said it: no sun area covers the bed.');
  if (l.rules.soil === 'loam' || l.rules.soil === 'sand') parts.push(`${l.rules.soil === 'loam' ? 'Loam' : 'Sandy'} soil doesn’t filter yet: the plant facts don’t have it.`);
  if (l.rules.drip && (l.rules.moisture === 'dry' || l.rules.moisture === 'average')) parts.push('Drip irrigated: any water need fits.');
  // (Answered Not sure, or loam: nothing filters, and it says so.)
  parts.push(l.chips.length ? 'Only plants whose facts fit are listed; nothing is ranked.' : 'Nothing set filters the list: every plant is listed.');
  return parts.join(' ');
}
/** Whether a bed has nothing answered and no sun worked out: the box asks for its conditions. */
const nothingSet = (l: BedLayer) => !l.sun && !l.rules.sun && !l.rules.soil && !l.rules.moisture && !l.bed.conditions?.sun;
/**
 * The bed's box: its conditions as chips, each with × (taken off for now, never changed on the bed; put back with
 * its +), Edit, and what it says of them. `toggled`: a part taken off or put back; `edit`: Edit.
 */
export function bedBox(l: BedLayer, toggled: (part: BedPart, off: boolean) => void, edit: () => void): HTMLElement {
  const title = l.bed.label.trim() ? `${l.name}’s conditions` : 'The bed’s conditions';
  const editBtn = el('button', { className: 'link-btn', 'data-testid': 'bed-edit' }, nothingSet(l) ? 'Set them' : 'Edit');
  editBtn.addEventListener('click', edit);
  const box = el('div', { className: 'bed-box', 'data-testid': 'bed-box' },
    el('div', { className: 'bed-box-head' }, el('span', { className: 'bed-box-title' }, title), editBtn));
  if (nothingSet(l)) {
    box.appendChild(el('div', { className: 'bed-box-note' }, 'None set yet. Its sun, soil and moisture list only the plants that fit; until then, every plant is listed.'));
    return box;
  }
  if (l.chips.length) {
    box.appendChild(el('div', { className: 'bed-box-chips' }, l.chips.map((c) => {
      const b = c.off
        ? el('button', { className: 'bed-chip off', 'data-testid': 'bed-cond-off', 'aria-label': `Put back: ${c.text}` }, el('span', { className: 'chip-x', html: I.plus }), c.text)
        : el('button', { className: 'bed-chip', 'data-testid': 'bed-cond', 'aria-label': `Take off for now: ${c.text}` }, c.text, el('span', { className: 'chip-x', html: I.x }));
      b.addEventListener('click', () => toggled(c.part, !c.off));
      return b;
    })));
  }
  box.appendChild(el('div', { className: 'bed-box-note', 'data-testid': 'bed-box-note' }, boxNote(l)));
  return box;
}
