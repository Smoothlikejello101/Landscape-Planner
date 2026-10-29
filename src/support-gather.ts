// Gathering a support file in the browser (what's put in it, and what never is: src/support.ts).
import { account } from './account';
import { allExportedProjects } from './backup';
import { wirePlant } from './catalog';
import { readErrors } from './error-log';
import { myPlants } from './my-plants';
import { PLANT_META } from './plants';
import { state } from './state';
import { getLastBackupAt, getSyncRecords, getSyncUser, storageStatus } from './storage';
import { buildSupportFile, localKeys } from './support';
import { deviceName, sync, syncOnThisDevice } from './sync/sync';

const media = (q: string) => { try { return window.matchMedia(q).matches; } catch { return undefined; } };

/** The device and browser: what kind, its screen and window, how the app was opened. */
function device(): Record<string, unknown> {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  return {
    kind: deviceName(),
    userAgent: nav.userAgent,
    platform: nav.userAgentData?.platform,
    language: nav.language,
    timeZone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })(),
    screen: { width: screen.width, height: screen.height },
    window: { width: innerWidth, height: innerHeight },
    pixelRatio: devicePixelRatio,
    installed: media('(display-mode: standalone)') || media('(display-mode: window-controls-overlay)') || false,
    touch: media('(pointer: coarse)'),
    online: nav.onLine,
    memoryGB: (nav as Navigator & { deviceMemory?: number }).deviceMemory,
  };
}
/** Sync as it stands: on or off and why, when it last ran, each project's place in it. Never who's signed in. */
function syncInfo(): Record<string, unknown> {
  const records = getSyncRecords();
  const plan = account.plan ? { plan: account.plan.plan, trialEnds: account.plan.trialEnds, paidUntil: account.plan.paidUntil } : null;
  return {
    signedIn: account.status === 'signedIn',
    phase: sync.phase,
    message: sync.message,
    lastAt: sync.lastAt ? new Date(sync.lastAt).toISOString() : undefined,
    onThisDevice: syncOnThisDevice(),
    plan,
    // (Whether this device's sync records belong to the account signed in; not the account itself.)
    sameAccount: account.userId ? getSyncUser() === account.userId : undefined,
    projects: state.projects.map((p) => {
      const r = records[p.id];
      return { name: p.name, synced: !!r, revision: r?.revision, held: r?.held };
    }),
    inTrash: sync.trash.length,
  };
}
/** Everything a support file holds, gathered once; built into a file, its images in or out, by buildSupportFile. */
export type SupportParts = Omit<Parameters<typeof buildSupportFile>[0], 'includeImages' | 'now'>;
export async function gatherSupport(): Promise<SupportParts> {
  const [projects, storage, reg] = await Promise.all([
    allExportedProjects(),
    storageStatus(),
    navigator.serviceWorker?.getRegistration?.().catch(() => undefined) ?? Promise.resolve(undefined),
  ]);
  const local = (() => { try { return localKeys(localStorage); } catch { return { settings: {}, data: [], other: [] }; } })();
  const backup = getLastBackupAt();
  return {
    projects, myPlants: myPlants.map(wirePlant),
    app: {
      version: __APP_VERSION__, built: __BUILD_TIME__,
      catalog: PLANT_META ? { updated: PLANT_META.version, plants: PLANT_META.count } : null,
      updateWaiting: !!reg?.waiting, serviceWorker: !!navigator.serviceWorker?.controller,
    },
    device: device(),
    storage: { ...storage, lastBackupAt: backup ? new Date(backup).toISOString() : null },
    sync: syncInfo(),
    settings: local.settings, localData: local.data, otherKeys: local.other,
    errors: readErrors(),
  };
}
