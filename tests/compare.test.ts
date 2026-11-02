// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cellsDiffer, clearCompare, comparing, compareRows, MAX_COMPARE, NOT_KNOWN, sureOf, toggleCompare, whoSays, type Cell, type CompareRow } from '../src/compare';
import { loadPlants, plantsById, type Plant } from '../src/plants';
import { state } from '../src/state';
import type { Shape } from '../src/types';
import { NO_YARD } from '../src/yard';

// Compare two or three plants (Jason, Nov 2, from the UI review: "A table of the facts that decide, with how sure each
// is"): which rows differ, how sure each value is from what the catalog stores (its `check`, its `src`, a value read
// from a description by a second reading, a cultivar's from its species), and "Not known", never a blank.

const SOURCES = {
  ncsu: { title: 'NC State Extension Gardener Plant Toolbox', trust: 'reference' },
  usda: { title: 'USDA PLANTS Database', trust: 'reference' },
  'shop.com': { title: 'shop.com', trust: 'nursery' },
  'grower.com': { title: 'grower.com', trust: 'nursery' },
  'grower2.com': { title: 'grower2.com', trust: 'nursery' },
  compendium: { title: 'First compendium (2026)', trust: 'unverified' },
};
const CATALOG = {
  meta: { format: 'lp-catalog', version: 2, zones: 'half', updated: '2026-11-01', sources: SOURCES, enums: { form: ['Shrub', 'Perennial'] } },
  plants: [
    { id: 'itea-virginica', common: 'Virginia sweetspire', botanical: 'Itea virginica', src: ['ncsu'], audited: '2026-10-30', facts: {
      form: { v: 'Shrub', src: ['ncsu', 'usda'], check: 'confirmed' },
      height: { v: { min: 3, max: 6, med: 4.5 }, src: ['ncsu'], check: 'single' },
      width: { v: { min: 3, max: 5, med: 4 }, src: ['ncsu', 'shop.com', 'grower.com'], check: 'confirmed' },
      sun_most: { v: 'Full', src: ['ncsu'], check: 'single' }, sun_least: { v: 'Shade', src: ['ncsu'], check: 'single' },
      water: { v: 'High', src: ['ncsu'], check: 'single' },
      zone_min: { v: 5, src: ['ncsu'], check: 'single' }, zone_max: { v: 9.5, src: ['ncsu'], check: 'single' },
      deer: { v: 'Resistant', src: ['ncsu'], check: 'single', from: 'description' },
      foliage: { v: 'deciduous', src: ['grower.com', 'grower2.com'], check: 'likely' },
      flower_color: { v: ['white'], src: ['ncsu', 'usda'], check: 'confirmed' },
      growth_rate: { v: 'medium', src: ['shop.com'], check: 'reported' },
      poison: { v: null, src: ['ncsu'] },
    } },
    // (A cultivar: its own height and width; sun, water, zones, deer, poison and winter leaves from its species; no growth
    // rate or flower color of its own, which a cultivar doesn't take from its species.)
    { id: 'itea-virginica-henrys-garnet', common: "Virginia sweetspire 'Henry's Garnet'", botanical: "Itea virginica 'Henry's Garnet'", parent: 'itea-virginica', src: ['ncsu'], audited: '2026-10-30', facts: {
      height: { v: { min: 3, max: 4, med: 3.5 }, src: ['shop.com'], check: 'reported' },
      width: { v: { min: 3, max: 5, med: 4 }, src: ['ncsu', 'shop.com', 'grower.com'], check: 'confirmed' },
    } },
    { id: 'old-aster', common: 'Old-list aster', src: ['compendium'], audited: null, facts: { form: 'Perennial', sun_most: 'Full', sun_least: 'Part', water: 'Moderate' } },
    { id: 'kalmia-latifolia', common: 'Mountain laurel', botanical: 'Kalmia latifolia', src: ['ncsu'], audited: '2026-10-30', facts: {
      form: { v: 'Shrub', src: ['ncsu'], check: 'single' },
      poison: { v: { severity: 'high', parts: ['leaves', 'flowers'] }, src: ['ncsu'], check: 'single' },
      problem_for: { v: ['dogs', 'cats', 'horses'], src: ['ncsu'], check: 'single' },
      // (Nurseries outnumbering NC State on its sun, NC State's beside it.)
      sun_most: { v: 'Part', src: ['grower.com', 'grower2.com'], check: 'likely', alt: { v: 'Full', src: ['ncsu'], check: 'single' } },
      sun_least: { v: 'Shade', src: ['grower.com', 'grower2.com'], check: 'likely' },
    } },
  ],
};
const P = (id: string): Plant => plantsById[id];
const row = (rows: CompareRow[], key: string) => rows.find((r) => r.key === key)!;
const texts = (r: CompareRow) => r.cells.map((c) => c.text);
const sures = (r: CompareRow) => r.cells.map((c) => c.sure?.text ?? null);

