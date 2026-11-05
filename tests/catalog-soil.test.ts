// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error (plain JavaScript build script)
import { ncsuFields } from '../scripts/catalog/extract.mjs';
// @ts-expect-error (plain JavaScript build script)
import { combine, ncsuClaims, SOIL_TEXTURES as BUILD_SOIL_TEXTURES, soilTextures } from '../scripts/catalog/claims.mjs';
// @ts-expect-error (plain JavaScript build script)
import { writeAudit } from '../scripts/catalog/write.mjs';
// @ts-expect-error (plain JavaScript build script)
import { savedPage } from '../scripts/catalog/pages.mjs';
import { catalogErrors, catalogWarnings, resolveCatalog, SOIL_TEXTURES, type CatalogFile } from '../src/catalog';
import { loadPlants, plantsById } from '../src/plants';
import { foldDetailGroups, plantDetails, soilText } from '../src/ui/plant-details';

// Soil texture (Jason, Nov 4: "I'd like to have it to make that part of a bed functional"): the textures NC State's
// "Soil Texture" field lists, in the catalog's words, so a bed's Loam and Sandy filter as Clay does.

const fixture = (name: string) => readFileSync(`tests/fixtures/catalog/${name}`, 'utf8');
const page = (fields: Record<string, string[]>) =>
  `<dl>${Object.entries(fields).map(([k, vs]) => `<dt>${k}:</dt>${vs.map((v) => `<dd><span>${v}</span></dd>`).join('')}`).join('')}</dl>`;
type Claim = { fact: string; v: unknown; src: string; kind: string };
const soilClaim = (f: Record<string, string[]>) => (ncsuClaims(f) as Claim[]).find((c) => c.fact === 'soil_texture');

