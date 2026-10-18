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
   audit, so groups for `ClaudeBot`, `Claude-User` and `Claude-SearchBot`
   count too. A `Disallow` means no automated reading, whatever the terms
   say.
2. **Terms of use and any data license.** Do they allow automated access?
   Do they allow use in a paid product? A terms page that says nothing about
   data grants nothing. It only means nothing forbids taking facts.
3. **How we read it.** First a download, then an API the site itself uses,
   and only then page by page. Keep to the slowest of: the site's crawl
   delay, our pace for that source, or 1 request every 2 seconds.

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

The same reading for every source:

- **Open:** public domain, an open data license, or explicit permission to
  reuse with credit. Use.
- **Copyright notice only** ("© … All rights reserved", or a Creative
  Commons license on the documents, NonCommercial included). These protect
  the wording, tables and photos, not the facts in them. Use for facts in
  our own words, with a courtesy note before launch for any source we lean
  on.
- **Terms that forbid it:** terms of use that bar commercial use of the
  site's content, copying into a database, or automated access, whatever
  they call it. Ask first; until a yes, not used, not even by hand.
- **Closed to bots:** robots.txt disallows the pages for `*` or for a Claude
  agent, or the site challenges or blocks non-browsers (Cloudflare, Incapsula,
  "are you human" pages), or robots.txt itself can't be read (an error counts
  as "disallow all"). Not read by bot.

We're not lawyers. This is a cautious reading, to be checked with one
before launch.

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

Checked 2026-10-17, by the reading above. "Matches" is how many catalog
plants have a page there, by name: a rough count, since some sites name
pages by common name.

### Use now

| Source | Gives | Matches | Notes |
| --- | --- | --- | --- |
| **UMN Extension Plant Elements of Design** (plantsearch.extension.umn.edu) | Zones, height, spread, soil, flower color, seasons of interest, invasive flag. Structured, 2,314 records with cultivars | not measured (no list) | No robots.txt. © notice only. |
| **Mt. Cuba Center** plants and trials | Zones, sun, moisture, pH, bloom season; trials give **peak bloom month**, weeks in bloom, 3-year size, disease ratings for cultivars | about 205 | Crawl delay 10. No terms found. |
| **Minnesota Wildflowers** | Native status, habitat (sun, moisture), **bloom months**, height, wetland status. Wild Minnesota species | about 307 | Its terms say facts can't be copyrighted, only the wording. |
| **Illinois Wildflowers** (John Hilty) | Height, bloom season and length, sun, moisture, soil, range, and detailed wildlife: bees, caterpillar hosts, birds, browsing | not measured | © notice only. |
| **Chicago Botanic Garden plant evaluation notes** | Ratings, **bloom months**, height, disease, winter injury for trialed cultivars (PDFs) | not measured | Image terms only. |
| **Rutgers deer-resistance ratings** (E271) | A–D deer damage rating, 527 plants | not measured | © notice only. Cite the rating, never copy the list. |
| **Illinois Extension HortAnswers** | Height, zone, **bloom months**, soil, light | small | © notice only. |
| **UF/IFAS EDIS tree and shrub sheets** (Gilman and Watson) | Zones, origin, UF invasive status, height, spread, light, soil (clay, wet, drought, salt), maintenance. Structured, 634 woody plants | about 26 | Documents CC BY-NC-ND: facts only. |
| **Cornell Woody Plants Database** | Height, shape, light, zone, pH, salt and moisture tolerance, invasiveness, native origin. Structured, about 500 woody plants | not measured | CC BY-NC-SA: facts only. Robots allows all. |
| **Virginia Cooperative Extension publications** | Narrative and lists | — | Explicit: "available for public use, reprint, or citation without further permission", with credit. |
| **University of Arkansas Plant of the Week** | Native range, Arkansas nativity, size, bloom in prose, wildlife notes. Narrative, 1,016 articles | about 109 | No terms found. |
| **Atlas of the Vascular Plants of Arkansas** (2013) | Arkansas county distribution, introduced / native / invasive status, 2,892 taxa | about 552 | "Free download edition. Not for commercial sale": we cite its facts and never ship the PDF. |
| **UGA "Native Plants for Georgia"** bulletins | Zones, size, native range, habitat, wildlife and host notes, in fixed headings | about 94 (one part) | No terms found. |
| **Tennessee Smart Yards native plants** (UT) | Light, moisture, soil, height, bloom season, Tennessee region, wildlife | about 242 | No terms found. |
| **Clemson HGIC**, **LSU AgCenter**, **Alabama Extension**, **Wisconsin Horticulture**, **Penn State**, **Purdue**, **UMD**, **UNH**, **UVM**, **Iowa State Yard and Garden** (the yardandgarden subdomain only) | Narrative fact sheets | small each | © notices only. Iowa State's articles "may be republished … if credit is given". |
| **SelecTree** (Cal Poly) | Trees: USDA zones, size, water, soil, pH, shade, deer palatability, a poisonous flag (not pet-specific), wildlife, native range, California invasive status. Structured, about 1,500 | not measured | Robots allows all; reads its own public JSON API. No terms found. |
| **WUCOLS** (UC Davis) | Water use by six California regions, for about 3,500 species | not measured | One JSON file; robots allows all. © notice only. Its water classes are Californian: a check for `water`, not a decider elsewhere. |
| **Oregon State Landscape Plants**, **Colorado State Extension**, **Plant Select**, **Conservation Garden Park** (Utah), **AMWUA** (Arizona), **Texas SmartScape** | Zones, size, sun, water, soil; Plant Select and Conservation Garden Park add deer, pollinators and (CGP) **bloom months** | small to medium | © notices only. Plant Select asks permission for stories and photos, which we don't use. OSU crawl delay 10. |
| **Shropshire & Tallamy 2025** caterpillar host-plant dataset (University of Delaware) | Which caterpillars use which plant genera, 7,423 species | genus level | CC0 at the university repository. |
| **Kew World Checklist of Vascular Plants** | Accepted names and native range worldwide | all species | CC BY. Confirm the range table is in the download. |

