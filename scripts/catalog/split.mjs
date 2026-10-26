// A record of several cultivars, split into one record per cultivar (decisions.json `split`; decided with Jason,
// 2026-10-25: a gardener who knows they have a 'Kanza' pecan should find it, and cultivars get their own records).
//
// The record keeps its id for the cultivar whose size it shows (`keep`), so plants placed from it stay as they were:
// it's renamed for that cultivar, its old name kept as a synonym, and pointed at its species. Each other cultivar
// (`others`) gets a record of its own unless the catalog has one already: one with an NC State page of its own is
// added by the build from that page (additions.mjs: once no record names it, the page isn't the catalog's), so only a
// cultivar with no page is made here, with names alone. It takes its species' size until a source gives its own
// (`inherits`; docs/catalog-format.md), since the decision says so; every other fact comes from its sources as for any
// record. Applying a split twice changes nothing.
import { speciesOf, ncsuSlug } from './list.mjs';
import { quotedCultivars, recordCultivars, withoutCultivars } from './ncsu-page.mjs';

/** The record a species' botanical name names: not a cultivar, not a group. */
const speciesRecord = (catalog, species) => catalog.plants.find((r) => r.botanical === species && !r.parent && !/['‘’]/.test(r.botanical));
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

/**
 * Split the records `decisions` names (`split`: record id → { keep: { cultivar, common }, others: [{ cultivar,
 * common, page }] }), in place. `page`: the cultivar's own NC State page, or null for none. Returns what changed, in
 * words (empty: nothing to do).
 */
export function applySplits(catalog, decisions) {
  const done = [];
  const taken = new Set(catalog.plants.map((r) => r.id));
  for (const [id, d] of Object.entries(decisions?.split ?? {})) {
    if (id === 'about') continue;
    const rec = catalog.plants.find((r) => r.id === id);
    if (!rec) continue;
    const species = speciesOf(String(rec.botanical ?? '').replace(/\s*\(.*$/, '')).species;
    const parent = speciesRecord(catalog, species);
    // The record, for the cultivar it keeps.
    if (!isCultivar(rec, species, d.keep.cultivar)) {
      const was = rec.common;
      rec.botanical = botanicalFor(species, d.keep.cultivar);
      rec.common = d.keep.common;
      if (was && !d.keep.common.toLowerCase().startsWith(was.toLowerCase())) rec.synonyms = [...new Set([...(rec.synonyms ?? []), was])];
      done.push(`${id}: now ${d.keep.common}`);
    }
    if (parent && rec.parent !== parent.id) { rec.parent = parent.id; done.push(`${id}: its species is ${parent.id}`); }
    namesFirst(rec);
    // The others: a page of its own is added by the build; one with none, here, once.
    for (const o of d.others ?? []) {
      if (o.page) continue;
      if (catalog.plants.some((r) => isCultivar(r, species, o.cultivar))) continue;
      let newId = `${ncsuSlug(species)}-${ncsuSlug(o.cultivar)}`, n = 2;
      while (taken.has(newId)) newId = `${ncsuSlug(species)}-${ncsuSlug(o.cultivar)}-${n++}`;
      taken.add(newId);
      const r = { id: newId, common: o.common, botanical: botanicalFor(species, o.cultivar), ...(parent ? { parent: parent.id } : {}), inherits: ['height', 'width'], src: rec.src ?? ['compendium'], audited: null, facts: {} };
      // (Beside the record it came from, so the catalog reads in the same order.)
      catalog.plants.splice(catalog.plants.indexOf(rec) + 1, 0, r);
      done.push(`${newId}: added (${o.common})`);
    }
  }
  return done;
}

/**
 * Each record of one cultivar that names no species, linked to its species' record where the catalog has exactly
 * one (decided with Jason, 2026-10-26: the picker folds a species' cultivars under it; a linked cultivar takes the
 * facts a species gives its cultivars, src/catalog.ts INHERITED). Its species: the record whose botanical name is
 * its own without the cultivar ("Rudbeckia fulgida var. sullivantii" for 'Goldsturm'), else its species'
 * ("Nandina domestica" for "Nandina domestica Flirt 'Murasaki'"). In place; returns what changed, in words.
 */
export function linkCultivars(catalog) {
  const done = [];
  const species = new Map(); // (botanical name: the records of a species, a variety or a cross: no cultivar)
  for (const r of catalog.plants) {
    if (!r.botanical || r.parent || recordCultivars(r).length || /\b(series|group|hybrids?|types?)\b/i.test(r.botanical)) continue;
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
