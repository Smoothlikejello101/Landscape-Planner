import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { applySplits, kewApart, linkCultivars } from '../scripts/catalog/split.mjs';
// @ts-expect-error (a plain .mjs script)
import { recordCultivars } from '../scripts/catalog/ncsu-page.mjs';
// @ts-expect-error (a plain .mjs script)
import { cultivarOf } from '../scripts/catalog/reclaim.mjs';
// @ts-expect-error (a plain .mjs script)
import { webClaims } from '../scripts/catalog/web.mjs';
import { catalogErrors, catalogWarnings, resolveCatalog, type CatalogFile } from '../src/catalog';

// A record of several cultivars, made one record per cultivar (decided with Jason, 2026-10-25).
const file = (): CatalogFile => ({
  meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { compendium: { title: 'old', trust: 'unverified' }, ncsu: { title: 'NC State', trust: 'reference' } } },
  plants: [
    { id: 'carya-illinoinensis', common: 'Pecan', botanical: 'Carya illinoinensis', src: ['ncsu'], audited: '2026-10-24', facts: {
      form: 'Tree', height: { v: { min: 70, max: 100, med: 85 }, src: ['ncsu'] }, width: { v: { min: 40, max: 75, med: 57.5 }, src: ['ncsu'] }, zone_min: 5, zone_max: 9.5 } },
    { id: 'carya-illinoinensis-kanza-lakota', common: 'Pecan', botanical: "Carya illinoinensis ('Kanza' / 'Lakota')", src: ['compendium'], audited: '2026-10-25', facts: {
      form: 'Tree', height: { v: { min: 70, max: 100, med: 85 }, src: ['ncsu'] } } },
    { id: 'acer-palmatum', common: 'Japanese maple', botanical: 'Acer palmatum', src: ['ncsu'], audited: '2026-10-24', facts: { form: 'Tree' } },
    { id: 'acer-palmatum-seiryu', common: "Japanese Maple 'Seiryu'", botanical: "Acer palmatum 'Seiryu'", parent: 'acer-palmatum', src: ['ncsu'], audited: '2026-10-24', facts: { form: 'Tree' } },
    { id: 'acer-palmatum-bloodgood-seiryu', common: 'Japanese maple', botanical: "Acer palmatum ('Bloodgood' / 'Seiryu')", src: ['compendium'], audited: '2026-10-25', facts: { form: 'Tree' } },
  ],
});
const decisions = { split: {
  'carya-illinoinensis-kanza-lakota': { keep: { cultivar: 'Lakota', common: "Pecan 'Lakota'" }, others: [{ cultivar: 'Kanza', common: "Pecan 'Kanza'", page: null }] },
  'acer-palmatum-bloodgood-seiryu': { keep: { cultivar: 'Bloodgood', common: "Japanese maple 'Bloodgood'" }, others: [{ cultivar: 'Seiryu', page: 'acer-palmatum-seiryu' }] },
} };

describe('splitting a record of several cultivars', () => {
  it('keeps the record, its id and facts, for the cultivar it kept, pointed at its species; adds a cultivar with no page', () => {
    const f = file();
    const done = applySplits(f, decisions);
    const byId = new Map(f.plants.map((r) => [r.id, r]));
    const lakota = byId.get('carya-illinoinensis-kanza-lakota')!;
    expect([lakota.common, lakota.botanical, lakota.parent]).toEqual(["Pecan 'Lakota'", "Carya illinoinensis 'Lakota'", 'carya-illinoinensis']);
    expect(Object.keys(lakota).slice(0, 4)).toEqual(['id', 'common', 'botanical', 'parent']); // (names first, as in any record)
    expect(lakota.facts.height).toEqual({ v: { min: 70, max: 100, med: 85 }, src: ['ncsu'] }); // (plants placed from it stay as they were)
    const kanza = byId.get('carya-illinoinensis-kanza')!;
    expect(kanza).toEqual({ id: 'carya-illinoinensis-kanza', common: "Pecan 'Kanza'", botanical: "Carya illinoinensis 'Kanza'", parent: 'carya-illinoinensis', inherits: ['height', 'width'], src: ['compendium'], audited: null, facts: {} });
    expect(f.plants.indexOf(kanza)).toBe(f.plants.indexOf(lakota) + 1); // (beside it)
    // A cultivar with a page of its own isn't made here (the build adds it from its page), nor one the catalog has.
    expect(f.plants.filter((r) => /seiryu/i.test(r.botanical ?? '') && !/Bloodgood/.test(r.botanical ?? ''))).toHaveLength(1);
    expect(byId.get('acer-palmatum-bloodgood-seiryu')!.common).toBe("Japanese maple 'Bloodgood'");
    expect(done.length).toBeGreaterThan(0);
    expect(catalogErrors(f)).toEqual([]);
    // Twice: nothing more.
    expect(applySplits(f, decisions)).toEqual([]);
  });
  it('a cultivar with no page takes its species\' size, said to be its species\'; its other facts as any cultivar\'s', () => {
    const f = file();
    applySplits(f, decisions);
    const kanza = resolveCatalog(f).find((p) => p.id === 'carya-illinoinensis-kanza')!;
    expect(kanza.height).toEqual({ min: 70, max: 100, med: 85 });
    expect(kanza.width).toEqual({ min: 40, max: 75, med: 57.5 });
    expect(kanza.prov?.width?.inherited).toBe(true);
    expect([kanza.form, kanza.zone_min]).toEqual(['Tree', 5]);
    // (Its spread comes from its species: not a "no spread" to check.)
    expect(catalogWarnings(f).filter((w) => w.startsWith('carya-illinoinensis-kanza:'))).toEqual([]);
  });
  it('takes only a size, and only with a species to take it from', () => {
    const f = file();
    f.plants.push({ id: 'x', common: 'X', inherits: ['flower_color'], src: ['compendium'], audited: null, facts: {} });
    expect(catalogErrors(f)).toEqual(['x: inherits must list height or width', 'x: inherits, but has no species to take it from']);
  });
});

