# Catalog review

Written by `npm run catalog:build` (docs/catalog-build.md): what the build left for a person to decide, fetch or tidy, most useful first. Don't edit it: the next build writes it again. 58 to decide, 39 sites whose terms are unsettled, 104 catalog checks; 780 of 820 records audited.

- [Sources disagree (6)](#sources-disagree-6)
- [Cultivar: tree or shrub? (11)](#cultivar-tree-or-shrub-11)
- [Edible, but rated toxic (12)](#edible-but-rated-toxic-12)
- [Held back as implausible (1)](#held-back-as-implausible-1)
- [Kew names to check (8)](#kew-names-to-check-8)
- [Native status held back (2)](#native-status-held-back-2)
- [Mapped twice on the Arkansas atlas (17)](#mapped-twice-on-the-arkansas-atlas-17)
- [Read from the genus's page (1)](#read-from-the-genuss-page-1)
- [Sites whose terms are unsettled (39)](#sites-whose-terms-are-unsettled-39)
- [Catalog checks (104)](#catalog-checks-104)

## Sources disagree (6)

The audit's sources give different values, so the catalog keeps the value it had, marked unverified. Zones are on the half-zone scale (7 is 7a, 7.5 is 7b); sizes are in feet. There's no place to record a decision on these yet: they stay listed until there is.

| Plant | Fact | What the sources say | Catalog now |
| --- | --- | --- | --- |
| Slender beardtongue (`penstemon-gracilis`) | most sun | morningskygreenery.com says Full; each decided on its own, most sun Part and least sun Full make no range | Full |
| Slender beardtongue (`penstemon-gracilis`) | least sun | windflowernatives.com says Part; each decided on its own, most sun Part and least sun Full make no range | Part |
| Prairie brome (`bromus-kalmii`) | most sun | morningskygreenery.com says Full; each decided on its own, most sun Part and least sun Full make no range | Full |
| Prairie brome (`bromus-kalmii`) | least sun | fellabees.com says Part; each decided on its own, most sun Part and least sun Full make no range (USDA: shade tolerance low) | Part |
| Porcupine grass (`hesperostipa-spartea`) | most sun | allendanseed.com says Full; each decided on its own, most sun Part and least sun Full make no range | Full |
| Porcupine grass (`hesperostipa-spartea`) | least sun | morningskygreenery.com says Part; each decided on its own, most sun Part and least sun Full make no range (USDA: shade tolerance high) | Part |

## Cultivar: tree or shrub? (11)

The species is a tree, and this cultivar, with no page of its own, may be smaller, so its form is left as it was. There's no place to record a decision on these yet: they stay listed until there is.

| Plant | What the sources say | Catalog now |
| --- | --- | --- |
| Dwarf yaupon holly (`ilex-vomitoria-nana-schillings`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Shrub |
| Jujube (`ziziphus-jujuba-li-lang`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Hardy pomegranate (`punica-granatum-salavatski-russian-26`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Shrub |
| Mulberry 'Illinois Everbearing' (`morus-alba-x-rubra-illinois-everbearing`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Asian pear 'Shinko' (`pyrus-pyrifolia-shinko`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Apple (rust-resistant only) (`malus-domestica-liberty-enterprise-william-s-pride`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Elderberry (improved cvs) (`sambucus-canadensis-bob-gordon-wyldewood`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Shrub |
| Loropetalum (`loropetalum-chinense-purple-pixie-zhuzhou`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Shrub |
| Crape myrtle (`lagerstroemia-natchez-muskogee-tonto`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Ginkgo (male only) (`ginkgo-biloba-autumn-gold-princeton-sentry`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Tree |
| Flowering cherry (`prunus-x-yedoensis-kwanzan`) | its species is listed as a tree; a cultivar may be a tree or a shrub | Shrub |

## Edible, but rated toxic (12)

A source says it's edible, and the catalog rates it toxic (to dogs, or to people), so "edible" isn't written. There's no place to record a decision on these yet: they stay listed until there is.

- Purple passionflower (maypop) (`passiflora-incarnata`)
- Swamp white oak (`quercus-bicolor`)
- Elderberry (`sambucus-canadensis`)
- Wild garlic (`allium-canadense`)
- Showy wild garlic (`allium-canadense-var-lavendulare`)
- Wild leek (ramps) (`allium-tricoccum`)
- Mayapple (`podophyllum-peltatum`)
- Japanese plum (`prunus-salicina-methley-bruce`)
- Elderberry (improved cvs) (`sambucus-canadensis-bob-gordon-wyldewood`)
- Peach / nectarine (`prunus-persica`)
- Apricot (`prunus-armeniaca`)
- Sweet cherry (`prunus-avium`)

## Held back as implausible (1)

The audit's values would make the record implausible (the app's checks), so they weren't written. There's no place to record a decision on these yet: they stay listed until there is.

| Plant | Facts | Why |
| --- | --- | --- |
| Green-and-gold (`chrysogonum-virginianum`) | height | under 3 in tall (2 in): inches read as feet, or the other way? |

## Kew names to check (8)

Names Kew's World Checklist could read two ways, taken as the accepted name (check each is the plant meant: there's no place to record that yet); and law-list names Kew accepts under another, or doesn't match at all (set the entry's `accepted` in scripts/catalog/regulated-plants.json).

- Aquilegia canadensis: an accepted name that is also an older homonym's synonym
- Bouteloua gracilis: an accepted name that is also an older homonym's synonym
- Carex gracillima: an accepted name that is also an older homonym's synonym
- Castilleja coccinea: an accepted name that is also an older homonym's synonym
- Conopholis americana: an accepted name that is also an older homonym's synonym
- Ludwigia alternifolia: an accepted name that is also an older homonym's synonym
- Scirpus microcarpus: an accepted name that is also an older homonym's synonym
- Alhagi camelorum: a law list's name Kew doesn't match to one accepted species

## Native status held back (2)

Kew has the species native to these states, but the catalog calls the plant "Exotic" (its species may hold a native kind the garden plant isn't), so it's never shown native. There's no place to record a decision on these yet: they stay listed until there is.

- Raspberry (`rubus-idaeus`): Kew's Rubus idaeus, native to 40 states
- Lantana (`lantana-camara-miss-huff-hardy`): Kew's Lantana camara, native to 1 state

## Mapped twice on the Arkansas atlas (17)

The atlas maps the name more than once (its varieties, say) with different status, so the atlas's status for it is left out. There's no place to record a decision on these yet: they stay listed until there is.

- Goldenrod 'Fireworks' (`solidago-rugosa`)
- Boltonia 'Snowbank' (`boltonia-asteroides`)
- Little bluestem 'Standing Ovation' (`schizachyrium-scoparium`)
- Black-eyed Susan 'Goldsturm' (`rudbeckia-fulgida-goldsturm`)
- Prairie willow (`salix-humilis`)
- False boneset (`brickellia-eupatorioides`)
- Sweet Joe Pye weed (`eutrochium-purpureum`)
- Orange coneflower (`rudbeckia-fulgida-var-sullivantii`)
- Black-eyed Susan (biennial) (`rudbeckia-hirta`)
- Blue-stemmed goldenrod (`solidago-caesia`)
- Gray goldenrod (`solidago-nemoralis`)
- Drummond's aster (`symphyotrichum-drummondii`)
- Panicled aster (`symphyotrichum-lanceolatum`)
- Common blue violet (`viola-sororia`)
- Scribner's panic grass (`dichanthelium-oligosanthes`)
- Hairy lens grass (`paspalum-setaceum`)
- Little bluestem (species) (`schizachyrium-scoparium-2`)

## Read from the genus's page (1)

NC State's page for the whole genus was read for this plant (scripts/catalog/ncsu-pages.json names it), so the facts read from it are the genus's, not the plant's own. Take the entry out to read none.

- Daffodil 'Tete-a-Tete' (`narcissus-tete-a-tete`)

## Sites whose terms are unsettled (39)

A search found pages on these sites, but their terms aren't in the record (scripts/catalog/site-terms.json): a reader couldn't tell what they allow, or none has read them. Their pages aren't used. Each one's packet is in catalog-src/terms-review/, which holds the last search run's (docs/catalog-sources.md, "How terms are read").

americanpeonysociety.org, arborday.org, brit.org, cloversgarden.com, colesvillenursery.com, costafarms.com, courvillenursery.com, earth.com, earthone.io, finegardening.com, gardenerspath.com, gardenia.net, gardeningknowhow.com, greg.app, grokipedia.com, hoffmannursery.com, ipni.org, jstor.org, kew.org, monrovia.com, myseeds.co, nih.gov, ornamental-trees.co.uk, plantdelights.com, plantlust.com, plantsexpress.com, pridescorner.com, provenwinners.com, rhs.org.uk, sciencedirect.com, southernliving.com, thespruce.com, txsmartscape.com, unc.edu, usf.edu, vaccinium.org, viriar.com, wisc.edu, worldoffloweringplants.com

## Catalog checks (104)

What `npm run catalog:check` lists: implausible values, and names and parents to tidy in the catalog itself.

- a cultivar with no species record in the catalog (66): `rosa-julia-child`, `rosa-generous-gardener`, `rosa-climbing-iceberg`, `eutrochium-gateway`, `rudbeckia-american-gold-rush`, `symphyotrichum-ericoides-snow-flurry`, `narcissus-tete-a-tete`, `rudbeckia-fulgida-goldsturm`, `clethra-alnifolia-hummingbird`, `hydrangea-quercifolia-ruby-slippers`, `hydrangea-quercifolia-alice`, `hydrangea-arborescens-haas-halo`, `fothergilla-intermedia-mt-airy`, `bignonia-capreolata-tangerine-beauty`, `lonicera-sempervirens-john-clayton-major-wheeler`, `wisteria-frutescens-amethyst-falls`, `achillea-moonshine`, `ilex-vomitoria-nana-schillings`, `stachys-byzantina-helene-von-stein`, `ficus-carica-celeste-brown-turkey-chicago-hardy`, `diospyros-kaki-fuyu`, `ziziphus-jujuba-li-lang`, `punica-granatum-salavatski-russian-26`, `morus-alba-x-rubra-illinois-everbearing`, `pyrus-communis-moonglow-kieffer-orient`, `pyrus-pyrifolia-shinko`, `malus-domestica-liberty-enterprise-william-s-pride`, `prunus-salicina-methley-bruce`, `carya-illinoinensis-kanza-lakota`, `vaccinium-virgatum-climax-premier-tifblue`, `rubus-caddo-ouachita-natchez-ponca`, `fragaria-x-ananassa-chandler-camarosa`, `asparagus-officinalis-jersey-millennium`, `sambucus-canadensis-bob-gordon-wyldewood`, `distylium-hybrids-vintage-jade-cinnamon-girl`, `loropetalum-chinense-purple-pixie-zhuzhou`, `gardenia-jasminoides-frostproof-kleim-s-hardy`, `abelia-x-grandiflora-rose-creek-kaleidoscope`, `mahonia-eurybracteata-soft-caress`, `cephalotaxus-harringtonia-duke-gardens-prostrata`, `buxus-green-velvet-microphylla-types`, `thuja-green-giant`, `ilex-x-nellie-r-stevens`, `aucuba-japonica-gold-dust`, `lagerstroemia-natchez-muskogee-tonto`, `vitex-agnus-castus-shoal-creek`, `buddleia-davidii-sterile-miss-molly-lo-behold`, `hibiscus-syriacus-sterile-diana-chiffon-series`, `acer-palmatum-bloodgood-seiryu`, `ginkgo-biloba-autumn-gold-princeton-sentry`, `prunus-x-yedoensis-kwanzan`, `chaenomeles-double-take-series`, `nepeta-cat-s-meow-walker-s-low`, `hemerocallis-happy-returns-spider-types`, `oenothera-lindheimeri-whirling-butterflies`, `lavandula-x-intermedia-phenomenal`, `paeonia-lactiflora-festiva-maxima-early-cvs`, `hylotelephium-herbstfreude`, `leucanthemum-becky`, `canna-australia-species-types`, `crinum-milk-and-wine-bulbispermum`, `allium-millenium-purple-sensation`, `liriope-muscari-big-blue`, `clematis-jackmanii-viticella-types`, `pennisetum-alopecuroides-hameln`, `lantana-camara-miss-huff-hardy`
- named as a cultivar, but its botanical name doesn't say which (25): `heuchera-villosa`, `heuchera-villosa-2`, `astilbe-chinensis`, `hakonechloa-macra`, `chelone-lyonii`, `itea-virginica`, `viburnum-nudum`, `viburnum-nudum-2`, `salvia-rosmarinus`, `artemisia-hybrid`, `monarda-didyma`, `echinacea-purpurea`, `coreopsis-verticillata`, `symphyotrichum-oblongifolium`, `vernonia-hybrid-mt-cuba`, `salvia-yangii`, `salvia-greggii-microphylla`, `asclepias-tuberosa-clay-strain`, `physostegia-virginiana`, `solidago-rugosa`, `boltonia-asteroides`, `panicum-virgatum`, `schizachyrium-scoparium`, `crocus-tommasinianus`, `hypericum-kalmianum`
- no spread (11): `iris-aquatic-spp`, `echinacea-cone-fections-big-sky-sunseekers`, `clematis-occidentalis`, `dioscorea-villosa`, `passiflora-incarnata`, `echinocystis-lobata`, `phaseolus-polystachios`, `smilax-lasioneura`, `bignonia-capreolata-tangerine-beauty`, `clematis-viorna`, `vitis-spp`
- a cultivar with a species record it could point to (2): `itea-virginica-henry-s-garnet`, `monarda-didyma-raspberry-wine`

## For reference

Where a source gave nothing, counted only:

- 350 plants: no NC State page in the list: never asked for (see "Not looked up yet"), asked for and NC State has none (a 404), a genus or cultivar group (not read by the rule), or a page not matched to the plant yet
- 64 plants: no USDA PLANTS symbol: a genus or cultivar group (not searched), or a name PLANTS has no species entry for
- 464 plants: a USDA PLANTS profile with no characteristics saved (size, sun and so on): PLANTS has none, or they were never fetched (see "Not looked up yet")
- 264 plants: not on the Arkansas atlas's maps under its name (mostly plants not recorded wild in Arkansas)
- 35 plants: the Arkansas atlas not looked up (a genus or cultivar group: no species name)
- 76 plants: a cultivar read from species-level pages: its size, form and flower color are taken only from a page about the cultivar

Kew's checklist has no one accepted species for 13 catalog names (hybrids, names it draws narrower, exotics it doesn't list in the US), so they have no native status: Amsonia illustris, Calamovilfa longifolia, Distylium hybrids, Hepatica acutiloba, Hibiscus lasiocarpos, Hypericum pyramidatum, Iris germanica, Oligoneuron rigidum, Onosmodium bejariense, Penstemon grandiflorus, Silphium trifoliatum, Smilax lasioneura, Tulipa hybrids.
