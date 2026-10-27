// New plants from NC State's Plant Toolbox (docs/catalog-build.md, "Adding plants"). Each plant page its sitemap
// lists that is saved, and that no catalog record reads, becomes a record with names and no facts. The build's
// sources then fill it like any other, and it stays only once they give what the app needs to place it
// (`missingToShip`): its form, its size, its hardiness and its sun. One that doesn't is left out until they do.
//
// Which pages: every plant page but a vegetable's (vegetable gardening is left out of the app) and a weed's
// (NC State's "Weed" tag takes in lawn weeds and invasives, which the picker would otherwise suggest). Either one
// tagged "Native Plant" too is kept: wild garlic is a cool-season vegetable to NC State, aster a weed, and both are
// garden natives. (Invasives already in the catalog stay: their records say so, and the picker never suggests them.)
// A page whose plant the catalog already has under the same name, read from another page, is left out too.
//
// The page each added plant was found on is kept in scripts/catalog/added-plants.json (the build writes it), so later
// builds read the same page for it and don't add it again. That holds once its record is deleted, too: to keep an
// added plant out, delete its record; to have it added again, delete its line in that file as well.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { ncsuFields } from './extract.mjs';
import { ncsuTitle, quotedCultivars, recordCultivars, titleCultivar, withoutCultivars } from './ncsu-page.mjs';
import { savedMeta, savedPage } from './pages.mjs';
import { ncsuUrl, speciesOf, usdaFor } from './list.mjs';
import { profileUrl, searchUrl } from './usda-pick.mjs';
import { GBIF_NAME, matchUrl, speciesUrl } from './gbif.mjs';

export const SITEMAP = 'https://plants.ces.ncsu.edu/sitemap.xml';
export const ADDED = 'scripts/catalog/added-plants.json';
const ABOUT = 'The NC State Extension Gardener Plant Toolbox page each plant added from it was found on (scripts/catalog/additions.mjs; docs/catalog-build.md, "Adding plants"): record id to the page name under https://plants.ces.ncsu.edu/plants/. Written by the build. A page here is never added again, its record deleted or not: delete its line to have it added again.';

/** The pages added plants were found on (record id → page name), from scripts/catalog/added-plants.json; none without it. */
export const readAdded = (path = ADDED) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).pages ?? {} : {});
/** Keep the pages these added plants were found on (record id → page name), beside those kept before. */
export function writeAdded(pages, path = ADDED) {
  const all = { ...readAdded(path), ...pages };
  const sorted = Object.fromEntries(Object.entries(all).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ v: 1, about: ABOUT, pages: sorted }, null, 1) + '\n');
  renameSync(tmp, path);
}

/** The plant pages a sitemap lists, by page name ("abelia-chinensis"), once each, in its order. */
export function sitemapSlugs(xml) {
  return [...new Set([...String(xml ?? '').matchAll(/<loc>https:\/\/plants\.ces\.ncsu\.edu\/plants\/([a-z0-9]+(?:-[a-z0-9]+)*)\/<\/loc>/g)].map((m) => m[1]))];
}

const ENTITIES = { '&#x27;': "'", '&#39;': "'", '&apos;': "'", '&#8216;': "'", '&#8217;': "'", '&quot;': '"', '&amp;': '&', '&nbsp;': ' ', '&#8482;': '', '&trade;': '', '&#174;': '', '&reg;': '' };
const decode = (s) => String(s).replace(/&#x27;|&#39;|&apos;|&#8216;|&#8217;|&quot;|&amp;|&nbsp;|&#8482;|&trade;|&#174;|&reg;/g, (e) => ENTITIES[e]).replace(/[‘’]/g, "'").replace(/[™®]/g, '');
/**
 * The common names a page's title gives, in its order (NC State lists them alphabetically), each once: "Abelia
 * x grandiflora 'Hopley's' (Miss Lemon, Miss Lemon™, Twist of Lime, Twist of Lime™ Abelia)" → Miss Lemon, Twist
 * of Lime, Twist of Lime Abelia. None for a title without them.
 */
export function pageCommons(html) {
  const t = decode(/<title>([\s\S]*?)<\/title>/.exec(html ?? '')?.[1] ?? '').replace(/\s+/g, ' ');
  // (The last parenthesis before the site's name: a cultivar's own name can hold one.)
  const m = /\(([^()]*)\)\s*\|[^|]*$/.exec(t);
  if (!m) return [];
  return [...new Set(m[1].split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean))];
}
/**
 * The plant's name as NC State titles it, with × for a hybrid ("Abelia x grandiflora" → "Abelia × grandiflora",
 * "Ilex verticillata x serrata" → "Ilex verticillata × serrata"), and without ® or ™.
 */
