import { expect, type Page } from '@playwright/test';

/** Fresh app with empty storage. */
export async function openFresh(page: Page) {
  await page.goto('./');
  await expect(page.locator('.project-btn .pname')).toBeVisible();
}

/**
 * Answer every question the app asks with its main button (src/ui/ask.ts: the app's own, in place of the browser's
 * confirm and prompt since Oct 30) the moment it's asked, as a browser dialog accepted at once was, typing `answer`
 * where it asks for text (with none, its own suggestion stands); and accept any browser dialog left. `seen`: what
 * each said (a moment after it's asked: check it with expect.poll).
 */
export function autoDialogs(page: Page, answer = '') {
  const seen: string[] = [];
  void page.exposeFunction('__lpAsked', (msg: string) => { seen.push(msg); }).catch(() => { /* already there */ });
  const script = (text: string) => {
    const w = window as unknown as { __lpAnswering?: boolean; __lpAsked?: (m: string) => void };
    if (w.__lpAnswering) return;
    w.__lpAnswering = true;
    const answerIt = () => {
      const d = document.querySelector<HTMLElement>('.ask-overlay [role=alertdialog]:not([data-answered])');
      if (!d) return;
      d.setAttribute('data-answered', '1');
      void w.__lpAsked?.(d.querySelector('.ask-message')?.textContent?.trim() ?? '');
      const input = d.querySelector<HTMLInputElement>('[data-testid=ask-input]');
      if (input && text) { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); }
      d.querySelector<HTMLButtonElement>('[data-testid=ask-ok]')?.click();
    };
    const start = () => new MutationObserver(answerIt).observe(document.body, { childList: true });
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  };
  void page.addInitScript(script, answer);
  void page.evaluate(script, answer).catch(() => { /* not loaded yet: the init script does it */ });
  page.on('dialog', async (d) => {
    seen.push(d.message());
    if (d.type() === 'prompt') await d.accept(answer);
    else await d.accept();
  });
  return seen;
}

/** The app's question that's up (src/ui/ask.ts), answered: `ok` its main button, else Cancel; `text` typed first. */
export async function answerAsk(page: Page, ok: boolean, text?: string): Promise<string> {
  const d = page.locator('.ask-overlay [role=alertdialog]');
  await expect(d).toBeVisible();
  const said = (await d.locator('.ask-message').innerText()).trim();
  if (text != null) await d.getByTestId('ask-input').fill(text);
  await d.getByTestId(ok ? 'ask-ok' : 'ask-cancel').click();
  await expect(d).toHaveCount(0);
  return said;
}

/** How many shapes the plan has (kept on the plan's element: at Medium and Large text the top bar doesn't say). */
export async function shapeCount(page: Page): Promise<number> {
  return Number(await page.locator('#canvas-svg').getAttribute('data-shapes'));
}

/** The plan's zoom, in percent (likewise). */
export async function zoomPct(page: Page): Promise<number> {
  return Number(await page.locator('#canvas-svg').getAttribute('data-zoom'));
}

/** Redo: on the top bar at Small text, in the ⋮ menu at Medium and Large. */
export async function clickRedo(page: Page) {
  const bar = page.locator('button[title=Redo]');
  if (await bar.count()) { await bar.click(); return; }
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-redo').click();
}

export async function closeSheet(page: Page) {
  await page.locator('.sheet-header button.iconbtn').last().click();
  await expect(page.locator('.sheet')).toHaveCount(0);
}

export async function canvasBox(page: Page) {
  const box = await page.locator('#canvas-svg').boundingBox();
  if (!box) throw new Error('no canvas');
  return box;
}

/** Fields in the open properties sheet, by label text. */
export function field(page: Page, label: string) {
  return page.locator('.sheet .field').filter({ has: page.locator('label', { hasText: label }) }).locator('input').first();
}

/** Drag with the mouse in small steps (pointer events). */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** Open the Add sheet and pick a kind; optionally switch its drawing method (Outline, Rectangle...). */
export async function addKind(page: Page, kind: string, method?: string) {
  await page.getByTestId('add-btn').click();
  await page.locator(`[data-testid=add-sheet] .kind-chip[data-kind=${kind}]`).first().click();
  await expect(page.getByTestId('add-sheet')).toHaveCount(0);
  if (method) await page.locator(`[data-testid=draw-bar] [data-method=${method}]`).click();
}

/** Tap the plan `dx`, `dy` feet from the center of the view (at the current zoom). */
export async function tapFromCenter(page: Page, dx: number, dy: number) {
  const box = await canvasBox(page);
  const ppf = 24 * (await zoomPct(page)) / 100;
  await page.mouse.click(box.x + box.width / 2 + dx * ppf, box.y + box.height / 2 + dy * ppf);
}

/**
 * A plain shape the size the old one-tap buttons made, at the center of the
 * view, with its properties open: circle r 2, rectangle 4 × 3, oval 5 × 3,
 * triangle 4 × 3 (now an outline).
 */
export async function addPlainShape(page: Page, type: 'circle' | 'rect' | 'oval' | 'triangle') {
  await addKind(page, 'plain', type);
  const taps: Record<typeof type, [number, number][]> = {
    circle: [[-2, 0], [2, 0]], // edge to opposite edge
    rect: [[-2, -1.5], [2, -1.5], [0, 1.5]],
    oval: [[-2.5, 0], [2.5, 0], [0, -1.5]],
    triangle: [[-2, 1.5], [2, 1.5], [-2, -1.5]],
  };
  for (const [x, y] of taps[type]) await tapFromCenter(page, x, y);
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  await page.locator('.sel-pill .edit').click();
  await expect(page.locator('.sheet .lockbtn')).toBeVisible(); // (the properties sheet)
  await openSections(page);
}

/**
 * Open every collapsed group in the properties sheet. Opened groups stay open
 * for the rest of the page's life, so later sheets show them too.
 */
export async function openSections(page: Page) {
  const closed = page.locator('.sheet .prop-head[aria-expanded=false]');
  while (await closed.count()) await closed.first().click();
}

/** In the open properties sheet: say what the selection is (opens the list behind Change). */
export async function setRole(page: Page, role: string) {
  const change = page.locator('.sheet [data-testid=change-kind]');
  if (await change.count()) await change.click();
  await page.locator('.sheet .role-chip', { hasText: role }).first().click();
  await openSections(page); // a new role can bring new groups (a bed's plants, a sun record)
}

/** Open the Export sheet (in the ⋮ menu). */
export async function openExport(page: Page) {
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Export image' }).click();
}

/** After picking a plant: tap the middle of the plan once, then Done (what one tap used to do). */
export async function placeOnceAtCenter(page: Page) {
  await expect(page.getByTestId('place-bar')).toBeVisible();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
}

/** Open the plant picker's filters (one fold for them all, folded to start), if they're shut. */
export async function openFilters(page: Page) {
  const b = page.getByTestId('filters');
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
}

/** ⋮ → Settings (text and label size, drawing, warnings: Jason, Oct 31). */
export async function openSettings(page: Page) {
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-settings').click();
}

/** Settings → Warnings, opened if it's folded (Settings already open). */
export async function openWarnings(page: Page) {
  const fold = page.getByTestId('warnings');
  if ((await fold.getAttribute('open')) === null) await fold.locator(':scope > summary').click();
}