### Ask first

Facts from these wait for a written yes.

| Source | Why it's worth asking | What stops us |
| --- | --- | --- |
| **UF/IFAS Florida-Friendly Landscaping plant app** | The only regional source with structured **pet toxicity** and **flowering months** | "No part … can be copied and reproduced for any purpose without prior written consent". Its data API's robots.txt returns an error. |
| **Go Botany** (Native Plant Trust) | About 533 catalog matches: native status by state, height, wetland indicator | Terms bar commercial use of content without written authorization (gobotany@nativeplanttrust.org). |
| **Kansas Wildflowers & Grasses** | About 332 matches, with **bloom months** | "may not be used commercially". One owner to ask. |
| **Morton Arboretum** | 774 well-structured plants, about 144 matches | Terms bar commercial use and automated downloading. |
| **Florida Native Plant Society** | About 121 matches, structured | Non-commercial use only without written permission. |
| **Virginia DCR Native Plant Finder** | About 1,600 natives with sun, moisture, pollinator flags (CSV) | Grants "fair use"; asks for a request when in doubt (web@dcr.virginia.gov). |
| **UConn Plant Database**, **Missouri, Ohio State and Maine Extension**, **Utah State**, **NMSU**, **UC ANR**, **Xerces**, **NWF Native Plant Finder** | Assorted | Terms bar use for profit, commercial distribution or copying. |

### Not used

- **Closed to bots:** Atlas of Florida Plants (ClaudeBot disallowed), Iowa
  State's main extension site (ClaudeBot disallowed), SEINet and OregonFlora
  (`*` disallowed), Washington Native Plant Society, Calscape, Jepson eFlora,
  Michigan State, Prairie Moon, Grow Native!, Oklahoma State, WSU and PNW
  Plants (blocked or unreadable robots.txt).
- **Second-hand:** Native Plant Society of Texas. Its facts are compiled
  largely from MOBOT and the Wildflower Center, which are closed to us.
- **Terms forbid it:** Sunset Western Garden (its zones are proprietary),
  Garden.org.

## Paid licenses

Checked 2026-10-17. No paid source both covers our facts well and plainly
lets a paid app ship its data.

