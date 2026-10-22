// Which plant an NC State Plant Toolbox page is about, and whether a record may read it (sample.mjs;
// docs/catalog-build.md, "The plant list").

const ENTITIES = { '&#x27;': "'", '&#39;': "'", '&apos;': "'", '&#8216;': "'", '&#8217;': "'", '&lsquo;': "'", '&rsquo;': "'", '&quot;': '"', '&amp;': '&', '&nbsp;': ' ' };
/** Curly quotes as straight ones, so "‘Green Giant’" and "'Green Giant'" are one name. */
const straight = (s) => String(s ?? '').replace(/[‘’]/g, "'");
/** The page's title, the plant's name as NC State writes it ("Thuja 'Green Giant'", "Magnolia x soulangeana"). */
export function ncsuTitle(html) {
  const t = /<title>\s*([^(<|]+)/.exec(html ?? '')?.[1] ?? '';
  return straight(t.replace(/&#x27;|&#39;|&apos;|&#8216;|&#8217;|&lsquo;|&rsquo;|&quot;|&amp;|&nbsp;/g, (e) => ENTITIES[e])).replace(/\s+/g, ' ').trim();
}
/** The cultivar a page's title names ("Thuja 'Green Giant'" → Green Giant), or null for a species' or genus's page. */
export const titleCultivar = (html) => /'([^']+)'/.exec(ncsuTitle(html))?.[1] ?? null;

/**
 * The species a page names, from its fields (`fields`: extract.mjs ncsuFields); a hybrid's page with no species
 * field, from its title. NC State writes × as x: "Magnolia x soulangeana" is Magnolia × soulangeana.
 */
export function ncsuPageName(html, fields) {
  const title = fields.Species?.[0] ? '' : ncsuTitle(html).replace(/ '.*$/, '');
  const name = / x [a-zë-]/.test(title) ? title : `${fields.Genus?.[0] ?? ''} ${fields.Species?.[0] ?? ''}`.trim();
  return name.replace(/^(\S+) x (?=[a-zë-])/, '$1 × ');
}

const sameName = (a, b) => !!a && !!b && a.toLowerCase().replace(/\s+/g, ' ').startsWith(b.toLowerCase());
/**
 * Whether a list entry reads a page that names `name`: its own species (or a name starting with it, a variety's
 * or a cultivar's); the name reviewed for it in ncsu-pages.json (`ncsuName`); for a genus or group, any page of
 * the genus.
 */
export function acceptsPage(entry, name, genus) {
  return (!!entry.ncsuName && name === entry.ncsuName) || sameName(name, entry.species) || (!!entry.genusOnly && genus === entry.species.split(' ')[0]);
}

/** The cultivars a record names ("Thuja 'Green Giant'", "Lagerstroemia ('Natchez' / 'Muskogee')"), once each. */
export const recordCultivars = (rec) => [...new Set([...straight(`${rec?.botanical ?? ''} ${rec?.common ?? ''}`).matchAll(/'([^']+)'/g)].map((m) => m[1]))];

/**
 * Whether a genus or group record reads the page as its own cultivar's, so the page's size, form and color are
 * its: the record names one cultivar (not several, nor a cultivar and "types"), and the page is that cultivar's.
 * One cultivar's page for a record of several speaks for only one of them: read as species-level.
 */
export function ownCultivarPage(rec, html) {
  const names = recordCultivars(rec);
  if (names.length !== 1 || /\//.test(rec?.botanical ?? '')) return false;
  return titleCultivar(html) === names[0];
}
