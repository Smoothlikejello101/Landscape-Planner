import { plantsInBed, plantSummary } from '../beds';
import { el, ts } from '../dom';
import { shapeArea, shapePerimeter } from '../geometry';
import { updateSelected, updateSelectedSilent } from '../mutations';
import { plantsById } from '../plants';
import { state } from '../state';
import { checkPlantSun, formatHours, formatTime, newSunInfo, sunHours, sunLevel } from '../sun';
import type { Shape, SunInfo } from '../types';
import { BULB_PARTNER_MIN_HEIGHT, crowdingOf, crowdRelation } from '../crowding';
import { I } from '../icons';
import { crowdOptions } from '../crowd-here';
import { flagAgain, leaveClose } from './crowd-notice';
import { shownWith } from '../status';
import { sqFt } from '../util';
import { timeRange } from './time-range';
import { isLocked } from '../roles';
import { issuesKey, prepareUtilities, utilityIssues, utilityNote } from '../utilities';
import { UTILITY_COLORS, UTILITY_KINDS, isUtilityKind, utilityLook } from '../utility-kinds';

// Parts of the properties panel that depend on a shape's role.

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

/** "Area: 48 sq ft" for areas, "Length: 32 ft" for boundaries, '' for plants. */
export function measureText(s: Shape): string {
  if (s.type === 'line' && s.pathWidth) {
    const len = shapePerimeter(s);
    return `Length: ${fmt(len)} ft · about ${Math.round(len * s.pathWidth).toLocaleString()} sq ft`;
  }
  if (s.type === 'line') return `Length: ${fmt(shapePerimeter(s))} ft`;
  if (s.role === 'plant') return '';
  if (s.role === 'boundary') return `Length around: ${fmt(shapePerimeter(s))} ft`;
  return `Area: ${sqFt(shapeArea(s))} sq ft`;
}

export function bedSection(s: Shape): HTMLElement {
  const plants = plantsInBed(s, state.shapes).filter((p) => p.status !== 'gone');
  const cb = el('input', { type: 'checkbox' });
  cb.checked = s.carryPlants !== false;
  cb.addEventListener('change', () => updateSelected({ carryPlants: cb.checked }));
  const summary = plantSummary(plants);
  return el('div', { className: 'field' },
    el('label', {}, 'Plants in this bed'),
    el('div', { className: 'plant-list' },
      plants.length
        ? `${plants.length} plant${plants.length === 1 ? '' : 's'}: ` + summary.map((p) => p.count > 1 ? `${p.label} ×${p.count}` : p.label).join(', ')
        : 'None yet. A plant counts as in the bed when its center is inside it.'),
    el('label', { className: 'check-row', style: { marginTop: '8px' } }, cb, 'Plants inside move with the bed'));
}

export function plantSunBanner(s: Shape): HTMLElement | null {
  if (s.role !== 'plant' || !s.plantId) return null;
  const check = checkPlantSun(s, plantsById[s.plantId], state.shapes);
  if (!check) return null;
  if (check.ok) return el('div', { className: 'check-banner ok', 'data-testid': 'sun-check' }, '☀ ' + check.message);
  // A warning can be dismissed for this plant; it comes back if the plant moves or the sun changes.
  const dismissed = s.sunDismissed === check.message;
  const btn = el('button', { className: 'link-reset', 'data-testid': 'sun-dismiss' }, dismissed ? 'Show the warning again' : 'Dismiss for this plant');
  btn.addEventListener('click', () => {
    if (dismissed) updateSelected({ sunDismissed: undefined }); else updateSelected({ sunDismissed: check.message });
  });
  const note = dismissed ? ' (dismissed: no badge on the plan)' : !state.sunWarnings ? ' (badges are off in Layers)' : '';
  return el('div', { className: 'check-banner warn' + (dismissed ? ' muted' : ''), 'data-testid': 'sun-check' },
    el('div', {}, '⚠ ' + check.message + note), el('div', { style: { marginTop: '4px' } }, btn));
}

function summaryText(info: SunInfo): string {
  const level = sunLevel(info);
  const label = level === 'Full' ? 'full sun' : level === 'Part' ? 'part sun / part shade' : 'shade';
  return `☀ ${formatHours(sunHours(info))} of direct sun · ${label}`;
}

