import { test, expect, type Page } from '@playwright/test';
import { closeSheet, openFresh, openSections, openWarnings, tapFromCenter, openSettings } from './helpers';

// A warning dismissed for one copy of a plant is dismissed for its other copies and the ones added later, in this plan,
// with a toast that says so (Jason, Oct 30). Shown again from Settings → Warnings.

const TABLE = {
  v: 1, accessed: '2026-10-17',
  zips: { '71923': ['8a', 0, 3] },
  stations: [{ name: 'Arkadelphia 2 N, AR', chance: 100, spring: '03-24', springLate: '04-08', fall: '11-06', fallEarly: '10-24' }],
};
const badges = (page: Page) => page.locator('#canvas-svg [data-role=hardy-warning]');
async function place(page: Page, name: string, spots: [number, number][]) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  for (const [x, y] of spots) await tapFromCenter(page, x, y);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
}

test('dismissing a hardiness warning on one copy dismisses it for every copy and new ones; Settings shows it again', async ({ page }) => {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Garden location' }).click();
  await page.getByTestId('zip').fill('71923');
  await page.getByTestId('zip-lookup').click();
  await expect(page.getByTestId('location-result')).toContainText('8a');
  await closeSheet(page);
  await place(page, 'Barbados aloe', [[-4, 0], [4, 0]]);
  await expect(badges(page)).toHaveCount(2);
  await page.getByTestId('hardy-notice').getByRole('button', { name: 'Leave it' }).click();
  // One copy's pane: Dismiss, said for both and the ones to come.
  await tapFromCenter(page, -4, 0);
  await page.locator('.sel-pill .edit').click();
  await openSections(page);
  await page.getByTestId('hardy-dismiss').click();
  await expect(page.getByTestId('dismiss-notice')).toContainText('Hardiness warning dismissed for all 2 of Barbados aloe in this plan, and any you add later.');
  await expect(page.getByTestId('hardy-check')).toContainText('dismissed for every one in this plan');
  await closeSheet(page);
  await page.keyboard.press('Escape');
  await expect(badges(page)).toHaveCount(0);
  // A third: no notice, no badge.
  await place(page, 'Barbados aloe', [[0, 5]]);
  await expect(page.getByTestId('hardy-notice')).toHaveCount(0);
  await expect(badges(page)).toHaveCount(0);
  // Settings → Warnings lists it, dismissed, to show again: every copy's badge is back.
  await openSettings(page);
  await openWarnings(page);
  await expect(page.getByTestId('warnings-now').locator('summary')).toHaveText('In this plan now \u00b7 1 dismissed');
  await page.getByTestId('warnings-now').locator('summary').click();
  const row = page.getByTestId('warning-row');
  await expect(row).toHaveAttribute('data-dismissed', 'true');
  await expect(row).toContainText(/^Barbados aloe \u00d73: Too cold for zone/);
  await row.getByRole('button', { name: 'Show again' }).click();
  await expect(row).toHaveAttribute('data-dismissed', 'false');
  await expect(row.getByRole('button', { name: 'Show again' })).toHaveCount(0);
  await closeSheet(page);
  await expect(badges(page)).toHaveCount(3);
});
