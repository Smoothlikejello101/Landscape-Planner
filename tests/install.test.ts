import { describe, expect, it } from 'vitest';
import { installCard, installSettled, phoneKind, settleInstall, type InstallScene } from '../src/install';
import { helpAnswers } from '../src/help';

// Installing on a phone's home screen, explained (Jason, Nov 4, from the beta testers: Kayla "didn't know what it meant
// to install it on her home screen"; "Can we prompt phone browser users to install on their home screen?").

const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const scene = (o: Partial<InstallScene> = {}): InstallScene => ({ phone: 'android', installed: false, visit: 2, touring: false, otherCard: false, canPrompt: true, ...o });

describe('the install card', () => {
  it('on a phone browser where the app isn’t installed: Chrome on Android with Install, an iPhone with the two steps', () => {
    expect(installCard(scene(), store())).toBe('prompt');
    expect(installCard(scene({ phone: 'iphone', canPrompt: false }), store())).toBe('steps');
    expect(phoneKind('Android phone')).toBe('android');
    expect(phoneKind('iPhone')).toBe('iphone');
    expect(phoneKind('Android tablet')).toBeNull();
    expect(phoneKind('Windows PC')).toBeNull();
  });
  it('not on a computer or a tablet, nor installed, nor where Android’s browser doesn’t offer it (it doesn’t, once installed)', () => {
    expect(installCard(scene({ phone: null }), store())).toBeNull();
    expect(installCard(scene({ installed: true }), store())).toBeNull();
    expect(installCard(scene({ canPrompt: false }), store())).toBeNull();
  });
  it('not on the first open of a brand-new device, nor over Guided start, nor beside another start card', () => {
    expect(installCard(scene({ visit: 1 }), store())).toBeNull();
    expect(installCard(scene({ touring: true }), store())).toBeNull();
    expect(installCard(scene({ otherCard: true }), store())).toBeNull();
    expect(installCard(scene({ visit: 5 }), store())).toBe('prompt');
  });
  it('never again once shown or installed', () => {
    const s = store();
    expect(installSettled(s)).toBeNull();
    settleInstall('shown', s);
    expect(installCard(scene(), s)).toBeNull();
    const t = store();
    settleInstall('installed', t);
    expect(installCard(scene({ phone: 'iphone' }), t)).toBeNull();
  });
  it('Help says what installing means and how, or that it is installed', () => {
    const d = { keyboard: false, mac: false, roomy: false, shareWords: true, shareFiles: true, signIn: true };
    const a = helpAnswers(d).find((x) => x.id === 'install')!;
    expect(a.q).toBe('Install the app on my phone');
    expect(a.lines[0]).toBe('Installed, FullGrown gets its own icon on your home screen, opens full screen like an app, and works without a signal. Your plans stay as they are.');
    expect(a.lines[1]).toBe('On an iPhone, in Safari: Share (the square with an arrow), then Add to Home Screen. On Android, in Chrome: ⋮ → Install app (or Add to Home screen).');
    expect(helpAnswers({ ...d, installed: true }).find((x) => x.id === 'install')!.lines[1]).toBe('It’s installed: you’re using it now.');
  });
});
