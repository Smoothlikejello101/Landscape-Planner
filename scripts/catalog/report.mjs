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
  if (n.startsWith('taken out:')) return 'retracted';
  if (n.startsWith('withdrawn:')) return 'withdrawn';
  if (n.startsWith('check only:')) return 'checkOnly';
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
const FACT = { form: 'form', height: 'height', width: 'width', zone_min: 'coldest zone', zone_max: 'warmest zone', sun_most: 'most sun', sun_least: 'least sun', water: 'water', deer: 'deer', edible: 'edible', clay_ok: 'clay', wet_feet: 'wet feet', fall_color: 'fall color',
  fall_colors: 'fall colors', leaf_color: 'leaf color', foliage: 'leaves in winter', needles: 'needles', growth_rate: 'growth rate',
  self_seed: 'self-sowing', habit: 'spreading' };
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
 * New plants from NC State (additions.mjs), counted: added, waiting for what their sources don't yet give, left out
 * and why, and pages not yet saved. Counts only: nothing here is for a person to decide.
 */
function newPlantsNote({ added = [], waiting = {}, left = [], unsaved = 0, all = [] }) {
  if (!all.length && !added.length && !left.length && !Object.keys(waiting).length) return '';
  const lack = {}, why = {};
  for (const m of Object.values(waiting)) for (const k of m) lack[k] = (lack[k] ?? 0) + 1;
  for (const l of left) why[l.why] = (why[l.why] ?? 0) + 1;
  const rows = [
    `- ${plural(added.length, 'plant')} added from NC State's Plant Toolbox in this build${all.length > added.length ? ` (${all.length} in all)` : ''}`,
    Object.keys(waiting).length ? `- ${plural(Object.keys(waiting).length, 'plant')} waiting, for ${Object.entries(lack).map(([k, n]) => `${k === 'its species' ? 'its species' : k} (${n})`).join(', ')}` : '',
    left.length ? `- ${plural(left.length, 'page')} left out: ${Object.entries(why).map(([k, n]) => `${k} (${n})`).join(', ')}` : '',
    unsaved ? `- ${plural(unsaved, 'page')} the sitemap lists that aren't saved yet` : '',
  ].filter(Boolean);
  return `New plants (scripts/catalog/additions.mjs):\n\n${rows.join('\n')}`;
}

/**
 * The report. `catalog`: public/plants.json as written; `list`: the audit's
 * plant list; `combined`: sample.mjs's output; `review`: write.mjs's review list; `searched`: the web search's
 * claims by plant; `wcvp`: wcvp.mjs's review ({ homonyms, regulatedUnreviewed, regulatedNotMatched, notMatched });
 * `native`, `bloom`: wild.mjs's review lists; `warnings`: catalog:check's; `unfetched`: list.mjs toFetch's;
 * `termsUnsettled`: sites whose terms wait for a reading that settles them; `kewApart`: cultivars NC State may file
 * under a species Kew keeps apart (split.mjs); `decisions`: scripts/catalog/decisions.json
 * (what a person already decided isn't listed again).
 * Returns { markdown, summary, counts }.
 */
/** "4–6 ft" from a size range. */
const sizeText = (v) => (v ? (v.min === v.max ? `${v.min} ft` : `${v.min}–${v.max} ft`) : '');
/** A size range's middle (feet). */
const mid = (v) => v.med ?? (v.min + v.max) / 2;
const apart = (a, b, ratio) => a > 0 && b > 0 && Math.max(a, b) / Math.min(a, b) >= ratio;
/**
 * Height or width facts whose value and alternate are 3 times apart or more (by their middles): { id, fact, shown:
 * { v, src }, other: { v, src, checkOnly? }, otherFact, otherSize }. With the audit (`combined`) and the check-only
 * sources (decisions.json `checkOnly`), also each size a check-only source gives that far from the value shown: it's
 * never the alternate, so this is where it's seen (an authority can be the one that's wrong).
 */
