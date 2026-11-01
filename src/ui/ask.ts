// In-app questions, in place of the browser's confirm() and prompt() (Jason, Oct 30, from round 2: Diego's resize
// question came as a browser box headed with the site's address, Grace's new-project name as another; on a phone they
// look like a warning from the browser, and screen readers and the tap guard can't tell them from the app's own).
//
// Each is a small sheet over the app, outside what render() redraws (so a redraw while it's up leaves it, and the
// phone's keyboard, alone). Focus goes to its field or its main button (Cancel, for one in red), stays inside it (Tab wraps), and comes back
// to where it was when it closes. Esc, or a tap outside it, answers Cancel; Enter answers OK. Keys pressed in it
// belong to it, never to the plan's shortcuts.
import { el, tapSaid } from '../dom';

export interface AskOptions {
  /** The main button's words ("Delete", "Update them"); OK by default. */
  ok?: string;
  /** The other button's words; Cancel by default. */
  cancel?: string;
  /** The main button in red: for what can't be had back. */
  danger?: boolean;
  /** A line in bold above the message. */
  title?: string;
  /** For tests. */
  testid?: string;
  /** Only the one button: something to read, not to choose (tell). */
  noCancel?: boolean;
}

let open: { cancel: () => void } | null = null;

/**
 * The release of an Esc that answered a question: kept from the app, which acts on an Esc release whose press it never
 * saw (src/main.ts: an extension can take the press), and would put away the selection the question was about.
 */
function swallowEscRelease() {
  const off = () => { window.removeEventListener('keyup', eat, true); clearTimeout(timer); };
  const eat = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); off(); } };
  const timer = setTimeout(off, 1000);
  window.addEventListener('keyup', eat, true);
}

function sheet<T>(build: (finish: (v: T) => void) => { body: Node[]; first: HTMLElement; okBtn: HTMLButtonElement; ok: () => T }, opts: AskOptions, none: T): Promise<T> {
  // (One at a time: a second question answers the first with its "no".)
  open?.cancel();
  const before = document.activeElement as HTMLElement | null;
  return new Promise<T>((resolve) => {
    let done = false;
    const finish = (v: T) => {
      if (done) return;
      done = true;
      open = null;
      overlay.remove();
      document.removeEventListener('focusin', keepFocus, true);
      if (before?.isConnected) before.focus({ preventScroll: true });
      resolve(v);
    };
    const parts = build(finish);
    const cancelBtn = el('button', { className: 'btn ghost', 'data-testid': 'ask-cancel' }, opts.cancel ?? 'Cancel') as HTMLButtonElement;
    cancelBtn.addEventListener('click', () => finish(none));
    parts.okBtn.addEventListener('click', () => finish(parts.ok()));
    const titleId = 'ask-title-' + Math.random().toString(36).slice(2, 8);
    const dialog = el('div', { className: 'modal ask', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'data-testid': opts.testid ?? 'ask' },
      el('div', { className: 'sheet-body' },
        el('div', { id: titleId, className: 'ask-title' }, opts.title ?? ''),
        ...parts.body,
        el('div', { className: 'ask-buttons' }, opts.noCancel ? '' : cancelBtn, parts.okBtn)));
    // (Named by its title, or with none, by its message.)
    dialog.querySelector('.ask-message')?.setAttribute('id', titleId + '-m');
    if (!opts.title) { dialog.querySelector('.ask-title')!.remove(); dialog.setAttribute('aria-labelledby', titleId + '-m'); }
    const overlay = el('div', { className: 'ask-overlay', 'data-testid': 'ask-overlay' }, dialog);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) { e.preventDefault(); finish(none); } });
    dialog.addEventListener('keydown', (e) => {
      e.stopPropagation(); // (the plan's shortcuts never see these)
      if (e.key === 'Escape') { e.preventDefault(); swallowEscRelease(); finish(none); return; }
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); if (!parts.okBtn.disabled) finish(parts.ok()); return; }
      if (e.key === 'Tab') {
        const stops = [...dialog.querySelectorAll<HTMLElement>('input, button')].filter((x) => !(x as HTMLButtonElement).disabled);
        const i = stops.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i === stops.length - 1 ? 0 : i + 1);
        e.preventDefault();
        stops[next]?.focus();
      }
    });
    // (Its keys' releases too: the app acts on an Esc release whose press it never saw, src/main.ts.)
    dialog.addEventListener('keyup', (e) => e.stopPropagation());
    // (Focus that wanders out, a tap on the plan behind say, comes back in.)
    // (A question in red starts on Cancel, so a stray Enter doesn't delete: round 3, Tom.)
    const first = opts.danger && !opts.noCancel ? cancelBtn : parts.first;
    const keepFocus = (e: FocusEvent) => { if (!dialog.contains(e.target as Node)) first.focus({ preventScroll: true }); };
    document.addEventListener('focusin', keepFocus, true);
    document.body.appendChild(overlay);
    open = { cancel: () => finish(none) };
    first.focus({ preventScroll: true });
  });
}

