# A second reading: the reader's instructions

The catalog writes a value read from a page's text only where a second, blind
reading of the same text agrees (decided with Jason, 2026-10-27;
scripts/catalog/second-reading.mjs, docs/catalog-sources.md "A second
reading"). These are the instructions each second reader gets, word for word.
The build lists the pages to read in catalog-src/build/second-reading-tasks.json;
the readings go into scripts/catalog/second-reading.json.

---

You are reading plant descriptions to say what each one states about a few
facts. Another reader has already read the same text. You are not told what
it found, and you must not try to guess it. Read each page on its own.

**Use only the text you're given.** Never use what you know about the plant.
If the text doesn't say, the answer is `null`, even when you know the answer.
A value you'd give from memory is wrong here.

Each task is `{ key, names, sentences, text, facts }`:

- `names`: the plant's names (botanical, common, cultivar).
- `sentences`: the page's text.
- `facts`: the facts to answer for this page.

Answer each fact listed. Use exactly one of its values below, or `null`.

**Only the plant itself counts.**

- **Another plant:** text about another plant doesn't count: one it's compared to ("unlike its aggressive relative"), planted with, suggested instead of, or a related product's blurb.
- **Parts:** a part of the plant that isn't the whole doesn't count: its fruit eaten by deer, sterile ray flowers.
- **Elsewhere:** where it grows wild doesn't count ("forms thickets along stream banks"), and neither does a claim about somewhere else ("invasive in Florida").
- **Not the plant at all:** the gardener's doing ("divide the rhizomes"), a question ("Does it spread aggressively?") and a negation ("does not spread by runners") don't count either.

**Facts and values**

- `foliage`, leaves in winter:
  - `"evergreen"`: the leaves stay through winter.
  - `"deciduous"`: the leaves drop in fall, or the plant dies back or goes dormant in winter. Summer dormancy doesn't count.
  - `"semi-evergreen"`: the text says semi-evergreen, or that it depends on the winter or the climate ("evergreen in mild winters").
- `deer`:
  - `"Resistant"`: deer generally leave it alone (deer resistant or tolerant, seldom damaged, deer avoid it, unpalatable to deer).
  - `"Occasional"`: deer eat it at least sometimes. That covers saying so plainly ("deer browse the foliage"), now and then ("may be damaged by deer") or resisting only in part ("mildly" or "moderately" resistant).
  - `"Candy"`: deer favor it, or damage it often, heavily or seriously.
- `self_seed`, the plant sowing itself in the garden:
  - `"Prolific"`: freely (readily, easily, aggressively, so much it's weedy or needs controlling).
  - `"Modest"`: a little ("occasionally", "lightly", "self-seeds but is not aggressive").
  - `"Unrated"`: it self-sows, but the text doesn't say how freely ("may self-seed", "deadhead to prevent self-seeding").
  - `"Sterile"`: the plant itself is said to be sterile or to set no seed.

  "Does not self-seed" alone is `null`.
- `habit`, spreading underground or by runners:
  - `"Spreading rhizome"`: spreads by rhizomes (or underground runners).
  - `"Slow-spreading rhizome"`: slowly so.
  - `"Aggressive rhizome"`: aggressively, rapidly or invasively so, said plainly, not hedged ("somewhat", "can be in rich soil" is hedged).
  - `"Runner (stolons)"`: spreads by stolons or runners above ground.
  - `"Aggressive runner (stolons)"`: aggressively so.
  - `"Suckering"`: spreads by suckers.
  - `"Suckering (slow)"`: slowly so.
  - `"Suckering colonizer"`: suckers aggressively or weedily.
  - `"Suckering thicket"`: suckers and forms thickets.
  - `"Mat-forming"`: forms mats.
  - `"Clumping"`: forms clumps, is clump-forming or a bunchgrass, and nothing in the text says it spreads underground or by runners.

  "Rhizomatous" alone, as a kind of root, is `null`. A tree's or a vine's "clump" (its trunks, its base) is `null`.
- `fruit_set`, what it takes for the plant to bear fruit (or seed):
  - `"separate"`: male and female flowers are on separate plants (dioecious), so a female fruits only with a male near. A cultivar the text says is male or female is `"separate"`, unless the text says it fruits without a male.
  - `"partner"`: it needs another plant, of a different cultivar or genetic strain, to fruit (self-incompatible, not self-fertile, "a pollinizer is needed", "plant another variety for pollination").
  - `"better"`: it fruits on its own but better with another plant near ("self-fertile, but planting two cultivars is recommended", "partially self-fertile", "fruit set improves when planted in groups").
  - `"self"`: it fruits on its own (self-fertile, self-pollinating, "sets fruit without pollination", "does not need a pollinizer").

  Fruiting on its own, said of this plant, outweighs what the text says of its group: a female holly that "sets fruit without a male" is `"self"`, though hollies are dioecious (`"better"` if the text also says a partner improves the crop). Text about its group counts where nothing more particular is said ("Hollies are dioecious", "Like all persimmons"). Monoecious (both sexes on one plant) alone is `null`, and so are "can be monoecious or dioecious" and cross-pollination as a way it hybridizes.
- `flower_lead`, the color of its flowers, as the text first gives it: one of `"white"`, `"yellow"`, `"pink"`, `"purple"`, `"red"`, `"orange"`, `"blue"`, `"green"`, `"cream"`, `"brown"`, `"silver"`, `"black"`.
  - The first color the text gives the plant's own flowers (or its petals, rays or bracts): "deep red flowers" is `"red"`, "pink to white flowers" `"pink"`, "the flowers are pale blue" `"blue"`.
  - A two-color word counts as its last color ("creamy-white" is `"white"`, "greenish-yellow" `"yellow"`). Gold and golden are `"yellow"`; lavender, violet and lilac `"purple"`; scarlet, crimson, burgundy and maroon `"red"`; creamy and tan `"cream"`; gray `"silver"`; copper `"brown"`. A color in none of these (rose, magenta, coral) doesn't count.
  - Not a disk's, an eye's or a center's color, nor a fruit's or a leaf's, nor a color of cultivars or other plants the text mentions. If the text gives its flowers no color, `null`.
- `sex`, the plant's own sex, for a cultivar:
  - `"male"` or `"female"`: the text says this plant is male or female ("a female cultivar", "a male clone", "this cultivar is male"). Its group having separate sexes, or a male of another cultivar suggested as its pollinizer, is `null`.

- `partners`, the plants the text names as this plant's pollinizer or partner for fruit: a list of their names as the text gives them, without quotes (`["Southern Gentleman"]`).
  - A cultivar named as a male to plant with it, a pollinizer for it, or a cultivar to pair or cross-pollinate it with ("A good male plant to pair it with is 'Southern Gentleman'", "requiring two pollinating cultivars, like 'Stuart' or 'Elliot'").
  - Not the plant's own name, its parents or where it came from ("a cross of 'Gemo' and…", "open-pollinated seed of…"), a cultivar the text says fruits on its own, or a plant named for any other reason. A species named without a cultivar's quoted name ("Ilex cornuta") doesn't count. If the text names none, `null`.

Where the text says two things (a summary and an FAQ that differ), give the
reading the text as a whole supports. If it truly can't be settled, give
`null`.

Write your answers as JSON:
`[{ "key": "...", "text": "<the task's text hash, copied>", "read": { "<fact>": <value or null>, … } }, …]`,
one entry per task, in the order given.
