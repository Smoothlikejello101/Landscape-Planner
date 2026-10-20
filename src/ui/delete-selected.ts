import { pxPerFoot, rectsIntersect, shapeBBox } from '../geometry';
import { deleteShapesByIds } from '../mutations';
import { isLocked, roleKey } from '../roles';
import { getSelected } from '../selection';
import { state } from '../state';
import type { RoleKey, Shape } from '../types';
import { toast } from './toast';

/** "6 plants, 1 boundary": what a set of shapes is, by role. */
const NAMES: Record<RoleKey, [string, string]> = {
  plant: ['plant', 'plants'], bed: ['bed', 'beds'], lawn: ['lawn', 'lawns'], path: ['path', 'paths'], water: ['water feature', 'water features'],
  shade: ['sun record', 'sun records'], building: ['building', 'buildings'], boundary: ['boundary', 'boundaries'], other: ['note', 'notes'],
  unassigned: ['plain shape', 'plain shapes'],
};
export function describeShapes(shapes: Shape[]): string {
  const counts = new Map<RoleKey, number>();
  for (const s of shapes) counts.set(roleKey(s), (counts.get(roleKey(s)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${NAMES[k][n === 1 ? 0 : 1]}`).join(', ');
}
/** Shapes outside the part of the plan on screen. */
function outOfView(shapes: Shape[]): Shape[] {
  const ppf = pxPerFoot();
  const view = { minX: state.offsetX, minY: state.offsetY, maxX: state.offsetX + state.canvasW / ppf, maxY: state.offsetY + state.canvasH / ppf };
  return shapes.filter((s) => !rectsIntersect(shapeBBox(s), view));
}
/**
 * Delete the selection. One shape: deleted (a locked one asks first). Several: locked shapes are kept, and
 * where the selection holds more than plants (a boundary, a bed, a plain shape…) or shapes off screen, it
 * says what will go and asks first. Undo still brings them back.
 */
export function deleteSelectedAsking() {
  const selected = getSelected();
  if (!selected.length) return;
  if (selected.length === 1) {
    // One shape, chosen on its own: deleted, unless it's locked (then asked).
    if (isLocked(selected[0]) && !confirm(`This ${NAMES[roleKey(selected[0])][0]} is locked. Delete it anyway?`)) return;
    deleteShapesByIds([selected[0].id]);
    state.panel = null;
    return;
  }
  const going = selected.filter((s) => !isLocked(s));
  const kept = selected.length - going.length;
  if (!going.length) { toast('They’re all locked: unlock them to delete them.'); return; }
  // Anything but plants (a boundary, a bed, a building, a plain shape from an older plan…), or anything off
  // screen: say what will go and ask.
  const notPlants = going.filter((s) => s.role !== 'plant');
  const away = outOfView(going);
  if (notPlants.length || away.length) {
    const msg = `Delete ${going.length} shape${going.length === 1 ? '' : 's'}: ${describeShapes(going)}?` +
      (away.length ? `\n\n${away.length} of them ${away.length === 1 ? 'is' : 'are'} off screen.` : '') +
      (kept ? `\n\n${kept} locked ${kept === 1 ? 'shape stays' : 'shapes stay'}.` : '');
    if (!confirm(msg)) return;
  }
  deleteShapesByIds(going.map((s) => s.id));
  state.panel = null;
  if (kept) toast(`${going.length} deleted; ${kept} locked ${kept === 1 ? 'shape' : 'shapes'} kept.`);
}