/** Observed sun on a shade area: times (two-handle sliders) or total hours. */
export function shadeSunSection(s: Shape): HTMLElement {
  const wrap = el('div', { className: 'field', 'data-testid': 'sun-section' }, el('label', {}, 'Sun on this area'));
  if (!s.sun) {
    const add = el('button', { className: 'btn ghost' }, 'Record sun for this area');
    add.addEventListener('click', () => updateSelected({ sun: newSunInfo() }));
    wrap.append(el('div', { className: 'hint' }, 'Note when direct sun reaches this spot. Plants placed here are then checked against it.'), add);
    return wrap;
  }
  const info = () => s.sun!;
  const summary = el('div', { className: 'sun-summary', 'data-testid': 'sun-summary' }, summaryText(info()));
  // Silent updates: the panel isn't rebuilt, so the slider keeps the finger.
  const setSilent = (patch: Partial<SunInfo>) => {
    updateSelectedSilent({ sun: { ...info(), ...patch } });
    summary.textContent = summaryText(info());
  };
  const setAndRender = (patch: Partial<SunInfo>) => updateSelected({ sun: { ...info(), ...patch } });

  const seg = el('div', { className: 'seg', role: 'group', 'aria-label': 'How to record sun' });
  for (const [mode, label] of [['times', 'When it gets sun'], ['hours', 'Just hours']] as const) {
    const b = el('button', { className: info().mode === mode ? 'sel' : '', 'aria-pressed': info().mode === mode ? 'true' : 'false' }, label);
    b.addEventListener('click', () => setAndRender({ mode }));
    seg.appendChild(b);
  }
  wrap.append(summary, el('div', { style: { margin: '8px 0' } }, seg));

  if (info().mode === 'times') {
    info().periods.forEach((period, i) => {
      const { node, readout } = timeRange(period, (v) => {
        const periods = info().periods.map((p, j) => (j === i ? v : p));
        setSilent({ periods });
      });
      const row = el('div', { className: 'sun-period', 'data-testid': 'sun-period' }, el('div', { style: { flex: '1' } }, readout, node));
      if (info().periods.length > 1) {
        const rm = el('button', { className: 'remove', 'aria-label': 'Remove this sunny period' }, '✕');
        rm.addEventListener('click', () => setAndRender({ periods: info().periods.filter((_, j) => j !== i) }));
        row.appendChild(rm);
      }
      wrap.appendChild(row);
    });
    if (info().periods.length < 4) {
      const more = el('button', { className: 'btn ghost', style: { marginTop: '6px', fontSize: ts(13), padding: '6px' } }, '+ Another sunny period');
      more.addEventListener('click', () => {
        const last = info().periods[info().periods.length - 1];
        const start = Math.min(19 * 60, last[1] + 120);
        setAndRender({ periods: [...info().periods, [start, Math.min(21 * 60, start + 120)]] });
      });
      wrap.appendChild(more);
    }
  } else {
    const r = el('input', { type: 'range', min: 0, max: 12, step: 0.5, value: info().hours, 'aria-label': 'Hours of direct sun' });
    const readout = el('div', { className: 'tr-readout' }, formatHours(info().hours));
    r.addEventListener('input', () => { setSilent({ hours: Number(r.value) }); readout.textContent = formatHours(Number(r.value)); });
    wrap.append(readout, r);
  }

  const dappled = el('input', { type: 'checkbox' });
  dappled.checked = info().dappled;
  dappled.addEventListener('change', () => setAndRender({ dappled: dappled.checked }));
  wrap.appendChild(el('label', { className: 'check-row', style: { marginTop: '10px' } }, dappled, 'Dappled / filtered light'));

  const date = el('input', { type: 'date', value: info().observedOn ?? '', 'aria-label': 'Observed on' });
  date.addEventListener('input', () => setSilent({ observedOn: date.value || undefined }));
  const note = el('input', { type: 'text', value: info().note ?? '', placeholder: 'e.g. after the oak leafed out' });
  note.addEventListener('input', () => setSilent({ note: note.value || undefined }));
  wrap.appendChild(el('div', { className: 'row-2', style: { marginTop: '10px' } },
    el('div', { className: 'field' }, el('label', {}, 'Observed on'), date),
    el('div', { className: 'field' }, el('label', {}, 'Note'), note)));
  if (info().mode === 'times') {
    wrap.appendChild(el('div', { className: 'hint' },
      `Afternoon sun (1–6 pm) is what most "part shade" plants can't take. Times are as you observed them; the app doesn't model the sun's path through the year.`));
  }
  return wrap;
}

