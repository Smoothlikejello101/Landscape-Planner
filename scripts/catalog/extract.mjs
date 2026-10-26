// Turning saved source pages into labeled facts (docs/catalog-sources.md).
import { hostNames } from './claims.mjs';
// Each reader keeps only the fields the audit reads, as short labels and
// values: never descriptions or other prose.

const decode = (s) => String(s)
  .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/\s+/g, ' ').trim();

// ---------- NC State Extension Gardener Plant Toolbox ----------

/** The NC State fields the audit reads (docs/catalog-sources.md, "Deciding each fact"). */
export const NCSU_FIELDS = [
  'Genus', 'Species', 'Family', 'Life Cycle', 'Plant Type', 'Habit/Form', 'Growth Rate', 'Maintenance',
  'Light', 'Soil Texture', 'Soil pH', 'Soil Drainage', 'USDA Plant Hardiness Zone', 'Height', 'Width',
  'Flower Color', 'Flower Bloom Time', 'Deciduous Leaf Fall Color', 'Woody Plant Leaf Characteristics',
  'Attracts', 'Resistance To Challenges', 'Design Feature', 'Landscape Location', 'Landscape Theme',
  'Poison Severity', 'Causes Contact Dermatitis', 'Poison Part', 'Stem Surface', 'Problems', 'Leaf Color', 'Leaf Type', 'Appendage',
];
/** NC State's free-text fields the audit reads one fact out of, never keeping the text. */
const NCSU_TEXT = ['Wildlife Value'];

/** label → values, from an NC State plant page (its dt/dd lists). */
export function ncsuFields(html) {
  const out = {};
  const re = /<dt[^>]*>([\s\S]*?)<\/dt>([\s\S]*?)(?=<dt|<\/dl>)/gi;
  let m;
  while ((m = re.exec(html))) {
    const label = decode(m[1]).replace(/:$/, '');
    if (!NCSU_FIELDS.includes(label) && !NCSU_TEXT.includes(label) && label !== 'Dimensions') continue;
    const values = [...m[2].matchAll(/<dd[^>]*>([\s\S]*?)<\/dd>/gi)].map((d) => decode(d[1])).filter(Boolean);
    if (!values.length) continue;
    if (label === 'Dimensions') {
      // ("Height: 20 ft. 0 in. - 30 ft. 0 in.", "Width: …")
      for (const v of values) { const d = /^(Height|Width):\s*(.+)$/.exec(v); if (d) out[d[1]] = [d[2]]; }
      continue;
    }
    if (NCSU_TEXT.includes(label)) {
      // Wildlife Value: only the caterpillar hosts it names, as names (never the text).
      const names = hostNames(values.join(' '));
      if (names.length) out['Larval hosts'] = names;
      continue;
    }
    // (Light values carry NC State's definitions in parentheses: only the name is kept.)
    const kept = label === 'Light' ? values.map((v) => v.replace(/\s*\(.*\)\s*$/, '')) : values;
    out[label] = [...new Set([...(out[label] ?? []), ...kept])];
  }
  return out;
}

/** "20 ft. 0 in. - 30 ft. 0 in." → { min: 20, max: 30 } (feet). */
export function feetRange(text) {
  const parts = String(text).split(/\s+-\s+/).map((p) => {
    const ft = /(\d+(?:\.\d+)?)\s*ft/.exec(p), inch = /(\d+(?:\.\d+)?)\s*in/.exec(p);
    if (!ft && !inch) return null;
    return Math.round(((ft ? Number(ft[1]) : 0) + (inch ? Number(inch[1]) / 12 : 0)) * 100) / 100;
  });
  if (parts.some((p) => p == null) || !parts.length) return null;
  // (Low to high, whichever way the page writes it: NC State's "3 ft. 0 in. - 1 ft. 6 in." is 1.5 to 3 ft.)
  return { min: Math.min(...parts), max: Math.max(...parts) };
}

// ---------- USDA PLANTS ----------

/** The facts the audit reads from a USDA profile and its characteristics. */
export function usdaFields(profile, characteristics) {
  const out = {};
  if (profile) {
    out.Symbol = [profile.Symbol];
    out['Scientific name'] = [decode(profile.ScientificName ?? '')];
    if (profile.Durations?.length) out.Duration = profile.Durations;
    if (profile.GrowthHabits?.length) out['Growth habit'] = profile.GrowthHabits;
    for (const n of profile.NativeStatuses ?? []) (out['Native status'] ??= []).push(`${n.Region}: ${n.Type}`);
    // (Dicot or Monocot: a flowering plant; Gymnosperm, Fern, Lycopod, Horsetail and the like have none: claims.mjs flowerless.)
    if (profile.Group) out.Group = [profile.Group];
    if (profile.HasInvasiveStatuses) out.Invasive = ['listed'];
    if (profile.HasNoxiousStatuses) out.Noxious = ['listed'];
  }
  const wanted = new Set(['Bloom Period', 'Flower Color', 'Height, Mature (feet)', 'Shade Tolerance', 'Drought Tolerance',
    'Moisture Use', 'Temperature, Minimum (°F)', 'Toxicity', 'Fall Conspicuous', 'Adapted to Fine Textured Soils',
    'Anaerobic Tolerance', 'Growth Rate', 'Palatable Human', 'pH, Minimum', 'pH, Maximum', 'Leaf Retention', 'Foliage Color',
    'Flower Conspicuous']);
  // (The species' own rows only: a row with a CultivarName is a named release's, 'Alma' blue grama's, not the
  // species'. A synonym's row is the same plant's.)
  for (const c of characteristics ?? []) {
    if (c.CultivarName != null && String(c.CultivarName).trim()) continue;
    const name = c.PlantCharacteristicName;
    if (wanted.has(name) && c.PlantCharacteristicValue != null && String(c.PlantCharacteristicValue).trim()) {
      (out[name] ??= []).push(String(c.PlantCharacteristicValue).trim());
    }
  }
  return out;
}

