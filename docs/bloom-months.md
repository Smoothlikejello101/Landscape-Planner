# Bloom months by state

A plant's details, the list line, the "Blooming in…" filter and the plan's bloom calendar use the months it
blooms **where the garden is**, from flowering records in the garden's state: "Jan–Mar, peak Jan (32
flowering records in Arkansas · GBIF.org…)" for vernal witch hazel. Where the state has too few records, the
state and its neighbors together ("Jun–Aug, peak Jun (113 flowering records in Arkansas and neighboring
states…)" for purple coneflower); where they have too few, the catalog's months as
before (labeled with their own source, or "older list, unverified").

## The source, and why it's an exception

Our source rules leave out crowd-sourced data and aggregators. For bloom months the owner made an exception
(2026-10-19): national references give seasons ("spring"), not months, and months for one state (Minnesota's)
aren't another's; turning a season into months would be a guess. Flowering records are measurements: where
and when a plant was seen in flower.

- **What:** GBIF.org occurrence records in the US whose phenology note says flowers: observations, nearly
  all iNaturalist research-grade (the identification confirmed by others; captive and cultivated plants are
  never research grade) annotated "Flowers", and herbarium specimens noted in flower ("fl", "flr", "fl-fr").
  Not living collections (a botanic garden's plants) or records marked cultivated or captive.
- **Licences:** only records whose own licence allows commercial use with credit (CC0 and CC BY 4.0). CC BY-NC
  records, most of iNaturalist's, are left out.
- **What's kept:** counts by species, state, month and note, never a record, a photo or text.
- **Credit:** GBIF builds the counts itself, as an SQL download with its own DOI, which is the citation
  (GBIF's data user agreement: cite the data by DOI). The app's source line names it ("GBIF.org Occurrence
  Download doi:10.15468/dl.nydfuf"); the DOI's page lists every dataset behind the counts.

## How it's read

1. `node scripts/catalog/gbif-fetch.mjs <combined.json>` (politely: robots.txt, 1 request every 2 s; run
   again to retry what failed): each catalog species' match in GBIF's backbone (exact, species rank; a plain
   synonym counts as its accepted name: Aster novae-angliae is Symphyotrichum novae-angliae; doubtful,
   misapplied or fuzzy matches don't, nor a synonym of a variety: Hibiscus lasiocarpos is H. moscheutos
   subsp. lasiocarpos to GBIF, and counting by species would give it the other's records; a few by GBIF's
   own name for the same plant, `GBIF_NAME`), and the
   states' GADM codes (matched to states by their postal codes from GBIF's own GADM lookup).
2. `node scripts/catalog/gbif-download.mjs request bloom <combined.json>` asks GBIF to count the records
   (`DOWNLOADS.bloom` in gbif.mjs: by species, state, month and note), as the FullGrown GBIF account
   (`~/.config/fullgrown/gbif`, mode 600, a curl config line `user = "name:password"`, with any `"` or `\`
   in the password escaped with a `\`; never in the repo). An email
   comes to hello@fullgrown.garden when it's built; then `node scripts/catalog/gbif-download.mjs fetch bloom`
   saves it (`catalog-src/gbif-downloads/bloom.tsv`, and its DOI in `bloom.json`).
3. `node scripts/catalog/wild.mjs <combined.json>` adds each state's bloom windows to its wild-records file
   (`public/wild/1/NN.json`, `bloom` and `bloomSpecies`; docs/wild-records.md).

Why a download, not GBIF's search: its search ignores a `reproductiveCondition` filter without saying so
(sensitive fern, which never flowers, came back with 23,722 "flowering" records: all of them), and asking
state by state took thousands of requests. The download filters on the note itself, in one request.

**Taxonomy:** since October 2026 GBIF's SQL downloads use the Catalogue of Life's keys by default; ours are
its older backbone's (what its name match gives), asked for by `occurrence.gbif_classification.specieskey`.
GBIF calls the backbone deprecated: a move to the Catalogue of Life's keys is on the backlog.

## The rules (scripts/catalog/bloom.mjs)

- **Window:** the shortest run of months holding 80% of the records, wrapping past December (witch hazel:
  Dec–Feb); the busiest such run on a tie. The peak is the month with the most.
- **Enough records:** 30 in the state; else 30 in the state and its neighbors together; else none.
- **Checked against NC State:** where NC State gives seasons (not a nursery alone), a plant whose US-wide
  window (of at least 30 records) shares no month with them is left out and listed for review
  (`catalog-src/bloom-review.json`).
- **Which plants:** species and varieties (a variety is looked up as its species, and says so); a cultivar
  with a species record in the catalog takes its species'; a cultivar or mix without one looks up its
  species, said so ("its species: …"). Not hybrids, or two taxa in one entry.

## Limits

- Observations cluster where people are and on showy plants: a wind-pollinated tree's flowering is
  photographed less than a coneflower's.
- The flowering note is the observer's or the herbarium's, and isn't checked as the identification is; many
  records average out a few mistakes. Notes that don't say ("fertile", "reproductive") or say one or the
  other ("flowering or fruiting") aren't counted.
- Few records are CC0 or CC BY, so most states pool their neighbors' (Arkansas: 8 plants on its own
  records, 282 with its neighbors').
- A cultivar can bloom earlier or later than its species.
