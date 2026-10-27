# When plants leaf out: sources

Why: the bulb rule (decided with Jason, 2026-10-26). A spring bulb planted under a deciduous plant at least 3 ft tall
doesn't crowd it, because the bulb flowers and ripens its leaves before the bigger plant leafs out. To check that per
plant, or to say how much spring sun a bulb gets under it, the catalog would need when each plant leafs out. No source
the catalog reads gives that yet. These are the candidates, looked into on 2026-10-26. Nothing below has been added
to the catalog.

## USA National Phenology Network (USA-NPN)

Volunteers' and researchers' repeated observations of marked plants: on each visit, whether the plant is breaking
leaf buds (trees and shrubs) or showing its first growth (herbs). The first "yes" after a "no" gives the day it
leafed out, for that plant in that year.

- **License.** Its Data Use Policy puts the data under CC BY 4.0, "for any purpose, as long as appropriate credit is
  given". It cites the data as "USA National Phenology Network. [year]. Plant and Animal Phenology Data", doi:
  10.5066/F78S4N1V, and asks that publications acknowledge "Data were provided by the USA National Phenology
  Network." Its for-profit policy "makes no special allowances nor applies any special restrictions on for-profit
  companies". (Website Terms of Use, version 2.5, 2022-03-02: <https://www.usanpn.org/terms>.)
- **Automated access needs its OK.** The same terms say users may not use "any automated means … to access,
  monitor, or copy any part of the Site, except those automated means, if any, that are approved in advance and in
  writing". They don't name the data API, which exists for programs (the `rnpn` R package uses it, and each
  request carries a `request_src` naming who asks), but they don't exempt it either. So the build doesn't use it
  until USA-NPN says yes in writing, or the data comes from its download page by hand. **For Jason:** whether to
  ask (an email from hello@fullgrown.garden), or download by hand.
- **Reachable.** The agent proxy lets the build reach `services.usanpn.org` (no robots.txt there). To check that,
  four requests were sent on 2026-10-26, one at a time with the catalog's user agent: the robots.txt files, the
  species list, the phenophases for one species, and one data query. None since.
- **Coverage.** 1,544 plant species. 675 of the catalog's species are among them by name (955 records with their
  cultivars).
- **What a query gives** (eastern redbud, "Initial shoot or leaf growth", 2012–2025, Arkansas and the states around
  it): 372 plant-years, 323 of them with a "no" within 14 days before the first "yes", so the day is known to
  within two weeks. Median day of the year by state: Louisiana 60 (n 9), Mississippi 66 (2), Arkansas 73.5 (6),
  Oklahoma 78 (28), Texas 80 (126), Missouri 92 (67), Tennessee 92 (85). Arkansas alone has few, so a value for
  Caddo Valley would come from sites within a band of latitude, or the nearest N sites, the way bloom months come
  from GBIF's records ([bloom-months.md](bloom-months.md)).
- **Also in its species list:** each species' kind of leaves (`functional_type`: deciduous broadleaf, evergreen
  broadleaf, semi-evergreen forb, drought deciduous broadleaf, …). A second source for leaves in winter, for the
  woody plants; for most herbs it says only "forb".
- **If it's approved**, a sketch: for each catalog species USA-NPN has, one summarized-data request at the
  fetcher's pace (about 675 requests: under an hour at 5 s), saved like any page; a `leaf_out` fact as the median
  week, with `at` for the region it was computed for, only where enough plant-years back it (say 10 or more).
  Cultivars take their species'.

## Panchen and others (2014)

"Leaf out times of temperate woody plants are related to phylogeny, deciduousness, growth habit and wood anatomy",
*New Phytologist* 203(4): 1208–1219, doi:10.1111/nph.12892. About 1,600 woody species observed in eight gardens,
the Arnold Arboretum among them. The abstract calls its leaf-out data "open access", but no repository or license
for the data was found (University of Minnesota's record of the paper names none), and Wiley's page for it refused
our fetch, so its supporting information couldn't be read. Not usable until the data and its license are found.
Gardens in Massachusetts and the like also leaf out weeks later than Arkansas, so it would give an order (which
species leaf out early), not dates for here.

## USDA PLANTS: Active Growth Period

USDA's characteristics give, for some species, the seasons it actively grows ("Spring and Summer", "Year Round").
The build saves those pages already (about 723 with characteristics) but doesn't read this field. It's a season,
not a date, so it could say which plants are still dormant in early spring only roughly.

## iNaturalist

Since 2024, observers can annotate what a plant photo shows of its leaves, which would date leaf-out from
photos. Each observation carries its own license, some not open to commercial use, so it would need a filter by license and a
read of iNaturalist's terms for its API. Not looked into further.
