import { describe, expect, it } from 'vitest';
import { bedAt, bedChips, bedFilter, bedName, bedRules, bedsToPlant, partName, spotsIn, sunOverBed, withFilters, type BedRules } from '../src/bed-plant';
import { clayRating, soilRating, filteredPlants, noSoilRating, pickerCount, PLANT_FILTER_DEFAULTS, plantFilter, plantMatches, reportedMatch, reportedPhrase, sunFit, sunRangeOf, sunRangeSaid, waterWanted, type Plant, type PlantFilter } from '../src/plants';
import type { Shape, SunInfo } from '../src/types';

// Plant this bed (Jason, Nov 2, his answers to the proposal): what a bed's conditions filter on, exactly as the brief
// says, and the sun across a bed from the sun areas over it.

const base = { color: '#000000', label: '', opacity: 1, locked: false };
const rect = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Shape> = {}): Shape =>
  ({ ...base, id, type: 'rect', x, y, width: w, height: h, rotation: 0, ...extra } as Shape);
const sun = (hours: number, extra: Partial<SunInfo> = {}): SunInfo => ({ mode: 'hours', hours, periods: [], dappled: false, ...extra });
const f = (over: Partial<PlantFilter> = {}): PlantFilter => ({ ...PLANT_FILTER_DEFAULTS, ...over });
const rules = (over: Partial<BedRules> = {}): BedRules => ({ sun: null, soil: null, moisture: null, drip: false, ...over });
/** Whether a plant passes the filters a bed sets (on top of none of the person's own). */
const fits = (p: Plant, r: BedRules) => plantMatches(p, f(bedFilter(r)));
const plant = (o: Partial<Plant>): Plant => ({ id: o.common ?? 'p', common: 'p', ...o } as Plant);

describe('a bed\'s sun: plants that take some of it (answer A)', () => {
  const sunny = plant({ common: 'Coneflower', sun_most: 'Full', sun_least: 'Full' });
  const either = plant({ common: 'Bluestar', sun_most: 'Full', sun_least: 'Part' });
  const shady = plant({ common: 'Fern', sun_most: 'Part', sun_least: 'Shade' });
  const deep = plant({ common: 'Hosta', sun_most: 'Shade', sun_least: 'Shade' });
  const middle = plant({ common: 'Heuchera', sun_most: 'Part', sun_least: 'Part' });
  it('a bed from part shade to full sun lists a plant that fits any of it, and none that fits none of it', () => {
    const r = rules({ sun: ['Full', 'Part'] });
    expect([sunny, either, shady, deep].map((p) => fits(p, r))).toEqual([true, true, true, false]);
    expect(fits(plant({ common: 'No sun known' }), r)).toBe(false); // (no sun on record: as the Sun filter does)
  });
  it('says where a plant that fits only part of the bed fits: its sunny end, its shady end, or the middle', () => {
    expect(sunFit(either, 'Full-Part')).toBe('all');
    expect(sunFit(sunny, 'Full-Part')).toBe('sunny');
    expect(sunFit(shady, 'Full-Part')).toBe('shady');
    expect(sunFit(deep, 'Full-Part')).toBeNull();
    expect(sunFit(middle, 'Full-Shade')).toBe('middle');
    expect(sunFit(sunny, 'Full-Full')).toBe('all');
    expect(sunFit(shady, 'Part-Part')).toBe('all');
  });
  it('reads and says a bed\'s sun, shadiest first, as hours go', () => {
    expect(sunRangeOf('Full-Part')).toEqual(['Full', 'Part']);
    expect(sunRangeOf('Part-Full')).toBeNull(); // (sunniest first, always)
    expect(sunRangeOf('')).toBeNull();
    expect(sunRangeSaid('Full-Part')).toBe('part shade to full sun');
    expect(sunRangeSaid('Shade-Shade')).toBe('shade');
  });
  it('counts what other sources say, as the Sun filter does, and names it', () => {
    const h = plant({ common: 'Heuchera', sun_most: 'Part', sun_least: 'Shade', reported: { sun_most: 'Full', sun_least: 'Full' } });
    expect(reportedMatch(h, f({ sunRange: 'Full-Full' }))).toEqual(['sun']);
    expect(reportedPhrase(['sun'], f({ sunRange: 'Full-Part' }))).toBe('take part shade to full sun');
  });
});

