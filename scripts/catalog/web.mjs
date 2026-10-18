// Reading the open web for the catalog (docs/catalog-sources.md, "Tiers" and
// "Searching"): which sites a search result may come from and what kind of
// source each is, what a plant page says in its spec lines, and which pages
// are copies of each other.
import { createHash } from 'node:crypto';
import { halfZones, zoneSpan } from './claims.mjs';
import { siteOf } from './fetch-lib.mjs';

// ---------- Sites ----------

/**
 * Sites the audit doesn't read from search results: closed to bots, terms
 * that forbid it, sources still waiting for a yes, crowd-sourced or
 * AI-written plant sites, and places that aren't plant references.
 */
export const SKIP_SITES = new Set([
  // Closed to bots, or terms forbid it (docs/catalog-sources.md)
  'missouribotanicalgarden.org', 'wildflower.org', 'aspca.org', 'florida.plantatlas.usf.edu', 'swbiodiversity.org', 'oregonflora.org',
  'wnps.org', 'calscape.org', 'berkeley.edu', 'msu.edu', 'prairiemoon.com', 'grownative.org', 'okstate.edu', 'wsu.edu', 'sunset.com',
  'garden.org', 'perenual.com', 'xerces.org', 'nwf.org', 'iastate.edu',
  // Ask first: waiting for a written yes
  'mortonarb.org', 'nativeplanttrust.org', 'kswildflower.org', 'fnps.org', 'npsot.org', 'uconn.edu', 'ucanr.edu', 'usu.edu', 'nmsu.edu',
  'calpoly.edu', 'ucdavis.edu', 'rutgers.edu', 'ufl.edu', 'virginia.gov', 'petpoisonhelpline.com',
  // Crowd-sourced, AI-written, or not plant references
  'davesgarden.com', 'gardentags.com', 'permapeople.org', 'growstuff.org', 'getgrowli.app', 'plantsmap.com', 'pinterest.com', 'youtube.com',
  'facebook.com', 'instagram.com', 'reddit.com', 'quora.com', 'amazon.com', 'ebay.com', 'etsy.com', 'walmart.com', 'homedepot.com', 'lowes.com',
  'houzz.com', 'tiktok.com', 'x.com', 'twitter.com', 'kaggle.com', 'wikipedia.org', 'wikimedia.org', 'wikidata.org', 'inaturalist.org',
  'mobot.org', 'gardenersworld.com',
  // Archives, caches and aggregators: never second-hand (docs/catalog-sources.md)
  'archive.org', 'archive.ph', 'archive.today', 'archive.is', 'archive.li', 'archive.vn', 'archive.md', 'webcitation.org', 'cachedview.nl',
  'googleusercontent.com', 'commoncrawl.org', 'trefle.io', 'gbif.org', 'plantnet.org', 'identify.plantnet.org', 'openfarm.cc', 'pfaf.org',
  // Read through their own extractors already (a search hit would count them twice)
  'usda.gov', 'ncsu.edu', 'minnesotawildflowers.info',
]);
/** Botanical gardens, state floras and other authorities that aren't .edu or .gov. */
const AUTHORITY_SITES = new Set([
  'mtcubacenter.org', 'chicagobotanic.org', 'illinoiswildflowers.info', 'minnesotawildflowers.info', 'plantselect.org', 'amwua.org',
  'txsmartscape.com', 'brooklynbotanic.org', 'nybg.org', 'bbg.org', 'denverbotanicgardens.org', 'longwoodgardens.org', 'arnoldarboretum.harvard.edu',
]);
/**
 * One company's sites count as one source. (Breeders are read as nurseries
 * for now: a breeder's site sells other breeders' plants too, so which
 * cultivars are its own needs a list of its introductions first.)
 */
