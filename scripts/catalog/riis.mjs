// A plant's standing in the wild in the lower 48, from the U.S. Geological Survey's United States Register of
// Introduced and Invasive Species (US-RIIS, ver. 2.0, 2022; public domain, CC0), its list for the conterminous 48
// states, as published on GBIF's US server (https://ipt.gbif.us/archive.do?r=l48riis; that server has no robots
// rules). Every plant on it is introduced and reproducing in the wild there, and has one of three degrees, as the
// register's own metadata defines them: "established (category C3), meaning reproducing in the locality; invasive
// (category D2), meaning causing, or likely to cause, harm; widespread invasive (category E), meaning at least
// locally abundant and harmful ecologically, economically, or to health". The locality is the lower 48 as a whole:
// it doesn't say where. So the app states it, `wild_us`, in the register's own words, in a plant's details; it
// doesn't hide a plant or turn its button red, which follow the law of the gardener's own state (decided with
// Jason, 2026-10-31: docs/regulated-plants.md). It replaces the first compendium's `invasive` flag, which had no
// source.
//
// Reads catalog-src/riis/<date>/taxon.txt and distribution.txt (the newest date), writes `wild_us` on each species
// record it names (by its botanical name or one of Kew's older names for it), takes it off the rest and takes
// `invasive` off every record; a cultivar takes its species' in the app.
//   node scripts/catalog/riis.mjs
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogText } from './convert-v1.mjs';

export const RIIS_SOURCE = {
  title: "United States Register of Introduced and Invasive Species (US-RIIS), ver. 2.0, 2022: its list for the lower 48 (U.S. Geological Survey; public domain, CC0)",
  url: 'https://doi.org/10.5066/P9KFFTOD',
  trust: 'reference',
};
/** Its degrees of establishment, as the catalog keeps them: the register's own terms. */
export const DEGREES = {
  'established (category C3)': 'established',
  'invasive (category D2)': 'invasive',
  'widespread invasive (category E)': 'widespread invasive',
};
const RANK = { established: 0, invasive: 1, 'widespread invasive': 2 };

/**
 * A binomial's key for matching: "genus species", a named hybrid "genus x species", in lower case. None for a hybrid
 * by its formula ("Morus alba x rubra": not white mulberry) or a group ("Castanea mollissima & hybrids"): neither is
 * the species the register names.
 */
export function nameKey(name) {
  const w = String(name ?? '').replace(/×/g, 'x ').replace(/\s+/g, ' ').trim().split(' ');
  if (w.length >= 3 && w[1].toLowerCase() === 'x') return `${w[0]} x ${w[2]}`.toLowerCase();
  if (w.length >= 3 && /^(x|&|and)$/i.test(w[2])) return null;
  return w.length >= 2 ? `${w[0]} ${w[1]}`.toLowerCase() : null;
}

/** Tab-separated rows (no quoting: Darwin Core text files as GBIF's IPT writes them). */
export function tsv(text) {
  const lines = text.split('\n').filter((l) => l.length);
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => { const v = l.split('\t'); return Object.fromEntries(head.map((h, i) => [h, v[i] ?? ''])); });
}

/**
 * The register's plants, by name key: the furthest degree any of its names has (a species listed twice, under
 * two names that come to one binomial, is as far as it has spread under either). Plants only.
 */
export function registerOf(taxa, distribution) {
  const deg = new Map(distribution.map((d) => [d.id, DEGREES[d.degreeOfEstablishment]]));
  const out = new Map();
  for (const t of taxa) {
    if (t.kingdom !== 'Plantae') continue;
    const d = deg.get(t.id), k = nameKey(t.scientificName);
    if (!d || !k) continue;
    if (!out.has(k) || RANK[d] > RANK[out.get(k).degree]) out.set(k, { degree: d, name: t.scientificName });
  }
  return out;
}

/** `wild_us` on each species record the register names; off every other record; `invasive` off every record. */
export function wildFacts(catalog, register) {
  let n = 0, dropped = 0;
  for (const rec of catalog.plants) {
    if ('invasive' in rec.facts) { delete rec.facts.invasive; dropped++; }
    let best = null;
    if (!rec.parent) {
      const syn = rec.facts.botanical_synonyms;
      const names = [rec.botanical, ...(Array.isArray(syn?.v) ? syn.v : Array.isArray(syn) ? syn : [])];
      for (const name of names) {
        const hit = register.get(nameKey(name));
        if (hit && (!best || RANK[hit.degree] > RANK[best.degree])) best = hit;
      }
    }
    if (best) { rec.facts.wild_us = { v: best.degree, src: ['riis'] }; n++; }
    else delete rec.facts.wild_us;
  }
  if (n) catalog.meta.sources.riis = RIIS_SOURCE;
  else delete catalog.meta.sources.riis;
  return { n, dropped };
}

/** The newest catalog-src/riis/<date>/ with both files, or null. */
export function newestRegister(root = 'catalog-src') {
  const dir = join(root, 'riis');
  if (!existsSync(dir)) return null;
  const dates = readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && existsSync(join(dir, d, 'taxon.txt')) && existsSync(join(dir, d, 'distribution.txt'))).sort();
  return dates.length ? join(dir, dates.at(-1)) : null;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const dir = newestRegister();
  if (!dir) { console.error('US-RIIS is not in catalog-src/riis/<date>/: download https://ipt.gbif.us/archive.do?r=l48riis and unzip it there (docs/catalog-build.md).'); process.exit(1); }
  const register = registerOf(tsv(readFileSync(join(dir, 'taxon.txt'), 'utf8')), tsv(readFileSync(join(dir, 'distribution.txt'), 'utf8')));
  const catalog = JSON.parse(readFileSync('public/plants.json', 'utf8'));
  const { n, dropped } = wildFacts(catalog, register);
  writeFileSync('public/plants.json.tmp', catalogText(catalog));
  renameSync('public/plants.json.tmp', 'public/plants.json');
  const by = { 'widespread invasive': 0, invasive: 0, established: 0 };
  for (const rec of catalog.plants) if (rec.facts.wild_us) by[rec.facts.wild_us.v]++;
  console.log(`US-RIIS (${dir}): ${register.size} plants; ${n} catalog species in it (${by['widespread invasive']} widespread invasive, ${by.invasive} invasive, ${by.established} established); the earlier list's invasive flag taken off ${dropped} records`);
}
