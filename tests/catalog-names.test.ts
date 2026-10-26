import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { cultivarIn, cultivarName, renameCultivars, tradeIn } from '../scripts/catalog/names.mjs';

describe('cultivar names: the plant, then the cultivar in quotes or its trade name (Jason, 2026-10-25)', () => {
  const name = (common: string, botanical: string, species?: string) => cultivarName({ common, botanical }, species);
  it('reads the cultivar and trade name off the botanical name', () => {
    expect(cultivarIn("Hydrangea arborescens 'Haas' Halo'")).toBe("Haas' Halo");
    expect(tradeIn("Nandina domestica Flirt 'Murasaki'")).toBe('Flirt');
    expect(tradeIn("Echinacea purpurea 'Magnus'")).toBeNull();
    expect(tradeIn('Acer rubrum var. drummondii')).toBeNull();
    // (An apostrophe in a word isn't a quote: the trade name keeps it.)
    expect([cultivarIn("Rosa Child's Play 'SAVachild'"), tradeIn("Rosa Child's Play 'SAVachild'")]).toEqual(['SAVachild', "Child's Play"]);
    expect(name("Child's Play", "Rosa Child's Play 'SAVachild'")).toBe("Rosa Child's Play");
    expect(name("Sharum's Shamrock holly", "Ilex Sharum's Shamrock 'EN2'")).toBe("Holly Sharum's Shamrock");
  });
  it('puts the plant first, in the words the name already used', () => {
    expect(name('Limelight Hydrangea', "Hydrangea paniculata 'Limelight'")).toBe("Hydrangea 'Limelight'");
    expect(name("'Acapulco Orange' Giant Hyssop", "Agastache 'Acapulco Orange'")).toBe("Giant Hyssop 'Acapulco Orange'");
    expect(name('Flirt Nandina', "Nandina domestica Flirt 'Murasaki'")).toBe('Nandina Flirt'); // (a trade name: no quotes)
    expect(name('My Fair Maiden Maiden Grass', "Miscanthus sinensis My Fair Maiden 'NCMS1'")).toBe('Maiden Grass My Fair Maiden');
    expect(name("'Deppe' Sunny Boulevard St. John's Wort", "Hypericum Sunny Boulevard 'Deppe'")).toBe("St. John's Wort Sunny Boulevard");
    expect(name('Chinese Silver Grass "Morning Light\'', "Miscanthus sinensis 'Morning Light'")).toBe("Chinese Silver Grass 'Morning Light'"); // (its stray quote fixed)
  });
  it('a name that is the cultivar alone takes its species’ name, else its genus', () => {
    expect(name("'Avondale'", "Symphyotrichum cordifolium 'Avondale'", 'Blue wood aster')).toBe("Blue wood aster 'Avondale'");
    expect(name('Thelma', "Rosa 'Thelma'")).toBe("Rosa 'Thelma'");
    expect(name('Bonica 82', "Rosa Bonica 'MELdomonac'")).toBe('Rosa Bonica'); // (a year isn't a plant)
  });
  it('leaves alone what already follows it, groups, and names it can’t read for sure', () => {
    expect(name("Heuchera 'Autumn Bride'", "Heuchera villosa 'Autumn Bride'")).toBeNull();
    expect(name("Astilbe 'Visions' series (3 cvs)", "Astilbe chinensis 'Visions'")).toBeNull();
    expect(name('Red Rome Apple', "Malus domestica 'Rome'")).toBeNull(); // (words on both sides of it)
    expect(name('Coral bells', "Heuchera 'Palace Purple'")).toBeNull(); // (the name never says which)
    expect(name("Lizard's tail", 'Saururus cernuus')).toBeNull(); // (not a cultivar: an apostrophe)
  });
  it('renames a catalog, keeping each former name searchable', () => {
    const file = { plants: [
      { id: 'hydrangea-paniculata', common: 'Panicled hydrangea', botanical: 'Hydrangea paniculata' },
      { id: 'lime', common: 'Limelight Hydrangea', botanical: "Hydrangea paniculata 'Limelight'", parent: 'hydrangea-paniculata', synonyms: ['Limelight'] },
    ] };
    expect(renameCultivars(file)).toEqual([['lime', 'Limelight Hydrangea', "Hydrangea 'Limelight'"]]);
    expect(file.plants[1]).toMatchObject({ common: "Hydrangea 'Limelight'", synonyms: ['Limelight', 'Limelight Hydrangea'] });
  });
});
