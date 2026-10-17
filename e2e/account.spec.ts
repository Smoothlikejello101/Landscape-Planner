import { test, expect, type Page, type Route } from '@playwright/test';
import { openFresh } from './helpers';

// Accounts, against a stand-in for Supabase: every request to the real
// project is intercepted, so tests never touch live data.

const SUPABASE = 'https://erepgvypesysctxezwkm.supabase.co';
/** An unsigned token with the claims a session needs (the stand-in server never checks it). */
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (exp: number) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-1', email: 'jason@example.com', role: 'authenticated', aud: 'authenticated', exp })}.sig`;

type Row = { id: string; name: string; content: unknown; revision: number; updated_by: string; updated_at: string; deleted_at: string | null };
async function fakeServer(page: Page, plan: Record<string, unknown> | null = { plan: 'trial', trial_started: '2026-10-17T00:00:00Z', trial_ends: new Date(Date.now() + 30 * 86_400_000 - 60_000).toISOString(), paid_until: null }, rows = new Map<string, Row>()) {
  const seen: string[] = [];
  const photos = new Map<string, Buffer>();
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const req = route.request(), url = new URL(req.url());
    seen.push(`${req.method()} ${url.pathname}${url.pathname.endsWith('/authorize') ? url.search : ''}`);
    if (url.pathname === '/auth/v1/otp') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (url.pathname === '/auth/v1/verify') {
      const body = JSON.parse(req.postData() ?? '{}');
      seen.push(`verify ${body.email} ${body.type}`);
      const code = body.token;
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
    // Sync: the rules of supabase/02-sync.sql, in memory.
    const args = () => JSON.parse(req.postData() ?? '{}');
    if (url.pathname === '/rest/v1/rpc/start_trial') {
      const a = args(); seen.push(`start_trial ${String(a.p_install).length >= 16 ? 'with install id' : 'without install id'}`);
      if (plan && !plan.trial_ends) Object.assign(plan, { trial_started: new Date().toISOString(), trial_ends: new Date(Date.now() + 30 * 86_400_000 - 60_000).toISOString() });
      return json(route, plan);
    }
    if (url.pathname === '/rest/v1/rpc/sync_list') return json(route, [...rows.values()].map(({ content: _c, ...meta }) => meta));
    if (url.pathname === '/rest/v1/rpc/push_project') {
      const a = args(); const r = rows.get(a.p_id);
      seen.push(`push ${a.p_name}`);
      if (!r) { rows.set(a.p_id, { id: a.p_id, name: a.p_name, content: a.p_content, revision: 1, updated_by: a.p_device, updated_at: new Date().toISOString(), deleted_at: null }); return json(route, { status: 'ok', revision: 1 }); }
      if (r.deleted_at) return json(route, { status: 'deleted', revision: r.revision });
      if (a.p_base !== r.revision) return json(route, { status: 'conflict', revision: r.revision, name: r.name, content: r.content, updated_by: r.updated_by, updated_at: r.updated_at });
      Object.assign(r, { name: a.p_name, content: a.p_content, revision: r.revision + 1, updated_by: a.p_device });
      return json(route, { status: 'ok', revision: r.revision });
    }
    if (url.pathname === '/rest/v1/rpc/trash_project') {
      const a = args(); const r = rows.get(a.p_id);
      if (!r || r.deleted_at) return json(route, 'ok');
      if (a.p_base !== r.revision) return json(route, 'changed');
      r.deleted_at = new Date().toISOString(); r.revision++;
      return json(route, 'ok');
    }
    if (url.pathname === '/rest/v1/rpc/restore_project') { const r = rows.get(args().p_id); seen.push('restore'); if (!r?.deleted_at) return json(route, null); r.deleted_at = null; r.revision++; return json(route, r.revision); }
    if (url.pathname === '/rest/v1/projects') {
      const ids = (url.searchParams.get('id') ?? '').replace(/^in\.\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
      return json(route, ids.map((id) => rows.get(id)).filter((r): r is Row => !!r && !r.deleted_at).map(({ id, name, revision, content }) => ({ id, name, revision, content })));
    }
    // Photos and My plants: supabase/03-photos-plants.sql.
    if (url.pathname === '/rest/v1/rpc/reserve_photo') { const fp = args().p_fp as string; seen.push('reserve_photo'); return json(route, photos.has(fp) ? 'stored' : 'send'); }
    if (url.pathname === '/rest/v1/rpc/photo_stored') return json(route, null);
    if (url.pathname === '/rest/v1/rpc/unused_photos') return json(route, []);
    if (url.pathname.startsWith('/storage/v1/object/photos/')) {
      const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/photos/'.length));
      if (req.method() === 'POST' || req.method() === 'PUT') { seen.push('photo upload'); photos.set(path.split('/')[1].replace(/\.jpg$/, ''), req.postDataBuffer() ?? Buffer.alloc(0)); return json(route, { Key: `photos/${path}` }); }
      const b = photos.get(path.split('/')[1].replace(/\.jpg$/, ''));
      return b ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: b }) : route.fulfill({ status: 400, contentType: 'application/json', body: '{"statusCode":"404","error":"not_found","message":"Object not found"}' });
    }
    if (url.pathname === '/rest/v1/rpc/plant_list') return json(route, []);
    if (url.pathname === '/rest/v1/rpc/push_plant') { seen.push('push_plant'); return json(route, { status: 'ok', revision: 1 }); }
    if (url.pathname === '/rest/v1/my_plants') return json(route, []);
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"not in the stand-in"}' });
  });
  return seen;
}
/** Email sign-in waits for the app's own email service; tests turn it on. */
async function emailOn(page: Page) { await page.addInitScript(() => localStorage.setItem('lp-email-signin', '1')); }
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
  await emailOn(page);
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

