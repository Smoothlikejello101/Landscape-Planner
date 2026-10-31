// Which copy of the app this is (docs/releasing.md): "release", what testers have at app.fullgrown.garden, or
// "next", every merge to main as it lands, at next.fullgrown.garden, for Jason to try before a release. Set at build
// time (APP_CHANNEL); a build without it (local, tests) is a release build.
//
// Next is its own web address, so its plans are its own: it can't touch the real app's. It shares the one backend,
// so sign-in and sync are off there (Jason, Oct 31): untested code never writes to synced plans.

export type Channel = 'release' | 'next';

/** A build's channel, read: anything but "next" is a release build. */
export const channelOf = (v: unknown): Channel => (v === 'next' ? 'next' : 'release');

export const CHANNEL: Channel = channelOf(typeof __APP_CHANNEL__ === 'string' ? __APP_CHANNEL__ : undefined);

/** Sign-in and sync: off in Next. */
export const signInAllowed = (channel: Channel = CHANNEL): boolean => channel !== 'next';