describe('a bed\'s soil: clay', () => {
  const ok = plant({ common: 'Aster', clay_ok: true });
  const unrated = plant({ common: 'Oakleaf hydrangea' });
  const poor = plant({ common: 'Lavender', clay_ok: false });
  it('lists plants rated Clay OK, and those no source rates (below a divider: answer D); not one rated otherwise', () => {
    const r = rules({ soil: 'clay' });
    expect([ok, unrated, poor].map((p) => fits(p, r))).toEqual([true, true, false]);
    expect(bedFilter(r)).toMatchObject({ clayBed: true, clayOk: false });
  });
  it('marks those with no rating for the divider, in the list the picker draws', async () => {
    const plants = await import('../src/plants');
    plants.PLANTS.splice(0, plants.PLANTS.length, ok, unrated, poor);
    const out = withFilters(bedFilter(rules({ soil: 'clay' })), () => filteredPlants());
    expect(out.map((p) => p.common)).toEqual(['Aster', 'Oakleaf hydrangea']);
    expect([...noSoilRating]).toEqual(['Oakleaf hydrangea']);
    // (The person's own filters as they were after.)
    expect(plantFilter.clayBed).toBe(false);
    plants.PLANTS.splice(0, plants.PLANTS.length);
  });
  it('Not sure filters nothing', () => {
    expect([ok, unrated, poor].every((p) => fits(p, rules({ soil: 'unsure' })))).toBe(true);
    expect(bedChips(rules({ soil: 'unsure' }))).toEqual([]);
    expect(bedFilter(rules({ soil: 'unsure' }))).toMatchObject({ clayBed: false, soilBed: '' });
  });
  it('clay as loam and sandy (Jason, Nov 5): a plant NC State rates only for other soils is left out', () => {
    const loamOnly = plant({ common: 'Bluestem', soil_texture: ['loam', 'sand'] });
    expect(fits(loamOnly, rules({ soil: 'clay' }))).toBe(false);
    expect(fits(plant({ common: 'Redbud', soil_texture: ['clay', 'loam'] }), rules({ soil: 'clay' }))).toBe(true);
    expect(fits(plant({ common: 'Lavender', clay_ok: false, soil_texture: ['clay'] }), rules({ soil: 'clay' }))).toBe(false);
    expect(bedFilter(rules({ soil: 'clay' })).soilBed).toBe('');
  });
  it('clay: Clay OK by the earlier list alone gives way to NC State\'s soil textures; Clay OK from a source stands', () => {
    const META = { sources: { compendium: { title: 'First compendium', trust: 'unverified' }, ncsu: { title: 'NC State', trust: 'reference' } } };
    const earlier = { src: ['compendium'] }, sourced = { src: ['ncsu'] };
    const byEarlier = plant({ common: 'Coneflower', clay_ok: true, soil_texture: ['loam'], prov: { clay_ok: earlier } } as Partial<Plant>);
    const bySource = plant({ common: 'Aster', clay_ok: true, soil_texture: ['loam'], prov: { clay_ok: sourced } } as Partial<Plant>);
    const noTexture = plant({ common: 'Phlox', clay_ok: true, prov: { clay_ok: earlier } } as Partial<Plant>);
    expect([byEarlier, bySource, noTexture].map((p) => clayRating(p, META.sources as never))).toEqual(['no', 'yes', 'yes']);
    expect(clayRating(plant({ common: 'Hosta' }))).toBe('none');
    expect(clayRating(plant({ common: 'Swamp milkweed', soil_texture: ['clay'] }))).toBe('yes');
  });
});

