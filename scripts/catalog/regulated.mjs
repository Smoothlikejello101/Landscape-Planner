// Plants regulated by law (scripts/catalog/regulated-plants.json, read from each rule: docs/regulated-plants.md),
// matched to the catalog's plants. wild.mjs writes each state's matches, and the federal list's, into its state
// file, for the details' line that says what the law says.
import { readFileSync } from 'node:fs';

const PATH = 'scripts/catalog/regulated-plants.json';
const SPECIES = /^[A-Z][a-zë-]+ [a-zë-]+$/;
const INFRA = /^[A-Z][a-zë-]+ [a-zë-]+ (var\.|subsp\.) [a-zë-]+$/;
/** A named hybrid (nothospecies), as Kew writes it: "Lonicera × bella". */
const HYBRID = /^[A-Z][a-zë-]+ × [a-zë-]+$/;

/**
 * The lists, checked: every entry a species, a variety or subspecies, or a genus, with a class its list says.
 * An entry's `kew`: its name as Kew's checklist spells it, where the rule spells it otherwise (crusgalli,
 * crus-galli). `accepted`: Kew's accepted name for it, where Kew files it under another, checked by hand
 * (Sapium sebiferum, Triadica sebifera); false where Kew's would be wrong (it types Pennisetum polystachion on
 * a native grass): matched by its printed names only. `notKew`: Kew's accepted name for the printed name, checked
 * and not this plant (Arkansas's Rottboellia exaltata is itchgrass, not Kew's Ophiuros exaltatus). `also`: other names it's printed or sold under (kudzu,
 * Pueraria lobata).
 */
export function readRegulated(path = PATH) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const bad = problems(data);
  if (bad.length) throw new Error(`${path}: ${bad.join('; ')}`);
  return data;
}
/** What's wrong with the lists (none: []). */
export function problems(data) {
  const out = [];
  if (data?.v !== 1 || !Array.isArray(data.jurisdictions)) return ['not format 1'];
  const codes = new Set();
  for (const j of data.jurisdictions) {
    if (!/^[A-Z]{2}$/.test(j.code ?? '') || codes.has(j.code)) out.push(`jurisdiction ${j.code}: bad or repeated code`);
    codes.add(j.code);
    for (const k of ['title', 'url', 'edition', 'read']) if (typeof j[k] !== 'string' || !j[k]) out.push(`${j.code}: no ${k}`);
    if (!/^https:\/\//.test(j.url ?? '')) out.push(`${j.code}: url not https`);
    if (!j.classes || !Object.keys(j.classes).length) out.push(`${j.code}: no classes`);
    for (const p of j.plants ?? []) {
      const what = p.name ?? p.genus;
      if (!j.classes?.[p.class]) out.push(`${j.code} ${what}: class "${p.class}" not in its list's classes`);
      if (p.name ? !(SPECIES.test(p.name) || INFRA.test(p.name) || HYBRID.test(p.name)) || p.genus : !/^[A-Z][a-z]+$/.test(p.genus ?? '')) out.push(`${j.code} ${what}: not a species, variety, subspecies or genus`);
      if (p.kew != null && !(p.name && SPECIES.test(p.kew))) out.push(`${j.code} ${what}: bad Kew spelling`);
      if (p.accepted != null && !(p.name && (p.accepted === false || SPECIES.test(p.accepted)))) out.push(`${j.code} ${what}: bad accepted name`);
      if (p.notKew != null && !(p.name && SPECIES.test(p.notKew) && p.accepted)) out.push(`${j.code} ${what}: bad notKew`);
      if (p.also != null && !(p.name && Array.isArray(p.also) && p.also.every((a) => SPECIES.test(a) || INFRA.test(a)))) out.push(`${j.code} ${what}: bad other names`);
      if (p.exceptAlso && (!p.except || !p.exceptAlso.every((e) => SPECIES.test(e) && e.startsWith(`${p.genus} `)))) out.push(`${j.code} ${what}: bad exceptions`);
      if (p.except && (!p.genus || !p.except.every((e) => SPECIES.test(e) && e.startsWith(`${p.genus} `)))) out.push(`${j.code} ${what}: bad exceptions`);
    }
  }
  return out;
}
/** The species the lists name, to look up in Kew's checklist (wcvp.mjs). */
export function listedSpecies(data) {
  return [...new Set(data.jurisdictions.flatMap((j) => j.plants.map((p) => p.kew ?? p.name).filter((n) => n && SPECIES.test(n))))].sort();
}

/**
 * A botanical name as the lists write it: one space between words, "subsp.", and a named hybrid's sign as "× ":
 * "Lonicera x bella", "Lonicera X bella", "Lonicera ×bella" are all "Lonicera × bella". An "x" joined to the
 * epithet ("Lonicera xbella") is left alone: it can't be told from a species (Lonicera xylosteum).
 */
export const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/\bssp\./, 'subsp.').replace(/^([A-Z][a-zë-]+) (?:[xX] |× ?)(?=[a-z])/, '$1 × ');
/** The genus of a named hybrid's name ("Lythrum × hybrida": Lythrum); none for anything else. */
const hybridGenus = (own) => own.match(/^([A-Z][a-zë-]+) × /)?.[1];
/**
 * What the matcher is given: every catalog plant with its own record (a cultivar with a species record takes that
 * record's line in the app), the species bloomSpecies finds with their species, and the rest by their own names
 * alone (hybrids, mixes, two-plant records). `speciesOf`: bloomSpecies's [{ id, binomial }].
 */
