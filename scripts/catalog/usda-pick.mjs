// Choose each catalog species' USDA PLANTS symbol from PLANTS's name search (saved in catalog-src/usda/ by
// fetching https://plantsservices.sc.egov.usda.gov/api/PlantSearch?searchText=<Genus species>):
//   node scripts/catalog/usda-pick.mjs <sample.json> <out.json> [--add]
// <sample.json>: the audit's plant list ([{ id, species, usda? }]); <out.json>: the same with each `usda` set
// to { symbol, id, name } or removed (--add: also for plants that had none). A misapplied name ("Carex albicans auct. non Willd.", "Silphium
// terebinthinaceum Elliott, non Jacq.": another plant that once went by this name) is never chosen, nor a
// variety or subspecies for a species. docs/catalog-sources.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { savedPage } from './pages.mjs';

export const searchUrl = (name) => `https://plantsservices.sc.egov.usda.gov/api/PlantSearch?searchText=${encodeURIComponent(name)}`;
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
/** A misapplied name: "auct." (as authors used it) or "non X" (not X's species of that name). */
export const misapplied = (name) => /\bauct\.|(^|[\s,])non\s/i.test(strip(name));

/** The search result that is the species itself: its own name, species rank, not misapplied; one with a common name first. */
export function pickSymbol(species, results) {
  const want = species.toLowerCase().replace(/\s+/g, ' ').trim();
  const ok = (results ?? []).map((r) => r.Plant ?? r).filter((p) => {
    const name = strip(p?.ScientificName);
    const words = name.split(' ');
    return p?.Symbol && words.slice(0, 2).join(' ').toLowerCase() === want && !misapplied(name)
      && !/ (var\.|ssp\.|subsp\.) /.test(name) && (p.Rank == null || p.Rank === 'Species');
  });
  const best = ok.find((p) => p.CommonName) ?? ok[0];
  return best ? { symbol: best.Symbol, id: best.Id, name: strip(best.ScientificName) } : null;
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
    const pick = pickSymbol(s.species, results);
    const { usda: _old, ...rest } = s;
    if (!pick) { none++; if (s.usda) changed++; return rest; }
    if (s.usda?.symbol !== pick.symbol) { changed++; console.log(`${s.id}: ${s.usda?.symbol ?? '-'} → ${pick.symbol} (${pick.name})`); }
    return { ...rest, usda: pick };
  });
  writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
  console.log(`${out.filter((s) => s.usda).length} with a symbol; ${changed} changed; ${none} with no usable match; ${unsearched} not searched`);
}
