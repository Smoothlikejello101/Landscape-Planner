import { describe, expect, it } from 'vitest';
// @ts-expect-error (plain JavaScript build script)
import { aboutPlant, asReported, copyKey, isUseTerms, looksLikeTerms, pageText, paragraphKey, siteKind, sizeIn, sourceOf, termsKey, termsLinks, termsPassages, termsVerdict, webClaims, webFields, webParagraphs } from '../scripts/catalog/web.mjs';
// @ts-expect-error (plain JavaScript build script)
import { combine } from '../scripts/catalog/claims.mjs';

// Pages here are made up, in our own words: spec lines laid out the ways shops and gardens lay them out.
const shop = (body: string, title = "Itea virginica 'Little Henry'") => `<html><head><title>${title} | A Shop</title></head><body><h1>${title}</h1>${body}<button>Add to cart</button><span>$24.99</span></body></html>`;

describe('which sites the audit reads from search results', () => {
  it('sorts sites into authorities, nurseries and blogs, and skips the closed ones', () => {
    expect(siteKind('https://extension.umn.edu/plants/x')).toBe('authority');
    expect(siteKind('https://www.mtcubacenter.org/plants/x')).toBe('authority');
    expect(siteKind('https://shop.example.com/p/x', shop(''))).toBe('nursery');
    expect(siteKind('https://www.provenwinners.com/plants/x', shop(''))).toBe('nursery'); // (breeders read as nurseries, for now)
    expect(siteKind('https://blog.example.com/x', '<p>My garden this spring</p>')).toBe('blog');
    expect(siteKind('https://blog.example.com/x', '<p>The pruners I use: $24.99. Plant a quantity of seeds. Ships to you free.</p>')).toBe('blog'); // (prices alone aren't a shop)
    expect(siteKind('https://shop.example.com/x', '<script type="application/ld+json">{"@type": "Product"}</script>')).toBe('nursery');
    expect(siteKind('https://www.uni.edu/~bob/plants.html')).toBe('blog');
    expect(siteKind('https://edis.ifas.ufl.edu/x')).toBe('authority');
    for (const closed of [
      'https://www.missouribotanicalgarden.org/x', 'https://plantfinder.mobot.org/x', 'https://www.wildflower.org/x', 'https://en.wikipedia.org/wiki/X',
      'https://garden.org/plants/x', 'https://web.archive.org/web/2024/https://calscape.org/x', 'https://trefle.io/x', 'https://archive.ph/abc',
      'https://plants.usda.gov/x', 'https://www.nrcs.usda.gov/x', 'https://content.ces.ncsu.edu/x', 'not a url',
    ]) expect(siteKind(closed), closed).toBe('skip');
  });
  it("counts one company's sites as one source", () => {
    expect(sourceOf('www.provenwinners.com')).toBe(sourceOf('provenwinnersdirect.com'));
    expect(sourceOf('shop.example.com')).toBe('example.com');
    // (Growers for a brand that are companies of their own count, and are credited, as themselves.)
    expect(sourceOf('www.waltersgardens.com')).toBe('waltersgardens.com');
    expect(sourceOf('www.spring-meadow.com')).toBe('spring-meadow.com');
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
    expect(webFields('Exposure\nFull Shade\nPart Shade to Shade\nPart Sun to Sun')).toEqual({}); // (icons, one lit)
    expect(webFields('Light: Part Sun\nSoil: Loamy\nLight: Full Sun')).toEqual({}); // (related products)
    expect(webFields('Light: Part Sun\nLight: Part Sun')).toEqual({ sun: { most: 'Part', least: 'Part' } });
    expect(webFields('Sun or Shade:\nCompanion Plants:\nSun to part sun.')).toEqual({});
    expect(webFields('Mature Height: This species typically grows to a height of about 25-35 feet with a crown that is wider than tall.')).toEqual({});
    expect(webFields('Light\nFull sun is best for good flowering.')).toEqual({}); // (a sentence under a bare label)
    expect(webFields('Sun to part shade. Does well in many soils.')).toEqual({});
    expect(webFields('Sun Exposure\nsun\nSoil Needs\nwell-drained')).toEqual({ sun: { most: 'Full', least: 'Full' } });
    expect(webFields('Hardiness Zones:\n5a , 5b , 6a , 9b\nWater Category:')).toEqual({ zones: { zone_min: 5, zone_max: 9.5 } });
    expect(webFields('sun - mostly shade')).toEqual({});
    expect(webFields('Sun Exposure\nPartial, Shade\nBloom Color')).toEqual({ sun: { most: 'Part', least: 'Shade' } });
    expect(webFields('USDA Hardiness Zone: 4 to 9')).toEqual({ zones: { zone_min: 4, zone_max: 9.5 } });
  });
  it("doesn't mistake temperatures, negations, pot sizes or two sizes for values", () => {
    expect(webFields('Hardiness: 5 to 10 °F')).toEqual({});
    expect(webFields('Hardiness: -20 to -10 F')).toEqual({});
    // A value with a qualifier isn't read: a miss is better than a wrong value.
    for (const v of ['Full sun (does not tolerate shade)', 'Not full sun', 'Shade intolerant', 'Shade tolerant', 'Prefers shade but tolerates sun', 'Full sun except in the South, where afternoon shade helps']) expect(webFields(`Light: ${v}`), v).toEqual({});
    expect(webFields('Flower Color: White; red stems')).toEqual({});
    expect(webFields('Bloom Time: Spring (fall foliage color)')).toEqual({});
    expect(webFields('Deer Resistant: Yes, but browsed when young')).toEqual({});
    expect(webFields('Light: Morning sun, afternoon shade')).toEqual({ sun: { most: 'Part', least: 'Part' } });
    expect(webFields('Light: Sun, part shade, shade')).toEqual({ sun: { most: 'Full', least: 'Shade' } });
    // A bare "Full" is full sun, as nurseries write it (it was read as "Part" alone: Fellabees, Windflower, Morning Sky).
    expect(webFields('Sun Exposure: Full to Partial')).toEqual({ sun: { most: 'Full', least: 'Part' } });
    expect(webFields('Sun: Full, Partial')).toEqual({ sun: { most: 'Full', least: 'Part' } });
    expect(webFields('Sun: Full – Part')).toEqual({ sun: { most: 'Full', least: 'Part' } });
    expect(webFields('Sun: Full – Shade')).toEqual({ sun: { most: 'Full', least: 'Shade' } });
    expect(webFields('Sun Exposure: Full')).toEqual({ sun: { most: 'Full', least: 'Full' } });
    // A leading bare "Sun" before part shade is full sun too, however it's joined (it was dropped: "Sun Part Shade" read
    // as part shade only, Blooming Advantage's icons); and "part-shade" with a hyphen is part shade, not shade.
    expect(webFields('Exposure\nSun Part Shade')).toEqual({ sun: { most: 'Full', least: 'Part' } });
    expect(webFields('Light: sun - partial shade')).toEqual({ sun: { most: 'Full', least: 'Part' } });
    expect(webFields('Light requirement\nSun/part-shade')).toEqual({ sun: { most: 'Full', least: 'Part' } });
    expect(webFields('Light: Full shade')).toEqual({ sun: { most: 'Shade', least: 'Shade' } });
    expect(webFields('Bloom Time: Summer; may rebloom')).toEqual({}); // (a qualifier: left out)
    expect(webFields('Bloom Time: Late spring to early summer')).toEqual({ bloomSeasons: ['spring', 'summer'] });
    expect(webFields('Height: 10 years: 6 ft; mature 20 ft')).toEqual({});
    expect(webFields('Height: 24 in. pot')).toEqual({});
  });
  it('turns sizes into feet', () => {
    expect(sizeIn('36-48 in')).toEqual({ min: 3, max: 4 });
    expect(sizeIn("3' to 5'")).toEqual({ min: 3, max: 5 });
    expect(sizeIn('6 in to 2 ft')).toEqual({ min: 0.5, max: 2 });
    expect(sizeIn('1 1/2 ft')).toEqual({ min: 1.5, max: 1.5 });
    expect(sizeIn('tall')).toBeNull();
    // A number may start at its decimal point (Sylvan Gardens' vinca, ".25 - .50'", read as 50 ft until Oct 29).
    expect(sizeIn(".25 - .50'")).toEqual({ min: 0.25, max: 0.5 });
    expect(sizeIn(".50 - 1.50'")).toEqual({ min: 0.5, max: 1.5 });
    expect(sizeIn('0.5-1 ft')).toEqual({ min: 0.5, max: 1 });
  });
  it('reads a line giving both sizes where no labeled line does, if the page has just one', () => {
    expect(webFields("2' tall x 1.5-2' wide, flowers in July-August/September.")).toEqual({ height: { min: 2, max: 2 }, width: { min: 1.5, max: 2 } });
    expect(webFields('3-4 ft. high by 2 ft. wide')).toEqual({ height: { min: 3, max: 4 }, width: { min: 2, max: 2 } });
    expect(webFields("2' tall x 2' wide\n4' tall x 3' wide")).toEqual({}); // (a list of plants)
    expect(webFields("Height: 3 ft\n2' tall x 2' wide")).toEqual({ height: { min: 3, max: 3 } }); // (the labeled line rules)
    expect(webFields('It grows to be about 2 feet tall and spreads to form a mat 3 feet wide over many years in rich soil.')).toEqual({}); // (prose)
  });
  it('checks a page is about the plant, not one beside it', () => {
    const henry = { species: 'Itea virginica', cultivar: 'Little Henry' };
    const page = (title: string, body: string): [string, string] => { const h = `<title>${title}</title><h1>${title}</h1><p>${body}</p>`; return [h, pageText(h)]; };
    expect(aboutPlant(...page('Itea virginica ‘Little Henry’', 'Itea virginica'), henry)).toBe(true);
    expect(aboutPlant(...page('Virginia sweetspire', 'Itea virginica; see also Little Henry.'), henry)).toBe(false); // (named only in passing)
    const redbud = { species: 'Cercis canadensis', cultivar: null, common: 'Eastern redbud' };
    expect(aboutPlant(...page('Eastern redbud', 'Cercis canadensis, eastern redbud'), redbud)).toBe(true);
    expect(aboutPlant(...page("Cercis canadensis 'Forest Pansy'", "Cercis canadensis 'Forest Pansy'"), redbud)).toBe(false); // (a cultivar's page)
    expect(aboutPlant(...page('Eastern redbud', "Cercis canadensis 'Forest Pansy' only"), redbud)).toBe(false);
    // Another plant's page that mentions this one; a cultivar or form with no marks; a page about several.
    expect(aboutPlant(...page('Black-eyed Susan', 'Rudbeckia hirta. Pairs well with Echinacea purpurea.'), { species: 'Echinacea purpurea', cultivar: null, common: 'Purple coneflower' })).toBe(false);
    expect(aboutPlant(...page('Forest Pansy Redbud', 'Cercis canadensis Forest Pansy'), { ...redbud, common: 'Redbud' })).toBe(false);
    expect(aboutPlant(...page('White redbud', 'Cercis canadensis alba'), redbud)).toBe(false);
    expect(aboutPlant(...page('Three coneflower species', 'Echinacea purpurea, Echinacea pallida'), { species: 'Echinacea purpurea', cultivar: null, common: 'Purple coneflower' })).toBe(false);
    expect(aboutPlant(...page('Eastern Redbud Tree | A Shop', 'Cercis canadensis'), redbud)).toBe(true);
    const magnus = { species: 'Echinacea purpurea', cultivar: 'Magnus', common: "Coneflower 'Magnus'" };
    expect(aboutPlant(...page("Echinacea 'Magnus' | A Shop", 'Echinacea purpurea'), magnus)).toBe(true);
    expect(aboutPlant(...page('Echinacea Magnus Superior', 'Echinacea purpurea'), magnus)).toBe(false);
    expect(aboutPlant(...page('Best coneflowers: Magnus, White Swan and more', 'Echinacea purpurea'), magnus)).toBe(false);
    // A cultivar name that is also part of another name.
    expect(aboutPlant(...page('Quercus alba, white oak', 'Quercus alba'), { species: 'Echinacea purpurea', cultivar: 'Alba' })).toBe(false);
    expect(aboutPlant(...page("Coneflower 'Henry's Choice'", "Echinacea purpurea, a host for Henry's Elfin"), { species: 'Echinacea purpurea', cultivar: 'Henry' })).toBe(false);
  });
});

