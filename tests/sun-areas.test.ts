import { afterEach, describe, expect, it } from 'vitest';
import { BG_COLOR } from '../src/constants';
import { buildPlanSvg, legendEntries, planLayout, printContent } from '../src/print';
import { shapeToSvgString } from '../src/export';
import { state } from '../src/state';
import { NO_FILTER } from '../src/status';
import {
  hatchedAt, hatchRegion, keyHoursAt, KEY_HOURS, keyStops, SUN_HATCH, SUN_KEY, SUN_RAMP, sunRecorded, sunWash, washAt, washOver,
} from '../src/sun';
import type { Shape, SunInfo } from '../src/types';

// Sun areas drawn by their hours (Jason, Nov 4: "1) ramp plus hatch. 2) no, keep the separation 3) no"), as the page he
// answered gives the colors.

const base = { color: '#334155', label: '', opacity: 0.3, locked: false };
const rect = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id, type: 'rect', x, y, width: w, height: h, rotation: 0, ...extra } as Shape);
const hours = (h: number): SunInfo => ({ mode: 'hours', periods: [], hours: h, dappled: false });
const sunArea = (id: string, x: number, y: number, w: number, h: number, sun?: number, extra: Partial<Shape> = {}) =>
  rect(id, x, y, w, h, { role: 'shade', label: id, ...(sun === undefined ? {} : { sun: hours(sun) }), ...extra });
const bed = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Shape> = {}) =>
  rect(id, x, y, w, h, { role: 'bed', label: id, color: '#92400e', ...extra });
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

afterEach(() => { state.roleViews = {}; });

describe('the ramp', () => {
  it('is gold at 8 h or more, gray for 4 to 5 h, slate blue at 2 h or less, as the page\'s table gives them', () => {
    for (const h of [8, 9, 12]) expect(washAt(h)).toEqual({ color: '#ffe614', opacity: 0.42 });
    for (const h of [4, 4.5, 5]) expect(washAt(h)).toEqual({ color: '#c3c3c3', opacity: 0.38 });
    for (const h of [0, 1.5, 2]) expect(washAt(h)).toEqual({ color: '#2f5597', opacity: 0.4 });
    expect([SUN_RAMP.gold, SUN_RAMP.mid, SUN_RAMP.blue]).toEqual([washAt(8), washAt(4.5), washAt(2)]);
  });
  it('blends between the bands as the table has it: 6 to 7 h stay pale (the full gold waits for 8 h)', () => {
    expect(washAt(7)).toEqual({ color: '#eadb74', opacity: 0.41 });
    expect(washAt(6.5)).toEqual({ color: '#e0d68c', opacity: 0.4 });
    expect(washAt(6)).toEqual({ color: '#d6d0a0', opacity: 0.39 });
    expect(washAt(3)).toEqual({ color: '#778caf', opacity: 0.39 });
  });
  it('looks as the table says on the plan\'s ground and on white paper', () => {
    const plan: [number, string][] = [[8, '#f5e37c'], [7, '#ecdea6'], [6.5, '#e8dcb0'], [6, '#e4dab8'], [4.5, '#ddd5c6'], [3, '#bfbfbe'], [2, '#a1a8b4']];
    for (const [h, c] of plan) expect(washOver(washAt(h), BG_COLOR)).toBe(c);
    const paper: [number, string][] = [[8, '#fff59c'], [7, '#f6f0c6'], [6.5, '#f3efd1'], [6, '#efedda'], [4.5, '#e8e8e8'], [3, '#cad2e0'], [2, '#acbbd5']];
    for (const [h, c] of paper) expect(washOver(washAt(h), '#ffffff')).toBe(c);
  });
  it('goes through gray, not green or orange, and keeps its opacity near 40% all along', () => {
    for (let h = 0; h <= 10; h += 0.25) {
      const w = washAt(h), [r, g, b] = rgb(w.color);
      expect(w.opacity).toBeGreaterThanOrEqual(0.38);
      expect(w.opacity).toBeLessThanOrEqual(0.42);
      if (h > 5) {
        // Warm: yellow, not orange (red well over green) nor green (green over red).
        expect(r).toBeGreaterThanOrEqual(g);
        expect(r - g).toBeLessThan(30);
        expect(g).toBeGreaterThan(b);
      } else if (h < 4) {
        // Cool: blue over green over red, never a teal (green over blue).
        expect(b).toBeGreaterThan(g);
        expect(g).toBeGreaterThanOrEqual(r);
      }
    }
  });
  it('washes a sun area by its total hours, times or hours, and only one with its sun recorded', () => {
    expect(sunWash({ mode: 'times', periods: [[540, 780], [720, 900]], hours: 0, dappled: false })).toEqual(washAt(6)); // 9 am–3 pm, overlaps once
    expect(sunWash(hours(1))).toEqual(SUN_RAMP.blue);
    expect(sunRecorded(sunArea('a', 0, 0, 1, 1, 6))).toBe(true);
    expect(sunRecorded(sunArea('b', 0, 0, 1, 1))).toBe(false);
    expect(sunRecorded(bed('c', 0, 0, 1, 1, { sun: hours(6) }))).toBe(false);
  });
  it('draws on paper and in pictures in its wash, whatever color the area was given; one with nothing recorded as before', () => {
    const svg = shapeToSvgString(sunArea('East', 0, 0, 10, 10, 6.5, { color: '#facc15' }), 0, 0, 10);
    expect(svg).toContain('fill="#e0d68c" fill-opacity="0.4"');
    expect(shapeToSvgString(sunArea('West', 0, 0, 10, 10), 0, 0, 10)).toContain('fill="#334155" fill-opacity="0.3"');
  });
});

