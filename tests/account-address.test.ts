// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const created: unknown[][] = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => { created.push(args); return { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }; },
}));
vi.mock('../src/storage', () => ({ flushSave: vi.fn(async () => true) }));
const { AUTH_STORAGE_KEY, SUPABASE_URL, supabaseClient } = await import('../src/account');

describe("the project's address", () => {
  it("is FullGrown's own, and a sign-in is kept under the app's own name, so changing the address signs no one out", async () => {
    expect(SUPABASE_URL).toBe('https://api.fullgrown.garden');
    await supabaseClient();
    const [url, , opts] = created[0] as [string, string, { auth: { storageKey: string } }];
    expect(url).toBe('https://api.fullgrown.garden');
    // (supabase-js would otherwise name it after the address's first label: "sb-api-auth-token", not the
    // "sb-erepgvypesysctxezwkm-auth-token" a session from before would be under.)
    expect(opts.auth.storageKey).toBe(AUTH_STORAGE_KEY);
    expect(AUTH_STORAGE_KEY).toBe('lp-auth');
  });
});