describe('a bed\'s soil: loam and sandy, by the soil textures NC State rates (Jason, Nov 4)', () => {
  const all = plant({ common: 'Redbud', soil_texture: ['clay', 'loam', 'sand'] });
  const loamy = plant({ common: 'Bee balm', soil_texture: ['loam'] });
  const sandy = plant({ common: 'Prickly pear', soil_texture: ['sand'] });
  const clayOnly = plant({ common: 'Swamp milkweed', soil_texture: ['clay'], clay_ok: true });
  const unrated = plant({ common: 'Oakleaf hydrangea' });
  const four = [all, loamy, sandy, clayOnly, unrated];
  const pass = (soil: 'loam' | 'sand') => four.filter((p) => fits(p, rules({ soil }))).map((p) => p.common);
  it('lists plants rated for that texture, and those rated for none; not one rated only for others', () => {
    expect(pass('loam')).toEqual(['Redbud', 'Bee balm', 'Oakleaf hydrangea']);
    expect(pass('sand')).toEqual(['Redbud', 'Prickly pear', 'Oakleaf hydrangea']);
    expect(bedFilter(rules({ soil: 'loam' }))).toMatchObject({ soilBed: 'loam', clayBed: false, clayOk: false });
    expect(bedFilter(rules({ soil: 'sand' }))).toMatchObject({ soilBed: 'sand', clayBed: false });
  });
  it('marks those rated for no texture for the divider, in the list the picker draws, and puts the filters back', async () => {
    const plants = await import('../src/plants');
    plants.PLANTS.splice(0, plants.PLANTS.length, ...four);
    const out = withFilters(bedFilter(rules({ soil: 'sand' })), () => filteredPlants());
    expect(out.map((p) => p.common)).toEqual(['Oakleaf hydrangea', 'Prickly pear', 'Redbud']);
    expect([...noSoilRating]).toEqual(['Oakleaf hydrangea']);
    expect(plantFilter.soilBed).toBe('');
    // (Anywhere again: no divider.)
    filteredPlants();
    expect(noSoilRating.size).toBe(0);
    plants.PLANTS.splice(0, plants.PLANTS.length);
  });
  it('a soil taken off for now (its ×) filters nothing', () => {
    expect(bedFilter(rules({ soil: 'loam' }), new Set(['soil']))).toMatchObject({ soilBed: '', clayBed: false });
    expect(four.every((p) => plantMatches(p, f(bedFilter(rules({ soil: 'sand' }), new Set(['soil'])))))).toBe(true);
  });
  it('says each in a chip, and by name where it hid a search\'s plants', () => {
    expect(bedChips(rules({ soil: 'loam' })).map((c) => c.text)).toEqual(['Loam OK']);
    expect(bedChips(rules({ soil: 'sand', moisture: 'dry' })).map((c) => c.text)).toEqual(['Sandy soil OK', 'Drought tolerant']);
    expect(partName('soil', rules({ soil: 'loam' }))).toBe('Loam');
    expect(partName('soil', rules({ soil: 'sand' }))).toBe('Sandy soil');
    expect(partName('soil', rules({ soil: 'clay' }))).toBe('Clay');
    expect(partName('moisture', rules({ soil: 'sand' }))).toBe('Moisture');
  });
});

