import { test, expect } from '@playwright/test';
import { openFresh, openSections, placeOnceAtCenter } from './helpers';

// The garden's location, from a ZIP code (the tables are stood in for: the
// real ones are built from official data by scripts/climate/build.mjs).

const TABLE = {
  v: 1, accessed: '2026-10-17',
  zips: { '71923': ['8a', 0, 3], '71901': ['8b', 0, 5] },
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
  await page.getByTestId('plant-search').fill('Speckled alder'); // rated for zones 2–6
  const row = page.locator('.sheet .proj-row', { hasText: 'Speckled alder' });
  await expect(row).toContainText('zones 2–6 (zone 8a may be too warm)');
  // Half a zone past the end of its range is outside it: not counted as hardy.
  await page.getByTestId('plant-search').fill('Pagoda dogwood'); // rated for zones 3–7 (through 7b)
  const past = page.locator('.sheet .proj-row', { hasText: 'Pagoda dogwood' });
  await expect(past).toContainText('zones 3–7 (zone 8a may be too warm)');
  // The end half-zone of its range is its edge: shown as hardy, and marked.
  await page.getByTestId('plant-search').fill('Oleander'); // rated from zone 8 (8a) to 10 (NC State)
  const edge = page.locator('.sheet .proj-row', { hasText: 'Oleander' });
  await expect(edge).toContainText('(at its cold edge in zone 8a)');
  await hardy.locator('input').check();
  await expect(edge).toHaveCount(1);
  await page.getByTestId('plant-search').fill('Pagoda dogwood');
  await expect(past).toHaveCount(0);
  await page.getByTestId('plant-search').fill('Speckled alder');
  await expect(row).toHaveCount(0);
  // Placed, its properties say what the edge means.
  await page.getByTestId('plant-search').fill('Oleander');
  await edge.locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await expect(page.getByTestId('plant-zones')).toHaveText('Hardy in zones 8–10. Zone 8a is at the cold edge of its range: give it a sheltered spot and mulch its roots for winter.');
});

test('at the warm edge of a plant\'s range: shade, and water unless it wants little', async ({ page }) => {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('zip-prompt').click();
  await page.getByTestId('zip').fill('71901');
  await page.getByTestId('zip-lookup').click();
  await page.getByTestId('plant-search').fill('Red buckeye'); // rated through zone 8 (8b), moderate water
  await expect(page.locator('.sheet .proj-row', { hasText: 'Red buckeye' })).toContainText('(at its warm edge in zone 8b)');
  await page.getByTestId('plant-search').fill('Wild lupine'); // rated through zone 8 (8b), low water
  const lead = page.locator('.sheet .proj-row', { hasText: 'Wild lupine' });
  await expect(lead).toContainText('(at its warm edge in zone 8b)');
  await lead.locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await expect(page.getByTestId('plant-zones')).toHaveText('Hardy in zones 3–8. Zone 8b is at the warm edge of its range: give it afternoon shade in summer.');
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
  await page.getByTestId('plant-search').fill('Speckled alder'); // rated for zones 2–6
  await expect(page.locator('.sheet .proj-row', { hasText: 'Speckled alder' })).toHaveCount(0);
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

test('a plant recorded growing wild in the garden\'s county or next door says so, and counts as hardy there', async ({ page }) => {
  // (The ZIP table stood in for, with Clark County; the Arkansas records are the real ones.)
  const table = { ...TABLE, zips: { '71923': ['8a', 0, 3, 5019] } };
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(table) }));
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Garden location' }).click();
  await page.getByTestId('zip').fill('71923');
  await page.getByTestId('zip-lookup').click();
  await expect(page.getByTestId('location-result')).toContainText('Zone 8a');
  await page.locator('.sheet-header .iconbtn').click();
  await page.locator('.tool-btn.plants').click();
  await page.locator('.sheet label', { hasText: 'Hardy in zone 8a' }).locator('input').check();
  // Chinquapin oak: rated to zone 7 by NC State, but recorded wild in Clark County (the Arkansas atlas).
  await page.getByTestId('plant-search').fill('Chinquapin oak');
  const oak = page.locator('.plant-item', { hasText: 'Chinquapin oak' });
  await expect(oak).toContainText('(zone 8a may be too warm, though it grows wild nearby)');
  await oak.getByTestId('plant-row').click();
  await expect(oak.getByTestId('wild-here')).toContainText('Recorded growing wild in Clark County');
  await expect(oak.getByTestId('wild-here')).toContainText('Atlas of the Vascular Plants of Arkansas');
  // Bishop's cap: rated the same, recorded only in the Ozarks: not hardy here.
  await page.getByTestId('plant-search').fill("Bishop's cap");
  await expect(page.locator('.plant-item', { hasText: "Bishop's cap" })).toHaveCount(0);
});
