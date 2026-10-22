// The audit's plant list, worked out from the catalog (docs/catalog-build.md): for each record, in the
// catalog's order, { id, species, genusOnly?, ncsu?, usda? }, which sample.mjs reads. Nothing in it is chosen
// by hand except scripts/catalog/ncsu-pages.json (the NC State pages that don't follow the rule) and the
// reviewed lists the USDA pick already keeps (usda-pick.mjs `PICK`, usda-counties.mjs `SAME_PLANT`).
import { readFileSync } from 'node:fs';
import { savedMeta, savedPage } from './pages.mjs';
import { characteristicsUrl, pickSymbol, profileUrl, searchUrl, symbolCandidates } from './usda-pick.mjs';

/**
 * The species a record's botanical name names, and whether it names only a genus. "Fothergilla × intermedia"
 * names the hybrid species; "Salvia azurea 'Nekan'" names Salvia azurea; a lowercase second word names the
 * species ("Distylium hybrids" too, as the audit read it); anything else ("Hosta spp.", "Rosa 'Julia Child'",
 * "Magnolia x soulangeana", "Artemisia hybrid") names only its genus.
 */
export function speciesOf(botanical) {
  const w = String(botanical ?? '').replace(/\s+/g, ' ').trim().split(' ');
  if (w[1] === '×' && /^[a-zë-]+$/.test(w[2] ?? '')) return { species: `${w[0]} × ${w[2]}` };
  if (/^[a-zë-]+$/.test(w[1] ?? '') && w[1] !== 'x' && w[1] !== 'hybrid') return { species: `${w[0]} ${w[1]}` };
  return { species: w[0], genusOnly: true };
}

/** NC State's page name for a species ("Itea virginica" → itea-virginica; × is x). */
export const ncsuSlug = (name) => name.toLowerCase().replace(/×/g, 'x').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const ncsuUrl = (slug) => `https://plants.ces.ncsu.edu/plants/${slug}/`;

/** scripts/catalog/ncsu-pages.json: { pages: { record id: slug, or null for none } }. */
export const readNcsuPages = (path = 'scripts/catalog/ncsu-pages.json') => JSON.parse(readFileSync(path, 'utf8')).pages;

/**
 * The NC State page a record reads: the one ncsu-pages.json names for it (null: none); else, for a species
 * (not a genus alone), its species page if one is saved. A genus's page describes the genus, not the plant.
 */
export function ncsuPageFor(rec, sp, pages, hasPage) {
  if (Object.hasOwn(pages, rec.id)) return pages[rec.id] ?? undefined;
  if (sp.genusOnly) return undefined;
  const slug = ncsuSlug(sp.species);
  return hasPage(slug) ? slug : undefined;
}

/** USDA PLANTS's symbol for a species, from its saved name search (usda-pick.mjs), or null. */
export function usdaFor(species, root = 'catalog-src') {
  const page = savedPage('usda', searchUrl(species), root);
  if (!page) return null;
  let results = null;
  try { results = JSON.parse(page.text); } catch { return null; }
  const profileName = (symbol) => { try { return JSON.parse(savedPage('usda', profileUrl(symbol), root)?.text ?? 'null')?.ScientificName ?? null; } catch { return null; } };
  return pickSymbol(species, results, profileName);
}

/**
 * The list for a catalog. `hasNcsu(slug)`: whether that NC State page is saved; `usda(species)`: its pick.
 * A genus alone gets no USDA symbol (its search would find the genus, or a species of it).
 */
export function auditList(catalog, { pages = {}, hasNcsu = () => false, usda = () => null } = {}) {
  return catalog.plants.map((rec) => {
    const sp = speciesOf(rec.botanical);
    const ncsu = ncsuPageFor(rec, sp, pages, hasNcsu);
    const pick = sp.genusOnly ? null : usda(sp.species);
    return { id: rec.id, species: sp.species, ...(ncsu ? { ncsu } : {}), ...(pick ? { usda: pick } : {}), ...(sp.genusOnly ? { genusOnly: true } : {}) };
  });
}

/** The list, from the saved pages in catalog-src/. */
export function savedAuditList(catalog, root = 'catalog-src', pagesPath) {
  const memo = new Map();
  const usda = (s) => (memo.has(s) ? memo.get(s) : memo.set(s, usdaFor(s, root)).get(s));
  return auditList(catalog, { pages: readNcsuPages(pagesPath), hasNcsu: (slug) => !!savedPage('ncsu', ncsuUrl(slug), root), usda });
}

/**
 * The pages a list needs that aren't saved: NC State's page for each species with none (never asked: a page
 * NC State doesn't have answers 404, which is kept, so each is asked once), and each page the list names that
 * isn't saved; USDA PLANTS's name search for each
 * species; the profile of every candidate a search found (the pick checks each); each pick's characteristics.
 */
export function toFetch(list, root = 'catalog-src') {
  const species = list.filter((s) => !s.genusOnly);
  // (And a page ncsu-pages.json names that isn't saved: the list names it all the same.)
  const ncsu = [...new Set([...species.filter((s) => !s.ncsu).map((s) => ncsuUrl(ncsuSlug(s.species))), ...list.filter((s) => s.ncsu).map((s) => ncsuUrl(s.ncsu))])]
    .filter((u) => !savedMeta('ncsu', u, root));
  const searches = [...new Set(species.map((s) => searchUrl(s.species)))].filter((u) => !savedPage('usda', u, root));
  const profiles = new Set();
  for (const s of species) {
    let results = null;
    try { results = JSON.parse(savedPage('usda', searchUrl(s.species), root)?.text ?? 'null'); } catch { /* none */ }
    for (const c of symbolCandidates(s.species, results)) profiles.add(profileUrl(c.symbol));
  }
  const chars = new Set(list.filter((s) => s.usda).map((s) => characteristicsUrl(s.usda.id)));
  return { ncsu, searches, profiles: [...profiles, ...chars].filter((u) => !savedPage('usda', u, root)) };
}
