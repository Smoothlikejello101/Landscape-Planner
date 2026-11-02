import { lookShown, shapeDot } from '../plant-looks';
import { setPlantLooks, setShowFullSize } from '../view-settings';
import { el, svgEl, ts } from '../dom';
import { flushHistoryDebounce, pushHistory } from '../history';
import { I } from '../icons';
import { centerOnShape, deletePhase, setRoleView, setViewFilter } from '../mutations';
import { passesFilter, STATUSES, statusLabelFor } from '../status';
import { isLocked, ROLES, roleHidden, roleKey, roleLabel } from '../roles';
import type { RoleKey, ShapeFilter } from '../types';
import { isSelected, selectOnly } from '../selection';
import { state } from '../state';
import { save } from '../storage';
import { render } from './render';
import { plantsInBed } from '../beds';
import { sunListText } from './role-sections';
import { applySizeMode, plantsToResize } from '../my-plants';
import { boxSize, shapePerimeter } from '../geometry';
import { typeName } from '../util';
import { updateBgImageSilent } from '../background';
import { ask } from './ask';
import { sheetTitle } from './props-panel';
import { settingsLink } from './settings-panel';

const fmtFt = (v: number) => String(Math.round(v * 10) / 10);

export function renderLayersPanel() {
  // (Locked either way, by itself or with its layer: round 3, Jordan and Alex read "2 locked" with the whole Plant
  // layer locked as a contradiction.)
  const lockedCount = state.shapes.filter(isLocked).length;
  // (The name on its button: Layers.)
  const n = state.shapes.length;
  const headerTitle = `Layers · ${n} shape${n === 1 ? '' : 's'}${lockedCount ? ', ' + lockedCount + ' locked' : ''}`;
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, headerTitle),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );
  const list = el('div', {});
  if (state.bgImage) list.appendChild(backgroundSection());
  else if (state.photoElsewhere) {
    // The plan has a photo this device doesn't: say where it went, rather than leaving no row at all.
    const away = state.photoElsewhere;
    list.appendChild(el('div', { className: 'role-rows', 'data-testid': 'layers-bg' }, el('div', { className: 'section-label' }, 'Background'),
      el('div', { className: 'hint', style: { padding: '0 16px' } }, 'deviceOnly' in away
        ? 'This plan’s background photo is kept on another device only.'
        : 'This plan’s background photo hasn’t come down to this device yet. It will at the next sync.')));
  }
  if (state.shapes.length) list.appendChild(roleSection());
  if (state.shapes.some((s) => s.plantId)) list.appendChild(plantSizeSection());
  if (state.shapes.some((s) => s.role === 'plant' || s.status || s.phase) || state.phases.length) list.appendChild(showSection());
  // (Warnings, drawing and text size moved to Settings, in ⋮: Jason, Oct 31, from round 3. A line here says where.)
  list.appendChild(settingsLink());
  if (state.shapes.length === 0) {
    list.appendChild(el('div', { style: { padding: '32px', textAlign: 'center', color: '#78716c', fontSize: ts(14) } }, 'No shapes yet.'));
  } else {
    const reversed = [...state.shapes].reverse();
    for (const s of reversed) {
      const sel = isSelected(s.id);
      let dims;
      if (s.type === 'circle') dims = fmtFt(s.radius * 2) + (s.role === 'plant' ? ' ft spread' : ' ft across');
      else if (s.type === 'line') dims = fmtFt(shapePerimeter(s)) + ' ft long';
      else if (s.type === 'text') dims = 'text · ' + fmtFt(s.fontSize) + ' ft tall';
      else if (s.type === 'poly') dims = s.points.length + ' points · ' + fmtFt(boxSize(s).w) + ' × ' + fmtFt(boxSize(s).h) + ' ft';
      else dims = s.width + ' × ' + s.height + ' ft';
      const opacity = s.opacity !== undefined ? s.opacity : 0.65;
      // ("Existing" for a bed or a house, with no planting date: only plants are planted.)
      const when = s.status === 'planted' && s.role === 'plant' ? s.plantedOn : s.status === 'gone' ? s.goneOn : undefined;
      const extra = (s.status ? statusLabelFor(s) + (when ? ' ' + when : '') + ' · ' : '') +
        (s.phase ? s.phase + ' · ' : '') +
        (s.role === 'shade' && s.sun ? sunListText(s.sun) + ' · '
        : s.role === 'bed' ? plantsInBed(s, state.shapes).filter((p) => p.status !== 'gone').length + ' plants · ' : '');
      const meta = extra + dims + ' · at (' + s.x + ', ' + s.y + ') ft' +
        (opacity < 1 && !lookShown(s) ? ' · ' + Math.round(opacity * 100) + '% opacity' : '') + // (a plant drawn as its picture has none: round 3, Hank)
        (s.rotation ? ' · ' + s.rotation + '°' : '');
      // Visual swatch matches shape type
      let swatch;
      if (s.type === 'circle') {
        // (A plant drawn as its picture: its flowers' color, as the picker's dot: round 3, Grace and Bea.)
        swatch = lookShown(s) ? el('div', { className: 'layer-sw circle', style: { background: shapeDot(s) } }) : el('div', { className: 'layer-sw circle', style: { background: s.color, opacity: opacity } });
      } else if (s.type === 'rect') {
        swatch = el('div', { className: 'layer-sw rect', style: { background: s.color, opacity: opacity } });
      } else if (s.type === 'oval') {
        swatch = el('div', { className: 'layer-sw', style: { background: s.color, opacity: opacity, borderRadius: '50%/30%' } });
      } else if (s.type === 'triangle') {
        // Render an inline SVG triangle as the swatch
        swatch = el('div', { className: 'layer-sw', style: { background: 'transparent', border: 'none' } },
          svgEl('svg', { width: 32, height: 32, viewBox: '0 0 32 32' },
            svgEl('polygon', { points: '2,30 30,30 2,2', fill: s.color, 'fill-opacity': opacity, stroke: '#d6d3d1', 'stroke-width': 1 })));
      } else if (s.type === 'poly') {
        swatch = el('div', { className: 'layer-sw', style: { background: 'transparent', border: 'none' } },
          svgEl('svg', { width: 32, height: 32, viewBox: '0 0 32 32' },
            svgEl('polygon', { points: '4,10 16,2 30,12 24,30 6,26', fill: s.color, 'fill-opacity': opacity, stroke: '#d6d3d1', 'stroke-width': 1 })));
      } else if (s.type === 'text') {
        swatch = el('div', { className: 'layer-sw', style: { background: 'transparent', border: 'none', color: s.color, fontWeight: '700', fontSize: ts(20), display: 'flex', alignItems: 'center', justifyContent: 'center' } }, 'T');
      } else {
        swatch = el('div', { className: 'layer-sw', style: { background: 'transparent', border: 'none' } },
          svgEl('svg', { width: 32, height: 32, viewBox: '0 0 32 32' },
            svgEl('polyline', { points: '2,26 12,8 22,22 30,4', fill: 'none', stroke: s.color, 'stroke-width': 3, 'stroke-linejoin': 'round' })));
      }
      // (A button to a keyboard and a screen reader: Enter selects it, as a tap on the row does. Alex, Oct 30: only the
      // padlocks could be reached with Tab.)
      const name = s.label || 'unlabeled ' + typeName(s.type);
      const info = el('div', { className: 'layer-info', role: 'button', tabIndex: 0, 'aria-label': `Select ${name}`, 'data-testid': 'layer-select' },
        s.label
          ? el('div', { className: 'layer-label' }, s.label)
          : el('div', { className: 'layer-label empty' }, sheetTitle(s)),
        el('div', { className: 'layer-meta' },
          el('span', { className: 'layer-role' }, roleLabel(roleKey(s)) + (roleHidden(s) ? ' · hidden' : '')), meta)
      );
      const lockBtn = el('button', {
        className: 'layer-lock ' + (s.locked ? 'on' : ''),
        html: s.locked ? I.lock : I.unlock,
        title: s.locked ? 'Unlock' : 'Lock',
        'aria-label': (s.locked ? 'Unlock ' : 'Lock ') + (s.label || 'unlabeled ' + typeName(s.type)),
        'aria-pressed': s.locked ? 'true' : 'false',
      });
      lockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        s.locked = !s.locked;
        flushHistoryDebounce(); pushHistory();
        save(); render();
      });
      // (The lock leads the row, as the eye and lock do above, and the checkboxes: each control beside what it controls.)
      const row = el('div', { className: 'layer-row' + (sel ? ' sel' : '') }, lockBtn, swatch, info);
      row.addEventListener('click', () => {
        if (roleHidden(s)) setRoleView(roleKey(s), { hidden: false }); // show what was asked for
        if (!passesFilter(s, state.viewFilter)) setViewFilter({ status: '', phase: '', showGone: s.status === 'gone' });
        selectOnly(s.id);
        centerOnShape(s.id);
        state.panel = null;
        render();
      });
      info.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); } });
      list.appendChild(row);
    }
  }
  const sheet = el('div', { className: 'sheet' }, header, list);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

