// Facts read from a source's own sentences (decided with Jason, 2026-10-26: "read everything"; docs/catalog-sources.md,
// "Reading descriptions"). A page's fields come first: a fact is read from its prose only where its fields say nothing
// (sample.mjs).
// Each claim keeps the sentence it was read from (`says`), in the build's own files and the review, so it can be checked
// against the page; the catalog says only that it was read from the description (`from`), since descriptions aren't
// copied (docs/catalog-sources.md).
//
// Read by rule, never by guess: a sentence speaks to a fact only in the words the rules below know, and about the plant
// itself (not "the deciduous forests" it grows in, the evergreens it's planted under, or a plant it's compared to). A
// sentence these rules can't settle says nothing. So far: whether its leaves stay through winter (`foliage`); deer
// (`deer`), self-sowing (`self_seed`) and spreading underground or by runners (`habit`); and the zones a plant is hardy
// in where the page's own zone field takes in the zones its text says it's only an annual in.
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
const OTHERS = /^(?:[\s,-]+[\w'-]+){0,4}?[\s,-]+(?:forests?|woods|woodlands?|trees|shrubs|hardwoods|thickets|canop(?:y|ies)|overstor(?:y|ies)|plants|stands|swamps|habitats?|communit(?:y|ies)|groves|understor(?:y|ies)|hammocks|bottomlands?|leaf litter|neighbors|companions|counterparts|relatives|cousins|evergreens|conifers|hedges|varieties|cultivars|types|kinds|members|genus|genera|ornamentals|shade|boughs|branches|hedges?|screen)\b/i;
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
const DRY = /\b(?:summer|heat|hot|drought|dry spells?|dry season)\b/i;
/** (A houseplant's rest, which keeps its leaves: "dormant during the winter, and watering should be reduced".) */
const NOT_WINTER = /\b(?:summer|heat|drought|dry spells?|water(?:ing|ed)?|moisture|houseplants?|indoors|repot\w*|fertiliz\w*|after (?:flowering|blooming|bloom|seed\w*|fruiting)|once (?:flowering|blooming) (?:is|has)|seedset|transplant\w*|cuttings|tubers? should|reduce watering|late spring|from spring|after spring|until (?:fall|autumn)|leaves (?:again )?(?:appear|emerge|return|reappear)\w*|hot (?:weather|conditions|summers?)|re-?emerges? in (?:the )?(?:fall|autumn))\b/i;
const WORD = /\b(semi(?:\s+to\s+|-\s?|\s)?evergreens?|semi-?\s?deciduous|evergreen|deciduous|(?:dies?|died|dying|die)\s+(?:back|down|to the ground)|(?:go|goes|going|went|gone|becomes?|is|are|remains?|stays?|lies?|lie)\s+dormant|winter[- ]dormant|dormant (?:in|during|through) (?:the )?winter)\b/gi;

/** Words that start a sentence about the plant itself, or a part of it: "It is", "The foliage is", "This shrub has". */
const GENERIC = /^(?:it|its|this|these|they|the|a|an|plants?|leaves|foliage|fronds|stems?|flowers?|blooms?|species|genus|shrub|tree|vine|fern|grass|perennial|cultivar|variety|selection|hybrid|evergreen|deciduous|semi-evergreen|in|during|although|even|though|while|once|after|when|where|if|unlike|like|both|either|neither|its)$/i;
/** A question says nothing: "Does it spread aggressively?" (an FAQ's answer is its own sentence). */
const QUESTION = /\?\s*["”)]?\s*$/;
const words = (x) => String(x).toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9.×-]+/).filter(Boolean);
/**
 * Whether a sentence is about another plant, named as its subject: "The Cutleaf Grape Fern is evergreen" on the
 * rattlesnake fern's page. Its subject: the words before its first "is", "are" or "has", where they start with a capital
 * and aren't a word for the plant itself ("It", "The foliage"). It's about another plant where those words aren't one
 * of the page's names (its botanical name or common names), nor part of one.
 */
export function aboutAnother(sentence, names) {
  if (!names?.length) return false;
  // (A trade name or a parenthesis between its words: "Rosa 'Livin' Easy' (Livin' Easy® Tree Rose) is …".)
  const plain = String(sentence).replace(/\s*\([^)]*\)/g, '').replace(/[®™]/g, '');
  const m = /^(?:The |This |These |A |An )?([A-Z][\w'’.×-]*(?:\s+['‘’"“]?[A-Za-z×][\w'’.-]*['’"”]?){0,4}?)\s+(?:is|are|was|were|has|have)\b/.exec(plain);
  if (!m) return false;
  const subject = words(m[1]);
  if (!subject.length || GENERIC.test(subject[0])) return false;
  // (A gardener's doing, not a plant: "Controlling its spread has …", "Pruning the shrub is …". Not "Flowering dogwood".)
  if (/ing$/.test(subject[0]) && /^(?:its|the|a|an|this|these|them|it|spent|dead|old)$/.test(subject[1] ?? '')) return false;
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
  if (ELSEWHERE.test(s) || NAMING.test(s) || aboutAnother(s, names) || QUESTION.test(s)) return [];
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

// ---------- Deer, self-sowing and spreading (2026-10-27) ----------
//
// A sentence is read a clause at a time ("Deer tend to avoid it but may eat the flowers": the flowers aren't the
// plant), and only where it's about the plant itself (not one it's compared to, planted with, or a cultivar it names).

