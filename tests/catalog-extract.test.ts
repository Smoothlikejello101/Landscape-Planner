import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error (plain JavaScript build script)
import { arkatlasStatus, feetRange, mnwildFields, monthRange, ncsuFields, usdaFields } from '../scripts/catalog/extract.mjs';
// @ts-expect-error (plain JavaScript build script)
import { mnLight, ncsuSun } from '../scripts/catalog/map.mjs';
// @ts-expect-error (plain JavaScript build script)
import { agrees, arkatlasClaims, combine, lowBranched, halfZoneOfTemp, halfZones, hostNames, mnwildClaims, ncsuClaims, onlyCaterpillars, tallamyClaims, usdaClaims, waterNeed, zoneSpan } from '../scripts/catalog/claims.mjs';

const fixture = (f: string) => readFileSync(`tests/fixtures/catalog/${f}`, 'utf8');

describe('reading sources', () => {
  it('reads an NC State page: fields, dimensions, and host names without the prose', () => {
    const f = ncsuFields(fixture('ncsu-cercis.html'));
    expect(f.Genus).toEqual(['Cercis']);
    expect(f['Plant Type']).toEqual(['Edible', 'Native Plant', 'Perennial', 'Shrub', 'Tree']);
    expect(f.Height).toEqual(['20 ft. 0 in. - 30 ft. 0 in.']);
    expect(f.Width).toEqual(['25 ft. 0 in. - 35 ft. 0 in.']);
    expect(f['USDA Plant Hardiness Zone']).toEqual(['4a, 4b, 5a, 5b, 6a, 6b, 7a, 7b, 8a, 8b, 9a, 9b']);
    expect(f['Larval hosts']).toEqual(["Henry's Elfin (Callophrys henrici)"]);
    expect(f['Wildlife Value']).toBeUndefined();
    expect(f['Design Feature']).toContain('Understory Tree');
    const o = ncsuFields(fixture('ncsu-nerium.html'));
    expect(o['Poison Severity']).toEqual(['High']);
    expect(o['Causes Contact Dermatitis']).toEqual(['Yes']);
  });
  it('keeps only the name of NC State\'s light levels, and only the light part of a Minnesota habitat', () => {
    const f = ncsuFields('<dl><dt>Light:</dt><dd><span>Full sun (6 or more hours of direct sunlight a day)</span></dd><dd><span>Deep shade (Less than 2 hours)</span></dd></dl>');
    expect(f.Light).toEqual(['Full sun', 'Deep shade']);
    const m = mnwildFields('<title>Aster foo (Foo Aster): Minnesota Wildflowers</title><tr><th scope="row">Habitat:</th><td>sun; dry prairies, roadsides</td></tr>');
    expect(m['Habitat light']).toEqual(['sun']);
    expect(m.Habitat).toBeUndefined();
  });
  it('reads sizes and months', () => {
    expect(feetRange('20 ft. 0 in. - 30 ft. 6 in.')).toEqual({ min: 20, max: 30.5 });
    expect(feetRange('8 in. - 1 ft. 0 in.')).toEqual({ min: 0.67, max: 1 });
    expect(feetRange('about tall')).toBeNull();
    expect(monthRange('July - September')).toEqual({ start: 7, end: 9 });
    expect(monthRange('spring')).toBeNull();
  });
  it('reads a USDA profile and characteristics', () => {
    const { profile, characteristics } = JSON.parse(fixture('usda-cercis.json'));
    const u = usdaFields(profile, characteristics);
    expect(u.Symbol).toEqual(['CECA4']);
    expect(u['Scientific name']).toEqual(['Cercis canadensis L.']);
    expect(u['Native status']).toContain('L48: Native');
    expect(u['Temperature, Minimum (°F)']).toEqual(['-28']);
    expect(u['Shade Tolerance']).toEqual(['Low']);
  });
  it('reads a Minnesota Wildflowers page', () => {
    const m = mnwildFields(fixture('mnwild-cardinal-flower.html'));
    expect(m['Scientific name']).toEqual(['Lobelia cardinalis']);
    expect(m['Bloom season']).toEqual(['July - September']);
    expect(mnLight(m['Habitat light'][0])).toEqual({ most: 'Full', least: 'Part' });
  });
  it('reads Arkansas status codes from the atlas layout, by column', () => {
    const t = fixture('arkatlas-pages.txt');
    expect(arkatlasStatus(t, 'Nandina domestica')?.codes).toEqual([1, 3]);
    expect(arkatlasStatus(t, 'Caulophyllum thalictroides')?.codes).toEqual([4]);
    expect(arkatlasStatus(t, 'Lonicera japonica')?.codes).toEqual([1, 3]);
    expect(arkatlasStatus(t, 'Lonicera maackii')?.codes).toEqual([1, 3]);
    expect(arkatlasStatus(t, 'Berberis thunbergii')?.codes).toEqual([]); // (its row's codes, if any, sit above this excerpt)
    expect(arkatlasStatus(t, 'Nerium oleander')).toBeNull();
  });
  it("reads a combined map's status from Appendix I, by the rule for a species mapped only as varieties", () => {
    const t = fixture('arkatlas-appendix.txt');
    const hirta = arkatlasStatus(t, 'Rudbeckia hirta');
    expect(hirta).toMatchObject({ codes: [], combined: true }); // (native: no variety has a code)
    expect(hirta?.uncertain).toBeUndefined();
    expect(hirta?.appendix?.map((x: { name: string }) => x.name)).toEqual(['var. hirta', 'var. pulcherrima Farw.']); // (one after a page break)
    const knotweed = arkatlasStatus(t, 'Polygonum aviculare'); // (three subspecies introduced, one not)
    expect(knotweed).toMatchObject({ codes: [], uncertain: true, why: "combined map: its taxa's status differs (Appendix I)" });
    expect(knotweed?.appendix?.map((x: { codes: number[] }) => x.codes)).toEqual([[1], [], [1], [1]]);
    expect(arkatlasStatus(t, 'Rudbeckia laciniata')?.combined).toBeUndefined(); // (its own map: its varieties there)
  });
  it('reads columns from the family line, so a name with an accent keeps its own codes', () => {
    const t = fixture('arkatlas-pages.txt');
    expect(arkatlasStatus(t, 'Bromus tectorum')?.codes).toEqual([1, 3]);
    expect(arkatlasStatus(t, 'Buchloe dactyloides')?.codes).toEqual([1]);
  });
  it('gives a species mapped only as a variety the variety\'s introduced-or-not status, not its other codes', () => {
    const r = arkatlasStatus(fixture('arkatlas-pages.txt'), 'Heuchera villosa');
    expect(r).toMatchObject({ infraOnly: true, codes: [2, 4] });
    expect(r.rows[0]).toMatchObject({ infra: 'var. arkansana (Rydb.) E.B.Sm.', codes: [2, 4] });
    expect(combine(arkatlasClaims(r)).native_ar).toMatchObject({ v: 'native', note: 'in Arkansas only as var. arkansana (Rydb.) E.B.Sm., which is endemic to Arkansas and of special conservation concern in Arkansas' });
  });
  it('reads only the map pages: a name in an appendix isn\'t a listing', () => {
    expect(arkatlasStatus(fixture('arkatlas-pages.txt'), 'Coreopsis verticillata')).toBeNull();
  });
  it('keeps the codes every variety shares, and leaves a combined map to Appendix I', () => {
    const two = ['                         1, 3                        1, 3', '', '      ASTERACEAE                  ASTERACEAE', '   Aster foo L.               Aster foo L.', '   var. bar Smith             var. baz Jones'].join('\n');
    expect(arkatlasStatus(two, 'Aster foo')).toMatchObject({ infraOnly: true, codes: [1, 3] });
    const combined = ['', '      POACEAE                     POACEAE', '   Lolium perenne L.          Poa annua L.', '   perennial rye              annual bluegrass', 'See Appendix I for infraspecific taxa and species status.'].join('\n');
    expect(arkatlasStatus(combined, 'Lolium perenne')).toMatchObject({ uncertain: true });
    expect(arkatlasStatus(combined, 'Poa annua')).toMatchObject({ codes: [] });
  });
  it('leaves Arkansas status unknown when the atlas\'s maps disagree', () => {
    const t = ['                         1', '', '      ASTERACEAE                  ASTERACEAE', '   Aster foo L.               Aster foo L.', '   var. bar Smith             var. baz Jones'].join('\n');
    expect(arkatlasStatus(t, 'Aster foo')).toMatchObject({ uncertain: true });
    expect(combine(arkatlasClaims(arkatlasStatus(t, 'Aster foo'))).native_ar).toBeNull();
  });
});

