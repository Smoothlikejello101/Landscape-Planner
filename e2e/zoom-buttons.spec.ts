import { test, expect } from '@playwright/test';
import { openFresh, openSettings } from './helpers';

// The + and − zoom buttons (Jason, Oct 30): clutter on a phone, where a pinch zooms, so off there to start; on a computer,
// on. A switch in Settings brings them back, for zooming with one finger. Fit stays either way.

test.use({ storageState: { cookies: [], origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'lp-tap-guard', value: 'off' }] }] } }); // (the setting not yet chosen)

test('off on a phone to start, on a computer; Settings turns them on or off, kept on this device', async ({ page, isMobile }) => {
  await openFresh(page);
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  await expect(zoomIn).toHaveCount(isMobile ? 0 : 1);
  await openSettings(page);
  const sw = page.getByTestId('zoom-buttons');
  await expect(sw).toBeChecked({ checked: !isMobile });
  await sw.click();
  await expect(zoomIn).toHaveCount(isMobile ? 1 : 0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Zoom in' })).toHaveCount(isMobile ? 1 : 0);
});
