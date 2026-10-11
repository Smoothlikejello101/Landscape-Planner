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

export function renderLayersPanel() {
  const lockedCount = state.shapes.filter(s => s.locked).length;
  const headerTitle = `Shapes (${state.shapes.length}${lockedCount ? ' · ' + lockedCount + ' locked' : ''})`;
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, headerTitle),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );
  const list = el('div', {});
  if (state.shapes.length) list.appendChild(roleSection());
  if (state.shapes.length === 0) {
    list.appendChild(el('div', { style: { padding: '32px', textAlign: 'center', color: '#78716c', fontSize: '14px' } }, 'No shapes yet.'));
  } else {
    const reversed = [...state.shapes].reverse();
    for (const s of reversed) {
      const sel = isSelected(s.id);
      let dims;
      if (s.type === 'circle') dims = s.radius + ' ft radius';
      else dims = s.width + ' × ' + s.height + ' ft';
      const opacity = s.opacity !== undefined ? s.opacity : 0.65;
      const meta = dims + ' · at (' + s.x + ', ' + s.y + ') ft' +
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
      }
      const info = el('div', { className: 'layer-info' },
        s.label
          ? el('div', { className: 'layer-label' }, s.label)
          : el('div', { className: 'layer-label empty' }, 'Unlabeled ' + s.type),
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
