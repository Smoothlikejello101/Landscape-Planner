# Site checks: plants near utilities

Sub-features part 2 (decided with Jason, 2026-10-25): a plan can show an overhead power line, a buried line and a
septic drainfield, under **Add → Utilities**. Each is a shape with the role `utility` and its kind (`utility:
'overhead' | 'buried' | 'septic'`). Plants near one are checked by what they are and how far they stand from it
(src/utilities.ts). A plant that fails a check gets an orange badge on the plan, and a one-line warning in its
properties that opens to say why. The warning can be dismissed for that plant; it comes back if the plant moves or
the warning changes.

Distances run from the plant's center (where it's planted) to the nearest point of the line, or of the field's edge
(0 on the field). A plant's height is its typical mature height: the catalog's, or one set by hand on a tree. A tree
drawn without a height isn't checked, since its stand-in height (about as tall as it's wide) is only a guess. The
line's own properties say so.

## The rules and their sources

Each source was read on 2026-10-27. The rules are paraphrased here; nothing is quoted.

- **Overhead power line.** University of Florida IFAS Extension (Duval County), *Planting trees under powerlines*
  (urban forestry, Larry Figart; tree list reviewed by Ed Gilman):
  <https://sfyl.ifas.ufl.edu/media/sfylifasufledu/duval/urban-forestry/Planting-trees-under-powerlines.pdf>.
  - Within 20 ft of a line: small trees only, 25 ft or less at maturity.
  - 20 to 50 ft away: medium trees, under 40 ft.
  - Taller trees: 50 ft or more away.

  The warning also says that many utilities keep a strip under their lines clear of trees. Entergy's distribution
  right-of-way, for one, is 30 ft wide with no trees in it
  (<https://www.entergy.com/tree-trimming/right-tree>).
- **Buried line.** Entergy, *Right tree, right place* (same page). Call 811 before planting. Nothing is planted within
  10 ft of an underground line or equipment, which is its underground easement. The app flags a tree or shrub within
  10 ft. Smaller plants aren't flagged; the line's properties say to call 811 before digging. Illinois Extension says
  likewise not to plant over or near underground services, and to have them located first
  (<https://extension.illinois.edu/energy/tree-planting-safety>).
- **Septic field.** University of Georgia Extension, Circular 1030, *Ornamental plantings on septic drainfields*
  (<https://fieldreport.caes.uga.edu/publications/C1030/ornamental-plantings-on-septic-drainfields/>).
  - Woody plants' roots can get into the drain lines. A tree or shrub should stand at least as far from the field as it
    grows tall, and farther is better. The app flags one nearer than that, or on the field. With no known height,
    only one on the field is flagged.
  - Vegetable gardens and edible plants don't belong on a drainfield: the produce can be contaminated, and digging
    can damage the lines. The app flags an edible plant (the catalog's `edible`) on the field.
  - Grass and shallow-rooted herbaceous plants suit the field itself.

## Older versions

An older version doesn't know the `utility` role, so it drops it and the kind from a shape it saves. When its copy of
a utility comes back through sync with neither, this device's role and kind are kept (src/sync/engine.ts,
`withUtilities`). A utility made into something else keeps its `utility` kind, so it isn't mistaken for that copy. If
it's turned back into a utility, it gets the same kind again.
