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
    "updated": "2026-10-17",
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

`meta.sources` names every source a fact may cite. `trust` is `reference`
(a published reference: an extension service, USDA, a botanical garden),
`observation` (a gardener's own record) or `unverified` (the first
compendium: claims with no source behind them).

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
- **`audited`**: the date the audit re-derived this record from sources, or
  `null`. Until then the app labels the record's values as unverified.
- **`facts`**: each fact is either a plain value (sourced by the record's
  `src`) or an object with `v` (the value) and any of:
  - `src`: source ids for this value, the one that gave the value first
    (the others agree with it, or dispute it);
  - `at`: where it was observed (a US state, e.g. `"AR"`), for values that
    depend on place, such as bloom months;
  - `check`: `agree` (two independent sources agree within tolerance),
    `disputed` (they don't: it goes on the review list) or `single` (one
    source only).

A fact that is `null` is known to be unknown: the sources were checked and
none say (the app keeps that, without a value). A missing fact simply
hasn't been looked up.

## Facts

| Fact | Value |
| --- | --- |
| `form` | one of `meta.enums.form` |
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
| `nectar`, `bird`, `deer`, `maintenance`, `self_seed`, `host` | wildlife and care, as before |
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
