// Plants regulated by law (scripts/catalog/regulated-plants.json, read from each rule: docs/regulated-plants.md),
// matched to the catalog's plants. wild.mjs writes each state's matches, and the federal list's, into its state
// file, for the details' line that says what the law says.
import { readFileSync } from 'node:fs';

const PATH = 'scripts/catalog/regulated-plants.json';
const SPECIES = /^[A-Z][a-zë-]+ [a-zë-]+$/;
const INFRA = /^[A-Z][a-zë-]+ [a-zë-]+ (var\.|subsp\.) [a-zë-]+$/;

/**
 * The lists, checked: every entry a species, a variety or subspecies, or a genus, with a class its list says.
 * An entry's `kew`: its name as Kew's checklist spells it, where the rule spells it otherwise (crusgalli, crus-galli).
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
      if (p.name ? !(SPECIES.test(p.name) || INFRA.test(p.name)) || p.genus : !/^[A-Z][a-z]+$/.test(p.genus ?? '')) out.push(`${j.code} ${what}: not a species, variety, subspecies or genus`);
      if (p.kew != null && !(p.name && SPECIES.test(p.kew))) out.push(`${j.code} ${what}: bad Kew spelling`);
      if (p.except && (!p.genus || !p.except.every((e) => SPECIES.test(e) && e.startsWith(`${p.genus} `)))) out.push(`${j.code} ${what}: bad exceptions`);
    }
  }
  return out;
}
/** The species the lists name, to look up in Kew's checklist (wcvp.mjs). */
export function listedSpecies(data) {
  return [...new Set(data.jurisdictions.flatMap((j) => j.plants.flatMap((p) => [p.kew ?? p.name, ...(p.except ?? [])]).filter((n) => n && SPECIES.test(n))))].sort();
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/\bssp\./, 'subsp.').trim();
/**
 * Which catalog plants each list's entries take in: { code: { id: class } } (an id's first entry in its list, where
 * it's on two: the lists are in order of weight). A plant is matched by its accepted name in Kew's checklist (a
 * listed name or the catalog's may be a synonym: Sapium sebiferum is Triadica sebifera), or by its own name. A
 * listed species takes in its varieties and cultivars; a listed variety only that variety (kudzu is
 * Pueraria montana var. lobata, not the species); a genus every species in it, but those it excepts.
 * `plants`: [{ id, botanical, binomial }] (binomial: the species the catalog's record is of); `accepted`:
 * { id: accepted name } (wcvp-native.json's); `acceptedListed`: { listed name: accepted name } (wcvp-regulated.json).
 */
export function regulatedPlants(data, plants, accepted, acceptedListed) {
  const out = {};
  for (const j of data.jurisdictions) {
    const mine = {};
    for (const p of plants) {
      const own = clean(p.botanical), names = new Set([p.binomial, accepted[p.id]].filter(Boolean));
      const genera = new Set([...names].map((n) => n.split(' ')[0]));
      const hit = j.plants.find((e) => {
        if (e.genus) return genera.has(e.genus) && !(e.except ?? []).some((x) => names.has(x) || names.has(acceptedListed[x]));
        if (INFRA.test(e.name)) return own === e.name || own.startsWith(`${e.name} `);
        const k = e.kew ?? e.name;
        return names.has(e.name) || names.has(k) || (!!acceptedListed[k] && names.has(acceptedListed[k]));
      });
      if (hit) mine[p.id] = hit.class;
    }
    if (Object.keys(mine).length) out[j.code] = mine;
  }
  return out;
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