describe('web claims', () => {
  const plant = { species: 'Itea virginica', cultivar: 'Little Henry' };
  const para = '<p>' + 'A compact sweetspire with arching white flower spikes in late spring and red fall color, made up for this test only. '.repeat(2) + '</p>';
  it('cite the page and its site, and mark copies of one text', () => {
    const a = webClaims('https://shop-a.example.com/products/itea', shop(`${para}<p>Zones: 5-9</p>`), plant);
    const b = webClaims('https://shop-b.example.net/products/itea', shop(`${para}<p>Zones: 5-9</p>`), plant);
    expect(a.map((c: { fact: string }) => c.fact)).toEqual(['zone_min', 'zone_max']);
    expect(a[0]).toMatchObject({ src: 'example.com', kind: 'nursery', url: 'https://shop-a.example.com/products/itea', cultivarPage: true });
    // A shop's page for the plant: by its address, or by product markup naming it. A blog with a shop for its books is a blog.
    expect(webClaims('https://x.example.org/itea', shop(`${para}<p>Zones: 5-9</p><script type="application/ld+json">{"@type": "Product", "name": "Itea virginica 'Little Henry'"}</script>`), plant)[0].kind).toBe('nursery');
    expect(webClaims('https://blog.example.org/2024/growing-itea', shop(`${para}<p>Zones: 5-9</p><script type="application/ld+json">{"@type": "Product", "name": "My garden book"}</script>`), plant)[0].kind).toBe('blog');
    expect(a[0].group).toBe(b[0].group);
    expect(copyKey('<p>short</p>')).toBeNull();
    expect(webClaims('https://www.wildflower.org/x', shop('<p>Zones: 5-9</p>'), plant)).toEqual([]);
    expect(webClaims('https://shop.example.com/x', shop('<p>Zones: 5-9</p>', 'Something else'), plant)).toEqual([]); // (not about this plant)
  });
  it('take no bloom season from a site south of the equator, where spring is in September; its colors still count', () => {
    const page = shop(`${para}<ul><li>Bloom Time: Late spring</li><li>Flower Color: White</li></ul>`);
    expect(webClaims('https://shop.example.com/itea', page, plant).map((c: { fact: string }) => c.fact)).toEqual(['bloom_season', 'flower_color']);
    expect(webClaims('https://www.botanicgardens.sa.gov.au/itea', page, plant).map((c: { fact: string }) => c.fact)).toEqual(['flower_color']);
    expect(webClaims('https://plants.example.co.nz/itea', page, plant).map((c: { fact: string }) => c.fact)).toEqual(['flower_color']);
  });
  it('treat a page that draws on a source closed to us as that source, credited in text or by a link', () => {
    const p = { species: 'Cercis canadensis', cultivar: null, common: 'Eastern redbud' };
    const page = (extra: string) => `<title>Eastern redbud</title><p>Cercis canadensis</p><p>Zones: 4-9</p>${extra}`;
    expect(webClaims('https://shop.example.com/x', page('<p>(Missouri Botanical Garden)</p>'), p)).toEqual([]);
    expect(webClaims('https://shop.example.com/x', page('<a href="https://www.missouribotanicalgarden.org/x">Source</a>'), p)).toEqual([]);
    expect(webClaims('https://shop.example.com/x', page('<p>Data: NPIN</p>'), p)).toEqual([]);
    expect(webClaims('https://shop.example.com/x', page('<p>Source: Calscape</p>'), p)).toEqual([]);
    // (A plant database sold to the sites that show it: GardenSoft, NetPS Plant Finder, Horticopia.)
    expect(webClaims('https://www.water.example.gov/x', page('<footer>© 2026 GardenSoft</footer>'), p)).toEqual([]);
    expect(webClaims('https://shop.example.com/x', page('<p>Plant information by NetPS Plant Finder</p>'), p)).toEqual([]);
    expect(webClaims('https://shop.example.com/x', page('<a href="https://www.gardensoftheblueridge.com/">Gardens of the Blue Ridge</a>'), p)).toHaveLength(2);
    expect(webClaims('https://shop.example.com/x', page(''), p)).toHaveLength(2);
  });
  it('combine: nurseries alone are "likely" when most agree, a copy counts once, one site counts once', () => {
    const n = (src: string, v: number, group?: string) => ({ fact: 'zone_min', v, src, kind: 'nursery', ...(group ? { group } : {}) });
    expect(combine([n('a.com', 5), n('b.com', 5), n('c.com', 6.5)]).zone_min).toMatchObject({ v: 5, check: 'likely', src: ['a.com', 'b.com'] });
    expect(combine([n('a.com', 5), n('b.com', 7.5)]).zone_min).toMatchObject({ v: 7.5, check: 'reported' }); // (even: the warmer cold limit)
    expect(combine([n('a.com', 5, 'p:1'), n('b.com', 5, 'p:1')]).zone_min).toMatchObject({ check: 'reported', src: ['a.com'] });
    expect(combine([n('a.com', 5), n('a.com', 5, 'p:2')]).zone_min).toMatchObject({ check: 'reported' });
    // Safety facts never come from the web.
    expect(combine([{ fact: 'tox_pets', v: ['nontoxic'], src: 'a.com', kind: 'nursery' }]).tox_pets).toBeNull();
  });
});