describe('claims and how they combine', () => {
  it('USDA temperatures become the coldest half-zone entirely above them', () => {
    expect(halfZoneOfTemp(-28)).toBe(4.5); // (4a reaches −30 °F)
    expect(halfZoneOfTemp(-30)).toBe(4);
    expect(halfZoneOfTemp(-20)).toBe(5);
    expect(halfZoneOfTemp(-80)).toBe(1);
    expect(halfZoneOfTemp(90)).toBe(13.5);
  });
  it('caterpillars by host genus, from the Tallamy index', () => {
    const index = { genera: { Cercis: { species: 3, ar: 2, ar_butterflies: ['Test Elfin (Callophrys testii)'] } } };
    expect(tallamyClaims(index, 'Cercis canadensis')).toEqual([{ fact: 'host_genus', v: { genus: 'Cercis', species: 3, ar: 2, ar_butterflies: ['Test Elfin (Callophrys testii)'] }, src: 'tallamy', kind: 'authority' }]);
    expect(tallamyClaims(index, 'Itea virginica')).toEqual([]);
    expect(tallamyClaims(null, 'Cercis canadensis')).toEqual([]);
  });
  const nc = (fact: string, v: unknown, kind = 'authority', src = 'ncsu') => ({ fact, v, src, kind });
  it('reads zones on the half-zone scale', () => {
    expect(halfZones('4a, 4b, 5a, 9b')).toEqual({ zone_min: 4, zone_max: 9.5 });
    expect(halfZones('7b, 8a, 9a')).toEqual({ zone_min: 7.5, zone_max: 9 });
    expect(zoneSpan('5', '9')).toEqual({ zone_min: 5, zone_max: 9.5 });
    expect(zoneSpan('7b', '9a')).toEqual({ zone_min: 7.5, zone_max: 9 });
    expect(zoneSpan('9', '5')).toBeNull();
    expect(zoneSpan('0', '5')).toBeNull();
  });
  it('reads water need from what a plant tolerates', () => {
    expect(waterNeed({ 'Soil Drainage': ['Good Drainage', 'Moist', 'Occasionally Wet'] })).toBe('Moderate'); // (witch hazel)
    expect(waterNeed({ 'Soil Drainage': ['Good Drainage', 'Moist', 'Occasionally Dry'], 'Resistance To Challenges': ['Drought'] })).toBe('Low'); // (red oak: drought tolerant once established)
    expect(waterNeed({ 'Soil Drainage': ['Good Drainage', 'Moist'], 'Landscape Theme': ['Drought Tolerant Garden'] })).toBe('Low');
    // Rated for wet and dry both (red maple): adaptable, so Moderate.
    expect(waterNeed({ 'Soil Drainage': ['Good Drainage', 'Moist', 'Occasionally Dry', 'Occasionally Wet'], 'Resistance To Challenges': ['Drought', 'Wet Soil'], 'Landscape Theme': ['Drought Tolerant Garden'] })).toBe('Moderate');
    expect(waterNeed({ 'Soil Drainage': ['Good Drainage', 'Very Dry'], 'Landscape Theme': ['Rain Garden'] })).toBe('Moderate');
    expect(waterNeed({ 'Soil Drainage': ['Good Drainage', 'Moist', 'Occasionally Dry', 'Very Dry'] })).toBe('Low'); // (pink muhly)
    expect(waterNeed({ 'Soil Drainage': ['Moist', 'Occasionally Wet'] })).toBe('High'); // (cardinal flower)
    expect(waterNeed({ 'Soil Drainage': ['Frequent Standing Water', 'Moist'] })).toBe('High');
    expect(waterNeed({ 'Soil Drainage': ['Good Drainage', 'Occasionally Dry'], 'Resistance To Challenges': ['Drought'] })).toBe('Low');
    expect(waterNeed({})).toBeNull();
  });
  it('pulls caterpillar host names from sentences, never the sentence', () => {
    expect(hostNames('This is a larval host plant to Eastern Tiger Swallowtail (Papilio glaucus). You may see three flights.')).toEqual(['Eastern Tiger Swallowtail (Papilio glaucus)']);
    expect(hostNames('Host plant for the Pearl Crescent butterfly. Flowers are attractive to bees.')).toEqual(['Pearl Crescent']);
    expect(hostNames("Food plant to larvae of the Dogface Sulphur (Colias cesonia) and Reakirt's Blue (Hemiargus isola) butterflies.")).toEqual(['Dogface Sulphur (Colias cesonia)', "Reakirt's Blue (Hemiargus isola)"]);
    // A bird in a sentence about larvae isn't a caterpillar: the Tallamy genera say which are.
    const names = hostNames('Like Spicebush Swallowtail (Papilio troilus), its larvae feed here; Cedar Waxwing (Bombycilla cedrorum) eats the berries.');
    expect(names).toEqual(['Spicebush Swallowtail (Papilio troilus)', 'Cedar Waxwing (Bombycilla cedrorum)']);
    expect(onlyCaterpillars(names, new Set(['Papilio']))).toEqual(['Spicebush Swallowtail (Papilio troilus)']);
    expect(onlyCaterpillars(['Pearl Crescent'], new Set(['Papilio']))).toEqual(['Pearl Crescent']);
    expect(hostNames('Members of the genus Viola support the following specialized bees: Andrena (Gonandrena) fragilis.')).toEqual([]);
    expect(hostNames('Various moths use this plant as a host.')).toEqual([]);
  });
  it('keeps the highest kind of a copied text, keeps blogs out of survival facts, and never sets places against each other', () => {
    const copy = [{ fact: 'zone_min', v: 5, src: 'shop.com', kind: 'nursery', group: 'p:1' }, { fact: 'zone_min', v: 5, src: 'ext.edu', kind: 'authority', group: 'p:1' }];
    expect(combine(copy).zone_min).toMatchObject({ src: ['ext.edu'], kind: 'authority', check: 'single' });
    expect(combine([{ fact: 'zone_min', v: 5, src: 'a-blog.com', kind: 'blog' }]).zone_min).toBeNull();
    expect(combine([{ fact: 'bloom_season', v: ['spring'], src: 'a-blog.com', kind: 'blog' }]).bloom_season).toMatchObject({ check: 'reported' });
    const months = [{ fact: 'bloom_months', v: { start: 7, end: 9 }, src: 'mnwild', kind: 'authority', at: 'MN' }, { fact: 'bloom_months', v: { start: 5, end: 7 }, src: 'x.edu', kind: 'authority', at: 'AR' }, { fact: 'bloom_months', v: { start: 7, end: 9 }, src: 'y.edu', kind: 'authority', at: 'MN' }];
    expect(combine(months).bloom_months).toMatchObject({ check: 'confirmed', src: ['mnwild', 'y.edu'] });
    // Toxicity agrees only exactly.
    expect(agrees('tox_people', ['major', 'dermatitis'], ['minor', 'dermatitis'])).toBe(false);
    expect(agrees('tox_people', ['dermatitis', 'major'], ['major', 'dermatitis'])).toBe(true);
  });
  it('gives forms as a list: the deciding source\'s, backed by others, the catalog\'s form first', () => {
    const nc = (v: string[], extra = {}) => ({ fact: 'form', v, src: 'ncsu', kind: 'authority', ...extra });
    const ext = (src: string, v: string[]) => ({ fact: 'form', v, src, kind: 'authority' });
    const usda = (habit: string[], life = ['Perennial']) => usdaClaims({ 'Growth habit': habit, Duration: life }).filter((c: { fact: string }) => c.fact === 'form');
    const ns = (src: string, v: string[], extra = {}) => ({ fact: 'form', v, src, kind: 'nursery', ...extra });
    // Redbud: NC State Shrub and Tree, USDA Shrub and Tree: both backed, the catalog's first.
    expect(combine([nc(['Shrub', 'Tree']), ...usda(['Shrub', 'Tree'])], { prefer: 'Tree' }).form).toMatchObject({ v: ['Tree', 'Shrub'], check: 'confirmed', src: ['ncsu', 'usda'] });
    // One source: its forms, all of them; the catalog only orders them.
    expect(combine([nc(['Shrub', 'Vine'])], { prefer: 'Vine' }).form).toMatchObject({ v: ['Vine', 'Shrub'], check: 'single' });
    expect(combine([nc(['Shrub'])], { prefer: 'Vine' }).form).toMatchObject({ v: ['Shrub'], check: 'single' });
    // Some backed: single, the rest noted.
    expect(combine([nc(['Shrub', 'Vine']), ...usda(['Shrub'])]).form).toMatchObject({ v: ['Shrub', 'Vine'], check: 'single', note: 'Vine from ncsu alone' });
    // USDA alone: a forb that lives for years is a perennial. Its "Perennial" backs only a plain perennial.
    expect(combine(usda(['Forb/herb'])).form).toMatchObject({ v: ['Perennial'], check: 'single' });
    expect(combine(usda(['Forb/herb'], ['Biennial'])).form).toMatchObject({ v: ['Annual'] });
    // An aquatic NC State also calls a perennial (cardinal flower) stays both.
    expect(combine([nc(['Aquatic/Emergent', 'Perennial']), ...usda(['Forb/herb'])], { prefer: 'Perennial' }).form).toMatchObject({ v: ['Perennial', 'Aquatic/Emergent'], check: 'single', note: 'Aquatic/Emergent from ncsu alone' });
    expect(combine([nc(['Perennial']), ...usda(['Forb/herb'])]).form).toMatchObject({ v: ['Perennial'], check: 'confirmed' });
    expect(combine([nc(['Fern']), ...usda(['Forb/herb'])]).form).toMatchObject({ v: ['Fern'], check: 'single' });
    // NC State's "Herbaceous Perennial" beside a fern or bulb is its life cycle: the bulb stays a bulb, never confirmed by USDA's forb.
    const fern = ncsuClaims({ 'Plant Type': ['Fern', 'Herbaceous Perennial'] }).filter((c: { fact: string }) => c.fact === 'form');
    expect(combine([...fern, ...usda(['Forb/herb'])], { prefer: 'Perennial' }).form).toMatchObject({ v: ['Fern'], check: 'single' });
    expect(combine([nc(['Bulb', 'Perennial']), ...usda(['Forb/herb'])], { prefer: 'Perennial' }).form).toMatchObject({ v: ['Bulb'], check: 'single' });
    // USDA's habit sharing no form with NC State's: both are kept, the catalog's first (autumn sage, a perennial
    // to NC State and a shrub to USDA)…
    expect(combine([nc(['Perennial']), ...usda(['Shrub'])]).form).toMatchObject({ v: ['Perennial', 'Shrub'], check: 'single', src: ['ncsu', 'usda'], note: 'ncsu lists Perennial; usda lists Shrub: both kept' });
    expect(combine([nc(['Perennial']), ...usda(['Shrub'])], { prefer: 'Shrub' }).form).toMatchObject({ v: ['Shrub', 'Perennial'] });
    // …where a plain perennial beside a grass is that grass (a rush USDA calls a grass).
    expect(combine([nc(['Perennial']), ...usda(['Graminoid'])]).form).toMatchObject({ v: ['Grass/Sedge'], check: 'single', src: ['ncsu', 'usda'], note: 'ncsu lists Perennial; usda lists Grass/Sedge' });
    // USDA's vine that is also a shrub is both (lantana).
    expect(usda(['Shrub', 'Vine'])[0].v).toEqual(['Vine', 'Shrub']);
    // …but its "Perennial" isn't against a bulb, fern or aquatic, and a plant that lives either way is both.
    expect(combine([nc(['Bulb']), ...usda(['Forb/herb'])]).form).toMatchObject({ v: ['Bulb'], check: 'single' });
    expect(usda(['Forb/herb'], ['Annual', 'Biennial', 'Perennial'])[0].v).toEqual(['Perennial', 'Annual']);
    expect(combine([nc(['Perennial']), ...usda(['Forb/herb'], ['Annual', 'Perennial'])]).form).toMatchObject({ v: ['Perennial'], check: 'confirmed', note: 'usda lists Annual' });
    // USDA alone with "Perennial", where the catalog names a fern: nothing settled.
    expect(combine(usda(['Forb/herb']), { prefer: 'Fern' }).form).toBeNull();
    expect(combine(usda(['Forb/herb'], ['Annual', 'Perennial']), { prefer: 'Fern' }).form).toBeNull();
    expect(combine([nc(['Shrub']), ...usda(['Shrub', 'Tree'])]).form).toMatchObject({ v: ['Shrub'], check: 'confirmed', note: 'usda lists Tree' });
    // A tree is a tree, one form however tall (pawpaw, a shrub and a tree to NC State, is both); the app works
    // out how it layers with what's under it from its height.
    expect(combine([nc(['Shrub', 'Tree']), ext('x.edu', ['Tree'])]).form).toMatchObject({ v: ['Shrub', 'Tree'], check: 'single', note: 'Shrub from ncsu alone' });
    expect(combine([nc(['Shrub', 'Tree']), ...usda(['Shrub', 'Tree'])], { prefer: 'Shrub' }).form).toMatchObject({ v: ['Shrub', 'Tree'], check: 'confirmed' });
    expect(combine([nc(['Tree']), ns('shop.com', ['Tree'])]).form).toMatchObject({ v: ['Tree'], check: 'confirmed' });
    expect(combine(usda(['Shrub', 'Tree'])).form).toMatchObject({ v: ['Shrub', 'Tree'], check: 'single' });
    expect(ncsuClaims({ 'Plant Type': ['Tree'], 'Design Feature': ['Small Tree'] }).find((c: { fact: string }) => c.fact === 'form')?.v).toEqual(['Tree']);
    expect(ncsuClaims({ 'Plant Type': ['Tree'], 'Design Feature': ['Shade Tree'] }).find((c: { fact: string }) => c.fact === 'form')?.v).toEqual(['Tree']);
    expect(ncsuClaims({ 'Plant Type': ['Water Plant', 'Herbaceous Perennial'] }).find((c: { fact: string }) => c.fact === 'form')?.v).toEqual(['Aquatic/Emergent', 'Perennial']);
    // An herb's annual or perennial is its Life Cycle, over the tags (sage "Annual" but perennial; rosepink
    // "Herbaceous Perennial" but biennial); a plain "Perennial" tag alone is a perennial, beside a shrub nothing.
    const ncForm = (f: Record<string, string[]>) => ncsuClaims(f).find((c: { fact: string }) => c.fact === 'form')?.v;
    expect(ncForm({ 'Plant Type': ['Annual', 'Edible', 'Herb', 'Perennial'], 'Life Cycle': ['Perennial'] })).toEqual(['Perennial']);
    expect(ncForm({ 'Plant Type': ['Herbaceous Perennial', 'Wildflower'], 'Life Cycle': ['Biennial'] })).toEqual(['Annual']);
    expect(ncForm({ 'Plant Type': ['Perennial', 'Wildflower'], 'Life Cycle': ['Biennial', 'Perennial'] })).toEqual(['Perennial']); // (what both say)
    expect(ncForm({ 'Plant Type': ['Herbaceous Perennial'], 'Life Cycle': ['Annual', 'Perennial'] })).toEqual(['Perennial']); // (wild geranium)
    expect(ncForm({ 'Plant Type': ['Native Plant', 'Perennial', 'Wildflower'], 'Life Cycle': ['Annual'] })).toEqual(['Annual']); // (sharing none: the Life Cycle)
    expect(ncForm({ 'Plant Type': ['Annual', 'Ground Cover', 'Perennial'], 'Life Cycle': ['Annual', 'Perennial'] })).toEqual(['Perennial', 'Annual']);
    expect(ncForm({ 'Plant Type': ['Native Plant', 'Perennial'] })).toEqual(['Perennial']);
    expect(ncForm({ 'Plant Type': ['Perennial', 'Shrub', 'Woody Plant'], 'Life Cycle': ['Woody'] })).toEqual(['Shrub']);
    expect(ncForm({ 'Plant Type': ['Ground Cover', 'Woody Plant'], 'Life Cycle': ['Woody'] })).toBeUndefined();
    expect(ncForm({ 'Plant Type': ['Perennial', 'Woody Plant'], 'Life Cycle': ['Woody'] })).toBeUndefined(); // (woody, but which form?)
    // Authorities that share no form: both kept, with every source that backs either…
    expect(combine([nc(['Shrub']), ext('x.edu', ['Vine'])]).form).toMatchObject({ v: ['Shrub', 'Vine'], check: 'single', note: 'ncsu lists Shrub; x.edu lists Vine: both kept' });
    expect(combine([nc(['Shrub']), ext('x.edu', ['Vine']), ...usda(['Shrub'])]).form).toMatchObject({ v: ['Shrub', 'Vine'], src: ['ncsu', 'x.edu', 'usda'] });
    // At most three, at least one from each side, citing only sources whose forms are shown.
    expect(combine([nc(['Shrub', 'Tree', 'Perennial']), ext('x.edu', ['Vine'])], { prefer: 'Shrub' }).form)
      .toMatchObject({ v: ['Shrub', 'Tree', 'Vine'], src: ['ncsu', 'x.edu'], note: 'ncsu lists Shrub, Tree, Perennial; x.edu lists Vine: both kept (Perennial left out: three at most)' });
    const lantana = [nc(['Perennial', 'Annual']), ...usda(['Shrub', 'Vine'])];
    expect(combine(lantana, { prefer: 'Shrub' }).form.v).toEqual(['Shrub', 'Perennial', 'Annual']);
    expect(combine(lantana, { prefer: 'Perennial' }).form.v).toEqual(['Perennial', 'Annual', 'Vine']);
    // (A tree too: a shrub to NC State, a tree to another authority, is both.)
    expect(combine([nc(['Shrub']), ext('x.edu', ['Tree'])]).form).toMatchObject({ v: ['Shrub', 'Tree'], check: 'single' });
    // Nurseries: the one others back most; likely or reported, never confirmed.
    expect(combine([ns('a.com', ['Shrub']), ns('b.com', ['Vine']), ns('c.com', ['Vine'])]).form).toMatchObject({ v: ['Vine'], check: 'likely', note: 'a.com lists Shrub' });
    expect(combine([ns('a.com', ['Shrub'])]).form).toMatchObject({ v: ['Shrub'], check: 'reported' });
    // A cultivar with no page of its own keeps its species' form, unless the species is listed as a tree.
    expect(combine([nc(['Perennial'])], { cultivar: true }).form).toMatchObject({ v: ['Perennial'] });
    expect(combine([nc(['Tree'])], { cultivar: true }).form).toMatchObject({ v: null, check: 'disputed' });
    expect(combine([nc(['Shrub', 'Tree'])], { cultivar: true, prefer: 'Shrub' }).form).toMatchObject({ v: null, check: 'disputed' });
    // (Only the deciding source's tree counts: NC State's shrub with USDA's Shrub and Tree stays a shrub.)
    expect(combine([nc(['Shrub']), ...usda(['Shrub', 'Tree'])], { cultivar: true }).form).toMatchObject({ v: ['Shrub'], check: 'confirmed' });
    // (With only nurseries for the species, theirs is the deciding source: a tree there unsettles it too.)
    expect(combine([ns('a.com', ['Tree']), ns('b.com', ['Tree'])], { cultivar: true }).form).toMatchObject({ v: null, check: 'disputed' });
    // USDA's Annual backs NC State's annual, its Perennial beside it notwithstanding.
    expect(combine([nc(['Annual']), ...usda(['Forb/herb'], ['Annual', 'Perennial'])]).form).toMatchObject({ v: ['Annual'], check: 'confirmed' });
    expect(combine([ns('shop.com', ['Shrub'], { cultivarPage: true }), nc(['Tree'])], { cultivar: true }).form).toMatchObject({ v: null, check: 'disputed' });
    // Its own authority or breeder page decides, species pages backing it, trees included.
    expect(combine([ns('breeder.com', ['Tree'], { kind: 'breeder' }), ...usda(['Shrub', 'Tree'])], { cultivar: true }).form).toMatchObject({ v: ['Tree'], src: ['breeder.com', 'usda'], note: 'usda lists Shrub' });
    expect(combine([nc(['Shrub', 'Tree'], { cultivarPage: true }), ...usda(['Shrub', 'Tree'])], { cultivar: true, prefer: 'Tree' }).form).toMatchObject({ v: ['Tree', 'Shrub'], check: 'confirmed' });
    // At most three forms; odd inputs don't throw.
    expect(combine([nc(['Shrub', 'Tree', 'Annual', 'Perennial'])], { prefer: 'Annual' }).form.v).toEqual(['Annual', 'Shrub', 'Tree']);
    expect(() => combine([{ fact: 'form', v: 'Shrub', src: 'ncsu', kind: 'authority' }], { prefer: null })).not.toThrow();
  });
  it('lets two sources that agree outrank a lone authority, the authority shown beside them (agreed 2026-10-22)', () => {
    const c = (src: string, kind: string, fact: string, v: unknown) => ({ fact, v, src, kind });
    // Palm sedge: NC State through zone 4b, two nurseries through 8.
    // (One half alone: no alt; the pairs below have one.)
    expect(combine([c('ncsu', 'authority', 'zone_max', 4.5), c('a.com', 'nursery', 'zone_max', 8.5), c('b.com', 'nursery', 'zone_max', 8)]).zone_max)
      .toMatchObject({ v: 8.5, src: ['a.com', 'b.com'], check: 'likely', kind: 'nursery' });
    // Green-and-gold: 1–2 inches tall at NC State, half a foot or more at two nurseries.
    expect(combine([c('ncsu', 'authority', 'height', { min: 0.08, max: 0.17 }), c('a.com', 'nursery', 'height', { min: 0.5, max: 0.75 }), c('b.com', 'nursery', 'height', { min: 0.5, max: 1 })]).height)
      .toMatchObject({ v: { min: 0.5, max: 0.75 }, check: 'likely', alt: { v: { min: 0.08, max: 0.17 }, src: ['ncsu'] } });
    // One nursery alone: even, and the authority leads.
    expect(combine([c('ncsu', 'authority', 'zone_max', 4.5), c('a.com', 'nursery', 'zone_max', 8.5)]).zone_max).toMatchObject({ v: 4.5, check: 'single' });
    // An authority and a nursery against two nurseries: even, and the authority's side leads.
    expect(combine([c('ncsu', 'authority', 'zone_max', 7.5), c('a.com', 'nursery', 'zone_max', 7.5), c('b.com', 'nursery', 'zone_max', 9.5), c('d.com', 'nursery', 'zone_max', 9.5)]).zone_max).toMatchObject({ v: 7.5, check: 'confirmed' });
    const z = (src: string, kind: string, lo: number, hi: number) => [c(src, kind, 'zone_min', lo), c(src, kind, 'zone_max', hi)];
    const pair = combine([...z('ncsu', 'authority', 4, 7.5), ...z('a.com', 'nursery', 4, 9.5), ...z('b.com', 'nursery', 4, 9.5)]);
    expect(pair.zone_max).toMatchObject({ v: 9.5, check: 'likely', alt: { v: 7.5, src: ['ncsu'], check: 'single' } });
    expect(pair.zone_min).toMatchObject({ v: 4, check: 'confirmed' }); // (the range NC State gives, 4–7b, is on the half that differs)
    expect(pair.zone_min.alt).toBeUndefined();
    // Dogbane: 11b, 10b and 9b. 10b agrees with both, but 11b and 9b don't agree with each other: two sides of
    // two, each with an authority, so the cautious 9b leads, whichever order the claims come in.
    const zp = (src: string, kind: string, lo: number, hi: number) => [c(src, kind, 'zone_min', lo), c(src, kind, 'zone_max', hi)];
    const dog = [zp('ncsu', 'authority', 3, 11.5), zp('a.com', 'nursery', 3, 10.5), zp('x.edu', 'authority', 3, 9.5)];
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 0, 2], [1, 2, 0]])
      expect(combine(order.flatMap((i) => dog[i])).zone_max).toMatchObject({ v: 9.5, src: ['x.edu', 'a.com'], check: 'confirmed', alt: { v: 11.5, src: ['ncsu'], check: 'single' } });
    // Where the value shown has no authority behind it, an outvoted authority's is the one kept beside it, not a
    // larger group of nurseries (three at 3, two at 5, NC State at 7).
    const z1 = (src: string, kind: string, v: number) => zp(src, kind, v, 9);
    const outvoted = combine([z1('a.com', 'nursery', 3), z1('b.com', 'nursery', 3), z1('d.com', 'nursery', 3), z1('e.com', 'nursery', 5), z1('f.com', 'nursery', 5), z1('ncsu', 'authority', 7)].flat()).zone_min;
    expect(outvoted).toMatchObject({ v: 3, check: 'likely', alt: { v: 7, src: ['ncsu'], check: 'single' } });
    // (A fact that isn't half of a range the same: two against two, the cautious nurseries' value shown, NC State's beside it.)
    expect(combine([c('a.com', 'nursery', 'deer', 'Resistant'), c('b.com', 'nursery', 'deer', 'Resistant'), c('d.com', 'nursery', 'deer', 'Occasional'), c('e.com', 'nursery', 'deer', 'Occasional'), c('ncsu', 'authority', 'deer', 'Candy')]).deer)
      .toMatchObject({ v: 'Occasional', alt: { v: 'Candy', src: ['ncsu'] } });
  });
  it('settles an even split by the cautious value: the narrower range, the larger plant', () => {
    const c = (src: string, kind: string, fact: string, v: unknown) => ({ fact, v, src, kind });
    // Two authorities: the warmer cold limit, the colder warm limit; the more sun it needs, the less it takes.
    expect(combine([c('ncsu', 'authority', 'zone_min', 4), c('x.edu', 'authority', 'zone_min', 6)]).zone_min).toMatchObject({ v: 6, src: ['x.edu'], check: 'single' });
    expect(combine([c('ncsu', 'authority', 'zone_max', 9.5), c('x.edu', 'authority', 'zone_max', 7.5)]).zone_max).toMatchObject({ v: 7.5 });
    expect(combine([c('a.com', 'nursery', 'sun_most', 'Full'), c('b.com', 'nursery', 'sun_most', 'Part')]).sun_most).toMatchObject({ v: 'Part', check: 'reported' });
    expect(combine([c('a.com', 'nursery', 'sun_least', 'Part'), c('b.com', 'nursery', 'sun_least', 'Full')]).sun_least).toMatchObject({ v: 'Full' });
    expect(combine([c('a.com', 'nursery', 'height', { min: 2, max: 2 }), c('b.com', 'nursery', 'height', { min: 3, max: 3 })]).height).toMatchObject({ v: { min: 3, max: 3 } });
    expect(combine([c('a.com', 'nursery', 'deer', 'Resistant'), c('b.com', 'nursery', 'deer', 'Occasional')]).deer).toMatchObject({ v: 'Occasional' });
    expect(combine([c('a.com', 'nursery', 'water', 'High'), c('b.com', 'nursery', 'water', 'Moderate')]).water).toMatchObject({ v: 'Moderate' });
    // Water: Low against High is as far from Moderate either way: nothing taken, for the review, in either order.
    for (const claims of [[c('a.com', 'nursery', 'water', 'Low'), c('b.com', 'nursery', 'water', 'High')], [c('b.com', 'nursery', 'water', 'High'), c('a.com', 'nursery', 'water', 'Low')]])
      expect(combine(claims).water).toMatchObject({ v: null, check: 'disputed', src: expect.arrayContaining(['a.com', 'b.com']) });
    // Halves decided apart that make no range: two nurseries, one saying full sun only, the other part shade only.
    // The cautious half of each (the less sun at most, the more at least) crosses: both left for the review.
    const s2 = (src: string, most: string, least: string) => [c(src, 'nursery', 'sun_most', most), c(src, 'nursery', 'sun_least', least)];
    const odd = combine([...s2('a.com', 'Full', 'Full'), ...s2('b.com', 'Part', 'Part')]);
    expect([odd.sun_most.v, odd.sun_most.check, odd.sun_least.v, odd.sun_least.check]).toEqual([null, 'disputed', null, 'disputed']);
    expect(odd.sun_most.note).toContain('each decided on its own, most sun Part and least sun Full make no range');
  });
  it('keeps what nurseries report beside an authority where it differs (never for safety facts)', () => {
    const c = (src: string, kind: string, fact: string, v: unknown) => ({ fact, v, src, kind });
    const s2 = (src: string, kind: string, most: string, least: string) => [c(src, kind, 'sun_most', most), c(src, kind, 'sun_least', least)];
    const z = (src: string, kind: string, lo: number, hi: number) => [c(src, kind, 'zone_min', lo), c(src, kind, 'zone_max', hi)];
    const sun = combine([...s2('ncsu', 'authority', 'Part', 'Shade'), ...s2('a.com', 'nursery', 'Full', 'Shade'), ...s2('b.com', 'nursery', 'Full', 'Shade'), ...s2('d.com', 'nursery', 'Part', 'Shade')]);
    expect(sun.sun_most).toMatchObject({ v: 'Part', check: 'confirmed', alt: { v: 'Full', src: ['a.com', 'b.com'], check: 'likely' } });
    // A pair's report is one nursery's whole range (never one nursery's half with another's), on the half that
    // differs: the other half is the value shown.
    expect(sun.sun_least).toMatchObject({ v: 'Shade' });
    expect(sun.sun_least.alt).toBeUndefined();
    // Its value is the one the group gathers around, every member agreeing with it (three authorities at 7–9 against
    // nurseries at 3–9, 4–9 and 4.5–9: 4 agrees with both others, 3 and 4.5 don't agree).
    const zz = (src: string, kind: string, lo: number, hi: number) => [c(src, kind, 'zone_min', lo), c(src, kind, 'zone_max', hi)];
    const grouped = combine([...zz('ncsu', 'authority', 7, 9), ...zz('x.edu', 'authority', 7, 9), ...zz('y.edu', 'authority', 7, 9), ...zz('a.com', 'nursery', 3, 9), ...zz('b.com', 'nursery', 4, 9), ...zz('d.com', 'nursery', 4.5, 9)]);
    expect(grouped.zone_min.alt).toMatchObject({ v: 4, src: ['b.com', 'a.com', 'd.com'], check: 'likely' });
    // Two authorities that agree, with the same sources: one side, NC State's value shown (oleander: NC State 8,
    // UF 9), in either order of the other claims.
    const ole = [c('ncsu', 'authority', 'zone_min', 8), c('x.edu', 'authority', 'zone_min', 9)];
    expect(combine(ole).zone_min).toMatchObject({ v: 8, src: ['ncsu', 'x.edu'], check: 'confirmed' });
    expect(combine([...ole].reverse()).zone_min).toMatchObject({ v: 8, src: ['ncsu', 'x.edu'] });
    // (Without NC State, the one the build reads first: the same sources either way, and the same check.)
    const two = [c('y.edu', 'authority', 'zone_min', 3.5), c('x.edu', 'authority', 'zone_min', 3)];
    for (const claims of [two, [...two].reverse()]) expect(combine(claims).zone_min).toMatchObject({ v: claims[0].v, check: 'confirmed', src: [claims[0].src, claims[1].src] });
    // Two other ranges as strong (a nursery's full sun only, another's part shade only, beside NC State's full sun
    // to part shade): the alt is the same whichever is read first, by name.
    const sp = (src: string, kind: string, most: string, least: string) => [c(src, kind, 'sun_most', most), c(src, kind, 'sun_least', least)];
    const tie = [sp('ncsu', 'authority', 'Full', 'Part'), sp('wind.com', 'nursery', 'Part', 'Part'), sp('allen.com', 'nursery', 'Full', 'Full')];
    for (const order of [[0, 1, 2], [0, 2, 1], [2, 1, 0]]) {
      const got = combine(order.flatMap((i) => tie[i]));
      expect([got.sun_most.alt, got.sun_least.alt]).toEqual([undefined, { v: 'Full', src: ['allen.com'], check: 'reported' }]);
    }
    const mixed = combine([...s2('ncsu', 'authority', 'Full', 'Part'), ...s2('a.com', 'nursery', 'Part', 'Part'), c('b.com', 'nursery', 'sun_least', 'Full')]);
    expect(mixed.sun_most.alt).toEqual({ v: 'Part', src: ['a.com'], check: 'reported' });
    expect(mixed.sun_least.alt).toBeUndefined(); // (a.com's least sun, part shade, is the value shown)
    // A nursery giving only one half isn't read as a range.
    expect(combine([...s2('ncsu', 'authority', 'Full', 'Part'), c('b.com', 'nursery', 'sun_most', 'Part')]).sun_most.alt).toBeUndefined();
    // One nursery: reported. Zones within a whole zone agree, so no alt.
    expect(combine([...z('ncsu', 'authority', 5, 8.5), ...z('a.com', 'nursery', 5, 10.5)]).zone_max.alt).toEqual({ v: 10.5, src: ['a.com'], check: 'reported' });
    expect(combine([...z('ncsu', 'authority', 5, 8.5), ...z('a.com', 'nursery', 5, 10.5)]).zone_min.alt).toBeUndefined(); // (the same cold limit: the range is on the warm half)
    expect(combine([...z('ncsu', 'authority', 5, 8.5), ...z('a.com', 'nursery', 5, 9.5)]).zone_max.alt).toBeUndefined();
    // Nothing for facts nurseries don't speak to. Where no authority decides, the other side too (an even split
    // settled by the cautious value: Moderate, nearer the middle, over High).
    expect(combine([c('ncsu', 'authority', 'tox_people', ['minor']), c('a.com', 'nursery', 'tox_people', ['major'])]).tox_people.alt).toBeUndefined();
    expect(combine([c('a.com', 'nursery', 'water', 'High'), c('b.com', 'nursery', 'water', 'Moderate')]).water).toMatchObject({ v: 'Moderate', alt: { v: 'High', src: ['a.com'], check: 'reported' } });
  });
  it('reads an evergreen screen tree, branches to the ground, from NC State\'s tags', () => {
    const tree = (leaf: string[], use: string[], habit: string[], type = ['Tree']) => ({ 'Plant Type': type, 'Woody Plant Leaf Characteristics': leaf, 'Design Feature': use, 'Habit/Form': habit });
    expect(lowBranched(tree(['Needled Evergreen'], ['Hedge', 'Screen/Privacy'], ['Columnar', 'Dense', 'Pyramidal']))).toBe(true); // Green Giant
    expect(lowBranched(tree(['Broadleaf Evergreen', 'Semi-evergreen'], ['Specimen'], ['Columnar', 'Open', 'Pyramidal']))).toBe(false); // sweetbay: its shape alone isn't a screen
    expect(lowBranched(tree(['Deciduous'], ['Hedge', 'Screen/Privacy'], ['Erect']))).toBe(false); // witch hazel: limbs can go up
    expect(lowBranched(tree(['Needled Evergreen'], ['Shade Tree'], ['Open', 'Rounded']))).toBe(false); // (an open evergreen)
    expect(lowBranched(tree(['Broadleaf Evergreen'], ['Hedge'], ['Dense'], ['Shrub']))).toBe(false); // (not a tree)
    expect(lowBranched({})).toBe(false);
    const f = combine(ncsuClaims({ ...tree(['Needled Evergreen'], ['Screen/Privacy'], ['Dense']) }));
    expect(f.low_branched).toMatchObject({ v: true, src: ['ncsu'], check: 'single' });
  });
  it('confirms a caterpillar host only where two sources name the same one', () => {
    const h = (src: string, v: string[]) => ({ fact: 'host', v, src, kind: 'authority' });
    expect(combine([h('ncsu', ['A']), h('x.edu', ['B'])]).host).toMatchObject({ v: ['A', 'B'], check: 'single' });
    expect(combine([h('ncsu', ['A']), h('x.edu', ['A'])]).host).toMatchObject({ check: 'confirmed' });
  });
  it('lets an authority decide, and confirms it with another independent source', () => {
    const f = combine([nc('sun_least', 'Part'), nc('sun_least', 'Part', 'authority', 'mnwild')]);
    expect(f.sun_least).toMatchObject({ v: 'Part', src: ['ncsu', 'mnwild'], check: 'confirmed' });
    // Two authorities that disagree, alone: the cautious value leads (the more sun it needs), the other beside it.
    // (A pair's other side is kept only as a whole range: here both give both halves.)
    const two = combine([nc('sun_most', 'Full'), nc('sun_least', 'Part'), nc('sun_most', 'Full', 'authority', 'mnwild'), nc('sun_least', 'Full', 'authority', 'mnwild')]);
    expect(two.sun_least).toMatchObject({ v: 'Full', src: ['mnwild'], check: 'single', alt: { v: 'Part', src: ['ncsu'], check: 'single' } });
    expect(two.sun_most).toMatchObject({ v: 'Full', check: 'confirmed' });
    expect(two.sun_most.alt).toBeUndefined(); // (NC State's range, full sun to part shade, differs on the other half)
    expect(combine([nc('sun_least', 'Part'), nc('sun_least', 'Full', 'authority', 'mnwild')]).sun_least).toMatchObject({ v: 'Full', check: 'single' }); // (one half each: no alt)
  });
  it('never lets one nursery overrule an authority, but two that agree do; nurseries fill a gap at lower confidence', () => {
    const one = combine([nc('zone_min', 6), nc('zone_min', 4, 'nursery', 'a.com')]);
    expect(one.zone_min).toMatchObject({ v: 6, check: 'single', kind: 'authority' });
    expect(one.zone_min.note).toContain('a.com says 4');
    const over = combine([nc('zone_min', 6), nc('zone_min', 4, 'nursery', 'a.com'), nc('zone_min', 4, 'nursery', 'b.com')]);
    expect(over.zone_min).toMatchObject({ v: 4, check: 'likely', kind: 'nursery' });
    expect(over.zone_min.note).toContain('ncsu says 6');
    expect(combine([nc('zone_min', 5, 'nursery', 'a.com'), nc('zone_min', 5.5, 'nursery', 'b.com')]).zone_min).toMatchObject({ v: 5, check: 'likely' }); // (agreeing: one side, the first's value)
    expect(combine([nc('zone_min', 5, 'nursery', 'a.com')]).zone_min).toMatchObject({ check: 'reported' });
  });
  it('counts copies once', () => {
    const f = combine([{ ...nc('height', { min: 3, max: 4 }, 'nursery', 'a.com'), group: 'g1' }, { ...nc('height', { min: 3, max: 4 }, 'nursery', 'b.com'), group: 'g1' }]);
    expect(f.height).toMatchObject({ check: 'reported' });
  });
  it('takes safety facts from authorities only', () => {
    expect(combine([nc('tox_people', ['major'], 'nursery', 'a.com')]).tox_people).toBeNull();
    expect(combine([nc('tox_people', ['major'])]).tox_people).toMatchObject({ v: ['major'] });
  });
  it('gives a cultivar its size only from a page for the cultivar or its breeder', () => {
    const species = { ...nc('height', { min: 3, max: 6 }), cultivarPage: false };
    expect(combine([species], { cultivar: true }).height).toBeNull();
    expect(combine([species, nc('height', { min: 2, max: 3 }, 'breeder', 'pw.com')], { cultivar: true }).height).toMatchObject({ v: { min: 2, max: 3 }, kind: 'breeder' });
    expect(combine([{ ...species, cultivarPage: true }], { cultivar: true }).height).toMatchObject({ kind: 'authority' });
  });
  it('agrees within a whole zone and overlapping sizes', () => {
    expect(agrees('zone_min', 5, 6)).toBe(true);
    expect(agrees('zone_min', 5, 6.5)).toBe(false);
    expect(agrees('height', { min: 3, max: 4 }, { min: 4, max: 6 })).toBe(true);
    expect(agrees('height', { min: 3, max: 4 }, { min: 8, max: 10 })).toBe(false);
    expect(agrees('flower_color', ['Pink', 'White'], ['white'])).toBe(true);
  });
  it('shows USDA only as a flag, and only where it differs by more than a zone', () => {
    const u = usdaClaims({ 'Temperature, Minimum (°F)': ['7'], 'Native status': ['L48: Native'] });
    const f = combine([nc('zone_min', 5), ...u]);
    expect(f.zone_min).toMatchObject({ v: 5, src: ['ncsu'], check: 'single', flags: ['USDA: lowest 7 °F'] });
    expect(combine([nc('zone_min', 4), ...usdaClaims({ 'Temperature, Minimum (°F)': ['-28'] })]).zone_min.flags).toBeUndefined();
    expect(combine(u).zone_min).toMatchObject({ v: null, flags: ['USDA: lowest 7 °F'] }); // (a flag alone decides nothing)
    expect(combine(u).native_us).toMatchObject({ v: 'native' });
  });
  it('reads NC State and Minnesota pages into claims', () => {
    const f = combine([...ncsuClaims(ncsuFields(fixture('ncsu-cercis.html'))), ...mnwildClaims(mnwildFields(fixture('mnwild-cardinal-flower.html')))]);
    expect(f.zone_min.v).toBe(4);
    expect(f.zone_max.v).toBe(9.5);
    expect(f.height.v).toEqual({ min: 20, max: 30 });
    expect(f.host.v).toEqual(["Henry's Elfin (Callophrys henrici)"]);
    // NC State's fixture says Shrub and Tree, and nothing else gives a form: both, from one source.
    expect(f.form).toMatchObject({ v: ['Shrub', 'Tree'], check: 'single' });
    expect(f.bloom_months).toMatchObject({ v: 'July - September', at: 'MN' });
    const o = combine(ncsuClaims(ncsuFields(fixture('ncsu-nerium.html'))));
    expect(o.tox_people.v).toEqual(['major', 'dermatitis']);
    expect(o.tox_pets).toBeNull();
    expect(o.edible).toBeNull(); // (not "false": it's simply not listed)
    expect(o.nectar ?? null).toBeNull();
  });
  it('reads sun from each source', () => {
    expect(ncsuSun(['Full sun', 'Partial Shade'])).toEqual({ most: 'Full', least: 'Part' });
    expect(ncsuSun(['Deep shade'])).toEqual({ most: 'Shade', least: 'Shade' });
    expect(mnLight('part shade, sun')).toEqual({ most: 'Full', least: 'Part' });
  });
});
