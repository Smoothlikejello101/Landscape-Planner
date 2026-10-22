// The build's review report, docs/catalog-review.md: everything the build left for a person to decide, read or
// fetch, most useful first (docs/catalog-build.md). Made from the build's own files, so it changes only when
// what's waiting changes.

/** What a review item (write.mjs) asks. */
export function reviewKind(item) {
  const n = String(item.note ?? '');
  if (n.startsWith('held back:')) return 'held';
  if (n.startsWith('edible, but rated toxic')) return 'edible';
  if (n.startsWith("value the catalog can't take")) return 'cant';
  if (item.fact === 'form' && /tree without saying understory or canopy|a cultivar may be a tree/.test(n)) return 'tree';
  return 'disputed';
}

/** What an audit note (sample.mjs) says, for grouping: a kind, or null for one only counted. */
export function noteKind(note) {
  if (note === 'NC State page not fetched') return 'unfetched';
  if (/^NC State page \S+ is .*: left out$|^USDA's \S+ is .*: left out$|^Minnesota Wildflowers page is .*: left out$/.test(note)) return 'otherPlant';
  if (/^NC State has only a page for the genus /.test(note)) return 'genusPage';
  if (/more than once with different status: left for the review$/.test(note)) return 'atlasTwice';
  if (note === 'Not in USDA PLANTS by this name') return 'noUsda';
  return null;
}
/** Notes only counted, with what each means. */
const COUNTED = [
  [/^No NC State page$/, 'no NC State page for it'],
  [/^USDA has no characteristics for it$/, 'a USDA PLANTS profile with no characteristics (size, sun and so on)'],
  [/^Not found under .* on the Arkansas atlas's map pages$/, "not on the Arkansas atlas's maps (mostly plants not found wild in Arkansas)"],
  [/^Arkansas atlas not looked up/, 'the Arkansas atlas not looked up (a genus or cultivar group, no species name)'],
  [/^A cultivar read from species pages/, "a cultivar read from its species' pages: its size, form and flower color wait for a page about the cultivar"],
];

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
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

/**
 * The report. `catalog`: public/plants.json as written; `date`: the day the pages were read; `list`: the audit's
 * plant list; `combined`: sample.mjs's output; `review`: write.mjs's review list; `searched`: the web search's
 * claims by plant; `wcvp`: wcvp.mjs's review ({ homonyms, regulatedUnreviewed, regulatedNotMatched, notMatched });
 * `native`, `bloom`: wild.mjs's review lists; `warnings`: catalog:check's; `unfetched`: list.mjs toFetch's; `termsUnsettled`:
 * sites whose terms packets wait for a reading that settles them.
 * Returns { markdown, summary, count, counts }.
 */
export function reviewReport({ catalog, date, list, combined, review, searched = {}, wcvp = null, native = [], bloom = [], warnings = [], unfetched = null, termsUnsettled = [] }) {
  const byId = new Map(catalog.plants.map((p) => [p.id, p]));
  const order = new Map(catalog.plants.map((p, i) => [p.id, i]));
  const byOrder = (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9);
  const name = (id) => `${esc(byId.get(id)?.common ?? id)} (\`${id}\`)`;
  const auditOf = new Map(combined.map((a) => [a.id, a]));
  /** The audit's own fact, and the catalog's value now, for a review item. */
  const audit = (i) => auditOf.get(i.id)?.facts?.[i.fact];
  const now = (i) => esc(shown(byId.get(i.id)?.facts?.[i.fact]));
  const sections = [], contents = [];
  const counts = { decide: 0, fetch: 0, tidy: 0 };
  /**
   * A section: a heading with its count, a line on what to do, then the body; and its line in the contents.
   * `kind`: what it asks of a person: to decide, to fetch or search, or to tidy the catalog.
   */
  const section = (title, n, what, body, kind = 'decide') => {
    if (!n) return;
    counts[kind] += n;
    const heading = `${title} (${n})`;
    // (GitHub's anchor for a heading: lower case, spaces as hyphens, other punctuation dropped.)
    contents.push(`- [${heading}](#${heading.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-')})`);
    sections.push(`## ${heading}\n\n${what}${body ? `\n\n${body}` : ''}`);
  };
  const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => ' --- ').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
  const bullets = (rows) => rows.map((r) => `- ${r}`).join('\n');

  // 1. The writer's review list.
  const items = [...review].sort(byOrder);
  const of = (k) => items.filter((i) => reviewKind(i) === k);
  section('Sources disagree', of('disputed').length,
    "The audit's sources give different values, so the catalog keeps the value it had, marked unverified, until someone decides. Zones are on the half-zone scale (7 is 7a, 7.5 is 7b); sizes are in feet.",
    table(['Plant', 'Fact', 'What the sources say', 'Catalog now'], of('disputed').map((i) => [name(i.id), factName(i.fact), esc(sourcesSay(audit(i), i.note)), now(i)])));
  section('Tree: understory or canopy?', of('tree').length,
    "A source calls it a tree without saying which kind, or the species is a tree and this cultivar may be smaller. The form is left as it was until someone decides.",
    table(['Plant', 'What the sources say', 'Catalog now'], of('tree').map((i) => [name(i.id), esc(i.note), now(i)])));
  section('Edible, but rated toxic', of('edible').length,
    "A source says it's edible, and the catalog rates it toxic (to dogs, or to people), so \"edible\" isn't written until someone decides.",
    bullets(of('edible').map((i) => name(i.id))));
  section('Held back as implausible', of('held').length,
    "The audit's values would make the record implausible (the app's checks), so they weren't written.",
    table(['Plant', 'Facts', 'Why'], of('held').map((i) => [name(i.id), factName(i.fact), esc(i.note.replace(/^held back: /, ''))])));
  section("Values the catalog can't take", of('cant').length,
    "A source's value doesn't fit the catalog's format.",
    table(['Plant', 'Fact', 'Value'], of('cant').map((i) => [name(i.id), factName(i.fact), esc(i.note)])));

  // 2. Kew, the law lists, native status, bloom months.
  if (wcvp) {
    section("Kew names to check", (wcvp.homonyms?.length ?? 0) + (wcvp.regulatedUnreviewed?.length ?? 0),
      "Names Kew's World Checklist could read two ways, taken as the accepted name; check each is the plant meant. A law list's name Kew accepts under another needs its `accepted` set in scripts/catalog/regulated-plants.json.",
      bullets([...(wcvp.homonyms ?? []).map((n) => `${esc(n)}: an accepted name that is also an older homonym's synonym`), ...(wcvp.regulatedUnreviewed ?? []).map(esc)]));
  }
  section('Native status held back', native.length,
    "Kew has the species native to these states, but the catalog calls the plant \"Exotic\" (its species may hold a native kind the garden plant isn't), so it's never shown native. Decide whether it should be.",
    bullets(native.map((n) => `${name(n.id)}: Kew's ${esc(n.name)}, native to ${plural(n.nativeIn?.length ?? 0, 'state')}`)));
  section('Bloom months held back', bloom.length,
    "The records' flowering months disagree with NC State's season, so neither is shown until someone decides.",
    bullets(bloom.map((b) => `${name(b.id)}: ${esc(JSON.stringify(b))}`)));

  // 3. What the sources didn't give.
  const notes = combined.flatMap((a) => (a.notes ?? []).map((note) => ({ id: a.id, note }))).sort(byOrder);
  const noted = (k) => notes.filter((n) => noteKind(n.note) === k);
  section('A page that names another plant', noted('otherPlant').length,
    "The page the list points to is about another plant (often a synonym or a misapplied name), so it wasn't read. Point the list at the right page (scripts/catalog/ncsu-pages.json for NC State), or leave it out.",
    bullets(noted('otherPlant').map((n) => `${name(n.id)}: ${esc(n.note)}`)));
  section('Mapped twice on the Arkansas atlas', noted('atlasTwice').length,
    "The atlas maps the name more than once (its varieties, say) with different status, so the atlas's status for it is left out.",
    bullets(noted('atlasTwice').map((n) => name(n.id))));
  section("A page the list names but that isn't saved", noted('unfetched').length,
    'Run `npm run catalog:build -- --fetch`, or take the page out of scripts/catalog/ncsu-pages.json.',
    bullets(noted('unfetched').map((n) => name(n.id))), 'fetch');
  section("Read from the genus's page", noted('genusPage').length,
    "NC State's page for the genus was read for this plant: its facts are the genus's, not the plant's.",
    bullets(noted('genusPage').map((n) => `${name(n.id)}: ${esc(n.note)}`)));
  const asks = unfetched ? [[unfetched.ncsu.length, "NC State species pages never asked for (NC State may have a page; asked once, a 404 is kept)"], [unfetched.searches.length, 'USDA PLANTS name searches'], [unfetched.profiles.length, 'USDA PLANTS profiles and characteristics']].filter(([n]) => n) : [];
  section('Not looked up yet', asks.reduce((t, [n]) => t + n, 0),
    'Pages the list could use that have never been fetched: `npm run catalog:build -- --fetch` asks for them (politely: robots.txt, and each site\'s pace), then builds with what it finds.',
    bullets(asks.map(([n, what]) => `${n} ${what}`)), 'fetch');
  const unsearched = list.filter((s) => !searched[s.id]).sort(byOrder);
  section('Not searched on the web', unsearched.length,
    "No web search has run for these yet: `node scripts/catalog/search.mjs` (docs/catalog-sources.md, \"Searching the web\"), then add its claims to catalog-src/web-claims.json.",
    bullets(unsearched.map((s) => name(s.id))), 'fetch');
  section('Sites whose terms are unsettled', termsUnsettled.length,
    "A search found pages on these sites, but their terms aren't in the record (scripts/catalog/site-terms.json): a reader couldn't tell what they allow, or none has read them. Their pages aren't used. Each one's packet is in catalog-src/terms-review/, which holds the last search run's (docs/catalog-sources.md, \"How terms are read\").",
    termsUnsettled.map(esc).join(', '), 'fetch');
  // (Grouped by what each says: "<id>: <what>".)
  const checks = new Map();
  for (const w of warnings) {
    const m = /^([a-z0-9-]+): (.*)$/.exec(w);
    const [id, what] = m ? [m[1], m[2].replace(/\d+(\.\d+)? ft is tall/, 'tall')] : ['', w];
    (checks.get(what) ?? checks.set(what, []).get(what)).push(id);
  }
  section('Catalog checks', warnings.length,
    'What `npm run catalog:check` lists: implausible values, and names and parents to tidy.',
    bullets([...checks].sort((a, b) => b[1].length - a[1].length).map(([what, ids]) => `${esc(what)} (${ids.length}): ${ids.filter(Boolean).map((id) => `\`${id}\``).join(', ')}`)), 'tidy');

  // 4. Counts only.
  const counted = COUNTED.map(([re, what]) => [notes.filter((n) => re.test(n.note)).length, what]).filter(([n]) => n);
  const noUsda = noted('noUsda');
  const reference = [
    ...counted.map(([n, what]) => `- ${plural(n, 'plant')}: ${what}`),
    noUsda.length ? `- ${plural(noUsda.length, 'plant')} not in USDA PLANTS by this name (a hybrid, a cultivar group, or a name it lists under another)` : '',
  ].filter(Boolean);
  const wcvpMissed = wcvp?.notMatched?.length ? `\n\nKew's checklist has no one accepted species for ${plural(wcvp.notMatched.length, 'name')} (hybrids, names it splits, exotics it doesn't list in the US): ${wcvp.notMatched.map(esc).join(', ')}.` : '';

  const audited = catalog.plants.filter((p) => p.audited).length;
  const count = counts.decide + counts.fetch + counts.tidy;
  const summary = `${counts.decide} to decide, ${counts.fetch} to fetch or search, ${plural(counts.tidy, 'catalog check')}; ${audited} of ${catalog.plants.length} records audited`;
  const markdown = [
    '# Catalog review',
    `Written by \`npm run catalog:build\` (docs/catalog-build.md) from the pages read ${date}: what the build left for a person to decide, read or fetch, most useful first. Don't edit it: the next build writes it again. ${summary}.`,
    contents.join('\n'),
    ...sections,
    '## For reference',
    `Where the sources had nothing to give, counted only:\n\n${reference.join('\n')}${noUsda.length ? `\n\n<details><summary>Not in USDA PLANTS by this name</summary>\n\n${noUsda.map((n) => name(n.id)).join(', ')}\n\n</details>` : ''}${wcvpMissed}`,
  ].join('\n\n') + '\n';
  return { markdown, summary, count, counts };
}
