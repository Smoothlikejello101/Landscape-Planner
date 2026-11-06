import { test, expect, type Browser, type CDPSession, type Page } from '@playwright/test';
import { shapeCount } from './helpers';

// The plan while zooming and panning on a phone (Jason, Nov 5: "the screen flashes a lot while zooming and panning. It
// isn't as bad if I turn off labels, but it still happens", on his real plan: a photo, beds, a house, about a hundred
// named plants, a bed selected). His screen recording showed frames with the plants' pictures gone and their names and
// pins left, the photo and beds out of step with the rest, the selection's bar gone. A pinch or a pan should only move
// what's drawn (and draw the grid again), with the plan drawn again on release, and the release's redraw should
// never show a frame with anything missing. Since his second recording (Nov 5), the release draws the plan alone again,
// in place: drawn again whole, the app's every element new, his phone showed two or three blank frames as the fingers
// lifted, everything gone but the zoom's badge, while Chrome painted it all anew. src/canvas.ts, src/background.ts, src/gestures.ts.

type P = { x: number; y: number; id?: number };
/** Plants of his kinds: catalog id, name, spread (radius, ft). */
const PLANTS: [string, string, number][] = [
  ['rudbeckia-maxima', 'Giant coneflower', 1.5], ['viburnum-nudum-2', "Witherod viburnum 'Brandywine'", 3], ['hibiscus-fireball', "Hibiscus 'Fireball'", 2.5],
  ['vernonia-hybrid-mt-cuba', "Ironweed 'Prairie Princess'", 1.25], ['agastache-foeniculum', 'Anise hyssop', 1], ['symphyotrichum-oblongifolium', "Aromatic aster 'October Skies'", 1],
  ['stokesia-laevis', "Stokes' aster", 0.75], ['eryngium-yuccifolium', 'Rattlesnake master', 1], ['artemisia-hybrid', "Artemisia 'Powis Castle'", 1.5],
  ['salvia-yangii', 'Russian sage', 1.5], ['muhlenbergia-capillaris', 'Pink muhly grass', 1.5], ['crocus-tommasinianus', "Crocus 'Tommies'", 0.25],
  ['tulipa-hybrids', 'Tulip', 0.3], ['baptisia-australis', 'Blue false indigo', 2], ['zizia-aurea', 'Golden Alexanders', 0.75], ['chelone-lyonii', "Turtlehead 'Hot Lips'", 1],
  ['hamamelis-vernalis', 'Ozark witch hazel', 4], ['astilbe-chinensis', "Astilbe 'Visions'", 0.75], ['heuchera-villosa', "Heuchera 'Autumn Bride'", 0.75],
  ['coreopsis-verticillata', "Threadleaf coreopsis 'Zagreb'", 1], ['itea-virginica', "Virginia sweetspire 'Little Henry'", 1.5], ['vaccinium-darrowii-john-blue', "Dwarf blueberry 'John Blue'", 1.5],
  ['phlox-divaricata', 'Woodland phlox', 0.75], ['camellia-sasanqua', 'Sasanqua camellia', 3], ['echinacea-purpurea', "Coneflower 'Magnus'", 1],
];
const base = { opacity: 0.65, locked: false, rotation: 0 };
/** Where the SW Corner bed has open ground (feet): a press there is on the bed, between its plants. */
const BED_GROUND = { x: -11.25, y: 4.6 };
/** A yard like Jason's: a house, beds, a sun area, a path, and 100 named plants, some hidden under others (their pins). */
function yard(): object[] {
  const shapes: object[] = [
    { ...base, id: 'house', type: 'rect', x: -20, y: -40, width: 40, height: 26, color: '#57534e', opacity: 0.8, role: 'building', kind: 'building', status: 'existing', label: 'House', locked: true },
    { ...base, id: 'boh', type: 'rect', x: -20, y: -14, width: 40, height: 8, color: '#92400e', opacity: 0.3, role: 'bed', kind: 'bed', status: 'planned', label: 'Back of House' },
    { ...base, id: 'sw', type: 'poly', x: -30, y: 4, points: [[0, 0], [26, 0], [28, 18], [0, 20]], color: '#92400e', opacity: 0.3, role: 'bed', kind: 'bed', status: 'planned', label: 'SW Corner' },
    { ...base, id: 'front', type: 'rect', x: 4, y: 6, width: 30, height: 12, color: '#92400e', opacity: 0.3, role: 'bed', kind: 'bed', status: 'planned', label: 'Front bed' },
    { ...base, id: 'side', type: 'rect', x: 24, y: -40, width: 8, height: 30, color: '#92400e', opacity: 0.3, role: 'bed', kind: 'bed', status: 'planned', label: 'Side bed' },
    { ...base, id: 'sun', type: 'rect', x: 24, y: -40, width: 8, height: 14, color: '#334155', opacity: 0.3, role: 'shade', kind: 'shade', label: 'Morning sun', sun: { mode: 'hours', periods: [], hours: 3, dappled: false } },
    { ...base, id: 'walk', type: 'line', x: -30, y: -2, points: [[0, 0], [60, 0]], pathWidth: 3, color: '#a8a29e', opacity: 0.7, role: 'path', kind: 'path', status: 'existing', label: 'Walk' },
  ];
  let n = 0;
  const plant = (x: number, y: number, k: number) => {
    const [plantId, label, radius] = PLANTS[k % PLANTS.length];
    shapes.push({ ...base, id: `p${n++}`, type: 'circle', x, y, radius, color: '#16a34a', role: 'plant', plantId, label, status: n % 3 ? 'planned' : 'existing' });
  };
  for (let i = 0; i < 10; i++) plant(-18 + i * 4, -10, i); // (Back of House: shrubs, bulbs between)
  for (let i = 0; i < 8; i++) plant(-17 + i * 4.5, -8, 11 + (i % 2));
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) plant(-27 + i * 4.5, 7 + j * 4, i * 4 + j + 3); // (SW Corner)
  for (let i = 0; i < 6; i++) plant(-25 + i * 1.2, 23, 11); // (a run of crocus)
  plant(-18, 12, 16); plant(-11, 16, 23); // (big shrubs over smaller plants)
  for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) plant(6 + i * 4, 8 + j * 4, i + j * 7); // (Front bed)
  for (let j = 0; j < 7; j++) plant(28, -37 + j * 4, j + 13); // (Side bed)
  for (let i = 0; i < 6; i++) plant(8 + i * 1.5, 17, 12); // (a run of tulips)
  return shapes;
}
/** His plan, at 100%, the SW Corner bed selected; with a photo 2000 × 1600 px, as busy as one taken from above. */
async function seed(page: Page) {
  const shapes = yard();
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const c = document.createElement('canvas');
    c.width = 2000; c.height = 1600;
    const g = c.getContext('2d')!;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#6b7f4a'; g.fillRect(0, 0, 2000, 1600);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `hsl(${60 + rnd() * 60},${20 + rnd() * 40}%,${20 + rnd() * 40}%)`; g.fillRect(rnd() * 2000, rnd() * 1600, 4 + rnd() * 40, 4 + rnd() * 40); }
    const bgImage = { dataUrl: c.toDataURL('image/jpeg', 0.85), naturalWidth: 2000, naturalHeight: 1600, ftPerPx: 0.06, cx: 0, cy: -8, rotation: 0, opacity: 0.75, visible: true };
    localStorage.setItem('landscape-planner-v1', JSON.stringify({ shapes: s, bgImage, zoom: 1, offsetX: -25, offsetY: -14 }));
  }, shapes);
  await page.goto('./');
  await expect.poll(() => shapeCount(page)).toBe(shapes.length);
  // (The catalog in: the plants drawn as pictures.)
  await expect.poll(() => page.locator('#canvas-svg [data-role=plant-look]').count()).toBeGreaterThan(60);
  await page.touchscreen.tap(...(await onScreen(page, BED_GROUND)));
  await expect(page.locator('.sel-pill .name')).toHaveText('SW Corner');
}
/** A point of the plan (feet) on the screen, as it's drawn now. */
async function onScreen(page: Page, p: { x: number; y: number }): Promise<[number, number]> {
  return page.evaluate((q) => {
    const plan = document.getElementById('canvas-svg')!;
    const [ox, oy, zoom] = plan.getAttribute('data-view')!.split(' ').map(Number);
    const r = plan.getBoundingClientRect();
    return [r.left + (q.x - ox) * 24 * zoom, r.top + (q.y - oy) * 24 * zoom] as [number, number];
  }, p);
}
const frame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
/** Fingers on the screen (CDP: real touches, each its own pointer). */
const touches = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: P[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i + 1 })) });