export function farApartSizes(catalog, ratio = 3, combined = [], checkOnly = {}) {
  const out = [];
  const claimsOf = new Map(combined.map((a) => [a.id, a.claims ?? []]));
  for (const p of catalog.plants) {
    for (const fact of ['height', 'width']) {
      const f = p.facts?.[fact];
      if (!f?.v) continue;
      const otherFact = fact === 'height' ? 'width' : 'height';
      const row = (other) => ({ id: p.id, fact, shown: { v: f.v, src: f.src ?? [] }, other, otherFact, otherSize: p.facts?.[otherFact]?.v ?? null });
      if (f.alt?.v && apart(mid(f.v), mid(f.alt.v), ratio)) out.push(row({ v: f.alt.v, src: f.alt.src ?? [] }));
      const seen = new Set();
      for (const c of claimsOf.get(p.id) ?? []) {
        if (c.fact !== fact || !checkOnly[c.src] || c.flag || !c.v || seen.has(c.src) || (f.src ?? []).includes(c.src)) continue;
        seen.add(c.src);
        if (apart(mid(f.v), mid(c.v), ratio)) out.push(row({ v: c.v, src: [c.src], checkOnly: true }));
      }
    }
  }
  return out;
}
/**
 * How often each source's sizes are far from an authority's for the same plant: a plant counts as far where its
 * height or spread is 3 times or more from every authority's (by their middles). Sources not authorities only, each
 * plant once. { sources: [{ src, plants, far, examples }], plants, far } (all of them together), most far first.
 */
export function farOffSources(combined, ratio = 3) {
  const by = new Map();
  for (const a of combined) {
    const claims = a.claims ?? [];
    const result = new Map(); // src → far on this plant
    for (const fact of ['height', 'width']) {
      const auth = claims.filter((c) => c.fact === fact && c.kind === 'authority' && !c.flag && !c.fallback && c.v && mid(c.v) > 0);
      if (!auth.length) continue;
      for (const c of claims) {
        if (c.fact !== fact || c.kind === 'authority' || c.flag || !c.v || !(mid(c.v) > 0)) continue;
        const far = auth.every((x) => apart(mid(x.v), mid(c.v), ratio));
        result.set(c.src, (result.get(c.src) ?? false) || far);
      }
    }
    for (const [src, far] of result) {
      const s = by.get(src) ?? { src, plants: 0, far: 0, examples: [] };
      s.plants++;
      if (far) { s.far++; if (s.examples.length < 4) s.examples.push(a.id); }
      by.set(src, s);
    }
  }
  const sources = [...by.values()].sort((x, y) => y.far / y.plants - x.far / x.plants || y.plants - x.plants);
  return { sources, plants: sources.reduce((n, s) => n + s.plants, 0), far: sources.reduce((n, s) => n + s.far, 0) };
}
/**
 * The sources a person may want to make check-only (decisions.json `checkOnly`): at least `min` plants to judge by,
 * and far off at least `times` as often as all sources together. (Listed, never applied by the build: a rare big
 * disagreement from a sound source is often where an authority is wrong.)
 */
export function oftenFarOff(combined, { min = 20, times = 2.5, decided = {} } = {}) {
  const all = farOffSources(combined);
  const rate = all.plants ? all.far / all.plants : 0;
  return { rate, sources: all.sources.filter((s) => s.plants >= min && s.far / s.plants >= times * rate && !decided[s.src]) };
}

