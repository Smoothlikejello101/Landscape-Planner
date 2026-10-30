// Reading the open web for the catalog (docs/catalog-sources.md, "Tiers" and
// "Searching"): which sites a search result may come from and what kind of
// source each is, what a plant page says in its spec lines and its
// description (read by prose.mjs's rules), and which pages are copies of
// each other.
import { createHash } from 'node:crypto';
import { halfZones, zoneSpan } from './claims.mjs';
import { siteOf } from './fetch-lib.mjs';
import { deerFromProse, foliageFromProse, habitFromProse, seedFromProse, sentences } from './prose.mjs';

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
  'calpoly.edu', 'ucdavis.edu', 'rutgers.edu', 'ffl.ifas.ufl.edu', 'ffl-api.ifas.ufl.edu', 'petpoisonhelpline.com',
  // Crowd-sourced, AI-written, or not plant references
  'davesgarden.com', 'gardentags.com', 'permapeople.org', 'growstuff.org', 'getgrowli.app', 'plantsmap.com', 'pinterest.com', 'youtube.com',
  'facebook.com', 'instagram.com', 'reddit.com', 'quora.com', 'amazon.com', 'ebay.com', 'etsy.com', 'walmart.com', 'homedepot.com', 'lowes.com',
  'houzz.com', 'tiktok.com', 'x.com', 'twitter.com', 'kaggle.com', 'wikipedia.org', 'wikimedia.org', 'wikidata.org', 'inaturalist.org',
  'mobot.org', 'gardenersworld.com',
  // Found by the terms reviews of 2026-10-27: AI-written or generated pages, a compromised site's spam, a marketplace,
  // crowd-sourced records, a translation proxy
  'bulbsociety.org', 'orchid.guru', 'yourflowersguide.com', 'preachbio.com', 'thatstartendcontain.com', 'courvillenursery.com',
  'curenursery.com', 'carnivorousplantresource.com', 'budburst.org', 'translate.google.com', 'translate.goog',
  'grokipedia.com', 'viedujardin.fr', 'useyardwork.com', 'ontosight.ai', 'picturethisai.com', 'myplantin.com', 'plantsnap.com', // (AI)
  'gardenology.org', 'irises.org', 'pacificbulbsociety.org', 'eddmaps.org', 'zenodo.org', // (wikis, forums, sightings, uploads)
  'alibaba.com', 'homesteadgear.com', 'kaooriginal.com', 'loreal.com', // (a marketplace; not plant references)
  'keyblossom.com', 'florgeous.com', 'gardeningbrain.com', 'levelupgarden.com', 'plantcultivar.com', 'plantgeh.com', 'plantsucculents.com',
  'asucculent.com', 'carnivorousplantsguide.com', 'thegardenstyle.com', 'soildrops.com', 'growableground.com', // (AI-written or content farms)
  'plantnimals.com', 'naturalatlas.com', 'wikimili.com', 'floraofqatar.com', 'newyorkplantshq.com', // (copied from GBIF, Wikidata, Wikipedia, another nursery)
  'wikibooks.org', 'wikiversity.org', 'ecoregistros.org', // (anyone can edit; sightings)
  'gettyimages.com', 'alamy.com', 'digitalplantst.com', 'evergreenbotany.com', // (stock-media marketplaces; a likely fake shop, a dropshipper)
  'rosewoman.com', 'slohsexpressions.com', 'averbforkeepingwarm.com', 'americanfarm.com', 'mapro.com', 'mskcc.org', 'lecontelodge.com',
  'landmorphology.com', 'iomcworld.com', // (not plant references)
  // Found by the terms reviews of batch 3a (2026-10-27 night)
  '1millionideas.com', 'greencoverinitiative.com', 'archfoundation.org', 'minnetonkaorchards.com', 'rosesabc.com',
  'm-plantslib.com', // (content farms, AI-written or generated lists)
  'thesurvivalgardener.com', 'maplesociety.org', 'seedsheirloom.com', // (injected spam; a dropshipper with copied terms)
  'sciencephotogallery.com', 'cbo.io', // (print-on-demand and auction marketplaces)
  'growingfruit.org', 'floracarta.com', 'garden-en.com', // (forums and members' gardens)
  'artsandculture.google.com', 'books.google.com', 'ivydenegardens.co.uk', 'roses-are-red.org', // (re-hosted, copied or aggregated)
  'cornhillnursery.squarespace.com', // (the same site as cornhillnursery.com)
  'reco-cs.com', 'recoroatan.com', 'recostextiles.com', 'recov.co', 'spider-farmer.com', 'recon-us.com', 'biobased-diesel.com',
  'carlisleschesapeake.com', // (not plant references)
  // Found by the terms reviews of batch 3b (2026-10-27 night)
  'improvemyhome24.com', 'florenzogarden.com', 'flowerslib.com', 'bestplants.com', 'plantisima.com', 'shuncy.com', // (content farms, AI-written)
  'encyclopedia.com', 'ritasgardenpath.com', // (republished reference works; USDA PLANTS retold)
  'vdict.com', 'gesneriads.info', 'plantae.org', // (user-edited or members' posts)
  'floraccess.com', // (a wholesale marketplace)
  'lapascalinette.com', 'lostcoastoutpost.com', 'surinenglish.com', 'stinehome.com', 'theshrimpfarm.com', 'caringsunshine.com', // (not plant references)
  // Found by the terms reviews of batch 4a (2026-10-28)
  'plantoscan.com', 'nargil.com', 'gardenfrontier.com', 'ehouseplant.com', 'wekivafoliage.com', // (content farms, AI-written)
  'floraneste.com', // (a spam shop)
  'aa.edu', // (not a plant reference)
  'horticopia.info', // (sells its plant database; asked to license it: not read until it answers)
  // Found by the terms reviews of batch 4b (2026-10-28)
  'plant-garden-secrets.com', 'dharaseeds.com', 'explorebioedge.com', // (content farms, AI-written)
  'botanical.com', 'eurekalert.org', // (republished reference works; press releases)
  'paperblog.com', 'steemit.com', // (members' posts, aggregated)
  'biocrick.com', // (not a plant reference)
  'jcraulstonarboretum.wordpress.com', // (NC State's arboretum: NC State is read through its own extractor)
  // Found by the terms reviews of batch 5a (2026-10-28)
  'pollinatorflowers.com', 'succulent.care', 'chlorobase.com', 'naturebring.com', // (content farms, AI-written: the first says so itself)
  'plantfyi.com', // (an aggregator of other databases, pages made by script)
  'wikidoc.org', 'wikis.evergreen.edu', // (user-edited wikis; the first borrows Wikipedia's wording)
  'horti.co.za', // (a marketplace)
  // Found by the terms reviews of batch 5b (2026-10-28)
  'theplantindex.com', 'whatflower.net', 'loamapp.uk', 'botanicmate.com', 'bloomingexpert.com', 'calatheaessentials.com', 'bovees.com', 'garden.eco', // (content farms, AI-written or generated: two say so themselves)
  'plantversus.com', // (Wikipedia and other databases, retold by script)
  'mail-archive.com', 'blogs.ubc.ca', // (members' posts, personal blogs)
  'plusgarden.com', 'digitaltowns.app', // (marketplaces)
  '947qdr.com', // (not a plant reference)
  // Found by the terms reviews of batch 6a (2026-10-28)
  'caudexgarden.com', 'smartgardenadvice.com', // (content farms, AI-written)
  'vegeworx.com', 'diy.org', // (members' uploads)
  'silene.eu', // (a sightings aggregator)
  'gulfofme.com', // (not a plant reference)
  // Found by the terms reviews of batch 6b (2026-10-28)
  'bloomseye.com', 'onestopgardenshopco.org', 'nurseryplant.net', // (AI-written: the first says so itself; the last a dropship shop)
  'exoticseedemporium.com', // (its own disclaimer says it carries others' content)
  'palmstreet.app', 'plant-central.de', // (marketplaces)
  'hicattle.org', 'herbpathy.com', 'ijbpas.com', // (not plant references)
  // Found by the terms reviews of batch 7a (2026-10-28)
  'intuitiveplants.org', 'natesgardensupply.com', // (AI-written; a dropship shop of suppliers' listings)
  'istockphoto.com', // (a stock-media marketplace)
  'thesitegardener.com', // (a web agency for nurseries: demo and client copy)
  'plantlust.com', // (a marketplace: nurseries list their stock there and its descriptions are theirs; 2026-10-28)
  // Found by the terms reviews of batch 7b, first quarter (2026-10-28)
  'livetoplant.com', 'rose-bushes.com', // (content farms, AI-written)
  'plantmark.com.au', 'invasivespeciesinfo.gov', // (aggregators of others' stock or resources)
  'tjhsst.edu', 'loveandrenovations.com', 'oharaikebanacolumbus.com', // (a high school's pages; not plant references)
  // Found by the terms reviews of batch 7b, second quarter (2026-10-28)
  'ngb.org', // (a trade association's pages of its member breeders' own copy: second-hand)
  'seedsplantworld.com', // (a dropship-style shop: unfilled template terms, marketplace reviews)
  'themeaningofwater.com', // (not a plant reference)
  // Found by the terms reviews of batch 8, first quarter (2026-10-28)
  'fann.org', 'teratrees.com', // (a directory of member nurseries' stock; a crowdfunding marketplace)
  'gardentaining.com', 'theglorifiedtomato.com', 'indohobby.com', // (an empty WordPress shell; a revived blog with spun posts; a spam-abused pet shop)
  'juniperpublishers.com', // (a publisher on predatory-journal lists: not a reliable source)
  // Found by the terms reviews of batch 8, second quarter (2026-10-28)
  'newworldencyclopedia.org', 'bugwoodcloud.org', // (a Wikipedia fork; Bugwood's content host)
  'plant.garden', // (a directory built from users' submissions and other databases)
  'letplant.com', // (an AI plant-care app: generated pages)
  // Found by the terms reviews of batch 8, third quarter (2026-10-28)
  'expoplant.com', // (a marketplace: wholesalers' and gardeners' storefronts, classified ads)
  // Found by the terms reviews of batch 8, last quarter (2026-10-28)
  'agronom.info', 'homeandgardensforless.com', 'pottedhaven.com', // (a price aggregator; dropship storefronts of others' stock)
  'nwaplantsinc.com', // (its plant text is Wikipedia's, word for word)
  'plantsinsights.com', 'perunorth.com', // (a blog turned to casino spam; a travel agency)
  // Found by the terms reviews of batch 9, first quarter (2026-10-28)
  'floriscope.io', 'nationwideplants.com', // (a portal of growers' catalogues; a drop-ship reseller)
  'sjgbloom2012.wordpress.com', // (pastes other sites' descriptions)
  'towerlandscapedesign.com', // (a repurposed domain: generic SEO posts)
  // Found by the terms reviews of batch 9, second quarter (2026-10-28)
  'usagardenhub.com', 'theplantdb.com', // (an AI content farm; a template shop with a copied plant list)
  'smartseedsemporium.com', 'vitegreenhouses.com', // (a reseller of others' seed packets; plant pages built from breeders' information)
  'bananas.org', 'hcpid.weebly.com', // (a forum; a class's plant-ID study list)
  // Found by the terms reviews of batch 9, third quarter (2026-10-28)
  'thegardengeeks.com', 'urbanorganicyield.com', 'hptagile.com', // (template and affiliate content sites; an off-topic coaching site)
  'gogardennow.com', 'livesgarden.com', 'ftd.com', // (drop-ship resellers; a florists' order relay)
  'boydnursery.net', // (an unfinished shop template)
  // Found by the terms reviews of batch 9, last quarter (2026-10-28)
  'bidscape.com', 'victorynursery.us', // (a plant auction marketplace; a sourcing reseller)
  'horticopia.net', // (Horticopia itself: a rented plant database and image library, as horticopia.info)
  'succulentgardenweb.com', 'twogreenthumbs.com', // (an AI-written content farm; content "compiled mainly from various sources")
  // Found by the terms reviews of batch 10, first quarter (2026-10-28)
  'theleafjournal.com', 'plantsforallseasons.co.uk', 'plantspatio.com', // (AI-written how-tos and product copy; an unfilled template store)
  '1800flowers.com', 'fondazioneslowfood.com', // (a florists' order relay; a food foundation's publicly nominated entries)
  'pollenlibrary.com', // (county maps from BONAP)
  // Found by the terms reviews of batch 10, second quarter (2026-10-28)
  'catskillnativenursery.shop', 'greenpacks.org', 'gardeningtipsandtools.com', 'rosapedia.com', 'windrivergreens.com', // (spam and AI-written sites)
  'poshmark.com', 'foodplace.info', // (a resale marketplace; a forum)
  'plantsrose.com', 'fast-growing-plant.com', 'spotswoodgreenery.com', 'theteamfamily.com', // (drop-ship and template stores)
  // Found by the terms reviews of batch 10, third quarter (2026-10-28)
  'e-katalogroslin.pl', 'researcher.life', // (aggregators: a nurserymen's association's members' stock; others' papers with AI summaries)
  'garten-de.com', 'ohgarden.se', // (crowd-sourced: members' entries; users' plant profiles)
  'tiempodesanjuan.com', 'middendorf-funeralhome.com', // (a news site; a funeral home's florist shop)
  // Found by the terms reviews of batch 10, last quarter (2026-10-28)
  's4shops.com', 'clarity-connect.com', // (a demo-store host; a web vendor's development copies of client shops)
  'areverenceforroses.com', 'hometuary.com', 'spnanyc.org', // (spam; AI-written lifestyle copy; a neighborhood association)
  'mossvalepark.com', // (its catalogue text is Wikipedia's, by its own terms)
  'hytiva.com', // (a cannabis marketplace)
  // Found by the terms reviews of the spacing round, batch 1 (2026-10-29)
  'mynzagric.com', 'greeneryinside.com', 'guyabouthome.com', 'treestopsecrets.com', 'gardenesign.com', 'cultivatingflora.com', // (AI-written)
  'gardenbagan.com', 'smartgardenguru.com', 'theyieldgrid.com', 'viridia.pro', 'ocelot-ocelot-7ha5.squarespace.com', // (AI-written)
  'microveggy.com', 'buzztum.com', 'decorexpro.com', 'ehow.com', 'bhg.com.au', 'ai-plantfinder.com', // (content farms; AI content by their own notices)
  'allmyfriendsareflowers.com', 'winefrog.com', // (spam: taken over by gambling links)
  'livingleafplant.com', 'grasssow.com', 'plantseedworld.com', 'trendoli.com', // (dropship or copied storefronts)
  'plantistrylabs.com', 'lawn.com.au', 'zoominfo.com', // (marketplaces; a company-data aggregator)
  'ala.org.au', 'allasiatcn.org', 'oclc.org', 'plantory.ai', // (aggregators: GBIF's Australian node, a herbarium portal, a library host, Trefle's data)
  'permaplans.com', 'gardenscheme.com', 'monstera-app.com', 'gardenersnavigator.com', // (other apps' compiled plant lists; answers compiled from extension)
  'homeopathinfo.com', 'lifeasible.com', 'candaceshaw.net', 'saartillery.wordpress.com', 'fairwaystyles.com', 'dmt-nexus.me', // (not plant sources)
  // Found by the terms reviews of the spacing round, batch 2 (2026-10-29)
  'fruitandgarden.com', 'gardeningflow.com', 'thepracticalplanter.com', 'louistheplantgeek.com', 'perennialplants.com', // (AI-written)
  'sciotogardens.com', // (spam injected into its home page)
  'timergarden.com', 'pureplantseed.com', // (dropship or affiliate storefronts)
  'bloompots.com', 'leaftide.com', // (other apps' compiled plant lists)
  'biogator.org', 'nbnatlas.org', 'marinespecies.org', // (aggregators: a campus species portal, the UK's records atlas, a marine names register)
  'nationalchampiontree.org', // (record trees, one each: not a species' size)
  'bruns.de', // (its plant reference is for registered trade buyers: ask first)
  'fishlaboratory.com', 'aquanswers.com', 'blackhillwoods.ca', 'rootbuyer.com', // (not plant sources: aquariums, tea, a root buyer)
  // Archives, caches and aggregators: never second-hand (docs/catalog-sources.md)
  'archive.org', 'archive.ph', 'archive.today', 'archive.is', 'archive.li', 'archive.vn', 'archive.md', 'webcitation.org', 'cachedview.nl',
  'googleusercontent.com', 'commoncrawl.org', 'trefle.io', 'gbif.org', 'plantnet.org', 'identify.plantnet.org', 'openfarm.cc', 'pfaf.org',
  'plantsinusa.com', 'en-academic.com', 'dbpedia.org', 'rootfast.org', // (USDA PLANTS, GBIF, Wikipedia, ASPCA, retold)
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
  'provenwinnersplants.com': 'provenwinners.com', // (the brand's EU site, ColorChoice Plants EU)
  // (Walters Gardens and Spring Meadow grow for the Proven Winners brand but are companies of their own, with their own
  // sites and terms: each its own source, credited as itself. Copy they share with the brand's pages counts once by
  // its text, as any shared copy does. 2026-10-28.)
  'monrovia.com': 'monrovia.com', 'firsteditionsplants.com': 'firsteditionsplants.com', 'baileynurseries.com': 'firsteditionsplants.com',
  'endlesssummerblooms.com': 'firsteditionsplants.com', 'bloomineasy.com': 'bloomineasy.com', 'southernlivingplants.com': 'southernlivingplants.com',
  'encoreazalea.com': 'plantdevelopmentservices', 'plantdevelopment.com': 'plantdevelopmentservices',
  // (GardenSoft's plant database, rented by water utilities: their plant pages say © GardenSoft. Seen 2026-10-28.)
  'watersavingplants.com': 'gardensoft', 'watersmartgardening.com': 'gardensoft', 'reddingwatersmart.com': 'gardensoft',
  'fresnogardening.org': 'gardensoft', 'bayareagardening.org': 'gardensoft', 'ashlandsaveswater.org': 'gardensoft',
  'elpasodesertblooms.org': 'gardensoft', 'waterwisegardeningsb.org': 'gardensoft', 'hillsborogardening.org': 'gardensoft',
  'slcgardenwise.com': 'gardensoft', 'trivalleywaterwise.com': 'gardensoft', 'ocplants.org': 'gardensoft',
  // (One Hungarian grower's shop, machine-translated under local names: one source. Seen 2026-10-28.)
  'pharmarosa.be': 'pharmarosa', 'pharmarosa.co.uk': 'pharmarosa', 'pharmarosa.es': 'pharmarosa', 'pharmarosa.nl': 'pharmarosa',
  'pharmarosa.ro': 'pharmarosa', 'pharmarosaneonatal.it': 'pharmarosa',
};
/** The source a site counts as (one company's sites are one). */
export const sourceOf = (host) => { const site = siteOf(host); return COMPANY[site] ?? termsKey(host); };
/**
 * What kind of source a URL is: 'authority', 'nursery', 'blog', or 'skip'. `html` helps tell a shop from a
 * blog; with `plant`, a page counts as a nursery's only where it sells that plant (a blog with a shop for its
 * books, or a landscaper's, is still a blog for that page).
 */