const COMPANY = {
  'provenwinners.com': 'provenwinners.com', 'provenwinners-shrubs.com': 'provenwinners.com', 'provenwinnersdirect.com': 'provenwinners.com',
  'spring-meadow.com': 'provenwinners.com', 'waltersgardens.com': 'provenwinners.com',
  'monrovia.com': 'monrovia.com', 'firsteditionsplants.com': 'firsteditionsplants.com', 'baileynurseries.com': 'firsteditionsplants.com',
  'endlesssummerblooms.com': 'firsteditionsplants.com', 'bloomineasy.com': 'bloomineasy.com', 'southernlivingplants.com': 'southernlivingplants.com',
  'encoreazalea.com': 'plantdevelopmentservices', 'plantdevelopment.com': 'plantdevelopmentservices',
};
/** The source a site counts as (one company's sites are one). */
export const sourceOf = (host) => { const site = siteOf(host); return COMPANY[site] ?? site; };
/** What kind of source a URL is: 'authority', 'nursery', 'blog', or 'skip'. `html` helps tell a shop from a blog. */
export function siteKind(url, html = '') {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'skip'; }
  const site = siteOf(host);
  if (SKIP_SITES.has(site) || SKIP_SITES.has(host)) return 'skip';
  if (/\.(edu|gov)$/.test(site) || /\.gov\.\w+$/.test(host) || AUTHORITY_SITES.has(site) || AUTHORITY_SITES.has(host)) return 'authority';
  return /add to cart|add-to-cart|in stock|out of stock|\$\s?\d+\.\d\d|ships? (?:in|to)|quantity/i.test(html.slice(0, 400000)) ? 'nursery' : 'blog';
}

// ---------- Pages ----------

