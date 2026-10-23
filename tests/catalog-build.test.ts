import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error (a plain .mjs script)
import { auditList, ncsuPageFor, ncsuSlug, readNcsuPages, speciesOf, toFetch } from '../scripts/catalog/list.mjs';
// @ts-expect-error (a plain .mjs script)
import { cultivarOf, rereadClaims } from '../scripts/catalog/reclaim.mjs';
// @ts-expect-error (a plain .mjs script)
import { anchor, noteKind, reviewKind, reviewReport, shown, termsUnsettled } from '../scripts/catalog/report.mjs';
// @ts-expect-error (a plain .mjs script)
import { isDay, parseBuildArgs } from '../scripts/catalog/build-args.mjs';
// @ts-expect-error (a plain .mjs script)
import { cacheName } from '../scripts/catalog/fetch-lib.mjs';

// The catalog build (scripts/catalog/build.mjs, docs/catalog-build.md): its plant list, its re-reading of the
// web claims, and its review report. The build itself reads catalog-src/, which isn't committed.

const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8')) as { plants: { id: string; common: string; botanical?: string; facts?: Record<string, unknown> }[] };

describe('the plant list', () => {
  it('names each record\'s species, or only its genus', () => {
    expect(speciesOf('Salvia azurea \'Nekan\'')).toEqual({ species: 'Salvia azurea' });
    expect(speciesOf('Fothergilla × intermedia \'Mt. Airy\'')).toEqual({ species: 'Fothergilla × intermedia' });
    expect(speciesOf('Hydrangea anomala subsp. petiolaris')).toEqual({ species: 'Hydrangea anomala' });
    expect(speciesOf('  Itea   virginica ')).toEqual({ species: 'Itea virginica' });
    for (const b of ['Hosta spp.', 'Rosa \'Julia Child\'', 'Magnolia x soulangeana', 'Artemisia hybrid', 'Rosa Drift series', 'Buxus (\'Green Velvet\' / microphylla types)'])
      expect(speciesOf(b).genusOnly).toBe(true);
    expect(speciesOf('Hosta spp.').species).toBe('Hosta');
    // (Known quirks, kept as the 2026-10-18 audit read them, so the build reproduces it; docs/catalog-build.md.)
    expect(speciesOf('Salvia greggii × microphylla')).toEqual({ species: 'Salvia greggii' }); // (one parent)
    expect(speciesOf('Salvia officinalis / Origanum vulgare')).toEqual({ species: 'Salvia officinalis' }); // (the first of two)
    expect(speciesOf('Tulipa hybrids')).toEqual({ species: 'Tulipa hybrids' }); // ("hybrids" read as an epithet)
    expect(speciesOf('Magnolia x soulangeana').genusOnly).toBe(true); // (a plain x: the genus)
  });

  it('reads NC State\'s page by the rule, unless ncsu-pages.json says otherwise; never a genus\'s page by the rule', () => {
    expect(ncsuSlug('Fothergilla × intermedia')).toBe('fothergilla-x-intermedia');
    expect(ncsuSlug('Lantana camara \'Miss Huff\'')).toBe('lantana-camara-miss-huff');
    const saved = new Set(['itea-virginica', 'rosa', 'hosta']);
    const has = (s: string) => saved.has(s);
    const pages = { 'a-cultivar': 'itea-virginica-little-henry', 'no-page': null };
    expect(ncsuPageFor({ id: 'x' }, { species: 'Itea virginica' }, pages, has)).toBe('itea-virginica');
    expect(ncsuPageFor({ id: 'x' }, { species: 'Itea major' }, pages, has)).toBeUndefined(); // (not saved)
    expect(ncsuPageFor({ id: 'x' }, { species: 'Rosa', genusOnly: true }, pages, has)).toBeUndefined();
    expect(ncsuPageFor({ id: 'a-cultivar' }, { species: 'Itea virginica' }, pages, has)).toBe('itea-virginica-little-henry');
    expect(ncsuPageFor({ id: 'no-page' }, { species: 'Itea virginica' }, pages, has)).toBeUndefined();
  });

  it('gives each record, in order, its species, pages and USDA pick; a genus no USDA symbol', () => {
    const cat = { plants: [{ id: 'itea-virginica', botanical: 'Itea virginica' }, { id: 'hosta-spp', botanical: 'Hosta spp.' }] };
    const usda = (s: string) => ({ symbol: s.slice(0, 4).toUpperCase(), id: 1, name: s });
    expect(auditList(cat, { pages: {}, hasNcsu: () => true, usda })).toEqual([
      { id: 'itea-virginica', species: 'Itea virginica', ncsu: 'itea-virginica', usda: { symbol: 'ITEA', id: 1, name: 'Itea virginica' } },
      { id: 'hosta-spp', species: 'Hosta', genusOnly: true },
    ]);
  });

  it('keeps ncsu-pages.json to catalog records, each a page name or null', () => {
    const pages = readNcsuPages() as Record<string, string | null>;
    const ids = new Set(catalog.plants.map((p) => p.id));
    expect(Object.keys(pages).filter((id) => !ids.has(id))).toEqual([]);
    expect(Object.values(pages).filter((s) => s !== null && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))).toEqual([]);
    expect(Object.keys(pages)).toEqual(catalog.plants.map((p) => p.id).filter((id) => id in pages)); // (in the catalog's order)
  });
});

