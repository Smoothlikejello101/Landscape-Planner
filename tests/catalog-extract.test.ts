import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error (plain JavaScript build script)
import { arkatlasStatus, feetRange, mnwildFields, monthRange, ncsuFields, usdaFields } from '../scripts/catalog/extract.mjs';
// @ts-expect-error (plain JavaScript build script)
import { decideForm, decideZoneMin, mapPlant, mnLight, ncsuSun, ncsuZones, usdaLeastSun, zoneFromTemp } from '../scripts/catalog/map.mjs';

const fixture = (f: string) => readFileSync(`tests/fixtures/catalog/${f}`, 'utf8');

describe('reading sources', () => {
  it('reads an NC State page: fields, dimensions, and a host count without the prose', () => {
    const f = ncsuFields(fixture('ncsu-cercis.html'));
    expect(f.Genus).toEqual(['Cercis']);
    expect(f['Plant Type']).toEqual(['Edible', 'Native Plant', 'Perennial', 'Shrub', 'Tree']);
    expect(f.Height).toEqual(['20 ft. 0 in. - 30 ft. 0 in.']);
    expect(f.Width).toEqual(['25 ft. 0 in. - 35 ft. 0 in.']);
    expect(f['USDA Plant Hardiness Zone']).toEqual(['4a, 4b, 5a, 5b, 6a, 6b, 7a, 7b, 8a, 8b, 9a, 9b']);
    expect(f['Larval host for']).toEqual(['12 Lepidoptera species']);
    expect(f['Wildlife Value']).toBeUndefined();
    expect(f['Design Feature']).toContain('Understory Tree');
    const o = ncsuFields(fixture('ncsu-nerium.html'));
    expect(o['Poison Severity']).toEqual(['High']);
    expect(o['Causes Contact Dermatitis']).toEqual(['Yes']);
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
    expect(mnLight(m.Habitat[0])).toEqual({ most: 'Full', least: 'Part' });
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
});

describe('mapping to catalog facts', () => {
  it('turns temperatures and NC State lists into zones, the cautious way', () => {
    expect(zoneFromTemp(-28)).toBe(5);
    expect(zoneFromTemp(-30)).toBe(4);
    expect(zoneFromTemp(-60)).toBe(1);
    expect(zoneFromTemp(100)).toBe(13);
    expect(ncsuZones('4a, 4b, 5a')).toMatchObject({ bottom: -30, zone_min: 4, zone_max: 5 });
    expect(ncsuZones('4b, 5a, 9a')).toMatchObject({ bottom: -25, zone_min: 5, zone_max: 9 });
  });
  it('decides zone_min by the doc: agree within 5 °F, else the warmer one, cited first', () => {
    expect(decideZoneMin('4a, 4b, 5a', -28)).toEqual({ v: 4, src: ['ncsu', 'usda'], check: 'agree' });
    expect(decideZoneMin('4a, 4b', -20)).toEqual({ v: 5, src: ['usda', 'ncsu'], check: 'disputed' });
    expect(decideZoneMin('6a, 6b', -40)).toEqual({ v: 6, src: ['ncsu', 'usda'], check: 'disputed' });
    expect(decideZoneMin(null, -28)).toEqual({ v: 5, src: ['usda'], check: 'single' });
    expect(decideZoneMin(undefined, undefined)).toBeNull();
  });
  it('reads sun from each source', () => {
    expect(ncsuSun(['Full sun (6 or more hours of direct sunlight a day)', 'Partial Shade (Direct sunlight only part of the day, 2-6 hours)'])).toEqual({ most: 'Full', least: 'Part' });
    expect(ncsuSun(['Deep shade (Less than 2 hours to no direct sunlight)'])).toEqual({ most: 'Shade', least: 'Shade' });
    expect(usdaLeastSun('Low')).toBe('Full');
    expect(usdaLeastSun('Intermediate')).toBe('Part');
    expect(usdaLeastSun('High')).toBe('Shade');
    expect(usdaLeastSun('')).toBeNull();
  });
  it('decides form, and a tree\'s kind only from NC State\'s design features', () => {
    const cercis = ncsuFields(fixture('ncsu-cercis.html'));
    // NC State says Shrub and Tree, as does USDA: left for the review.
    expect(decideForm(cercis, { 'Growth habit': ['Shrub', 'Tree'] })).toMatchObject({ v: null, check: 'disputed' });
    expect(decideForm({ 'Plant Type': ['Tree'], 'Design Feature': ['Shade Tree'] }, { 'Growth habit': ['Tree'] })).toMatchObject({ v: 'Tree (canopy)', check: 'agree' });
    expect(decideForm({ 'Plant Type': ['Tree'], 'Design Feature': ['Understory Tree', 'Shade Tree'] }, {})).toMatchObject({ v: null });
    expect(decideForm({ 'Plant Type': ['Fern'] }, { 'Growth habit': ['Forb/herb'], Duration: ['Perennial'] })).toMatchObject({ v: 'Fern', check: 'single' });
    expect(decideForm({}, { 'Growth habit': ['Graminoid'] })).toMatchObject({ v: 'Grass/Sedge', src: ['usda'] });
  });
  it('maps a plant: toxicity errs toward harm, missing facts stay null', () => {
    const f = mapPlant({ ncsu: ncsuFields(fixture('ncsu-nerium.html')), usda: {} });
    expect(f.tox_people.v).toEqual(['major', 'dermatitis']);
    expect(f.tox_pets).toBeNull();
    expect(f.deer).toMatchObject({ v: 'Resistant' });
    expect(f.edible).toBeNull(); // (not "false": it's simply not listed)
    expect(mapPlant({ ncsu: { 'Poison Severity': ['Medium'] } }).tox_people.v).toEqual(['major']);
    expect(mapPlant({ ncsu: { 'Poison Severity': ['Low'] } }).tox_people.v).toEqual(['minor']);
    const c = mapPlant({ ncsu: ncsuFields(fixture('ncsu-cercis.html')) });
    expect(c.height.v).toEqual({ min: 20, max: 30, med: 25 });
    expect(c.host.v).toBe('12 Lepidoptera species');
  });
});
