# Catalog review

Written by `npm run catalog:build` (docs/catalog-build.md): what the build left for a person to decide, fetch or tidy, most useful first. Don't edit it: the next build writes it again. 67 to decide, 2873 plants not searched, 544 catalog checks; 3681 of 3686 records audited.

- [Sources disagree (23)](#sources-disagree-23)
- [Cultivar: tree or shrub? (6)](#cultivar-tree-or-shrub-6)
- [Edible, but rated toxic (16)](#edible-but-rated-toxic-16)
- [Held back as implausible (3)](#held-back-as-implausible-3)
- [A value its source no longer gives (1)](#a-value-its-source-no-longer-gives-1)
- [Read from text, but a second reading differs (96)](#read-from-text-but-a-second-reading-differs-96)
- [Taken out: a description read wrongly before (2)](#taken-out-a-description-read-wrongly-before-2)
- [Taken out: its source withdrawn (24)](#taken-out-its-source-withdrawn-24)
- [Values the catalog can't take (1)](#values-the-catalog-cant-take-1)
- [Kew names to check (13)](#kew-names-to-check-13)
- [Bloom months held back (4)](#bloom-months-held-back-4)
- [Not searched on the web (2873)](#not-searched-on-the-web-2873)
- [Catalog checks (422)](#catalog-checks-422)

## Sources disagree (23)

The audit's sources give different values, so the catalog keeps the value it had, marked unverified. Zones are on the half-zone scale (7 is 7a, 7.5 is 7b); sizes are in feet. There's no place to record a decision on these yet: they stay listed until there is.

| Plant | Fact | What the sources say | Catalog now |
| --- | --- | --- | --- |
| Japanese forest grass 'All Gold' (`hakonechloa-macra`) | spreading | provenwinners.com: Spreading rhizome · hortech.com: Clumping | Clumping |
| Sideoats grama (`bouteloua-curtipendula`) | spreading | newmoonnursery.com: Slow-spreading rhizome · prairienursery.com: Clumping | Clumping |
| Cream wild indigo (`baptisia-bracteata`) | flower_color | mowildflowers.net: White, Cream · allendanseed.com: Yellow | – |
| Common sneezeweed (`helenium-autumnale`) | spreading | newmoonnursery.com: Clumping · calfloranursery.com: Mat-forming | Clumping |
| Bradbury's beebalm (`monarda-bradburiana`) | spreading | newmoonnursery.com: Clumping · prairienursery.com: Slow-spreading rhizome; blazingstargardens.com: Spreading rhizome | Clumping |
| Prairie sundrops (`oenothera-pilosella`) | spreading | mowildflowers.net: Aggressive rhizome · ancientrootsnativenursery.com: Mat-forming | Spreading rhizome |
| Slender beardtongue (`penstemon-gracilis`) | flower_color | morningskygreenery.com: Lavender · ecoscapes1.com: Pink; bluethumb.org says Pink | – |
| Obedient plant (species) (`physostegia-virginiana-2`) | spreading | newmoonnursery.com: Spreading rhizome · prairienursery.com: Aggressive rhizome | Aggressive rhizome |
| Wild petunia (`ruellia-humilis`) | self-sowing | newmoonnursery.com: Modest · prairienursery.com: Prolific | Modest |
| Late figwort (`scrophularia-marilandica`) | self-sowing | bugloversnativeplants.com: Modest · rachelsnativeplants.com: Prolific | Modest |
| Prairie blue-eyed grass (`sisyrinchium-campestre`) | flower_color | morningskygreenery.com: Lavender · mowildflowers.net: Blue | – |
| Showy goldenrod (`solidago-speciosa`) | spreading | prairienursery.com: Clumping · newmoonnursery.com: Spreading rhizome | Clumping |
| Smooth blue aster (`symphyotrichum-laeve`) | self-sowing | ncsu: Prolific · ufl.edu: Unrated | Prolific |
| Venus' looking glass (`triodanis-perfoliata`) | flower_color | nativebeeginnings.com: Blue, Violet · fellabees.com: Purple | – |
| Poverty oat grass (`danthonia-spicata`) | spreading | newmoonnursery.com: Slow-spreading rhizome · mowildflowers.net: Clumping | Clumping |
| Beak grass (`diarrhena-obovata`) | spreading | prairienursery.com: Clumping · sagmoraine.org: Slow-spreading rhizome | Clumping |
| White-tinged sedge (`carex-albicans`) | spreading | newmoonnursery.com: Slow-spreading rhizome · mowildflowers.net: Clumping | Clumping |
| Ivory sedge (`carex-eburnea`) | leaves in winter | mowildflowers.net: semi-evergreen · blazingstargardens.com: evergreen | – |
| Common bur sedge (`carex-grayi`) | spreading | newmoonnursery.com: Slow-spreading rhizome · prairienursery.com: Clumping | Clumping |
| Porcupine sedge (`carex-hystericina`) | flower_color | aquascapesunlimited.com: Yellow · bluethumb.org: Green | – |
| Brown fox sedge (`carex-vulpinoidea`) | spreading | newmoonnursery.com: Spreading rhizome · blazingstargardens.com: Clumping; nvknurseries.com: Slow-spreading rhizome; jerseyyards.org says Clumping | Clumping |
| Creek sedge (`carex-amphibola`) | self-sowing | prairienursery.com: Prolific · newmoonnursery.com: Modest | Modest |
| Tree of heaven (`ailanthus-altissima`) | bloom_season | ncsu, davisla.wordpress.com: summer · arizona.edu: spring; usda says late spring | – |

## Cultivar: tree or shrub? (6)

The species is a tree, and this cultivar, with no page of its own, may be smaller, so its form is left as it was. A decision goes in scripts/catalog/decisions.json (`form`), and the build applies it.

| Plant | What the sources say | Catalog now |
| --- | --- | --- |
| Common fig 'Chicago Hardy' (`ficus-carica-chicago-hardy`) | its species is listed as a tree; a cultivar may be a tree or a shrub | – |
| Pear 'Orient' (`pyrus-communis-orient`) | its species is listed as a tree; a cultivar may be a tree or a shrub | – |
| Japanese plum 'Bruce' (`prunus-salicina-bruce`) | its species is listed as a tree; a cultivar may be a tree or a shrub | – |
| Pecan 'Kanza' (`carya-illinoinensis-kanza`) | its species is listed as a tree; a cultivar may be a tree or a shrub | – |
| Rose of Sharon Chiffon series (`hibiscus-syriacus-chiffon-series`) | its species is listed as a tree; a cultivar may be a tree or a shrub | – |
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

## A value its source no longer gives (1)

An earlier build wrote it from a source, but no source gives it now: its page is no longer read, or no longer says it. It's kept (a plant's spread draws its circle), with the citation it had. There's no place to record a decision on these yet: they stay listed until there is.

| Plant | Fact | Value now |
| --- | --- | --- |
| Dwarf yaupon holly 'Schillings' (`ilex-vomitoria-nana-schillings`) | flower_color | ["white"], from kiefernursery.com |

## Read from text, but a second reading differs (96)

A value the rules read from a page's text, which a second reading of the same text (blind to the first) read differently, and not just in degree. It isn't written. The catalog keeps what it had, except a value an earlier build read from that text: that's taken out, unsettled (NC State's deer field, where its text lowered it, stands as the field gives it). Nothing to decide yet: a page can be read again, or a person can look.

| Plant | Fact | The rules read | The second reading | Source | The catalog has |
| --- | --- | --- | --- | --- | --- |
| Heuchera 'Autumn Bride' (`heuchera-villosa`) | leaves in winter | evergreen | semi-evergreen | stonehousenursery.com | evergreen |
| Turtlehead 'Hot Lips' (`chelone-lyonii`) | deer | Resistant | Occasional | newmoonnursery.com | Resistant |
| Beebalm 'Jacob Cline' (`monarda-didyma`) | spreading | Aggressive runner (stolons) | Aggressive rhizome | ncsu | Spreading rhizome |
| Blue false indigo (`baptisia-australis`) | deer | Resistant | Occasional | newmoonnursery.com | Resistant |
| Goldenrod 'Fireworks' (`solidago-rugosa`) | spreading | Clumping | Slow-spreading rhizome | newmoonnursery.com | Slow-spreading rhizome |
| Black-eyed Susan 'Goldsturm' (`rudbeckia-fulgida-goldsturm`) | deer | Resistant | nothing | newmoonnursery.com | Resistant |
| River birch (`betula-nigra`) | spreading | Clumping | nothing | ufl.edu | Single/multi-stem (the earlier list) |
| Purple clematis (`clematis-occidentalis`) | spreading | Clumping | nothing | plantnative.org | Twining (the earlier list) |
| Bladdernut (`staphylea-trifolia`) | deer | Resistant | Occasional | awesomenativeplants.info | Resistant |
| Wild ginger (`asarum-canadense`) | spreading | Slow-spreading rhizome | nothing | ncsu | Slow-spreading rhizome |
| Poke milkweed (`asclepias-exaltata`) | leaves in winter | deciduous | nothing | butterflygardenstogo.com | nothing |
| Poke milkweed (`asclepias-exaltata`) | deer | Resistant | nothing | butterflygardenstogo.com | Resistant |
| Prairie milkweed (`asclepias-sullivantii`) | leaves in winter | deciduous | nothing | butterflygardenstogo.com | nothing |
| Prairie milkweed (`asclepias-sullivantii`) | deer | Resistant | nothing | butterflygardenstogo.com | Resistant (the earlier list) |
| Small yellow wild indigo (`baptisia-tinctoria`) | deer | Resistant | Occasional | newmoonnursery.com | Resistant |
| Downy wood mint (`blephilia-ciliata`) | deer | Resistant | Occasional | newmoonnursery.com | Resistant |
| Bear corn (`conopholis-americana`) | deer | Occasional | nothing | ncsu | Resistant (the earlier list) |
| Common boneset (`eupatorium-perfoliatum`) | spreading | Clumping | nothing | ncsu | Clumping (the earlier list) |
| Common boneset (`eupatorium-perfoliatum`) | spreading | Clumping | Spreading rhizome | newmoonnursery.com | Clumping (the earlier list) |
| Meadow blazing star (`liatris-ligulistylis`) | spreading | Clumping | nothing | prairienursery.com | Clumping |
| Prairie sundrops (`oenothera-pilosella`) | deer | Resistant | nothing | mowildflowers.net | Resistant (the earlier list) |
| Hairy beardtongue (`penstemon-hirsutus`) | spreading | Clumping | nothing | ncsu | Spreading rhizome (the earlier list) |
| Woodland phlox (`phlox-divaricata`) | deer | Resistant | Occasional | newmoonnursery.com | Resistant (the earlier list) |
| Smooth phlox (`phlox-glaberrima-subsp-interior`) | spreading | Clumping | Spreading rhizome | ncsu | Clumping (the earlier list) |
| Wild sweet William (`phlox-maculata`) | spreading | Spreading rhizome | nothing | newmoonnursery.com | Slow-spreading rhizome |
| Virginia mountain mint (`pycnanthemum-virginianum`) | deer | Candy | Resistant | plantnative.org | Resistant |
| Mexican hat (`ratibida-columnifera`) | self-sowing | Prolific | nothing | plantnative.org | Unrated |
| Mexican hat (`ratibida-columnifera`) | spreading | Spreading rhizome | Clumping | plantnative.org | Clumping (the earlier list) |
| Wild petunia (`ruellia-humilis`) | spreading | Runner (stolons) | nothing | onrockgarden.com | Clumping (the earlier list) |
| Wild stonecrop (`sedum-ternatum`) | spreading | Spreading rhizome | Mat-forming | prairienursery.com | Mat-forming |
| Blue-stemmed goldenrod (`solidago-caesia`) | deer | Resistant | Occasional | newmoonnursery.com | Resistant |
| Zigzag goldenrod (`solidago-flexicaulis`) | spreading | Clumping | Spreading rhizome | newmoonnursery.com | Aggressive rhizome (the earlier list) |
| Sky blue aster (`symphyotrichum-oolentangiense`) | deer | Resistant | Occasional | plantnative.org | Resistant |
| Early meadow rue (`thalictrum-dioicum`) | leaves in winter | deciduous | nothing | ncsu | nothing |
| Sessile bellwort (`uvularia-sessilifolia`) | spreading | Runner (stolons) | Spreading rhizome | ncsu | Spreading rhizome (the earlier list) |
| Blue vervain (`verbena-hastata`) | spreading | Spreading rhizome | Clumping | newmoonnursery.com | Slow-spreading rhizome |
| Prairie dropseed (`sporobolus-heterolepis`) | self-sowing | Modest | nothing | ncsu | Modest (the earlier list) |
| Curly-styled wood sedge (`carex-rosea`) | leaves in winter | evergreen | semi-evergreen | stonehousenursery.com | semi-evergreen |
| Long-beaked sedge (`carex-sprengelii`) | spreading | Spreading rhizome | nothing | prairienursery.com | Slow-spreading rhizome |
| Robin's plantain (`erigeron-pulchellus`) | self-sowing | Unrated | nothing | backyardgardener.com | Unrated |
| Cinnamon fern (`osmundastrum-cinnamomeum`) | spreading | Slow-spreading rhizome | Clumping | plantnative.org | Clumping |
| Creeping phlox (`phlox-stolonifera`) | spreading | Slow-spreading rhizome | Mat-forming | newmoonnursery.com | Aggressive runner (stolons) |
| Netleaf leather flower (`clematis-viorna`) | self-sowing | Sterile | nothing | clayandlimestone.com | Modest |
| Beebalm 'Raspberry Wine' (`monarda-didyma-raspberry-wine`) | spreading | Aggressive runner (stolons) | Aggressive rhizome | ncsu | Spreading rhizome (the earlier list) |
| Arborvitae 'Green Giant' (`thuja-green-giant`) | deer | Resistant | Occasional | instanthedge.com | Resistant |
| Spine acanthus (`acanthus-spinosus`) | spreading | Clumping | nothing | ncsu | nothing |
| Desert-rose (`adenium-obesum`) | spreading | Clumping | nothing | ncsu | nothing |
| Adiantum aethiopicum (`adiantum-aethiopicum`) | spreading | Spreading rhizome | Runner (stolons) | ncsu | nothing |
| Pyramid bugle (`ajuga-pyramidalis`) | spreading | Spreading rhizome | Runner (stolons) | ncsu | nothing |
| Cape African-queen (`anisodontea-capensis`) | leaves in winter | evergreen | semi-evergreen | ncsu | nothing |
| Walking fern (`asplenium-rhizophyllum`) | spreading | Clumping | nothing | ncsu | nothing |
| Betony (subsp. officinalis) (`betonica-officinalis-subsp-officinalis`) | spreading | Spreading rhizome | nothing | ncsu | nothing |
| Calibrachoa × hybrida (`calibrachoa-x-hybrida`) | deer | Occasional | Resistant | ncsu | nothing |
| Straggler daisy (`calyptocarpus-vialis`) | spreading | Runner (stolons) | Spreading rhizome | ncsu | nothing |
| Campsis × tagliabueana (`campsis-x-tagliabueana`) | spreading | Aggressive rhizome | Suckering colonizer | ncsu | nothing |
| Carex scaposa (`carex-scaposa`) | spreading | Spreading rhizome | Clumping | ncsu | nothing |
| Eastern Hornbeam (`carpinus-orientalis`) | spreading | Suckering | nothing | ncsu | nothing |
| Perennial cornflower (`centaurea-montana`) | spreading | Clumping | Runner (stolons) | ncsu | nothing |
| Cup-and-saucer-vine (`cobaea-scandens`) | leaves in winter | evergreen | semi-evergreen | ncsu | nothing |
| Chinese fir (`cunninghamia-lanceolata`) | spreading | Suckering | nothing | ncsu | nothing |
| Evergreen Solomon's seal (`disporopsis-pernyi`) | leaves in winter | evergreen | nothing | ncsu | nothing |
| Siebold's wood fern (`dryopteris-sieboldii`) | spreading | Spreading rhizome | nothing | ncsu | nothing |
| Red Easter-lily cactus (`echinopsis-oxygona`) | spreading | Mat-forming | Clumping | ncsu | nothing |
| Showy orchid (`galearis-spectabilis`) | deer | Occasional | nothing | ncsu | nothing |
| Haworthiopsis tessellata (`haworthiopsis-tessellata`) | spreading | Runner (stolons) | Clumping | ncsu | nothing |
| Hemionitis seticaulis (`hemionitis-seticaulis`) | spreading | Spreading rhizome | nothing | ncsu | nothing |
| Cliff stonecrop (`hylotelephium-cauticola`) | spreading | Runner (stolons) | Spreading rhizome | ncsu | nothing |
| Showy stonecrop (`hylotelephium-spectabile`) | deer | Occasional | nothing | ncsu | nothing |
| Aaron's beard (`hypericum-calycinum`) | spreading | Aggressive runner (stolons) | Aggressive rhizome | ncsu | nothing |
| Common goldstar (`hypoxis-hirsuta`) | spreading | Clumping | nothing | ncsu | nothing |
| Isotoma (`isotoma-fluviatilis`) | spreading | Mat-forming | Runner (stolons) | ncsu | nothing |
| Pincushion-flower (`lomelosia-caucasica`) | spreading | Mat-forming | nothing | ncsu | nothing |
| Scarlet beebalm (`monarda-didyma-2`) | spreading | Aggressive runner (stolons) | Aggressive rhizome | ncsu | nothing |
| Nimblewill (`muhlenbergia-schreberi`) | spreading | Mat-forming | Runner (stolons) | ncsu | nothing |
| Parrot feather watermilfoil (`myriophyllum-aquaticum`) | spreading | Mat-forming | nothing | ncsu | nothing |
| Blue Beargrass (`nolina-nelsonii`) | spreading | Clumping | nothing | ncsu | nothing |
| Black mondo (`ophiopogon-planiscapus`) | spreading | Clumping | nothing | ncsu | nothing |
| Mountain woodsorrel (`oxalis-montana`) | spreading | Spreading rhizome | Runner (stolons) | ncsu | nothing |
| Pygmy date palm (`phoenix-roebelenii`) | spreading | Suckering | nothing | ncsu | nothing |
| Clammy groundcherry (`physalis-heterophylla`) | spreading | Spreading rhizome | nothing | ncsu | nothing |
| Loblolly pine (`pinus-taeda`) | self-sowing | Unrated | nothing | ncsu | nothing |
| Water lettuce (`pistia-stratiotes`) | spreading | Mat-forming | Runner (stolons) | ncsu | nothing |
| Appalachian polypody (`polypodium-appalachianum`) | spreading | Spreading rhizome | Mat-forming | ncsu | nothing |
| Soft Shield-fern (`polystichum-setiferum`) | spreading | Clumping | nothing | ncsu | nothing |
| Dwarf azalea (`rhododendron-atlanticum`) | spreading | Runner (stolons) | Spreading rhizome | ncsu | nothing |
| Staghorn sumac (`rhus-typhina`) | self-sowing | Unrated | nothing | ncsu | nothing |
| Butcher's-broom (`ruscus-aculeatus`) | spreading | Suckering (slow) | Slow-spreading rhizome | ncsu | nothing |
| Saw palmetto (`serenoa-repens`) | spreading | Clumping | nothing | ncsu | nothing |
| American evergreen (`syngonium-podophyllum`) | leaves in winter | evergreen | nothing | ncsu | nothing |
| Rice-paper plant (`tetrapanax-papyrifer`) | spreading | Suckering | Spreading rhizome | ncsu | nothing |
| Boatlily (`tradescantia-spathacea`) | spreading | Mat-forming | Clumping | ncsu | nothing |
| Tulipa greigii (`tulipa-greigii`) | deer | Candy | nothing | ncsu | nothing |
| Prostrate blue violet (`viola-walteri`) | spreading | Spreading rhizome | Runner (stolons) | ncsu | nothing |
| Cape Mallow 'Slightly Strawberry' (`anisodontea-capensis-slightly-strawberry`) | leaves in winter | evergreen | semi-evergreen | ncsu | nothing |
| Winter creeper 'Colorata' (`euonymus-fortunei-colorata`) | spreading | Runner (stolons) | Mat-forming | ncsu | nothing |
| Eulalia 'Goliath' (`miscanthus-sinensis-goliath`) | self-sowing | Modest | Sterile | ncsu | nothing |

## Taken out: a description read wrongly before (2)

A value an earlier build read from a page's description, by rules that have since been fixed and no longer read it so. It's taken out (nothing to decide: listed so the change is seen).

| Plant | Fact | What was taken out |
| --- | --- | --- |
| Soft rush (`juncus-effusus`) | spreading | "Clumping", read from abnativeplants.com's description, which the rules no longer read so |
| Summersweet 'Hummingbird' (`clethra-alnifolia-hummingbird`) | spreading | "Slow-spreading rhizome", read from abnativeplants.com's description, which the rules no longer read so |

## Taken out: its source withdrawn (24)

A value whose only sources we may no longer read: their terms were taken back for a fresh reading, or found to bar us (decisions.json `withdrawn`). It's taken out (nothing to decide: listed so the change is seen).

| Plant | Fact | What was taken out |
| --- | --- | --- |
| Astilbe 'Visions' series (3 cvs) (`astilbe-chinensis`) | height | {"min":1.5,"max":2,"med":1.75}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Astilbe 'Visions' series (3 cvs) (`astilbe-chinensis`) | width | {"min":1,"max":1.5,"med":1.25}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Astilbe 'Visions' series (3 cvs) (`astilbe-chinensis`) | coldest zone | 4, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Astilbe 'Visions' series (3 cvs) (`astilbe-chinensis`) | warmest zone | 10.5, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Astilbe 'Visions' series (3 cvs) (`astilbe-chinensis`) | most sun | "Part", from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Astilbe 'Visions' series (3 cvs) (`astilbe-chinensis`) | least sun | "Part", from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Japanese forest grass 'All Gold' (`hakonechloa-macra`) | height | {"min":1,"max":2,"med":1.5}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Japanese forest grass 'All Gold' (`hakonechloa-macra`) | width | {"min":1.5,"max":2,"med":1.75}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Rose 'Julia Child' (floribunda) (`rosa-julia-child`) | coldest zone | 4, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Rose 'Julia Child' (floribunda) (`rosa-julia-child`) | warmest zone | 9.5, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Beebalm 'Jacob Cline' (`monarda-didyma`) | height | {"min":3,"max":4,"med":3.5}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Beebalm 'Jacob Cline' (`monarda-didyma`) | width | {"min":1.25,"max":1.5,"med":1.38}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Black-eyed Susan 'American Gold Rush' (`rudbeckia-american-gold-rush`) | height | {"min":1.83,"max":2.17,"med":2}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Black-eyed Susan 'American Gold Rush' (`rudbeckia-american-gold-rush`) | width | {"min":1.5,"max":2,"med":1.75}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Black-eyed Susan 'American Gold Rush' (`rudbeckia-american-gold-rush`) | coldest zone | 4, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Black-eyed Susan 'American Gold Rush' (`rudbeckia-american-gold-rush`) | warmest zone | 9.5, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Black-eyed Susan 'American Gold Rush' (`rudbeckia-american-gold-rush`) | most sun | "Full", from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Black-eyed Susan 'American Gold Rush' (`rudbeckia-american-gold-rush`) | least sun | "Full", from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Coneflower 'Magnus' (`echinacea-purpurea`) | height | {"min":2.5,"max":3,"med":2.75}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Coneflower 'Magnus' (`echinacea-purpurea`) | width | {"min":1.5,"max":1.5,"med":1.5}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Aromatic aster 'October Skies' (`symphyotrichum-oblongifolium`) | height | {"min":1.5,"max":2.5,"med":2}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Aromatic aster 'October Skies' (`symphyotrichum-oblongifolium`) | width | {"min":1.5,"max":2,"med":1.75}, from whiteflowerfarm.com: its terms were taken back for a fresh reading (a Shopify shop, cleared before its standard terms were read) |
| Autumn sage 'Raspberry Delight' (`salvia-greggii-microphylla`) | height | {"min":2,"max":3,"med":2.5}, from gardencentermarketing.com: its plant library pages say "Images and descriptions are copyrighted. Only for use on signage and websites created by Clarity Connect / GardenCenterMarketing.com" (read 2026-10-28) |
| Autumn sage 'Raspberry Delight' (`salvia-greggii-microphylla`) | width | {"min":2,"max":3,"med":2.5}, from gardencentermarketing.com: its plant library pages say "Images and descriptions are copyrighted. Only for use on signage and websites created by Clarity Connect / GardenCenterMarketing.com" (read 2026-10-28) |

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

## Not searched on the web (2873)

No web search has run for these yet: `node scripts/catalog/search.mjs` (docs/catalog-sources.md, "Searching the web"), then add its claims to catalog-src/web-claims.json.

- Echinacea Big Sky series (`echinacea-big-sky-series`)
- Echinacea SunSeekers series (`echinacea-sunseekers-series`)
- Coral honeysuckle 'Major Wheeler' (`lonicera-sempervirens-major-wheeler`)
- Common fig 'Chicago Hardy' (`ficus-carica-chicago-hardy`)
- Jujube 'Lang' (`ziziphus-jujuba-lang`)
- Hardy pomegranate 'Russian 26' (`punica-granatum-russian-26`)
- Pear 'Orient' (`pyrus-communis-orient`)
- Apple 'Enterprise' (`malus-domestica-enterprise`)
- Apple 'William's Pride' (`malus-domestica-williams-pride`)
- Japanese plum 'Bruce' (`prunus-salicina-bruce`)
- Pecan 'Kanza' (`carya-illinoinensis-kanza`)
- Rabbiteye blueberry (`vaccinium-virgatum`)
- Rabbiteye blueberry 'Climax' (`vaccinium-virgatum-climax`)
- Blackberry 'Ouachita' (`rubus-ouachita`)
- Blackberry 'Natchez' (`rubus-natchez`)
- Blackberry 'Ponca' (`rubus-ponca`)
- Strawberry 'Camarosa' (`fragaria-x-ananassa-camarosa`)
- Elderberry 'Wyldewood' (`sambucus-canadensis-wyldewood`)
- Distylium 'Cinnamon Girl' (`distylium-cinnamon-girl`)
- Loropetalum 'Zhuzhou' (`loropetalum-chinense-zhuzhou`)
- Crape myrtle 'Muskogee' (`lagerstroemia-muskogee`)
- Crape myrtle 'Tonto' (`lagerstroemia-tonto`)
- Rose of Sharon Chiffon series (`hibiscus-syriacus-chiffon-series`)
- Ginkgo 'Princeton Sentry' (`ginkgo-biloba-princeton-sentry`)
- Daylily (`hemerocallis`)
- Canna (`canna`)
- Hardy swamplily (`crinum-bulbispermum`)
- Ornamental allium 'Purple Sensation' (`allium-purple-sensation`)
- 2845 plants added from NC State (scripts/catalog/added-plants.json)

## Catalog checks (422)

What `npm run catalog:check` lists: implausible values, and names and parents to tidy in the catalog itself.

- a cultivar with no species record in the catalog (365): `rosa-julia-child`, `rosa-generous-gardener`, `rosa-climbing-iceberg`, `eutrochium-gateway`, `rudbeckia-american-gold-rush`, `narcissus-tete-a-tete`, `rudbeckia-fulgida-goldsturm`, `fothergilla-intermedia-mt-airy`, `achillea-moonshine`, `morus-alba-x-rubra-illinois-everbearing`, `rubus-caddo-ouachita-natchez-ponca`, `rubus-ouachita`, `rubus-natchez`, `rubus-ponca`, `asparagus-officinalis-jersey-millennium`, `distylium-hybrids-vintage-jade-cinnamon-girl`, `distylium-cinnamon-girl`, `mahonia-eurybracteata-soft-caress`, `buxus-green-velvet-microphylla-types`, `thuja-green-giant`, `ilex-x-nellie-r-stevens`, `lagerstroemia-natchez-muskogee-tonto`, `lagerstroemia-muskogee`, `lagerstroemia-tonto`, `nepeta-cat-s-meow-walker-s-low`, `paeonia-lactiflora-festiva-maxima-early-cvs`, `hylotelephium-herbstfreude`, `leucanthemum-becky`, `crinum-milk-and-wine-bulbispermum`, `allium-millenium-purple-sensation`, `allium-purple-sensation`, `acer-crimson-sunset-jfs-kw202`, `aesculus-x-marylandica-homestead`, `agastache-acapulco-orange`, `agastache-astello-indigo`, `agastache-black-adder`, `agastache-blue-boa`, `agastache-blue-fortune`, `agastache-firebird`, `agastache-kudos-ambrosia`, `agastache-poquito-orangetm-tnagapo`, `agastache-purple-haze`, `alocasia-calidora`, `alocasia-sarawakensis-yucatan-princess`, `alstroemeria-casablanca`, `amaranthus-magic-fountain`, `amsonia-blue-ice`, `arachniodes-simplicior-variegata`, `baptisia-carolina-moonlight`, `baptisia-purple-smoke`, `begonia-argenteo-guttata`, `begonia-canary-wings`, `berberis-microphylla-nana`, `berberis-x-gladwynensis-william-penn`, `berberis-x-stenophylla-corallina-compacta`, `betula-populifolia-whitespire`, `betula-royal-frost`, `buddleja-lo-behold-blue-chip`, `buddleja-lo-behold-blue-chip-jr`, `buddleja-lo-behold-ice-chip`, `buddleja-lo-behold-lilac-chip`, `buddleja-lo-behold-pink-micro-chip`, `buddleja-miss-molly`, `buddleja-miss-pearl`, `buddleja-miss-ruby`, `buddleja-miss-violet`, `buxus-green-gem`, `buxus-green-mountain`, `calanthe-kozu-spice`, `callicarpa-pearl-glam-nccx2`, `calycanthus-aphrodite`, `calycanthus-venus`, `camellia-autumn-spirit`, `camellia-polar-ice`, `camellia-snow-flurry`, `cercis-merlot`, `cereus-forbesii-ming-thing`, `cleome-senorita-blanca-inclesbimp`, `cleome-senorita-rosalita-inncleosr`, `coleus-forsteri-marginatus`, `coreopsis-strawberry-lemonade`, `cornus-cloudbursttm-ncch3`, `cornus-little-rubytm-ncch1`, `crocosmia-lucifer`, `cuphea-hybrid-cupver`, `dactylicapnos-scandens-athens-yellow`, `delosperma-oberg`, `deutzia-yuki-cherry-blossomtm-ncdx2`, `dianthus-jolttm-pink-pas970056`, `dichondra-argentea-silver-falls`, `echinacea-secret-lust`, `echinacea-tomato-soup`, `ensete-ventricosum-maurelii`, `epimedium-x-versicolor-sulphureum`, `episcia-pink-brocade`, `erythronium-pagoda`, `euonymus-kiautschovicus-manhattan`, `evolvulus-blue-my-mind`, `fargesia-rufa-green-panda`, `fothergilla-mount-airy`, `fothergilla-x-intermedia-legend-of-the-small-ncfi1`, `fragaria-red-ruby`, `gaillardia-tizzy`, `gazania-krebsiana-tanager`, `gazania-linearis-colorado-gold`, `geranium-dilys`, `geranium-rozanne`, `glyceria-maxima-variegata`, `gomphrena-pink-zazzle`, `hedychium-daniel-weeks`, `heuchera-berry-smoothie`, `heuchera-palace-purple`, `heuchera-primo-pretty-pistachio`, `heuchera-southern-comfort`, `hibiscus-fireball`, `hosta-blue-mouse-ears`, `hosta-halcyon`, `hylotelephium-matrona`, `hypericum-androsaemum-matisse`, `hypericum-androsaemum-picasso`, `hypericum-androsaemum-pollock`, `ilex-carolina-cardinal`, `ilex-carolina-sentinel`, `ilex-cherry-bomb`, `ilex-christmas-jewel-hl10-90`, `ilex-emily-bruner`, `ilex-mary-nell`, `ilex-oaklandtm-magland`, `ilex-oakleaftm-conaf`, `ilex-scepter`, `ilex-whoa-nellie`, `illicium-oriontm-ncih2`, `imperata-cylindrica-rubra`, `iris-pallida-variegata`, `juniperus-communis-compressa`, `juniperus-communis-echiniformis`, `juniperus-communis-gold-cone`, `juniperus-communis-hibernica`, `juniperus-davurica-expansa`, `juniperus-davurica-parsonii`, `juniperus-sabina-monna`, `juniperus-sabina-skandia`, `juniperus-squamata-blue-star`, `juniperus-squamata-holger`, `lagerstroemia-biloxi`, `lagerstroemia-early-birdtm-white-jd900`, `lagerstroemia-osage`, `lagerstroemia-pocomoke`, `lagerstroemia-ruby-dazzle`, `lagerstroemia-sioux`, `leopoldia-comosa-plumosum`, `ligustrum-golden-ticket-nclx1`, `ligustrum-good-vibrations-nclx1`, `lobivia-ancistrophora-dominos`, `lobularia-snow-princess-inlbusnopr`, `magnolia-butterflies`, `magnolia-freeman`, `magnolia-genie`, `magnolia-jane`, `magnolia-mercurytm-ncmx1`, `malus-beverly`, `malus-royal-raindrops-jfs-kw5`, `marsilea-mutica-variegata`, `miscanthus-purpurascens`, `monarda-raspberry-wine`, `morus-indica-unryo`, `muhlenbergia-pink-flamingos`, `ophiopogon-jaburan-vittatus`, `penstemon-x-mexicali-red-rocks-p008s`, `petrosedum-rupestre-angelina`, `phalaris-arundinacea-picta`, `philodendron-birkin`, `plectranthus-mona-lavender`, `prunus-kanzan`, `prunus-okame`, `pulmonaria-raspberry-splash`, `pyracantha-mohave`, `quercus-x-warei-kindred-spirit-nadler`, `rhododendron-dandy-man-color-wheel-ncrx1`, `rhododendron-dr-a-blok`, `rhododendron-ramapo`, `rhododendron-stonewall-jackson`, `rhododendron-strawberry-ice`, `rhododendron-windbeam`, `rhododendron-x-hybridum-gunrei-satzuki`, `robinia-x-ambigua-idahoensis`, `rosa-abraham-darby-auscot`, `rosa-all-that-jazz-twoadvance`, `rosa-altissimo-delmur`, `rosa-americatm-jacclam`, `rosa-baby-blanket-korfullwind`, `rosa-barbra-streisand-wekquaneze`, `rosa-beauty-secret`, `rosa-belle-de-baltimore`, `rosa-belle-poitevine`, `rosa-bonica-meldomonac`, `rosa-carefree-beautytm-bucbi`, `rosa-carefree-delight-melpotal`, `rosa-celestial`, `rosa-chevy-chase`, `rosa-climbing-cecile-brunner`, `rosa-coral-drift-meldrifora`, `rosa-cornelia`, `rosa-cottage-garden-chewily`, `rosa-country-dancer`, `rosa-dainty-bess`, `rosa-don-juan`, `rosa-dortmund`, `rosa-dublin-bay-macdub`, `rosa-duet`, `rosa-easy-goingtm-harflow`, `rosa-echo`, `rosa-europeana`, `rosa-excelsa`, `rosa-fair-bianca-ausca`, `rosa-falling-in-lovetm-wekmoomar`, `rosa-fantin-latour`, `rosa-felicite-parmentier`, `rosa-first-light-devrudi`, `rosa-fourth-of-julytm-wekroalt`, `rosa-frau-dagmar-hastrup`, `rosa-frau-karl-druschki`, `rosa-frida-kahlotm-wekcifrabaun`, `rosa-gertrude-jekyll-ausboard`, `rosa-golden-showers`, `rosa-golden-wings`, `rosa-gourmet-popcorn-weopop`, `rosa-graham-thomas-ausmas`, `rosa-green-ice`, `rosa-handel-macha`, `rosa-hansa`, `rosa-heritage-ausblush`, `rosa-hermosa`, `rosa-hero-aushero`, `rosa-hot-tamale-jacpoy`, `rosa-iceberg-schneewittchen-korbin`, `rosa-international-herald-tribune-harquantum`, `rosa-ispahan`, `rosa-jeanne-lajoie`, `rosa-judy-fischer`, `rosa-julia-childtm-wekvossutono`, `rosa-juno`, `rosa-kaleidoscopetm-jacbow`, `rosa-kathryn-morley-ausclub`, `rosa-ketchup-mustard-wekzazette`, `rosa-lace-cascade-jacarch`, `rosa-lady-elsie-maytm-angelsie`, `rosa-lady-of-the-dawn-interlada`, `rosa-lavender-dream-interlav`, `rosa-lemon-fizz-korfizzlem`, `rosa-lilac-auslilac`, `rosa-linda-campbelltm-morten`, `rosa-loving-touch`, `rosa-madame-hardy`, `rosa-madame-isaac-pereire`, `rosa-magic-carpet-jaclover`, `rosa-magic-carrousel-moorcar`, `rosa-many-happy-returns-harwanted`, `rosa-mary-rose-ausmary`, `rosa-meg`, `rosa-mister-lincoln`, `rosa-moon-rivertm-korconta`, `rosa-morning-magictm-radmor`, `rosa-nearly-wild`, `rosa-nevada`, `rosa-night-owltm-wekpurosot`, `rosa-nympenburg`, `rosa-old-blush`, `rosa-orange-honey`, `rosa-outta-the-bluetm-wekstephitsu`, `rosa-palmgarten-frankfurttm-korsilan`, `rosa-paprika-tanprik`, `rosa-passionate-kisses-meizebul`, `rosa-paul-neyron`, `rosa-penelope`, `rosa-perdita-ausperd`, `rosa-pierre-de-ronsard-meiviolin`, `rosa-pink-grootendorst`, `rosa-pinkie-cl`, `rosa-prosperity`, `rosa-red-cascade-moorcap`, `rosa-red-fountain`, `rosa-rhonda`, `rosa-robin-hood`, `rosa-robusta-korgosa`, `rosa-rotes-meer-hanpur`, `rosa-royal-sunset`, `rosa-sally-holmes`, `rosa-seafoam`, `rosa-sevillana-melgekanu`, `rosa-starina-melgali`, `rosa-st-patricktm-wekamanda`, `rosa-sun-runner-interdust`, `rosa-sunshine-daydreamtm-meikanaro`, `rosa-sun-sprinkles-jachal`, `rosa-sweet-juliet-ausleap`, `rosa-tahitian-treasuretm-radtreasure`, `rosa-tamora-austamora`, `rosa-the-countryman-ausman`, `rosa-the-dark-lady-ausbloom`, `rosa-the-fairy`, `rosa-the-garland`, `rosa-the-generous-gardener-ausdrawn`, `rosa-thelma`, `rosa-the-pilgrim-auswalker`, `rosa-therese-bugnet`, `rosa-vanity`, `rosa-westerland-korwest`, `rosa-white-licoricetm-wekdidusinra`, `rosa-white-meidiland-meicoublan`, `rosa-winchester-cathedral-auscat`, `rosa-yesterday`, `rosa-zephirine-drouhin`, `rotheca-myricoides-ugandense`, `rudbeckia-sullivantii-goldsturm`, `salix-integra-hakuro-nishiki`, `salix-udensis-sekka`, `salvia-amistad`, `salvia-indigo-spires`, `scabiosa-columbaria-butterfly-blue`, `sedum-birthday-party`, `sedum-mexicanum-lemon-coral`, `sedum-touchdown-teak`, `seemannia-nematanthodes-evita`, `senecio-candicans-angel-wings-senaw`, `solidago-virgaurea-peter-pan`, `spiraea-japonica-double-play-candy-corn-ncsx1`, `spiraea-japonica-goldmound`, `spiraea-japonica-limemound-monhub`, `spiraea-nipponica-snowmound`, `strobilanthes-alternata-exotica`, `ulmus-cathedral`, `ulmus-homestead`, `vaccinium-darrowii-john-blue`, `veronica-waterperry-blue`, `viburnum-awabuki-chindo`, `viburnum-emerald-triumph`, `viburnum-nantucket`, `viburnum-yin-ncvx2`, `x-gordlinia-grandiflora-sweet-tea`, `x-pyracomeles-juke-box-ncxp1`, `camellia-winters-charm`, `camellia-winters-hope`, `camellia-winters-interlude`, `camellia-winters-rose`, `camellia-winters-snowman`, `camellia-winters-star`, `epimedium-x-youngianum-niveum`, `helleborus-x-hybridus-ice-n-roses-coseh-4200`, `ilex-sharums-shamrocktm-en2`, `magnolia-x-kewensis-wadas-memory`, `pieris-brouwers-beauty`, `polemonium-boreale-heavenly-habit`, `polygonatum-odoratum-var-pluriflorum-variegatum`, `rhododendron-girards-crimson`, `rosa-belindas-dream`, `rosa-childs-playtm-savachild`, `rosa-climbing-rainbows-end-savaclend`, `rosa-great-maidens-blush`, `rosa-gros-choux-d-hollande`, `rosa-heart-ogoldtm-wekdykstra`, `rosa-josephs-coat`, `rosa-ralphs-creepertm-morpapplay`, `rosa-rockin-robin-wekboroco`, `rosa-tess-of-the-durbervilles-ausmove`
- no spread (30): `astilbe-chinensis`, `hakonechloa-macra`, `monarda-didyma`, `rudbeckia-american-gold-rush`, `echinacea-purpurea`, `symphyotrichum-oblongifolium`, `salvia-greggii-microphylla`, `iris-aquatic-spp`, `echinacea-cone-fections-big-sky-sunseekers`, `echinacea-big-sky-series`, `echinacea-sunseekers-series`, `clematis-occidentalis`, `dioscorea-villosa`, `passiflora-incarnata`, `echinocystis-lobata`, `phaseolus-polystachios`, `smilax-lasioneura`, `bignonia-capreolata-tangerine-beauty`, `clematis-viorna`, `vaccinium-virgatum`, `vaccinium-virgatum-climax`, `rubus-ouachita`, `rubus-natchez`, `rubus-ponca`, `vitis-spp`, `distylium-cinnamon-girl`, `lagerstroemia-muskogee`, `lagerstroemia-tonto`, `crinum-bulbispermum`, `allium-purple-sensation`
- named as a cultivar, but its botanical name doesn't say which (25): `heuchera-villosa`, `heuchera-villosa-2`, `astilbe-chinensis`, `hakonechloa-macra`, `chelone-lyonii`, `itea-virginica`, `viburnum-nudum`, `viburnum-nudum-2`, `salvia-rosmarinus`, `artemisia-hybrid`, `monarda-didyma`, `echinacea-purpurea`, `coreopsis-verticillata`, `symphyotrichum-oblongifolium`, `vernonia-hybrid-mt-cuba`, `salvia-yangii`, `salvia-greggii-microphylla`, `asclepias-tuberosa-clay-strain`, `physostegia-virginiana`, `solidago-rugosa`, `boltonia-asteroides`, `panicum-virgatum`, `schizachyrium-scoparium`, `crocus-tommasinianus`, `hypericum-kalmianum`
- a cultivar with a species record it could point to (2): `hemerocallis-happy-returns-spider-types`, `canna-australia-species-types`

## For reference

Where a source gave nothing, counted only:

- 359 plants: no NC State page in the list: never asked for (see "Not looked up yet"), asked for and NC State has none (a 404), a genus or cultivar group (not read by the rule), or a page not matched to the plant yet
- 1158 plants: no USDA PLANTS symbol: a genus or cultivar group (not searched), or a name PLANTS has no species entry for
- 1631 plants: a USDA PLANTS profile with no characteristics saved (size, sun and so on): PLANTS has none, or they were never fetched (see "Not looked up yet")
- 2274 plants: not on the Arkansas atlas's maps under its name (mostly plants not recorded wild in Arkansas)
- 340 plants: the Arkansas atlas not looked up (a genus or cultivar group: no species name)
- 86 plants: a cultivar read from species-level pages: its size, form and flower color are taken only from a page about the cultivar

Kew's checklist has no one accepted species for 36 catalog names (hybrids, names it draws narrower, exotics it doesn't list in the US), so they have no native status: Aloysia citriodora, Alternanthera dentata, Amsonia illustris, Aphelandra squarrosa, Betula jacquemontii, Betula platyphylla, Calamovilfa longifolia, Cartrema americana, Eubotrys racemosa, Euonymus kiautschovicus, Gomphocarpus physocarpa, Hamamelis hybrids, Hepatica acutiloba, Hibiscus lasiocarpos, Hypericum pyramidatum, Iris germanica, Juniperus conferta, Ludwigia sedoides, Malus hybrids, Nothoscordum sellowianum, Nuphar luteum, Oligoneuron rigidum, Onosmodium bejariense, Penstemon grandiflorus, Pieris formosana, Polystichum polyblepharum, Rhus trilobata, Rhychospora latifolia, Rosa lucieae, Rubus pensilvanicus, Silphium trifoliatum, Smilax lasioneura, Thuidium delicatulum, Thymus pseudolanuginosus, Tulipa hybrids, Washingtonia robusta.

New plants (scripts/catalog/additions.mjs):

- 0 plants added from NC State's Plant Toolbox in this build (2845 in all)
- 858 plants waiting, for size (713), form (94), hardiness (256), sun (92), its species (19)
- 592 pages left out: a vegetable (86), a genus (294), a weed (204), in the catalog (8)
- 18 pages the sitemap lists that aren't saved yet
