// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/render', () => ({ render: () => {}, updateStatusReadout: () => {} }));
import { dismissedForPlan } from '../src/dismissals';
import { pushHistory, redo, undo } from '../src/history';
import { plantsById, type Plant } from '../src/plants';
import { state } from '../src/state';
import type { Shape } from '../src/types';
import { fruitNotice, remindNoMore } from '../src/ui/fruit-notice';
import { plantFruitBanner } from '../src/ui/role-sections';
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
  afterEach(() => { notice()?.remove(); state.shapes = []; state.history = []; state.historyIndex = -1; state.placing = null; });

  it('"Just this one", the bug hunt\'s steps: the copy keeps its own, the plan\'s goes, the row says "for this one", and Undo at the top takes it back', () => {
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
    // Undo at the top: the copy's own goes; the plan's went with "Just this one", so it's as before the dismissal.
    undo();
    expect('fruitDismissed' in shape('h')).toBe(false);
    expect(fruitRows()).toEqual([['h', false, undefined]]);
    redo();
    expect(fruitRows()).toEqual([['h', true, 'for this one']]);
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
    // Undo, Redo; then Show again, for it alone.
    undo();
    expect(shape('h').fruitDismissed).toBeUndefined();
    redo();
    expect(shape('h').fruitDismissed).toBe(line);
    press(plantFruitBanner(shape('h')), 'Show again');
    expect(shape('h').fruitDismissed).toBeUndefined();
    expect(fruitRows()).toEqual([['h,h2', false, undefined]]);
    // "Dismiss for every …": across the plan, with the notice; then said so, and Show again takes back both kinds.
    shape('h2').fruitDismissed = line;
    press(plantFruitBanner(shape('h')), "Dismiss for every Holly 'Red'");
    expect(buttons(notice())).toEqual(['Just these 2', 'Undo', 'OK', '✕']);
    expect(plantFruitBanner(shape('h'))!.textContent).toContain('Dismissed for every one in this plan.');
    press(plantFruitBanner(shape('h')), 'Show again');
    expect([dismissedForPlan('fruit', holly.id, line), shape('h2').fruitDismissed]).toEqual([false, undefined]);
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
});
