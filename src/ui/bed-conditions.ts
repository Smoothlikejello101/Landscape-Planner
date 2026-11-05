// A bed's conditions (Plant this bed: Jason, Nov 2): a Conditions section in the bed's panel, and the same as a sheet
// of its own from the picker's bed box (Edit). Its sun is worked out from the sun areas over it wherever any are, never
// asked or stored; asked only where none touches it. Soil (Clay, Loam, Sandy, Not sure: answer 3) and moisture (Dry,
// Average, Wet, Not sure), with drip irrigated, are asked. "Not sure" filters nothing, and is kept as answered; neither
// is ever guessed from the ZIP. Set through setBedConditions (src/mutations.ts), one undo step each. Chips, buttons and
// a box only: each answer redraws this part in place, never the whole page (CLAUDE.md, keyboard safety).

import { bedChips, bedName, bedRules, plantingFor, sunOverBed, type BedSun } from '../bed-plant';
import { el, sheetCloseButton } from '../dom';
import { I } from '../icons';
import { setBedConditions } from '../mutations';
import { MONTH_NAMES, sunRangeSaid } from '../plants';
import { state } from '../state';
import type { SunLevel } from '../sun';
import type { BedAnswers, Shape, SunAnswer } from '../types';
import { hoursSaid } from './plant-for';
import { render } from './render';
import { startKind } from '../draw';

const RANK: Record<SunLevel, number> = { Full: 0, Part: 1, Shade: 2 };
const SUN_CHOICES: [SunAnswer, string][] = [['Full', 'Full sun'], ['Part', 'Part shade'], ['Shade', 'Shade']];
const SOIL_CHOICES: [NonNullable<BedAnswers['soil']>, string][] = [['clay', 'Clay'], ['loam', 'Loam'], ['sand', 'Sandy'], ['unsure', 'Not sure']];
const MOISTURE_CHOICES: [NonNullable<BedAnswers['moisture']>, string][] = [['dry', 'Dry'], ['average', 'Average'], ['wet', 'Wet'], ['unsure', 'Not sure']];
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/**
 * A bed's answers as they are, to give back whole with one changed (setBedConditions takes the whole set). A word a
 * later version stored is given back as it is, never dropped: changing the moisture here keeps that version's soil.
 */
function answersOf(bed: Shape): BedAnswers {
  const c = bed.conditions ?? {};
  const out: Record<string, unknown> = {};
  if (c.sun !== undefined) out.sun = c.sun;
  if (c.soil !== undefined) out.soil = c.soil;
  if (c.moisture !== undefined) out.moisture = c.moisture;
  if (c.drip === true) out.drip = true;
  return out as BedAnswers;
}
/** "3.5–7 h sun · Clay · Average · Drip": the section's summary. "Not set" for none. */
export function conditionsSummary(bed: Shape): string {
  const sun = sunOverBed(bed, state.shapes), c = bed.conditions ?? {};
  const r = bedRules(bed, sun);
  const parts: string[] = [];
  if (sun) parts.push(`${hoursSaid(sun.minH, sun.maxH)} sun`);
  else if (r.sun) parts.push(cap(sunRangeSaid(`${r.sun[0]}-${r.sun[1]}`)));
  else if (c.sun === 'unsure') parts.push('Sun not sure');
  if (r.soil) parts.push(r.soil === 'unsure' ? 'Soil not sure' : SOIL_CHOICES.find(([v]) => v === r.soil)![1]);
  if (r.moisture) parts.push(r.moisture === 'unsure' ? 'Moisture not sure' : MOISTURE_CHOICES.find(([v]) => v === r.moisture)![1]);
  if (r.drip) parts.push('Drip');
  return parts.length ? parts.join(' · ') : 'Not set';
}

