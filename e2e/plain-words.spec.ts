import { test, expect, type Page } from '@playwright/test';
import { addKind, openSections, planPoint, shapeCount, tapFromCenter } from './helpers';

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

test('poison, one way everywhere: "Hide plants rated toxic to:" People, Dogs, Cats, Horses; its note says by whose word, and that not rated isn\'t safe (Jason, Nov 5)', async ({ page }) => {
  await page.goto('./');
  await page.locator('.tool-btn.plants').click();
  const line = page.getByTestId('protect-line');
  await expect(line.locator('.protect-title')).toHaveText('Hide plants rated toxic to:');
  await expect(line.locator('.protect-chip')).toHaveText(['People', 'Dogs', 'Cats', 'Horses']);
  // Its note: whose word it takes, and that a plant not rated isn't safe; no skin irritant note.
  await expect(page.getByTestId('protect-note')).toHaveText(/^Hides plants NC State or an earlier list rates toxic to them\. Not rated toxic isn’t the same as safe: [\d,]+ plants have no rating yet\.$/);
  await page.getByTestId('protect-cats').click();
  await expect(page.getByTestId('active-chip')).toHaveText(['No plants rated toxic to cats']);
  await page.getByTestId('protect-dogs').click();
  await expect(page.getByTestId('active-chip')).toHaveText(['No plants rated toxic to dogs', 'No plants rated toxic to cats']);
  await expect(line).not.toContainText(/problem for|poisonous|kids|skin|rated safe/i);
  // Filters holds no other poison control: the line is the one.
  await page.getByTestId('filters').click();
  await expect(page.getByTestId('all-filters')).not.toContainText(/Poison & pets|rated safe|Show all/);
});

test('"width when grown", not "mature spread": the picker\'s size filters, a placed plant\'s size, its details\' plain row names', async ({ page }) => {
  await page.goto('./');
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('filters').click();
  await expect(page.locator('#more-filters')).toContainText('Height when grown');
  await expect(page.locator('#more-filters')).toContainText('Width when grown');
  await expect(page.locator('#more-filters')).not.toContainText(/mature/i);
  await page.getByTestId('filters').click();
  await page.getByTestId('plant-search').fill('Buttonbush');
  await page.locator('.sheet .proj-row', { hasText: 'Buttonbush' }).first().locator('[data-testid=plant-place]').click();
  await tapFromCenter(page, 0, 0);
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  await tapFromCenter(page, 0, 0);
  await page.locator('.sel-pill .edit').click();
  await openSections(page);
  await expect(page.locator('.sheet .field label', { hasText: /^Width when grown \(ft\)$/ })).toBeVisible();
  await expect(page.getByTestId('plant-size-note')).toContainText('Its width when grown:');
  await expect(page.getByTestId('about-plant')).toContainText('Takes wet soil');
  await expect(page.locator('.sheet')).not.toContainText(/mature|Spread \(ft\)|ft spread|wet feet/i);
});

/** A second visit on this device (the first was yesterday): when the install card may show. */
async function secondVisit(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('visit-seeded')) return;
    sessionStorage.setItem('visit-seeded', '1');
    const y = new Date(Date.now() - 86_400_000);
    const day = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    localStorage.setItem('lp-visits', JSON.stringify({ n: 1, day }));
  });
}
/** Chrome's offer to install, as it makes it (its beforeinstallprompt), noting when it's asked. */
async function browserOffersInstall(page: Page) {
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = async () => { (window as unknown as { __asked: boolean }).__asked = true; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
}

test('install, explained: once, on a phone’s browser, from the second visit; Install asks the browser; never again; in Help too', async ({ page, isMobile }) => {
  // The first open of a brand-new device: no card, though the browser offers it.
  await page.goto('./');
  await expect(page.locator('.project-btn .pname')).toBeVisible();
  await browserOffersInstall(page);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('install-card')).toHaveCount(0);
  // Help has it any time, with the browser's Install where it's offered.
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'Help' }).click();
  await page.getByTestId('help-q-install').click();
  await expect(page.getByTestId('help-a-install')).toContainText('Installed, FullGrown gets its own icon on your home screen, opens full screen like an app, and works without a signal.');
  await expect(page.getByTestId('help-a-install')).toContainText('On an iPhone, in Safari: Share (the square with an arrow), then Add to Home Screen.');
  await expect(page.getByTestId('help-go-install')).toBeVisible();
  // A later visit, on a phone: the card, with Install. (Not on a computer.)
  const later = await page.context().newPage();
  await secondVisit(later);
  await later.goto('./');
  await expect(later.locator('.project-btn .pname')).toBeVisible();
  await browserOffersInstall(later);
  const card = later.getByTestId('install-card');
  if (!isMobile) { await later.waitForTimeout(300); await expect(card).toHaveCount(0); return; }
  await expect(card).toContainText('Install FullGrown on this phone?');
  await expect(card).toContainText('It gets its own icon on your home screen, opens full screen like an app, and works without a signal.');
  await card.getByRole('button', { name: 'Install' }).click();
  await expect.poll(() => later.evaluate(() => (window as unknown as { __asked?: boolean }).__asked)).toBe(true);
  await expect(card).toHaveCount(0);
  // Never again.
  await later.reload();
  await expect(later.locator('.project-btn .pname')).toBeVisible();
  await browserOffersInstall(later);
  await later.waitForTimeout(300);
  await expect(card).toHaveCount(0);
});

test.describe('on an iPhone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  test('the card gives the two steps, Share then Add to Home Screen; put away, never again', async ({ page }) => {
    await secondVisit(page);
    await page.goto('./');
    const card = page.getByTestId('install-card');
    await expect(card).toContainText('Add FullGrown to your home screen?');
    await expect(card).toContainText('To add it: Share (the square with an arrow), then Add to Home Screen.');
    await card.getByTestId('notice-close').click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.project-btn .pname')).toBeVisible();
    await page.waitForTimeout(300);
    await expect(card).toHaveCount(0);
  });
});

test('See photos: a plant\'s details link to a web image search for it, in a new tab', async ({ page }) => {
  await page.goto('./');
  await page.locator('.tool-btn.plants').click();
  await page.getByTestId('plant-search').fill('Buttonbush');
  await page.locator('[data-testid=plant-row]', { hasText: 'Buttonbush' }).first().click();
  const link = page.getByTestId('plant-details').first().getByTestId('see-photos');
  await expect(link).toHaveText('See photos ↗');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(new URL((await link.getAttribute('href'))!).searchParams.get('q')).toBe('Cephalanthus occidentalis Buttonbush');
});
