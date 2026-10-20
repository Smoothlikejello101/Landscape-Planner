// Choose each catalog species' USDA PLANTS symbol from PLANTS's name search (saved in catalog-src/usda/ by
// fetching https://plantsservices.sc.egov.usda.gov/api/PlantSearch?searchText=<Genus species>):
//   node scripts/catalog/usda-pick.mjs <sample.json> <out.json> [--add]
// <sample.json>: the audit's plant list ([{ id, species, usda? }]); <out.json>: the same with each `usda` set
// to { symbol, id, name } or removed (--add: also for plants that had none). A misapplied name ("Carex albicans auct. non Willd.", "Silphium
// terebinthinaceum Elliott, non Jacq.": another plant that once went by this name) is taken only if its
// profile is the plant's own; a hybrid, variety or subspecies never stands for a species; a profile must be
// the plant's own or a reviewed rename (usda-counties.mjs sameTaxon). docs/catalog-sources.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { savedPage } from './pages.mjs';
import { sameTaxon } from './usda-counties.mjs';
export const profileUrl = (symbol) => `https://plantsservices.sc.egov.usda.gov/api/PlantProfile?symbol=${symbol}`;

export const searchUrl = (name) => `https://plantsservices.sc.egov.usda.gov/api/PlantSearch?searchText=${encodeURIComponent(name)}`;
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
/**
 * A doubtful entry: a misapplied name ("auct.", "non X", "sensu X": a name as authors used it for another
 * plant), or a name of uncertain standing ("nom. inq.", "nom. inval.", "nom. nud."). Its profile may still be
 * the plant's own (USDA's only apple entry, "Malus domestica auct. non Borkh.", leads to Malus pumila, the
 * apple): it's taken only after the plain names, and only if its profile passes `sameTaxon`.
 */
export const misapplied = (name) => /\bauct\.|(^|[\s,])non\s|\bsensu\b|\bnom\. (inq|inval|nud)\./i.test(strip(name));
/** A hybrid's entry ("Carex grayi × intumescens [unnamed hybrid]"): never a species'. */
export const hybridName = (name) => /×|\bhybrid\b/i.test(strip(name));

/**
 * The search results that may be the species itself, best first: its own name at species rank, not a hybrid
 * or a variety; plain names (one with a common name first) before doubtful ones. Each still has to have the
 * plant's own profile (`sameTaxon`), which the caller checks.
 */
export function symbolCandidates(species, results) {
  const want = species.toLowerCase().replace(/\s+/g, ' ').trim();
  const ok = (results ?? []).map((r) => r.Plant ?? r).filter((p) => {
    const name = strip(p?.ScientificName);
    return p?.Symbol && name.split(' ').slice(0, 2).join(' ').toLowerCase() === want && !hybridName(name)
      && !/ (var\.|ssp\.|subsp\.) /.test(name) && (p.Rank == null || p.Rank === 'Species');
  });
  const rank = (p) => (misapplied(p.ScientificName) ? 2 : 0) + (p.CommonName ? 0 : 1);
  return ok.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(({ p }) => ({ symbol: p.Symbol, id: p.Id, name: strip(p.ScientificName), doubtful: misapplied(p.ScientificName) }));
}
/** The first candidate whose profile is the plant's own (`profileName(symbol)`: its profile's name, or null if not fetched). */
export function pickSymbol(species, results, profileName = () => null) {
  for (const c of symbolCandidates(species, results)) {
    const prof = profileName(c.symbol);
    if (prof != null ? sameTaxon(species, prof) : !c.doubtful) return { symbol: c.symbol, id: c.id, name: c.name };
  }
  return null;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const args = process.argv.slice(2), add = args.includes('--add');
  const [inPath, outPath] = args.filter((a) => a !== '--add');
  if (!inPath || !outPath) { console.error('usage: node scripts/catalog/usda-pick.mjs <sample.json> <out.json>'); process.exit(1); }
  const sample = JSON.parse(readFileSync(inPath, 'utf8'));
  let changed = 0, none = 0, unsearched = 0;
  const out = sample.map((s) => {
    if (!s.usda && !add) return s;
    const page = s.species ? savedPage('usda', searchUrl(s.species)) : null;
    if (!page) { unsearched++; return s; }
    let results = null;
    try { results = JSON.parse(page.text); } catch { /* none */ }
    const profileName = (symbol) => { try { return JSON.parse(savedPage('usda', profileUrl(symbol))?.text ?? 'null')?.ScientificName ?? null; } catch { return null; } };
    const pick = pickSymbol(s.species, results, profileName);
    const { usda: _old, ...rest } = s;
    if (!pick) { none++; if (s.usda) changed++; return rest; }
    if (s.usda?.symbol !== pick.symbol) { changed++; console.log(`${s.id}: ${s.usda?.symbol ?? '-'} → ${pick.symbol} (${pick.name})`); }
    return { ...rest, usda: pick };
  });
  writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
  console.log(`${out.filter((s) => s.usda).length} with a symbol; ${changed} changed; ${none} with no usable match; ${unsearched} not searched`);
}
