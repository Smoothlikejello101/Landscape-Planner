// What a person decided about a record's names (decisions.json; docs/catalog-sources.md, "Decisions"), applied to
// the catalog before each build reads it, so the build doesn't list the record again.
//
// `split`: a record of several cultivars, split into one record per cultivar (decided with Jason, 2026-10-25: a
// gardener who knows they have a 'Kanza' pecan should find it, and cultivars get their own records). The record keeps
// its id for the cultivar whose size it shows (`keep`), so plants placed from it stay as they were: it's renamed for
// that cultivar, its old name kept as a synonym, and pointed at its species. Each other cultivar (`others`) gets a
// record of its own unless the catalog has one already: one with an NC State page of its own is added by the build
// from that page (additions.mjs: once no record names it, the page isn't the catalog's), so only a cultivar with no
// page is made here, with names alone. It takes its species' size until a source gives its own (`inherits`;
// docs/catalog-format.md), since the decision says so; every other fact comes from its sources as for any record.
// Made here too: a cultivar whose page files it under a species Kew keeps apart from its own (`species`: Kew's, its
// page chosen in ncsu-pages.json), and a plant the record named that isn't one of its cultivars (`botanical`: its
// genus, or a species), with the page ncsu-pages.json chooses for it, if any.
//
// `cultivar`: a record naming one cultivar beside its species ("Aucuba japonica ('Gold Dust')"), renamed for it.
// `kewSpecies`: a cultivar NC State files under a species Kew keeps apart from the one it is, moved to Kew's.
// `parent`: a cultivar put under a species its own name doesn't give. `fold`: a record whose plants all have records
// of their own: it goes, and the catalog says which record its id now stands for (`meta.moved`), so a plant placed
// from it keeps its facts.
//
// Applying the decisions twice changes nothing.
import { speciesOf, ncsuSlug } from './list.mjs';
import { quotedCultivars, recordCultivars, withoutCultivars } from './ncsu-page.mjs';

