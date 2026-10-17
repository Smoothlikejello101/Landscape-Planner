import { state } from '../state';
import {
  clearSyncTombstone, createProject, currentProjectData, deleteProject, getSyncRecords, getSyncTombstones, projectChangeToken,
  projectNow, readProject, renameProject, replaceProjectContent, sanitizeProjectData, setSyncRecord, switchProject, syncedContent,
} from '../storage';
import type { Local, LocalProject, ProjectContent } from './engine';

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
/** A project's synced content, checked and tidied exactly as a download would be. */
function tidy(content: unknown): ProjectContent {
  return clean(syncedContent(sanitizeProjectData(content))) as ProjectContent;
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
        if (d) out.push({ id: m.id, name: syncName(m.name), content: tidy(d), token });
      }
      return out;
    },
    records: getSyncRecords,
    setRecord: setSyncRecord,
    tombstones: getSyncTombstones,
    clearTombstone: clearSyncTombstone,
    async replace(id, name, content, token) {
      let ok = false;
      try {
        ok = await replaceProjectContent(id, syncName(name), content, token, () => !screenBusy());
      } finally {
        if (ok || state.currentProjectId === id) await openChanged(); // (a failed write may still have changed the screen)
      }
      return ok;
    },
    async create(id, name, content) {
      await createProject(syncName(name), sanitizeProjectData(content), id);
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
      if (src) Object.assign(data, { zoom: src.zoom, offsetX: src.offsetX, offsetY: src.offsetY, bgImage: src.bgImage ? { ...src.bgImage } : null });
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
    normalize(name, content) { return { name: syncName(name), content: tidy(content) }; },
  };
}