test('email sign-in waits for the app’s own email service', async ({ page }) => {
  await fakeServer(page);
  await openFresh(page);
  const account = await openAccount(page);
  await expect(account.getByTestId('signin-google')).toBeVisible();
  await expect(account.getByTestId('signin-email')).toHaveCount(0);
  await expect(account.getByTestId('email-later')).toBeVisible();
});

test('an emailed code, typed into the app, signs in here', async ({ page }) => {
  const seen = await fakeServer(page);
  await emailOn(page);
  await openFresh(page);
  const account = await openAccount(page);
  await account.getByTestId('signin-email').fill('new@example.com');
  await account.getByTestId('signin-email').press('Enter');
  await expect(account.getByTestId('link-sent')).toContainText('Enter it here');
  await expect(account.getByTestId('signin-code')).toBeFocused(); // straight on, keyboard up
  // The app closed while reading the email (Android does that): the code is still awaited.
  await page.reload();
  const back = await openAccount(page);
  await expect(back.getByTestId('link-sent')).toContainText('new@example.com');
  // A wrong (or replaced) code says so, and keeps what was typed.
  await account.getByTestId('signin-code').fill('111111');
  await account.getByTestId('signin-verify').click();
  await expect(account.getByTestId('account-error')).toContainText('That code didn’t work');
  await expect(account.getByTestId('signin-code')).toHaveValue('111111');
  await account.getByTestId('signin-code').fill('123 456');
  await account.getByTestId('signin-verify').click();
  await expect(account.getByTestId('signed-in')).toHaveText('Signed in as new@example.com');
  await expect(account.getByTestId('plan')).toHaveText('Free trial: 30 days left');
  expect(seen).toContain('verify new@example.com email');
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

test('beta: sync runs by itself, uploads this device’s plans, and brings another device’s down', async ({ page }) => {
  const rows = new Map<string, Row>();
  rows.set('from-laptop', { id: 'from-laptop', name: 'Cabin', revision: 2, updated_by: 'Windows PC', updated_at: '2026-10-17T00:00:00Z', deleted_at: null,
    content: { shapes: [{ id: 'c1', type: 'rect', x: 0, y: 0, width: 6, height: 4, rotation: 0, color: '#92400e', label: 'Cabin bed', opacity: 0.3, locked: false, role: 'bed' }] } });
  const seen = await fakeServer(page, { plan: 'beta', trial_started: null, trial_ends: null, paid_until: null }, rows);
  await signedIn(page);
  await openFresh(page);
  const account = await openAccount(page);
  await expect(account.getByTestId('sync-status')).toHaveText('Synced just now');
  expect(seen).toContain('push My Garden'); // this device's plan went up
  await expect(page.locator('.proj-row', { hasText: 'Cabin' })).toHaveCount(1); // the laptop's came down
  // Deleting a synced plan says where it goes, and it shows up there.
  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); void d.accept(); });
  await page.getByRole('button', { name: 'Delete Cabin' }).click();
  expect(asked).toContain('Recently deleted');
  expect(asked).not.toContain('cannot be undone');
  await account.getByTestId('sync-now').click();
  await expect(account.getByTestId('trash')).toContainText('Cabin');
  // Switched off on this device: nothing more is sent.
  await account.getByTestId('sync-device').locator('input').uncheck();
  await expect(account.getByTestId('sync-status')).toHaveText('Sync is off on this device');
  await expect(account.getByTestId('sync-now')).toBeDisabled();
});

test('beta: a background photo goes up with its plan; one kept on this device doesn’t', async ({ page }) => {
  const rows = new Map<string, Row>();
  const seen = await fakeServer(page, { plan: 'beta', trial_started: null, trial_ends: null, paid_until: null }, rows);
  await signedIn(page);
  page.on('dialog', (d) => void d.accept());
  await openFresh(page);
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'background image' }).click();
  await page.locator('.sheet input[type=file]').setInputFiles('public/icon-512.png');
  await page.locator('.mode-banner button').click(); // skip calibration
  const account = await openAccount(page);
  await account.getByTestId('sync-now').click();
  await expect(account.getByTestId('sync-status')).toHaveText('Synced just now');
  await expect.poll(() => seen.filter((s) => s === 'photo upload').length).toBe(1);
  const content = () => ([...rows.values()][0].content as { photo?: { fingerprint?: string; deviceOnly?: boolean } }).photo;
  expect(content()?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  // Kept on this device: the plan says so, and nothing more is sent.
  await page.keyboard.press('Escape');
  await page.locator('button[title=More]').click();
  await page.locator('.menu-item', { hasText: 'background image' }).click();
  await page.getByTestId('photo-device-only').locator('input').check();
  await expect.poll(content, { timeout: 15_000 }).toEqual({ deviceOnly: true });
  expect(seen.filter((s) => s === 'photo upload')).toHaveLength(1);
});

test('a trial that hasn’t started: sync waits to be turned on, which starts it', async ({ page }) => {
  const seen = await fakeServer(page, { plan: 'trial', trial_started: null, trial_ends: null, paid_until: null });
  await signedIn(page);
  await openFresh(page);
  const account = await openAccount(page);
  await expect(account.getByTestId('plan')).toHaveText('Free trial: 30 days, starting when you turn on sync');
  await expect(account.getByTestId('sync-start')).toBeVisible();
  expect(seen.filter((s) => s.startsWith('push'))).toEqual([]); // nothing synced yet
  await account.getByTestId('sync-start').click();
  await expect(account.getByTestId('plan')).toHaveText('Free trial: 30 days left');
  await expect(account.getByTestId('sync-status')).toHaveText('Synced just now');
  expect(seen).toContain('start_trial with install id');
  expect(seen).toContain('push My Garden');
});
