import { test, expect } from '@playwright/test';
import { openFresh } from './helpers';

// The garden's location, from a ZIP code (the tables are stood in for: the
// real ones are built from official data by scripts/climate/build.mjs).

const TABLE = {
  v: 1, accessed: '2026-10-17',
  zips: { '71923': ['8a', 0, 3] },
  stations: [{ name: 'Arkadelphia 2 N, AR', chance: 100, spring: '03-24', springLate: '04-08', fall: '11-06', fallEarly: '10-24' }],
};

test('a ZIP gives the zone and frost dates; the plant picker can show only plants hardy there', async ({ page }) => {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  await page.route('**/climate/100.json', (r) => r.fulfill({ status: 404, body: '' }));
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Garden location' }).click();
  const zip = page.getByTestId('zip');
  await zip.click();
  await zip.pressSequentially('10001');
  await expect(zip).toBeFocused(); // typing doesn't redraw the sheet (the phone's keyboard stays up)
  await page.getByTestId('zip-lookup').click();
  await expect(page.getByTestId('zip-problem')).toContainText('isn’t in the zone tables');
  await zip.fill('71923');
  await zip.press('Enter');
  const result = page.getByTestId('location-result');
  await expect(result).toContainText('Zone 8a');
  await expect(result).toContainText('Last spring frost: about Mar 24');
  await expect(result).toContainText('First fall frost: about Nov 6');
  await expect(result).toContainText('Arkadelphia 2 N, AR, 3 miles away');
  await expect(page.getByTestId('location')).toContainText('PRISM Group, Oregon State University, https://prism.oregonstate.edu, accessed 2026-10-17');
  await page.locator('.sheet-header .iconbtn').click();
  // Kept with the plan, across a reload.
  await page.reload();
  await page.locator('button[title=More]').click();
  await expect(page.locator('.menu-item', { hasText: 'Garden location (zone 8a)' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 300);
  // The plant picker: zones on each plant, and a filter for the plan's zone.
  await page.locator('.tool-btn.plants').click();
  const hardy = page.locator('.sheet label', { hasText: 'Hardy in zone 8a' });
  await expect(hardy).toBeVisible();
  await page.getByTestId('plant-search').fill('Pagoda dogwood'); // rated for zones 3–7
  const row = page.locator('.sheet .proj-row', { hasText: 'Pagoda dogwood' });
  await expect(row).toContainText('zones 3–7 (zone 8a may be too warm)');
  await hardy.locator('input').check();
  await expect(row).toHaveCount(0);
});

test('the plant picker offers the ZIP once: from there, back with only plants hardy here', async ({ page }) => {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('zip-prompt').click();
  await page.getByTestId('zip').fill('71923');
  await page.getByTestId('zip-lookup').click();
  // Back in the picker, filtered.
  await expect(page.getByTestId('plant-search')).toBeVisible();
  await expect(page.locator('.sheet label', { hasText: 'Hardy in zone 8a' }).locator('input')).toBeChecked();
  await expect(page.locator('#toast')).toContainText('showing plants hardy there');
  await page.getByTestId('plant-search').fill('Pagoda dogwood'); // rated for zones 3–7
  await expect(page.locator('.sheet .proj-row', { hasText: 'Pagoda dogwood' })).toHaveCount(0);
  await expect(page.getByTestId('zip-prompt')).toHaveCount(0);
});

test('closing the ZIP sheet opened from the picker goes back to the picker as it was', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('aster');
  await page.getByTestId('zip-prompt').click();
  await page.locator('.sheet-header .iconbtn').click();
  await expect(page.getByTestId('plant-search')).toHaveValue('aster');
  await expect(page.getByTestId('zip-prompt')).toBeVisible();
});

test('the ZIP offer can be put away for good', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.locator('.zip-prompt .iconbtn').click();
  await expect(page.getByTestId('zip-prompt')).toHaveCount(0);
  await page.reload();
  await page.locator('.tool-btn.plants').click();
  await expect(page.getByTestId('plant-search')).toBeVisible();
  await expect(page.getByTestId('zip-prompt')).toHaveCount(0);
});
