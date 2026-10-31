// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dismissForPlan } from '../src/dismissals';
import { fitInCircle } from '../src/labels';
import { plantsById, type Plant } from '../src/plants';
import { state } from '../src/state';
import type { Shape } from '../src/types';
import { countSaid, planWarnings } from '../src/warnings-list';

// Every warning in the plan now, for Settings → Warnings (Jason, Oct 31, from round 3): active and dismissed, each
// worked out as the plan works it out.

const shrub = { id: 'wl-shrub', common: 'Spicebush', form: 'Shrub', width: { min: 3, max: 5, med: 4 }, zone_min: 4, zone_max: 9 } as Plant;
const tropical = { id: 'wl-trop', common: 'Bougainvillea', form: 'Vine', width: { min: 3, max: 5, med: 4 }, zone_min: 9.5, zone_max: 11 } as Plant;
const at = (id: string, plantId: string, x: number, extra: Partial<Shape> = {}): Shape =>
  ({ id, type: 'circle', role: 'plant', plantId, label: plantsById[plantId]?.common, x, y: 0, radius: 2, color: '#16a34a', opacity: 0.65, ...extra } as Shape);

describe('the warnings in the plan now', () => {
  beforeEach(() => {
    plantsById[shrub.id] = shrub; plantsById[tropical.id] = tropical;
    Object.assign(state, { showCrowding: true, crowdWarnings: true, sunWarnings: true, hardyWarnings: true, poisonWarnings: true, fruitWarnings: true });
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = {};
    state.dismissed = undefined;
    state.location = { zip: '71923', zone: '8a' };
  });
  afterEach(() => { state.shapes = []; state.location = null; });

  it('lists crowded pairs, then the pairs left close on purpose; a dismissed pair flags again by itself', () => {
    // Two 4-ft shrubs 2 ft apart are crowded; 'c' and 'd' too, left close on purpose.
    state.shapes = [at('a', shrub.id, 0), at('b', shrub.id, 2), at('c', shrub.id, 40, { crowdOk: ['d'] } as Partial<Shape>), at('d', shrub.id, 42)];
    const rows = planWarnings().filter((r) => r.kind === 'crowding');
    expect(rows.map((r) => [r.ids.join('+'), r.said, r.dismissed])).toEqual([['a+b', 'crowded, 2 ft apart', false], ['c+d', 'crowded, 2 ft apart, left close on purpose', true]]);
    expect(rows[0].name).toBe('Spicebush and Spicebush');
    rows[1].again!();
    expect(state.shapes.find((s) => s.id === 'c')).not.toHaveProperty('crowdOk');
    expect(planWarnings().filter((r) => r.kind === 'crowding' && !r.dismissed)).toHaveLength(2);
  });

  it('a pair left close that has since moved apart is no longer listed', () => {
    state.shapes = [at('c', shrub.id, 0, { crowdOk: ['d'] } as Partial<Shape>), at('d', shrub.id, 20)];
    expect(planWarnings().filter((r) => r.kind === 'crowding')).toEqual([]);
  });

  it('hardiness is the plant\'s: one row for its copies, the dismissed copies apart, all of them once dismissed across the plan', () => {
    state.shapes = [at('x', tropical.id, 0), at('y', tropical.id, 20), at('z', tropical.id, 40)];
    let rows = planWarnings().filter((r) => r.kind === 'hardy');
    expect(rows.map((r) => [r.name, r.dismissed])).toEqual([['Bougainvillea ×3', false]]);
    expect(rows[0].said).toMatch(/^Too cold for zone 8a/);
    const line = rows[0].said;
    state.shapes[2].hardyDismissed = line;
    rows = planWarnings().filter((r) => r.kind === 'hardy');
    expect(rows.map((r) => [r.name, r.ids.join(','), r.dismissed])).toEqual([['Bougainvillea ×2', 'x,y', false], ['Bougainvillea', 'z', true]]);
    dismissForPlan('hardy', tropical.id, line);
    rows = planWarnings().filter((r) => r.kind === 'hardy');
    expect(rows.map((r) => [r.ids.join(','), r.dismissed])).toEqual([['x,y,z', true]]);
    rows[0].again!();
    expect(planWarnings().filter((r) => r.kind === 'hardy').map((r) => [r.ids.join(','), r.dismissed])).toEqual([['x,y,z', false]]);
  });

  it('leaves out a kind switched off, plants already there, gone ones and those filtered out of the plan', () => {
    state.shapes = [at('x', tropical.id, 0, { status: 'existing' }), at('y', tropical.id, 20, { status: 'gone' }), at('w', tropical.id, 40, { status: 'planned' })];
    expect(planWarnings().filter((r) => r.kind === 'hardy').map((r) => r.ids.join(','))).toEqual(['w']);
    state.viewFilter = { status: 'planted', phase: '', showGone: false };
    expect(planWarnings().filter((r) => r.kind === 'hardy')).toEqual([]);
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.hardyWarnings = false;
    expect(planWarnings().filter((r) => r.kind === 'hardy')).toEqual([]);
  });

  it('counts say how many are active and how many dismissed', () => {
    const row = (dismissed: boolean) => ({ kind: 'sun' as const, ids: [], name: '', said: '', dismissed });
    expect(countSaid([row(false), row(false), row(true)])).toBe('2 active, 1 dismissed');
    expect(countSaid([row(true)])).toBe('1 dismissed');
    expect(countSaid([])).toBe('none');
  });
});

describe('names on the plan at another label size', () => {
  it('start bigger at Large and smaller at Small, and fit inside fewer or more circles', () => {
    expect(fitInCircle('Buttonbush', 80)!.fontSize).toBe(14);
    expect(fitInCircle('Buttonbush', 80, {}, 10, 1.25)!.fontSize).toBe(18);
    expect(fitInCircle('Buttonbush', 80, {}, 10, 0.85)!.fontSize).toBe(12);
    // (A circle just big enough at Medium's smallest size: too small at Large's; Small fits a little smaller still.)
    let r = 10;
    while (!fitInCircle('Buttonbush', r)) r++;
    expect(fitInCircle('Buttonbush', r, {}, 10, 1.25)).toBeNull();
    expect(fitInCircle('Buttonbush', r - 2, {}, 10, 0.85)).not.toBeNull();
  });
});
