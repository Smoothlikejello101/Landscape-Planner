// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { keyboardInset } from '../src/keyboard';
import { kindOfShape } from '../src/kinds';
import { alongLabel, boxLabelAngle } from '../src/geometry';
import type { PathShape, Shape } from '../src/types';

const shape = (over: Partial<Shape>): Shape => ({ id: 'x', type: 'rect', x: 0, y: 0, width: 4, height: 4, rotation: 0, color: '#000', label: '', opacity: 1, locked: false, ...over } as Shape);

describe('the on-screen keyboard', () => {
  const vv = (height: number, offsetTop = 0) => Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height, offsetTop } });
  it('measures what it covers, ignoring small toolbar and zoom shifts', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    vv(800); expect(keyboardInset()).toBe(0);
    vv(480); expect(keyboardInset()).toBe(320); // the page didn't shrink, the keyboard covers it
    vv(760); expect(keyboardInset()).toBe(0); // a toolbar, not a keyboard
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: 400, offsetTop: 0, scale: 2 } });
    expect(keyboardInset()).toBe(0); // pinch-zoomed to 2x, not a keyboard
  });
});

describe('adding another of the same', () => {
  it('works out what a shape was added as', () => {
    expect(kindOfShape(shape({ role: 'bed' }))).toBe('bed');
    expect(kindOfShape(shape({ role: 'boundary', label: 'Property line' }))).toBe('property');
    expect(kindOfShape(shape({ role: 'boundary', label: 'Back fence' }))).toBe('fence');
    expect(kindOfShape(shape({ role: 'path', label: 'Driveway' }))).toBe('driveway');
    expect(kindOfShape(shape({ role: 'path', label: 'Deck' }))).toBe('patio');
    expect(kindOfShape(shape({ role: 'path', type: 'poly', label: 'Path' } as Partial<Shape>))).toBe('path'); // drawn as an outline
    expect(kindOfShape(shape({ type: 'text' } as Partial<Shape>))).toBe('note'); // a note from before roles
    expect(kindOfShape(shape({ role: 'path', type: 'line', label: 'Stepping stones' } as Partial<Shape>))).toBe('path');
    expect(kindOfShape(shape({ role: 'shade' }))).toBe('sun');
    expect(kindOfShape(shape({ role: 'other', type: 'text' } as Partial<Shape>))).toBe('note');
    expect(kindOfShape(shape({}))).toBe('plain');
    expect(kindOfShape(shape({ role: 'plant' }))).toBe(null); // plants are placed, not drawn
  });
});

describe('labels along a line', () => {
  const line = (points: [number, number][], type: 'line' | 'poly' = 'line'): PathShape =>
    ({ id: 'l', type, x: 0, y: 0, points, rotation: 0, color: '#000', label: 'Property line', opacity: 1, locked: false, role: 'boundary' } as PathShape);
  it('sit on the middle of the longest run, turned to follow it, never upside down', () => {
    expect(alongLabel(line([[0, 0], [2, 0], [2, 20]]))).toEqual({ x: 2, y: 10, angle: 90 });
    expect(alongLabel(line([[10, 10], [0, 0]]))).toEqual({ x: 5, y: 5, angle: 45 }); // drawn right to left: still reads left to right
    expect(alongLabel(line([[0, 0], [30, 0], [30, 5], [0, 5]], 'poly')).angle).toBe(0);
  });
});

describe('a box shape\'s name', () => {
  it('reads as upright as it can, along the side nearer level, not turned with the shape', () => {
    // A bed drawn tall (8 by 50) and turned on its side: across, as it lies (it read top to bottom).
    expect(boxLabelAngle(90, 8, 50, 30)).toBe(0);
    expect(boxLabelAngle(270, 8, 50, 30)).toBe(0);
    // A narrow upright strip: a short name across it; a long one along it, reading down (as a fence's name does).
    expect(boxLabelAngle(0, 8, 50, 6)).toBe(0);
    expect(boxLabelAngle(0, 8, 50, 30)).toBe(90);
    // Never upside down; a slant keeps the side nearer level.
    expect(boxLabelAngle(180, 50, 8, 30)).toBe(0);
    expect(boxLabelAngle(30, 50, 8, 30)).toBe(30);
    expect(boxLabelAngle(60, 8, 50, 30)).toBe(-30);
    // Too long for either side: along the longer.
    expect(boxLabelAngle(90, 50, 8, 80)).toBe(90);
  });
});
