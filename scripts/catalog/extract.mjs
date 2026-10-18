// Turning saved source pages into labeled facts (docs/catalog-sources.md).
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
  'Poison Severity', 'Causes Contact Dermatitis', 'Poison Part', 'Country Or Region Of Origin', 'Stem Surface',
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
      // Wildlife Value: only "N species of … larval host", as a count.
      const host = /(\d+)\s+species\s+of\s+(Lepidoptera|butterfl\w*|moths?)[^.]*larval host/i.exec(values.join(' '));
      if (host) out['Larval host for'] = [`${host[1]} Lepidoptera species`];
      continue;
    }
    out[label] = [...new Set([...(out[label] ?? []), ...values])];
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
  return { min: parts[0], max: parts[parts.length - 1] };
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
    if (profile.HasInvasiveStatuses) out.Invasive = ['listed'];
    if (profile.HasNoxiousStatuses) out.Noxious = ['listed'];
  }
  const wanted = new Set(['Bloom Period', 'Flower Color', 'Height, Mature (feet)', 'Shade Tolerance', 'Drought Tolerance',
    'Moisture Use', 'Temperature, Minimum (°F)', 'Toxicity', 'Fall Conspicuous', 'Adapted to Fine Textured Soils',
    'Anaerobic Tolerance', 'Growth Rate', 'Palatable Human', 'pH, Minimum', 'pH, Maximum', 'Leaf Retention']);
  for (const c of characteristics ?? []) {
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
    if (keep.has(label)) out[label] = [decode(m[2])];
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
/**
 * Arkansas status for a binomial, from the atlas's text (pdftotext -layout):
 * each map's name, under its family; its status codes (1 introduced,
 * 2 endemic, 3 non-native invasive, 4 special concern) sit on the line above
 * the row's family names, to the right of their column. Returns null if the
 * atlas doesn't list it, else { codes: [...], name }.
 */
export function arkatlasStatus(text, binomial) {
  const lines = String(text).split(/\r?\n/);
  const want = binomial.toLowerCase().replace(/\s+/g, ' ');
  for (let i = 1; i < lines.length; i++) {
    const segs = segments(lines[i]);
    const hit = segs.find((s) => s.text.toLowerCase().replace(/\s+/g, ' ').startsWith(want + ' '));
    if (!hit) continue;
    // The family line is just above; the line above that, if it's codes, holds this row's codes.
    let j = i - 1;
    while (j >= 0 && !lines[j].trim()) j--;
    if (j < 0 || !/^[A-Z]+ACEAE$|^[A-Z]{4,}$/.test(segments(lines[j])[0]?.text ?? '')) return { name: hit.text, codes: [], uncertain: true };
    let k = j - 1;
    while (k >= 0 && !lines[k].trim()) k--;
    const codeSegs = k >= 0 ? segments(lines[k]) : [];
    const codes = [];
    if (codeSegs.length && codeSegs.every((s) => CODE.test(s.text))) {
      const starts = segs.filter((s) => /^[A-Z][a-z]+ /.test(s.text)).map((s) => s.at).sort((a, b) => a - b);
      for (const c of codeSegs) {
        const col = starts.filter((a) => a <= c.at).pop();
        if (col === hit.at) codes.push(...c.text.split(/\s*,\s*/).map(Number));
      }
    }
    return { name: hit.text, codes };
  }
  return null;
}
