import { test, expect, type Page } from '@playwright/test';
import { openFresh, placeOnceAtCenter } from './helpers';

// Help (Jason, Nov 2, from the UI review: "'Show me around' becomes Help: 'How do I…' print, get a plant list, back
// up, undo, add my own plant, take the tour"). ⋮ → Help: Take the tour; "How do I…", each answer a few lines and a
// button that goes there; Send feedback; the privacy policy and terms (src/ui/help-sheet.ts, src/help.ts).

const QUESTIONS = [
  'Print my plan, or one bed', 'Get a plant list', 'Back up my plans, and restore them on another device', 'Undo, and redo',
  'Add my own plant', 'Set my garden’s location', 'Mark what’s dangerous to my kids or pets',
];
const base = { opacity: 0.65, locked: false };
const shapes = [
  { ...base, id: 'bed1', type: 'rect', x: 0, y: 0, width: 20, height: 10, rotation: 0, color: '#92400e', label: 'Front bed', role: 'bed' },
  { ...base, id: 'p1', type: 'circle', x: 5, y: 5, radius: 1, color: '#16a34a', label: 'Wild columbine', role: 'plant', plantId: 'aquilegia-canadensis', status: 'planned' },
];
const file = { format: 'landscape-planner-project', version: 1, project: { name: 'Front garden', lastModified: 1, data: { shapes } } };

/** A plan with a bed and a plant in it. */
async function openPlan(page: Page) {
  await openFresh(page);
  await page.locator('.project-btn').click();
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'front.fullgrown.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('.project-btn .pname')).toHaveText('Front garden');
}
const help = (page: Page) => page.getByTestId('help-sheet');
async function openHelp(page: Page) {
  await page.locator('button[title=More]').click();
  await page.getByTestId('menu-help').click();
  await expect(help(page)).toBeVisible();
}
/** Help open, a question opened, and its button (by test id) pressed: Help closes as its place opens. */
async function go(page: Page, q: string, button: string) {
  await openHelp(page);
  const toggle = page.getByTestId(`help-q-${q}`);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.getByTestId(button).click();
  await expect(help(page)).toHaveCount(0);
}
const sheetTitle = (page: Page) => page.locator('.sheet .sheet-header .title');
/** The sheet open closed with its ×. */
async function shut(page: Page) {
  await page.locator('.overlay .sheet-header button[aria-label=Close]').click();
  await expect(page.locator('.overlay')).toHaveCount(0);
}