describe('the key', () => {
  it('runs from 8 h or more on the left to 2 h or less on the right', () => {
    const stops = keyStops(BG_COLOR);
    expect(stops).toHaveLength(KEY_HOURS.length);
    expect(stops[0]).toBe('#f5e37c');
    expect(stops.at(-1)).toBe('#a1a8b4');
    expect(keyHoursAt(0)).toBe(8);
    expect(keyHoursAt(1)).toBe(2);
    expect(keyHoursAt(3 / 7)).toBeCloseTo(5);
    expect(keyHoursAt(0.5)).toBeCloseTo(4.75);
  });
  it('says what the page said', () => {
    expect(SUN_KEY.most).toBe('☀ 8 h or more');
    expect(SUN_KEY.least).toBe('2 h or less');
    expect(SUN_KEY.plain).toBe('Plain: no sun recorded');
    expect(SUN_KEY.hatched).toBe('Hatched in a bed: no sun recorded');
  });
  it('takes the Sun Exposure line\'s place in the printed legend, with a swatch after it for any area with no hours yet', () => {
    const recorded = sunArea('Back', 0, 0, 10, 10, 6.5), unrecorded = sunArea('Side', 20, 0, 5, 5);
    const key = legendEntries([bed('Bed', 0, 0, 4, 4), recorded]).filter((e) => e.key === 'shade');
    expect(key).toEqual([{ key: 'shade', label: 'Sun Exposure: hours of direct sun', color: '#ffe614', outline: false, sunKey: true }]);
    const both = legendEntries([recorded, unrecorded]).filter((e) => e.key === 'shade');
    expect(both.map((e) => [e.label, !!e.sunKey, e.color])).toEqual([['Sun Exposure: hours of direct sun', true, '#ffe614'], ['Sun Exposure, no hours recorded', false, '#334155']]);
    // (None recorded: the one swatch, as before.)
    expect(legendEntries([unrecorded]).filter((e) => e.key === 'shade')).toEqual([{ key: 'shade', label: 'Sun Exposure', color: '#334155', outline: false }]);
  });
});

