import { pxPerFoot, rectsIntersect, shapeBBox } from '../geometry';
import { copyShapes, deleteShapesByIds } from '../mutations';
import { isLocked, roleKey } from '../roles';
import { getSelected } from '../selection';
import { state } from '../state';
import type { RoleKey, Shape } from '../types';
import { flushHistoryDebounce, undo } from '../history';
import { render } from './render';
import { toast, toastAction } from './toast';
import { ask, askChoice } from './ask';
import { isTree } from '../trees';
import { isBed, plantsInBed } from '../beds';

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
/** "11 plants", "10 plants and 1 tree": a count said in a sentence. */
const named = (shapes: Shape[]) => describeShapes(shapes).replace(/, ([^,]*)$/, ' and $1');
const stay = (shapes: Shape[]) => (shapes.length === 1 ? 'stays' : 'stay');
/**
 * The plants in these beds a delete would leave on the lawn: in one of them (src/beds.ts), not gone (a bed's count
 * leaves those out), not locked (a lock keeps a shape through any delete), and not already among `chosen`.
 */
function plantsLeftIn(beds: Shape[], chosen: Shape[]): Shape[] {
  const ids = new Set(chosen.map((s) => s.id));
  return beds.flatMap((b) => plantsInBed(b, state.shapes)).filter((p) => p.status !== 'gone' && !isLocked(p) && !ids.has(p.id));
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
 * says what will go and asks first. A bed with plants in it that aren't selected asks whether they go too.
 * Undo still brings them back, in one step.
 */
export async function deleteSelectedAsking(): Promise<void> {
  const selected = getSelected();
  if (!selected.length) return;
  if (selected.length === 1 && isBed(selected[0]) && plantsLeftIn(selected, selected).length) {
    await deleteBedAsking(selected[0]);
    return;
  }
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
  // Beds with plants in them that aren't selected: whether those go too, in the same question (the UI review,
  // 2026-11-01). Plants selected with the bed go, as chosen.
  const beds = going.filter(isBed);
  const left = plantsLeftIn(beds, selected);
  const inBeds = beds.length === 1 ? 'the bed' : 'the beds';
  let alsoLeft = false;
  if (notPlants.length || away.length) {
    const msg = `Delete ${going.length} shape${going.length === 1 ? '' : 's'}: ${describeShapes(going)}?` +
      (left.length ? `\n\n${beds.length === 1 ? 'The bed has' : 'The beds have'} ${named(left)} in ${beds.length === 1 ? 'it' : 'them'} that ${left.length === 1 ? 'isn’t' : 'aren’t'} selected.` : '') +
      (away.length ? `\n\n${away.length} of them ${away.length === 1 ? 'is' : 'are'} off screen.` : '') +
      (kept ? `\n\n${kept} locked ${kept === 1 ? 'shape stays' : 'shapes stay'}.` : '');
    if (left.length) {
      const choice = await askChoice<'chosen' | 'all'>(msg, [
        { label: `Delete only the ${going.length} selected (the other ${named(left)} in ${inBeds} ${stay(left)})`, value: 'chosen', danger: true, testid: 'ask-selected-only' },
        { label: `Delete the ${going.length} selected and the other ${named(left)} in ${inBeds}`, value: 'all', danger: true },
      ], { danger: true });
      if (!choice) return;
      alsoLeft = choice === 'all';
    } else if (!(await ask(msg, { ok: 'Delete', danger: true }))) return;
  }
  const gone = alsoLeft ? [...going, ...left] : going;
  deleteShapesByIds(gone.map((s) => s.id).filter((id) => state.shapes.some((s) => s.id === id)));
  state.panel = null;
  render();
  undoNotice(`Deleted ${describeShapes(gone)}` + (left.length && !alsoLeft ? `; the other ${named(left)} in ${inBeds} ${stay(left)}` : '') +
    (kept ? `; ${kept} locked ${kept === 1 ? 'shape' : 'shapes'} kept` : ''));
}
/**
 * A bed with plants in it, on its own: the bed only, or its plants too (the UI review, 2026-11-01: "Its 11 plants are
 * left on the lawn, with no question asked"). Either way, one step that Undo brings back. Locked plants stay, as a
 * lock keeps a shape through any delete; a locked bed says so, in place of asking about the lock on its own.
 */
async function deleteBedAsking(bed: Shape): Promise<void> {
  const plants = plantsLeftIn([bed], [bed]);
  const held = plantsInBed(bed, state.shapes).filter((p) => p.status !== 'gone' && isLocked(p)).length;
  const what = named(plants);
  const msg = `${bed.label ? `“${bed.label}”` : 'This bed'} ${isLocked(bed) ? 'is locked, and has' : 'has'} ${what} in it` +
    (held ? ` (and ${held} locked, which ${held === 1 ? 'stays' : 'stay'})` : '') + '.';
  const choice = await askChoice<'bed' | 'all'>(msg, [
    { label: `Delete the bed only (its ${what} ${stay(plants)})`, value: 'bed', danger: true, testid: 'ask-bed-only' },
    { label: `Delete the bed and its ${what}`, value: 'all', danger: true },
  ], { danger: true, testid: 'ask-delete-bed' });
  if (!choice || !state.shapes.some((s) => s.id === bed.id)) return; // (Cancel, or gone meanwhile)
  const ids = choice === 'all' ? [bed.id, ...plants.map((p) => p.id)] : [bed.id];
  deleteShapesByIds(ids.filter((id) => state.shapes.some((s) => s.id === id)));
  state.panel = null;
  const name = bed.label || 'the bed';
  undoNotice(choice === 'all' ? `Deleted ${name} and its ${what}` : `Deleted ${name}; its ${what} ${stay(plants)}`);
  render();
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
