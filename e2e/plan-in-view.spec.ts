import { test, expect, type Page } from '@playwright/test';
import { canvasBox, closeSheet, openFresh, shapeCount, zoomPct } from './helpers';

// The plan in view while choosing plants (Jason, Nov 2, from the bed review's S3: "Half-height picker on a phone, a
// side panel on a computer"): choosing plants for a bed, the picker covered the plan, so the bed being planted couldn't
// be seen. src/ui/picker-view.ts.

const sheet = (page: Page) => page.locator('.picker-sheet');
const handle = (page: Page) => page.getByTestId('picker-handle');
const view = async (page: Page) => (await page.locator('#canvas-svg').getAttribute('data-view'))!.split(' ').map(Number);
/** A mark on an element, to tell it's the same one later (not drawn again). */
const mark = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => { (e as HTMLElement).dataset.kept = '1'; });
const kept = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => (e as HTMLElement).dataset.kept === '1');
/** Whether a point on the page is the plan itself, nothing over it. */
const planAt = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('#canvas-svg'), [x, y]);

/** A 12 × 6 ft bed with two plants in it, and a bed behind it, the view set by `offset` (feet). */
async function seed(page: Page, offset: { x: number; y: number }) {
  await page.addInitScript((o) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const base = { color: '#16a34a', opacity: 0.65 };
    localStorage.setItem('landscape-planner-v1', JSON.stringify({
      shapes: [
        { ...base, id: 'bed', type: 'rect', x: 0, y: 0, width: 12, height: 6, rotation: 0, label: 'Front bed', role: 'bed' },
        { ...base, id: 'p1', type: 'circle', x: 3, y: 3, radius: 1, label: 'Butterfly milkweed', role: 'plant', plantId: 'asclepias-tuberosa' },
        { ...base, id: 'p2', type: 'circle', x: 9, y: 3, radius: 1, label: 'Wild columbine', role: 'plant', plantId: 'aquilegia-canadensis' },
        { ...base, id: 'back', type: 'rect', x: -2, y: -14, width: 16, height: 8, rotation: 0, label: 'Back bed', role: 'bed' },
      ],
      zoom: 1, offsetX: o.x, offsetY: o.y,
    }));
  }, offset);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(4);
}
/** A press and release at a point: a finger on a phone, the mouse on a computer. */
async function tapAt(page: Page, isMobile: boolean, x: number, y: number) {
  if (isMobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}
/** A drag on the plan: a finger on a phone (touch pointer events), the mouse on a computer. */
async function dragOn(page: Page, isMobile: boolean, from: { x: number; y: number }, to: { x: number; y: number }) {
  if (!isMobile) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Two fingers spread apart on the plan, about `at`. */
async function pinchOut(page: Page, at: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (d: number) => [{ x: at.x - d, y: at.y, id: 1 }, { x: at.x + d, y: at.y, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(20) });
  for (let d = 30; d <= 90; d += 10) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Where an element is on the page, once it's drawn (the plan is drawn again as the app starts). */
async function boxOf(l: ReturnType<Page['locator']>) {
  await expect(l).toBeVisible();
  await expect.poll(async () => !!(await l.boundingBox())).toBe(true);
  return (await l.boundingBox())!;
}
async function openPicker(page: Page) {
  await page.locator('.tool-btn.plants').click();
  await expect(sheet(page)).toBeVisible();
}

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phones only');

  test('the picker opens at half height, the plan in view above it, not dimmed; its handle, pressed or dragged, takes it to full height and back', async ({ page }) => {
    await openFresh(page);
    await openPicker(page);
    const vh = page.viewportSize()!.height;
    let box = (await sheet(page).boundingBox())!;
    expect(Math.abs(box.height - vh * 0.5)).toBeLessThan(3);
    expect(box.y + box.height).toBeCloseTo(vh, 0);
    // The plan above it is the plan, with nothing over it; the layer the picker is on is clear.
    const plan = await canvasBox(page);
    expect(await planAt(page, plan.x + plan.width / 2, (plan.y + box.y) / 2)).toBe(true);
    expect(await page.locator('.picker-overlay').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    // Pressed: full height (as the picker always was), and back.
    await expect(handle(page)).toHaveAttribute('aria-expanded', 'false');
    await handle(page).click();
    await expect(sheet(page)).toHaveClass(/\bfull\b/);
    await expect(handle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(async () => Math.round((await sheet(page).boundingBox())!.height)).toBe(Math.round(vh * 0.85));
    await handle(page).click();
    await expect(sheet(page)).not.toHaveClass(/\bfull\b/);
    await expect.poll(async () => Math.round((await sheet(page).boundingBox())!.height)).toBe(Math.round(vh * 0.5));
    // Dragged up: full; down: half; down again from half: still open, at half.
    const drag = async (dy: number) => {
      const h = (await handle(page).boundingBox())!;
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + dy, { steps: 6 });
      await page.mouse.up();
    };
    await drag(-200);
    await expect(sheet(page)).toHaveClass(/\bfull\b/);
    await drag(200);
    await expect(sheet(page)).not.toHaveClass(/\bfull\b/);
    await drag(250);
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).not.toHaveClass(/\bfull\b/);
    box = (await sheet(page).boundingBox())!;
    expect(Math.abs(box.height - vh * 0.5)).toBeLessThan(3);
    // The choice is kept while the app is open: closed and opened again, it's as it was left.
    await handle(page).click();
    await closeSheet(page);
    await openPicker(page);
    await expect(sheet(page)).toHaveClass(/\bfull\b/);
    await handle(page).click();
    // Closing is as before: its ✕, and Back.
    await page.goBack();
    await expect(sheet(page)).toHaveCount(0);
  });

  test('the search focused: full height; typing keeps the cursor and nothing is drawn again; the keyboard put away, back to half', async ({ page }) => {
    await openFresh(page);
    await openPicker(page);
    const search = page.getByTestId('plant-search');
    await mark(page, '.picker-sheet');
    await mark(page, '#canvas-svg');
    await search.tap();
    await expect(search).toBeFocused();
    await expect(sheet(page)).toHaveClass(/\bfull\b/);
    // The keyboard comes up: the page shorter (Android shrinks it). A resize, never a redraw: the same search box.
    await page.setViewportSize({ width: 412, height: 480 });
    await page.keyboard.type('aster');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('aster');
    await expect(sheet(page)).toHaveClass(/\bfull\b/);
    expect(await kept(page, '.picker-sheet')).toBe(true);
    expect(await kept(page, '#canvas-svg')).toBe(true);
    await expect(page.locator('.plant-item').first()).toBeVisible();
    // The keyboard put away (Back on Android), the search still focused: half height again, nothing redrawn.
    await page.setViewportSize({ width: 412, height: 839 });
    await expect(sheet(page)).not.toHaveClass(/\bfull\b/);
    await expect(search).toBeFocused();
    expect(await kept(page, '.picker-sheet')).toBe(true);
    // Up again (a tap in the box): full again; typing goes on.
    await page.setViewportSize({ width: 412, height: 480 });
    await expect(sheet(page)).toHaveClass(/\bfull\b/);
    await page.keyboard.type(' x');
    await expect(search).toHaveValue('aster x');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    // Enter: the search done, the keyboard goes with the cursor; half again, the results under the plan.
    await page.setViewportSize({ width: 412, height: 839 });
    await search.press('Enter');
    await expect(search).not.toBeFocused();
    await expect(sheet(page)).not.toHaveClass(/\bfull\b/);
    expect(await kept(page, '.picker-sheet')).toBe(true);
  });

  test('pinched and dragged with the picker open, the plan zooms and pans; the picker is left as it was', async ({ page }) => {
    await seed(page, { x: -3, y: -3 });
    await openPicker(page);
    await page.getByTestId('plant-search').fill('milkweed');
    await page.getByTestId('plant-search').press('Enter');
    const row = page.locator('.plant-item').first().getByTestId('plant-row');
    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await mark(page, '.picker-sheet');
    const plan = await canvasBox(page), top = (await sheet(page).boundingBox())!.y;
    const zoom = await zoomPct(page);
    await pinchOut(page, { x: plan.x + plan.width / 2, y: (plan.y + top) / 2 });
    await expect.poll(() => zoomPct(page)).toBeGreaterThan(zoom);
    const before = await view(page);
    await dragOn(page, true, { x: plan.x + 100, y: plan.y + 200 }, { x: plan.x + 220, y: plan.y + 260 });
    await expect.poll(async () => (await view(page))[0]).toBeLessThan(before[0]);
    expect(await kept(page, '.picker-sheet')).toBe(true);
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('plant-search')).toHaveValue('milkweed');
  });
});

