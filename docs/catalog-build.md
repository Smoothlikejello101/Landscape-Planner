# Building the catalog

One command rebuilds the catalog (`public/plants.json`) and the wild records (`public/wild/1/`) from the pages
already saved. It also writes what's left for a person to decide, fetch or tidy into
[catalog-review.md](catalog-review.md):

```
npm run catalog:build                     # offline: the pages already in catalog-src/
npm run catalog:build -- --fetch          # first fetch what the list needs that isn't saved, then build
npm run catalog:build -- --date 2026-11-02
```

**`--date`** is the day the audit's pages were read. It's written on each audited record. The default is the
catalog's own date (the latest `audited` in it). Pass the new day when `--fetch` has brought pages that change
facts.

**Repeatable.** Running it twice changes nothing. A build from the same pages writes the same catalog, files and
report, so `git diff` after a build shows exactly what it changed. It printed "public/plants.json unchanged" on
the pages behind the 2026-10-18 audit, which the scattered steps had built by hand.

**Each step's output** goes to `catalog-src/build/log.txt`. Its working files (the list, the combined audit, the
review list) are kept in `catalog-src/build/`, which isn't committed. A failed step stops the build, with the
step's last lines.

## The steps

| # | Step | Script | Writes |
| --- | --- | --- | --- |
| 0 | `--fetch` only: the atlas PDF and the Tallamy spreadsheet if missing; NC State's page for each species that has none and was never asked for; USDA PLANTS's name searches, then the profiles they lead to and the picks' characteristics | `fetch.mjs` | `catalog-src/<source>/<date>/` |
| 1 | The plant list (below) | `list.mjs` | `build/list.json` |
| 2 | The Arkansas atlas as text, and the caterpillar host genera, each made once from its saved file | `pdftotext -layout`, `tallamy.py` | `build/atlas.txt`, `tallamy/genera.json` |
| 3 | The web claims, read again with today's reader (below) | `reclaim.mjs` | `build/web.json` |
| 4 | Combine each plant's claims by the source rules ([catalog-sources.md](catalog-sources.md)) | `sample.mjs` | `build/combined.json` |
| 5 | Write the settled facts into the catalog | `write-cli.ts` (`catalog:write`) | `public/plants.json`, `build/review.json` |
| 6 | `--fetch` only: USDA's county records and GBIF's names | `usda-fetch.mjs`, `gbif-fetch.mjs` | `catalog-src/web/`, `catalog-src/gbif/` |
| 7 | Counties, and the atlas's county maps, each made once | `counties.mjs`, `atlas_counties.py` | `counties.json`, `arkatlas/counties.json` |
| 8 | USDA's county records, placed | `usda-counties.mjs` | `usda-counties.json` |
| 9 | Native status by state, from Kew's checklist | `wcvp.mjs` | `wcvp-native.json`, `wcvp-regulated.json`, `wcvp-review.json` |
| 10 | The wild records: counties, native status, the law's lines, bloom months ([wild-records.md](wild-records.md)) | `wild.mjs` | `public/wild/1/`, `native-review.json`, `bloom-review.json` |
| 11 | The catalog's checks, then the report | `check.ts`, `report.mjs` | `docs/catalog-review.md` |

Paths without a folder are in `catalog-src/`. The order matters: `sample.mjs` reads the catalog as it stands, for
the older values it keeps and the form order it prefers. Steps 7 to 10 read the catalog after the write.

## What it reads

**Committed:**
- `public/plants.json`.
- `scripts/catalog/ncsu-pages.json`.
- The reviewed lists the scripts keep:
  - `site-terms.json`: the terms readings;
  - `regulated-plants.json`;
  - USDA picks and renames: `PICK` (usda-pick.mjs) and `SAME_PLANT` (usda-counties.mjs);
  - spellings: `GBIF_NAME` (gbif.mjs) and `WCVP_NAME` (wcvp.mjs);
  - `RECORDS_TRUSTED` (bloom.mjs) and `COMPANY` (web.mjs).