export const pageBotanical = (html) => ncsuTitle(html).replace(/[®™]/g, '').replace(/\s+/g, ' ').trim()
  .replace(/^(\S+) x (?=[a-zë-])/, '$1 × ').replace(/^(\S+ [a-zë-]+) x (?=[a-zë-])/, '$1 × ');
/** A cross of two species written as one ("Ilex verticillata x serrata"): no one species' name is its own. */
export const hybridFormula = (botanical) => /^\S+ [a-zë-]+ [x×] [a-zë-]+/.test(botanical ?? '');
/**
 * The trade name or group a title gives beside (or instead of) a cultivar: "Echinacea purpurea PowWow Wild Berry
 * 'PAS702917'" → PowWow Wild Berry; "Berberis thunbergii Sunjoy Group" → Sunjoy Group; "Acer Crimson Sunset
 * 'JFS-KW202'" → Crimson Sunset. Null for a species, a variety or a cross of two species.
 */
export function tradeName(botanical) {
  const words = withoutCultivars(botanical ?? '').replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).slice(1);
  let i = 0;
  if (words[i] === '×') i++;
  if (/^[a-zë-]+$/.test(words[i] ?? '')) i++; // (the epithet)
  if (/^[x×]$/.test(words[i] ?? '') && /^[a-zë-]+$/.test(words[i + 1] ?? '')) i += 2; // (a cross: "aucheri x bucharica")
  if (/^(var|subsp|ssp|f)\.$/.test(words[i] ?? '')) i += 2; // (a variety or the like)
  const rest = words.slice(i).join(' ').trim();
  return rest || null;
}

/** Why a page's plant is left out (its tags: `fields['Plant Type']`), or null to add it. */
export function leftOutWhy(fields) {
  const tags = new Set(fields?.['Plant Type'] ?? []);
  if (tags.has('Native Plant')) return null;
  if (['Vegetable', 'Warm Season Vegetable', 'Cool Season Vegetable'].some((t) => tags.has(t))) return 'a vegetable';
  if (tags.has('Weed')) return 'a weed';
  return null;
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const norm = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/×/g, 'x').replace(/\s+/g, ' ').trim().toLowerCase();
/**
 * Which plant a name is, to find one the catalog has under the same name: the botanical name without its cultivar,
 * and the cultivar ("abelia x grandiflora|sunrise"). A variety is its own plant ("acer rubrum var. drummondii|").
 */
export const nameKey = (botanical, cultivar) => `${norm(withoutCultivars(norm(botanical), ''))}|${norm(cultivar)}`;
/**
 * The keys a record answers to: one for each cultivar it names, or its own name; and the same under the spelling
 * GBIF's backbone gives the species, where the catalog's differs (gbif.mjs GBIF_NAME: NC State's "Andropogon
 * gerardi" is the catalog's Andropogon gerardii).
 */
const recordKeys = (r) => {
  const cvs = recordCultivars(r);
  const names = [r.botanical];
  const sp = speciesOf(r.botanical ?? '').species;
  if (sp && GBIF_NAME[sp]) names.push(String(r.botanical).replace(sp, GBIF_NAME[sp]));
  return names.flatMap((b) => (cvs.length ? cvs.map((c) => nameKey(b, c)) : [nameKey(b, null)]));
};
/**
 * The name the app shows for a new plant. A cultivar: NC State's name for it that starts with the cultivar
 * ("'Edward Goucher' Glossy Abelia"), else its species' name and the cultivar ("Glossy abelia 'Sunrise'"). A
 * species: USDA's common name, where its symbol is known ("Balsam fir"); else GBIF's English name ("Korean fir");
 * else NC State's, where it gives just one; else its botanical name. (NC State lists a plant's names
 * alphabetically, in several languages, and often a related plant's: "Abeto Del Colorado, Balsam Fir, Colorado
 * Fir, …" for white fir. Which one is the plant's can't be told from the list.)
 */