test.describe('on a computer', () => {
  test.skip(({ isMobile }) => isMobile, 'laptops and desktops only');

  test('a panel at the right, the plan\'s height under the top bar, the plan beside it; Esc and its ✕ close it', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 820 });
    await openFresh(page);
    const planBefore = await canvasBox(page);
    await openPicker(page);
    const box = (await sheet(page).boundingBox())!, plan = await canvasBox(page);
    expect(box.width).toBeGreaterThanOrEqual(420);
    expect(box.width).toBeLessThanOrEqual(480);
    expect(box.x + box.width).toBeCloseTo(1366, 0);
    expect(box.y).toBeCloseTo(plan.y, 0); // (under the top bar, where the plan starts)
    expect(box.y + box.height).toBeCloseTo(820, 0);
    expect(plan).toEqual(planBefore); // (the plan as it was: nothing moved or resized)
    expect(await planAt(page, box.x / 2, plan.y + plan.height / 2)).toBe(true);
    await expect(handle(page)).toBeHidden();
    // The zoom buttons beside the panel, not under it.
    const zoomIn = page.locator('.zoombtn[aria-label="Zoom in"]');
    expect((await zoomIn.boundingBox())!.x + 44).toBeLessThanOrEqual(box.x);
    // Esc, from the search (the cursor starts there) or from the page after a click on the plan.
    await expect(page.getByTestId('plant-search')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await openPicker(page);
    await page.mouse.click(box.x / 2, plan.y + 100);
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await openPicker(page);
    await closeSheet(page);
  });

  test('the plan beside the panel pans and zooms; the panel is left as it was; no key edits the plan behind it', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 820 });
    await seed(page, { x: -3, y: -3 });
    const bed = page.locator('#canvas-svg [data-shape-id=bed]').first();
    const b = await boxOf(bed);
    await page.mouse.click(b.x + 10, b.y + 10);
    await expect(page.locator('.sel-pill')).toBeVisible();
    await openPicker(page);
    await page.getByTestId('plant-search').fill('milkweed');
    const row = page.locator('.plant-item').first().getByTestId('plant-row');
    await row.click();
    await mark(page, '.picker-sheet');
    const plan = await canvasBox(page);
    const before = await view(page), zoom = await zoomPct(page);
    // A drag that starts on the selected bed moves the plan, not the bed.
    const bb = (await bed.boundingBox())!;
    await dragOn(page, false, { x: bb.x + 40, y: bb.y + 40 }, { x: bb.x + 140, y: bb.y + 90 });
    await expect.poll(async () => (await view(page))[0]).toBeLessThan(before[0]);
    expect((await bed.boundingBox())!.x - bb.x).toBeCloseTo(100, 0);
    // The wheel zooms.
    await page.locator('#canvas-svg').evaluate((svg, p) => {
      svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, ctrlKey: true, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
    }, { x: plan.x + 200, y: plan.y + 200 });
    await expect.poll(() => zoomPct(page)).toBeGreaterThan(zoom);
    await page.waitForTimeout(300); // (settled: src/gestures.ts onWheel)
    expect(await kept(page, '.picker-sheet')).toBe(true);
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    // The focus on the page (a click on the plan): Delete, Ctrl+Z and a tool's key do nothing to the plan.
    await page.mouse.click(plan.x + 30, plan.y + 30);
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('b');
    expect(await shapeCount(page)).toBe(4);
    await expect(page.getByTestId('draw-bar')).toHaveCount(0);
    expect(await kept(page, '.picker-sheet')).toBe(true);
  });
});