/** A catalog-src/ with a few pages saved as the fetcher saves them. */
function savedRoot(pages: { source: string; url: string; body?: string; status?: number }[]) {
  const root = mkdtempSync(join(tmpdir(), 'catalog-src-'));
  for (const p of pages) {
    const dir = join(root, p.source, '2026-10-18');
    mkdirSync(dir, { recursive: true });
    const status = p.status ?? 200;
    if (status === 200) writeFileSync(join(dir, cacheName(p.url)), p.body ?? '');
    writeFileSync(join(dir, cacheName(p.url) + '.meta.json'), JSON.stringify({ url: p.url, status, type: 'text/html; charset=utf-8', fetched: '2026-10-18' }));
  }
  return root;
}

describe('reading the web claims again', () => {
  it('reads each cited page once, for plants in the list only, and counts pages no longer saved', () => {
    const url = 'https://example.org/plants/itea-virginica', gone = 'https://example.org/gone';
    const root = savedRoot([{ source: 'web', url, body: '<html><body><p>Nothing to read here.</p></body></html>' }]);
    try {
      const searched = { 'itea-virginica': [{ url, fact: 'height', v: { min: 3, max: 5 } }, { url, fact: 'width', v: { min: 3, max: 5 } }, { url: gone, fact: 'water', v: 'Moderate' }], 'not-listed': [{ url, fact: 'water', v: 'Low' }] };
      const r = rereadClaims(searched, [{ id: 'itea-virginica', species: 'Itea virginica' }], { plants: [{ id: 'itea-virginica', common: 'Virginia sweetspire', botanical: 'Itea virginica' }] }, root);
      expect(r).toEqual({ claims: { 'itea-virginica': [] }, pages: 1, missing: 1 });
    } finally { rmSync(root, { recursive: true }); }
    expect(cultivarOf({ botanical: 'Itea virginica \'Little Henry\'' })).toBe('Little Henry');
    expect(cultivarOf({ botanical: 'Hakonechloa macra', common: 'Japanese forest grass \'All Gold\'' })).toBe('All Gold');
  });

  it('lists the pages a list needs that were never fetched, a page it names too: a 404 counts as asked', () => {
    const asked = 'https://plants.ces.ncsu.edu/plants/itea-major/';
    const search = (s: string) => `https://plantsservices.sc.egov.usda.gov/api/PlantSearch?searchText=${encodeURIComponent(s)}`;
    const profile = (sym: string) => `https://plantsservices.sc.egov.usda.gov/api/PlantProfile?symbol=${sym}`;
    const results = JSON.stringify([{ Symbol: 'ITVI', Id: 7, ScientificName: '<i>Itea virginica</i> L.', CommonName: 'Virginia sweetspire', Rank: 'Species' }, { Symbol: 'ITVI2', Id: 8, ScientificName: 'Itea virginica var. x', Rank: 'Variety' }]);
    const root = savedRoot([{ source: 'ncsu', url: asked, status: 404 }, { source: 'usda', url: search('Itea virginica'), body: results }, { source: 'usda', url: search('Itea gone'), status: 404 }]);
    try {
      // (A saved search leads to its candidates' profiles, a variety's not; a search answered 404 isn't asked again.)
      const usda = toFetch([{ id: 'v', species: 'Itea virginica', ncsu: 'itea-virginica' }, { id: 'g', species: 'Itea gone', ncsu: 'x' }], root);
      expect([usda.searches, usda.profiles]).toEqual([[], [profile('ITVI')]]);
      const need = toFetch([{ id: 'a', species: 'Itea major' }, { id: 'b', species: 'Itea minor' }, { id: 'c', species: 'Rosa', genusOnly: true }, { id: 'd', species: 'Buxus', genusOnly: true, ncsu: 'buxus-green-velvet' }], root);
      expect(need.ncsu).toEqual(['https://plants.ces.ncsu.edu/plants/itea-minor/']);
      expect(need.named).toEqual(['https://plants.ces.ncsu.edu/plants/buxus-green-velvet/']);
      expect(need.searches).toEqual(['Itea major', 'Itea minor'].map((s) => `https://plantsservices.sc.egov.usda.gov/api/PlantSearch?searchText=${encodeURIComponent(s)}`));
      expect(need.profiles).toEqual([]);
    } finally { rmSync(root, { recursive: true }); }
  });
});

