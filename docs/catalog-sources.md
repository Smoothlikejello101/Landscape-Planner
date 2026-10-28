# Catalog sources

Which outside sources the catalog audit may use, how each was checked, and
which source decides each fact. The record format is in
[catalog-format.md](catalog-format.md).

## Before a source is used

A source goes in the table below only after these are checked and written
down: the rule found, and the date it was checked.

1. **robots.txt.** The rule for the pages we'd read, under `*` and under any
   group naming our fetcher. The fetcher sends
   `FullGrownCatalog/1.0 (mailto:hello@fullgrown.garden)`, an address that
   reaches Jason. Claude runs the
   audit, so the Claude agents' groups count too (the full list is under
   "How terms are read"). A `Disallow` means no automated reading, whatever the terms
   say.
2. **Terms of use and any data license.** Do they allow automated access?
   Do they allow use in a paid product? A terms page that says nothing about
   data grants nothing. It only means nothing forbids taking facts.
3. **How we read it.** First a download, then an API the site itself uses,
   and only then page by page. Keep to the slowest of: the site's crawl
   delay, our pace for that source, or 1 request every 2 seconds. Our paces
   are in `SOURCE_PACE` (scripts/catalog/fetch-lib.mjs): USDA 2 s; NC State,
   Minnesota Wildflowers, the Arkansas atlas, the Tallamy download and
   pages found by search ("Searching the web") 5 s. A source not listed
   there isn't fetched.

What we take is facts (a zone range, a height, a bloom season), written in
our own words, each citing its source. Descriptions, photos and notes are
never copied. (A fact can be read from a description's sentences, by rule;
the catalog then says it came from the description, and the sentence stays
in the build's own files: "Reading descriptions".)

**Never second-hand.** When a source is closed to us, so is every copy of
it: web archives, caches, Common Crawl, aggregators (Trefle included),
datasets built from it, and Claude's own memory of what it says. A value
comes from reading a source that's open to us, or it's `null`.

**"By hand"** means Jason (or another person) reading the page in his own
browser and typing the fact in. Browsing driven by Claude doesn't count:
not Claude in Chrome, computer use, or a headless browser.

Every value names its source in `src`. So if a source later asks us to
stop, one pass removes everything taken from it.

### How terms are read

The same reading for every source. We're not lawyers: this is a cautious
reading, to be checked with one before launch.

**robots.txt.** A 404 or 410 means there is none. A redirect is followed
within the same site, up to five times. Any other error, a
network failure, or a challenge page in its place ("are you human",
Cloudflare, Incapsula) counts as disallowing everything. So does a
request to the host we want that gets no web answer, a certificate that
doesn't verify, or this machine's proxy refusing, since it couldn't be
checked. Those answers close only the host that gave them: for a related host
(below), only its robots.txt rules reach down. A university's main site
behind a bot filter (ncsu.edu answers our robots.txt request with a 202
challenge, usda.gov with a 403 "Access Denied") isn't a rule about its
extension service's plant database. One exception, for public-domain
government data: a government site (.gov, .mil, .fed.us, a state's
.state.xx.us, another country's .gov.xx or Canada's .gc.ca) whose robots.txt
address gives the very page it gives for an address that doesn't exist (one
more request checks), with no robots rules, no bot check and no refusal or
noindex in it, has none: it's an app that answers every address. USDA
PLANTS's site does. Only a host that
isn't there at all counts as having none, and only DNS can say so: the
fetcher asks a DNS-over-HTTPS resolver (cloudflare-dns.com), since behind
this machine's proxy curl can't tell a missing host from a slow one. Run
with all domains allowed, so related hosts' rules can be read. The groups that
apply are `*`, `FullGrownCatalog`, `ClaudeBot`, `Claude-User`,
`Claude-SearchBot`, `Claude-Web` and `anthropic-ai`. A host that disallows
the pages we'd read is **closed to bots** for those pages (its own rules
decide each path, any narrower `Allow` included). One that blocks bots or a
Claude agent from the whole host (`Disallow: /`) also closes its subdomains,
whatever it allows on itself (www.extension.iastate.edu
closes yardandgarden.extension.iastate.edu; ffl-api.ifas.ufl.edu closes
nothing else at ifas.ufl.edu).

**Terms.** What a statement is about decides how it's read:

- **About copying the material:** "© … All rights reserved", "may not be
  copied, reproduced or distributed without permission", or a Creative
  Commons license on the documents, NonCommercial included. These protect
  the wording, tables and photos. Facts aren't covered by copyright, so a
  CC license, which only licenses what copyright covers, doesn't limit them
  either. **Use for facts**, in our own words.
- **About automated access only:** "no robots", "no means not
  intentionally made available". **Not by bot. By hand** is allowed if
  nothing else forbids it.
- **About using the information:** commercial use of the site's content or
  information, building or storing it in a database. **Ask first.** Until a
  written yes, not used, not even by hand.

**Ask first anyway** for:
- **Graded scores** an owner assigns from trials or expert judgment: Rutgers'
  A–D deer ratings, trial scores out of 5. An expert's grading is closer to
  their expression than a measurement is. Plain categories (low or moderate
  water, deer-resistant, poison severity) are facts.
- **A database whose download is open only to restricted users** (editors,
  members). Taking it through its public pages would get around that choice.

For the lawyer: whether taking facts for hundreds of plants from one
structured database raises database rights, which protect a database itself
in the EU and UK.

**Lean on** means a source decides values for more than 25 catalog plants.
A source we lean on gets a courtesy note before launch, and if it objects,
its values come out.

**Second-hand** means a source says it's compiled from a source closed to
bots, or its values match one word for word. It's treated as that source.

## Sources

| Source | Status | What was checked (2026-10-17 unless noted) |
| --- | --- | --- |
| **USDA PLANTS** (NRCS) | Use | **License:** US government work (17 U.S.C. § 105). The data.gov listing for PLANTS also gives CC0, though it is titled for the name list. **robots.txt:** none on the API host (`plantsservices.sc.egov.usda.gov`, the API the PLANTS site uses). **Reading:** check the downloads page (plants.sc.egov.usda.gov/home/downloads) first, then the API at 1 request every 2 s. **Which symbol:** `scripts/catalog/usda-pick.mjs` takes the plant's own name from PLANTS's search, never a misapplied one ("Carex albicans auct. non Willd.", "Silphium terebinthinaceum Elliott, non Jacq.": names another plant once went by, which USDA lists first and which lead to that other plant's profile). A profile is used only if it is the plant's own or a rename of it reviewed by hand (`SAME_PLANT` in usda-counties.mjs; sample.mjs leaves any other out, with a note). Reviewed choices (`PICK` in usda-pick.mjs): the catalog's Anemone patens is the American pasque flower, Pulsatilla patens ssp. multifida (USDA's species entry is the Eurasian subspecies). Not taken: Bidens polylepis as B. aristosa (USDA lumps them; Kew's World Checklist and World Flora Online keep them apart). **County records:** the PLANTS site's map reads them from USDA's public map service, `apps.geo.fpac.usda.gov/nrcs-geodata/rest/services/land_use_land_cover/plants/MapServer/6/query?where=plant_master_id=<profile Id>` (layer 6, counties; its county ids are its own, not FIPS, so they're placed by their shapes: [wild-records.md](wild-records.md)). 1 request every 5 s. |
| **NC State Extension Gardener Plant Toolbox** | Use, and tell them | **robots.txt:** none (404). **Terms:** the toolbox links no terms page, only privacy and nondiscrimination statements; NC State University's site-wide policies are not yet checked. Nothing found forbids a paid product taking facts, and nothing grants it. **Help page:** "strongly encourage[s]" citing the toolbox. Photos carry individual CC licenses, and we don't use them. **Before launch:** a courtesy note through the site's feedback form. **Pace:** 1 request every 5 s. |
| **Missouri Botanical Garden Plant Finder** | Not by bot. By hand is allowed. Permission asked. | **robots.txt:** `*` disallows `/PlantFinder/`, `/plant-finder/` and `/gardens-gardening/your-garden/plant-finder/*`, with a 30 s crawl delay ("For ai bots") for the rest. `ClaudeBot` is disallowed everywhere. **Terms:** forbid getting information "through any means not intentionally made available", and grant no reuse rights. A person reading the public pages is the intended use. So by-hand facts are allowed, cited per value, without waiting for the reply. If MOBOT says no, they come out. **TLS:** the server's certificate chain is incomplete (no intermediate), so strict clients fail. |
| **Lady Bird Johnson Wildflower Center** | Not by bot. By hand only after its terms are read. Permission asked. | **Access:** turns away clients that aren't browsers (403), and we don't pretend to be one. **robots.txt and terms:** not yet read. |
| **ASPCA toxic and non-toxic plants** | Not used, not even by hand. Permission to ask. | **robots.txt:** allows the plant pages (crawl delay 10). **Terms:** forbid "any robot, spider or other automatic device" and any "manual process to monitor or copy" the material, and allow only "personal, non-commercial use", unless they give written permission. **Reprints:** granted "case by case" through their reprint request form. |
| **UC ANR toxic plant classes** (people) | Ask first | **Terms** (ucanr.edu/copyright): reproduction allowed "for educational purposes"; "Distribution for commercial purposes is prohibited"; nothing may be "copied, downloaded, stored in a retrieval system" without permission. |
| **Pet Poison Helpline** (SafetyCall International) | Ask first | **robots.txt:** allows all but `/wp-admin/` (crawl delay 10). **Terms:** no terms page linked, and /terms-of-use/ didn't load. Contact info@petpoisonhelpline.com. |
| **Xerces Society plant lists** (regional "Native Plants for Pollinators and Beneficial Insects"; monarch nectar lists) | Ask first | Checked 2026-10-25. **robots.txt:** allows the publications. **Terms** (xerces.org/terms-of-use): a "limited license only for purposes of viewing"; forbid "selling, sublicensing and/or otherwise commercializing any Website material" and "any data mining, data harvesting, data extracting"; anything else needs "prior written consent". **Worth asking:** per plant, bloom months, life cycle, form, sun, soil, and flags for caterpillar host, specialist bees, bumble bees, beneficial insects, nesting, deer resistance (the Southeast and Southern Plains lists cover Arkansas). |
| **Pollinator Partnership ecoregion guides** (pollinator.org/guides) | Ask first | Checked 2026-10-25. **robots.txt:** allows the guides. **Terms** (pollinator.org/terms): the site "may not be reproduced, duplicated, copied, modified, sold, resold, distributed, visited, or otherwise exploited for any commercial purpose without the express written consent of Pollinator Partnership". **Worth asking:** per ecoregion (by ZIP), about 100 native plants with flower color, height, bloom season there, sun, soil, and the pollinators that visit (bees, butterflies, hummingbirds, moths, beetles, flies). Contact info@pollinator.org. |
| **Trefle** | Not a source | Its own data is CC BY 4.0, but each record keeps its upstream source's license, and its code hasn't changed since 2023. It can point to sources; it isn't one. |
| **Kaggle and similar dataset sites** | Never | The uploader picks the license, and plant data rich enough to use is usually scraped from the sources above. |