test('a tap on the plan with the picker open picks, places and closes nothing: the search and opened rows stay', async ({ page, isMobile }) => {
  await seed(page, { x: -3, y: -3 });
  await openPicker(page);
  const search = page.getByTestId('plant-search');
  await search.fill('aster');
  if (isMobile) await search.press('Enter'); // (the keyboard away: half height)
  const row = page.locator('.plant-item').first().getByTestId('plant-row');
  await row.click();
  await mark(page, '.picker-sheet');
  // A tap on a plant, on the bed, on the empty plan.
  const p1 = (await page.locator('#canvas-svg [data-shape-id=p1]').first().boundingBox())!;
  await tapAt(page, isMobile, p1.x + p1.width / 2, p1.y + p1.height / 2);
  const bed = (await page.locator('#canvas-svg [data-shape-id=bed]').first().boundingBox())!;
  await tapAt(page, isMobile, bed.x + 6, bed.y + 6);
  const plan = await canvasBox(page);
  await tapAt(page, isMobile, plan.x + 20, plan.y + 20);
  await expect(sheet(page)).toBeVisible();
  expect(await kept(page, '.picker-sheet')).toBe(true);
  await expect(search).toHaveValue('aster');
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  // And on the top bar above the plan (the plan's name, which opens the plans): nothing.
  await tapAt(page, isMobile, 40, 20);
  expect(await kept(page, '.picker-sheet')).toBe(true);
  // Closed: nothing was selected.
  await closeSheet(page);
  await expect(page.locator('.sel-pill')).toHaveCount(0);
  expect(await shapeCount(page)).toBe(4);

  // Switching the plant while placing: a tap on the plan places nothing until a plant is picked.
  await openPicker(page);
  await search.fill('Butterfly milkweed');
  await page.locator('.plant-item', { hasText: 'Butterfly milkweed' }).first().getByTestId('plant-place').click();
  await expect(page.getByTestId('place-banner')).toContainText('0 placed');
  await page.getByTestId('place-switch').click();
  await expect(sheet(page)).toBeVisible();
  const placing = await canvasBox(page); // (under the strip that says what to do)
  await tapAt(page, isMobile, placing.x + 30, placing.y + 40);
  await expect(sheet(page)).toBeVisible();
  expect(await shapeCount(page)).toBe(4);
  await closeSheet(page);
  await expect(page.getByTestId('place-banner')).toContainText('0 placed');
});

