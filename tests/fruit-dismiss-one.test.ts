// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/render', () => ({ render: () => {}, updateStatusReadout: () => {} }));
import { dismissedForPlan, dismissForPlan, warnForNewOnes } from '../src/dismissals';
import { cancelHistoryDebounce, pushHistory, pushHistoryDebounced, redo, undo } from '../src/history';
import { HISTORY_DEBOUNCE_MS } from '../src/constants';
import { plantsById, type Plant } from '../src/plants';
import { state } from '../src/state';
import { noteSyncedCopy } from '../src/marks';
import type { Shape } from '../src/types';
import { fruitNotice, remindNoMore } from '../src/ui/fruit-notice';
import { dismissAcross, plantFruitBanner } from '../src/ui/role-sections';
import { copyShapes, paste } from '../src/mutations';
import { planWarnings } from '../src/warnings-list';

// A fruit-partner warning dismissed for one plant alone (Jason, Nov 1, from the warnings bug hunt's bug 1: "Just this
// one" brought the warning back), as hardiness and poison warnings are: the notice after Dismiss narrows it to the
// copies there now, each its own (src/ui/fruit-notice.ts remindNoMore), and a plant's details have "Dismiss for this
// one" beside "Dismiss for every …" (src/ui/role-sections.ts). Undo takes each back.

const holly = { id: 'fd-holly', common: "Holly 'Red'", form: 'Shrub', width: { min: 1, max: 2, med: 1.5 }, fruit_set: 'separate', fruit_color: ['red/burgundy'], sex: 'female', parent: 'fd-holly-sp' } as Plant;
const at = (id: string, x: number): Shape =>
  ({ id, type: 'circle', role: 'plant', plantId: holly.id, label: holly.common, x, y: 0, radius: 1, color: '#16a34a', opacity: 0.65, locked: false } as Shape);
