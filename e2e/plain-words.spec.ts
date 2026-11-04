import { test, expect, type Page } from '@playwright/test';
import { addKind, planPoint, shapeCount } from './helpers';

// Plainer words, quieter sources (the first beta testers, Sam and Kayla, and Jason's notes, Nov 2–4: "too technical and
// too wordy").

const base = { opacity: 0.65, locked: false };
const aster = (id: string, x: number, label: string) =>
  ({ ...base, color: '#16a34a', id, type: 'circle', role: 'plant', plantId: 'symphyotrichum-novae-angliae', label, x, y: 2, radius: 1.5 });

async function seeded(page: Page, shapes: object[]) {
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes: s, zoom: 1, offsetX: -6, offsetY: -6 }));
  }, shapes);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
  await expect(page.getByTestId('warnings-btn')).not.toHaveAttribute('data-state', 'checking'); // (the catalog in)
}

test("names of things in Title Case: the catalog's plants, a plan's labels that are their names, the kinds of things; a label typed stays as typed", async ({ page }) => {
  // (Placed before Nov 4: the label as the catalog wrote it then, "New England aster"; and one the person changed.)
  await seeded(page, [aster('a', 0, 'New England aster'), aster('b', 8, 'by the gate')]);
  const labels = page.locator('#canvas-svg [data-role=plant-label]');
  await expect(labels.filter({ hasText: /^New England Aster$/ }).first()).toBeAttached();
  await expect(labels.filter({ hasText: /^by the gate$/ }).first()).toBeAttached();
  await expect(labels.filter({ hasText: /^New England aster$/ })).toHaveCount(0);
  // Selected: its name in Title Case; its Label field, what the plan keeps (not rewritten).
  const at = await planPoint(page, 0, 2);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.sel-pill .name')).toHaveText('New England Aster');
  await page.locator('.sel-pill .edit').click();
  await expect(page.locator('.sheet-header .title')).toHaveText('New England Aster');
  await expect(page.locator('.sheet .field', { has: page.locator('label', { hasText: /^Label$/ }) }).locator('input')).toHaveValue('New England aster');
  await page.keyboard.press('Escape');
  // The picker: rows and a group's heading.
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('black-eyed susan');
  await expect(page.locator('.plant-item .pname', { hasText: /^Black-Eyed Susan 'American Gold Rush'$/ }).first()).toBeVisible();
  await page.getByTestId('plant-search').fill('roses');
  await expect(page.getByTestId('group-head').first()).toContainText(/Roses/);
  await page.keyboard.press('Escape');
  // The Add sheet's kinds, and a new shape's starting label.
  await page.getByTestId('add-btn').click();
  await expect(page.locator('[data-testid=add-sheet] .kind-chip[data-kind=arbor]')).toHaveText('Arbor or Pergola');
  await expect(page.locator('[data-testid=add-sheet] .kind-chip[data-kind=property]')).toHaveText('Property Line');
  await page.keyboard.press('Escape');
  await addKind(page, 'property');
  await expect(page.getByTestId('mode-strip')).toContainText('Property Line');
});

test('the ZIP sheet: the ZIP and what it’s for first; how it’s used and the sources folded under the lookup, how it’s used open from Privacy', async ({ page }) => {
  await page.goto('./');
  // From ⋮ → Garden location: both folded.
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Garden location' }).click();
  const sheet = page.getByTestId('location');
  await expect(sheet.locator('.hint').first()).toHaveText('The garden’s ZIP code gives its USDA hardiness zone, typical frost dates and the state’s plant laws.');
  const zip = await page.getByTestId('zip').boundingBox();
  const privacyHead = page.getByTestId('zip-privacy-head');
  await expect(privacyHead).toHaveText('How your ZIP is used');
  expect((await privacyHead.boundingBox())!.y).toBeGreaterThan(zip!.y); // (under the lookup)
  await expect(privacyHead).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('zip-privacy-note')).toBeHidden();
  const sourcesHead = page.getByTestId('location-sources-fold-head');
  await expect(sourcesHead).toHaveText('Sources: USDA, NOAA, U.S. Census Bureau');
  await expect(page.getByTestId('location-sources')).toBeHidden();
  await sourcesHead.click();
  await expect(page.getByTestId('location-sources')).toContainText('Zones: USDA Plant Hardiness Zone Map (2023)');
  await expect(page.getByTestId('location-sources')).toContainText('Frost dates: NOAA NCEI U.S. Climate Normals, 1991–2020');
  await privacyHead.click();
  await expect(page.getByTestId('zip-privacy-note')).toContainText('Looking it up fetches only its first three digits');
  await page.keyboard.press('Escape');
  // From the first screen's Privacy: how it's used, open.
  await page.getByTestId('zip-privacy').click();
  await expect(page.getByTestId('zip-privacy-head')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('zip-privacy-note')).toBeVisible();
  await expect(page.getByTestId('location-sources')).toBeHidden();
});
