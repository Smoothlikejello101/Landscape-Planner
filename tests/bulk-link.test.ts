// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { canLinkToPlant, linkShapesToPlant, plantsById, sameLabel, unlinkedWithLabel, type Plant } from '../src/plants';
import { state } from '../src/state';
import { undo } from '../src/history';
import type { Shape } from '../src/types';

const base = { color: '#16a34a', opacity: 0.65, locked: false };
const circle = (id: string, label: string, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id, type: 'circle', x: 0, y: 0, radius: 1, label, ...extra } as Shape);
const bergamot: Plant = { id: 'monarda-fistulosa', common: 'Wild bergamot', width: { min: 2, max: 3, med: 2.5 } } as Plant;

beforeEach(() => {
  state.shapes = []; state.selectedIds = []; state.history = []; state.historyIndex = -1;
  state.viewFilter = { status: '', phase: '', showGone: false };
  state.roleViews = {};
  state.sizeMode = 'typical';
});

describe('linking many circles to a plant', () => {
  it('matches labels case- and space-insensitively, never an empty one', () => {
    expect(sameLabel('Bergamot', ' bergamot ')).toBe(true);
    expect(sameLabel('', '')).toBe(false);
    expect(sameLabel('  ', ' ')).toBe(false);
  });
  it('offers only unlinked plant circles on view and unlocked, labeled the same', () => {
    state.shapes = [
      circle('a', 'Bergamot'), circle('b', 'bergamot'), circle('pond', 'Bergamot', { role: 'water' }),
      circle('linked', 'Bergamot', { plantId: 'x' }), circle('locked', 'Bergamot', { locked: true }),
      circle('gone', 'Bergamot', { role: 'plant', status: 'gone' }), circle('other', 'Monarda'),
      { ...base, id: 'rect', type: 'rect', x: 0, y: 0, width: 1, height: 1, rotation: 0, label: 'Bergamot' } as Shape,
      circle('hidden', 'Bergamot', { role: 'other' }),
    ];
    state.roleViews = { other: { hidden: true } };
    expect(unlinkedWithLabel('Bergamot', ['a'])).toEqual(['b']);
    expect(unlinkedWithLabel('Bergamot', ['a'], { locked: true })).toEqual(['locked']); // (asked about separately)
    expect(unlinkedWithLabel('', [])).toEqual([]);
    expect(canLinkToPlant(state.shapes[2])).toBe(false); // (a pond)
  });
  it('links several as one step to undo, and leaves non-plant shapes alone', () => {
    state.shapes = [circle('a', 'Bergamot'), circle('b', 'bergamot'), circle('pond', 'Bergamot', { role: 'water' })];
    state.history = [JSON.parse(JSON.stringify({ shapes: state.shapes }))] as never; state.historyIndex = 0;
    expect(linkShapesToPlant(['a', 'b', 'pond'], bergamot)).toBe(2);
    expect(state.shapes.map((s) => s.label)).toEqual(['Wild bergamot', 'Wild bergamot', 'Bergamot']);
    expect(state.shapes.filter((s) => s.type === 'circle' && s.plantId === bergamot.id)).toHaveLength(2);
    undo();
    expect(state.shapes.map((s) => s.label)).toEqual(['Bergamot', 'bergamot', 'Bergamot']);
  });
  it("swapped for a plant with no size known, it keeps its own (round 3: an 8 ft blueberry became a 2 ft dot)", () => {
    state.shapes = [circle('b', 'Highbush blueberry', { radius: 4, plantId: bergamot.id, role: 'plant', sizeFrom: 'plant' } as Partial<Shape>)];
    plantsById[bergamot.id] = bergamot;
    const climax = { id: 'vaccinium-virgatum-climax', common: "Rabbiteye blueberry 'Climax'", form: 'Shrub' } as Plant;
    linkShapesToPlant(['b'], climax);
    expect(state.shapes[0]).toMatchObject({ plantId: climax.id, radius: 4, sizeFrom: 'manual' });
  });
  it('a circle linked to a tree keeps its drawn size as an existing tree; relinked to a shrub, it takes the shrub\'s size', () => {
    const oak = { id: 'quercus-rubra', common: 'Northern red oak', form: 'Tree', width: { min: 40, max: 60, med: 50 } } as Plant;
    const holly = { id: 'ilex-glabra', common: 'Inkberry', form: 'Shrub', width: { min: 4, max: 6, med: 5 } } as Plant;
    plantsById[oak.id] = oak; plantsById[holly.id] = holly;
    state.shapes = [circle('t', 'Big oak', { radius: 3 })];
    linkShapesToPlant(['t'], oak);
    expect(state.shapes[0]).toMatchObject({ plantId: oak.id, radius: 3, tree: true, sizeFrom: 'manual' });
    // A mislink put right: no longer a tree, and the shrub's size.
    linkShapesToPlant(['t'], holly);
    const t = state.shapes[0];
    expect(t).toMatchObject({ plantId: holly.id, sizeFrom: 'plant' });
    expect(t.type === 'circle' && t.tree).toBeFalsy();
    expect(t.type === 'circle' && t.radius).not.toBe(3);
    // Sized from the shrub, then linked to the oak: the oak's size (the shrub's says nothing about the tree).
    linkShapesToPlant(['t'], oak);
    expect(state.shapes[0]).toMatchObject({ tree: true, sizeFrom: 'manual' });
    expect(state.shapes[0].type === 'circle' && state.shapes[0].radius).toBeGreaterThan(5);
    // A shaped canopy keeps its outline either way.
    const canopy = [{ x: 3, y: 0 }, { x: 0, y: 3 }, { x: -3, y: 0 }];
    state.shapes = [circle('c', 'Pruned', { radius: 3, tree: true, sizeFrom: 'manual', canopy } as Partial<Shape>)];
    linkShapesToPlant(['c'], holly);
    expect(state.shapes[0]).toMatchObject({ radius: 3, canopy });
  });
});
