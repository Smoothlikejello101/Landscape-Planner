// The release's background photo as stored and synced (what testers run, and what an old tab or another device may
// still be running): copied verbatim from `origin/release` at bdeb911 (release 3, Nov 1), src/storage.ts lines 94,
// 100-103, 221-253 and 1031-1042, renamed release*. Its helper `uid` is imported from this version, unchanged since. Every
// older version reads a photo this way: a new object built from the fields it knows, so one it doesn't know
// (roughScale, Nov 4) is left out and nothing else changes; and a synced photo's placement, the same photo here, is
// laid over this device's own, keeping any field the incoming one doesn't have (its uncalibrated, say). Tests read what
// such a version makes of a photo this one saves and syncs (tests/storage.test.ts, tests/sync-engine.test.ts). Not to
// be edited: it stands for code already out.
import type { BgImage, PhotoRef, ProjectData } from '../../src/types';
import { uid } from '../../src/util';

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
/** Only embedded images (no remote URLs). */
function safeImageUrl(v: unknown): string {
  return typeof v === 'string' && /^data:image\/[a-z+.-]+;base64,/i.test(v) ? v : '';
}
export function releaseMigrateBgImage(raw: Partial<BgImage>): BgImage {
  return {
    dataUrl: safeImageUrl(raw.dataUrl),
    ...(raw.imageId ? { imageId: raw.imageId } : {}),
    naturalWidth: Math.max(1, num(raw.naturalWidth, 1000)),
    naturalHeight: Math.max(1, num(raw.naturalHeight, 1000)),
    ftPerPx: num(raw.ftPerPx, 0.1) > 0 ? num(raw.ftPerPx, 0.1) : 0.1,
    cx: num(raw.cx, 0), cy: num(raw.cy, 0),
    rotation: num(raw.rotation, 0),
    opacity: Math.min(1, Math.max(0.05, num(raw.opacity, 0.6))),
    visible: raw.visible !== false,
    ...(isFingerprint(raw.fingerprint) ? { fingerprint: raw.fingerprint } : {}),
    ...(raw.deviceOnly === true ? { deviceOnly: true } : {}),
    // (Not to scale yet; older photos have no word on it, and are taken as calibrated.)
    ...(raw.uncalibrated === true ? { uncalibrated: true as const } : {}),
  };
}
const isFingerprint = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
/** Validate a synced photo reference; null if absent or unusable. */
export function releaseSanitizePhotoRef(raw: unknown): PhotoRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.deviceOnly === true) return { deviceOnly: true };
  if (!isFingerprint(o.fingerprint)) return null;
  const { dataUrl: _d, fingerprint: _f, deviceOnly: _o, ...placed } = releaseMigrateBgImage({ ...(o as Partial<BgImage>), dataUrl: '' });
  return { fingerprint: o.fingerprint, ...placed };
}
/** How a background photo is synced: its fingerprint and placement (`fingerprint` known), or kept here. */
export function releasePhotoRefOf(bg: BgImage, fingerprint: string): PhotoRef {
  if (bg.deviceOnly) return { deviceOnly: true };
  const { naturalWidth, naturalHeight, ftPerPx, cx, cy, rotation, opacity, visible, uncalibrated } = releaseMigrateBgImage(bg);
  return { fingerprint, naturalWidth, naturalHeight, ftPerPx, cx, cy, rotation, opacity, visible, ...(uncalibrated ? { uncalibrated } : {}) };
}
export function releasePlacePhoto(base: ProjectData, baseFp: string | null, ref: PhotoRef | null, bytes?: string): { bgImage: BgImage | null; photoElsewhere: PhotoRef | null } {
  if (!ref) return { bgImage: null, photoElsewhere: null };
  // Kept on another device only: this device lets go of its copy (unless it's this device's own kept photo).
  if ('deviceOnly' in ref) return base.bgImage?.deviceOnly ? { bgImage: base.bgImage, photoElsewhere: null } : { bgImage: null, photoElsewhere: ref };
  const { fingerprint, ...placed } = ref;
  if (base.bgImage && baseFp === fingerprint) {
    const { deviceOnly: _o, ...bg } = base.bgImage;
    return { bgImage: { ...bg, ...placed, fingerprint }, photoElsewhere: null };
  }
  if (bytes) return { bgImage: releaseMigrateBgImage({ ...placed, dataUrl: bytes, imageId: uid(), fingerprint }), photoElsewhere: null };
  return { bgImage: null, photoElsewhere: ref };
}
