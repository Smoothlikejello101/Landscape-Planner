import { test, expect, type Page } from '@playwright/test';
import { openFresh, autoDialogs, shapeCount, zoomPct, closeSheet, canvasBox, field, drag, addPlainShape } from './helpers';

async function addShape(page: Page, cls: string) {
  await addPlainShape(page, ({ circle: 'circle', rect: 'rect', oval: 'oval', tri: 'triangle' } as const)[cls as 'circle']);
}

test.describe('core editing', () => {
  test('starts with a default project and an empty-canvas hint', async ({ page }) => {
    await openFresh(page);
    await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');
    await expect(page.locator('.empty-hint')).toBeVisible();
    expect(await shapeCount(page)).toBe(0);
  });

  test('adds each shape type', async ({ page }) => {
    await openFresh(page);
    for (const [cls, title] of [['circle', 'Circle'], ['rect', 'Rectangle'], ['oval', 'Oval'], ['tri', 'Outline']]) {
      await addShape(page, cls);
      await expect(page.locator('.sheet-header .title')).toHaveText(`${title} properties`);
      await closeSheet(page);
    }
    expect(await shapeCount(page)).toBe(4);
    const svg = page.locator('#canvas-svg');
    await expect(svg.locator('circle')).toHaveCount(1);
    await expect(svg.locator('ellipse')).toHaveCount(1);
    await expect(svg.locator('polygon')).toHaveCount(1);
  });

  test('typing in the label field keeps the same input focused (Android keyboard safety)', async ({ page }) => {
    await openFresh(page);
    await addShape(page, 'circle');
    const label = field(page, 'Label');
    await label.click();
    const handle = await label.elementHandle();
    await page.keyboard.type('Red Oak', { delay: 20 });
    expect(await handle!.evaluate((n) => n.isConnected && document.activeElement === n)).toBe(true);
    await expect(label).toHaveValue('Red Oak');
    await expect(page.locator('#canvas-svg text', { hasText: 'Red Oak' })).toHaveCount(1);
  });

  test('picking a color swatch updates the shape and the selected ring', async ({ page }) => {
    await openFresh(page);
    await addShape(page, 'circle');
    const swatch = page.locator('.swatch').nth(8); // #ef4444
    await swatch.click();
    await expect(page.locator('.swatch').nth(8)).toHaveClass(/sel/);
    await expect(page.locator('#canvas-svg circle').first()).toHaveAttribute('fill', '#ef4444');
  });

  test('the rotation control applies', async ({ page }) => {
    await openFresh(page);
    await addShape(page, 'rect');
    await page.locator('.rot-quick button', { hasText: '+15°' }).click();
    await expect(page.locator('#canvas-svg rect[data-shape-id]')).toHaveAttribute('transform', /rotate\(15 /);
  });

  test('undo and redo', async ({ page }) => {
    await openFresh(page);
    await addShape(page, 'circle');
    await closeSheet(page);
    await addShape(page, 'rect');
    await closeSheet(page);
    expect(await shapeCount(page)).toBe(2);
    await page.locator('button[title=Undo]').click();
    expect(await shapeCount(page)).toBe(1);
    await page.locator('button[title=Undo]').click();
    expect(await shapeCount(page)).toBe(0);
    await expect(page.locator('button[title=Undo]')).toBeDisabled();
    await page.locator('button[title=Redo]').click();
    expect(await shapeCount(page)).toBe(1);
  });

  test('shapes persist across reload', async ({ page }) => {
    await openFresh(page);
    await addShape(page, 'circle');
    await field(page, 'Label').fill('Keep me');
    await closeSheet(page);
    await page.waitForTimeout(800); // debounced save
    await page.reload();
    await expect(page.locator('#canvas-svg text', { hasText: 'Keep me' })).toHaveCount(1);
    expect(await shapeCount(page)).toBe(1);
  });

  test('dragging a shape moves it in snapped feet', async ({ page }) => {
    await openFresh(page);
    await addShape(page, 'circle');
    const x0 = Number(await field(page, 'X position').inputValue());
    await closeSheet(page);
    const c = await page.locator('#canvas-svg circle').first().boundingBox();
    const cx = c!.x + c!.width / 2, cy = c!.y + c!.height / 2;
    await drag(page, { x: cx, y: cy }, { x: cx + 48, y: cy }); // 48px = 2ft at 100%
    await page.locator('.sel-pill button.edit').click();
    expect(Number(await field(page, 'X position').inputValue())).toBe(x0 + 2);
  });
});

test.describe('navigation', () => {
  test('panning moves shapes on screen and zoom buttons change zoom', async ({ page }) => {
    await openFresh(page);
    await addShape(page, 'circle');
    await closeSheet(page);
    const before = await page.locator('#canvas-svg circle').first().boundingBox();
    const box = await canvasBox(page);
    await drag(page, { x: box.x + 40, y: box.y + 60 }, { x: box.x + 140, y: box.y + 60 });
    const after = await page.locator('#canvas-svg circle').first().boundingBox();
    expect(Math.round(after!.x - before!.x)).toBe(100);
    expect(await zoomPct(page)).toBe(100);
    await page.locator('.zoombtn').first().click();
    expect(await zoomPct(page)).toBe(125);
    await page.locator('.zoombtn').nth(1).click();
    expect(await zoomPct(page)).toBe(100);
  });

  test('two-pointer pinch zooms', async ({ page }) => {
    await openFresh(page);
    const box = await canvasBox(page);
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.evaluate(({ cx, cy }) => {
      const fire = (type: string, id: number, x: number, y: number) => {
        const svg = document.getElementById('canvas-svg')!;
        svg.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, pointerType: 'touch' }));
      };
      fire('pointerdown', 1, cx - 50, cy);
      fire('pointerdown', 2, cx + 50, cy);
      for (let i = 1; i <= 10; i++) fire('pointermove', 2, cx + 50 + i * 10, cy);
      fire('pointerup', 2, cx + 150, cy);
      fire('pointerup', 1, cx - 50, cy);
    }, { cx, cy });
    expect(await zoomPct(page)).toBe(200);
  });
});