describe('the review report', () => {
  const cat = { plants: [
    { id: 'buttonbush', common: 'Buttonbush', facts: { zone_max: 9.5 } },
    { id: 'plum', common: 'American plum', facts: { form: 'Shrub' } },
    { id: 'pawpaw', common: 'Pawpaw | custard apple', audited: '2026-10-18', facts: {} },
  ] };
  const combined = [
    { id: 'buttonbush', facts: { zone_max: { v: 9.5, src: ['ncsu'], check: 'disputed', note: 'ufl.edu: 11.5' } }, notes: ['No NC State page', 'NC State page not fetched'] },
    { id: 'plum', facts: { form: { v: null, src: ['ncsu'], check: 'disputed' } }, notes: ['NC State page prunus-x is Prunus y, not Prunus americana: left out'] },
    { id: 'pawpaw', facts: {}, notes: ['No NC State page'] },
  ];
  const review = [
    { id: 'pawpaw', fact: 'edible', note: 'edible, but rated toxic' },
    { id: 'plum', fact: 'form', note: 'ncsu lists Shrub, Tree, the tree without saying understory or canopy' },
    { id: 'buttonbush', fact: 'zone_max', note: 'ufl.edu: 11.5' },
  ];
  const list = [{ id: 'buttonbush', ncsu: 'cephalanthus-occidentalis-x' }, { id: 'plum', ncsu: 'prunus-x' }, { id: 'pawpaw' }];
  const report = () => reviewReport({ catalog: cat, date: '2026-10-18', list, combined, review, searched: { buttonbush: [], plum: [] },
    wcvp: { homonyms: ['Aquilegia canadensis'], regulatedUnreviewed: [], regulatedNotMatched: [], notMatched: ['Amsonia illustris'] },
    native: [], bloom: [], warnings: ['plum: 50 ft is tall for a shrub', 'buttonbush: no spread', 'pawpaw: no spread'], unfetched: { ncsu: ['x'], named: ['https://plants.ces.ncsu.edu/plants/cephalanthus-occidentalis-x/'], searches: [], profiles: [] }, termsUnsettled: [] });

  it('sorts each item into what it asks, both sides of a dispute shown', () => {
    expect(review.map(reviewKind)).toEqual(['edible', 'tree', 'disputed']);
    expect(reviewKind({ id: 'x', fact: 'height, width', note: 'held back: under 3 in tall' })).toBe('held');
    expect(['NC State page not fetched', 'No NC State page', 'Not in USDA PLANTS by this name', 'The Arkansas atlas maps X y more than once with different status: left for the review', 'NC State has only a page for the genus Narcissus'].map(noteKind))
      .toEqual(['unfetched', null, null, 'atlasTwice', 'genusPage']);
    expect([shown({ min: 2, max: 3 }), shown({ min: 2, max: 2 }), shown(['Shrub', 'Tree']), shown(null), shown({ v: 'Full' }), shown({ start: 4, end: 6, color: 'White' })])
      .toEqual(['2–3', '2', 'Shrub, Tree', '–', 'Full', '4–6, White']);
    const md = report().markdown;
    expect(md).toContain('| Buttonbush (`buttonbush`) | warmest zone | ncsu: 9.5 · ufl.edu: 11.5 | 9.5 |');
    expect(md).toContain('| American plum (`plum`) | ncsu lists Shrub, Tree, the tree without saying understory or canopy | Shrub |');
    expect(md).toContain('- Pawpaw \\| custard apple (`pawpaw`)'); // (a bar escaped, as a table needs)
    expect(md).toContain('- Aquilegia canadensis: ');
    expect(md).toContain('- no spread (2): `buttonbush`, `pawpaw`');
    expect(md).toContain('- tall for a shrub (1): `plum`');
    expect(md).toContain('- 1 NC State species pages never asked for');
    expect(md).toContain('- 2 plants: no NC State page in the list');
    expect(md).toContain('## A page under another name (1)');
    expect(md).toContain('- Buttonbush (`buttonbush`): `cephalanthus-occidentalis-x`, never fetched');
    const asked = reviewReport({ catalog: cat, date: '2026-10-18', list, combined, review: [], unfetched: { ncsu: [], named: [], searches: [], profiles: [] } }).markdown;
    expect(asked).toContain('- Buttonbush (`buttonbush`): `cephalanthus-occidentalis-x`, asked for, and not there');
  });

  it('leads with a contents list whose links are the headings\' anchors, and skips empty sections', () => {
    const { markdown, counts } = report();
    const contents = [...markdown.matchAll(/^- \[(.+)\]\(#(.+)\)$/gm)].map((m) => [m[1], m[2]]);
    const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1]).filter((h) => h !== 'For reference');
    expect(contents.map(([t]) => t)).toEqual(headings);
    expect(contents.find(([t]) => t.startsWith('Tree'))?.[1]).toBe('tree-understory-or-canopy-1');
    expect(headings.some((h) => h.startsWith('Native status'))).toBe(false);
    expect(headings).toContain('Not searched on the web (1)');
    // (To decide: the writer's three, Kew's name, the page under another name; pages: one named, one never asked.)
    expect(counts).toEqual({ decide: 5, pages: 2, search: 1, terms: 0, tidy: 3 });
    expect(report().summary).toBe('5 to decide, 2 pages not fetched yet, 1 plant not searched, 3 catalog checks; 1 of 3 records audited');
    expect(anchor("A page the list names but that isn't saved (3)")).toBe('a-page-the-list-names-but-that-isnt-saved-3');
    expect(anchor("Read from the genus's page (1)")).toBe('read-from-the-genuss-page-1');
    expect(report().markdown).toBe(markdown); // (the same inputs, the same report)
    const withTerms = reviewReport({ catalog: cat, date: '2026-10-18', list: [], combined: [], review: [], termsUnsettled: ['arborday.org', 'brit.org'] });
    expect(withTerms.markdown).toContain('## Sites whose terms are unsettled (2)');
    expect(withTerms.markdown).toContain('\n\narborday.org, brit.org\n');
    expect(withTerms.counts).toEqual({ decide: 0, pages: 0, search: 0, terms: 2, tidy: 0 });
    expect(withTerms.summary).toBe('2 sites whose terms are unsettled; 1 of 3 records audited');
  });

  it('names the sites whose terms packets the registry hasn\'t settled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'terms-review-'));
    try {
      for (const f of ['arborday.org.txt', 'abnativeplants.com.txt', 'notes.json']) writeFileSync(join(dir, f), '');
      expect(termsUnsettled(dir, { 'abnativeplants.com': { verdict: 'open' } })).toEqual(['arborday.org']);
      expect(termsUnsettled(join(dir, 'none'), {})).toEqual([]);
    } finally { rmSync(dir, { recursive: true }); }
  });
});

describe('the build\'s arguments', () => {
  it('takes --fetch only with --date, a real day, and refuses a flag npm took for itself', () => {
    expect(parseBuildArgs([])).toEqual({ fetch: false, date: undefined });
    expect(parseBuildArgs(['--date', '2026-10-18'])).toEqual({ fetch: false, date: '2026-10-18' });
    expect(parseBuildArgs(['--fetch', '--date', '2026-10-22'])).toEqual({ fetch: true, date: '2026-10-22' });
    expect(parseBuildArgs(['--fetch']).error).toMatch(/--fetch needs --date/);
    expect(parseBuildArgs(['--date', '2026-13-45']).error).toMatch(/not a day/);
    expect(parseBuildArgs(['--date']).error).toMatch(/--date: not an option/);
    expect(parseBuildArgs(['--help']).error).toMatch(/not an option/);
    expect(parseBuildArgs([], { npm_config_fetch: 'true' }).error).toMatch(/put `--` before it/);
    expect([isDay('2026-02-28'), isDay('2026-02-30'), isDay('26-1-1')]).toEqual([true, false, false]);
  });
});