export function commonName({ botanical, commons, cultivar, trade, usdaCommon, gbifCommon, speciesCommon }) {
  // (A cross of two species: USDA's and GBIF's names are its first parent's, not its own. A variety's or
  // subspecies' are its species': said with its own part, "Swamp milkweed (subsp. pulchra)".)
  const infra = /\b((?:var|subsp|ssp|f)\. [a-zë-]+)/.exec(withoutCultivars(botanical ?? '', ''))?.[1];
  const species = hybridFormula(botanical) ? null : (usdaCommon && cap(usdaCommon)) || (gbifCommon && cap(gbifCommon)) || null;
  const named = species && infra ? `${species} (${infra})` : species;
  if (cultivar || trade) {
    const has = (c, n) => !!n && new RegExp(`(^|[^A-Za-z])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z])`, 'i').test(c);
    const own = (cultivar && commons.find((c) => c.startsWith(`'${cultivar}'`))) || commons.find((c) => has(c, cultivar) || has(c, trade));
    if (own) return own;
    // (Its species' name, without a note such as "(species)"; then the cultivar, or the trade name where the
    // cultivar is a breeder's code: "Purple coneflower PowWow Wild Berry", not "… 'PAS702917'".)
    const of = speciesCommon?.replace(/\s*\([^)]*\)\s*$/, '') || named;
    const code = !!cultivar && (/\d/.test(cultivar) || /^[A-Z-]+$/.test(cultivar));
    const label = cultivar && (!code || !trade) ? `'${cultivar}'` : trade;
    return of ? `${of} ${label}` : botanical;
  }
  // (A variety's own name from NC State, where it gives just one, says more than its species' with a note.)
  if (infra && commons.length === 1) return commons[0];
  return named || (commons.length === 1 ? commons[0] : botanical);
}

/**
 * The NC State pages the catalog's records already read, as `newRecords` takes them (`used`): every record's
 * (`list`: the plant list), but a cultivar's (or a named group's) only where ncsu-pages.json names the page for it
 * by hand (`chosen`, record id → page). A cultivar reading its species' page doesn't make the species one of the
 * catalog's plants: Butterfly weed 'for Clay' reads Asclepias tuberosa's page, and the species is added beside it.
 */
export function pagesInUse(catalog, list, chosen = {}) {
  const named = new Set(catalog.plants.filter((r) => r.parent || recordCultivars(r).length || tradeName(r.botanical)).map((r) => r.id));
  return list.filter((e) => e.ncsu && (!named.has(e.id) || Object.hasOwn(chosen, e.id))).map((e) => e.ncsu);
}

/** A record id from a page name, kept clear of the ids taken. */
export function newId(slug, taken) {
  let id = slug, n = 2;
  while (taken.has(id)) id = `${slug}-${n++}`;
  return id;
}

/**
 * The new records for a catalog, from the saved sitemap and pages. `used`: the NC State pages records already read
 * (the plant list's `ncsu`), with those added plants were found on before (`added`, added-plants.json's).
 * `usdaCommon(species)`: USDA's common name for a species, or null. Returns the records (names, no facts), the page
 * each reads (`pages`, record id → page name), and the pages left out with why (one the catalog has by name: with
 * the record's id). A cultivar's record names its species' as its parent, where the catalog has (or gains) a record
 * for exactly that species.
 */