test('a finger lifted over the toolbar does not turn the next drag into a pinch', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'circle');
  await closeSheet(page);
  const before = await page.locator('#canvas-svg circle').first().boundingBox();
  const box = await canvasBox(page);
  await page.evaluate(({ x, y }) => {
    const svg = () => document.getElementById('canvas-svg')!;
    const ev = (type: string, id: number, cx: number, cy: number) =>
      new PointerEvent(type, { pointerId: id, clientX: cx, clientY: cy, bubbles: true, pointerType: 'touch' });
    const grid = document.elementFromPoint(x, y)!;
    // First touch pans, then lifts while over the bottom toolbar.
    grid.dispatchEvent(ev('pointerdown', 11, x, y));
    svg().dispatchEvent(ev('pointermove', 11, x, y + 10));
    document.querySelector('.bottom-toolbar')!.dispatchEvent(ev('pointerup', 11, x, y + 10));
    // Second touch: an ordinary one-finger pan of 100 px to the right.
    document.elementFromPoint(x, y)!.dispatchEvent(ev('pointerdown', 12, x, y));
    for (let i = 1; i <= 10; i++) svg().dispatchEvent(ev('pointermove', 12, x + i * 10, y));
    svg().dispatchEvent(ev('pointerup', 12, x + 100, y));
  }, { x: box.x + 30, y: box.y + 60 });
  expect(await zoomPct(page)).toBe(100);
  const after = await page.locator('#canvas-svg circle').first().boundingBox();
  expect(Math.round(after!.x - before!.x)).toBe(100);
  expect(Math.round(after!.y - before!.y)).toBe(10);
});

test.describe('projects and selection', () => {
  test('projects are isolated and the clipboard crosses projects', async ({ page }) => {
    autoDialogs(page, 'Front Yard');
    await openFresh(page);
    await addShape(page, 'circle');
    await field(page, 'Label').fill('Moved plant');
    await closeSheet(page);
    // copy via multi-select bar requires 2+; use keyboard copy on desktop-style path instead
    await page.locator('#canvas-svg').focus().catch(() => {});
    await page.keyboard.press('Control+c');
    await page.locator('.project-btn').click();
    await page.locator('button', { hasText: 'New project' }).click();
    await expect(page.locator('.project-btn .pname')).toHaveText('Front Yard');
    expect(await shapeCount(page)).toBe(0);
    await page.locator('button[title=More]').click();
    await page.locator('.menu-item', { hasText: 'Paste 1 shape' }).click();
    expect(await shapeCount(page)).toBe(1);
    await expect(page.locator('#canvas-svg text', { hasText: 'Moved plant' })).toHaveCount(1);
    // switch back
    await page.locator('.project-btn').click();
    await page.locator('.proj-row', { hasText: 'My Garden' }).click();
    await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');
    expect(await shapeCount(page)).toBe(1);
  });

  test('lasso selects several shapes and they move together', async ({ page }) => {
    await openFresh(page);
    await addShape(page, 'circle');
    await closeSheet(page);
    await addShape(page, 'circle');
    await closeSheet(page);
    // second circle sits on top of the first; move it off with a drag
    let c = await page.locator('#canvas-svg circle').last().boundingBox();
    await drag(page, { x: c!.x + c!.width / 2, y: c!.y + c!.height / 2 }, { x: c!.x + c!.width / 2 + 120, y: c!.y + c!.height / 2 });
    await page.locator('button[title=More]').click();
    await page.locator('.menu-item', { hasText: 'Switch to select mode' }).click();
    await expect(page.locator('.mode-banner')).toContainText('Select mode');
    const box = await canvasBox(page);
    await drag(page, { x: box.x + 10, y: box.y + 70 }, { x: box.x + box.width - 50, y: box.y + box.height - 70 });
    await expect(page.locator('.multi-bar .count')).toHaveText('2 selected');
    const before = await page.locator('#canvas-svg circle').first().boundingBox();
    c = await page.locator('#canvas-svg circle').last().boundingBox();
    await drag(page, { x: c!.x + c!.width / 2, y: c!.y + c!.height / 2 }, { x: c!.x + c!.width / 2, y: c!.y + c!.height / 2 + 48 });
    const after = await page.locator('#canvas-svg circle').first().boundingBox();
    expect(Math.round(after!.y - before!.y)).toBe(48);
  });

  test('legacy single-project data migrates into "My Garden"', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('landscape-planner-v1', JSON.stringify({
        shapes: [{ id: 'a1', type: 'circle', x: 5, y: 5, radius: 2, color: '#16a34a', label: 'Legacy Oak' }],
        zoom: 1, offsetX: -10, offsetY: -10,
      }));
    });
    await page.goto('./');
    await expect(page.locator('.project-btn .pname')).toHaveText('My Garden');
    await expect(page.locator('#canvas-svg text', { hasText: 'Legacy Oak' })).toHaveCount(1);
  });
});

