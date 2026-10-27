# Building the catalog

One command rebuilds the catalog (`public/plants.json`) and the wild records (`public/wild/1/`) from the pages
already saved. It also writes what's left for a person to decide, fetch or tidy into
[catalog-review.md](catalog-review.md):

```
npm run catalog:build                          # offline: the pages already in catalog-src/
npm run catalog:build -- --fetch               # first fetch what was never asked for, then build
npm run catalog:build -- --date 2026-10-18     # date the changed records by the day their pages were read
```

**The `--` matters.** Without it npm keeps the flags for itself, and the build stops and says so.

**`--date`** is written on each record whose facts this build changes (its `audited`: the day the audit re-derived
it). A record it leaves as it was keeps its date, so a build on a later day changes only what it changed. Without
`--date`, it's today. Pass the day the pages were read when the change comes from pages read earlier, such as a
fix to a reader.

**Repeatable.** Running it twice changes nothing. A build from the same pages writes the same catalog, files and
report, so `git diff` after a build shows exactly what it changed. Run on the pages behind the 2026-10-18 audit,
which the scattered steps had built by hand, it printed "public/plants.json unchanged". Nothing under
public/wild/ changed either.

**Each step's output** goes to `catalog-src/build/log.txt`. Its working files (the list, the combined audit, the
review list) are kept in `catalog-src/build/`, which isn't committed. A failed step stops the build, with the
step's last lines. If a step fails after the catalog was written, the build says so: `git diff` shows what was
written, and a build after the fix makes the rest match.

## The steps

| # | Step | Script | Writes |
| --- | --- | --- | --- |
| – | Stops first if the web claims, Kew's checklist or GBIF's downloads are missing (below) | | |
| – | New plants: each saved NC State plant page no record reads, as a record with names and no facts ("Adding plants", below) | `additions.mjs` | `public/plants.json` |
| 0 | `--fetch` only, in rounds until nothing new is asked for: the atlas PDF and the Tallamy spreadsheet if missing; NC State's page for each species with none in the list; each page `ncsu-pages.json` names that isn't saved; USDA PLANTS's name searches; the profiles of the candidates they find, and the picks' characteristics; for a new species USDA doesn't name, GBIF's match and record (its English name). The new plants are then named again from what was saved | `fetch.mjs` | `catalog-src/<source>/<date>/` |
| 1 | The plant list (below) | `list.mjs` | `build/list.json` |
| 2 | The Arkansas atlas as text, and the caterpillar host genera, remade each build from their newest saved files | `pdftotext -layout`, `tallamy.py` | `build/atlas.txt`, `tallamy/genera.json` |
| 3 | The web claims, read again with today's reader (below) | `reclaim.mjs` | `build/web.json` |
| 4 | Combine each plant's claims by the source rules ([catalog-sources.md](catalog-sources.md)), NC State's description read for what its fields don't say ("Reading descriptions" there) | `sample.mjs`, `prose.mjs` | `build/combined.json` |
| 5 | `--fetch` only: USDA's county records and GBIF's names | `usda-fetch.mjs`, `gbif-fetch.mjs` | `catalog-src/web/`, `catalog-src/gbif/` |
| 6 | Write the settled facts into the catalog; then keep only the new plants that ship, and the page each was found on | `write-cli.ts` (`catalog:write`), `additions.mjs` | `public/plants.json`, `build/review.json`, `build/additions.json`, `scripts/catalog/added-plants.json` |
| 7 | Counties, made once; the atlas's county maps, made again when the atlas PDF is newer | `counties.mjs`, `atlas_counties.py` | `counties.json`, `arkatlas/counties.json` |
| 8 | USDA's county records, placed | `usda-counties.mjs` | `usda-counties.json` |
| 9 | Native status by state, from Kew's checklist | `wcvp.mjs` | `wcvp-native.json`, `wcvp-regulated.json`, `wcvp-review.json` |
| 10 | The wild records: counties, native status, the law's lines, bloom months ([wild-records.md](wild-records.md)) | `wild.mjs` | `public/wild/1/`, `native-review.json`, `bloom-review.json` |
| 11 | The catalog's checks, then the report | `check.ts`, `report.mjs` | `docs/catalog-review.md` |

Paths without a folder are in `catalog-src/`. The order matters:
- Every fetch comes before the write, so a network failure leaves the catalog as it was.
- `sample.mjs` reads the catalog as it stands, for the older values it keeps and the form order it prefers.
- Steps 7 to 10 read the catalog after the write.
- From the write on, the build holds `catalog-src/.lock`, so no fetch or search can change the pages under it.
- Until the write, `public/plants.json` holds the new plants' names for the steps to read. A build that stops
  before then puts it back as it was.

