import { el } from '../dom';
import { I } from '../icons';
import {
  activeMyPlants, deleteMyPlant, formatSize, isDataSized, isMine, MY_WATER, newMyPlantId, parseSize, parseZones, placedUsing, rawMyPlant, recolorPlaced,
  renamePlaced, resizePlaced, saveMyPlant, speciesLinkFor, speciesRecordFor, sunLevels, sunRange, zonesText, type Range,
} from '../my-plants';
import { FORM_COLORS, linkFromPicker, MONTH_NAMES, PLANTS, plantColor, plantColors, plantsById, speciesOf, type Plant } from '../plants';
import { byMatch, matchPlant, readQuery } from '../search';
import { state } from '../state';
import type { Shape } from '../types';
import { finishPlacing, startPlacing, switchPlacingPlant } from '../place';
import { startTreeDraw } from '../draw';
import { errMsg } from '../util';
import { zoneRange } from '../climate';
import { render } from './render';
import { toast } from './toast';

// Add or edit one of "My plants". Text fields never re-render the panel
// (Android keyboard safety): their values are read when Save is tapped, and
// the size hints update in place.
//
// A new plant can start from another, from the catalog or the person's own (asked for by Jason, 2026-10-25): its
// size, sun, type, color and bloom are filled in, to change what differs. And a plant can be the same species as
// a catalog plant: then it has what holds for the whole species (src/my-plants.ts, withSpecies).

type SunLevel = 'Full' | 'Part' | 'Shade';

function close(to: 'plants' | null) {
  // (Opened from somewhere else, the bloom calendar say: back there.)
  const back = state.plantForm?.back;
  if (back) { state.plantForm = null; state.panel = back; render(); return; }
  state.plantForm = null;
  if (!to) { state.pickerLinkId = null; state.pickerLinkAlso = []; state.pickerLinkLocked = false; }
  state.panel = to;
  render();
}

