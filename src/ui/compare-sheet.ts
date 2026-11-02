// Compare two or three plants, from the picker (Jason, Nov 2, from the UI review: "A table of the facts that decide,
// with how sure each is"): a Compare toggle in a plant's opened details, a "Comparing" mark on its row, a bar at the
// picker's foot ("Compare 2"), and the comparison itself, over the picker: a table, a column a plant, the rows where
// they differ first and the rest folded under "The same for all". Every value with where it's from and how sure
// (src/compare.ts). Nothing ranked or recommended.
//
// All of it changes in place, never by a full render: the picker's search keeps the keyboard, its list its scroll and
// its opened rows. The choice holds while the person browses and filters, and clears when the picker closes
// (src/ui/render.ts) or with the bar's Clear.
import { el, sheetCloseButton } from '../dom';
import { I } from '../icons';
import { clearCompare, compareRows, comparePlants, comparing, dropCompare, isComparing, MAX_COMPARE, toggleCompare, type Cell, type CompareRow } from '../compare';
import { rowFlags, type Plant } from '../plants';
import { plantSpot } from '../plant-looks';
import { panelOpened } from '../tap-guard';

/** What the comparison needs from the picker it's opened in. */
export interface CompareHost {
  /** The picker's overlay, which the comparison is drawn over. */
  root: HTMLElement;
  /** The picker's own button for a plant (Place, Swap, Link, Switch or Pick, as its rows have it). */
  useButton: (p: Plant) => HTMLButtonElement;
  /** The choice changed: the picker's toggles, marks and bar, set again. */
  changed: () => void;
}

/** The comparison is open over the picker (drawn again with it, where the picker is drawn again). */
let shown = false;
/** "The same for all", opened (while the comparison is open). */
let sameOpen = false;
/** The comparison on the page, and the picker it's over. */
let current: { node: HTMLElement; host: CompareHost } | null = null;
export const compareShown = (): boolean => shown;
/** The picker closed: the choice clears, the comparison with it. */
export function compareClosed() { shown = false; sameOpen = false; current = null; clearCompare(); }

// ---------- In the picker ----------
/** A Compare toggle's look: pressed while chosen; not offered while three others are. */
function setToggle(b: HTMLButtonElement) {
  const id = b.dataset.compareId!, on = isComparing(id), full = !on && comparing().length >= MAX_COMPARE;
  b.setAttribute('aria-pressed', String(on));
  b.disabled = full;
  b.querySelector('.compare-toggle-icon')!.innerHTML = on ? I.check : I.plus;
  const note = b.parentElement?.querySelector<HTMLElement>('.compare-full');
  if (note) note.hidden = !full;
}
/**
 * Compare, in a plant's opened details (beside its botanical name): chosen or not, three at most. In the details, not
 * on the row: the row already holds the name, Place and Copy, and opening a row is how its facts are read before
 * choosing.
 */
