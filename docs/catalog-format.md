# Plant catalog format (version 2)

`public/plants.json` is the plant catalog the app ships with. It is a list of
plant facts, each one carrying where it came from, kept apart from anything
personal (a gardener's own plants live in My plants, on their device).

The plan behind it is the "Plant Catalog Plan" doc. In short: every value has
a source; "unknown" is an allowed answer; a value counts as verified only when
two independent sources agree; and nothing from the first compendium is
trusted until the audit re-derives it. Which sources may be used, and which
one decides each fact: [catalog-sources.md](catalog-sources.md).

## The file

```json
{
  "meta": {
    "format": "lp-catalog",
    "version": 2,
    "zones": "half",
    "updated": "2026-10-18",
    "sources": {
      "compendium": { "title": "First compendium (2026)", "trust": "unverified" },
      "ncsu": { "title": "NC State Extension Gardener Plant Toolbox", "url": "https://plants.ces.ncsu.edu", "trust": "reference" },
      "usda": { "title": "USDA PLANTS Database", "url": "https://plants.usda.gov", "trust": "reference" }
    },
    "enums": { "form": ["Annual", "..."] }
  },
  "plants": [ { "...": "records, below" } ]
}
```

`meta.zones` is `"half"`: zones are on the half-zone scale (see `zone_min`,
`zone_max` below). Files from before 2026-10-18 lack it and rated
`zone_max` in whole zones (9 meant through 9b); the app reads such a file's
whole-number `zone_max` as half a zone warmer, and `catalog:check` won't
pass a file without it.

`meta.sources` names every source a fact may cite. `trust` is `reference`
(a published reference: an extension service, USDA, a botanical garden),
`nursery` (a grower's, breeder's or seller's own listing), `observation`
(a gardener's own record) or `unverified` (the first compendium: claims
with no source behind them). A site found by the web search is cited by its
domain (`"newmoonnursery.com"`), with the domain as its title.

`meta.moved`, where there is one, lists records folded into another (`fold` in scripts/catalog/decisions.json): the
old id, and the record it stands for now (`{ "salvia-officinalis-origanum-vulgare": "salvia-officinalis" }`). A plant
placed from the old record keeps its id in the plan, and the app shows it with the other record's facts.
`catalog:check` won't pass an old id that is still a record, or one that stands for a record that isn't there.

## A record

```json
{
  "id": "hydrangea-arborescens-haas-halo",
  "common": "Smooth hydrangea 'Haas' Halo'",
  "botanical": "Hydrangea arborescens 'Haas' Halo'",
  "short": "'Haas' Halo' hydrangea",
  "parent": "hydrangea-arborescens",
  "src": ["compendium"],
  "audited": null,
  "facts": {
    "form": "Shrub",
    "width": { "min": 4, "max": 6, "med": 5 },
    "zone_min": { "v": 4, "src": ["ncsu", "usda"], "check": "agree" }
  }
}
```

- **Names** (`common`, `botanical`, optional `short` for small circles on the
  plan, optional `synonyms` and `usda` symbol) sit at the top level. They
  identify the record rather than describe the plant.
- **`parent`**: a cultivar points to its species. Facts it doesn't state come
  from the species when they come with the species: where it's native, what
  it tolerates (zones, sun, water, soil, humidity), what it feeds, how toxic
  it is, when it blooms (`INHERITED` in src/catalog.ts). Not size, trunk,
  flower color or habit, which cultivars are bred to change.
- **`inherits`**: facts beyond those a cultivar takes from its species anyway: only `height` and `width`, for a
  cultivar split from a record of several cultivars that has no page of its own (decisions.json `split`). Its size
  is then its species' until a source gives its own; the app says so ("from its species"). A cultivar with no
  species record (a genus's hybrid: "Rubus 'Ouachita'") has none to take, and no size until a source gives one.
- **`src`**: the sources for every fact that doesn't name its own.
- **`audited`**: the date of the audit run that last changed this record's
  facts (its first, for a record audited once), or `null`. A run that leaves
  the record as it was leaves the date. Until a record is audited the app labels
  its values as unverified.
- **`facts`**: each fact is either a plain value (sourced by the record's
  `src`) or an object with `v` (the value) and any of:
  - `src`: source ids for this value, the one that gave the value first
    (the others agree with it, or dispute it);
  - `from`: `description` for a value read from a sentence of its source's
    description rather than its fields (docs/catalog-sources.md, "Reading
    descriptions"). The sentence itself is kept in the build's own files
    (catalog-src/build), not here: descriptions aren't copied. The app credits
    it without quoting it ("Prose description, NC State …"; Jason, 2026-10-27);
  - `at`: where it was observed (a US state, e.g. `"AR"`), for values that
    depend on place, such as bloom months;
  - `check`: how sure it is. `agree` or `confirmed` (an authority, and an
    independent source agrees within tolerance), `single` (one authority),
    `likely` (no authority behind it; two or more nurseries agree, outnumbering
    any authority that says otherwise),
    `reported` (one nursery says it), `disputed` (sources disagree: it goes
    on the review list);
  - `alt`: what other sources say where they differ from the value shown
    (the largest other side, or an outvoted authority's where the value
    shown has none behind it: see docs/catalog-sources.md, "Where sources
    disagree"):
    `{ "v": …, "src": [...], "check": "confirmed" | "single" | "likely" | "reported" }`,
    its check by the same rules as the fact's own (`confirmed` or `single`
    where an authority gives it). Only for `height`, `width`, the zones,
    sun, `water` and `deer`, never toxicity, invasiveness or native status;
    a form where sources differ keeps both forms instead. A pair (the two
    zones, the two sun levels) takes its `alt` from sources that give both
    halves, on each half where it differs from the value shown. The app shows it in the plant's details,
    labelled with who says it ("Nurseries report: …", "NC State lists:
    …"), and its filters let it count unless the user turns "Include where
    sources differ" off; a plant shown only because of it is marked.

A fact that is `null` is known to be unknown: the sources were checked and
none say (the app keeps that, without a value). A missing fact simply
hasn't been looked up.

## Names

Quotes in a record's name are only for a named cultivar: "Hydrangea
'Limelight'" (the order of the words: [catalog-build.md](catalog-build.md),
"Cultivar names"). A seed strain or an ecotype isn't a cultivar: it's named
"Common name (strain)", "Butterfly weed (clay strain)", not "Butterfly weed
'for Clay'" (Jason, from the UI review, 2026-11-01). A botanical name has no
parentheses; `catalog:check` lists one that has (the earlier list's strains,
groups and notes: "Asclepias tuberosa (clay strain)", "Iris (aquatic
spp.)"), for a person to look at.

Butterfly weed 'for Clay' keeps its quotes for now: the build reads a record
as a cultivar, and its nursery pages as its own, by the quotes in its names
(`recordCultivars` in scripts/catalog/ncsu-page.mjs, `cultivarOf` in
reclaim.mjs). Renamed, the next build would stop reading Prairie Nursery's
page for it and read NC State's page for the species as its own instead.
Renaming it needs a decision that also tells the build what its sources call
it.

## Facts

| Fact | Value |
| --- | --- |
| `form` | one of `meta.enums.form`, or a list of up to three, primary first (redbud: `["Tree", "Shrub"]`): the first decides its color and symbol, and it shows under every form filter in the list. A tree is one form however tall (until 2026-10, "Tree (understory)" or "Tree (canopy)", which the app still reads as "Tree"): how it layers with what grows under it is worked out from its height (src/crowding.ts) |
| `habit` | free text, e.g. "Clumping": the earlier list's, or read from NC State's description (a habit src/spread.ts knows: "Spreading rhizome", "Suckering", "Clumping"…; docs/catalog-sources.md, "Reading descriptions"). "Spreading rhizome, maybe aggressive" (and the same of runners and suckers) where only one of a page's two readings says aggressively: the app says "Spreads, maybe aggressively", and its filter counts it as aggressive. A cultivar's comes only from a page for it |
| `height`, `width` | `{ min, max, med }` feet: the range shown, from the source that leads, and `med` the typical size the app draws it at: the median of the middles of the sources that agree, an authority's counted twice, within the range (docs/catalog-sources.md, "Typical size"); one source's range's middle |
| `zone_min`, `zone_max` | USDA hardiness zones on a half-zone scale (7a is 7, 7b is 7.5), 1 to 13.5. `zone_min` is the coldest half-zone it takes (a whole-zone rating "7" is 7); `zone_max` is the warmest (a whole-zone "9" is 9.5, through 9b; "9a" is 9) |
| `sun_most`, `sun_least` | `Full`, `Part`, `Shade`: the most and least sun it takes |
| `water` | `Low`, `Moderate`, `High`, `Wetland` |
| `bloom` | `{ start, end, color? }`, months 1 to 12: the earlier list's (unverified), kept for the bloom calendar and its color words. Where the garden is, flowering records give the months instead (docs/bloom-months.md) |
| `bloom_season` | when it blooms, as its sources say, a list in their order, each once: a season (`spring`, `summer`, `fall`, `winter`), or USDA's finer `early`, `mid` or `late` one (`mid spring`). Seasons, not months: the months a season covers shift with place. A cultivar takes its species' (a reblooming cultivar's own comes from a page for it). None for a plant without flowers (conifers, ferns and the like) |
| `flower_color` | its flowers' colors, each once: `white`, `yellow`, `pink`, `purple`, `red`, `orange`, `blue`, `green`, `cream`, `brown`, `silver`, `black`, `variegated` (NC State's word for flowers of several colors), and `insignificant`: the flowers aren't showy (NC State's "Insignificant", USDA's "Flower Conspicuous: No"). NC State's groups, each by its first color ("Gold/Yellow" is `yellow`). In order, the first the one the app draws it in: those its sources give most first, and among those given equally, the color its description first gives its flowers ("large red flowers"; Jason, 2026-10-30), else the deciding source's order. A cultivar's come only from a page for it |
| `humidity` | `humid` (handles humid summers), `dry` (needs dry summers) or `either` |
| `tox` | `{ dog?, cat?, horse? }` each `nontoxic`, `toxic` or `unlisted` (ASPCA); `people?` one of `major`, `minor`, `oxalates`, `dermatitis` (UC ANR classes 1 to 4) or `unlisted` |
| `poison` | poisonous to people, in its source's terms (NC State's): `{ severity?, parts?, skin? }`: `severity` `low`, `medium` or `high`; `parts` the parts it names, only these, each once (`leaves`, `fruits`, `seeds`, `stems`, `flowers`, `roots`, `sap`, `bark`); `skin` true where it irritates skin on contact. `{}` is listed as poisonous to people with nothing more said. `null`: NC State's page was read and says nothing of poison; the app says "None listed", never "safe". Missing: no source we read rates it for people ("Not known"). A cultivar takes its species' rating |
| `poison_parents` | a hybrid with no rating of its own for people (no `poison`, or `null`): `{ via, parents }`, its parent species and how each is rated, written only where at least one is rated. `via` `name` where the name is the cross (Morus alba x rubra), `kew` where Kew's World Checklist's hybrid formula gives them (Abelia × grandiflora: A. chinensis × A. uniflora; source `wcvp`). Each parent `{ name, id?, common?, poison? }`: `poison` as above from its catalog record, else NC State's page for it; `null` none listed; absent not rated. The app says "No rating available for this hybrid" and what the parents are rated, and otherwise treats it as its parents are rated (Jason, 2026-10-30): it's left out of "Not listed as poisonous to people", flagged for a household with kids where a parent is poisonous if eaten, and marked "Can irritate skin" where a parent does. A cultivar of a hybrid species takes its species' (scripts/catalog/hybrids.mjs) |
| `flower_form` | what its flowers look like, as NC State's fields give them (a plant's own page for a cultivar): `{ inflorescence?, shape?, petals?, size? }`, each a list of the catalog's words for NC State's (src/catalog.ts `FLOWER_FORM`): how they're borne (raceme, panicle, cyme, solitary, head, spike, umbel, corymb, catkin, spadix, insignificant), their shape (tubular, cup, star, bell…), their petals (`4-5`, `7-20`, `20+`, bracts, fused…) and their size in inches (`<1`, `1-3`, `3-6`, `>6`). For drawing each plant's flowers its own way (Jason, 2026-10-29). Not for a plant with no flowers (a conifer's cones) |
| `leaf_form` | what its leaves look like, as NC State's fields give them: `{ type?, shape?, arrangement?, margin?, length? }` (src/catalog.ts `LEAF_FORM`): simple, compound, needles, sheath or fronds; its shapes (ovate, lanceolate, linear…); alternate, opposite, rosulate or whorled; its edge (entire, serrate, lobed…); its length in inches. A cultivar takes its species' |
| `texture` | how fine its leaves look from a distance: `fine`, `medium`, `coarse` (NC State's "Texture"). A cultivar takes its species' |
| `habit_form` | its shape, as NC State's "Habit/Form" lists it: erect, spreading, rounded, mounding, arching, weeping, columnar, vase… (src/catalog.ts `HABIT_FORMS`). A cultivar's from a page for it |
| `climbs_by` | how a vine climbs, NC State's "Climbing Method": `twining`, `tendrils`, `clinging`, `scrambler`. For drawing a vine on what it climbs (Jason, 2026-10-29). A cultivar takes its species' |
| `thorns` | true for thorns, spines or prickles: NC State's stem "Appendage" (Prickles, Spines, Thorns) or its "Spines/Thorns" problem. Never on a plant named thornless (honeylocust var. inermis): that goes to the review |
| `trunk` | mature trunk diameter in feet (trees) |
| `native`, `nativar` | first-compendium nativeness (to be replaced by USDA status by state) |
| `dog` | first-compendium dog rating (to be replaced by `tox.dog`) |
| `nectar`, `bird`, `deer`, `maintenance`, `self_seed`, `host` | wildlife and care, as before. The compendium's `self_seed` "Sterile" was struck from every record (2026-10-22): none rather than wrong. A species usually sets seed, a cultivar sold as sterile often isn't, and a few plants are sterile all the same (the red spider lily, Lycoris radiata, spreads by bulbs), so "Sterile" stands only with a source. It's left missing, not looked up, never `null` (tests/catalog-wild.test.ts). From a source, it's read from NC State's description, or a permitted web page's (2026-10-27): `Prolific` where it says the plant self-sows freely, `Modest` where it says a little ("self-seeds, but is not aggressive"), `Unrated` where it says the plant self-sows and not how freely (the app: "Self-sows, aggressiveness unknown"; Jason, 2026-10-27), `Sterile` where it says the plant itself is sterile; a cultivar's comes only from a page for it. `deer` from a source is NC State's field (which lists only `Resistant`, lowered to `Occasional` where the page's own text says deer eat the plant, that it resists them only "mildly" or "moderately" or outright, "may be damaged by deer": Jason, 2026-10-27), a nursery's, or NC State's description (`Occasional` where it says deer eat the plant, `Candy` where they favor it or damage it often). The app shows `self_seed` with what `habit` says of spreading underground or by runners, under one "How it spreads" row, each part with its own source ("Self-sows freely" · "Spreads underground or by runners: Spreading rhizome"), and its picker filters on both; the two stay separate facts, from separate sources. "Stays put" takes a plant that doesn't run and self-sows only a little or is said to be sterile (a sourced value: Jason, 2026-10-27); one that self-sows, how freely unknown, counts as possibly self-sowing freely. Which habits speak to spreading, and how, is a fixed table (src/spread.ts); `catalog:check` lists a habit it doesn't know |
| `edible`, `fall_color`, `winter_interest`, `clay_ok`, `wet_feet`, `dry_shade`, `taproot` | yes or no. `fall_color` is no where NC State lists only "Insignificant" for a plant's fall color. `winter_interest` from a source is yes where NC State lists it for a "Winter Garden" (the earlier list's yes and no stand where it doesn't) |
| `hosts` | the caterpillars its sources name it a larval host for, by name ("Monarch (Danaus plexippus)", "Spring Azure"), each once; never a source's sentence. A bare name that another, with its binomial, already gives is the same caterpillar. The earlier list's `host` (free text) stays beside it, shown only where no source names any. A cultivar takes its species' |
| `host_genus` | `{ genus, species }`: how many native caterpillar species (moths and butterflies, north of Mexico) are recorded on its genus (Shropshire & Tallamy 2025). Genus-level; each state's count, and the butterflies among them, are in the state files (docs/wild-records.md). A cultivar takes its species' |
| `native_na` | `true`: native to Canada or the US mainland (Alaska and Greenland too), by Kew's World Checklist (source `wcvp`: TDWG regions 70–78, not Mexico, Hawaii or Puerto Rico). Written only where it is, by the build's Kew step (scripts/catalog/wcvp.mjs). It decides whether a genus's caterpillar count counts the plant as a host (Shropshire & Tallamy count caterpillars north of Mexico). A cultivar takes its species' |
| `botanical_synonyms` | its older botanical names, a list: Kew's World Checklist's homotypic synonyms (source `wcvp`), the same species under an earlier genus or spelling ("Mahonia aquifolium" for Berberis aquifolium, "Sedum spectabile" for Hylotelephium spectabile), never its own name. Written by the build's Kew step (scripts/catalog/wcvp.mjs); searched as its botanical name is, and said ("Formerly …") when it's what matched. A cultivar takes its species' |
| `fall_colors` | its fall leaf colors, a list, each once: `gold`, `red`, `orange`, `purple`, `copper`, `cream`, `silver`, `pink`. A cultivar's come only from a page for it |
| `leaf_color` | its leaf colors as its source lists them, each once: `green`, `silver`, `gold`, `blue`, `purple`, `red`, `copper`, `white`, `variegated`, `orange`, `pink`, `cream`, `black`. NC State's take in the seasons and the undersides (red maple: gold, green, orange), so a color here isn't necessarily its summer color. A cultivar's comes only from a page for it |
| `spacing` | how far apart to plant it, feet, `{ min, max, med }` as `height` (Oct 29): a nursery's or an extension's spec line ("Spacing: 18-24″", "Plant Spacing: 3′"; web.mjs), never a count a square foot or a bare number. Agreement as for sizes; a cultivar's only from a page for it. The app shows it in a plant's details (Growing: "Plant 3–5 ft apart") and draws a vine grown as a groundcover by it: its patch as wide as its spacing, no wider than its spread, a faint ring at its spread (src/vines.ts `groundcoverRadius`; Jason, Oct 29: option c). A vine with none (most: a vine is planted one to a support, and few sources give one) is drawn at its base, 2 ft across, never by its width, which is how far it spreads along a support (Jason, Oct 30) |
| `foliage` | whether its leaves stay through winter: `evergreen`, `semi-evergreen` (depends on the winter) or `deciduous` (for an herb: it dies back; a grass goes dormant). A cultivar takes its species'. The app says a tree or shrub also listed as an annual or perennial (lantana) is evergreen only where winters are mild, and leaves it out of the Evergreen filter |
| `winter_leaves` | where no source gives `foliage`: what its winter is taken to be (scripts/catalog/winter.mjs; Jason, 2026-10-29), `{ "leaves": "deciduous", "basis": "records" \| "relatives", "n": 5 }`. `records`: its species' USA-NPN observers recorded its last live leaves, then none (`n` plant-years; source `usanpn`): it loses its leaves (an herb: dies back). Never evergreen from records (a species no one recorded bare may only be one few watch). Else `relatives`: `n` (two or more) other species of its genus whose foliage a checked source gives, all alike (source `relatives`). Tested on the plants whose foliage a source gives: records right for 94%, relatives for 93%. The app says it as what's expected ("Expected to die back in winter, like its 5 relatives in the catalog"), draws it in the month slider with its basis, and never filters by it. A species record's only (a cultivar takes its species'); not an annual's |
| `needles` | needled leaves (pines, junipers, arborvitae): yes, or missing. A cultivar takes its species' |
| `growth_rate` | `slow`, `medium` or `fast`. A cultivar's comes only from a page for it |
| `attracts` | who visits it, as NC State's "Attracts" lists them, each once: `butterflies`, `pollinators`, `bees`, `specialized bees`, `hummingbirds`, `songbirds`, `moths`, `small mammals`, `predatory insects`, `frogs`, `reptiles`, `bats`. Who, never how much (it isn't `nectar`'s level). A cultivar's comes only from a page for it |
| `tolerates` | what it takes, as NC State's "Resistance To Challenges" lists it, each once: `deer`, `rabbits`, `squirrels`, `voles`, `slugs`, `drought`, `dry soil`, `wet soil`, `poor soil`, `compaction`, `erosion`, `heat`, `humidity`, `salt`, `pollution`, `urban conditions`, `black walnut`, `heavy shade`, `wind`, `storm damage`, `foot traffic`, `fire`, `diseases`, `insect pests`. (Deer and wet soil are also `deer` and `wet_feet`.) A cultivar takes its species' |
| `problem_for` | the animals NC State lists it as a problem for ("Problem for Dogs"), each once: `dogs`, `cats`, `horses`. A warning: a plant not listed isn't safe. The app counts it as a warning for dogs, ahead of the earlier list's `dog`. A cultivar takes its species' |
| `bark` | its bark as NC State lists it, each once: `smooth`, `furrowed`, `fissured`, `ridges`, `scaly`, `lenticels`, `bumpy`, `spongy`, `shiny`, `exfoliating`, `peeling`, `shredding`, `papery`, `shaggy`, `patchy`. The app counts exfoliating, peeling, shredding, papery, shaggy and patchy bark as showy, part of its winter interest. A cultivar takes its species' |
| `bark_color` | its bark's colors, each once: `light gray`, `dark gray`, `light brown`, `dark brown`, `red/burgundy`, `orange`, `green`, `black`, `white`. A cultivar's comes only from a page for it |
| `fruit_set` | what it takes to fruit, read from its description (`from: "description"`, prose.mjs; Jason, 2026-10-30: partner plants for fruit set): `separate` (male and female plants: a female fruits only with a male near), `partner` (another cultivar or genetic strain needed), `better` (fruits alone, better with a partner), `self` (fruits alone). A cultivar's own page speaks for it; else it takes its species' |
| `sex` | a cultivar's own sex, `male` or `female`, read from its own page's description ("a female cultivar"). Never on a species, never inherited |
| `partners` | the cultivars its description names as its pollinizer, as it names them (`["Southern Gentleman"]`), read from its description (`from: "description"`, prose.mjs; Jason, 2026-10-30: the partners a fruit-partner notice offers first). Up to 8. A cultivar's own page speaks for it; never inherited |
| `edible_parts` | which parts are edible, a list, each once: `fruit`, `flowers`, `leaves`, as NC State marks them ("Fruit Value To Gardener: Edible"). Written only beside `edible` (a plant rated toxic waits on the same decision, its poisonous parts shown beside it). A cultivar takes its species' |
| `stem_color`, `fruit_color` | its stems' and its fruit's colors, in NC State's groups, each once: `red/burgundy`, `orange`, `gold/yellow`, `green`, `blue`, `purple/lavender`, `pink`, `white`, `cream/tan`, `brown/copper`, `gray/silver`, `black`. A stem color counts toward winter interest only on a deciduous tree or shrub listed for winter interest (new growth is often red). A cultivar's comes only from a page for it |
| `fruit_season` | when its fruit is there to see: `spring`, `summer`, `fall`, `winter` (fruit that stays into winter). A cultivar takes its species' |
| `maintenance_level` | its upkeep, as NC State rates it: `low`, `medium` or `high`. (The earlier list's `maintenance` is tasks, another scale; the app shows this one where there is one.) A cultivar takes its species' |
| `wild_us` | its degree in USGS's register of introduced plants reproducing in the wild in the lower 48 (US-RIIS, ver. 2.0; scripts/catalog/riis.mjs), in the register's own terms: `established` ("reproducing in the locality"), `invasive` ("causing, or likely to cause, harm") or `widespread invasive` ("at least locally abundant and harmful ecologically, economically, or to health"). For the lower 48 as a whole: it doesn't say where. Missing: not on the register. Shown in its details; never hides a plant or turns its button red, which the law of the garden's state does ([regulated-plants.md](regulated-plants.md); Jason, 2026-10-31). A cultivar takes its species'. (Replaces the first compendium's `invasive` flag, which had no source.) |
| `low_branched` | a tree that keeps its branches to the ground (an evergreen screen): yes, or missing. The app takes nothing to grow under it, where another tree's lower limbs can be taken up to a third of its height (src/crowding.ts) |

## Checks

`npm test` runs `tests/catalog.test.ts` over the shipped file. It fails on
anything structural: duplicate ids, unknown keys (typos), a missing parent, a
cultivar whose parent is itself a cultivar, a fact citing an unknown source,
a value of the wrong type or outside its enum.

`npm run catalog:check` (scripts/catalog/check.ts) lists the softer problems
for the audit to look at: sizes implausible for the form, zones backwards, a
cultivar with no species in the catalog, a cultivar whose botanical name
doesn't name it, a botanical name with parentheses ("Names", above).
