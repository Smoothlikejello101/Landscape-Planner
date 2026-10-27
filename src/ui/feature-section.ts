import { el } from '../dom';
import { startFeaturePlace } from '../feature-edit';
import { kindsFor, knownFeatures, SUB_FEATURES } from '../features';
import { updateSelected, updateSelectedSilent } from '../mutations';
import { state } from '../state';
import { isLocked } from '../roles';
import type { Shape, SubFeature } from '../types';
import { render } from './render';

// The properties' section for what sits on a shape's edges (src/features.ts): each listed, its width typed in place,
// taken off with ✕; and buttons to add more, tapped onto the plan.

/** The section's title: "Doors, windows and more", "Gates", "Steps"; for what something else left on it, plainer. */
export function featuresTitle(s: Shape): string {
  if (s.role === 'building') return 'Doors, windows and more';
  if (s.role === 'boundary') return 'Gates';
  return kindsFor(s).length ? 'Steps' : 'On its edges';
}
/** Whether its properties show the section: it can take some, or has some (left from when it was a building). */
export const hasFeaturesSection = (s: Shape) => kindsFor(s).length > 0 || (s.type !== 'circle' && s.type !== 'text' && knownFeatures(s.features).length > 0);
const PLURAL: Record<SubFeature['kind'], string> = {
  door: 'doors', window: 'windows', garage: 'garage doors', steps: 'sets of steps', gate: 'gates',
  downspout: 'downspouts', spigot: 'hose bibs', ac: 'AC units', meter: 'meters',
};
/** "Door, 2 windows, AC unit", or "None yet". */
export function featuresSummary(s: Shape): string {
  const fs = s.type === 'circle' || s.type === 'text' ? [] : knownFeatures(s.features);
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
  const known = knownFeatures(s.features);
  // (Each change made to the list as it is then, kept with any this version doesn't know.)
  const current = () => { const now = state.shapes.find((x) => x.id === s.id); return now && now.type !== 'circle' && now.type !== 'text' ? now.features ?? [] : []; };
  for (const f of known) {
    const info = SUB_FEATURES[f.kind];
    const n = (seen.get(f.kind) ?? 0) + 1;
    seen.set(f.kind, n);
    const many = known.filter((x) => x.kind === f.kind).length > 1;
    const row = el('div', { className: 'feature-row', 'data-feature-id': f.id }, el('span', { className: 'feature-name' }, info.label + (many ? ` ${n}` : '')));
    if (info.width) {
      // Typed without re-rendering (keyboard safety): only the plan redraws.
      const [, lo, hi] = info.width;
      const w = el('input', { type: 'number', min: String(lo), max: String(hi), step: '0.5', inputMode: 'decimal', value: f.width ?? info.width[0], 'aria-label': `${info.label} width in feet`, 'data-testid': 'feature-width' }) as HTMLInputElement;
      w.disabled = locked;
      w.addEventListener('input', () => {
        const v = parseFloat(w.value.replace(',', '.'));
        if (!(v >= lo && v <= hi)) return; // (a passing "0" mustn't shrink it to nothing)
        updateSelectedSilent({ features: current().map((x) => (x.id === f.id ? { ...x, width: v } : x)) });
      });
      // (A width it can't be goes back to the one it has now.)
      w.addEventListener('change', () => {
        const v = parseFloat(w.value.replace(',', '.'));
        if (!(v >= lo && v <= hi)) w.value = String(current().find((x) => x.id === f.id)?.width ?? info.width![0]);
      });
      row.appendChild(el('label', { className: 'feature-width' }, w, el('span', {}, 'ft wide')));
    }
    const del = el('button', { className: 'iconbtn feature-del', 'aria-label': `Take off ${info.label.toLowerCase()}`, title: 'Take it off', 'data-testid': 'feature-delete' }, '✕');
    del.disabled = locked;
    del.addEventListener('click', () => updateSelected({ features: current().filter((x) => x.id !== f.id) }));
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
    : !kindsFor(s).length
      ? 'Left from what it was before: take off any it doesn\'t have.'
      : 'Tap one to add it, then tap where it goes on the plan. Drag one along the edge to move it.'));
  return wrap;
}
