import { state } from '../state';
import {
  clearSyncTombstone, createProject, currentProjectData, deleteProject, fillProjectPhoto, getSyncRecords, getSyncTombstones, notePhotoFingerprint, photoRefOf,
  placePhoto, projectChangeToken, projectNow, readProject, renameProject, replaceProjectContent, sanitizePhotoRef, sanitizeProjectData,
  setSyncRecord, switchProject, syncedContent,
} from '../storage';
import type { BgImage, PhotoRef, ProjectData } from '../types';
import type { Local, LocalProject, ProjectContent } from './engine';
import { photoFingerprint } from './photo';

// This device's side of sync: the projects in its storage.

/** The server keeps names to 200 characters. */
const NAME_MAX = 200;
// Text the server's JSON can't hold: NUL, and half an emoji (a lone surrogate, as a cut can leave).
const UNSTORABLE = /\u0000|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const cleanText = (s: string) => s.replace(UNSTORABLE, '');
function clean(v: unknown): unknown {
  if (typeof v === 'string') return cleanText(v);
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[cleanText(k)] = clean(x);
    return out;
  }
  return v;
}
/** A project's synced content (its photo apart), checked and tidied exactly as a download would be. */
function tidy(content: unknown): ProjectContent {
  return clean(syncedContent(sanitizeProjectData(content))) as ProjectContent;
}
/** Downloaded content as this device stores it: tidied, with its photo reference checked (if it has one). */
function tidyDownload(content: ProjectContent): ProjectContent {
  const out = tidy(content);
  if ('photo' in content) out.photo = sanitizePhotoRef(content.photo);
  return out;
}
/** The photo a project here shows, as sync carries it. */
async function photoOf(id: string, d: ProjectData): Promise<PhotoRef | null> {
  if (!d.bgImage) return d.photoElsewhere ?? null;
  if (d.bgImage.deviceOnly) return { deviceOnly: true };
  const fp = await photoFingerprint(d.bgImage.dataUrl);
  if (d.bgImage.fingerprint !== fp) await notePhotoFingerprint(id, d.bgImage.dataUrl, fp);
  return photoRefOf(d.bgImage, fp);
}
/** The photo on this device for a project (the open one from memory). */
async function bgOf(id: string): Promise<BgImage | null> {
  return state.currentProjectId === id ? state.bgImage : (await readProject(id))?.bgImage ?? null;
}
/** A name as the server stores it (so it reads back the same). */
export function syncName(name: string): string {
  const t = Array.from(cleanText(name).trim()).slice(0, NAME_MAX).join('').trim();
  return t || 'Untitled';
}

/**
 * `screenBusy`: the open plan is being worked on right now (a gesture, a
 * drawing, text being typed), so a download must not replace it yet.
 * `openChanged`: the open plan was replaced or removed; show it.
 */
export function storageLocal(screenBusy: () => boolean, openChanged: () => Promise<void> | void): Local {
  return {
    async projects() {
      const out: LocalProject[] = [];
      for (const m of [...state.projects]) {
        // The token is taken before the read: an edit during the read makes it stale (safe).
        const token = projectChangeToken(m.id);
        const d = await projectNow(m.id);
        if (!d) continue;
        const photo = await photoOf(m.id, d);
        const pending = !d.bgImage && photo && 'fingerprint' in photo ? photo.fingerprint : undefined;
        out.push({ id: m.id, name: syncName(m.name), content: { ...tidy(d), photo }, token, ...(pending ? { pendingPhoto: pending } : {}) });
      }
      return out;
    },
    records: getSyncRecords,
    setRecord: setSyncRecord,
    tombstones: getSyncTombstones,
    clearTombstone: clearSyncTombstone,
    async replace(id, name, content, token, bytes) {
      let ok = false;
      let copyId: string | null = null;
      try {
        const photo = 'photo' in content ? { ref: sanitizePhotoRef(content.photo), bytes } : undefined;
        // A photo kept on this device only, about to be replaced by another: it's on no server,
        // so this device's version is kept as a copy first.
        const here = photo ? await bgOf(id) : null;
        const same = here && photo?.ref && 'fingerprint' in photo.ref && (await photoFingerprint(here.dataUrl)) === photo.ref.fingerprint;
        if (here?.deviceOnly && !same && !(photo?.ref && 'deviceOnly' in photo.ref)) {
          const d = state.currentProjectId === id ? currentProjectData() : await readProject(id);
          const meta = state.projects.find((p) => p.id === id);
          if (d && meta) copyId = await createProject(syncName(`${meta.name} — with this device’s photo`), { ...d, bgImage: { ...here } });
        }
        ok = await replaceProjectContent(id, syncName(name), content, token, () => !screenBusy(), photo);
        if (!ok && copyId) await deleteProject(copyId, true);
      } finally {
        if (ok || state.currentProjectId === id) await openChanged(); // (a failed write may still have changed the screen)
      }
      return ok;
    },
    async create(id, name, content, bytes) {
      const data = sanitizeProjectData(content);
      Object.assign(data, placePhoto({ ...data, bgImage: null }, null, sanitizePhotoRef(content.photo), bytes));
      await createProject(syncName(name), data, id);
    },
    async photoData(id) {
      const bg = await bgOf(id);
      return bg && !bg.deviceOnly ? bg.dataUrl : null;
    },
    async hasPhoto(id, fingerprint) {
      const bg = await bgOf(id);
      return !!bg && (await photoFingerprint(bg.dataUrl)) === fingerprint;
    },
    async fillPhoto(id, token, fingerprint, bytes) {
      const ok = await fillProjectPhoto(id, token, fingerprint, bytes, () => !screenBusy());
      if (ok && state.currentProjectId === id) await openChanged();
      return ok;
    },
    async remove(id, token) {
      if (projectChangeToken(id) !== token) return false;
      if (state.currentProjectId === id) {
        // Deleted elsewhere while open here (and unchanged here): open another first.
        if (screenBusy()) return false;
        const other = state.projects.find((p) => p.id !== id);
        const next = other ? other.id : await createProject('My Garden');
        if (projectChangeToken(id) !== token || state.currentProjectId !== id || screenBusy()) return false;
        if (!(await switchProject(next))) return false;
        const gone = await deleteProject(id, true, token);
        await openChanged();
        return gone;
      }
      return deleteProject(id, true, token);
    },
    async keepCopy(from, name, content) {
      // With this device's view and background photo, as the original had them.
      const src = state.currentProjectId === from ? currentProjectData() : await readProject(from);
      const data = sanitizeProjectData(content);
      if (src) Object.assign(data, { zoom: src.zoom, offsetX: src.offsetX, offsetY: src.offsetY, bgImage: src.bgImage ? { ...src.bgImage } : null, photoElsewhere: src.photoElsewhere ?? null });
      const id = await createProject(name, data);
      return { id, token: projectChangeToken(id) };
    },
    async rename(id, name, token) {
      // The project moves on to a token sync knows only if nothing else changed it first.
      const unchanged = projectChangeToken(id) === token;
      const done = renameProject(id, syncName(name)); // (counts the change at once)
      const next = unchanged ? projectChangeToken(id) : -1;
      await done;
      return next;
    },
    normalize(name, content) { return { name: syncName(name), content: tidyDownload(content) }; },
  };
}