export function addCompareToggle(details: HTMLElement, p: Plant, host: CompareHost) {
  const had = details.querySelector<HTMLButtonElement>('button[data-compare-id]');
  if (had) { setToggle(had); return; } // (opened again: as the choice is now)
  const b = el('button', { type: 'button', className: 'compare-toggle', 'data-compare-id': p.id, 'data-testid': 'compare-toggle', 'aria-pressed': 'false',
    'aria-label': `Compare ${p.common}` }, el('span', { className: 'compare-toggle-icon', 'aria-hidden': 'true' }), el('span', {}, 'Compare'));
  b.addEventListener('click', (e) => { e.stopPropagation(); if (toggleCompare(p.id)) host.changed(); });
  const line = el('div', { className: 'details-compare' });
  const bot = details.querySelector<HTMLElement>(':scope > .details-bot');
  if (bot) { bot.replaceWith(line); line.appendChild(bot); }
  else details.insertBefore(line, details.querySelector(':scope > dl, :scope > .details-groups'));
  line.append(b, el('span', { className: 'compare-full', 'data-testid': 'compare-full', hidden: true }, `${MAX_COMPARE} at most: remove one first`));
  setToggle(b);
}
/** The mark on a chosen plant's row, so the choice shows while browsing. */
export function compareMark(p: Plant): HTMLElement {
  return el('div', { className: 'pflags compare-mark', 'data-compare-mark': p.id, hidden: !isComparing(p.id) }, el('span', { className: 'pflag compare' }, 'Comparing'));
}
/** The picker's toggles and marks, set again from the choice. */
export function syncCompareMarks(root: ParentNode) {
  for (const b of root.querySelectorAll<HTMLButtonElement>('button[data-compare-id]')) setToggle(b);
  for (const m of root.querySelectorAll<HTMLElement>('[data-compare-mark]')) m.hidden = !isComparing(m.dataset.compareMark!);
}
/** A plant's spot, as its row draws it, read as part of its name. */
const spotOf = (p: Plant, size = 18) => el('span', { className: 'compare-spot', style: { width: `${size}px`, height: `${size}px` }, 'aria-hidden': 'true', html: plantSpot(p).svg });
/**
 * The bar at the picker's foot, while any are chosen: their names, "Compare 2" (or 3) once there are two, and Clear.
 * With one, what to do next.
 */
export function compareBar(host: CompareHost): { el: HTMLElement; sync: () => void } {
  const names = el('div', { className: 'compare-bar-names', 'data-testid': 'compare-names' });
  const status = el('div', { className: 'compare-bar-status', 'aria-live': 'polite', 'data-testid': 'compare-status' });
  const go = el('button', { type: 'button', className: 'btn primary compare-go', 'data-testid': 'compare-open' });
  go.addEventListener('click', () => openCompare(host));
  const clear = el('button', { type: 'button', className: 'link-btn compare-clear', 'data-testid': 'compare-clear', 'aria-label': 'Clear the plants chosen to compare' }, 'Clear');
  clear.addEventListener('click', () => { clearCompare(); host.changed(); });
  const bar = el('div', { className: 'compare-bar', role: 'region', 'aria-label': 'Plants to compare', 'data-testid': 'compare-bar' },
    el('div', { className: 'compare-bar-text' }, names, status), go, clear);
  const sync = () => {
    const ps = comparePlants();
    bar.hidden = !ps.length;
    names.replaceChildren(...ps.flatMap((p, i) => [i ? ', ' : '', el('span', { className: 'compare-bar-name' }, spotOf(p, 14), p.common)]));
    status.textContent = ps.length === 1 ? 'Open another plant to compare it too' : ps.length ? `${ps.length} chosen to compare${ps.length < MAX_COMPARE ? `, up to ${MAX_COMPARE}` : ''}` : '';
    go.hidden = ps.length < 2;
    go.textContent = `Compare ${ps.length}`;
  };
  sync();
  return { el: bar, sync };
}

// ---------- The comparison ----------
/** Open it over the picker, in place (the picker as it was beneath). */
export function openCompare(host: CompareHost) {
  if (comparePlants().length < 2) return;
  shown = true;
  panelOpened(); // (a quick second tap on Compare isn't taken by what's now under it: src/tap-guard.ts)
  current?.node.remove();
  current = { node: compareView(host), host };
  host.root.appendChild(current.node);
  pickerBeneath(host.root, true);
  current.node.querySelector<HTMLElement>('.sheet-header button')?.focus();
}
/**
 * The picker beneath the comparison: out of reach while it's open (inert: not focused, not read out, not pressed), so a
 * screen reader or a keyboard meets the comparison's own Swap, not the row's beneath it.
 */
