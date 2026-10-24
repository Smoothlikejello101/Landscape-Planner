// The build's review report, docs/catalog-review.md: what the build left for a person to decide, fetch or tidy,
// most useful first (docs/catalog-build.md). Made from the build's own files, so it changes only when what's
// waiting changes.
import { existsSync, readdirSync } from 'node:fs';

/** What a review item (write.mjs) asks. */
export function reviewKind(item) {
  const n = String(item.note ?? '');
  if (n.startsWith('held back:')) return 'held';
  if (n.startsWith('edible, but rated toxic')) return 'edible';
  if (n.startsWith("value the catalog can't take")) return 'cant';
  if (n.startsWith('no source gives it now')) return 'stale';
  if (item.fact === 'form' && /a cultivar may be a tree/.test(n)) return 'tree';
  return 'disputed';
}

/** What an audit note (sample.mjs) says, for grouping: a kind, or null for one only counted. */
export function noteKind(note) {
  if (note === 'NC State page not fetched') return 'unfetched';
  if (/^NC State page \S+ is .*: left out$|^USDA's \S+ is .*: left out$|^Minnesota Wildflowers page is .*: left out$/.test(note)) return 'otherName';
  if (/^NC State has only a page for the genus /.test(note)) return 'genusPage';
  if (/(?:more than once with different status|'s combined map for .*): left for the review$/.test(note)) return 'atlasTwice';
  return null;
}
/** Notes only counted, with what each means (each note says only that the source gave nothing, not why). */
const COUNTED = [
  [/^No NC State page$/, 'no NC State page in the list: never asked for (see "Not looked up yet"), asked for and NC State has none (a 404), a genus or cultivar group (not read by the rule), or a page not matched to the plant yet'],
  [/^Not in USDA PLANTS by this name$/, 'no USDA PLANTS symbol: a genus or cultivar group (not searched), or a name PLANTS has no species entry for'],
  [/^USDA has no characteristics for it$/, 'a USDA PLANTS profile with no characteristics saved (size, sun and so on): PLANTS has none, or they were never fetched (see "Not looked up yet")'],
  [/^Not found under .* on the Arkansas atlas's map pages$/, "not on the Arkansas atlas's maps under its name (mostly plants not recorded wild in Arkansas)"],
  [/^Arkansas atlas not looked up/, 'the Arkansas atlas not looked up (a genus or cultivar group: no species name)'],
  [/^A cultivar read from species pages/, "a cultivar read from species-level pages: its size, form and flower color are taken only from a page about the cultivar"],
];

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FACT = { form: 'form', height: 'height', width: 'width', zone_min: 'coldest zone', zone_max: 'warmest zone', sun_most: 'most sun', sun_least: 'least sun', water: 'water', deer: 'deer', edible: 'edible', clay_ok: 'clay', wet_feet: 'wet feet', fall_color: 'fall color' };
const factName = (f) => String(f).split(', ').map((k) => FACT[k] ?? k).join(', ');
/** A value as the report shows it: a range as "2–3", a list joined, nothing as "–". */
export function shown(v) {
  if (v == null) return '–';
  if (typeof v === 'object' && !Array.isArray(v)) {
    if ('v' in v) return shown(v.v);
    if (typeof v.min === 'number') return v.min === v.max ? `${v.min}` : `${v.min}–${v.max}`;
    if (typeof v.start === 'number') return `${v.start}–${v.end}${v.color ? `, ${v.color}` : ''}`;
    return JSON.stringify(v);
  }
  return [v].flat().join(', ');
}
/** What the sources say of a disputed fact: the first source's value, then the others' ("ncsu: 9.5 · ufl.edu: 11.5"). */
function sourcesSay(fact, note) {
  const first = fact?.v != null && fact.src?.length ? `${fact.src.join(', ')}: ${shown(fact.v)}` : '';
  const flags = fact?.flags?.length ? ` (${fact.flags.join('; ')})` : '';
  return [first, note].filter(Boolean).join(' · ') + flags;
}
/** GitHub's anchor for a heading: lower case, spaces as hyphens, other punctuation dropped. */
export const anchor = (heading) => heading.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-');

/**
 * Sites a search found whose terms aren't in the record yet (a reader couldn't tell, or none has read them):
 * their review packets' names (search.mjs writes `<site>.txt` to `dir`). `registry`: site-terms.json.
 */
export function termsUnsettled(dir, registry) {
  if (!existsSync(dir)) return [];
  const read = new Set(Object.keys(registry).map((k) => k.replace(/[^a-z0-9.-]/gi, '_')));
  return readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4)).filter((k) => !read.has(k)).sort();
}

/**
 * The report. `catalog`: public/plants.json as written; `list`: the audit's
 * plant list; `combined`: sample.mjs's output; `review`: write.mjs's review list; `searched`: the web search's
 * claims by plant; `wcvp`: wcvp.mjs's review ({ homonyms, regulatedUnreviewed, regulatedNotMatched, notMatched });
 * `native`, `bloom`: wild.mjs's review lists; `warnings`: catalog:check's; `unfetched`: list.mjs toFetch's;
 * `termsUnsettled`: sites whose terms wait for a reading that settles them; `decisions`: scripts/catalog/decisions.json
 * (what a person already decided isn't listed again).
 * Returns { markdown, summary, counts }.
 */
export function reviewReport({ catalog, list, combined, review, searched = {}, wcvp = null, native = [], bloom = [], warnings = [], unfetched = null, termsUnsettled = [], decisions = {} }) {
  const byId = new Map(catalog.plants.map((p) => [p.id, p]));
  const order = new Map(catalog.plants.map((p, i) => [p.id, i]));
  const byOrder = (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9);
  const name = (id) => `${esc(byId.get(id)?.common ?? id)} (\`${id}\`)`;
  const auditOf = new Map(combined.map((a) => [a.id, a]));
  /** The audit's own fact, and the catalog's value now, for a review item. */
  const audit = (i) => auditOf.get(i.id)?.facts?.[i.fact];
  const now = (i) => esc(shown(byId.get(i.id)?.facts?.[i.fact]));
  const sections = [], contents = [];
  /** What's waiting, by what it asks: to decide; pages to fetch; plants to search; sites' terms; checks to tidy. */
  const counts = { decide: 0, pages: 0, search: 0, terms: 0, tidy: 0 };
  /** A section: a heading with its count, what it means, where a decision goes, then the items; and its line in the contents. */
  const section = (title, n, what, body, kind = 'decide') => {
    if (!n) return;
    counts[kind] += n;
    const heading = `${title} (${n})`;
    contents.push(`- [${heading}](#${anchor(heading)})`);
    sections.push(`## ${heading}\n\n${what}${body ? `\n\n${body}` : ''}`);
  };
  const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => ' --- ').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
  const bullets = (rows) => rows.map((r) => `- ${r}`).join('\n');
  const NO_PLACE = "There's no place to record a decision on these yet: they stay listed until there is.";
  /** Where a decision on a kind of item goes, for the kinds the build applies (docs/catalog-sources.md, "Decisions"). */
  const DECIDE = (key) => `A decision goes in scripts/catalog/decisions.json (\`${key}\`), and the build applies it.`;

  // 1. The writer's review list.
  const items = [...review].sort(byOrder);
  const of = (k) => items.filter((i) => reviewKind(i) === k);
  section('Sources disagree', of('disputed').length,
    `The audit's sources give different values, so the catalog keeps the value it had, marked unverified. Zones are on the half-zone scale (7 is 7a, 7.5 is 7b); sizes are in feet. ${NO_PLACE}`,
    table(['Plant', 'Fact', 'What the sources say', 'Catalog now'], of('disputed').map((i) => [name(i.id), factName(i.fact), esc(sourcesSay(audit(i), i.note)), now(i)])));
  section('Cultivar: tree or shrub?', of('tree').length,
    `The species is a tree, and this cultivar, with no page of its own, may be smaller, so its form is left as it was. ${DECIDE('form')}`,
    table(['Plant', 'What the sources say', 'Catalog now'], of('tree').map((i) => [name(i.id), esc(i.note), now(i)])));
  section('Edible, but rated toxic', of('edible').length,
    `A source says it's edible, and the catalog rates it toxic (to dogs, or to people), so "edible" isn't written. ${NO_PLACE}`,
    bullets(of('edible').map((i) => name(i.id))));
  section('Held back as implausible', of('held').length,
    `The audit's values would make the record implausible (the app's checks), so they weren't written. ${NO_PLACE}`,
    table(['Plant', 'Facts', 'Why'], of('held').map((i) => [name(i.id), factName(i.fact), esc(i.note.replace(/^held back: /, ''))])));
  section('A value its source no longer gives', of('stale').length,
    `An earlier build wrote it from a source, but no source gives it now: its page is no longer read, or no longer says it. It's kept (a plant's spread draws its circle), with the citation it had. ${NO_PLACE}`,
    table(['Plant', 'Fact', 'Value now'], of('stale').map((i) => [name(i.id), factName(i.fact), esc(i.note.replace(/^no source gives it now: /, ''))])));
  section("Values the catalog can't take", of('cant').length,
    "A source's value doesn't fit the catalog's format.",
    table(['Plant', 'Fact', 'Value'], of('cant').map((i) => [name(i.id), factName(i.fact), esc(i.note)])));

  // 2. Kew, the law lists, native status, bloom months.
  if (wcvp) {
    section("Kew names to check", (wcvp.homonyms?.length ?? 0) + (wcvp.regulatedUnreviewed?.length ?? 0) + (wcvp.regulatedNotMatched?.length ?? 0),
      "Names Kew's World Checklist could read two ways, taken as the accepted name (check each is the plant meant, and record it in scripts/catalog/decisions.json, `kewNames`); and law-list names Kew accepts under another, or doesn't match at all (set the entry's `accepted` in scripts/catalog/regulated-plants.json).",
      bullets([
        ...(wcvp.homonyms ?? []).map((n) => `${esc(n)}: an accepted name that is also an older homonym's synonym`),
        ...(wcvp.regulatedUnreviewed ?? []).map(esc),
        ...(wcvp.regulatedNotMatched ?? []).map((n) => `${esc(n)}: a law list's name Kew doesn't match to one accepted species`),
      ]));
  }
  section('Native status held back', native.length,
    `Kew has the species native to these states, but the catalog calls the plant "Exotic" (its species may hold a native kind the garden plant isn't), so it's never shown native. ${DECIDE('nativeShown')}`,
    bullets(native.map((n) => `${name(n.id)}: Kew's ${esc(n.name)}, native to ${plural(n.nativeIn?.length ?? 0, 'state')}`)));
  const months = (w) => (w ? `${MONTHS[w.start - 1]}–${MONTHS[w.end - 1]}` : '–');
  section('Bloom months held back', bloom.length,
    "The records' flowering months disagree with NC State's season, so the records' months aren't shown (NC State's season still is). To trust the records instead, add the plant to `RECORDS_TRUSTED` in scripts/catalog/bloom.mjs.",
    bullets(bloom.map((b) => `${name(b.id)}: the records say ${months(b.window)} (${plural(b.window?.n ?? 0, 'record')}); NC State says ${esc([b.seasons ?? []].flat().join(', ') || '–')}`)));

  // 3. Pages: matched wrong, or not read.
  const notes = combined.flatMap((a) => (a.notes ?? []).map((note) => ({ id: a.id, note }))).sort(byOrder);
  const noted = (k) => notes.filter((n) => noteKind(n.note) === k);
  section('A page under another name', noted('otherName').length,
    "The page the list points to gives another name, so it wasn't read. It may be the source's own misspelling, or a synonym: the right page. Or it may be another plant. To accept an NC State page as this plant's, add it to `names` in scripts/catalog/ncsu-pages.json, with the name it gives.",
    bullets(noted('otherName').map((n) => `${name(n.id)}: ${esc(n.note)}`)));
  section('Mapped twice on the Arkansas atlas', noted('atlasTwice').length,
    `The atlas maps the name more than once (its varieties, say) with different status; or on one map for all its varieties, whose status differs in its Appendix I, or which the appendix doesn't list. So the atlas's status for it is left out. ${NO_PLACE}`,
    bullets(noted('atlasTwice').map((n) => name(n.id))));
  const genusPages = noted('genusPage').filter((n) => !decisions.genusPage?.[n.id]);
  section("Read from the genus's page", genusPages.length,
    "NC State's page for the whole genus was read for this plant (scripts/catalog/ncsu-pages.json names it), so the facts read from it are the genus's, not the plant's own. Take the entry out to read none, or record in scripts/catalog/decisions.json (`genusPage`) that they fit it.",
    bullets(genusPages.map((n) => name(n.id))));

  // 4. To fetch or search.
  // (Never asked for, or asked and not there: a page the source doesn't have answers 404, which is kept.)
  const listed = new Map(list.map((s) => [s.id, s]));
  const neverAsked = new Set(unfetched?.named ?? []);
  const notSaved = noted('unfetched'), isNew = (n) => neverAsked.has(`https://plants.ces.ncsu.edu/plants/${listed.get(n.id)?.ncsu}/`);
  section("A page the list names but that isn't saved", notSaved.length,
    "scripts/catalog/ncsu-pages.json names the page, but there's no copy of it. One never fetched: `npm run catalog:build -- --fetch` asks for it. One NC State moved: point the entry at the new page. One asked for that NC State doesn't have: take its entry out.",
    bullets(notSaved.map((n) => { const slug = listed.get(n.id)?.ncsu, to = unfetched?.moved?.[slug]; return `${name(n.id)}: \`${esc(slug)}\`, ${isNew(n) ? 'never fetched' : to ? `moved to \`${esc(to)}\`` : 'asked for, and not there'}`; })), 'pages');
  const asks = unfetched ? [
    [unfetched.ncsu.length, "NC State species pages never asked for: guesses by the plant's name, so many may not exist (a page that doesn't answers 404, which is kept, so it's asked once)"],
    [unfetched.searches.length, 'USDA PLANTS name searches'],
    [unfetched.profiles.length, 'USDA PLANTS profiles and characteristics'],
  ].filter(([n]) => n) : [];
  section('Not looked up yet', asks.reduce((t, [n]) => t + n, 0),
    'Pages the list could use that were never asked for: `npm run catalog:build -- --fetch` asks for them (through the fetcher: robots.txt, and each site\'s pace; NC State\'s is one page every 5 seconds), then builds with what it finds.',
    bullets(asks.map(([n, what]) => `${n} ${what}`)), 'pages');
  const unsearched = list.filter((s) => !searched[s.id]).sort(byOrder);
  section('Not searched on the web', unsearched.length,
    "No web search has run for these yet: `node scripts/catalog/search.mjs` (docs/catalog-sources.md, \"Searching the web\"), then add its claims to catalog-src/web-claims.json.",
    bullets(unsearched.map((s) => name(s.id))), 'search');
  section('Sites whose terms are unsettled', termsUnsettled.length,
    "A search found pages on these sites, but their terms aren't in the record (scripts/catalog/site-terms.json): a reader couldn't tell what they allow, or none has read them. Their pages aren't used. Each one's packet is in catalog-src/terms-review/, which holds the last search run's (docs/catalog-sources.md, \"How terms are read\").",
    termsUnsettled.map(esc).join(', '), 'terms');

  // 5. The catalog's own checks, grouped by what each says ("<id>: <what>").
  const checks = new Map();
  for (const w of warnings) {
    const m = /^([a-z0-9-]+): (.*)$/.exec(w);
    const [id, what] = m ? [m[1], m[2].replace(/\d+(\.\d+)? ft is tall/, 'tall')] : ['', w];
    (checks.get(what) ?? checks.set(what, []).get(what)).push(id);
  }
  section('Catalog checks', warnings.length,
    'What `npm run catalog:check` lists: implausible values, and names and parents to tidy in the catalog itself.',
    bullets([...checks].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([what, ids]) => `${esc(what)} (${ids.length}): ${ids.filter(Boolean).map((id) => `\`${id}\``).join(', ')}`)), 'tidy');

  // 6. Counts only.
  const counted = COUNTED.map(([re, what]) => [notes.filter((n) => re.test(n.note)).length, what]).filter(([n]) => n);
  const wcvpMissed = wcvp?.notMatched?.length ? `\n\nKew's checklist has no one accepted species for ${plural(wcvp.notMatched.length, 'catalog name')} (hybrids, names it draws narrower, exotics it doesn't list in the US), so they have no native status: ${wcvp.notMatched.map(esc).join(', ')}.` : '';

  const audited = catalog.plants.filter((p) => p.audited).length;
  const parts = [
    [counts.decide, `${counts.decide} to decide`], [counts.pages, `${plural(counts.pages, 'page')} not fetched yet`],
    [counts.search, `${plural(counts.search, 'plant')} not searched`], [counts.terms, `${plural(counts.terms, 'site')} whose terms are unsettled`],
    [counts.tidy, plural(counts.tidy, 'catalog check')],
  ].filter(([n]) => n).map(([, t]) => t);
  const summary = `${parts.join(', ') || 'nothing waiting'}; ${audited} of ${catalog.plants.length} records audited`;
  const markdown = [
    '# Catalog review',
    `Written by \`npm run catalog:build\` (docs/catalog-build.md): what the build left for a person to decide, fetch or tidy, most useful first. Don't edit it: the next build writes it again. ${summary}.`,
    contents.join('\n'),
    ...sections,
    '## For reference',
    `Where a source gave nothing, counted only:\n\n${counted.map(([n, what]) => `- ${plural(n, 'plant')}: ${what}`).join('\n')}${wcvpMissed}`,
  ].filter(Boolean).join('\n\n') + '\n';
  return { markdown, summary, counts };
}
