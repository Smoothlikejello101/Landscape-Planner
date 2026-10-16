import { SWATCHES } from '../constants';
import { el } from '../dom';
import { I } from '../icons';
import { isLocked, roleKey, roleLabel, roleLocked } from '../roles';
import { convertToOutline, startEditPoints } from '../draw';
import { boxSize, resizedPoints } from '../geometry';

const round1 = (v: number) => Math.round(v * 10) / 10;
import { roleChips } from './role-picker';
import { bedSection, measureText, plantSunBanner, shadeSunSection } from './role-sections';
import { setRoleForIds, bringForward, bringToFront, copySelected, deleteSelected, duplicateSelected, findNextSameTier, sendBackward, sendToBack, setLockedForIds, updateSelected, updateSelectedSilent } from '../mutations';
import { getSelected, singleSelected } from '../selection';
import { state } from '../state';
import { render } from './render';
import type { CircleShape, Corner, Shape } from '../types';
import { formatSize, isMine, plantRadius, type Range } from '../my-plants';
import { plantsById } from '../plants';
import { statusSection } from './status-section';
import { bedBloomSection } from './bloom-view';
import { snapRot, typeName } from '../util';

// ============================================================
// PANELS
// ============================================================

export function renderPropsPanelSingle(s: Shape) {
  const body = el('div', { className: 'sheet-body' });
  if (s.locked) {
    body.appendChild(el('div', { className: 'banner' },
      "This shape is locked: it can't be dragged, and dragging on it pans the plan. Tap Unlock above to move it."));
  } else if (roleLocked(s)) {
    body.appendChild(el('div', { className: 'banner' },
      `All ${roleLabel(roleKey(s)).toLowerCase()} shapes are locked. Unlock them in the Layers panel to move this one.`));
  }
  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Role'),
    roleChips(roleKey(s), (role) => { setRoleForIds([s.id], role); render(); })));
  const sunCheck = plantSunBanner(s);
  if (sunCheck) body.appendChild(sunCheck);
  if (s.type !== 'text') body.appendChild(statusSection([s]));
  // Label (for a text note, the text itself; it can run to several lines)
  if (s.type === 'text') {
    const ta = el('textarea', { rows: 3, placeholder: 'e.g. Rain barrel goes here' }) as HTMLTextAreaElement;
    ta.value = s.label || '';
    ta.addEventListener('input', () => updateSelectedSilent({ label: ta.value }));
    body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Text'), ta));
  } else {
    const labelInput = el('input', { type: 'text', value: s.label || '', placeholder: 'e.g. Dwarf Alberta Spruce' });
    labelInput.addEventListener('input', e => updateSelectedSilent({ label: (e.target as HTMLInputElement).value }));
    body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Label'), labelInput));
  }

  // Dimensions (with area/length, refreshed as you type)
  const measure = el('div', { className: 'measure', 'data-testid': 'measure' }, measureText(s));
  const refreshMeasure = () => { measure.textContent = measureText(s); };
  if (s.type === 'text') {
    const sizeInput = el('input', { type: 'number', step: '0.25', min: '0.25', value: s.fontSize });
    sizeInput.addEventListener('input', e => updateSelectedSilent({ fontSize: Math.min(50, Math.max(0.25, parseFloat((e.target as HTMLInputElement).value) || 0)) }));
    body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Text height (ft)'), sizeInput,
      el('div', { className: 'hint' }, 'Sized in feet so it stays in proportion to the plan when zoomed or printed.')));
  } else if (s.type === 'circle') {
    const radInput = el('input', { type: 'number', step: '0.5', min: '0.1', value: s.radius });
    const diameterHint = el('div', { className: 'hint' }, 'Diameter: ' + (s.radius * 2).toFixed(1) + ' ft');
    radInput.addEventListener('input', e => {
      const newR = Math.max(0.1, parseFloat((e.target as HTMLInputElement).value) || 0);
      // A plant resized by hand keeps its size when the plan's size mode changes.
      updateSelectedSilent(s.plantId ? { radius: newR, sizeFrom: 'manual' } : { radius: newR });
      diameterHint.textContent = 'Diameter: ' + (newR * 2).toFixed(1) + ' ft';
      refreshMeasure();
    });
    body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Radius (ft)'), radInput, diameterHint, measure));
    body.appendChild(plantLinkSection(s));
  } else {
    const isPath = s.type === 'poly' || s.type === 'line';
    const size = boxSize(s);
    // Outlines and lines stretch their points to the new size.
    const resize = (w: number, h: number) => {
      if (s.type === 'poly' || s.type === 'line') updateSelectedSilent({ points: resizedPoints(s.points, w, h) });
      else updateSelectedSilent({ width: w, height: h });
    };
    const wInput = el('input', { type: 'number', step: '0.5', min: '0.1', value: round1(size.w) });
    wInput.addEventListener('input', e => { resize(Math.max(0.1, parseFloat((e.target as HTMLInputElement).value) || 0), boxSize(s).h); refreshMeasure(); });
    const hInput = el('input', { type: 'number', step: '0.5', min: '0.1', value: round1(size.h) });
    hInput.addEventListener('input', e => { resize(boxSize(s).w, Math.max(0.1, parseFloat((e.target as HTMLInputElement).value) || 0)); refreshMeasure(); });
    // A perfectly straight line has no height (or width) to stretch.
    if (isPath && size.w === 0) wInput.disabled = true;
    if (isPath && size.h === 0) hInput.disabled = true;
    body.appendChild(el('div', { className: 'row-2' },
      el('div', { className: 'field' }, el('label', {}, 'Width (ft)'), wInput),
      el('div', { className: 'field' }, el('label', {}, 'Height (ft)'), hInput)
    ));
    body.appendChild(measure);
    if (isPath) {
      const editBtn = el('button', { className: 'btn ghost', 'data-testid': 'edit-points' }, 'Edit points…');
      editBtn.disabled = isLocked(s);
      editBtn.addEventListener('click', () => { startEditPoints(s.id); render(); });
      body.appendChild(el('div', { className: 'field' }, editBtn,
        el('div', { className: 'hint' }, isLocked(s) ? 'Unlock this shape to edit its points.' : 'Drag points to reshape, add or remove corners.')));
    } else {
      const convBtn = el('button', { className: 'btn ghost', 'data-testid': 'convert-outline' }, 'Convert to outline');
      convBtn.disabled = isLocked(s);
      convBtn.addEventListener('click', () => { convertToOutline(s.id); render(); });
      body.appendChild(el('div', { className: 'field' }, convBtn,
        el('div', { className: 'hint' }, 'Turns this into a freeform outline you can reshape point by point.')));
    }
  }

  // Position
  const xInput = el('input', { type: 'number', step: '0.5', value: s.x });
  xInput.addEventListener('input', e => updateSelectedSilent({ x: parseFloat((e.target as HTMLInputElement).value) || 0 }));
  const yInput = el('input', { type: 'number', step: '0.5', value: s.y });
  yInput.addEventListener('input', e => updateSelectedSilent({ y: parseFloat((e.target as HTMLInputElement).value) || 0 }));
  body.appendChild(el('div', { className: 'row-2' },
    el('div', { className: 'field' }, el('label', {}, 'X position (ft)'), xInput),
    el('div', { className: 'field' }, el('label', {}, 'Y position (ft)'), yInput)
  ));

  // Rotation (rect, oval, triangle)
  if (s.type !== 'circle') {
    const rotVal = s.rotation || 0;
    const rotInput = el('input', { type: 'number', step: '5', value: rotVal });
    const rotPct = el('span', { style: { fontSize: '12px', color: '#78716c' } }, rotVal + '°');
    rotInput.addEventListener('input', e => {
      const v = parseFloat((e.target as HTMLInputElement).value) || 0;
      updateSelectedSilent({ rotation: v });
      rotPct.textContent = v + '°';
    });
    const quickBtns = el('div', { className: 'rot-quick' });
    [-90, -15, 15, 90].forEach(delta => {
      const b = el('button', {}, (delta > 0 ? '+' : '') + delta + '°');
      b.addEventListener('click', () => {
        const cur = s.rotation || 0;
        let newRot = snapRot(cur + delta);
        if (newRot >= 360) newRot -= 360;
        if (newRot < 0) newRot += 360;
        rotInput.value = String(newRot);
        rotPct.textContent = newRot + '°';
        updateSelectedSilent({ rotation: newRot });
      });
      quickBtns.appendChild(b);
    });
    const resetBtn = el('button', { className: 'link-reset' }, 'Reset rotation');
    resetBtn.addEventListener('click', () => {
      rotInput.value = '0';
      rotPct.textContent = '0°';
      updateSelectedSilent({ rotation: 0 });
    });
    body.appendChild(el('div', { className: 'field' },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
        el('label', {}, 'Rotation (degrees, around center)'), rotPct),
      rotInput,
      quickBtns,
      el('div', { style: { marginTop: '6px' } }, resetBtn)
    ));
  }

  // Triangle: right-angle corner
  if (s.type === 'triangle') {
    const corners: { v: Corner; label: string }[] = [
      { v: 'bl', label: 'Bottom-left' },
      { v: 'br', label: 'Bottom-right' },
      { v: 'tl', label: 'Top-left' },
      { v: 'tr', label: 'Top-right' }
    ];
    const grid = el('div', { className: 'tri-corners' });
    for (const c of corners) {
      const isSel = (s.rightAngle || 'bl') === c.v;
      const btn = el('button', { className: 'tri-corner-btn' + (isSel ? ' sel' : '') }, c.label);
      btn.addEventListener('click', () => updateSelected({ rightAngle: c.v }));
      grid.appendChild(btn);
    }
    body.appendChild(el('div', { className: 'field' },
      el('label', {}, 'Right angle corner'),
      grid
    ));
  }

  if (s.role === 'bed') { body.appendChild(bedSection(s)); body.appendChild(bedBloomSection(s)); }
  if (s.role === 'shade') body.appendChild(shadeSunSection(s));

  // Color
  const swatches = el('div', { className: 'swatches' });
  for (const c of SWATCHES) {
    const btn = el('button', { className: 'swatch' + (s.color === c ? ' sel' : ''), style: { background: c } });
    btn.addEventListener('click', () => updateSelected({ color: c }));
    swatches.appendChild(btn);
  }
  const colorInput = el('input', { type: 'color', value: s.color });
  colorInput.addEventListener('input', e => updateSelectedSilent({ color: (e.target as HTMLInputElement).value }));
  body.appendChild(el('div', { className: 'field' },
    el('label', {}, 'Color'),
    swatches,
    el('div', { style: { marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' } },
      el('label', { style: { fontSize: '12px', color: '#57534e' } }, 'Custom:'),
      colorInput)
  ));

  // Opacity (not for outlines; shade with recorded sun is shaded by its sun hours)
  if (s.type === 'line') {
    const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
    cb.checked = !!s.showLength;
    cb.addEventListener('change', () => updateSelected({ showLength: cb.checked }));
    body.appendChild(el('label', { className: 'check-row', 'data-testid': 'show-length' }, cb, el('span', {}, 'Show length on the plan')));
  }
  if (s.role === 'boundary' || s.type === 'line' || s.type === 'text' || (s.role === 'shade' && s.sun)) return finish();
  const opacityVal = s.opacity !== undefined ? s.opacity : 0.65;
  const rangeInput = el('input', { type: 'range', min: '0.05', max: '1', step: '0.05', value: opacityVal });
  const opacityPct = el('span', { style: { fontSize: '12px', color: '#78716c' } }, Math.round(opacityVal * 100) + '%');
  rangeInput.addEventListener('input', e => {
    const v = parseFloat((e.target as HTMLInputElement).value);
    updateSelectedSilent({ opacity: v });
    opacityPct.textContent = Math.round(v * 100) + '%';
  });
  body.appendChild(el('div', { className: 'field' },
    el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
      el('label', {}, 'Opacity'), opacityPct),
    rangeInput,
    el('div', { className: 'hint' }, 'Lower opacity is useful for background features like tree shade.')
  ));

  return finish();

  function finish() {
  // Arrange button
  const arrangeBtn = el('button', { className: 'btn ghost' }, 'Arrange layer order…');
  arrangeBtn.addEventListener('click', () => { state.panel = 'arrange'; render(); });
  body.appendChild(arrangeBtn);

  // Duplicate / Delete
  const dupBtn = el('button', { className: 'btn ghost', html: I.copy + '<span style="margin-left:6px">Duplicate</span>' });
  dupBtn.addEventListener('click', () => { duplicateSelected(); render(); });
  const delBtn = el('button', { className: 'btn danger', html: I.trash + '<span style="margin-left:6px">Delete</span>' });
  delBtn.addEventListener('click', () => { deleteSelected(); render(); });
  body.appendChild(el('div', { className: 'btn-row' }, dupBtn, delBtn));

  return body;
  }
}

