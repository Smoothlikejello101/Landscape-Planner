import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { aboutAnother, annualZonesSaid, foliageFromProse, foliageOf, foliageWords, ncsuDescription, ncsuNames, ncsuProseClaims, ncsuZones, sentences } from '../scripts/catalog/prose.mjs';
// @ts-expect-error (a plain .mjs script)
import { combine } from '../scripts/catalog/claims.mjs';
import { catalogErrors, resolveCatalog, type CatalogFile } from '../src/catalog';
import { winterParts } from '../src/ui/plant-details';

// Reading a source's description, by rule (decided with Jason, 2026-10-26: "read everything"). The sentences here are
// written for these tests, in the shapes found on NC State's pages (descriptions aren't copied: docs/catalog-sources.md).
const leaves = (s: string, names: string[] = []) => foliageFromProse([s], names)?.v ?? null;

describe('sentences', () => {
  it('splits on a sentence\'s end, not on an abbreviation or an initial', () => {
    expect(sentences('Unlike P. peltatum, it stays green. It grows 2 ft. tall per the U.S. Forest Service.\nQuick ID: evergreen fern'))
      .toEqual(['Unlike P. peltatum, it stays green.', 'It grows 2 ft. tall per the U.S. Forest Service.', 'Quick ID: evergreen fern']);
  });
});