export function renderPlantForm() {
  const args = state.plantForm;
  if (!args) return null;
  // (A plant of mine as stored: its own values, none of its species'.)
  const own = (id: string) => rawMyPlant(id) ?? plantsById[id];
  const editing = args.editId ? own(args.editId) : undefined;
  const startedFrom = !editing && args.copyFromId ? own(args.copyFromId) : undefined;
  const source = editing ?? startedFrom;
  const body = el('div', { className: 'sheet-body' });

  if (startedFrom) {
    body.appendChild(el('div', { className: 'banner', 'data-testid': 'pf-from-banner' }, `Starting from ${startedFrom.common}. Change what differs, such as the name or size`
      + (isMine(startedFrom) ? '; yours stays as it is.' : '; the catalog entry stays as it is.')));
  }
  // A new plant: start from another, found by name (its fields filled in; what's typed in the name stays).
  if (!editing) {
    const find = el('input', { type: 'text', enterkeyhint: 'search', placeholder: 'e.g. panicle hydrangea', 'data-testid': 'pf-from', autocomplete: 'off', id: 'pf-from' }) as HTMLInputElement;
    const hits = el('div', { className: 'from-hits', 'data-testid': 'pf-from-hits' });
    find.addEventListener('input', () => {
      hits.replaceChildren();
      const q = readQuery(find.value);
      if (!q) return;
      const found = [...PLANTS, ...activeMyPlants()].map((plant) => ({ plant, hit: matchPlant(plant, q, true) }))
        .filter((x): x is { plant: Plant; hit: NonNullable<typeof x.hit> } => !!x.hit).sort(byMatch).slice(0, 6);
      if (!found.length) { hits.appendChild(el('div', { className: 'hint' }, 'No plant by that name.')); return; }
      for (const { plant } of found) {
        const b = el('button', { className: 'from-hit', 'data-testid': 'pf-from-hit' }, el('span', {}, plant.common),
          plant.botanical ? el('span', { className: 'from-bot' }, plant.botanical) : null, isMine(plant) ? el('span', { className: 'mine-badge' }, 'Mine') : null);
        b.addEventListener('click', () => {
          // What's been typed stays (a name from the picker's search, a botanical name); the rest comes from it.
          const kept = (input: HTMLInputElement, was?: string) => (input.value.trim() && input.value.trim() !== (was ?? '').trim() ? input.value.trim() : undefined);
          state.plantForm = { ...args, copyFromId: plant.id, name: kept(name.input, startedFrom?.common), botanical: kept(botanical.input, startedFrom?.botanical) };
          render();
        });
        hits.appendChild(b);
      }
    });
    body.appendChild(el('div', { className: 'field' },
      el('label', { for: 'pf-from' }, startedFrom ? 'Start from another plant (optional)' : 'Start from a plant (optional)'), find,
      el('div', { className: 'hint' }, 'Its size, sun, type and bloom are filled in, to change what differs.'), hits));
  }

  /**
   * A field's label, which can say what's missing on the line with its name: above the field, so it shows while the
   * keyboard is up (a note at the foot of the form is under it). Typing clears it.
   */
  const fieldLabel = (label: string, input: HTMLInputElement, testid: string, required: boolean) => {
    const missing = el('span', { className: 'label-error', 'data-testid': testid + '-missing' });
    // (The label names its field, message and all: a screen reader reads it on reaching the field.)
    input.id = testid;
    if (required) input.setAttribute('aria-required', 'true');
    const node = el('label', { for: testid }, label, missing);
    const need = (why: string) => {
      missing.textContent = ' \u2014 ' + why; input.setAttribute('aria-invalid', 'true'); input.focus();
      // (Once the keyboard is up: the whole field, its label too, not only the box the focus scroll shows.)
      setTimeout(() => input.closest('.field')?.scrollIntoView({ block: 'nearest' }), 400);
    };
    const clear = () => { missing.textContent = ''; input.removeAttribute('aria-invalid'); };
    input.addEventListener('input', clear);
    return { node, need, clear };
  };
  const text = (label: string, value: string, placeholder: string, testid: string) => {
    const input = el('input', { type: 'text', value, placeholder, 'data-testid': testid }) as HTMLInputElement;
    const hint = el('div', { className: 'hint' });
    const { node, need } = fieldLabel(label, input, testid, label.endsWith(', required'));
    body.appendChild(el('div', { className: 'field' }, node, input, hint));
    return { input, hint, need };
  };
  const name = text('Name, required', editing?.common ?? (args.name || startedFrom?.common || ''), "e.g. Hydrangea 'Limelight'", 'pf-name');
  const botanical = text('Botanical or cultivar name (optional)', editing ? editing.botanical ?? '' : args.botanical ?? source?.botanical ?? '', 'e.g. Hydrangea paniculata', 'pf-botanical');

  // The same species as a catalog plant: offered for the plant it started from (ticked), the one it's linked to
  // (ticked), or the one its botanical name names (not ticked: the person says so). A botanical name of another
  // species unticks it.
  const linked = editing?.species ? plantsById[editing.species] : undefined;
  let species: Plant | undefined = linked ?? (startedFrom ? speciesLinkFor(plantsById[startedFrom.id] ?? startedFrom) : speciesRecordFor(source?.botanical));
  const same = el('input', { type: 'checkbox', 'data-testid': 'pf-species', id: 'pf-species' }) as HTMLInputElement;
  same.checked = !!species && (!!linked || !!startedFrom);
  const sameText = el('span', {});
  const sameNote = el('div', { className: 'hint', 'data-testid': 'pf-species-note' });
  const sameBox = el('div', { className: 'field species-field' },
    el('label', { for: 'pf-species', className: 'check-label' }, same, sameText),
    el('div', { className: 'hint' }, 'Ticked, it has what holds for the whole species, from the catalog: hardiness, toxicity, poison, native status, value to wildlife. Its size, color and bloom stay its own.'));
  const showSpecies = () => {
    sameBox.hidden = !species;
    if (species) sameText.textContent = `Same species as ${species.common}` + (species.botanical && species.botanical !== species.common ? ` (${species.botanical})` : '');
  };
  showSpecies();
  body.append(sameBox, sameNote); // (the note outside: it says why when the box goes)
  // (Read once it's typed, on leaving the field, and again at Save: part-way, "Hydrangea pa" would name another
  // species.) True when it unticked the box: the note says why.
  let untickedAt = 0;
  const recheckSpecies = (): boolean => {
    const typed = speciesOf(botanical.input.value);
    if (!typed) return false; // (empty, or a genus alone: nothing to go by)
    const have = speciesOf(species?.botanical);
    if (species && have === typed) return false;
    // Another species: the one it names now, if the catalog has it, offered unticked.
    const was = same.checked && !!species;
    if (was) { sameNote.textContent = `Unticked: ${typed} isn\u2019t ${have ?? species!.common}. Tick it again if it is.`; untickedAt = Date.now(); }
    same.checked = false;
    species = speciesRecordFor(botanical.input.value);
    showSpecies();
    return was;
  };
  botanical.input.addEventListener('change', () => { recheckSpecies(); });
  same.addEventListener('change', () => { sameNote.textContent = ''; untickedAt = 0; }); // (seen, and decided)

  // Sizes: typed on the number pad, in feet or inches (most tags give feet for
  // shrubs, inches for perennials). Writing a unit ("36 in") also works. The
  // hint shows how it was read, so a feet/inches mix-up shows at once.
  type SizeField = { input: HTMLInputElement; hint: HTMLElement; unit: 'ft' | 'in'; need: (why: string) => void };
  const sizeField = (label: string, r: Range | undefined, placeholder: string, testid: string, required: boolean, from = ''): SizeField => {
    const value = r ? (r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`) : '';
    const input = el('input', { type: 'text', inputMode: 'decimal', value, placeholder, 'data-testid': testid, autocomplete: 'off' }) as HTMLInputElement;
    const hint = el('div', { className: 'hint' });
    const { node, need, clear } = fieldLabel(label, input, testid, required);
    const f: SizeField = { input, hint, unit: 'ft', need };
    const seg = el('div', { className: 'seg unit-seg', role: 'group', 'aria-label': label.replace(/,? \(?(required|optional)\)?$/, '') + ' unit' });
    const btns = (['ft', 'in'] as const).map((u) => {
      const b = el('button', { className: u === 'ft' ? 'sel' : '', 'aria-pressed': String(u === 'ft'), 'data-testid': `${testid}-${u}` }, u);
      b.addEventListener('click', () => {
        f.unit = u;
        btns.forEach((x, i) => { const on = (i === 0) === (u === 'ft'); x.classList.toggle('sel', on); x.setAttribute('aria-pressed', String(on)); });
        clear(); // (the value reads differently now: Save checks it again)
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
          + (from && v === from && f.unit === 'ft' ? ' From the circle you\u2019re linking; change it to the tag\u2019s.' : '')
        : "Couldn't read that. Try 6-8, or 36 with inches selected.";
      hint.classList.toggle('error', !!v && !rr);
    };
    input.addEventListener('input', show);
    body.appendChild(el('div', { className: 'field' }, node, el('div', { className: 'size-row' }, input, seg), hint));
    show();
    return f;
  };
  // A new plant for a circle being linked: its spread starts as the circle's width, so linking keeps the size drawn.
  // To the half foot, as linking sizes it (its radius to the quarter foot): the form shows what will be drawn. Not
  // for several circles at once (whose width?), nor one sized from another plant (that says nothing about this
  // one), nor a tree (it keeps the size drawn anyway, and its spread is what it grows to, not what it is now).
  const linking = !source && args.place && state.pickerLinkId && !state.pickerLinkAlso.length
    ? state.shapes.find((s) => s.id === state.pickerLinkId) : undefined;
  const fromData = !!linking && (isDataSized as (s: Shape) => boolean)(linking); // (a plain yes or no: no narrowing)
  const drawn = linking?.type === 'circle' && !linking.canopy && !linking.tree && !fromData ? Math.round(linking.radius * 4) / 2 : undefined;
  const spread = sizeField('Spread (width), required', (source?.width as Range | undefined) ?? (drawn ? { min: drawn, max: drawn, med: drawn } : undefined),
    'e.g. 6-8', 'pf-spread', true, drawn ? String(drawn) : '');
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

  // Hardiness zones and water needs, from the tag (optional, Oct 30): with the species ticked, its own stand over the
  // species'. (Read as typed: the hint shows how.)
  const ownZones = editing ? zonesText(rawMyPlant(editing.id) ?? {}) : source && !isMine(source) ? '' : zonesText(source ?? {});
  const zones = text('Hardiness zones (optional)', ownZones, 'e.g. 5-9 or 6b-9a', 'pf-zones');
  const showZones = () => {
    const v = zones.input.value.trim(), z = v ? parseZones(v) : null;
    zones.hint.textContent = !v ? 'From the tag, if it gives them.' : z ? `Read as ${zoneRange(z)}.` : "Couldn't read that. Try 5-9, or 6b-9a.";
    zones.hint.classList.toggle('error', !!v && !z);
  };
  zones.input.addEventListener('input', showZones);
  showZones();
  const water = el('select', { 'data-testid': 'pf-water', id: 'pf-water' }) as HTMLSelectElement;
  water.appendChild(el('option', { value: '' }, 'Not given (optional)'));
  const ownWater = editing ? rawMyPlant(editing.id)?.water : source && isMine(source) ? source.water : undefined;
  for (const w of MY_WATER) {
    const o = el('option', { value: w }, w === 'Wetland' ? 'Wet soil or standing water' : w) as HTMLOptionElement;
    if (ownWater === w) o.selected = true;
    water.appendChild(o);
  }
  body.appendChild(el('div', { className: 'field' }, el('label', { for: 'pf-water' }, 'Water needs'), water));

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
    error.textContent = '';
    if (!common) { name.need('give the plant a name'); return null; }
    if (!width) { spread.need(spread.input.value.trim() ? 'couldn\u2019t read that (see below)' : 'enter one number or a range like 6-8'); return null; }
    const h = parseSize(height.input.value, height.unit);
    const z = zones.input.value.trim() ? parseZones(zones.input.value) : null;
    if (zones.input.value.trim() && !z) { zones.need('couldn\u2019t read that (see below)'); return null; }
    // (A botanical name of another species typed and Save tapped straight away, which unticks it as the field is
    // left: said, and saved only at a second tap, not silently. Diego, Oct 30.)
    recheckSpecies();
    if (Date.now() - untickedAt < 1500) { untickedAt = 0; sameNote.scrollIntoView({ block: 'nearest' }); return null; }
    const start = Number(bloomStart.value) || undefined, end = Number(bloomEnd.value) || start;
    return {
      id: editing?.id ?? newMyPlantId(),
      common, width,
      ...(botanical.input.value.trim() ? { botanical: botanical.input.value.trim() } : {}),
      ...(h ? { height: h } : {}),
      ...(z ?? {}),
      ...(water.value ? { water: water.value } : {}),
      ...sunRange([...sun]),
      ...(form.value ? { form: form.value } : {}),
      // Stored only when it differs from the type's color, so changing the type later still recolors it.
      ...(color.value.toLowerCase() !== plantColor({ id: '', common: '', form: form.value || undefined }) ? { color: color.value.toLowerCase() } : {}),
      ...(start ? { bloom: { start, end, ...(bloomColor.value.trim() ? { color: bloomColor.value.trim() } : {}) } } : {}),
      ...(notes.value.trim() ? { notes: notes.value.trim() } : {}),
      // (Kept as the person left them: switched to the catalog's, or not that one.)
      ...(editing?.sameAs ? { sameAs: editing.sameAs } : editing?.notSame ? { notSame: editing.notSame } : {}),
      ...(same.checked && species ? { species: species.id } : {}),
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
      const oldColors = editing ? plantColors(editing) : [];
      const was = editing ? rawMyPlant(editing.id) : undefined;
      const saved = await saveMyPlant(p);
      if (editing) {
        recolorPlaced(saved.id, oldColors, plantColor(saved));
        // Renamed: placed plants still showing the old name take the new one; resized: asked, as a plan's plant may
        // have been sized by hand. (Diego, Oct 30: the size was asked about, and the name stayed.)
        const renamed = renamePlaced(saved, oldName);
        const sizeChanged = JSON.stringify([was?.width, was?.height]) !== JSON.stringify([saved.width, saved.height]);
        const n = sizeChanged ? placedUsing(saved.id).length : 0;
        if (n && confirm(`Update ${n} placed plant${n === 1 ? '' : 's'} in this plan to the new size?`)) resizePlaced(saved);
        toast(`Saved ${saved.common}${renamed ? `; ${renamed} placed plant${renamed === 1 ? '' : 's'} renamed` : ''}`);
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
    (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', () => close(null)); return b; })());
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
  return overlay;
}