// A page's own paragraphs, read by prose.mjs's rules (2026-10-27). Written for these tests in the shapes nursery
// pages use; no page's own words.
describe("a page's description, read by rule", () => {
  const plant = { species: 'Itea virginica', cultivar: 'Little Henry', common: 'Virginia sweetspire' };
  const url = 'https://shop.example.com/products/itea';
  const facts = (body: string, opts = {}) => webClaims(url, shop(body), plant, opts).filter((c: { prose?: boolean; fact: string }) => c.prose || c.fact === 'foliage');
  it('reads its paragraphs for leaves in winter, deer, self-sowing and spreading, citing the sentence', () => {
    const got = facts(`<p>Little Henry is a compact deciduous shrub grown for its white summer spikes.</p>
      <p>It spreads slowly by underground suckers to form a low colony. Deer seldom bother it.</p>`);
    expect(got.map((c: { fact: string; v: unknown }) => [c.fact, c.v])).toEqual([['foliage', 'deciduous'], ['deer', 'Resistant'], ['habit', 'Suckering (slow)']]);
    expect(got[1]).toMatchObject({ src: 'example.com', kind: 'nursery', prose: true, says: 'Deer seldom bother it.' });
  });
  it('takes a labeled "Evergreen or Deciduous" as the page\'s field, not as prose', () => {
    const got = facts('<p>Deer Resistant: Yes Attractive to Bees: Yes Good Under Oaks: No Evergreen or Deciduous: Deciduous</p>');
    expect(got.find((c: { fact: string }) => c.fact === 'foliage')).toMatchObject({ v: 'deciduous' });
    expect(got.find((c: { fact: string }) => c.fact === 'foliage').prose).toBeUndefined();
  });
  it('leaves its menus, footer and the site\'s repeated paragraphs out; its spec line\'s deer comes first', () => {
    expect(facts('<footer><p>All of our shrubs are deer resistant and ship in spring.</p></footer><p>Zones: 5-9</p>')).toEqual([]);
    const blurb = "<p>Weigela 'Red Prince' is a deciduous shrub with red flowers that hummingbirds love.</p>";
    expect(facts(blurb)).toHaveLength(0); // (another plant, named as the subject)
    const said = '<p>This shrub is evergreen in mild winters and deciduous elsewhere.</p>';
    expect(facts(said, { boilerplate: new Set([paragraphKey('This shrub is evergreen in mild winters and deciduous elsewhere.')]) })).toEqual([]);
    expect(webClaims(url, shop('<ul><li>Deer Resistant: Yes</li></ul><p>Young plants may be browsed by deer.</p>'), plant).filter((c: { fact: string }) => c.fact === 'deer')).toEqual([expect.objectContaining({ v: 'Resistant' })]);
    expect(webParagraphs('<nav><p>Shop all shrubs and trees for every garden</p></nav><p>short</p><p>A paragraph long enough to be read as the page\'s own text.</p>')).toEqual(["A paragraph long enough to be read as the page's own text."]);
    // (Readers' comments aren't the page's.)
    expect(webParagraphs('<p>The page\'s own paragraph about its plant, long enough.</p><div id="comments" class="comments-area"><p>I love plants that self-seed, mine seeds everywhere!</p></div>')).toEqual(["The page's own paragraph about its plant, long enough."]);
  });
});

