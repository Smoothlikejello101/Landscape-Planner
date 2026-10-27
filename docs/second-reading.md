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

Where the text says two things (a summary and an FAQ that differ), give the
reading the text as a whole supports. If it truly can't be settled, give
`null`.

Write your answers as JSON:
`[{ "key": "...", "text": "<the task's text hash, copied>", "read": { "<fact>": <value or null>, … } }, …]`,
one entry per task, in the order given.