describe('leaves in winter, from a description', () => {
  it('reads what the sentence says of the plant itself', () => {
    expect(leaves('Scouring rush is a rhizomatous, evergreen, spore-bearing perennial in the horsetail family.')).toBe('evergreen');
    expect(leaves('The stiff, sword-like leaves are evergreen and edged with curling threads')).toBe('evergreen');
    expect(leaves('This pea is a deciduous, twining perennial vine in the legume family, grown for its blue flowers.')).toBe('deciduous');
    expect(leaves('It goes dormant in winter and comes back in spring.')).toBe('deciduous');
    expect(leaves('Over the winter it will go dormant.')).toBe('deciduous'); // (a grass)
    expect(leaves('The plant dies to the ground at the first frost, then grows back from its roots the next spring in mild areas.')).toBe('deciduous');
    expect(leaves('This jasmine is a sprawling, semi-evergreen shrub from western China.')).toBe('semi-evergreen');
    expect(leaves('Its shiny leaves are semi to evergreen.')).toBe('semi-evergreen');
    expect(leaves('This ceanothus is a deciduous to semi-deciduous shrub in the buckthorn family.')).toBe('semi-evergreen');
    // (Where it grows wild isn't a winter its leaves depend on.)
    expect(leaves('This prayer plant is a tropical evergreen perennial native to Brazilian rainforests, where it thrives in warm, humid shade.')).toBe('evergreen');
    expect(leaves('It is a tall evergreen conifer native to mountain slopes in southern Chile and western Argentina.')).toBe('evergreen');
  });
  it('reads a value that depends on the winter as semi-evergreen', () => {
    expect(leaves('In mild climates it stays evergreen, but it is deciduous where winters are colder.')).toBe('semi-evergreen');
    expect(leaves('Bloom: Late Winter Foliage: Evergreen in warmer climates, deciduous in cold climates')).toBe('semi-evergreen');
    expect(leaves('It stays evergreen in the south and goes dormant in winter farther north.')).toBe('semi-evergreen');
    expect(leaves('In the southern part of its range, this shrub may be semi-evergreen.')).toBe('semi-evergreen');
    expect(leaves('In warmer climates, it can be grown as an evergreen.')).toBe('semi-evergreen');
    expect(leaves('In warmer climates, such as coastal California, the Gulf Coast, or the tropics, it is grown as an evergreen perennial.')).toBe('semi-evergreen');
    expect(leaves('Its leaves stay evergreen down to about 10 degrees Fahrenheit.')).toBe('semi-evergreen');
    // (Dying back only in a long freeze, and nothing else said: its leaves aren't settled.)
    expect(leaves('It shrugs off light frost but dies back to its crown when temperatures stay below freezing for long periods.')).toBe(null);
    expect(leaves('Japanese holly fern is usually an evergreen fern.')).toBe('semi-evergreen');
    expect(leaves('This St. John\'s wort is a low, deciduous or evergreen shrub with yellow flowers.')).toBe('semi-evergreen');
  });
  it('leaves out words about other plants, its habitat, or its name', () => {
    expect(leaves('This poppy is a woodland wildflower native to the eastern US, in rich, moist deciduous forests along streams.')).toBe(null);
    expect(leaves('It can be found inhabiting deciduous and mixed evergreen deciduous forests.')).toBe(null);
    expect(leaves('This lily-of-the-valley relative spreads in colonies among deciduous trees and in mixed woods.')).toBe(null);
    expect(leaves('Use it as a specimen, in a mixed border, or in front of an evergreen hedge.')).toBe(null);
    expect(leaves('It flowers from late fall into winter, when most ornamentals enter dormancy.')).toBe(null);
    expect(leaves('It may look like a needled evergreen in summer, but it is deciduous in winter.')).toBe('deciduous'); // (bald cypress)
    expect(leaves('It is deciduous, as the name suggests.')).toBe(null); // (about its name)
    expect(leaves('The specific epithet, Latin for "deciduous," is unusual in a genus known for its evergreen species.')).toBe(null);
    expect(leaves('Its leaves are deciduous, whereas those of its close cousin are evergreen.')).toBe(null);
    expect(leaves('Kept watered, its leaves stay handsome until frost (unlike P. peltatum, which goes dormant in summer).')).toBe(null);
  });
  it('leaves out a plant other than the page\'s, named as the subject', () => {
    const names = ['Botrychium virginianum', 'Common Grape Fern', 'Rattlesnake Fern'];
    expect(aboutAnother('The Cutleaf Grape Fern is evergreen, with finely cut fronds.', names)).toBe(true);
    expect(aboutAnother('Rattlesnake Fern is a deciduous fern of shady woods.', names)).toBe(false);
    expect(aboutAnother('It is a deciduous fern.', names)).toBe(false);
    expect(aboutAnother('Holly fern is usually an evergreen fern.', ['Cyrtomium falcatum', 'Japanese Holly Fern'])).toBe(false);
    expect(foliageFromProse(['Rattlesnake Fern is a deciduous fern of shady woods.', 'The Cutleaf Grape Fern is evergreen.'], names)?.v).toBe('deciduous');
  });
  it('reads dying back and resting only in winter, and never said not to', () => {
    expect(leaves('Its leaves may die back in summer heat but return in late summer, when it often blooms again.')).toBe(null);
    expect(leaves('The plant is dormant through the summer months, when its leaves are gone.')).toBe(null);
    expect(leaves('The bulbs stay dormant from late spring to autumn, when new leaves appear.')).toBe(null); // (green in winter)
    expect(leaves('Each rosette will die back after it sets seed, replaced by its offsets.')).toBe(null);
    expect(leaves('The plant is dormant during the winter, when watering should be cut back.')).toBe(null); // (a succulent resting)
    expect(leaves('Keep the soil from drying out while it grows, but give it less moisture when it is dormant in the winter.')).toBe(null); // (care advice)
    expect(leaves('Divide clumps in the fall as the plant goes dormant.')).toBe('deciduous');
    expect(leaves('It is an evergreen tree, though in a long drought it may become deciduous.')).toBe('evergreen');
    expect(leaves('This vine is not evergreen.')).toBe(null);
  });
  it('weighs a page\'s sentences together', () => {
    // (Evergreen, and dying back in a freeze: it depends on the winter.)
    expect(foliageOf(['E', 'B'])).toBe('semi-evergreen');
    expect(foliageOf(['E', 'B?'])).toBe('semi-evergreen');
    // (A deciduous shrub that may die to the ground in a cold winter: its stems depend on the winter, not its leaves.)
    expect(foliageOf(['D', 'B?'])).toBe('deciduous');
    expect(foliageOf(['B?'])).toBe(null);
    expect(foliageOf(['E', 'E'])).toBe('evergreen');
    expect(foliageOf([])).toBe(null);
    const spiraea = foliageFromProse([
      'This spirea is an upright, suckering, deciduous shrub of wet meadows.',
      'Its woody stems often die back to the ground during the winter.',
      'Its flowers are pink.',
    ]);
    // (Its sentences: those that say deciduous, not the one about its stems.)
    expect(spiraea).toEqual({ v: 'deciduous', says: 'This spirea is an upright, suckering, deciduous shrub of wet meadows.' });
    // (Semi-evergreen: every sentence that speaks, up to three.)
    expect(foliageFromProse(['This cuphea is a small, dense evergreen shrub.', 'It stays evergreen only in warm climates or indoors.'])?.says)
      .toBe('This cuphea is a small, dense evergreen shrub. … It stays evergreen only in warm climates or indoors.');
  });
});

