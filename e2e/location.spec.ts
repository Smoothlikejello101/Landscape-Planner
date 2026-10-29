import { test, expect } from '@playwright/test';
import { openFilters, openFresh, openSections, placeOnceAtCenter } from './helpers';

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
  await expect(row.getByTestId('row-hardy')).toHaveText('May be too warm here');
  await expect(row.getByTestId('row-hardy')).toHaveClass(/hardy-no/);
  // Half a zone past the end of its range is outside it: not counted as hardy.
  await page.getByTestId('plant-search').fill('Pagoda dogwood'); // rated for zones 3–7 (through 7b)
  const past = page.locator('.sheet .proj-row', { hasText: 'Pagoda dogwood' });
  await expect(past.getByTestId('row-hardy')).toHaveText('May be too warm here');
  // The end half-zone of its range is its edge: shown as hardy, and marked.
  await page.getByTestId('plant-search').fill('Oleander'); // rated from zone 8 (8a) to 10 (NC State)
  const edge = page.locator('.sheet .plant-item').filter({ has: page.locator('.pname', { hasText: /^Oleander$/ }) });
  await expect(edge.getByTestId('row-hardy')).toHaveText('Hardy here, at its cold edge');
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
  await page.getByTestId('hardy-here').click(); // (no ZIP yet: asks for one)
  await page.getByTestId('zip').fill('71901');
  await page.getByTestId('zip-lookup').click();
  await page.getByTestId('plant-search').fill('Red buckeye'); // rated through zone 8 (8b), moderate water
  await expect(page.locator('.sheet .proj-row', { hasText: 'Red buckeye' }).getByTestId('row-hardy')).toHaveText('Hardy here, at its warm edge');
  await page.getByTestId('plant-search').fill('Wild lupine'); // rated through zone 8 (8b), low water
  const lead = page.locator('.sheet .proj-row', { hasText: 'Wild lupine' });
  await expect(lead.getByTestId('row-hardy')).toHaveText('Hardy here, at its warm edge');
  await lead.locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await expect(page.getByTestId('plant-zones')).toHaveText('Hardy in zones 3–8. Zone 8b is at the warm edge of its range: give it afternoon shade in summer.');
});

test('"Hardy in your zone" with no ZIP asks for one, and comes back with only plants hardy there, the other filters kept', async ({ page }) => {
  await page.route('**/climate/719.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) }));
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await openFilters(page);
  await page.locator('.sheet select[aria-label=Form]').selectOption('Shrub');
  await page.locator('[data-testid=flower-colors] label', { hasText: 'White' }).click();
  await expect(page.locator('.sheet label', { hasText: 'Hardy in your zone' })).toContainText('(asks for your ZIP)');
  await page.getByTestId('hardy-here').click();
  await page.getByTestId('zip').fill('71923');
  await page.getByTestId('zip-lookup').click();
  // Back in the picker, filtered, as it was.
  await expect(page.getByTestId('plant-search')).toBeVisible();
  await expect(page.locator('.sheet label', { hasText: 'Hardy in zone 8a' }).locator('input')).toBeChecked();
  await expect(page.locator('.sheet select[aria-label=Form]')).toHaveValue('Shrub');
  await expect(page.getByTestId('active-chip')).toHaveText(['Shrub', 'White flowers', 'Hardy in zone 8a']);
  await expect(page.locator('#toast')).toContainText('showing plants hardy there');
  await page.getByTestId('plant-search').fill('Speckled alder'); // rated for zones 2–6
  await expect(page.locator('.sheet .proj-row', { hasText: 'Speckled alder' })).toHaveCount(0);
  // Unticked, it's a plain filter again: no ZIP asked for.
  await page.getByTestId('hardy-here').uncheck();
  await expect(page.getByTestId('active-chip')).toHaveText(['Shrub', 'White flowers']);
});

test('closing the ZIP sheet opened from the picker goes back to the picker as it was, the filter left off', async ({ page }) => {
  await openFresh(page);
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('aster');
  await page.getByTestId('hardy-here').click();
  await expect(page.getByTestId('zip')).toBeVisible();
  await page.locator('.sheet-header .iconbtn').click();
  await expect(page.getByTestId('plant-search')).toHaveValue('aster');
  await expect(page.getByTestId('hardy-here')).not.toBeChecked();
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
  const oak = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Chinquapin oak$/ }) });
  await expect(oak.getByTestId('row-hardy')).toHaveText('May be too warm here; recorded wild nearby');
  await oak.getByTestId('plant-row').click();
  await expect(oak.getByTestId('wild-here')).toContainText('Recorded growing wild in Clark County');
  await expect(oak.getByTestId('wild-here')).toContainText('Atlas of the Vascular Plants of Arkansas');
  await expect(oak.getByTestId('native-here')).toContainText('Native to Arkansas');
  // A citation longer than a line: cut to one, and opened in full with a tap.
  const cite = oak.locator('.details-src.clipped').first();
  await expect(cite).toHaveAttribute('aria-expanded', 'false');
  const shut = (await cite.boundingBox())!.height;
  await cite.click();
  await expect(cite).toHaveAttribute('aria-expanded', 'true');
  expect((await cite.boundingBox())!.height).toBeGreaterThan(shut * 1.5);
  await expect(oak.getByTestId('wild-here')).toBeVisible(); // (the plant stays open)
  // The native-status filter offers the garden's state (Kew's checklist).
  await expect(page.getByTestId('native-filter').locator('option[value="@here"]')).toHaveText('Native to Arkansas');
  // Bishop's cap: rated the same, recorded only in the Ozarks: not hardy here.
  await page.getByTestId('plant-search').fill("Bishop's cap");
  await expect(page.locator('.plant-item', { hasText: "Bishop's cap" })).toHaveCount(0);
});