describe("soil texture: NC State's \"Soil Texture\", in the catalog's words", () => {
  it('maps every value the saved pages have (counts of 4,711 pages, 2026-11-04), and nothing it doesn\'t know', () => {
    expect(soilTextures(['Loam (Silt)'])).toEqual(['loam']); // (3,414 pages)
    expect(soilTextures(['Sand'])).toEqual(['sand']); // (3,072)
    expect(soilTextures(['Clay'])).toEqual(['clay']); // (2,421)
    expect(soilTextures(['High Organic Matter'])).toEqual([]); // (1,955: what's in it, not a texture)
    expect(soilTextures(['Shallow Rocky'])).toEqual([]); // (810: how deep it is, not a texture)
    // (The clay a "Clay (Heavy)" names, however it's written; none of the saved pages has one.)
    expect(soilTextures(['Clay (Heavy)'])).toEqual(['clay']);
    expect(soilTextures([' loam  (silt) '])).toEqual(['loam']);
    // (Each once, in the catalog's order, whatever the field's.)
    expect(soilTextures(['Sand', 'Shallow Rocky', 'Loam (Silt)', 'Clay', 'Clay'])).toEqual(['clay', 'loam', 'sand']);
    // (A word not mapped isn't kept: not guessed.)
    expect(soilTextures(['Sandy loam', 'Silt', 'Peat'])).toEqual([]);
    expect(soilTextures(undefined)).toEqual([]);
  });

  it("reads the field into NC State's claim, an authority's; none where it names only organic matter or rocky soil", () => {
    expect(soilClaim(ncsuFields(fixture('ncsu-cercis.html')))).toEqual({ fact: 'soil_texture', v: ['clay', 'loam', 'sand'], src: 'ncsu', kind: 'authority' });
    // (Oleander's field names all five: the three textures kept.)
    expect(soilClaim(ncsuFields(fixture('ncsu-nerium.html')))?.v).toEqual(['clay', 'loam', 'sand']);
    expect(soilClaim(ncsuFields(page({ 'Soil Texture': ['Loam (Silt)', 'Sand'] })))?.v).toEqual(['loam', 'sand']);
    expect(soilClaim(ncsuFields(page({ 'Soil Texture': ['High Organic Matter', 'Shallow Rocky'] })))).toBeUndefined();
    expect(soilClaim(ncsuFields(page({ Genus: ['Heuchera'] })))).toBeUndefined();
    // Clay OK stays as it was: from the same field, yes where it lists clay.
    const clay = (f: Record<string, string[]>) => (ncsuClaims(ncsuFields(page(f))) as Claim[]).find((c) => c.fact === 'clay_ok')?.v;
    expect(clay({ 'Soil Texture': ['Clay', 'Sand'] })).toBe(true);
    expect(clay({ 'Soil Texture': ['Loam (Silt)', 'Sand'] })).toBeUndefined(); // (never "no" from its absence)
  });

  it("combines as a survival fact: NC State's alone is single; a cultivar takes it from its species' page; never a blog's", () => {
    const claims = ncsuClaims(ncsuFields(page({ 'Soil Texture': ['Clay', 'Loam (Silt)'] })));
    expect(combine(claims).soil_texture).toMatchObject({ v: ['clay', 'loam'], src: ['ncsu'], check: 'single', kind: 'authority' });
    // (Not a fact a cultivar is bred to change: its species' page speaks for it, as for `texture`.)
    expect(combine(claims, { cultivar: true }).soil_texture).toMatchObject({ v: ['clay', 'loam'], check: 'single' });
    expect(combine([{ fact: 'soil_texture', v: ['sand'], src: 'gardenblog.com', kind: 'blog' }]).soil_texture).toBeNull();
  });

  it('writes it with its source, in the catalog\'s words; a word the catalog doesn\'t know isn\'t written', () => {
    const catalog = {
      meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { ncsu: { title: 'NC State', trust: 'reference' }, compendium: { title: 'Earlier list', trust: 'unverified' } }, enums: { form: ['Tree'] } },
      plants: [
        { id: 'cercis-canadensis', common: 'Redbud', src: ['compendium'], audited: null, facts: { form: 'Tree', clay_ok: true } },
        { id: 'odd', common: 'Odd one', src: ['compendium'], audited: null, facts: { form: 'Tree' } },
      ],
    };
    const fact = (v: unknown) => ({ v, src: ['ncsu'], check: 'single' });
    const audit = [
      { id: 'cercis-canadensis', claims: [{ src: 'ncsu', kind: 'authority' }], facts: { soil_texture: fact(['loam', 'sand']) } },
      { id: 'odd', claims: [{ src: 'ncsu', kind: 'authority' }], facts: { soil_texture: fact(['loam', 'silt']) } },
    ];
    const { file, review } = writeAudit(catalog, audit, '2026-11-04', catalogWarnings);
    expect(file.plants[0].facts.soil_texture).toEqual(fact(['loam', 'sand']));
    expect(file.plants[0].audited).toBe('2026-11-04');
    // (Its Clay OK, the earlier list's, kept as it was, and the new texture not held back for the review's check below.)
    expect(file.plants[0].facts.clay_ok).toBe(true);
    expect(review.filter((r: { id: string }) => r.id === 'cercis-canadensis')).toEqual([]);
    expect(file.plants[1].facts.soil_texture).toBeUndefined();
    expect(review).toContainEqual({ id: 'odd', fact: 'soil_texture', note: 'value the catalog can\'t take: ["loam","silt"]' });
  });

  it("the app knows the build's words", () => {
    expect(SOIL_TEXTURES).toEqual(BUILD_SOIL_TEXTURES);
  });
});

