import { describe, expect, it, vi } from 'vitest';
import { handle } from '../supabase/functions/beta-signup/index';

// The beta form's server function (Jason, Nov 5: Cloudflare Turnstile): Cloudflare asked first, the sign-up recorded
// only when it says a person filled in this form on this page, through beta_signup_checked with the secret key.

const ENV: Record<string, string> = {
  TURNSTILE_SECRET_KEY: 'turnstile-secret', SUPABASE_URL: 'https://db.example',
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_test' }),
};
const env = (over: Record<string, string | undefined> = {}) => (name: string) => (name in over ? over[name] : ENV[name]);
const FORM = { email: 'cara@example.com', first_name: 'Cara', place: '72923', phone: 'iphone', computer: true, planning: 'A shade bed', heard: 'A friend', token: 'tok' };
const post = (body: unknown, headers: Record<string, string> = {}) => new Request('https://api.example/functions/v1/beta-signup', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', ...headers }, body: JSON.stringify(body),
});
/** A fetch that answers Cloudflare with `verdict` and the database with `said`, keeping what each was sent. */
function fake(verdict: object, said: unknown = 'ok') {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const body = String(url).includes('challenges.cloudflare.com') ? verdict : said;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}
const PASSED = { success: true, hostname: 'fullgrown.garden', action: 'beta-signup' };
const said = async (r: Response) => [r.status, await r.json()];

describe('the beta form\'s server function', () => {
  it('a person, by Cloudflare: the sign-up through beta_signup_checked, with the address it came from and the secret key', async () => {
    const f = fake(PASSED, 'ok');
    const r = await handle(post(FORM), env(), f.fn);
    expect(await said(r)).toEqual([200, 'ok']);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://fullgrown.garden');
    const [check, db] = f.calls;
    expect(check.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const sent = check.init.body as FormData;
    expect([sent.get('secret'), sent.get('response'), sent.get('remoteip')]).toEqual(['turnstile-secret', 'tok', '203.0.113.7']);
    expect(db.url).toBe('https://db.example/rest/v1/rpc/beta_signup_checked');
    expect(db.init.headers).toEqual({ apikey: 'sb_secret_test', 'Content-Type': 'application/json' }); // (no Bearer: not a JWT)
    expect(JSON.parse(String(db.init.body))).toEqual({ p_ip: '203.0.113.7', p_email: 'cara@example.com', p_first_name: 'Cara', p_place: '72923',
      p_phone: 'iphone', p_computer: true, p_planning: 'A shade bed', p_heard: 'A friend' });
  });

  it('passes on what the database says', async () => {
    for (const s of ['invalid: email', 'too-many', 'busy']) expect(await said(await handle(post(FORM), env(), fake(PASSED, s).fn))).toEqual([200, s]);
  });

  it('Cloudflare says no, or for another page or form, or no token came: no sign-up', async () => {
    for (const verdict of [{ success: false }, { ...PASSED, hostname: 'evil.example' }, { ...PASSED, action: 'login' }, { success: 'true', hostname: 'fullgrown.garden', action: 'beta-signup' }]) {
      const f = fake(verdict);
      expect(await said(await handle(post(FORM), env(), f.fn))).toEqual([200, 'check-failed']);
      expect(f.calls.map((c) => c.url)).toEqual(['https://challenges.cloudflare.com/turnstile/v0/siteverify']);
    }
    for (const token of [undefined, '', 42, 'x'.repeat(2049)]) {
      const f = fake(PASSED);
      expect(await said(await handle(post({ ...FORM, token }), env(), f.fn))).toEqual([200, 'check-failed']);
      expect(f.calls).toEqual([]);
    }
  });

  it('nothing it can ask (no secret set, Cloudflare or the database out of reach): unavailable, and no sign-up', async () => {
    expect(await said(await handle(post(FORM), env({ TURNSTILE_SECRET_KEY: undefined }), fake(PASSED).fn))).toEqual([503, 'unavailable']);
    const down = vi.fn(async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
    expect(await said(await handle(post(FORM), env(), down))).toEqual([503, 'unavailable']);
    const dbDown = vi.fn(async (url: string | URL | Request) => (String(url).includes('cloudflare')
      ? new Response(JSON.stringify(PASSED)) : new Response('{}', { status: 500 }))) as unknown as typeof fetch;
    expect(await said(await handle(post(FORM), env(), dbDown))).toEqual([502, 'unavailable']);
  });

  it('the old secret key where there\'s no new one: as a JWT, on both headers', async () => {
    const f = fake(PASSED);
    await handle(post(FORM), env({ SUPABASE_SECRET_KEYS: undefined, SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy' }), f.fn);
    expect(f.calls[1].init.headers).toEqual({ apikey: 'eyJ.legacy', Authorization: 'Bearer eyJ.legacy', 'Content-Type': 'application/json' });
  });

  it('the browser\'s preflight, and anything but a form\'s answers', async () => {
    const pre = await handle(new Request('https://api.example/functions/v1/beta-signup', { method: 'OPTIONS' }), env(), fake(PASSED).fn);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain('apikey');
    expect((await handle(new Request('https://api.example/x', { method: 'GET' }), env(), fake(PASSED).fn)).status).toBe(405);
    const bad = new Request('https://api.example/x', { method: 'POST', body: 'not json' });
    expect(await said(await handle(bad, env(), fake(PASSED).fn))).toEqual([400, 'invalid: request']);
    expect(await said(await handle(post([1, 2]), env(), fake(PASSED).fn))).toEqual([400, 'invalid: request']);
  });

  it('answers that aren\'t strings are dropped; computer only when true', async () => {
    const f = fake(PASSED);
    await handle(post({ ...FORM, email: 7, planning: { x: 1 }, computer: 'yes' }), env(), f.fn);
    expect(JSON.parse(String(f.calls[1].init.body))).toMatchObject({ p_email: '', p_planning: '', p_computer: false });
  });
});
