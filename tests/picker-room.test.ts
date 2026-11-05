// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadPlants, plantsById } from '../src/plants';
import { foldDetailGroups, plantDetails } from '../src/ui/plant-details';
import { closeSourcePane, sourceButton, sourcePaneOpen, withSourcePane } from '../src/ui/source-pane';

// The plant picker with more room for results, and a plant's details, from Jason's notes of Nov 4 (1, 8, 9): the source
// of a fact out of the way until it's asked for; the facts from the earlier list marked on themselves; a single "In
// winter" fact on its label's line; See photos on a line of its own.

const file = {
  meta: {
    format: 'lp-catalog', version: 2, zones: 'half', sources: {
      ncsu: { title: 'NC State Extension Gardener Plant Toolbox', trust: 'reference' }, usda: { title: 'USDA PLANTS', trust: 'reference' },
      compendium: { title: 'First compendium (2026)', trust: 'unverified' },
    },
  },
  plants: [
    {
      id: 'ceanothus-americanus', common: 'New Jersey tea', botanical: 'Ceanothus americanus', src: ['compendium'], audited: '2026-10-30', facts: {
        form: { v: 'Shrub', src: ['ncsu', 'usda'], check: 'agree' },
        water: { v: 'Moderate', src: ['ncsu'], check: 'single' },
        // (Plain values: the earlier list's word, with no source.)
        nectar: 'High', taproot: true,
        // (One end of a range from the earlier list, the other from NC State.)
        zone_min: { v: 4, src: ['compendium'] }, zone_max: { v: 8, src: ['ncsu'], check: 'single' },
        foliage: { v: 'deciduous', src: ['ncsu', 'usda'], check: 'agree' },
      },
    },
    {
      id: 'ilex-decidua', common: 'Possumhaw', botanical: 'Ilex decidua', src: ['ncsu'], audited: '2026-10-30', facts: {
        form: { v: 'Shrub', src: ['ncsu'], check: 'single' },
        foliage: { v: 'deciduous', src: ['ncsu'], check: 'single' },
        fruit_season: { v: ['fall', 'winter'], src: ['ncsu'], check: 'single' }, fruit_color: { v: ['red/burgundy'], src: ['ncsu'], check: 'single' },
      },
    },
  ],
};

beforeAll(async () => {
  const was = globalThis.fetch;
  globalThis.fetch = (async () => ({ json: async () => file })) as unknown as typeof fetch;
  try { await loadPlants(); } finally { globalThis.fetch = was; }
  foldDetailGroups();
});
afterEach(() => { closeSourcePane(); document.body.replaceChildren(); });

/** A row's value (its dd), by its label. */
const row = (box: HTMLElement, label: string) => [...box.querySelectorAll('dt')].find((d) => d.textContent === label)!.nextElementSibling as HTMLElement;