test('⋮ has Help where Show me around was; it lists "How do I…", folded, then Send feedback and the policies', async ({ page }) => {
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await expect(page.locator('.menu-item', { hasText: 'Show me around' })).toHaveCount(0);
  await expect(page.getByTestId('menu-help')).toHaveText('Help');
  await page.getByTestId('menu-help').click();
  await expect(sheetTitle(page)).toHaveText('Help');
  await expect(page.getByTestId('help-tour')).toHaveText('Take the tour');
  await expect(page.locator('#help-how')).toHaveText('How do I…');
  await expect(page.locator('.help-q')).toHaveText(QUESTIONS);
  // Folded to start: a question opens to its answer, and closes again, in place.
  await expect(page.locator('.help-a:visible')).toHaveCount(0);
  const print = page.getByTestId('help-q-print');
  await print.click();
  await expect(print).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('help-a-print')).toContainText('⋮ → Print or save as PDF. Under What to print, choose the whole plan, what’s on screen, or one bed.');
  // (An empty plan has nothing to print: said, with no button.)
  await expect(page.getByTestId('help-go-print')).toHaveCount(0);
  await expect(page.getByTestId('help-print-empty')).toHaveText('Once the plan has something on it.');
  await print.click();
  await expect(page.getByTestId('help-a-print')).toBeHidden();
  // No Warnings with no plants (⋮ has none either); the picker, always.
  await page.getByTestId('help-q-protect').click();
  await expect(page.getByTestId('help-go-picker')).toBeVisible();
  await expect(page.getByTestId('help-go-warnings')).toHaveCount(0);
  // The policies, the only links out.
  await expect(page.getByTestId('help-policies').locator('a')).toHaveText(['Privacy policy', 'Terms']);
  await expect(page.getByTestId('help-policies').locator('a').first()).toHaveAttribute('href', 'https://fullgrown.garden/privacy/');
  await expect(page.getByTestId('help-policies').locator('a').last()).toHaveAttribute('href', 'https://fullgrown.garden/terms/');
  await expect(help(page).locator('a')).toHaveCount(2);
  // Send feedback: the feedback sheet.
  await page.getByTestId('help-feedback').click();
  await expect(page.getByTestId('feedback-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  // Esc closes Help, as any sheet.
  await openHelp(page);
  await page.keyboard.press('Escape');
  await expect(help(page)).toHaveCount(0);
});

test('Take the tour starts the guided tour, as Show me around did', async ({ page }) => {
  await openFresh(page);
  await page.getByTestId('intro-decline').click(); // ("I'll explore": the tour waits in Help)
  await openHelp(page);
  await page.getByTestId('help-tour').click();
  await expect(help(page)).toHaveCount(0);
  await expect(page.getByTestId('intro-step')).toHaveText('Step 1 of 8');
});

test('each answer\'s button goes to its place: Print, the Plant list, backup, Warnings at Poison, the location, the picker', async ({ page }) => {
  await openPlan(page);
  // Print: the sheet that asks what to print.
  await go(page, 'print', 'help-go-print');
  await expect(sheetTitle(page)).toHaveText('Printable plan');
  await expect(page.getByTestId('print-area')).toContainText('One bed');
  await shut(page);
  // The Plant list.
  await go(page, 'list', 'help-go-list');
  await expect(page.getByTestId('plant-list')).toBeVisible();
  await expect(page.getByTestId('pl-group-buy')).toContainText('Wild columbine');
  await shut(page);
  // Plans and backup, at Backup.
  await go(page, 'backup', 'help-go-backup');
  await expect(sheetTitle(page)).toHaveText('Projects (2)');
  await expect(page.getByTestId('backup-section')).toBeInViewport();
  await expect(page.getByTestId('backup-section')).toContainText('Back up all projects');
  await expect(page.getByTestId('backup-section')).toContainText('Import from file');
  await shut(page);
  // The garden's location.
  await go(page, 'location', 'help-go-location');
  await expect(sheetTitle(page)).toHaveText('Garden location');
  await expect(page.getByTestId('zip')).toBeVisible();
  await shut(page);
  // Kids and pets: the picker, and Warnings at Poison, with who's in the yard.
  await go(page, 'protect', 'help-go-picker');
  await expect(sheetTitle(page)).toHaveText(/^Plant Picker/);
  await shut(page);
  await go(page, 'protect', 'help-go-warnings');
  await expect(page.getByTestId('warnings-kind-head-poison')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('warnings-yard')).toBeVisible();
});

test('Add my own plant: the form, back to the picker, where My plants holds it', async ({ page }) => {
  await openFresh(page);
  await go(page, 'own-plant', 'help-go-own');
  await expect(sheetTitle(page)).toHaveText('Add a plant');
  await page.getByTestId('pf-name').fill('Grandma’s peony');
  await page.getByTestId('pf-spread').fill('3');
  await page.getByTestId('pf-save').click();
  await placeOnceAtCenter(page);
  // The form again from Help: its ← goes back to the picker, with My plants.
  await go(page, 'own-plant', 'help-go-own');
  await page.getByTestId('sheet-back').click();
  await expect(sheetTitle(page)).toHaveText(/^Plant Picker/);
  await expect(page.getByTestId('my-plants-fold')).toHaveText(/^My plants \(1\)/);
});

test('Undo and Redo, worded for the device: the keys on a computer, where Redo is at the text size', async ({ page, isMobile }) => {
  await openFresh(page);
  await openHelp(page);
  await page.getByTestId('help-q-undo').click();
  const answer = page.getByTestId('help-a-undo');
  // (Medium text, the default: Redo is in ⋮.)
  await expect(answer).toContainText('Redo is in ⋮, and just under Undo while there’s something to redo.');
  await expect(answer).toContainText('They’re grayed while a sheet like this one is open.');
  if (isMobile) {
    await expect(answer).not.toContainText('Ctrl');
    await expect(page.getByTestId('help-go-keys')).toHaveCount(0);
    await expect(help(page)).not.toContainText(/\b(click|tap)/i);
  } else {
    await expect(answer).toContainText('Keys: Ctrl+Z to undo, Ctrl+Y or Ctrl+Shift+Z to redo.');
    await page.getByTestId('help-go-keys').click();
    await expect(page.getByTestId('shortcuts')).toContainText('Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z)');
    await expect(help(page)).toHaveCount(0);
  }
  // The plant list's button, as it says it on this device.
  await page.keyboard.press('Escape');
  await openHelp(page);
  await page.getByTestId('help-q-list').click();
  const share = await page.evaluate(() => typeof navigator.share === 'function');
  await expect(page.getByTestId('help-a-list')).toContainText(isMobile && share ? 'Share as text' : 'Copy as text');
});