test('a plant the garden\'s state prohibits says so, with the rule', async ({ page }) => {
  // (Clark County, Arkansas: the real Arkansas file. Arkansas prohibits planting any Lythrum, its native winged loosestrife too.)
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
  await page.getByTestId('plant-search').fill('Winged loosestrife');
  const plant = page.locator('.plant-item', { hasText: 'Winged loosestrife' });
  await expect(plant.getByTestId('row-law')).toHaveText('Prohibited in Arkansas, though native to Arkansas'); // (in its row, before it's opened)
  await plant.getByTestId('plant-row').click();
  const law = plant.getByTestId('regulated-here');
  await expect(law).toContainText('Prohibited in Arkansas: no Lythrum may be planted, sold, bought or moved (2 CAR §50-709)');
  await expect(law.locator('.details-src a')).toHaveAttribute('href', /2CARpt50\.pdf/);
  await expect(law.getByTestId('law-background')).toContainText("Background: the rule's heading names purple loosestrife, which crowds out native species.");
  // Native here and banned all the same: the line says why, in plain words.
  await expect(law.getByTestId('law-native')).toHaveText('Native to Arkansas, but this rule bans every Lythrum species, natives included.');
  await expect(law).not.toHaveClass(/listed/);
  // Rattlebox: listed, not banned (amber), native, and why.
  await page.getByTestId('plant-search').fill('rattlebox');
  const rattlebox = page.locator('.plant-item', { hasText: /rattlebox/i }).first();
  await expect(rattlebox.getByTestId('row-law')).toHaveClass(/listed/);
  await rattlebox.getByTestId('plant-row').click();
  await expect(rattlebox.getByTestId('regulated-here')).toHaveClass(/listed/);
  await expect(rattlebox.getByTestId('law-native')).toHaveText('Native to Arkansas, but this rule lists every Crotalaria species, natives included.');
  // And a documented fact about the plants it names, with its source: why a list might include them, never the rule's reason.
  await expect(rattlebox.getByTestId('law-background')).toContainText('Background: rattlebox (Crotalaria sagittalis) is poisonous to livestock in all its parts.');
  await expect(rattlebox.getByTestId('law-background').locator('a')).toHaveAttribute('href', 'https://warcapps.usgs.gov/PlantID/Species/Details/880');
  // Chinaberry: on Texas's list, not Arkansas's: nothing said here.
  await page.getByTestId('plant-search').fill('Chinaberry');
  const chinaberry = page.locator('.plant-item', { hasText: 'Chinaberry' });
  await chinaberry.getByTestId('plant-row').click();
  await expect(chinaberry.locator('.plant-details')).toBeVisible();
  await expect(chinaberry.getByTestId('regulated-here')).toHaveCount(0);
  await expect(chinaberry.getByTestId('row-law')).toHaveCount(0);
});

test('a plant not native here that is recorded growing wild here says so, with its counties', async ({ page }) => {
  // (Clark County, Arkansas: the real Arkansas file. Chinese privet: introduced by Kew's checklist, recorded wild across the state.)
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
  await page.getByTestId('plant-search').fill('Chinese privet');
  const privet = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Chinese privet$/ }) });
  await expect(privet.getByTestId('row-escape')).toHaveText(/^Not native; recorded wild in \d+ of 75 Arkansas counties$/);
  await privet.getByTestId('plant-row').click();
  await expect(privet.getByTestId('native-here')).toContainText(/Not native to Arkansas; recorded growing wild in \d+ of its 75 counties/);
  // A native, recorded wild nearby: no such line.
  await page.getByTestId('plant-search').fill('Chinquapin oak');
  const oak = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Chinquapin oak$/ }) });
  await expect(oak.getByTestId('plant-row')).toBeVisible();
  await expect(oak.getByTestId('row-escape')).toHaveCount(0);
  // Introduced, recorded nowhere wild in the state: introduced, said plainly; no row line.
  await page.getByTestId('plant-search').fill('Sasanqua');
  // (The species, not a cultivar of it: 'Our Linda' says its species is introduced.)
  const camellia = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Sasanqua camellia(?! ')/ }) }).first();
  await expect(camellia.getByTestId('plant-row')).toBeVisible();
  await expect(camellia.getByTestId('row-escape')).toHaveCount(0);
  await camellia.getByTestId('plant-row').click();
  await expect(camellia.getByTestId('native-here')).toContainText('Introduced in Arkansas (not native there)');
});
