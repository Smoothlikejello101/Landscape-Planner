import { describe, expect, it } from 'vitest';
import { FILLER, NEED_WORDS, nameIndex, needNames, readNeeds, wordKey, type NeedSet } from '../src/search-needs';
import { FLOWER_CHOICES } from '../src/flower-colors';
import { PLANT_FILTER_DEFAULTS } from '../src/plants';

// Words of need in the picker's search (Jason, Nov 1, from the UI review): "shade flowers" is Part shade and Has
// flowers.

/** Names as the catalog and My plants might have them. */
const NAMES = nameIndex([
  'Sweet shade', 'Sweetshade', 'Deer fern', 'Native azaleas (all)', 'Evergreen Wisteria', 'Evergreen Clematis', 'Tree peony',
  'Butterfly weed (clay strain)', "Butterfly weed 'for Clay'", 'Jack-in-the-pulpit', 'Common nightshade', 'Groundcover Rose', 'Aster', 'American holly',
]);
const read = (text: string, o: { caret?: number; final?: boolean; can?: (s: NeedSet) => boolean } = {}) => readNeeds(text, NAMES, o);
const PART: NeedSet = { key: 'sun', value: 'Part' };

describe('words of need in the picker\'s search', () => {
  it('"shade flowers": Part shade and Has flowers', () => {
    const FLOWERS: NeedSet = { key: 'flowers', value: true };
    expect(read('shade flowers', { final: true })).toEqual({ text: '', caret: 0, sets: [PART, FLOWERS], taken: ['shade', 'flowers'] });
    // (Typing still: "flowers" may be "flowers…" yet, the search till it's finished.)
    expect(read('shade flowers')).toEqual({ text: 'flowers', caret: 7, sets: [PART], taken: ['shade'] });
    expect(read('shade flowers ')).toMatchObject({ text: '', sets: [PART, FLOWERS] });
    expect(read('flowering shrubs', { final: true })?.sets).toEqual([FLOWERS, { key: 'form', value: 'Shrub' }]);
    expect(read('shade aster', { final: true })).toMatchObject({ text: 'aster', sets: [PART] });
  });
  it('"flower" in a plant\'s name stays the search: Cardinal flower, Flowering dogwood, Coneflower', () => {
    const names = nameIndex(['Cardinal flower', 'Flowering dogwood', 'Purple coneflower', 'Flower-of-an-hour']);
    for (const t of ['cardinal flower', 'flowering dogwood', 'coneflower', 'cone flower', 'flower of an hour']) expect(readNeeds(t, names, { final: true }), t).toBeNull();
    expect(readNeeds('flowering ', names)).toBeNull(); // ("Flowering dogwood"?)
    expect(readNeeds('flower ', names)).toBeNull(); // ("Flower-of-an-hour"?)
    expect(readNeeds('flowers', names, { final: true })?.sets).toEqual([{ key: 'flowers', value: true }]);
  });
  it('a word that is part of a plant\'s name stays the search: "Sweet shade", run together or not', () => {
    for (const t of ['sweet shade', 'sweet shade ', 'Sweet Shade', 'sweet shades']) {
      expect(read(t), t).toBeNull();
      expect(read(t, { final: true }), t).toBeNull();
    }
    expect(nameIndex(['Sweetshade']).runs.has('sweetshade')).toBe(true);
    // ("night shade" is the nightshade, split: not shade.)
    expect(read('night shade', { final: true })).toBeNull();
  });
  it('the same word, with nothing of a name beside it, is a need', () => {
    expect(read('sweet shade', { final: true }, )).toBeNull();
    expect(read('shade sweet')?.sets).toEqual([PART]);
    expect(read('shade sweet')?.text).toBe('sweet');
  });
  it('a word becomes a filter once it\'s finished: a space, another word, or Enter', () => {
    expect(read('shade')).toBeNull(); // (still being typed: "shadeb…"?)
    expect(read('shade ')).toMatchObject({ text: '', sets: [PART] });
    expect(read('shade', { final: true })).toMatchObject({ text: '', sets: [PART] });
    expect(read('shade a')).toMatchObject({ text: 'a', sets: [PART] });
  });
  it('a word that may start a longer need, or a name, waits for the next word', () => {
    expect(read('deer ')).toBeNull(); // ("deer resistant"? "Deer fern"?)
    expect(read('deer r')).toBeNull();
    expect(read('deer resistant ')).toMatchObject({ text: '', sets: [{ key: 'deerResistant', value: true }], taken: ['deer resistant'] });
    expect(read('deer f')).toBeNull();
    expect(read('deer fern')).toBeNull();
    expect(read('deer fern', { final: true })).toBeNull();
    expect(read('deer shrubs ')).toMatchObject({ text: '', sets: [{ key: 'deerResistant', value: true }, { key: 'form', value: 'Shrub' }] });
    expect(read('deer', { final: true })?.sets).toEqual([{ key: 'deerResistant', value: true }]);
    // Names that start with the word: "Tree peony", "Native azaleas", "Evergreen Wisteria".
    expect(read('tree ')).toBeNull();
    expect(read('tree peony', { final: true })).toBeNull();
    expect(read('native azaleas', { final: true })).toBeNull();
    expect(read('native azalea')).toBeNull();
    expect(read('evergreen wisteria', { final: true })).toBeNull();
    expect(read('evergreen holly')).toMatchObject({ text: 'holly', sets: [{ key: 'evergreen', value: true }] });
    expect(read('tree', { final: true })?.sets).toEqual([{ key: 'form', value: 'Tree' }]);
    // A word inside a name, after its start, doesn't hold back the need: "Yellow shrub jessamine" vs "shrub".
    expect(readNeeds('shrub ', nameIndex(['Yellow shrub jessamine']))?.sets).toEqual([{ key: 'form', value: 'Shrub' }]);
    expect(readNeeds('yellow shrub ', nameIndex(['Yellow shrub jessamine']))).toBeNull();
  });
  it('a word of a name after other words: "butterfly weed clay"', () => {
    expect(read('butterfly weed clay', { final: true })).toBeNull();
    expect(read('clay shrubs', { final: true })?.sets).toEqual([{ key: 'clayOk', value: true }, { key: 'form', value: 'Shrub' }]);
    // (Beside it only a little word: "for clay" is no name of its own, though "Butterfly weed 'for Clay'" holds it.)
    expect(read('shrubs for clay', { final: true })).toMatchObject({ text: '', sets: [{ key: 'form', value: 'Shrub' }, { key: 'clayOk', value: true }] });
  });
  it('"wet " and "shrubs " are filters on a space, as on Enter: not kept by other names, or by a name starting "Shrub" (the bug hunt, Nov 1)', () => {
    const WET: NeedSet = { key: 'wetFeet', value: true }, SHRUB: NeedSet = { key: 'form', value: 'Shrub' }, CLAY: NeedSet = { key: 'clayOk', value: true };
    // (The catalog's: other names "Never Wet", "Wet Dog Wakerobin" and "Shrub Althea"; "Shrub lespedeza" its own.)
    const ix = needNames([
      { common: 'Goldenclub', synonyms: ['Never Wet'] }, { common: 'Red trillium', synonyms: ['Wet Dog Wakerobin'] },
      { common: 'Shrubby cinquefoil' }, { common: 'Shrub lespedeza' }, { common: 'Rose of Sharon', synonyms: ['Shrub Althea'] }, { common: 'Deer fern' },
    ] as { common: string; synonyms?: string[] }[]);
    for (const t of ['wet', 'shrubs', 'native wet', 'clay shrubs']) {
      expect(readNeeds(`${t} `, ix), t).toMatchObject({ text: '', sets: readNeeds(t, ix, { final: true })!.sets });
    }
    expect(readNeeds('native wet ', ix)?.sets).toEqual([{ key: 'native', value: 'here' }, WET]);
    expect(readNeeds('clay shrubs ', ix)?.sets).toEqual([CLAY, SHRUB]);
    // A name of a plant's own that starts with that very word still holds it till the next: "shrub " may be Shrub
    // lespedeza.
    expect(readNeeds('shrub ', ix)).toBeNull();
    expect(readNeeds('shrub lespedeza', ix, { final: true })).toBeNull();
    // Another name isn't the plant's own: "never wet" is the need and a search for "never".
    expect(readNeeds('never wet', ix, { final: true })).toMatchObject({ text: 'never', sets: [WET] });
    // Still names, as before: Deer fern.
    expect(readNeeds('deer ', ix)).toBeNull();
    expect(readNeeds('deer fern', ix, { final: true })).toBeNull();
  });
  it('a longer need that sets the same holds no word back, one that sets more does; a word finishing a need that\'s on goes', () => {
    const none = nameIndex([]);
    expect(readNeeds('clay ', none)?.sets).toEqual([{ key: 'clayOk', value: true }]); // ("clay soil": the same)
    expect(readNeeds('drought ', none)?.sets).toEqual([{ key: 'drought', value: true }]);
    expect(readNeeds('deer ', none)?.sets).toEqual([{ key: 'deerResistant', value: true }]);
    expect(readNeeds('dry ', none)).toBeNull(); // ("dry shade": Shade too)
    expect(readNeeds('wet s', none)).toBeNull(); // ("wet s…": a word under way, maybe "soil", waits)
    expect(readNeeds('wet soil ', none)).toMatchObject({ text: '', sets: [{ key: 'wetFeet', value: true }], taken: ['wet soil'] });
    // "wet " taken, then "soil": with Takes wet soil on, it goes too, setting nothing more; with it off, it's searched.
    const on = (s: NeedSet) => s.key === 'wetFeet' || s.key === 'deerResistant';
    expect(readNeeds('soil ', none, { on })).toEqual({ text: '', caret: 0, sets: [], taken: [] });
    expect(readNeeds('soil', none, { on, final: true })).toMatchObject({ text: '', sets: [] });
    expect(readNeeds('soil', none, { on })).toBeNull(); // (still being typed)
    expect(readNeeds('soil ', none)).toBeNull();
    expect(readNeeds('soil ', none, { on: (s) => s.key === 'drought' })).toMatchObject({ text: '', sets: [] }); // ("dry soil")
    expect(readNeeds('aster feet ', none, { on })).toMatchObject({ text: 'aster ', sets: [] });
    expect(readNeeds('resistant shrubs ', none, { on })).toMatchObject({ text: '', sets: [{ key: 'form', value: 'Shrub' }] });
    expect(readNeeds('feet ', none, { on: (s) => s.key === 'clayOk' })).toBeNull(); // (not the need that's on)
    // Part of a name: kept.
    expect(readNeeds('crow soil ', nameIndex(['Crow soil'] ), { on })).toBeNull();
  });
  it('several at once, with the little words that join them', () => {
    expect(read('native shrubs for shade ')).toMatchObject({ text: '', sets: [{ key: 'native', value: 'here' }, { key: 'form', value: 'Shrub' }, PART] });
    expect(read('plants for dry shade', { final: true })).toMatchObject({ text: '', sets: [{ key: 'drought', value: true }, { key: 'sun', value: 'Shade' }] });
    expect(read('shade tolerant aster', { final: true })).toMatchObject({ text: 'aster', sets: [PART] });
    // (No need, no little words dropped: "plants for" is still being searched.)
    expect(read('plants for ')).toBeNull();
    // (Part of a name, a little word stays: "Jack in the pulpit".)
    expect(read('jack in the pulpit shade', { final: true })).toMatchObject({ text: 'jack in the pulpit', sets: [PART] });
  });
  it('sun and shade', () => {
    const sun = (t: string) => read(t, { final: true })?.sets;
    expect(sun('full sun')).toEqual([{ key: 'sun', value: 'Full' }]);
    expect(sun('sunny')).toEqual([{ key: 'sun', value: 'Full' }]);
    expect(sun('part shade')).toEqual([PART]);
    expect(sun('partial sun')).toEqual([PART]);
    expect(sun('full shade')).toEqual([{ key: 'sun', value: 'Shade' }]);
    expect(sun('deep shade')).toEqual([{ key: 'sun', value: 'Shade' }]);
    expect(sun('sunflower')).toBeUndefined();
  });
  it('flowers of a color, as the color chips ask', () => {
    expect(read('blue flowers', { final: true })).toMatchObject({ text: '', sets: [{ key: 'flowerColors', add: 'blue' }] });
    expect(read('red flower shrubs', { final: true })?.sets).toEqual([{ key: 'flowerColors', add: 'red' }, { key: 'form', value: 'Shrub' }]);
    expect(read('blue', { final: true })).toBeNull();
  });
  it('wet, dry, clay, evergreen, native, and the forms', () => {
    const one = (t: string) => read(t, { final: true })?.sets;
    expect(one('wet')).toEqual([{ key: 'wetFeet', value: true }]);
    expect(one('wet soil')).toEqual([{ key: 'wetFeet', value: true }]);
    expect(one('dry')).toEqual([{ key: 'drought', value: true }]);
    expect(one('drought tolerant')).toEqual([{ key: 'drought', value: true }]);
    expect(one('clay soil')).toEqual([{ key: 'clayOk', value: true }]);
    expect(one('evergreens')).toEqual([{ key: 'evergreen', value: true }]);
    expect(one('natives')).toEqual([{ key: 'native', value: 'here' }]);
    expect(one('grasses')).toEqual([{ key: 'form', value: 'Grass/Sedge' }]);
    expect(one('bushes')).toEqual([{ key: 'form', value: 'Shrub' }]);
    expect(one('cacti')).toEqual([{ key: 'form', value: 'Cactus' }]);
    expect(one('groundcover')).toBeUndefined(); // (no such form, nor filter)
    expect(one('ground cover')).toBeUndefined();
  });
  it('as typed: capitals, hyphens; the cursor kept where it was', () => {
    expect(read('Deer-resistant shrubs', { final: true })?.sets).toEqual([{ key: 'deerResistant', value: true }, { key: 'form', value: 'Shrub' }]);
    expect(read('SHADE ', {})?.sets).toEqual([PART]);
    // Typed in the middle: "shade |aster" with the cursor after "shade ".
    expect(read('shade aster', { caret: 6 })).toMatchObject({ text: 'aster', caret: 0 });
    expect(read('aster shade ', { caret: 12 })).toMatchObject({ text: 'aster ', caret: 6 });
    expect(read('aster shade', { final: true })).toMatchObject({ text: 'aster', caret: 5 });
  });
  it('a need whose filter can\'t be set here stays a word', () => {
    expect(read('cactus', { final: true, can: (s) => s.key !== 'form' })).toBeNull();
    expect(read('shrubs for shade', { final: true, can: (s) => s.key !== 'form' })).toMatchObject({ text: 'shrubs', sets: [PART] });
  });
  it('the table: only the picker\'s own filters, each word once', () => {
    const keys = new Set(NEED_WORDS.flatMap((n) => n.sets.map((s) => s.key)));
    expect([...keys].sort()).toEqual(['clayOk', 'deerResistant', 'drought', 'evergreen', 'flowerColors', 'flowers', 'form', 'native', 'sun', 'wetFeet']);
    for (const k of keys) expect(PLANT_FILTER_DEFAULTS, k).toHaveProperty(k); // (never a filter the picker hasn't)
    const says = NEED_WORDS.flatMap((n) => n.says);
    expect(new Set(says).size).toBe(says.length);
    for (const c of FLOWER_CHOICES) expect(says).toContain(`${c} flowers`);
    for (const w of FILLER) expect(says).not.toContain(w);
  });
  it('words compared as their singular', () => {
    expect(['roses', 'rose'].map(wordKey)).toEqual(['ros', 'ros']);
    expect(['grasses', 'grass'].map(wordKey)).toEqual(['grass', 'grass']);
    expect(['lilies', 'lily'].map(wordKey)).toEqual(['lily', 'lily']);
    expect(['iris', 'cactus', 'deer'].map(wordKey)).toEqual(['iris', 'cactus', 'deer']);
  });
});
