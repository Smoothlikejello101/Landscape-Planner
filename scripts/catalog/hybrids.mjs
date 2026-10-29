// A hybrid's parents, for poison to people (Jason, 2026-10-29: "Flag poison on unrated hybrids based on the parent
// plants"). A hybrid no source rates for people (no `poison`, or NC State's page read and listing none) gets
// `poison_parents`: its parent species and how each is rated, where at least one is rated. The hybrid itself stays
// unrated: the app says "No rating available for this hybrid" and what its parents are rated
// (docs/catalog-format.md).
//
// Its parents: from its own name where the name is the cross (Morus alba x rubra: white and red mulberry), else
// from Kew's World Checklist's hybrid formula for a named hybrid (Abelia × grandiflora: A. chinensis × A. uniflora;
// catalog-src/wcvp-hybrids.json, written by wcvp.mjs). A cultivar of unknown parentage (Rudbeckia × 'American Gold
// Rush') has none. A parent's rating: its catalog record's, else NC State's saved page for it, as the catalog reads
// NC State (claims.mjs ncsuPoison). Nothing is fetched here.
//
// Run by build.mjs after the Kew step: node scripts/catalog/hybrids.mjs (rewrites public/plants.json).
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { ncsuNoPoison, ncsuPoison } from './claims.mjs';
import { ncsuFields } from './extract.mjs';
import { ncsuSlug, ncsuUrl } from './list.mjs';
import { savedPage } from './pages.mjs';

/** Kew's World Checklist, as the wild records credit it. */
export const WCVP_SOURCE = { title: 'World Checklist of Vascular Plants v16 (Royal Botanic Gardens, Kew; CC BY 3.0)', url: 'https://doi.org/10.34885/egs6-cp24', trust: 'reference' };

/**
 * What a hybrid's name says: `cross` (its parents named: "Morus alba x rubra", "Ilex verticillata × serrata"),
 * `named` (a named hybrid, "Genus × epithet", its parents Kew's to say; `wcvp` its name as Kew writes it), or null
 * (not a hybrid, or no epithet to look up: "Rudbeckia × 'American Gold Rush'", "Ilex x 'Nellie R. Stevens'").
 */
