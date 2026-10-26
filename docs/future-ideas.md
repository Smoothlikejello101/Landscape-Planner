# Future ideas

Things we've decided not to do yet, kept so they aren't lost. Each says why
it waits.

## Plants and the catalog

- **Native by ecoregion, not just state.** Natives are matched by state for
  now (Kew's checklist, by state). An ecoregion is closer to what a plant
  is adapted to, but no open dataset covers it nationwide that we know of.
- **Nativars' wildlife value.** A cultivar of a native species inherits its
  native range. Research (Mt. Cuba's trials, Baisden and Tallamy) finds
  some changes cost wildlife value: purple or red leaves, double flowers. A
  cultivar record could note those traits.
- **Bloom months from your own observations.** Once people record when
  their plants bloom, that's the best regional bloom data there is.
- **Sites whose terms ban bots.** We keep the rule (docs/catalog-sources.md,
  "How terms are read"). If a gap turns up that only those sites could fill,
  it's worth talking through again with specifics.
- **Plants people ask for.** A one-time, opt-in prompt the first time
  someone adds a plant or a note ("Help us make FullGrown better…"), sending
  plant names only. Needs a privacy decision before launch.

- **Cultivars grouped in one record, split.** Jason's default (2026-10-25): cultivars get records of their own. The
  first seven were split on 2026-10-26 (decisions.json `split`). The other records that name several cultivars
  (crape myrtle 'Natchez' / 'Muskogee' / 'Tonto', whose sizes differ: 'Tonto' stays shrub-sized; apple, blueberry,
  blackberry and the rest the review lists as "a cultivar with no species record") are next, by the same rule.
  Records for a series or "types" (boxwood "microphylla types") name no one cultivar and stay as they are.

- **Plants named with a list of names.** Six plants added from NC State before 2026-10-26 are named with GBIF's
  English names all in one ("Umbrella sedge, Umbrella papyrus, Umbrella palm, …", "Small-leaved Elm, Jersey Elm,
  English Elm"). New plants take the first now; an added plant keeps its name, so these six need renaming once.

## Picker

- **Flags for every disagreement.** A row is marked only when a filter
  match rests on what other sources say (a fact's `alt`). Other disagreements are listed in
  the opened row; flagging them all would mark most rows.
- **A "Transplantable" filter.** Its old form passed every plant not known to have a taproot, 97% of the
  catalog. Dropped from the picker until a source rates taproots for most plants (Jason, 2026-10-25).
- **Dry shade as its own filter.** The earlier list's word only (a quarter of the catalog). For now, "Drought
  tolerant" (NC State: drought or dry soil) with Shade under Sun stands in for it.

## Promised, not built yet

- **Deleting synced copies 14 months after a trial or plan ends.** The terms and the privacy policy promise
  it, with an email first. Nothing does it yet. The earliest anyone can reach it is December 2027 (the
  first trials began in October 2026), and the email needs the sending service (Resend).
