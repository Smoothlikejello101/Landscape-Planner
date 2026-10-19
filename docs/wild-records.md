# Wild plant records near the garden

A plant's details say where it's recorded growing wild near the garden ("Recorded growing wild in Clark
County"), and the picker's "Hardy in zone …" filter counts a plant recorded wild in the garden's county or
a county bordering it, whatever its rated zones. A published zone range is a judgement about heat, cold and
humidity; a plant that grows wild in the next county has lived through that county's winters and summers.
It isn't a promise for every spot in a garden (a woodland plant still wants its shade), so the app says
only what the record shows.

## What the records are

| What | Source |
| --- | --- |
| Arkansas counties a plant is recorded in | **Atlas of the Vascular Plants of Arkansas** (Arkansas Vascular Flora Committee, 2013), its county dot maps. A dot is a herbarium record: the plant was collected growing in that county. Native and introduced plants both (an escaped garden plant growing wild there counts). |
| County names, and which counties border which (across state lines) | U.S. Census Bureau cartographic boundary files (1:10m counties), as packaged by `us-atlas` 3.0.1 |
| The garden's county | its ZIP code's row in the ZIP tables ([climate-data.md](climate-data.md)) |

Only facts are taken from the atlas: which counties a species is recorded in. No map, image or text of it
is stored or shipped. A missing dot isn't evidence the plant can't grow there (no one may have collected
it), so the app never says "not found here".

Later: USDA PLANTS has county records for the whole country (see the USDA row in
[catalog-sources.md](catalog-sources.md)), which would cover every state the same way.

## How they're read

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
3. `node scripts/catalog/wild.mjs <combined.json>`: `public/wild/05.json` (each catalog species matched
   by the atlas name the audit found for it, or its botanical name) and `public/wild/index.json`.

## The files

`public/wild/<state FIPS, two digits>.json`:

```json
{
  "v": 1, "state": "AR", "fips": 5,
  "source": { "title": "Atlas of the Vascular Plants of Arkansas (…)", "url": "…", "counties": "…" },
  "counties": {
    "5019": { "name": "Clark", "near": [5039, 5059, 5097, 5099, 5103, 5109] },
    "48037": { "name": "Bowie", "state": "TX", "near": [5081, 5091] }
  },
  "plants": { "quercus-muehlenbergii": [5005, 5007, 5019] }
}
```

County codes are five-digit FIPS as numbers. `counties` holds the state's own counties (their neighbors
in any state) and the counties over its line that border it (their state, and their neighbors in it), so
a garden in Texarkana, Texas is told about Miller County, Arkansas. `plants` is keyed by catalog species
id; a cultivar uses its species' records, and says so.

`public/wild/index.json`: `{ "v": 1, "states": { "5": "AR" }, "border": { "48037": [5] } }`: which states
have a file, and which files a county outside them should load. The app loads the garden's own state's
file and any its county borders. The files are part of the offline copy; the garden's county is
remembered on the device once looked up, so they work offline.