## Regional sources

Checked 2026-10-17, by the reading above. **Not yet read for any of them:**
the university-wide web policies behind the extension sites. They get read
before the 20-plant sample uses a source.

"Matches" is roughly how many catalog species its index names (cultivars
counted under their species), by a name search over its site map or text.
It's an upper bound on pages we'd use.

### Use now

| Source | Gives | Matches | robots.txt and terms |
| --- | --- | --- | --- |
| **UMN Extension Plant Elements of Design** (plantsearch.extension.umn.edu) | Zones, height, spread, soil, flower color, seasons of interest, invasive flag. Structured, 2,314 records with cultivars | not measured | No robots.txt. © notice only. |
| **Mt. Cuba Center** plants and trials | Zones, sun, moisture, pH, bloom season; trials give **peak bloom month**, weeks in bloom and 3-year size for cultivars | about 205 | Crawl delay 10. Its "Privacy Policy and Terms & Conditions" page holds privacy text only; © footer. Trial ratings are judgments, so not taken. |
| **Minnesota Wildflowers** | Native status, habitat (sun, moisture), **bloom months**, height, wetland status. Wild Minnesota species | about 307 | Blocks only Wget-type tools. Terms: "facts cannot be copyrighted"; no verbatim text. |
| **Illinois Wildflowers** (John Hilty) | Height, bloom season and length, sun, moisture, soil, range, and detailed wildlife: bees, caterpillar hosts, birds, browsing | not measured | Empty robots.txt. © notice only. |
| **Chicago Botanic Garden plant evaluation notes** | **Bloom months**, height, disease, winter injury for trialed cultivars (PDFs) | not measured | Drupal defaults. Image terms only. Ratings not taken. |
| **Illinois Extension HortAnswers** | Height, zone, **bloom months**, soil, light | small | Paths allowed. © notice only. |
| **UF/IFAS EDIS tree and shrub sheets** (Gilman and Watson) | Zones, origin, UF invasive status, height, spread, light, soil (clay, wet, drought, salt), maintenance. Structured, 634 woody plants | about 26 | Plant pages allowed. Documents under CC BY-NC-ND. |
| **Cornell Woody Plants Database** | Height, shape, light, zone, pH, salt and moisture tolerance, invasiveness, native origin. Structured, a few hundred woody plants | not measured | `Allow: /`. CC BY-NC-SA 3.0. |
| **Virginia Cooperative Extension publications** | Narrative and lists | — | Crawl delay 2. "available for public use, reprint, or citation without further permission", with credit. |
| **University of Arkansas Plant of the Week** | Native range, Arkansas nativity, size, bloom in prose, wildlife notes. Narrative, 1,016 articles | about 109 | Allows plant pages. No terms found. |
| **Atlas of the Vascular Plants of Arkansas** (2013) | Arkansas county distribution (read from its county maps: [wild-records.md](wild-records.md)); introduced, native, invasive status; 2,892 taxa | about 540 | No robots.txt on its host. "Free download edition. Not for commercial sale": we take facts (which counties a plant is recorded in) and never ship the PDF, its maps or its text. |
| **UGA "Native Plants for Georgia"** bulletins | Zones, size, native range, habitat, wildlife and host notes, under fixed headings | about 94 (one part) | Allowed. Its footer's copyright page wasn't read. |
| **Tennessee Smart Yards Native Plant Database** (tynnativeplants.wordpress.com, linked from UT's tnyards.utk.edu) | Light, moisture, soil, height, bloom season, Tennessee region, wildlife | about 130 | WordPress.com defaults (UT's own site: crawl delay 30). No terms found. Confirm UT owns it before use. WordPress.com's own robots.txt applies too (its parent host). |
| **Clemson HGIC**, **LSU AgCenter**, **Alabama Extension** (crawl delay 2), **Wisconsin Horticulture**, **Penn State** (crawl delay 10), **Purdue** (crawl delay 3), **UMD**, **UNH**, **UVM**, **Missouri, Ohio State and Maine Extension** | Narrative fact sheets | small each | © notices, or statements about copying the material. |
| **Oregon State Landscape Plants** (crawl delay 10), **Colorado State Extension**, **Plant Select**, **Conservation Garden Park** (Utah), **AMWUA** (Arizona), **Texas SmartScape** | Zones, size, sun, water, soil; Plant Select and Conservation Garden Park add deer, pollinators and (CGP) **bloom months** | small to medium | © notices only. Plant Select asks permission for stories and photos, which we don't use. |
| **Shropshire & Tallamy 2025** caterpillar host-plant dataset (University of Delaware) | Which caterpillars use which plant genera, 7,423 species | genus level | CC0 at the university's repository and on Zenodo (record 17747343, the copy we read); the journal's copy says ODbL, which allows commercial use with credit. |
| **Virginia DCR Native Plant Finder** | About 1,600 natives with sun, moisture and pollinator flags, offered as CSV | not measured | Allowed. Copyright notice, with fair use granted and a request asked when in doubt (web@dcr.virginia.gov): a courtesy note before use. |
| **Kew World Checklist of Vascular Plants** | Accepted names and native range worldwide; used for native status by US state ([wild-records.md](wild-records.md)) | all species (745 of the catalog's 771) | CC BY 3.0 (its README); the download (sftp.kew.org/pub/data-repositories/WCVP/wcvp.zip) has the distribution table, native or introduced by TDWG area. No robots.txt on that host. Cite Govaerts et al. 2021, doi:10.1038/s41597-021-00997-6. |
| **GBIF Backbone Taxonomy** (api.gbif.org) | Its match for each species' name (for the downloads: [bloom-months.md](bloom-months.md)), and, for a plant added from NC State that USDA doesn't name, its English name (the record's `vernacularName`; [catalog-build.md](catalog-build.md), "Adding plants") | all species | CC BY 4.0 (the dataset's own record, checked 2026-10-24); cite doi:10.15468/39omei. 1 request every 2 s. A name identifies a record; it isn't a fact. |
| **Federal and state plant laws** (7 CFR 360; Arkansas, Texas, Mississippi, Missouri, Oklahoma, Louisiana and Tennessee rules) | Which plants a law regulates, and what it says of them ([regulated-plants.md](regulated-plants.md)) | 8 (2026-10-21) | Government text: public. Read only from the government's own host, where its robots.txt allows (the eCFR's API paths don't: the CFR's annual edition on GovInfo instead); a host that turns away non-browsers (Tennessee's) is read from a copy saved by hand in a browser. |

### Ask first

| Source | Why it's worth asking | Why we ask |
| --- | --- | --- |
| **Rutgers deer-resistance ratings** (E271, 527 plants) | The cleanest deer rating found | A rating, and we'd take all of it that matches. |
| **SelecTree** (Cal Poly) | Trees: zones, size, water, soil, deer palatability, wildlife, native range. About 1,500, structured | A database whose download is open only to its editors; taking it through the public API would get around that. |
| **WUCOLS** (UC Davis) | Water use for about 3,500 species, by six California regions | Its site blocks non-browsers, and its data host's robots.txt returns an error. Water classes are ratings. A UC Extension product, where UC ANR's terms may apply. |
| **Go Botany** (Native Plant Trust) | About 530 matches: native status by state, height, wetland indicator | Terms bar commercial use of content derived from the site (gobotany@nativeplanttrust.org). |
| **Kansas Wildflowers & Grasses** | About 330 matches, with **bloom months** | "may not be used commercially". One owner to ask. |
| **Morton Arboretum** | 774 well-structured plants, about 144 matches | Terms bar commercial use and automated downloading. |
| **Florida Native Plant Society** | About 121 matches, structured | Non-commercial use only. |
| **Native Plant Society of Texas** | About 179 matches, structured, with soil, water and wildlife | Its references are largely MOBOT and the Wildflower Center, closed to bots, so we'd need to know which facts are its own. |
| **UConn Plant Database**, **Utah State**, **NMSU**, **UC ANR**, **Xerces**, **NWF Native Plant Finder** | Assorted | Terms bar use for profit, commercial use or commercial distribution. |

### Not by bot

By hand only after each site's terms are read.

- **robots.txt disallows us:** Atlas of Florida Plants (ClaudeBot), Iowa
  State Extension (ClaudeBot, Claude-Web and anthropic-ai on its main site,
  so all its hosts), SEINet, OregonFlora and the Washington Native Plant
  Society (`*`).
- **UF/IFAS Florida-Friendly Landscaping plant app:** its data API's
  robots.txt returns an error. The only regional source with structured
  **pet toxicity** and **flowering months**: by hand is allowed (its terms
  are about copying), and asking would let us read it properly.
- **Blocked, or robots.txt unreadable:** Calscape, Jepson eFlora, Michigan
  State, Prairie Moon, Grow Native!, Oklahoma State, WSU, PNW Plants.

### Not used

- **Terms forbid it:** Sunset Western Garden (its zones are proprietary),
  Garden.org.

## Searching the web

For the sources no list names, the audit searches the web for each plant,
the way a person compiling this by hand would, and reads what it finds by
the same rules as every other source (scripts/catalog/search.mjs).

1. **Search.** Brave's Search API, two queries a plant (its name, and its
   name with "hardiness zone height spread sun"), at most one a second.
   **Brave's terms forbid storing results** except transiently, and using
   them to train AI. So results live only in the script's memory: their
   URLs go to the fetcher, and what's kept is the pages we fetch ourselves
   and the facts read from them, each citing its page. The key is read from
   `BRAVE_API_KEY` or `~/.config/fullgrown/brave-key`, never committed or
   logged.