describe('a bed\'s soil: rocky, by NC State\'s shallow rocky soil (Jason, Nov 5)', () => {
  const glade = plant({ common: 'Little bluestem', soil_texture: ['loam', 'sand'], soil_also: ['rocky'] });
  const fern = plant({ common: 'Walking fern', soil_also: ['rocky'] }); // (shallow rocky only, no texture)
  const loamy = plant({ common: 'Bee balm', soil_texture: ['loam'], soil_also: ['organic'] });
  const organicOnly = plant({ common: 'Pawpaw', soil_also: ['organic'] });
  const unrated = plant({ common: 'Oakleaf hydrangea', clay_ok: true });
  const five = [glade, fern, loamy, organicOnly, unrated];
  it('lists plants rated for shallow rocky soil, and those rated for no texture; not one rated only for others', () => {
    expect(five.filter((p) => fits(p, rules({ soil: 'rocky' }))).map((p) => p.common)).toEqual(['Little bluestem', 'Walking fern', 'Pawpaw', 'Oakleaf hydrangea']);
    expect(bedFilter(rules({ soil: 'rocky' }))).toMatchObject({ soilBed: 'rocky', clayBed: false, clayOk: false });
    expect(five.map((p) => soilRating(p, 'rocky'))).toEqual(['yes', 'yes', 'no', 'none', 'none']);
    // (Loam and sandy as before: shallow rocky soil isn't a texture, so a plant rated only for it has none.)
    expect(soilRating(fern, 'loam')).toBe('none');
    expect(soilRating(glade, 'sand')).toBe('yes');
  });
  it('marks those rated for no texture for the divider, organic matter alone included', async () => {
    const plants = await import('../src/plants');
    plants.PLANTS.splice(0, plants.PLANTS.length, ...five);
    const out = withFilters(bedFilter(rules({ soil: 'rocky' })), () => filteredPlants());
    expect(out.map((p) => p.common)).toEqual(['Little bluestem', 'Oakleaf hydrangea', 'Pawpaw', 'Walking fern']);
    expect([...noSoilRating].sort()).toEqual(['Oakleaf hydrangea', 'Pawpaw']);
    expect(plantFilter.soilBed).toBe('');
    plants.PLANTS.splice(0, plants.PLANTS.length);
  });
  it('says it in a chip and by name; taken off for now, filters nothing; a later word for soil, nothing either', () => {
    expect(bedChips(rules({ soil: 'rocky' })).map((c) => c.text)).toEqual(['Rocky soil OK']);
    expect(partName('soil', rules({ soil: 'rocky' }))).toBe('Rocky soil');
    expect(bedFilter(rules({ soil: 'rocky' }), new Set(['soil']))).toMatchObject({ soilBed: '', clayBed: false });
    const bed = rect('b', 0, 0, 4, 4, { role: 'bed', conditions: { soil: 'rocky' } } as Partial<Shape>);
    expect(bedRules(bed, null).soil).toBe('rocky');
    // (How a version before this one read it: a word it doesn't know, which filters nothing. The same here for one
    // a later version might add.)
    const later = rect('l', 0, 0, 4, 4, { role: 'bed', conditions: { soil: 'peaty' } } as Partial<Shape>);
    expect(bedRules(later, null).soil).toBeNull();
    expect(bedFilter(bedRules(later, null))).toMatchObject({ soilBed: '', clayBed: false });
  });
});

describe('a bed\'s moisture, and drip irrigated (answers 6 and 7)', () => {
  const dry = plant({ common: 'Yucca', water: 'Low', tolerates: ['drought'] });
  const low = plant({ common: 'Aster', water: 'Low' });
  const moderate = plant({ common: 'Phlox', water: 'Moderate' });
  const high = plant({ common: 'Cardinal flower', water: 'High' });
  const wetland = plant({ common: 'Pickerelweed', water: 'Wetland', wet_feet: true });
  const all = [dry, low, moderate, high, wetland];
  const pass = (r: BedRules) => all.filter((p) => fits(p, r)).map((p) => p.common);
  it('dry: drought tolerant', () => {
    expect(pass(rules({ moisture: 'dry' }))).toEqual(['Yucca']);
  });
  it('average: water needs low or moderate, so High and Wetland are hidden', () => {
    expect(pass(rules({ moisture: 'average' }))).toEqual(['Yucca', 'Aster', 'Phlox']);
    expect(bedFilter(rules({ moisture: 'average' })).water).toBe('Low,Moderate');
  });
  it('wet: takes wet soil', () => {
    expect(pass(rules({ moisture: 'wet' }))).toEqual(['Pickerelweed']);
  });
  it('drip lifts only the limits that keep out thirstier plants: dry or average with drip, any need; wet with drip, as wet', () => {
    expect(pass(rules({ moisture: 'dry', drip: true }))).toEqual(all.map((p) => p.common));
    expect(pass(rules({ moisture: 'average', drip: true }))).toEqual(all.map((p) => p.common));
    expect(pass(rules({ moisture: 'wet', drip: true }))).toEqual(['Pickerelweed']);
  });
  it('Not sure, or nothing answered, filters nothing', () => {
    expect(pass(rules({ moisture: 'unsure' }))).toEqual(all.map((p) => p.common));
    expect(pass(rules())).toEqual(all.map((p) => p.common));
  });
  it('the chips say each in the filters\' words', () => {
    expect(bedChips(rules({ moisture: 'dry' })).map((c) => c.text)).toEqual(['Drought tolerant']);
    expect(bedChips(rules({ moisture: 'average' })).map((c) => c.text)).toEqual(['Water needs: low or moderate']);
    expect(bedChips(rules({ moisture: 'wet', drip: true })).map((c) => c.text)).toEqual(['Takes wet soil']);
    expect(bedChips(rules({ moisture: 'average', drip: true }))).toEqual([]);
    expect(bedChips(rules({ sun: ['Full', 'Part'], soil: 'clay', moisture: 'average' })).map((c) => c.text))
      .toEqual(['Takes part shade to full sun', 'Clay OK', 'Water needs: low or moderate']);
  });
});

