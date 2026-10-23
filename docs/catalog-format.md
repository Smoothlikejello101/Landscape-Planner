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
  it is (`INHERITED` in src/catalog.ts). Not size, trunk, flower color or
  habit, which cultivars are bred to change.
- **`src`**: the sources for every fact that doesn't name its own.
- **`audited`**: the date of the audit run that last changed this record's
  facts (its first, for a record audited once), or `null`. A run that leaves
  the record as it was leaves the date. Until a record is audited the app labels
  its values as unverified.
- **`facts`**: each fact is either a plain value (sourced by the record's
  `src`) or an object with `v` (the value) and any of:
  - `src`: source ids for this value, the one that gave the value first
    (the others agree with it, or dispute it);
  - `at`: where it was observed (a US state, e.g. `"AR"`), for values that
    depend on place, such as bloom months;
  - `check`: how sure it is. `agree` or `confirmed` (an authority, and an
    independent source agrees within tolerance), `single` (one authority),
    `likely` (no authority; most of the nurseries that give it agree),
    `reported` (one nursery says it), `disputed` (sources disagree: it goes
    on the review list);
  - `alt`: what other sources say where they differ from the value shown
    (the value more of them give, or on an even split the cautious one: see
    docs/catalog-sources.md, "Where sources disagree"):
    `{ "v": …, "src": [...], "check": "confirmed" | "single" | "likely" | "reported" }`,
    its check by the same rules as the fact's own (`confirmed` or `single`
    where an authority gives it). Only for `height`, `width`, the zones,
    sun, `water` and `deer`, never toxicity, invasiveness or native status;
    a form where sources differ keeps both forms instead. A pair (the two
    zones, the two sun levels) gets an `alt` on both when either differs,
    from sources that give both. The app shows it in the plant's details,
    labelled with who says it ("Nurseries report: …", "NC State lists:
    …"), and its filters let it count unless the user turns "Include where
    sources differ" off; a plant shown only because of it is marked.

A fact that is `null` is known to be unknown: the sources were checked and
none say (the app keeps that, without a value). A missing fact simply
hasn't been looked up.

## Facts

| Fact | Value |
| --- | --- |
| `form` | one of `meta.enums.form`, or a list of up to three, primary first (redbud: `["Tree (understory)", "Shrub"]`): the first decides its color and symbol, and it shows under every form filter in the list |
| `habit` | free text, e.g. "Clumping" |
| `height`, `width` | `{ min, max, med }` feet |
| `zone_min`, `zone_max` | USDA hardiness zones on a half-zone scale (7a is 7, 7b is 7.5), 1 to 13.5. `zone_min` is the coldest half-zone it takes (a whole-zone rating "7" is 7); `zone_max` is the warmest (a whole-zone "9" is 9.5, through 9b; "9a" is 9) |
| `sun_most`, `sun_least` | `Full`, `Part`, `Shade`: the most and least sun it takes |
| `water` | `Low`, `Moderate`, `High`, `Wetland` |
| `bloom` | `{ start, end, color? }`, months 1 to 12 |
| `humidity` | `humid` (handles humid summers), `dry` (needs dry summers) or `either` |
| `tox` | `{ dog?, cat?, horse? }` each `nontoxic`, `toxic` or `unlisted` (ASPCA); `people?` one of `major`, `minor`, `oxalates`, `dermatitis` (UC ANR classes 1 to 4) or `unlisted` |
| `thorns` | true for thorns, spines or prickles |
| `trunk` | mature trunk diameter in feet (trees) |
| `native`, `nativar` | first-compendium nativeness (to be replaced by USDA status by state) |
| `dog` | first-compendium dog rating (to be replaced by `tox.dog`) |
| `nectar`, `bird`, `deer`, `maintenance`, `self_seed`, `host` | wildlife and care, as before. The compendium's `self_seed` "Sterile" was struck from every record (2026-10-22): none rather than wrong. A species usually sets seed, a cultivar sold as sterile often isn't, and a few plants are sterile all the same (the red spider lily, Lycoris radiata, spreads by bulbs), so "Sterile" stands only with a source. It's left missing, not looked up, never `null` (tests/catalog-wild.test.ts) |
| `edible`, `fall_color`, `winter_interest`, `clay_ok`, `wet_feet`, `dry_shade`, `taproot` | yes or no |
| `invasive` | widely invasive in the US: never suggested |

## Checks

`npm test` runs `tests/catalog.test.ts` over the shipped file. It fails on
anything structural: duplicate ids, unknown keys (typos), a missing parent, a
cultivar whose parent is itself a cultivar, a fact citing an unknown source,
a value of the wrong type or outside its enum.

`npm run catalog:check` (scripts/catalog/check.ts) lists the softer problems
for the audit to look at: sizes implausible for the form, zones backwards, a
cultivar with no species in the catalog, a cultivar whose botanical name
doesn't name it.