## What it reads

**Committed:**
- `public/plants.json`.
- `scripts/catalog/ncsu-pages.json`.
- `scripts/catalog/added-plants.json`: the page each plant added from NC State was found on (written by the
  build).
- The reviewed lists the scripts keep:
  - `site-terms.json`: the terms readings;
  - `regulated-plants.json`;
  - USDA picks and renames: `PICK` (usda-pick.mjs) and `SAME_PLANT` (usda-counties.mjs);
  - spellings: `GBIF_NAME` (gbif.mjs) and `WCVP_NAME` (wcvp.mjs);
  - `RECORDS_TRUSTED` (bloom.mjs) and `COMPANY` (web.mjs);
  - `decisions.json`: what a person decided on review items ([catalog-sources.md](catalog-sources.md), "Decisions").

**Kept in `catalog-src/`** (git-ignored). The build stops before writing anything if one of the last three is
missing:
- **The pages the fetcher saved**, each with its date and what the site answered.
- **`web-claims.json`**: the web search's claims, plant by plant, each with the page it was read from. This is
  `search.mjs`'s output: the facts read from pages we fetched ourselves, each citing its page. Brave's results
  aren't kept (its terms; [catalog-sources.md](catalog-sources.md), "Searching the web"). Without this file the
  build would drop every fact the web gives.
- **Kew's World Checklist** (`kew-wcvp/`): wcvp.zip from sftp.kew.org/pub/data-repositories/WCVP/, unzipped by
  hand.
- **GBIF's downloads** (`gbif-downloads/bloom.tsv`, `counties.tsv`): requested with the account, and fetched
  without one, by `gbif-download.mjs` ([bloom-months.md](bloom-months.md)). Without them the wild records would
  lose every bloom month and every GBIF county.

**Not run by the build:**
- **The web search** (`search.mjs`). It needs the search key, and a person or agent reads each new site's terms
  before any of its pages are used. A plant it hasn't searched yet is named in the report. Its claims are added
  to `catalog-src/web-claims.json`.
- **GBIF download requests** (the account).
- **Kew's download.**

## The plant list

For each record, in the catalog's order: `{ id, species, genusOnly?, ncsu?, usda? }`. It's worked out from the
catalog by rule, except where a committed file says otherwise.

- **Species.** A botanical name's species is:
  - "Genus × epithet", or "Genus x epithet" with a plain x: the hybrid species (Fothergilla × intermedia, Magnolia
    × soulangeana). Such a species isn't searched in USDA PLANTS, whose pick never takes a hybrid's entry.
  - else the first two words, where the second is a lowercase word other than "x" or "hybrid". So Salvia
    azurea 'Nekan' is Salvia azurea, and a subspecies or variety is read as its species.
  - Anything else names only a genus (`genusOnly`): "Hosta spp.", "Rosa 'Julia Child'", "Ilex x 'Nellie R.
    Stevens'", "Artemisia hybrid".
    Such a record isn't looked up on the atlas or in USDA PLANTS. It gets no NC State page by the rule, since a
    genus's page describes the genus, not the plant.
- **Known quirks**, as the 2026-10-18 audit read the names:
  - A hybrid of two species takes the first parent: Salvia greggii × microphylla is S. greggii.
  - A record of two plants reads only the first: Salvia officinalis / Origanum vulgare; Prunus x yedoensis /
    'Kwanzan' reads the Yoshino cherry's page.
  - "Tulipa hybrids" passes as an epithet.

  Fixing one changes the catalog, so each fix is its own change, with its diff reviewed.
- **NC State.** The species' page (its name in lower case, hyphenated, × as x: `fothergilla-x-intermedia`),
  where one is saved. `scripts/catalog/ncsu-pages.json` names the exceptions, chosen by hand, or `null` for none.
  An exception is a cultivar's own page, the one cultivar page a record of several reads, a genus's page, or a
  species' page under another name. For a genus or group record, a cultivar's page counts as the cultivar's, its
  size, form and flower color included, only when the record names that one cultivar (Thuja 'Green Giant'). For a
  record of several cultivars, genus or species, it counts as species-level: 'Natchez' doesn't speak for 'Tonto',
  nor 'Bloodgood''s purple leaves for 'Seiryu' (fixed 2026-10-24: before, a species record of several read its
  one cultivar page as its own, size and form included).