/** Short shade description for lists: "3.5 h sun · seen Jun 14, 2026". */
export function sunListText(info: SunInfo): string {
  const seen = info.observedOn
    ? ' · seen ' + new Date(info.observedOn + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const when = info.mode === 'times' ? ' (' + info.periods.map(([a, b]) => `${formatTime(a)}–${formatTime(b)}`).join(', ') + ')' : '';
  return `${formatHours(sunHours(info))} sun${when}${seen}`;
}

/** Plants whose crowding note is open in their properties (it starts folded: Jason, 2026-10-27). */
const crowdNoteOpen = new Set<string>();
/**
 * A plant close to its neighbors or crowding them: one line ("Planted closer than usual to 2 neighbors · close to 1"),
 * red or amber, that opens to who, how far apart, the usual spacing and why; crowded first, then close (their typical
 * spreads touch). Those left close on purpose are said so, with Flag again.
 */
export function crowdingNote(s: Shape): HTMLElement | null {
  if (s.role !== 'plant' || s.type !== 'circle') return null;
  const all = crowdingOf(s, state.shapes.filter((x) => shownWith(x, state.viewFilter)), plantsById, { ...crowdOptions(), close: true, includeLeft: true });
  const left = all.filter((c) => c.left), crowds = all.filter((c) => !c.left);
  if (!all.length) return null;
  const f = (v: number) => (Math.round(v * 10) / 10).toString();
  const crowded = crowds.filter((c) => c.level === 'crowded'), close = crowds.filter((c) => c.level === 'close');
  const n = (k: number) => (k === 1 ? 'one neighbor' : `${k} neighbors`);
  // (Less than the full spacing where one grows partly under the other's crown.)
  const line = (c: (typeof all)[number]) => {
    const how = c.level === 'crowded' ? crowdRelation(s, c.other, plantsById) : 'even';
    const why = c.bulb ? ', a spring bulb right at the base of a deciduous plant' : c.shared < 0.75 ? ', as one grows partly under the other'
      : how === 'under' ? ', buried by it: try out toward its edge' : how === 'over' ? ', buried by this one' : '';
    return el('div', { style: { marginLeft: '12px' } }, '• ' + `${c.other.label || 'a plant'}: ${f(c.distance)} ft apart, about ${f(c.recommended)} ft is usual${why}`);
  };
  const box = el('div', { className: 'check-banner warn' + (crowded.length ? ' crowded' : ' close'), 'data-testid': 'crowding' });
  const flagAgainRow = () => {
    const again = el('button', { className: 'btn', 'data-testid': 'flag-again', style: { marginLeft: '8px' } }, 'Flag again');
    again.addEventListener('click', () => flagAgain(s.id));
    return el('div', { style: { marginTop: crowds.length ? '4px' : '0' } }, `Left close on purpose: ${left.map((c) => c.other.label || 'a plant').join(', ')}`, again);
  };
  // (Only pairs left close on purpose: one quiet line, folded to start, that opens to who, with Flag again: Jason,
  // 2026-10-27.)
  if (!crowds.length) {
    box.className = 'check-banner left-close';
    const open = crowdNoteOpen.has(s.id);
    const toggle = el('button', { className: 'crowd-line', 'aria-expanded': String(open), 'data-testid': 'left-close-line' },
      el('span', {}, `Left close to ${n(left.length)} on purpose`), el('span', { className: 'fold-chev', html: I.chevronDown }));
    const body = el('div', { 'data-testid': 'left-close-detail' }, flagAgainRow());
    body.hidden = !open;
    toggle.addEventListener('click', () => {
      body.hidden = !body.hidden;
      toggle.setAttribute('aria-expanded', String(!body.hidden));
      if (body.hidden) crowdNoteOpen.delete(s.id); else crowdNoteOpen.add(s.id);
    });
    box.append(toggle, body);
    return box;
  }
  // The line, a button that opens the rest.
  const head = crowded.length
    ? `⚠ Planted closer than usual to ${n(crowded.length)}` + (close.length ? ` · close to ${close.length}` : '')
    : `Close to ${n(close.length)}`;
  const open = crowdNoteOpen.has(s.id);
  const toggle = el('button', { className: 'crowd-line', 'aria-expanded': String(open), 'data-testid': 'crowding-line' }, el('span', {}, head), el('span', { className: 'fold-chev', html: I.chevronDown }));
  const body = el('div', { 'data-testid': 'crowding-detail' });
  body.hidden = !open;
  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
    toggle.setAttribute('aria-expanded', String(!body.hidden));
    if (body.hidden) crowdNoteOpen.delete(s.id); else crowdNoteOpen.add(s.id);
  });
  if (crowded.length) body.append(el('div', {}, `Planted closer than usual to ${n(crowded.length)}:`), ...crowded.slice(0, 3).map(line));
  if (close.length) body.append(el('div', { style: crowded.length ? { marginTop: '4px' } : {} }, `Close to ${n(close.length)}: they may quickly grow into one another.`), ...close.slice(0, 3).map(line));
  // Left close after the fact, as Leave it does as a plant is placed (Jason, 2026-10-27); Flag again takes it back.
  const leave = el('button', { className: 'btn', 'data-testid': 'leave-close', style: { marginTop: '6px' } }, crowds.length === 1 ? 'Leave this close' : 'Leave these close');
  leave.addEventListener('click', () => leaveClose(s.id, crowds.map((c) => c.other.id)));
  body.append(el('div', {}, leave));
  if (left.length) body.append(flagAgainRow());
  body.append(el('div', { className: 'hint', style: { marginTop: '4px' } }, 'Usual spacing is half of each plant\'s typical spread added together, less where one grows under a tree whose lower limbs can be taken up (a third of its height, unless the tree says otherwise). ' +
    `Spring bulbs under a deciduous plant ${BULB_PARTNER_MIN_HEIGHT} ft or taller don't count, except right at its base. A little closeness can be fine, if you're after a quick, full look.`));
  box.append(toggle, body);
  return box;
}