describe("reading a site's terms", () => {
  it('finds the terms pages it links to, not glossaries or garden-conditions pages', () => {
    const home = '<a href="/glossary">Glossary of terms</a><a href="/collections/garden-conditions">Garden Conditions</a><a href="/pages/terms-of-service">Terms of Service</a>'
      + '<a href="/policies/privacy-policy">Privacy</a><a href="http://www.shop.com/legal#use">Privacy &amp; Terms</a><a href="https://parent-co.com/terms">Terms of Use</a><a href="https://elsewhere.com/x">Shop</a>';
    expect(termsLinks(home, 'https://www.shop.com/')).toEqual(['https://www.shop.com/pages/terms-of-service', 'https://parent-co.com/terms', 'https://www.shop.com/legal']); // (terms pages first)
  });
  it('tells a terms page from a home page or a "not found" served at a guessed address', () => {
    expect(looksLikeTerms('<title>Terms of Service</title><p>These terms…</p>')).toBe(true);
    expect(looksLikeTerms('<title>A Shop</title><p>Shop our plants</p>')).toBe(false);
    // Terms of sale or shipping aren't the terms of use: the usual addresses are tried as well.
    expect(isUseTerms('<title>Terms of Service</title><p>These terms…</p>')).toBe(true);
    expect(isUseTerms('<title>Shipping policy</title><p>We ship Monday to Wednesday.</p>')).toBe(false);
    expect(isUseTerms('<title>Terms of Sale</title><p>All plants are guaranteed…</p>')).toBe(false);
    // Judged by its title: sale terms that mention "our Terms of Use" aren't them.
    expect(isUseTerms('<title>Terms of Sale</title><p>These terms, together with our Terms of Use, govern your order.</p>')).toBe(false);
    expect(isUseTerms('<title>Shipping</title><p>We ship weekly.</p><footer><a href="/tos">Terms of Service</a></footer>')).toBe(false);
  });
  it('keeps the terms pages that matter: the owner\'s terms of use first, never a platform\'s, at most six', () => {
    const home = '<a href="https://policies.google.com/terms">Terms</a><a href="/pages/shipping-terms">Shipping Terms</a><a href="/pages/terms-of-sale">Terms of Sale</a>'
      + '<a href=/pages/terms-of-use>Terms of Use</a><a href="/x" aria-label="Legal notices"><svg></svg></a>';
    const links = termsLinks(home, 'https://www.shop.com/');
    expect(links[0]).toBe('https://www.shop.com/pages/terms-of-use');
    expect(links).toContain('https://www.shop.com/x');
    expect(links).not.toContain('https://policies.google.com/terms');
    // Policies, licence and image-use pages are read too; a privacy policy alone isn't.
    const more = termsLinks('<a href="/policies">Policies</a><a href="/licence">Licence</a><a href="/privacy-policy">Privacy Policy</a><a href="/image-use">Image use policy</a>', 'https://www.site.org/');
    expect(more.sort()).toEqual(['https://www.site.org/image-use', 'https://www.site.org/licence', 'https://www.site.org/policies']);
    // A contractor's licence isn't a licence for the content.
    expect(termsLinks('<a href="/about">Licensed &amp; Insured</a><a href="/contractor-license">Contractor License #123</a><a href="/terms">Terms of Use</a>', 'https://www.site.org/')).toEqual(['https://www.site.org/terms']);
    // …but a content licence is read.
    expect(termsLinks('<a href="https://creativecommons.org/licenses/by-nc/4.0/">Licensed under CC BY-NC 4.0</a>', 'https://www.site.org/')).toEqual(['https://creativecommons.org/licenses/by-nc/4.0/']);
  });
  it('reads each owner on a shared host as its own site', () => {
    expect(termsKey('foo.wordpress.com')).toBe('foo.wordpress.com');
    expect(termsKey('bar.wordpress.com')).not.toBe(termsKey('foo.wordpress.com'));
    expect(termsKey('www.shop.com')).toBe('shop.com');
    expect(sourceOf('foo.wordpress.com')).toBe('foo.wordpress.com');
  });
  it('picks out the passages a reviewer needs to read', () => {
    const page = '<p>' + 'Shipping is free over fifty dollars. '.repeat(40) + '</p><p>12. Prohibited uses. You are prohibited from using the site (a) for any unlawful purpose; … (i) to spam, phish, spider, crawl, or scrape.</p>';
    const ps = termsPassages(page);
    expect(ps.some((p: string) => /prohibited/.test(p) && /scrape/.test(p))).toBe(true);
    // Scripts and AI are named too ("AI" only in capitals, not the letters inside a word).
    const filler = '<p>' + 'Shipping is free over fifty dollars. '.repeat(40) + '</p>';
    expect(termsPassages(filler + '<p>You may not run scripts against the site.</p>').some((p: string) => /scripts/.test(p))).toBe(true);
    expect(termsPassages(filler + '<p>Our content may not be used to build AI tools.</p>').some((p: string) => /AI tools/.test(p))).toBe(true);
    expect(termsPassages(filler + '<p>Le jardin ai été planté.</p>')).toEqual([]);
  });
  it("reads a ban on bots, a ban on using the information, or neither, however it's worded", () => {
    for (const bots of [
      'Welcome to our store. You agree not to use any robot, spider or scraper to access the site.',
      'You agree not to:\n• Use any robot or other automatic device to access the Site.',
      'Do not use any robot to access this site.',
      'You may not use bots on this site.',
      'No part may be accessed by any automated, electronic or other means without our permission.',
      'You can&rsquo;t use scrapers.',
    ]) expect(termsVerdict(bots).verdict, bots).toBe('bots');
    for (const use of [
      'Content may not be used for commercial purposes without our prior written consent.',
      'This site is for personal, non-commercial use only.',
      'You may not use this site for commercial purposes.',
    ]) expect(termsVerdict(use).verdict, use).toBe('use');
    expect(termsVerdict('Orders ship within two days. Prices may change.').verdict).toBe('open');
  });
});

