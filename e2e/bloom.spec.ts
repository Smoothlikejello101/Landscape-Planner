import { test, expect, type Page } from '@playwright/test';
import { autoDialogs, closeSheet, field, openFresh, addPlainShape, setRole, openSections, placeOnceAtCenter } from './helpers';

async function addPlant(page: Page, name: string, x: number) {
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill(name);
  await page.locator('.sheet .proj-row', { hasText: name }).first().locator('[data-testid=plant-place]').click();
  await placeOnceAtCenter(page);
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  await field(page, 'X position').fill(String(x));
  await field(page, 'Y position').fill('1');
  await closeSheet(page);
}

test('bloom calendar for a bed and for the whole plan', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'rect');
  await field(page, 'Label').fill('Front bed');
  await setRole(page, 'Bed');
  await field(page, 'X position').fill('0');
  await field(page, 'Y position').fill('0');
  await field(page, 'Width (ft)').fill('12');
  await closeSheet(page);
  await addPlant(page, "Heuchera 'Autumn Bride'", 2);
  await addPlant(page, "Heuchera 'Autumn Bride'", 4);
  await addPlant(page, 'Little bluestem', 30); // outside the bed

  // The bed's properties show its own plants by month.
  await page.locator('button[title=Layers]').click();
  await page.locator('.layer-row', { hasText: 'Front bed' }).click();
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  const chart = page.getByTestId('bloom-chart');
  await expect(chart.locator('.bloom-name').nth(1)).toHaveText("Heuchera 'Autumn Bride' ×2");
  await expect(chart.locator('.bloom-cell.on').first()).toBeVisible();
  // (Gaps counted against what's drawn, the months by season too: Jason, Oct 31.)
  await expect(page.getByTestId('bloom-gaps')).toContainText(/Nothing here blooms in .*\. The whole plan blooms |Something is in bloom every month/);
  await closeSheet(page);

  // The whole plan, bed by bed, from the menu.
  await page.locator('.iconbtn[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Bloom calendar' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Bloom calendar');
  await expect(page.locator('.bloom-group .section-label')).toHaveText(['Front bed', 'Not in a bed']);
});

test('plants with no bloom months are listed by name, saying why; one of mine gets them from the calendar', async ({ page }) => {
  autoDialogs(page); // ("Update the placed plant to the new size?")
  await openFresh(page);
  await addPlant(page, 'Little bluestem', 30);
  // One of mine, with no bloom months.
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Backyard hosta');
  await page.getByTestId('add-own-plant').click();
  await page.getByTestId('pf-spread').fill('2');
  await page.getByTestId('pf-save').click();
  await placeOnceAtCenter(page);

  await page.locator('.iconbtn[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Bloom calendar' }).click();
  const none = page.getByTestId('bloom-none');
  await expect(none).toHaveCount(1);
  await expect(none).toContainText('No bloom months');
  await expect(page.locator('.bloom-name.none')).toHaveText('Backyard hosta');
  // (Little bluestem's season, which its sources give, runs past the earlier list's months: those by season alone,
  // where flowering records near a garden would decide, so the calendar offers a ZIP. Jason, Oct 31.)
  await expect(page.getByTestId('bloom-zip')).toHaveCount(1);
  // Add: its form, then back to the calendar with it in bloom.
  await page.getByRole('button', { name: 'Add bloom months to Backyard hosta' }).click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Edit my plant');
  await page.locator('.sheet details summary').click();
  await page.locator('.sheet details select').nth(0).selectOption('6');
  await page.locator('.sheet details select').nth(1).selectOption('7');
  await page.getByTestId('pf-save').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Bloom calendar');
  await expect(none).toHaveCount(0);
  await expect(page.locator('.bloom-name', { hasText: 'Backyard hosta' })).toBeVisible();
});

test('catalog plants with a season and no months count by the season, said so; with no ZIP, the calendar offers one and comes back', async ({ page }) => {
  await openFresh(page);
  await addPlant(page, 'Boxwood', 30);
  await page.locator('.iconbtn[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Bloom calendar' }).click();
  // (As the month slider has it: in bloom March to May, drawn faint, and counted apart, "+1": Jason, Oct 31.)
  await expect(page.getByTestId('bloom-none')).toHaveCount(0);
  await expect(page.locator('.bloom-cell.on.by-season')).toHaveCount(3);
  await expect(page.getByTestId('bloom-by-season')).toContainText(/Boxwood.*: spring/);
  await expect(page.locator('.bloom-count[data-month="4"]')).toHaveText('+1');
  await page.getByTestId('bloom-zip').click();
  await page.locator('.sheet-header .iconbtn').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('Bloom calendar');
});

test("a bed's In bloom counts stay in their own months, on a computer and on a phone (the UI review, 2026-11-01)", async ({ page }) => {
  // A bed of 12 Golden Alexanders (months known) and 12 boxwood (by season only): a spring month counts "12" and "+12".
  const plants = [['zizia-aurea', 'Golden Alexanders'], ['buxus-green-velvet-microphylla-types', "Boxwood 'Green Velvet'"]].flatMap(([plantId, label], row) =>
    Array.from({ length: 12 }, (_, i) => ({
      id: `${plantId}-${i}`, type: 'circle', x: 1.5 + i * 2.5, y: 2 + row * 3, radius: 1, color: '#16a34a', label, opacity: 0.65, locked: false, role: 'plant', plantId,
    })));
  const bed = { id: 'bed', type: 'rect', x: 0, y: 0, width: 31, height: 7, rotation: 0, color: '#92400e', label: 'Long bed', opacity: 0.65, locked: false, role: 'bed' };
  const file = { format: 'landscape-planner-project', version: 1, project: { name: 'Spring bed', lastModified: 1, data: { shapes: [bed, ...plants] } } };
  await openFresh(page);
  await page.locator('.project-btn').click();
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'bed.fullgrown.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('.project-btn .pname')).toHaveText('Spring bed');
  await page.locator('button[title=Layers]').click();
  await page.locator('.layer-row', { hasText: 'Long bed' }).click();
  await page.locator('.sel-pill button.edit').click(); await openSections(page);
  const counts = page.getByTestId('bloom-chart').locator('.bloom-count');
  await expect(counts).toHaveCount(12);
  await expect(counts.filter({ hasText: /^12\+12$/ }).first()).toBeVisible();
  // Each month's count, and its "+12" by season, clear of the next month's: none runs into another.
  const boxes = await counts.evaluateAll((cells) => cells.map((c) => {
    const r = document.createRange(); r.selectNodeContents(c);
    const b = r.getBoundingClientRect();
    return { text: c.textContent, left: b.left, right: b.right };
  }));
  const touching = boxes.slice(1).flatMap((b, i) => (b.left < boxes[i].right + 1 ? [`${boxes[i].text} | ${b.text}`] : []));
  expect(touching).toEqual([]);
});
