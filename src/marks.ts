// Where a mark of something taken away on purpose may go: a bed's conditions cleared (`conditions: {}`) or a
// fruit-partner warning shown again (`fruitDismissed: ''`). The mark keeps sync from filling the field back from another
// device's copy (src/sync/engine.ts withBedConditions, withFruitDismissals), and it goes up as a change: every device
// takes it, and loses what it had there.
//
// So it goes only where another device could have had the field from this one: a shape that had it as the plan was
// opened here (the first undo step), or in a copy of the plan this device sent or took through sync since the app
// started. Anywhere else (set here for the first time and taken away before it was ever sent), taking it away leaves
// none, as it was: a mark there would take away, on every device, answers or a dismissal another device has that this
// one never got, an older version having dropped them on the way (the review of the bed conditions, Nov 4). Both its
// rounds: the first found it through Undo, the second through clearing them.

import { state } from './state';
import type { Shape } from './types';

export type MarkKind = 'conditions' | 'fruit';

/** Whether a shape carries the field the mark is for (a mark itself included). */
const hasField: Record<MarkKind, (s: Shape) => boolean> = {
  conditions: (s) => s.role === 'bed' && s.conditions !== undefined,
  fruit: (s) => s.fruitDismissed !== undefined,
};

/** Shapes, by plan, that had the field in a copy this device sent or took through sync. */
const synced = new Map<string, Record<MarkKind, Set<string>>>();

/** A copy of a plan sent or taken through sync (src/sync/local.ts, as it's recorded): its shapes with the fields noted. */
export function noteSyncedCopy(projectId: string, content: unknown): void {
  const shapes = content && typeof content === 'object' ? (content as { shapes?: unknown }).shapes : undefined;
  if (!Array.isArray(shapes)) return;
  let seen = synced.get(projectId);
  for (const raw of shapes) {
    if (!raw || typeof raw !== 'object' || typeof (raw as Shape).id !== 'string') continue;
    const s = raw as Shape;
    for (const kind of ['conditions', 'fruit'] as const) {
      if (!hasField[kind](s)) continue;
      if (!seen) { seen = { conditions: new Set(), fruit: new Set() }; synced.set(projectId, seen); }
      seen[kind].add(s.id);
    }
  }
}

/** Whether the mark may go on this shape of the open plan, taking the field away (see above). */
export function mayMark(kind: MarkKind, shapeId: string): boolean {
  if (state.history[0]?.shapes.some((s) => s.id === shapeId && hasField[kind](s))) return true;
  const pid = state.currentProjectId;
  return !!pid && !!synced.get(pid)?.[kind].has(shapeId);
}

/** Test hook: forget what sync has carried. */
export function _resetMarksForTests(): void { synced.clear(); }