export function newRecords(catalog, used, { root = 'catalog-src', usdaCommon = () => null, gbifCommon = () => null, added = {} } = {}) {
  const sitemap = savedPage('ncsu', SITEMAP, root);
  if (!sitemap) return { records: [], pages: {}, left: [], unsaved: 0 };
  const taken = new Set(catalog.plants.map((r) => r.id));
  const usedPages = new Set([...used, ...Object.values(added)]);
  const named = new Map();
  for (const r of catalog.plants) for (const k of recordKeys(r)) if (!named.has(k)) named.set(k, { id: r.id });
  const isCultivar = (r) => !!r.parent || recordCultivars(r).length > 0; // (not "Stokes' aster")
  const speciesRecord = new Map();
  for (const r of catalog.plants) if (r.botanical && !isCultivar(r) && !speciesOf(r.botanical).genusOnly) speciesRecord.set(r.botanical, r);
  const found = [], left = [];
  let unsaved = 0;
  for (const slug of sitemapSlugs(sitemap.text)) {
    if (usedPages.has(slug)) continue;
    const page = savedPage('ncsu', ncsuUrl(slug), root);
    if (!page || !(savedMeta('ncsu', ncsuUrl(slug), root)?.status === 200)) { unsaved++; continue; }
    const fields = ncsuFields(page.text);
    const why = leftOutWhy(fields);
    if (why) { left.push({ slug, why }); continue; }
    const botanical = pageBotanical(page.text);
    if (!botanical) { left.push({ slug, why: 'no name' }); continue; }
    const sp = speciesOf(botanical), cultivar = titleCultivar(page.text), trade = tradeName(botanical);
    // (A genus's own page describes the genus, not a plant: "Hosta". A cultivar of a genus is one plant, and so is a
    // named group or series: "Berberis thunbergii Sunjoy Group".)
    if (sp.genusOnly && !cultivar && !trade) { left.push({ slug, why: 'a genus' }); continue; }
    // (The catalog's under that name, reading another page; or NC State has two pages for it: the first is added.)
    const key = nameKey(botanical, cultivar), has = named.get(key);
    if (has) { left.push({ slug, why: has.id ? 'in the catalog' : 'a second page', ...(has.id ? { id: has.id } : { page: has.slug }) }); continue; }
    named.set(key, { slug });
    found.push({ slug, botanical, cultivar, trade, named: !!(cultivar || trade), species: sp.genusOnly ? null : sp.species, commons: pageCommons(page.text) });
  }
  // Species first, so a cultivar (or a named group) finds a species added beside it.
  found.sort((a, b) => Number(a.named) - Number(b.named));
  const records = [], pages = {};
  for (const f of found) {
    const parent = f.named && f.species ? speciesRecord.get(f.species) : undefined;
    const id = newId(f.slug, taken);
    taken.add(id);
    const usdaName = f.species ? usdaCommon(f.species) : null;
    const common = commonName({ botanical: f.botanical, commons: f.commons, cultivar: f.cultivar, trade: f.trade, usdaCommon: usdaName, gbifCommon: f.species && !usdaName ? gbifCommon(f.species) : null, speciesCommon: parent?.common });
    // (NC State's other names, to find it by: not the one it's shown by.)
    const others = f.commons.filter((c) => c.toLowerCase() !== common.toLowerCase());
    const rec = {
      id,
      common,
      botanical: f.botanical,
      ...(others.length ? { synonyms: others } : {}),
      ...(parent ? { parent: parent.id } : {}),
      src: ['ncsu'],
      audited: null,
      facts: {},
    };
    records.push(rec);
    pages[id] = f.slug;
    if (!f.named && f.species && !speciesRecord.has(f.botanical)) speciesRecord.set(f.botanical, rec);
  }
  return { records, pages, left, unsaved };
}

/** Facts a cultivar takes from its species (src/catalog.ts INHERITED, those the app needs to place a plant). */
const FROM_SPECIES = new Set(['form', 'zone_min', 'zone_max', 'sun_most', 'sun_least']);
/**
 * What a new record still lacks to be placed in a plan, each sourced (not the older list's): its form, its size
 * (height or spread), its hardiness (both zone limits) and its sun. A cultivar takes form, hardiness and sun from
 * its species. Empty: it ships.
 */
export function missingToShip(rec, byId, sources) {
  const parent = rec.parent ? byId.get(rec.parent) : undefined;
  const sourcedIn = (r, k) => {
    const f = r?.facts?.[k];
    return !!f && typeof f === 'object' && !Array.isArray(f) && 'v' in f && f.v != null && Array.isArray(f.src) && f.src.length > 0
      && !f.src.every((s) => sources[s]?.trust === 'unverified');
  };
  const has = (k) => sourcedIn(rec, k) || (FROM_SPECIES.has(k) && sourcedIn(parent, k));
  const missing = [];
  if (!has('form')) missing.push('form');
  if (!has('height') && !has('width')) missing.push('size');
  if (!has('zone_min') || !has('zone_max')) missing.push('hardiness');
  if (!has('sun_most')) missing.push('sun');
  return missing;
}

/**
 * The catalog with only the new records that ship (`added`: their ids), and why each other one waits. A cultivar
 * whose species waits waits too (its parent wouldn't be there).
 */
export function shipOnly(catalog, added) {
  const byId = new Map(catalog.plants.map((r) => [r.id, r]));
  const waiting = new Map();
  for (const r of catalog.plants) {
    if (!added.has(r.id) || r.parent) continue;
    const m = missingToShip(r, byId, catalog.meta.sources ?? {});
    if (m.length) waiting.set(r.id, m);
  }
  for (const r of catalog.plants) {
    if (!added.has(r.id) || !r.parent) continue;
    const m = waiting.has(r.parent) ? ['its species'] : missingToShip(r, byId, catalog.meta.sources ?? {});
    if (m.length) waiting.set(r.id, m);
  }
  return { file: { ...catalog, plants: catalog.plants.filter((r) => !waiting.has(r.id)) }, waiting };
}

