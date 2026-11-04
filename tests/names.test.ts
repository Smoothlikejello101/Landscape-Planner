import { describe, expect, it } from 'vitest';
import { inSentence, labelShown, sameName, sameSaid, setCatalogNames, setWrittenName, titleCase } from '../src/names';
import { shortNames } from '../src/labels';
import { kindDef } from '../src/kinds';
import { sunDismissedFor } from '../src/sun';
import type { Plant } from '../src/plants';
import type { Shape } from '../src/types';

// Names of things in Title Case (Jason, Nov 4, from the beta testers: "why are some of the plants capitalized & some
// aren't?"; "I lean title case for everything").

describe('Title Case for names', () => {
  it('capitalizes each word, after a hyphen or slash too, not after an apostrophe', () => {
    expect(titleCase('Black-eyed susan')).toBe('Black-Eyed Susan');
    expect(titleCase('Purple coneflower')).toBe('Purple Coneflower');
    expect(titleCase("Kalm's St. John's wort")).toBe("Kalm's St. John's Wort");
    expect(titleCase('Bradford/Callery pear')).toBe('Bradford/Callery Pear');
    expect(titleCase('Peach / nectarine')).toBe('Peach / Nectarine');
    expect(titleCase('Japanese-oak')).toBe('Japanese-Oak');
  });
  it('keeps the small words small unless first or last', () => {
    expect(titleCase('Jack-in-the-pulpit')).toBe('Jack-in-the-Pulpit');
    expect(titleCase('Lily of the valley')).toBe('Lily of the Valley');
    expect(titleCase('Rose of Sharon')).toBe('Rose of Sharon');
    expect(titleCase('Love-in-a-mist')).toBe('Love-in-a-Mist');
    expect(titleCase('the plant')).toBe('The Plant'); // (first)
    expect(titleCase('Something to look at')).toBe('Something to Look At'); // (last)
    // (A small word the catalog capitalizes is a name's own: a rose called The Countryman.)
    expect(titleCase('Rose The Countryman')).toBe('Rose The Countryman');
  });
  it("leaves a quoted cultivar, inner capitals, all capitals and the plant's botanical name as they are", () => {
    expect(titleCase("Black-eyed Susan 'American Gold Rush'")).toBe("Black-Eyed Susan 'American Gold Rush'");
    expect(titleCase("Japanese camellia 'White by the Gate'")).toBe("Japanese Camellia 'White by the Gate'");
    expect(titleCase("Cape jasmine 'Kleim's Hardy'")).toBe("Cape Jasmine 'Kleim's Hardy'");
    expect(titleCase('Coneflower ‘lady in red’ hybrid')).toBe('Coneflower ‘lady in red’ Hybrid');
    expect(titleCase("McKana's giant columbine")).toBe("McKana's Giant Columbine");
    expect(titleCase("RED ROCKET 'Whit IV'")).toBe("RED ROCKET 'Whit IV'");
    expect(titleCase('ZZ plant')).toBe('ZZ Plant');
    expect(titleCase('Acca sellowiana', 'Acca sellowiana')).toBe('Acca sellowiana');
    expect(titleCase("St. Andrew's cross (subsp. multicaule)", 'Hypericum hypericoides subsp. multicaule')).toBe("St. Andrew's Cross (subsp. multicaule)");
    expect(titleCase('Tall oatgrass subsp bulbosum', 'Arrhenatherum elatius subsp bulbosum')).toBe('Tall Oatgrass subsp bulbosum');
    expect(titleCase('Echinacea Cone-fections series', 'Echinacea Cone-fections series')).toBe('Echinacea Cone-fections series');
    expect(titleCase('Adiantum × mairisii', 'Adiantum × mairisii')).toBe('Adiantum × mairisii');
  });
  it("counts a botanical word only where the name says its genus: the same word in English is capitalized", () => {
    expect(titleCase('Biennial gaura', 'Oenothera gaura')).toBe('Biennial Gaura');
    expect(titleCase('Cabbage palmetto', 'Sabal palmetto')).toBe('Cabbage Palmetto');
  });
  it('words in brackets as any other', () => {
    expect(titleCase('Purple passionflower (maypop)')).toBe('Purple Passionflower (Maypop)');
  });
  it('is the same name once more', () => {
    for (const n of ['Black-Eyed Susan', "Cape Jasmine 'Kleim's Hardy'", 'Lily of the Valley']) expect(titleCase(n)).toBe(n);
  });
  it('the kinds of things too, inside a sentence in lowercase but for a word in capitals', () => {
    expect(kindDef('arbor').label).toBe('Arbor or Pergola');
    expect(kindDef('property').startLabel([])).toBe('Property Line');
    expect(inSentence('Garage Door')).toBe('garage door');
    expect(inSentence('AC Unit')).toBe('AC unit');
  });
});

describe("a placed plant's label", () => {
  setCatalogNames((id) => (id === 'rudbeckia-hirta' ? 'Black-Eyed Susan' : undefined));
  it("shows the catalog's name in Title Case where it's that name in any case; a label changed stays as typed", () => {
    expect(labelShown({ label: 'Black-eyed susan', plantId: 'rudbeckia-hirta' })).toBe('Black-Eyed Susan');
    expect(labelShown({ label: ' black-eyed  SUSAN ', plantId: 'rudbeckia-hirta' })).toBe('Black-Eyed Susan');
    expect(labelShown({ label: 'by the mailbox', plantId: 'rudbeckia-hirta' })).toBe('by the mailbox');
    expect(labelShown({ label: 'Black-eyed susan' })).toBe('Black-eyed susan'); // (not linked to a plant)
    expect(sameName("Cape jasmine ‘Kleim's Hardy’", "Cape Jasmine 'Kleim's Hardy'")).toBe(true);
  });
  it('a shorter name for a small circle still knows the kind from the name as the catalog writes it', () => {
    setWrittenName('h', "Smooth hydrangea 'Haas' Halo'");
    setWrittenName('r', "Black-eyed Susan 'American Gold Rush'");
    const h = { id: 'h', common: "Smooth Hydrangea 'Haas' Halo'" } as Plant, r = { id: 'r', common: "Black-Eyed Susan 'American Gold Rush'" } as Plant;
    expect(shortNames(h.common, h)).toContain("'Haas' Halo' Hydrangea");
    expect(shortNames(r.common, r)).not.toContain("'American Gold Rush' Susan");
  });
});

describe('warnings dismissed before the names changed case', () => {
  it('stay dismissed', () => {
    expect(sameSaid('Black-eyed susan gets about 3 h of sun here; it prefers full sun.', 'Black-Eyed Susan gets about 3 h of sun here; it prefers full sun.')).toBe(true);
    const s = { sunDismissed: 'Black-eyed susan gets about 3 h of sun here; it prefers full sun.' } as Shape;
    expect(sunDismissedFor({ ok: false, message: 'Black-Eyed Susan gets about 3 h of sun here; it prefers full sun.' } as Parameters<typeof sunDismissedFor>[0], s)).toBe(true);
    expect(sunDismissedFor({ ok: false, message: 'Black-Eyed Susan gets only about 9 h of sun here; it wants shade.' } as Parameters<typeof sunDismissedFor>[0], s)).toBe(false);
  });
});
