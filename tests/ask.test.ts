// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ask, askChoice, askText, askTextAnd, asking, dismissAsk, tell } from '../src/ui/ask';

// The app's own questions, in place of the browser's confirm(), prompt() and alert() (Oct 30, from round 2).

const dialog = () => document.querySelector<HTMLElement>('.ask-overlay [role=alertdialog]');
const key = (k: string, target: Element = document.activeElement ?? document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const click = (testid: string) => dialog()!.querySelector<HTMLButtonElement>(`[data-testid=${testid}]`)!.click();

afterEach(() => { dismissAsk(); document.body.replaceChildren(); });

describe('in-app questions', () => {
  it('ask: its main button is yes, Cancel, Esc or a tap outside it no; focus goes in and comes back', async () => {
    const opener = document.body.appendChild(document.createElement('button'));
    opener.focus();
    const yes = ask('Delete 2 shapes?', { ok: 'Delete', danger: true });
    expect(dialog()!.getAttribute('aria-modal')).toBe('true');
    expect(dialog()!.textContent).toContain('Delete 2 shapes?');
    expect(document.activeElement?.textContent).toBe('Cancel'); // (one in red starts on Cancel: round 3)
    expect(asking()).toBe(true);
    click('ask-ok');
    expect(await yes).toBe(true);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
    const no = ask('Again?');
    expect(document.activeElement?.textContent).toBe('OK'); // (not in red: its main button)
    click('ask-cancel');
    expect(await no).toBe(false);
    const esc = ask('Esc?');
    key('Escape');
    expect(await esc).toBe(false);
    const outside = ask('Outside?');
    document.querySelector('.ask-overlay')!.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(await outside).toBe(false);
  });
  it('keys pressed in it stay in it (the plan\'s shortcuts never see them); Tab wraps inside', async () => {
    let reached = 0;
    const count = () => { reached++; };
    window.addEventListener('keydown', count);
    const q = ask('Sure?');
    key('Delete');
    key('Tab');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('ask-cancel'); // (OK first, then wraps)
    key('Tab');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('ask-ok');
    expect(reached).toBe(0);
    window.removeEventListener('keydown', count);
    click('ask-ok');
    await q;
  });
  it('askText: what was typed, trimmed; Enter answers; OK waits for something typed; Cancel is null', async () => {
    const named = askText('Name for the new project', 'Untitled');
    const input = dialog()!.querySelector<HTMLInputElement>('[data-testid=ask-input]')!;
    expect(input.value).toBe('Untitled');
    input.value = '  Front yard ';
    input.dispatchEvent(new Event('input'));
    key('Enter', input);
    expect(await named).toBe('Front yard');
    const empty = askText('Name?', '');
    expect(dialog()!.querySelector<HTMLButtonElement>('[data-testid=ask-ok]')!.disabled).toBe(true);
    key('Enter', dialog()!.querySelector('input')!); // (nothing typed: nothing happens)
    expect(dialog()).not.toBeNull();
    click('ask-cancel');
    expect(await empty).toBeNull();
  });
  it('askTextAnd: the text and its box, ticked or not; no box unless asked for (a new plan\'s "Same garden?", the UI review)', async () => {
    const asked = askTextAnd('Name for the new project', 'Untitled', { check: { label: 'Same garden (ZIP 71923)?', checked: true } });
    const box = dialog()!.querySelector<HTMLInputElement>('[data-testid=ask-check]')!;
    expect(box.checked).toBe(true);
    expect(box.closest('label')!.textContent).toBe('Same garden (ZIP 71923)?');
    box.checked = false;
    click('ask-ok');
    expect(await asked).toEqual({ text: 'Untitled', checked: false });
    const plain = askTextAnd('Name?', 'Back yard');
    expect(dialog()!.querySelector('[data-testid=ask-check]')).toBeNull();
    click('ask-ok');
    expect(await plain).toEqual({ text: 'Back yard', checked: false });
  });
  it('one at a time: a second question answers the first no; Back (dismissAsk) answers no; tell has only OK', async () => {
    const first = ask('First?');
    const second = ask('Second?');
    expect(await first).toBe(false);
    expect(document.querySelectorAll('.ask-overlay')).toHaveLength(1);
    expect(dismissAsk()).toBe(true);
    expect(await second).toBe(false);
    expect(dismissAsk()).toBe(false);
    const told = tell('Export failed: disk full');
    expect(dialog()!.querySelector('[data-testid=ask-cancel]')).toBeNull();
    click('ask-ok');
    await told;
    expect(asking()).toBe(false);
  });
  it('askChoice: a button for each answer, stacked, Cancel last; each answers its own value, Cancel and Esc null (the UI review, 2026-11-01)', async () => {
    const choices = [{ label: 'Delete the bed only', value: 'bed', danger: true, testid: 'ask-bed-only' }, { label: 'Delete the bed and its 3 plants', value: 'all', danger: true }];
    const q = askChoice('“Front bed” has 3 plants in it.', choices, { danger: true });
    const row = dialog()!.querySelector('.ask-buttons')!;
    expect(row.classList.contains('stacked')).toBe(true);
    expect([...row.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Delete the bed only', 'Delete the bed and its 3 plants', 'Cancel']);
    expect(document.activeElement?.textContent).toBe('Cancel'); // (in red: starts on Cancel)
    click('ask-bed-only');
    expect(await q).toBe('bed');
    const q2 = askChoice('Again?', choices, { danger: true });
    click('ask-ok'); // (the last answer is the main one)
    expect(await q2).toBe('all');
    const q3 = askChoice('Again?', choices);
    click('ask-cancel');
    expect(await q3).toBeNull();
    const q4 = askChoice('Again?', choices);
    key('Escape');
    expect(await q4).toBeNull();
  });
});
