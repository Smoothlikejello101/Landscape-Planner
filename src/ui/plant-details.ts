// A plant's full details, shown when its row in the picker is opened: the
// facts the catalog has, where it came from and how sure it is, and what
// nurseries report where it differs from the authorities.
import { el } from '../dom';
import type { Plant } from '../plants';
import { MONTH_NAMES, PLANT_META, formsOf, zoneNote } from '../plants';
import { zoneRange } from '../climate';
import type { Provenance } from '../catalog';
import { wildHere, wildText } from '../wild';

const SURE: Record<string, string> = {
  agree: 'confirmed', confirmed: 'confirmed', single: 'one source', likely: 'nurseries agree', reported: 'one nursery', disputed: 'sources disagree',
};
const sourceName = (id: string) => PLANT_META?.sources?.[id]?.title ?? id;
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
const tox = (t?: Plant['tox']) => (!t ? '' : [t.dog && `dogs: ${t.dog}`, t.cat && `cats: ${t.cat}`, t.horse && `horses: ${t.horse}`, t.people && `people: ${t.people}`].filter(Boolean).join('; '));

/** Each row: label, the catalog's value, the facts it rests on, and how to write a nursery's differing value. */
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
    ['Toxicity', tox(p.tox) || (p.dog ? `dogs: ${p.dog}` : ''), ['tox', 'dog']],
    ['Thorns', yes(p.thorns), ['thorns']],
    ['Edible', yes(p.edible), ['edible']],
    ['Fall color', yes(p.fall_color), ['fall_color']],
    ['Winter interest', yes(p.winter_interest), ['winter_interest']],
    ['Takes clay', yes(p.clay_ok), ['clay_ok']],
    ['Takes wet feet', yes(p.wet_feet), ['wet_feet']],
    ['Takes dry shade', yes(p.dry_shade), ['dry_shade']],
    ['Self-seeds', p.self_seed ?? '', ['self_seed']],
    ['Maintenance', p.maintenance ?? '', ['maintenance']],
    ['Taproot (hard to move)', yes(p.taproot), ['taproot']],
    ['Humidity', p.humidity === 'humid' ? 'Likes humid summers' : p.humidity === 'dry' ? 'Likes dry air' : p.humidity === 'either' ? 'Either' : '', ['humidity']],
    ['Habit', p.habit ?? '', ['habit']],
    ['Trunk', p.trunk ? `${p.trunk} in across` : '', ['trunk']],
    ['Nativar', p.nativar ? 'A cultivar of a native species' : '', ['nativar']],
  ];
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
 * nurseries' reports (said first, in words).
 */
export function plantDetails(p: Plant, flagged: string[] | undefined): HTMLElement {
  const box = el('div', { className: 'plant-details', 'data-testid': 'plant-details' });
  if (flagged?.length) {
    box.appendChild(el('div', { className: 'details-flag', 'data-testid': 'reported-flag' },
      `Shown because of what nurseries report for its ${flagged.join(' and ')}; the published references say otherwise (below).`));
  }
  if (p.botanical) box.appendChild(el('div', { className: 'details-bot' }, p.botanical));
  const dl = el('dl', { className: 'details-list' });
  for (const [label, value, facts, reportedText] of rows(p)) {
    const prov = facts.map((f) => p.prov?.[f]).find(Boolean);
    const reported = p.reported && facts.some((f) => f in p.reported!) && reportedText ? reportedText(p.reported) : '';
    if (!value && !reported) {
      // Looked up, and none of the sources say: shown as such, so it isn't mistaken for "not looked at".
      if (facts.some((f) => p.prov?.[f]?.unknown)) { dl.appendChild(el('dt', {}, label)); dl.appendChild(el('dd', { className: 'details-unknown' }, 'Not known: none of the sources say')); }
      continue;
    }
    const dd = el('dd', {}, value || '—');
    const line = sourceLine(prov);
    if (line) dd.appendChild(el('span', { className: 'details-src' }, line));
    // Hardiness only nurseries give: say so, since a grower's range can stop where it sells, not where the plant grows.
    const nurseryOnly = (pv?: Provenance) => !!pv && !pv.unknown && pv.src.length > 0 && pv.src.every((s) => PLANT_META?.sources?.[s]?.trust === 'nursery');
    if (label === 'Hardiness') {
      const [cold, warm] = [nurseryOnly(p.prov?.zone_min), nurseryOnly(p.prov?.zone_max)];
      const which = cold && warm ? 'Only nurseries rate this; no published reference gives a range.'
        : cold ? 'Only nurseries give its cold limit; no published reference does.'
        : warm ? 'Only nurseries give its warm limit; no published reference does.' : '';
      if (which) dd.appendChild(el('span', { className: 'details-alt', 'data-testid': 'nursery-only' }, which));
    }
    if (reported && reported !== value) {
      const alt = facts.map((f) => p.prov?.[f]?.alt).find(Boolean);
      dd.appendChild(el('span', { className: 'details-alt' }, `Nurseries report: ${reported}` + (alt ? ` (${alt.src.map(sourceName).join(', ')})` : '')));
    }
    dl.appendChild(el('dt', {}, label));
    dl.appendChild(dd);
  }
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