export function hybridName(botanical) {
  const b = String(botanical ?? '').replace(/\s+/g, ' ').trim();
  const cross = /^([A-Z][a-z]+) ([a-z][a-z-]+) (?:×|x) (?:([A-Z])\. )?([a-z][a-z-]+)\b(?!['’])/.exec(b);
  if (cross && (!cross[3] || cross[3] === cross[1][0])) return { kind: 'cross', parents: [`${cross[1]} ${cross[2]}`, `${cross[1]} ${cross[4]}`] };
  const named = /^(×\s?|x )?([A-Z][a-z]+) (?:×|x) ([a-z][a-z-]+)\b(?!['’])/.exec(b);
  if (named && !named[1]) return { kind: 'named', wcvp: `${named[2]} × ${named[3]}` };
  const genusHybrid = /^(?:×\s?|x )([A-Z][a-z]+) ([a-z][a-z-]+)\b(?!['’])/.exec(b);
  if (genusHybrid) return { kind: 'named', wcvp: `× ${genusHybrid[1]} ${genusHybrid[2]}` };
  return null;
}

/**
 * The parent species in Kew's hybrid formula ("A. chinensis × A. uniflora", "Catalpa bignonioides × Chilopsis
 * linearis"), an abbreviated genus spelled out from `genus` (the hybrid's own, or the last one written in full).
 * Parts that aren't a plain species (a genus alone, "sp.", a further cross in brackets taken apart) are left out.
 */
export function formulaParents(formula, genus) {
  const out = [];
  let last = genus;
  for (const part of String(formula ?? '').replace(/[()]/g, ' ').split('×')) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) continue;
    let [g, e] = words;
    if (/^[A-Z]\.$/.test(g)) { if (!last || last[0] !== g[0]) continue; g = last; }
    if (!/^[A-Z][a-z]+$/.test(g) || !/^[a-z][a-z-]+$/.test(e) || e === 'sp' || e === 'spp') continue;
    last = g;
    const name = `${g} ${e}`;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** The genus a botanical name starts with (a genus hybrid's "×" set aside). */
const genusOf = (botanical) => /^(?:×\s?|x )?([A-Z][a-z]+)/.exec(String(botanical ?? ''))?.[1] ?? '';

/** A sourced fact's value: { v } as written, or a bare value (older records). */
const valueOf = (f) => (f && typeof f === 'object' && !Array.isArray(f) && 'v' in f ? f.v : f);

/**
 * How a parent species is rated for people: its catalog record's `poison` (a rating, or null: none listed), else
 * NC State's saved page's; undefined where neither says. `records`: species records by lowercased botanical name.
 */
export function parentRating(name, records, page = (n) => savedPage('ncsu', ncsuUrl(ncsuSlug(n)))?.text ?? null) {
  const rec = records.get(name.toLowerCase());
  const out = { name };
  if (rec) { out.id = rec.id; out.common = rec.common; }
  const f = rec?.facts?.poison;
  if (f !== undefined) {
    const v = valueOf(f);
    if (v === null || (v && typeof v === 'object')) { out.poison = v; out.src = f.src ?? rec.src ?? []; return out; }
  }
  const html = page(name);
  if (html) {
    const fields = ncsuFields(html);
    const rated = ncsuPoison(fields);
    if (rated) { out.poison = rated; out.src = ['ncsu']; } else if (ncsuNoPoison(fields)) { out.poison = null; out.src = ['ncsu']; }
  }
  return out;
}

/** Whether a record's hybrid has no rating of its own for people: no `poison`, or one listing none. */
const unrated = (rec) => rec.facts.poison === undefined || valueOf(rec.facts.poison) == null;

/**
 * `poison_parents` for each unrated hybrid with a rated parent (a cultivar under a hybrid species record takes its
 * species', as the app does: not written again). Returns { plants, written, noParents, unratedParents }, the
 * catalog's plants changed in place.
 */
export function hybridParents(catalog, kew, page) {
  const records = new Map();
  for (const r of catalog.plants) if (r.botanical && !r.parent && !/['’]/.test(r.botanical) && !hybridName(r.botanical)) records.set(r.botanical.toLowerCase(), r);
  const byId = new Map(catalog.plants.map((r) => [r.id, r]));
  let written = 0, noParents = 0, unratedParents = 0;
  for (const rec of catalog.plants) {
    const h = hybridName(rec.botanical);
    if (!h) { delete rec.facts.poison_parents; continue; }
    if (rec.parent && hybridName(byId.get(rec.parent)?.botanical)) { delete rec.facts.poison_parents; continue; }
    if (!unrated(rec)) { delete rec.facts.poison_parents; continue; }
    const names = h.kind === 'cross' ? h.parents : formulaParents(kew[rec.id]?.formula, genusOf(rec.botanical));
    if (names.length < 2) { delete rec.facts.poison_parents; noParents++; continue; }
    const parents = names.map((n) => parentRating(n, records, page));
    if (!parents.some((p) => p.poison)) { delete rec.facts.poison_parents; unratedParents++; continue; }
    const src = [...new Set([...(h.kind === 'named' ? ['wcvp'] : []), ...parents.flatMap((p) => p.src ?? [])])];
    rec.facts.poison_parents = {
      v: { via: h.kind === 'cross' ? 'name' : 'kew', parents: parents.map(({ src: _s, ...p }) => p) },
      src,
    };
    written++;
  }
  if (catalog.plants.some((r) => r.facts.poison_parents?.src?.includes('wcvp'))) catalog.meta.sources.wcvp ??= WCVP_SOURCE;
  return { plants: catalog.plants, written, noParents, unratedParents };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { catalogText } = await import('./convert-v1.mjs');
  const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8'));
  let kew = {};
  try { kew = JSON.parse(readFileSync('catalog-src/wcvp-hybrids.json', 'utf8')); } catch { /* none yet: crosses by name only */ }
  const r = hybridParents(catalog, kew);
  writeFileSync('public/plants.json.tmp', catalogText(catalog));
  renameSync('public/plants.json.tmp', 'public/plants.json');
  console.log(`${r.written} hybrids with no rating of their own get their parents' (${r.noParents} with no parents known, ${r.unratedParents} whose parents aren't rated either)`);
}
