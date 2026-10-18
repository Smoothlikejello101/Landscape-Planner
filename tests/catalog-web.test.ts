import { describe, expect, it } from 'vitest';
// @ts-expect-error (plain JavaScript build script)
import { aboutPlant, copyKey, pageText, siteKind, sizeIn, termsLinks, termsVerdict, webClaims, webFields } from '../scripts/catalog/web.mjs';
// @ts-expect-error (plain JavaScript build script)
import { combine } from '../scripts/catalog/claims.mjs';

// Pages here are made up, in our own words: spec lines laid out the ways shops and gardens lay them out.
const shop = (body: string) => `<html><body><h1>Sweetspire</h1><p>Itea virginica 'Little Henry'</p>${body}<button>Add to cart</button><span>$24.99</span></body></html>`;

describe('which sites the audit reads from search results', () => {
  it('sorts sites into authorities, breeders, nurseries and blogs, and skips the closed ones', () => {
    expect(siteKind('https://extension.umn.edu/plants/x')).toBe('authority');
    expect(siteKind('https://www.mtcubacenter.org/plants/x')).toBe('authority');
    expect(siteKind('https://www.provenwinners.com/plants/x')).toBe('breeder');
    expect(siteKind('https://shop.example.com/p/x', shop(''))).toBe('nursery');
    expect(siteKind('https://blog.example.com/x', '<p>My garden this spring</p>')).toBe('blog');
    for (const closed of ['https://www.missouribotanicalgarden.org/x', 'https://plantfinder.mobot.org/x', 'https://www.wildflower.org/x', 'https://en.wikipedia.org/wiki/X', 'https://garden.org/plants/x', 'not a url']) {
      expect(siteKind(closed)).toBe('skip');
    }
  });
});

describe('reading spec lines', () => {
  it('reads labels with their values on the same line or the next', () => {
    const t = pageText(shop(`
      <ul><li>Hardiness Zones: 5-9</li><li>Mature Height: 18-24"</li><li>Mature Width: 2 to 3 ft</li>
      <li>Light: Full sun to part shade</li><li>Bloom Time: Late spring</li><li>Flower Color: White</li></ul>
      <dl><dt>Deer Resistant</dt><dd>Yes</dd></dl>`));
    expect(webFields(t)).toEqual({
      zones: { zone_min: 5, zone_max: 9.5 }, height: { min: 1.5, max: 2 }, width: { min: 2, max: 3 },
      sun: { most: 'Full', least: 'Part' }, bloomSeasons: ['spring'], flowerColor: ['White'], deer: 'Resistant',
    });
    const two = pageText('<table><tr><th>USDA Zone</th><td>4a to 8b</td></tr><tr><th>Height</th><td>6 feet</td></tr><tr><th>Sun Exposure</th><td>Shade</td></tr></table>');
    expect(webFields(two)).toEqual({ zones: { zone_min: 4, zone_max: 8.5 }, height: { min: 6, max: 6 }, sun: { most: 'Shade', least: 'Shade' } });
  });
  it('reads only labeled lines, not prose that mentions a zone', () => {
    expect(webFields(pageText('<p>It does well for us here in zone 7, and grows about 3 feet tall.</p>'))).toEqual({});
  });
  it('leaves out lists of choices, conflicting repeats, empty labels and prose', () => {
    // A row of exposure icons, one lit by styling we can't see.
    expect(webFields('Exposure\nFull Shade\nPart Shade to Shade\nPart Sun to Sun')).toEqual({});
    // Related products, each with its own spec line.
    expect(webFields('Light: Part Sun\nSoil: Loamy\nLight: Full Sun')).toEqual({});
    expect(webFields('Light: Part Sun\nLight: Part Sun')).toEqual({ sun: { most: 'Part', least: 'Part' } });
    // A label with nothing filled in, followed by the next label.
    expect(webFields('Sun or Shade:\nCompanion Plants:\nSun to part sun.')).toEqual({});
    // A label whose "value" is a paragraph.
    expect(webFields('Mature Height: This species typically grows to a height of about 25-35 feet with a crown that is wider than tall.')).toEqual({});
    // A sentence that starts with a label's word isn't a label.
    expect(webFields('Sun to part shade. Does well in many soils.')).toEqual({});
    // "sun" alone is a value; a half-zone list is a range.
    expect(webFields('Sun Exposure\nsun\nSoil Needs\nwell-drained')).toEqual({ sun: { most: 'Full', least: 'Full' } });
    expect(webFields('Hardiness Zones:\n5a , 5b , 6a , 9b\nWater Category:')).toEqual({ zones: { zone_min: 5, zone_max: 9.5 } });
    expect(webFields('sun - mostly shade')).toEqual({});
    // Hardiness written with words around it.
    expect(webFields('USDA Hardiness Zone: 4 to 9')).toEqual({ zones: { zone_min: 4, zone_max: 9.5 } });
  });
  it('treats a page that draws on a source closed to us as that source', () => {
    const p = { species: 'Cercis canadensis', cultivar: null };
    expect(webClaims('https://shop.example.com/x', '<p>Cercis canadensis</p><p>Zones: 4-9</p><p>(Missouri Botanical Garden)</p>', p)).toEqual([]);
    expect(webClaims('https://shop.example.com/x', '<p>Cercis canadensis</p><p>Zones: 4-9</p>', p)).toHaveLength(2);
  });
  it('turns sizes into feet', () => {
    expect(sizeIn('36-48 in')).toEqual({ min: 3, max: 4 });
    expect(sizeIn("3' to 5'")).toEqual({ min: 3, max: 5 });
    expect(sizeIn('1 1/2 ft')).toEqual({ min: 1.5, max: 1.5 });
    expect(sizeIn('tall')).toBeNull();
  });
  it('checks a page is about the plant', () => {
    expect(aboutPlant('Itea virginica ‘Little Henry’', { species: 'Itea virginica', cultivar: 'Little Henry' })).toBe(true);
    expect(aboutPlant('Itea virginica', { species: 'Itea virginica', cultivar: 'Little Henry' })).toBe(false);
    expect(aboutPlant('Cercis canadensis, eastern redbud', { species: 'Cercis canadensis', cultivar: null })).toBe(true);
  });
});