/** A sentence's clauses: split at semicolons and at "but", "although", "whereas" and the like. */
/** About its name: "the genus name comes from …", not "…, hence the common name" trailing a sentence about the plant. */
const aboutName = (s) => NAMING.test(String(s).replace(/[,;]?\s*(?:hence|thus|giving it|which (?:is|explains)) (?:its|the) (?:common )?name\b.*$/i, ''));
const clauses = (s) => String(s).split(/;|\s+[—–]\s+|\s*—\s*|\s+\(?(?:but|while|although|though|however|whereas|yet|except)\s+|\.\s/i);
/** Another plant, or a comparison, in the clause: "unlike", "an alternative to hostas", "less … than other clematis". */
const OTHER_PLANT = /\b(?:unlike|similar to|compared|resembles?|confused with|mistaken for|combine (?:it )?with|pair (?:it )?with|plant (?:it )?(?:with|near|among|under|beneath)|companions?|underplant|in contrast|whereas|differs? from|alternative to|instead of|substitute|than the species|than its parent|than (?:other|most|many)\b)/i;

// Deer: Resistant (deer pass it by), Occasional (deer eat it now and then, or it's resistant only in part) or Candy
// (deer favor it, or damage it often). Said plainly ("Deer browse the foliage", "Deer will browse roses"), it's
// Occasional: they eat it, how often unsaid. NC State's field lists deer only where it resists them, so the sentences
// are where it says deer eat a plant (checked 2026-10-27: of the plants its field lists, nine in ten of the sentences
// read Resistant, and most of the rest "mildly" or "moderately" resistant).
const NOT_DEER = /\bdeer[- ](?:tongue|fern|grass|berry|berries|vetch|brush|weed|mice|mouse|ticks?|tick-borne|hunt\w*|season|flies|fly|pea|foot|horn|oak)\b|\(male deer\)|\bgame\b/i;
const EATEN_PART = /\b(?:fruits?|acorns?|nuts?|berries|seeds?|pods?|mast|drupes?|cones?|samaras?|nectar|flowers?|bulbs?)\b/i;
const PLANT_PART = /\b(?:foliage|leaves|twigs|stems|shoots|buds|plants?|bark|shrubs?|trees?|vines?|it|seedlings|saplings|branches|growth)\b/i;
const OFTEN = String.raw`(?:frequently|often|heavily|severely|commonly|readily|regularly|very|highly|extremely|especially|particularly|quite|notoriously)`;
const PARTLY = String.raw`(?:mildly|somewhat|moderately|fairly|partially|partly|relatively|slightly|reasonably|marginally|semi-?)`;
const HURT = String.raw`(?:damaged|browsed|eaten|grazed|bothered|attacked|nibbled|chewed|devoured|consumed|targeted|troubled|munched)`;
/** Other animals named with deer: "deer and rabbits", "rabbits, deer, and goats". */
const ANIMALS = String.raw`(?:(?:,\s*|\s+and\s+|\s+or\s+|,\s+and\s+|,\s+or\s+)(?:white-tailed\s+|cottontail\s+|box\s+)?(?!is\b|are\b|be\b|it\b|was\b|has\b)[\w-]+){0,4}?`;
const ITEMS = String.raw`(?:[\w,'()-]+\s+)`;
/** Deer rules, in order, each [name, value, rule]: the first that a clause meets says (null: it can't settle it). */
const DEER = [
  // Said not to: "not favored by deer", "often not bothered", "deer browsing is almost nonexistent".
  ['not-eaten', 'Resistant', new RegExp(String.raw`\b(?:not|never|rarely|seldom)\s+(?:\w+\s+){0,2}(?:${HURT}|attractive|palatable|appealing|favou?red|preferred|bothered|touched|browsed|troubled)\b[^.;]{0,25}\bdeer|\bdeer (?:browsing|damage|feeding) (?:is|has been) (?:\w+\s+)?(?:nonexistent|rare|minimal|uncommon|unusual|negligible|slight|light)\b`, 'i')],
  // A comparison ("less damaged by deer than other clematis") or a doubt ("conflicting data"): nothing settled.
  ['compared', null, /\b(?:less|fewer|more)\s+(?:\w+\s+){0,2}(?:damaged|browsed|eaten|bothered|resistant|susceptible|favou?red|palatable|frequently|often|attractive)\b[^.;]*\bdeer|\bdeer\b[^.;]*\b(?:less|more) (?:than|so than|often than)\b|\bthan (?:other|most|many)\b[^.;]*\bdeer|\bdeer\b[^.;]*\bthan (?:other|most|many)\b|\bconflicting\b/i],
  ['often', 'Candy', new RegExp(String.raw`\b${OFTEN}\s+(?:\w+\s+){0,2}(?:${HURT}|susceptible|vulnerable|prone|favored|preferred|attractive|palatable|appealing|(?:sustains?|suffers?|receives?)\s+(?:\w+\s+)?damage)\b[^.;]{0,40}\bdeer`, 'i')],
  ['deer-favor', 'Candy', new RegExp(String.raw`\bdeer\b${ANIMALS}\s+(?:will\s+|can\s+|may\s+|also\s+|do\s+)?(?:${OFTEN}\s+(?:\w+\s+)?(?:browse|eat|damage|feed|graze|devour|target)|love|loves|likes?\s+(?:it|this|the|these|them|to eat|to browse)|favou?r|relish|prefer|enjoy|devour|seek out|are fond of|are attracted\b|are drawn to|find (?:it|them|this plant|the \w+) (?:tasty|delicious|irresistible|palatable))`, 'i')],
  ['little-resistance', 'Candy', /\b(?:little|no|poor|low)\s+resistance\b[^.;]{0,30}\bdeer/i],
  ['serious', 'Candy', /\bdeer\b[^.;]{0,30}\b(?:serious|major|significant|severe|big) (?:problem|issue|pest|threat)\b|\b(?:serious|major|significant|severe|heavy)\s+(?:damage|problems?|browsing)\b[^.;]{0,20}\bdeer\b/i],
  ['popular', 'Candy', /\bpopular with (?:\w+\s+){0,2}deer\b|\bdeer\b[^.;]{0,25}\bpopular\b/i],
  ['favorite', 'Candy', /\b(?:favou?rite|preferred|choice|candy|delicacy|magnet|ice cream)\b[^.;,]{0,40}\bdeer\b(?!\s*[- ](?:resist|toleran|proof))|\bdeer(?:'s|s')?\s+(?:candy|favou?rite|magnet|delicacy)\b|\bfavou?red by (?:\w+\s+){0,2}deer\b/i],
  ['partly', 'Occasional', new RegExp(String.raw`\b${PARTLY}\s*(?:deer[- ](?:and[- ][\w-]+[- ])?)?(?:resist\w*|tolerant|immun\w*)\b[^.;]{0,40}\bdeer|\b${PARTLY}\s*deer[- ](?:and[- ][\w-]+[- ])?(?:resist\w*|tolerant)\b|\bsome (?:tolerance|resistance)\b[^.;]{0,30}\bdeer`, 'i')],
  ['not-resistant', 'Occasional', /\bnot\s+(?:\w+\s+){0,2}deer[- ]?(?:resist\w*)|\bnot\s+(?:\w+\s+){0,1}resistant to (?:\w+\s+){0,3}deer|\bno deer resistance|\blimited\s+resistance\b[^.;]{0,30}\bdeer|(?:^|\()\s*not (?:by |to |from )?deer\b/i],
  ['may', 'Occasional', new RegExp(String.raw`\b(?:occasionally|sometimes|can be|may be|might be|could be|can become|is not immune)\s+(?:\w+\s+){0,2}${HURT}\b[^.;]{0,30}\bdeer|\bdeer\b${ANIMALS}\s+(?:occasionally|sometimes|may|might|can|could)\s+(?:\w+\s+){0,2}(?:browse|eat|damage|nibble|feed|graze|cause damage)\b|\b(?:can|may|could|might)\s+(?:\w+\s+)?suffer\b[^.;]{0,40}\bdeer|\bdeer (?:damage |browsing )?(?:can be|is often|may be) (?:a problem|troublesome|a nuisance|an issue|a concern)\b`, 'i')],
  ['young', 'Occasional', /\bdeer[- ]?resist\w*[^.;]{0,30}\b(?:when mature|except when young|but young|young plants)/i],
  // Resistant: "deer resistant", "drought, deer, and wet soil tolerant", "tolerates browsing by deer" (NC State's own
  // field counts that as resisting deer), "resistant to salt, drought, and damage by deer", "seldom damaged by deer".
  ['listed', 'Resistant', new RegExp(String.raw`\bdeer\b(?:,?\s+(?:and\s+|&\s+)?(?!is\b|are\b|be\b|it\b|was\b|has\b)[\w-]+(?:\s(?!is\b|are\b)[\w-]+)?){1,7}?,?\s+(?:tolerant|resistant)\b|\b(?:tolerat\w*|withstands?|handles?|stands? up to)\s+${ITEMS}{0,18}?(?:(?:browsing|grazing|damage|visits)\s+(?:by|from)\s+|(?:nighttime|occasional)\s+visits from\s+)?deer\b|\b(?:tolerat\w*|withstands?)\s+${ITEMS}{0,10}?deer (?:browsing|damage|grazing)\b`, 'i')],
  ['resistant', 'Resistant', /\bdeer-[^.;]{0,60}?-\s?(?:tolerant|resistant)\b|\bdeer(?:[- ]+(?:and|&)[- ]+[\w]+)?[- ]+(?:resistant|resistance|tolerant|proof)\b|\bdeer-?\s+and\s+[\w-]+-(?:resistant|tolerant)\b/i],
  ['resists', 'Resistant', /\b(?:resist(?:ant|s|ance)?|tolerant|immune|immunity)\s+(?:to\s+|from\s+)?(?:[\w,()-]+\s+){0,10}?(?:(?:damage|browsing|feeding|grazing)\s+(?:by|from)\s+)?deer\b|\bresists?\s+(?:[\w,-]+\s+){0,4}deer\b/i],
  ['avoided', 'Resistant', new RegExp(String.raw`\b(?:seldom|rarely|not often|infrequently|not usually|not generally|not typically|usually not|generally not|never)\s+(?:\w+\s+){0,2}(?:${HURT}|favored|preferred|touched|bothered|browse\w*|eat\w*)\b[^.;]{0,25}\bdeer|\bdeer\b${ANIMALS}\s+(?:will\s+|usually\s+|generally\s+|typically\s+|tends? to\s+|mostly\s+)?(?:avoid|ignore|dislike|shun|pass (?:it|them) by|leave (?:it|them|this plant) alone|(?:won't|don't|do not|will not|rarely|seldom|usually don't)\s+(?:\w+\s+)?(?:eat|browse|bother|touch|damage))`, 'i')],
  ['distasteful', 'Resistant', /\b(?:discourage|deter|repel)s?\b[^.;]{0,50}\bdeer|\bkeeps?\b[^.;]{0,40}\bdeer\b[^.;]{0,20}\baway\b|\b(?:do not|don't|doesn't|does not)\s+find\b[^.;]{0,30}\b(?:appetizing|palatable|appealing|tasty)\b|\b(?:ignored|avoided|shunned|unbothered|untouched|passed over|left alone)\s+by\s+(?:\w+\s+){0,3}deer\b|\bdeer\b[^.;]{0,15}\b(?:are|is)\s+not\s+(?:\w+\s+)?(?:attracted|interested|fond|a problem|bothersome|an issue|a concern|a pest)\b|\b(?:unpalatable|distasteful|unappealing|unattractive|unappetizing|not palatable|not appealing)\b[^.;]{0,30}\bdeer|\bdeer\b[^.;]{0,40}\b(?:unpalatable|distasteful|unappealing|unattractive|unappetizing)\b/i],
  // Said plainly: deer eat it.
  ['eaten', 'Occasional', new RegExp(String.raw`\bdeer\b${ANIMALS}\s+(?:will\s+|can\s+|do\s+|also\s+|often\s+|are known to\s+|have been known to\s+)?(?:browse|browses|eat|eats|damage|damages|feed on|feast on|graze|nibble|consume|cause damage)\b|\b(?:${HURT}|susceptible|vulnerable|prone|palatable)\b[^.;]{0,15}\b(?:by|to|from)\s+(?:\w+\s+){0,3}deer\b|\b(?:susceptible|vulnerable|prone)\s+to\s+${ITEMS}{0,12}?deer\b|\b(?:browsed?|browsing|chewing|grazing)\b[^.;]{0,20}\bdeer\b|\bdeer (?:damage|browsing|browse)\b|\bbrowse for (?:\w+\s+){0,2}deer|\b(?:protected|protection)\s+from\s+(?:\w+\s+){0,2}deer\b|\b(?:suffers?|sustains?)\s+(?:\w+\s+)?damage\s+from\s+deer\b`, 'i')],
];
/**
 * What one sentence says of deer: 'Resistant', 'Occasional' or 'Candy', or null where it says nothing it can settle
 * (deer eating its fruit or acorns, the deer fern, another plant). `rule`: the rule that read it.
 */
export function deerSaid(sentence, names = []) {
  const s = String(sentence ?? '');
  if (!/\bdeer\b/i.test(s) || NOT_DEER.test(s) || aboutName(s) || aboutAnother(s, names) || QUESTION.test(s)) return null;
  for (const raw of clauses(s)) {
    const part = raw.replace(/^\s*unlike\b[^,]*,(?!\s*(?:which|that|who)\b)\s*/i, '');
    if (!/\bdeer\b/i.test(part)) continue;
    if (OTHER_PLANT.test(part)) return null;
    for (const [rule, v, re] of DEER) {
      if (!re.test(part)) continue;
      // (Its fruit, flowers or bulbs eaten, not the plant: "deer eat the acorns", "the berries are consumed by birds and
      // deer".)
      const before = part.slice(0, part.search(/\bdeer\b/i));
      if (v !== 'Resistant' && ((EATEN_PART.test(s) && !PLANT_PART.test(part)) || (EATEN_PART.test(before) && !/\b(?:foliage|leaves|twigs|stems|shoots|buds|bark|branches|seedlings|saplings)\b/i.test(before)))) return null;
      return v ? { v, rule } : null;
    }
  }
  return null;
}
export const DEER_ORDER = ['Candy', 'Occasional', 'Resistant'];
/**
 * What a page's sentences say of deer, { v, says }, or null: the least resistance any of them gives (no promise the
 * deer pass it by: "deer resistant" and "may be damaged by deer" is Occasional).
 */
export function deerFromProse(list, names = []) {
  const said = (list ?? []).map((s) => ({ s, d: deerSaid(s, names) })).filter((x) => x.d);
  if (!said.length) return null;
  const v = DEER_ORDER.find((k) => said.some((x) => x.d.v === k));
  return { v, says: said.filter((x) => x.d.v === v).slice(0, 3).map((x) => x.s).join(' … ') };
}

// Self-sowing: Prolific (self-sows freely: "readily reseeds", "self-seeds and can become weedy", "deadhead to prevent
// aggressive reseeding"), Modest (a little: "self-seeds, but is not aggressive", "does not freely self-seed"), Unrated
// (it does, how freely unsaid: "may self-seed", "will self-seed in ideal conditions"; Jason, 2026-10-27), Sterile (said of the plant itself: "'Karl Foerster' is sterile",
// "a sterile hybrid", "does not produce seed"; never its fronds or florets, nor cultivars it names). "Does not
// self-seed" says nothing: a plant can set seed that doesn't come up.
const SOW = String.raw`(?:self[- ]?(?:seed|sow)(?:s|ed|ing|er|ers|n)?|re-?seed(?:s|ed|ing|er|ers)?(?:\s+(?:itself|themselves))?|(?<!\b(?:the|its|this|each|a|that)\s)seeds? (?:itself|themselves)(?: about| around)?|sows? (?:itself|themselves)(?: about| around)?)`;
const BY_SEED = String.raw`\bspreads?\s+(?:\w+\s+)?(?:by|via|through|from)\s+(?:its\s+|both\s+)?seeds?\b`;
const FREELY = String.raw`(?:freely|readily|easily|prolifically|aggressively|abundantly|profusely|heavily|vigorously|generously|prolific|copiously|liberally|rampantly|quickly|rapidly|widely|everywhere|with abandon|all over)`;
const A_LOT = /\b(?:weedy|weed|invasive|aggressive|aggressively|aggressiveness|nuisance|take over|takes over|taking over|under control|to control|keep it in check|keep in check|problem|pest|everywhere|excessive|too much|numerous seedlings|many seedlings|lots of seedlings|hundreds|thousands|prolific|out of control|(?:difficult|hard) to (?:manage|control|eradicate|remove|get rid of)|eradicate|invasion|an issue|spreads? quickly|spreads? rapidly|remov\w* (?:of )?(?:the )?seedlings|seedlings on a regular basis)\b/i;
const NOT_A_LOT = /\b(?:not|non-?|never|nor|isn't|aren't|without being|less|rarely|seldom|unlikely to)\s*(?:\w+\s+){0,3}?(?:prolific|aggressive|aggressively|invasive|invasively|weedy|a problem|a pest|a nuisance|spread aggressively)\b/i;
const SAID_NOT = /\b(?:not|never|rarely|seldom|no|isn't|aren't|doesn't|don't|won't|without|unlikely to|not likely to)\s+(?:\w+\s+){0,3}$/i;
/** Reseeding as a gardener's job (a lawn's bare spots), not the plant sowing itself. */
const RESOWN = /\b(?:must|should|needs? to|you can|you may|you will|be)\s+(?:\w+\s+)?re-?seed|\bre-?seed(?:ing|ed)?\s+(?:must|should|is (?:needed|required|necessary)|bare|thin|the lawn|lawns|areas|spots|annually|every)|\boverseed/i;
const SEED = [
  ['sterile', 'Sterile', /\b(?:as a|being a) sterile (?:plant|hybrid|cultivar|selection|clone)\b|\bits seeds are sterile\b|(?:^|[,:]\s*|\b(?:since|because|as|and)\s+)(?:it|this(?: \w+){0,2}|these(?: \w+)?|they|the (?:plant|tree|shrub|cultivar|hybrid|variety|selection|grass|form|clone)s?|'[^']+'|[A-Z][\w-]+(?: [A-Z]?[\w-]+){0,3})\s+(?:is|are)\s+(?:\w+\s+){0,2}?(?:a\s+)?sterile\b(?!\s+(?:fronds?|leaves|leaf|florets?|flowers?|ray|stems?|shoots?|spikelets?|blades?|branches|pinnae|segments|cultivars|selections|varieties|forms))|\b(?:does not|doesn't|do not|don't|will not|won't|never)\s+(?:\w+\s+)?(?:set|produce|form|make|develop)\s+(?:\w+\s+)?(?:viable\s+)?seeds?\b|\b(?:it|this(?: \w+){0,2}|they)\s+(?:produces?|sets?|forms?)\s+no (?:viable )?seeds?\b/],
  ['seedlings', 'Prolific', new RegExp(String.raw`\bseedlings\s+(?:\w+\s+)?(?:sprout|come up|appear|pop up|emerge)\s+${FREELY}`, 'i')],
  // Nearly sterile ("highly infertile", "reduced seed formation"): it may not self-sow at all, so nothing's said.
  ['near-sterile', null, /\b(?:is|are|being)\s+(?:\w+\s+)?(?:highly |largely |mostly )?infertile\b(?!\s+(?:soils?|sites?|ground|loam|stamens?|shoots?|flowers?|fronds?))|\bnear(?:ly)?[- ]sterile\b|\bmostly sterile\b|\bpartially sterile\b|\breduced (?:seed|fertility)/i],
  ['freely', 'Prolific', new RegExp(String.raw`\b${SOW}\s+(?:\w+\s+)?${FREELY}\b|\b${FREELY}\s+(?:\w+\s+){0,2}${SOW}\b|\b(?:prolific|vigorous|aggressive|heavy|enthusiastic|prodigious)\s+(?:\w+\s+)?(?:self-?\s?)?(?:seeder|sower|reseeder)\b`, 'i')],
  ['a-lot', 'Prolific', new RegExp(String.raw`\b${SOW}\b|${BY_SEED}`, 'i'), true],
  ['sows', 'Unrated', new RegExp(String.raw`\b${SOW}\b|${BY_SEED}|\bvolunteer (?:seedlings|plants)\b|\b(?:under|beneath|around)\b[^.;]{0,30}\bseedlings (?:may |will |often |can )?(?:appear|come up|pop up|emerge|sprout)\b`, 'i')],
];
const STERILE_PART = /\b(?:fronds?|leaves|leaf|flowers?|florets?|stems?|spikelets?|cones?|fruits?|parts?|anthers?|pollen|stamens?|sepals?|bracts?)\s+(?:are|is)\s+(?:\w+\s+){0,2}sterile\b/i;
const STERILE_OF_OTHERS = /\b(?:consider|cultivars|varieties|selections|such as|instead)\b/i;
/** What one sentence says of the plant sowing itself: 'Prolific', 'Modest', 'Unrated' or 'Sterile', or null. */
export function seedSaid(sentence, names = []) {
  const s = String(sentence ?? '');
  if (aboutName(s) || aboutAnother(s, names) || QUESTION.test(s)) return null;
  for (const part of clauses(s)) {
    if (OTHER_PLANT.test(part)) continue;
    for (const [rule, v, re, aLot] of SEED) {
      const m = re.exec(part);
      if (!m) continue;
      if (v === null) return null;
      if (aLot && (!A_LOT.test(s) || NOT_A_LOT.test(s))) continue;
      // (Sterile cultivars it names, "consider 'Merlot Majik', as they are sterile", or parts of it, "the shield fronds
      // are sterile": not the plant.)
      if (v === 'Sterile' && STERILE_OF_OTHERS.test(s) && !/^(?:this|the) (?:cultivar|variety|selection)\b/i.test(part.trim())) return null;
      if (v === 'Sterile' && STERILE_PART.test(part)) return null;
      if (v === 'Sterile' && /\bsterile or near(?:ly)?[- ]sterile\b/i.test(part)) return null;
      // ("Usually does not produce fertile seed": not quite none, nor said to self-sow. "Considered sterile, but
      // cross-pollination can lead to viable seed": a little.)
      if (v === 'Sterile' && /\b(?:usually|generally|mostly|often|typically|largely|rarely|seldom)\s+(?:does not|doesn't|do not|don't|will not|won't)\b/i.test(part)) return null;
      if (v === 'Sterile' && /\b(?:can|may|could)\s+(?:\w+\s+){0,3}(?:lead to|produce|set|result in)\s+(?:\w+\s+)?viable seeds?|\btruly sterile\b/i.test(s)) return { v: 'Modest', rule: 'near-sterile' };
      if (v !== 'Sterile' && RESOWN.test(part)) return null;
      // "Does not freely self-seed": a little; "does not self-seed": nothing said.
      if (v !== 'Sterile' && SAID_NOT.test(part.slice(0, m.index))) return new RegExp(String.raw`^${FREELY}`, 'i').test(m[0]) ? { v: 'Modest', rule } : null;
      // ("Occasionally reseeds", "may self-seed lightly": a little.)
      // (Near the words that say it: "it sometimes grows in stands and spreads by self-seeding" says nothing of how much.)
      const near = `${part.slice(0, m.index).split(/\s+/).slice(-5).join(' ')} ${m[0]} ${part.slice(m.index + m[0].length).split(/\s+/).slice(0, 4).join(' ')}`;
      if (v === 'Unrated' && /\b(?:occasionally|sometimes|lightly|sparingly|sparsely|gently|modestly|a little|a few)\b/i.test(near)) return { v: 'Modest', rule };
      // ("Somewhat rapidly": hedged, a little.)
      if (v === 'Prolific' && /\b(?:somewhat|fairly|moderately|slightly|a bit)\s+(?:rapidly|quickly|freely|readily|easily|aggressively)\b/i.test(part)) return { v: 'Modest', rule };
      // "Self-seeds, but is not aggressive": a little. Said plainly ("it will self-seed"), how freely isn't said: Unrated.
      if (rule === 'sows' && NOT_A_LOT.test(s)) return { v: 'Modest', rule };
      return { v, rule };
    }
  }
  return null;
}
/**
 * What a page's sentences say of it sowing itself, { v, says }, or null: Prolific where any says freely, else Modest
 * where one says a little, else Unrated;
 * Sterile only where none says it self-sows (a sterile cultivar's page that says its species self-seeds can't settle).
 */
export function seedFromProse(list, names = []) {
  const said = (list ?? []).map((s) => ({ s, d: seedSaid(s, names) })).filter((x) => x.d);
  if (!said.length) return null;
  const has = (k) => said.some((x) => x.d.v === k);
  // (A triploid or seedless plant whose page also says it self-sows: that's its species, read on the cultivar's page.)
  if (!has('Sterile') && (list ?? []).some((s) => /\b(?:triploid|seedless)\b/i.test(s))) return null;
  if (has('Sterile') && (has('Prolific') || has('Unrated') || said.some((x) => x.d.v === 'Modest' && x.d.rule !== 'near-sterile'))) return null;
  // (Freely over a little; a little, said, over how much unsaid.)
  const v = ['Sterile', 'Prolific', 'Modest', 'Unrated'].find(has);
  return { v, says: said.filter((x) => x.d.v === v).slice(0, 3).map((x) => x.s).join(' … ') };
}

// Spreading underground or by runners, as a habit src/spread.ts knows: by rhizomes ("spreads by rhizomes", "creeping
// rhizomes", "underground runners"; "rhizomatous" only beside words that say it spreads: alone, it's a kind of root, a
// hellebore's or a begonia's as much as a mint's), stolons or runners, suckers (forming thickets, where its suckers do;
// not "found in thickets", where it grows wild), or mats; aggressively ("spreads aggressively by rhizomes", "suckers
// … can become a weed problem") or slowly where said. Clumping where it's said to form clumps and nothing of running
// ("a clump-forming perennial", "a bunchgrass"); not where the same clause says it spreads.
const HABIT_NOT = /\b(?:not|never|no|isn't|aren't|doesn't|don't|won't|without|nor|rather than|instead of)\s+(?:\w+ly\s+)?(?:(?:produce|form|have|make|send|grow|develop)s?\s+(?:out\s+)?)?$/i;
const AGGRESSIVE = /\b(?:aggressive(?:ly)?|invasive(?:ly)?|rapidly|quickly|vigorously|rampant(?:ly)?|prolific(?:ally)?|challeng\w* to (?:control|contain|remove)|(?:proven|proved) (?:to be )?(?:a )?challeng\w*|takes? over|taking over|(?:hard|difficult) to (?:control|contain|eradicate|remove)|weed problem|become a weed|a weed\b|out of control|weedy|aggressiveness|escape|needs? to be contained|should be contained|contain it|barriers?|thugs?|invade|outcompet\w*|crowds? out|overwhelm\w*)\b/i;
const NOT_AGGRESSIVE = /\b(?:not|non-?|never|nor|isn't|aren't|less|rarely|seldom|unlikely to|without being|without becoming|rather than)\s*(?:\w+\s+){0,3}?(?:aggressive(?:ly)?|invasive(?:ly)?|weedy|a problem|rampant|take over)\b|\b(?:a little|a bit|somewhat|slightly|mildly|moderately|fairly)\s+aggressive(?:ly)?\b|\bsemi-?aggressive\b/i;
/** Invasive somewhere else, "reported to be invasive in Florida": not how it grows in a garden here. */
const REGIONAL = /\binvasive in (?:[A-Z][a-z]+|the [A-Z][a-z]+|some (?:areas|states|regions|parts))/;
const notAggressive = (t) => NOT_AGGRESSIVE.test(t) || REGIONAL.test(t);
/** Its spread hard to keep in check, said in a sentence of its own (not "invasive" or "escapes": where it goes wild, by seed as often). */
const SPREADING_HARD = /\b(?:aggressive(?:ly)?|rampant(?:ly)?|takes? over|taking over|(?:hard|difficult) to (?:control|contain|eradicate|remove)|challeng\w* to (?:control|contain|remove)|(?:proven|proved) (?:to be )?(?:a )?challeng\w*|out of control|thugs?)\b/i;
const SLOWLY = /\b(?:slowly|gently|slow(?:ly)?[- ](?:spreading|creeping)|slow to spread|spreads? slowly|gradually|slowly expanding|a few suckers)\b/i;
const WILD = /\b(?:in the wild|found|occurs?|occurring|habitats?|along|in (?:wet|moist|dry|open)|bogs|woods|roadsides|pastures|fields|banks|clearings|riparian)\b/i;
const SPREADS = String.raw`(?:spreads?|spreading|spread|expands?|expanding|creeps?|creeping|travels?|runs?|running|colonizes?|colonizing|increases?|increasing|forms? (?:\w+\s+)?(?:colonies|colony|patches|drifts|stands|thickets)|form (?:\w+\s+)?(?:colonies|colony|patches|drifts|stands)|naturalizes?|multipl(?:y|ies)|reproduces?|propagates? (?:itself|vegetatively))`;
const BY = (what) => String.raw`\b${SPREADS}\b[^.;]{0,40}?\b(?:by|via|through|from|with|on|using|means of)\s+(?:[\w,-]+\s+){0,4}?\(?${what}\b`;
/** Spreading words, each [word, rule]: R rhizomes, W "rhizomatous", T stolons or runners, K suckers, H thickets, C clumps, M mats. */
const SPREAD_WORDS = [
  ['R', new RegExp(String.raw`${BY('(?:rhizomes?|rootstocks?|underground runners?|creeping roots)')}|\bunderground runners\b|\b(?:creeping|spreading|running|wandering|aggressive|slow-creeping)\s+(?:\w+\s+)?rhizomes?\b|\brhizomes?\s+(?:that|which)\s+(?:\w+\s+){0,2}${SPREADS}`, 'i')],
  ['W', /\brhizomatous\b(?!\s+division)/i],
  ['T', new RegExp(String.raw`${BY('(?:stolons?|(?<!underground )runners?|rooting (?:stems|runners))')}|\bstoloniferous\b|\b(?:creeping|spreading|above-ground|aboveground|surface|long)\s+(?:\w+\s+)?(?:stolons?|runners)\b|\b(?:stolons?|runners)\s+(?:that|which)\s+(?:\w+\s+){0,2}(?:root|${SPREADS})|\bsends? (?:out|up) (?:\w+\s+)?(?:stolons|runners)\b|\bproduces? (?:\w+\s+)?(?:stolons|runners)\b`, 'i')],
  ['K', new RegExp(String.raw`${BY('(?:root\\s+)?suckers?(?:ing)?')}|\bsuckers?\s+(?:\w+\s+)?(?:freely|readily|profusely|heavily|vigorously|aggressively|easily|prolifically|from the (?:roots|base)|to form|and forms?|forming)\b|\b(?:produces?|sends? up|forms?|develops?)\s+(?:\w+\s+){0,2}(?:root\s+)?suckers\b|\bsuckering\s+(?:habit|shrub|tree|plant|nature|tendenc\w+|growth)\b|\b(?:a |is )suckering\b|\bspreading by suckering\b|\bthrough suckering\b|\bby suckering\b|\bsuckering and\b|\band suckering\b|\bits suckering\b|\bsuckering (?:can|may|makes?|will)\b|\broot suckers\b`, 'i')],
  ['H', /\b(?:forms?|forming|form|creates?|creating|develops?|develop|grows? into|spreads? into|spread into|into)\s+(?:a\s+)?(?:\w+\s+){0,2}?thickets?\b|\bthicket-forming\b/i],
  ['C', /\bclump[- ]forming\b|\b(?:forms?|forming|grows? in|growing in|grows? as|develops?)\s+(?:a\s+|an\s+)?(?:\w+\s+){0,2}?(?:clumps?|tufts?)\b(?! of (?:flowers|blooms))|\bclumping\s+(?:habit|grass|perennial|form|plant|bamboo|sedge|fern|growth|nature|variety|cultivar)\b|\b(?:bunchgrass|bunch-forming|bunch grass|tufted(?!\s+(?:foliage|leaves|hairs?|flowers?|branch\w*|stems?))|caespitose|cespitose)\b|\bis\s+(?:\w+\s+)?clumping\b|\bclumping,|\ba clumper\b/i],
  ['M', /\bmat[- ]forming\b|\b(?:forms?|forming|creates?|creating|spreads? (?:to form|into))\s+(?:a\s+)?(?:\w+\s+){0,2}?mats?\b/i],
];
/** The spreading words in one sentence (`R`, `T`, `K`, `H`, `C`, `M`), with `A` (aggressively) or `L` (slowly) where said. */
export function spreadWords(sentence, names = []) {
  const s = String(sentence ?? '');
  if (aboutName(s) || aboutAnother(s, names) || QUESTION.test(s)) return [];
  const out = [];
  // (Its spread said to be hard to control, in a sentence of its own: "Controlling its spread has proven a challenge".
  // Not seed's: "spreads aggressively by seed" is self-sowing.)
  const bySeed = /\bseeds?\b|self-?sow|re-?seed/i.test(s), spreadsSaid = /\b(?:spread|spreads|spreading|expands?|colonizes?)\b/i.test(s) && !SPREAD_WORDS.some(([, re]) => re.test(s));
  if (!bySeed && !notAggressive(s) && ((spreadsSaid && SPREADING_HARD.test(s)) || /\baggressive (?:habit|nature|spreader|grower|growth)\b|\b(?:can|may|will) (?:be|become) (?:quite |very |too )?aggressive\b/i.test(s))) out.push('A');
  // (It spreads, said without how: "it can spread rapidly". Then a clump it forms isn't "doesn't run".)
  if (!bySeed && spreadsSaid && /\b(?:can|will|may|does|quickly|rapidly|readily|easily)\s+(?:\w+\s+)?spread\b|\bspreads? (?:rapidly|quickly|readily|easily|aggressively)\b/i.test(s) && !/\b(?:spreading|spread) (?:\d|to |up to|of|habit|form|canopy|crown)/i.test(s)) out.push('S');
  for (const raw of clauses(s)) {
    // ("Unlike most of its genus, it spreads from rhizomes": about this plant. Not "unlike X, which …".)
    const part = raw.replace(/^\s*unlike\b[^,]*,(?!\s*(?:which|that|who)\b)\s*/i, '');
    if (OTHER_PLANT.test(part)) continue;
    for (const [w, re] of SPREAD_WORDS) {
      const m = re.exec(part);
      if (!m) continue;
      // ("Doesn't spread aggressively by rhizomes": it spreads, not aggressively. "Does not spread by rhizomes": not.)
      if (HABIT_NOT.test(part.slice(0, m.index))) { if (w !== 'C' && AGGRESSIVE.test(m[0])) out.push(w); continue; }
      // (Divided by the gardener, "division of rhizomes dug up in the fall", isn't spreading.)
      if ((w === 'R' || w === 'W') && /\b(?:division|dividing|divide|divided|cuttings? of|planting|plant the|dug up)\b[^.;]{0,25}\brhizom/i.test(part) && !/\b(?:spreads?|creeping|colon\w*)\b[^.;]{0,30}\brhizom/i.test(part.replace(/\b(?:division|dividing|divide|divided)\b[^.;]{0,25}\brhizom\w*/gi, ''))) continue;
      // ("Rhizomatous" says it spreads only beside words that do: "a rhizomatous, spreading plant", "rhizomatous, producing
      // new plants from underground runners".)
      if (w === 'W') { if (/\b(?:spread\w*|creep\w*|colon\w*|runs|running|producing new plants|sends? (?:up )?(?:roots and )?shoots|sending roots and shoots|form colonies)\b/i.test(part)) out.push('R'); continue; }
      // (Propagated by the gardener, "propagate by seed, cuttings or root suckers", isn't spreading.)
      if (w === 'K' && /\bpropagat\w*\b[^.;]{0,40}\bsuckers\b/i.test(part) && !new RegExp(String.raw`\b${SPREADS}\b`, 'i').test(part)) continue;
      // (Short rhizomes clump, unless it's said to spread by them.)
      if ((w === 'R' || w === 'T') && /\bshort[- ](?:\w+\s+)?(?:rhizom|stolon)/i.test(part) && !/\b(?:spread|expand|colon)/i.test(part)) { out.push('C'); continue; }
      // (Where it grows wild, "forming thickets along river banks": not how it grows in a garden.)
      if (w === 'H' && WILD.test(s)) continue;
      // (Clumps that spread, or quickly, "slowly spreads to form clumps": nothing said of not running.)
      if (w === 'C' && (/\b(?:spread|spreads|spreading|creep\w*|colon\w*|runs|running|expand\w*)\b/i.test(part) || AGGRESSIVE.test(part))) { if (SLOWLY.test(part)) out.push('L'); continue; }
      // (A plant's name isn't its habit: "Tufted sedge is …". Nor clumps where it grows wild: "found growing in clumps in
      // swamps".)
      if (w === 'C' && (/^(?:Tufted|Bunch)/.test(m[0]) || /\b(?:found|occurs?|occurring|in the wild|grows wild)\s+(?:\w+\s+){0,2}$/i.test(part.slice(0, m.index)))) continue;
      out.push(w);
      if (w === 'H' && /\bsuckers?\b/i.test(part)) out.push('K');
      // (Suckers that make thickets: "thin the suckers to prevent thickets".)
      if (w === 'K' && /\bthickets?\b/i.test(part) && !WILD.test(s)) out.push('H');
      if (w !== 'C' && w !== 'M') {
        // ("Spreads by seeds and rhizomes … weedy": the weediness may be the seed's. "Aggressively" still says how.)
        if (AGGRESSIVE.test(part) && !notAggressive(part) && (!/\bseeds?\b|self-?sow|re-?seed/i.test(part) || /\baggressive(?:ly)?\b|\b(?:rapidly|quickly|vigorously)\b/i.test(part))) out.push('A');
        else if (SLOWLY.test(part)) out.push('L');
      }
    }
  }
  return out;
}
/** The habits `habitOf` gives (each in src/spread.ts's table). */
export const PROSE_HABITS = ['Suckering thicket', 'Suckering colonizer', 'Suckering (slow)', 'Suckering', 'Aggressive rhizome', 'Slow-spreading rhizome', 'Spreading rhizome', 'Aggressive runner (stolons)', 'Runner (stolons)', 'Mat-forming', 'Clumping'];
/**
 * A page's habit from its sentences' spreading words: suckers first (a suckering shrub that forms thickets), then
 * rhizomes, runners, mats; clumping only where nothing else is said. Thickets alone say nothing of how it spreads (a
 * rhododendron's thickets, a hedge planted as one), so only a suckering plant's are read. Aggressively where any sentence about
 * its spreading says so; slowly where one says that and none aggressively.
 */
export function habitOf(words) {
  const w = new Set(words);
  const fast = w.has('A'), slow = w.has('L') && !fast;
  if (w.has('K')) return fast ? (w.has('H') ? 'Suckering thicket' : 'Suckering colonizer') : w.has('H') ? 'Suckering thicket' : slow ? 'Suckering (slow)' : 'Suckering';
  if (w.has('R')) return fast ? 'Aggressive rhizome' : slow ? 'Slow-spreading rhizome' : 'Spreading rhizome';
  if (w.has('T')) return fast ? 'Aggressive runner (stolons)' : 'Runner (stolons)';
  if (w.has('M')) return 'Mat-forming';
  if (w.has('C') && !w.has('S')) return 'Clumping';
  return null;
}
/** What a page's sentences say of its spreading, { v, says } (a habit), or null. */
export function habitFromProse(list, names = []) {
  const said = (list ?? []).map((s) => ({ s, w: spreadWords(s, names) })).filter((x) => x.w.length);
  const v = habitOf(said.flatMap((x) => x.w));
  if (!v) return null;
  const clumps = v === 'Clumping';
  return { v, says: said.filter((x) => (clumps ? x.w.includes('C') : x.w.some((k) => k !== 'C'))).slice(0, 3).map((x) => x.s).join(' … ') };
}

/**
 * NC State's deer claim (its field's Resistant), unless its own description says deer eat the plant: that it resists
 * them only in part ("mildly resistant", "moderately resistant to damage from deer"), or outright ("may be damaged by
 * deer", "deer will browse roses"). Then Occasional, from the description (Jason, 2026-10-27). The field lists deer
 * for those too; the text is finer.
 */
export function ncsuDeer(claims, html) {
  const field = claims.find((c) => c.fact === 'deer');
  if (!field || field.v !== 'Resistant') return claims;
  const list = ncsuDescription(html), names = ncsuNames(html);
  const eaten = list.filter((s) => { const d = deerSaid(s, names); return d && d.v !== 'Resistant'; });
  if (!eaten.length) return claims;
  // (The field's own value kept beside it: where a second reading doesn't agree the text lowers it, the field stands.)
  return claims.map((c) => (c === field ? { ...c, v: 'Occasional', says: eaten.slice(0, 3).join(' … '), prose: true, fallback: field } : c));
}

// ---------- Fruit set ----------
//
// What it takes for the plant to fruit (Jason, 2026-10-30: "partner plants required for fruit set"), as `fruit_set`:
// `separate`, male and female plants (dioecious: a female fruits only with a male near); `partner`, it needs another
// plant, of a different cultivar or seedling, to fruit (self-incompatible); `better`, it fruits alone and better with
// a partner; `self`, it fruits alone. And a cultivar's sex, said on its own page ("a female cultivar"), as `sex`.
// Sentences about the plant's group count ("Hollies are dioecious", "Like all persimmons"); those naming another
// plant as their subject ("'Blue Prince' is the male") don't. Each sentence gives its strongest word, each page its
// most particular: fruiting alone said outright ("sets fruit without pollination", a cultivar's own) over separate
// sexes (a cultivar said to be male or female: its plant has separate sexes), over needing a partner, over doing better
// with one, over a bare "self-fertile".

/** The values: fruit set, and a cultivar's sex. */
export const FRUIT_SET = ['separate', 'partner', 'better', 'self'];
export const SEXES = ['male', 'female'];
/** Fruiting with no partner, said outright: without a pollinizer, needing none, parthenocarpic. */
const ALONE = /\bwithout (?:the need (?:for|of) )?(?:a |any )?(?:nearby )?(?:male |second |another |other )?(?:pollinat\w*|polliniz\w*|fertiliz\w*|cross[- ]?pollinat\w*|male\b|partner)|\b(?:does not|doesn't|do not|don't|will not|won't|never) (?:need|require) (?:a |any |another |an? other |second )?(?:\w+\s+)?(?:pollinat\w*|polliniz\w*|partner|male|tree|plant|cultivar|variety)\b|\bunnecessary to plant\b|\bparthenocarp\w*|\bonly one (?:tree|plant|shrub|vine) is needed\b|\bsets? (?:its )?fruit without\b/i;
/** Sexes on separate plants: dioecious; a male needed for a female's fruit; only females fruit. */
const SEPARATE = new RegExp([
  String.raw`\bdioecious\b`,
  String.raw`\bseparate (?:male and female|female and male) (?:plants|trees|shrubs|vines|individuals|specimens|forms)\b`,
  String.raw`\b(?:male and female|female and male)\b[^.;]{0,40}?\b(?:on|in|form on|borne on|are on|occur on|produced on|found on) separate (?:plants|trees|shrubs|vines|individuals)\b`,
  String.raw`\bonly one sex\b`, String.raw`\bindividual plants are either (?:male or female|female or male)\b`, String.raw`\bplants are either (?:male or female|female or male)\b`,
  String.raw`\bmale and (?:a )?female (?:plants?|trees?|shrubs?|vines?|specimens?|forms?)\b[^.;]{0,30}?\b(?:are |is |must be |be )?(?:needed|required|necessary|must|planted together)\b`,
  String.raw`\b(?:needs?|needed|requires?|required|must have|need) (?:both )?(?:a |an? )?male and (?:a )?female\b`,
  String.raw`\b(?:needs?|needed|needing|requires?|required|must have|will need) (?:a |at least one |one |the )?(?:nearby |compatible )?male\b`,
  String.raw`\b(?:a |one |at least one |the )?male (?:plant|tree|shrub|vine|pollinizer|pollinator|specimen|selection|holly|winterberry|clone)s? (?:\w+\s+){0,4}?(?:is |are |would be |will be |must be )?(?:needed|required|necessary|helpful|present)\b`,
  String.raw`\bboth (?:a )?males? and (?:a )?females?(?!\s+(?:parts|organs|flowers|reproductive|catkins|cones))\b[^.;]{0,40}?\b(?:needed|required|necessary|must|present)\b`,
  String.raw`\bboth sexes\b`, String.raw`\bwhen (?:a )?male (?:pollinizers?|pollinators?|plants?)\b[^.;]{0,20}?\b(?:present|nearby|near)\b`,
  String.raw`\bonly (?:the )?female (?:plants?|trees?|shrubs?|ones)\b[^.;]{0,30}?\b(?:bear|produce|form|develop|set|fruit)`,
  String.raw`\b(?:fruits?|berries|drupes|seeds?) (?:\w+\s+){0,4}?only (?:on|by) (?:the )?female\b`, String.raw`\bonly the female bearing\b`,
  String.raw`\bfunctionally (?:unisexual|dioecious)\b`,
  // (A male pollinizer, or one male to so many females: a plant of separate sexes.)
  String.raw`\bmale (?:pollinizers?|pollinators?|pollenizers?)\b`, String.raw`\bone male (?:\w+\s+){0,2}(?:per|for every|to every|for each)\b`,
  String.raw`\bmale (?:plants?|trees?|shrubs?) (?:\w+\s+){0,4}?(?:do not|don't|does not|will not|never) (?:produce|bear|set|form) (?:\w+\s+)?(?:fruits?|seeds?|berries|pods)\b`,
].join('|'), 'i');
/** Needing another plant to fruit: self-incompatible, not self-fertile, another genetic strain. */
const PARTNER = /\bself[- ]?(?:incompatible|sterile|unfruitful|infertile)\b|\bnot self[- ]?(?:fertile|fruitful|pollinating|pollinated)\b|\b(?:cannot|can't|unable to) self[- ]?pollinate\b|\bmore than one genetic strain\b|\bgenetically different\b/i;
/** Or another plant needed, for its pollen or its fruit (POLLEN): a pollinizer, another variety, two cultivars. */
const PARTNER_NEEDED = /\b(?:needs?|needed|requires?|required|must|necessary|will need)\b[^.;]{0,60}?\b(?:polliniz\w*|pollen donor|another (?:\w+\s+){0,3}?(?:variety|cultivar|tree|plant|specimen|individual|clone|colony|selection|type)|(?:an? )?other (?:\w+\s+)?(?:varieties|cultivars|clones|trees|plants)|(?:at least )?(?:two|2) (?:different )?(?:cultivars|varieties|plants|trees|clones)|more than one|genetically different|cross[- ]?pollinat\w*|reciprocal pollinizer|type-?\d trees)|\b(?:polliniz\w*|pollen donor)\b[^.;]{0,30}?\b(?:is |are )?(?:needed|required|necessary)\b/i;
const POLLEN = /\bpollinat\w*|\bpolliniz\w*|\bpollen\b|\bfruit[- ]set\b|\bset (?:its )?fruit\b|\bto fruit\b|\b(?:to|for|in order to) (?:produce|bear|set|get|enjoy) (?:\w+\s+){0,3}?(?:fruits?|berries|nuts|seeds?)\b|\bfor (?:\w+\s+){0,2}(?:fruit|berry|nut) production\b/i;
/** A partner said to help, not needed: words for a partner planted with it (or pollination), for a gain, and for the crop. */
const FRUIT_PARTNERS = /\b(?:another|other|two|three|multiple|several|more than one|second|different (?:\w+\s+)?(?:cultivars?|variet\w+)|in groups|groups|masses|mass plantings|multiples|a nearby pollinator|pollinizers?|male and (?:a )?female)\b/i;
const PLANTED_WITH = /\b(?:plant|plants|planting|planted|having|have|grow|growing|sow)\b[^.;]{0,50}?\b(?:another|two|three|more than one|multiple|several|different|in groups|groups|masses|multiples|a group|other (?:\w+\s+)?(?:varieties|cultivars|apples|pears|trees))\b|\bpollinat\w*|\bpolliniz\w*/i;
const RECOMMEND = /\b(?:recommend\w*|good to have|advisable|beneficial)\b/i;
const GAIN = /\b(?:better|best|improv\w*|increase\w*|larger|higher|more abundant|optimum|optimal|heavier|bigger|adequate|ensure)\b/i;
const CROP = /\b(?:fruit\w*|berr(?:y|ies)|crops?|yields?|nuts?|production|pollination|seeds?)\b/i;
/** Fruiting alone, by its words ("self-fertile", "self-pollinating"). */
const SELF = /\bself[- ]?(?:fertile|fruitful|pollinat\w*|fertiliz\w*)\b|\bcan self[- ]?(?:pollinate|fertilize)\b/i;
/** Said not to: "not self-fertile" is PARTNER's. */
const SELF_NOT = /\b(?:not|never|no|isn't|aren't|cannot|can't|nor|unable to|not great at|poor at)\s+(?:\w+\s+){0,1}self/i;
/** Some of it only, or flowers of another kind: "lower flowers are self-fertile", cleistogamous flowers, "this species
 * which sometimes has" among others that don't. */
const SELF_SOME = /\b(?:lower|cleistogamous|non-opening|bud-like|closed|some|few) (?:\w+\s+)?flowers\b|\bcleistogam\w*|\bremain closed\b|\bexcept (?:for )?this species\b/i;
/** Fruiting, partly: "some fruits without", "a small number", "partially self-fertile". */
const FRUIT_PARTLY = /\b(?:some|a few|a small number of|partially|partly|modest\w*|rarely|occasionally|infrequently|reduced|lighter|light crop|less)\b/i;
/** Maybe, or in general: "can be monoecious or dioecious", "a few have separate", "most species of the genus". */
const UNSETTLED = /\bmonoecious or dioecious\b|\bdioecious or monoecious\b|\b(?:a few|some|several|many) (?:\w+\s+){0,2}(?:have|are|species|figs|members) (?:\w+\s+){0,2}(?:separate|dioecious)\b|\bmost species of\b|\bmay appear on the same or\b|\bon the same (?:plant|tree|branch|spike|stem|shrub)\b|\bcross[- ]?pollinat\w* (?:with|by) (?:other|insects)|\bhybridi[sz]\w*|\brevert\w*|\bchange sex\b/i;
/** Other plants as subject: "Most apple cultivars …" says what most do, not this one. */
const MOST = /^(?:most|many|some)\b/i;

/** A page's sentences, split again where one starts with a quoted name ("… Plant Delights Nursery. 'Cherry Ice' is …"). */
const splitQuoted = (list) => (list ?? []).flatMap((s) => String(s).split(/(?<=[.!?])\s+(?=['‘’"“][A-Z])/));
/** A sentence opening with a quoted name that isn't one of the page's: another cultivar ("'Cherry Ice' is self-fertile" on
 * its species' page). */
const anotherQuoted = (s, names) => {
  const q = /^['‘’"“]([^'‘’"”]{2,40})['’"”]/.exec(String(s).trim());
  const bare = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  return !!q && !names.some((n) => bare(n).includes(bare(q[1])));
};
/** Its names, also as plurals, for sentences about its group ("Hollies are …" on an American holly's page). */
const withPlurals = (names) => [...names, ...names.map((n) => String(n).replace(/y$/i, 'ies').replace(/([^s])$/i, '$1s'))];

/**
 * What one sentence says of fruit set: { v, rule }, v one of 'alone' (fruiting alone, said outright), 'separate',
 * 'partner', 'better' or 'self' (by its words); or null.
 */
export function fruitSetSaid(sentence, names = []) {
  const s = String(sentence ?? '');
  // ("Most of the varieties are …": its kind, as a rule, not another plant.)
  if (aboutName(s) || QUESTION.test(s) || (!MOST.test(s.trim()) && aboutAnother(s, withPlurals(names))) || anotherQuoted(s, names)) return null;
  // ("Its flowers can be on the same plant; however, they are not self-fertile": said outright, whatever else the sentence says.)
  if (UNSETTLED.test(s)) return /\bnot self[- ]?(?:fertile|fruitful)\b|\bself[- ]?(?:incompatible|unfruitful)\b/i.test(s) && !/\bhybridi[sz]|\brevert/i.test(s) ? { v: 'partner', rule: 'partner' } : null;
  const need = /\b(?:needs?|needed|requires?|required|must|necessary)\b/i.test(s) && !/\b(?:may|might|can)\s+(?:\w+\s+)?(?:be )?(?:needed|required|necessary)\b/i.test(s);
  // (A gain from planting a partner, for the crop; or other cultivars recommended.)
  const gain = FRUIT_PARTNERS.test(s) && ((PLANTED_WITH.test(s) && GAIN.test(s) && CROP.test(s))
    || (RECOMMEND.test(s) && (CROP.test(s) || SELF.test(s)) && /\b(?:two|three|several|multiple|different|more than one|another)\s+(?:\w+\s+)?(?:cultivars?|variet(?:y|ies))\b/i.test(s)));
  if (ALONE.test(s)) {
    // ("Sets fruit without pollination, but two cultivars are recommended for a better crop"; "some fruits without a
    // male": alone, and better with one.)
    if (gain || FRUIT_PARTLY.test(s.slice(0, ALONE.exec(s).index))) return { v: 'better', rule: 'alone-but' };
    return { v: 'alone', rule: 'alone' };
  }
  if (SEPARATE.test(s)) return { v: 'separate', rule: 'separate' };
  const needed = !/\bif (?:they|it|you) (?:need|require)/i.test(s) && PARTNER_NEEDED.test(s) && POLLEN.test(s);
  if ((PARTNER.test(s) || needed) && !SELF_SOME.test(s)) {
    // ("Requires another variety for the best crop": needed. "Partially self-fertile": better.)
    if (/\bpartial(?:ly)? self/i.test(s)) return { v: 'better', rule: 'partly' };
    return need || /\bself[- ]?(?:incompatible|sterile|unfruitful|infertile)\b|\bnot self|\bcannot|\bcan't|\bunable/i.test(s) ? { v: 'partner', rule: 'partner' } : { v: 'better', rule: 'partner-helps' };
  }
  if (gain || /\bpartial(?:ly)? self[- ]?(?:fertile|fruitful|pollinat\w*)\b|\bnot great at self|\bfruits? may not form\b|\bcross[- ]?pollinat\w* may be needed\b/i.test(s)) return { v: 'better', rule: 'better' };
  if (SELF.test(s) && !SELF_NOT.test(s) && !SELF_SOME.test(s)) {
    // ("It is self-pollinating": said of it, outright. "Most of the varieties are self-pollinating": its words only.)
    return MOST.test(s.trim()) || /\bmost of\b|\bclassed as\b/i.test(s) ? { v: 'self', rule: 'self-most' } : { v: 'alone', rule: 'self' };
  }
  return null;
}
/**
 * What a page's sentences say of its fruit set, { v, says }, or null: fruiting alone said outright, unless a sentence
 * says a partner helps (better); else separate sexes; else a partner needed; else better with one; else self.
 */
export function fruitSetFromProse(list, names = []) {
  list = splitQuoted(list);
  const said = list.map((s) => ({ s, d: fruitSetSaid(s, names) })).filter((x) => x.d);
  if (!said.length && !sexFromProse(list, names)) return null;
  const has = (k) => said.some((x) => x.d.v === k);
  // (A male or a female cultivar is of a plant with separate sexes, whatever else its page says of pollinizers.)
  const sexed = !has('alone') && sexFromProse(list, names);
  const v = sexed ? 'separate' : has('alone') ? (has('better') ? 'better' : 'self') : ['separate', 'partner', 'better', 'self'].find(has);
  const by = v === 'self' && has('alone') ? 'alone' : v;
  const says = said.filter((x) => x.d.v === by || (v === 'better' && x.d.v === 'alone')).slice(0, 3).map((x) => x.s).join(' … ');
  return { v, says: says || sexed.says };
}

/** Its sex said of it ("It is a female cultivar", "'Stokes' is a male plant", "As a female cultivar, it …"). */
const SEX = /^(?:(?:it|this(?: \w+)?|[^,;]{1,60}?)\s+(?:is|was)\s+(?:(?:an?|the)\s+)?(?:(?!(?:and|or|with|both|that|to|for|by|of|in|on|not|recommended|applied|planted|used|sold|grown|known|said)\b)[\w'’-]+[\s,]+){0,3}?|(?:being|as) an? |as (?:this|the) (?:cultivar|selection|clone|plant|tree|shrub) is |(?:this|the) (?:cultivar|selection|clone) is )(all-)?(male|female)\b(?!\s+(?:flowers?|parts?|organs?|cones?|catkins?|spikes?|reproductive))/i;
/** What one sentence says of its sex: 'male', 'female', or null. */
export function sexSaid(sentence, names = []) {
  const first = String(sentence ?? '').split(/;|,\s+(?:although|though|but|while|and)\b|\s+(?:although|though|but|while|whereas)\s+/i)[0].replace(/\s*\([^)]*\)/g, '').trim();
  // (Both sexes, or once: "applied to both male and female plants", "the original was female".)
  if (aboutName(first) || aboutAnother(first, names) || /\bmale and female\b|\bfemale and male\b|\bboth\b|\boriginal\b|\bone sex\b/i.test(first)) return null;
  const lead = /^(?:it|this|these|its|being|as|because|since|the cultivar|the selection)\b/i.test(first) || names.some((n) => first.toLowerCase().includes(String(n).toLowerCase().replace(/^.*?['‘]/, "'")));
  // ("Female clone, dwarf, dense …": a field-like line on the page.)
  const clone = /^(all-)?(male|female) (?:clone|cultivar|selection)\b/i.exec(first);
  if (clone) return clone[2].toLowerCase();
  const m = lead ? SEX.exec(first.replace(/^because\s+|^since\s+/i, '')) : null;
  return m ? m[2].toLowerCase() : null;
}
/** Its sex, { v, says }, where its sentences say one and never the other. */
export function sexFromProse(list, names = []) {
  const said = splitQuoted(list).map((s) => ({ s, v: sexSaid(s, names) })).filter((x) => x.v);
  const vs = new Set(said.map((x) => x.v));
  return vs.size === 1 ? { v: [...vs][0], says: said.slice(0, 2).map((x) => x.s).join(' … ') } : null;
}

// ---------- The color its flowers are, first ----------
//
// Which of its flower colors leads (Jason, 2026-10-30: "agreed on the color read"): where one source lists several (NC
// State lists "Gold/Yellow, Pink, Red/Burgundy, White" for a camellia, in its own order), the color its description first
// gives its flowers goes first, the one the plan draws it in. A color word just before a word for its flowers ("deep red
// flowers", "white, fragrant blooms", "pink to white flowers": pink), or after one ("flowers are pale blue"). A two-color
// word counts as its last ("creamy-white": white; "greenish-yellow": yellow). Not a disk's or an eye's color, a color of
// cultivars or other plants it names, or a fruit's or a leaf's. It only orders: never adds a color its source didn't list.

/** Color words, in the catalog's flower colors (claims.mjs FLOWER_WORDS, and a few more of the same groups). */
const LEAD_COLORS = {
  white: 'white', yellow: 'yellow', gold: 'yellow', golden: 'yellow', pink: 'pink', purple: 'purple', lavender: 'purple', violet: 'purple', lilac: 'purple',
  red: 'red', scarlet: 'red', crimson: 'red', burgundy: 'red', maroon: 'red', orange: 'orange', blue: 'blue', green: 'green', cream: 'cream', creamy: 'cream',
  tan: 'cream', brown: 'brown', copper: 'brown', silver: 'silver', gray: 'silver', grey: 'silver', black: 'black',
};
export const LEAD_VALUES = [...new Set(Object.values(LEAD_COLORS))];
const COLOR = String.raw`(?:(?:[a-z]+(?:ish)?-)?(?:${Object.keys(LEAD_COLORS).join('|')}))`;
const FLOWER_NOUN = String.raw`(?:flowers?|blooms?|blossoms?|florets?|petals|ray flowers|rays|corollas?|bracts|spathes?|inflorescences?|flower (?:heads?|clusters|spikes|panicles))`;
/** A color, then up to three words for its look or size, then its flowers: "small, white, star-shaped flowers". */
const BEFORE = new RegExp(String.raw`\b(${COLOR})(?:\s+(?:to|or|and)\s+${COLOR})?(?:[\s,]+(?!(?:fruits?|berries|leaves|foliage|stems?|bark|seeds?|centers?|eyes?|disks?|discs?|throats?|anthers|stamens|veins|markings|spots|and|with)\b)[a-z-]+){0,3}?[\s,]+${FLOWER_NOUN}\b`, 'gi');
/** Its flowers, then a color: "the flowers are pale blue", "blooms in shades of pink". */
const AFTER = new RegExp(String.raw`\b${FLOWER_NOUN}\s+(?:are|is|appear|range|come|open|bloom|vary)\s+(?:\w+\s+){0,3}?(${COLOR})\b|\b(?:flower|bloom|blossom|petal)s?\s+colou?rs?\s+(?:is|are|ranges?|varies|vary|includes?)\s+(?:\w+\s+){0,3}?(${COLOR})\b`, 'gi');
/** A color that's a disk's, an eye's or a center's ("yellow-centered", "a yellow disk"), or before another plant's flowers. */
const NOT_ITS = /\b(?:disk|disc|center|centre|eye|throat)\b/i;
const OTHERS_COLORS = /\b(?:cultivars?|varieties|variety|selections?|forms?|hybrids?|species|relatives?|cousins?)\b[^.;]{0,40}\b(?:available|include|includes|such as|offer|with|have|bear|come|there are)\b|\b(?:unlike|compared|similar to|resembles?|instead of|rather than|other)\b/i;
const colorOf = (w) => LEAD_COLORS[String(w).toLowerCase().split('-').pop().replace(/ish$/, '')] ?? null;

/** The color one sentence first gives its flowers, or null. */
export function flowerLeadSaid(sentence, names = []) {
  const s = String(sentence ?? '');
  if (aboutName(s) || QUESTION.test(s) || aboutAnother(s, names) || anotherQuoted(s, names)) return null;
  for (const part of clauses(s)) {
    if (OTHERS_COLORS.test(part) || OTHER_PLANT.test(part)) continue;
    const found = [...part.matchAll(BEFORE), ...part.matchAll(AFTER)].sort((a, b) => a.index - b.index);
    for (const m of found) {
      const around = part.slice(Math.max(0, m.index - 12), m.index + m[0].length);
      if (NOT_ITS.test(m[0]) || /\b(?:yellow|white|dark|brown|purple)-centered\b/i.test(around)) continue;
      const c = colorOf(m[1] ?? m[2]);
      if (c) return c;
    }
  }
  return null;
}
/** The color its description first gives its flowers, { v, says }, or null. */
export function flowerLeadFromProse(list, names = []) {
  for (const s of splitQuoted(list)) { const v = flowerLeadSaid(s, names); if (v) return { v, says: s }; }
  return null;
}

// ---------- Its partners, named ----------
//
// The plants a page names as its plant's pollinizer (Jason, 2026-10-30: "named partners first", for the partner a
// placed plant is offered): cultivars it names, in quotes, in a sentence about pollinating or pairing this plant ("A
// good male plant to pair it with is 'Southern Gentleman'", "requiring two pollinating cultivars, like 'Stuart' or
// 'Elliot'", "One male winterberry, such as the late-blooming cultivar 'Southern Gentleman', is necessary"). As
// `partners`, the names as the page gives them. Not its own names; not where it came from (a cross's parents, open-
// pollinated seed); not a cultivar said to fruit on its own; and not pollinators, the insects.

/** A sentence about pollinating this plant, or pairing it: a pollinizer, a male plant, two pollinating cultivars. */
const PARTNER_CTX = /\bpolliniz\w*|\bpollenizer\w*|\bpollinator\b|\bpollinat(?:e|es|ed|ing|ion)\b|\bpair (?:it )?with\b|\bmale (?:plants?|holl(?:y|ies)|winterberr(?:y|ies)|trees?|shrubs?|vines?|cultivars?|clones?|selections?|forms?)\b/i;
/** Not a partner: a cross's parents, open-pollinated seed, the insects, a cultivar fruiting on its own, a reversion. */
const NOT_PARTNER = /\bopen[- ]?pollinat\w*|\bcross[- ]?pollination of\b|\bparents?\b|\bpollinator[- ](?:gardens?|plants?|habitats?|friend\w*)|\bpollinators\b|\bbred\b|\bself[- ]?(?:pollinating|pollinated|fertile|fruitful)\b|\bparthenocarp\w*|\brevert\w*|\bwithout (?:a |any )?(?:male )?(?:pollinizer|pollinator|male)\b|\bis the (?:male|female) (?:clone|form|selection)\b/i;
/** Names in quotes: 'Southern Gentleman'. */
const QUOTED = /['‘’"“] ?([A-Z](?:[^'‘’"”]|['’](?=s\b)){1,40}?) ?['’"”](?![a-z])/g;
/** A name as compared: letters and digits, lowercased, doubled letters as one ("Eliot" for 'Elliot'). */
const bareName = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');

/** The names one sentence gives as its plant's partners, or null. */
export function partnersSaid(sentence, names = []) {
  const s = String(sentence ?? '');
  if (!PARTNER_CTX.test(s) || NOT_PARTNER.test(s) || aboutName(s) || QUESTION.test(s)) return null;
  const own = names.map(bareName);
  const out = [];
  // (Not a synonym given beside a name: "'Stokes Dwarf' (syn. 'Schilling's Dwarf')".)
  for (const m of s.replace(/\(\s*(?:syn\.?|synonym|also (?:sold|known) as|aka)\b[^)]*\)/gi, '').matchAll(QUOTED)) {
    const n = m[1].trim(), b = bareName(n);
    if (b.length < 2 || own.some((o) => o.includes(b)) || out.some((x) => bareName(x) === b)) continue;
    out.push(n);
  }
  return out.length ? out : null;
}
/** The partners its description names, { v, says }, or null. */
export function partnersFromProse(list, names = []) {
  // (As splitQuoted, but not after an abbreviation: "(syn. 'Schilling's Dwarf')" stays in its sentence.)
  const split = (list ?? []).flatMap((s) => String(s).split(/(?<=[.!?])(?<!\b(?:syn|cv|var|ssp|subsp|aka)\.)\s+(?=['‘’"“][A-Z])/i));
  const said = split.map((s) => ({ s, v: partnersSaid(s, names) })).filter((x) => x.v);
  if (!said.length) return null;
  const v = [];
  for (const x of said) for (const n of x.v) if (!v.some((y) => bareName(y) === bareName(n))) v.push(n);
  return { v: v.slice(0, 8), says: said.slice(0, 3).map((x) => x.s).join(' … ') };
}

/** Claims read from NC State's description (an authority, like its fields). */
export function ncsuProseClaims(html) {
  const list = ncsuDescription(html), names = ncsuNames(html);
  const read = [['foliage', foliageFromProse], ['deer', deerFromProse], ['self_seed', seedFromProse], ['habit', habitFromProse], ['fruit_set', fruitSetFromProse], ['sex', sexFromProse], ['flower_lead', flowerLeadFromProse], ['partners', partnersFromProse]];
  return read.map(([fact, from]) => [fact, from(list, names)]).filter(([, r]) => r)
    .map(([fact, r]) => ({ fact, v: r.v, src: 'ncsu', kind: 'authority', says: r.says, prose: true }));
}
