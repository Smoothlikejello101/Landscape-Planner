import { el } from '../dom';
import { ROLES } from '../roles';
import type { Role, RoleKey } from '../types';

/** A wrap of chips for choosing a role. `current` null = mixed selection. */
export function roleChips(current: RoleKey | null, onPick: (role: Role | undefined) => void): HTMLElement {
  const wrap = el('div', { className: 'role-chips', role: 'radiogroup', 'aria-label': 'Role' });
  const chip = (key: RoleKey, label: string) => {
    const b = el('button', {
      className: 'role-chip' + (current === key ? ' sel' : ''),
      role: 'radio', 'aria-checked': current === key ? 'true' : 'false', 'data-role-key': key,
    }, label);
    b.addEventListener('click', () => onPick(key === 'unassigned' ? undefined : key));
    return b;
  };
  for (const r of ROLES) wrap.appendChild(chip(r.key, r.label));
  wrap.appendChild(chip('unassigned', 'Plain shape'));
  return wrap;
}
