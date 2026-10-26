# Catalog review

Written by `npm run catalog:build` (docs/catalog-build.md): what the build left for a person to decide, fetch or tidy, most useful first. Don't edit it: the next build writes it again. 61 to decide, 2806 plants not searched, 39 sites whose terms are unsettled, 168 catalog checks; 3622 of 3626 records audited.

- [Sources disagree (6)](#sources-disagree-6)
- [Cultivar: tree or shrub? (5)](#cultivar-tree-or-shrub-5)
- [Edible, but rated toxic (16)](#edible-but-rated-toxic-16)
- [Held back as implausible (3)](#held-back-as-implausible-3)
- [A value its source no longer gives (13)](#a-value-its-source-no-longer-gives-13)
- [Values the catalog can't take (1)](#values-the-catalog-cant-take-1)
- [Kew names to check (13)](#kew-names-to-check-13)
- [Bloom months held back (4)](#bloom-months-held-back-4)
- [Not searched on the web (2806)](#not-searched-on-the-web-2806)
- [Sites whose terms are unsettled (39)](#sites-whose-terms-are-unsettled-39)
- [Catalog checks (168)](#catalog-checks-168)

## Sources disagree (6)

The audit's sources give different values, so the catalog keeps the value it had, marked unverified. Zones are on the half-zone scale (7 is 7a, 7.5 is 7b); sizes are in feet. There's no place to record a decision on these yet: they stay listed until there is.

| Plant | Fact | What the sources say | Catalog now |
| --- | --- | --- | --- |
| Cream wild indigo (`baptisia-bracteata`) | flower_color | mowildflowers.net: White, Cream · allendanseed.com: Yellow | – |
| Slender beardtongue (`penstemon-gracilis`) | flower_color | morningskygreenery.com: Lavender · ecoscapes1.com: Pink; bluethumb.org says Pink | – |
| Prairie blue-eyed grass (`sisyrinchium-campestre`) | flower_color | morningskygreenery.com: Lavender · mowildflowers.net: Blue | – |
| Venus' looking glass (`triodanis-perfoliata`) | flower_color | nativebeeginnings.com: Blue, Violet · fellabees.com: Purple | – |
| Porcupine sedge (`carex-hystericina`) | flower_color | aquascapesunlimited.com: Yellow · bluethumb.org: Green | – |
| Tree of heaven (`ailanthus-altissima`) | bloom_season | ncsu, davisla.wordpress.com: summer · arizona.edu: spring; usda says late spring | – |

## Cultivar: tree or shrub? (5)

The species is a tree, and this cultivar, with no page of its own, may be smaller, so its form is left as it was. A decision goes in scripts/catalog/decisions.json (`form`), and the build applies it.

| Plant | What the sources say | Catalog now |
| --- | --- | --- |
| Pear (fireblight-resistant) (`pyrus-communis-moonglow-kieffer-orient`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Japanese plum (`prunus-salicina-methley-bruce`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Pecan (`carya-illinoinensis-kanza-lakota`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Japanese maple (`acer-palmatum-bloodgood-seiryu`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Crape myrtle Bellini Cherry (`lagerstroemia-indica-bellini-cherry-ncli1`) | its species is listed as a tree; a cultivar may be a tree or a shrub | – |

## Edible, but rated toxic (16)

A source says it's edible, and the catalog rates it toxic (to dogs, or to people), so "edible" isn't written. A decision goes in scripts/catalog/decisions.json (`edible`), and the build applies it.

- Cassava (`manihot-esculenta`)
- Balsampear (`momordica-charantia`)
- Clammy groundcherry (`physalis-heterophylla`)
- Chickasaw Plum 'Guthrie' (`prunus-angustifolia-guthrie`)
- Peach 'Carolina Belle' (`prunus-persica-carolina-belle`)
- Peach / nectarine 'Carolina Gold' (`prunus-persica-carolina-gold`)
- Peach 'China Pearl' (`prunus-persica-china-pearl`)
- Peach 'Cresthaven' (`prunus-persica-cresthaven`)
- Peach 'Encore' (`prunus-persica-encore`)
- Peach / nectarine 'Flavortop' (`prunus-persica-flavortop`)
- Peach 'Norman' (`prunus-persica-norman`)
- Nectarine 'Redgold' (`prunus-persica-redgold`)
- Peach 'Redhaven' (`prunus-persica-redhaven`)
- Peach / nectarine Stark SunGlo (`prunus-persica-stark-sunglo-sun-glo`)
- Peach / nectarine 'Summer Beaut' (`prunus-persica-summer-beaut`)
- Peach 'Winblo' (`prunus-persica-winblo`)

## Held back as implausible (3)

The audit's values would make the record implausible (the app's checks), so they weren't written. There's no place to record a decision on these yet: they stay listed until there is.

| Plant | Facts | Why |
| --- | --- | --- |
| Green-and-gold (`chrysogonum-virginianum`) | height | under 3 in tall (2 in): inches read as feet, or the other way? |
| Pink sundew (`drosera-capillaris`) | height | under 3 in tall (1 in): inches read as feet, or the other way? |
| English holly 'Argentea Marginata' (`ilex-aquifolium-argentea-marginata`) | height, form | 40 ft is tall for a shrub |

## A value its source no longer gives (13)

An earlier build wrote it from a source, but no source gives it now: its page is no longer read, or no longer says it. It's kept (a plant's spread draws its circle), with the citation it had. There's no place to record a decision on these yet: they stay listed until there is.

| Plant | Fact | Value now |
| --- | --- | --- |
| Common fig (`ficus-carica-celeste-brown-turkey-chicago-hardy`) | height | {"min":6,"max":10,"med":8}, from ncsu |
| Common fig (`ficus-carica-celeste-brown-turkey-chicago-hardy`) | width | {"min":6,"max":10,"med":8}, from ncsu |
| Pear (fireblight-resistant) (`pyrus-communis-moonglow-kieffer-orient`) | height | {"min":8,"max":10,"med":9}, from ncsu |
| Pear (fireblight-resistant) (`pyrus-communis-moonglow-kieffer-orient`) | width | {"min":8,"max":10,"med":9}, from ncsu |
| Pecan (`carya-illinoinensis-kanza-lakota`) | height | {"min":70,"max":100,"med":85}, from ncsu |
| Pecan (`carya-illinoinensis-kanza-lakota`) | width | {"min":40,"max":75,"med":57.5}, from ncsu |
| Japanese plum yew (`cephalotaxus-harringtonia-duke-gardens-prostrata`) | height | {"min":2,"max":4,"med":3}, from ncsu |
| Japanese plum yew (`cephalotaxus-harringtonia-duke-gardens-prostrata`) | width | {"min":2,"max":4,"med":3}, from ncsu |
| Rose of Sharon (`hibiscus-syriacus-sterile-diana-chiffon-series`) | height | {"min":5,"max":8,"med":6.5}, from ncsu |
| Rose of Sharon (`hibiscus-syriacus-sterile-diana-chiffon-series`) | width | {"min":4,"max":6,"med":5}, from ncsu |
| Bachelor's Buttons 'Fireworks' (`gomphrena-globosa-fireworks`) | height | {"min":3,"max":4,"med":3.5}, from ncsu |
| Bachelor's Buttons 'Fireworks' (`gomphrena-globosa-fireworks`) | width | {"min":3,"max":4,"med":3.5}, from ncsu |
| Bachelor's Buttons 'Fireworks' (`gomphrena-globosa-fireworks`) | leaf color | ["green"], from ncsu |

## Values the catalog can't take (1)

A source's value doesn't fit the catalog's format.

| Plant | Fact | Value |
| --- | --- | --- |
| Switchgrass 'Shenandoah' (`panicum-virgatum-shenandoah`) | flower_color | value the catalog can't take: ["Burgundy","Rose"] |

## Kew names to check (13)

Names Kew's World Checklist could read two ways, taken as the accepted name (check each is the plant meant, and record it in scripts/catalog/decisions.json, `kewNames`); and law-list names Kew accepts under another, or doesn't match at all (set the entry's `accepted` in scripts/catalog/regulated-plants.json).

- Actaea podocarpa: an accepted name that is also an older homonym's synonym
- Anchusa azurea: an accepted name that is also an older homonym's synonym
- Betula lenta: an accepted name that is also an older homonym's synonym
- Commelina communis: an accepted name that is also an older homonym's synonym
- Dryopteris affinis: an accepted name that is also an older homonym's synonym
- Iberis sempervirens: an accepted name that is also an older homonym's synonym
- Lysimachia quadrifolia: an accepted name that is also an older homonym's synonym
- Malus hupehensis: an accepted name that is also an older homonym's synonym
- Pinus thunbergii: an accepted name that is also an older homonym's synonym
- Populus heterophylla: an accepted name that is also an older homonym's synonym
- Quercus lyrata: an accepted name that is also an older homonym's synonym
- Solanum laxum: an accepted name that is also an older homonym's synonym
- Viola blanda: an accepted name that is also an older homonym's synonym

## Bloom months held back (4)

The records' flowering months disagree with NC State's season, so the records' months aren't shown (NC State's season still is). To trust the records instead, add the plant to `RECORDS_TRUSTED` in scripts/catalog/bloom.mjs.

- Bigleaf maple (`acer-macrophyllum`): the records say Mar–Apr (363 records); NC State says summer
- Hobblebush (`viburnum-lantanoides`): the records say May–May (326 records); NC State says summer
- Silver ponysfoot 'Silver Falls' (`dichondra-argentea-silver-falls`): the records say Jun–Sep (37 records); NC State says spring
- Calla lily (`zantedeschia-aethiopica`): the records say Jan–May (85 records); NC State says summer

## Not searched on the web (2806)

No web search has run for these yet: `node scripts/catalog/search.mjs` (docs/catalog-sources.md, "Searching the web"), then add its claims to catalog-src/web-claims.json.

- 2806 plants added from NC State (scripts/catalog/added-plants.json)

## Sites whose terms are unsettled (39)

A search found pages on these sites, but their terms aren't in the record (scripts/catalog/site-terms.json): a reader couldn't tell what they allow, or none has read them. Their pages aren't used. Each one's packet is in catalog-src/terms-review/, which holds the last search run's (docs/catalog-sources.md, "How terms are read").

americanpeonysociety.org, arborday.org, brit.org, cloversgarden.com, colesvillenursery.com, costafarms.com, courvillenursery.com, earth.com, earthone.io, finegardening.com, gardenerspath.com, gardenia.net, gardeningknowhow.com, greg.app, grokipedia.com, hoffmannursery.com, ipni.org, jstor.org, kew.org, monrovia.com, myseeds.co, nih.gov, ornamental-trees.co.uk, plantdelights.com, plantlust.com, plantsexpress.com, pridescorner.com, provenwinners.com, rhs.org.uk, sciencedirect.com, southernliving.com, thespruce.com, txsmartscape.com, unc.edu, usf.edu, vaccinium.org, viriar.com, wisc.edu, worldoffloweringplants.com

## Catalog checks (168)

What `npm run catalog:check` lists: implausible values, and names and parents to tidy in the catalog itself.

- a cultivar with no species record in the catalog (119): `rosa-julia-child`, `rosa-generous-gardener`, `rosa-climbing-iceberg`, `eutrochium-gateway`, `rudbeckia-american-gold-rush`, `narcissus-tete-a-tete`, `rudbeckia-fulgida-goldsturm`, `fothergilla-intermedia-mt-airy`, `lonicera-sempervirens-john-clayton-major-wheeler`, `achillea-moonshine`, `ficus-carica-celeste-brown-turkey-chicago-hardy`, `ziziphus-jujuba-li-lang`, `punica-granatum-salavatski-russian-26`, `morus-alba-x-rubra-illinois-everbearing`, `pyrus-communis-moonglow-kieffer-orient`, `malus-domestica-liberty-enterprise-william-s-pride`, `prunus-salicina-methley-bruce`, `carya-illinoinensis-kanza-lakota`, `vaccinium-virgatum-climax-premier-tifblue`, `rubus-caddo-ouachita-natchez-ponca`, `fragaria-x-ananassa-chandler-camarosa`, `asparagus-officinalis-jersey-millennium`, `sambucus-canadensis-bob-gordon-wyldewood`, `distylium-hybrids-vintage-jade-cinnamon-girl`, `loropetalum-chinense-purple-pixie-zhuzhou`, `gardenia-jasminoides-frostproof-kleim-s-hardy`, `abelia-x-grandiflora-rose-creek-kaleidoscope`, `mahonia-eurybracteata-soft-caress`, `cephalotaxus-harringtonia-duke-gardens-prostrata`, `buxus-green-velvet-microphylla-types`, `thuja-green-giant`, `ilex-x-nellie-r-stevens`, `aucuba-japonica-gold-dust`, `lagerstroemia-natchez-muskogee-tonto`, `vitex-agnus-castus-shoal-creek`, `buddleia-davidii-sterile-miss-molly-lo-behold`, `hibiscus-syriacus-sterile-diana-chiffon-series`, `acer-palmatum-bloodgood-seiryu`, `ginkgo-biloba-autumn-gold-princeton-sentry`, `prunus-x-yedoensis-kwanzan`, `chaenomeles-double-take-series`, `nepeta-cat-s-meow-walker-s-low`, `hemerocallis-happy-returns-spider-types`, `oenothera-lindheimeri-whirling-butterflies`, `lavandula-x-intermedia-phenomenal`, `paeonia-lactiflora-festiva-maxima-early-cvs`, `hylotelephium-herbstfreude`, `leucanthemum-becky`, `canna-australia-species-types`, `crinum-milk-and-wine-bulbispermum`, `allium-millenium-purple-sensation`, `liriope-muscari-big-blue`, `clematis-jackmanii-viticella-types`, `pennisetum-alopecuroides-hameln`, `lantana-camara-miss-huff-hardy`, `abelia-edward-goucher`, `acer-crimson-sunset-jfs-kw202`, `aesculus-x-marylandica-homestead`, `agastache-acapulco-orange`, `agastache-astello-indigo`, `agastache-black-adder`, `agastache-blue-boa`, `agastache-blue-fortune`, `agastache-firebird`, `agastache-kudos-ambrosia`, `agastache-poquito-orangetm-tnagapo`, `agastache-purple-haze`, `alocasia-calidora`, `alocasia-sarawakensis-yucatan-princess`, `alstroemeria-casablanca`, `amaranthus-magic-fountain`, `amsonia-blue-ice`, `arachniodes-simplicior-variegata`, `baptisia-carolina-moonlight`, `baptisia-purple-smoke`, `begonia-argenteo-guttata`, `begonia-canary-wings`, `berberis-microphylla-nana`, `berberis-x-gladwynensis-william-penn`, `berberis-x-stenophylla-corallina-compacta`, `betula-populifolia-whitespire`, `betula-royal-frost`, `buddleja-lo-behold-blue-chip`, `buddleja-lo-behold-blue-chip-jr`, `buddleja-lo-behold-ice-chip`, `buddleja-lo-behold-lilac-chip`, `buddleja-lo-behold-pink-micro-chip`, `buddleja-miss-molly`, `buddleja-miss-pearl`, `buddleja-miss-ruby`, `buddleja-miss-violet`, `buxus-green-gem`, `buxus-green-mountain`, `calanthe-kozu-spice`, `callicarpa-pearl-glam-nccx2`, `calycanthus-aphrodite`, `calycanthus-venus`, `camellia-autumn-spirit`, `camellia-polar-ice`, `camellia-snow-flurry`, `cercis-merlot`, `cereus-forbesii-ming-thing`, `cleome-senorita-blanca-inclesbimp`, `cleome-senorita-rosalita-inncleosr`, `coleus-forsteri-marginatus`, `coreopsis-strawberry-lemonade`, `cornus-cloudbursttm-ncch3`, `cornus-little-rubytm-ncch1`, `crocosmia-lucifer`, `cuphea-hybrid-cupver`, `dactylicapnos-scandens-athens-yellow`, `delosperma-oberg`, `deutzia-yuki-cherry-blossomtm-ncdx2`, `dianthus-jolttm-pink-pas970056`, `dichondra-argentea-silver-falls`, `echinacea-secret-lust`, `echinacea-tomato-soup`, `ensete-ventricosum-maurelii`, `epimedium-x-versicolor-sulphureum`
- named as a cultivar, but its botanical name doesn't say which (25): `heuchera-villosa`, `heuchera-villosa-2`, `astilbe-chinensis`, `hakonechloa-macra`, `chelone-lyonii`, `itea-virginica`, `viburnum-nudum`, `viburnum-nudum-2`, `salvia-rosmarinus`, `artemisia-hybrid`, `monarda-didyma`, `echinacea-purpurea`, `coreopsis-verticillata`, `symphyotrichum-oblongifolium`, `vernonia-hybrid-mt-cuba`, `salvia-yangii`, `salvia-greggii-microphylla`, `asclepias-tuberosa-clay-strain`, `physostegia-virginiana`, `solidago-rugosa`, `boltonia-asteroides`, `panicum-virgatum`, `schizachyrium-scoparium`, `crocus-tommasinianus`, `hypericum-kalmianum`
- a cultivar with a species record it could point to (13): `symphyotrichum-ericoides-snow-flurry`, `clethra-alnifolia-hummingbird`, `itea-virginica-henry-s-garnet`, `hydrangea-quercifolia-ruby-slippers`, `hydrangea-quercifolia-alice`, `hydrangea-arborescens-haas-halo`, `bignonia-capreolata-tangerine-beauty`, `wisteria-frutescens-amethyst-falls`, `ilex-vomitoria-nana-schillings`, `monarda-didyma-raspberry-wine`, `stachys-byzantina-helene-von-stein`, `diospyros-kaki-fuyu`, `pyrus-pyrifolia-shinko`
- no spread (11): `iris-aquatic-spp`, `echinacea-cone-fections-big-sky-sunseekers`, `clematis-occidentalis`, `dioscorea-villosa`, `passiflora-incarnata`, `echinocystis-lobata`, `phaseolus-polystachios`, `smilax-lasioneura`, `bignonia-capreolata-tangerine-beauty`, `clematis-viorna`, `vitis-spp`

## For reference

Where a source gave nothing, counted only:

- 350 plants: no NC State page in the list: never asked for (see "Not looked up yet"), asked for and NC State has none (a 404), a genus or cultivar group (not read by the rule), or a page not matched to the plant yet
- 1123 plants: no USDA PLANTS symbol: a genus or cultivar group (not searched), or a name PLANTS has no species entry for
- 1614 plants: a USDA PLANTS profile with no characteristics saved (size, sun and so on): PLANTS has none, or they were never fetched (see "Not looked up yet")
- 2257 plants: not on the Arkansas atlas's maps under its name (mostly plants not recorded wild in Arkansas)
- 310 plants: the Arkansas atlas not looked up (a genus or cultivar group: no species name)
- 84 plants: a cultivar read from species-level pages: its size, form and flower color are taken only from a page about the cultivar

Kew's checklist has no one accepted species for 37 catalog names (hybrids, names it draws narrower, exotics it doesn't list in the US), so they have no native status: Aloysia citriodora, Alternanthera dentata, Amsonia illustris, Aphelandra squarrosa, Betula jacquemontii, Betula platyphylla, Calamovilfa longifolia, Cartrema americana, Distylium hybrids, Eubotrys racemosa, Euonymus kiautschovicus, Gomphocarpus physocarpa, Hamamelis hybrids, Hepatica acutiloba, Hibiscus lasiocarpos, Hypericum pyramidatum, Iris germanica, Juniperus conferta, Ludwigia sedoides, Malus hybrids, Nothoscordum sellowianum, Nuphar luteum, Oligoneuron rigidum, Onosmodium bejariense, Penstemon grandiflorus, Pieris formosana, Polystichum polyblepharum, Rhus trilobata, Rhychospora latifolia, Rosa lucieae, Rubus pensilvanicus, Silphium trifoliatum, Smilax lasioneura, Thuidium delicatulum, Thymus pseudolanuginosus, Tulipa hybrids, Washingtonia robusta.

New plants (scripts/catalog/additions.mjs):

- 0 plants added from NC State's Plant Toolbox in this build (2806 in all)
- 898 plants waiting, for size (755), form (98), hardiness (257), sun (93), its species (19)
- 595 pages left out: a vegetable (87), a genus (296), a weed (204), in the catalog (8)
- 18 pages the sitemap lists that aren't saved yet