test('opened with a bed selected, the plan pans to show it beside or above the picker, at the same zoom; closed, the view stays', async ({ page, isMobile }) => {
  // The bed low on a phone's plan (under where the picker comes up); on a computer, at the right (under the panel).
  await seed(page, isMobile ? { x: -3, y: -24 } : { x: -40, y: -6 });
  const bed = page.locator('#canvas-svg [data-shape-id=bed]').first();
  const b = await boxOf(bed);
  await tapAt(page, isMobile, b.x + 10, b.y + 10);
  await expect(page.locator('.sel-pill')).toBeVisible();
  const zoom = await zoomPct(page);
  await openPicker(page);
  const s = (await sheet(page).boundingBox())!, plan = await canvasBox(page);
  await expect.poll(async () => {
    const now = (await bed.boundingBox())!;
    return isMobile ? now.y >= plan.y && now.y + now.height <= s.y : now.x >= plan.x && now.x + now.width <= s.x;
  }).toBe(true);
  expect(await zoomPct(page)).toBe(zoom);
  const open = await view(page);
  await closeSheet(page);
  expect(await view(page)).toEqual(open);

  // A plant to swap: the same, from its details' Swap.
  const plant = page.locator('#canvas-svg [data-shape-id=p2]').first();
  // (Out of the way first: on a phone low on the plan, on a computer at its right.)
  const pv = await view(page);
  const p = (await plant.boundingBox())!;
  await page.locator('.sel-pill .pill-close').click();
  // (Clear of the zoom buttons at the plan's right.)
  const farther = isMobile ? { x: p.x, y: plan.y + plan.height - 40 } : { x: plan.x + plan.width - 140, y: p.y };
  const grab = isMobile ? { x: plan.x + plan.width / 2, y: plan.y + 20 } : { x: plan.x + 20, y: plan.y + plan.height / 2 };
  await dragOn(page, isMobile, grab, { x: grab.x + (farther.x - p.x), y: grab.y + (farther.y - p.y) });
  await expect.poll(async () => (await view(page)).join()).not.toBe(pv.join());
  const p2 = (await plant.boundingBox())!;
  await tapAt(page, isMobile, p2.x + p2.width / 2, p2.y + p2.height / 2);
  await page.locator('.sel-pill .edit').click();
  await page.getByTestId('swap-plant').click();
  await expect(page.getByTestId('swap-banner')).toBeVisible();
  const s2 = (await sheet(page).boundingBox())!;
  await expect.poll(async () => {
    const now = (await plant.boundingBox())!;
    return isMobile ? now.y + now.height <= s2.y : now.x + now.width <= s2.x;
  }).toBe(true);
  expect(await zoomPct(page)).toBe(zoom);
});