interface Frame {
  plan: boolean; view: string; groups: number; looks: number; names: number; photo: boolean; pill: boolean; buttons: boolean;
  /** Where the photo and the house are on the screen, as the plan has them: (house − photo) / photo's width, across and down. */
  step: [number, number];
}
/**
 * What every frame shows (read as each frame starts, after the touches that came in for it), and what's taken out of the
 * plan or put in (shapes' groups, the plan itself), from now on: window.__frames, window.__churn.
 */
async function watch(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __churn: string[]; __plan: Element | null; __photo: Element | null };
    w.__frames = []; w.__churn = [];
    w.__plan = document.getElementById('canvas-svg');
    w.__photo = document.querySelector('#canvas-svg image');
    const sample = () => {
      const plan = document.getElementById('canvas-svg');
      const shapes = plan?.querySelector('g[data-layer=shapes]');
      const photo = plan?.querySelector('image')?.getBoundingClientRect();
      const house = plan?.querySelector('[data-shape-id=house]')?.getBoundingClientRect();
      w.__frames.push({
        plan: plan === w.__plan, view: plan?.getAttribute('data-view') ?? '',
        groups: shapes?.querySelectorAll('g[data-shape-group]').length ?? 0,
        looks: shapes?.querySelectorAll('[data-role=plant-look]').length ?? 0,
        names: shapes?.querySelectorAll('text').length ?? 0,
        photo: plan?.querySelector('image') === w.__photo,
        pill: !!document.querySelector('.sel-pill'), buttons: !!document.querySelector('.zoombtns'),
        step: photo && house ? [Math.round(((house.left - photo.left) / photo.width) * 1e4) / 1e4, Math.round(((house.top - photo.top) / photo.width) * 1e4) / 1e4] : [NaN, NaN],
      } as Frame);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    new MutationObserver((list) => {
      for (const m of list) {
        for (const n of [...m.removedNodes, ...m.addedNodes]) {
          if (n instanceof Element && n.matches('g[data-shape-group], #canvas-svg, .sel-pill, .app')) w.__churn.push(n.id || n.className || n.getAttribute('data-shape-group') || n.tagName);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames.splice(0));
const churn = (page: Page) => page.evaluate(() => (window as unknown as { __churn: string[] }).__churn.splice(0));

/**
 * What the browser did meanwhile (a trace): names laid out again, images decoded, by Chrome's own record. Counts, not
 * times, so a slow machine gives the same answer. (Only the trace's categories they're in: "blink" has the texts'
 * layouts, "disabled-by-default-devtools.timeline" the images' decodes.)
 */
async function traced(browser: Browser, page: Page, run: () => Promise<void>) {
  await browser.startTracing(page, { categories: ['blink', 'disabled-by-default-devtools.timeline'] });
  await run();
  const events = (JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: { name: string; ph: string }[] }).traceEvents;
  const count = (name: string) => events.filter((e) => e.name === name && (e.ph === 'X' || e.ph === 'B')).length;
  return { textLayouts: count('SvgTextLayoutAlgorithm::Layout'), decodes: count('ImageDecodeTask') };
}

/** Where the SW Corner bed is (its first corner, feet), as drawn. */
const bedAt = (page: Page) => page.evaluate(() => {
  const plan = document.getElementById('canvas-svg')!;
  const [ox, oy, zoom] = plan.getAttribute('data-view')!.split(' ').map(Number);
  const [x, y] = plan.querySelector('[data-shape-id=sw]')!.getAttribute('points')!.split(' ')[0].split(',').map(Number);
  return { x: Math.round((x / (24 * zoom) + ox) * 100) / 100, y: Math.round((y / (24 * zoom) + oy) * 100) / 100 };
});

test.describe('on a phone', () => {
  test.skip(({ isMobile, browserName }) => !isMobile || browserName !== 'chromium', 'phones only (Chrome: touches and traces by CDP)');

  test('a pan and a pinch move what\'s drawn: every frame keeps the plants, the photo in step, the selection\'s bar, and lays out and decodes nothing of the plan again; the release\'s redraw keeps the photo', async ({ page, browser }) => {
    test.setTimeout(120_000);
    await seed(page);
    const cdp = await page.context().newCDPSession(page);
    const box = (await page.locator('#canvas-svg').boundingBox())!;
    const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await watch(page);
    await frame(page);
    const [rest] = await frames(page);
    expect(rest.photo && rest.pill && rest.buttons).toBe(true);
    let moves = 0;
    const work = await traced(browser, page, async () => {
      const go = async (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: P[]) => { await touches(cdp, type, pts); await frame(page); moves++; };
      // One finger pans; a second comes down and spreads (zooms in); it lifts, the first pans on; it comes back and they
      // pinch in (zoom out), as fingers do on a phone.
      const a = (i: number): P => ({ x: mid.x - 30 + i * 5, y: mid.y + i * 3, id: 1 });
      await go('touchStart', [a(0)]);
      for (let i = 1; i <= 12; i++) await go('touchMove', [a(i)]);
      const at = a(12), b = (d: number): P => ({ x: at.x - 40 - d, y: at.y - 120 - d * 1.5, id: 2 }), a2 = (d: number): P => ({ x: at.x + d, y: at.y + d * 1.5, id: 1 });
      await go('touchStart', [at, b(0)]);
      for (let d = 4; d <= 64; d += 4) await go('touchMove', [a2(d), b(d)]);
      await go('touchEnd', [a2(64)]);
      for (let i = 1; i <= 6; i++) await go('touchMove', [{ x: a2(64).x - i * 8, y: a2(64).y, id: 1 }]);
      const c = { x: a2(64).x - 48, y: a2(64).y, id: 1 };
      await go('touchStart', [c, { x: c.x - 160, y: c.y - 220, id: 2 }]);
      for (let i = 1; i <= 10; i++) await go('touchMove', [{ x: c.x - i * 6, y: c.y - i * 8, id: 1 }, { x: c.x - 160 + i * 6, y: c.y - 220 + i * 8, id: 2 }]);
    });
    // Every frame till the fingers lift: nothing of the plan drawn again (the same plan, the view it was drawn at, no
    // shape's group taken out or put in), the plants and their names all there, the photo the same and in step with
    // the house, the selection's bar and the plan's buttons there.
    let checked = 0;
    const gestureFrames = (list: Frame[]) => {
      for (const f of list) {
        const at = `frame ${++checked} of the gesture`;
        expect(f.plan && f.view === rest.view, `${at}: the plan drawn again`).toBe(true);
        expect([f.groups, f.looks, f.names], `${at}: the plants and their names all there`).toEqual([rest.groups, rest.looks, rest.names]);
        expect(f.photo, `${at}: the photo there, the same`).toBe(true);
        expect(f.step[0] / rest.step[0], `${at}: the photo and the house in step`).toBeCloseTo(1, 2);
        expect(f.step[1] / rest.step[1], `${at}: the photo and the house in step`).toBeCloseTo(1, 2);
        expect([f.pill, f.buttons], `${at}: the selection's bar and the plan's buttons there`).toEqual([true, true]);
      }
    };
    gestureFrames(await frames(page));
    expect(checked).toBeGreaterThanOrEqual(moves);
    expect(await churn(page)).toEqual([]);
    // What the phone couldn't keep up with (Chrome's own record): no frame lays out the names on the plan again (an SVG
    // text's size on the screen is part of its layout: only the grid's few labels, drawn afresh, are laid out), and the
    // photo isn't decoded again at each new size. Until Nov 5 every frame did both: here, 106 texts laid out a frame and
    // the photo decoded 45 times in 48 frames, where now it's 7 a frame and the photo once at most. (With the scene's
    // <div>s zoomed by a scale, Chrome 141, CI's, still laid out every name in each frame of a pinch, 62 a frame: they're
    // zoomed by a perspective now, src/canvas.ts previewView.)
    expect(work.textLayouts / moves, 'texts laid out a frame').toBeLessThan(rest.names / 2);
    expect(work.decodes, 'times the photo was decoded again').toBeLessThan(moves / 8);
    // The release: the plan drawn again in place, the same plan and app (nothing on the page made anew, for the browser
    // to paint from nothing), the photo the same <image> (no new one to decode, the plan drawn without it meanwhile),
    // decoded before it's drawn; then every frame as it was, but for the names that fit at the new zoom.
    let after: Frame[] = [];
    const release = await traced(browser, page, async () => {
      await touches(cdp, 'touchEnd', []);
      for (let i = 0; i < 3; i++) await frame(page);
      after = await frames(page);
    });
    gestureFrames(after.filter((f) => f.view === rest.view)); // (the fingers still down)
    after = after.filter((f) => f.view !== rest.view);
    expect(after.length).toBeGreaterThanOrEqual(3);
    const names = await page.locator('#canvas-svg g[data-layer=shapes] text').count();
    expect(release.textLayouts, 'the release redraws the plan (and the trace counts what it lays out)').toBeGreaterThanOrEqual(names);
    for (const f of after) expect([f.plan, f.groups, f.looks, f.names, f.photo, f.pill, f.buttons]).toEqual([true, rest.groups, rest.looks, names, true, true, true]);
    const made = (await churn(page)).filter((x) => typeof x === 'string' && /^(canvas-svg|app\b|sel-pill)/.test(x));
    expect(made, 'the plan, the app or the selection\'s bar made anew at the release').toEqual([]);
    await expect(page.locator('#canvas-svg image')).toHaveAttribute('decoding', 'sync');
    expect(Number(await page.locator('#canvas-svg').getAttribute('data-zoom'))).not.toBe(100);
  });

  test('a pinch begun with a finger on the selected bed zooms the plan and leaves the bed, and its plants, where they were', async ({ page }) => {
    await seed(page);
    const before = await bedAt(page);
    const zoom = await page.locator('#canvas-svg').getAttribute('data-zoom');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    const cdp = await page.context().newCDPSession(page);
    // The first finger on the bed's open ground (by touch, a selected shape drags), moving a little before the second
    // comes down: enough to drag it half a foot.
    const [x, y] = await onScreen(page, BED_GROUND);
    await touches(cdp, 'touchStart', [{ x, y, id: 1 }]);
    for (let i = 1; i <= 4; i++) { await touches(cdp, 'touchMove', [{ x: x + i * 3, y: y - i * 2, id: 1 }]); await frame(page); }
    const a = { x: x + 12, y: y - 8, id: 1 }, b = { x: x - 80, y: y - 200, id: 2 };
    await touches(cdp, 'touchStart', [a, b]);
    for (let i = 1; i <= 16; i++) { await touches(cdp, 'touchMove', [{ x: a.x + i * 3, y: a.y + i * 3, id: 1 }, { x: b.x - i * 3, y: b.y - i * 3, id: 2 }]); await frame(page); }
    await touches(cdp, 'touchEnd', []);
    await expect(page.locator('#canvas-svg')).not.toHaveAttribute('data-zoom', zoom!);
    expect(await bedAt(page)).toEqual(before);
    await expect(page.locator('.sel-pill .name')).toHaveText('SW Corner');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled(); // (nothing changed, nothing to undo)
  });

  test('a pinch begun with a finger on the photo, while it\'s being moved, zooms the plan and leaves the photo where it was', async ({ page }) => {
    await seed(page);
    await page.locator('button[title=More]').click();
    await page.locator('.menu-item', { hasText: 'Background image' }).click();
    await page.getByTestId('bg-edit').click();
    /** The photo's top left corner (feet), as drawn. */
    const photoAt = () => page.evaluate(() => {
      const plan = document.getElementById('canvas-svg')!;
      const [ox, oy, zoom] = plan.getAttribute('data-view')!.split(' ').map(Number);
      const img = plan.querySelector('image')!;
      return { x: Math.round((Number(img.getAttribute('x')) / (24 * zoom) + ox) * 100) / 100, y: Math.round((Number(img.getAttribute('y')) / (24 * zoom) + oy) * 100) / 100 };
    });
    const before = await photoAt();
    const zoom = await page.locator('#canvas-svg').getAttribute('data-zoom');
    const cdp = await page.context().newCDPSession(page);
    const [x, y] = await onScreen(page, BED_GROUND);
    await touches(cdp, 'touchStart', [{ x, y, id: 1 }]);
    for (let i = 1; i <= 4; i++) { await touches(cdp, 'touchMove', [{ x: x + i * 3, y: y - i * 2, id: 1 }]); await frame(page); }
    const a = { x: x + 12, y: y - 8, id: 1 }, b = { x: x - 80, y: y - 200, id: 2 };
    await touches(cdp, 'touchStart', [a, b]);
    for (let i = 1; i <= 16; i++) { await touches(cdp, 'touchMove', [{ x: a.x + i * 3, y: a.y + i * 3, id: 1 }, { x: b.x - i * 3, y: b.y - i * 3, id: 2 }]); await frame(page); }
    await touches(cdp, 'touchEnd', []);
    await expect(page.locator('#canvas-svg')).not.toHaveAttribute('data-zoom', zoom!);
    expect(await photoAt()).toEqual(before);
    await expect(page.getByTestId('photo-moved')).toHaveCount(0); // (not moved: nothing to ask about)
  });
});