describe('catalog:check', () => {
  const file = (facts: Record<string, unknown>, src = ['ncsu']) => ({
    meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { ncsu: { title: 'NC State', trust: 'reference' }, compendium: { title: 'Earlier list', trust: 'unverified' } } },
    plants: [{ id: 'quercus-rubra', common: 'Red oak', botanical: 'Quercus rubra', src, audited: '2026-11-04', facts: { width: { v: { min: 60, max: 75 }, src: ['ncsu'] }, ...facts } }],
  }) as unknown as CatalogFile;
  const errs = (v: unknown) => catalogErrors(file({ soil_texture: { v, src: ['ncsu'], check: 'single' } })).filter((e) => /soil_texture/.test(e));
  it("passes the catalog's words, each once; anything else is an error", () => {
    expect(errs(['clay', 'loam', 'sand'])).toEqual([]);
    expect(errs(['sand'])).toEqual([]);
    expect(errs(['silt'])).toHaveLength(1);
    expect(errs(['Loam'])).toHaveLength(1);
    expect(errs(['loam', 'loam'])).toHaveLength(1);
    expect(errs('loam')).toHaveLength(1);
    expect(errs([])).toHaveLength(1);
    expect(catalogErrors(file({ soil_texture: ['loam'] }, [])).filter((e) => /soil_texture/.test(e))).toEqual(['quercus-rubra.soil_texture: no source']);
  });
  it('lists for review a Clay OK only the earlier list gives, where NC State\'s soil textures leave out clay', () => {
    const SAYS = "quercus-rubra: Clay OK only by the earlier list, and NC State's soil textures leave out clay";
    const soil = (v: string[]) => ({ v, src: ['ncsu'], check: 'single' });
    expect(catalogWarnings(file({ clay_ok: true, soil_texture: soil(['loam', 'sand']) }, ['compendium']))).toContain(SAYS);
    expect(catalogWarnings(file({ clay_ok: { v: true, src: ['compendium'] }, soil_texture: soil(['sand']) }))).toContain(SAYS);
    // (Not where they agree, where NC State gives Clay OK too, or with no texture to go by.)
    expect(catalogWarnings(file({ clay_ok: true, soil_texture: soil(['clay', 'loam']) }, ['compendium']))).not.toContain(SAYS);
    expect(catalogWarnings(file({ clay_ok: { v: true, src: ['ncsu'] }, soil_texture: soil(['loam']) }))).not.toContain(SAYS);
    expect(catalogWarnings(file({ clay_ok: true }, ['compendium']))).not.toContain(SAYS);
    expect(catalogWarnings(file({ clay_ok: false, soil_texture: soil(['loam']) }, ['compendium']))).not.toContain(SAYS);
  });
});

// The plant's details and the app's plants, from a catalog as the build writes it.
const catalog = {
  meta: { format: 'lp-catalog', version: 2, zones: 'half', sources: { ncsu: { title: 'NC State Extension Gardener Plant Toolbox', trust: 'reference' } }, enums: { form: ['Perennial'] } },
  plants: [
    { id: 'monarda-fistulosa', common: 'Wild bergamot', botanical: 'Monarda fistulosa', src: ['ncsu'], audited: '2026-11-04',
      facts: { form: 'Perennial', soil_texture: { v: ['clay', 'loam', 'sand'], src: ['ncsu'], check: 'single' }, clay_ok: { v: true, src: ['ncsu'], check: 'single' } } },
    { id: 'monarda-fistulosa-claire-grace', common: "Wild bergamot 'Claire Grace'", botanical: "Monarda fistulosa 'Claire Grace'", parent: 'monarda-fistulosa', src: ['ncsu'], audited: '2026-11-04', facts: {} },
    { id: 'quercus-rubra', common: 'Red oak', botanical: 'Quercus rubra', src: ['ncsu'], audited: '2026-11-04', facts: { form: 'Perennial', soil_texture: { v: ['loam'], src: ['ncsu'], check: 'single' } } },
    { id: 'heuchera-villosa', common: 'Hairy alumroot', botanical: 'Heuchera villosa', src: ['ncsu'], audited: '2026-11-04', facts: { form: 'Perennial' } },
  ],
};

