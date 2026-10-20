// GBIF (api.gbif.org): flowering observations by month and state, for bloom months (docs/bloom-months.md).
// Shared by gbif-fetch.mjs (fetching, into catalog-src/gbif/) and bloom.mjs (reading).
const API = 'https://api.gbif.org/v1';
/** Licences that allow commercial use with credit (a record's own licence; CC BY-NC records are left out). */
export const LICENSES = ['CC0_1_0', 'CC_BY_4_0'];
const lic = LICENSES.map((l) => `&license=${l}`).join('');
/** GBIF's backbone match for a binomial, species rank, strict (no fuzzy guess). */
export const matchUrl = (binomial) => `${API}/species/match?name=${encodeURIComponent(binomial)}&rank=SPECIES&strict=true&kingdom=Plantae`;
/** Flowering records in the US for a taxon, by month. */
export const monthsUrl = (key) => `${API}/occurrence/search?taxonKey=${key}&country=US&reproductiveCondition=flowering${lic}&limit=0&facet=month&facetLimit=12`;
/** Flowering records in the US for a taxon in one month, by state (GADM level 1: "USA.4_1" is Arkansas). */
export const statesUrl = (key, month) => `${API}/occurrence/search?taxonKey=${key}&country=US&reproductiveCondition=flowering${lic}&month=${month}&limit=0&facet=gadmLevel1Gid&facetLimit=60`;
/** A GADM area's name and codes (its variant names include the postal code). */
export const gadmUrl = (gid) => `${API}/geocode/gadm/${gid}`;
/** The US's states in GADM (1 to 51: the 50 and DC, alphabetical). */
export const US_GADM = Array.from({ length: 51 }, (_, i) => `USA.${i + 1}_1`);
/** Which datasets the flowering records of a batch of taxa come from, with their record counts (for the citation). */
export const datasetsUrl = (keys) => `${API}/occurrence/search?${keys.map((k) => `taxonKey=${k}`).join('&')}&country=US&reproductiveCondition=flowering${lic}&limit=0&facet=datasetKey&facetLimit=1000`;
/** Taxa per dataset query (the URL stays short). */
export const DATASET_BATCH = 100;
/**
 * The taxon a match stands for: its accepted key, where GBIF's match is exact and the name is accepted or a
 * plain synonym of it (Aster novae-angliae → Symphyotrichum novae-angliae). Doubtful, misapplied or
 * pro-parte names, fuzzy or higher-rank matches: none.
 */
export function matchedTaxon(m) {
  if (!m || m.matchType !== 'EXACT' || m.rank !== 'SPECIES') return null;
  if (m.status === 'ACCEPTED') return { key: m.usageKey, name: m.species ?? m.canonicalName };
  if (m.status === 'SYNONYM' && m.acceptedUsageKey) return { key: m.acceptedUsageKey, name: m.species, synonym: m.canonicalName };
  return null;
}