describe('a field that isn\'t the fact (docs/catalog-sources.md)', () => {
  it("weighs the Arboretum's size bins and Arkansas Extension's best exposure as a nursery's, and nothing else of theirs", () => {
    const arb = { kind: 'authority', url: 'https://apps.cals.arizona.edu/arboretum/taxon.aspx?id=610', src: 'arizona.edu' };
    expect(asReported({ ...arb, fact: 'width' }).kind).toBe('nursery');
    expect(asReported({ ...arb, fact: 'height' }).kind).toBe('nursery');
    expect(asReported({ ...arb, fact: 'bloom_season' }).kind).toBe('authority');
    const uaex = { kind: 'authority', url: 'https://www.uaex.uada.edu/yard-garden/resource-library/plant-database/shrubs/summersweet-clethra.aspx', src: 'uada.edu' };
    expect(asReported({ ...uaex, fact: 'sun_most' }).kind).toBe('nursery');
    expect(asReported({ ...uaex, fact: 'sun_least' }).kind).toBe('nursery');
    expect(asReported({ ...uaex, fact: 'height' }).kind).toBe('authority');
    // (Arkansas Extension's other pages, its fact sheets, are read as before.)
    expect(asReported({ ...uaex, url: 'https://www.uaex.uada.edu/publications/pdf/FSA-6020.pdf', fact: 'sun_most' }).kind).toBe('authority');
  });
});