/** For circles: which plant this is (size range, reset, edit), or a way to make it one. */
function plantLinkSection(s: CircleShape): HTMLElement {
  const wrap = el('div', { className: 'field', 'data-testid': 'plant-link' });
  const p = s.plantId ? plantsById[s.plantId] : undefined;
  if (!p && s.role && s.role !== 'plant' && s.role !== 'other') return wrap; // a pond or a tree trunk isn't a plant to link
  if (!p) {
    const link = el('button', { className: 'btn ghost' }, s.plantId ? 'Link to a plant again…' : 'Link to a plant…');
    link.addEventListener('click', () => { state.pickerLinkId = s.id; state.panel = 'plants'; render(); });
    wrap.appendChild(link);
    wrap.appendChild(el('div', { className: 'hint' }, s.plantId
      ? "This plant's details aren't on this device (removed from My plants, or the plan came from someone else). Its size and name are kept."
      : 'Pick the plant this circle stands for: it takes the plant\'s size and sun needs, and shows in the plant list.'));
    return wrap;
  }
  const sizes = `Spread ${formatSize(p.width as Range | undefined) || 'unknown'}. Drawn at ${state.sizeMode === 'full' ? 'full' : 'typical'} size (change in Layers).`;
  wrap.appendChild(el('div', { className: 'hint' }, sizes));
  const row = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' } });
  const target = plantRadius(p, state.sizeMode);
  if (s.radius !== target) {
    const reset = el('button', { className: 'btn ghost', style: { flex: '1' } }, `Reset to plant size (${target} ft radius)`);
    reset.addEventListener('click', () => updateSelected({ radius: target, sizeFrom: 'plant' }));
    row.appendChild(reset);
  }
  if (isMine(p)) {
    const edit = el('button', { className: 'btn ghost', style: { flex: '1' } }, `Edit "${p.common}" in My plants`);
    edit.addEventListener('click', () => { state.plantForm = { editId: p.id, place: false }; state.panel = 'plantForm'; render(); });
    row.appendChild(edit);
  }
  if (row.childNodes.length) wrap.appendChild(row);
  return wrap;
}

