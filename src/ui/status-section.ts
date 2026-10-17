import { el } from '../dom';
import { addPhase, setPhaseForIds, setStatusForIds, updateSelectedSilent } from '../mutations';
import { state } from '../state';
import { statusesFor, statusLabelFor } from '../status';
import type { Shape } from '../types';
import { render } from './render';

// Status and phase controls in the properties panel, for one shape or a
// multi-selection. Chips and the phase menu re-render; the date and the new
// phase name are typed without re-rendering (Android keyboard safety).

/** "Planned · Fall 2026", "Existing", "Not set"; "Mixed" across a selection. */
export function statusSummary(shapes: Shape[]): string {
  const statuses = new Set(shapes.map((s) => s.status ?? ''));
  const phases = new Set(shapes.map((s) => s.phase ?? ''));
  const status = statuses.size > 1 ? 'Mixed' : statusLabelFor(shapes[0]);
  const phase = phases.size > 1 ? 'mixed phases' : [...phases][0];
  return phase ? `${status} · ${phase}` : status;
}

export function statusSection(shapes: Shape[]): HTMLElement {
  const ids = shapes.map((s) => s.id);
  const statuses = new Set(shapes.map((s) => s.status ?? ''));
  const current = statuses.size === 1 ? [...statuses][0] : null;
  const wrap = el('div', { className: 'field', 'data-testid': 'status-section' });
  wrap.appendChild(el('label', {}, shapes.length > 1 ? 'Status (applies to all selected)' : 'Status'));
  const chips = el('div', { className: 'role-chips', role: 'radiogroup', 'aria-label': 'Status' });
  for (const [key, label] of [['', 'Not set'], ...statusesFor(shapes).map((s) => [s.key, s.label])] as [string, string][]) {
    const on = current === key;
    const b = el('button', { className: 'status-chip status-' + (key || 'none') + (on ? ' sel' : ''), role: 'radio', 'aria-checked': String(on) }, label);
    b.addEventListener('click', () => { setStatusForIds(ids, (key || undefined) as Shape['status']); render(); });
    chips.appendChild(b);
  }
  wrap.appendChild(chips);

  // When it went in the ground (one plant, planted).
  if (shapes.length === 1 && shapes[0].status === 'planted' && shapes[0].role === 'plant') {
    const s = shapes[0];
    const date = el('input', { type: 'date', value: s.plantedOn ?? '', 'data-testid': 'planted-on' }) as HTMLInputElement;
    date.addEventListener('change', () => updateSelectedSilent({ plantedOn: date.value || undefined }));
    wrap.appendChild(el('div', { className: 'field', style: { marginTop: '8px' } }, el('label', {}, 'Planted on'), date));
  }

  // Phase
  const phases = new Set(shapes.map((s) => s.phase ?? ''));
  const phase = phases.size === 1 ? [...phases][0] : null;
  const sel = el('select', { 'data-testid': 'phase-select' }) as HTMLSelectElement;
  if (phase === null) sel.appendChild(el('option', { value: '__mixed', selected: true }, 'Mixed phases'));
  sel.appendChild(el('option', { value: '' }, 'No phase'));
  for (const p of state.phases) sel.appendChild(el('option', { value: p }, p));
  sel.appendChild(el('option', { value: '__new' }, '+ New phase…'));
  sel.value = phase ?? '__mixed';
  const newRow = el('div', { className: 'size-row', style: { display: 'none', marginTop: '6px' } });
  const name = el('input', { type: 'text', placeholder: 'e.g. Fall 2026', maxLength: 40, 'data-testid': 'new-phase' }) as HTMLInputElement;
  const add = el('button', { className: 'btn secondary', style: { flex: '0 0 auto', width: 'auto', padding: '8px 14px' } }, 'Add');
  const commit = () => {
    const n = addPhase(name.value);
    if (!n) { name.focus(); return; }
    setPhaseForIds(ids, n);
    render();
  };
  add.addEventListener('click', commit);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
  newRow.append(name, add);
  sel.addEventListener('change', () => {
    if (sel.value === '__new') { newRow.style.display = 'flex'; name.focus(); return; }
    if (sel.value === '__mixed') return;
    setPhaseForIds(ids, sel.value);
    render();
  });
  wrap.appendChild(el('div', { className: 'field', style: { marginTop: '8px' } },
    el('label', {}, 'Phase'), sel, newRow,
    el('div', { className: 'hint' }, 'Group work into stages, like "Fall 2026", to view or print one at a time.')));
  return wrap;
}
