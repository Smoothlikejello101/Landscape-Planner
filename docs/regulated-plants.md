# Plants regulated by law

A plant's details say what the law says of it where the garden is: its state's list, then the federal one.
Each line is the rule's own effect, first in the details, with the rule linked and the date it was read; the
plant's row in the picker says it in short ("Prohibited in Arkansas") before it's opened:

> **By law** Prohibited in Arkansas: no Lythrum may be planted, sold, bought or moved (2 CAR §50-709)
> Native to Arkansas, but this rule bans every Lythrum species, natives included.
> *Arkansas Plant Board rules (2 CAR §50-101, §50-709); Code of Arkansas Rules, printed 2026-03-22; read 2026-10-21*

**Two tiers,** set per class in the list (`tiers`): a **ban** (the rule forbids selling, planting or moving the
plant: Arkansas's §50-101(f) and §50-709, Texas, Mississippi, Missouri's sale ban, Tennessee, Virginia's three
tiers of noxious weeds, Georgia, Pennsylvania, North Carolina's noxious weeds, Ohio's and Indiana's invasive plants,
Illinois's exotic weeds, the federal permit rule) is shown in red; a **listing** with lighter
duties (Arkansas's noxious weed list, where nursery stock must be reasonably free of it; Oklahoma's duty to control
thistles; Louisiana's Chinese tallow statute; Virginia's store-sign law; Kentucky's highway rights-of-way law; North Carolina's aquatic weeds, which the state
may remove from its waters; Ohio's and Illinois's noxious weeds and Indiana's detrimental plants, which landowners must control) in
amber, in the same words. A rattlebox shouldn't look as forbidden as cogongrass.

**Native, and covered anyway.** Where Kew's checklist has the plant native to the state and a rule covers it all
the same, the line says why, or the two read as a contradiction: "Native to Arkansas, but this rule bans every
Lythrum species, natives included." (a whole-genus entry took it in, one that excepts no species: `genusWide` in
the state file), or "Native to Arkansas, and still listed by this rule." (the rule names it: wild onion). The
federal list governs moving a plant into or between states, so its line says "and still a federal noxious weed". A
line from an older file, with no tier, is shown red but said as "covered", never "banned". The picker's row adds,
once: ", though native to Arkansas".

**What it does in the picker.** A plant the garden's own state bans (a rule its file says is a ban; not a listing,
not an older file's line with no tier, and not the federal list, which governs moving a plant between states, not
growing it) isn't offered while browsing: a search finds it by name, to map one already in the yard, and its Place
button is red and says "Place (banned)" (to a screen reader, "banned here"). The count line says how many are left out ("2 plants banned in
Arkansas show only when searched by name"). Decided with Jason, 2026-10-31: the law of the gardener's own state, not
a national list, which is shown in a plant's details instead (USGS's register: `wild_us`, catalog-format.md).

Only law. A council's invasive list (Cal-IPC, the Florida Invasive Species Council, TexasInvasives.org) is an
advisory judgment, and is never shown as law; if one is used, it gets its own line, in its own words.

## Background notes