// ---------- Minnesota Wildflowers ----------

/** label → value from a Minnesota Wildflowers page (its th/td summary table), plus the botanical name. */
export function mnwildFields(html) {
  const out = {};
  const title = /<title>\s*([^<(]+?)\s*\(/i.exec(html);
  if (title) out['Scientific name'] = [decode(title[1])];
  const keep = new Set(['Life cycle', 'Origin', 'Habitat', 'Bloom season', 'Plant height', 'Wetland Indicator Status']);
  for (const m of html.matchAll(/<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    const label = decode(m[1]).replace(/:$/, '');
    if (!keep.has(label)) continue;
    // (Habitat: only its light part, before the first ";", is a fact we read; the rest is description.)
    if (label === 'Habitat') out['Habitat light'] = [decode(m[2]).split(';')[0].trim()];
    else out[label] = [decode(m[2])];
  }
  return out;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** "July - September" → { start: 7, end: 9 }; null if it isn't a month range. */
export function monthRange(text) {
  const ms = String(text).toLowerCase().match(/[a-z]+/g)?.map((w) => MONTHS.indexOf(w) + 1).filter((n) => n > 0) ?? [];
  return ms.length ? { start: ms[0], end: ms[ms.length - 1] } : null;
}

// ---------- Atlas of the Vascular Plants of Arkansas ----------

const CODE = /^[1-4](\s*,\s*[1-4])*$/;
/** A layout line's pieces: runs of text with at most two spaces inside, and where each starts. */
const segments = (line) => [...line.matchAll(/\S+(?: {1,2}\S+)*/g)].map((m) => ({ text: m[0], at: m.index }));
/** Lower case, accents dropped (Buchloë → buchloe), single spaces. */
const fold = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const FAMILY = /^[A-Z]+ACEAE$|^[A-Z]{4,}$/;
const INFRA = /^(var\.|subsp\.|ssp\.|f\.)\s/;
/**
 * A combined map's taxa in the atlas's Appendix I ("Species with Combined Infraspecific Taxa in Maps"), which
 * starts at line `from`: [{ name, codes }] for each subspecies or variety listed under the species, its status
 * codes at the line's end; null if the appendix doesn't list the species. Page breaks (page numbers, running
 * heads, the edition line) inside an entry are skipped; a common name carried onto the next line isn't a taxon.
 */
export function appendixTaxa(lines, from, binomial) {
  const want = fold(binomial);
  const stop = lines.findIndex((l, i) => i > from && /^\s*APPENDIX II\s*$/.test(l));
  const end = stop < 0 ? lines.length : stop;
  const clean = (l) => l.replace(/\f/g, '');
  const pageFurniture = (l) => /APPENDIX\s+I+\b/.test(l) || /^\s*\d{1,4}\s*$/.test(l) || /Free download edition/i.test(l);
  // (A species or family heading pdftotext indented a little: the entry has ended. A common name carried onto
  // its own line sits far right, in the common-name column.)
  const heading = (seg) => seg.at <= 4 && (FAMILY.test(seg.text) || (/^[A-Z][a-z]+ (?:× ?)?[a-z-]+\b/.test(seg.text) && !INFRA.test(seg.text)));
  for (let i = from + 1; i < end; i++) {
    const l = clean(lines[i]);
    if (!l.trim() || /^\s/.test(l)) continue;
    const name = fold(segments(l)[0]?.text ?? '');
    if (!(name === want || name.startsWith(want + ' '))) continue;
    const taxa = [];
    for (let j = i + 1; j < end; j++) {
      const t = clean(lines[j]);
      if (!t.trim() || pageFurniture(t)) continue;
      if (!/^\s/.test(t)) break; // (the next species, family or group)
      const segs = segments(t);
      if (heading(segs[0])) break;
      const last = segs[segs.length - 1];
      const codes = segs.length > 1 && CODE.test(last.text) ? last.text.split(/\s*,\s*/).map(Number) : [];
      if (INFRA.test(segs[0].text)) taxa.push({ name: segs[0].text, codes });
      else if (codes.length && taxa.length) taxa[taxa.length - 1].codes.push(...codes); // (its common name ran on)
    }
    return taxa.length ? taxa : null;
  }
  return null;
}
/**
 * Arkansas status for a binomial, from the atlas's text (pdftotext -layout).
 * Only the map pages count (everything before "APPENDIX I": the appendices
 * list taxa reported without specimens, or excluded). Each map's name sits
 * under its family name; its status codes (1 introduced, 2 endemic,
 * 3 non-native invasive, 4 special concern) sit on the line above the row's
 * family names, to the right of their column. A species mapped only as
 * varieties or subspecies gets the codes they all share (the note names the
 * varieties). A combined map's status is only in Appendix I, and is read
 * from there (appendixTaxa) by the same rule. Returns null if the map pages don't list it, else
 * { name, codes, rows: [{ name, infra, codes, combined }], infraOnly?, combined?, appendix?, uncertain? }.
 */
export function arkatlasStatus(text, binomial) {
  const lines = String(text).split(/\r?\n/);
  const endAt = lines.findIndex((l) => /^\s*APPENDIX I\s*$/.test(l));
  const end = endAt < 0 ? lines.length : endAt;
  const want = fold(binomial);
  const prevLine = (i) => { let j = i - 1; while (j >= 0 && !lines[j].trim()) j--; return j; };
  const nextLine = (i) => { let j = i + 1; while (j < end && !lines[j].trim()) j++; return j; };
  const rows = [];
  for (let i = 1; i < end; i++) {
    const segs = segments(lines[i]);
    for (const hit of segs) {
      const name = fold(hit.text);
      if (!(name === want || name.startsWith(want + ' '))) continue;
      const j = prevLine(i);
      const fam = j >= 0 ? segments(lines[j]) : [];
      if (!fam.length || !fam.every((f) => FAMILY.test(f.text))) continue; // (prose, an index, a table)
      const starts = fam.map((f) => f.at).sort((a, b) => a - b);
      const col = starts.reduce((best, a) => (Math.abs(a - hit.at) < Math.abs(best - hit.at) ? a : best), starts[0]);
      // A variety or subspecies is named on the line below, in the same column (or on the same line).
      let infra = /\b(var\.|subsp\.|ssp\.) /.test(hit.text) ? hit.text.replace(/^.*?\b((var\.|subsp\.|ssp\.) .*)$/, '$1') : '';
      const n = nextLine(i);
      if (!infra && n < end) {
        const below = segments(lines[n]).find((sg) => INFRA.test(sg.text) && Math.abs(sg.at - hit.at) < 20);
        if (below) infra = below.text;
      }
      const k = prevLine(j);
      const codeSegs = k >= 0 ? segments(lines[k]) : [];
      const codes = [];
      if (codeSegs.length && codeSegs.every((c) => CODE.test(c.text))) {
        for (const c of codeSegs) {
          const owner = starts.filter((a) => a <= c.at).pop();
          if (owner === col) codes.push(...c.text.split(/\s*,\s*/).map(Number));
        }
      }
      // A combined map says "See Appendix I for infraspecific taxa and species status": its status is only there.
      let combined = false;
      for (let m = i + 1; m < Math.min(end, i + 6); m++) {
        for (const sg of segments(lines[m])) {
          if (!/See Appendix I\b/.test(sg.text)) continue;
          const owner = starts.reduce((best, a) => (Math.abs(a - sg.at) < Math.abs(best - sg.at) ? a : best), starts[0]);
          if (owner === col) combined = true;
        }
      }
      rows.push({ name: hit.text, infra, codes, combined });
    }
  }
  if (!rows.length) return null;
  // A combined map: its taxa and their codes are in Appendix I, read by the same rule as a species mapped only as
  // varieties (introduced-or-not must agree; the codes they all share).
  if (rows.some((r) => r.combined)) {
    const taxa = endAt < 0 ? null : appendixTaxa(lines, endAt, binomial);
    if (!taxa) return { name: binomial, codes: [], rows, uncertain: true, why: 'combined map: not found in Appendix I' };
    if (new Set(taxa.map((t) => t.codes.includes(1))).size > 1) return { name: binomial, codes: [], rows, appendix: taxa, uncertain: true, why: "combined map: its taxa's status differs (Appendix I)" };
    return { name: binomial, codes: taxa[0].codes.filter((c) => taxa.every((t) => t.codes.includes(c))), rows, appendix: taxa, combined: true };
  }
  const species = rows.filter((r) => !r.infra);
  const sameCodes = (rs) => new Set(rs.map((r) => r.codes.join(','))).size === 1;
  if (species.length) {
    if (!sameCodes(species)) return { name: binomial, codes: [], rows, uncertain: true };
    return { name: species[0].name, codes: species[0].codes, rows };
  }
  // Mapped only as varieties: the codes every variety shares (introduced-or-not must agree).
  const introduced = new Set(rows.map((r) => r.codes.includes(1)));
  if (introduced.size > 1) return { name: binomial, codes: [], rows, uncertain: true };
  const shared = rows[0].codes.filter((c) => rows.every((r) => r.codes.includes(c)));
  return { name: binomial, codes: shared, rows, infraOnly: true };
}