const shape = (id: string) => state.shapes.find((s) => s.id === id)!;
const fruitRows = () => planWarnings().filter((r) => r.kind === 'fruit').map((r) => [r.ids.join(','), r.dismissed, r.scope]);
const notice = () => document.getElementById('toast-action');
const buttons = (root: Element | null) => [...(root?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
const press = (root: Element | null, label: string) => {
  const b = [...(root?.querySelectorAll('button') ?? [])].find((x) => x.textContent === label);
  if (!b) throw new Error(`no ${label} in ${buttons(root).join(', ')}`);
  b.click();
};

describe('a fruit-partner warning dismissed for one plant (Jason, Nov 1)', () => {
  let line = '';
  beforeEach(() => {
    plantsById[holly.id] = holly;
    Object.assign(state, { fruitWarnings: true, showCrowding: false, crowdWarnings: false, sunWarnings: false, hardyWarnings: false, poisonWarnings: false });
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = {};
    state.dismissed = undefined;
    state.selectedIds = [];
    state.shapes = [at('h', -40)];
    state.history = []; state.historyIndex = -1;
    pushHistory();
    line = planWarnings().find((r) => r.kind === 'fruit')!.key!;
  });
  afterEach(() => { cancelHistoryDebounce(); notice()?.remove(); state.shapes = []; state.history = []; state.historyIndex = -1; state.placing = null; });

  it('"Just this one", the bug hunt\'s steps: the copy keeps its own, the plan\'s goes, the row says "for this one"; Undo at the top goes back to dismissed for every one, Redo to this one', () => {
    expect(line).toBe("Holly 'Red' is a female: it needs a male of its kind nearby to fruit");
    remindNoMore(holly.id, line); // (a row's Dismiss in Warnings)
    expect(notice()!.textContent).toContain("Fruit partner warning dismissed for Holly 'Red' in this plan, and any you add later.");
    expect(buttons(notice())).toEqual(['Just this one', 'Undo', 'OK', '✕']);
    expect(fruitRows()).toEqual([['h', true, "for every Holly 'Red' in this plan"]]);
    const steps = state.historyIndex;
    press(notice(), 'Just this one');
    expect(notice()).toBeNull();
    expect(shape('h').fruitDismissed).toBe(line);
    expect(dismissedForPlan('fruit', holly.id, line)).toBe(false);
    expect(state.dismissed).toEqual({}); // (kept, empty, so it syncs)
    expect(fruitRows()).toEqual([['h', true, 'for this one']]); // (still dismissed: the count stays down)
    expect(state.historyIndex).toBe(steps + 1);
    // Undo at the top: back to just before it, dismissed for every one in the plan (the review, Nov 1: it left nothing
    // dismissed). The copy's own goes back to none, as it was when the plan was opened (its first undo step): a ''
    // there would take away, on every device, a dismissal another device has that this one never got (the review of
    // the bed conditions, Nov 4: src/history.ts inFirstStep). Redo: this one again.
    undo();
    expect(state.historyIndex).toBe(steps);
    expect(dismissedForPlan('fruit', holly.id, line)).toBe(true);
    expect(shape('h').fruitDismissed).toBeUndefined();
    expect(fruitRows()).toEqual([['h', true, "for every Holly 'Red' in this plan"]]);
    redo();
    expect(dismissedForPlan('fruit', holly.id, line)).toBe(false);
    expect(state.dismissed).toEqual({});
    expect(shape('h').fruitDismissed).toBe(line);
    expect(fruitRows()).toEqual([['h', true, 'for this one']]);
    // Undo again; then the plant dismissed across the plan once more meanwhile: Redo leaves that as it is.
    undo();
    state.dismissed = { fruit: { [holly.id]: line + '; newer' } };
    undo(); redo(); redo();
    expect(state.dismissed).toEqual({ fruit: { [holly.id]: line + '; newer' } });
  });

  it('"Just these 2" for two copies; one added later is warned for; the notice\'s Undo takes the dismissal back as it was', () => {
    state.shapes.push(at('h2', -50));
    state.dismissed = { poison: { other: 'Poisonous to people' } };
    const steps = state.historyIndex;
    remindNoMore(holly.id, line);
    expect(notice()!.textContent).toContain("dismissed for both Holly 'Red' in this plan");
    expect(buttons(notice())).toEqual(['Just these 2', 'Undo', 'OK', '✕']);
    press(notice(), 'Undo');
    expect(state.dismissed).toEqual({ poison: { other: 'Poisonous to people' } });
    expect(fruitRows()).toEqual([['h,h2', false, undefined]]);
    expect(state.historyIndex).toBe(steps); // (no step: the plan's dismissals aren't in the undo history)
    remindNoMore(holly.id, line);
    press(notice(), 'Just these 2');
    expect(['h', 'h2'].map((id) => shape(id).fruitDismissed)).toEqual([line, line]);
    expect(state.dismissed).toEqual({ poison: { other: 'Poisonous to people' } });
    expect(fruitRows()).toEqual([['h,h2', true, 'for these 2']]);
    state.shapes.push(at('h3', -60));
    expect(fruitRows()).toEqual([['h3', false, undefined], ['h,h2', true, 'for these 2']]);
    // The notice's Undo once the plan's dismissals have changed since: left as it is.
    remindNoMore(holly.id, line);
    state.dismissed = { ...state.dismissed, hardy: { other: 'Too cold' } };
    press(notice(), 'Undo');
    expect(dismissedForPlan('fruit', holly.id, line)).toBe(true);
  });

  it('a plant\'s details: "Dismiss for this one" beside "Dismiss for every …"; dismissed, it says so, with Show again for it alone', () => {
    state.shapes.push(at('h2', -50));
    pushHistory(); // (the second one placed: a step)
    state.selectedIds = ['h'];
    let banner = plantFruitBanner(shape('h'))!;
    expect(banner.textContent).toMatch(/^⚠ Holly 'Red' is a female: it needs a male of its kind nearby to fruit\./);
    expect(buttons(banner)).toEqual(['Dismiss for this one', "Dismiss for every Holly 'Red'"]);
    expect(banner.querySelector('[data-testid=fruit-dismiss-one]')).not.toBeNull();
    press(banner, 'Dismiss for this one');
    expect([shape('h').fruitDismissed, shape('h2').fruitDismissed]).toEqual([line, undefined]);
    expect(dismissedForPlan('fruit', holly.id, line)).toBe(false);
    banner = plantFruitBanner(shape('h'))!;
    expect(banner.textContent).toContain('Dismissed for this one.');
    expect(banner.className).toContain('muted');
    expect(buttons(banner)).toEqual(['Show again']);
    expect(buttons(plantFruitBanner(shape('h2')))).toEqual(['Dismiss for this one', "Dismiss for every Holly 'Red'"]); // (the other: its own)
    expect(fruitRows()).toEqual([['h2', false, undefined], ['h', true, 'for this one']]);
    // Undo, Redo; then Show again, for it alone. Undo takes it back to none, as it was in the first step; Show again
    // leaves '', shown again on purpose, so sync doesn't fill it back from another device's copy (src/sync/engine.ts
    // withFruitDismissals).
    undo();
    expect(shape('h').fruitDismissed).toBeUndefined();
    expect(fruitRows()).toEqual([['h,h2', false, undefined]]);
    redo();
    expect(shape('h').fruitDismissed).toBe(line);
    // (Show again: dismissed here and never sent, it goes, as it was; once sync has carried it, '' on purpose.)
    press(plantFruitBanner(shape('h')), 'Show again');
    expect(shape('h').fruitDismissed).toBeUndefined();
    press(plantFruitBanner(shape('h')), 'Dismiss for this one');
    const was = state.currentProjectId;
    state.currentProjectId = was ?? 'synced-plan';
    noteSyncedCopy(state.currentProjectId, { shapes: [{ ...shape('h') }] });
    press(plantFruitBanner(shape('h')), 'Show again');
    state.currentProjectId = was;
    expect(shape('h').fruitDismissed).toBe('');
    expect(buttons(plantFruitBanner(shape('h')))).toEqual(['Dismiss for this one', "Dismiss for every Holly 'Red'"]);
    expect(fruitRows()).toEqual([['h,h2', false, undefined]]);
    // "Dismiss for every …": across the plan, with the notice; then said so, and Show again takes back both kinds.
    shape('h2').fruitDismissed = line;
    press(plantFruitBanner(shape('h')), "Dismiss for every Holly 'Red'");
    expect(buttons(notice())).toEqual(['Just these 2', 'Undo', 'OK', '✕']);
    expect(plantFruitBanner(shape('h'))!.textContent).toContain('Dismissed for every one in this plan.');
    press(plantFruitBanner(shape('h')), 'Show again');
    expect([dismissedForPlan('fruit', holly.id, line), shape('h2').fruitDismissed]).toEqual([false, undefined]); // (never sent: goes)
  });

  it('the notice as a plant is placed: not for a copy dismissed on its own, as for one dismissed across the plan', () => {
    const placed = { ...at('h2', -50), fruitDismissed: line } as Shape;
    state.shapes.push(placed);
    state.placing = { plantId: holly.id, placed: [] };
    fruitNotice(placed, () => {});
    expect(notice()).toBeNull();
    fruitNotice(shape('h'), () => {});
    expect(notice()?.dataset.testid).toBe('fruit-notice');
  });

  it('"Just these N" counts, and narrows, the copies the warning is about: not a gone one (the review, Nov 1: it said 3 where Warnings listed 2)', () => {
    state.shapes.push(at('h2', -50), { ...at('h3', -60), status: 'gone' } as Shape);
    expect(fruitRows()).toEqual([['h,h2', false, undefined]]);
    remindNoMore(holly.id, line);
    expect(notice()!.textContent).toContain("dismissed for both Holly 'Red' in this plan");
    expect(buttons(notice())).toEqual(['Just these 2', 'Undo', 'OK', '✕']);
    press(notice(), 'Just these 2');
    expect(['h', 'h2', 'h3'].map((id) => shape(id).fruitDismissed)).toEqual([line, line, undefined]);
    expect(fruitRows()).toEqual([['h,h2', true, 'for these 2']]);
  });

  it('"Just this one" once the plan\'s dismissals have changed since (another device\'s version come in by sync): left as it is, and said', () => {
    remindNoMore(holly.id, line);
    state.dismissed = {}; // (as replaceProjectContent leaves it: another device showed it again)
    press(notice(), 'Just this one');
    expect(shape('h').fruitDismissed).toBeUndefined();
    expect(fruitRows()).toEqual([['h', false, undefined]]);
    expect(document.body.textContent).toContain('It has changed since, so it was left as it is.');
    expect(state.historyIndex).toBe(0); // (no step)
  });

  it('hardiness and poison alike: their "Just these 2" counts the copies warned for, does nothing once changed since, and Undo goes back to dismissed for every one', () => {
    const fig = { id: 'fd-fig', common: 'Fig', form: 'Shrub', width: { min: 1, max: 2, med: 1.5 } } as Plant;
    plantsById[fig.id] = fig;
    const f = (id: string, extra: Partial<Shape> = {}) => ({ ...at(id, 0), plantId: fig.id, label: 'Fig', ...extra } as Shape);
    state.shapes = [f('a'), f('b'), f('gone', { status: 'gone' }), f('old', { status: 'existing' })];
    state.history = []; state.historyIndex = -1;
    pushHistory();
    const said = "Too cold for zone 8a: it's rated for zones 9–11";
    dismissAcross('hardy', fig.id, said);
    expect(notice()!.textContent).toContain('Hardiness warning dismissed for both Fig in this plan');
    expect(buttons(notice())).toEqual(['Just these 2', 'OK', '✕']);
    press(notice(), 'Just these 2');
    expect(state.shapes.map((s) => s.hardyDismissed)).toEqual([said, said, undefined, undefined]);
    expect(dismissedForPlan('hardy', fig.id, said)).toBe(false);
    undo();
    expect(dismissedForPlan('hardy', fig.id, said)).toBe(true);
    expect(state.shapes.map((s) => s.hardyDismissed)).toEqual([undefined, undefined, undefined, undefined]);
    redo();
    expect(dismissedForPlan('hardy', fig.id, said)).toBe(false);
    expect(state.shapes.map((s) => s.hardyDismissed)).toEqual([said, said, undefined, undefined]);
    // Poison: all three living copies (one already there is still poisonous); changed since: nothing.
    dismissAcross('poison', fig.id, 'Poisonous to people');
    expect(buttons(notice())).toEqual(['Just these 3', 'OK', '✕']);
    state.dismissed = { ...state.dismissed, fruit: { other: 'x' } };
    press(notice(), 'Just these 3');
    expect(state.shapes.map((s) => s.poisonDismissed)).toEqual([undefined, undefined, undefined, undefined]);
    expect(dismissedForPlan('poison', fig.id, 'Poisonous to people')).toBe(true);
  });

  it('a Show again just before "Just these 2" stays its own step, and no later step comes from its timer (CI on #209)', () => {
    vi.useFakeTimers();
    try {
      state.shapes = [at('h', -40), at('h2', 40)];
      pushHistory();
      for (const s of state.shapes) s.fruitDismissed = line;
      pushHistory();
      // A Show again on one copy, as a plant's details do it (updateSelected: a debounced step), then at once "Just these 2"
      // from a plan-wide dismissal.
      state.shapes[0].fruitDismissed = '';
      pushHistoryDebounced();
      state.shapes.forEach((s) => { delete s.fruitDismissed; });
      dismissForPlan('fruit', holly.id, line);
      const steps = state.history.length;
      warnForNewOnes('fruit', holly.id, line);
      vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS * 2);
      expect(state.history.length).toBe(steps + 2); // the Show again, then the narrowing: no third from the timer
      undo();
      expect(dismissedForPlan('fruit', holly.id, line)).toBe(true); // one Undo: back to dismissed for every holly
      // And pushHistory with a step still waiting: the waiting one is in it, never pushed again later.
      // (After the Undo, a new step drops the redo branch: counted from the step we're on.)
      const now = state.historyIndex + 1;
      pushHistoryDebounced();
      pushHistory();
      vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS * 2);
      expect(state.history.length).toBe(now + 1);
    } finally { vi.useRealTimers(); }
  });
  it('copied and pasted (paste(), as the app does it), a copy keeps its own, and one shown again its \'\'', () => {
    state.shapes = [{ ...at('h', -40), fruitDismissed: line } as Shape, { ...at('h2', -50), fruitDismissed: '' } as Shape];
    expect(copyShapes(state.shapes)).toBe(true);
    expect(paste()).toBe(true);
    const pasted = state.shapes.slice(2);
    expect(pasted.map((s) => [s.id !== 'h' && s.id !== 'h2', s.fruitDismissed])).toEqual([[true, line], [true, '']]);
    expect(fruitRows()).toEqual([['h2,' + pasted[1].id, false, undefined], ['h,' + pasted[0].id, true, 'for these 2']]);
  });

  it('Redo after "Just these 2" leaves a dismissal made across the plan since, words alike or not; one its Undo put back, it takes away again (the second review, Nov 1)', () => {
    state.shapes.push(at('h2', -50));
    for (const kind of ['fruit', 'hardy', 'poison'] as const) {
      for (const newer of [line, line + '; newer']) {
        state.dismissed = {};
        state.history = []; state.historyIndex = -1; pushHistory();
        dismissForPlan(kind, holly.id, line);
        warnForNewOnes(kind, holly.id, line); // ("Just these 2": a step)
        dismissForPlan(kind, holly.id, newer); // ("Dismiss for every …" again since: no step)
        undo();
        expect(state.dismissed?.[kind]?.[holly.id], `${kind} ${newer}`).toBe(newer);
        redo();
        expect(state.dismissed?.[kind]?.[holly.id], `${kind} ${newer}`).toBe(newer); // (before: gone, with the same words)
      }
      // None since: Undo puts it back and Redo takes it away, as often as they're used.
      state.dismissed = {};
      state.history = []; state.historyIndex = -1; pushHistory();
      dismissForPlan(kind, holly.id, line);
      warnForNewOnes(kind, holly.id, line);
      for (let i = 0; i < 2; i++) {
        undo();
        expect(state.dismissed?.[kind]?.[holly.id], kind).toBe(line);
        redo();
        expect(state.dismissed?.[kind]?.[holly.id], kind).toBeUndefined();
      }
    }
  });
  it("Undo leaves '' (shown again on purpose) on a copy that had its own dismissal in the first step, the plan as opened", () => {
    state.shapes = [{ ...at('h', -40), fruitDismissed: line }];
    state.history = []; state.historyIndex = -1;
    pushHistory(); // (as opened: dismissed for this one)
    delete shape('h').fruitDismissed; pushHistory(); // (taken away)
    shape('h').fruitDismissed = line; pushHistory(); // (dismissed again)
    undo();
    expect(shape('h').fruitDismissed).toBe('');
    redo();
    expect(shape('h').fruitDismissed).toBe(line);
  });
});