2. **Pick.** Up to 10 pages a plant, one a site. Left out: the sites in
   this document's closed, ask-first and not-used lists; crowd-sourced and
   AI-written sites (Wikipedia, Dave's Garden, iNaturalist…); archives,
   caches and aggregators (the Wayback Machine, archive.today, Trefle,
   GBIF…: GBIF's records are read another way, by the owner's decision, as
   counts only: flowering records for bloom months ([bloom-months.md](bloom-months.md)) and herbarium
   specimens by county ([wild-records.md](wild-records.md))); marketplaces and social media; and sources read another way
   already (all of usda.gov and ncsu.edu, Minnesota Wildflowers: cautious,
   since NRCS plant guides and NC State's other sheets are left out too). The
   script prints counts, never the results.
3. **Terms.** Each site's terms are read by a person or an agent, never
   decided by pattern, and the reading is kept in
   `scripts/catalog/site-terms.json` (committed, so it can be checked): the
   verdict, the date, the pages read, and a line in our own words on what
   decided it. **A site is read only when that record says its terms allow
   it**; one not yet reviewed is left out of the run. For each new site the
   run fetches its home page and the terms pages it links (up to six, the
   terms of use first, then legal, policies, licence and copyright pages; a
   privacy policy alone isn't read as terms; never a platform's own such as reCAPTCHA's or a
   payment provider's), or the usual addresses (`/terms`,
   `/terms-of-use`, `/policies/terms-of-service`…) when none of the pages
   it links is titled as the terms of use (none linked, or only terms of
   sale, shipping or returns: a shop that links only its shipping policy),
   and writes a review packet: each page's opening and the passages about
   robots, scraping, scripts, AI, automated access, commercial use,
   databases and copying (up to twelve, saying how many more there are),
   with a pattern's guess marked as a hint only. Each owner on a shared
   host (wordpress.com, blogspot.com, Wix…) is its own site, and a page is
   followed through a redirect only to the same owner.
   How a reviewer reads them, by "How terms are read":
   - **bots** (not by bot): anything against robots, spiders, scrapers,
     crawlers, data mining or extraction tools, automated access, or "any
     means not intentionally made available", wherever the ban word sits
     (Shopify's standard terms ban spidering and scraping in section 12);
     also a reservation of text and data mining, or a ban on use for AI
     training.
   - **use** (ask first): personal or non-commercial use only of the site's
     content or information, no commercial use of it, or no database or
     compilation of it.
   - **open**: terms that only protect the material itself (copyright,
     no copying, reproducing or republishing; Creative Commons, NonCommercial
     included), or that say nothing on these. Facts in our own words are
     fine.
   - **none found**: no terms anywhere, the home page included (a home page
     that mentions terms we couldn't open is **unread**).
   - **unread**: the home page or a linked terms page couldn't be fetched,
     or the terms of use aren't among the pages read; tried again next run.
   When unsure, it isn't **open**. A site we lean on is also read by Jason
   before launch.
4. **Fetch.** Through the fetcher: robots.txt, pace (`web`: 5 s a site),
   refusals and the honest user agent, as for every source. Up to eight
   sites are read at once, each still one request at a time at its pace. Redirects
   within a site are followed, each one fetched by the same rules.
5. **Read.** Only labeled spec lines ("Hardiness Zones: 5–9", "Mature
   Height: 3–4 ft", "Light: Full sun to part shade"), never prose; a
   false value is worse than a missing one, so a line that could mean two
   things is left out (a row of choices with one lit, a label repeated with
   different values for related products, a temperature under "Hardiness",
   a pot size under "Height", a value with a qualifier such as "shade
   tolerant" or "full sun except in the South"). Only from a page about the plant: for a
   cultivar, its name in the page's title or heading; for a species, its
   botanical name standing alone and no cultivar in the title. A page that
   credits a source closed to us, in its text or by a link (MOBOT, the
   Wildflower Center, NPIN; or as its source, Calscape, Prairie Moon, Dave's
   Garden, Garden.org and the other closed ones), is that source second-hand
   and isn't read. A shop is a page with a cart or a product marked up for
   search engines, not just prices (a blog's affiliate links); a person's
   own pages on a university site (`/~name/`) are a blog's. Bloom
   months aren't taken from the web: they differ by place.
6. **One run at a time.** `catalog-src/.lock` keeps a second run out, so
   paces don't add up and files don't cross. It's never taken over: one
   left by a stopped run is deleted by hand, as the message says.

## Reading descriptions

Decided with Jason, 2026-10-26 ("read everything"): facts are read from the
sentences of the pages we've saved, not only their labeled fields. NC State's
descriptions first, then the web pages whose terms allow reading them. Each
value cites the sentence it was read from.

- **By rule, never by guess** (scripts/catalog/prose.mjs). A sentence speaks
  to a fact only in words the rules know, and only about the plant itself:
  not the "deciduous forests" it grows in, the evergreens it's planted
  under, a plant it's compared with ("unlike", "whereas"), another plant
  named as the sentence's subject, or where its name comes from. A sentence
  the rules can't settle says nothing.
- **Fields first.** A page's sentences are read only for a fact its labeled
  fields don't give. They count as the same source (NC State is one
  authority however many of its sentences agree). Over USDA's plant traits,
  which are a fallback, NC State's sentence decides. One exception, where
  the page contradicts itself: a zone field that takes in the zones its own
  text says the plant is only grown as an annual in (a field listing 3a to
  11b, a text saying winter hardy in zones 9 to 10 and grown as an annual in
  3 to 8) gives way to the text's hardy zones. Checked 2026-10-26 against
  the 25 NC State pages that say where a plant is grown as an annual: only
  the two Señorita cleomes' fields list those zones.
- **Cited, not copied.** The build keeps each sentence beside its claim
  (catalog-src/build/combined.json, not committed), so a value can be checked
  against its page; the tests use sentences written in the same shapes, not
  the sources' own; the catalog says only that
  the value was read from the description (`from: "description"`,
  docs/catalog-format.md), and the app credits it as "Prose description, NC
  State …", without quoting it (Jason, 2026-10-27: credit, don't quote).
- **Checked before shipping.** Each fact's rules are checked against the
  plants whose fields already give it, and a sample of new values is read
  against their sentences by a person or an agent.

**Leaves in winter** (`foliage`), the first fact read this way, for the bulb
rule (a spring bulb under a deciduous plant): a sentence calling the plant
evergreen, deciduous or semi-evergreen, or saying it dies back or goes
dormant in winter (not in summer's heat, after it flowers, or as a
houseplant's rest). Said to depend on the winter ("evergreen in warmer
climates", "may be semi-evergreen", "deciduous or evergreen"), or evergreen
in one sentence and dying back in winter in another: semi-evergreen. A
deciduous shrub that "may die to the ground in a cold winter" stays
deciduous (its stems depend on the winter, not its leaves); that alone, with
nothing else said, settles nothing. Checked 2026-10-26 against the 1,417
plants whose NC State fields or USDA traits already say and whose
description speaks to it: 1,299 agree, 9 say the opposite (several of those
the fields' error: USDA has 'San Jose' juniper deciduous), and the rest are
the sentences being finer ("may be semi-evergreen in the south" of a plant
the fields call deciduous). New values read against their sentences: 48 of
a first 50 right; after fixing what those two showed, an agent that hadn't
seen the rules checked another 50 and the two cleomes' zones: 48 and both
zones right; the 2 wrong were a place it grows taken for a winter, and dying
back only in long freezes taken as deciduous. Both fixed: a place after
"native to" or "found in" is where it grows, and dying back only in a hard
or long freeze, with nothing else said, settles nothing. Weakest: a
deciduous value from care advice alone ("divide it in the fall as it goes
dormant"); right, but worth a second source. Care advice about watering a
resting plant settles nothing.

**Deer, self-sowing and spreading** (`deer`, `self_seed`, `habit`;
2026-10-27). Read a clause at a time ("deer tend to avoid it but may eat
the flowers": the flowers aren't the plant; "unlike most of its genus, it
spreads from rhizomes" is about the plant itself), never of its fruit or
acorns eaten ("the berries are consumed by birds and deer"), the deer fern, a comparison ("less damaged by deer than other
clematis"), or cultivars it names ("consider 'Merlot Majik', as they are
sterile").

- *Deer*: `Resistant` where deer pass it by ("deer resistant", "drought,
  deer and wet soil tolerant", "seldom damaged by deer", "tolerates browsing
  by deer", which NC State's own field counts as resisting them);
  `Occasional` where deer eat it, said plainly ("deer will browse roses"),
  now and then ("may be damaged by deer"), or where it resists them only in
  part ("mildly resistant"); `Candy` where they favor it or damage it often
  ("frequently damaged by deer", "a serious problem", "little resistance to
  deer"). A page's least
  resistance stands (no promise the deer pass it by). NC State's field
  lists deer only where a plant resists them, so the sentences are where it
  says deer eat one. Checked against the 523 pages whose field lists deer
  and whose description speaks to them: 472 read Resistant, 51 Occasional
  (34 of them "mildly" or "moderately" resistant: the field lists those
  too), none Candy. Where the page's own text says deer eat the plant,
  "mildly" or "moderately" resistant or outright ("may be damaged by deer",
  "deer will browse roses"), its field's Resistant gives way to Occasional
  (Jason, 2026-10-27: the text is finer, like the cleomes' zones).
- *Self-sowing*: `Prolific` where it self-sows freely ("readily reseeds",
  "self-seeds and can become weedy", "deadhead to prevent aggressive
  reseeding"); `Modest` where it does a little ("self-seeds, but is not
  aggressive", "somewhat rapidly", "considered sterile, but … can lead to
  viable seed"); `Unrated` where it does and the page doesn't say how freely
  ("may self-seed", "will self-seed in ideal conditions", "deadhead to
  prevent self-seeding": Jason, 2026-10-27); `Sterile` where the
  plant itself is said to be ("'Karl Foerster' is sterile", "a sterile
  hybrid", "does not produce seed"), not its fronds or ray flowers. Nearly
  sterile ("sterile or near sterile", "highly infertile", "usually does not
  produce fertile seed") settles nothing, and neither does "does not
  self-seed" (a plant can set seed that doesn't come up) or reseeding a
  lawn. A page that says the plant is sterile, triploid or seedless and
  also that it (its species, read on a cultivar's page) self-sows can't
  settle.
- *Spreading*, as a habit src/spread.ts knows: by rhizomes ("spreads by
  rhizomes", "creeping rhizomes", "underground runners"), stolons or
  runners above ground, suckers (with thickets where the suckers make
  them: thickets alone say nothing of how it spreads, a rhododendron's or a
  hedge's; never "found in thickets", nor "can form thickets in riparian
  areas" of plants in the wild), or mats; aggressively where said
  of its spreading ("spreads aggressively by rhizomes", "suckers … a weed
  problem"; or in a sentence of its own, "controlling its spread has proven
  a challenge", "its aggressive habit"; not "a little aggressive",
  "vigorous", weediness in a clause that blames seed too, nor "invasive in
  New England", which is where it goes wild) or slowly where said. "Rhizomatous" alone says nothing: it's a kind of
  root, a hellebore's or a begonia's as much as a mint's; only beside words
  that say it spreads ("a rhizomatous, spreading plant") is it read.
  `Clumping` only where it's said to form clumps and nothing says it runs
  ("slowly spreads to form clumps" isn't, nor a clump-former whose page
  says "it can spread rapidly", how unsaid; "Tufted sedge" is a name). Rhizomes divided by the gardener
  aren't spreading. Two habits were added for it: "Slow-spreading rhizome"
  (slow) and "Aggressive runner (stolons)" (aggressive).
- A cultivar's self-sowing and habit come only from a page for it (a
  sterile or clumping cultivar of a self-sowing, running species); its
  deer, like the field's, from its species' page too.

Checked 2026-10-27 by an agent that hadn't seen the rules, on three random
samples of new values read against their pages, the rules fixed after each:
138 values, 122 right (deer 37 of 38, self-sowing 35 of 36, spreading 50 of
64); then 74 fresh ones, 61 right; then 75 fresh ones, 64 right (deer 10 of
10, self-sowing 12 of 15, spreading 42 of 50, 2 of them wrong and 6 unsure).
What it found, and fixed: thickets taken as spreading, "rhizomatous" alone
taken as spreading, "infertile soil" read as a nearly sterile plant, a
gardener's gerund ("Controlling its spread …") taken for another plant's
name, a trailing "hence the common name" dropping a sentence, and how
aggressively or slowly. Weakest: spreading's degree (aggressive or not,
slow or not), more than whether it runs at all.

**Web pages' text** (2026-10-27): the same four facts read from the pages
the search saved and cites (nurseries, extension pages, blogs; only sites
whose terms allow it), by the same rules, for what a page's spec lines
don't say. A page's own paragraphs only: not its menus, header, footer or
forms, and not its site's boilerplate, a paragraph that names a plant and
shows on the site's pages for other species (a related product's blurb, a
genus's trivia, companions to plant with). A nursery's stock sentence said
of each plant it fits ("Plants are pest resistant and unpalatable to deer")
stays: it's said of this plant too. A labeled "Evergreen or Deciduous:
Deciduous" inside a paragraph is the page's field. They count as the
site's claims, at its tier: a nursery's deer is one side of the sides
(docs above), NC State's an authority's; a blog's deer isn't read at all.
A tree's or a vine's "clump" (its trunks, its base) isn't written as
Clumping. A value an earlier build read from a description that today's
rules no longer read is taken out, and listed in the review ("Taken out").
Checked by the same agent on 80 of the values the pages decided: 67 right
(leaves in winter 23 of 25, deer 13 of 15, self-sowing 12 of 15, spreading
19 of 25). Fixed from what it found: related products' blurbs, a site's
legend of terms, readers' comments, an FAQ's questions ("Does it spread
aggressively?" settles nothing; its answer is its own sentence), and
"aggressive" negated ("without becoming aggressive"), hedged ("semi-
aggressive"), regional ("invasive in Florida") or said of another species.
Weakest: a nursery's page that contradicts itself (a summary against its
FAQ), and how aggressive a spread is.

These replace the earlier list's unsourced values where they differ (a
"Clumping" the description says spreads by rhizomes). Drought wasn't read
this way: NC State's field already lists it, and only about 55 pages
without that field mention drought at all, several to say the plant doesn't
take it.

### A second reading

Decided with Jason, 2026-10-27, after those checks found about one value in
seven read from text wrong or debatable (67 of 80 on the web pages): a value
read from a page's text is written only where a second, blind reading of the
same text agrees (scripts/catalog/second-reading.mjs).

- **Blind.** The second reader (an agent) gets only the page's sentences, its
  names and the facts to answer, with its instructions
  (docs/second-reading.md, word for word): the same values, use only the
  text, never what it knows of the plant. It isn't told what the rules
  found, and doesn't see them.
- **Agreement.** Where the two match, the value is written. Where they differ
  only in degree, the part they share is: both say it spreads by rhizomes,
  one "aggressively" (Spreading rhizome); both say deer eat it, one "often"
  (Occasional); both say it self-sows, one "freely" (Self-sows,
  aggressiveness unknown). Leaves in winter, a sterile plant, clumping and
  mats agree only exactly. Otherwise nothing is written, and the review
  lists it ("Read from text, but a second reading differs").
- **A degree settled elsewhere.** Where a page's readings agreed only on the
  shared part and another source gives exactly the degree the rules read
  (its own readings agreeing, or its field), that degree stands for the page
  too: prairie sage, whose NC State text the rules read as spreading
  aggressively and the second reading didn't, beside a nursery's page both
  readings agree says it spreads aggressively by rhizomes, is Aggressive
  rhizome, not the less specific value outvoting the nursery's.
- **It only gates.** The second reading never adds a value the rules didn't
  read: where the rules read nothing, nothing is written, whatever it says.
- **What it does to values already written.** A value an earlier build read
  from that text, which the second reading now differs on, is taken out,
  unsettled. NC State's deer field, where its text lowered it to Occasional
  and the second reading doesn't agree, stands as the field gives it
  (Resistant). Once, for this first gated build: where a value taken out had
  replaced one of the earlier list's (#111, #113, #114), the earlier list's
  value is back, unsourced as before.
- **Kept by page.** The readings are saved in
  scripts/catalog/second-reading.json, by page, with a hash of the text
  read. A page whose text changes is read again: its values wait until it
  is (they're listed, "waiting for a second reading", and a value already
  written stays as it was). The build lists those pages in
  catalog-src/build/second-reading-tasks.json.
- **Reading new pages.** Give a reader (a fresh agent each batch of about
  150 pages, its own folder for its scripts) docs/second-reading.md and its
  part of that file; merge its answers with
  `node scripts/catalog/second-reading.mjs <tasks.json> <answers.json>… --at <date>`,
  which takes only answers to a page asked, of the same text, every fact
  asked and only the values allowed; then build again.

First run, 2026-10-27: 2,041 pages (1,558 NC State's, 483 web pages), 2,603
values read from their text. The readings agreed exactly on 2,406 (92%),
only in degree on 85 (3%: mostly a spread or a self-sower one reading
called aggressive or free and the other didn't), and differed on 112 (4%):
spreading 70 of 1,077, deer 21 of 656, leaves in winter 11 of 349,
self-sowing 10 of 521. Most of the differences were the second reading
finding nothing (a river birch's "clump" of trees planted together; "deer
resistant" said on a nursery's page of the other plants it sells), or
evergreen against semi-evergreen. Taken out as unsettled: 53 values, with
nothing to put back, and 6 values of the earlier list back.

**Held-out check**, the same day: for each fact, a fresh agent that hadn't
seen the rules, the readings or this work graded 100 random values the gated
build wrote against their page's whole text (never used to change the
rules). Leaves in winter: 98 right, 2 unsure. Deer: 98 right, 1 less
specific, 1 unsure. Self-sowing: 87 right, 8 less specific, 4 unsure, 1
wrong. Spreading: 88 right, 9 less specific, 3 unsure. In all, 1 wrong in
400 (before the gate, 7 in 80) and 10 unsure. "Less specific": the value
says less than the text, nothing in it wrong (spreads by rhizomes where the
text says it can spread aggressively; self-sows, aggressiveness unknown
where it says freely or slowly); mostly where the two readings differed in
degree, or a hedge ("can spread aggressively") the rules don't read as
aggressive. So the gate trades some detail for being right: weakest now is
how freely a plant self-sows and how aggressively it spreads, said too
seldom rather than wrongly. Both readers and the checkers are agents of
the same kind, so a misreading they'd all share wouldn't show here; the
next check is a person's, on a sample.

## Paid licenses

Checked 2026-10-17. No paid source found both covers our facts well and
plainly lets a paid app ship its data.

- **Horticopia:** the one worth contacting. It licenses plant data to other
  software (DynaScape's design software runs on its 9,357 plants), as SQL
  Server or Access files. Price, field list, who compiles it, and whether a
  consumer app may ship it are all unpublished (sales@horticopia.com).
- **Plants For A Future:** 7,400 plants as a spreadsheet. Its $150
  "commercial" edition is a license for office use, not to redistribute,
  and its bloom months are British.
- **Merck Veterinary Manual:** MSD licenses manual content to app
  developers, but whether the Veterinary Manual is included isn't stated,
  and its plant toxicity is prose, not a per-plant table.
- **Not usable:** Perenual (its terms forbid commercial use and display of
  its content, though its price list says "commercial"); Garden.org ("not
  available for licensing"); Permapeople and Growstuff (crowd-sourced,
  share-alike); Plant.id and PlantNet (identification, not traits);
  OpenFarm (shut down in 2025); nursery feeds and data resellers with
  AI-written text.
- **Pet toxicity:** no licensable source found. ASPCA publishes no data
  license (it offers consulting), and its poison database is internal. Pet
  Poison Helpline and the FFL app are the requests worth making.

## Deciding each fact

Agreed 2026-10-18: more sources, sorted by what a wrong value costs. Each
fact belongs to one of three tiers, and each source is one of four kinds.

**Kinds of source.**
- **Authority:** extension services (.edu, .gov), botanical gardens and
  arboreta, state floras and atlases.
- **Breeder:** the company that bred or introduced a cultivar (Proven
  Winners, Monrovia, First Editions…), the primary source for that
  cultivar's own traits. Not used yet: a breeder's site also sells other
  breeders' plants, so knowing which cultivars are its own needs a list of
  its introductions first. Until then its pages count as a nursery's, and
  one company's sites (Proven Winners, Proven Winners Direct, Spring
  Meadow…) count as one source.
- **Nursery:** a retail grower or shop.
- **Blog:** anything else that is open to us: garden writers, societies'
  articles, magazines.

**Tiers.**
- **Safety** (toxicity, invasiveness, native status): authorities only.
  These are what could hurt someone or expose us to liability; a value from
  a shop or blog never stands in.
- **Survival** (zones, sun, water, size, soil, deer): authorities, a
  breeder for its own cultivar, and retail nurseries. Never a blog. Zones,
  sun, size, water and deer go by "Where sources disagree" below: an
  authority leads unless more sources agree against it. Soil: an authority
  decides; where none has it, nurseries, where most agree (`likely`) or one
  says it (`reported`).
- **Description** (form, bloom, flower color, fall color, wildlife,
  edibility): any source, highest kind first.

**How sure.** Each fact gets a `check`:
- `confirmed`: an authority decides, and an independent source agrees.
- `single`: one authority, nothing else.
- `likely`: no authority behind it; two or more independent lower-kind
  sources agree on it (outnumbering any authority that says otherwise).
- `reported`: one lower-kind source.
- `disputed`: authorities disagree; or below them, there's no majority.
  For the facts under "Where sources disagree", only where even the
  cautious rule can't choose, or the result makes no sense (a cold limit
  warmer than the warm one).
Lower-kind sources that disagree with the decider are kept as notes for the
review. (`likely` and `reported` wait on the format change that adds them:
see "Waiting on format changes".)

### Where sources disagree

Agreed 2026-10-22, for the facts a plant is filtered by: the zones, sun,
height, width, water and deer. NC State is a large dataset but has been
wrong before, so one page of it shouldn't outweigh two sources that agree
against it.

1. **Sides.** Sources that agree (by "Agreement" below) form a side, copies
   counted once. A side's value is one its highest kind gives, and every
   source on the side agrees with that value. Agreement isn't transitive
   (zones 9b and 11b each agree with 10b, not with each other), so each
   value that could head a side is tried, and the one that leads by the
   rules below is kept; then the same among the sources left. Where the
   rules leave two sides as strong, NC State's goes first, then by source
   name, so the order sources are read in never changes which sources
   lead, or which other side is kept beside them.
2. **The side more independent sources back leads.** Two nurseries that
   agree outrank a lone NC State page (the leader is `likely`; NC State's
   value is kept beside it). An authority's side with another source is
   `confirmed`, alone `single`.
3. **On an even split, a side with an authority leads** over one without
   (NC State against one nursery: NC State).
4. **Still even, the cautious value leads**, the one that's safer to plan
   by: the warmer cold limit and the cooler warm limit (a narrower zone
   range), the less sun it's said to take at most and the more it's said
   to need at least, the larger size (room to grow into), the water need
   nearer Moderate, the lower deer resistance (no promise the deer pass it
   by). Two nurseries saying 4 ft and 6 ft: 6 ft, with 4 ft beside it.
   Where even that's even (water: Low against High, as far from Moderate),
   nothing is taken: it's `disputed`, for the review. (Two values of a
   side's highest kind that agree with the same sources aren't a split:
   NC State's 8 and the University of Florida's 9 for oleander's cold
   limit are one side, `confirmed`, showing NC State's, as before; without
   NC State, the one the build reads first.)
5. **Another value is kept beside it** (`alt`): the largest other side (two
   as large: the one with an authority, then the cautious one, then by
   name), or, where the value shown has no authority behind it and an
   authority's was outvoted, the authority's, so the app never hides that a
   reference says otherwise. It's labelled with who says it: "Nurseries report: …" where
   they're all nurseries, else by name ("NC State lists: …"). The app shows
   it in the plant's details and its filters can let it count ("Include
   where sources differ"); a plant shown only because of it is marked !.
6. **Pairs** (the two zones, the two sun levels) are one range: the `alt`
   comes from sources that give both halves, never one source's cold limit
   with another's warm one, and sits on each half where it differs from
   the value shown. Each half is decided on its own, so a range's two ends
   can come from different sides (bee balm: full sun from NC State and two
   nurseries, part shade from the nurseries alone); the app credits a range
   to the sources behind both ends, as sure as the less sure end, or where
   no source gives both, each end to its own, with how sure each is. Halves
   that, decided apart, make no range (one nursery says full sun only,
   another part shade only) are both `disputed`, for the review.
7. **Forms** aren't a choice of one: where two authorities share no form,
   both are kept, as a list of up to three, the catalog's current form
   first, at least one from each (autumn sage: a perennial to NC State, a
   shrub to USDA); only the sources whose forms are shown are cited.

The safety tier (toxicity, invasiveness, native status) isn't decided this
way: authorities only. Description facts (bloom, colors, wildlife) still go
to the highest kind, with the others noted for the review.

**Independent.** Copies count once. Two pages with the same longest
paragraph are one source, wherever they're published, and the highest kind
among them keeps it (a shop copying an extension sheet doesn't stand in for
the extension). Two pages on one site are one source too. A source compiled from another (many extension sheets
cite USDA or NC State) isn't independent of it.

**USDA PLANTS** describes species as they grow wild, and its own notes call
its garden figures approximations. So its temperature, shade and moisture
values are **flags only**: shown to the review where they differ from what
was decided (zones by more than a whole zone), never deciding or checking.
The exceptions: native status, where USDA is the national authority and
decides; and, as a **fallback**, its growth habit (for `form`) and the plant
traits it records (whether a tree's or shrub's leaves stay through winter,
leaf color, growth rate, bloom period, flower color and whether the flowers
are conspicuous). A fallback decides only where NC State says
nothing; otherwise it backs NC State's value (confirmed) or is noted against
it, never a dispute. Only USDA's rows for the species are read: a row naming
a cultivar (`CultivarName`, a named release such as 'Alma' blue grama) is
that release's, and is left out. A cultivar's leaf color, flower color and growth rate
never come from USDA.

**Agreement.** Zones agree within one whole zone (10 °F); sizes when the
ranges overlap, with a quarter's give; lists (colors, seasons, hosts) when
they share a word.

**Water** is what a plant needs once established. NC State has no water
field, so it comes from NC State's tags: **High** where it grows wet
(frequent standing water, or occasionally wet without good drainage);
**Low** where NC State calls it drought tolerant (the Drought Tolerant
Garden theme, Very Dry drainage, or Drought resistance with Occasionally Dry
drainage) and lists nothing wet (Occasionally Wet or Occasional Flooding
drainage, Wet Soil resistance, a Rain Garden or Water Garden theme, a Pond
or Riparian location); **Moderate** otherwise. A plant rated for both wet and
dry (red maple) is adaptable, so Moderate. Witch hazel (moist to
occasionally wet, good drainage) is Moderate; red oak (occasionally dry,
good drainage, drought resistant) is Low.

**Caterpillar hosts** come from every source that says so: tables, and
sentences naming a host ("larval host for the X (Genus species)",
"host plant for the X butterfly"). The Shropshire & Tallamy dataset (CC0)
adds the caterpillars recorded on each plant genus, as its own fact
(`host_genus`: the genus, and how many native species north of Mexico use
it), since it's genus-level; how many of those live in each state, and the
butterflies among them, go in the state files (docs/wild-records.md).
scripts/catalog/tallamy.py builds the index from the spreadsheet on Zenodo
(record 17747343, CC0). The `host` audit fact is the list of names, never a
source's sentence, written as `hosts` (since 2026-10-25); the earlier list's
`host` sentence stays beside it, labeled, where no source names any.

The table below names NC State's and USDA's fields and how they map
(USDA: what it decides, and what it only flags).
Regional sources from the "Use now" list are authorities like them, with
`at` set to their state for facts that depend on place (bloom months,
water).

- **Facts that depend on place** differ by region without anyone being
  wrong, so they're never `disputed` against each other. They wait for the
  "Values by region" format change, which keeps each region's value.
- **Neither yes nor no is listed:** the fact is `null`, never `false`.
- **No source gives the fact's scale:** the fact is `null`. A source that
  only lists whether something applies (NC State's "Attracts: Bees") never
  becomes a level such as High or None.

Facts entered **by hand** from a source that allows it (MOBOT, for now) count
as an independent authority, with `at` set to the source's state for bloom
months ("MO" for MOBOT).

| Fact | From NC State | USDA | Rule |
| --- | --- | --- | --- |
| Names, `usda` symbol, synonyms | checks | decides | USDA's accepted name. A cultivar keeps its name and points to its species. |
| `form` | "Plant Type", "Life Cycle" | fallback (growth habit and lifespan) | A list of up to three, the catalog's current form first. One source decides: an authority's or the breeder's page for the cultivar itself, else NC State, else USDA's habit, else the nursery others back most. Its forms are the answer; the catalog's form only orders them, never supplies one. A form another independent source also lists is backed: confirmed when every form is (likely, without an authority), else single (reported), the unbacked ones noted. Another source listing a form the decider doesn't is noted; another authority sharing none of its forms adds its own, both kept, the catalog's first, at most three with at least one from each (autumn sage: a perennial to NC State, a shrub to USDA), a plain perennial beside a grass being that grass (USDA's habit counts too, though its "Perennial" isn't against a fern, bulb, grass, cactus or aquatic). See "Where sources disagree". NC State's Tree, Shrub, Vine, Fern, Bulb and Cactus/Succulent tags map to the enum of the same name; Ornamental Grasses and Sedges → Grass/Sedge; Annual → Annual; Herbaceous Perennial → Perennial; Aquatic and Water Plant → Aquatic/Emergent; Herb, Wildflower and other tags are ignored. For an herb (no woody or other form among the tags), annual or perennial is read from the tags and its "Life Cycle" together (Perennial → Perennial, Annual or Biennial → Annual): what both say, and where they share nothing, the Life Cycle. The tags can say Annual for a perennial grown as one (garden sage: Annual and Perennial tags, a perennial life cycle) or Herbaceous Perennial for a biennial (rosepink); the Life Cycle can add a stray Annual (wild geranium). Its plain "Perennial" tag says only that the plant lives for years (oakleaf hydrangea has it beside Shrub): for an herb, a Perennial (baptisia and many wildflowers carry it and nothing else). "Perennial" beside Fern, Bulb, Grass/Sedge or Cactus is the life cycle, not a second form (NC State's Bulb takes in rhizomes and corms: crested iris is a "bulb" by its tags). A tree is one form, "Tree", however tall (until 2026-10 it was understory or canopy, by NC State's "Design Feature", and 35 trees waited on a person to say which): the app works out how a tree layers with what grows under it from its height (src/crowding.ts). USDA's habit: Forb/herb → Perennial if it lives for years, Annual if it's annual or biennial (both, where it lists both); Graminoid → Grass/Sedge; Vine → Vine; Shrub → Shrub (a vine that's also a shrub, lantana, is both); its "Perennial" backs only a plain perennial, and deciding alone it settles nothing where the catalog names a fern, bulb, grass, cactus or aquatic (a fern or bulb is a forb to USDA too). A cultivar with no page of its own keeps its species' form, unsettled where the species' deciding source lists a tree (a cultivar may be a tree or a shrub), until a person chooses from the forms the species' sources list (`form` in decisions.json, below: written `single`, since a person chose). |
| `height`, `width` | yes | — | `med` is the midpoint of `min` and `max`. A cultivar's size only from a page for the cultivar. |
| `zone_min`, `zone_max` | "USDA Plant Hardiness Zone" list | flag (minimum temperature) | See "Zones". |
| `sun_most`, `sun_least` | light | flag (shade tolerance) | |
| `water` | soil drainage and drought tolerance | flag (moisture use) | The water rule above. `Wetland` where USDA's National Wetland Plant List indicator is OBL or FACW in every region it lists for the plant. |
| `bloom_season` | "Flower Bloom Time" | fallback ("Bloom Period") | Seasons, as each source writes them: NC State's spring, summer, fall, winter; USDA's finer "Mid Spring" or "Late Winter" kept as written (its "Indeterminate" says nothing). USDA's within NC State's season backs it ("late spring" in "spring"). Never months: those depend on place, and come from flowering records where the garden is (docs/bloom-months.md). A web page's bloom line counts for seasons only, and not at all from a site south of the equator (by its country's domain: .au, .nz, .za and the like), where spring is September to November. A cultivar takes its species'. The earlier list's months (`bloom`) stay, labeled unverified. A plant without flowers has none: one whose USDA group isn't Dicot or Monocot (conifers, cycads, ginkgo, ferns and their allies); where USDA doesn't say, one whose NC State family is a conifer's, cycad's, ginkgo's or fern's (a fir from abroad); else one the catalog calls a fern and nothing else. Sources do give them one (USDA a bloom period for junipers, NC State a flower color for blue spruce), but it's their pollen cones or spores, so those claims are left out (claims.mjs `flowerless`). |
| `flower_color` | "Flower Color" | fallback ("Flower Color", and "Flower Conspicuous") | NC State's groups by their first color: Gold/Yellow → yellow, Purple/Lavender → purple, Red/Burgundy → red, Cream/Tan → cream, Brown/Copper → brown, Gray/Silver → silver; the rest by name. USDA's eight colors are among them. Another source's word goes to the group NC State puts it in (lavender, burgundy, gold, tan), violet to purple (a bluish purple). A value with a word in none of them (rose, magenta, coral, peach) isn't written at all: "Pink, Magenta" kept as pink, or "Violet, Red" as red, would say something its source didn't. NC State's "Insignificant", and USDA's "Flower Conspicuous: No", are `insignificant` (not showy). Sources agree where they share a color. A cultivar's only from a page for it. None for a plant without flowers (see `bloom_season`). |
| `native` | — | decides (native status) | NC State's region of origin often comes from USDA, so it isn't independent. The Arkansas atlas decides for Arkansas. Waiting on a format change. |
| `invasive` | — | invasive and noxious lists | Waiting on a format change and a sourced rule for "widely invasive". |
| Toxicity to people | poison severity, poison part, contact dermatitis, and "Poisonous to Humans" among its problems | — | Written as `poison`, in NC State's own terms: its severity (low, medium, high), the parts it names, and whether it irritates skin; a plant it lists as poisonous to humans with nothing more is `{}`. Its bare "Poisonous" plant-type tag isn't about people alone (star jasmine has it, its page calling it non-toxic to pets), so it counts for nothing by itself. A page that says nothing of poison at all is `null` ("None listed"), unless the species is rated. Shown for every plant NC State rates (Jason, 2026-10-23: "Mark anything poisonous to people"), beside "Edible" where a plant is both. Internally the audit also reads it as High or Medium → `major`, Low → `minor`, contact dermatitis → `dermatitis`, for the edible check (Medium goes to `major` because erring toward harmless is the dangerous mistake). Authorities agree only on exactly the same values. |
| Toxicity to dogs, cats, horses (`problem_for`) | "Problems": Problem for Dogs, Cats, Horses | — | Decided with Jason, 2026-10-25: the animals NC State lists it as a problem for. A warning only: a plant not listed isn't safe, and the app never says it is. (Its poison facts, about people, still don't stand in for pets.) |
| `deer` | resistance list | — | Listed for deer → `Resistant`. Otherwise `null`. |
| `nectar`, `bird` | — | — | `null`: no source gives a level. |
| `host` | "Wildlife Value" and its sentences | — | Only where a source says the plant is a larval host. Stored as the names it gives, never its sentence, and only names whose genus the Tallamy data lists as a butterfly or moth. Confirmed only where two sources name the same one. |
| `edible` | "Plant Type" tag Edible | — | The tag, not the free-text "Edibility" note. |
| `fall_color`, `fall_colors` | "Deciduous Leaf Fall Color" | — | The colors it lists. "Insignificant" alone is no fall color (`fall_color` no, since 2026-10-24; before, any value counted as yes); colors beside it are fall color. A word not mapped here says neither (nothing is read). A cultivar's colors only from a page for it: cultivars are bred for them ('Shenandoah' switchgrass). USDA's "Fall Conspicuous" is about the plant overall in fall, not leaf color. |
| `leaf_color` | "Leaf Color" | fallback ("Foliage Color") | Each color it lists, in the catalog's words: Gray/Silver → silver, Gold/Yellow → gold, Purple/Lavender → purple, Red/Burgundy → red, Brown/Copper → copper, Cream/Tan → cream; the rest by name. USDA's Gray-Green and White-Gray are silver, its Dark Green and Yellow-Green green. NC State's list takes in the seasons and the leaves' undersides, so it isn't read as the summer color (no filter rests on it). A cultivar's only from a page for it. |
| `foliage` | "Woody Plant Leaf Characteristics" | fallback ("Leaf Retention", of a tree or shrub) | Broadleaf or Needled Evergreen → evergreen; Semi-evergreen, or both an evergreen and Deciduous → semi-evergreen; Deciduous → deciduous. NC State gives it for woody plants and some herbs. USDA's Yes is evergreen, its No deciduous, read only where its growth habit is a tree, shrub or subshrub: it says No of every herb here, those NC State calls evergreen too, and No of English ivy (a vine). Of a plant NC State calls semi-evergreen, USDA's yes or no is set aside: it can neither back that nor contradict it. A cultivar takes its species'. |
| `needles` | "Needled Evergreen", or "Leaf Type" Needles | — | Yes or missing. |
| `growth_rate` | "Growth Rate" | fallback ("Growth Rate") | Slow, Medium (USDA: Moderate), Rapid → slow, medium, fast. A cultivar's only from a page for it. |
| `low_branched` | "Woody Plant Leaf Characteristics", "Design Feature", "Habit/Form" | — | Our reading of its tags, agreed 2026-10-22: a tree that's evergreen (Needled or Broadleaf Evergreen) and listed as a Hedge or Screen/Privacy keeps its branches to the ground (Green Giant arborvitae, Nellie Stevens holly, Carolina cherry laurel). A deciduous tree tagged as a screen (witch hazel) isn't one, nor an evergreen tagged only for its shape (sweetbay magnolia, pyramidal among other habits): their lower limbs can be taken up. A shrub's page can carry it too (a dwarf cultivar of a tree): the app reads it only for a tree. Yes or missing, never no. |
| `clay_ok` | soil texture | — | |
| `wet_feet` | soil drainage | — | |
| `maintenance` | — | — | `null`: NC State gives a level, not a task, and the catalog's values are tasks. |
| `maintenance_level` | "Maintenance": Low, Medium, High | — | Decided with Jason, 2026-10-25: NC State's level, its own fact beside the earlier list's tasks. |
| `attracts` | "Attracts" | — | Decided with Jason, 2026-10-25: its words, as a list (who visits, never a level: `nectar` and `bird` stay `null`). |
| `tolerates` | "Resistance To Challenges" | — | Decided with Jason, 2026-10-25: its words, as a list. |
| `thorns` | stem "Appendage" (Prickles, Spines, Thorns), or "Spines/Thorns" under "Problems" | — | Decided with Jason, 2026-10-25. Yes or missing. Not written for a plant named thornless (it goes to the review). |
| `winter_interest` | "Landscape Theme": Winter Garden | — | Decided with Jason, 2026-10-25. Yes or missing. |
| `bark`, `bark_color` | Bark "Surface/Attachment", "Bark Color" | — | Asked for by Jason, 2026-10-25 (what makes a plant's winter interest: "exfoliating bark"). Its words, as lists (Ridges, Lenticels as given). Bark color is a cultivar's only from a page for it. |
| `stem_color`, `fruit_color` | Stem "Stem Color", Fruit "Fruit Color" | — | Asked for by Jason, 2026-10-25. NC State's color groups, lower case ("red/burgundy"); "Insignificant" isn't kept. A cultivar's only from a page for it. |
| `fruit_season` | Fruit "Display/Harvest Time" | — | Asked for by Jason, 2026-10-25: when its fruit is there to see; "winter" is fruit that stays into winter. |
| `self_seed`, `dry_shade`, `taproot`, `humidity`, `trunk`, `habit` | — | — | `null` unless a source states it. |

## Decisions

What the build can't settle from its sources goes on the review list (docs/catalog-review.md). A person's
answer goes in `scripts/catalog/decisions.json`, with the date and who decided, and every build applies it, so
the item isn't listed again. A decision only chooses among what the sources say, or says how a source is read:
it never adds a value no source gives (a form chosen that no source lists is refused, and the item stays
listed). The kinds the build applies:

- **`form`**: a cultivar with no page of its own, whose species' sources list a tree: the forms it takes,
  primary first (at most three), written with the authorities that list them. Always `single`, never
  `confirmed`: the sources list the species as either form, and a person chose which the cultivar is.
- **`edible`**: a plant a source calls edible that's rated toxic (to dogs on the older list, or seriously
  toxic to people): true writes the source's "edible", with what the source lists as poisonous shown beside it
  (`poison`), where it lists any (Japanese plum's rating is the older list's, for dogs); false leaves edible as it
  was, taking out an older unsourced "yes".
- **`nativeShown`**: a plant the catalog calls exotic that Kew's checklist has native in some states: shown
  native there all the same, said as its species' ("Its species is native to New York": wild.mjs). Where Kew's only native area is a territory (lantana: Puerto Rico), it
  changes nothing in the 50 states. When the catalog's North America-wide native status comes from Kew, the
  territories stay out of North America.
- **`kewNames`**: names Kew's checklist could read two ways, checked to be read as its accepted name, by
  that name's authors (wcvp.mjs). A later checklist that accepts the other homonym lists it again.
- **`genusPage`**: a plant read from NC State's page for its whole genus, its facts checked to fit it.
- **`split`**: a record of several cultivars ("Ficus carica ('Celeste' / 'Brown Turkey' / 'Chicago Hardy')"), made
  one record per cultivar (split.mjs; Jason, 2026-10-25: cultivars get their own records). The record keeps its id
  for the cultivar whose size it showed (`keep`), so plants placed from it don't change; it's renamed for it, its old
  name kept as a synonym. Each other cultivar gets a record of its own: from its own NC State page, added by the
  build like any page no record reads; or, with no page, names alone, taking its species' size until a source gives
  its own (`inherits`, said in the app as its species'). No value is written by hand: the names were the record's.
  Made with the split too (Jason, 2026-10-27): a cultivar its page files under a species Kew keeps apart from its own
  (`species`: Kew's, below), a plant the record named that isn't one of its cultivars (`botanical`: "Hemerocallis
  ('Happy Returns' / spider types)" gave a record for the genus, reading NC State's Hemerocallis page; "Crinum ('Milk
  and Wine' / bulbispermum)", one for Crinum bulbispermum, named from its sources once they give a name), and the
  species record a split needs where the catalog has none (an entry's `species`, named by a source: NC State calls
  'Climax' a rabbiteye blueberry). A decision made on the record before the split (its form, whether it's edible)
  goes with each cultivar split from it, its note saying so.
- **`cultivar`**: a record naming one cultivar beside its species ("Aucuba japonica ('Gold Dust')"), renamed for
  it ("Aucuba 'Gold Dust'") and put under its species, as a split's kept record is.
- **`kewSpecies`**: a cultivar NC State files under a species Kew keeps apart from its own, put under Kew's (below).
- **`parent`**: a cultivar put under a species its own name doesn't give, where its page names it: 'Edward Goucher'
  glossy abelia, a cross of Abelia × grandiflora and A. schumannii that NC State names by the genus alone. It takes
  its species' facts only where its own page says nothing, as any cultivar does.
- **`fold`**: a record whose plants all have records of their own ("Culinary sage & oregano"): it goes, and the
  catalog's `meta.moved` says which record its id stands for (`into`), so a plant placed from it shows that
  record's facts (docs/catalog-format.md).
- **`group`**: a record kept for a group of cultivars ("Asparagus officinalis ('Jersey' / 'Millennium')"), read from
  its species' NC State page as its own, its size included, where a cultivar's would be its own page's alone.

### Kew's species

A cultivar goes under the species Kew's checklist accepts (Jason, 2026-10-27). NC State files the rabbiteye
blueberries under Vaccinium corymbosum (its page for V. virgatum leads to its V. corymbosum page), and its pages for
'Climax' and 'Premier' say they are rabbiteyes; Kew keeps rabbiteye, V. virgatum, apart from highbush. So the catalog
has a record for V. virgatum, and they go under it, each still reading its own NC State page (its name there accepted
in ncsu-pages.json `names`). Which species a cultivar is comes from a source's own words, never from the catalog's
guess.

The build lists the others it finds, rather than moving them: where NC State's page for a species leads to another
species' page and Kew keeps the two apart (ncsu-pages.json gives the first no page), each cultivar the catalog reads
from a page under the second whose names or description call it the first's, by the first's names
(docs/catalog-review.md, "Under a species Kew keeps apart"). Moving one is a decision (`kewSpecies`).

The first answers (2026-10-23) came from a page of cards built from the review list, one per item, with what
each source says.

## Zones

The 2023 USDA map divides zones into 10 °F bands. Zone *n* covers
−60 + 10(*n* − 1) °F up to 10 °F warmer. Half-zone a is the colder 5 °F,
b the warmer. The catalog stores zones on a half-zone scale (7a is 7, 7b is
7.5; docs/catalog-format.md), so a half-zone the source gives is kept, and
a whole zone covers both halves (a coldest zone "7" is 7, a warmest zone
"9" is 9.5).

- **From USDA's minimum temperature *T*:** the coldest half-zone that sits
  entirely at or above *T*: ⌈(*T* + 60) / 5⌉ / 2 + 1, clamped to 1–13.5.
  Example: redbud, −28 °F → 4.5 (4b). Zone 4a reaches down to −30 °F,
  which is colder than USDA says redbud takes.
- **From NC State's list ("4a, 4b, … 9b"):** `zone_min` is its coldest
  entry (4a → 4, 4b → 4.5) and `zone_max` its warmest (9a → 9, 9b → 9.5).
  For comparing, its coldest entry is also a temperature *L*, the bottom of
  that half-zone (4a → −30 °F, 4b → −25 °F).
- **Agreeing:** two sources' zones agree within one whole zone (10 °F),
  the same half-zone scale both ways. Whole-zone ratings are rounded to
  begin with, so a half-zone apart is noise, not a dispute.
- **Deciding:** by the tiers ("Deciding each fact"): an authority's zone is
  stored; authorities more than a zone apart are `disputed`, for the
  review. USDA's temperature is only a flag, shown where it's more than a
  zone from what was decided (pink muhly: NC State zone 5, USDA 7 °F, about
  8a).

In the app, a garden in the end half-zone of a plant's range (a 7a garden,
a plant rated from zone 7) is at the edge of its range: still hardy there,
with a line of advice. Outside the range it isn't counted as hardy. Zones
1a and 13b are the ends of the map, so a range reaching them has no edge
there.

## Waiting on format changes

Each of these is its own pull request with a migration, before the audit
writes that fact.

- **How sure.** `check` holds `agree`, `disputed` or `single` today. The
  tiers add `confirmed` (for `agree`), `likely` and `reported`, and the app
  labels a `likely` or `reported` fact as from nurseries rather than an
  authority.
- **Sources by the hundred.** Search finds many sites, so a fact's `src`
  names sites (`provenwinners.com`), and `meta.sources` gets an entry for
  each, with its kind.

- **Bloom seasons** (landed 2026-10-25). The national sources give seasons,
  not months, and the months a season covers shift with place, so turning
  one into months would be our guess. Seasons became their own fact,
  `bloom_season`, and flower colors theirs, `flower_color`, each with its
  own sources; `bloom` keeps the earlier list's months and color, labeled
  unverified, for the bloom calendar. Months where the garden is come from
  flowering records (docs/bloom-months.md); a regional source's months for
  its state wait on "Values by region".
- **Toxicity by animal.** `tox` is one fact today, with one `src` and
  `check`, and no part of it can be `null`. Each animal needs its own
  source, check and `null`, as people have had since 2026-10-23 (`poison`). The `unlisted` value is defined in
  ASPCA's terms and gets a source-neutral meaning, and the app's own wording
  that names ASPCA (src/plants.ts) changes with it.
  Until then (agreed with Jason 2026-10-25): the older list's dog warning
  for one record shows, labeled, on every record of its species
  (`shareDogWarnings`), a plant with no rating says "not yet rated" rather
  than nothing, and the picker's dog filter is three-way: include toxic
  plants; hide toxic plants, include unknown; only non-toxic (unverified).
  Requests to use their ratings: ASPCA and Pet Poison Helpline (both sent by
  Jason, the second on 2026-10-25).
  If neither comes through, look at open government sources (Canada's
  Poisonous Plants Information System, the FDA Poisonous Plant Database:
  licenses and coverage not yet checked) before dropping pet toxicity.
- **Native by state.** `native` is the first compendium's wording, not
  USDA's native status by state.
- **Invasive.** "Widely invasive in the US" needs a rule built on sourced
  state or federal lists.
  Cultivars (agreed with Jason 2026-10-25): a cultivar takes its species'
  invasive flag, unless an authority rates the cultivar itself differently
  (a sterile or low-fruiting selection). Such a cultivar is offered, with a
  warning that its species is invasive, citing the rating. None has one yet.
- **Values by region.** One value per fact can't hold Minnesota's bloom
  months beside Arkansas's, or a water need that differs by climate. Facts
  that depend on place need a value per region, and the app shows the one
  nearest the garden.

## Unverified until each fact is

`audited` means the audit has been through every fact on a record. It
doesn't vouch for a fact the audit couldn't source. That fact keeps
`compendium` in its `src` and stays labeled unverified. So the app has to
label per fact, by the trust of each fact's sources, rather than per record.
That change lands before any record gets an `audited` date.

## How the audit runs

Steps 2 to 5, from the pages already saved, are one command: `npm run catalog:build` ([catalog-build.md](catalog-build.md)).
With `--fetch`, it first fetches the pages the list needs; the web search runs on its own. It writes what's waiting
on a person into [catalog-review.md](catalog-review.md). The steps:

1. **Fetch.** Each plant is read from each source at that source's pace.
   Raw pages go in `catalog-src/` (git-ignored), named by source and date.
2. **Extract.** One script per source turns its pages into facts using the
   rules above. Its test fixtures are committed, trimmed to the field labels
   and values the script reads, with no descriptive text.
3. **Compare.** `scripts/catalog/sample.mjs` combines each plant's claims
   by the rules above (with the web search's claims, `search.mjs`).
4. **Write.** `npm run catalog:write -- <combined.json> --date <day the
   pages were read> --review review.json` writes each settled fact into `public/plants.json` with its
   `src`, `check` and, where other sources differ, `alt`; a
   record whose facts change (or that had none audited) gets its `audited` date,
   and one left as it was keeps its own. A fact the audit
   couldn't settle (unknown, unsettled, disputed) keeps the catalog's
   current value, still labeled unverified (its only source is the
   compendium), and a disputed one goes on the review list. So do values
   that would make the record implausible (the app's `catalogWarnings`:
   inches read as feet, a zone or sun range backwards), which are held back,
   and "edible" on a plant rated toxic to dogs or seriously toxic to people,
   unless a person decided it (`edible` in decisions.json, "Decisions").
   A nursery's report on a pair (the zones, the sun levels) is one
   nursery's whole range, kept only where both halves are written. It
   removes a value only where a person decided against it (an older,
   unsourced "edible"). Web sources are added to `meta.sources` by domain:
   `reference` for authorities, `nursery` for nurseries and breeders.
   Toxicity to people is written as `poison`; bloom seasons and flower
   colors as `bloom_season` and `flower_color`; caterpillar hosts as `hosts`
   and `host_genus`. Native status and toxicity to animals wait on their
   format changes ("Waiting on format changes").
5. **Review.** The review list, and `npm run catalog:check` for implausible
   values, plants neither source has, and facts left `null`.
6. **Start small.** First 20 plants, mixing species and cultivars, trees and
   perennials. The mapping rules marked above are settled on those before
   the rest.