const ENTITIES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', deg: '°', reg: '®', trade: '™', lt: '<', gt: '>', hellip: '…', frac12: '½', frac14: '¼', frac34: '¾' };
const decodeEntity = (e) => {
  const n = /^&#(x[\da-f]+|\d+);$/i.exec(e);
  if (n) { const c = n[1][0].toLowerCase() === 'x' ? parseInt(n[1].slice(1), 16) : Number(n[1]); return c > 0 && c < 0x110000 ? String.fromCodePoint(c === 160 ? 32 : c) : ''; }
  return ENTITIES[e.slice(1, -1)] ?? e;
};
/** Text with its entities decoded and its tags stripped (for reading terms). */
export const plainText = (html) => String(html).replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[#\w]+;/g, decodeEntity).replace(/\s+/g, ' ');
/** A page's text, one block per line. */
export function pageText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|li|tr|td|th|dt|dd|h[1-6]|br|section|article|table|ul|ol|dl|span class="label")[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[#\w]+;/g, decodeEntity)
    .replace(/[ \t]+/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (t) => String(t).toLowerCase().replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');
/** A page's title and main headings, the part that says what it's about. */
export const headline = (html) => norm(plainText([...String(html).matchAll(/<(title|h1)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]).join(' | ')));
const CULTIVAR_MARK = /'[^']{2,40}'|"[^"]{2,40}"|®|™|\bpp ?\d{4,}|\bpbr\b|\bcultivar\b/;
/**
 * Whether a page is about this plant, not one beside it:
 * - a cultivar: its name in the page's title or main heading, as a whole
 *   name, with its genus somewhere on the page;
 * - a species: its botanical name on the page standing alone (not as the
 *   start of a cultivar's name), and no cultivar named in the title or
 *   heading.
 */
export function aboutPlant(html, text, { species, cultivar }) {
  const head = headline(html), t = norm(text);
  const genus = species.split(' ')[0].toLowerCase();
  if (cultivar) {
    const c = norm(cultivar);
    return new RegExp(`(^|[^a-z])${esc(c)}(?![a-z]|'[a-z])`).test(head) && t.includes(genus); // ("Henry" isn't "Henry's Choice")
  }
  const sp = norm(species);
  const bare = new RegExp(`${esc(sp)}(?!\\s*(?:['"]|var\\.|subsp\\.|×|x\\s))`);
  if (!bare.test(t)) return false;
  return !CULTIVAR_MARK.test(head);
}

const NUM = String.raw`(\d+(?:\.\d+)?(?:\s*\d\/\d)?|\d\/\d)`;
const toNumber = (s) => {
  const m = /^(\d+)?\s*(?:(\d)\/(\d))?$/.exec(s.trim());
  if (m && (m[1] || m[2])) return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
  return Number(s);
};
const UNIT = String.raw`(feet|foot|ft\.?|'|inches|inch|in\.?|")`;
/** "3-4 ft", "36-48 in", "3' to 5'", "6 in to 2 ft", "18-24\"" → { min, max } feet. */
export function sizeIn(text) {
  if (/\b(pots?|containers?|gallons?|gal\.?|quarts?|qt\.?|plugs?|liners?|trays?)\b|#\d/i.test(text)) return null; // (what it's sold in)
  if ((text.match(new RegExp(String.raw`${NUM}\s*${UNIT}?\s*(?:(?:-|–|to)\s*${NUM}\s*)?${UNIT}`, 'gi')) ?? []).length > 1) return null; // (more than one size: at 10 years, at maturity…)
  const m = new RegExp(String.raw`${NUM}\s*${UNIT}?\s*(?:(?:-|–|to)\s*${NUM}\s*)?${UNIT}`, 'i').exec(text);
  if (!m) return null;
  const feet = (x, unit) => (/^(inches|inch|in\.?|")$/i.test(unit) ? x / 12 : x);
  const a = feet(toNumber(m[1]), m[2] ?? m[4]), b = m[3] ? feet(toNumber(m[3]), m[4]) : a;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
  const r = (x) => Math.round(x * 100) / 100;
  return { min: r(Math.min(a, b)), max: r(Math.max(a, b)) };
}
const SUNS = [[/\bfull sun\b/i, 'Full'], [/\b(part(ial)? (sun|shade)|half[- ]shade|light shade|dappled)\b/i, 'Part'], [/\b(full shade|deep shade|dense shade)\b|^shade$/i, 'Shade']];
const SEASONS = ['early spring', 'mid spring', 'late spring', 'spring', 'early summer', 'midsummer', 'mid summer', 'late summer', 'summer', 'early fall', 'fall', 'autumn', 'late fall', 'winter'];

const ZONES_RE = /^(?:usda\s+)?(?:plant\s+)?(?:hardiness\s+)?zones?(?:\s+range)?|^hardiness(?:\s+zones?)?|^hardy\s+(?:in\s+)?zones?/i;
const HEIGHT_RE = /^(?:mature\s+|average\s+)?height(?:\s+at\s+maturity)?/i;
const WIDTH_RE = /^(?:mature\s+|average\s+)?(?:width|spread)(?:\s+at\s+maturity)?/i;
const LIGHT_RE = /^(?:sun\s+exposure|exposure|light(?:\s+requirements?|\s+needs)?|sun\s+(?:requirements?|needs)|sunlight|sun(?=\s*:))/i; // (a bare "sun" is a value, unless a colon follows)
const BLOOM_RE = /^(?:bloom(?:ing)?|flowering|flower)\s+(?:time|period|season)|^blooms?(?=\s*:)/i;
const COLOR_RE = /^(?:flower|bloom)\s+colou?rs?/i;
const DEER_RE = /^deer[ -]resist(?:ant|ance)/i;
const ANY_LABEL = [ZONES_RE, HEIGHT_RE, WIDTH_RE, LIGHT_RE, BLOOM_RE, COLOR_RE, DEER_RE];
const looksLikeLabel = (l) => /:\s*$/.test(l) || ANY_LABEL.some((re) => { const m = re.exec(l); return m && !l.slice(m[0].length).trim(); });

const zonesOf = (v) => {
  if (/°|degrees?\b|\d\s*f\b/i.test(v)) return null; // (a temperature, not a zone)
  // A list of half-zones ("5a, 5b, 6a … 9b"), as NC State and Proven Winners write them.
  if (/^\s*\d{1,2}[ab](\s*,\s*\d{1,2}[ab])+\s*$/i.test(v)) return halfZones(v.replace(/\s+/g, '').toLowerCase());
  const m = /^\D{0,12}(\d{1,2}\s*[ab]?)\s*(?:-|–|to|through|thru)\s*(\d{1,2}\s*[ab]?)\b/i.exec(v);
  return m ? zoneSpan(m[1].replace(/\s/g, ''), m[2].replace(/\s/g, '')) : null;
};
const sunOf = (v) => {
  // What it doesn't take isn't what it takes.
  let t = v.toLowerCase().replace(/\b(?:does not|doesn't|will not|won't|cannot|can't)\s+(?:tolerate|take|like|handle)[^,.;)]*|\b(?:not|in)tolerant of[^,.;)]*|\bavoid[^,.;)]*|\bnot (?:for|in)[^,.;)]*|\bno (?:full )?(?:sun|shade)[^,.;)]*/g, ' ');
  if (/morning sun/.test(t) && /afternoon shade/.test(t)) t = t.replace(/morning sun|afternoon shade/g, ' part shade ');
  const got = SUNS.filter(([re]) => re.test(t)).map(([, x]) => x);
  if (/^\s*sun\b(?!\s*(?:to|-|–)?\s*part)/.test(t) || /\bsun to\b/.test(t)) got.push('Full'); // ("sun", "sun to part shade")
  // "shade" on its own, once the part-shade phrases are out of the way.
  if (/\bshade\b/.test(t.replace(/part(?:ial)? shade|light shade|half[- ]shade|dappled shade|afternoon shade|filtered shade/g, ' '))) got.push('Shade');
  const order = ['Full', 'Part', 'Shade'].filter((x) => got.includes(x));
  return order.length ? { most: order[0], least: order[order.length - 1] } : null;
};
/** Bloom seasons only: months differ by place (they wait on "values by region"), and "may" is also a word. */
const bloomOf = (v) => {
  const b = v.toLowerCase();
  const ss = [...new Set(SEASONS.filter((x) => new RegExp(`\\b${x}\\b`).test(b)).map((x) => (x === 'autumn' ? 'fall' : x.replace(/^(early |mid |late )|mid ?/, ''))))];
  return ss.length ? ss : null;
};
const colorOf = (v) => {
  const cs = v.match(/\b(white|pink|red|purple|lavender|violet|blue|yellow|orange|green|cream|maroon|burgundy|magenta|rose|coral|peach|gold)\b/gi);
  return cs ? [...new Set(cs.map((c) => c[0].toUpperCase() + c.slice(1).toLowerCase()))] : null;
};
const deerOf = (v) => (/^(yes|high|resistant|very resistant|true)\b/i.test(v.trim()) ? 'Resistant' : null);

/**
 * The facts a page states in its spec lines ("Hardiness Zones: 5-9",
 * "Mature Height: 3-4 ft", "Light: Full sun to part shade"), cautiously:
 * - a label is a line's start, followed by a colon and its value, or alone
 *   on its line with its value on the next;
 * - a value is short (prose isn't read, and neither is a line that reads as
 *   another label);
 * - a label alone followed by two values in a row is a list of choices (a
 *   shop's filter, icons with one lit), not a value;
 * - a label that appears more than once with different values (related
 *   products on a shop page) is left out.
 */
export function webFields(text) {
  const lines = text.split('\n');
  const read = (re, parse) => {
    const found = [];
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      const after = lines[i].slice(m[0].length);
      let v;
      if (/^\s*:\s*\S/.test(after)) v = after.replace(/^\s*:\s*/, '');
      else if (/^\s*:?\s*$/.test(after)) {
        const next = lines[i + 1] ?? '';
        if (!next || looksLikeLabel(next) || next.length > 40 || /[.!?]$/.test(next)) continue; // (a value, not a sentence)
        if (parse(lines[i + 2] ?? '') != null && !looksLikeLabel(lines[i + 2] ?? '')) { found.push(undefined); continue; } // (a list of choices)
        v = next;
      } else continue;
      if (v.length > 80) continue;
      const parsed = parse(v);
      if (parsed != null) found.push(parsed);
    }
    if (!found.length || found.includes(undefined)) return null;
    const first = JSON.stringify(found[0]);
    return found.every((f) => JSON.stringify(f) === first) ? found[0] : null;
  };
  const out = {};
  const z = read(ZONES_RE, zonesOf); if (z) out.zones = z;
  const h = read(HEIGHT_RE, sizeIn); if (h) out.height = h;
  const w = read(WIDTH_RE, sizeIn); if (w) out.width = w;
  const sun = read(LIGHT_RE, sunOf); if (sun) out.sun = sun;
  const bl = read(BLOOM_RE, bloomOf); if (bl) out.bloomSeasons = bl;
  const c = read(COLOR_RE, colorOf); if (c) out.flowerColor = c;
  const d = read(DEER_RE, deerOf); if (d) out.deer = d;
  return out;
}

/** Sources closed to us that a page says it draws on: then the page is that source, second-hand, and isn't read. */
const SECOND_HAND = /missouri botanical garden|missouribotanicalgarden|mobot\.org|\bmobot\b|kemper center|lady bird johnson|wildflower\.org|\bnpin\b|native plant information network/i;
/** Checked on the page as sent, links included: a source credited only by a link is still the source. */
export const secondHand = (html) => SECOND_HAND.test(String(html));

/** A page's own wording, to tell copies apart: the hash of its longest paragraph (null if it has none long enough). */
export function copyKey(html) {
  const paras = [...String(html).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  const longest = paras.sort((a, b) => b.length - a.length)[0];
  return longest && longest.length >= 120 ? createHash('sha256').update(longest).digest('hex').slice(0, 16) : null;
}

/** A page's spec lines as claims, for one plant. (Facts that differ by place, bloom months above all, aren't taken from the web.) */
export function webClaims(url, html, plant) {
  const kind = siteKind(url, html);
  if (kind === 'skip') return [];
  const text = pageText(html);
  if (secondHand(html) || !aboutPlant(html, text, plant)) return [];
  const f = webFields(text);
  const src = sourceOf(new URL(url).hostname);
  const key = copyKey(html);
  const base = { src, kind, url, ...(key ? { group: `p:${key}` } : {}), cultivarPage: !!plant.cultivar };
  const c = [];
  if (f.zones) c.push({ ...base, fact: 'zone_min', v: f.zones.zone_min }, { ...base, fact: 'zone_max', v: f.zones.zone_max });
  if (f.height) c.push({ ...base, fact: 'height', v: f.height });
  if (f.width) c.push({ ...base, fact: 'width', v: f.width });
  if (f.sun) c.push({ ...base, fact: 'sun_most', v: f.sun.most }, { ...base, fact: 'sun_least', v: f.sun.least });
  if (f.bloomSeasons) c.push({ ...base, fact: 'bloom_season', v: f.bloomSeasons });
  if (f.flowerColor) c.push({ ...base, fact: 'flower_color', v: f.flowerColor });
  if (f.deer) c.push({ ...base, fact: 'deer', v: f.deer });
  return c;
}

// ---------- Terms ----------
// The same reading as docs/catalog-sources.md "How terms are read", done by
// pattern for sites found by search, cautiously: a site whose terms page
// can't be told apart from a ban is treated as banning.

const TERMS_TEXT = /\bterms\b|conditions of (?:use|sale)|\blegal\b|copyright|site polic|website polic|disclaimer|digital rights/;
const TERMS_PATH = /(?:^|[\/_-])(?:terms|tos|legal|conditions-of-use|copyright|site-policies|disclaimer)(?:[\/_.-]|$)/;
/** Places a site's terms usually live, to try when its home page links none. */
export const TERMS_GUESSES = ['/terms', '/terms-of-use', '/terms-of-service', '/policies/terms-of-service', '/terms-and-conditions'];
/**
 * Links on a page that look like its terms of use. On the same site, or
 * (when the link says so) the owner's terms on another site; http links
 * are read over https.
 */
export function termsLinks(html, pageUrl) {
  const base = new URL(pageUrl);
  const out = [];
  for (const m of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = norm(plainText(m[2])).trim();
    let u;
    try { u = new URL(m[1].replace(/&amp;/g, '&'), base); } catch { continue; }
    if (u.protocol === 'http:') u.protocol = 'https:';
    if (u.protocol !== 'https:') continue;
    u.hash = '';
    const path = u.pathname.toLowerCase();
    const saysTerms = TERMS_TEXT.test(text) && !/glossary|^(?:privacy|cookies?|shipping|returns?|refunds?)(?: policy)?$/.test(text) && text.length <= 60;
    const pathTerms = TERMS_PATH.test(path) && !/glossary/.test(path);
    const sameSite = siteOf(u.hostname) === siteOf(base.hostname);
    if (!(saysTerms || (sameSite && pathTerms))) continue;
    if (!sameSite && !saysTerms) continue;
    if (!out.includes(u.href)) out.push(u.href);
  }
  // Terms first, then the rest (legal notices, copyright, disclaimers).
  return out.sort((a, b) => Number(/terms|conditions|tos\b/i.test(b)) - Number(/terms|conditions|tos\b/i.test(a))).slice(0, 3);
}
/** Whether a page that answered at a guessed address is really a terms page (not the home page or a "not found" page served with 200). */
export const looksLikeTerms = (html) => /terms (?:of (?:use|service|sale)|and conditions|& conditions)|conditions of (?:use|sale)|terms of service|user agreement|legal notice/i.test(headline(html) + ' ' + plainText(html).slice(0, 3000));

const BAN = /\b(?:may not|shall not|must not|will not|cannot|can't|do not|don't|agree not|agrees not|not to|not (?:be )?(?:permitted|allowed|authori[sz]ed)|prohibit\w*|forbid\w*|restrict\w*|unauthori[sz]ed|refrain|strictly|without (?:the |our )?(?:prior |express |explicit )?(?:written )?(?:consent|permission|authori[sz]ation)|only for|solely for|limited to)\b/i;
const BOTS = /\b(?:robots?|bots?|spiders?|scrap(?:e|er|ers|ing)|crawl(?:er|ers|ing|s)?|data[- ]mining|text and data mining|harvest(?:ing)?|automat(?:ed|ic)|scripts?|machine learning|artificial intelligence|AI)\b/g;
const USE = /\b(?:non-?commercial|commercial|database|compil(?:e|ing|ation)|personal use)\b/gi;

/**
 * What a site's terms say about us: 'bots' (no automated reading: not by
 * bot), 'use' (personal or non-commercial use only, or no database of its
 * information: ask first), or 'open' (nothing found against either). A
 * ban word within a few lines of a bot or use word counts, so a list of
 * banned things under "You agree not to:" is read as one statement. With
 * the passage that decided it.
 */
export function termsVerdict(text) {
  const t = plainText(text).replace(/[‘’]/g, "'");
  const near = (re) => {
    for (const m of t.matchAll(re)) {
      const around = t.slice(Math.max(0, m.index - 300), m.index + m[0].length + 200);
      if (BAN.test(around) || /non-?commercial|personal use/i.test(m[0])) return around.trim().slice(0, 400);
    }
    return null;
  };
  const bots = near(new RegExp(BOTS.source, 'gi'));
  if (bots) return { verdict: 'bots', because: bots };
  const use = near(USE);
  if (use) return { verdict: 'use', because: use };
  return { verdict: 'open', because: null };
}

/**
 * A site's terms, read: from the pages its home page links to (each one
 * fetched, or the reading is 'unread' and tried again next run), or else
 * from a page at a usual address that really is a terms page, or else
 * 'none found'. The worst verdict among its pages decides.
 *   linked: [{ url, html }] (html null when it couldn't be fetched)
 *   guessed: [{ url, html }] pages that answered at the usual addresses
 */
export function siteTerms({ homeRead, linked, guessed }) {
  if (!homeRead) return { verdict: 'unread', because: 'home page not fetched' };
  let pages = linked.filter((x) => x.html);
  if (linked.length && !pages.length) return { verdict: 'unread', because: 'its terms pages could not be fetched' };
  if (!linked.length) pages = guessed.filter((x) => x.html && looksLikeTerms(x.html)).slice(0, 1);
  if (!pages.length) return { verdict: 'none found', because: null };
  const vs = pages.map((x) => ({ ...termsVerdict(x.html), url: x.url }));
  const worst = vs.find((v) => v.verdict === 'bots') ?? vs.find((v) => v.verdict === 'use') ?? vs[0];
  return { verdict: worst.verdict, because: worst.because, terms: pages.map((x) => x.url) };
}
