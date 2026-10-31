// A support file (Jason, 2026-10-29: "a 'support export' function, accessible from 'send feedback' that includes my
// plants, settings, etc"): everything we'd need to see what the person sees. It's a backup file (Import opens it,
// projects and plants) with a `support` section beside: the app's version and its catalog's, the device and browser,
// how storage and sync stand, the settings this device keeps, and the app's recent errors (src/error-log.ts).
//
// Never in it: the sign-in (its token), the account's email, the email a code was sent to. Background images only
// if the person ticks them in (they can be large); their placement is kept either way. Nothing is sent by the app:
// the person saves or shares the file, and attaches it to an email if they choose. The sheet says what's in it
// before it's saved (src/ui/feedback-sheet.ts).

import { BACKUP_FORMAT, type ExportedProject } from './backup';
import { ERROR_LOG_KEY, type ErrorEntry } from './error-log';

export const SUPPORT_VERSION = 1;

/**
 * Every key the app keeps in localStorage, by what a support file does with it: a setting's value is put in;
 * data (plans, unsaved edits, the clipboard, the error log, which has its own section) only by size; a private
 * one never, not even its name. A key not listed (one added later) goes in by name and size only, never its
 * value. (A test checks that every 'lp-' key in src/ is listed here.)
 */
export const SETTING_KEYS = [
  'lp-current', 'lp-idb-in-use', 'lp-text-size', 'lp-text-size-2', 'lp-yard', 'lp-hardy-here', 'lp-square', 'lp-snap', 'lp-tidy', 'lp-kind-prefs',
  'lp-recent-plants', 'lp-full-rings', 'lp-crowding', 'lp-crowd-warn', 'lp-warn-hardy', 'lp-warn-poison', 'lp-warn-fruit', 'lp-zoom-buttons', 'lp-plant-looks', 'lp-label-size', 'lp-filters-open', 'lp-my-plants-folded', 'lp-sync-device',
  'lp-zip-county', 'lp-zip-prompt-dismissed', 'lp-intro', 'lp-last-visit', 'lp-returned', 'lp-hint-full-size', 'lp-canopy-hint',
  'lp-hint-tap-under', 'lp-hint-drag-pans', 'lp-tap-guard', 'lp-whats-new',
];
/** Data, by name and size: exact keys, and prefixes (a project per key, an unsaved-edits journal per project). */
export const DATA_KEYS = ['lp-projects', 'lp-clipboard', ERROR_LOG_KEY];
export const DATA_PREFIXES = ['lp-project-', 'lp-journal:'];
/**
 * Never in a support file, not even by name: the sign-in session and everything Supabase keeps beside it under its
 * name (a sign-in's code verifiers, "lp-auth-flow-…-code-verifier", seen in Jason's file, Oct 29), and the addresses
 * a sign-in email went to.
 */
export const PRIVATE_KEYS = ['lp-auth', 'lp-code-sent', 'lp-email-signin'];
const PRIVATE_PREFIXES = ['lp-auth-'];

export type KeyKind = 'setting' | 'data' | 'private' | 'other';
export function keyKind(key: string): KeyKind {
  if (PRIVATE_KEYS.includes(key) || PRIVATE_PREFIXES.some((p) => key.startsWith(p))) return 'private';
  // (A hint keeps when it last showed beside its count: "lp-canopy-hint-at".)
  if (SETTING_KEYS.includes(key) || SETTING_KEYS.includes(key.replace(/-at$/, ''))) return 'setting';
  if (DATA_KEYS.includes(key) || DATA_PREFIXES.some((p) => key.startsWith(p))) return 'data';
  return 'other';
}
const MAX_SETTING = 4000;
/** This device's localStorage, as a support file holds it. Only the app's keys ("lp-"). */
export function localKeys(s: Pick<Storage, 'length' | 'key' | 'getItem'>): { settings: Record<string, unknown>; data: { key: string; bytes: number }[]; other: { key: string; bytes: number }[] } {
  const settings: Record<string, unknown> = {}, data: { key: string; bytes: number }[] = [], other: { key: string; bytes: number }[] = [];
  const keys: string[] = [];
  try { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith('lp-')) keys.push(k); } } catch { /* blocked */ }
  for (const key of keys.sort()) {
    const kind = keyKind(key);
    if (kind === 'private') continue;
    let raw = '';
    try { raw = s.getItem(key) ?? ''; } catch { /* blocked */ }
    if (kind === 'setting') {
      let v: unknown = raw;
      try { v = JSON.parse(raw); } catch { /* a plain string */ }
      settings[key] = raw.length > MAX_SETTING ? `${raw.slice(0, MAX_SETTING)}… (${raw.length} characters)` : v;
    } else (kind === 'data' ? data : other).push({ key, bytes: raw.length });
  }
  return { settings, data, other };
}