Where a plant is native to the state and a rule covers it all the same, the line can add a **background note**: one
documented fact about the plants the rule's entry names, to help a gardener see why a list might include them
("Background: rattlebox (Crotalaria sagittalis) is poisonous to livestock in all its parts."). It never claims the
rule's reason. One note per entry, not per plant (`background` on the entry: its note, its source, the date
checked), each from a federal or state government page or a land-grant university's extension page, the fact on
the page (checked 2026-10-21; each host's robots.txt allows it). A genus's note names the species its fact is about,
or says "some". Shown after the rule and its source, once a plant (the same note from two rules isn't said twice).
None yet for bracted plantain (Arkansas): no allowed source found gives a weed or harm fact about it.

| Entry | Note | Source |
| --- | --- | --- |
| US Cuscuta, AR Cuscuta | dodder can weaken or kill the plants it grows on and reduce crop yields. | [Dodder, Cuscuta spp., Wisconsin Horticulture (University of Wisconsin–Madison Division of Extension)](https://hort.extension.wisc.edu/articles/dodder-cuscuta-spp/) |
| US Orobanche | some broomrapes lower crop yields and crop quality. | [Federal Noxious Weed List: Egyptian broomrape (Orobanche aegyptiaca) fact sheet, USDA APHIS, 2014](https://usbiotechnologyregulation.mrp.usda.gov/sites/default/files/orobanche-aegyptiaca-factsheet.pdf) |
| US Mikania micrantha | mile-a-minute vine competes aggressively with crops and forest plants for nutrients, light and water. | [Field Release of Puccinia spegazzinii for Biological Control of Mikania micrantha: Environmental Assessment, USDA APHIS, 2011](https://www.aphis.usda.gov/plant_health/ea/downloads/Puccinia_spegazzinii_EA_fonsi.pdf) |
| AR Lythrum | the rule's heading names purple loosestrife, which crowds out native species. | [Purple Loosestrife, National Invasive Species Information Center (USDA)](https://invasivespeciesinfo.gov/aquatic/plants/purple-loosestrife) |
| AR Solanum carolinense | all parts of horsenettle are poisonous to livestock and people if eaten. | [Solanum carolinense, North Carolina Extension Gardener Plant Toolbox](https://plants.ces.ncsu.edu/plants/solanum-carolinense/) |
| AR Calystegia sepium, TX Calystegia sepium | hedge bindweed is hard to get rid of: it can regrow from any piece of rhizome left in the ground. | [Calystegia sepium, North Carolina Extension Gardener Plant Toolbox](https://plants.ces.ncsu.edu/plants/calystegia-sepium/common-name/binghams-false-bindweed) |
| AR Sesbania exaltata | hemp sesbania is toxic to livestock and people. | [Boyette, Hoagland and Stetina (USDA-ARS), Biological Control of the Weed Hemp Sesbania in Rice, Agronomy 2014](https://ars.usda.gov/ARSUserFiles/60663500/Publications/Hoagland/2014/Boyette%20et%20al._2014_AJ_4-74-89.pdf) |
| AR Allium canadense | wild onion can be poisonous to livestock that eat a great deal of it. | [Allium canadense, North Carolina Extension Gardener Plant Toolbox](https://plants.ces.ncsu.edu/plants/all/allium-canadense/) |
| AR Rumex | some docks are crop weeds; curly dock is among the most common weeds in established alfalfa. | [Weed of the Month: Curly Dock, University of Missouri Integrated Pest Management](https://ipm.missouri.edu/cropPest/2015/4/Weed-of-the-Month-Curly-Dock) |
| AR Crotalaria | rattlebox (Crotalaria sagittalis) is poisonous to livestock in all its parts. | [Crotalaria sagittalis, Plants of Louisiana (U.S. Geological Survey)](https://warcapps.usgs.gov/PlantID/Species/Details/880) |
| AR Xanthium | young seedlings of common cocklebur are poisonous to livestock. | [Cocklebur, Toxic Plants, Southern Indiana Purdue Agricultural Center (Purdue University)](https://ag.purdue.edu/department/arge/PACs/sipac/toxic-plants/cocklebur.html) |
| AR Carduus, AR Cirsium, AR Onopordum, AR Silybum, AR Scolymus | some thistles are pasture weeds; musk thistle has been reported to cut pasture yields. | [Musk Thistle (FSA3054), University of Arkansas Cooperative Extension Service](https://www.uaex.uada.edu/publications/PDF/FSA-3054.pdf) |
| TX Pistia stratiotes | mats of waterlettuce that cover a whole pond can use up its oxygen and kill fish. | [Water Lettuce, AquaPlant (Texas A&M AgriLife Extension)](https://aquaplant.tamu.edu/plant-identification/water-lettuce/) |

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
| TX | 4 TAC §19.300 (figure (a), and (b)); Agriculture Code §71.152 | Texas Department of Agriculture's PDF of the figure; the Texas Legislature's statutes site | 32 | Noxious and invasive alike: selling, distributing or bringing it into the state, in any live form, is a misdemeanor, unless permitted |
| MS | Rule 136.01 | MDAC rules PDF, as amended 2018-12-28 | 10 | No sale, distribution or movement but under a research permit |
| MO | 2 CSR 70-45.005; RSMo §263.190 | Code of State Regulations (2012); Revisor of Statutes (effective 2011-08-28) | 12 | "All sales of noxious weed species are prohibited"; landowners must keep it from seeding |
| OK | 2 O.S. §3-220 | ODAFF's print of the law and OAC 35:30-34 | 3 | Landowners must control it (no ban on sale) |
| LA | La. R.S. 3:1791 | Louisiana legislature | 1 | Chinese tallow: a noxious plant, may be destroyed wherever found |
| TN | Tenn. Comp. R. & Regs. 0080-06-24 | The Secretary of State's PDF, revised April 2009 | 14 | Pest plant: may not be sold, offered for sale or released in the state, nor propagated without a permit from the commissioner |
| VA | 2VAC5-317-20, -30; Code of Virginia §3.2-3801.1 | Virginia's Legislative Information System (rule as amended 2024-07-04; statute in force 2027-01-01) | 65 | Tiers 1 to 3: not to be moved (shipped, carried or otherwise transported) without a certificate or permit. Invasive: from 2027-01-01, a store may sell it for outdoor use only with a sign near it saying it's invasive |
| GA | Ga. Comp. R. & Regs. 40-4-9-.07 | The Secretary of State's rules site, through rules filed 2026-10-22 | the federal list's | "The sale or distribution of any plant listed on the Federal Noxious Weed list … is prohibited" |
| PA | 3 Pa.C.S. §§1502, 1515, 1519 | The Department of Agriculture's list page; the General Assembly's text of the act | 57, and the federal list's | Class A, B and C noxious weeds: may not be sold, given away, imported, transported, grown or propagated, but under a permit for research or education |
| KY | KRS 176.051; 603 KAR 3:100 | The Legislative Research Commission (rule effective 2022-01-25) | 3 | The Department of Highways must keep state rights-of-way free of it (no ban on sale) |
| OH | OAC 901:5-30-01; 901:5-37-01 with ORC 5579.04, .05 | codes.ohio.gov (invasive rule effective 2023-02-13; noxious rule 2025-02-16) | 91 | Invasive: no one may sell, offer for sale, propagate, distribute, import or spread it. Noxious: cut or destroyed on a township's notice, and along roads (no ban on sale) |
| IN | 312 IAC 18-3-13, -16, -23, -25; IC 15-16-8 | The Indiana Register's and General Assembly's sites, read in a browser (rules readopted 2025) | 88 | Prohibited invasive plants: no selling, giving, distributing, moving or introducing them. Every Lythrum: not sold or given away (natives only under a permit). Multiflora rose: not planted. Kudzu: not sold or planted. Detrimental plants: landowners must destroy them before they mature (no ban on sale) |
| IL | 525 ILCS 10/4; 17 Ill. Adm. Code 1100.30; 505 ILCS 100; 8 Ill. Adm. Code 220.60 | The General Assembly's site (exotic weed rule effective 2025-10-01) | 43 | Exotic weeds: not bought, sold, distributed or planted without a permit (Callery pear from 2028-01-01). Noxious weeds: landowners must control them (no ban on sale) |
| NC | 02 NCAC 48A .1702, .1703; 15A NCAC 02G .0602 | The North Carolina Register's printing of the rules (effective 2011-10-01); the environment department's copy of .0602 | 27, and the federal list's | Class A and B: no sale or distribution, nor moving into the state (A: nor within it). Class C: not into the state, nor sold outside a regulated area. Aquatic: the state may remove it from its waters (no ban on sale) |

Arkansas to Tennessee read 2026-10-21, Virginia to Illinois 2026-10-31, each from the government's own text, saved
in `catalog-src/legal/` (not committed).
Tennessee's PDF was saved by hand in a browser: the Secretary of State's file host turns away clients that
aren't browsers, and we don't pretend to be one. Texas has one gap: the
offense is Agriculture Code §71.152's, read from the Legislature's site; "in any live form" and "unless permitted" are the rule's,
§19.300(b), read through Cornell LII's copy of the rule until the Secretary of State's site can be read.
Pennsylvania's lists are read from its Department of Agriculture's page: the committee adds plants by notices in
the Pennsylvania Bulletin, whose site (pacodeandbulletin.gov) turns away automated readers in its robots.txt, so
any sales phase-in dates those notices set are unread. Georgia's single-rule pages are closed the same way; its
rule was read from the chapter's page on the same site. Kentucky has no law against selling or planting a named
plant: the one list beyond seed law is the highway department's (checked: KRS chapter 249, whose thistle laws were
repealed in 2022; 302 KAR; 301 KAR 1:122, which names no plant). North Carolina's Administrative Code site answers only
over http, which can't be read from here: its rules are read in the North Carolina Register's printing of them as
approved (26:09, 2011), which the Office of Administrative Hearings' 2019 review still gives as their last
amendment; its definitions and permit rules (.1701, .1704 to .1708) are unread.

Ohio's code site turns away every automated reader in its robots.txt: with Jason's OK (2026-10-31), official
legal-code sites are read anyway, only the pages named, with our own user agent and a slow pace, never past an
actual block. Indiana's code site shows its text only in a browser, and its data service refuses other readers: it
was read in Jason's own Chrome (Claude in Chrome), each section's text copied from the page and checked against a
SHA-256 hash the browser computed from it. Illinois's legislature site sends an incomplete certificate chain: the
missing intermediate was fetched from its issuer (Sectigo), as browsers do, and every request verified against it.
Pennsylvania's Bulletin notices (its sales phase-in dates) are still unread; its site's robots.txt names AI
readers. The rest of the states: not yet.

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
- **Virginia:** "Oplismenus hirtellus spp. undulatifolius" is read as the subspecies. Its store-sign law
  (§3.2-3801.1) isn't in force until 2027-01-01, and its line says so. Left out: the conservation department's
  invasive list (§10.1-104.6:2), which binds only state agencies, and the box tree moth quarantine (2VAC5-332), on
  boxwood leaving three named localities.
- **Pennsylvania:** left out, "Cuscuta spp." and "Orobanche spp." "except for native species" (the natives aren't
  named; the federal dodders and broomrapes come in through Class C); "Sorghum bicolor (shattercane)", which read
  whole would make grain sorghum a noxious weed; "Pastinaca sativa (except for non-wild cultivated varieties)",
  since a species name can't tell wild parsnip from the garden parsnip it excepts; starry stonewort, an alga.
  Japanese blood grass ('Red Baron', Class A) is a cultivar the list can't name: the whole species is on the
  federal list, so it's Class C here. The department's exempted cultivars of Japanese barberry, glossy buckthorn
  and European privet are named in their species' lines (`classBBarberry` and the like), since the list format
  names no cultivar; a cultivar record takes its species' line, exemption named.
- **North Carolina:** Class B's "any Lythrum species not native to North Carolina" names no species, and is read
  as purple loosestrife (*Lythrum salicaria*), which the aquatic list names; a whole-genus entry would take in
  the state's native Lythrum, which the rule excepts without naming. "Trappa spp." is the genus *Trapa*. The
  aquatic list's plants already on the federal list or 02 NCAC 48A are left out of it (their ban comes first).
- **Ohio:** left out, grapevines (*Vitis* spp.) and yellow groove bamboo, noxious only when unkept (a hundred
  unpruned vines; bamboo spread beyond where it was planted), and shattercane and wild parsnip, as in
  Pennsylvania. The phase-ins for Callery pear (2023) and common privet (2026-01-01) have passed.
- **Indiana:** "any species of Lythrum" is the genus, natives included: the rule lets native ones be sold only
  under a permit. Multiflora rose's rule bars planting it, not selling it. Its detrimental plants (IC 15-16-8-1),
  which every landowner must destroy, are the statute's own list; shattercane is printed as *Sorghum bicolor*
  subsp. *drummondii*, the weedy subspecies, so it's taken as printed.
- **Illinois:** Callery pear is an exotic weed only from 2028-01-01: listed (amber) until then. "Perennial members
  of the sorghum genus" is read as Johnson grass and *Sorghum × almum*, not the genus, which would take in grain
  sorghum. Giant and common ragweed are noxious only inside city, village and town limits.
- **Kentucky:** the entries named only by a common name (multiflora rose, kudzu, poison hemlock, marestail, Amur
  honeysuckle, Japanese knotweed, common teasel, spotted knapweed, cutleaf teasel) are left out.

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
- **A named hybrid** is matched by the catalog's own name for the plant, with its sign written "x", "X" or "×":
  Tennessee's *Lonicera × bella* is "Lonicera x bella" too. An "x" joined to the epithet is left alone, since it
  can't be told from a species (*Lonicera xylosteum*). The catalog's lookups in Kew's checklist skip hybrids, so a
  hybrid's name is all there is to match. Not matched: a hybrid written as its parents ("Lonicera morrowii ×
  tatarica"), or a record of two plants ("Ligustrum sinense / japonicum").
- **Records that aren't one species** (hybrids, mixes, "spp." records) reach a species line only by a hybrid's
  name, and a genus line only when they're a named hybrid of that genus; never as "spp.", whose species can't be
  checked against a rule's exceptions.
- **A genus** takes in every species in it, but those the rule excepts, by their printed names (and Kew's, where
  it files one under another: the excepted *Cuscuta ceanothi* is Kew's *C. subinclusa*). It goes by the genus a
  plant is filed under now: a species moved out of it (*Orobanche ramosa* as *Phelipanche ramosa*, Russian
  thistle as *Kali tragus*) isn't matched by its old genus, and one moved in is (*Emex australis*, Kew's *Rumex
  hypogaeus*, takes Arkansas's *Rumex* line). A named hybrid in the catalog is matched by its own name's genus
  too (Arkansas's Lythrum line holds for Lythrum hybrids, as §50-709 says). Tennessee's "Lythrum salicaria,
  Lythrum virgatum and related cultivars" takes in their cultivars, but not a cultivar of a cross with another
  species (*L. alatum* × *virgatum*, 'Morden Gleam').
- **A plant on two lines of one list** takes the first (Texas's noxious line before its invasive one; Arkansas's
  Lythrum line, which says the most, first).
- **A list that adopts another's** (`adopts: { code, class }`) takes that list's entries in a class of its own, by
  reference, as its rule does, so the two never drift apart: Georgia's rule bans selling "any plant listed on the
  Federal Noxious Weed list"; Pennsylvania's makes every federal noxious weed a Class C noxious weed, and North
  Carolina's a Class A one. Its own
  entries come first. A plant there gets both lines: the state's ban, then the federal permit rule.

Each run prints the matches. As of 2026-10-21:
- **Winged loosestrife** (*Lythrum alatum*), prohibited in Arkansas. It's a native wildflower, and §50-709 takes in
  all Lythrum, "including, but not limited to, purple loosestrife": as written, it may not be planted or sold there.
- **Wild onion** (*Allium canadense*, and its variety lavendulare) and **rattlebox** (*Crotalaria sagittalis*),
  noxious weeds in Arkansas: natives the rule names.
- **Chinaberry** (*Melia azedarach*), on Texas's invasive list: selling it in Texas is a misdemeanor.
- **Chinese privet** (*Ligustrum sinense*), **Amur honeysuckle** (*Lonicera maackii*) and **autumn olive**
  (*Elaeagnus umbellata*), pest plants in Tennessee: not to be sold, offered for sale or released there.

As of 2026-10-31:
- **Virginia, Tier 3** (not to be moved without a permit): Japanese honeysuckle, Amur honeysuckle, autumn olive,
  tree of heaven, Siberian elm and bicolor lespedeza; **Tier 2**: beach vitex and Japanese blood grass. Its
  store-sign law takes in 26 more catalog plants, among them periwinkle (*Vinca minor*), English ivy, nandina,
  Japanese barberry, burning bush, Callery pear, mimosa, Chinese wisteria, Japanese spiraea and fountain grass
  (*Cenchrus purpurascens*, Kew's *C. alopecuroides*).
- **Pennsylvania:** Callery pear, Japanese barberry, burning bush, Chinese and Japanese privet, Amur honeysuckle,
  glossy and common buckthorn, tree of heaven, Japanese angelica tree, chocolate vine, Ravenna grass, parrot
  feather and the multiflora rose's variety *cathayensis*; Japanese blood grass through the federal list.
- **North Carolina:** beach vitex (Class B), and Japanese blood grass through the federal list (Class A); parrot
  feather and water lettuce, as aquatic weeds.
- **Ohio:** Callery pear, Japanese and Amur honeysuckle, tree of heaven, autumn and Russian olive, common
  buckthorn, dame's rocket, Siberian elm, ribbon grass (*Phalaris arundinacea*) and narrowleaf cattail; field
  bindweed, cypress spurge and kochia as noxious weeds.
- **Indiana:** winged loosestrife (*Lythrum alatum*, native: every Lythrum), Japanese barberry, wintercreeper,
  black alder, Amur cork tree, ribbon grass and much of Ohio's list; multiflora rose may not be planted.
- **Illinois:** thorny olive, Amur cork tree and the honeysuckles, olives and buckthorns; Callery pear from 2028.
- **Georgia:** Japanese blood grass, through the federal list. **Kentucky:** none of the catalog's plants.

## What the line doesn't say

- **No line isn't "allowed".** Only the lists above are read; a plant on no list we've read gets no line, and
  nothing says it's legal. Counties and cities have their own rules, and permits change what's allowed.
- **Not legal advice.** The line is what the rule says, linked so it can be read; the rule is the authority.

## Updating

Read the rule again from its government source (its `url`); change the entries and their wording to match it;
set `edition` and `read`; then `npm run catalog:build` ([catalog-build.md](catalog-build.md)), which runs
`wcvp.mjs` and `wild.mjs`. Check any names its report lists under "Kew names to check", and record them. The
matches themselves ("regulated, AR: …") are in the wild records' step of `catalog-src/build/log.txt`. `regulated.mjs` refuses a list with a malformed entry (a
class its list doesn't define, a name that isn't a species, variety or genus), and the unit tests check it too.