export function reviewReport({ catalog, list, combined, review, searched = {}, wcvp = null, native = [], bloom = [], warnings = [], unfetched = null, termsUnsettled = [], decisions = {}, additions = null, kewApart = [] }) {
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
    `A source says it's edible, and the catalog rates it toxic (to dogs, or to people), so "edible" isn't written. ${DECIDE('edible')}`,
    bullets(of('edible').map((i) => name(i.id))));
  section('Held back as implausible', of('held').length,
    `The audit's values would make the record implausible (the app's checks), so they weren't written. ${NO_PLACE}`,
    table(['Plant', 'Facts', 'Why'], of('held').map((i) => [name(i.id), factName(i.fact), esc(i.note.replace(/^held back: /, ''))])));
  section('A value its source no longer gives', of('stale').length,
    `An earlier build wrote it from a source, but no source gives it now: its page is no longer read, or no longer says it. It's kept (a plant's spread draws its circle), with the citation it had. ${NO_PLACE}`,
    table(['Plant', 'Fact', 'Value now'], of('stale').map((i) => [name(i.id), factName(i.fact), esc(i.note.replace(/^no source gives it now: /, ''))])));
  // Sizes whose sources are far apart (decided with Jason, Oct 29: found and decided, not fixed one by one): the value
  // shown and its alternate 3 times apart or more. One is likely a misreading or a mistake; a person picks the
  // source that leads (decisions.json `leads`).
  const leads = decisions.leads ?? {};
  const far = farApartSizes(catalog, 3, combined, decisions.checkOnly ?? {}).filter((r) => !leads[r.id]?.[r.fact]).sort(byOrder);
  section('Sizes whose sources are far apart', far.length,
    `The size shown and the other source's are 3 times apart or more, so one is likely wrong (a reading of the wrong number, a range that's a bin, a climbing vine's length). Each source's value is here; the plant's other size beside it can tell which. ${DECIDE('leads')} (the source that leads that size).`,
    table(['Plant', 'Fact', 'Shown', 'Other source', 'Its other size'], far.map((r) => [name(r.id), factName(r.fact), esc(`${sizeText(r.shown.v)} (${r.shown.src.join(', ')})`), esc(`${sizeText(r.other.v)} (${r.other.src.join(', ')}${r.other.checkOnly ? ', check only' : ''})`), esc(r.otherSize ? `${r.otherFact} ${sizeText(r.otherSize)}` : '')])));
  // Sources far off the authorities much more often than the rest (decided with Jason, Oct 29: judged by a source's
  // record, not by one value; a person decides, decisions.json `checkOnly`).
  const often = oftenFarOff(combined, { decided: decisions.checkOnly ?? {} });
  const pct = (n) => `${Math.round(n * 100)}%`;
  section('Sources often far from the authorities', often.sources.length,
    `Sources whose sizes are 3 times or more from every authority's for the same plant on at least ${pct(often.rate * 2.5)} of the plants they share (2.5 times the ${pct(often.rate)} of all sources together), with 20 plants or more to judge by. Often a sign of bins or a misread field, not measured sizes. A source made check-only never decides a value, backs one or shows as its alternate; where it's far from the value shown, the plant is still listed above ("Sizes whose sources are far apart"), since a sound source's rare big disagreement is often where an authority is wrong. ${DECIDE('checkOnly')}`,
    table(['Source', 'Plants', 'Far off', 'Some of them'], often.sources.map((s) => [esc(s.src), String(s.plants), `${s.far} (${pct(s.far / s.plants)})`, s.examples.map((id) => name(id)).join(', ')])));
  // Values read from a page's text that a second reading didn't agree with, or hasn't read yet (second-reading.mjs).
  const held = combined.flatMap((a) => (a.held ?? []).map((h) => ({ id: a.id, ...h }))).sort(byOrder);
  const differs = held.filter((h) => h.why === 'disagree'), unread = held.filter((h) => h.why === 'unread');
  const has = new Map(catalog.plants.map((p) => [p.id, p.facts]));
  const catalogHas = (h) => { const f = has.get(h.id)?.[h.fact]; const v = f?.v ?? (typeof f === 'string' ? f : null); return v == null ? 'nothing' : `${shown(v)}${typeof f === 'string' ? ' (the earlier list)' : ''}`; };
  section('Read from text, but a second reading differs', differs.length,
    "A value the rules read from a page's text, which a second reading of the same text (blind to the first) read differently, and not just in degree. It isn't written. The catalog keeps what it had, except a value an earlier build read from that text: that's taken out, unsettled (NC State's deer field, where its text lowered it, stands as the field gives it). Nothing to decide yet: a page can be read again, or a person can look.",
    table(['Plant', 'Fact', 'The rules read', 'The second reading', 'Source', 'The catalog has'], differs.map((h) => [name(h.id), factName(h.fact), esc(shown(h.rules)), esc(h.reader == null ? 'nothing' : shown(h.reader)), esc(h.src), esc(catalogHas(h))])), 'tidy');
  section('Read from text, waiting for a second reading', unread.length,
    "Values the rules read from a page's text whose page hasn't had its second reading (its text is new, or changed): not written until it has. The build lists the pages in catalog-src/build/second-reading-tasks.json.",
    bullets([...new Set(unread.map((h) => h.id))].slice(0, 40).map((id) => name(id)).concat(unread.length > 40 ? ['…'] : [])), 'tidy');
  section('Taken out: a description read wrongly before', of('retracted').length,
    "A value an earlier build read from a page's description, by rules that have since been fixed and no longer read it so. It's taken out (nothing to decide: listed so the change is seen).",
    table(['Plant', 'Fact', 'What was taken out'], of('retracted').map((i) => [name(i.id), factName(i.fact), esc(i.note.replace(/^taken out: /, ''))])), 'tidy');
  section('Taken out: its source withdrawn', of('withdrawn').length,
    "A value whose only sources we may no longer read: their terms were taken back for a fresh reading, or found to bar us (decisions.json `withdrawn`). It's taken out (nothing to decide: listed so the change is seen).",
    table(['Plant', 'Fact', 'What was taken out'], of('withdrawn').map((i) => [name(i.id), factName(i.fact), esc(i.note.replace(/^withdrawn: /, ''))])), 'tidy');
  section('Taken out: its source check-only', of('checkOnly').length,
    "A value whose only source is check-only (decisions.json `checkOnly`): such a source never decides. It's taken out (nothing to decide: listed so the change is seen).",
    table(['Plant', 'Fact', 'What was taken out'], of('checkOnly').map((i) => [name(i.id), factName(i.fact), esc(i.note.replace(/^check only: /, ''))])), 'tidy');
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
  const apart = kewApart.filter((k) => !decisions.kewSpecies?.[k.id]).sort(byOrder);
  section("Under a species Kew keeps apart", apart.length,
    `NC State files these cultivars under one species, and its page for another, which Kew's checklist keeps apart, leads there; each one's page calls it the other's. A cultivar goes under the species Kew accepts (docs/catalog-sources.md, "Kew's species"), so check each and move it. ${DECIDE('kewSpecies')}`,
    bullets(apart.map((k) => `${name(k.id)}: filed under ${esc(k.y)}; its page (\`${k.page}\`) says "${esc(k.word)}", for ${esc(k.x)}`)));
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
  // (Plants added from NC State are counted, not listed: there are thousands. scripts/catalog/added-plants.json has them.)
  const fromNcsu = new Set(additions?.all ?? []);
  const unsearched = list.filter((s) => byId.has(s.id) && !searched[s.id]).sort(byOrder);
  const addedUnsearched = unsearched.filter((s) => fromNcsu.has(s.id)).length;
  section('Not searched on the web', unsearched.length,
    "No web search has run for these yet: `node scripts/catalog/search.mjs` (docs/catalog-sources.md, \"Searching the web\"), then add its claims to catalog-src/web-claims.json.",
    [bullets(unsearched.filter((s) => !fromNcsu.has(s.id)).map((s) => name(s.id))), addedUnsearched ? `- ${plural(addedUnsearched, 'plant')} added from NC State (scripts/catalog/added-plants.json)` : ''].filter(Boolean).join('\n'), 'search');
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
    additions ? newPlantsNote(additions) : '',
  ].filter(Boolean).join('\n\n') + '\n';
  return { markdown, summary, counts };
}
