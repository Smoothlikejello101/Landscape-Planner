// What's new: each update's changes, newest first (src/whats-new.ts). From ⋮ → What's new, and from the notice an
// update brings. The releases this device hadn't seen when the app opened are marked New.

import { CHANNEL } from '../channel';
import { el } from '../dom';
import { I } from '../icons';
import { state } from '../state';
import { builtOn, RELEASES, releaseDate, type Release } from '../whats-new';
import { render } from './render';
import { toastAction } from './toast';

/** The releases new to this device when the app opened (they stay marked New while it's open). */
let freshIds = new Set<number>();

/** At start, after the first render: the notice for what's new since this device last opened the app (`notice`: said). */
export function tellWhatsNew(news: Release[], notice = true): void {
  freshIds = new Set(news.map((r) => r.id));
  if (!news.length || !notice) return;
  const n = news.reduce((sum, r) => sum + r.items.length, 0);
  toastAction(`FullGrown was updated: ${n} new thing${n === 1 ? '' : 's'}.`, [
    { label: 'See what’s new', run: openWhatsNew },
  ], 20000, 'whats-new-notice');
}

export function openWhatsNew(): void {
  state.menu = null;
  state.panel = 'whatsNew';
  render();
}

export function renderWhatsNewPanel(): HTMLElement {
  const close = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  close.addEventListener('click', () => { state.panel = null; render(); });
  const header = el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, 'What’s new'), close);
  const body = el('div', { 'data-testid': 'whats-new' });
  for (const r of RELEASES) {
    const head = el('div', { className: 'section-label whats-new-date' }, releaseDate(r.date),
      ...(freshIds.has(r.id) ? [el('span', { className: 'whats-new-fresh', 'data-testid': 'whats-new-fresh' }, 'New')] : []));
    const list = el('ul', { className: 'whats-new-list' }, ...r.items.map((t) => el('li', {}, t)));
    body.appendChild(el('section', { 'data-testid': `release-${r.id}` }, head, list));
  }
  body.appendChild(el('div', { className: 'hint', style: { padding: '6px 16px 16px' } },
    `Version ${__APP_VERSION__}${CHANNEL === 'next' ? ' · Next (preview)' : ''} · ${builtOn()}. Something not right, or an idea? ⋮ → Send feedback.`));
  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}
