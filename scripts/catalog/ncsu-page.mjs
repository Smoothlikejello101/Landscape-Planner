// Which plant an NC State Plant Toolbox page is about, and whether a record may read it (sample.mjs;
// docs/catalog-build.md, "The plant list").
import { readFileSync } from 'node:fs';

const ENTITIES = { '&#x27;': "'", '&#39;': "'", '&apos;': "'", '&#8216;': "'", '&#8217;': "'", '&lsquo;': "'", '&rsquo;': "'", '&quot;': '"', '&amp;': '&', '&nbsp;': ' ' };
/** Curly quotes as straight ones, so "‘Green Giant’" and "'Green Giant'" are one name. */
const straight = (s) => String(s ?? '').replace(/[‘’]/g, "'");
/** The page's title, the plant's name as NC State writes it ("Thuja 'Green Giant'", "Magnolia x soulangeana"). */
export function ncsuTitle(html) {
  const t = /<title>\s*([^(<|]+)/.exec(html ?? '')?.[1] ?? '';
  return straight(t.replace(/&#x27;|&#39;|&apos;|&#8216;|&#8217;|&lsquo;|&rsquo;|&quot;|&amp;|&nbsp;/g, (e) => ENTITIES[e])).replace(/\s+/g, ' ').trim();
}
/**
 * The cultivars a name gives in quotes ("Thuja 'Green Giant'", "('Kanza' / 'Lakota')"), in order. An apostrophe in a
 * word isn't a quote: "Kalm's St. John's wort" names none, "'Kramer's Supreme'" is one cultivar, and "Lamb's ear
 * 'Big Ears'" names 'Big Ears'. (A quote that opens follows no letter or digit; one that closes is followed by none.)
 */
const QUOTED = /(?<![\p{L}\p{N}])'(.+?)'(?![\p{L}\p{N}])/gu;
export const quotedCultivars = (text) => [...straight(text).matchAll(QUOTED)].map((m) => m[1].trim()).filter(Boolean);
/** A name with its quoted cultivars taken out (each as `by`), its apostrophes kept: "Rosa Child's Play 'SAVachild'" → "Rosa Child's Play ". */
export const withoutCultivars = (text, by = ' ') => straight(text).replace(QUOTED, by);
/** The cultivar a page's title names ("Thuja 'Green Giant'" → Green Giant), or null for a species' or genus's page. */
export const titleCultivar = (html) => quotedCultivars(ncsuTitle(html))[0] ?? null;

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

/**
 * The name a record's sources sell it under, where a person renamed it so that its own names don't quote it
 * (decisions.json `rename`, `soldAs`), or null. A seed strain isn't a cultivar, so it's named "Butterfly weed (clay
 * strain)", but Prairie Nursery sells it as Butterfly Weed for Clay, and its page is the strain's own (Jason,
 * 2026-11-01). The build reads that name as it reads a quoted cultivar, so the rename changes none of its facts.
 */
const SOLD_AS = new Map(Object.entries(JSON.parse(readFileSync(new URL('./decisions.json', import.meta.url), 'utf8')).rename ?? {})
  .filter(([id, d]) => id !== 'about' && d?.soldAs).map(([id, d]) => [id, d.soldAs]));
export const soldAs = (rec) => SOLD_AS.get(rec?.id) ?? null;
/** The cultivars a record names ("Thuja 'Green Giant'", "Lagerstroemia ('Natchez' / 'Muskogee')"), once each; and what it's sold as. */
export const recordCultivars = (rec) => [...new Set([...quotedCultivars(rec?.botanical), ...quotedCultivars(rec?.common), ...(soldAs(rec) ? [soldAs(rec)] : [])])];

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