beforeAll(async () => {
  const was = globalThis.fetch;
  globalThis.fetch = (async () => ({ json: async () => CATALOG })) as unknown as typeof fetch;
  try { await loadPlants(); } finally { globalThis.fetch = was; }
});
beforeEach(() => {
  state.household = { ...NO_YARD, answered: false };
  state.location = null;
  state.shapes = [];
  state.poisonWarnings = true;
});
afterEach(() => { clearCompare(); state.shapes = []; state.location = null; });

describe('how sure, from what the catalog stores', () => {
  it('names references, counts nursery pages, and says how sure in the details’ words', () => {
    expect(whoSays(['ncsu', 'usda'], SOURCES)).toBe('NC State, USDA');
    expect(whoSays(['shop.com'], SOURCES)).toBe('Nursery page');
    expect(whoSays(['ncsu', 'shop.com', 'grower.com'], SOURCES)).toBe('NC State, 2 nursery pages');
    expect(sureOf({ src: ['ncsu', 'usda'], check: 'confirmed' }, false, SOURCES)).toEqual({ text: 'NC State, USDA · confirmed', level: 'confirmed', title: 'NC State Extension Gardener Plant Toolbox, USDA PLANTS Database' });
    expect(sureOf({ src: ['ncsu', 'usda'], check: 'agree' }, false, SOURCES)?.text).toBe('NC State, USDA · confirmed');
    expect(sureOf({ src: ['usda'], check: 'single' }, false, SOURCES)).toMatchObject({ text: 'USDA · one source', level: 'one' });
    expect(sureOf({ src: ['grower.com', 'grower2.com', 'shop.com'], check: 'likely' }, false, SOURCES)).toMatchObject({ text: '3 nursery pages · nurseries agree', level: 'nursery' });
    expect(sureOf({ src: ['shop.com'], check: 'reported' }, false, SOURCES)).toMatchObject({ text: 'Nursery page · one nursery', level: 'nursery' });
    expect(sureOf({ src: ['ncsu', 'shop.com'], check: 'disputed' }, false, SOURCES)).toMatchObject({ text: 'NC State, nursery page · sources disagree', level: 'disputed' });
  });

  it('says a value read from a description by a second reading, one from its species, and one from the earlier list', () => {
    expect(sureOf({ src: ['ncsu'], check: 'single', from: 'description' }, false, SOURCES)?.text).toBe('NC State, second reading · one source');
    expect(sureOf({ src: ['shop.com'], check: 'reported', from: 'description' }, false, SOURCES)?.text).toBe('Nursery page, second reading · one nursery');
    expect(sureOf({ src: ['ncsu'], check: 'single', inherited: true }, false, SOURCES)?.text).toBe('NC State · one source · from its species');
    expect(sureOf({ src: ['compendium'] }, false, SOURCES)).toMatchObject({ text: 'Earlier list, unverified', level: 'earlier' });
    expect(sureOf({ src: ['compendium'], inherited: true }, false, SOURCES)?.text).toBe('Earlier list, unverified · from its species');
    // (No check stored: who says it, alone.)
    expect(sureOf({ src: ['ncsu'] }, false, SOURCES)).toMatchObject({ text: 'NC State', level: 'other' });
  });

  it('makes a range’s two ends one mark, as sure as the less sure end; a plant of mine’s own value is its entry', () => {
    expect(sureOf([{ src: ['ncsu'], check: 'single' }, { src: ['shop.com'], check: 'reported' }], false, SOURCES)?.text).toBe('NC State, nursery page · one nursery');
    expect(sureOf(undefined, true, SOURCES)).toEqual({ text: 'Your entry', level: 'yours' });
    expect(sureOf(undefined, false, SOURCES)).toBeNull();
  });

  it('gives each cell its own: the cultivar’s own size, and its species’ sun, deer and poison, said so', () => {
    const rows = compareRows([P('itea-virginica'), P('itea-virginica-henrys-garnet')]);
    expect(texts(row(rows, 'height'))).toEqual(['3–6 ft', '3–4 ft']);
    expect(row(rows, 'height').cells.map((c) => c.more)).toEqual([['typically 4.5 ft'], ['typically 3.5 ft']]);
    expect(sures(row(rows, 'height'))).toEqual(['NC State · one source', 'Nursery page · one nursery']);
    expect(sures(row(rows, 'width'))).toEqual(['NC State, 2 nursery pages · confirmed', 'NC State, 2 nursery pages · confirmed']);
    expect(sures(row(rows, 'sun'))).toEqual(['NC State · one source', 'NC State · one source · from its species']);
    expect(texts(row(rows, 'deer'))).toEqual(['Resistant: seldom browsed', 'Resistant: seldom browsed']);
    expect(sures(row(rows, 'deer'))).toEqual(['NC State, second reading · one source', 'NC State, second reading · one source · from its species']);
    expect(texts(row(rows, 'winter'))).toEqual(['Deciduous', 'Deciduous']);
    expect(sures(row(rows, 'winter'))[0]).toBe('2 nursery pages · nurseries agree');
    expect(texts(row(rows, 'zones'))).toEqual(['Zones 5–9', 'Zones 5–9']);
    // (NC State's page read, and it says nothing of poison: "None listed", a weak no, with its source; never "safe".)
    expect(texts(row(rows, 'poison'))).toEqual(['None listed', 'None listed']);
    expect(sures(row(rows, 'poison'))).toEqual(['NC State', 'NC State · from its species']);
  });

  it('says what other sources say where they differ, by who', () => {
    const rows = compareRows([P('kalmia-latifolia'), P('itea-virginica')]);
    expect(row(rows, 'sun').cells[0]).toMatchObject({ text: 'Part shade to shade', alt: 'NC State lists: Full sun to shade' });
    expect(row(rows, 'sun').cells[0].sure?.text).toBe('2 nursery pages · nurseries agree');
    expect(row(rows, 'sun').cells[1].alt).toBeUndefined();
  });
});