describe('a bed\'s layer over the person\'s filters', () => {
  it('sets aside the person\'s own Sun, Water needs, Drought tolerant, Takes wet soil and Clay OK while it\'s planted for', () => {
    const r = rules({ sun: ['Full', 'Part'] });
    const mine = f({ sun: 'Shade', water: 'High', drought: true, wetFeet: true, clayOk: true, hardyHere: true, form: 'Shrub' });
    const layered = { ...mine, ...bedFilter(r) };
    expect(layered).toMatchObject({ sun: '', water: '', drought: false, wetFeet: false, clayOk: false, sunRange: 'Full-Part' });
    // (The rest add to the bed's.)
    expect(layered).toMatchObject({ hardyHere: true, form: 'Shrub' });
  });
  it('a part taken off (its × in the picker) filters nothing', () => {
    const r = rules({ sun: ['Full', 'Part'], soil: 'clay', moisture: 'dry' });
    expect(bedFilter(r, new Set(['soil', 'moisture']))).toMatchObject({ sunRange: 'Full-Part', clayBed: false, soilBed: '', drought: false });
    expect(bedFilter(r, new Set(['sun']))).toMatchObject({ sunRange: '', clayBed: true, drought: true });
  });
  it('puts the filters back as they were after, even when what it ran throws', () => {
    plantFilter.sun = 'Part';
    expect(() => withFilters({ sun: '', sunRange: 'Full-Full' }, () => { throw new Error('x'); })).toThrow();
    expect(plantFilter.sun).toBe('Part');
    expect(plantFilter.sunRange).toBe('');
    plantFilter.sun = '';
  });
  it('water needs take "any of"', () => {
    expect(waterWanted('Low,Moderate')).toEqual(['Low', 'Moderate']);
    expect(plantMatches(plant({ water: 'Moderate' }), f({ water: 'Low,Moderate' }))).toBe(true);
    expect(plantMatches(plant({ water: 'High' }), f({ water: 'Low,Moderate' }))).toBe(false);
    expect(plantMatches(plant({ water: 'High' }), f({ water: 'High' }))).toBe(true);
    expect(reportedPhrase(['water'], f({ water: 'Low,Moderate' }))).toBe('fit “Water: Low or Moderate”');
  });
  it('the count says how many fit the bed', () => {
    expect(pickerCount(1147, 3745, 0, 0, 'here', 'Front bed')).toBe('1,147 of 3,745 plants fit Front bed');
    expect(pickerCount(3745, 3745, 0, 0, 'here', 'Front bed')).toBe('All 3,745 plants fit Front bed');
  });
});

