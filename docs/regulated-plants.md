# Plants regulated by law

A plant's details say what the law says of it where the garden is: its state's list, then the federal one.
Each line is the rule's own effect, in red, first in the details, with the rule linked and the date it was
read; the plant's row in the picker says it in short ("Prohibited in Arkansas") before it's opened:

> **By law** Prohibited in Arkansas: no Lythrum may be planted, sold, bought or moved (2 CAR §50-709)
> *Arkansas Plant Board rules (2 CAR §50-101, §50-709); Code of Arkansas Rules, printed 2026-03-22; read 2026-10-21*

Only law. A council's invasive list (Cal-IPC, the Florida Invasive Species Council, TexasInvasives.org) is an
advisory judgment, and is never shown as law; if one is used, it gets its own line, in its own words.

## The lists

`scripts/catalog/regulated-plants.json`, one entry per line, each list with its rule, its link, the edition
read and the date. Every name is the rule's own (with Kew's spelling as `kew` where it differs:
*Echinochloa crusgalli*, Kew's *E. crus-galli*). Each list's `classes` holds what the rule says of the plants
in each class, worded from the rule; `notes` says what was left out, and why.

| Code | Rule | Read from | Entries | Effect |
| --- | --- | --- | --- | --- |
| US | 7 CFR 360.200 (movement: 360.300) | GovInfo, CFR revised as of 2025-01-01 | 111 | Moving it into the US or between states needs a USDA permit |
| AR | 2 CAR §50-101(d), (f); §50-709 | Code of Arkansas Rules, printed 2026-03-22 | 31 | (f): may not be sold or planted. §50-709: no Lythrum planted, sold, bought or moved. (d): noxious weed, a public nuisance; nursery stock must be free of it |
| TX | 4 TAC §19.300 (figure (a)) | Texas Department of Agriculture's PDF of the figure | 32 | Noxious and invasive alike: may not be sold, distributed or brought into the state, in any live form |
| MS | Rule 136.01 | MDAC rules PDF, as amended 2018-12-28 | 10 | No sale, distribution or movement but under a research permit |
| MO | 2 CSR 70-45.005; RSMo §263.190 | Code of State Regulations (2012); the statute as MDA compiles it (2011) | 12 | Sale prohibited; landowners must keep it from seeding |
| OK | 2 O.S. §3-220 | ODAFF's print of the law and OAC 35:30-34 | 3 | Landowners must control it (no ban on sale) |
| LA | La. R.S. 3:1791 | Louisiana legislature | 1 | Chinese tallow: a noxious plant, may be destroyed wherever found |

Read 2026-10-21, each from the government's own text. Not yet: **Tennessee** (its rules site turns away
clients that aren't browsers, and we don't pretend to be one), and the other states.

**Left out, on purpose:**
- **Seed-law lists.** Louisiana's noxious weed list (LAC 7:XIII.109), like most states' seed lists, limits weed
  seed in seed for sale. It says nothing of growing the plant.
- **Genus entries that mean less than the genus.** Arkansas lists "wild onion and/or wild garlic (Allium spp.)"
  and "morning glory (Ipomoea spp.)": read across the genus, they'd make native onions and morning glories
  noxious, which isn't what the rule is about. A genus is taken whole only where the rule means it whole:
  §50-709's "all Lythrum species", Texas's *Tamarix* spp. and *Salvinia* spp., the federal parasites
  (*Cuscuta* and *Orobanche* but the native species the rule excepts), Arkansas's dodder and witchweed.
- **Red rice** (Arkansas, "Oryza sativa var."): it names no variety, and the species is rice.
- **Caulerpa taxifolia** (federal): an alga.

## Matching

`scripts/catalog/regulated.mjs`, run by `wild.mjs`, which writes the matches into each state's file
([wild-records.md](wild-records.md)): the state's list, then the federal list, which holds in every state.

- **By Kew's accepted name** (`wcvp.mjs` looks up each listed species, writing `catalog-src/wcvp-regulated.json`),
  or the catalog's own name: Mississippi's *Sapium sebiferum* is the catalog's *Triadica sebifera*; Arkansas's
  *Eichhornia crassipes* is Kew's *Pontederia crassipes*.
- **A listed species takes in its varieties and cultivars**: Japanese blood grass ('Red Baron') is *Imperata
  cylindrica*, which Arkansas names. A cultivar with a species record in the catalog takes that record's line.
- **A listed variety takes in only that variety**: kudzu is *Pueraria montana* var. *lobata*.
- **A plant on two lines of one list** takes the first (Texas's noxious line before its invasive one; Arkansas's
  prohibited line before its noxious one).

Each run prints the matches. As of 2026-10-21:
- **Winged loosestrife** (*Lythrum alatum*), prohibited in Arkansas. It's a native wildflower, and §50-709 takes in
  all Lythrum, "including, but not limited to, purple loosestrife": as written, it may not be planted or sold there.
- **Chinaberry** (*Melia azedarach*), on Texas's invasive list: not to be sold in Texas.

## What the line doesn't say

- **No line isn't "allowed".** Only the lists above are read; a plant on no list we've read gets no line, and
  nothing says it's legal. Counties and cities have their own rules, and permits change what's allowed.
- **Not legal advice.** The line is what the rule says, linked so it can be read; the rule is the authority.

## Updating

Read the rule again from its government source (its `url`); change the entries and their wording to match it;
set `edition` and `read`; then `node scripts/catalog/wcvp.mjs <combined.json>` and
`node scripts/catalog/wild.mjs <combined.json>`. `regulated.mjs` refuses a list with a malformed entry (a
class its list doesn't define, a name that isn't a species, variety or genus), and the unit tests check it too.
