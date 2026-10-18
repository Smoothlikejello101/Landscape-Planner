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
]);
/** Botanical gardens, state floras and other authorities that aren't .edu or .gov. */
const AUTHORITY_SITES = new Set([
  'mtcubacenter.org', 'chicagobotanic.org', 'illinoiswildflowers.info', 'minnesotawildflowers.info', 'plantselect.org', 'amwua.org',
  'txsmartscape.com', 'brooklynbotanic.org', 'nybg.org', 'bbg.org', 'denverbotanicgardens.org', 'longwoodgardens.org', 'arnoldarboretum.harvard.edu',
]);
/** Breeders and their brands: the primary source for their own cultivars. */
const BREEDER_SITES = new Set([
  'provenwinners.com', 'provenwinners-shrubs.com', 'monrovia.com', 'firsteditionsplants.com', 'waltersgardens.com', 'starrosesandplants.com',
  'endlesssummerblooms.com', 'bloominesy.com', 'southernlivingplants.com', 'encoreazalea.com', 'gardendebut.com', 'plantsnouveau.com',
  'terranovanurseries.com', 'darwinperennials.com', 'bloomingeasy.com', 'spring-meadow.com', 'shrubs.provenwinners.com',
]);
/** What kind of source a URL is: 'authority', 'breeder', 'nursery', 'blog', or 'skip'. `html` helps tell a shop from a blog. */
export function siteKind(url, html = '') {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'skip'; }
  const site = siteOf(host);
  if (SKIP_SITES.has(site) || SKIP_SITES.has(host)) return 'skip';
  if (/\.(edu|gov)$/.test(site) || /\.gov\.\w+$/.test(host) || AUTHORITY_SITES.has(site) || AUTHORITY_SITES.has(host)) return 'authority';
  if (BREEDER_SITES.has(site) || BREEDER_SITES.has(host)) return 'breeder';
  return /add to cart|add-to-cart|in stock|out of stock|\$\s?\d+\.\d\d|ships? (?:in|to)|quantity/i.test(html.slice(0, 400000)) ? 'nursery' : 'blog';
}

// ---------- Pages ----------

