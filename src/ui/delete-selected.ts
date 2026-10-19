import { pxPerFoot, rectsIntersect, shapeBBox } from '../geometry';
import { deleteShapesByIds } from '../mutations';
import { isLocked, roleKey, roleLabel } from '../roles';
import { getSelected } from '../selection';
import { state } from '../state';
import type { RoleKey, Shape } from '../types';
import { toast } from './toast';

/** "6 plants, 1 boundary": what a set of shapes is, by role. */
const PLURAL: Partial<Record<RoleKey, string>> = { path: 'paths / hardscape', boundary: 'boundaries', other: 'notes / other', unassigned: 'plain shapes' };
export function describeShapes(shapes: Shape[]): string {
  const counts = new Map<RoleKey, number>();
  for (const s of shapes) counts.set(roleKey(s), (counts.get(roleKey(s)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${n === 1 ? roleLabel(k).toLowerCase() : PLURAL[k] ?? roleLabel(k).toLowerCase() + 's'}`).join(', ');
}
/** Shapes outside the part of the plan on screen. */
function outOfView(shapes: Shape[]): Shape[] {
  const ppf = pxPerFoot();
  const view = { minX: state.offsetX, minY: state.offsetY, maxX: state.offsetX + state.canvasW / ppf, maxY: state.offsetY + state.canvasH / ppf };
  return shapes.filter((s) => !rectsIntersect(shapeBBox(s), view));
}
/**
 * Delete the selection. Several at once: locked shapes are kept, and where the selection holds more than
 * plants (a boundary, a bed, a building…) or shapes off screen, it says what will go and asks first.
 * Undo still brings them back.
 */
export function deleteSelectedAsking() {
  const selected = getSelected();
  if (!selected.length) return;
  const several = selected.length > 1;
  const going = several ? selected.filter((s) => !isLocked(s)) : selected;
  const kept = selected.length - going.length;
  if (!going.length) { toast(kept === 1 ? 'It’s locked: unlock it to delete it.' : 'They’re all locked: unlock them to delete them.'); return; }
  if (several) {
    const notPlants = going.filter((s) => s.role && s.role !== 'plant' && s.role !== 'other');
    const away = outOfView(going);
    if (notPlants.length || away.length) {
      const msg = `Delete ${going.length} shapes: ${describeShapes(going)}?` +
        (away.length ? `\n\n${away.length} of them ${away.length === 1 ? 'is' : 'are'} off screen.` : '') +
        (kept ? `\n\n${kept} locked ${kept === 1 ? 'shape stays' : 'shapes stay'}.` : '');
      if (!confirm(msg)) return;
    }
  }
  deleteShapesByIds(going.map((s) => s.id));
  state.panel = null;
  if (kept) toast(`${going.length} deleted; ${kept} locked ${kept === 1 ? 'shape' : 'shapes'} kept.`);
}
