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
read and the date. Every name is the rule's own; where Kew's checklist differs an entry says so (`kew`: Kew's
spelling, *Echinochloa crusgalli* as *E. crus-galli*; `accepted`: Kew's accepted name, checked by hand). Each
list's `classes` holds what the rule says of the plants in each class, worded from the rule; `notes` says what
was read narrower than printed or left out, and why.

| Code | Rule | Read from | Entries | Effect |
| --- | --- | --- | --- | --- |
| US | 7 CFR 360.200 (movement: 360.300) | GovInfo, CFR revised as of 2025-01-01 | 111 | Moving it into or through the US, or between states, needs a USDA permit |
| AR | 2 CAR §50-101(d), (f); §50-709 | Code of Arkansas Rules, printed 2026-03-22 | 42 | (f): no plant, seed or reproductive structure sold or planted. §50-709: no Lythrum planted, sold, bought or moved. (d): noxious weed, a public nuisance; nursery stock must be reasonably free of it (§50-302) |
| TX | 4 TAC §19.300 (figure (a)) | Texas Department of Agriculture's PDF of the figure | 32 | Noxious and invasive alike: may not be sold, distributed or brought into the state, in any live form, without a permit |
| MS | Rule 136.01 | MDAC rules PDF, as amended 2018-12-28 | 10 | No sale, distribution or movement but under a research permit |
| MO | 2 CSR 70-45.005; RSMo §263.190 | Code of State Regulations (2012); Revisor of Statutes (effective 2011-08-28) | 12 | "All sales of noxious weed species are prohibited"; landowners must keep it from seeding |
| OK | 2 O.S. §3-220 | ODAFF's print of the law and OAC 35:30-34 | 3 | Landowners must control it (no ban on sale) |
| LA | La. R.S. 3:1791 | Louisiana legislature | 1 | Chinese tallow: a noxious plant, may be destroyed wherever found |

Read 2026-10-21, each from the government's own text, saved in `catalog-src/legal/` (not committed). One gap:
Texas's effect is §19.300(b) and Agriculture Code §71.152, which the saved figure doesn't hold; the wording
was checked against a copy of the rule (Cornell LII), and the official statute page is to read when it's
allowed. Not yet: **Tennessee** (its rules site turns away clients that aren't browsers, and we don't pretend
to be one), and the other states.

**Read narrower than printed, or left out:**
- **Seed-law lists.** Louisiana's noxious weed list (LAC 7:XIII.109), like most states' seed lists, limits weed
  seed in seed for sale. It says nothing of growing the plant.
- **Arkansas's genus entries are taken whole,** natives in them too, where the rule names the genus itself:
  dodder (*Cuscuta* spp.), *Rumex* spp., witchweed, *Crotalaria* spp., cocklebur (*Xanthium* spp.), and the
  thistle genera it names (*Carduus*, *Cirsium*, *Onopordum*, *Silybum*, *Scolymus*, *Salsola*). Where its
  common name says which plants it means, the rule is read as that name: "wild onion and/or wild garlic (Allium
  spp.)" as *Allium canadense* and *A. vineale*; "alligatorweed (Alternanthera spp.)" as *A. philoxeroides*.
  Left out: "morning glory (Ipomoea spp.)", which names no species, and read whole would make the sweet potato
  a noxious weed; the thistle entry's "and other genera", which names none; red rice, "Oryza sativa var.",
  which names no variety (the species is rice). These are judgment calls, written down: each can be revisited.
- **Caulerpa taxifolia** (federal): an alga.

## Matching

`scripts/catalog/regulated.mjs`, run by `wild.mjs`, which writes the matches into each state's file
([wild-records.md](wild-records.md)): the state's list, then the federal list, which holds in every state.

- **By Kew's accepted name**, the catalog plant's (from `wcvp.mjs`) against the entry's names: as printed, as
  Kew spells it, its `accepted` name and its `also` names. Mississippi's *Sapium sebiferum* is the catalog's
  *Triadica sebifera*; Arkansas's *Eichhornia crassipes* is Kew's *Pontederia crassipes*.
- **A listed name's accepted name is never taken unchecked.** `wcvp.mjs` looks each up and lists any Kew accepts
  under a name the entry doesn't give; each is checked and written into the entry (a unit test fails while any
  is left, where the lookup has run). Two Kew gets wrong for the rule's plant: federal missiongrass, *Pennisetum
  polystachion*, which Kew types on a native grass (*Setaria parviflora*: `accepted: false`, matched by its
  printed names only), and Arkansas's itchgrass, *Rottboellia exaltata* L.f., which Kew's lookup sends to
  *Ophiuros exaltatus* (`notKew`); it's *R. cochinchinensis*.
- **A listed species takes in its varieties and cultivars**: Japanese blood grass ('Red Baron') is *Imperata
  cylindrica*, which Arkansas names. A cultivar with a species record in the catalog takes that record's line.
- **A listed variety takes in only that variety**, by its name or its `also` names: kudzu is *Pueraria montana*
  var. *lobata*, or *P. lobata*.
- **A genus** takes in every species in it, but those the rule excepts, by their printed names (and Kew's, where
  it files one under another: the excepted *Cuscuta ceanothi* is Kew's *C. subinclusa*). It goes by the genus a
  plant is filed under now: a species moved out of it (*Orobanche ramosa* as *Phelipanche ramosa*, Russian
  thistle as *Kali tragus*) isn't matched by its old genus, and one moved in is (*Emex australis*, Kew's *Rumex
  hypogaeus*, takes Arkansas's *Rumex* line).
- **A plant on two lines of one list** takes the first (Texas's noxious line before its invasive one; Arkansas's
  Lythrum line, which says the most, first).

Each run prints the matches. As of 2026-10-21:
- **Winged loosestrife** (*Lythrum alatum*), prohibited in Arkansas. It's a native wildflower, and §50-709 takes in
  all Lythrum, "including, but not limited to, purple loosestrife": as written, it may not be planted or sold there.
- **Wild onion** (*Allium canadense*, and its variety lavendulare) and **rattlebox** (*Crotalaria sagittalis*),
  noxious weeds in Arkansas: natives the rule names.
- **Chinaberry** (*Melia azedarach*), on Texas's invasive list: not to be sold in Texas.

## What the line doesn't say

- **No line isn't "allowed".** Only the lists above are read; a plant on no list we've read gets no line, and
  nothing says it's legal. Counties and cities have their own rules, and permits change what's allowed.
- **Not legal advice.** The line is what the rule says, linked so it can be read; the rule is the authority.

## Updating

Read the rule again from its government source (its `url`); change the entries and their wording to match it;
set `edition` and `read`; then `node scripts/catalog/wcvp.mjs <combined.json>` (check any accepted names it
lists, and record them) and `node scripts/catalog/wild.mjs <combined.json>`. `regulated.mjs` refuses a list with a malformed entry (a
class its list doesn't define, a name that isn't a species, variety or genus), and the unit tests check it too.
