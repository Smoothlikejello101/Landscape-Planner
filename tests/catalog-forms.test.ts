import { describe, expect, it } from 'vitest';
// @ts-expect-error (plain JavaScript build script)
import { ncsuFields } from '../scripts/catalog/extract.mjs';
// @ts-expect-error (plain JavaScript build script)
import { CLIMBING as BUILD_CLIMBING, FORM_WORDS, HABIT_FORMS as BUILD_HABIT_FORMS, TEXTURES as BUILD_TEXTURES, ncsuClaims } from '../scripts/catalog/claims.mjs';
// @ts-expect-error (plain JavaScript build script)
import { writeAudit } from '../scripts/catalog/write.mjs';
import { catalogErrors, CLIMBING, FLOWER_FORM, HABIT_FORMS, LEAF_FORM, TEXTURES, type CatalogFile } from '../src/catalog';
import { edibleText, flowerFormText, fruitSetText, habitText, leafFormText } from '../src/ui/plant-details';

// What its flowers and leaves look like, its texture and shape: NC State's fields, for drawing each plant its own way
// (Jason, 2026-10-29).

const page = (fields: Record<string, string[]>) =>
  `<dl>${Object.entries(fields).map(([k, vs]) => `<dt>${k}:</dt>${vs.map((v) => `<dd><span>${v}</span></dd>`).join('')}`).join('')}</dl>`;

describe("a plant's flowers, leaves and shape", () => {
  it("reads NC State's fields into the catalog's words, leaving out a value it doesn't know", () => {
    const witchHazel = ncsuFields(page({
      'Flower Inflorescence': ['Cyme'], 'Flower Petals': ['4-5 petals/rays'], 'Flower Size': ['&lt; 1 inch'],
      'Leaf Type': ['Simple'], 'Leaf Arrangement': ['Alternate'], 'Leaf Shape': ['Elliptical', 'Obovate', 'Ovate'], 'Leaf Margin': ['Dentate'], 'Leaf Length': ['3-6 inches'],
      Texture: ['Coarse'], 'Habit/Form': ['Erect', 'Multi-stemmed', 'Open', 'Spreading', 'Floppy'],
    }));
    const crossvine = ncsuClaims(ncsuFields(page({ 'Climbing Method': ['Clinging', 'Tendrils'] })));
    expect(crossvine.find((c: { fact: string }) => c.fact === 'climbs_by')?.v).toEqual(['clinging', 'tendrils']);
    const facts = Object.fromEntries(ncsuClaims(witchHazel).map((c: { fact: string; v: unknown }) => [c.fact, c.v]));
    expect(facts.flower_form).toEqual({ inflorescence: ['cyme'], petals: ['4-5'], size: ['<1'] });
    expect(facts.leaf_form).toEqual({ type: ['simple'], shape: ['elliptical', 'obovate', 'ovate'], arrangement: ['alternate'], margin: ['dentate'], length: ['3-6'] });
    expect(facts.texture).toEqual(['coarse']);
    expect(facts.habit_form).toEqual(['erect', 'multi-stemmed', 'open', 'spreading']); // ("Floppy": not a word the catalog knows)
    const none = Object.fromEntries(ncsuClaims(ncsuFields(page({ Genus: ['Hamamelis'] }))).map((c: { fact: string; v: unknown }) => [c.fact, c.v]));
    expect(none.flower_form).toBeUndefined();
    expect(none.leaf_form).toBeUndefined();
  });

  it('says what the flowers and leaves look like in a line', () => {
    expect(flowerFormText({ shape: ['cup'], petals: ['4-5'], size: ['1-3'], inflorescence: ['panicle'] })).toBe('Cup-shaped · 4–5 petals · 1–3 in · in panicles');
    expect(flowerFormText({ inflorescence: ['cyme'], petals: ['4-5'], size: ['<1'] })).toBe('4–5 petals · under 1 in · in clusters (cymes)');
    expect(flowerFormText({ shape: ['tubular'], inflorescence: ['solitary'], size: ['>6'] })).toBe('Tubular · over 6 in · borne singly');
    expect(flowerFormText({ inflorescence: ['insignificant'] })).toBe('Flowers not showy');
    expect(flowerFormText(undefined)).toBe('');
    expect(leafFormText({ type: ['simple'], shape: ['ovate'], margin: ['serrate'], arrangement: ['opposite'], length: ['3-6'] })).toBe('Simple · ovate · toothed · opposite · 3–6 in');
    expect(leafFormText({ type: ['needles'], length: ['<1'] })).toBe('Needles · under 1 in');
    expect(habitText({ habit_form: ['erect', 'multi-stemmed', 'open', 'spreading'], texture: ['coarse'] })).toBe('Erect, multi-stemmed, open, spreading · coarse texture');
    expect(habitText({ texture: ['fine', 'medium'] })).toBe('Fine to medium texture');
    expect(habitText({})).toBe('');
    expect(habitText({ habit_form: ['climbing'], climbs_by: ['twining', 'scrambler'] })).toBe('Climbing · climbs by twining or scrambling');
    expect(leafFormText({ arrangement: ['complex'] })).toBe(''); // (nothing it says in words)
    expect(leafFormText({ type: ['simple'], shape: ['elliptical', 'obovate', 'ovate', 'oblong'], margin: ['serrate', 'dentate', 'entire'] })).toBe('Simple · elliptical, obovate or ovate · toothed or smooth-edged');
  });

  it('writes them as read, and nothing of a part or word it doesn\'t know', () => {
    const catalog = {
      meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: {}, enums: { form: ['Shrub', 'Tree'] } },
      plants: [{ id: 'hamamelis-virginiana', common: 'Witch hazel', src: [], audited: null, facts: { form: 'Shrub' } }],
    };
    const fact = (v: unknown) => ({ v, src: ['ncsu'], check: 'single' });
    const audit = [{ id: 'hamamelis-virginiana', claims: [{ src: 'ncsu', kind: 'authority' }], facts: {
      flower_form: fact({ inflorescence: ['cyme'], petals: ['4-5'], size: ['<1'] }),
      leaf_form: fact({ type: ['simple'], colour: ['green'] }), // (a part it doesn't know: not written)
      texture: fact(['coarse']),
      habit_form: fact(['erect', 'floppy']), // (a word it doesn't know: not written)
    } }];
    const facts = writeAudit(catalog, audit, '2026-10-29').file.plants[0].facts;
    expect(facts.flower_form).toEqual(fact({ inflorescence: ['cyme'], petals: ['4-5'], size: ['<1'] }));
    expect(facts.texture).toEqual(fact(['coarse']));
    expect(facts.leaf_form).toBeUndefined();
    expect(facts.habit_form).toBeUndefined();
  });

  it("the app knows the build's words, part by part", () => {
    expect(FLOWER_FORM).toEqual(FORM_WORDS.flower_form);
    expect(LEAF_FORM).toEqual(FORM_WORDS.leaf_form);
    expect(TEXTURES).toEqual(BUILD_TEXTURES);
    expect(HABIT_FORMS).toEqual(BUILD_HABIT_FORMS);
    expect(CLIMBING).toEqual(BUILD_CLIMBING);
  });

  it("are checked: a part or word the catalog doesn't know is an error", () => {
    const file = (facts: Record<string, unknown>) => ({
      meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { ncsu: { title: 'NC State', trust: 'reference' } } },
      plants: [{ id: 'hamamelis-virginiana', common: 'Witch hazel', botanical: 'Hamamelis virginiana', src: ['ncsu'], audited: '2026-10-29', facts }],
    }) as unknown as CatalogFile;
    const good = { flower_form: { v: { inflorescence: ['cyme'], petals: ['4-5'] }, src: ['ncsu'] }, leaf_form: { v: { type: ['simple'] }, src: ['ncsu'] }, texture: { v: ['coarse'], src: ['ncsu'] }, habit_form: { v: ['erect'], src: ['ncsu'] } };
    expect(catalogErrors(file(good)).filter((e) => /flower_form|leaf_form|texture|habit_form/.test(e))).toEqual([]);
    expect(catalogErrors(file({ flower_form: { v: { petals: ['many'] }, src: ['ncsu'] } })).some((e) => /flower_form/.test(e))).toBe(true);
    expect(catalogErrors(file({ leaf_form: { v: { color: ['green'] }, src: ['ncsu'] } })).some((e) => /leaf_form/.test(e))).toBe(true);
    expect(catalogErrors(file({ habit_form: { v: ['floppy'], src: ['ncsu'] } })).some((e) => /habit_form/.test(e))).toBe(true);
    expect(catalogErrors(file({ climbs_by: { v: ['twining'], src: ['ncsu'] } })).filter((e) => /climbs_by/.test(e))).toEqual([]);
    expect(catalogErrors(file({ climbs_by: { v: ['hooks'], src: ['ncsu'] } })).some((e) => /climbs_by/.test(e))).toBe(true);
  });
});