/** Ask a yes-or-no question; true for its main button. */
export function ask(message: string, opts: AskOptions = {}): Promise<boolean> {
  return sheet<boolean>(() => {
    const okBtn = el('button', { className: 'btn ' + (opts.danger ? 'danger-solid' : 'primary'), 'data-testid': 'ask-ok' }, opts.ok ?? 'OK') as HTMLButtonElement;
    return { body: [el('div', { className: 'ask-message' }, tapSaid(message))], first: okBtn, okBtn, ok: () => true };
  }, opts, false);
}

/** Say something the person must read (an error that stopped what they asked for); resolves when it's put away. */
export function tell(message: string, opts: AskOptions = {}): Promise<void> {
  return sheet<void>(() => {
    const okBtn = el('button', { className: 'btn primary', 'data-testid': 'ask-ok' }, opts.ok ?? 'OK') as HTMLButtonElement;
    return { body: [el('div', { className: 'ask-message' }, tapSaid(message))], first: okBtn, okBtn, ok: () => undefined };
  }, { ...opts, noCancel: true }, undefined);
}
/** Ask for a line of text; the text (trimmed), or null for Cancel. OK waits for something typed. */
export async function askText(message: string, value = '', opts: AskOptions & { placeholder?: string; label?: string } = {}): Promise<string | null> {
  return (await askTextAnd(message, value, opts))?.text ?? null;
}
/**
 * Ask for a line of text, with a box to tick under it (`check`: its words, and whether it starts ticked): the text
 * (trimmed) and whether the box was ticked, or null for Cancel. (A new plan's name, and "Same garden?": Jason, from
 * the UI review, 2026-11-01.)
 */
export function askTextAnd(message: string, value = '', opts: AskOptions & { placeholder?: string; label?: string; check?: { label: string; checked: boolean } } = {}): Promise<{ text: string; checked: boolean } | null> {
  return sheet<{ text: string; checked: boolean } | null>(() => {
    const input = el('input', { type: 'text', value, placeholder: opts.placeholder ?? '', 'data-testid': 'ask-input', 'aria-label': opts.label ?? message, autocomplete: 'off' }) as HTMLInputElement;
    const box = opts.check ? el('input', { type: 'checkbox', 'data-testid': 'ask-check' }) as HTMLInputElement : null;
    if (box) box.checked = opts.check!.checked;
    const okBtn = el('button', { className: 'btn primary', 'data-testid': 'ask-ok' }, opts.ok ?? 'OK') as HTMLButtonElement;
    const sync = () => { okBtn.disabled = !input.value.trim(); };
    input.addEventListener('input', sync);
    sync();
    setTimeout(() => input.select(), 0);
    // (A first click in the box put the cursor after the suggestion: "UntitledImport test". It selects it all again,
    // to type over, as long as it's untouched. Round 3, Alex.)
    let fresh = true;
    input.addEventListener('mouseup', (e) => { if (fresh && input.value === value) { e.preventDefault(); input.select(); } fresh = false; });
    input.addEventListener('input', () => { fresh = false; });
    return {
      body: [el('label', { className: 'ask-message' }, tapSaid(message)), input, ...(box ? [el('label', { className: 'check-row' }, box, el('span', {}, opts.check!.label))] : [])],
      first: input, okBtn,
      ok: () => (input.value.trim() ? { text: input.value.trim(), checked: !!box?.checked } : null),
    };
  }, opts, null);
}

/** Whether a question is up (for the app's own Esc and Back handling). */
export const asking = () => open !== null;
/** Answer the question that's up with its "no" (Back on a phone). */
export function dismissAsk(): boolean { if (!open) return false; open.cancel(); return true; }
