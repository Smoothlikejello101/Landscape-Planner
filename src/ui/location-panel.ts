import { FROST_SOURCE, formatMonthDay, lookUpZip, ZONE_SOURCE, type GardenLocation } from '../climate';
import { el } from '../dom';
import { I } from '../icons';
import { state } from '../state';
import { save } from '../storage';
import { render } from './render';

// The garden's location: a ZIP code gives its hardiness zone and frost
// dates, kept with the plan. The ZIP is looked up in tables that come with
// the app; it isn't sent anywhere.

let busy = false;
let problem = '';
/** Keep what's typed across a redraw of the sheet. */
let typed = '';

export function setLocation(loc: GardenLocation | null) {
  state.location = loc;
  save();
}

export function renderLocationPanel(): HTMLElement {
  const loc = state.location ?? null;
  const close = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  close.addEventListener('click', () => { state.panel = null; problem = ''; render(); });
  const header = el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, 'Garden location'), close);
  const body = el('div', { className: 'sheet-body', 'data-testid': 'location' });

  const input = el('input', { type: 'text', inputMode: 'numeric', autocomplete: 'postal-code', maxLength: 5, placeholder: 'ZIP code', value: typed || loc?.zip || '', 'data-testid': 'zip' }) as HTMLInputElement;
  // (Keyboard safety: typing changes nothing else on screen.)
  input.addEventListener('input', () => { typed = input.value.replace(/\D/g, '').slice(0, 5); if (input.value !== typed) input.value = typed; });
  const go = el('button', { className: 'btn primary', 'data-testid': 'zip-lookup' }, busy ? 'Looking up…' : 'Look up') as HTMLButtonElement;
  go.disabled = busy;
  const lookUp = async () => {
    const zip = input.value.trim();
    busy = true; problem = ''; render();
    const r = await lookUpZip(zip);
    busy = false;
    if (r.ok) { typed = ''; setLocation(r.location); }
    else problem = r.why === 'format' ? 'A ZIP code is five digits.'
      : r.why === 'unknown' ? 'That ZIP isn’t in the zone tables. (PO box ZIPs often aren’t: try the ZIP of the garden’s street address.)'
      : 'Couldn’t reach the zone tables. Looking up needs a connection; what you’ve looked up before stays with the plan.';
    render();
  };
  go.addEventListener('click', () => { void lookUp(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void lookUp(); } });
  body.appendChild(el('div', { className: 'hint' }, 'The garden’s ZIP code gives its USDA hardiness zone and typical frost dates. It’s looked up on this device, from tables that come with the app.'));
  body.appendChild(el('div', { className: 'row-2', style: { alignItems: 'end' } }, el('div', { className: 'field' }, el('label', {}, 'ZIP code'), input), go));
  if (problem) body.appendChild(el('div', { className: 'status warn', 'data-testid': 'zip-problem' }, problem));

  if (loc) {
    const card = el('div', { className: 'location-card', 'data-testid': 'location-result' },
      el('div', { className: 'location-zone' }, 'Zone ', el('b', {}, loc.zone)),
      el('div', { className: 'hint' }, `ZIP ${loc.zip}`));
    if (loc.frost) {
      const f = loc.frost;
      card.append(
        el('div', {}, el('b', {}, 'Last spring frost: '), `about ${formatMonthDay(f.spring)}`, el('span', { className: 'hint' }, ` (1 year in 10, after ${formatMonthDay(f.springLate)})`)),
        el('div', {}, el('b', {}, 'First fall frost: '), `about ${formatMonthDay(f.fall)}`, el('span', { className: 'hint' }, ` (1 year in 10, before ${formatMonthDay(f.fallEarly)})`)),
        el('div', { className: 'hint' }, `Frost dates are from the weather station at ${f.station}, ${f.miles} ${f.miles === 1 ? 'mile' : 'miles'} away. Low spots and hilltops can differ by a week or more.`));
    } else {
      card.append(el('div', { className: 'hint' }, 'No weather station with frost records is near enough to give frost dates here.'));
    }
    body.appendChild(card);
    const clear = el('button', { className: 'btn ghost', 'data-testid': 'location-clear' }, 'Remove the location from this plan');
    clear.addEventListener('click', () => { setLocation(null); typed = ''; render(); });
    body.appendChild(clear);
    body.appendChild(el('div', { className: 'hint', style: { fontSize: '11px' } },
      `Zone: ${ZONE_SOURCE}${loc.accessed ? `, accessed ${loc.accessed}` : ''}. ` + (loc.frost ? `Frost dates: ${FROST_SOURCE}.` : '')));
  }

  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { state.panel = null; problem = ''; render(); } });
  return overlay;
}