export function pickerBeneath(root: ParentNode, covered: boolean) {
  const sheet = root.querySelector<HTMLElement>(':scope > .picker-sheet');
  if (!sheet) return;
  sheet.inert = covered;
  // (Hidden as inert hides it, for a reader that doesn't know inert.)
  if (covered) sheet.setAttribute('aria-hidden', 'true'); else sheet.removeAttribute('aria-hidden');
}
/** Back to the picker, in place; the choice kept. */
export function closeCompare() {
  shown = false;
  sameOpen = false;
  const root = current?.host.root;
  current?.node.remove();
  current = null;
  if (root) pickerBeneath(root, false);
  root?.querySelector<HTMLElement>('[data-testid=compare-open]:not([hidden])')?.focus();
}
/** The comparison drawn again where it is (a plant removed, the garden's records in), scrolled as it was. */
export function refreshCompare() {
  if (!shown || !current?.node.isConnected) return;
  const old = current.node.querySelector<HTMLElement>('.compare-scroll');
  const at = old ? { top: old.scrollTop, left: old.scrollLeft } : null;
  const next = compareView(current.host);
  current.node.replaceWith(next);
  current.node = next;
  const scroll = next.querySelector<HTMLElement>('.compare-scroll');
  if (scroll && at) { scroll.scrollTop = at.top; scroll.scrollLeft = at.left; }
}
/** The comparison, drawn with the picker when it's open (a full render of the picker keeps it). */
export function compareOver(host: CompareHost): HTMLElement | null {
  if (!shown || comparePlants().length < 2) { shown = false; return null; }
  current = { node: compareView(host), host };
  return current.node;
}