/** Show/hide and lock every shape of a role. Lists only roles in use. */
/** Which plants show: by status and phase; phases can be removed here. */
function showSection(): HTMLElement {
  const f = state.viewFilter;
  const wrap = el('div', { className: 'role-rows', 'data-testid': 'show-filter' }, el('div', { className: 'section-label' }, 'Show plants'));
  const status = el('select', { 'data-testid': 'filter-status', 'aria-label': 'Status' }) as HTMLSelectElement;
  status.appendChild(el('option', { value: '' }, 'Any status'));
  for (const st of STATUSES) status.appendChild(el('option', { value: st.key }, st.label));
  status.value = f.status;
  status.addEventListener('change', () => { setViewFilter({ status: status.value as ShapeFilter['status'] }); render(); });
  const phase = el('select', { 'data-testid': 'filter-phase', 'aria-label': 'Phase' }) as HTMLSelectElement;
  phase.appendChild(el('option', { value: '' }, 'Any phase'));
  for (const p of state.phases) phase.appendChild(el('option', { value: p }, p));
  phase.value = f.phase;
  phase.addEventListener('change', () => { setViewFilter({ phase: phase.value }); render(); });
  wrap.appendChild(el('div', { style: { display: 'flex', gap: '8px' } },
    el('div', { className: 'field', style: { flex: '1', margin: 0 } }, status),
    el('div', { className: 'field', style: { flex: '1', margin: 0 } }, phase)));
  const gone = state.shapes.filter((s) => s.status === 'gone').length;
  if (gone) {
    const cb = el('input', { type: 'checkbox', 'data-testid': 'show-gone' }) as HTMLInputElement;
    cb.checked = f.showGone;
    cb.addEventListener('change', () => { setViewFilter({ showGone: cb.checked }); render(); });
    wrap.appendChild(el('label', { className: 'check-row', style: { marginTop: '6px' } }, cb, el('span', {}, `Show gone plants and shapes (${gone})`)));
  }
  if (state.phases.length) {
    const list = el('div', { className: 'phase-list' });
    for (const p of state.phases) {
      const n = state.shapes.filter((s) => s.phase === p).length;
      const del = el('button', { className: 'iconbtn', html: I.x, title: 'Remove phase', 'aria-label': 'Remove phase ' + p });
      del.addEventListener('click', async () => {
        if (n && !(await ask(`Remove the phase \u201c${p}\u201d? ${n} shape${n === 1 ? '' : 's'} in it will have no phase.`, { ok: 'Remove it' }))) return;
        deletePhase(p); render();
      });
      list.appendChild(el('div', { className: 'phase-row' }, el('span', {}, p), el('span', { className: 'count' }, String(n)), del));
    }
    wrap.appendChild(el('div', { className: 'hint', style: { marginTop: '8px' } }, 'Phases'));
    wrap.appendChild(list);
  }
  return wrap;
}

