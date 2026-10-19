import { el } from '../dom';
import { I } from '../icons';
import {
  deleteMyPlant, formatSize, newMyPlantId, parseSize, placedUsing, recolorPlaced, resizePlaced, saveMyPlant, sunLevels, sunRange, type Range,
} from '../my-plants';
import { FORM_COLORS, linkFromPicker, MONTH_NAMES, plantColor, plantsById, type Plant } from '../plants';
import { state } from '../state';
import { finishPlacing, startPlacing, switchPlacingPlant } from '../place';
import { startTreeDraw } from '../draw';
import { errMsg } from '../util';
import { render } from './render';
import { toast } from './toast';

// Add or edit one of "My plants". Text fields never re-render the panel
// (Android keyboard safety): their values are read when Save is tapped, and
// the size hints update in place.

type SunLevel = 'Full' | 'Part' | 'Shade';

function close(to: 'plants' | null) {
  state.plantForm = null;
  if (!to) { state.pickerLinkId = null; state.pickerLinkAlso = []; }
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

  // Sizes: typed on the number pad, in feet or inches (most tags give feet for
  // shrubs, inches for perennials). Writing a unit ("36 in") also works. The
  // hint shows how it was read, so a feet/inches mix-up shows at once.
  type SizeField = { input: HTMLInputElement; hint: HTMLElement; unit: 'ft' | 'in' };
  const sizeField = (label: string, r: Range | undefined, placeholder: string, testid: string, required: boolean): SizeField => {
    const value = r ? (r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`) : '';
    const input = el('input', { type: 'text', inputMode: 'decimal', value, placeholder, 'data-testid': testid, autocomplete: 'off' }) as HTMLInputElement;
    const hint = el('div', { className: 'hint' });
    const f: SizeField = { input, hint, unit: 'ft' };
    const seg = el('div', { className: 'seg unit-seg', role: 'group', 'aria-label': label + ' unit' });
    const btns = (['ft', 'in'] as const).map((u) => {
      const b = el('button', { className: u === 'ft' ? 'sel' : '', 'aria-pressed': String(u === 'ft'), 'data-testid': `${testid}-${u}` }, u);
      b.addEventListener('click', () => {
        f.unit = u;
        btns.forEach((x, i) => { const on = (i === 0) === (u === 'ft'); x.classList.toggle('sel', on); x.setAttribute('aria-pressed', String(on)); });
        show();
      });
      seg.appendChild(b);
      return b;
    });
    const show = () => {
      const v = input.value.trim();
      const rr = parseSize(v, f.unit);
      hint.textContent = !v ? (required ? 'From the tag: one number or a range like 6-8.' : '')
        : rr ? `Read as ${formatSize(rr)}${required && rr.min !== rr.max ? `; drawn at ${formatSize({ min: rr.med, max: rr.med, med: rr.med })} (typical) or ${formatSize({ min: rr.max, max: rr.max, med: rr.max })} (full size)` : ''}.`
        : "Couldn't read that. Try 6-8, or 36 with inches selected.";
      hint.classList.toggle('error', !!v && !rr);
    };
    input.addEventListener('input', show);
    body.appendChild(el('div', { className: 'field' }, el('label', {}, label), el('div', { className: 'size-row' }, input, seg), hint));
    show();
    return f;
  };
  const spread = sizeField('Spread (width)', source?.width as Range | undefined, 'e.g. 6-8', 'pf-spread', true);
  const height = sizeField('Height (optional)', source?.height as Range | undefined, 'e.g. 3-4', 'pf-height', false);

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

  // Plant type, and its color on the plan: the type's color (green with none) until a color is picked.
  const form = el('select', { 'data-testid': 'pf-form' }) as HTMLSelectElement;
  form.appendChild(el('option', { value: '' }, 'Choose a type (optional)'));
  for (const f of Object.keys(FORM_COLORS)) {
    const o = el('option', { value: f }, f) as HTMLOptionElement;
    if (source?.form === f) o.selected = true;
    form.appendChild(o);
  }
  const color = el('input', { type: 'color', value: plantColor(source), 'data-testid': 'pf-color', 'aria-label': 'Color on the plan', title: 'Color on the plan' }) as HTMLInputElement;
  let colorPicked = !!source?.color;
  color.addEventListener('input', () => { colorPicked = true; });
  form.addEventListener('change', () => { if (!colorPicked) color.value = plantColor({ id: '', common: '', form: form.value || undefined }); });
  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Type and color on the plan'),
    el('div', { className: 'form-color-row' }, form, color)));

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
    const width = parseSize(spread.input.value, spread.unit);
    if (!common) { error.textContent = 'Give the plant a name.'; name.input.focus(); return null; }
    if (!width) { error.textContent = 'Enter its spread, e.g. 6-8.'; spread.input.focus(); return null; }
    const h = parseSize(height.input.value, height.unit);
    const start = Number(bloomStart.value) || undefined, end = Number(bloomEnd.value) || start;
    return {
      id: editing?.id ?? newMyPlantId(),
      common, width,
      ...(botanical.input.value.trim() ? { botanical: botanical.input.value.trim() } : {}),
      ...(h ? { height: h } : {}),
      ...sunRange([...sun]),
      ...(form.value ? { form: form.value } : {}),
      // Stored only when it differs from the type's color, so changing the type later still recolors it.
      ...(color.value.toLowerCase() !== plantColor({ id: '', common: '', form: form.value || undefined }) ? { color: color.value.toLowerCase() } : {}),
      ...(start ? { bloom: { start, end, ...(bloomColor.value.trim() ? { color: bloomColor.value.trim() } : {}) } } : {}),
      ...(notes.value.trim() ? { notes: notes.value.trim() } : {}),
    };
  };

  const actions = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  const saveBtn = el('button', { className: 'btn primary', 'data-testid': 'pf-save' },
    editing ? 'Save changes' : args.place ? (state.pickerLinkId ? (state.pickerLinkAlso.length ? `Save and use for these ${state.pickerLinkAlso.length + 1} circles` : 'Save and use for this circle') : 'Save and place on the plan') : 'Save to My plants');
  saveBtn.addEventListener('click', async () => {
    const p = collect();
    if (!p) return;
    saveBtn.disabled = true;
    try {
      const oldName = editing?.common ?? '';
      const oldColor = editing ? plantColor(editing) : '';
      const saved = await saveMyPlant(p);
      if (editing) {
        recolorPlaced(saved.id, oldColor, plantColor(saved));
        const n = placedUsing(saved.id).length;
        if (n && confirm(`Update ${n} placed plant${n === 1 ? '' : 's'} in this plan to the new size?`)) resizePlaced(saved, oldName);
        toast(`Saved ${saved.common}`);
        close(state.selectedIds.length ? null : 'plants');
        return;
      }
      if (args.place) {
        toast(`Added ${saved.common} to My plants`);
        if (state.pickerLinkId) { linkFromPicker(saved); state.plantForm = null; state.panel = 'props'; render(); }
        else {
          state.plantForm = null;
          if (state.pickerForTree) startTreeDraw(saved.id); // then draw its canopy
          else if (state.placing) switchPlacingPlant(saved); // keep the batch placed so far
          else startPlacing(saved); // tap the plan where it goes
          render();
        }
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
      try {
        await deleteMyPlant(editing.id);
        const wasInHand = state.placing?.plantId === editing.id;
        if (wasInHand) finishPlacing(); // it can't be placed any more; what was placed stays, selected
        toast(`Deleted ${editing.common}`); close(wasInHand ? null : 'plants');
      }
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