describe('web claims', () => {
  const plant = { species: 'Itea virginica', cultivar: 'Little Henry' };
  const para = '<p>' + 'A compact sweetspire with arching white flower spikes in late spring and red fall color, made up for this test only. '.repeat(2) + '</p>';
  it('cite the page and its site, and mark copies of one text', () => {
    const a = webClaims('https://shop-a.example.com/itea', shop(`${para}<p>Zones: 5-9</p>`), plant);
    const b = webClaims('https://shop-b.example.com/itea', shop(`${para}<p>Zones: 5-9</p>`), plant);
    expect(a.map((c: { fact: string }) => c.fact)).toEqual(['zone_min', 'zone_max']);
    expect(a[0]).toMatchObject({ src: 'example.com', kind: 'nursery', url: 'https://shop-a.example.com/itea', cultivarPage: true });
    expect(a[0].group).toBe(b[0].group);
    expect(copyKey('<p>short</p>')).toBeNull();
    expect(webClaims('https://www.wildflower.org/x', shop('<p>Zones: 5-9</p>'), plant)).toEqual([]);
    expect(webClaims('https://shop.example.com/x', '<p>Zones: 5-9</p>', plant)).toEqual([]); // (not about this plant)
  });
  it('combine: nurseries alone are "likely" when most agree, a copy counts once, one site counts once', () => {
    const n = (src: string, v: number, group?: string) => ({ fact: 'zone_min', v, src, kind: 'nursery', group: group ?? src });
    expect(combine([n('a.com', 5), n('b.com', 5), n('c.com', 6.5)]).zone_min).toMatchObject({ v: 5, check: 'likely', src: ['a.com', 'b.com'] });
    expect(combine([n('a.com', 5), n('b.com', 7.5)]).zone_min).toMatchObject({ check: 'disputed' });
    expect(combine([n('a.com', 5, 'p:1'), n('b.com', 5, 'p:1')]).zone_min).toMatchObject({ check: 'reported', src: ['a.com'] });
    expect(combine([n('a.com', 5), n('a.com', 5, 'p:2')]).zone_min).toMatchObject({ check: 'reported' });
    // A breeder speaks first for its own cultivar; on a species it's one more nursery.
    const br = { fact: 'height', v: { min: 2, max: 3 }, src: 'breeder.com', kind: 'breeder', cultivarPage: true };
    const ns = { fact: 'height', v: { min: 5, max: 6 }, src: 'a.com', kind: 'nursery', cultivarPage: true };
    expect(combine([br, ns], { cultivar: true }).height).toMatchObject({ v: { min: 2, max: 3 }, check: 'reported', kind: 'breeder' });
    expect(combine([br, ns]).height).toMatchObject({ check: 'disputed', kind: 'nursery' });
    // Safety facts never come from the web.
    expect(combine([{ fact: 'tox_pets', v: ['nontoxic'], src: 'a.com', kind: 'nursery' }]).tox_pets).toBeNull();
  });
});

describe('reading a site\'s terms', () => {
  it('finds the terms page it links to, not glossaries or garden-conditions pages', () => {
    const home = '<a href="/glossary">Glossary of terms</a><a href="/collections/garden-conditions">Garden Conditions</a><a href="/pages/terms-of-service">Terms of Service</a><a href="/policies/privacy-policy">Privacy</a><a href="https://elsewhere.com/terms">Terms</a>';
    expect(termsLinks(home, 'https://www.shop.com/')).toEqual(['https://www.shop.com/pages/terms-of-service']);
  });
  it('reads a ban on bots, a ban on using the information, or neither', () => {
    expect(termsVerdict('Welcome to our store. You agree not to use any robot, spider or scraper to access the site.').verdict).toBe('bots');
    expect(termsVerdict('Content may not be used for commercial purposes without our prior written consent.').verdict).toBe('use');
    expect(termsVerdict('Orders ship within two days. Prices may change.').verdict).toBe('open');
  });
});