/** Plan-wide plant size: typical or full, and full-size rings for every plant. */
function plantSizeSection(): HTMLElement {
  const wrap = el('div', { className: 'role-rows', 'data-testid': 'plant-size' }, el('div', { className: 'section-label' }, 'Plants'));
  const seg = el('div', { className: 'seg', role: 'group', 'aria-label': 'Draw plants at' });
  for (const [mode, label] of [['typical', 'Typical size'], ['full', 'Full size']] as const) {
    const b = el('button', { className: state.sizeMode === mode ? 'sel' : '', 'aria-pressed': String(state.sizeMode === mode) }, label);
    b.addEventListener('click', async () => {
      if (state.sizeMode === mode) return;
      const n = plantsToResize(state.shapes, mode).length;
      if (n && !(await ask(`Redraw ${n} plant${n === 1 ? '' : 's'} at ${mode === 'full' ? 'full' : 'typical'} size? Plants you resized by hand keep their size.`, { ok: 'Redraw them', testid: 'ask-size-mode' }))) return;
      if (state.sizeMode === mode) return;
      applySizeMode(mode);
      render();
    });
    seg.appendChild(b);
  }
  wrap.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
    el('span', { style: { fontSize: ts(13), color: '#57534e' } }, 'Draw plants at'), seg));
  const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
  cb.checked = state.showFullSize;
  cb.disabled = state.sizeMode === 'full';
  cb.addEventListener('change', () => { setShowFullSize(cb.checked); render(); });
  wrap.appendChild(el('label', { className: 'check-row', style: { marginTop: '6px' } }, cb,
    el('span', {}, 'Show full-size rings on every plant (check for crowding)')));
  // (What the rings look like, said: the UI review, 2026-11-01, saw dashed rings round its perennials, and nothing here
  // said that's what they were.)
  wrap.appendChild(el('div', { className: 'hint', 'data-testid': 'full-ring-hint' }, 'Typical is the size its sources point to, within its range; full is the top of the range. A full-size ring is the dashed ring around a plant drawn smaller than it grows; selected plants always show theirs.'));
  // Drawn as illustrations, or as plain circles (src/looks.ts): on this device.
  const looks = el('input', { type: 'checkbox', 'data-testid': 'plant-looks' }) as HTMLInputElement;
  looks.checked = state.plantLooks;
  looks.addEventListener('change', () => { setPlantLooks(looks.checked); render(); });
  wrap.appendChild(el('label', { className: 'check-row', style: { marginTop: '6px' } }, looks,
    el('span', {}, 'Draw plants as pictures, in bloom (off: plain colored circles)')));
  return wrap;
}

