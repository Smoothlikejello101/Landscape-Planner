// Help (⋮ → Help, in place of "Show me around": Jason, Nov 2, from the UI review). Top to bottom: Guided start; "How
// do I…", each question folded to its line, opened to two or three lines of answer (src/help.ts) and a button that
// goes there, named as the place itself is (so it's known again in ⋮); Send feedback; the privacy policy and terms.
// Each button closes Help as it opens its place. The folds opened are kept while the app runs, not stored.

import { canShareFiles, canShareWords } from '../backup';
import { signInAllowed } from '../channel';
import { el, hasKeyboard, ts } from '../dom';
import { startKind } from '../draw';
import { PRIVACY_URL, TERMS_URL } from '../feedback';
import { GUIDED_START_LINE, helpAnswers, type HelpDevice, type HelpId } from '../help';
import { I } from '../icons';
import { state } from '../state';
import { deviceName } from '../sync/sync';
import { roomyText } from '../text-size';
import { openFeedback } from './feedback-sheet';
import { showMeAround } from './intro-card';
import { openLocation } from './location-panel';
import { openPlantList } from './plant-list-panel';
import { openOwnPlantForm } from './plants-panel';
import { openPrint } from './print-panel';
import { render } from './render';
import { openWarnings } from './warnings-sheet';
import { installOffered, promptInstall, runningInstalled } from './install-card';

/** The questions opened. */
const opened = new Set<HelpId>();

export function openHelp(): void {
  state.menu = null;
  state.panel = 'help';
  render();
}

/** This device, as the answers' words go by it. */
export function helpDevice(): HelpDevice {
  const keyboard = hasKeyboard();
  return {
    keyboard, mac: deviceName() === 'Mac', roomy: roomyText(),
    // (As the plant list's own button decides: src/ui/plant-list-panel.ts.)
    shareWords: canShareWords() && !keyboard,
    shareFiles: canShareFiles(),
    signIn: signInAllowed(),
    installed: runningInstalled(),
  };
}

/** A button that goes to a place, with its icon, closing Help. */
function go(icon: string, label: string, testid: string, run: () => void): HTMLButtonElement {
  const b = el('button', { className: 'btn ghost', 'data-testid': testid, html: `${icon}<span>${label}</span>` });
  b.addEventListener('click', run);
  return b;
}
/** The picker, as the Plant button opens it (while placing, as the place bar's plant does: to switch). */
function openPicker() {
  if (state.placing) state.panel = 'plants';
  else startKind('plant');
  render();
}
/** Plans and backup, at its Backup section (below the plans and the account). */
function openBackup() {
  state.panel = 'projects';
  render();
  const sheet = document.querySelector<HTMLElement>('.overlay .sheet');
  const backup = sheet?.querySelector<HTMLElement>('[data-testid=backup-section]');
  if (!sheet || !backup) return;
  const head = sheet.querySelector<HTMLElement>('.sheet-header')?.offsetHeight ?? 0;
  sheet.scrollTop += backup.getBoundingClientRect().top - sheet.getBoundingClientRect().top - head;
}

/** Each answer's way there. */
function buttonsFor(id: HelpId): HTMLElement[] {
  switch (id) {
    case 'print':
      // (Print is in ⋮ once the plan has something on it.)
      return state.shapes.length
        ? [go(I.print, 'Print or save as PDF', 'help-go-print', () => { openPrint(); render(); })]
        : [el('span', { className: 'hint', 'data-testid': 'help-print-empty' }, 'Once the plan has something on it.')];
    case 'list':
      return [go(I.list, 'Plant list', 'help-go-list', () => { openPlantList(); render(); })];
    case 'backup':
      return [go(I.folder, 'Plans and backup', 'help-go-backup', openBackup)];
    case 'undo':
      // (The rest of the keys, with a keyboard; on a phone, the words say where the arrows are.)
      return hasKeyboard() ? [go(I.keyboard, 'Keyboard shortcuts', 'help-go-keys', () => { state.panel = 'shortcuts'; render(); })] : [];
    case 'own-plant':
      return [go(I.plus, 'Add your own plant', 'help-go-own', openOwnPlantForm)];
    case 'location':
      return [go(I.pin, 'Garden location', 'help-go-location', () => openLocation())];
    case 'protect':
      return [
        go(I.leaf, 'Plant picker', 'help-go-picker', openPicker),
        // (Warnings checks the plants on the plan: with none, ⋮ has no Warnings either.)
        ...(state.shapes.some((s) => s.role === 'plant')
          ? [go(I.warn, 'Warnings', 'help-go-warnings', () => { state.panel = null; openWarnings('poison'); })] : []),
      ];
    case 'install':
      // (Where the browser offers it (Chrome on Android): its install, from here.)
      return installOffered() ? [go(I.download, 'Install', 'help-go-install', () => { state.panel = null; render(); void promptInstall(); })] : [];
  }
}

function question(a: { id: HelpId; q: string; lines: string[] }): HTMLElement {
  const open = opened.has(a.id);
  const answer = el('div', { className: 'help-a', id: `help-a-${a.id}`, 'data-testid': `help-a-${a.id}`, hidden: !open },
    ...a.lines.map((l) => el('p', {}, l)));
  const buttons = buttonsFor(a.id);
  if (buttons.length) answer.appendChild(el('div', { className: 'help-go' }, ...buttons));
  const toggle = el('button', { className: 'help-q', 'aria-expanded': String(open), 'aria-controls': answer.id, 'data-testid': `help-q-${a.id}` },
    el('span', {}, a.q), el('span', { className: 'fold-chev', html: I.chevronDown }));
  // (Opened and closed in place: no redraw.)
  toggle.addEventListener('click', () => {
    const now = !opened.has(a.id);
    if (now) opened.add(a.id); else opened.delete(a.id);
    toggle.setAttribute('aria-expanded', String(now));
    answer.hidden = !now;
  });
  return el('div', { className: 'help-item' }, toggle, answer);
}

export function renderHelpSheet(): HTMLElement {
  const close = () => { state.panel = null; render(); };
  const x = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  x.addEventListener('click', close);
  const header = el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, 'Help'), x);

  // (Guided start, as it's called everywhere: Jason, Nov 4. It was "Take the tour".)
  const tour = el('button', { className: 'btn primary', 'data-testid': 'help-tour', html: `${I.help}<span>Guided start</span>` });
  tour.addEventListener('click', () => { state.panel = null; showMeAround(); render(); });
  const tourRow = el('div', { className: 'help-tour' }, tour, el('p', {}, GUIDED_START_LINE));

  const list = el('section', { className: 'help-list', 'aria-labelledby': 'help-how', 'data-testid': 'help-how' },
    el('h3', { className: 'section-label help-how', id: 'help-how' }, 'How do I…'),
    ...helpAnswers(helpDevice()).map(question));

  const feedback = el('button', { className: 'link-btn', 'data-testid': 'help-feedback' }, 'Send feedback');
  feedback.addEventListener('click', () => openFeedback());
  const link = (href: string, words: string) => el('a', { href, target: '_blank', rel: 'noopener' }, words);
  const foot = el('div', { className: 'help-foot' },
    el('div', { style: { fontSize: ts(14), color: '#44403c' } }, 'Something not working, or an idea? ', feedback),
    el('div', { className: 'hint', 'data-testid': 'help-policies' }, link(PRIVACY_URL, 'Privacy policy'), ' · ', link(TERMS_URL, 'Terms')));

  const sheet = el('div', { className: 'sheet help-sheet', role: 'dialog', 'aria-label': 'Help', 'data-testid': 'help-sheet' }, header, tourRow, list, foot);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return overlay;
}