export interface SupportInfo {
  /** The app: its version and build, its catalog's date and size, whether an update is waiting. */
  app: { version: string; built: string; catalog: { updated?: string; plants?: number } | null; updateWaiting?: boolean; serviceWorker?: boolean };
  device: Record<string, unknown>;
  storage: Record<string, unknown>;
  sync: Record<string, unknown>;
  settings: Record<string, unknown>;
  localData: { key: string; bytes: number }[];
  otherKeys: { key: string; bytes: number }[];
  errors: ErrorEntry[];
  /** Each project's size, and its background image (kept or not, and where it sits). */
  projects: { name: string; lastModified: number; shapes: number; plants: number; bytes: number; bgImage?: Record<string, unknown> & { included: boolean; bytes: number } }[];
  images: 'included' | 'left out';
}
export interface SupportFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  projects: ExportedProject[];
  myPlants: unknown[];
  support: SupportInfo & { version: number };
}

/** A project's background image as a support file notes it: its size and placement, never its pixels. */
function imageNote(p: ExportedProject, included: boolean) {
  const bg = p.data.bgImage;
  if (!bg) return undefined;
  const { dataUrl, imageId: _id, ...rest } = bg as typeof bg & { imageId?: string };
  return { ...rest, included, bytes: dataUrl?.length ?? 0 };
}
/**
 * The support file from what was gathered (gatherSupport, in the browser): the projects as a backup holds them,
 * their background images taken out unless `includeImages`.
 */
export function buildSupportFile(parts: { projects: ExportedProject[]; myPlants: unknown[]; includeImages: boolean; now: Date } & Omit<SupportInfo, 'projects' | 'images'>): SupportFile {
  const { projects, myPlants, includeImages, now, ...info } = parts;
  const kept = projects.map((p) => (includeImages || !p.data.bgImage ? p : { ...p, data: { ...p.data, bgImage: null } }));
  return {
    format: BACKUP_FORMAT, version: 1, exportedAt: now.toISOString(), projects: kept, myPlants,
    support: {
      version: SUPPORT_VERSION, ...info,
      projects: projects.map((p) => ({
        name: p.name, lastModified: p.lastModified, shapes: p.data.shapes.length,
        plants: p.data.shapes.filter((s) => s.type === 'circle' && s.role === 'plant').length,
        bytes: JSON.stringify({ ...p.data, bgImage: null }).length,
        ...(p.data.bgImage ? { bgImage: imageNote(p, includeImages) } : {}),
      })),
      images: includeImages ? 'included' : 'left out',
    },
  };
}
/** "2.3 MB", "640 KB". */
export function sizeText(bytes: number): string {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}
/** How big the background images are, together (what ticking them in adds). */
export function imageBytes(projects: ExportedProject[]): number {
  return projects.reduce((n, p) => n + (p.data.bgImage?.dataUrl?.length ?? 0), 0);
}
/** What's in the file, in a few lines, for the sheet to show before it's saved. */
export function supportSummary(f: SupportFile): string[] {
  const s = f.support, n = f.projects.length, plants = s.projects.reduce((t, p) => t + p.plants, 0);
  const withImage = s.projects.filter((p) => p.bgImage).length;
  const errors = s.errors.reduce((t, e) => t + (e.count ?? 1), 0);
  return [
    `Your ${n} project${n === 1 ? '' : 's'} (${plants} plant${plants === 1 ? '' : 's'} placed)` + (withImage ? (s.images === 'included' ? ', with background images' : ', without background images') : ''),
    f.myPlants.length ? `Your own plants (${f.myPlants.length})` : 'Your own plants (none yet)',
    'This device’s settings for the app',
    'The app’s version, your device and browser, and how storage and sync stand',
    errors ? `The app’s last errors (${errors})` : 'The app’s last errors (none kept)',
  ];
}