/** A page's text, one block per line. */
export function pageText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|li|tr|td|th|dt|dd|h[1-6]|br|section|article|table|ul|ol|dl|span class="label")[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;|&#8217;/g, "'").replace(/&ndash;|&#8211;|&mdash;|&#8212;/g, '–').replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&deg;/g, '°')
    .replace(/[ \t]+/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}
/** Whether a page is about this plant: its botanical name, or (for a cultivar) the cultivar name. */
export function aboutPlant(text, { species, cultivar }) {
  const t = text.toLowerCase().replace(/[‘’]/g, "'");
  if (cultivar) return t.includes(cultivar.toLowerCase());
  return t.includes(species.toLowerCase());
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
  const m = new RegExp(String.raw`${NUM}\s*${UNIT}?\s*(?:(?:-|–|to)\s*${NUM}\s*)?${UNIT}`, 'i').exec(text);
  if (!m) return null;
  const feet = (x, unit) => (/^(inches|inch|in\.?|")$/i.test(unit) ? x / 12 : x);
  const a = feet(toNumber(m[1]), m[2] ?? m[4]), b = m[3] ? feet(toNumber(m[3]), m[4]) : a;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
  const r = (x) => Math.round(x * 100) / 100;
  return { min: r(Math.min(a, b)), max: r(Math.max(a, b)) };
}
const SUNS = [[/\bfull sun\b/i, 'Full'], [/\b(part(ial)? (sun|shade)|half[- ]shade|light shade|dappled)\b/i, 'Part'], [/\b(full shade|deep shade|dense shade)\b|^shade$/i, 'Shade']];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
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
  // A list of half-zones ("5a, 5b, 6a … 9b"), as NC State and Proven Winners write them.
  if (/^\s*\d{1,2}[ab](\s*,\s*\d{1,2}[ab])+\s*$/i.test(v)) return halfZones(v.replace(/\s+/g, '').toLowerCase());
  const m = /^\D{0,12}(\d{1,2}\s*[ab]?)\s*(?:-|–|to|through|thru)\s*(\d{1,2}\s*[ab]?)\b/i.exec(v);
  return m ? zoneSpan(m[1].replace(/\s/g, ''), m[2].replace(/\s/g, '')) : null;
};
const sunOf = (v) => {
  const got = SUNS.filter(([re]) => re.test(v)).map(([, x]) => x);
  if (/^\s*sun\b(?!\s*(?:to|-|–)?\s*part)/i.test(v) || /\bsun to\b/i.test(v)) got.push('Full'); // ("sun", "sun to part shade")
  if (/\bshade\b/i.test(v) && !/part(ial)? shade|light shade|half[- ]shade|dappled/i.test(v)) got.push('Shade');
  const order = ['Full', 'Part', 'Shade'].filter((x) => got.includes(x));
  return order.length ? { most: order[0], least: order[order.length - 1] } : null;
};
const bloomOf = (v) => {
  const b = v.toLowerCase();
  const ms = [...b.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g)].map((m) => MONTHS.indexOf(m[1]) + 1);
  const ss = [...new Set(SEASONS.filter((x) => b.includes(x)).map((x) => (x === 'autumn' ? 'fall' : x.replace(/^(early |mid |late )|mid ?/, ''))))];
  return ms.length || ss.length ? { months: ms.length ? { start: ms[0], end: ms[ms.length - 1] } : null, seasons: ss.length ? ss : null } : null;
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
        if (!next || looksLikeLabel(next)) continue;
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
  const bl = read(BLOOM_RE, bloomOf);
  if (bl?.months) out.bloomMonths = bl.months;
  if (bl?.seasons) out.bloomSeasons = bl.seasons;
  const c = read(COLOR_RE, colorOf); if (c) out.flowerColor = c;
  const d = read(DEER_RE, deerOf); if (d) out.deer = d;
  return out;
}

/** Sources closed to us that a page says it draws on: then the page is that source, second-hand, and isn't read. */
const SECOND_HAND = /missouri botanical garden|missouribotanicalgarden\.org|lady bird johnson wildflower center|wildflower\.org/i;
export const secondHand = (text) => SECOND_HAND.test(text);

/** A page's own wording, to tell copies apart: the hash of its longest paragraph (null if it has none long enough). */
export function copyKey(html) {
  const paras = [...String(html).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  const longest = paras.sort((a, b) => b.length - a.length)[0];
  return longest && longest.length >= 120 ? createHash('sha256').update(longest).digest('hex').slice(0, 16) : null;
}

/** A page's spec lines as claims, for one plant. */
export function webClaims(url, html, plant) {
  const kind = siteKind(url, html);
  if (kind === 'skip') return [];
  const text = pageText(html);
  if (!aboutPlant(text, plant) || secondHand(text)) return [];
  const f = webFields(text);
  const src = siteOf(new URL(url).hostname);
  const key = copyKey(html);
  const base = { src, kind, url, group: key ? `p:${key}` : src, cultivarPage: !!plant.cultivar };
  const c = [];
  if (f.zones) c.push({ ...base, fact: 'zone_min', v: f.zones.zone_min }, { ...base, fact: 'zone_max', v: f.zones.zone_max });
  if (f.height) c.push({ ...base, fact: 'height', v: f.height });
  if (f.width) c.push({ ...base, fact: 'width', v: f.width });
  if (f.sun) c.push({ ...base, fact: 'sun_most', v: f.sun.most }, { ...base, fact: 'sun_least', v: f.sun.least });
  if (f.bloomSeasons) c.push({ ...base, fact: 'bloom_season', v: f.bloomSeasons });
  if (f.bloomMonths) c.push({ ...base, fact: 'bloom_months', v: f.bloomMonths });
  if (f.flowerColor) c.push({ ...base, fact: 'flower_color', v: f.flowerColor });
  if (f.deer) c.push({ ...base, fact: 'deer', v: f.deer });
  return c;
}

// ---------- Terms ----------
// The same reading as docs/catalog-sources.md "How terms are read", done by
// pattern for sites found by search, cautiously: a site whose terms page
// can't be told apart from a ban is treated as banning.

const TERMS_TEXT = /^(?:website |site )?(?:terms(?: of (?:use|service|sale))?|terms (?:&|and) conditions|conditions of (?:use|sale)|legal(?: notices?| information)?|copyright(?: (?:notice|policy|information))?|site policies|website policy|digital rights and copyright|disclaimer)$/;
const TERMS_PATH = /(?:^|[\/_-])(?:terms|tos|legal|conditions-of-use|copyright|site-policies|disclaimer)(?:[\/_.-]|$)/;
/** Places a site's terms usually live, to try when its home page links none. */
export const TERMS_GUESSES = ['/terms', '/terms-of-use', '/terms-of-service', '/policies/terms-of-service', '/terms-and-conditions'];
/** Links on a page that look like its terms of use, on the same site. */
export function termsLinks(html, pageUrl) {
  const base = new URL(pageUrl);
  const out = [];
  for (const m of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().toLowerCase();
    let u;
    try { u = new URL(m[1].replace(/&amp;/g, '&'), base); } catch { continue; }
    if (u.protocol !== 'https:' || siteOf(u.hostname) !== siteOf(base.hostname)) continue;
    const path = u.pathname.toLowerCase();
    if (!TERMS_TEXT.test(text) && !(TERMS_PATH.test(path) && !/privacy|cookie|shipping|return|refund|glossary/.test(path))) continue;
    u.hash = '';
    if (!out.includes(u.href)) out.push(u.href);
  }
  // Terms first, then the rest (legal notices, copyright, disclaimers).
  return out.sort((a, b) => Number(/terms|conditions|tos\b/i.test(b)) - Number(/terms|conditions|tos\b/i.test(a))).slice(0, 3);
}

const BAN = String.raw`(?:may not|shall not|must not|will not|agree not to|cannot|can't|not (?:be )?(?:permitted|allowed|authori[sz]ed)|prohibit|forbid|forbidden|restricted|without (?:the |our )?(?:prior |express |explicit )?(?:written )?(?:consent|permission|authori[sz]ation))`;
const BOTS = /\b(robots?|spiders?|scrap(?:e|er|ers|ing)|crawl(?:er|ers|ing)?|data[- ]mining|harvest(?:ing)?|web ?bots?|automated (?:means|devices?|systems?|process(?:es)?|tools?|access|software|queries|scripts?|programs?)|automatic (?:devices?|means)|machine learning|artificial intelligence|\bAI\b|text and data mining)\b/i;
const USE = /\b(commercial (?:use|purpose|exploitation)|for (?:any )?commercial|database|compil(?:e|ation)|redistribut|resell|derivative works?)\b/i;
const INFO = /\b(content|information|data|materials?|text|anything)\b/i;

/**
 * What a site's terms say about us: 'bots' (no automated reading: not by
 * bot), 'use' (no commercial use or database of its information: ask
 * first), or 'open' (nothing found against either). With the sentence that
 * decided it.
 */
export function termsVerdict(text) {
  const sentences = String(text).replace(/\s+/g, ' ').split(/(?<=[.;:!?])\s+(?=[A-Z(•\-0-9])/);
  const ban = new RegExp(BAN, 'i');
  for (const st of sentences) if (BOTS.test(st) && ban.test(st)) return { verdict: 'bots', because: st.slice(0, 300) };
  for (const st of sentences) if (USE.test(st) && INFO.test(st) && ban.test(st)) return { verdict: 'use', because: st.slice(0, 300) };
  return { verdict: 'open', because: null };
}