// The facts Jason agreed to gather (Oct 29): how far apart to plant, whether the leaves stay, the fall color.
describe('spacing, leaves in winter and fall color, from spec lines', () => {
  it('reads how far apart to plant, with its unit; not a count a square foot, a calculator or a bare number', () => {
    expect(webFields('Spacing: 18-24″').spacing).toEqual({ min: 1.5, max: 2 });
    expect(webFields('Plant Spacing\n3′').spacing).toEqual({ min: 3, max: 3 });
    expect(webFields('Spacing: 12" to 18" apart').spacing).toEqual({ min: 1, max: 1.5 });
    expect(webFields('Recommended spacing: 2-3 ft on center').spacing).toEqual({ min: 2, max: 3 });
    for (const t of ['Spacing: 4/sq ft', 'Spacing calculator', 'Spacing: 24']) expect(webFields(t).spacing).toBeUndefined();
  });
  it('reads whether the leaves stay only from words for that', () => {
    expect(webFields('Foliage: Deciduous').foliage).toBe('deciduous');
    expect(webFields('Foliage\nBroadleaf Evergreen').foliage).toBe('evergreen');
    expect(webFields('Foliage: Semi-evergreen').foliage).toBe('semi-evergreen');
    expect(webFields('Leaf retention: Evergreen').foliage).toBe('evergreen');
    for (const t of ['Foliage: Green', 'Foliage Color: Dark green', 'Foliage: Deciduous; evergreen in the South']) expect(webFields(t).foliage).toBeUndefined();
  });
  it("reads a fall color in the catalog's words, not a line that says there's none", () => {
    expect(webFields('Fall Color: Yellow').fallColors).toEqual(['gold']);
    expect(webFields('Fall Foliage Color: bright red to orange').fallColors).toEqual(['red', 'orange']);
    expect(webFields('Fall color: No color change').fallColors).toBeUndefined();
  });
  it('reads the typographic marks for feet and inches in a size too', () => {
    expect(webFields('Height: 18-24″').height).toEqual({ min: 1.5, max: 2 });
    expect(webFields('Mature Height: 3’').height).toEqual({ min: 3, max: 3 });
  });
});