describe('a plant\'s details (Jason, Nov 4, notes 1, 8 and 9)', () => {
  it('marks the facts from the earlier list on themselves: "Unverified", or "Partly unverified" for one end of a range', () => {
    const box = plantDetails(plantsById['ceanothus-americanus'], undefined);
    const chip = (label: string) => row(box, label).querySelector('[data-testid=unverified-chip]')?.textContent ?? null;
    expect(chip('Nectar for pollinators')).toBe('Unverified');
    expect(chip('Taproot (hard to move)')).toBe('Unverified');
    expect(chip('Hardiness')).toBe('Partly unverified');
    expect(chip('Form')).toBeNull();
    expect(chip('Water')).toBeNull();
    // (On the value's line, after it; the source line under it says so as before.)
    const nectar = row(box, 'Nectar for pollinators');
    expect(nectar.firstChild!.textContent).toBe('High');
    expect(nectar.querySelector('.details-src')!.textContent).toBe('Source: earlier list, unverified');
    expect(nectar.querySelector('[data-testid=unverified-chip]')!.compareDocumentPosition(nectar.querySelector('.details-src')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts a single "In winter" fact on its label\'s line; several, each on a line of its own', () => {
    const one = row(plantDetails(plantsById['ceanothus-americanus'], undefined), 'In winter');
    expect(one.querySelector('[data-testid=winter-leaves]')!.className).toBe('details-one');
    expect(one.querySelectorAll('.details-part')).toHaveLength(0);
    const two = row(plantDetails(plantsById['ilex-decidua'], undefined), 'In winter');
    expect([...two.querySelectorAll('.details-part')].map((x) => x.getAttribute('data-testid'))).toEqual(['winter-leaves', 'winter-fruit']);
  });

  it('gives See photos a line of its own, with a picture\'s icon, after the botanical name', () => {
    const box = plantDetails(plantsById['ceanothus-americanus'], undefined);
    const bot = box.querySelector('.details-bot')!;
    expect(bot.textContent).toBe('Ceanothus americanus');
    expect(bot.querySelector('[data-testid=see-photos]')).toBeNull();
    const line = bot.nextElementSibling!;
    expect(line.className).toBe('details-photos-line');
    const link = line.querySelector('[data-testid=see-photos]')!;
    expect(link.textContent).toBe('See photos ↗');
    expect(link.querySelector('.details-photos-icon svg')).not.toBeNull();
  });
});

describe('"Source", and its little pane (Jason, Nov 4, note 1)', () => {
  it('opens with the citation in full, says so, and holds it only while open', () => {
    const wrap = sourceButton(() => 'Zones: USDA Plant Hardiness Zone Map 2023.', { name: 'the hardiness zones', testid: 'zone-source' });
    document.body.append(wrap);
    const b = wrap.querySelector('button')!, pane = wrap.querySelector<HTMLElement>('[data-testid=zone-source-pane]')!;
    expect(b.textContent).toBe('Source');
    expect(b.getAttribute('aria-label')).toBe('Source of the hardiness zones');
    expect(b.getAttribute('aria-controls')).toBe(pane.id);
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(pane.hidden).toBe(true);
    expect(pane.textContent).toBe('');
    b.click();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(pane.hidden).toBe(false);
    expect(pane.textContent).toBe('Zones: USDA Plant Hardiness Zone Map 2023.');
    expect(sourcePaneOpen()).toBe(true);
    // The button again: closed.
    b.click();
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(pane.hidden).toBe(true);
    expect(pane.textContent).toBe('');
  });

  it('closes on a press outside it, not on one inside it; Escape (src/main.ts) closes it with the focus back on its button', () => {
    const a = sourceButton(() => 'A'), b = sourceButton(() => 'B');
    const away = document.createElement('div');
    document.body.append(a, b, away);
    const btnA = a.querySelector('button')!, paneA = a.querySelector<HTMLElement>('.src-pane')!;
    btnA.click();
    paneA.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(paneA.hidden).toBe(false);
    away.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(paneA.hidden).toBe(true);
    expect(sourcePaneOpen()).toBe(false);
    // One at a time: opening another closes the first.
    btnA.click();
    b.querySelector('button')!.click();
    expect(paneA.hidden).toBe(true);
    expect(b.querySelector<HTMLElement>('.src-pane')!.hidden).toBe(false);
    // Escape: closed, the focus on its button; with none open, nothing to close (Escape goes on to the sheet).
    b.querySelector('button')!.blur();
    expect(closeSourcePane(true)).toBe(true);
    expect(document.activeElement).toBe(b.querySelector('button'));
    expect(closeSourcePane(true)).toBe(false);
  });

  it('a trigger that isn\'t a button is made one: a role, the focus, Enter and Space', () => {
    const wrap = document.createElement('div');
    const span = document.createElement('span');
    span.textContent = 'Source: a long citation…';
    document.body.append(wrap);
    // (As a long citation in a plant's details is, cut to its line: src/ui/plant-details.ts clipCitations.)
    withSourcePane(span, () => 'Source: a long citation, in full', { wrap });
    expect(span.getAttribute('role')).toBe('button');
    expect(span.tabIndex).toBe(0);
    span.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(span.getAttribute('aria-expanded')).toBe('true');
    expect(wrap.querySelector('.src-pane')!.textContent).toBe('Source: a long citation, in full');
    span.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(span.getAttribute('aria-expanded')).toBe('false');
  });
});