describe('NC State\'s description, as claims', () => {
  const page = `<html><h1 class="x">Helleborus orientalis <a>Play pronunciation</a></h1>
    <ul class="" id="common_names"><li><a href="#">Lenten Rose</a></li><li><a href="#">Hellebore</a></li></ul>
    <dl><dt>Description</dt>
    <dd><p>Lenten rose is a clumping perennial of the buttercup&nbsp;family that blooms in late winter. Where winters are mild it is evergreen, but it is deciduous in colder climates.</p>
    <p>It comes from Turkey&rsquo;s and Greece&rsquo;s woods.</p></dd>
    <dt>Height</dt><dd>1 ft. 0 in. - 1 ft. 6 in.</dd></dl></html>`;
  const says = 'Where winters are mild it is evergreen, but it is deciduous in colder climates.';
  it('reads the description and the page\'s names', () => {
    expect(ncsuNames(page)).toEqual(['Helleborus orientalis', 'Lenten Rose', 'Hellebore']);
    expect(ncsuDescription(page)).toEqual([
      'Lenten rose is a clumping perennial of the buttercup family that blooms in late winter.',
      says,
      "It comes from Turkey's and Greece's woods.",
    ]);
    expect(ncsuDescription('<dl><dt>Height</dt><dd>1 ft.</dd></dl>')).toEqual([]);
  });
  it('makes a claim citing its sentence; the page\'s own fields come first', () => {
    const prose = ncsuProseClaims(page);
    expect(prose).toEqual([{ fact: 'foliage', v: 'semi-evergreen', src: 'ncsu', kind: 'authority', prose: true, says }]);
    // Alone, it decides; the build keeps its sentence for the review, and says where it was read.
    expect(combine(prose).foliage).toMatchObject({ v: 'semi-evergreen', src: ['ncsu'], check: 'single', from: 'description', says });
    // After the page's fields (as the build puts them), the fields' value is the one weighed.
    const field = { fact: 'foliage', v: 'evergreen', src: 'ncsu', kind: 'authority' };
    const f = combine([field, ...prose]).foliage;
    expect(f.v).toBe('evergreen');
    expect(f.from).toBeUndefined();
    // Over USDA's yes or no for a shrub (a fallback), the sentence decides.
    expect(combine([{ fact: 'foliage', v: 'deciduous', src: 'usda', kind: 'authority', fallback: true }, ...ncsuProseClaims(page.replace(says, 'It is a dense, low, evergreen shrub.'))]).foliage)
      .toMatchObject({ v: 'evergreen', src: ['ncsu'] });
  });
});

