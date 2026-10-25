// The audit's plant list, worked out from the catalog (docs/catalog-build.md): for each record, in the
// catalog's order, { id, species, genusOnly?, ncsu?, usda? }, which sample.mjs reads. Nothing in it is chosen
// by hand except scripts/catalog/ncsu-pages.json (the NC State pages that don't follow the rule) and the
// reviewed lists the USDA pick already keeps (usda-pick.mjs `PICK`, usda-counties.mjs `SAME_PLANT`).
import { readFileSync } from 'node:fs';
import { savedMeta, savedPage } from './pages.mjs';
import { characteristicsUrl, pickSymbol, profileUrl, searchUrl, symbolCandidates } from './usda-pick.mjs';

/**
 * The species a record's botanical name names, and whether it names only a genus. "Fothergilla × intermedia"
 * names the hybrid species, as does "Magnolia x soulangeana" (× written as x); "Salvia azurea 'Nekan'" names
 * Salvia azurea; a lowercase second word names the species ("Distylium hybrids" too, as the audit read it);
 * anything else ("Hosta spp.", "Rosa 'Julia Child'", "Ilex x 'Nellie R. Stevens'", "Artemisia hybrid") names
 * only its genus.
 */
export function speciesOf(botanical) {
  const w = String(botanical ?? '').replace(/\s+/g, ' ').trim().split(' ');
  if ((w[1] === '×' || w[1] === 'x') && /^[a-zë-]+$/.test(w[2] ?? '')) return { species: `${w[0]} × ${w[2]}` };
  if (/^[a-zë-]+$/.test(w[1] ?? '') && w[1] !== 'x' && w[1] !== 'hybrid') return { species: `${w[0]} ${w[1]}` };
  return { species: w[0], genusOnly: true };
}

/** NC State's page name for a species ("Itea virginica" → itea-virginica; × is x). */
export const ncsuSlug = (name) => name.toLowerCase().replace(/×/g, 'x').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const ncsuUrl = (slug) => `https://plants.ces.ncsu.edu/plants/${slug}/`;

/**
 * scripts/catalog/ncsu-pages.json: { pages: { record id: slug, or null for none }, names: { record id: the name its
 * page gives } }, `names` for a page reviewed as the record's plant under another name (NC State's misspelling, a
 * synonym, or the new name of a page NC State moved). By record: another record reaching the same page isn't
 * accepted by it.
 */
export const readNcsuFile = (path = 'scripts/catalog/ncsu-pages.json') => JSON.parse(readFileSync(path, 'utf8'));
export const readNcsuPages = (path) => readNcsuFile(path).pages;

/**
 * The NC State page a record reads: the one ncsu-pages.json names for it (null: none); else, for a species
 * (not a genus alone), its species page if one is saved. A genus's page describes the genus, not the plant.
 */
export function ncsuPageFor(rec, sp, pages, hasPage, movedTo = () => null) {
  if (Object.hasOwn(pages, rec.id)) return pages[rec.id] ?? undefined;
  if (sp.genusOnly) return undefined;
  const slug = ncsuSlug(sp.species);
  if (hasPage(slug)) return slug;
  // (NC State moves a page when it renames the plant: "coreopsis-verticillata" answers 301 to "anacis-verticillata".
  // The page is read only once its name is reviewed as the plant's: ncsu-pages.json `names`.)
  const moved = movedTo(slug);
  return moved && hasPage(moved) ? moved : undefined;
}

/** Where NC State moved a page (its 3xx answer, saved), as a page name; or null. */
export function ncsuMovedTo(slug, root = 'catalog-src') {
  const m = savedMeta('ncsu', ncsuUrl(slug), root);
  if (!(m?.status >= 300 && m.status < 400)) return null;
  return /^(?:https:\/\/plants\.ces\.ncsu\.edu)?\/plants\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/.exec(m.location ?? '')?.[1] ?? null;
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
export function auditList(catalog, { pages = {}, names = {}, hasNcsu = () => false, movedTo = () => null, usda = () => null } = {}) {
  return catalog.plants.map((rec) => {
    const sp = speciesOf(rec.botanical);
    const ncsu = ncsuPageFor(rec, sp, pages, hasNcsu, movedTo);
    const pick = sp.genusOnly ? null : usda(sp.species);
    return { id: rec.id, species: sp.species, ...(ncsu ? { ncsu } : {}), ...(ncsu && names[rec.id] ? { ncsuName: names[rec.id] } : {}), ...(pick ? { usda: pick } : {}), ...(sp.genusOnly ? { genusOnly: true } : {}) };
  });
}

/**
 * The list, from the saved pages in catalog-src/. `extraPages`: record id → NC State page name, for plants added
 * from NC State (additions.mjs). A page ncsu-pages.json names for one, chosen by hand, comes first.
 */
export function savedAuditList(catalog, root = 'catalog-src', pagesPath, extraPages = {}) {
  const memo = new Map();
  const usda = (s) => (memo.has(s) ? memo.get(s) : memo.set(s, usdaFor(s, root)).get(s));
  const file = readNcsuFile(pagesPath);
  return auditList(catalog, { pages: { ...extraPages, ...file.pages }, names: file.names ?? {}, hasNcsu: (slug) => !!savedPage('ncsu', ncsuUrl(slug), root), movedTo: (slug) => ncsuMovedTo(slug, root), usda });
}

/**
 * The pages a list needs that were never asked for (any answer is kept, a 404 too, so each is asked once):
 * `ncsu`, NC State's page for each species with none; `named`, each NC State page the list names that isn't
 * saved; `searches`, USDA PLANTS's name search for each (not a hybrid's)
 * species; the profile of every candidate a search found (the pick checks each); each pick's characteristics.
 */
export function toFetch(list, root = 'catalog-src') {
  const species = list.filter((s) => !s.genusOnly);
  const asked = (source) => (u) => !savedMeta(source, u, root); // (any answer kept: a page, a 404, a redirect)
  // (A page NC State moved: the page it moved to.)
  const own = (s) => { const slug = ncsuSlug(s.species), moved = ncsuMovedTo(slug, root); return ncsuUrl(moved ?? slug); };
  const ncsu = [...new Set(species.filter((s) => !s.ncsu).map(own))].filter(asked('ncsu'));
  // (A page ncsu-pages.json names that isn't saved: the list names it all the same.)
  const named = [...new Set(list.filter((s) => s.ncsu).map((s) => ncsuUrl(s.ncsu)))].filter(asked('ncsu'));
  // (A page the list names that NC State moved: where to, by the page name. Followed only for a species' own page.)
  const moved = Object.fromEntries(list.filter((s) => s.ncsu && ncsuMovedTo(s.ncsu, root)).map((s) => [s.ncsu, ncsuMovedTo(s.ncsu, root)]));
  // (Not a hybrid species': usda-pick never takes a hybrid's entry for a species.)
  const searches = [...new Set(species.filter((s) => !s.species.includes('×')).map((s) => searchUrl(s.species)))].filter(asked('usda'));
  const profiles = new Set();
  for (const s of species) {
    let results = null;
    try { results = JSON.parse(savedPage('usda', searchUrl(s.species), root)?.text ?? 'null'); } catch { /* none */ }
    for (const c of symbolCandidates(s.species, results)) profiles.add(profileUrl(c.symbol));
  }
  const chars = new Set(list.filter((s) => s.usda).map((s) => characteristicsUrl(s.usda.id)));
  return { ncsu, named, moved, searches, profiles: [...profiles, ...chars].filter(asked('usda')) };
}