describe('"Not known", never a blank', () => {
  it('says "Not known" where nothing is stored, and that none of its sources say where they were read', () => {
    const rows = compareRows([P('itea-virginica'), P('itea-virginica-henrys-garnet'), P('old-aster')]);
    for (const r of rows) for (const c of r.cells) expect(c.text, `${r.label}`).not.toBe('');
    // (A cultivar's own growth rate and flower color: none stored, and none taken from its species.)
    expect(row(rows, 'growth').cells[1]).toMatchObject({ text: NOT_KNOWN, known: false, sure: null });
    expect(row(rows, 'flowers').cells[1]).toMatchObject({ text: NOT_KNOWN, known: false });
    expect(row(rows, 'bloom').cells.map((c) => c.text)).toEqual([NOT_KNOWN, NOT_KNOWN, NOT_KNOWN]);
    // (The earlier list's plant: its values are the earlier list's, unverified.)
    expect(row(rows, 'water').cells[2]).toMatchObject({ text: 'Moderate', sure: { text: 'Earlier list, unverified', level: 'earlier' } });
    expect(row(rows, 'poison').cells[2]).toMatchObject({ text: NOT_KNOWN, known: false });
  });

  it('says none of its sources say, for a fact looked up and not found', () => {
    const p = { ...P('itea-virginica'), id: 'x-unknown', growth_rate: undefined, prov: { ...P('itea-virginica').prov, growth_rate: { src: ['ncsu', 'usda'], unknown: true } } } as Plant;
    const c = row(compareRows([p, P('itea-virginica')]), 'growth').cells[0];
    expect(c).toMatchObject({ text: NOT_KNOWN, known: false, sure: { text: 'None of its sources say', level: 'other' } });
  });
});

