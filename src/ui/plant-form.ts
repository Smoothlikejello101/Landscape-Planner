import { el } from '../dom';
import { I } from '../icons';
import {
  deleteMyPlant, formatSize, newMyPlantId, parseSize, placedUsing, resizePlaced, saveMyPlant, sunLevels, sunRange, type Range,
} from '../my-plants';
import { addPlantShape, FORM_COLORS, linkShapeToPlant, MONTH_NAMES, plantsById, type Plant } from '../plants';
import { state } from '../state';
import { errMsg } from '../util';
import { render } from './render';
import { toast } from './toast';

// Add or edit one of "My plants". Text fields never re-render the panel
// (Android keyboard safety): their values are read when Save is tapped, and
// the size hints update in place.

type SunLevel = 'Full' | 'Part' | 'Shade';

function close(to: 'plants' | null) {
  state.plantForm = null;
  if (!to) state.pickerLinkId = null;
  state.panel = to;
  render();
}

export function renderPlantForm() {
  const args = state.plantForm;
  if (!args) return null;
  const editing = args.editId ? plantsById[args.editId] : undefined;
  const source = editing ?? (args.copyFromId ? plantsById[args.copyFromId] : undefined);
  const body = el('div', { className: 'sheet-body' });

  if (args.copyFromId && source) {
    body.appendChild(el('div', { className: 'banner' }, `A copy of ${source.common}. Change what differs, such as the cultivar name or size; the catalog entry stays as it is.`));
  }

  const text = (label: string, value: string, placeholder: string, testid: string) => {
    const input = el('input', { type: 'text', value, placeholder, 'data-testid': testid }) as HTMLInputElement;
    const hint = el('div', { className: 'hint' });
    const field = el('div', { className: 'field' }, el('label', {}, label), input, hint);
    body.appendChild(field);
    return { input, hint };
  };
  const name = text('Name', editing?.common ?? (args.copyFromId && source ? source.common : args.name ?? ''), "e.g. Hydrangea 'Limelight'", 'pf-name');
  const botanical = text('Botanical or cultivar name (optional)', source?.botanical ?? '', 'e.g. Hydrangea paniculata', 'pf-botanical');

  // Sizes: as written on the tag. The hint shows how it was read, so "36" vs "36 in" mix-ups show up at once.
  const sizeText = (r: unknown) => {
    const x = r as Range | undefined;
    return x ? (x.min === x.max ? `${x.min} ft` : `${x.min}-${x.max} ft`) : '';
  };
  const spread = text('Spread (width)', sizeText(source?.width), 'e.g. 6-8 ft or 36 in', 'pf-spread');
  const height = text('Height (optional)', sizeText(source?.height), 'e.g. 3-4 ft', 'pf-height');
  const showSize = (f: { input: HTMLInputElement; hint: HTMLElement }, required: boolean) => {
    const v = f.input.value.trim();
    const r = parseSize(v);
    f.hint.textContent = !v ? (required ? 'Copy it from the tag: a range like 6-8 ft is fine.' : '')
      : r ? `Read as ${formatSize(r)}${r.min !== r.max ? `; drawn at ${formatSize({ min: r.med, max: r.med, med: r.med })} (typical) or ${formatSize({ min: r.max, max: r.max, med: r.max })} (full size)` : ''}.`
      : "Couldn't read that. Try 6-8 ft, 36 in, or 3.";
    f.hint.classList.toggle('error', !!v && !r);
  };
  spread.input.addEventListener('input', () => showSize(spread, true));
  height.input.addEventListener('input', () => showSize(height, false));
  showSize(spread, true); showSize(height, false);

  // Sun: tags show sun as icons; tap every one that applies.
  const sun = new Set<SunLevel>(source ? sunLevels(source) : []);
  const sunRow = el('div', { className: 'role-chips', role: 'group', 'aria-label': 'Sun' });
  for (const [lvl, label] of [['Full', 'Full sun'], ['Part', 'Part sun'], ['Shade', 'Shade']] as const) {
    const b = el('button', { className: 'role-chip' + (sun.has(lvl) ? ' sel' : ''), 'aria-pressed': String(sun.has(lvl)) }, label);
    b.addEventListener('click', () => {
      if (sun.has(lvl)) sun.delete(lvl); else sun.add(lvl);
      b.classList.toggle('sel', sun.has(lvl));
      b.setAttribute('aria-pressed', String(sun.has(lvl)));
    });
    sunRow.appendChild(b);
  }
  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Sun (tap all that apply)'), sunRow));

  // Plant type: sets its color on the plan.
  const form = el('select', { 'data-testid': 'pf-form' }) as HTMLSelectElement;
  form.appendChild(el('option', { value: '' }, 'Choose a type (optional)'));
  for (const f of Object.keys(FORM_COLORS)) {
    const o = el('option', { value: f }, f) as HTMLOptionElement;
    if (source?.form === f) o.selected = true;
    form.appendChild(o);
  }
  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Type'), form));

  // Bloom and notes: optional, folded away.
  const monthSel = (value?: number) => {
    const sel = el('select', {}) as HTMLSelectElement;
    sel.appendChild(el('option', { value: '' }, '—'));
    for (let m = 1; m <= 12; m++) {
      const o = el('option', { value: String(m) }, MONTH_NAMES[m]) as HTMLOptionElement;
      if (value === m) o.selected = true;
      sel.appendChild(o);
    }
    return sel;
  };
  const bloomStart = monthSel(source?.bloom?.start), bloomEnd = monthSel(source?.bloom?.end);
  const bloomColor = el('input', { type: 'text', value: source?.bloom?.color ?? '', placeholder: 'e.g. white aging to pink' }) as HTMLInputElement;
  const notes = el('textarea', { rows: 3, placeholder: 'Where you bought it, care notes, what to watch for' }) as HTMLTextAreaElement;
  notes.value = typeof source?.notes === 'string' && editing ? source.notes : '';
  const more = el('details', { open: !!(source?.bloom || (editing && editing.notes)) },
    el('summary', {}, 'Bloom and notes (optional)'),
    el('div', { className: 'field' }, el('label', {}, 'Blooms from / to'),
      el('div', { style: { display: 'flex', gap: '8px' } }, bloomStart, bloomEnd)),
    el('div', { className: 'field' }, el('label', {}, 'Bloom color'), bloomColor),
    el('div', { className: 'field' }, el('label', {}, 'Notes'), notes));
  body.appendChild(more);

  const error = el('div', { className: 'hint error', 'data-testid': 'pf-error' });
  body.appendChild(error);

  const collect = (): Plant | null => {
    const common = name.input.value.trim();
    const width = parseSize(spread.input.value);
    if (!common) { error.textContent = 'Give the plant a name.'; name.input.focus(); return null; }
    if (!width) { error.textContent = 'Enter its spread, e.g. 6-8 ft.'; spread.input.focus(); return null; }
    const h = parseSize(height.input.value);
    const start = Number(bloomStart.value) || undefined, end = Number(bloomEnd.value) || start;
    return {
      id: editing?.id ?? newMyPlantId(),
      common, width,
      ...(botanical.input.value.trim() ? { botanical: botanical.input.value.trim() } : {}),
      ...(h ? { height: h } : {}),
      ...sunRange([...sun]),
      ...(form.value ? { form: form.value } : {}),
      ...(start ? { bloom: { start, end, ...(bloomColor.value.trim() ? { color: bloomColor.value.trim() } : {}) } } : {}),
      ...(notes.value.trim() ? { notes: notes.value.trim() } : {}),
    };
  };

  const actions = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  const saveBtn = el('button', { className: 'btn primary', 'data-testid': 'pf-save' },
    editing ? 'Save changes' : args.place ? (state.pickerLinkId ? 'Save and use for this circle' : 'Save and place on the plan') : 'Save to My plants');
  saveBtn.addEventListener('click', async () => {
    const p = collect();
    if (!p) return;
    saveBtn.disabled = true;
    try {
      const oldName = editing?.common ?? '';
      const saved = await saveMyPlant(p);
      if (editing) {
        const n = placedUsing(saved.id).length;
        if (n && confirm(`Update ${n} placed plant${n === 1 ? '' : 's'} in this plan to the new size?`)) resizePlaced(saved, oldName);
        toast(`Saved ${saved.common}`);
        close(state.selectedIds.length ? null : 'plants');
        return;
      }
      if (args.place) {
        if (state.pickerLinkId) { linkShapeToPlant(state.pickerLinkId, saved); state.pickerLinkId = null; }
        else addPlantShape(saved);
        toast(`Added ${saved.common} to My plants`);
        close(null);
      } else {
        toast(`Added ${saved.common} to My plants`);
        close('plants');
      }
    } catch (e) {
      saveBtn.disabled = false;
      error.textContent = "Couldn't save the plant: " + errMsg(e);
    }
  });
  actions.appendChild(saveBtn);
  if (editing) {
    const del = el('button', { className: 'btn danger' }, 'Delete from My plants');
    del.addEventListener('click', async () => {
      if (!confirm(`Delete ${editing.common} from My plants? Plants already on your plans keep their name and size.`)) return;
      try { await deleteMyPlant(editing.id); toast(`Deleted ${editing.common}`); close('plants'); }
      catch (e) { error.textContent = "Couldn't delete: " + errMsg(e); }
    });
    actions.appendChild(del);
  }
  const cancel = el('button', { className: 'btn ghost' }, 'Cancel');
  cancel.addEventListener('click', () => close(args.place || !editing ? 'plants' : null));
  actions.appendChild(cancel);
  body.appendChild(actions);

  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, editing ? 'Edit my plant' : 'Add a plant'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => close(null)); return b; })());
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
  return overlay;
}
