import { test, expect, type Page, type Route } from '@playwright/test';
import { openFresh } from './helpers';

// Accounts, against a stand-in for Supabase: every request to the real
// project is intercepted, so tests never touch live data.

const SUPABASE = 'https://erepgvypesysctxezwkm.supabase.co';
/** An unsigned token with the claims a session needs (the stand-in server never checks it). */
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (exp: number) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-1', email: 'jason@example.com', role: 'authenticated', aud: 'authenticated', exp })}.sig`;

async function fakeServer(page: Page, plan: object | null = { plan: 'trial', trial_ends: new Date(Date.now() + 30 * 86_400_000 - 60_000).toISOString(), paid_until: null }) {
  const seen: string[] = [];
  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const req = route.request(), url = new URL(req.url());
    seen.push(`${req.method()} ${url.pathname}${url.pathname.endsWith('/authorize') ? url.search : ''}`);
    if (url.pathname === '/auth/v1/otp') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (url.pathname === '/auth/v1/verify') {
      const { token: code } = JSON.parse(req.postData() ?? '{}');
      if (code !== '123456') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }) });
      const exp = Math.floor(Date.now() / 1000) + 3600;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: token(exp), refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp,
        user: { id: 'u-2', aud: 'authenticated', role: 'authenticated', email: 'new@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-10-17T00:00:00Z' },
      }) });
    }
    if (url.pathname === '/auth/v1/authorize') return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google would ask here</p>' });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    if (url.pathname === '/rest/v1/plans') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(plan ? [plan] : []) });
    if (url.pathname === '/rest/v1/rpc/delete_my_account') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/storage/v1/object/list/photos')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"not in the stand-in"}' });
  });
  return seen;
}
async function signedIn(page: Page) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  await page.addInitScript(([key, value]) => { if (!localStorage.getItem('lp-auth-seeded')) { localStorage.setItem(key, value); localStorage.setItem('lp-auth-seeded', '1'); } }, ['lp-auth', JSON.stringify({
    access_token: token(exp), refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'u-1', aud: 'authenticated', role: 'authenticated', email: 'jason@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-10-17T00:00:00Z' },
  })]);
}
const openAccount = async (page: Page) => {
  await page.locator('.project-btn').click();
  const section = page.getByTestId('account');
  await expect(section).toBeVisible();
  return section;
};

test('signed out: Google goes to Google and back here; an emailed link is sent', async ({ page }) => {
  const seen = await fakeServer(page);
  await openFresh(page);
  const account = await openAccount(page);
  await expect(account.getByTestId('signin-google')).toBeVisible();
  // An emailed link.
  await account.getByTestId('signin-email').fill('jason@example');
  await account.getByTestId('signin-send').click();
  await expect(account.getByTestId('account-error')).toContainText('look like an email');
  await expect(account.getByTestId('signin-email')).toHaveValue('jason@example'); // kept for fixing
  await account.getByTestId('signin-email').fill('jason@example.com');
  await account.getByTestId('signin-send').click();
  await expect(account.getByTestId('link-sent')).toContainText('jason@example.com');
  expect(seen).toContain('POST /auth/v1/otp');
  // Google: the page leaves for the sign-in screen, set to come back to the app.
  await account.getByText('Use a different email, or send a new code').click();
  await account.getByTestId('signin-google').click();
  await expect(page.getByText('Google would ask here')).toBeVisible();
  const authorize = seen.find((s) => s.includes('/authorize'))!;
  expect(authorize).toContain('provider=google');
  expect(decodeURIComponent(authorize)).toMatch(/redirect_to=http:\/\/localhost:\d+\/(&|$)/);
});

test('an emailed code, typed into the app, signs in here', async ({ page }) => {
  const seen = await fakeServer(page);
  await openFresh(page);
  const account = await openAccount(page);
  await account.getByTestId('signin-email').fill('new@example.com');
  await account.getByTestId('signin-send').click();
  await expect(account.getByTestId('link-sent')).toContainText('Enter it here');
  // A wrong (or replaced) code says so, and keeps what was typed.
  await account.getByTestId('signin-code').fill('111111');
  await account.getByTestId('signin-verify').click();
  await expect(account.getByTestId('account-error')).toContainText('That code didn’t work');
  await expect(account.getByTestId('signin-code')).toHaveValue('111111');
  await account.getByTestId('signin-code').fill('123 456');
  await account.getByTestId('signin-verify').click();
  await expect(account.getByTestId('signed-in')).toHaveText('Signed in as new@example.com');
  await expect(account.getByTestId('plan')).toHaveText('Free trial: 30 days left');
  expect(seen).toContain('POST /auth/v1/verify');
  expect(await page.evaluate(() => !!localStorage.getItem('lp-auth'))).toBe(true); // kept: signed in after a restart too
});

test('signed in: the trial shows; signing out keeps the plans on this device', async ({ page }) => {
  await fakeServer(page);
  await signedIn(page);
  await openFresh(page);
  const account = await openAccount(page);
  await expect(account.getByTestId('signed-in')).toHaveText('Signed in as jason@example.com');
  await expect(account.getByTestId('plan')).toHaveText('Free trial: 30 days left');
  await account.getByTestId('sign-out').click();
  await expect(account.getByTestId('signin-google')).toBeVisible();
  await expect(page.locator('.proj-row')).toHaveCount(1); // the plans are still here
  // Signed out for real: nothing stored, and a reload stays signed out.
  expect(await page.evaluate(() => localStorage.getItem('lp-auth'))).toBe(null);
  await page.reload();
  const again = await openAccount(page);
  await expect(again.getByTestId('signin-google')).toBeVisible();
});

test('deleting the account says what goes, offers a backup, and can be cancelled', async ({ page }) => {
  const seen = await fakeServer(page);
  await signedIn(page);
  await openFresh(page);
  const account = await openAccount(page);
  await account.getByTestId('delete-account').click();
  await expect(account.getByTestId('delete-confirm')).toContainText('The plans on this device stay here');
  await account.getByRole('button', { name: 'Cancel' }).click();
  await expect(account.getByTestId('signed-in')).toBeVisible();
  await account.getByTestId('delete-account').click();
  await account.getByTestId('delete-account-confirm').click();
  await expect(account.getByTestId('signin-google')).toBeVisible();
  expect(seen).toContain('POST /rest/v1/rpc/delete_my_account');
  await expect(page.locator('.proj-row')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('lp-auth'))).toBe(null);
});