describe('the hatch', () => {
  // A bed 0–20 × 0–10 ft: its left half under a 6.5 h area, a corner under an area with nothing recorded; a 1.5 h area
  // off to the right, over ground.
  const shapes = [
    bed('Back bed', 0, 0, 20, 10),
    sunArea('Morning', -5, -5, 15, 20, 6.5),
    sunArea('Unrecorded', 15, 0, 5, 3),
    sunArea('Side', 30, 0, 10, 10, 1.5),
  ];
  it('covers the parts of beds outside every sun area with hours, and nothing outside beds', () => {
    expect(hatchedAt({ x: 15, y: 6 }, shapes, NO_FILTER)).toBe(true); // in the bed, no sun area
    expect(hatchedAt({ x: 17, y: 1 }, shapes, NO_FILTER)).toBe(true); // in the bed, in an area with nothing recorded
    expect(hatchedAt({ x: 5, y: 5 }, shapes, NO_FILTER)).toBe(false); // in the bed, in the 6.5 h area
    expect(hatchedAt({ x: 25, y: 5 }, shapes, NO_FILTER)).toBe(false); // plain ground
    expect(hatchedAt({ x: 35, y: 5 }, shapes, NO_FILTER)).toBe(false); // the 1.5 h area, over ground
    expect(hatchedAt({ x: -3, y: 12 }, shapes, NO_FILTER)).toBe(false); // the 6.5 h area, outside the bed
    const r = hatchRegion(shapes, NO_FILTER)!;
    expect(r.beds.map((s) => s.id)).toEqual(['Back bed']);
    expect(r.suns.map((s) => s.id)).toEqual(['Morning', 'Side']);
  });
  it('is not there while the Sun Exposure layer is hidden, nor in a plan with no sun recorded', () => {
    state.roleViews = { shade: { hidden: true } };
    expect(hatchRegion(shapes, NO_FILTER)).toBeNull();
    expect(hatchedAt({ x: 15, y: 6 }, shapes, NO_FILTER)).toBe(false);
    state.roleViews = {};
    expect(hatchRegion([bed('b', 0, 0, 5, 5), sunArea('u', 0, 0, 2, 2)], NO_FILTER)).toBeNull();
    // (Beds hidden: no beds to hatch.)
    state.roleViews = { bed: { hidden: true } };
    expect(hatchRegion(shapes, NO_FILTER)).toBeNull();
  });
  it('skips a bed that\'s gone or not shown in the phase picked; a sun area of another phase still counts as sun recorded', () => {
    const phased = [
      bed('Gone bed', 0, 0, 10, 10, { status: 'gone' }),
      bed('Later bed', 20, 0, 10, 10, { phase: 'Phase 2' }),
      bed('Now bed', 40, 0, 10, 10, { phase: 'Phase 1' }),
      sunArea('Later sun', 40, 0, 5, 10, 6, { phase: 'Phase 2' }),
    ];
    const filter = { ...NO_FILTER, phase: 'Phase 1' };
    expect(hatchRegion(phased, filter)!.beds.map((s) => s.id)).toEqual(['Now bed']);
    expect(hatchedAt({ x: 5, y: 5 }, phased, filter)).toBe(false);
    expect(hatchedAt({ x: 25, y: 5 }, phased, filter)).toBe(false);
    expect(hatchedAt({ x: 47, y: 5 }, phased, filter)).toBe(true);
    expect(hatchedAt({ x: 42, y: 5 }, phased, filter)).toBe(false);
  });
  it('is faint, the same at any zoom: lines every 7 px at 45°, #44403c at 40%', () => {
    expect(SUN_HATCH).toMatchObject({ color: '#44403c', opacity: 0.4, gap: 7, angle: 45 });
  });
  it('is never on paper or in a picture', () => {
    const svg = buildPlanSvg(planLayout('letter', 'auto', printContent(shapes, null, false).bounds!), shapes, null,
      { includeBackground: false, includeGrid: false, includePlantList: false, order: shapes }, 100).svg;
    expect(svg).toContain('fill="#e0d68c"'); // the 6.5 h area's wash
    expect(svg).not.toMatch(/hatch|<pattern|<mask/);
  });
});