export function lawPlants(catalog, speciesOf) {
  const botanical = new Map(catalog.plants.map((p) => [p.id, p.botanical]));
  const seen = new Set(speciesOf.map((s) => s.id));
  return [...speciesOf.map((s) => ({ ...s, botanical: botanical.get(s.id) })),
    ...catalog.plants.filter((p) => !p.parent && !seen.has(p.id) && p.botanical).map((p) => ({ id: p.id, botanical: p.botanical }))];
}
/** The names an entry is matched by: as printed, as Kew spells it, its reviewed accepted name, its other names. */
const entryNames = (e) => [e.name, e.kew, e.accepted || null, ...(e.also ?? [])].filter(Boolean);
/**
 * Which catalog plants each list's entries take in: { code: { id: class } } (an id's first entry in its list, where
 * it's on two: the lists are in order of weight). A plant is matched by its accepted name in Kew's checklist or its
 * own name, against an entry's names (`entryNames`: Kew's accepted names for listed ones are reviewed by hand, in
 * the list, never taken unchecked: wcvp.mjs reports any that differ). A listed species takes in its varieties and
 * cultivars; a listed variety only that variety (kudzu is Pueraria montana var. lobata, not the species), by its
 * name or its other names; a genus every species in it, but those it excepts (by their printed names, and
 * `exceptAlso`: Kew's names for an excepted one, checked by hand).
 * A named hybrid is matched by the catalog's own name for the plant (Lonicera × bella), and a genus entry by the
 * genus of its accepted name, its species, or a named hybrid's own name.
 * `plants`: [{ id, botanical, binomial? }] (binomial: the species the catalog's record is of; none for a hybrid); `accepted`:
 * { id: accepted name } (wcvp-native.json's).
 */
export function regulatedPlants(data, plants, accepted) {
  const out = {};
  for (const j of data.jurisdictions) {
    const mine = {};
    for (const p of plants) {
      const own = cleanName(p.botanical), names = new Set([p.binomial, accepted[p.id]].filter(Boolean));
      // (A named hybrid by its own name's genus too; never a mix or "spp." record, whose species can't be checked
      // against the rule's exceptions.)
      const genera = new Set([...[...names].map((n) => n.split(' ')[0]), hybridGenus(own)].filter(Boolean));
      const hit = j.plants.find((e) => {
        if (e.genus) return genera.has(e.genus) && ![...(e.except ?? []), ...(e.exceptAlso ?? [])].some((x) => names.has(x));
        if (HYBRID.test(e.name)) return own === e.name || own.startsWith(`${e.name} `);
        if (INFRA.test(e.name)) return [e.name, ...(e.also ?? [])].some((n) => own === n || own.startsWith(`${n} `) || (SPECIES.test(n) && names.has(n)));
        return entryNames(e).some((n) => names.has(n));
      });
      if (hit) mine[p.id] = hit.class;
    }
    if (Object.keys(mine).length) out[j.code] = mine;
  }
  return out;
}
/**
 * Listed species whose accepted name in Kew's checklist (`kewAccepted`: { name as Kew spells it: accepted }, from
 * wcvp.mjs) isn't the one the list gives: each to check by hand, and record in the list. Empty: all reviewed.
 */
export function unreviewed(data, kewAccepted) {
  const out = new Set();
  for (const j of data.jurisdictions) for (const e of j.plants) {
    if (!e.name || !SPECIES.test(e.name) || e.accepted === false) continue;
    const k = e.kew ?? e.name, kew = kewAccepted[k];
    if (kew && kew !== (e.accepted ?? k) && kew !== e.notKew) out.add(`${e.name}: Kew's accepted name is ${kew}, the list's ${e.accepted ?? k}`);
  }
  return [...out].sort();
}
/** A list's lines for a state file: { "AR:prohibited": { says, title, url, edition, read } } for the classes used. */
export function ruleLines(data, code, used) {
  const j = data.jurisdictions.find((x) => x.code === code);
  return Object.fromEntries([...used].map((c) => [`${code}:${c}`, { says: j.classes[c], title: j.title, url: j.url, edition: j.edition, read: j.read }]));
}
/**
 * A state's file's part: { regulated: { id: ["AR:prohibited", "US:noxious"] }, rules: { key: line } }, the state's
 * own list first, then the federal one (which holds in every state). `matches`: regulatedPlants's.
 */
export function stateRegulated(data, matches, code) {
  const regulated = {}, used = {};
  for (const c of [code, 'US']) {
    if (c === 'US' && code === 'US') continue;
    for (const [id, cls] of Object.entries(matches[c] ?? {})) {
      (regulated[id] ??= []).push(`${c}:${cls}`);
      (used[c] ??= new Set()).add(cls);
    }
  }
  return { regulated, rules: Object.assign({}, ...Object.entries(used).map(([c, u]) => ruleLines(data, c, u))) };
}
