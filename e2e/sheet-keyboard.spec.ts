import { test, expect, type Locator, type Page } from '@playwright/test';
import { openFresh } from './helpers';

// A text field in a sheet on a phone, as Android's keyboard and spelling menu come and go (Jason, Nov 5, on the
// release: "Huchera" in Add a plant tapped, the spelling menu and the keyboard came and went over and over, and the
// whole sheet jumped up and down with them, the plan above flashing). The keyboard here is the window made shorter, as
// Android Chrome makes it (index.html: interactive-widget=resizes-content); the spelling menu, the window losing the
// focus and getting it back, as Chrome's menu does to the page (the field blurred and focused again, the cursor kept).
// A sheet's top stays where it is through all of it: src/keyboard.ts, styles.css .sheet.

test.skip(({ isMobile }) => !isMobile, 'a phone\'s keyboard');

/** The keyboard's height (px): about a phone's. */
const KB = 290;

async function copyHeuchera(page: Page) {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill("Heuchera 'Autumn Bride'");
  await page.locator('.proj-row', { hasText: "Heuchera 'Autumn Bride'" }).first().getByRole('button', { name: /Copy as my plant/ }).click();
  await expect(page.locator('.sheet .banner')).toContainText("Starting from Heuchera 'Autumn Bride'");
}
const top = async (l: Locator) => (await l.boundingBox())!.y;

/** From now on, every move of the sheet's title or of a field, frame by frame; and whether the sheet is drawn again. */
async function watch(page: Page, testid: string) {
  await page.evaluate((id) => {
    const w = window as unknown as { __moves: string[] };
    w.__moves = [];
    const sheet = document.querySelector('.overlay .sheet') as HTMLElement & { __same?: boolean };
    sheet.__same = true;
    const title = sheet.querySelector('.sheet-header')!, field = document.querySelector(`[data-testid="${id}"]`)!;
    const now = () => [title.getBoundingClientRect().top, field.getBoundingClientRect().top];
    let was = now();
    const tick = () => {
      if (!field.isConnected) return;
      const at = now();
      if (Math.abs(at[0] - was[0]) > 0.5 || Math.abs(at[1] - was[1]) > 0.5) {
        w.__moves.push(`sheet ${Math.round(was[0])}→${Math.round(at[0])}, field ${Math.round(was[1])}→${Math.round(at[1])}`);
      }
      was = at;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, testid);
}
const moves = (page: Page) => page.evaluate(() => (window as unknown as { __moves: string[] }).__moves);
const sameSheet = (page: Page) => page.evaluate(() => !!(document.querySelector('.overlay .sheet') as HTMLElement & { __same?: boolean } | null)?.__same);

/** Chrome's spelling menu opening over the page: its window loses the focus (the field is blurred; it keeps the cursor). */
const menuOpens = (page: Page) => page.evaluate(() => {
  const f = document.activeElement as HTMLElement;
  f.dispatchEvent(new FocusEvent('blur'));
  f.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  window.dispatchEvent(new FocusEvent('blur'));
});
/** And closing: the window has the focus again, and so does the field. */
const menuCloses = (page: Page) => page.evaluate(() => {
  window.dispatchEvent(new FocusEvent('focus'));
  const f = document.activeElement as HTMLElement;
  f.dispatchEvent(new FocusEvent('focus'));
  f.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
});

test('the keyboard and the spelling menu coming and going, over and over, never move the sheet, nor take its field\'s cursor (Jason, Nov 5)', async ({ page }) => {
  await copyHeuchera(page);
  const size = page.viewportSize()!;
  const short = { width: size.width, height: size.height - KB };
  const name = page.getByTestId('pf-name');
  await name.fill('Huchera');
  await name.tap();
  await page.waitForTimeout(400); // (the app's own look at the field as it's focused: src/main.ts)
  await watch(page, 'pf-name');
  const sheetAt = await top(page.locator('.overlay .sheet-header'));
  for (let i = 0; i < 3; i++) {
    await page.setViewportSize(short); // (the keyboard up: the window shorter)
    await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(short.height);
    await menuOpens(page); // (the misspelled word tapped: the menu, and the keyboard goes)
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(size.height);
    await menuCloses(page); // (the menu put away: the keyboard comes back, at the top of the loop)
  }
  await page.setViewportSize(short);
  await page.waitForTimeout(500); // (the app's look at a field focused again, and a few frames)
  // The sheet never moved, nor the field in it; nothing was drawn again; the field kept the cursor all along.
  expect(await moves(page)).toEqual([]);
  expect(await top(page.locator('.overlay .sheet-header'))).toBe(sheetAt);
  expect(await sameSheet(page)).toBe(true);
  await expect(name).toBeFocused();
  // And the word can be put right.
  await name.press('Home');
  await name.press('ArrowRight');
  await page.keyboard.type('e');
  await expect(name).toHaveValue('Heuchera');
});

test('a field low in a sheet comes into sight above the keyboard, the sheet\'s top where it was', async ({ page }) => {
  await copyHeuchera(page);
  const size = page.viewportSize()!;
  const zones = page.getByTestId('pf-zones');
  // At the sheet's foot, where the keyboard will come up over it.
  await zones.evaluate((el) => el.closest('.field')!.scrollIntoView({ block: 'end' }));
  await zones.tap();
  await expect(zones).toBeFocused();
  await page.waitForTimeout(400); // (the app's own look at the field as it's focused: src/main.ts)
  expect(await top(zones)).toBeGreaterThan(size.height - KB);
  const header = page.locator('.overlay .sheet-header');
  const sheetAt = await top(header);
  await watch(page, 'pf-zones');
  await page.setViewportSize({ width: size.width, height: size.height - KB });
  // In sight between the sheet's header and the keyboard, its label too; the sheet's top where it was.
  const label = page.locator('label[for=pf-zones]');
  await expect.poll(async () => { const b = (await zones.boundingBox())!; return b.y + b.height; }).toBeLessThanOrEqual(size.height - KB);
  const headerBox = (await header.boundingBox())!;
  expect(await top(label)).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(headerBox.y).toBe(sheetAt);
  await expect(zones).toBeFocused();
  // Brought into sight once, by scrolling the sheet; the keyboard going moves nothing.
  const scrolled = (await moves(page)).length;
  expect(scrolled).toBe(1);
  await page.setViewportSize(size);
  await page.waitForTimeout(300);
  expect((await moves(page)).length).toBe(scrolled);
  expect(await sameSheet(page)).toBe(true);
});

test('the picker, full height while its search is typed in, keeps its top as the keyboard comes and goes', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  const search = page.getByTestId('plant-search');
  await search.tap();
  const sheet = page.locator('.picker-sheet');
  await expect(sheet).toHaveClass(/\bfull\b/);
  const size = page.viewportSize()!;
  const at = await top(sheet);
  await page.setViewportSize({ width: size.width, height: size.height - KB });
  await expect(sheet).toHaveClass(/\bfull\b/);
  await page.keyboard.type('aster');
  await expect(search).toHaveValue('aster');
  expect(await top(sheet)).toBe(at);
  await expect(search).toBeFocused();
  // (Put away, the search still focused: at rest, as before; up again, full, its top where it was.)
  await page.setViewportSize(size);
  await expect(sheet).not.toHaveClass(/\bfull\b/);
  await page.setViewportSize({ width: size.width, height: size.height - KB });
  await expect(sheet).toHaveClass(/\bfull\b/);
  expect(await top(sheet)).toBe(at);
});