describe('which rows differ', () => {
  it('a row differs where what the cells say differs; how sure each is doesn’t count', () => {
    const rows = compareRows([P('itea-virginica'), P('itea-virginica-henrys-garnet')]);
    const differ = rows.filter((r) => r.differ).map((r) => r.key);
    expect(differ).toEqual(['height', 'flowers', 'growth']);
    // (Width: the same, as sure; sun: the same value, one from its species: the same.)
    expect(row(rows, 'width').differ).toBe(false);
    expect(row(rows, 'sun').differ).toBe(false);
  });

  it('"Not known" in every cell is the same; a value and "Not known" differ; the lines under a value count', () => {
    const v = (text: string, more?: string[]): Cell => ({ text, known: text !== NOT_KNOWN, sure: null, ...(more ? { more } : {}) });
    expect(cellsDiffer([v(NOT_KNOWN), v(NOT_KNOWN), v(NOT_KNOWN)])).toBe(false);
    expect(cellsDiffer([v('Slow'), v(NOT_KNOWN)])).toBe(true);
    expect(cellsDiffer([v('Slow'), v('slow')])).toBe(false);
    expect(cellsDiffer([v('3–6 ft', ['typically 4.5 ft']), v('3–6 ft', ['typically 5 ft'])])).toBe(true);
  });

  it('asks whether it’s hardy here only with the garden’s zone, and the plan’s warnings only once one is placed', () => {
    const plants = [P('itea-virginica'), P('itea-virginica-henrys-garnet')];
    expect(compareRows(plants).map((r) => r.key)).not.toContain('hardy');
    expect(compareRows(plants).map((r) => r.key)).not.toContain('warnings');
    state.location = { zip: '71923', zone: '8a' };
    expect(row(compareRows(plants), 'hardy')).toMatchObject({ label: 'Hardy in zone 8a', differ: false });
    expect(texts(row(compareRows(plants), 'hardy'))).toEqual(['Hardy here', 'Hardy here']);
    Object.assign(state, { showCrowding: true, crowdWarnings: true, sunWarnings: true, hardyWarnings: true, fruitWarnings: true });
    state.viewFilter = { status: '', phase: '', showGone: false };
    state.roleViews = {};
    state.dismissed = undefined;
    state.shapes = [{ id: 's1', type: 'circle', role: 'plant', plantId: 'itea-virginica', x: 0, y: 0, radius: 2, color: '#16a34a', opacity: 0.65 } as Shape];
    const w = row(compareRows(plants), 'warnings');
    expect(w.label).toBe('In this plan');
    expect(texts(w)).toEqual(['None', 'Not in this plan']);
    expect(w.differ).toBe(true);
  });
});

describe('the people and pets in the yard', () => {
  it('with no one said, one Pets row; poison to people always, in its source’s words', () => {
    const rows = compareRows([P('kalmia-latifolia'), P('itea-virginica')]);
    expect(rows.map((r) => r.key)).toContain('pets');
    expect(texts(row(rows, 'pets'))).toEqual(['A problem for dogs, cats and horses', 'Not listed as a problem for dogs, cats or horses']);
    expect(sures(row(rows, 'pets'))[1]).toBe('NC State · a plant not listed isn’t necessarily safe');
    expect(row(rows, 'poison').cells[0]).toMatchObject({ text: 'Leaves and flowers, high severity', sure: { text: 'NC State · one source' } });
    // (No one to protect: no warning color for poison if eaten.)
    expect(row(rows, 'poison').cells[0].tone).toBeUndefined();
  });

  it('with kids and a dog in the yard: poison in red for the kids, a row for the dog, red where it warns', () => {
    const rows = compareRows([P('kalmia-latifolia'), P('itea-virginica')], { ...NO_YARD, kids: true, dogs: 'hideToxic' });
    expect(rows.map((r) => r.key)).toEqual(expect.arrayContaining(['poison', 'dogs']));
    expect(rows.map((r) => r.key)).not.toContain('pets');
    expect(rows.map((r) => r.key)).not.toContain('cats');
    expect(row(rows, 'poison').cells[0].tone).toBe('bad');
    expect(row(rows, 'dogs').cells[0]).toMatchObject({ text: 'A problem for dogs', tone: 'bad', sure: { text: 'NC State · one source' } });
    expect(row(rows, 'dogs').cells[1]).toMatchObject({ text: 'Not listed', sure: { text: 'NC State · not listed isn’t the same as safe' } });
    expect(row(rows, 'dogs').cells[1].tone).toBeUndefined();
  });
});

describe('the plants chosen', () => {
  it('takes three at most, in the order chosen; a second press lets one go; Clear lets all go', () => {
    expect(MAX_COMPARE).toBe(3);
    for (const id of ['a', 'b', 'c']) expect(toggleCompare(id)).toBe(true);
    expect(toggleCompare('d')).toBe(false);
    expect(comparing()).toEqual(['a', 'b', 'c']);
    expect(toggleCompare('b')).toBe(true);
    expect(comparing()).toEqual(['a', 'c']);
    expect(toggleCompare('d')).toBe(true);
    expect(comparing()).toEqual(['a', 'c', 'd']);
    clearCompare();
    expect(comparing()).toEqual([]);
  });
});