- **A page NC State moved.** When NC State renames a plant, the old page answers with a redirect to the new one
  (coreopsis-verticillata → anacis-verticillata). The fetcher keeps the answer without following it. The list
  then points at the new page, and `--fetch` asks for it. That's one move, and only from a species' own page: a
  page `ncsu-pages.json` names that moved is listed in the report, for its entry to be pointed at the new page.
- **A page under another name.** A page is read when the name it gives is the plant's. Where it gives another,
  `ncsu-pages.json`'s `names` can accept it: the page, and the name it gives. It's for three cases, each checked
  against Kew's checklist:
  - NC State's own misspellings ("Geranium manculatum");
  - synonyms: Helenium nudiflorum for H. flexuosum; Hydrangea petiolaris, which Kew accepts, for the catalog's
    H. anomala subsp. petiolaris;
  - the new names of the pages NC State moved, where Kew makes the two names one plant (Coreopsis verticillata
    is Anacis verticillata to Kew).

  Where Kew keeps them apart, the record's entry in `pages` is `null`. NC State moves Schoenoplectus
  tabernaemontani to S. lacustris, and Vaccinium virgatum to V. corymbosum. `names` is by record, so another record
  that reaches the same page isn't accepted by it.
- **USDA PLANTS.** The symbol `usda-pick.mjs` picks from the species' saved name search: its own name at species
  rank, not a hybrid or a variety, and a profile that is the plant's own or a reviewed rename.

## Adding plants

NC State's Plant Toolbox lists every plant page in its sitemap (`https://plants.ces.ncsu.edu/sitemap.xml`, about
4,700). Saved with the fetcher like any page, it lets the build add the plants the catalog doesn't have
(`additions.mjs`):

- **Which pages** (agreed 2026-10-24). Each plant page the sitemap lists that's saved, and that no record reads.
  Left out, with why, in `build/additions.json`:
  - a vegetable (NC State's Vegetable, Warm or Cool Season Vegetable tag) or a weed (its Weed tag), unless it's
    also tagged Native Plant: wild garlic is a cool-season vegetable to NC State, and asters weeds, and both are
    garden natives. (A Houseplant tag needs no rule: oleander and Confederate jasmine carry it, and a plant ships
    only with its hardiness.)
  - a genus's own page ("Hosta"): it describes the genus, not one plant;
  - a plant the catalog has under the same name, reading another page (a cultivar record reading its species'
    page): listed with its id. To have that record read the cultivar's own page, add it to `ncsu-pages.json`;
  - a second page for a plant already found.
- **The record.** Its id is the page's name. It has names and no facts: the steps fill it like any other.
  - Its botanical name is the page's title, × for NC State's x, without ® or ™.
  - Its name in the app: a species', USDA's common name (from its profile); else GBIF's English name (its
    backbone record's `vernacularName`, the first where it gives several in one; a plant added before
    2026-10-26 with all of them as its name is renamed so by each build, the others kept as its synonyms:
    `shortenListNames`); else NC State's, where it gives
    just one; else the botanical name. NC
    State lists a plant's names alphabetically, in several languages, and often a related plant's, so which one
    is the plant's can't be told from its list ("Abeto Del Colorado, Balsam Fir, Colorado Fir, …" for white fir).
    A cross of two species written as one (Ilex verticillata × serrata) takes neither parent's USDA or GBIF name.
  - A cultivar's, or a trade-named plant's or group's ("Echinacea purpurea PowWow Wild Berry 'PAS702917'",
    "Berberis thunbergii Sunjoy Group"): NC State's name for it that starts with the cultivar or names it or the
    trade name ("'Edward Goucher' Glossy Abelia", "Crimson Sunset Maple"); else its species' name and the cultivar,
    or the trade name where the cultivar is a breeder's code ("Purple coneflower PowWow Wild Berry"). Its parent is
    the catalog's record for exactly its species, an added one too. (A group is one plant, not a genus's page.)
  - NC State's other names are its `synonyms`.
