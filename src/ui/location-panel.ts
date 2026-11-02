import { saveHardy } from '../yard';
import { CLIMATE_ACCESSED, FROST_SOURCE, formatMonthDay, lookUpZip, ZONE_SOURCE, type GardenLocation } from '../climate';
import { el, sheetCloseButton } from '../dom';
import { state } from '../state';
import { save } from '../storage';
import { plantFilter } from '../plants';
import type { PanelName } from '../types';
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

/**
 * The ZIP field and its Look up, for this sheet and for the first screen of an empty plan (src/ui/render.ts: Jason,
 * Nov 1, from the UI review), one lookup for both. What's typed, a lookup under way and what went wrong are kept
 * across redraws, whichever of the two shows them. Looked up from the first screen, the zone and frost dates, with
 * their sources, are shown in this sheet.
 */
export function zipEntry(where: 'sheet' | 'first'): { input: HTMLInputElement; go: HTMLButtonElement; problem: HTMLElement | null } {
  const first = where === 'first';
  const loc = state.location ?? null;
  const input = el('input', { type: 'text', inputMode: 'numeric', autocomplete: 'postal-code', maxLength: 5, placeholder: 'ZIP code', value: typed || loc?.zip || '', 'data-testid': first ? 'first-zip' : 'zip',
    ...(first ? { 'aria-label': 'Your garden’s ZIP code', enterKeyHint: 'go' } : {}) }) as HTMLInputElement;
  // (Keyboard safety: typing changes nothing else on screen.)
  input.addEventListener('input', () => { typed = input.value.replace(/\D/g, '').slice(0, 5); if (input.value !== typed) input.value = typed; });
  const go = el('button', { className: 'btn primary', 'data-testid': first ? 'first-zip-lookup' : 'zip-lookup' }, busy ? 'Looking up…' : 'Look up') as HTMLButtonElement;
  go.disabled = busy;
  const lookUp = async () => {
    if (busy) return;
    const zip = input.value.trim();
    const plan = state.currentProjectId;
    busy = true; problem = ''; render();
    const r = await lookUpZip(zip);
    busy = false;
    // Answered for the plan it was asked for, while what asked is still showing: its sheet, or the first screen with
    // no sheet over it.
    const showing = first ? !!document.querySelector('[data-testid=first-zip-lookup]') : state.panel === 'location';
    if (state.currentProjectId !== plan || !showing) {
      if (showing) render(); // (else leave the screen alone: something else may have the keyboard)
      return;
    }
    if (r.ok) {
      typed = ''; setLocation(r.location);
      // Asked from the plant picker: what's hardy here shown there. The sheet stays, with the zone and frost dates, till
      // it's closed or "Show plants hardy in zone 8a" is tapped: either goes back to the picker. (The UI review,
      // 2026-11-01: it went straight back, a toast over the picker's title, and the × meant for this sheet closed the
      // picker.)
      if (returnTo === 'plants') { plantFilter.hardyHere = true; saveHardy(true); }
      // Asked from the first screen: the answer, and where it comes from, in this sheet.
      if (first) { openLocation(); return; }
    }
    else problem = r.why === 'format' ? 'A ZIP code is five digits.'
      : r.why === 'unknown' ? 'That ZIP isn’t in the zone tables (they cover the 50 states and Puerto Rico).'
      : 'Couldn’t reach the zone tables. Looking up needs a connection; what you’ve looked up before stays with the plan.';
    render();
  };
  go.addEventListener('click', () => { void lookUp(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void lookUp(); } });
  return { input, go, problem: problem ? el('div', { className: 'status warn', 'data-testid': first ? 'first-zip-problem' : 'zip-problem' }, problem) : null };
}

export function renderLocationPanel(): HTMLElement {
  const loc = state.location ?? null;
  const close = sheetCloseButton(closePanel, returnTo); // (← back to the picker or the bloom calendar it was opened from)
  const header = el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, 'Garden location'), close);
  const body = el('div', { className: 'sheet-body', 'data-testid': 'location' });

  const { input, go, problem: said } = zipEntry('sheet');
  body.appendChild(el('div', { className: 'hint' }, 'The garden’s ZIP code gives its USDA hardiness zone, typical frost dates and the state’s plant laws.'));
  // What happens to it, for anyone wary of giving it (the first screen's Privacy opens this: Jason, Nov 1). Said as it
  // is: it's kept with the plan, so it goes where the plan goes (to the account, signed in; into backups).
  body.appendChild(el('div', { className: 'hint location-privacy', 'data-testid': 'zip-privacy-note' },
    el('b', {}, 'Privacy. '),
    'Looking it up fetches only its first three digits, from a table on this app’s own site. The ZIP is kept with this plan: on this device, in backups and plan files you save, and, if you sign in to sync, in your account with the rest of the plan. Once it’s set, you can remove it here.'));
  body.appendChild(el('div', { className: 'row-2', style: { alignItems: 'end' } }, el('div', { className: 'field' }, el('label', {}, 'ZIP code'), input), go));
  if (said) body.appendChild(said);

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
    if (returnTo === 'plants') {
      const back = el('button', { className: 'btn primary', 'data-testid': 'location-to-plants' }, `Show plants hardy in zone ${loc.zone}`);
      back.addEventListener('click', closePanel);
      body.appendChild(back);
    }
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