test.describe('plants, background, export', () => {
  test('plant picker places a circle sized to mature spread', async ({ page }) => {
    await openFresh(page);
    await page.locator('.tool-btn.plants').click();
    await expect(page.locator('.sheet-header .title')).toContainText('Plant Picker (820)');
    await page.locator('.sheet input[type=text]').fill('Autumn Bride');
    await page.locator('.sheet .proj-row', { hasText: "Heuchera 'Autumn Bride'" }).click();
    expect(await shapeCount(page)).toBe(1);
    await expect(page.locator('.sel-pill .name')).toContainText('Autumn Bride');
    await page.locator('.sel-pill button.edit').click();
    await expect(field(page, 'Radius')).toHaveValue('1.25'); // 2.5 ft spread, drawn 2.5 ft across
  });

  test('background image two-point calibration sets the scale', async ({ page }) => {
    autoDialogs(page);
    await openFresh(page);
    await page.locator('button[title=More]').click();
    await page.locator('.menu-item', { hasText: 'background image' }).click();
    await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
    await expect(page.locator('.mode-banner')).toContainText('Calibrating');
    const box = await canvasBox(page);
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.click(cx - 50, cy);
    await expect(page.locator('.mode-banner')).toContainText('second known point');
    await page.mouse.click(cx + 50, cy);
    await page.locator('.modal input[type=number]').fill('10');
    await page.locator('.modal button', { hasText: 'Set scale' }).click();
    await expect(page.locator('.sheet')).toContainText('Current scale: 4.2 pixels per foot');
    await expect(page.locator('.sheet')).toContainText('Image covers ~122.9 × 122.9 ft');
  });

  test('dragging the rotation handle a quarter turn rotates the background 90°', async ({ page }) => {
    autoDialogs(page);
    await openFresh(page);
    await page.locator('button[title=More]').click();
    await page.locator('.menu-item', { hasText: 'background image' }).click();
    await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
    await page.locator('.mode-banner button').click(); // skip calibration
    await page.locator('button[title=More]').click();
    await page.locator('.menu-item', { hasText: 'Background image' }).click();
    await page.locator('.sheet button', { hasText: 'Edit position & rotation' }).click();
    for (let i = 0; i < 6; i++) await page.locator('.zoombtn').nth(1).click(); // keep the handle's arc on screen
    const box = await canvasBox(page);
    const center = await page.locator('#canvas-svg line[stroke="#7c3aed"]').evaluate((l) => ({
      x: Number(l.getAttribute('x1')), y: Number(l.getAttribute('y1')),
    }));
    const handle = await page.locator('[data-role=bg-rot]').evaluate((c) => ({
      x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')),
    }));
    const r = center.y - handle.y; // handle sits straight above the center
    // Drag the handle from "12 o'clock" to "3 o'clock" around the center.
    const cx = box.x + center.x, cy = box.y + center.y;
    await page.mouse.move(box.x + handle.x, box.y + handle.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI / 2;
      await page.mouse.move(cx + r * Math.sin(a), cy - r * Math.cos(a));
    }
    await page.mouse.up();
    const t = await page.locator('#canvas-svg image').getAttribute('transform');
    const deg = Number(t!.match(/rotate\(([-\d.e]+)/)![1]);
    expect(Math.abs(deg - 90)).toBeLessThan(1);
  });

  test('PNG export shows a preview', async ({ page }) => {
    await openFresh(page);
    await addShape(page, 'circle');
    await closeSheet(page);
    await page.locator('button[title=Export]').click();
    await page.locator('button', { hasText: 'Download PNG' }).click();
    await expect(page.locator('.preview-img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  });
});

test('Backspace in a panel never deletes the selected shape', async ({ page }) => {
  await openFresh(page);
  await addPlainShape(page, 'circle');
  await page.getByTestId('change-kind').click();
  await page.locator('.sheet .role-chip', { hasText: 'Bed' }).focus();
  await page.keyboard.press('Backspace');
  await expect(page.locator('.sheet')).toHaveCount(1);
  expect(await shapeCount(page)).toBe(1);
});