describe('the sun across a bed, from the sun areas over it (worked out, never stored)', () => {
  const bed = rect('bed', 0, 0, 12, 6, { role: 'bed', label: 'Front bed' });
  const yard = rect('yard', -10, -2, 40, 22, { role: 'shade', sun: sun(7) });
  const oak = { ...base, id: 'oak', type: 'circle', x: 2, y: 7, radius: 5, role: 'shade', sun: sun(3.5) } as Shape;
  it('reads it at spots across the bed: 3.5 to 7 h, part shade to full sun, both areas named, all of it covered', () => {
    const s = sunOverBed(bed, [yard, oak, bed])!;
    expect([s.minH, s.maxH, s.most, s.least]).toEqual([3.5, 7, 'Full', 'Part']);
    expect(s.areas.map((a) => [a.area.id, a.hours])).toEqual([['oak', 3.5], ['yard', 7]]);
    expect(s.covered).toBe(1);
    expect(s.bare).toBeNull();
    expect(bedRules(bed, s).sun).toEqual(['Full', 'Part']);
  });
  it('filtered light reads as part shade at best', () => {
    expect(sunOverBed(bed, [rect('y', -1, -1, 20, 20, { role: 'shade', sun: sun(8, { dappled: true }) })])!.most).toBe('Part');
  });
  it('says where part of the bed has none recorded', () => {
    const right = rect('r', 6, -1, 10, 10, { role: 'shade', sun: sun(8) });
    const s = sunOverBed(bed, [right])!;
    expect(s.covered).toBeCloseTo(0.5, 1);
    expect(s.bare).toBe('left');
    expect([s.most, s.least]).toEqual(['Full', 'Full']);
  });
  it('none where no sun area touches the bed: then it\'s asked, and the answer is the bed\'s sun', () => {
    expect(sunOverBed(bed, [rect('far', 40, 40, 5, 5, { role: 'shade', sun: sun(2) })])).toBeNull();
    // (A sun area with no sun recorded is no sun area yet.)
    expect(sunOverBed(bed, [rect('blank', -1, -1, 20, 20, { role: 'shade' })])).toBeNull();
    const answered = { ...bed, conditions: { sun: { most: 'Full', least: 'Part' }, soil: 'clay', moisture: 'average', drip: true } } as Shape;
    expect(bedRules(answered, null)).toEqual({ sun: ['Full', 'Part'], soil: 'clay', moisture: 'average', drip: true });
    // (Asked and answered the wrong way round: read sunniest first. Not sure, and a later version's word: nothing.)
    expect(bedRules({ ...bed, conditions: { sun: { most: 'Shade', least: 'Part' } } } as Shape, null).sun).toEqual(['Part', 'Shade']);
    expect(bedRules({ ...bed, conditions: { sun: 'unsure', soil: 'peaty', moisture: 'boggy' } } as Shape, null)).toEqual({ sun: null, soil: null, moisture: null, drip: false });
    // (Worked out wins over answered, where a sun area now covers it.)
    expect(bedRules(answered, sunOverBed(bed, [yard]))!.sun).toEqual(['Full', 'Full']);
  });
  it('reads a turned or round bed by its shape, not its box', () => {
    const round = { ...base, id: 'round', type: 'circle', x: 0, y: 0, radius: 3, role: 'bed' } as Shape;
    expect(spotsIn(round).every((p) => Math.hypot(p.x, p.y) <= 3)).toBe(true);
    expect(spotsIn(round).length).toBeGreaterThan(150);
  });
});

describe('the beds to plant for', () => {
  const front = rect('front', 0, 0, 12, 6, { role: 'bed', label: 'Front bed' });
  const back = rect('back', -2, -14, 16, 8, { role: 'bed' });
  const gone = rect('gone', 40, 0, 4, 4, { role: 'bed', status: 'gone' });
  const lawn = rect('lawn', -20, -20, 80, 80, { role: 'lawn' });
  it('are the plan\'s beds, not one gone, each by name or its size', () => {
    expect(bedsToPlant([lawn, front, back, gone]).map(bedName)).toEqual(['Front bed', 'Bed, 16 × 8 ft']);
    expect(bedName({ ...base, id: 'c', type: 'circle', x: 0, y: 0, radius: 3, role: 'bed' } as Shape)).toBe('Bed, 6 ft across');
  });
  it('a tap on the plan finds the smallest bed there', () => {
    const inner = rect('inner', 1, 1, 3, 3, { role: 'bed' });
    expect(bedAt({ x: 2, y: 2 }, [front, inner, lawn])?.id).toBe('inner');
    expect(bedAt({ x: 10, y: 2 }, [front, inner, lawn])?.id).toBe('front');
    expect(bedAt({ x: 30, y: 30 }, [front, inner, lawn])).toBeNull();
  });
});