export function siteKind(url, html = '', plant = null) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'skip'; }
  const site = siteOf(host);
  if (SKIP_SITES.has(site) || SKIP_SITES.has(host)) return 'skip';
  if (/\/~/.test(new URL(url).pathname)) return 'blog'; // (a person's own pages on a university's site)
  if (/\.(edu|gov)$/.test(site) || /\.gov\.\w+$/.test(host) || AUTHORITY_SITES.has(site) || AUTHORITY_SITES.has(host)) return 'authority';
  // A shop: a cart, or a product with an offer marked up for search engines. (Prices alone could be a blog's affiliate links.)
  const page = html.slice(0, 600000);
  if (!/add to cart|add-to-cart|addtocart|\/cart\/add|"@type"\s*:\s*"(?:Product|Offer)"|itemtype="https?:\/\/schema\.org\/(?:Product|Offer)"/i.test(page)) return 'blog';
  return !plant || sellsPlant(url, page, plant) ? 'nursery' : 'blog';
}
/** Whether this page is the shop's page for the plant: a product page (by its markup or address) naming it. */
function sellsPlant(url, html, plant) {
  const words = [plant.species?.split(' ')[0], plant.cultivar, ...(plant.common ?? '').split(/[\s'’]+/).filter((w) => w.length > 4)].filter(Boolean).map((w) => w.toLowerCase());
  const names = (s) => words.some((w) => s.toLowerCase().includes(w));
  // A product's own name in its markup ("@type": "Product", "name": "…").
  for (const m of html.matchAll(/"@type"\s*:\s*"Product"[\s\S]{0,2000}?"name"\s*:\s*"([^"]{1,200})"|"name"\s*:\s*"([^"]{1,200})"[\s\S]{0,2000}?"@type"\s*:\s*"Product"/gi)) if (names(m[1] ?? m[2])) return true;
  if (/<meta[^>]+property="og:type"[^>]+content="product"/i.test(html) && names(headline(html))) return true;
  return /\/[\w-]*(?:products?|shop|plants?|store|catalog|perennials?|shrubs?|trees?|natives?)[\w-]*\//i.test(new URL(url).pathname) && names(headline(html));
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
/** A title about several plants: a list, a comparison, a genus. */
const LIST_CUE = /\bbest\b|\btop \d|\b\d+ (?:best|great|favorite|easy|native)\b|\bvarieties\b|\bcultivars\b|\btypes of\b|\bvs\.?\b|\band more\b|\bspecies\b|\bcollection\b/;
const SEP = String.raw`(?:^|$|\s*[|–—:,;()\/]\s*|\s+-\s+)`;
const GENERIC = ['tree', 'trees', 'shrub', 'shrubs', 'plant', 'plants', 'perennial', 'perennials', 'grass', 'fern', 'vine', 'bush', 'seeds', 'seed', 'native'];
/** Whether `name` stands on its own in the headline: only separators, generic words, or the allowed words around it. */
function standsAlone(head, name, allowed) {
  const ok = [...new Set([...GENERIC, ...allowed])].map(esc).join('|');
  return new RegExp(String.raw`(?:^|[|–—:,;()\/]|\s-\s)\s*(?:(?:${ok})\s+)*['"]?${esc(name)}['"®™]*(?:\s+(?:${ok}))*\s*(?:$|[|–—:,;()\/]|\s-\s)`).test(head);
}
/**
 * Whether a page is about this plant, not one beside it (a wrong value is
 * worse than a missing one, so when in doubt it isn't):
 * - a cultivar: its name standing on its own in the page's title or main
 *   heading ("Magnus" isn't "Magnus Superior"), with its genus on the page;
 * - a species: its botanical name, or its common name, standing on its own
 *   in the title or heading, its botanical name on the page not as the start
 *   of a cultivar or form ('Forest Pansy', alba, f., var.), and no cultivar
 *   named in the title.
 * Never a page whose title is about several plants.
 */
export function aboutPlant(html, text, { species, cultivar, common = '' }) {
  const head = headline(html), t = norm(text);
  if (LIST_CUE.test(head)) return false;
  const [genus, epithet] = norm(species).split(' ');
  const commonWords = norm(common).replace(/\([^)]*\)|'[^']*'/g, ' ').split(/[^a-z-]+/).filter((w) => w.length > 2);
  if (cultivar) return standsAlone(head, norm(cultivar), [genus, epithet ?? '', ...commonWords]) && t.includes(genus);
  if (CULTIVAR_MARK.test(head)) return false;
  const sp = norm(species);
  // On the page as written (case kept, one line at a time): the name followed by a quote, a capitalized
  // name, var./subsp./f., or a form's epithet is a cultivar's or form's name, not the species'.
  const lines = String(text).replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const FORMS = 'alba|albus|albiflora|rubra|rosea|pendula|nana|compacta|variegata|plena|aurea|atropurpurea|forma';
  const bare = new RegExp(`${esc(species).replace(/ /g, '[ \\t]+')}(?![ \\t]*(?:['"]|var\\.|subsp\\.|ssp\\.|f\\.|×|x[ \\t]|(?:${FORMS})\\b))`, 'i');
  const ok = lines.split('\n').some((l) => { const m = bare.exec(l); return !!m && !/^[ \t]+[A-Z]/.test(l.slice(m.index + m[0].length)); });
  if (!ok) return false;
  const commonName = norm(common).replace(/\s*\([^)]*\)|\s*'[^']*'/g, '').trim();
  return standsAlone(head, sp, []) || (commonName.length > 3 && standsAlone(head, commonName, []));
}

// (A number may start at its decimal point: Sylvan Gardens writes ".25 - .50'", which read as 50 ft until Jason
// caught it, Oct 29.)
const NUM = String.raw`(\d*\.\d+|\d+(?:\.\d+)?(?:\s*\d\/\d)?|\d\/\d)`;
const toNumber = (s) => {
  const m = /^(\d+)?\s*(?:(\d)\/(\d))?$/.exec(s.trim());
  if (m && (m[1] || m[2])) return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
  return Number(s);
};
// (Typographic marks too: 18″ and 3′, or a curly 18” and 3’, as many shops write them.)
const UNIT = String.raw`(feet|foot|ft\.?|'|’|′|inches|inch|in\.?|"|”|″)`;
/** "3-4 ft", "36-48 in", "3' to 5'", "6 in to 2 ft", "18-24\"" → { min, max } feet. */
export function sizeIn(text) {
  if (/\b(pots?|containers?|gallons?|gal\.?|quarts?|qt\.?|plugs?|liners?|trays?)\b|#\d/i.test(text)) return null; // (what it's sold in)
  if ((text.match(new RegExp(String.raw`${NUM}\s*${UNIT}?\s*(?:(?:-|–|to)\s*${NUM}\s*)?${UNIT}`, 'gi')) ?? []).length > 1) return null; // (more than one size: at 10 years, at maturity…)
  const m = new RegExp(String.raw`${NUM}\s*${UNIT}?\s*(?:(?:-|–|to)\s*${NUM}\s*)?${UNIT}`, 'i').exec(text);
  if (!m) return null;
  const feet = (x, unit) => (/^(inches|inch|in\.?|"|”|″)$/i.test(unit) ? x / 12 : x);
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
// (Oct 29, the facts Jason agreed to gather: how far apart to plant, whether the leaves stay, the fall color.)
const SPACING_RE = /^(?:recommended\s+|plant(?:ing)?\s+)?spacing\b|^space\s+plants\b|^planting\s+distance/i;
const FOLIAGE_RE = /^foliage(?:\s+type)?(?=\s*:|\s*$)|^leaf\s+retention|^(?:evergreen\s*(?:\/|or)\s*deciduous|deciduous\s*(?:\/|or)\s*evergreen)/i;
const FALL_RE = /^(?:fall|autumn)\s+(?:foliage\s+|leaf\s+)?colou?rs?|^fall\s+foliage/i;
const ANY_LABEL = [ZONES_RE, HEIGHT_RE, WIDTH_RE, LIGHT_RE, BLOOM_RE, COLOR_RE, DEER_RE, SPACING_RE, FOLIAGE_RE, FALL_RE];
const looksLikeLabel = (l) => /:\s*$/.test(l) || ANY_LABEL.some((re) => { const m = re.exec(l); return m && !l.slice(m[0].length).trim(); });

const zonesOf = (v) => {
  if (/°|degrees?\b|\d\s*f\b/i.test(v)) return null; // (a temperature, not a zone)
  // A list of half-zones ("5a, 5b, 6a … 9b"), as NC State and Proven Winners write them.
  if (/^\s*\d{1,2}[ab](\s*,\s*\d{1,2}[ab])+\s*$/i.test(v)) return halfZones(v.replace(/\s+/g, '').toLowerCase());
  const m = /^\D{0,12}(\d{1,2}\s*[ab]?)\s*(?:-|–|to|through|thru)\s*(\d{1,2}\s*[ab]?)\b/i.exec(v);
  return m ? zoneSpan(m[1].replace(/\s/g, ''), m[2].replace(/\s/g, '')) : null;
};
/** Whether a value is only words from a vocabulary (and "to", "and", "or"): anything else, a qualifier or a sentence, and it isn't read. */
const onlyWords = (v, vocab) => { const w = v.toLowerCase().split(/[^a-z]+/).filter(Boolean); return w.length > 0 && w.every((x) => vocab.has(x) || ['to', 'and', 'or', 'through', 'thru', 'into'].includes(x)); };
const SUN_WORDS = new Set(['full', 'sun', 'part', 'partial', 'shade', 'light', 'dappled', 'morning', 'afternoon', 'deep', 'dense', 'half', 'filtered', 'sunny', 'shady']);
const sunOf = (v) => {
  if (!onlyWords(v, SUN_WORDS)) return null; // ("not full sun", "shade tolerant", "except in the South…": left out)
  let t = v.toLowerCase().replace(/\b(part(?:ial)?)-(sun|shade)\b/g, '$1 $2'); // ("Sun/part-shade")
  if (/morning sun/.test(t) && /afternoon shade/.test(t)) t = t.replace(/morning sun|afternoon shade/g, ' part shade ');
  const got = SUNS.filter(([re]) => re.test(t)).map(([, x]) => x);
  if (/\b(?:part|partial)\b(?!\s*(?:sun|shade))/.test(t)) got.push('Part'); // ("Partial, Shade")
  if (/\bfull\b(?!\s*shade)/.test(t)) got.push('Full'); // ("Full to Partial", "Full, Partial", "Full – Part": in a sun field, "full" is full sun)
  if (/^\s*sun\b/.test(t) || /\bsun to\b/.test(t) || /(?:^|,\s*)sun(?:\s*,|$)/.test(t)) got.push('Full'); // ("sun", "sun to part shade", "Sun Part Shade": a sun field's leading "sun" is full sun)
  // "shade" on its own, once the part-shade phrases are out of the way.
  if (/\bshade\b/.test(t.replace(/part(?:ial)? shade|light shade|half[- ]shade|dappled shade|afternoon shade|filtered shade/g, ' '))) got.push('Shade');
  const order = ['Full', 'Part', 'Shade'].filter((x) => got.includes(x));
  return order.length ? { most: order[0], least: order[order.length - 1] } : null;
};
const SEASON_WORDS = new Set(['early', 'mid', 'late', 'spring', 'summer', 'midsummer', 'fall', 'autumn', 'winter']);
/** Bloom seasons only: months differ by place (they wait on "values by region"), and "may" is also a word. */
const bloomOf = (v) => {
  if (!onlyWords(v, SEASON_WORDS)) return null; // ("Spring (fall foliage color)": left out)
  const b = v.toLowerCase();
  const ss = [...new Set(SEASONS.filter((x) => new RegExp(`\\b${x}\\b`).test(b)).map((x) => (x === 'autumn' ? 'fall' : x.replace(/^(early |mid |late )|mid ?/, ''))))];
  return ss.length ? ss : null;
};
const COLORS = ['white', 'pink', 'red', 'purple', 'lavender', 'violet', 'blue', 'yellow', 'orange', 'green', 'cream', 'maroon', 'burgundy', 'magenta', 'rose', 'coral', 'peach', 'gold'];
const COLOR_WORDS = new Set([...COLORS, 'light', 'dark', 'pale', 'deep', 'bright', 'soft', 'creamy', 'pinkish', 'purplish', 'bluish', 'reddish', 'yellowish']);
const colorOf = (v) => {
  if (!onlyWords(v, COLOR_WORDS)) return null; // ("White; red stems": left out)
  const cs = v.match(new RegExp(`\\b(${COLORS.join('|')})\\b`, 'gi'));
  return cs ? [...new Set(cs.map((c) => c[0].toUpperCase() + c.slice(1).toLowerCase()))] : null;
};
/** How far apart to plant: a size with its unit; not a count a square foot, nor a calculator's prompt. */
const spacingOf = (v) => (/\/\s*sq|per\s+sq|calculat|on\s+cent(?:er|re)s?\s+of/i.test(v) ? null : sizeIn(v.replace(/\s*(?:apart|on\s+cent(?:er|re)s?|o\.?\s?c\.?)\s*$/i, '')));
const FOLIAGE_WORDS = new Set(['evergreen', 'deciduous', 'semi', 'semievergreen', 'broadleaf', 'broad', 'leaf', 'needled', 'needle']);
/** Whether its leaves stay: only words for that ("Deciduous", "Broadleaf evergreen", "Semi-evergreen"). */
const foliageOf = (v) => {
  if (!onlyWords(v, FOLIAGE_WORDS)) return null; // ("Green", "Not evergreen in zone 6", "Deciduous; evergreen in the South": left out)
  const t = v.toLowerCase();
  if (/semi[- ]?evergreen/.test(t)) return 'semi-evergreen';
  const e = /evergreen/.test(t), d = /deciduous/.test(t);
  return e && d ? 'semi-evergreen' : e ? 'evergreen' : d ? 'deciduous' : null;
};
/** A fall color, in the catalog's words (src/catalog.ts FALL_COLORS). */
const FALL_WORD = { yellow: 'gold', gold: 'gold', golden: 'gold', red: 'red', scarlet: 'red', crimson: 'red', burgundy: 'red', maroon: 'red', orange: 'orange', purple: 'purple', bronze: 'copper', copper: 'copper', russet: 'copper', pink: 'pink' };
const FALL_EXTRA = new Set(['bright', 'deep', 'brilliant', 'reddish', 'yellowish', 'orangish', 'purplish', 'with', 'shades', 'of', 'tones', 'hues']);
const fallOf = (v) => {
  const w = v.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (!w.length || !w.every((x) => FALL_WORD[x] || FALL_EXTRA.has(x) || ['to', 'and', 'or', 'through', 'into'].includes(x))) return null; // ("No color change", "Insignificant": left out)
  const cs = [...new Set(w.map((x) => FALL_WORD[x]).filter(Boolean))];
  return cs.length ? cs : null;
};
const deerOf = (v) => (/^(yes|high|resistant|very resistant|true)$/i.test(v.trim()) ? 'Resistant' : null); // (exactly: "Yes, but browsed when young" isn't)

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
  // A size line with no label: "2' tall x 1.5-2' wide" (US Perennials), read only where no labeled line gives the size.
  if (!h && !w) { const tw = tallWide(lines); if (tw) { out.height = tw.height; out.width = tw.width; } }
  const sun = read(LIGHT_RE, sunOf); if (sun) out.sun = sun;
  const bl = read(BLOOM_RE, bloomOf); if (bl) out.bloomSeasons = bl;
  const c = read(COLOR_RE, colorOf); if (c) out.flowerColor = c;
  const d = read(DEER_RE, deerOf); if (d) out.deer = d;
  const sp = read(SPACING_RE, spacingOf); if (sp) out.spacing = sp;
  const fo = read(FOLIAGE_RE, foliageOf); if (fo) out.foliage = fo;
  const fc = read(FALL_RE, fallOf); if (fc) out.fallColors = fc;
  return out;
}

/**
 * A page's one short line giving both sizes, "2' tall x 1.5-2' wide" or "3-4 ft. high by 2 ft. wide": its height and
 * spread, where the page has exactly one such line (a shop listing several plants has several, and isn't read).
 */
export function tallWide(lines) {
  const re = /^\s*(.{1,30}?)\s*(?:tall|high)\s*(?:x|×|by|and|,)\s*(.{1,30}?)\s*(?:wide|spread|across)\b/i;
  const found = new Map();
  for (const l of lines) {
    if (l.length > 70) continue;
    const m = re.exec(l);
    if (!m) continue;
    const height = sizeIn(m[1]), width = sizeIn(m[2]);
    if (height && width) found.set(JSON.stringify([height, width]), { height, width });
  }
  return found.size === 1 ? [...found.values()][0] : null;
}
/** Sources closed to us that a page says it draws on: then the page is that source, second-hand, and isn't read. */
const SECOND_HAND = /missouri botanical garden|missouribotanicalgarden|mobot\.org|\bmobot\b|kemper center|lady bird johnson|wildflower\.org|\bnpin\b|native plant information network/i;
/** Checked on the page as sent, links included: a source credited only by a link is still the source. */
/** Other sources closed to us, when a page credits them ("Source: Calscape"), or links them as its source. */
const CREDITED = /(?:source|sources|from|courtesy of|via|according to|data|information|adapted)[^.<\n]{0,40}(?:prairie ?moon|calscape|dave'?s garden|garden\.org|national gardening association|sunset western|perenual|garden ?tags|morton arboretum|go ?botany|native plant trust|calflora|jepson|seinet|oregonflora|plant ?atlas)/i;
/**
 * Plant databases sold to the sites that show them (GardenSoft to water utilities, NetPS Plant Finder to garden
 * centres, Horticopia): a page carrying one is that database, and isn't read until the database's own terms are
 * (2026-10-28; docs/catalog-sources.md "Never second-hand").
 */
const LICENSED = /\bgardensoft\b|\bnetps\b|\bhorticopia\b/i;
export const secondHand = (html) => SECOND_HAND.test(String(html)) || LICENSED.test(String(html)) || CREDITED.test(plainText(html));

/** A page's own wording, to tell copies apart: the hash of its longest paragraph (null if it has none long enough). */
export function copyKey(html) {
  const paras = [...String(html).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  const longest = paras.sort((a, b) => b.length - a.length)[0];
  return longest && longest.length >= 120 ? createHash('sha256').update(longest).digest('hex').slice(0, 16) : null;
}

/**
 * Countries, by their web domain, south of the equator (all or mostly): their seasons are the other way round
 * (spring is September to November in Adelaide), so a site there says nothing of when a plant blooms here.
 */
const SOUTHERN = new Set(['au', 'nz', 'za', 'ar', 'cl', 'uy', 'py', 'br', 'bo', 'pe', 'na', 'bw', 'zw', 'mz', 'mg', 'ls', 'sz', 'fj']);
export const southernSite = (host) => SOUTHERN.has(String(host).toLowerCase().split('.').pop());
// ---------- Descriptions (2026-10-27) ----------
// A page's own paragraphs, read by the same rules as NC State's descriptions (prose.mjs), for what its spec lines
// don't say: leaves in winter, deer, self-sowing, spreading. A site's boilerplate (a paragraph on several of its pages:
// a shipping note, a related product's blurb) isn't the plant's.

/** A paragraph as a key, to tell repeats apart: its letters and digits. */
export const paragraphKey = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/**
 * A long sentence as a key (12 words or more): its last 12 words, so a how-to repeated across a site's pages matches
 * whatever heading the page runs into it ("Planting How-to : Pruning Flowering Shrubs It is necessary to prune …").
 */
export const sentenceKey = (t) => { const w = paragraphKey(t).split(' '); return w.length >= 12 ? `s:${w.slice(-12).join(' ')}` : null; };
/** A page's paragraphs, as text: its <p>s of 40 letters or more, outside its menus, header, footer, forms and comments. */
export function webParagraphs(html) {
  // (Readers' comments aren't the page's: everything from a blog's comments section on.)
  const page = String(html), comments = /<(?:div|section|ol|ul)\b[^>]*\b(?:id|class)="[^"]*\bcomments?(?:-area|-list|list|-section)?\b[^"]*"/i.exec(page);
  const body = (comments ? page.slice(0, comments.index) : page).replace(/<(script|style|noscript|svg|template|nav|header|footer|form|button|select|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  return [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => plainText(m[1]).trim()).filter((t) => t.length >= 40);
}
/** A labeled line inside a paragraph: "Evergreen or Deciduous: Deciduous", "Foliage: Semi-evergreen". */
const LEAF_LABEL = /\b(?:evergreen or deciduous|evergreen\s*\/\s*deciduous|deciduous\s*\/\s*evergreen|foliage(?: type)?|leaf (?:retention|persistence))\s*:\s*(semi-evergreen|evergreen|deciduous)\b/i;
/**
 * What a page's description says, as claims, for the facts its spec lines (`fields`) don't give. `boilerplate`: the
 * paragraph keys repeated across its site, and its long sentences repeated (reclaim.mjs), left out. A labeled
 * "Evergreen or Deciduous: X" is the page's field, not prose.
 */
export function webProseClaims(html, plant, base, fields = {}, boilerplate = new Set()) {
  const paras = webParagraphs(html).filter((t) => !boilerplate.has(paragraphKey(t)));
  const names = [plant.species, plant.common, plant.cultivar].filter(Boolean);
  const out = [];
  const label = paras.map((t) => LEAF_LABEL.exec(t)).find(Boolean);
  if (label) out.push({ ...base, fact: 'foliage', v: label[1].toLowerCase() });
  const list = paras.map((t) => t.replace(new RegExp(LEAF_LABEL.source, 'gi'), ' ')).flatMap((t) => sentences(t)).filter((t) => !boilerplate.has(paragraphKey(t)) && !boilerplate.has(sentenceKey(t)));
  const read = [['foliage', foliageFromProse], ['deer', deerFromProse], ['self_seed', seedFromProse], ['habit', habitFromProse]];
  for (const [fact, from] of read) {
    if ((fact === 'foliage' && label) || (fact === 'deer' && fields.deer)) continue;
    const r = from(list, names);
    // (With the page it was read from, for the second reading: second-reading.mjs.)
    if (r) out.push({ ...base, fact, v: r.v, says: r.says, prose: true, page: { key: `web:${base.url}`, names, sentences: list } });
  }
  return out;
}

/**
 * A page's spec lines and description as claims, for one plant. (Facts that differ by place, bloom months above all,
 * aren't taken from the web.) `boilerplate`: its site's repeated paragraphs (reclaim.mjs), left out of its description.
 */
/**
 * Fields a site gives that aren't what the catalog's fact means, kept at a nursery's weight (decided with Jason,
 * 2026-10-29): they confirm a value or show as its alternate, but never lead over a source that gives the fact itself.
 * - The University of Arizona Campus Arboretum's sizes are picked from a short menu of ranges, often the same for
 *   height and width ("Height: 20 - 50 feet, Width: 20 - 50 feet"): bins, not measured sizes.
 * - Arkansas Extension's plant database gives "Exposure" as the best spot, its text often saying the plant takes more
 *   (clethra: "partial sun", while "they will grow in full sun"): not the range the sun facts are. (Reading the
 *   range from its text instead is on the Backlog.)
 */
export const FIELDS_AS_REPORTED = [
  { url: /^https?:\/\/apps\.cals\.arizona\.edu\/arboretum\//, facts: ['height', 'width'] },
  { url: /^https?:\/\/(?:www\.)?uaex\.uada\.edu\/yard-garden\/resource-library\/plant-database\//, facts: ['sun_most', 'sun_least'] },
];
/** A claim from a page's field, at a nursery's weight where FIELDS_AS_REPORTED says the field isn't the fact itself. */
export function asReported(c) {
  if (c.kind !== 'authority' || c.from === 'description') return c;
  return FIELDS_AS_REPORTED.some((r) => r.url.test(c.url) && r.facts.includes(c.fact)) ? { ...c, kind: 'nursery' } : c;
}

export function webClaims(url, html, plant, { boilerplate } = {}) {
  const kind = siteKind(url, html, plant);
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
  if (f.bloomSeasons && !southernSite(new URL(url).hostname)) c.push({ ...base, fact: 'bloom_season', v: f.bloomSeasons });
  if (f.flowerColor) c.push({ ...base, fact: 'flower_color', v: f.flowerColor });
  if (f.deer) c.push({ ...base, fact: 'deer', v: f.deer });
  if (f.spacing) c.push({ ...base, fact: 'spacing', v: f.spacing });
  if (f.foliage) c.push({ ...base, fact: 'foliage', v: f.foliage });
  if (f.fallColors) c.push({ ...base, fact: 'fall_colors', v: f.fallColors }, { ...base, fact: 'fall_color', v: true });
  c.push(...webProseClaims(html, plant, base, f, boilerplate));
  return c.map(asReported);
}

// ---------- Terms ----------
// The same reading as docs/catalog-sources.md "How terms are read", done by
// pattern for sites found by search, cautiously: a site whose terms page
// can't be told apart from a ban is treated as banning.

// Hosts where each subdomain is a different owner (the Public Suffix List doesn't split them all).
const SHARED_HOSTS = new Set(['wordpress.com', 'blogspot.com', 'weebly.com', 'godaddysites.com', 'mystrikingly.com', 'jimdofree.com', 'webs.com',
  'substack.com', 'medium.com', 'tumblr.com', 'wixsite.com', 'squarespace.com', 'square.site', 'myshopify.com', 'business.site', 'sites.google.com', 'google.com',
  'neocities.org']);
/** Whose terms a host is under: its site, or on a shared host the host itself. */
export function termsKey(host) {
  const h = String(host).toLowerCase().replace(/\.+$/, '');
  const site = siteOf(h);
  if (h.startsWith('sites.google.com')) return h;
  return SHARED_HOSTS.has(site) ? h : site;
}
/** Platforms whose own terms show up in footers (reCAPTCHA, payments): not the site owner's. */
const PLATFORMS = /(?:^|\.)(?:google|gstatic|recaptcha|paypal|shopify|shop\.app|apple|facebook|instagram|klaviyo|yotpo|affirm|afterpay|klarna|stripe|squareup|square|amazon|cloudflare|wix|squarespace|godaddy|bigcommerce|youtube|twitter|x|pinterest)\.(?:com|net|app|co)$/;
const TERMS_TEXT = /\bterms\b|conditions of (?:use|sale)|\blegal\b|copyright|\bpolicies\b|site polic|website polic|disclaimer|digital rights|licen[cs]e|acceptable use|(?:image|photo|content) use/;
const TERMS_PATH = /(?:^|[\/_-])(?:terms|tos|legal|conditions-of-use|copyright|policies|site-policies|disclaimer|licen[cs]e|acceptable-use)(?:[\/_.-]|$)/;
/** How much a link looks like the terms of use (not of sale or shipping). */
const termsRank = (text, path) => (/terms of (?:use|service)|terms (?:&|and) conditions|conditions of use|website terms|site terms|legal|copyright|user agreement|licen[cs]e|acceptable use/.test(text + ' ' + path.replace(/[-_\/]/g, ' ')) ? 2 : 0)
  - (/sale|shipping|guarantee|warranty|return|refund|reward|gift|loyalty|promo|sweepstake|contest|privacy|cookie/.test(text + ' ' + path) ? 1 : 0);
/** Places a site's terms usually live, to try when its home page links none, or links only terms of sale or shipping. */
export const TERMS_GUESSES = ['/terms', '/terms-of-use', '/terms-of-service', '/policies/terms-of-service', '/terms-and-conditions'];
/**
 * Links on a page that look like its terms, best first: on the same site,
 * or (when the link says so) the owner's terms on another site, never a
 * platform's own (reCAPTCHA's, a payment provider's). Quoted or unquoted
 * hrefs, names in the text or in aria-label; http read over https.
 */
export function termsLinks(html, pageUrl) {
  const base = new URL(pageUrl);
  const found = [];
  for (const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1];
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    if (!href) continue;
    const label = /\baria-label\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const text = norm(plainText(m[2]) + ' ' + (label ? label[1] ?? label[2] : '')).trim();
    let u;
    try { u = new URL((href[1] ?? href[2] ?? href[3]).replace(/&amp;/g, '&'), base); } catch { continue; }
    if (u.protocol === 'http:') u.protocol = 'https:';
    if (u.protocol !== 'https:') continue;
    u.hash = '';
    const path = u.pathname.toLowerCase();
    const sameSite = siteOf(u.hostname) === siteOf(base.hostname);
    if (!sameSite && PLATFORMS.test(u.hostname)) continue;
    const saysTerms = TERMS_TEXT.test(text) && !/glossary|licensed\s*(?:&|and)\s*insured|contractor/.test(text) && text.length <= 60;
    const pathTerms = TERMS_PATH.test(path) && !/glossary|licensed-and-insured|contractor/.test(path);
    if (!(saysTerms || (sameSite && pathTerms))) continue;
    // A privacy or cookie policy alone isn't terms of use (a "Privacy & Terms" page is read).
    if (/privacy|cookie/.test(text + ' ' + path) && !/terms|legal|licen[cs]e|copyright|conditions/.test(text + ' ' + path)) continue;
    if (found.some((f) => f.url === u.href)) continue;
    found.push({ url: u.href, rank: termsRank(text, path) + (sameSite ? 0.5 : 0) });
  }
  return found.sort((a, b) => b.rank - a.rank).slice(0, 6).map((f) => f.url);
}
/** Words on a home page that say it links its terms somewhere, even if the link itself can't be read (built by script). */
export const mentionsTerms = (html) => /\bterms (?:of (?:use|service)|(?:&|and) conditions)|conditions of use\b/i.test(plainText(html));
/** Whether a page that answered at a guessed address is really a terms page (not the home page or a "not found" page served with 200). */
/**
 * Whether a page is a site's terms of use (not only of sale, shipping or
 * returns): when none of the pages a home page links is, the usual
 * addresses are tried too (a shop that links only its shipping policy still
 * has its terms of service at /policies/terms-of-service).
 */
export const isUseTerms = (html) => /terms of (?:use|service)|conditions of use|website terms|site terms|user agreement|legal notice|acceptable use/i.test(headline(html)); // (by its title: a body that merely mentions "our Terms of Use" isn't them)
export const looksLikeTerms = (html) => /terms (?:of (?:use|service|sale)|and conditions|& conditions)|conditions of (?:use|sale)|terms of service|user agreement|legal notice/i.test(headline(html) + ' ' + plainText(html).slice(0, 3000));

const BAN = /\b(?:may not|shall not|must not|will not|cannot|can't|do not|don't|agree not|agrees not|not to|not (?:be )?(?:permitted|allowed|authori[sz]ed)|prohibit\w*|forbid\w*|restrict\w*|unauthori[sz]ed|refrain|strictly|without (?:the |our )?(?:prior |express |explicit )?(?:written )?(?:consent|permission|authori[sz]ation)|only for|solely for|limited to)\b/i;
const BOTS = /\b(?:robots?|bots?|spiders?|scrap(?:e|er|ers|ing)|crawl(?:er|ers|ing|s)?|data[- ]mining|text and data mining|harvest(?:ing)?|automat(?:ed|ic)|scripts?|machine learning|artificial intelligence|AI)\b/g;
const USE = /\b(?:non-?commercial|commercial|database|compil(?:e|ing|ation)|personal use)\b/gi;

/**
 * A hint for the person or agent reading the terms (never the verdict):
 * what a site's terms seem to say about us: 'bots' (no automated reading: not by
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
 * The passages of a terms page worth reading for our questions: where it
 * speaks of robots, scraping, automated access, commercial use, databases,
 * or copying. For the reviewer, so a long page is read where it matters.
 */
export function termsPassages(html, max = 12) {
  const t = plainText(html).replace(/[‘’]/g, "'");
  const re = /\b(?:robots?|bots?|spiders?|scrap\w*|crawl\w*|data[- ]mining|text and data mining|harvest\w*|automat\w+|scripts?|extract\w*|commercial\w*|non-?commercial|database|compil\w+|personal use|reproduc\w+|copy\w*|derivative|resell|exploit|artificial intelligence|machine learning|train\w*|means not intentionally)\b/gi;
  // "AI" only in capitals (not the "ai" in other words or languages); with the rest, in page order.
  const hits = [...t.matchAll(re), ...t.matchAll(/\bAI\b/g)].sort((x, y) => x.index - y.index);
  const spans = [];
  for (const m of hits) {
    const a = Math.max(0, m.index - 350), b = Math.min(t.length, m.index + 250);
    const last = spans[spans.length - 1];
    if (last && a <= last[1]) last[1] = b; else spans.push([a, b]);
    if (spans.length > max) break;
  }
  return spans.map(([a, b]) => t.slice(a, b).trim());
}
