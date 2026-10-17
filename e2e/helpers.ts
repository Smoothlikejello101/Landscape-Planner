import { expect, type Page } from '@playwright/test';

/** Fresh app with empty storage. */
export async function openFresh(page: Page) {
  await page.goto('./');
  await expect(page.locator('.project-btn .pname')).toBeVisible();
}

/** Accept every native dialog (alert/confirm), answering prompts with `answer`. */
export function autoDialogs(page: Page, answer = '') {
  const seen: string[] = [];
  page.on('dialog', async (d) => {
    seen.push(d.message());
    if (d.type() === 'prompt') await d.accept(answer);
    else await d.accept();
  });
  return seen;
}

/** "N shapes" count from the top bar. */
export async function shapeCount(page: Page): Promise<number> {
  const txt = await page.locator('.project-btn .pinfo').innerText();
  return Number(txt.match(/(\d+) shapes?/)![1]);
}

export async function zoomPct(page: Page): Promise<number> {
  const txt = await page.locator('.project-btn .pinfo').innerText();
  return Number(txt.match(/(\d+)%/)![1]);
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
    circle: [[0, 0], [2, 0]],
    rect: [[-2, -1.5], [2, -1.5], [0, 1.5]],
    oval: [[-2.5, 0], [2.5, 0], [0, -1.5]],
    triangle: [[-2, 1.5], [2, 1.5], [-2, -1.5]],
  };
  for (const [x, y] of taps[type]) await tapFromCenter(page, x, y);
  await expect(page.getByTestId('draw-bar')).toHaveCount(0);
  await page.locator('.sel-pill .edit').click();
  await expect(page.locator('.sheet-header .title')).toContainText('properties');
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

/** After picking a plant: tap the middle of the plan once, then Done (what one tap used to do). */
export async function placeOnceAtCenter(page: Page) {
  await expect(page.getByTestId('place-bar')).toBeVisible();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
}
