// Facts read from a source's own sentences (decided with Jason, 2026-10-26: "read everything"; docs/catalog-sources.md,
// "Reading descriptions"). A page's fields come first: a fact is read from its prose only where its fields say nothing
// (sample.mjs).
// Each claim keeps the sentence it was read from (`says`), in the build's own files and the review, so it can be checked
// against the page; the catalog says only that it was read from the description (`from`), since descriptions aren't
// copied (docs/catalog-sources.md).
//
// Read by rule, never by guess: a sentence speaks to a fact only in the words the rules below know, and about the plant
// itself (not "the deciduous forests" it grows in, the evergreens it's planted under, or a plant it's compared to). A
// sentence these rules can't settle says nothing. So far: whether its leaves stay through winter (`foliage`), and the
// zones a plant is hardy in where the page's own zone field takes in the zones its text says it's only an annual in.
import { zoneSpan } from './claims.mjs';

const decode = (s) => String(s)
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|li|div|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&([a-z]+\d*);/gi, (all, n) => NAMED[n] ?? all)
  .replace(/[‘’]/g, "'").replace(/[ \t\u00a0]+/g, ' ');
const NAMED = { rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: '–', mdash: '—', hellip: '…', deg: '°', eacute: 'é', egrave: 'è', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä', times: '×', frac12: '½', frac14: '¼', frac34: '¾', reg: '®', trade: '™', copy: '©' };

/** Words a sentence can end on without ending: "P. peltatum", "var. rubrum", "e.g. lantana", "U.S. Department". */
const NOT_AN_END = /(?:^|[\s(])(?:[A-Z]|[a-z]|spp|ssp|subsp|var|cv|cvs|syn|sp|e\.g|i\.e|etc|vs|approx|ca|Dr|Mr|Mrs|Ms|Mt|St|Ft|ft|in|No|U\.S)\.$/;

/** A text's sentences, each as written (spaces tidied), in order. */
export function sentences(text) {
  const out = [];
  for (const para of String(text ?? '').split(/\n+/)) {
    const t = para.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    let start = 0;
    const re = /[.!?](?=\s+["“(]?[A-Z0-9])/g;
    let m;
    while ((m = re.exec(t))) {
      const upto = t.slice(start, m.index + 1);
      if (NOT_AN_END.test(upto)) continue;
      out.push(upto.trim());
      start = m.index + 1;
    }
    const rest = t.slice(start).trim();
    if (rest) out.push(rest);
  }
  return out;
}

/** The names NC State's page gives its plant: its botanical name (the title) and its common names. */
export function ncsuNames(html) {
  const t = String(html ?? '');
  const title = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(t)?.[1];
  const list = /id="common_names"[^>]*>([\s\S]*?)<\/ul>/i.exec(t)?.[1] ?? '';
  // (The title ends with NC State's "Play pronunciation" button.)
  return [title, ...[...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1])].map((x) => decode(x ?? '').replace(/\s+/g, ' ').replace(/\s*Play pronunciation\s*$/i, '').trim()).filter(Boolean);
}

/** NC State's description of a plant (its "Description" entry), as sentences; [] where the page has none. */
export function ncsuDescription(html) {
  const m = /<dt[^>]*>\s*Description\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i.exec(String(html ?? ''));
  return m ? sentences(decode(m[1])) : [];
}

// ---------- Leaves in winter ----------
//
// Each word for it in a sentence is one of: evergreen; deciduous; dying back (or going dormant) in winter; or one of
// those said to depend on the winter ("evergreen in warmer climates", "may be semi-evergreen", "dies back in a hard
// freeze"). Checked against the plants whose fields already say (2026-10-26): where the fields and the sentences both
// speak, they agree on nine in ten, and most of the rest are the sentences being finer ("may be semi-evergreen in the
// south" of a plant the fields call deciduous).

/** Plants and places the word is about instead, just after it: "deciduous forests", "evergreen and deciduous trees". */
const OTHERS = /^(?:[\s,-]+[\w'-]+){0,4}?[\s,-]+(?:forests?|woods|woodlands?|trees|shrubs|hardwoods|thickets|canop(?:y|ies)|overstor(?:y|ies)|plants|stands|swamps|habitats?|communit(?:y|ies)|groves|understor(?:y|ies)|hammocks|bottomlands?|leaf litter|neighbors|companions|counterparts|relatives|cousins|evergreens|conifers|hedges|varieties|cultivars|types|kinds|members|genus|genera|ornamentals)\b/i;
/** The word's own: its leaves, or the plant itself ("a perennial with evergreen leaves", "an evergreen shrub"). */
const OWN = /^[\s,]+(?:leaves|foliage|fronds|needles|leaf|basal|rosettes?|clumps?|groundcover|ground cover|perennial|shrub|tree|vine|fern|grass|sedge|habit|nature|mat|carpet)\b/i;
/** Just before it, a plant it's near or compared with: "under evergreens", "looks like a needled evergreen". */
const NEAR_BEFORE = /(?<![\w-])(?:under|beneath|below|among|amid|amongst|near|beside|between|around|alongside|in front of|behind|against|backed by|background of|than|unlike|like|other|nearby|surrounding|resembles?|resembling|genus|family)\s+(?:[\w'-]+[\s,]+){0,3}$/i;
/** A sentence about something else: what it's planted with, or a plant it's compared to. */
const ELSEWHERE = /\b(?:unlike|similar to|compared|resembles?|confused with|mistaken for|combine (?:it )?with|pair (?:it )?with|plant (?:it )?(?:with|near|among|under|beneath)|companions?|underplant|backdrop|in contrast|whereas|the difference between|differs? from|distinguish\w*)\b/i;
/** Where its name comes from: "the species name means deciduous". */
const NAMING = /\b(?:epithet|genus name|species name|specific name|common name|the name|its name|named (?:for|after)|(?:latin|greek)(?: word)? for)\b/i;
/** Where it grows wild: a word after this is about its habitat ("native to moist deciduous forests"). */
const HABITAT = /\b(?:native to|native from|found (?:in|on|along|growing|throughout|\w+ing)|inhabit\w*|grows? (?:wild|naturally)|growing (?:wild|naturally|in)|habitats?|in the wild|origin|occurs? (?:in|on|along)|occurring|woodlands|forests|thickets)\b/i;
/** Said of it not happening: "not evergreen", "never goes dormant". */
const NOT_BEFORE = /\b(?:not|never|no|nor|rarely|seldom|isn't|aren't|doesn't|don't|won't|without|instead of|rather than)\s+(?:\w+\s+){0,2}$/i;
/** The winter it depends on, near the word: where winters are mild or hard, how cold, or a zone (after the word:
 * "hardy in zones 5 to 9" before it is about cold, not leaves). */
const PLACE = /\b(?:in (?:(?:the |a |an )?(?:warmer|warm|mild|milder|colder|cold|cooler|severe|harsh|hard|southern|northern|coastal|frost-free|south|north|deep south|lower south|upper south)\b)|further (?:north|south)|farther (?:north|south)|north of|south of|depending on (?:the )?(?:winter|climate|location|zone|temperatures?|cold|where|how cold)|where winters?|if (?:the )?winters?|mild winters?|warm winters?|cold winters?|colder winters?|harsh winters?|severe winters?|hard freezes?|hard frosts?|hard winters?|killing freezes?|extended (?:periods of )?(?:cold|freezes?)|prolonged|for (?:long|extended) periods|long periods|colder (?:climates?|areas|regions|zones|locations|winters)|warmer (?:climates?|areas|regions|zones|locations|winters)|southern (?:range|part|portion)|northern (?:range|part|portion)|degrees|unless|except)\b/i;
const ZONES = /\bzones? \d/i;
/** Or a maybe, just before it, in the same stretch of words: "may be evergreen", "is often semi-evergreen", "can be
 * grown as an evergreen" (not "sometimes spindly, deciduous"). */
const MAYBE = /\b(?:may|might|can|could|sometimes|often|usually|generally|mostly|nearly|almost|partially|partly|tends? to|occasionally|somewhat)\b/i;
/** Dying back or resting counts only in winter (not in summer's heat, after it flowers, or after it seeds). */
const WINTER = /\b(?:winter|wintertime|fall|autumn|frosts?|freez\w*|cold|cooler weather)\b/i;
/** (Or for a dry spell: "evergreen, but during a drought it may become deciduous".) */
const DRY = /\b(?:summer|heat|drought|dry spells?|dry season)\b/i;
/** (A houseplant's rest, which keeps its leaves: "dormant during the winter, and watering should be reduced".) */
const NOT_WINTER = /\b(?:summer|heat|drought|dry spells?|water(?:ing|ed)?|moisture|houseplants?|indoors|repot\w*|fertiliz\w*|after (?:flowering|blooming|bloom|seed\w*|fruiting)|once (?:flowering|blooming) (?:is|has)|seedset|transplant\w*|cuttings|tubers? should|reduce watering|late spring|from spring|after spring|until (?:fall|autumn)|leaves (?:again )?(?:appear|emerge|return|reappear)|re-?emerges? in (?:the )?(?:fall|autumn))\b/i;
const WORD = /\b(semi(?:\s+to\s+|-\s?|\s)?evergreens?|semi-?\s?deciduous|evergreen|deciduous|(?:dies?|died|dying|die)\s+(?:back|down|to the ground)|(?:go|goes|going|went|gone|becomes?|is|are|remains?|stays?|lies?|lie)\s+dormant|winter[- ]dormant|dormant (?:in|during|through) (?:the )?winter)\b/gi;

/** Words that start a sentence about the plant itself, or a part of it: "It is", "The foliage is", "This shrub has". */
const GENERIC = /^(?:it|its|this|these|they|the|a|an|plants?|leaves|foliage|fronds|stems?|flowers?|blooms?|species|genus|shrub|tree|vine|fern|grass|perennial|cultivar|variety|selection|hybrid|evergreen|deciduous|semi-evergreen|in|during|although|even|though|while|once|after|when|where|if|unlike|like|both|either|neither|its)$/i;
const words = (x) => String(x).toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9.×-]+/).filter(Boolean);
/**
 * Whether a sentence is about another plant, named as its subject: "The Cutleaf Grape Fern is evergreen" on the
 * rattlesnake fern's page. Its subject: the words before its first "is", "are" or "has", where they start with a capital
 * and aren't a word for the plant itself ("It", "The foliage"). It's about another plant where those words aren't one
 * of the page's names (its botanical name or common names), nor part of one.
 */
export function aboutAnother(sentence, names) {
  if (!names?.length) return false;
  const m = /^(?:The |This |These |A |An )?([A-Z][\w'’.×-]*(?:\s+[A-Za-z×][\w'’.-]*){0,4}?)\s+(?:is|are|was|were|has|have)\b/.exec(String(sentence));
  if (!m) return false;
  const subject = words(m[1]);
  if (!subject.length || GENERIC.test(subject[0])) return false;
  const known = names.map(words);
  const inside = (a, b) => a.length <= b.length && b.join(' ').includes(a.join(' '));
  // ("Holly fern" for "Japanese holly fern"; "Lantana" for Lantana camara; the genus alone for a species.)
  return !known.some((n) => inside(subject, n) || inside(n, subject) || n[0] === subject[0]);
}

/**
 * The words in one sentence that speak to its plant's leaves in winter, each as `E` (evergreen), `D` (deciduous),
 * `B` (dies back, or goes dormant, in winter), `S` (semi-evergreen), or `E?`, `D?`, `B?` where the sentence says it
 * depends on the winter. Words about other plants, its habitat, or said not to happen are left out.
 */
export function foliageWords(sentence, names = []) {
  const s = String(sentence ?? '');
  if (ELSEWHERE.test(s) || NAMING.test(s) || aboutAnother(s, names)) return [];
  const out = [];
  for (const m of s.matchAll(WORD)) {
    const word = m[1].toLowerCase();
    const before = s.slice(0, m.index), after = s.slice(m.index + m[0].length);
    if (!OWN.test(after) && (OTHERS.test(after) || NEAR_BEFORE.test(before))) continue;
    if (HABITAT.test(before)) continue;
    if (NOT_BEFORE.test(before)) continue;
    // (The words after it, up to where it grows wild: "an evergreen conifer native to … southern Chile" isn't a place
    // its leaves depend on. Dying back's condition can come later in the sentence than a word's.)
    const wordsBefore = before.split(/\s+/).filter(Boolean), wordsAfter = after.split(HABITAT)[0].split(/\s+/).filter(Boolean);
    const near = `${wordsBefore.slice(-10).join(' ')} ${m[0]} ${wordsAfter.slice(0, /^(?:semi|evergreen|deciduous)/.test(word) ? 9 : 12).join(' ')}`;
    const stretch = wordsBefore.slice(-5).join(' ').split(/[,;:]/).pop();
    // (Or where the sentence opens: "In warmer climates, such as …, it is grown as a perennial evergreen.")
    const depends = PLACE.test(near) || PLACE.test(wordsBefore.slice(0, 4).join(' ')) || ZONES.test(wordsAfter.slice(0, 9).join(' ')) || MAYBE.test(stretch);
    // (A leaf drop for a dry spell is not winter's: "evergreen, but during a drought it may become deciduous".)
    const dry = DRY.test(near);
    if (/^semi/.test(word)) { out.push('S'); continue; }
    if (word === 'evergreen') { if (!(depends && dry)) out.push(depends ? 'E?' : 'E'); continue; }
    if (word === 'deciduous') { if (!(depends && dry)) out.push(depends ? 'D?' : 'D'); continue; }
    if (!WINTER.test(s) || NOT_WINTER.test(s)) continue;
    out.push(depends ? 'B?' : 'B');
  }
  return out;
}

/**
 * What a page's sentences say of its leaves in winter: 'evergreen', 'semi-evergreen' (depends on the winter) or
 * 'deciduous' (for an herb, it dies back; a grass goes dormant), from the words `foliageWords` finds in all of them:
 * - semi-evergreen where they say so, or that its leaves depend on the winter ("evergreen in warmer climates",
 *   "deciduous in colder ones"), or call it evergreen and also deciduous or dying back in winter;
 * - deciduous where they call it deciduous or say it dies back in winter (also "may die back in a hard freeze", of a
 *   deciduous shrub: its stems, not its leaves, depend on the winter);
 * - evergreen where they call it only that;
 * - nothing where all they say is that it may die back in a cold winter (of a woody plant, that's its stems).
 */
export function foliageOf(words) {
  const w = new Set(words);
  if (w.has('S') || w.has('E?') || w.has('D?')) return 'semi-evergreen';
  if (w.has('E') && (w.has('D') || w.has('B') || w.has('B?'))) return 'semi-evergreen';
  if (w.has('D') || w.has('B')) return 'deciduous';
  if (w.has('E')) return 'evergreen';
  return null;
}

/**
 * What a page's sentences say of its leaves in winter, with the sentences that say it: { v, says } (`says`: the
 * sentence, or up to three joined by " … "), or null where none say.
 */
export function foliageFromProse(list, names = []) {
  const said = (list ?? []).map((s) => ({ s, w: foliageWords(s, names) })).filter((x) => x.w.length);
  const v = foliageOf(said.flatMap((x) => x.w));
  if (!v) return null;
  // (The sentences behind it: for evergreen or deciduous, those that say so; for semi-evergreen, every one that speaks.)
  const backs = (x) => (v === 'evergreen' ? x.w.includes('E') : v === 'deciduous' ? x.w.some((k) => k === 'D' || k === 'B') : true);
  return { v, says: said.filter(backs).slice(0, 3).map((x) => x.s).join(' … ') };
}

// ---------- Zones, where the page's field takes in its annual zones ----------

const RANGE = String.raw`(?:USDA\s+)?(?:plant\s+hardiness\s+)?zones?\s+(\d{1,2})[ab]?\s*(?:-|–|to|through)\s*(\d{1,2})[ab]?`;
const HARDY = new RegExp(String.raw`\bhardy\s+(?:to|in)\s+` + RANGE, 'i');
const ANNUAL = new RegExp(String.raw`\bgrown\s+as\s+an\s+annual\s+in\s+` + RANGE, 'i');
/**
 * Where a sentence says both the zones it's winter hardy in and the zones it's only grown as an annual in ("It is
 * winter hardy to USDA Zones 9-10 but is grown as an annual in Zones 3-8"): { hardy: { zone_min, zone_max }, annual:
 * { zone_min, zone_max } } on the half-zone scale, with the sentence (`says`); null where none does.
 */
export function annualZonesSaid(list) {
  for (const s of list ?? []) {
    const h = HARDY.exec(s), a = ANNUAL.exec(s);
    if (!h || !a) continue;
    const hardy = zoneSpan(h[1], h[2]), annual = zoneSpan(a[1], a[2]);
    if (hardy && annual && annual.zone_max < hardy.zone_min) return { hardy, annual, says: s };
  }
  return null;
}
/**
 * NC State's zone claims (`claims`, its fields'), unless its own description says the coldest of them are zones it's
 * only grown as an annual in: then the zones the description says it's hardy in (the Señorita cleomes: its field
 * lists 3a to 11b, its text "winter hardy to USDA Zones 9-10 but … grown as an annual in Zones 3-8"). A plant grown as
 * an annual somewhere isn't hardy there, so the field's colder zones aren't its own.
 */
export function ncsuZones(claims, html) {
  const said = annualZonesSaid(ncsuDescription(html));
  const min = claims.find((c) => c.fact === 'zone_min');
  if (!said || !min || min.v > said.annual.zone_max) return claims;
  const zone = (fact) => ({ fact, v: said.hardy[fact], src: 'ncsu', kind: 'authority', says: said.says, prose: true });
  return [...claims.filter((c) => c.fact !== 'zone_min' && c.fact !== 'zone_max'), zone('zone_min'), zone('zone_max')];
}

/** Claims read from NC State's description (an authority, like its fields). */
export function ncsuProseClaims(html) {
  const leaves = foliageFromProse(ncsuDescription(html), ncsuNames(html));
  return leaves ? [{ fact: 'foliage', v: leaves.v, src: 'ncsu', kind: 'authority', says: leaves.says, prose: true }] : [];
}
