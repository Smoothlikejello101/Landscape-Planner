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
extension service's plant database. Only a host that
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
| **USDA PLANTS** (NRCS) | Use | **License:** US government work (17 U.S.C. § 105). The data.gov listing for PLANTS also gives CC0, though it is titled for the name list. **robots.txt:** none on the API host (`plantsservices.sc.egov.usda.gov`, the API the PLANTS site uses). **Reading:** check the downloads page (plants.sc.egov.usda.gov/home/downloads) first, then the API at 1 request every 2 s. |
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
| **Atlas of the Vascular Plants of Arkansas** (2013) | Arkansas county distribution; introduced, native, invasive status; 2,892 taxa | about 540 | No robots.txt on its host. "Free download edition. Not for commercial sale": we cite its facts and never ship the PDF. |
| **UGA "Native Plants for Georgia"** bulletins | Zones, size, native range, habitat, wildlife and host notes, under fixed headings | about 94 (one part) | Allowed. Its footer's copyright page wasn't read. |
| **Tennessee Smart Yards Native Plant Database** (tynnativeplants.wordpress.com, linked from UT's tnyards.utk.edu) | Light, moisture, soil, height, bloom season, Tennessee region, wildlife | about 130 | WordPress.com defaults (UT's own site: crawl delay 30). No terms found. Confirm UT owns it before use. WordPress.com's own robots.txt applies too (its parent host). |
| **Clemson HGIC**, **LSU AgCenter**, **Alabama Extension** (crawl delay 2), **Wisconsin Horticulture**, **Penn State** (crawl delay 10), **Purdue** (crawl delay 3), **UMD**, **UNH**, **UVM**, **Missouri, Ohio State and Maine Extension** | Narrative fact sheets | small each | © notices, or statements about copying the material. |
| **Oregon State Landscape Plants** (crawl delay 10), **Colorado State Extension**, **Plant Select**, **Conservation Garden Park** (Utah), **AMWUA** (Arizona), **Texas SmartScape** | Zones, size, sun, water, soil; Plant Select and Conservation Garden Park add deer, pollinators and (CGP) **bloom months** | small to medium | © notices only. Plant Select asks permission for stories and photos, which we don't use. |
| **Shropshire & Tallamy 2025** caterpillar host-plant dataset (University of Delaware) | Which caterpillars use which plant genera, 7,423 species | genus level | CC0 at the university's repository and on Zenodo (record 17747343, the copy we read); the journal's copy says ODbL, which allows commercial use with credit. |
| **Virginia DCR Native Plant Finder** | About 1,600 natives with sun, moisture and pollinator flags, offered as CSV | not measured | Allowed. Copyright notice, with fair use granted and a request asked when in doubt (web@dcr.virginia.gov): a courtesy note before use. |
| **Kew World Checklist of Vascular Plants** | Accepted names and native range worldwide | all species | CC BY. Confirm the range table is in the download. |

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
   AI-written sites (Wikipedia, Dave's Garden, iNaturalist…); marketplaces
   and social media; and pages read another way already (NC State's
   toolbox, Minnesota Wildflowers, USDA).
3. **Terms.** Each new site's terms are read by pattern, the same reading as
   "How terms are read", cautiously: its home page's links to terms, legal
   or copyright pages, else the usual places (`/terms`,
   `/terms-of-use`, `/policies/terms-of-service`…). A sentence banning
   robots, scrapers, crawlers or automated access closes it (**not by
   bot**); one banning commercial use or a database of its content makes it
   **ask first**. Either way its pages aren't read. A site with no terms to
   find is read, as "No terms found" sources are above. The reading and the
   sentence that decided it are kept in `catalog-src/site-terms.json`, and a
   site we lean on has its terms read by a person before launch.
4. **Fetch.** Through the fetcher: robots.txt, pace (`web`: 5 s a site),
   refusals and the honest user agent, as for every source. Redirects
   within a site are followed, each one fetched by the same rules.
5. **Read.** Only labeled spec lines ("Hardiness Zones: 5–9", "Mature
   Height: 3–4 ft", "Light: Full sun to part shade"), never prose, and only
   from a page that names the plant (for a cultivar, the cultivar's name).
   A cultivar's size, form and flower color come only from a page for the
   cultivar.

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
  Winners, Monrovia, First Editions…). Its primary source for that cultivar's
  own traits. On a species it counts as a nursery.
- **Nursery:** a retail grower or shop.
- **Blog:** anything else that is open to us: garden writers, societies'
  articles, magazines.

**Tiers.**
- **Safety** (toxicity, invasiveness, native status): authorities only.
  These are what could hurt someone or expose us to liability; a value from
  a shop or blog never stands in.
- **Survival** (zones, sun, water, size, soil, deer): an authority decides.
  Where none has it: a breeder for its own cultivar; then retail nurseries,
  where most agree (`likely`) or one says it (`reported`).
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
paragraph are one source, wherever they're published, and so are two
pages on one site. A source compiled from another (many extension sheets
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

**Water** is what a plant needs, not what it tolerates. From NC State's
soil fields: **High** where it grows wet (frequent standing water, or
occasionally wet without good drainage); **Low** where it takes real dry
(very dry, or drought-tolerant and occasionally dry, without moist soil
listed); **Moderate** otherwise. Witch hazel (moist to occasionally wet,
good drainage) is Moderate; red oak (occasionally dry, good drainage, moist)
Moderate.

**Caterpillar hosts** come from every source that says so: tables, and
sentences naming a host ("larval host for the X (Genus species)",
"host plant for the X butterfly"). The Shropshire & Tallamy dataset (CC0)
adds the caterpillars recorded on each plant genus, as its own fact
(`host_genus`: how many native species use the genus, how many of those
live in Arkansas, and those butterflies by name), since it's genus-level.
scripts/catalog/tallamy.py builds the index from the spreadsheet on Zenodo
(record 17747343, CC0). The `host` fact is the list of names, never a
source's sentence.

The table below names the national sources' fields and how they map.
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

| Fact | Decides | Checks | USDA stands in? | Rule |
| --- | --- | --- | --- | --- |
| Names, `usda` symbol, synonyms | USDA | NC State | — | USDA's accepted name. A cultivar keeps its name and points to its species. |
| `form` | NC State "Plant Type" | USDA growth habit and duration | Yes | NC State's Tree, Shrub, Vine, Fern, Bulb and Cactus/Succulent tags map to the enum of the same name; Ornamental Grasses and Sedges → Grass/Sedge; Annual → Annual; Herbaceous Perennial → Perennial; Aquatic → Aquatic/Emergent. Other tags (Edible, Native Plant…) are ignored. If NC State gives more than one form, USDA decides when its growth habit names exactly one of them; otherwise `disputed` (redbud: Shrub and Tree at both). The kind of tree comes from NC State's "Design Feature": Understory Tree → "Tree (understory)", Shade Tree → "Tree (canopy)"; both or neither → `null`. |
| `height`, `width` | NC State | — | No | `med` is the midpoint of `min` and `max`. Most sizes stay `single` until a second garden source agrees. |
| `zone_min` | NC State | USDA minimum temperature | Yes | See "Zones". |
| `zone_max` | NC State | — | No | |
| `sun_least` | NC State light | USDA shade tolerance | Yes | Map USDA's distinct shade-tolerance values only after listing them from the 20-plant sample. They often differ from NC State: redbud is "Low" at USDA, and NC State lists part shade. |
| `sun_most` | NC State light | — | No | |
| `water` | NC State soil drainage and drought tolerance | USDA moisture use (a flag) | No | The water rule above. `Wetland` where USDA's National Wetland Plant List indicator is OBL or FACW in every region it lists for the plant. |
| `bloom` | NC State | USDA | Yes | Seasons only: see "Waiting on format changes". |
| `native` | USDA native status and state distribution | — | — | `single`. NC State's region of origin often comes from USDA, so it isn't independent. Waiting on a format change. |
| `invasive` | USDA invasive and noxious lists | — | — | Waiting on a format change and a sourced rule for "widely invasive". |
| Toxicity to people | NC State poison severity and contact dermatitis | UC ANR, if it says yes | No | High or Medium → `major`, Low → `minor`, contact dermatitis → `dermatitis`. Oxalates only from UC ANR, if it says yes. (Medium goes to `major` because erring toward harmless is the dangerous mistake.) |
| Toxicity to dogs, cats, horses | — | — | — | No usable source yet. NC State's poison facts are about people, and toxicity to people doesn't stand in for pets. |
| `deer` | NC State resistance list | — | No | Listed for deer → `Resistant`. Otherwise `null`. |
| `nectar`, `bird` | — | — | — | `null`: neither source gives a level. |
| `host` | Every source that names one; Shropshire & Tallamy by genus | — | No | Only where a source says the plant is a larval host. Stored as the butterflies or moths it names, never its sentence. |
| `edible` | NC State "Plant Type" tag Edible | USDA "Palatable Human" | No | The tag, not the free-text "Edibility" note. |
| `fall_color` | NC State "Deciduous Leaf Fall Color" | — | No | USDA's "Fall Conspicuous" is about the plant overall in fall, not leaf color (redbud: No at USDA, gold at NC State). |
| `clay_ok` | NC State soil texture | USDA fine-textured soils | Yes | |
| `wet_feet` | NC State soil drainage | USDA anaerobic tolerance | Yes | |
| `maintenance` | — | — | — | `null`: NC State gives a level, not a task, and the catalog's values are tasks. |
| `thorns`, `winter_interest`, `self_seed`, `dry_shade`, `taproot`, `humidity`, `trunk`, `habit` | Settled on the 20-plant sample | — | — | `null` unless a source states it. |

## Zones

The 2023 USDA map divides zones into 10 °F bands. Zone *n* covers
−60 + 10(*n* − 1) °F up to 10 °F warmer. Half-zone a is the colder 5 °F,
b the warmer.

- **From USDA's minimum temperature *T*:** the coldest whole zone that sits
  entirely at or above *T*: *n* = ⌈(*T* + 60) / 10⌉ + 1, clamped to 1–13.
  Example: redbud, −28 °F → zone 5. Zone 4 reaches down to −30 °F, which
  is colder than USDA says redbud takes.
- **From NC State's list ("4a, 4b, … 9b"):** for `zone_min`, the bottom of
  its coldest entry as a temperature *L* (4a → −30 °F, 4b → −25 °F), then
  the same formula (4a → 4, 4b → 5: zone 4 would include 4a, which NC State
  doesn't claim). For `zone_max`, the whole zone of its warmest entry
  (9a or 9b → 9).
- **They agree** when *L* and *T* are no more than 5 °F apart. NC State's
  zone is stored. Redbud: NC State −30 °F, USDA −28 °F → `agree`, stored as
  zone 4. That's 2 °F more generous than USDA alone, within what its
  approximations claim.
- **They differ by more:** the warmer of the two temperatures decides,
  turned into a whole zone by the formula above, with `check: "disputed"`.
  The source that gave the value is listed first in `src`. Example: NC State
  4a (−30 °F), USDA −20 °F → zone 5, `src: ["usda", "ncsu"]`.
- **Only one of them:** its zone as above, `single`.

Plants are rated in whole zones while gardens have half-zones, so a plant
rated 4b is stored as 5. Storing half-zones would be another format change.

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

1. **Fetch.** Each plant is read from each source at that source's pace.
   Raw pages go in `catalog-src/` (git-ignored), named by source and date.
2. **Extract.** One script per source turns its pages into facts using the
   rules above. Its test fixtures are committed, trimmed to the field labels
   and values the script reads, with no descriptive text.
3. **Compare.** Each fact is written with its `src` and `check`, and the
   record gets its `audited` date.
4. **Review.** `npm run catalog:check` lists disputed values, plants
   neither source has, and facts left `null`.
5. **Start small.** First 20 plants, mixing species and cultivars, trees and
   perennials. The mapping rules marked above are settled on those before
   the rest.
