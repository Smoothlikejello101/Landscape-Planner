import { el } from '../dom';
import { startFeaturePlace } from '../feature-edit';
import { kindsFor, SUB_FEATURES } from '../features';
import { updateSelected, updateSelectedSilent } from '../mutations';
import { isLocked } from '../roles';
import type { Shape, SubFeature } from '../types';
import { render } from './render';

// The properties' section for what sits on a shape's edges (src/features.ts): each listed, its width typed in place,
// taken off with ✕; and buttons to add more, tapped onto the plan.

/** The section's title: "Doors, windows and more", "Gates", "Steps". */
export function featuresTitle(s: Shape): string {
  return s.role === 'building' ? 'Doors, windows and more' : s.role === 'boundary' ? 'Gates' : 'Steps';
}
const PLURAL: Record<SubFeature['kind'], string> = {
  door: 'doors', window: 'windows', garage: 'garage doors', steps: 'sets of steps', gate: 'gates',
  downspout: 'downspouts', spigot: 'hose bibs', ac: 'AC units', meter: 'meters',
};
/** "Door, 2 windows, AC unit", or "None yet". */
export function featuresSummary(s: Shape): string {
  const fs = s.type === 'circle' || s.type === 'text' ? [] : s.features ?? [];
  if (!fs.length) return 'None yet';
  const counts = new Map<SubFeature['kind'], number>();
  for (const f of fs) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  const text = [...counts].map(([k, n]) => (n === 1 ? SUB_FEATURES[k].label.replace(/^(?!AC)(\w)/, (c) => c.toLowerCase()) : `${n} ${PLURAL[k]}`)).join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function featuresSection(s: Shape): HTMLElement {
  const wrap = el('div', { className: 'feature-section', 'data-testid': 'feature-section' });
  if (s.type === 'circle' || s.type === 'text') return wrap;
  const locked = isLocked(s);
  const list = el('div', { className: 'feature-list' });
  // (Numbered within each kind, in the order they were added: "Window 2".)
  const seen = new Map<string, number>();
  for (const f of s.features ?? []) {
    const info = SUB_FEATURES[f.kind];
    const n = (seen.get(f.kind) ?? 0) + 1;
    seen.set(f.kind, n);
    const many = (s.features ?? []).filter((x) => x.kind === f.kind).length > 1;
    const row = el('div', { className: 'feature-row', 'data-feature-id': f.id }, el('span', { className: 'feature-name' }, info.label + (many ? ` ${n}` : '')));
    if (info.width) {
      // Typed without re-rendering (keyboard safety): only the plan redraws.
      const [, lo, hi] = info.width;
      const w = el('input', { type: 'number', min: String(lo), max: String(hi), step: '0.5', inputMode: 'decimal', value: f.width ?? info.width[0], 'aria-label': `${info.label} width in feet`, 'data-testid': 'feature-width' }) as HTMLInputElement;
      w.disabled = locked;
      w.addEventListener('input', () => {
        const v = parseFloat(w.value.replace(',', '.'));
        if (!(v >= lo && v <= hi)) return; // (a passing "0" mustn't shrink it to nothing)
        updateSelectedSilent({ features: (s.features ?? []).map((x) => (x.id === f.id ? { ...x, width: v } : x)) });
      });
      w.addEventListener('change', () => { const v = parseFloat(w.value.replace(',', '.')); if (!(v >= lo && v <= hi)) w.value = String(f.width ?? info.width![0]); });
      row.appendChild(el('label', { className: 'feature-width' }, w, el('span', {}, 'ft wide')));
    }
    const del = el('button', { className: 'iconbtn feature-del', 'aria-label': `Take off ${info.label.toLowerCase()}`, title: 'Take it off', 'data-testid': 'feature-delete' }, '✕');
    del.disabled = locked;
    del.addEventListener('click', () => updateSelected({ features: (s.features ?? []).filter((x) => x.id !== f.id) }));
    row.appendChild(del);
    list.appendChild(row);
  }
  wrap.appendChild(list);
  // Adding: a button per kind; then tap where it goes.
  const adds = el('div', { className: 'feature-adds' });
  for (const k of kindsFor(s)) {
    const b = el('button', { className: 'chip feature-add', 'data-feature': k, 'data-testid': 'feature-add' }, '+ ' + SUB_FEATURES[k].label);
    b.disabled = locked;
    b.addEventListener('click', () => { startFeaturePlace(s.id, k); render(); });
    adds.appendChild(b);
  }
  wrap.appendChild(adds);
  wrap.appendChild(el('div', { className: 'hint' }, locked
    ? 'Unlock it to add or change these.'
    : 'Tap one to add it, then tap where it goes on the plan. Drag one along the edge to move it.'));
  return wrap;
}