export function renderPropsPanelMulti(selected: Shape[]) {
  const body = el('div', { className: 'sheet-body' });
  body.appendChild(el('div', { className: 'banner' },
    selected.length + ' shapes selected. Use the buttons below to act on all of them. Edit individual properties one at a time.'));

  const roles = new Set(selected.map(roleKey));
  body.appendChild(el('div', { className: 'field' }, el('label', {}, 'Role (applies to all selected)'),
    roleChips(roles.size === 1 ? [...roles][0] : null, (role) => { setRoleForIds(state.selectedIds, role); render(); })));
  body.appendChild(statusSection(selected));

  // Common locked state
  const allLocked = selected.every(s => s.locked);
  const lockBtn = el('button', { className: 'btn ghost',
    html: (allLocked ? I.unlock : I.lock) + '<span style="margin-left:6px">' + (allLocked ? 'Unlock all' : 'Lock all') + '</span>' });
  lockBtn.addEventListener('click', () => {
    setLockedForIds(state.selectedIds, !allLocked);
    render();
  });
  body.appendChild(lockBtn);

  // Duplicate, copy, delete
  const dupBtn = el('button', { className: 'btn ghost', html: I.copy + '<span style="margin-left:6px">Duplicate</span>' });
  dupBtn.addEventListener('click', () => { duplicateSelected(); render(); });
  const copyBtn = el('button', { className: 'btn ghost', html: I.copy + '<span style="margin-left:6px">Copy to clipboard</span>' });
  copyBtn.addEventListener('click', () => { copySelected(); alert(selected.length + ' shapes copied. Use Paste in any project to bring them in.'); });
  const delBtn = el('button', { className: 'btn danger', html: I.trash + '<span style="margin-left:6px">Delete all</span>' });
  delBtn.addEventListener('click', () => { deleteSelected(); render(); });
  body.appendChild(dupBtn);
  body.appendChild(copyBtn);
  body.appendChild(delBtn);

  return body;
}