describe('in the app', () => {
  it("a cultivar with none of its own takes its species', said so", () => {
    const plants = resolveCatalog(catalog as unknown as CatalogFile);
    const cultivar = plants.find((p) => p.id === 'monarda-fistulosa-claire-grace')!;
    expect(cultivar.soil_texture).toEqual(['clay', 'loam', 'sand']);
    expect(cultivar.prov?.soil_texture).toMatchObject({ src: ['ncsu'], inherited: true });
    expect(plants.find((p) => p.id === 'heuchera-villosa')!.soil_texture).toBeUndefined();
  });

  describe("a plant's details: a Soil row, where it has the fact", () => {
    beforeAll(async () => {
      const was = globalThis.fetch;
      globalThis.fetch = (async () => ({ json: async () => catalog })) as unknown as typeof fetch;
      try { await loadPlants(); } finally { globalThis.fetch = was; }
      foldDetailGroups();
    });
    const soilRow = (id: string) => {
      const box = plantDetails(plantsById[id], undefined);
      return [...box.querySelectorAll('dt')].find((d) => d.textContent === 'Soil')?.nextElementSibling ?? null;
    };
    it('in words: "Clay, loam or sand", "Loam"', () => {
      expect(soilText(['clay', 'loam', 'sand'])).toBe('Clay, loam or sand');
      expect(soilText(['loam', 'sand'])).toBe('Loam or sand');
      expect(soilText(['loam'])).toBe('Loam');
      expect(soilText(undefined)).toBe('');
    });
    it('its source in front, quietly; a cultivar\'s from its species; none without the fact', () => {
      const row = soilRow('monarda-fistulosa')!;
      expect(row.firstChild?.textContent).toBe('Clay, loam or sand');
      expect(row.querySelector('.details-src')?.textContent).toBe('Source: NC State');
      expect(soilRow('quercus-rubra')!.firstChild?.textContent).toBe('Loam');
      expect(soilRow('monarda-fistulosa-claire-grace')!.querySelector('.details-src')?.textContent).toBe('Source: NC State · from its species');
      expect(soilRow('heuchera-villosa')).toBeNull();
      // (In Growing, beside Takes clay, which is as it was.)
      const box = plantDetails(plantsById['monarda-fistulosa'], undefined);
      const growing = box.querySelector('[data-testid=group-growing]')!.nextElementSibling!;
      expect([...growing.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Soil', 'Takes clay']);
    });
  });
});

// The claim step on a few of the pages saved in catalog-src/ (git-ignored, so only where they're there), read-only.
const SAVED = existsSync('catalog-src/ncsu');
describe.skipIf(!SAVED)('on saved NC State pages (read-only)', () => {
  const claimsOf = (slug: string) => {
    const p = savedPage('ncsu', `https://plants.ces.ncsu.edu/plants/${slug}/`);
    expect(p, slug).toBeTruthy();
    const f = ncsuFields(p.text);
    return { field: f['Soil Texture'] as string[] | undefined, soil: soilClaim(f)?.v, clay: (ncsuClaims(f) as Claim[]).find((c) => c.fact === 'clay_ok')?.v };
  };
  it('reads each as its field lists them', () => {
    // (As saved 2026-10-18 and 2026-10-24.)
    expect(claimsOf('cercis-canadensis')).toEqual({ field: ['Clay', 'High Organic Matter', 'Loam (Silt)', 'Sand'], soil: ['clay', 'loam', 'sand'], clay: true });
    expect(claimsOf('quercus-rubra')).toEqual({ field: ['Loam (Silt)', 'Sand'], soil: ['loam', 'sand'], clay: undefined });
    expect(claimsOf('opuntia-humifusa')).toEqual({ field: ['Sand', 'Shallow Rocky'], soil: ['sand'], clay: undefined });
    expect(claimsOf('monarda-fistulosa')).toEqual({ field: ['Clay', 'Shallow Rocky'], soil: ['clay'], clay: true });
    // (Only organic matter, or that and rocky soil: no texture.)
    expect(claimsOf('heuchera-villosa')).toEqual({ field: ['High Organic Matter'], soil: undefined, clay: undefined });
    expect(claimsOf('salvia-greggii')).toEqual({ field: ['High Organic Matter', 'Shallow Rocky'], soil: undefined, clay: undefined });
  });
});
