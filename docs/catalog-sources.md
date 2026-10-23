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
never copied.

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
- **Survival** (zones, sun, water, size, soil, deer): an authority decides.
  Where none has it: a breeder for its own cultivar; then retail nurseries,
  where most agree (`likely`) or one says it (`reported`). Never a blog.
- **Description** (form, bloom, flower color, fall color, wildlife,
  edibility): any source, highest kind first.

**How sure.** Each fact gets a `check`:
- `confirmed`: an authority decides, and an independent source agrees.
- `single`: one authority, nothing else.
- `likely`: no authority; most of the independent lower-kind sources that
  give it agree.
- `reported`: one lower-kind source.
- `disputed`: authorities disagree; or below them, there's no majority.
Lower-kind sources that disagree with the decider are kept as notes for the
review. (`likely` and `reported` wait on the format change that adds them:
see "Waiting on format changes".)

**Independent.** Copies count once. Two pages with the same longest
paragraph are one source, wherever they're published, and the highest kind
among them keeps it (a shop copying an extension sheet doesn't stand in for
the extension). Two pages on one site are one source too. A source compiled from another (many extension sheets
cite USDA or NC State) isn't independent of it.

**USDA PLANTS** describes species as they grow wild, and its own notes call
its garden figures approximations. So its temperature, shade and moisture
values are **flags only**: shown to the review where they differ from what
was decided (zones by more than a whole zone), never deciding or checking.
The exception is native status, where USDA is the national authority and
decides.

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
(`host_genus`: how many native species use the genus, how many of those
live in Arkansas, and those butterflies by name), since it's genus-level.
scripts/catalog/tallamy.py builds the index from the spreadsheet on Zenodo
(record 17747343, CC0). The `host` fact is the list of names, never a
source's sentence.

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
| `form` | "Plant Type" | fallback (growth habit and lifespan) | A list of up to three, the catalog's current form first. One source decides: an authority's or the breeder's page for the cultivar itself, else NC State, else USDA's habit, else the nursery others back most. Its forms are the answer; the catalog's form only orders them, never supplies one. A form another independent source also lists is backed: confirmed when every form is (likely, without an authority), else single (reported), the unbacked ones noted. Another source listing a form the decider doesn't is noted; another authority sharing none of its forms makes it disputed (USDA's habit too, though its "Perennial" isn't against a fern, bulb, grass, cactus or aquatic). NC State's Tree, Shrub, Vine, Fern, Bulb and Cactus/Succulent tags map to the enum of the same name; Ornamental Grasses and Sedges → Grass/Sedge; Annual → Annual; Herbaceous Perennial → Perennial; Aquatic and Water Plant → Aquatic/Emergent; its "Perennial" (any plant that isn't annual), Herb, Wildflower and other tags are ignored. "Perennial" beside Fern, Bulb, Grass/Sedge or Cactus is the life cycle, not a second form (NC State's Bulb takes in rhizomes and corms: crested iris is a "bulb" by its tags). A tree is understory or canopy by NC State's "Design Feature" (Understory Tree or Small Tree; Shade Tree); otherwise it's a plain Tree, which takes the kind exactly one other authority names, else the form is unsettled (a small tree never becomes just a shrub); USDA's Tree is always plain and backs either kind. USDA's habit: Forb/herb → Perennial if it lives for years, Annual if it's annual or biennial (both, where it lists both); Graminoid → Grass/Sedge; Vine → Vine; Shrub → Shrub; its "Perennial" backs only a plain perennial, and deciding alone it settles nothing where the catalog names a fern, bulb, grass, cactus or aquatic (a fern or bulb is a forb to USDA too). A cultivar with no page of its own keeps its species' form, unsettled where the species' deciding source lists a tree (a cultivar may be a tree or a shrub). |
| `height`, `width` | yes | — | `med` is the midpoint of `min` and `max`. A cultivar's size only from a page for the cultivar. |
| `zone_min`, `zone_max` | "USDA Plant Hardiness Zone" list | flag (minimum temperature) | See "Zones". |
| `sun_most`, `sun_least` | light | flag (shade tolerance) | |
| `water` | soil drainage and drought tolerance | flag (moisture use) | The water rule above. `Wetland` where USDA's National Wetland Plant List indicator is OBL or FACW in every region it lists for the plant. |
| `bloom` | seasons | — | Seasons only: see "Waiting on format changes". |
| `native` | — | decides (native status) | NC State's region of origin often comes from USDA, so it isn't independent. The Arkansas atlas decides for Arkansas. Waiting on a format change. |
| `invasive` | — | invasive and noxious lists | Waiting on a format change and a sourced rule for "widely invasive". |
| Toxicity to people | poison severity and contact dermatitis | — | High or Medium → `major`, Low → `minor`, contact dermatitis → `dermatitis`. (Medium goes to `major` because erring toward harmless is the dangerous mistake.) Authorities agree only on exactly the same values. |
| Toxicity to dogs, cats, horses | — | — | No usable source yet. NC State's poison facts are about people, and toxicity to people doesn't stand in for pets. |
| `deer` | resistance list | — | Listed for deer → `Resistant`. Otherwise `null`. |
| `nectar`, `bird` | — | — | `null`: no source gives a level. |
| `host` | "Wildlife Value" and its sentences | — | Only where a source says the plant is a larval host. Stored as the names it gives, never its sentence, and only names whose genus the Tallamy data lists as a butterfly or moth. Confirmed only where two sources name the same one. |
| `edible` | "Plant Type" tag Edible | — | The tag, not the free-text "Edibility" note. |
| `fall_color` | "Deciduous Leaf Fall Color" | — | USDA's "Fall Conspicuous" is about the plant overall in fall, not leaf color. |
| `clay_ok` | soil texture | — | |
| `wet_feet` | soil drainage | — | |
| `maintenance` | — | — | `null`: NC State gives a level, not a task, and the catalog's values are tasks. |
| `thorns`, `winter_interest`, `self_seed`, `dry_shade`, `taproot`, `humidity`, `trunk`, `habit` | — | — | `null` unless a source states it. |

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

- **Bloom seasons.** The national sources give seasons, not months, and
  the months a season covers shift with place, so turning one into months
  would be our guess. Some regional sources give months for their state. A bloom fact may then be a season
  (`{ "season": ["spring"] }`) as well as months. Until it lands, the audit leaves
  `bloom` as it is: the compendium's value, labeled unverified.
- **Toxicity by animal.** `tox` is one fact today, with one `src` and
  `check`, and no part of it can be `null`. People and each animal need
  their own source, check and `null`. The `unlisted` value is defined in
  ASPCA's terms and gets a source-neutral meaning, and the app's own wording
  that names ASPCA (src/plants.ts) changes with it.
- **Native by state.** `native` is the first compendium's wording, not
  USDA's native status by state.
- **Invasive.** "Widely invasive in the US" needs a rule built on sourced
  state or federal lists.
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
   `src`, `check` and, where nurseries differ from the authority, `alt`; a
   record with any fact written gets its `audited` date. A fact the audit
   couldn't settle (unknown, unsettled, disputed) keeps the catalog's
   current value, still labeled unverified (its only source is the
   compendium), and a disputed one goes on the review list. So do values
   that would make the record implausible (the app's `catalogWarnings`:
   inches read as feet, a zone or sun range backwards), which are held back,
   and "edible" on a plant rated toxic to dogs or seriously toxic to people.
   A nursery's report on a pair (the zones, the sun levels) is one
   nursery's whole range, kept only where both halves are written. It never
   removes a value. Web sources are added to `meta.sources` by domain:
   `reference` for authorities, `nursery` for nurseries and breeders.
   Native status, toxicity, caterpillar hosts and bloom wait on their format
   changes ("Waiting on format changes").
5. **Review.** The review list, and `npm run catalog:check` for implausible
   values, plants neither source has, and facts left `null`.
6. **Start small.** First 20 plants, mixing species and cultivars, trees and
   perennials. The mapping rules marked above are settled on those before
   the rest.