export function renderPropsPanel() {
  const selected = getSelected();
  if (selected.length === 0) return null;
  const single = selected.length === 1 ? selected[0] : null;
  const title = single ?
    (typeName(single.type).charAt(0).toUpperCase() + typeName(single.type).slice(1)) + ' properties' :
    selected.length + ' shapes selected';

  // Header
  const header = el('div', { className: 'sheet-header' });
  header.appendChild(el('div', { className: 'title' }, title));
  const headerRight = el('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } });
  if (single) {
    const lockBtn = el('button', {
      className: 'lockbtn ' + (single.locked ? 'on' : 'off'),
      html: (single.locked ? I.lock : I.unlock) + '<span style="margin-left:6px">' + (single.locked ? 'Locked' : 'Unlocked') + '</span>'
    });
    lockBtn.addEventListener('click', () => updateSelected({ locked: !single.locked }));
    headerRight.appendChild(lockBtn);
  }
  const closeBtn = el('button', { className: 'iconbtn', html: I.x });
  closeBtn.addEventListener('click', () => { state.panel = null; render(); });
  headerRight.appendChild(closeBtn);
  header.appendChild(headerRight);

  const body = single ? renderPropsPanelSingle(single) : renderPropsPanelMulti(selected);
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

export function renderArrangePanel() {
  const s = singleSelected();
  if (!s) return null;
  const i = state.shapes.findIndex(sh => sh.id === s.id);
  const canFwd = findNextSameTier(state.shapes, i, 1) !== -1;
  const canBack = findNextSameTier(state.shapes, i, -1) !== -1;
  const grid = el('div', { className: 'arrange-grid' });
  const front = el('button', { html: I.arrangeFront + '<span>Bring to front</span>' });
  front.disabled = !canFwd;
  front.addEventListener('click', () => { bringToFront(s.id); state.panel = 'props'; render(); });
  const fwd = el('button', { html: I.arrangeForward + '<span>Bring forward</span>' });
  fwd.disabled = !canFwd;
  fwd.addEventListener('click', () => { bringForward(s.id); state.panel = 'props'; render(); });
  const back = el('button', { html: I.arrangeBackward + '<span>Send backward</span>' });
  back.disabled = !canBack;
  back.addEventListener('click', () => { sendBackward(s.id); state.panel = 'props'; render(); });
  const toBack = el('button', { html: I.arrangeBack + '<span>Send to back</span>' });
  toBack.disabled = !canBack;
  toBack.addEventListener('click', () => { sendToBack(s.id); state.panel = 'props'; render(); });
  grid.appendChild(front);
  grid.appendChild(fwd);
  grid.appendChild(back);
  grid.appendChild(toBack);
  const backBtn = el('button', { className: 'btn ghost' }, '← Back to properties');
  backBtn.addEventListener('click', () => { state.panel = 'props'; render(); });
  const body = el('div', { className: 'sheet-body' },
    el('div', { className: 'hint', style: { fontSize: '13px', color: '#57534e' } },
      s.locked ? 'Reorders within the locked (background) layer. Locked shapes always render behind unlocked ones.' :
      'Reorders within the unlocked layer. Locked shapes always render behind these.'),
    grid,
    backBtn
  );
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Arrange layer order'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = 'props'; render(); } });
  return overlay;
}
