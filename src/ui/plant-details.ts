// A plant's full details, shown when its row in the picker is opened: the
// facts the catalog has, where it came from and how sure it is, and what
// other sources say where they differ from the value shown.
import { el } from '../dom';
import type { Plant } from '../plants';
import { MONTH_NAMES, PLANT_META, formsOf, oldDogWarning, tenderWoody, zoneNote } from '../plants';
import { isMine } from '../my-plants';
import { rootSpread, rootText, seedText } from '../spread';
import { zoneRange } from '../climate';
import type { Provenance } from '../catalog';
import { escapeHere, escapeText, localBloom, nativeHere, nativeText, regulatedHere, wildHere, wildText } from '../wild';

const SURE: Record<string, string> = {
  agree: 'confirmed', confirmed: 'confirmed', single: 'one source', likely: 'nurseries agree', reported: 'one nursery', disputed: 'sources disagree',
};
const sourceName = (id: string) => PLANT_META?.sources?.[id]?.title ?? id;
/** A source in a few words, for a label: "NC State", "USDA", else its title (a website's domain). */
const SHORT: Record<string, string> = { ncsu: 'NC State', usda: 'USDA', arkatlas: 'the Arkansas atlas', mnwild: 'Minnesota Wildflowers' };
/**
 * Who gives the other value, and it, in words: "Nurseries report: Full sun (a.com, b.com)" where only nurseries
 * do; else by name, "NC State lists: 4b to 9b", "NC State and ufl.edu list: …".
 */