/** The background image: shown or hidden, and how faint, beside the layers' own (the rest is in ⋮ → Background image). */
function backgroundSection(): HTMLElement {
  const bg = state.bgImage!;
  const wrap = el('div', { className: 'role-rows', 'data-testid': 'layers-bg' }, el('div', { className: 'section-label' }, 'Background'));
  const eye = el('button', {
    className: bg.visible ? 'on' : '', html: bg.visible ? I.eye : I.eyeOff,
    title: bg.visible ? 'Hide' : 'Show', 'aria-label': (bg.visible ? 'Hide' : 'Show') + ' the background image',
    'aria-pressed': bg.visible ? 'true' : 'false', 'data-action': 'toggle-bg',
  });
  // While placing or calibrating the image, it stays shown (those modes work on it; finish them first).
  const busy = state.bgEditMode || !!state.bgCalibrate;
  eye.disabled = busy;
  // One tap, one step to undo (not merged with a slide just before it).
  eye.addEventListener('click', () => { flushHistoryDebounce(); bg.visible = !bg.visible; pushHistory(); save(); render(); });
  const more = el('button', { className: 'link-btn', 'data-testid': 'layers-bg-more' }, 'Adjust\u2026');
  more.disabled = busy;
  more.addEventListener('click', () => { state.panel = 'bg'; render(); });
  wrap.appendChild(el('div', { className: 'role-row' + (bg.visible ? '' : ' hidden') }, eye, el('span', { className: 'name' }, 'Background image'), more));
  // Opacity: redraws the plan only, so the slider keeps its place (and the keyboard, on a phone).
  const pct = el('span', { className: 'count' }, Math.round(bg.opacity * 100) + '%');
  const slider = el('input', { type: 'range', min: '0.05', max: '1', step: '0.05', value: String(bg.opacity), 'aria-label': 'Background image opacity', 'data-testid': 'layers-bg-opacity' });
  slider.disabled = !bg.visible;
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    updateBgImageSilent({ opacity: v });
    pct.textContent = Math.round(v * 100) + '%';
  });
  slider.setAttribute('aria-valuetext', Math.round(bg.opacity * 100) + '%');
  slider.addEventListener('input', () => slider.setAttribute('aria-valuetext', pct.textContent ?? ''));
  wrap.appendChild(el('div', { className: 'role-row bg-opacity' }, el('span', { className: 'name' }, 'Opacity'), slider, pct));
  if (busy) wrap.appendChild(el('div', { className: 'hint', style: { padding: '0 16px' } }, 'Finish placing the image (or its scale) to hide it.'));
  return wrap;
}

