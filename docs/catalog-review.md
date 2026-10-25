# Catalog review

Written by `npm run catalog:build` (docs/catalog-build.md): what the build left for a person to decide, fetch or tidy, most useful first. Don't edit it: the next build writes it again. 47 to decide, 2740 plants not searched, 39 sites whose terms are unsettled, 184 catalog checks; 3522 of 3560 records audited.

- [Cultivar: tree or shrub? (5)](#cultivar-tree-or-shrub-5)
- [Edible, but rated toxic (16)](#edible-but-rated-toxic-16)
- [Held back as implausible (3)](#held-back-as-implausible-3)
- [A value its source no longer gives (10)](#a-value-its-source-no-longer-gives-10)
- [Kew names to check (13)](#kew-names-to-check-13)
- [Not searched on the web (2740)](#not-searched-on-the-web-2740)
- [Sites whose terms are unsettled (39)](#sites-whose-terms-are-unsettled-39)
- [Catalog checks (184)](#catalog-checks-184)

## Cultivar: tree or shrub? (5)

The species is a tree, and this cultivar, with no page of its own, may be smaller, so its form is left as it was. A decision goes in scripts/catalog/decisions.json (`form`), and the build applies it.

| Plant | What the sources say | Catalog now |
| --- | --- | --- |
| Pear (fireblight-resistant) (`pyrus-communis-moonglow-kieffer-orient`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Japanese plum (`prunus-salicina-methley-bruce`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Pecan (`carya-illinoinensis-kanza-lakota`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Japanese maple (`acer-palmatum-bloodgood-seiryu`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Crapemyrtle 'NCLI1' (`lagerstroemia-indica-bellini-cherry-ncli1`) | its species is listed as a tree; a cultivar may be a tree or a shrub | – |

## Edible, but rated toxic (16)

A source says it's edible, and the catalog rates it toxic (to dogs, or to people), so "edible" isn't written. A decision goes in scripts/catalog/decisions.json (`edible`), and the build applies it.

- Cassava (`manihot-esculenta`)
- Balsampear (`momordica-charantia`)
- Clammy groundcherry (`physalis-heterophylla`)
- Chickasaw plum 'Guthrie' (`prunus-angustifolia-guthrie`)
- Peach / nectarine 'Carolina Belle' (`prunus-persica-carolina-belle`)
- Peach / nectarine 'Carolina Gold' (`prunus-persica-carolina-gold`)
- Peach / nectarine 'China Pearl' (`prunus-persica-china-pearl`)
- Peach / nectarine 'Cresthaven' (`prunus-persica-cresthaven`)
- Peach / nectarine 'Encore' (`prunus-persica-encore`)
- Peach / nectarine 'Flavortop' (`prunus-persica-flavortop`)
- Peach / nectarine 'Norman' (`prunus-persica-norman`)
- Peach / nectarine 'Redgold' (`prunus-persica-redgold`)
- Peach / nectarine 'Redhaven' (`prunus-persica-redhaven`)
- Peach / nectarine 'Sun Glo' (`prunus-persica-stark-sunglo-sun-glo`)
- Peach / nectarine 'Summer Beaut' (`prunus-persica-summer-beaut`)
- Peach / nectarine 'Winblo' (`prunus-persica-winblo`)

## Held back as implausible (3)

The audit's values would make the record implausible (the app's checks), so they weren't written. There's no place to record a decision on these yet: they stay listed until there is.

| Plant | Facts | Why |
| --- | --- | --- |
| Green-and-gold (`chrysogonum-virginianum`) | height | under 3 in tall (2 in): inches read as feet, or the other way? |
| Pink sundew (`drosera-capillaris`) | height | under 3 in tall (1 in): inches read as feet, or the other way? |
| English holly 'Argentea Marginata' (`ilex-aquifolium-argentea-marginata`) | height, form | 40 ft is tall for a shrub |

## A value its source no longer gives (10)

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

## Not searched on the web (2740)

No web search has run for these yet: `node scripts/catalog/search.mjs` (docs/catalog-sources.md, "Searching the web"), then add its claims to catalog-src/web-claims.json.

- 2740 plants added from NC State (scripts/catalog/added-plants.json)

## Sites whose terms are unsettled (39)

A search found pages on these sites, but their terms aren't in the record (scripts/catalog/site-terms.json): a reader couldn't tell what they allow, or none has read them. Their pages aren't used. Each one's packet is in catalog-src/terms-review/, which holds the last search run's (docs/catalog-sources.md, "How terms are read").

americanpeonysociety.org, arborday.org, brit.org, cloversgarden.com, colesvillenursery.com, costafarms.com, courvillenursery.com, earth.com, earthone.io, finegardening.com, gardenerspath.com, gardenia.net, gardeningknowhow.com, greg.app, grokipedia.com, hoffmannursery.com, ipni.org, jstor.org, kew.org, monrovia.com, myseeds.co, nih.gov, ornamental-trees.co.uk, plantdelights.com, plantlust.com, plantsexpress.com, pridescorner.com, provenwinners.com, rhs.org.uk, sciencedirect.com, southernliving.com, thespruce.com, txsmartscape.com, unc.edu, usf.edu, vaccinium.org, viriar.com, wisc.edu, worldoffloweringplants.com

## Catalog checks (184)

What `npm run catalog:check` lists: implausible values, and names and parents to tidy in the catalog itself.

- a cultivar with no species record in the catalog (144): `rosa-julia-child`, `rosa-generous-gardener`, `rosa-climbing-iceberg`, `eutrochium-gateway`, `rudbeckia-american-gold-rush`, `symphyotrichum-ericoides-snow-flurry`, `narcissus-tete-a-tete`, `rudbeckia-fulgida-goldsturm`, `clethra-alnifolia-hummingbird`, `hydrangea-quercifolia-ruby-slippers`, `hydrangea-quercifolia-alice`, `hydrangea-arborescens-haas-halo`, `fothergilla-intermedia-mt-airy`, `bignonia-capreolata-tangerine-beauty`, `lonicera-sempervirens-john-clayton-major-wheeler`, `achillea-moonshine`, `ilex-vomitoria-nana-schillings`, `stachys-byzantina-helene-von-stein`, `ficus-carica-celeste-brown-turkey-chicago-hardy`, `ziziphus-jujuba-li-lang`, `punica-granatum-salavatski-russian-26`, `morus-alba-x-rubra-illinois-everbearing`, `pyrus-communis-moonglow-kieffer-orient`, `pyrus-pyrifolia-shinko`, `malus-domestica-liberty-enterprise-william-s-pride`, `prunus-salicina-methley-bruce`, `carya-illinoinensis-kanza-lakota`, `vaccinium-virgatum-climax-premier-tifblue`, `rubus-caddo-ouachita-natchez-ponca`, `fragaria-x-ananassa-chandler-camarosa`, `asparagus-officinalis-jersey-millennium`, `sambucus-canadensis-bob-gordon-wyldewood`, `distylium-hybrids-vintage-jade-cinnamon-girl`, `loropetalum-chinense-purple-pixie-zhuzhou`, `gardenia-jasminoides-frostproof-kleim-s-hardy`, `abelia-x-grandiflora-rose-creek-kaleidoscope`, `mahonia-eurybracteata-soft-caress`, `cephalotaxus-harringtonia-duke-gardens-prostrata`, `buxus-green-velvet-microphylla-types`, `thuja-green-giant`, `ilex-x-nellie-r-stevens`, `aucuba-japonica-gold-dust`, `lagerstroemia-natchez-muskogee-tonto`, `vitex-agnus-castus-shoal-creek`, `buddleia-davidii-sterile-miss-molly-lo-behold`, `hibiscus-syriacus-sterile-diana-chiffon-series`, `acer-palmatum-bloodgood-seiryu`, `ginkgo-biloba-autumn-gold-princeton-sentry`, `prunus-x-yedoensis-kwanzan`, `chaenomeles-double-take-series`, `nepeta-cat-s-meow-walker-s-low`, `hemerocallis-happy-returns-spider-types`, `oenothera-lindheimeri-whirling-butterflies`, `lavandula-x-intermedia-phenomenal`, `paeonia-lactiflora-festiva-maxima-early-cvs`, `hylotelephium-herbstfreude`, `leucanthemum-becky`, `canna-australia-species-types`, `crinum-milk-and-wine-bulbispermum`, `allium-millenium-purple-sensation`, `liriope-muscari-big-blue`, `clematis-jackmanii-viticella-types`, `pennisetum-alopecuroides-hameln`, `lantana-camara-miss-huff-hardy`, `abelia-edward-goucher`, `abelia-x-grandiflora-kaleidoscope`, `abelia-x-grandiflora-prostrata`, `abelia-x-grandiflora-rose-creek`, `abelia-x-grandiflora-sunrise`, `acer-crimson-sunset-jfs-kw202`, `aesculus-x-marylandica-homestead`, `agastache-acapulco-orange`, `agastache-astello-indigo`, `agastache-black-adder`, `agastache-blue-boa`, `agastache-blue-fortune`, `agastache-firebird`, `agastache-kudos-ambrosia`, `agastache-poquito-orangetm-tnagapo`, `agastache-purple-haze`, `alocasia-calidora`, `alocasia-sarawakensis-yucatan-princess`, `alstroemeria-casablanca`, `amaranthus-magic-fountain`, `amsonia-blue-ice`, `arachniodes-simplicior-variegata`, `aucuba-japonica-dwarf-green`, `aucuba-japonica-picturata`, `baptisia-carolina-moonlight`, `baptisia-purple-smoke`, `begonia-argenteo-guttata`, `begonia-canary-wings`, `berberis-microphylla-nana`, `berberis-x-gladwynensis-william-penn`, `berberis-x-stenophylla-corallina-compacta`, `betula-populifolia-whitespire`, `betula-royal-frost`, `buddleja-lo-behold-blue-chip`, `buddleja-lo-behold-blue-chip-jr`, `buddleja-lo-behold-ice-chip`, `buddleja-lo-behold-lilac-chip`, `buddleja-lo-behold-pink-micro-chip`, `buddleja-miss-molly`, `buddleja-miss-pearl`, `buddleja-miss-ruby`, `buddleja-miss-violet`, `buxus-green-gem`, `buxus-green-mountain`, `calanthe-kozu-spice`, `callicarpa-pearl-glam-nccx2`, `calycanthus-aphrodite`, `calycanthus-venus`, `camellia-autumn-spirit`, `camellia-polar-ice`, `camellia-snow-flurry`, `cenchrus-alopecuroides-hameln`, `cenchrus-alopecuroides-moudry`, `cercis-merlot`, `cereus-forbesii-ming-thing`, `cleome-senorita-blanca-inclesbimp`, `cleome-senorita-rosalita-inncleosr`, `clethra-alnifolia-crystalina`, `coleus-forsteri-marginatus`, `coreopsis-strawberry-lemonade`, `cornus-cloudbursttm-ncch3`, `cornus-little-rubytm-ncch1`, `crocosmia-lucifer`, `cuphea-hybrid-cupver`, `dactylicapnos-scandens-athens-yellow`, `delosperma-oberg`, `deutzia-yuki-cherry-blossomtm-ncdx2`, `dianthus-jolttm-pink-pas970056`, `dichondra-argentea-silver-falls`, `echinacea-secret-lust`, `echinacea-tomato-soup`, `ensete-ventricosum-maurelii`, `epimedium-x-versicolor-sulphureum`, `epimedium-x-youngianum-niveum`, `episcia-pink-brocade`, `erythronium-pagoda`, `euonymus-kiautschovicus-manhattan`, `evolvulus-blue-my-mind`, `fargesia-rufa-green-panda`, `fothergilla-mount-airy`
- named as a cultivar, but its botanical name doesn't say which (25): `heuchera-villosa`, `heuchera-villosa-2`, `astilbe-chinensis`, `hakonechloa-macra`, `chelone-lyonii`, `itea-virginica`, `viburnum-nudum`, `viburnum-nudum-2`, `salvia-rosmarinus`, `artemisia-hybrid`, `monarda-didyma`, `echinacea-purpurea`, `coreopsis-verticillata`, `symphyotrichum-oblongifolium`, `vernonia-hybrid-mt-cuba`, `salvia-yangii`, `salvia-greggii-microphylla`, `asclepias-tuberosa-clay-strain`, `physostegia-virginiana`, `solidago-rugosa`, `boltonia-asteroides`, `panicum-virgatum`, `schizachyrium-scoparium`, `crocus-tommasinianus`, `hypericum-kalmianum`
- no spread (11): `iris-aquatic-spp`, `echinacea-cone-fections-big-sky-sunseekers`, `clematis-occidentalis`, `dioscorea-villosa`, `passiflora-incarnata`, `echinocystis-lobata`, `phaseolus-polystachios`, `smilax-lasioneura`, `bignonia-capreolata-tangerine-beauty`, `clematis-viorna`, `vitis-spp`
- a cultivar with a species record it could point to (4): `itea-virginica-henry-s-garnet`, `wisteria-frutescens-amethyst-falls`, `monarda-didyma-raspberry-wine`, `diospyros-kaki-fuyu`

## For reference

Where a source gave nothing, counted only:

- 350 plants: no NC State page in the list: never asked for (see "Not looked up yet"), asked for and NC State has none (a 404), a genus or cultivar group (not read by the rule), or a page not matched to the plant yet
- 1094 plants: no USDA PLANTS symbol: a genus or cultivar group (not searched), or a name PLANTS has no species entry for
- 1589 plants: a USDA PLANTS profile with no characteristics saved (size, sun and so on): PLANTS has none, or they were never fetched (see "Not looked up yet")
- 2224 plants: not on the Arkansas atlas's maps under its name (mostly plants not recorded wild in Arkansas)
- 290 plants: the Arkansas atlas not looked up (a genus or cultivar group: no species name)
- 83 plants: a cultivar read from species-level pages: its size, form and flower color are taken only from a page about the cultivar

Kew's checklist has no one accepted species for 37 catalog names (hybrids, names it draws narrower, exotics it doesn't list in the US), so they have no native status: Aloysia citriodora, Alternanthera dentata, Amsonia illustris, Aphelandra squarrosa, Betula jacquemontii, Betula platyphylla, Calamovilfa longifolia, Cartrema americana, Distylium hybrids, Eubotrys racemosa, Euonymus kiautschovicus, Gomphocarpus physocarpa, Hamamelis hybrids, Hepatica acutiloba, Hibiscus lasiocarpos, Hypericum pyramidatum, Iris germanica, Juniperus conferta, Ludwigia sedoides, Malus hybrids, Nothoscordum sellowianum, Nuphar luteum, Oligoneuron rigidum, Onosmodium bejariense, Penstemon grandiflorus, Pieris formosana, Polystichum polyblepharum, Rhus trilobata, Rhychospora latifolia, Rosa lucieae, Rubus pensilvanicus, Silphium trifoliatum, Smilax lasioneura, Thuidium delicatulum, Thymus pseudolanuginosus, Tulipa hybrids, Washingtonia robusta.

New plants (scripts/catalog/additions.mjs):

- 2740 plants added from NC State's Plant Toolbox in this build
- 888 plants waiting, for size (746), form (93), hardiness (251), sun (87), its species (18)
- 624 pages left out: a vegetable (86), a genus (331), a weed (203), in the catalog (4)
- 18 pages the sitemap lists that aren't saved yet
