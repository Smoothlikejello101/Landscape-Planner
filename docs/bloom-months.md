# Bloom months by state

A plant's details, the list line, the "Blooming in…" filter and the plan's bloom calendar use the months it
blooms **where the garden is**, from flowering records in the garden's state: "Jun–Aug, peak Aug (252
flowering records in Arkansas · GBIF.org…)". Where the state has too few records, the state and its
neighbors together ("in Arkansas and neighboring states"); where they have too few, the catalog's months as
before (labeled with their own source, or "older list, unverified").

## The source, and why it's an exception

Our source rules leave out crowd-sourced data and aggregators. For bloom months the owner made an exception
(2026-10-19): national references give seasons ("spring"), not months, and months for one state (Minnesota's)
aren't another's; turning a season into months would be a guess. Flowering records are measurements: where
and when a plant was seen in flower.

- **What:** GBIF.org occurrence records in the US tagged as flowering (`reproductiveCondition=flowering`):
  iNaturalist research-grade observations (the identification confirmed by others; captive and cultivated
  plants are never research grade) and herbarium specimens.
- **Licences:** only records whose own licence allows commercial use with credit (CC0 and CC BY 4.0). CC BY-NC
  records are left out.
- **What's kept:** counts by month and state, never a record, a photo or text.
- **Credit:** GBIF's data user agreement asks for citation of the datasets used, by DOI where there is one.
  The datasets behind the counts are fetched too (`datasetsUrl`), for a GBIF "derived dataset" citation with
  a DOI, registered by the owner.

## How it's read

1. `node scripts/catalog/gbif-fetch.mjs <combined.json>` (politely: robots.txt, 1 request every 2 s; run
   again to retry what failed): each catalog species' match in GBIF's backbone (exact, species rank; a plain
   synonym counts as its accepted name: Aster novae-angliae is Symphyotrichum novae-angliae; doubtful,
   misapplied or fuzzy matches don't), its flowering records by month, and for each month with any, by state
   (GADM level 1, matched to states by their postal codes from GBIF's own GADM lookup).
2. `node scripts/catalog/wild.mjs <combined.json>` adds each state's bloom windows to its wild-records file
   (`public/wild/1/NN.json`, `bloom` and `bloomSpecies`; docs/wild-records.md).

## The rules (scripts/catalog/bloom.mjs)

- **Window:** the shortest run of months holding 80% of the records, wrapping past December (witch hazel:
  Dec–Feb); the busiest such run on a tie. The peak is the month with the most.
- **Enough records:** 30 in the state; else 30 in the state and its neighbors together; else none.
- **Checked against NC State:** where NC State gives seasons, a plant whose US-wide window shares no month
  with them is left out and listed for review (`catalog-src/bloom-review.json`).
- **Which plants:** species and varieties (a variety is looked up as its species, and says so); a cultivar
  with a species record in the catalog takes its species'; a cultivar or mix without one looks up its
  species, said so ("its species: …"). Not hybrids, or two taxa in one entry.

## Limits

- Observations cluster where people are and on showy plants: a wind-pollinated tree's flowering is
  photographed less than a coneflower's.
- The flowering tag is the observer's, and isn't checked as the identification is; many records average
  out a few mistakes.
- A cultivar can bloom earlier or later than its species.
