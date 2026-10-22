# Wild plant records near the garden

A plant's details say where it's recorded growing wild near the garden ("Recorded growing wild in Clark
County"), and the picker's "Hardy in zone …" filter counts a plant rated only for cooler zones if it's
recorded wild in the garden's county or a county bordering it. A published zone range's warm end is a
judgement about heat and humidity, and a plant collected growing wild next door has been found living
through those summers. Not the cold end: the atlas records escaped garden plants too, and a tender annual
collected one summer says nothing about winters. Records are historical (when the plant was collected),
not a promise for every spot in a garden (a woodland plant still wants its shade), so the app says only
what the record shows: "recorded", never "grows".

## What the records are

| What | Source |
| --- | --- |
| Arkansas counties a plant is recorded in | **Atlas of the Vascular Plants of Arkansas** (Arkansas Vascular Flora Committee, 2013), its county dot maps. A dot is a herbarium record: the plant was collected growing in that county. Native and introduced plants both (an escaped garden plant growing wild there counts). |
| Counties a plant is recorded in, every state | **USDA PLANTS Database** (NRCS) county records, as its site's distribution map shows them (its public map service; US government work). Native and introduced. (The map service holds no "Excluded" county records: a query for them counts none.) Connecticut has no county records. |
| More counties in a state where the atlas or USDA records it already | **Herbarium specimens on GBIF.org**, counted by county in an occurrence download GBIF built (cited by its DOI: doi:10.15468/dl.3jzk4m), CC0 and CC BY records only. Specimens only, not those marked cultivated or captive (few are: 65 of 760,000); never observations (a planted shrub is too easily logged as wild). Only in or next to a county the atlas or USDA records it in, in the same state: they fill in a range, never extend it or add a state. Unchecked, GBIF's specimens put garden camellias, Chinese chestnuts and a Tennessee coneflower "wild" in Arkansas. |
| County names, and which counties border which (across state lines) | U.S. Census Bureau cartographic boundary files (1:10m counties), as packaged by `us-atlas` 3.0.1 |
| The garden's county | its ZIP code's row in the ZIP tables ([climate-data.md](climate-data.md)) |

Only facts are taken from the atlas: which counties a species is recorded in. No map, image or text of it
is stored or shipped. A missing dot isn't evidence the plant can't grow there (no one may have collected
it), so the app never says "not found here".

## How they're read

`npm run catalog:build` runs these in order, with the rest of the catalog ([catalog-build.md](catalog-build.md)).

1. `node scripts/catalog/counties.mjs`: every US county's FIPS code, name, state, center and neighbors,
   to `catalog-src/counties.json`.
2. `python3 -I scripts/catalog/atlas_counties.py <atlas.pdf> catalog-src/counties.json
   catalog-src/arkatlas/counties.json`: every species map's counties. Each map in the PDF is the same
   county base map with each dot a small image placed on its county, so the PDF gives each dot's exact
   spot. The spots gathered from all the maps are the 75 counties, matched to the counties' real centers
   by the best affine fit; the run stops if any spot sits more than 5 points (on a map 189 wide) from its
   county's fitted center, or if any dot isn't on a county spot. (The 2013 atlas fits within 3.7 points,
   1.3 on average.) The species is the bold name under its map; a species mapped more than once (as its
   varieties) gets every county.
3. USDA's records: each catalog plant's USDA profile (by the symbol the audit found) gives its PLANTS id,
   and the PLANTS site's map service gives its county records with their shapes (fetched politely into
   `catalog-src/web/`). USDA's county ids are its own, so `node scripts/catalog/usda-counties.mjs
   <combined.json>` places each record by its shape: the county (Census boundaries) its center falls in,
   or, where that county's name isn't the record's (a city inside a county), one of its corners' counties
   that has its name. Of about 446,000 records, 68 couldn't be placed (all on Pacific islands); checked
   against every record's own name and shape, none is in the wrong county or state. A plant gets USDA's
   records only under its own name, or a rename of the same plant reviewed by hand (`SAME_PLANT`: USDA's
   symbols also lead from misapplied names, lumps and Old World look-alikes to other plants, and those
   are left out: 11 plants; a rename is checked to its rank, ssp. or var.). A plant listed as two taxa
   ("Salvia officinalis / Origanum vulgare") gets no records, from either source. A cultivar or mix, or a variety USDA has only as its species, gets its
   species', said so.
4. GBIF's specimens: `gbif-fetch.mjs` (GBIF's names for the species, and each state's counties in GADM,
   GBIF's map of areas), then `gbif-download.mjs request counties <combined.json>` and, once built,
   `gbif-download.mjs fetch counties` ([bloom-months.md](bloom-months.md) has the account and the
   steps). GADM's counties are matched to ours by name in the state. A county and an independent city
   sharing a name are told apart where GADM has both (Roanoke, Virginia); where it has one area, that's the
   county, except the three it lumps with their cities (Richmond, Virginia, whose city and county are 50
   miles apart; Baltimore; St. Louis), which match none. Bedford City and Clifton Forge, Virginia, merged into
   Bedford and Alleghany Counties, are those counties; three renamed since (Shannon, SD is Oglala Lakota) by
   their new names; lakes match none.
5. `node scripts/catalog/wild.mjs <combined.json>`: `public/wild/1/<state>.json` for every state with
   records (52, with DC and the territories), and `public/wild/1/index.json`. The `1` is the format: a new
   format goes in a new folder (and a new cache on the device), so an app never reads a format it wasn't
   made for.
   A plant gets its own taxon's records: a species all its maps (its varieties' too), matched by the atlas
   name the audit found for it or its botanical name; a variety or subspecies its own map. A cultivar or
   mix with no species record in the catalog, or a variety the atlas maps only as its species, gets its
   species' records, listed in `species` so the app says "Its species is recorded…". A hybrid gets none.

## The files

`public/wild/1/<state FIPS, two digits>.json`:

```json
{
  "v": 1, "state": "AR", "fips": 5,
  "sources": { "arkatlas": { "title": "Atlas of the Vascular Plants of Arkansas (…)", "url": "…" }, "usda": { "title": "USDA PLANTS Database (NRCS), county records", "url": "…" } },
  "counties": {
    "5019": { "name": "Clark", "near": [5039, 5059, 5097, 5099, 5103, 5109] },
    "48037": { "name": "Bowie", "state": "TX", "near": [5081, 5091] }
  },
  "plants": { "quercus-muehlenbergii": [5005, 5007, 5019] },
  "src": { "quercus-muehlenbergii": ["arkatlas", "usda"] },
  "species": ["rudbeckia-fulgida-goldsturm"],
  "native": { "quercus-muehlenbergii": "N", "lonicera-japonica": "I" },
  "nativeSpecies": ["rudbeckia-fulgida-goldsturm"],
  "regulated": { "lythrum-alatum": ["AR:lythrum"] },
  "rules": { "AR:lythrum": { "says": "Prohibited in Arkansas: …", "tier": "ban", "title": "Arkansas Plant Board rules (…)", "url": "…", "edition": "…", "read": "2026-10-21" } },
  "genusWide": { "lythrum-alatum": { "AR:lythrum": "Lythrum" } }
}
```

County codes are five-digit FIPS as numbers. `counties` holds the state's own counties (their neighbors
in any state) and the counties over its line that border it (their state, and their neighbors in it), so
a garden in Texarkana, Texas is told about Miller County, Arkansas. `plants` is keyed by catalog id: the
union of its sources' records in the state, `src` naming them (the details line cites them). Where any
source has the plant's own taxon's records, only those count: a variety never takes its species'
counties from another source in that state. `species` lists plants whose records are their species'; a cultivar with a
species record in the catalog uses that record's, and says so.

`regulated`: the plants a law regulates in the state, each with its lines (`rules`): the state's list's,
then the federal list's ([regulated-plants.md](regulated-plants.md)). Only the garden's own state's file is
read for them: Arkansas's law isn't a Texas garden's.

Each line's `tier` is "ban" or "listed" (an older file's lines have none: shown as bans, said as "covered").
`genusWide` names, for a plant a whole-genus entry took in (one that excepts no species), the genus, by line: for the line that says why a plant native to the state is
covered all the same ("this rule bans every Lythrum species, natives included").

`native`: each plant's status in the state, `N` native or `I` introduced, from Kew's **World Checklist of
Vascular Plants** (WCVP, CC BY 3.0; Govaerts (ed.) 2026, WCVP version 16, doi:10.34885/egs6-cp24, as of
2026-06-04; and Govaerts et al. 2021, doi:10.1038/s41597-021-00997-6), whose distribution gives each species'
presence in each US state (TDWG "botanical countries": the states, DC, Puerto Rico; the Aleutians are
Alaska's; not the Virgin Islands, which WCVP joins with the British ones), native or introduced; not where
it's marked extinct or doubtful there. `nativeSpecies` lists plants whose status is their species' (a
cultivar, mix or variety: "Its species is native to Arkansas"). The app shows it in a plant's details ("In
Arkansas: Native to Arkansas", with Kew named under it; an introduced one in the warning color) and filters on
it ("Native to Arkansas": `N`; offered only where the state's file has native status).

- **Not said where the catalog disagrees:** a plant the catalog calls "Exotic" (from its own sources) is never
  shown native: WCVP's species can hold a native subspecies the garden plant isn't (its Rubus idaeus holds the
  American red raspberry, so the European one would read "Native to New York"). Listed in
  `catalog-src/native-review.json` for review.
- **A missing state isn't "not native":** WCVP leaves states out (Salvia lyrata isn't listed for Arkansas,
  though the Arkansas atlas records it in many counties; 38 Arkansas plants recorded wild are unlisted there),
  so the filter means "Kew lists it native here", and an unlisted plant gets no line, never "not native".
- **The catalog's own "native"** is North America-wide ("N. American native"); this is the garden's state.
- **Not native, and recorded growing wild here all the same.** Where Kew has a plant introduced in the state and
  the state's file has county records for it, the line says both, with the count: "Not native to Arkansas;
  recorded growing wild in 65 of its 75 counties" (a cultivar with only its species' records: "Its species isn't
  native…", since a sterile cultivar may not seed; Louisiana's parishes, Virginia's "counties and cities", the
  District "there"). The picker's row says it in short ("Not native; recorded wild in 65 of 75 Arkansas
  counties"). A fact-based warning: no council's judgment, only Kew's status and the county records, which for an
  introduced plant are the curated sources' alone (GBIF's specimens never fill in a plant introduced in the
  state). It doesn't say invasive, or even escaped from gardens: the records are vouchers outside cultivation,
  some old, some of waifs that didn't persist (the atlas says so of a few of its introduced taxa), and some
  plants arrived by accident (squirrel-tail grass). The count says how widely it's been recorded, which follows
  how much collecting was done as well as how far it has spread. With the law's lines, it's shown first in the
  details.

How it's read: `node scripts/catalog/wcvp.mjs <combined.json>` reads `catalog-src/kew-wcvp/` (wcvp.zip from
sftp.kew.org/pub/data-repositories/WCVP/, unzipped; no robots.txt there) and writes
`catalog-src/wcvp-native.json`. Each catalog species is matched by name: an accepted species, or a synonym's
accepted species (Aster novae-angliae is Symphyotrichum novae-angliae); where a name is both accepted and a
later homonym's synonym, the accepted one (the run lists each such case, for review); not where its names
lead to more than one, or to a variety (Hibiscus lasiocarpos is H. moscheutos var. lasiocarpos to WCVP: the
species' range isn't its alone). Three spellings are WCVP's own (`WCVP_NAME`: Andropogon gerardi, Buddleja
davidii, Monarda bradburyana). 745 of 771 matched; the rest are hybrids, those synonyms, species WCVP draws
narrower than the catalog's name, and exotics it doesn't list in the US.

Not USDA's county marks: they carry one native status per jurisdiction (the lower 48, Alaska, Hawaii, Puerto
Rico), the same in every state, so they can't say a plant is native to Pennsylvania.

GBIF's specimens don't fill in counties for a plant introduced in the state by WCVP: planted specimens of a
garden plant are as likely as escaped ones, and herbaria seldom mark them.

`public/wild/1/index.json`: `{ "v": 1, "states": { "5": "AR" }, "border": { "48037": [5] } }`: which states
have a file, and which files a county outside them should load. The app loads the garden's own state's
file and any its county borders. The index is part of the offline copy; a state's file (up to 250 KB,
4 MB in all) is kept on the device once fetched (src/sw.ts, cache `fullgrown-wild-1`) and refreshed in the
background when online. The garden's county is remembered on the device once looked up (the last 20
ZIPs), so it all works offline after the first time. A lookup that finds
nothing (offline before the county was ever looked up) is tried again a minute later.

## Limits

- The garden's county is the one its ZIP area's center is in. A ZIP that spans a county (or state) line
  gets one of them: a garden near the line may be told about the county next to its own.
- A missing dot isn't evidence of anything, so nothing is said where there are no records.
- "…none recorded in or next to yours" is about records, not about whether it would grow.
