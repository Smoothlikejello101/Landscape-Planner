// Where a mark of something taken away on purpose may go: a bed's conditions cleared (`conditions: {}`) or a
// fruit-partner warning shown again (`fruitDismissed: ''`). The mark keeps sync from filling the field back from another
// device's copy (src/sync/engine.ts withBedConditions, withFruitDismissals), and it goes up as a change: every device
// takes it, and loses what it had there.
//
// So it goes only where another device can have the field: the shape had it in the server's copy of the plan as this
// device last sent or took it (its sync record's `marks`, src/sync/engine.ts marksOf), kept with the record, so across
// restarts, and cleared with the records when the account changes. Anywhere else (set here and taken away before it
// was ever sent, or a plan that doesn't sync), taking it away leaves none, as it was: a mark there would take away, on
// every device, answers or a dismissal another device has that this one never got, an older version having dropped
// them on the way. Saying no only ever lets a field come back from another device's copy, never erases one. (The
// independent review of the bed conditions, Nov 4, in three rounds: Undo, then clearing, then what survives a restart.)

import { state } from './state';
import { getSyncRecords } from './storage';

export type MarkKind = 'conditions' | 'fruit';

/** Whether the mark may go on this shape of the open plan, taking the field away (see above). */
export function mayMark(kind: MarkKind, shapeId: string): boolean {
  const pid = state.currentProjectId;
  return !!pid && !!getSyncRecords()[pid]?.marks?.[kind]?.includes(shapeId);
}