- **Horticopia:** the one worth contacting. It licenses plant data to other
  software (DynaScape's design software runs on its 9,357 plants), as SQL
  Server or Access files. Price, field list, who compiles it, and whether a
  consumer app may ship it are all unpublished (sales@horticopia.com).
- **Plants For A Future:** 7,400 plants as a spreadsheet, $150 for the
  commercial edition, but nothing on redistribution, and its bloom months
  are British.
- **Merck Veterinary Manual:** licenses content to app developers, but its
  plant toxicity is prose, not a per-plant table.
- **Not usable:** Perenual (its terms forbid commercial use and display of
  its content, though its price list says "commercial"); Garden.org ("not
  available for licensing"); Permapeople and Growstuff (crowd-sourced,
  share-alike); Plant.id and PlantNet (identification, not traits);
  OpenFarm (shut down in 2025); nursery feeds and data resellers with
  AI-written text.
- **Pet toxicity** has no licensable source found. ASPCA offers consulting,
  not data licenses; its poison database is internal. Pet Poison Helpline
  and the FFL app are the requests worth making.

## Deciding each fact

For each fact, one source **decides**: its value is what the catalog
stores. Another, independent source **checks** it. Two sources aren't
independent when one is compiled from the other (many extension sheets cite
USDA or NC State).

The table below names the national sources. Regional sources from the
lists above check any fact they give, and decide where the national sources
are silent, with `at` set to their state for facts that depend on place
(bloom months, water). The 20-plant sample settles how each one's fields
map.

- **Both agree:** `check: "agree"`, both in `src`.
- **They differ:** the deciding source's value, `check: "disputed"`, both
  in `src`, and the fact goes on the review list. (Zones differ; see below.)
- **Only the deciding source has it:** `check: "single"`.
- **Only the checking source has it:** it stands in, `single`, but only
  where the table says it may.
- **Neither has it:** the fact is `null`.
- **Neither yes nor no is listed:** the fact is `null`, never `false`.
- **No source gives the fact's scale:** the fact is `null`. A source that
  only lists whether something applies (NC State's "Attracts: Bees") never
  becomes a level such as High or None.

Facts entered **by hand** from a source that allows it (MOBOT, for now) count
as an independent source. They can check any fact and give `agree`, and where
neither USDA nor NC State has a fact, they decide it (`single`). That includes
bloom months, with `at` set to the source's state ("MO" for MOBOT).

USDA PLANTS describes species as they grow wild or in conservation
plantings, and its own notes call the values approximations. NC State
describes garden plants, cultivars included. So for anything a garden
changes (size above all), USDA neither confirms NC State nor stands in for
it.

| Fact | Decides | Checks | USDA stands in? | Rule |
| --- | --- | --- | --- | --- |
| Names, `usda` symbol, synonyms | USDA | NC State | — | USDA's accepted name. A cultivar keeps its name and points to its species. |
| `form` | NC State "Plant Type" | USDA growth habit and duration | Yes | NC State's Tree, Shrub, Vine, Fern, Bulb and Cactus/Succulent tags map to the enum of the same name; Ornamental Grasses and Sedges → Grass/Sedge; Annual → Annual; Herbaceous Perennial → Perennial; Aquatic → Aquatic/Emergent. Other tags (Edible, Native Plant…) are ignored. If NC State gives more than one form, USDA decides when its growth habit names exactly one of them; otherwise `disputed` (redbud: Shrub and Tree at both). The kind of tree comes from NC State's "Design Feature": Understory Tree → "Tree (understory)", Shade Tree → "Tree (canopy)"; both or neither → `null`. |
| `height`, `width` | NC State | — | No | `med` is the midpoint of `min` and `max`. Most sizes stay `single` until a second garden source agrees. |
| `zone_min` | NC State | USDA minimum temperature | Yes | See "Zones". |
| `zone_max` | NC State | — | No | |
| `sun_least` | NC State light | USDA shade tolerance | Yes | Map USDA's distinct shade-tolerance values only after listing them from the 20-plant sample. They often differ from NC State: redbud is "Low" at USDA, and NC State lists part shade. |
| `sun_most` | NC State light | — | No | |
| `water` | NC State soil drainage and drought tolerance | USDA moisture use and drought tolerance | Yes | `Wetland` where USDA's National Wetland Plant List indicator is OBL or FACW in every region it lists for the plant. The rest of the mapping is set on the 20-plant sample and written here before any other plant. |
| `bloom` | NC State | USDA | Yes | Seasons only: see "Waiting on format changes". |
| `native` | USDA native status and state distribution | — | — | `single`. NC State's region of origin often comes from USDA, so it isn't independent. Waiting on a format change. |
| `invasive` | USDA invasive and noxious lists | — | — | Waiting on a format change and a sourced rule for "widely invasive". |
| Toxicity to people | NC State poison severity and contact dermatitis | UC ANR, once its terms are read | No | High or Medium → `major`, Low → `minor`, contact dermatitis → `dermatitis`. Oxalates only from UC ANR. (Medium goes to `major` because erring toward harmless is the dangerous mistake.) |
| Toxicity to dogs, cats, horses | — | — | — | No usable source yet. NC State's poison facts are about people, and toxicity to people doesn't stand in for pets. |
| `deer` | NC State resistance list | — | No | Listed for deer → `Resistant`. Otherwise `null`. |
| `nectar`, `bird` | — | — | — | `null`: neither source gives a level. |
| `host` | NC State "Wildlife Value" | — | No | Only where it says the plant is a larval host. Stored as the butterflies or moths it names, or the count it gives ("12 Lepidoptera species"), never its sentence. |
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

- **Bloom seasons.** Neither usable source gives months. NC State and USDA
  give seasons, and the months a season covers shift with place, so turning
  one into months would be our guess. A bloom fact may then be a season
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