- **Which ship.** After the write, a new plant stays only with what the app needs to place it, each sourced (not
  the older list's): its form, its size (height or spread), its hardiness (both zones) and its sun. A cultivar
  takes form, hardiness and sun from its species, and waits while its species does. One that waits is left out of
  the catalog, the wild records and the review, and is tried again next build. The report counts them, and what
  each still lacks.
- **Once added**, the page it was found on is kept in `scripts/catalog/added-plants.json`, so later builds read
  the same page for it and don't add it again. That holds once its record is deleted, too: to keep an added plant
  out, delete its record; to have it added again, delete its line there as well. A page `ncsu-pages.json` names
  for it by hand comes first.

## Cultivar names

Agreed with Jason 2026-10-25: a cultivar is named **the plant, then the cultivar in quotes, or its trade name
without them**: "Hydrangea 'Limelight'", "Giant Hyssop 'Acapulco Orange'", "Nandina Flirt" (a trade name; its
registered cultivar, 'Murasaki', stays in the botanical name). The words are the sources' own; only their order
and the quotes change (`scripts/catalog/names.mjs`). The plant part is what the name already says around the
cultivar; a name that is the cultivar alone takes its species' name in the catalog, else its genus. Left as they
are: groups ("Astilbe 'Visions' series"), names that never say which cultivar, and names with the cultivar in the
middle ("Red Rome Apple"). The former name is kept as a synonym, and search reads synonyms.

The build's write step applies it; `npm run catalog:names` applies it to the catalog as it is.

**A cultivar's quotes, not an apostrophe** (2026-10-26). A quote opens after no letter or digit and closes before
none (`quotedCultivars`, ncsu-page.mjs): "Kalm's St. John's wort" names no cultivar, "'Kramer's Supreme'" is one,
and "Lamb's ear 'Big Ears'" names 'Big Ears'. Until then an apostrophe was read as a quote: a species with a
possessive in its name was taken for a cultivar and lost its size, a name was cut at it ("Common pear 'Blake'"),
and a record with one in its name read as naming several cultivars and lost its own page's size.

**Linked to its species.** A record of one cultivar that names no species is linked to its species' record
(`parent`) where the catalog has exactly one (`linkCultivars`, split.mjs; Jason, 2026-10-26, so the picker can
fold a species' cultivars under it): the record whose botanical name is its own without the cultivar (a variety's,
"Rudbeckia fulgida var. sullivantii" for 'Goldsturm'), else its species'. Not a record of the earlier list naming
a cultivar beside its species ("Aucuba japonica ('Gold Dust')"), or two plants (with a /): those wait for a
decision.

## Reading the web claims again

The search's claims are read again from the saved pages they cite, with today's reader (`web.mjs`). A fix to the
reader reaches every plant this way, without searching again. Only the pages that gave a claim then are read:
a page that gave nothing under the old reader isn't among them. Pages no longer saved are counted.

## The report

[catalog-review.md](catalog-review.md) lists what the build left for a person. It's made only from the build's own
files, so it changes only when what's waiting changes. A contents list leads, with each section's count. Most
useful first:

- **The writer's items:**
  - sources disagree;
  - a tree form left unsettled;
  - "edible" on a plant rated toxic;
  - values held back as implausible.

  Each shows what the sources say and the catalog's value now. The catalog keeps its older value, marked
  unverified, meanwhile.
- **Kew's names:** names WCVP could read two ways, and law-list names Kew accepts under another or doesn't match.
- **Native status held back**, and bloom months held back.
- **Pages:**
  - a page under another name, mostly NC State's own misspellings;
  - a name the atlas maps twice;
  - a genus's page read for a plant;
  - a page the list names but that isn't saved.
- **Not looked up yet:** pages `--fetch` would ask for. Also plants not searched on the web, and sites whose terms
  are unsettled.
- **Catalog checks** (`npm run catalog:check`), grouped by what each says.
- **For reference:** counts of what the sources had nothing to give.

The summary line counts what's waiting by kind: to decide, pages not fetched, plants not searched, sites whose
terms are unsettled, and catalog checks.

**Where a decision goes.** Each kind of item that has a place to record the decision names it, and the next build
then drops the item:
- an NC State page to read or not, or a page under another name to accept: `ncsu-pages.json`;
- a law list's name: its `accepted` in `regulated-plants.json`;
- bloom months to trust: `RECORDS_TRUSTED` in bloom.mjs;
- a cultivar's form, a plant both edible and toxic, native status held back, Kew's homonyms, a genus page, a
  record of several cultivars to split: `decisions.json` ([catalog-sources.md](catalog-sources.md), "Decisions").
  A split is applied first, before new plants are found: a cultivar with a page of its own is then added from it.

**The rest don't have a place yet**, and the report says so for each: sources that disagree, a value held back as
implausible, a value its source no longer gives, and the atlas's double maps. They stay listed until there is one.
