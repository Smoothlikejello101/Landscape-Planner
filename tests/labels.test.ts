import { describe, expect, it } from 'vitest';
import { fitInCircle, LABEL_LINE_HEIGHT, plantLabelFit, shortNames, textWidth1 } from '../src/labels';

// In tests text is measured by estimate: 0.55 of the font size per character.
const width = (s: string, fs: number) => textWidth1(s) * fs;

describe('plant names inside their circles', () => {
  it('keeps a short name on one line at full size in a big circle', () => {
    expect(fitInCircle('Buttonbush', 80)).toEqual({ lines: ['Buttonbush'], fontSize: 14, dy: 0 });
  });
  it('wraps onto more lines, then shrinks, to stay inside the circle', () => {
    const fit = fitInCircle("Smooth hydrangea 'Haas' Halo'", 40)!;
    expect(fit.lines.length).toBeGreaterThan(1);
    // Every line fits the circle's width where it sits.
    const lh = fit.fontSize * LABEL_LINE_HEIGHT;
    fit.lines.forEach((l, i) => {
      const far = Math.abs((i - (fit.lines.length - 1) / 2) * lh) + lh / 2;
      expect(width(l, fit.fontSize)).toBeLessThanOrEqual(2 * Math.sqrt(38 ** 2 - far ** 2));
    });
    expect(fit.lines.join(' ')).toBe("Smooth hydrangea 'Haas' Halo'");
  });
  it("gives up rather than spill over (a word too long for the circle)", () => {
    expect(fitInCircle('Coneflower', 12)).toBe(null);
  });
  it('can sit below a trunk', () => {
    const fit = fitInCircle('Oak', 60, { below: 10 })!;
    expect(fit.dy - (fit.lines.length * fit.fontSize * LABEL_LINE_HEIGHT) / 2).toBeCloseTo(10);
  });
  it('shortens a name when the whole name will not fit', () => {
    expect(shortNames("Smooth hydrangea 'Haas' Halo'")).toEqual(["'Haas' Halo' hydrangea", "'Haas' Halo'"]);
    expect(shortNames('Purple passionflower (maypop)')).toEqual(['Purple passionflower']);
    expect(shortNames("Rose 'Julia Child' (floribunda)")).toEqual(["Rose 'Julia Child'", "'Julia Child' Rose", "'Julia Child'"]);
    expect(shortNames("Greater Canada St. John's wort")).toEqual([]); // an apostrophe isn't a cultivar
    // A catalog short name comes first, while the plant still has its catalog name.
    expect(shortNames('Tennessee coneflower', { id: 'e', common: 'Tennessee coneflower', short: 'TN coneflower' })[0]).toBe('TN coneflower');
    expect(shortNames('My coneflower', { id: 'e', common: 'Tennessee coneflower', short: 'TN coneflower' })).toEqual([]);
  });
  it('uses the best form that fits, or nothing', () => {
    expect(plantLabelFit("Oakleaf hydrangea 'Ruby Slippers'", 200)!.lines.join(' ')).toBe("Oakleaf hydrangea 'Ruby Slippers'");
    const small = plantLabelFit("Oakleaf hydrangea 'Ruby Slippers'", 30)!;
    expect(small.lines.join(' ')).not.toContain('Oakleaf');
    expect(plantLabelFit("Oakleaf hydrangea 'Ruby Slippers'", 8)).toBe(null);
  });
});
