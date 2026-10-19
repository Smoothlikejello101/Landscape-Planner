// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { canLinkToPlant, linkShapesToPlant, sameLabel, unlinkedWithLabel, type Plant } from '../src/plants';
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
});