describe('zones, where a page\'s field takes in the zones its text says it\'s only an annual in', () => {
  const said = 'It is winter hardy to USDA Zones 9-10 and grown as an annual in Zones 3-8.';
  const cleome = `<dl><dt>Description</dt><dd><p>This cleome is a tender perennial, usually grown as an annual. ${said}</p></dd></dl>`;
  const field = [{ fact: 'zone_min', v: 3, src: 'ncsu', kind: 'authority' }, { fact: 'zone_max', v: 11.5, src: 'ncsu', kind: 'authority' }, { fact: 'height', v: { min: 2, max: 4 }, src: 'ncsu', kind: 'authority' }];
  it('reads both ranges from one sentence', () => {
    expect(annualZonesSaid([said])).toEqual({ hardy: { zone_min: 9, zone_max: 10.5 }, annual: { zone_min: 3, zone_max: 8.5 }, says: said });
    // (Not where the zones it's an annual in aren't named, or aren't colder than the ones it's hardy in.)
    expect(annualZonesSaid(['It is hardy in zones 8 to 10 and often grown as an annual where it won\'t survive the winter.'])).toBe(null);
    expect(annualZonesSaid(['Hardy to zones 5-9; grown as an annual in zones 7-10 for its foliage.'])).toBe(null);
  });
  it('takes the text\'s hardy zones over a field that lists its annual ones', () => {
    const out = ncsuZones(field, cleome);
    expect(out.filter((c: { fact: string }) => c.fact.startsWith('zone'))).toEqual([
      { fact: 'zone_min', v: 9, src: 'ncsu', kind: 'authority', says: said, prose: true },
      { fact: 'zone_max', v: 10.5, src: 'ncsu', kind: 'authority', says: said, prose: true },
    ]);
    expect(out.find((c: { fact: string }) => c.fact === 'height')).toEqual(field[2]);
    expect(combine(out).zone_min).toMatchObject({ v: 9, src: ['ncsu'], from: 'description' });
    // (A field that already starts where it's hardy stays as it is.)
    expect(ncsuZones([{ ...field[0], v: 9 }, field[1]], cleome)).toEqual([{ ...field[0], v: 9 }, field[1]]);
    expect(ncsuZones(field, '<dl><dt>Height</dt><dd>1</dd></dl>')).toEqual(field);
  });
});

describe('a fact read from a description, in the catalog and the app', () => {
  const file = (facts: Record<string, unknown>): CatalogFile => ({
    meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { ncsu: { title: 'NC State Extension', trust: 'reference' } } },
    plants: [{ id: 'helleborus-orientalis', common: 'Lenten rose', botanical: 'Helleborus orientalis', src: ['ncsu'], audited: '2026-10-26', facts }],
  });
  it('says where it was read, not the sentence (descriptions aren\'t copied)', () => {
    expect(catalogErrors(file({ form: 'Perennial', foliage: { v: 'semi-evergreen', src: ['ncsu'], check: 'single', from: 'description' } }))).toEqual([]);
    expect(catalogErrors(file({ form: 'Perennial', foliage: { v: 'semi-evergreen', src: ['ncsu'], from: 'a page' } }))).toEqual(['helleborus-orientalis.foliage: from must be description, for a value read from one']);
    expect(catalogErrors(file({ form: 'Perennial', foliage: { v: 'semi-evergreen', src: ['ncsu'], says: 'Evergreen where winters are mild.' } }))).toEqual(['helleborus-orientalis.foliage: unknown key says']);
  });
  it('the app names the description as its source', () => {
    const [p] = resolveCatalog(file({ form: 'Perennial', foliage: { v: 'semi-evergreen', src: ['ncsu'], check: 'single', from: 'description' } }));
    expect(p.prov?.foliage?.from).toBe('description');
    const [text, src] = winterParts(p)[0];
    expect(text).toBe('Semi-evergreen: keeps some of its leaves, by the winter');
    expect(src).toMatch(/ · its description · one source$/);
    const [q] = resolveCatalog(file({ form: 'Perennial', foliage: { v: 'evergreen', src: ['ncsu'], check: 'single' } }));
    expect(winterParts(q)[0][1]).not.toContain('description');
  });
});
