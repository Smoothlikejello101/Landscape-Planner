// Read the web claims again from the pages already saved, with today's reader (web.mjs), so a fix to the
// reader reaches every plant without searching again (docs/catalog-build.md). The pages are the ones the
// search's claims cite (catalog-src/web-claims.json, search.mjs's output): a page that gave nothing then isn't
// among them, and isn't read.
import { savedPage } from './pages.mjs';
import { paragraphKey, webClaims, webParagraphs } from './web.mjs';
import { siteOf } from './fetch-lib.mjs';
import { quotedCultivars } from './ncsu-page.mjs';

/** The cultivar a record names ("Itea virginica 'Little Henry'" → Little Henry), or null. */
export const cultivarOf = (rec) => quotedCultivars(rec?.botanical)[0] ?? quotedCultivars(rec?.common)[0] ?? null;

/**
 * `searched`: { plant id: [claim, …] } as the search wrote them; `list`: the audit's plant list (list.mjs);
 * `catalog`: public/plants.json. Returns { claims: { plant id: [claim, …] }, pages, missing }: only plants in
 * the list, each page read once.
 */
export function rereadClaims(searched, list, catalog, root = 'catalog-src') {
  const byId = new Map(catalog.plants.map((p) => [p.id, p]));
  const claims = {};
  let pages = 0, missing = 0;
  const boilerplate = siteBoilerplate(searched, list, root);
  for (const s of list) {
    const old = searched[s.id];
    if (!old) continue;
    const rec = byId.get(s.id) ?? {};
    const plant = { species: s.species, cultivar: cultivarOf(rec), common: rec.common ?? '' };
    claims[s.id] = [];
    for (const url of [...new Set(old.map((c) => c.url))]) {
      const p = savedPage('web', url, root);
      if (!p) { missing++; continue; }
      pages++;
      claims[s.id].push(...webClaims(url, p.text, plant, { boilerplate: boilerplate.get(siteOf(new URL(url).hostname)) }));
    }
  }
  return { claims, pages, missing };
}

/**
 * Each site's boilerplate: a paragraph naming a plant (a binomial, a quoted cultivar) on pages for two or more
 * species: a related product's blurb, a genus's trivia, companions to plant with; and a paragraph on most of its pages
 * (three species or more), a legend of terms. A
 * nursery's stock sentence said of each plant it fits ("Plants are pest resistant and unpalatable to deer") names none,
 * and stays: it's said of this plant too. A site that shares one description among a species' cultivars keeps it.
 */
export function siteBoilerplate(searched, list, root = 'catalog-src') {
  const seen = new Map(); // site → paragraph key → { urls, species }
  const done = new Set();
  for (const s of list) {
    for (const url of [...new Set((searched[s.id] ?? []).map((c) => c.url))]) {
      if (done.has(`${url} ${s.species}`)) continue;
      done.add(`${url} ${s.species}`);
      const p = savedPage('web', url, root);
      if (!p) continue;
      const site = siteOf(new URL(url).hostname);
      const keys = seen.get(site) ?? seen.set(site, new Map()).get(site);
      const texts = new Map(webParagraphs(p.text).map((t) => [paragraphKey(t), t]));
      for (const [k, t] of texts) {
        const e = keys.get(k) ?? keys.set(k, { urls: new Set(), species: new Set(), text: '' }).get(k);
        e.urls.add(url); e.species.add(s.species); e.text ||= t;
      }
    }
  }
  const out = new Map();
  // (A plant's name: a genus the list knows, followed by its epithet, "spp." or "×"; or a quoted cultivar.)
  const genera = new Set(list.map((s) => String(s.species ?? '').split(' ')[0]).filter((g) => /^[A-Z][a-z]+$/.test(g)));
  const namesAPlant = (t) => /['‘’"“][A-Z][\w ]{1,30}['’"”]/.test(t) || [...t.matchAll(/\b([A-Z][a-z]+) (?:[a-z]{3,}|spp?\.|×)/g)].some((m) => genera.has(m[1]));
  // (And a legend on most of a site's pages, naming no plant: "Suckering: sends up new shoots … into a thicket".)
  for (const [site, keys] of seen) {
    const pages = new Set([...keys.values()].flatMap((e) => [...e.urls])).size;
    out.set(site, new Set([...keys].filter(([, e]) => (namesAPlant(e.text) && e.urls.size >= 2 && e.species.size >= 2) || (e.urls.size >= 4 && e.species.size >= 3 && e.urls.size >= 0.6 * pages)).map(([k]) => k)));
  }
  return out;
}
