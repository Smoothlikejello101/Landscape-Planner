// FullGrown: the beta sign-up form's server function (Jason, Nov 5). The form on fullgrown.garden/beta sends its
// answers here, with the token from Cloudflare Turnstile, Cloudflare's check that a person is filling it in. This asks
// Cloudflare whether the token is good, for that page, and only then records the sign-up, through the database's
// beta_signup_checked (supabase/08-beta-check.sql), which checks each answer as before.
//
// Deployed by hand: Supabase dashboard → Edge Functions → Deploy a new function → Via editor; name it beta-signup,
// paste this file in place of what's there, deploy. Then, in the function's Details (or Settings): "Verify JWT with
// legacy secret" (or "Enforce JWT verification") off: the form has no account, and the publishable key it sends isn't
// a JWT. Its one secret, TURNSTILE_SECRET_KEY, is set under Edge Functions → Secrets (never in this file or the repo).
// Supabase gives it SUPABASE_URL and the project's secret key itself.
//
// Answers, as the form shows them: the database's ('ok', 'invalid: …', 'too-many', 'busy'); 'check-failed' (Cloudflare
// said no, or no token came); 'unavailable' (Cloudflare or the database couldn't be reached, or no secret is set).

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): unknown; env: { get(name: string): string | undefined } } | undefined;

/** Where the form is: the only page whose answers are taken, and Turnstile's hostname for it. */
const SITE = 'https://fullgrown.garden';
const HOSTNAME = 'fullgrown.garden';
/** The widget's action on the form (data-action): a token made for another page or form isn't taken. */
const ACTION = 'beta-signup';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const cors = {
  'Access-Control-Allow-Origin': SITE,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-client-info',
  'Vary': 'Origin',
};
const answer = (said: string, status = 200) =>
  new Response(JSON.stringify(said), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** The project's secret key, as Supabase gives it to its functions: the new kind if there is one, else the old one. */
function secretHeaders(env: (name: string) => string | undefined): Record<string, string> | null {
  try {
    const key = JSON.parse(env('SUPABASE_SECRET_KEYS') ?? '{}')?.default;
    if (typeof key === 'string' && key) return { apikey: key }; // (on apikey only: it isn't a JWT)
  } catch { /* (not there, or not JSON: the old key) */ }
  const legacy = env('SUPABASE_SERVICE_ROLE_KEY');
  return legacy ? { apikey: legacy, Authorization: `Bearer ${legacy}` } : null;
}

/** One request to the function. `env` and `fetchFn` are Deno's when deployed; the tests give their own. */
export async function handle(req: Request, env: (name: string) => string | undefined, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return answer('invalid: request', 405);
  let a: Record<string, unknown>;
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return answer('invalid: request', 400);
    a = body as Record<string, unknown>;
  } catch { return answer('invalid: request', 400); }
  const text = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '');
  // (Where the request came from, as Supabase's gateway says: for the database's limit of tries an hour from one
  // internet address, and for Cloudflare.)
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 64);

  // Cloudflare: was a person filling in this form, on this page?
  const token = text('token');
  if (!token || token.length > 2048) return answer('check-failed');
  const secret = env('TURNSTILE_SECRET_KEY');
  const keys = secretHeaders(env);
  const url = env('SUPABASE_URL');
  if (!secret || !keys || !url) return answer('unavailable', 503);
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  let passed = false;
  try {
    const r = await fetchFn(SITEVERIFY, { method: 'POST', body: form });
    const v = (await r.json()) as { success?: unknown; hostname?: unknown; action?: unknown };
    passed = v.success === true && v.hostname === HOSTNAME && v.action === ACTION;
  } catch { return answer('unavailable', 503); }
  if (!passed) return answer('check-failed');

  // The sign-up, checked answer by answer in the database (only this function may call it: 08-beta-check.sql).
  try {
    const r = await fetchFn(`${url}/rest/v1/rpc/beta_signup_checked`, {
      method: 'POST',
      headers: { ...keys, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_ip: ip, p_email: text('email'), p_first_name: text('first_name'), p_place: text('place'), p_phone: text('phone'),
        p_computer: a.computer === true, p_planning: text('planning'), p_heard: text('heard'),
      }),
    });
    const said = r.ok ? await r.json() : null;
    return typeof said === 'string' ? answer(said) : answer('unavailable', 502);
  } catch { return answer('unavailable', 502); }
}

if (typeof Deno !== 'undefined') Deno.serve((req) => handle(req, (name) => Deno.env.get(name)));
