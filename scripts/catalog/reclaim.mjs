// Read the web claims again from the pages already saved, with today's reader (web.mjs), so a fix to the
// reader reaches every plant without searching again (docs/catalog-build.md). The pages are the ones the
// search's claims cite (catalog-src/web-claims.json, search.mjs's output): a page that gave nothing then isn't
// among them, and isn't read.
import { savedPage } from './pages.mjs';
import { webClaims } from './web.mjs';

/** The cultivar a record names ("Itea virginica 'Little Henry'" → Little Henry), or null. */
export const cultivarOf = (rec) => (/'([^']+)'/.exec(rec?.botanical ?? '') ?? /'([^']+)'/.exec(rec?.common ?? ''))?.[1] ?? null;

/**
 * `searched`: { plant id: [claim, …] } as the search wrote them; `list`: the audit's plant list (list.mjs);
 * `catalog`: public/plants.json. Returns { claims: { plant id: [claim, …] }, pages, missing }: only plants in
 * the list, each page read once.
 */
export function rereadClaims(searched, list, catalog, root = 'catalog-src') {
  const byId = new Map(catalog.plants.map((p) => [p.id, p]));
  const claims = {};
  let pages = 0, missing = 0;
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
      claims[s.id].push(...webClaims(url, p.text, plant));
    }
  }
  return { claims, pages, missing };
}