describe('edible parts and fruit set, in a plant\'s details (Jason, Oct 30)', () => {
  it('says which parts are edible, and the poison note beside them', () => {
    expect(edibleText({ edible: true, edible_parts: ['fruit', 'flowers'] })).toBe('Fruit, flowers');
    expect(edibleText({ edible: true })).toBe('Yes');
    expect(edibleText({ edible: true, edible_parts: ['fruit'], poison: { severity: 'low', parts: ['seeds'] } })).toBe('Fruit, though it\'s also listed as poisonous to people (above)');
    expect(edibleText({})).toBe('');
  });
  it('says what it takes to fruit, a cultivar\'s sex first', () => {
    expect(fruitSetText({ fruit_set: 'separate' })).toBe('Male and female plants: a female fruits only with a male nearby');
    expect(fruitSetText({ fruit_set: 'separate', sex: 'female' })).toBe('A female: fruits with a male of its kind nearby');
    expect(fruitSetText({ fruit_set: 'separate', sex: 'male' })).toBe('A male: no fruit itself; it pollinates females of its kind');
    expect(fruitSetText({ fruit_set: 'partner' })).toBe('Needs a second, different variety nearby to fruit');
    expect(fruitSetText({ fruit_set: 'better' })).toBe('Fruits on its own; more with a second variety nearby');
    expect(fruitSetText({ fruit_set: 'self', sex: 'female' })).toBe('Sets fruit on its own, without a male');
    expect(fruitSetText({})).toBe('');
    // (The partners its description names: Jason, Oct 30.)
    expect(fruitSetText({ fruit_set: 'separate', sex: 'female', partners: ['Southern Gentleman'] })).toBe("A female: fruits with a male of its kind nearby; pair with 'Southern Gentleman'");
    expect(fruitSetText({ fruit_set: 'partner', partners: ['Stuart', 'Elliot'] })).toBe("Needs a second, different variety nearby to fruit; pair with 'Stuart' or 'Elliot'");
  });
});
