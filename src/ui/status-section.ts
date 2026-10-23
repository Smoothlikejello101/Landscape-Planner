import { el } from '../dom';
import { addPhase, setPhaseForIds, setStatusForIds, updateSelectedSilent } from '../mutations';
import { state } from '../state';
import { flaggedFor, statusesFor, statusLabelFor } from '../status';
import type { Shape, Status } from '../types';
import { typeName } from '../util';
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

/** A status tapped for several shapes, some of them flagged: waiting on whether to change those too. */
let asking: { ids: string; key: string } | null = null;

/** "Rose Camelia, Coneflower ×2 and 3 more": the shapes' names for a short note. */
export function nameList(shapes: Pick<Shape, 'label' | 'type'>[], max = 4): string {
  const counts = new Map<string, number>();
  for (const s of shapes) { const n = s.label.trim() || 'unnamed ' + typeName(s.type); counts.set(n, (counts.get(n) ?? 0) + 1); }
  const names = [...counts].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n));
  if (names.length <= max) return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : names[0];
  return names.slice(0, max).join(', ') + ` and ${names.length - max} more`;
}

export function statusSection(shapes: Shape[]): HTMLElement {
  const ids = shapes.map((s) => s.id);
  const statuses = new Set(shapes.map((s) => s.status ?? ''));
  const current = statuses.size === 1 ? [...statuses][0] : null;
  const wrap = el('div', { className: 'field', 'data-testid': 'status-section' });
  wrap.appendChild(el('label', {}, shapes.length > 1 ? 'Status (applies to all selected)' : 'Status'));
  const chips = el('div', { className: 'role-chips', role: 'radiogroup', 'aria-label': 'Status' });
  const options = [['', 'Not set'], ...statusesFor(shapes).map((s) => [s.key, s.label])] as [string, string][];
  const selection = ids.join(',');
  for (const [key, label] of options) {
    const on = current === key;
    const b = el('button', { className: 'status-chip status-' + (key || 'none') + (on ? ' sel' : ''), role: 'radio', 'aria-checked': String(on) }, label);
    b.addEventListener('click', () => {
      // Several shapes, some marked To move, To remove or Gone: ask before overwriting those (one shape: it's the one tapped).
      if (shapes.length > 1 && flaggedFor(shapes, (key || undefined) as Status | undefined).length) asking = { ids: selection, key };
      else { asking = null; setStatusForIds(ids, (key || undefined) as Status | undefined); }
      render();
    });
    chips.appendChild(b);
  }
  wrap.appendChild(chips);
  // (Still asked while these stay selected and some are still flagged: an undo may have changed them.)
  if (asking && asking.ids === selection && flaggedFor(shapes, (asking.key || undefined) as Status | undefined).length) {
    wrap.appendChild(flagQuestion(shapes, asking.key, options.find(([k]) => k === asking!.key)?.[1] ?? ''));
  } else asking = null;

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

/**
 * "1 of these is marked To remove: Rose Camelia. Set it to Planted too?" Leaving them sets the rest; changing them
 * sets all; Cancel sets nothing.
 */
function flagQuestion(shapes: Shape[], key: string, label: string): HTMLElement {
  const status = (key || undefined) as Status | undefined;
  const flagged = flaggedFor(shapes, status);
  const n = flagged.length, one = n === 1;
  const marks = [...new Set(flagged.map((s) => statusLabelFor(s)))];
  const what = marks.length > 1 ? marks.slice(0, -1).join(', ') + ' or ' + marks.at(-1) : marks[0];
  const box = el('div', { className: 'banner flag-question', role: 'alert', 'data-testid': 'flag-question' },
    el('div', {}, `${one ? '1 of these is' : `${n} of these are`} marked ${what}: ${nameList(flagged)}.`),
    el('div', { style: { marginTop: '4px', fontWeight: '600' } }, `Set ${one ? 'it' : 'them'} to ${key ? label : 'Not set'} too?`));
  const done = (which: string[]) => { asking = null; if (which.length) setStatusForIds(which, status); render(); };
  const skip = new Set(flagged.map((s) => s.id));
  const leave = el('button', { className: 'btn secondary', 'data-testid': 'flag-leave' }, `Leave ${one ? 'it' : 'them'} as ${one ? 'it is' : 'they are'}`);
  leave.addEventListener('click', () => done(shapes.map((s) => s.id).filter((id) => !skip.has(id))));
  const change = el('button', { className: 'btn ghost', 'data-testid': 'flag-change' }, `Change ${one ? 'it' : 'them'} too`);
  change.addEventListener('click', () => done(shapes.map((s) => s.id)));
  const cancel = el('button', { className: 'link-btn', 'data-testid': 'flag-cancel' }, 'Cancel');
  cancel.addEventListener('click', () => done([]));
  box.appendChild(el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' } }, leave, change, cancel));
  return box;
}
