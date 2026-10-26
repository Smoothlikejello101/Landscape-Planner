import { CLIMATE_ACCESSED, FROST_SOURCE, formatMonthDay, lookUpZip, ZONE_SOURCE, type GardenLocation } from '../climate';
import { el } from '../dom';
import { I } from '../icons';
import { state } from '../state';
import { save } from '../storage';
import { plantFilter } from '../plants';
import type { PanelName } from '../types';
import { toast } from './toast';
import { render } from './render';
import { loadWild } from '../wild';

// The garden's location: a ZIP code gives its hardiness zone and frost
// dates, kept with the plan. Only the ZIP's first three digits are fetched
// (a table from the app's own site); the full ZIP isn't sent anywhere.

/** The sheet it was opened from (the plant picker's "Hardy in your zone"): back there when done. */
let returnTo: PanelName | null = null;
export function openLocation(from: PanelName | null = null) {
  returnTo = from;
  state.panel = 'location';
  render();
}

let busy = false;
let problem = '';
/** Keep what's typed across a redraw of the sheet. */
let typed = '';

export function setLocation(loc: GardenLocation | null) {
  state.location = loc;
  save();
  void loadWild(); // (its county's wild records, for the picker)
}

function closePanel() { state.panel = returnTo; returnTo = null; problem = ''; typed = ''; render(); }

export function renderLocationPanel(): HTMLElement {
  const loc = state.location ?? null;
  const close = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  close.addEventListener('click', closePanel);
  const header = el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, 'Garden location'), close);
  const body = el('div', { className: 'sheet-body', 'data-testid': 'location' });

  const input = el('input', { type: 'text', inputMode: 'numeric', autocomplete: 'postal-code', maxLength: 5, placeholder: 'ZIP code', value: typed || loc?.zip || '', 'data-testid': 'zip' }) as HTMLInputElement;
  // (Keyboard safety: typing changes nothing else on screen.)
  input.addEventListener('input', () => { typed = input.value.replace(/\D/g, '').slice(0, 5); if (input.value !== typed) input.value = typed; });
  const go = el('button', { className: 'btn primary', 'data-testid': 'zip-lookup' }, busy ? 'Looking up…' : 'Look up') as HTMLButtonElement;
  go.disabled = busy;
  const lookUp = async () => {
    if (busy) return;
    const zip = input.value.trim();
    const plan = state.currentProjectId;
    busy = true; problem = ''; render();
    const r = await lookUpZip(zip);
    busy = false;
    // Answered for the plan it was asked for, while its sheet is still open.
    if (state.currentProjectId !== plan || state.panel !== 'location') {
      if (state.panel === 'location') render(); // (else leave the screen alone: something else may have the keyboard)
      return;
    }
    if (r.ok) {
      typed = ''; setLocation(r.location);
      if (returnTo === 'plants') {
        // Asked from the plant picker: straight back, showing what's hardy here.
        plantFilter.hardyHere = true;
        toast(`Zone ${r.location.zone}: showing plants hardy there. Untick “Hardy in zone ${r.location.zone}” to see them all. Frost dates are in ⋮ → Garden location.`, 7000);
        closePanel();
        return;
      }
    }
    else problem = r.why === 'format' ? 'A ZIP code is five digits.'
      : r.why === 'unknown' ? 'That ZIP isn’t in the zone tables (they cover the 50 states and Puerto Rico).'
      : 'Couldn’t reach the zone tables. Looking up needs a connection; what you’ve looked up before stays with the plan.';
    render();
  };
  go.addEventListener('click', () => { void lookUp(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void lookUp(); } });
  body.appendChild(el('div', { className: 'hint' }, 'The garden’s ZIP code gives its USDA hardiness zone and typical frost dates. Only its first three digits are fetched (a table from this app’s own site); the full ZIP isn’t sent anywhere.'));
  body.appendChild(el('div', { className: 'row-2', style: { alignItems: 'end' } }, el('div', { className: 'field' }, el('label', {}, 'ZIP code'), input), go));
  if (problem) body.appendChild(el('div', { className: 'status warn', 'data-testid': 'zip-problem' }, problem));

  if (loc) {
    const card = el('div', { className: 'location-card', 'data-testid': 'location-result' },
      el('div', { className: 'location-zone' }, 'Zone ', el('b', {}, loc.zone)),
      el('div', { className: 'hint' }, `ZIP ${loc.zip}`));
    if (loc.frost) {
      const f = loc.frost;
      const where = `the weather station at ${f.station}, ${f.miles} ${f.miles === 1 ? 'mile' : 'miles'} away`;
      const tenths = Math.round(f.chance / 10);
      if (f.yearRound) {
        card.append(el('div', {}, 'Frost can come in any month here.'), el('div', { className: 'hint' }, `From ${where}.`));
      } else if (f.spring && f.springLate && f.fall && f.fallEarly) {
        // (Where the first frost usually comes after the new year, it isn't a "fall" frost.)
        const firstLabel = Number(f.fall.slice(0, 2)) <= 3 ? 'First frost of winter: ' : 'First fall frost: ';
        card.append(
          el('div', {}, el('b', {}, 'Last spring frost: '), `about ${formatMonthDay(f.spring)}`, el('span', { className: 'hint' }, ` (1 year in 10, after ${formatMonthDay(f.springLate)})`)),
          el('div', {}, el('b', {}, firstLabel), `about ${formatMonthDay(f.fall)}`, el('span', { className: 'hint' }, ` (1 year in 10, before ${formatMonthDay(f.fallEarly)})`)));
        if (f.chance < 90) card.append(el('div', {}, `Not every winter brings a freeze here: about ${tenths} in 10 do.`));
        card.append(el('div', { className: 'hint' }, `Frost dates are from ${where}. Low spots and hilltops can differ by a week or more.`));
      } else {
        card.append(el('div', {}, f.chance < 5 ? 'Frost almost never comes here.'
            : tenths >= 4 ? `Freezes come only some winters here: about ${tenths} in 10.`
            : `Frost is rare here: about ${Math.max(1, tenths)} winter${tenths > 1 ? 's' : ''} in 10 see${tenths > 1 ? '' : 's'} a freeze.`),
          el('div', { className: 'hint' }, `From ${where}.`));
      }
    } else {
      card.append(el('div', { className: 'hint' }, loc.noArea
        ? 'This ZIP has no mapped area (it’s a PO box or a single building), so frost dates can’t be placed. The ZIP of the garden’s street address will have them.'
        : 'No weather station with frost records is near enough to give frost dates here.'));
    }
    body.appendChild(card);
    const clear = el('button', { className: 'btn ghost', 'data-testid': 'location-clear' }, 'Remove the location from this plan');
    clear.addEventListener('click', () => { setLocation(null); typed = ''; render(); });
    body.appendChild(clear);
  }
  // The sources, as their terms ask: name, address and when the data was taken.
  body.appendChild(el('div', { className: 'location-sources', 'data-testid': 'location-sources' },
    el('b', {}, 'Sources. '),
    `Zones: ${ZONE_SOURCE}, accessed ${loc?.accessed ?? CLIMATE_ACCESSED}. Frost dates: ${FROST_SOURCE}. ZIP areas: U.S. Census Bureau Gazetteer.`));

  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
  return overlay;
}
