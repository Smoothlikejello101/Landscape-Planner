import { state } from '../state';
import {
  clearSyncTombstone, createProject, deleteProject, editSequence, getSyncRecords, getSyncTombstones, projectNow,
  renameProject, replaceProjectContent, sanitizeProjectData, setSyncRecord, switchProject, syncedContent,
} from '../storage';
import type { Local, ProjectContent } from './engine';

// This device's side of sync: the projects in its storage.

/** A project's synced content, checked and tidied exactly as a download would be. */
function tidy(content: unknown): ProjectContent {
  return syncedContent(sanitizeProjectData(content)) as unknown as ProjectContent;
}

/**
 * `screenBusy`: the open plan is being worked on right now (a gesture, a
 * drawing, text being typed), so a download must not replace it yet.
 * `openChanged`: the open plan was replaced or removed; show it.
 */
export function storageLocal(screenBusy: () => boolean, openChanged: () => Promise<void> | void): Local {
  return {
    async projects() {
      const out = [];
      for (const m of [...state.projects]) {
        const d = await projectNow(m.id);
        if (d) out.push({ id: m.id, name: m.name, content: tidy(d) });
      }
      return out;
    },
    records: getSyncRecords,
    setRecord: setSyncRecord,
    tombstones: getSyncTombstones,
    clearTombstone: clearSyncTombstone,
    async replace(id, name, content) {
      const open = state.currentProjectId === id;
      if (open && screenBusy()) return false;
      const ok = await replaceProjectContent(id, name, content, editSequence());
      if (ok && open) await openChanged();
      return ok;
    },
    async create(id, name, content) {
      await createProject(name.trim() || 'Untitled', sanitizeProjectData(content), id);
    },
    async remove(id) {
      if (state.currentProjectId === id) {
        // Deleted elsewhere while open here (and unchanged here): open another first.
        const other = state.projects.find((p) => p.id !== id);
        const next = other ? other.id : await createProject('My Garden');
        if (!(await switchProject(next))) return;
        await deleteProject(id, true);
        await openChanged();
        return;
      }
      await deleteProject(id, true);
    },
    async keepCopy(name, content) {
      return createProject(name, sanitizeProjectData(content));
    },
    async rename(id, name) { await renameProject(id, name); },
    normalize(name, content) { return { name: name.trim() || 'Untitled', content: tidy(content) }; },
  };
}