const savedJson = (source, url, root) => { try { return JSON.parse(savedPage(source, url, root)?.text ?? 'null'); } catch { return null; } };
/** USDA's common name for a species ("balsam fir"), from its saved profile, where the list's pick has one. */
export function usdaCommonName(species, root = 'catalog-src') {
  const pick = usdaFor(species, root);
  return pick ? savedJson('usda', profileUrl(pick.symbol), root)?.CommonName || null : null;
}
/**
 * The backbone record a GBIF match is for, where it's the name itself: an exact match at species rank, accepted (or
 * doubtful). Not a synonym's accepted name (grapefruit, Citrus × paradisi, would be "Seville orange"), nor a
 * family's or genus's where GBIF had no species of that name ("birthwort family" for Asarum minus).
 */
const gbifKey = (match) => (match?.matchType === 'EXACT' && match.rank === 'SPECIES' && (match.status === 'ACCEPTED' || match.status === 'DOUBTFUL') ? match.usageKey ?? null : null);
/** GBIF's English name for a species ("Korean fir"), from its saved backbone match and record (`gbifKey`). */
export function gbifCommonName(species, root = 'catalog-src') {
  const key = gbifKey(savedJson('gbif', matchUrl(species), root));
  // (Its record can give several in one, "Australian tree fern, Lacy tree fern, …": the first.)
  const name = key ? savedJson('gbif', speciesUrl(key), root)?.vernacularName : null;
  return name ? String(name).split(/\s*[,;]\s*/)[0].trim() || null : null;
}
/** All of GBIF's English names for a species, as its record lists them ("Crimson fountaingrass, Fountain grass"). */
export function gbifNames(species, root = 'catalog-src') {
  const key = gbifKey(savedJson('gbif', matchUrl(species), root));
  const name = key ? savedJson('gbif', speciesUrl(key), root)?.vernacularName : null;
  return name ? String(name).split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean) : [];
}
/**
 * A record named with all of GBIF's English names at once ("Small-leaved Elm, Jersey Elm, English Elm": added before
 * 2026-10-26, when the build took GBIF's list as one name), named with the first, as a plant added now is
 * (`gbifCommonName`); the others become its synonyms, so a search for any of them still finds it. Only where the name
 * is exactly GBIF's list for its species. `namesOf(species)`: GBIF's names (`gbifNames`). In place; returns what
 * changed, in words.
 */
export function shortenListNames(catalog, namesOf) {
  const done = [];
  const key = (x) => x.toLowerCase();
  for (const [i, r] of catalog.plants.entries()) {
    if (r.parent || !r.botanical || !/[,;]/.test(r.common ?? '')) continue;
    const sp = speciesOf(r.botanical);
    if (sp.genusOnly) continue;
    const names = namesOf(sp.species), had = r.common.split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean);
    if (names.length < 2 || names.map(key).join('|') !== had.map(key).join('|')) continue;
    const [common, ...rest] = names;
    const synonyms = [...(r.synonyms ?? [])];
    for (const n of rest) if (key(n) !== key(common) && !synonyms.some((x) => key(x) === key(n))) synonyms.push(n);
    // (Names first, in the catalog's order: one record per line.)
    const { id, common: _old, botanical, synonyms: _s, ...others } = r;
    catalog.plants[i] = { id, common, botanical, synonyms, ...others };
    done.push(`${id}: now ${common} (${rest.join(', ')} kept as synonyms)`);
  }
  return done;
}
/**
 * What to fetch to name new species (`records`: the new records): GBIF's match, then its record, for each species
 * USDA doesn't name, once USDA's search (and profile) for it are saved. (USDA's search isn't asked for a hybrid.)
 */
export function namePagesToFetch(records, root = 'catalog-src') {
  const urls = new Set();
  for (const r of records) {
    if (r.parent || quotedCultivars(r.botanical).length) continue;
    const sp = speciesOf(r.botanical);
    if (sp.genusOnly) continue;
    if (!sp.species.includes('×')) {
      if (!savedPage('usda', searchUrl(sp.species), root)) continue; // (USDA first)
      const pick = usdaFor(sp.species, root);
      if (pick && !savedPage('usda', profileUrl(pick.symbol), root)) continue;
      if (pick && usdaCommonName(sp.species, root)) continue;
    }
    const match = savedJson('gbif', matchUrl(sp.species), root);
    if (!savedPage('gbif', matchUrl(sp.species), root)) urls.add(matchUrl(sp.species));
    else if (gbifKey(match) && !savedPage('gbif', speciesUrl(gbifKey(match)), root)) urls.add(speciesUrl(gbifKey(match)));
  }
  return [...urls];
}
