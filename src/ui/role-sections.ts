import { plantsInBed, plantSummary } from '../beds';
import { el } from '../dom';
import { shapeArea, shapePerimeter } from '../geometry';
import { updateSelected, updateSelectedSilent } from '../mutations';
import { plantsById } from '../plants';
import { state } from '../state';
import { checkPlantSun, formatHours, formatTime, newSunInfo, sunHours, sunLevel } from '../sun';
import type { Shape, SunInfo } from '../types';
import { timeRange } from './time-range';

// Parts of the properties panel that depend on a shape's role.

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

/** "Area: 48 sq ft" for areas, "Length: 32 ft" for boundaries, '' for plants. */
export function measureText(s: Shape): string {
  if (s.type === 'line') return `Length: ${fmt(shapePerimeter(s))} ft`;
  if (s.role === 'plant') return '';
  if (s.role === 'boundary') return `Length around: ${fmt(shapePerimeter(s))} ft`;
  return `Area: ${fmt(shapeArea(s))} sq ft`;
}

export function bedSection(s: Shape): HTMLElement {
  const plants = plantsInBed(s, state.shapes);
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
      const more = el('button', { className: 'btn ghost', style: { marginTop: '6px', fontSize: '13px', padding: '6px' } }, '+ Another sunny period');
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