function roleSection(): HTMLElement {
  const counts = new Map<RoleKey, number>();
  for (const s of state.shapes) counts.set(roleKey(s), (counts.get(roleKey(s)) ?? 0) + 1);
  const keys: RoleKey[] = [...ROLES.map((r) => r.key), 'unassigned'].filter((k) => counts.has(k as RoleKey)) as RoleKey[];
  const wrap = el('div', { className: 'role-rows' }, el('div', { className: 'section-label' }, 'Show and lock by role'));
  // The same as the button under the zoom buttons.
  const names = el('input', { type: 'checkbox', 'data-testid': 'show-names' }) as HTMLInputElement;
  names.checked = state.showNames;
  names.addEventListener('change', () => { state.showNames = names.checked; render(); });
  wrap.appendChild(el('label', { className: 'check-row', style: { padding: '0 16px 6px' } }, names,
    el('span', {}, 'Show names, lengths, sun hours and plant badges')));
  // A shape locked by itself (a house) while its layer isn't: the row says so, beside the layer's open lock, as a
  // shape's lock, not the layer's (round 2, Oct 30: "1 locked" in the header and an open padlock on Building read as
  // "the house is unlocked"; round 3, Alex and Jordan: "Building · 1, locked" beside an open padlock read as a
  // contradiction).
  const shapeLocks = (k: RoleKey, roleLocked?: boolean) => {
    if (roleLocked) return '';
    const n = state.shapes.filter((s) => roleKey(s) === k && s.locked).length;
    return n ? ` \u00b7 ${n} locked shape${n === 1 ? '' : 's'}` : '';
  };
  for (const k of keys) {
    const v = state.roleViews[k] ?? {};
    const eye = el('button', {
      className: v.hidden ? '' : 'on', html: v.hidden ? I.eyeOff : I.eye,
      title: v.hidden ? 'Show' : 'Hide', 'aria-label': (v.hidden ? 'Show ' : 'Hide ') + roleLabel(k),
      'aria-pressed': v.hidden ? 'false' : 'true', 'data-action': 'toggle-hidden',
    });
    eye.addEventListener('click', () => { setRoleView(k, { hidden: !v.hidden }); render(); });
    const lock = el('button', {
      className: v.locked ? 'on' : '', html: v.locked ? I.lock : I.unlock,
      title: v.locked ? 'Unlock' : 'Lock', 'aria-label': (v.locked ? 'Unlock ' : 'Lock ') + roleLabel(k),
      'aria-pressed': v.locked ? 'true' : 'false', 'data-action': 'toggle-locked',
    });
    lock.addEventListener('click', () => { setRoleView(k, { locked: !v.locked }); render(); });
    // (The eye and lock lead the row, beside the name they act on; the count follows the name: "Plant · 2".)
    wrap.appendChild(el('div', { className: 'role-row' + (v.hidden ? ' hidden' : ''), 'data-role-key': k }, eye, lock,
      el('span', { className: 'name' }, roleLabel(k), el('span', { className: 'count' }, ` · ${counts.get(k)}${shapeLocks(k, v.locked)}`))));
  }
  return wrap;
}