/** A value, the lines under it, what other sources say, and how sure, quietly. */
function td(c: Cell): HTMLElement {
  return el('td', { className: c.tone ? `tone-${c.tone}` : undefined, 'data-testid': 'compare-cell' },
    el('div', { className: 'compare-value' + (c.known ? '' : ' unknown') }, c.text),
    (c.more ?? []).map((m) => el('div', { className: 'compare-more' }, m)),
    c.alt ? el('div', { className: 'compare-alt' }, c.alt) : null,
    c.sure ? el('div', { className: `compare-sure sure-${c.sure.level}`, 'data-testid': 'compare-sure', title: c.sure.title ?? null }, c.sure.text) : null);
}
const tr = (r: CompareRow) => el('tr', { 'data-row': r.key, 'data-testid': 'compare-row' }, el('th', { scope: 'row' }, r.label), r.cells.map(td));
/** What the marks under each value mean, in the words they use (opened from the note, as the picker's "What that means"). */
const SURE_WORDS: [string, string][] = [
  ['Confirmed', 'a published reference (NC State, USDA…) gives it, and another source agrees.'],
  ['One source', 'one published reference gives it.'],
  ['Nurseries agree', 'no reference gives it; two or more nursery pages do, and agree.'],
  ['One nursery', 'one nursery page gives it, and nothing else yet.'],
  ['Sources disagree', 'it’s on the list to review.'],
  ['Second reading', 'read from a page’s description, not its fields, and written only because a second, separate reading of the same text agrees.'],
  ['From its species', 'a cultivar’s value, given for its species.'],
  ['Earlier list, unverified', 'from an earlier list with no sources, until it’s checked.'],
  ['Not known', 'no source we’ve read gives it, or none of its sources say.'],
];
function compareView(host: CompareHost): HTMLElement {
  const plants = comparePlants();
  const rows = compareRows(plants);
  const differ = rows.filter((r) => r.differ), same = rows.filter((r) => !r.differ);
  const n = plants.length;

  // A column a plant: its spot and name, kept in view as the facts scroll; under it, scrolling with them, its botanical
  // name, how far it's checked, and its own Place (or Swap) and Remove.
  const name = (p: Plant) => el('th', { scope: 'col', 'data-testid': 'compare-col' }, el('div', { className: 'compare-name' }, spotOf(p), el('span', {}, p.common)));
  const about = (p: Plant) => {
    const use = host.useButton(p);
    use.setAttribute('data-testid', 'compare-use');
    const remove = el('button', { type: 'button', className: 'link-btn compare-remove', 'data-testid': 'compare-remove', 'aria-label': `Remove ${p.common} from the comparison` }, 'Remove');
    remove.addEventListener('click', () => {
      dropCompare(p.id);
      host.changed();
      if (comparePlants().length < 2) closeCompare(); else refreshCompare();
    });
    const checks = rowFlags(p).filter((f) => f.kind === 'check');
    return el('td', { className: 'compare-about' },
      p.botanical && p.botanical !== p.common ? el('div', { className: 'compare-bot' }, p.botanical) : null,
      checks.length ? el('div', { className: 'pflags' }, checks.map((f) => el('span', { className: 'pflag check unverified-badge', title: f.title ?? null }, f.text))) : null,
      el('div', { className: 'compare-actions' }, use, remove));
  };
  const table = el('table', { className: 'compare-table', 'aria-label': `${plants.map((p) => p.common).join(', ')}: where they differ, and how sure each value is`, 'data-testid': 'compare-table' },
    el('colgroup', {}, el('col', { className: 'compare-label-col' }), plants.map(() => el('col', { className: 'compare-plant-col' }))),
    el('thead', {}, el('tr', { className: 'compare-names' }, el('td', { className: 'compare-corner' }), plants.map(name)),
      el('tr', {}, el('td', { className: 'compare-corner' }), plants.map(about))),
    el('tbody', { 'data-testid': 'compare-differ' }, differ.length ? differ.map(tr)
      : el('tr', {}, el('td', { colspan: String(n + 1), className: 'compare-none' }, el('span', { className: 'compare-sticky' }, 'Nothing below tells them apart.')))));
  table.style.setProperty('--n', String(n));
  if (same.length) {
    const open = sameOpen || !differ.length;
    const body = el('tbody', { 'data-testid': 'compare-same', hidden: !open }, same.map(tr));
    const toggle = el('button', { type: 'button', className: 'compare-same-head', 'aria-expanded': String(open), 'data-testid': 'compare-same-toggle' },
      el('span', { className: 'fold-chev', html: I.chevronDown }), `The same for all · ${same.length} ${same.length === 1 ? 'fact' : 'facts'}`);
    toggle.addEventListener('click', () => {
      sameOpen = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(sameOpen));
      body.hidden = !sameOpen;
    });
    table.append(el('tbody', { className: 'compare-same-row' }, el('tr', {}, el('td', { colspan: String(n + 1) }, el('span', { className: 'compare-sticky' }, toggle)))), body);
  }

  // How sure, in a line, the rest a tap away (as the picker's "Not every detail is checked yet").
  const full = el('dl', { id: 'compare-sure-more', className: 'compare-sure-words', hidden: true },
    SURE_WORDS.flatMap(([word, says]) => [el('dt', {}, word), el('dd', {}, says)]));
  const what = el('button', { type: 'button', className: 'link-btn inline', 'aria-expanded': 'false', 'aria-controls': 'compare-sure-more', 'data-testid': 'compare-sure-what' }, 'What that means');
  what.addEventListener('click', () => { full.hidden = !full.hidden; what.setAttribute('aria-expanded', String(!full.hidden)); what.textContent = full.hidden ? 'What that means' : 'Less'; });
  const note = el('div', { className: 'hint checking-note compare-note', 'data-testid': 'compare-note' },
    'Under each value: where it’s from and how sure. ', what, full);

  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title', id: 'compare-title' }, `Compare ${n} plants`),
    sheetCloseButton(closeCompare, 'plants'));
  const scroll = el('div', { className: 'compare-scroll', 'data-testid': 'compare-scroll' }, note, table);
  const sheet = el('div', { className: 'sheet compare-sheet', role: 'dialog', 'aria-labelledby': 'compare-title', 'data-testid': 'compare-sheet' }, header, scroll);
  const overlay = el('div', { className: 'overlay compare-overlay', 'data-testid': 'compare' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCompare(); });
  return overlay;
}