describe('a cultivar with no species named', () => {
  const rec = (id: string, common: string, botanical: string, more = {}) => ({ id, common, botanical, src: ['ncsu'], audited: null, facts: {}, ...more });
  it('is linked to its species\' record, the variety\'s where it names one; not a record of the earlier list naming one beside its species', () => {
    const f = { meta: file().meta, plants: [
      rec('rudbeckia-fulgida', 'Orange coneflower', 'Rudbeckia fulgida'),
      rec('rudbeckia-fulgida-var-sullivantii', "Sullivant's coneflower", 'Rudbeckia fulgida var. sullivantii'),
      rec('goldsturm', "Black-eyed Susan 'Goldsturm'", "Rudbeckia fulgida var. sullivantii 'Goldsturm'"),
      rec('stokesia-laevis', "Stokes' aster", 'Stokesia laevis'),
      rec('bluestone', "Stokesia 'Bluestone'", "Stokesia laevis 'Bluestone'"),
      rec('nandina-domestica', 'Nandina', 'Nandina domestica'),
      rec('flirt', 'Nandina Flirt', "Nandina domestica Flirt 'Murasaki'"),
      rec('aucuba-japonica', 'Japanese laurel', 'Aucuba japonica'),
      rec('aucuba', 'Aucuba', "Aucuba japonica ('Gold Dust')"),
      rec('rosa-julia-child', "Rose 'Julia Child'", "Rosa 'Julia Child'"),
    ] } as CatalogFile;
    const done = linkCultivars(f);
    const parent = Object.fromEntries(f.plants.map((r) => [r.id, r.parent ?? null]));
    expect(parent).toMatchObject({ goldsturm: 'rudbeckia-fulgida-var-sullivantii', bluestone: 'stokesia-laevis', flirt: 'nandina-domestica', aucuba: null, 'rosa-julia-child': null, 'stokesia-laevis': null });
    expect(done).toHaveLength(3);
    expect(linkCultivars(f)).toEqual([]);
  });
});