/** Plants whose utility warning is open in their properties (it starts folded, as the crowding note does). */
const utilityOpen = new Set<string>();
/**
 * A plant too near a utility for what it is (src/utilities.ts): one line, the first ("Grows to 60 ft, 12 ft from a
 * power line"), that opens to why and what to do; dismissable for this plant, coming back if it moves or changes.
 */
export function utilityBanner(s: Shape): HTMLElement | null {
  if (s.role !== 'plant' || s.type !== 'circle') return null;
  const issues = utilityIssues(s, prepareUtilities(state.shapes.filter((x) => x.role === 'utility' && shownWith(x, state.viewFilter))), plantsById);
  if (!issues.length) return null;
  const key = issuesKey(issues);
  const dismissed = s.utilityDismissed === key;
  const more = issues.length > 1 ? ` (+${issues.length - 1} more)` : '';
  const open = utilityOpen.has(s.id);
  const toggle = el('button', { className: 'site-line', 'aria-expanded': String(open), 'data-testid': 'utility-line' },
    el('span', {}, `⚠ ${issues[0].line}${more}${dismissed ? ' (dismissed: no badge on the plan)' : ''}`), el('span', { className: 'fold-chev', html: I.chevronDown }));
  const body = el('div', { 'data-testid': 'utility-detail' });
  body.hidden = !open;
  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
    toggle.setAttribute('aria-expanded', String(!body.hidden));
    if (body.hidden) utilityOpen.delete(s.id); else utilityOpen.add(s.id);
  });
  for (const i of issues) body.append(el('div', { style: { marginTop: '4px' } }, issues.length > 1 ? el('b', {}, i.line + ': ') : '', i.detail));
  const btn = el('button', { className: 'link-reset', 'data-testid': 'utility-dismiss', style: { marginTop: '4px' } }, dismissed ? 'Show the warning again' : 'Dismiss for this plant');
  btn.addEventListener('click', () => updateSelected({ utilityDismissed: dismissed ? '' : key }));
  body.append(el('div', {}, btn));
  return el('div', { className: 'check-banner warn' + (dismissed ? ' muted' : ''), 'data-testid': 'utility-check' }, toggle, body);
}

/** A utility's own properties: which it is (a line: overhead or buried), and what's checked near it. */
export function utilitySection(s: Shape): HTMLElement {
  const wrap = el('div', { className: 'field', 'data-testid': 'utility-section' });
  if (s.type === 'circle' || s.type === 'text') return wrap;
  const known = isUtilityKind(s.utility) ? s.utility : null;
  // (A line is overhead or buried; an area, a septic field. A kind a later version added is shown as it is, unchecked.)
  const choices = UTILITY_KINDS.filter((x) => x.lines === (s.type === 'line'));
  if (choices.length > 1 || !known) {
    const seg = el('div', { className: 'seg utility-seg', role: 'group', 'aria-label': 'Which it is' });
    for (const k of choices) {
      const b = el('button', { 'aria-pressed': String(known === k.key), 'data-utility': k.key }, k.label);
      b.disabled = isLocked(s);
      b.addEventListener('click', () => {
        if (k.key === known) return;
        // (Its look goes with it, if it still has the one it started with.)
        const was = known ? UTILITY_COLORS[known] : '#ea580c';
        const relook = s.color.toLowerCase() === was ? utilityLook(k.key) : {};
        updateSelected({ utility: k.key, ...relook });
      });
      seg.appendChild(b);
    }
    wrap.appendChild(seg);
  }
  wrap.appendChild(el('div', { className: 'hint' }, known ? utilityNote(known)
    : s.utility ? "A kind of utility this version doesn't know (from a later one): nothing near it is checked here."
      : 'Which is it? Until it says, nothing near it is checked.'));
  return wrap;
}