/** A row of choices, one pressed: Clay · Loam · Sandy · Not sure. */
function choices<T extends string>(name: string, key: string, opts: [T, string][], now: T | undefined, pick: (v: T) => void): HTMLElement {
  return el('div', { className: 'cond-seg', role: 'group', 'aria-label': name },
    opts.map(([v, text]) => {
      const on = now === v;
      const b = el('button', { className: on ? 'on' : '', 'aria-pressed': String(on), 'data-testid': `cond-${key}-${v}` }, text);
      b.addEventListener('click', () => { if (!on) pick(v); });
      return b;
    }));
}
/** The sun across the bed, read from the sun areas over it: hours, levels, a bar, where it comes from, what's bare. */
function sunWorkedOut(s: BedSun): HTMLElement {
  const levels = s.most === s.least ? `${cap(sunRangeSaid(`${s.most}-${s.least}`))} across the bed` : `${cap(sunRangeSaid(`${s.most}-${s.least}`))}: the shade varies across the bed`;
  const pct = (h: number) => Math.max(0, Math.min(100, (h / 12) * 100));
  const bar = el('div', { className: 'sun-bar', 'aria-hidden': 'true' },
    el('div', { className: 'sun-bar-on', style: { left: `${pct(s.minH)}%`, width: `${Math.max(3, pct(s.maxH) - pct(s.minH))}%` } }));
  const marks = el('div', { className: 'sun-bar-marks', 'aria-hidden': 'true' }, ['0', '3 h', '6 h', '12 h'].map((t) => el('span', {}, t)));
  const seen = (iso?: string) => { const m = /^\d{4}-(\d\d)-(\d\d)$/.exec(iso ?? ''); return m ? ` (seen ${MONTH_NAMES[Number(m[1])]} ${Number(m[2])})` : ''; };
  const named = s.areas.map((a) => `${a.area.label.trim() || 'a sun area'}, ${hoursSaid(a.hours, a.hours)}${seen(a.area.sun?.observedOn)}`);
  const from = s.areas.length === 1 ? `From the sun area over it: ${named[0]}.` : `From the ${s.areas.length} sun areas over it: ${named.join('; ')}.`;
  const where = s.bare ? `, at its ${s.bare === 'top' || s.bare === 'bottom' ? s.bare : `${s.bare} end`} on the plan` : '';
  const bare = s.covered >= 1 ? ' All of the bed is covered.'
    : ` No sun is recorded over part of it (about ${Math.max(1, Math.round((1 - s.covered) * 100))}%${where}): it goes by the rest. A sun area drawn there counts it too.`;
  return el('div', { className: 'cond-sun', 'data-testid': 'cond-sun' },
    el('div', { className: 'cond-sun-hours' }, `${hoursSaid(s.minH, s.maxH)} of direct sun`),
    el('div', {}, levels), bar, marks,
    el('div', { className: 'hint', 'data-testid': 'cond-sun-from' }, from + bare));
}
/**
 * A bed's conditions, to answer: drawn again in place as each is answered (`changed` follows, for a summary to say so).
 * Returns the part to put where it goes.
 */
