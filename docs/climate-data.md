# Climate data: ZIP code → hardiness zone and frost dates

`public/climate/<first three digits of the ZIP>.json` holds, for each ZIP code,
its 2023 USDA hardiness zone and the frost record of the nearest weather
station (within 50 miles of the ZIP area's center). The app fetches one file
when a ZIP is looked up (`src/climate.ts`), and the plan keeps the answer. A
ZIP is never sent anywhere else. The files aren't part of the offline copy.

## Sources (accessed 2026-10-17)

| What | Source | Terms |
| --- | --- | --- |
| Hardiness zone by ZIP code | PRISM Group, Oregon State University: `phzm_{us,ak,hi,pr}_zipcode_2023.csv` from https://prism.oregonstate.edu/phzm (the data behind the 2023 USDA Plant Hardiness Zone Map) | "May be freely reproduced and distributed"; any description of the data must state the PRISM Group's name, URL and the date of access (https://prism.oregonstate.edu/terms/). The app shows this wherever a zone appears. Commercial use isn't addressed; questions go to prism-questions@nacse.org. |
| Where each ZIP code area is | U.S. Census Bureau, 2024 Gazetteer, ZIP Code Tabulation Areas (`2024_Gaz_zcta_national.txt`) | U.S. government work, public domain |
| Frost dates | NOAA NCEI U.S. Climate Normals 1991–2020, annual/seasonal, by station (`us-climate-normals_1991-2020_v1.0.1_annualseasonal_multivariate_by-station_c20230404.tar.gz`) | U.S. government work, public domain |

## What the frost numbers are

From NOAA's 32 °F freeze probabilities:

- `spring` / `fall`: `ANN-TMIN-PRBLST-T32FP50` / `ANN-TMIN-PRBFST-T32FP50`. Half of years have their last spring freeze later than `spring`, and their first fall freeze earlier than `fall`.
- `springLate` / `fallEarly`: the `P10` columns. Only 1 year in 10 is riskier than these dates. NOAA's sample file confirms the direction: spring P10 04/04, P50 03/16, P90 02/26; fall P10 11/04, P50 11/19.
- `chance`: `ANN-TMIN-PRBOCC-LSTH032`, the percent of years with any freeze. Below 50, dates aren't given; the app says frost is rare.

Stations with no temperature records (rain gauges), and stations with no dates where freezes come most years, are left out.

## Limits

- ZIPs with no Census area (PO boxes, single buildings) get a zone but no frost dates.
- A very large rural ZIP's center can sit far from where people live, so it may have no station within 50 miles (for example 99701, Fairbanks).
- Frost varies over short distances (low spots, hilltops, cities); the app says so.

## Rebuilding

Put the files in `climate-src/` (not kept in the repo): the four PRISM CSVs, the Gazetteer text file, and the NOAA tarball extracted into `climate-src/normals/`. Then:

```
node scripts/climate/build.mjs climate-src <date accessed, YYYY-MM-DD>
```

and update the access date above.