**Kept in `catalog-src/`** (git-ignored):
- **The pages the fetcher saved**, each with its date and what the site answered.
- **`web-claims.json`**: the web search's claims, plant by plant, each with the page it was read from. This is
  `search.mjs`'s output: the facts read from pages we fetched ourselves, each citing its page. Brave's results
  aren't kept (its terms; [catalog-sources.md](catalog-sources.md), "Searching the web").
- **Kew's World Checklist** (`kew-wcvp/`): wcvp.zip from sftp.kew.org/pub/data-repositories/WCVP/, unzipped by
  hand.
- **GBIF's downloads** (`gbif-downloads/`): requested with the account, and fetched without one, by
  `gbif-download.mjs` ([bloom-months.md](bloom-months.md), [wild-records.md](wild-records.md)).

**Not run by the build:**
- **The web search** (`search.mjs`). It needs the search key, and a person or agent reads each new site's terms
  before any of its pages are used. A plant it hasn't searched yet is named in the report. Its claims are added
  to `catalog-src/web-claims.json`.
- **GBIF download requests** (the account).
- **Kew's download.**

Where one of these is missing, the build stops and says which.

## The plant list

For each record, in the catalog's order: `{ id, species, genusOnly?, ncsu?, usda? }`. It's worked out from the
catalog by rule, except where a committed file says otherwise.

- **Species.** A botanical name's species is:
  - "Genus × epithet": the hybrid species (Fothergilla × intermedia);
  - else the first two words, where the second is a lowercase word other than "x" or "hybrid": Salvia azurea
    'Nekan' is Salvia azurea, a subspecies its species. ("Distylium hybrids" passes, as the audit read it.)
  - Anything else names only a genus (`genusOnly`): "Hosta spp.", "Rosa 'Julia Child'", "Magnolia x
    soulangeana" (written with a plain x), "Artemisia hybrid". Such a record isn't looked up on the atlas or in
    USDA PLANTS, and gets no NC State page by the rule: a genus's page describes the genus, not the plant.
- **NC State.** The species' page (its name in lower case, hyphenated, × as x: `fothergilla-x-intermedia`), where
  one is saved. `scripts/catalog/ncsu-pages.json` names the exceptions, chosen by hand: a cultivar's own page,
  the one cultivar page a record of several cultivars reads, a genus page, or `null` for none. Each is listed in
  the report while it's in doubt.
- **USDA PLANTS.** The symbol `usda-pick.mjs` picks from the species' saved name search: its own name at species
  rank, not a hybrid or a variety, and a profile that is the plant's own or a reviewed rename.

## Reading the web claims again

The search's claims are read again from the saved pages they cite, with today's reader (`web.mjs`). A fix to the
reader reaches every plant this way, without searching again. Only the pages that gave a claim then are read:
a page that gave nothing under the old reader isn't among them. Pages no longer saved are counted.

## The report

[catalog-review.md](catalog-review.md) lists what the build left for a person. It's made only from the build's own
files, so it changes only when what's waiting changes. A contents list leads, with each section's count. Most
useful first:

- **Sources disagree**, and the other review items the writer kept back: a form unsettled, "edible" on a plant
  rated toxic, values held back as implausible. Each shows what the sources say and the catalog's value now.
  Until someone decides, the catalog keeps its older value, marked unverified.
- **Kew names to check**: names WCVP could read two ways, and law-list names Kew accepts under another.
- **Native status held back**, and bloom months held back.
- **Pages to fix**: a page that names another plant, a name the atlas maps twice, a page the list names that
  isn't saved, a genus's page read for a plant.
- **Not looked up yet**: pages `--fetch` would ask for. Also plants not searched on the web, and terms readings
  waiting.
- **Catalog checks** (`npm run catalog:check`), grouped by what each says.
- **For reference**: counts of what the sources had nothing to give.

The summary line counts what's waiting in three kinds: to decide, to fetch or search, and catalog checks to tidy.

**Acting on an item.** Most decisions go where the step that made the item reads them:
- a page in `ncsu-pages.json`;
- a name in `regulated-plants.json` or one of the scripts' reviewed lists.

The next build then drops the item.

**Not yet built: a place for decisions on the writer's items** (which source to believe on a disputed fact). The
writer would read it, and the app would need to say a fact was decided. Until then, those items stay listed.
