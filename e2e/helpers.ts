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
