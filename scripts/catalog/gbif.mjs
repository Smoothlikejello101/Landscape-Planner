// GBIF (api.gbif.org): its names for the catalog's species (gbif-fetch.mjs), and its SQL downloads of US
// records by species, month and state or county (gbif-download.mjs; docs/bloom-months.md). Read by bloom.mjs
// and wild.mjs.
const API = 'https://api.gbif.org/v1';
/** Licences that allow commercial use with credit (a record's own licence; CC BY-NC records are left out). */
export const LICENSES = ['CC0_1_0', 'CC_BY_4_0'];
/**
 * The catalog's names GBIF's backbone knows by another (checked one by one, 2026-10-20: each the same plant):
 * spellings (gerardi, macrophyllum, Buddleja), and genera it splits out (Nabalus, Cenchrus; American pasque
 * flower as Pulsatilla patens, whose US records are all its American subspecies). Not Vaccinium virgatum or
 * Penstemon grandiflorus: GBIF sinks those into other species, so their records wouldn't be theirs alone.
 */
export const GBIF_NAME = {
  'Anemone patens': 'Pulsatilla patens',
  'Andropogon gerardii': 'Andropogon gerardi',
  'Buddleia davidii': 'Buddleja davidii',
  'Dasistoma macrophylla': 'Dasistoma macrophyllum',
  'Pennisetum alopecuroides': 'Cenchrus alopecuroides',
  'Prenanthes alba': 'Nabalus albus',
  'Prenanthes racemosa': 'Nabalus racemosus',
};
/** GBIF's backbone match for a binomial (by GBIF's name for it), species rank, strict (no fuzzy guess). */
export const matchUrl = (binomial) => `${API}/species/match?name=${encodeURIComponent(GBIF_NAME[binomial] ?? binomial)}&rank=SPECIES&strict=true&kingdom=Plantae`;
/** A GADM area's name and codes (its variant names include the postal code). */
export const gadmUrl = (gid) => `${API}/geocode/gadm/${gid}`;
/** A GADM area's subdivisions (a state's counties: ids, names and kind, "County", "Parish"…). */
export const gadmSubdivisionsUrl = (gid) => `${API}/geocode/gadm/${gid}/subdivisions`;
/** The US's states in GADM (1 to 51: the 50 and DC, alphabetical). */
export const US_GADM = Array.from({ length: 51 }, (_, i) => `USA.${i + 1}_1`);
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

// ---------- SQL downloads ----------
/**
 * A record's species in GBIF's backbone (the keys matchUrl gives). SQL downloads default to the Catalogue of
 * Life's keys since October 2026; the backbone's are kept in this struct.
 */
const SPECIES = 'occurrence.gbif_classification.specieskey';
const inList = (keys) => `${SPECIES} IN (${keys.map((k) => `'${Number(k)}'`).join(', ')})`;
const licensed = `license IN (${LICENSES.map((l) => `'${l}'`).join(', ')})`;
/** The downloads (counts only, never a record): their SQL for a list of backbone species keys. */
export const DOWNLOADS = {
  /** Records with any phenology note, by species, state and month (bloom and fruiting months). */
  bloom: (keys) => `SELECT ${SPECIES} AS specieskey, level1gid, "month", reproductivecondition, COUNT(*) AS n FROM occurrence `
    + `WHERE countrycode = 'US' AND ${licensed} AND reproductivecondition IS NOT NULL AND ${inList(keys)} `
    + `GROUP BY ${SPECIES}, level1gid, "month", reproductivecondition`,
  /** Records present, by species, county, kind of record and whether marked native, introduced or cultivated. */
  counties: (keys) => `SELECT ${SPECIES} AS specieskey, level1gid, level2gid, basisofrecord, establishmentmeans.concept AS establishment, `
    + `degreeofestablishment.concept AS degree, COUNT(*) AS n, MAX("year") AS latest FROM occurrence `
    + `WHERE countrycode = 'US' AND ${licensed} AND occurrencestatus = 'PRESENT' AND level2gid IS NOT NULL AND ${inList(keys)} `
    + `GROUP BY ${SPECIES}, level1gid, level2gid, basisofrecord, establishmentmeans.concept, degreeofestablishment.concept`,
};
/** A download's rows from its tab-separated file (header first). */
export function tsvRows(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.length);
  const head = (lines.shift() ?? '').split('\t');
  return lines.map((l) => { const v = l.split('\t'); return Object.fromEntries(head.map((h, i) => [h, v[i] ?? ''])); });
}

// ---------- What a phenology note says ----------
// Notes are as their publishers wrote them: iNaturalist's annotations ("Flowers", "Fruits or Seeds", "Flower
// Buds", "No Flowers or Fruits", joined with "|") and herbaria's codes ("fl", "fr", "fl-fr", "flr & frt").
const FLOWER = /^(fl|flo|flr|flrs|flw|flower|flowers|flowering|in flower|bloom|in bloom|blooming|anthesis)$/;
const FRUIT = /^(fr|fru|frt|fruit|fruits|fruiting|fruits or seeds|fruit forming|fruit-bearing|immature fruit|mature fruit|early fruiting|fruiting-developing|fruiting-ripe|seed|seeds|seed bearing)$/;
const BUD = /^(bud|buds|flower buds|fl buds|budding|flower budding)$/;
const seen = new Map();
/**
 * What a note says was seen: { flower, fruit, bud } (each true or absent). A note that doesn't say ("fertile",
 * "notdetermined", "reproductive"), says neither ("vegetative", "No Flowers or Fruits"), or says one or the
 * other ("flowering or fruiting") says nothing.
 */
export function phases(note) {
  const key = String(note ?? '');
  if (seen.has(key)) return seen.get(key);
  let t = key.toLowerCase().trim().replace(/^phenology:\s*/, '').replace(/[.\s]+$/, '').replace(/^(reproductive|fertile)\s*\/\s*/, '');
  t = t.replace(/\bflowerandfruit\b/, 'flower and fruit').replace(/\b(fl|flr)\.?-(fr|frt)\b/g, '$1,$2');
  const out = {};
  if (!/\bor\b/.test(t.replace(/fruits or seeds/g, ''))) {
    for (const raw of t.split(/\s*(?:\||,|;|&|\+|\/|\band\b)\s*/)) {
      const w = raw.replace(/\.$/, '').trim();
      if (FLOWER.test(w)) out.flower = true;
      else if (FRUIT.test(w)) out.fruit = true;
      else if (BUD.test(w)) out.bud = true;
    }
  }
  seen.set(key, out);
  return out;
}
