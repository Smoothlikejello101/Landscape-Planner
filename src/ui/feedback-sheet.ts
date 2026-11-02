// Send feedback (the ⋮ menu): write to us, and, when something isn't working, a support file to attach (src/support.ts).
// The sheet says what's in the file before it's saved, and what never is. Nothing is sent by the app.
import { el, ts } from '../dom';
import { FEEDBACK_ADDRESS, feedbackLink } from '../feedback';
import { I } from '../icons';
import { canShareFiles, downloadText, shareText, stamp } from '../backup';
import { recordError } from '../error-log';
import { state } from '../state';
import { gatherSupport, type SupportParts } from '../support-gather';
import { buildSupportFile, imageBytes, sizeText, supportSummary } from '../support';
import { deviceName } from '../sync/sync';
import { errMsg } from '../util';
import { render } from './render';
import { toast } from './toast';
import { tell } from './ask';

/** What the sheet has gathered (once each time it opens), whether images go in, and the file saved, if one was. */
let parts: SupportParts | null = null, gathering = false, failed = '', withImages = false, saved = '';

/** Open the sheet: what goes in a support file is gathered as it opens. */
export function openFeedback() {
  parts = null; failed = ''; withImages = false; saved = ''; gathering = true;
  state.panel = 'feedback'; state.menu = null;
  render();
  gatherSupport()
    .then((p) => { parts = p; })
    .catch((e) => { failed = errMsg(e); recordError(e, 'support file'); })
    .finally(() => { gathering = false; if (state.panel === 'feedback') render(); });
}
function writeToUs(file?: string) {
  const link = feedbackLink(__APP_VERSION__, deviceName()) + (file ? encodeURIComponent(`\nSupport file attached: ${file}`) : '');
  el('a', { href: link }).click();
  // Where no mail app is set up, nothing opens: the address, to write from anywhere.
  toast(`Opening your email app. If nothing opens, write to ${FEEDBACK_ADDRESS}.`, 8000);
}
const fileName = () => `fullgrown-support-${stamp()}.fullgrown.json`;
async function saveFile(via: 'download' | 'share') {
  if (!parts) return;
  const name = fileName(), text = JSON.stringify(buildSupportFile({ ...parts, includeImages: withImages, now: new Date() }));
  try {
    if (via === 'share') {
      if (!(await shareText(name, text))) return; // (canceled)
    } else downloadText(name, text);
    saved = via === 'share' ? 'shared' : name;
    render();
  } catch (e) {
    // (The share sheet can refuse a file that took a while to make: it's downloaded instead.)
    if (via === 'share' && e instanceof DOMException && e.name === 'NotAllowedError') { downloadText(name, text); saved = name; render(); return; }
    void tell('Saving the support file failed: ' + errMsg(e));
  }
}

export function renderFeedbackSheet() {
  const close = () => { state.panel = null; render(); };
  const write = el('button', { className: 'btn primary', 'data-testid': 'write-to-us', html: I.mail + '<span>Write to us</span>' });
  write.addEventListener('click', () => { close(); writeToUs(); });
  const body = el('div', { className: 'sheet-body' },
    el('div', { style: { fontSize: ts(14), color: '#57534e' } },
      `Your email app opens with a message to ${FEEDBACK_ADDRESS}, the app's version and your kind of device filled in. You see it, and can change it, before you send.`),
    write);

  const support = el('div', { className: 'support-file', 'data-testid': 'support-file' },
    el('div', { className: 'support-title' }, 'Something not working?'),
    el('div', { className: 'hint' }, 'A support file lets us see what you see: your plans as you have them, and how the app stands on this device. Nothing is sent until you attach it to an email.'));
  if (gathering) support.appendChild(el('div', { className: 'hint', 'data-testid': 'support-gathering' }, 'Gathering…'));
  else if (failed || !parts) support.appendChild(el('div', { className: 'hint' }, `The support file couldn't be made: ${failed || 'nothing was gathered'}.`));
  else {
    const file = buildSupportFile({ ...parts, includeImages: withImages, now: new Date() });
    support.appendChild(el('div', { className: 'support-what' }, 'In it:'));
    support.appendChild(el('ul', { className: 'support-list', 'data-testid': 'support-summary' }, ...supportSummary(file).map((l) => el('li', {}, l))));
    support.appendChild(el('div', { className: 'hint' }, 'Never in it: your sign-in or your email address.'));
    const images = imageBytes(parts.projects);
    if (images) {
      const cb = el('input', { type: 'checkbox', 'data-testid': 'support-images' }) as HTMLInputElement;
      cb.checked = withImages;
      cb.addEventListener('change', () => { withImages = cb.checked; saved = ''; render(); });
      support.appendChild(el('label', { className: 'check-row' }, cb, el('span', {}, `Include background images (${sizeText(images)})`)));
    }
    if (saved) {
      support.appendChild(el('div', { className: 'support-saved', 'data-testid': 'support-saved' }, saved === 'shared'
        ? `Sent to the app you chose. If that was email, send it to ${FEEDBACK_ADDRESS}.`
        : `Saved to your Downloads: ${saved}. Attach it to your email to ${FEEDBACK_ADDRESS}.`));
      if (saved !== 'shared') {
        const again = el('button', { className: 'btn secondary', 'data-testid': 'write-with-file', html: I.mail + '<span>Write to us</span>' });
        again.addEventListener('click', () => { const f = saved; close(); writeToUs(f); });
        support.appendChild(again);
      }
    } else {
      const buttons = el('div', { className: 'support-buttons' });
      if (canShareFiles()) {
        const share = el('button', { className: 'btn secondary', 'data-testid': 'support-share', html: I.share + '<span>Share support file…</span>' });
        share.addEventListener('click', () => void saveFile('share'));
        buttons.appendChild(share);
      }
      const dl = el('button', { className: 'btn secondary', 'data-testid': 'support-save', html: I.download + '<span>Save support file</span>' });
      dl.addEventListener('click', () => void saveFile('download'));
      buttons.appendChild(dl);
      support.appendChild(buttons);
    }
  }
  body.appendChild(support);

  const x = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  x.addEventListener('click', close);
  const modal = el('div', { className: 'modal feedback-sheet', 'data-testid': 'feedback-sheet' },
    el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, 'Send feedback'), x),
    body);
  const overlay = el('div', { className: 'overlay center' }, modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return overlay;
}