// The decisions of 2026-10-27: one record per cultivar where the catalog needs a species or a genus beside it, a
// record renamed for its one cultivar, a cultivar under the species Kew accepts, and records folded into another.
describe('the names a person decided', () => {
  const rec = (id: string, common: string, botanical: string, more = {}) => ({ id, common, botanical, src: ['compendium'], audited: '2026-10-25', facts: {}, ...more });
  const cat = (): CatalogFile => ({ meta: file().meta, plants: [
    rec('vaccinium-corymbosum', 'Highbush blueberry', 'Vaccinium corymbosum', { src: ['ncsu'] }),
    rec('vaccinium-corymbosum-premier', "Highbush blueberry 'Premier'", "Vaccinium corymbosum 'Premier'", { parent: 'vaccinium-corymbosum', src: ['ncsu'] }),
    rec('blueberries', 'Rabbiteye blueberry', "Vaccinium virgatum ('Climax' / 'Premier' / 'Tifblue')", { facts: { height: { v: { min: 6, max: 10, med: 8 }, src: ['compendium'] } } }),
    rec('daylilies', 'Daylily', "Hemerocallis ('Happy Returns' / spider types)"),
    rec('crinums', 'Crinum lily', "Crinum ('Milk and Wine' / bulbispermum)"),
    rec('distylium', 'Distylium', "Distylium hybrids ('Vintage Jade' / 'Cinnamon Girl')"),
    rec('aucuba-japonica', 'Japanese laurel', 'Aucuba japonica', { src: ['ncsu'] }),
    rec('aucuba', 'Aucuba', "Aucuba japonica ('Gold Dust')"),
    rec('abelia-x-grandiflora', 'Glossy Abelia', 'Abelia × grandiflora', { src: ['ncsu'] }),
    rec('goucher', "Glossy Abelia 'Edward Goucher'", "Abelia 'Edward Goucher'", { src: ['ncsu'] }),
    rec('salvia-officinalis', 'Kitchen sage', 'Salvia officinalis', { src: ['ncsu'] }),
    rec('sage-and-oregano', 'Culinary sage & oregano', 'Salvia officinalis / Origanum vulgare'),
  ] });
  const J = { decided: '2026-10-27', by: 'Jason' };
  const decided = {
    split: {
      blueberries: { keep: { cultivar: 'Tifblue', common: "Rabbiteye blueberry 'Tifblue'" }, species: { common: 'Rabbiteye blueberry' }, ...J,
        others: [{ cultivar: 'Climax', common: "Rabbiteye blueberry 'Climax'", page: 'vaccinium-corymbosum-climax', species: 'Vaccinium virgatum' }, { cultivar: 'Premier', page: 'vaccinium-corymbosum-premier' }] },
      daylilies: { keep: { cultivar: 'Happy Returns', common: "Daylily 'Happy Returns'" }, others: [{ botanical: 'Hemerocallis', common: 'Daylily', page: 'hemerocallis' }], ...J },
      crinums: { keep: { cultivar: 'Milk and Wine', common: "Crinum lily 'Milk and Wine'" }, others: [{ botanical: 'Crinum bulbispermum', page: null }], ...J },
      distylium: { keep: { cultivar: 'Vintage Jade', common: "Distylium 'Vintage Jade'" }, others: [{ cultivar: 'Cinnamon Girl', common: "Distylium 'Cinnamon Girl'", page: null }], ...J },
    },
    cultivar: { aucuba: { cultivar: 'Gold Dust', common: "Aucuba 'Gold Dust'", ...J } },
    kewSpecies: { 'vaccinium-corymbosum-premier': { species: 'Vaccinium virgatum', common: "Rabbiteye blueberry 'Premier'", ...J } },
    parent: { goucher: { parent: 'abelia-x-grandiflora', ...J } },
    fold: { 'sage-and-oregano': { into: 'salvia-officinalis', ...J } },
  };
  const names = { commonFor: (sp: string) => ({ 'Vaccinium virgatum': 'smallflower blueberry' } as Record<string, string>)[sp] ?? null, namesOf: (page: string) => (page === 'hemerocallis' ? ['Day Lily', 'Daylily'] : []) };
  const applied = () => { const f = cat(); applySplits(f, decided, names); return { f, byId: new Map(f.plants.map((r) => [r.id, r])) }; };
  it('makes the species record a split needs, and puts each cultivar under the species Kew accepts', () => {
    const { f, byId } = applied();
    expect(byId.get('vaccinium-virgatum')).toEqual({ id: 'vaccinium-virgatum', common: 'Rabbiteye blueberry', botanical: 'Vaccinium virgatum', synonyms: ['Smallflower blueberry'], src: [], audited: null, facts: {} });
    expect(byId.get('blueberries')).toMatchObject({ common: "Rabbiteye blueberry 'Tifblue'", botanical: "Vaccinium virgatum 'Tifblue'", parent: 'vaccinium-virgatum', facts: { height: { v: { min: 6, max: 10, med: 8 } } } });
    // (Filed by its page under highbush: made here, under rabbiteye, reading that page, with no size of its species' standing in.)
    expect(byId.get('vaccinium-virgatum-climax')).toEqual({ id: 'vaccinium-virgatum-climax', common: "Rabbiteye blueberry 'Climax'", botanical: "Vaccinium virgatum 'Climax'", parent: 'vaccinium-virgatum', src: ['ncsu'], audited: null, facts: {} });
    expect(byId.get('vaccinium-corymbosum-premier')).toMatchObject({ common: "Rabbiteye blueberry 'Premier'", botanical: "Vaccinium virgatum 'Premier'", parent: 'vaccinium-virgatum' });
    expect(byId.get('vaccinium-corymbosum-premier')).not.toHaveProperty('synonyms'); // (not "highbush": Kew's reading says it isn't)
    expect(f.plants.filter((r) => /Premier/.test(r.botanical ?? ''))).toHaveLength(1);
    expect(catalogErrors(f)).toEqual([]);
  });
  it("adds the genus or species a record named beside its cultivar; a genus isn't a cultivar's species", () => {
    const { byId } = applied();
    expect(byId.get('hemerocallis')).toEqual({ id: 'hemerocallis', common: 'Daylily', botanical: 'Hemerocallis', synonyms: ['Day Lily'], src: ['ncsu'], audited: null, facts: {} });
    expect(byId.get('daylilies')).toMatchObject({ common: "Daylily 'Happy Returns'", botanical: "Hemerocallis 'Happy Returns'" });
    expect(byId.get('daylilies')).not.toHaveProperty('parent');
    // (No name from its sources yet: its botanical name, until one comes.)
    expect(byId.get('crinum-bulbispermum')).toMatchObject({ common: 'Crinum bulbispermum', botanical: 'Crinum bulbispermum', src: [] });
    expect(byId.get('crinums')!.botanical).toBe("Crinum 'Milk and Wine'");
    // (The earlier list's "hybrids" isn't part of the name; with no species, no size stands in.)
    expect(byId.get('distylium')!.botanical).toBe("Distylium 'Vintage Jade'");
    expect(byId.get('distylium-cinnamon-girl')).toEqual({ id: 'distylium-cinnamon-girl', common: "Distylium 'Cinnamon Girl'", botanical: "Distylium 'Cinnamon Girl'", src: ['compendium'], audited: null, facts: {} });
    const f = cat();
    applySplits(f, decided, names);
    expect(linkCultivars(f)).toEqual([]); // ('Happy Returns' isn't linked to the genus either)
    // Named once its sources give a name.
    expect(applySplits(f, decided, { ...names, commonFor: (sp: string) => (sp === 'Crinum bulbispermum' ? 'orange river lily' : null) })).toEqual(['crinum-bulbispermum: named Orange river lily']);
  });
  it('renames a record for its one cultivar, puts a hybrid under the species its page names, and folds a record into another', () => {
    const { f, byId } = applied();
    expect(byId.get('aucuba')).toMatchObject({ common: "Aucuba 'Gold Dust'", botanical: "Aucuba japonica 'Gold Dust'", parent: 'aucuba-japonica' });
    expect(byId.get('aucuba')).not.toHaveProperty('synonyms'); // (its new name starts with its old one)
    expect(byId.get('goucher')!.parent).toBe('abelia-x-grandiflora');
    expect(byId.has('sage-and-oregano')).toBe(false);
    expect(f.meta.moved).toEqual({ 'sage-and-oregano': 'salvia-officinalis' });
    expect(catalogErrors(f)).toEqual([]);
    expect(applySplits(f, decided, names)).toEqual([]); // (twice: nothing more)
    // The catalog's checks: a moved id is no record's, and stands for one that's there.
    expect(catalogErrors({ ...f, meta: { ...f.meta, moved: { aucuba: 'salvia-officinalis', gone: 'nowhere' } } })).toEqual(['meta.moved: aucuba is still a record', "meta.moved: gone stands for nowhere, which isn't a record"]);
  });
  it('renames a seed strain by the naming rule, its old name kept, and still reads the pages that sell it as its own (soldAs)', () => {
    // (Jason, 2026-11-01: a seed strain isn't a cultivar, so "Butterfly weed (clay strain)"; its facts kept. The
    // decision as shipped: what its sources sell it as is read by the record's id.)
    const ID = 'asclepias-tuberosa-clay-strain';
    const rename = { [ID]: JSON.parse(readFileSync(new URL('../scripts/catalog/decisions.json', import.meta.url), 'utf8')).rename[ID] };
    const f: CatalogFile = { meta: file().meta, plants: [
      rec(ID, "Butterfly weed 'for Clay'", 'Asclepias tuberosa (clay strain)', { facts: { width: { min: 1, max: 2, med: 1.5 }, height: { v: { min: 2, max: 2, med: 2 }, src: ['compendium'] } } }),
      rec('asclepias-tuberosa', 'Butterfly milkweed', 'Asclepias tuberosa', { src: ['ncsu'] }),
    ] };
    const was = { cultivars: recordCultivars(f.plants[0]), cultivar: cultivarOf(f.plants[0]), facts: structuredClone(f.plants[0].facts) };
    expect(applySplits(f, { rename })).toEqual([`${ID}: now Butterfly weed (clay strain), Asclepias tuberosa clay strain`]);
    expect(f.plants[0]).toEqual({ id: ID, common: 'Butterfly weed (clay strain)', botanical: 'Asclepias tuberosa clay strain', synonyms: ["Butterfly weed 'for Clay'"], src: ['compendium'], audited: '2026-10-25', facts: was.facts });
    expect(applySplits(f, { rename })).toEqual([]); // (twice: nothing more)
    // Read as before: the selection its sources sell, not its species.
    const strain = f.plants[0];
    expect([recordCultivars(strain), cultivarOf(strain)]).toEqual([['for Clay'], 'for Clay']);
    expect([recordCultivars(strain), cultivarOf(strain)]).toEqual([was.cultivars, was.cultivar]);
    // The nursery's page for it (as Prairie Nursery titles it) is its own; under the same names with no decision, it
    // would be no one's, and the strain would read its species' pages as its own.
    const page = `<html><head><title>Butterfly Weed for Clay - Asclepias tuberosa var. clay | Prairie Nursery</title></head><body>
      <h1>Butterfly Weed for Clay</h1><p>Asclepias tuberosa var. clay</p><p>Height: 2 ft</p></body></html>`;
    const read = (r: typeof strain) => webClaims('https://www.prairienursery.com/butterflyweed-for-clay.html', page, { species: 'Asclepias tuberosa', cultivar: cultivarOf(r), common: r.common });
    expect(read(strain).map((c: { fact: string; v: unknown; cultivarPage: boolean }) => [c.fact, c.v, c.cultivarPage])).toEqual([['height', { min: 2, max: 2 }, true]]);
    const unnamed = { ...strain, id: 'not-decided' };
    expect([recordCultivars(unnamed), cultivarOf(unnamed), read(unnamed)]).toEqual([[], null, []]);
    // Not linked to its species, nor taken for it: Butterfly milkweed is still the record of that name.
    expect(linkCultivars(f)).toEqual([]);
    expect(catalogErrors(f)).toEqual([]);
    expect(catalogWarnings(f).filter((w) => w.startsWith(`${ID}:`))).toEqual([]); // (no parentheses left to list)
  });
  it('lists cultivars NC State files under a species Kew keeps apart, where their pages say so', () => {
    const f = cat();
    f.plants.push(rec('vaccinium-virgatum', 'Rabbiteye blueberry', 'Vaccinium virgatum', { src: [] }), rec('powderblue', "Highbush blueberry 'Powderblue'", "Vaccinium corymbosum 'Powderblue'", { parent: 'vaccinium-corymbosum', src: ['ncsu'] }),
      rec('duke', "Highbush blueberry 'Duke'", "Vaccinium corymbosum 'Duke'", { parent: 'vaccinium-corymbosum', src: ['ncsu'] }));
    const list = [{ id: 'powderblue', ncsu: 'vaccinium-corymbosum-powderblue' }, { id: 'duke', ncsu: 'vaccinium-corymbosum-duke' }, { id: 'vaccinium-corymbosum', ncsu: 'vaccinium-corymbosum' }];
    const text: Record<string, string> = { 'vaccinium-corymbosum-powderblue': "'Powderblue' is a rabbiteye cultivar of Vaccinium corymbosum.", 'vaccinium-corymbosum-duke': "'Duke' is an early highbush cultivar." };
    const found = kewApart(f, list, { pages: { 'vaccinium-virgatum': null }, movedTo: (s: string) => (s === 'vaccinium-virgatum' ? 'vaccinium-corymbosum' : null), pageText: (s: string) => text[s] ?? null });
    expect(found).toEqual([{ id: 'powderblue', page: 'vaccinium-corymbosum-powderblue', x: 'Vaccinium virgatum', y: 'Vaccinium corymbosum', word: 'Rabbiteye' }]);
    // (None where NC State's page for the species isn't moved, or no page is given up for it.)
    expect(kewApart(f, list, { pages: { 'vaccinium-virgatum': null }, pageText: (s: string) => text[s] ?? null })).toEqual([]);
    expect(kewApart(f, list, { pages: {}, movedTo: () => 'vaccinium-corymbosum', pageText: (s: string) => text[s] ?? null })).toEqual([]);
  });
});