export function conditionsBody(bedId: string, changed?: () => void): HTMLElement {
  const wrap = el('div', { className: 'bed-conditions', 'data-testid': 'bed-conditions' });
  const draw = () => {
    const bed = state.shapes.find((s) => s.id === bedId);
    if (!bed || bed.role !== 'bed') { wrap.replaceChildren(el('div', { className: 'hint' }, 'This isn’t a bed now.')); return; }
    const focused = wrap.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.testid : undefined;
    wrap.replaceChildren(...parts(bed));
    // (The answer just given keeps the focus, for a keyboard: its button is a new one.)
    if (focused) wrap.querySelector<HTMLElement>(`[data-testid="${focused}"]`)?.focus();
  };
  const set = (bed: Shape, a: Partial<BedAnswers>) => {
    setBedConditions(bed.id, { ...answersOf(bed), ...a });
    draw();
    changed?.();
  };
  function parts(bed: Shape): Node[] {
    const out: Node[] = [];
    const c = bed.conditions ?? {};
    // ---- Sun: worked out where sun areas cover it; asked where none touches it ----
    const sun = sunOverBed(bed, state.shapes);
    out.push(el('div', { className: 'cond-label' }, 'Sun'));
    if (sun) out.push(sunWorkedOut(sun));
    else {
      const ans = c.sun && typeof c.sun === 'object' && c.sun.most in RANK && c.sun.least in RANK ? c.sun as { most: SunAnswer; least: SunAnswer } : null;
      const most = (v: SunAnswer) => set(bed, { sun: { most: v, least: ans && RANK[ans.least] >= RANK[v] ? ans.least : v } });
      const least = (v: SunAnswer) => set(bed, { sun: { most: ans && RANK[ans.most] <= RANK[v] ? ans.most : v, least: v } });
      const unsure = el('button', { className: 'cond-unsure' + (c.sun === 'unsure' ? ' on' : ''), 'aria-pressed': String(c.sun === 'unsure'), 'data-testid': 'cond-sun-unsure' }, 'Not sure');
      unsure.addEventListener('click', () => { if (c.sun !== 'unsure') set(bed, { sun: 'unsure' }); });
      out.push(el('div', { className: 'hint', 'data-testid': 'cond-sun-asked' }, 'No sun area covers this bed, so say what it gets: full sun is 6 h or more of direct sun, part shade 3 to 6 h, shade less than 3. A sun area drawn over it (Add → Sun exposure) works it out instead.'),
        el('div', { className: 'cond-sub' }, 'Sunniest part'), choices('Sunniest part', 'sun-most', SUN_CHOICES, ans?.most, most),
        el('div', { className: 'cond-sub' }, 'Shadiest part'), choices('Shadiest part', 'sun-least', SUN_CHOICES, ans?.least, least),
        unsure);
    }
    // ---- Soil ----
    const soil = (['clay', 'loam', 'sand', 'unsure'] as const).find((v) => v === c.soil);
    out.push(el('div', { className: 'cond-label' }, 'Soil'), choices('Soil', 'soil', SOIL_CHOICES, soil, (v) => set(bed, { soil: v })),
      el('div', { className: 'hint' }, 'Clay lists plants rated Clay OK, then those no source rates for clay, below them. Loam and sandy don’t filter yet: the plant facts don’t have them.'));
    // ---- Moisture, and drip ----
    const moisture = (['dry', 'average', 'wet', 'unsure'] as const).find((v) => v === c.moisture);
    const drip = c.drip === true;
    const says = moisture === 'dry' ? (drip ? 'Dry, but drip irrigated: any water need fits.' : 'Dry lists drought-tolerant plants.')
      : moisture === 'average' ? (drip ? 'Average and drip irrigated: any water need fits.' : 'Average hides plants with high water needs, and those that need wet soil or standing water.')
      : moisture === 'wet' ? 'Wet lists plants that take wet soil, drip irrigated or not.'
      : 'Not sure filters nothing.';
    const dripBox = el('input', { type: 'checkbox', 'data-testid': 'cond-drip' });
    dripBox.checked = drip;
    dripBox.addEventListener('change', () => set(bed, { drip: dripBox.checked }));
    out.push(el('div', { className: 'cond-label' }, 'Moisture'), choices('Moisture', 'moisture', MOISTURE_CHOICES, moisture, (v) => set(bed, { moisture: v })),
      el('div', { className: 'hint', 'data-testid': 'cond-moisture-says' }, says),
      el('label', { className: 'check-row cond-drip' }, dripBox, 'Drip irrigated'));
    // ---- What planting it lists ----
    const chips = bedChips(bedRules(bed, sun)).map((x) => x.text);
    const unsure = [c.sun === 'unsure' && !sun, c.soil === 'unsure', c.moisture === 'unsure'].some(Boolean);
    out.push(el('div', { className: 'cond-sum', 'data-testid': 'conditions-sum' }, chips.length
      ? ['When you plant this bed, the picker lists only plants that fit: ', el('b', {}, chips.join(' · ')), '.', unsure ? ' Not sure leaves one out.' : '', ' Nothing is ranked.']
      : 'Nothing here filters the list yet: planting this bed, every plant is listed.'));
    return out;
  }
  draw();
  return wrap;
}

/** The bed's panel's Conditions section's content: the questions, then Plant this bed. */
export function conditionsSection(bed: Shape, summary: Text): Node[] {
  const plant = el('button', { className: 'btn secondary cond-plant', 'data-testid': 'conditions-plant', html: I.leaf + '<span>Plant this bed</span>' });
  plant.addEventListener('click', () => { state.panel = null; startKind('plant'); render(); }); // (For the bed selected: src/draw.ts)
  return [conditionsBody(bed.id, () => { const now = state.shapes.find((s) => s.id === bed.id); if (now) summary.textContent = conditionsSummary(now); }), plant];
}

/** The picker's bed box's Edit: the bed's conditions as a sheet of its own, back to the picker For it. */
export function renderBedConditionsPanel(): HTMLElement {
  const bed = plantingFor();
  const back = () => { state.panel = 'plants'; render(); };
  const header = el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, bed ? `${bedName(bed)}: conditions` : 'Conditions'), sheetCloseButton(back, 'plants'));
  const body = el('div', { className: 'sheet-body' }, bed ? conditionsBody(bed.id) : el('div', { className: 'hint' }, 'That bed isn’t on the plan now.'));
  const go = el('button', { className: 'btn primary', 'data-testid': 'conditions-back', html: I.leaf + '<span>Plant this bed</span>' });
  go.addEventListener('click', back);
  const sheet = el('div', { className: 'sheet', role: 'dialog', 'aria-label': 'The bed’s conditions', 'data-testid': 'conditions-sheet' }, header, body, el('div', { className: 'sheet-foot' }, go));
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) back(); });
  return overlay;
}
