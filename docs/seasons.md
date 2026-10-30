# The garden through the year: what each plant shows, month by month

`src/seasons.ts` (`monthLook`, `yearLook`) says what a plant shows in a month where the garden is: its leaves (coming
out, on, coloring, gone or died back), their colors, its flowers and its fruit. It's the data under two ideas Jason
asked for on 2026-10-27, not yet drawn: plants colored by their leaves and flowers (with a texture by form), and the
garden through the year. How they're drawn waits on his pick from the mockups.

It only arranges facts the catalog already has, and records near the garden, by month. It never adds a fact or infers
one itself; where no source gives a plant's foliage, the catalog's `winter_leaves` (scripts/catalog/winter.mjs: its
species' USA-NPN records, else its relatives) stands in for it. Each part says what placed it (`basis`), so the app can
say "around", "expected" or show nothing:

| basis | meaning |
| --- | --- |
| `records` | observations near the garden: USA-NPN's for leaves (docs/leaf-out.md), GBIF's flowering records for bloom |
| `source` | a source says it outright: the plant is evergreen; the earlier list's bloom months |
| `season` | a season word ("late spring"), or the season convention below where nothing else places it |
| `relatives` | its winter taken from its relatives in the catalog, no source giving its foliage: an expectation, every month of its leaves |
| `unknown` | nothing: no state, no months |

## The rules

- **Seasons.** Meteorological: spring March to May, summer June to August, fall September to November, winter
  December to February. "Early", "mid" and "late" are a season's first, second and third months.
- **Leaves.**
  - Evergreen: on all year. Semi-evergreen: on all year, thin in winter.
  - Deciduous: "emerging" the month it leafs out near the garden, on after that, "turning" from the day its first
    leaves color there, gone after the day its last leaves are. A month takes the state of its middle day, except
    the leaf-out month. Coloring months carry how far through fall they are (0 to 1, from first color to bare), so a
    drawing can blend summer into fall color.
  - Where there are no records near the garden: out in March, coloring September to November, gone December to
    February (`basis: 'season'`). Records for one end of the year and not the other: each end placed by its own.
  - An herb, grass, fern, bulb, annual or water plant that's deciduous dies back: "dormant", not "off".
  - No source's foliage: `winter_leaves` in its place. Recorded bare by USA-NPN, deciduous (`basis` from the timing, as
    above); by its relatives, as they are (`basis: 'relatives'` every month). Neither: no state (`unknown`), the
    not-known ring.
  - No foliage fact: no state (`null`), never guessed.
- **Leaf colors.** The catalog's leaf colors are NC State's list across the seasons and the leaves' undersides (red
  maple: green, gold, orange). The summer colors are that list less the plant's fall colors, unless that leaves
  nothing (a purple smokebush that colors purple in fall stays purple); green first when it's there. "Variegated" is a
  flag, not a color: variegated alone is green, variegated. Coloring months carry the fall colors as well (none where
  the catalog has none).
- **Flowers.** The months it flowers near the garden (GBIF's records, as the bloom calendar uses them), else the
  earlier list's months, else its bloom seasons. Colors: its flower colors, "insignificant" left out; where that's
  all it has, the flowers aren't showy. The earlier list's color words ("White-pink") are passed on only where the
  catalog has no flower colors.
- **Fruit.** Its fruit seasons, in months by the convention, and its fruit colors.
- **Cultivars** take their species' records near the garden, as leaf-out and bloom do.

## Not settled

- Fall color starts with a plant's first colored leaves (redbud near Arkansas: mid-September), well before most of
  it has turned; USA-NPN's peak needs its status-and-intensity data, not in this download. `progress` lets a
  drawing ease into color rather than show September in full fall color.
- Evergreens with fall colors (nandina) aren't shown coloring: nothing gives when.
- Spring bulbs' summer dormancy and annuals' life span aren't known; a deciduous bulb is dormant only in winter.
