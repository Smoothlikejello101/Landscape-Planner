import { el, svgEl } from '../dom';
import { flushHistoryDebounce, pushHistory } from '../history';
import { I } from '../icons';
import { centerOnShape, setRoleView } from '../mutations';
import { ROLES, roleHidden, roleKey, roleLabel } from '../roles';
import type { RoleKey } from '../types';
import { isSelected, selectOnly } from '../selection';
import { state } from '../state';
import { save } from '../storage';
import { render } from './render';
import { plantsInBed } from '../beds';
import { sunListText } from './role-sections';
import { applySizeMode, plantsToResize } from '../my-plants';
import { boxSize, shapePerimeter } from '../geometry';
import { typeName } from '../util';

const fmtFt = (v: number) => String(Math.round(v * 10) / 10);

export function renderLayersPanel() {
  const lockedCount = state.shapes.filter(s => s.locked).length;
  const headerTitle = `Shapes (${state.shapes.length}${lockedCount ? ' · ' + lockedCount + ' locked' : ''})`;
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, headerTitle),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );
  const list = el('div', {});
  if (state.shapes.length) list.appendChild(roleSection());
  if (state.shapes.some((s) => s.plantId)) list.appendChild(plantSizeSection());
  if (state.shapes.length === 0) {
    list.appendChild(el('div', { style: { padding: '32px', textAlign: 'center', color: '#78716c', fontSize: '14px' } }, 'No shapes yet.'));
  } else {
    const reversed = [...state.shapes].reverse();
    for (const s of reversed) {
      const sel = isSelected(s.id);
      let dims;
      if (s.type === 'circle') dims = s.radius + ' ft radius';
      else if (s.type === 'line') dims = fmtFt(shapePerimeter(s)) + ' ft long';
      else if (s.type === 'text') dims = 'text · ' + fmtFt(s.fontSize) + ' ft tall';
      else if (s.type === 'poly') dims = s.points.length + ' points · ' + fmtFt(boxSize(s).w) + ' × ' + fmtFt(boxSize(s).h) + ' ft';
      else dims = s.width + ' × ' + s.height + ' ft';
      const opacity = s.opacity !== undefined ? s.opacity : 0.65;
      const extra = s.role === 'shade' && s.sun ? sunListText(s.sun) + ' · '
        : s.role === 'bed' ? plantsInBed(s, state.shapes).length + ' plants · ' : '';
      const meta = extra + dims + ' · at (' + s.x + ', ' + s.y + ') ft' +
        (opacity < 1 ? ' · ' + Math.round(opacity * 100) + '% opacity' : '') +
        (s.rotation ? ' · ' + s.rotation + '°' : '');
      // Visual swatch matches shape type
      let swatch;
      if (s.type === 'circle') {
        swatch = el('div', { className: 'layer-sw circle', style: { background: s.color, opacity: opacity } });
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
        swatch = el('div', { className: 'layer-sw', style: { background: 'transparent', border: 'none', color: s.color, fontWeight: '700', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, 'T');
      } else {
        swatch = el('div', { className: 'layer-sw', style: { background: 'transparent', border: 'none' } },
          svgEl('svg', { width: 32, height: 32, viewBox: '0 0 32 32' },
            svgEl('polyline', { points: '2,26 12,8 22,22 30,4', fill: 'none', stroke: s.color, 'stroke-width': 3, 'stroke-linejoin': 'round' })));
      }
      const info = el('div', { className: 'layer-info' },
        s.label
          ? el('div', { className: 'layer-label' }, s.label)
          : el('div', { className: 'layer-label empty' }, 'Unlabeled ' + typeName(s.type)),
        el('div', { className: 'layer-meta' },
          el('span', { className: 'layer-role' }, roleLabel(roleKey(s)) + (roleHidden(s) ? ' · hidden' : '')), meta)
      );
      const lockBtn = el('button', {
        className: 'layer-lock ' + (s.locked ? 'on' : ''),
        html: s.locked ? I.lock : I.unlock,
        title: s.locked ? 'Unlock' : 'Lock'
      });
      lockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        s.locked = !s.locked;
        flushHistoryDebounce(); pushHistory();
        save(); render();
      });
      const row = el('div', { className: 'layer-row' + (sel ? ' sel' : '') }, swatch, info, lockBtn);
      row.addEventListener('click', () => {
        if (roleHidden(s)) setRoleView(roleKey(s), { hidden: false }); // show what was asked for
        selectOnly(s.id);
        centerOnShape(s.id);
        state.panel = null;
        render();
      });
      list.appendChild(row);
    }
  }
  const sheet = el('div', { className: 'sheet' }, header, list);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

/** Show/hide and lock every shape of a role. Lists only roles in use. */
/** Plan-wide plant size: typical or full, and full-size rings for every plant. */
function plantSizeSection(): HTMLElement {
  const wrap = el('div', { className: 'role-rows', 'data-testid': 'plant-size' }, el('div', { className: 'section-label' }, 'Plant size'));
  const seg = el('div', { className: 'seg', role: 'group', 'aria-label': 'Draw plants at' });
  for (const [mode, label] of [['typical', 'Typical size'], ['full', 'Full size']] as const) {
    const b = el('button', { className: state.sizeMode === mode ? 'sel' : '', 'aria-pressed': String(state.sizeMode === mode) }, label);
    b.addEventListener('click', () => {
      if (state.sizeMode === mode) return;
      const n = plantsToResize(state.shapes, mode).length;
      if (n && !confirm(`Redraw ${n} plant${n === 1 ? '' : 's'} at ${mode === 'full' ? 'full' : 'typical'} size? Plants you resized by hand keep their size.`)) return;
      applySizeMode(mode);
      render();
    });
    seg.appendChild(b);
  }
  wrap.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
    el('span', { style: { fontSize: '13px', color: '#57534e' } }, 'Draw plants at'), seg));
  const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
  cb.checked = state.showFullSize;
  cb.disabled = state.sizeMode === 'full';
  cb.addEventListener('change', () => { state.showFullSize = cb.checked; render(); });
  wrap.appendChild(el('label', { className: 'check-row', style: { marginTop: '6px' } }, cb,
    el('span', {}, 'Show full-size rings on every plant (check for crowding)')));
  wrap.appendChild(el('div', { className: 'hint' }, 'Typical is the middle of a plant\'s size range; full is the top. Selected plants always show their full-size ring.'));
  return wrap;
}

function roleSection(): HTMLElement {
  const counts = new Map<RoleKey, number>();
  for (const s of state.shapes) counts.set(roleKey(s), (counts.get(roleKey(s)) ?? 0) + 1);
  const keys: RoleKey[] = [...ROLES.map((r) => r.key), 'unassigned'].filter((k) => counts.has(k as RoleKey)) as RoleKey[];
  const wrap = el('div', { className: 'role-rows' }, el('div', { className: 'section-label' }, 'Show and lock by role'));
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
    wrap.appendChild(el('div', { className: 'role-row' + (v.hidden ? ' hidden' : ''), 'data-role-key': k },
      el('span', { className: 'name' }, roleLabel(k)),
      el('span', { className: 'count' }, String(counts.get(k))), eye, lock));
  }
  return wrap;
}