export function otherValue(src: string[], value: string): string {
  if (src.every((s) => PLANT_META?.sources?.[s]?.trust === 'nursery')) return `Nurseries report: ${value} (${src.map(sourceName).join(', ')})`;
  const names = src.map((s) => SHORT[s] ?? sourceName(s));
  return `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} list` : `${names[0]} lists`}: ${value}`;
}
const ft = (r?: { min?: number; max?: number; med?: number }) => {
  if (!r) return '';
  const f = (x: number) => (x >= 1 ? `${+x.toFixed(1)} ft` : `${Math.round(x * 12)} in`);
  return r.min != null && r.max != null && r.min !== r.max ? `${f(r.min).replace(' ft', '')}–${f(r.max)}` : r.med != null ? f(r.med) : r.min != null ? f(r.min) : '';
};
const SUN_WORDS: Record<string, string> = { Full: 'full sun', Part: 'part shade', Shade: 'shade' };
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const sun = (most?: unknown, least?: unknown) => (!most ? '' : cap(most === least || !least ? SUN_WORDS[most as string] ?? String(most) : `${SUN_WORDS[most as string] ?? most} to ${SUN_WORDS[least as string] ?? least}`));
const yes = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : '');
const bloom = (b?: { start?: number; end?: number; color?: string }) => (b?.start ? `${MONTH_NAMES[b.start]}${b.end && b.end !== b.start ? `–${MONTH_NAMES[b.end]}` : ''}${b.color ? `, ${b.color}` : ''}` : b?.color ?? '');
/**
 * Poisonous to people, in its source's words: "Leaves and stems, medium severity; can irritate skin"; listed with
 * nothing more said: "Yes; no part or severity given".
 */
export function poisonText(x?: Plant['poison']): string {
  if (!x) return '';
  const parts = x.parts?.length ? (x.parts.length > 1 ? `${x.parts.slice(0, -1).join(', ')} and ${x.parts[x.parts.length - 1]}` : x.parts[0]) : '';
  const head = [parts && cap(parts), x.severity && `${parts ? x.severity : cap(x.severity)} severity`].filter(Boolean).join(', ');
  const skin = x.skin ? (head ? 'can irritate skin' : 'Can irritate skin') : '';
  return [head, skin].filter(Boolean).join('; ') || 'Yes; no part or severity given';
}
/**
 * The row's value for any plant: what its source lists; "None listed" where NC State's page was read and says nothing
 * of poison (a weak no: not "safe"); or, where no source we read rates it for people, "Not known", so a missing
 * warning isn't taken for a safe plant.
 */
export function poisonRow(p: Plant): string {
  return p.poison ? poisonText(p.poison) : p.prov?.poison?.unknown ? 'None listed' : 'Not known: no source we read rates it for people';
}
/** "Green, silver"; "Variegated". */
const leafText = (l?: string[]) => (l?.length ? cap(l.join(', ')) : '');
/** Forms whose stems die back in winter, where "deciduous" means that, not bare branches. */
const HERB_FORMS = new Set(['Perennial', 'Grass/Sedge', 'Fern', 'Bulb', 'Aquatic/Emergent', 'Annual']);
/**
 * Its leaves in winter, in plain words: evergreen (with needles, said; a tender shrub's only where winters are
 * mild, `tenderWoody`); semi-evergreen; deciduous, which for an herb is dying back (a grass goes dormant, often
 * standing), and for a plant listed as both woody and herb (or a vine and a perennial) either. An annual's
 * winter isn't asked (it lives one season).
 */
export function winterText(p: Plant): string {
  const forms = formsOf(p);
  if (!p.foliage || (forms.length && forms.every((f) => f === 'Annual'))) return '';
  if (p.foliage === 'evergreen') return p.needles ? 'Evergreen, with needles' : tenderWoody(p) ? 'Evergreen where winters are mild; may die back in a cold one' : 'Evergreen: keeps its leaves';
  if (p.foliage === 'semi-evergreen') return 'Semi-evergreen: keeps some of its leaves, by the winter';
  const herb = forms.filter((f) => HERB_FORMS.has(f));
  if (forms.length && herb.length === forms.length) return forms.includes('Grass/Sedge') ? 'Goes dormant in winter' : 'Dies back in winter';
  return herb.length ? 'Deciduous: loses its leaves, or dies back to the ground' : 'Deciduous: loses its leaves';
}
/** "Yes: gold, red"; "No"; or, with colors and no yes or no, the colors. */
export const fallText = (p: Plant): string => {
  const colors = p.fall_colors?.length ? p.fall_colors.join(', ') : '';
  if (p.fall_color === false) return 'No';
  if (p.fall_color === true) return colors ? `Yes: ${colors}` : 'Yes';
  return colors ? cap(colors) : '';
};
const tox = (t?: Plant['tox']) => (!t ? '' : [t.dog && `dogs: ${t.dog}`, t.cat && `cats: ${t.cat}`, t.horse && `horses: ${t.horse}`, t.people && `people: ${t.people}`].filter(Boolean).join('; '));

/** Each row: label, the catalog's value, the facts it rests on, and how to write the other value where sources differ. */
type Row = [label: string, value: string, facts: string[], reported?: (r: Record<string, unknown>) => string];
function rows(p: Plant): Row[] {
  return [
    ['Form', formsOf(p).join(', '), ['form'], (r) => [r.form].flat().filter(Boolean).join(', ')],
    ['Height', ft(p.height), ['height'], (r) => ft(r.height as Plant['height'])],
    ['Spread', ft(p.width), ['width'], (r) => ft(r.width as Plant['width'])],
    ['Hardiness', (zoneRange(p) ?? '') + (zoneRange(p) ? zoneNote(p) : ''), ['zone_min', 'zone_max'],
      (r) => zoneRange({ zone_min: (r.zone_min ?? p.zone_min) as number, zone_max: (r.zone_max ?? p.zone_max) as number }) ?? ''],
    ['Sun', sun(p.sun_most, p.sun_least), ['sun_most', 'sun_least'], (r) => sun(r.sun_most ?? p.sun_most, r.sun_least ?? p.sun_least)],
    ['Water', p.water ?? '', ['water'], (r) => String(r.water ?? '')],
    ['Bloom', bloom(p.bloom), ['bloom'], (r) => bloom(r.bloom as Plant['bloom'])],
    ['Native', p.native ?? '', ['native']],
    ['Nectar for pollinators', p.nectar ?? '', ['nectar']],
    ['For birds', p.bird ?? '', ['bird']],
    ['Caterpillar host for', p.host ?? '', ['host']],
    ['Deer', p.deer ?? '', ['deer'], (r) => String(r.deer ?? '')],
    // (Drawn by toxRow: never left out for a catalog plant, since no line about pets reads as safe.)
    ['Toxicity', '', ['tox', 'dog']],
    // (Beside Edible: a plant can be both, its fruit eaten and its seeds poisonous.)
    ['Poisonous to people', poisonRow(p), ['poison']],
    ['Edible', p.edible === true && p.poison ? 'Yes, though it\'s also listed as poisonous to people (above)' : yes(p.edible), ['edible']],
    ['Thorns', yes(p.thorns), ['thorns']],
    // (As its source lists them: NC State's take in the seasons and the undersides.)
    ['Leaf colors', leafText(p.leaf_color), ['leaf_color']],
    ['In winter', winterText(p), ['foliage']],
    ['Fall color', fallText(p), ['fall_color', 'fall_colors']],
    ['Growth rate', p.growth_rate ? cap(p.growth_rate) : '', ['growth_rate']],
    ['Winter interest', yes(p.winter_interest), ['winter_interest']],
    ['Takes clay', yes(p.clay_ok), ['clay_ok']],
    ['Takes wet feet', yes(p.wet_feet), ['wet_feet']],
    ['Takes dry shade', yes(p.dry_shade), ['dry_shade']],
    // (By seed, and underground or by runners: two facts, one question, "will it spread?"; drawn by spreadRow.)
    ['How it spreads', '', ['self_seed', 'habit']],
    ['Maintenance', p.maintenance ?? '', ['maintenance']],
    ['Taproot (hard to move)', yes(p.taproot), ['taproot']],
    ['Humidity', p.humidity === 'humid' ? 'Likes humid summers' : p.humidity === 'dry' ? 'Likes dry air' : p.humidity === 'either' ? 'Either' : '', ['humidity']],
    // (A habit that speaks to spreading is under "How it spreads"; one that doesn't, a vine's twining, stays here.)
    ['Habit', rootSpread(p.habit) && rootSpread(p.habit) !== 'shape' ? '' : p.habit ?? '', ['habit']],
    ['Trunk', p.trunk ? `${p.trunk} in across` : '', ['trunk']],
    ['Nativar', p.nativar ? 'A cultivar of a native species' : '', ['nativar']],
  ];
}
/** How sure, strongest first: the weaker of two halves of a range is how sure the range is. */
const STRENGTH = ['agree', 'confirmed', 'single', 'likely', 'reported', 'disputed'];
/** The two ends of a range, in words, for a range whose ends come from different sources. */
const ENDS: Record<string, [string, string]> = { zone_min: ['cold limit', 'warm limit'], sun_most: ['most sun', 'least sun'] };
/**
 * Where a range came from (zones, sun: two facts): the sources that gave both ends, as sure as the less sure end.
 * Sources can decide each end apart (nurseries outnumbering NC State on one end only), so a source behind one
 * end isn't named for the range; where no source gave both, each end says its own.
 */
function rangeLine(facts: string[], prov: Record<string, Provenance> | undefined): string {
  const [a, b] = facts.map((f) => prov?.[f]);
  if (!a || !b || a.unknown || b.unknown) return sourceLine(a && !a.unknown ? a : b);
  const weaker = [a.check, b.check].sort((x, y) => STRENGTH.indexOf(x ?? 'disputed') - STRENGTH.indexOf(y ?? 'disputed'))[1];
  const both = a.src.filter((s) => b.src.includes(s));
  // (Fewer sources behind the whole range than behind either end: how sure, by those sources.)
  const ref = both.some((s) => PLANT_META?.sources?.[s]?.trust === 'reference');
  const fewer = both.length < a.src.length || both.length < b.src.length;
  const check = !fewer ? weaker : ref ? (both.length > 1 ? 'confirmed' : 'single') : both.length > 1 ? 'likely' : 'reported';
  if (both.length) return sourceLine({ ...a, src: both, check, inherited: a.inherited || b.inherited });
  const [ea, eb] = ENDS[facts[0]] ?? [facts[0], facts[1]];
  const names = (pv: Provenance) => (pv.src.length === 1 && PLANT_META?.sources?.[pv.src[0]]?.trust === 'unverified' ? 'older list, unverified' : pv.src.map(sourceName).join(', '));
  const how = (pv: Provenance) => (pv.check && SURE[pv.check] ? ` (${SURE[pv.check]})` : '');
  return [`${names(a)} for the ${ea}${how(a)}; ${names(b)} for the ${eb}${how(b)}`, a.inherited || b.inherited ? 'from its species' : ''].filter(Boolean).join(' · ');
}
/**
 * "How it spreads": by seed, and underground or by runners, each with its own source (they come from separate
 * sources). Self-sowing looked up and not found is said so; a part not looked up is left out. Null: nothing to say.
 */
function spreadRow(p: Plant): HTMLElement | null {
  const seed = seedText(p) || (p.prov?.self_seed?.unknown ? 'Self-sowing not known: none of the sources say' : '');
  const parts: [string, string][] = [];
  if (seed) parts.push([seed, sourceLine(p.prov?.self_seed)]);
  const roots = rootText(p);
  if (roots) parts.push([roots, sourceLine(p.prov?.habit)]);
  if (!parts.length) return null;
  const dd = el('dd', { 'data-testid': 'spreads' });
  // (One source line under both where they share it: "older list, unverified" once, not twice.)
  const same = parts.length === 2 && parts[0][1] === parts[1][1];
  parts.forEach(([text, src], i) => {
    dd.appendChild(el('span', { className: 'details-part' }, text));
    if (src && !(same && i === 0)) dd.appendChild(el('span', { className: 'details-src' }, src));
  });
  return dd;
}
/**
 * Toxicity to animals, never left blank on a catalog plant (no line reads as "safe"): its own rating; else the
 * older list's warning for another record of its species; else not yet rated. Null for a plant of mine.
 */
export function toxRow(p: Plant): { value: string; line: string } | null {
  const warnsHere = p.tox?.dog === 'toxic' || !!oldDogWarning(p);
  if (p.dogVia && !warnsHere) {
    return { value: `dogs: ${p.dogVia.dog}`, line: `older list, unverified · given for ${p.dogVia.common}, the same species` + (p.dog === 'Safe' ? '; the older list calls this one safe' : '') };
  }
  const own = tox(p.tox) || (p.dog && p.dog !== 'Unverified' ? `dogs: ${p.dog}` : '');
  if (own) return { value: own, line: sourceLine(p.prov?.tox ?? p.prov?.dog) };
  if (isMine(p)) return null;
  return { value: 'dogs: not yet rated', line: 'No source we can use rates plants for pets yet' };
}
/** Where a value came from, in a few words: "NC State, USDA · confirmed", "older list, unverified". */
function sourceLine(prov: Provenance | undefined): string {
  if (!prov) return '';
  if (prov.src.length === 1 && PLANT_META?.sources?.[prov.src[0]]?.trust === 'unverified') return 'older list, unverified';
  const who = prov.src.map(sourceName).join(', ');
  const how = prov.check ? SURE[prov.check] ?? '' : '';
  return [who, how, prov.inherited ? 'from its species' : '', prov.at ? `for ${prov.at}` : ''].filter(Boolean).join(' · ');
}

/**
 * The opened row. `flagged`: what this plant matches the filters on only by
 * what other sources say (said first, in words).
 */
export function plantDetails(p: Plant, flagged: string[] | undefined): HTMLElement {
  const box = el('div', { className: 'plant-details', 'data-testid': 'plant-details' });
  if (flagged?.length) {
    box.appendChild(el('div', { className: 'details-flag', 'data-testid': 'reported-flag' },
      `Shown because of what other sources say for its ${flagged.join(' and ')}; the value shown first says otherwise (below).`));
  }
  if (p.botanical) box.appendChild(el('div', { className: 'details-bot' }, p.botanical));
  const dl = el('dl', { className: 'details-list' });
  for (const [label, value, facts, reportedText] of rows(p)) {
    if (label === 'How it spreads') { const dd = spreadRow(p); if (dd) { dl.appendChild(el('dt', {}, label)); dl.appendChild(dd); } continue; }
    if (label === 'Toxicity') {
      const t = toxRow(p);
      if (t) { dl.appendChild(el('dt', {}, label)); dl.appendChild(el('dd', { 'data-testid': 'tox-row' }, t.value, ...(t.line ? [el('span', { className: 'details-src' }, t.line)] : []))); }
      continue;
    }
    const prov = facts.map((f) => p.prov?.[f]).find(Boolean);
    const reported = p.reported && facts.some((f) => f in p.reported!) && reportedText ? reportedText(p.reported) : '';
    // Bloom where the garden is, from flowering records there: its months, and how many records they rest on.
    const local = label === 'Bloom' ? localBloom(p) : null;
    if (!value && !reported && !local) {
      // Looked up, and none of the sources say: shown as such, so it isn't mistaken for "not looked at".
      if (facts.some((f) => p.prov?.[f]?.unknown)) { dl.appendChild(el('dt', {}, label)); dl.appendChild(el('dd', { className: 'details-unknown' }, 'Not known: none of the sources say')); }
      continue;
    }
    const shown = local ? `${MONTH_NAMES[local.start]}${local.end !== local.start ? `–${MONTH_NAMES[local.end]}` : ''}, peak ${MONTH_NAMES[local.peak]}${p.bloom?.color ? `; ${p.bloom.color}` : ''}` : value;
    const dd = el('dd', { ...(local ? { 'data-testid': 'local-bloom' } : {}) }, shown || '—');
    const line = local
      ? `${local.species ? 'its species: ' : ''}${local.n} flowering records in ${local.stateName}${local.area === 'region' ? ' and neighboring states' : ''} · ${local.source}`
        + (p.bloom?.color ? ` (color: ${sourceLine(prov)})` : '')
      : ENDS[facts[0]] ? rangeLine(facts, p.prov) : sourceLine(prov); // (a range: hardiness, sun; not toxicity's two facts)
    if (line) dd.appendChild(el('span', { className: 'details-src' }, line));
    // Hardiness shown from nurseries only: say so, since a grower's range can stop where it sells, not where the
    // plant grows. (Said of the value shown: a reference giving another range is beside it, by name.)
    const nurseryOnly = (pv?: Provenance) => !!pv && !pv.unknown && pv.src.length > 0 && pv.src.every((s) => PLANT_META?.sources?.[s]?.trust === 'nursery');
    if (label === 'Hardiness') {
      const [cold, warm] = [nurseryOnly(p.prov?.zone_min), nurseryOnly(p.prov?.zone_max)];
      const which = cold && warm ? 'This range is from nurseries only, and a grower\'s range can stop where it sells.'
        : cold ? 'Its cold limit is from nurseries only.'
        : warm ? 'Its warm limit is from nurseries only.' : '';
      if (which) dd.appendChild(el('span', { className: 'details-alt', 'data-testid': 'nursery-only' }, which));
    }
    if (reported && reported !== value) {
      const alt = facts.map((f) => p.prov?.[f]?.alt).find(Boolean);
      dd.appendChild(el('span', { className: 'details-alt' }, alt ? otherValue(alt.src, reported) : `Also reported: ${reported}`));
    }
    dl.appendChild(el('dt', {}, label));
    dl.appendChild(dd);
  }
  // What the law says of it where the garden is (a state's list, the federal one), each with its rule: first,
  // above the catalog's facts, where it can't be missed.
  const localRows = document.createDocumentFragment();
  const notesShown = new Set<string>();
  for (const rule of regulatedHere(p)) {
    const dd = el('dd', { 'data-testid': 'regulated-here', className: `details-law${rule.tier === 'listed' ? ' listed' : ''}` }, rule.says);
    // (Native here and covered anyway: why, in plain words, under the rule's own.)
    if (rule.native) dd.appendChild(el('span', { className: 'details-law-native', 'data-testid': 'law-native' }, rule.native));
    const src = el('span', { className: 'details-src' });
    src.appendChild(el('a', { href: rule.url, target: '_blank', rel: 'noopener' }, rule.title));
    src.appendChild(document.createTextNode(`; ${rule.edition}; read ${rule.read}`));
    dd.appendChild(src);
    // (And, after the rule and its source, a documented fact about the plants it names, to help a gardener see why a
    // list might include them; with its own source. Once a plant: the same note from two rules isn't said twice.)
    if (rule.background && !notesShown.has(rule.background.note)) {
      notesShown.add(rule.background.note);
      const bg = el('span', { className: 'details-law-native details-law-bg', 'data-testid': 'law-background' }, `${rule.background.note} (`);
      bg.appendChild(el('a', { href: rule.background.url, target: '_blank', rel: 'noopener', className: 'details-src-inline' }, rule.background.title));
      bg.appendChild(document.createTextNode(')'));
      dd.appendChild(bg);
    }
    localRows.appendChild(el('dt', {}, 'By law'));
    localRows.appendChild(dd);
  }
  // Native to the garden's state or not (Kew's checklist): the catalog's "native" is North America-wide. With the
  // law's lines, above the catalog's facts: whether it belongs here, and whether it's recorded wild here, matter first.
  const native = nativeHere(p);
  if (native) {
    // (Not native, and recorded growing wild here all the same: said with the counties, and their sources.)
    const escape = escapeHere(p);
    const dd = el('dd', { 'data-testid': 'native-here', ...(native.status === 'I' ? { className: 'details-introduced' } : {}) }, escape ? escapeText(escape) : nativeText(native));
    dd.appendChild(el('span', { className: 'details-src' }, [native.source, ...(escape?.sources ?? [])].join(' · ')));
    localRows.appendChild(el('dt', {}, `In ${native.stateName}`));
    localRows.appendChild(dd);
  }
  dl.insertBefore(localRows, dl.firstChild);
  // Where it grows wild near the garden (the state's county records): shown after the catalog's facts.
  const wild = wildHere(p);
  if (wild) {
    const dd = el('dd', { 'data-testid': 'wild-here' }, wildText(wild));
    dd.appendChild(el('span', { className: 'details-src' }, wild.sources.join('; ')));
    dl.appendChild(el('dt', {}, 'Wild near you'));
    dl.appendChild(dd);
  }
  box.appendChild(dl);
  if (p.notes) box.appendChild(el('div', { className: 'details-notes' }, p.notes));
  return box;
}