test('Compare\'s table over the picker as before, and its ← back to the picker as it was', async ({ page, isMobile }) => {
  await openFresh(page);
  await openPicker(page);
  const search = page.getByTestId('plant-search');
  await search.fill('Butterfly milkweed');
  if (isMobile) await search.press('Enter');
  const item = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Butterfly milkweed$/ }) }).first();
  await item.getByTestId('plant-row').click();
  await item.getByTestId('compare-toggle').click();
  await search.fill('Wild columbine');
  if (isMobile) await search.press('Enter');
  const second = page.locator('.plant-item').filter({ has: page.locator('.pname', { hasText: /^Wild columbine$/ }) }).first();
  await second.getByTestId('plant-row').click();
  await second.getByTestId('compare-toggle').click();
  const before = (await sheet(page).boundingBox())!;
  await page.getByTestId('compare-open').click();
  const table = page.getByTestId('compare-sheet');
  await expect(table).toBeVisible();
  const t = (await table.boundingBox())!;
  const vw = page.viewportSize()!;
  if (isMobile) {
    expect(t.height).toBeGreaterThan(before.height + 100); // (its own size, much taller than the half-height picker)
    expect(t.width).toBeCloseTo(vw.width, 0);
  } else {
    expect(t.x).toBeLessThan(before.x); // (over the plan, at its own size: wider than the panel, from the middle)
    expect(t.width).toBeGreaterThan(before.width);
  }
  await expect(page.getByTestId('compare-table')).toBeVisible();
  await page.getByTestId('compare-sheet').getByTestId('sheet-back').click();
  await expect(table).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();
  expect(await sheet(page).boundingBox()).toEqual(before);
  await expect(page.getByTestId('compare-bar')).toBeVisible();
});

test('Place works as before: picked, the picker goes, and a tap on the plan places it', async ({ page }) => {
  await openFresh(page);
  await openPicker(page);
  await page.getByTestId('plant-search').fill('Butterfly milkweed');
  await page.locator('.plant-item', { hasText: 'Butterfly milkweed' }).first().getByTestId('plant-place').click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('place-banner')).toContainText('0 placed');
  const plan = await canvasBox(page);
  await page.mouse.click(plan.x + plan.width / 2, plan.y + plan.height / 2);
  await expect(page.getByTestId('place-banner')).toContainText('1 placed');
  await page.getByTestId('place-bar').getByRole('button', { name: 'Done' }).click();
  expect(await shapeCount(page)).toBe(1);
});
