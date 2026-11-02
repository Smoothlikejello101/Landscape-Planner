import { el } from '../dom';
import { bedChoices, printArea, setAreaBed, setAreaKind, type AreaKind } from '../print-area';
import { state } from '../state';

/**
 * What to print, or what the picture shows (src/print-area.ts): the whole plan, what's on screen, or one bed, with
 * the beds to pick from (the one selected on the plan already picked). The same choice in Print and Export: the
 * picture follows. `says`: what that takes in, in words ("Front bed: 7 plants"), under it.
 */
export function areaPicker(label: string, says: string, onChange: () => void): HTMLElement {
  const area = printArea();
  const beds = bedChoices(state.shapes);
  const options: [AreaKind, string][] = [['all', 'Whole plan'], ['screen', 'What’s on screen'], ...(beds.length ? [['bed', 'One bed'] as [AreaKind, string]] : [])];
  const seg = el('div', { className: 'seg', role: 'group', 'aria-label': label, 'data-testid': 'print-area' });
  for (const [k, text] of options) {
    const b = el('button', { className: k === area.kind ? 'sel' : '', 'aria-pressed': String(k === area.kind) }, text);
    b.addEventListener('click', () => { setAreaKind(k); onChange(); });
    seg.appendChild(b);
  }
  const field = el('div', { className: 'field' }, el('label', {}, label), seg);
  if (area.kind === 'bed') {
    const pick = el('select', { 'data-testid': 'print-bed', 'aria-label': 'Bed' }) as HTMLSelectElement;
    if (!area.bedId) pick.appendChild(el('option', { value: '' }, 'Pick a bed…'));
    for (const b of beds) pick.appendChild(el('option', { value: b.id }, b.name));
    pick.value = area.bedId ?? '';
    pick.addEventListener('change', () => { setAreaBed(pick.value || null); onChange(); });
    field.appendChild(el('div', { style: { marginTop: '8px' } }, pick));
  }
  if (says) field.appendChild(el('div', { className: 'hint', 'data-testid': 'print-area-says' }, says));
  return field;
}
