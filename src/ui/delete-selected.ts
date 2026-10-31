import { pxPerFoot, rectsIntersect, shapeBBox } from '../geometry';
import { copyShapes, deleteShapesByIds } from '../mutations';
import { isLocked, roleKey } from '../roles';
import { getSelected } from '../selection';
import { state } from '../state';
import type { RoleKey, Shape } from '../types';
import { flushHistoryDebounce, undo } from '../history';
import { render } from './render';
import { toast, toastAction } from './toast';
import { ask } from './ask';
import { isTree } from '../trees';

/** "6 plants, 1 boundary": what a set of shapes is, by role. */
const NAMES: Record<RoleKey | 'tree', [string, string]> = {
  plant: ['plant', 'plants'], tree: ['tree', 'trees'], bed: ['bed', 'beds'], lawn: ['lawn', 'lawns'], path: ['path', 'paths'], water: ['water feature', 'water features'],
  shade: ['sun record', 'sun records'], building: ['building', 'buildings'], structure: ['garden structure', 'garden structures'], boundary: ['boundary', 'boundaries'], utility: ['utility', 'utilities'], other: ['note', 'notes'],
  unassigned: ['plain shape', 'plain shapes'],
};
/** What a shape is called in a count: a tree as a tree, not a plant (round 3, Sam: "12 plants" were 11 and a tree). */
const countKey = (s: Shape): RoleKey | 'tree' => (s.role === 'plant' && isTree(s) ? 'tree' : roleKey(s));
export function describeShapes(shapes: Shape[]): string {
  const counts = new Map<RoleKey | 'tree', number>();
  for (const s of shapes) counts.set(countKey(s), (counts.get(countKey(s)) ?? 0) + 1);
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
export async function deleteSelectedAsking(): Promise<void> {
  const selected = getSelected();
  if (!selected.length) return;
  if (selected.length === 1) {
    // One shape, chosen on its own: deleted, unless it's locked (then asked).
    if (isLocked(selected[0])) {
      if (!(await ask(`This ${NAMES[countKey(selected[0])][0]} is locked. Delete it anyway?`, { ok: 'Delete', danger: true }))) return;
      if (!state.shapes.some((s) => s.id === selected[0].id)) return; // (gone meanwhile)
    }
    deleteShapesByIds([selected[0].id]);
    state.panel = null;
    undoNotice(`Deleted ${selected[0].label || describeShapes(selected)}`);
    render();
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
    if (!(await ask(msg, { ok: 'Delete', danger: true }))) return;
  }
  deleteShapesByIds(going.map((s) => s.id).filter((id) => state.shapes.some((s) => s.id === id)));
  state.panel = null;
  render();
  undoNotice(`Deleted ${describeShapes(going)}` + (kept ? `; ${kept} locked ${kept === 1 ? 'shape' : 'shapes'} kept` : ''));
}
/**
 * "Deleted 3 plants · Undo": every delete says what went, with an Undo of that step (while nothing has changed
 * since; after that, the top bar's Undo).
 */
/**
 * Cut (Ctrl+X): what's selected goes to the clipboard and off the plan, with Undo; nothing asked, since Paste or Undo
 * brings it back. Locked shapes stay, and stay off the clipboard.
 */
export function cutSelected() {
  const selected = getSelected();
  if (!selected.length) return;
  const going = selected.filter((s) => !isLocked(s));
  if (!going.length) { toast(selected.length === 1 ? 'It’s locked: unlock it to cut it.' : 'They’re all locked: unlock them to cut them.'); return; }
  const kept = selected.length - going.length;
  copyShapes(going);
  deleteShapesByIds(going.map((s) => s.id));
  state.panel = null;
  undoNotice(`Cut ${going.length === 1 ? going[0].label || describeShapes(going) : describeShapes(going)}` + (kept ? `; ${kept} locked ${kept === 1 ? 'shape' : 'shapes'} kept` : ''));
}
export function undoNotice(said: string) {
  const step = state.history[state.historyIndex];
  toastAction(said, [{ label: 'Undo', run: () => {
    flushHistoryDebounce();
    if (state.history[state.historyIndex] !== step) { toast('It has changed since, so it was left as it is.'); return; }
    undo(); render();
  } }], 8000);
}