/** A record's species without the earlier list's word for a group ("Distylium hybrids", "Paeonia lactiflora … cvs"). */
const groupless = (s) => s.replace(/\s+(?:hybrids?|types?|cvs?\.?)$/i, '');
/** The species a record's botanical name gives (or its genus), its cultivars and notes left out. */
const speciesIn = (botanical) => speciesOf(groupless(withoutCultivars(String(botanical ?? '').replace(/\s*\(.*$/, ''), ' ').replace(/\s+/g, ' ').trim())).species;
/** The record a species' botanical name names: not a cultivar, not a group, and not a genus (a cultivar of a genus has no species named). */
const speciesRecord = (catalog, species) => (speciesOf(species).genusOnly ? undefined
  : catalog.plants.find((r) => r.botanical === species && !r.parent && !/['‘’]/.test(r.botanical)));
const straight = (s) => String(s ?? '').replace(/[‘’]/g, "'");
/** "Ficus carica 'Celeste'"; a series or group named without quotes ("Hibiscus syriacus Chiffon series"). */
const botanicalFor = (species, cultivar) => (/\b(series|group)$/i.test(cultivar) ? `${species} ${cultivar}` : `${species} '${cultivar}'`);
/** Whether a record is this cultivar of this species, by its botanical name. */
const isCultivar = (r, species, cultivar) => straight(r.botanical) === botanicalFor(species, cultivar);

/** The record's names and species first, as in any record (the file is read one record per line). */
function namesFirst(rec) {
  const all = { ...rec };
  for (const k of Object.keys(rec)) delete rec[k];
  for (const k of ['id', 'common', 'botanical', 'synonyms', 'parent', 'inherits']) if (k in all) rec[k] = all[k];
  Object.assign(rec, all);
}
/** Its old name kept to find it by, unless the new one starts with it (the earlier list's note on it left out: "Apple (rust-resistant only)"). */
function keepOldName(rec, was, now) {
  const base = String(was ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
  if (was && !now.toLowerCase().startsWith(base)) rec.synonyms = [...new Set([...(rec.synonyms ?? []), was])];
}
/** A new record's id: its name's page name, kept clear of the ids taken. */
function freeId(base, taken) {
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

/** Rename a record for the one cultivar it is (`keep`: { cultivar, common }), and point it at its species. */
function renameFor(catalog, rec, keep, done) {
  const species = speciesIn(rec.botanical);
  if (!isCultivar(rec, species, keep.cultivar)) {
    const was = rec.common;
    rec.botanical = botanicalFor(species, keep.cultivar);
    rec.common = keep.common;
    keepOldName(rec, was, keep.common);
    done.push(`${rec.id}: now ${keep.common}`);
  }
  const parent = speciesRecord(catalog, species);
  if (parent && rec.parent !== parent.id) { rec.parent = parent.id; done.push(`${rec.id}: its species is ${parent.id}`); }
  namesFirst(rec);
  return species;
}

/**
 * Apply the decisions on names (`split`, `cultivar`, `kewSpecies`, `parent`, `fold`) to a catalog, in place.
 * `split`: record id → { keep: { cultivar, common }, others: [{ cultivar, common, page, species? } | { botanical,
 * common?, page }], species?: { common } }. `page`: the plant's own NC State page, or null for none. An entry's
 * `species`: the species record to make where the catalog has none. `commonFor(name)`: a species' common name from
 * its sources (USDA's, GBIF's), or null, for a species made here without one; `namesOf(page)`: the common names an
 * NC State page gives. Returns what changed, in words (empty: nothing to do).
 */
export function applySplits(catalog, decisions, { commonFor = () => null, namesOf = () => [] } = {}) {
  const done = [];
  const taken = new Set(catalog.plants.map((r) => r.id));
  const real = (o) => Object.entries(o ?? {}).filter(([id]) => id !== 'about');
  for (const [id, d] of real(decisions?.split)) {
    const rec = catalog.plants.find((r) => r.id === id);
    if (!rec) continue;
    // (The species record, where a decision names one the catalog lacks: before the cultivars are pointed at it.)
    const species = speciesIn(rec.botanical);
    if (d.species && !speciesRecord(catalog, species)) {
      const r = { id: freeId(ncsuSlug(species), taken), common: d.species.common, botanical: species, src: [], audited: null, facts: {} };
      const other = commonFor(species);
      if (other && other.toLowerCase() !== r.common.toLowerCase()) r.synonyms = [other[0].toUpperCase() + other.slice(1)];
      namesFirst(r);
      catalog.plants.splice(catalog.plants.indexOf(rec), 0, r);
      done.push(`${r.id}: added (${r.common})`);
    }
    // The record, for the cultivar it keeps.
    renameFor(catalog, rec, d.keep, done);
    const parent = speciesRecord(catalog, species);
    // The others: a page of its own is added by the build; one with none, here, once; and those the build can't add.
    let beside = 0;
    for (const o of d.others ?? []) {
      let r;
      if (o.botanical) {
        // (A plant the record named that isn't a cultivar of it: its genus, or a species. Named from its sources once
        // they give a name: until then, by its botanical name.)
        const has = catalog.plants.find((x) => x.botanical === o.botanical && !x.parent);
        if (has) {
          const named = !o.common && has.common === has.botanical ? commonFor(o.botanical) : null;
          if (named) { has.common = named[0].toUpperCase() + named.slice(1); done.push(`${has.id}: named ${has.common}`); }
          continue;
        }
        const named = o.common ?? commonFor(o.botanical);
        const common = named ? named[0].toUpperCase() + named.slice(1) : o.botanical;
        // (Its page's other names, to find it by, as for any plant added from a page.)
        const others = (o.page ? namesOf(o.page) : []).filter((n) => n.toLowerCase() !== common.toLowerCase());
        r = { id: freeId(ncsuSlug(o.botanical), taken), common, botanical: o.botanical, ...(others.length ? { synonyms: others } : {}), src: o.page ? ['ncsu'] : [], audited: null, facts: {} };
      } else {
        const sp = o.species ?? species;
        if (o.page && !o.species) continue;
        if (catalog.plants.some((x) => isCultivar(x, sp, o.cultivar))) continue;
        const under = o.species ? speciesRecord(catalog, o.species) : parent;
        r = {
          id: freeId(`${ncsuSlug(sp)}-${ncsuSlug(o.cultivar)}`, taken), common: o.common, botanical: botanicalFor(sp, o.cultivar),
          ...(under ? { parent: under.id } : {}),
          // (Its own page, if any, gives its size; with none, its species' stands in.)
          ...(o.page || !under ? {} : { inherits: ['height', 'width'] }),
          src: o.page ? ['ncsu'] : rec.src ?? ['compendium'], audited: null, facts: {},
        };
      }
      // (Beside the record it came from, in the decision's order, so the catalog reads in the same order.)
      catalog.plants.splice(catalog.plants.indexOf(rec) + 1 + beside++, 0, r);
      done.push(`${r.id}: added (${r.common})`);
    }
  }
  // A record of one cultivar, named beside its species: renamed for it.
  for (const [id, d] of real(decisions?.cultivar)) {
    const rec = catalog.plants.find((r) => r.id === id);
    if (rec) renameFor(catalog, rec, d, done);
  }
  // A cultivar NC State files under a species Kew keeps apart from its own: under Kew's species.
  for (const [id, d] of real(decisions?.kewSpecies)) {
    const rec = catalog.plants.find((r) => r.id === id);
    const cultivar = rec && quotedCultivars(rec.botanical)[0];
    if (!cultivar) continue;
    if (!isCultivar(rec, d.species, cultivar)) {
      rec.botanical = botanicalFor(d.species, cultivar);
      rec.common = d.common;
      done.push(`${id}: now ${d.common}, ${rec.botanical}`);
    }
    const parent = speciesRecord(catalog, d.species);
    if (parent && rec.parent !== parent.id) { rec.parent = parent.id; done.push(`${id}: its species is ${parent.id}`); }
    else if (!parent && rec.parent) { delete rec.parent; done.push(`${id}: no species record for ${d.species} yet`); }
    namesFirst(rec);
  }
  // A cultivar under a species its name doesn't give (a hybrid named by its genus alone).
  for (const [id, d] of real(decisions?.parent)) {
    const rec = catalog.plants.find((r) => r.id === id);
    if (!rec || rec.parent === d.parent || !catalog.plants.some((r) => r.id === d.parent)) continue;
    rec.parent = d.parent;
    namesFirst(rec);
    done.push(`${id}: its species is ${d.parent}`);
  }
  // A record folded into another: it goes, and its id stands for the other's from then on.
  for (const [id, d] of real(decisions?.fold)) {
    const at = catalog.plants.findIndex((r) => r.id === id);
    if (at < 0 || id === d.into || !catalog.plants.some((r) => r.id === d.into)) continue;
    catalog.plants.splice(at, 1);
    const moved = (catalog.meta.moved ??= {});
    for (const [from, to] of Object.entries(moved)) if (to === id) moved[from] = d.into;
    moved[id] = d.into;
    for (const r of catalog.plants) if (r.parent === id) { r.parent = d.into; done.push(`${r.id}: its species is ${d.into}`); }
    done.push(`${id}: folded into ${d.into}`);
  }
  return done;
}

/**
 * Each record of one cultivar that names no species, linked to its species' record where the catalog has exactly
 * one (decided with Jason, 2026-10-26: the picker folds a species' cultivars under it; a linked cultivar takes the
 * facts a species gives its cultivars, src/catalog.ts INHERITED). Its species: the record whose botanical name is
 * its own without the cultivar ("Rudbeckia fulgida var. sullivantii" for 'Goldsturm'), else its species'
 * ("Nandina domestica" for "Nandina domestica Flirt 'Murasaki'"). Never a genus's record ("Hemerocallis" for
 * 'Happy Returns'): a genus isn't its species. In place; returns what changed, in words.
 */
export function linkCultivars(catalog) {
  const done = [];
  const species = new Map(); // (botanical name: the records of a species, a variety or a cross: no cultivar)
  for (const r of catalog.plants) {
    if (!r.botanical || r.parent || recordCultivars(r).length || /\b(series|group|hybrids?|types?)\b/i.test(r.botanical) || speciesOf(r.botanical).genusOnly) continue;
    species.set(r.botanical, [...(species.get(r.botanical) ?? []), r]);
  }
  const one = (name) => { const rs = species.get(name); return rs?.length === 1 ? rs[0] : undefined; };
  for (const r of catalog.plants) {
    // (Not a record naming a cultivar beside its species, "Aucuba japonica ('Gold Dust')", or two plants, "Prunus x
    // yedoensis / 'Kwanzan'": the earlier list's, left for a decision.)
    if (r.parent || quotedCultivars(r.botanical).length !== 1 || /[(/]/.test(r.botanical)) continue;
    const base = withoutCultivars(r.botanical, ' ').replace(/\s+/g, ' ').trim();
    const sp = speciesOf(base);
    const parent = one(base) ?? (sp.genusOnly ? undefined : one(sp.species));
    if (!parent || parent.id === r.id) continue;
    r.parent = parent.id;
    namesFirst(r);
    done.push(`${r.id}: its species is ${parent.id}`);
  }
  return done;
}

/**
 * Cultivars NC State may file under a species Kew keeps apart from theirs (decided with Jason, 2026-10-27: a
 * cultivar goes under the species Kew accepts; docs/catalog-sources.md, "Kew's species"), for a person to check:
 * the build lists them rather than moving them. Where NC State's page for a species X answers with its page for
 * another, Y (ncsu-pages.json gives X's record no page, since Kew keeps them apart: NC State moves Vaccinium
 * virgatum to V. corymbosum), a record reading one of NC State's pages for a cultivar of Y whose names or
 * description call it X's, by X's names (its common name, its synonyms, each also without a last word Y's name
 * shares: "rabbiteye" for Rabbiteye blueberry beside Highbush blueberry). `list`: the plant list (each record's
 * page); `pages`: ncsu-pages.json's; `movedTo(slug)`: where NC State moved a page, or null; `pageText(slug)`: a
 * saved page's names and description, or null. Returns [{ id, page, x, y, word }].
 */
export function kewApart(catalog, list, { pages = {}, movedTo = () => null, pageText = () => null } = {}) {
  const byId = new Map(catalog.plants.map((r) => [r.id, r]));
  const isSpecies = (r) => r?.botanical && !r.parent && !recordCultivars(r).length && !speciesOf(r.botanical).genusOnly;
  const bySlug = new Map(catalog.plants.filter(isSpecies).map((r) => [ncsuSlug(r.botanical), r]));
  const out = [];
  for (const [id, page] of Object.entries(pages)) {
    const x = byId.get(id);
    if (page !== null || !isSpecies(x)) continue;
    const slugY = movedTo(ncsuSlug(x.botanical));
    const y = slugY && bySlug.get(slugY);
    if (!y || y.id === x.id) continue;
    const lastOf = (s) => s.trim().split(/\s+/).pop().toLowerCase();
    const yLast = lastOf(y.common ?? '');
    const words = [...new Set([x.common, ...(x.synonyms ?? [])].filter(Boolean).flatMap((n) => {
      const w = n.trim().split(/\s+/);
      return w.length > 1 && lastOf(n) === yLast ? [n, w.slice(0, -1).join(' ')] : [n];
    }))];
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const e of list) {
      const r = byId.get(e.id);
      if (!e.ncsu?.startsWith(`${slugY}-`) || !r || speciesIn(r.botanical) === x.botanical) continue;
      const text = pageText(e.ncsu);
      const word = text && words.find((w) => new RegExp(`(^|[^A-Za-z])${esc(w)}($|[^A-Za-z])`, 'i').test(text));
      if (word) out.push({ id: e.id, page: e.ncsu, x: x.botanical, y: y.botanical, word });
    }
  }
  return out;
}
