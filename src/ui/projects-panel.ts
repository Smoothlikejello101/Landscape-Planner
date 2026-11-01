import { backupAll, backupSaid, buildProjectFile, canShareFiles, downloadText, importProjects, parseImportFile, parseImportPlants, uniqueName } from '../backup';
import { mergeMyPlants } from '../my-plants';
import { el } from '../dom';
import { I } from '../icons';
import { paste } from '../mutations';
import { pushHistory } from '../history';
import { state } from '../state';
import { createProject, deleteProject, emptyProjectData, getClipboard, getLastBackupAt, isPersisted, renameProject, storageIsDurable, switchProject } from '../storage';
import type { PanelName } from '../types';
import { deepClone, errMsg } from '../util';
import { render } from './render';
import { accountSection } from './account-section';
import { deleteNote } from '../sync/sync';
import { toast } from './toast';
import { askChoice, askTextAnd, tell } from './ask';
import { householdCopy, yardSet } from '../yard';
import { allSwitchesOn, switchesCopy } from '../view-settings';

function closeButton(onClick: () => void) {
  const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  b.addEventListener('click', onClick);
  return b;
}
async function openProject(id: string) {
  if (!(await switchProject(id))) {
    if (!state.projects.some((p) => p.id === id)) { render(); return; } // deleted on another device just now (sync says so)
    render();
    void tell("Your latest changes couldn't be saved, so the project wasn't switched. Check that your device has free space, then try again.");
    return;
  }
  if (!state.history.length) pushHistory(); // seed undo with the loaded state (unless its steps were kept: src/storage.ts)
  state.panel = null;
  render();
}
function formatDate(t: number | null): string {
  if (!t) return 'never';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function backupSection(): HTMLElement {
  const section = el('div', { className: 'backup-section' }, el('div', { className: 'section-title' }, 'Backup'));
  if (!storageIsDurable()) {
    section.appendChild(el('div', { className: 'status warn' },
      "This browser isn't letting the app save, so changes are lost when it closes. Back up your projects to keep them."));
  } else {
    section.appendChild(el('div', { className: 'status' + (isPersisted() ? '' : ' warn') },
      isPersisted()
        ? 'Projects are saved on this device and protected from automatic clearing.'
        : 'Projects are saved on this device, but the browser may clear them if space runs low. Keep a backup.'));
  }
  section.appendChild(el('div', { className: 'status' }, 'Last full backup: ' + formatDate(getLastBackupAt())));

  const runBackup = async (via: 'download' | 'share') => {
    try {
      const b = await backupAll(via);
      if (b) toast(backupSaid(b), 10000);
      render();
    } catch (e) { void tell('Backup failed: ' + errMsg(e)); }
  };
  const dl = el('button', { className: 'btn ghost', html: I.download + '<span>Back up all projects</span>' });
  dl.addEventListener('click', () => void runBackup('download'));
  section.appendChild(dl);
  if (canShareFiles()) {
    const share = el('button', { className: 'btn ghost', html: I.share + '<span>Share backup to Drive, email…</span>' });
    share.addEventListener('click', () => void runBackup('share'));
    section.appendChild(share);
  }

  const fileInput = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, 'data-testid': 'import-file' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      const list = parseImportFile(text);
      const added = await mergeMyPlants(parseImportPlants(text)); // before opening, so sun checks have the plant data
      const ids = await importProjects(list);
      toast(`Imported ${ids.length} project${ids.length === 1 ? '' : 's'}` + (added ? ` and ${added} of your plants` : ''));
      if (ids.length === 1) await openProject(ids[0]);
      else render();
    } catch (e) { void tell(errMsg(e)); }
  });
  const imp = el('button', { className: 'btn ghost', html: I.upload + '<span>Import from file</span>' });
  imp.addEventListener('click', () => fileInput.click());
  section.appendChild(fileInput);
  section.appendChild(imp);
  return section;
}

/** The list's order as it opened, kept until it closes (src/ui/render.ts calls projectsClosed). */
let shownOrder: string[] | null = null;
export function projectsClosed() { shownOrder = null; }

export function renderProjectsPanel() {
  const close = () => { state.panel = null; render(); };
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Projects (' + state.projects.length + ')'),
    closeButton(close));
  const list = el('div', {});
  // (Newest change first, as it opens; then kept so while it's open, a rename and a trip back included: rows moved
  // under the finger, and a tap meant for one opened another. Jason, Oct 31, from round 3: Sam. New plans on top.)
  const byTime = [...state.projects].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  shownOrder ??= byTime.map((p) => p.id);
  const rank = (id: string) => shownOrder!.indexOf(id);
  const sorted = byTime.sort((a, b) => rank(a.id) - rank(b.id));
  for (const p of sorted) {
    const isCurrent = p.id === state.currentProjectId;
    const shapeCount = isCurrent ? state.shapes.length : (p.shapeCount ?? 0);
    const info = el('div', { className: 'pinfo' },
      el('div', { className: 'pname' }, p.name + (isCurrent ? ' (current)' : '')),
      el('div', { className: 'pmeta' }, shapeCount + (shapeCount === 1 ? ' shape' : ' shapes') + ' · last modified ' + new Date(p.lastModified).toLocaleString()));
    const actions = el('div', { className: 'pactions' });

    const exportBtn = el('button', { className: 'iconbtn', html: I.download, title: 'Save project file', 'aria-label': 'Save ' + p.name + ' as a file' });
    exportBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const file = await buildProjectFile(p.id);
        if (file) { downloadText(file.filename, file.text); toast(`Saved ${file.filename} to your Downloads`, 6000); }
      } catch (err) { void tell('Export failed: ' + errMsg(err)); }
    });
    actions.appendChild(exportBtn);

    const renameBtn = el('button', { className: 'iconbtn', html: I.edit, title: 'Rename', 'aria-label': 'Rename ' + p.name });
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.panelArgs = { renamingId: p.id, originalName: p.name, returnTo: 'projects' };
      state.panel = 'rename';
      render();
    });
    actions.appendChild(renameBtn);

    if (!isCurrent && state.projects.length > 1) {
      const delBtn = el('button', { className: 'iconbtn', html: I.trash, title: 'Delete', 'aria-label': 'Delete ' + p.name });
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        // (A copy first, as a file, offered beside Delete: the UI review, 2026-11-01. Saved as the row's "Save as a
        // file" saves it, and only then deleted.)
        const choice = await askChoice<'copy' | 'delete'>('Delete project \u201c' + p.name + '\u201d? ' + deleteNote(p.id), [
          { label: 'Save a copy first, then delete', value: 'copy', testid: 'ask-save-first' },
          { label: 'Delete', value: 'delete', danger: true },
        ], { danger: true, testid: 'ask-delete-project' });
        if (!choice || !state.projects.some((x) => x.id === p.id)) return; // (Cancel, or deleted meanwhile by sync)
        let saved = '';
        if (choice === 'copy') {
          try {
            const file = await buildProjectFile(p.id);
            if (!file) throw new Error('the project couldn\u2019t be read');
            downloadText(file.filename, file.text);
            saved = file.filename;
          } catch (err) { void tell('Couldn\u2019t save the copy, so the project wasn\u2019t deleted: ' + errMsg(err)); return; }
        }
        await deleteProject(p.id);
        render();
        if (saved) toast(`Saved ${saved} to your Downloads, then deleted \u201c${p.name}\u201d. To bring it back, open Projects and tap Import from file.`, 10000);
      });
      actions.appendChild(delBtn);
    }
    const row = el('div', { className: 'proj-row' + (isCurrent ? ' current' : '') }, info, actions);
    row.addEventListener('click', () => {
      if (p.id === state.currentProjectId) close();
      else void openProject(p.id);
    });
    list.appendChild(row);
  }

  const newBtn = el('button', { className: 'btn primary', style: { margin: '16px' }, html: I.plus + '<span>New project</span>' });
  newBtn.addEventListener('click', async () => {
    // (The plan open has a location: offered for the new one, ticked, most new plans being of the same garden. Jason,
    // from the UI review, 2026-11-01. Who's in the yard goes with it, answered or not, and the warning switches, Sun's
    // too (Jason, Nov 1); unticked, the new plan asks "Anyone you need to protect?", with every warning on. With no
    // location, it's offered for the yard and the switches alone, once the yard's answered or a warning is off.)
    const here = state.location, yard = state.household.answered || yardSet(state.household), switched = !allSwitchesOn() || !state.sunWarnings;
    const said = await askTextAnd('Name for the new project', 'Untitled', {
      ok: 'Make it', label: 'Project name', check: here || yard || switched ? { label: here ? `Same garden (ZIP ${here.zip})?` : 'Same garden?', checked: true } : undefined,
    });
    if (said === null) return;
    // (Two plans of one name couldn't be told apart: "(2)", as an import does. Round 3, Sam.)
    const name = uniqueName(said.text, state.projects.map((p) => p.name));
    const same = (here || yard || switched) && said.checked;
    await openProject(await createProject(name, same
      ? { ...emptyProjectData(), ...(here ? { location: deepClone(here) } : {}), household: householdCopy(), switches: switchesCopy(), sunWarnings: state.sunWarnings } : undefined));
  });

  const sheet = el('div', { className: 'sheet' }, header, list, newBtn);
  const clip = getClipboard();
  if (clip && clip.shapes && clip.shapes.length) {
    const n = clip.shapes.length;
    const pasteBtn = el('button', { className: 'btn ghost', style: { margin: '0 16px 16px' },
      html: I.paste + `<span>Paste ${n} shape${n !== 1 ? 's' : ''} here</span>` });
    pasteBtn.addEventListener('click', () => { paste(); state.panel = null; render(); });
    sheet.appendChild(pasteBtn);
  }
  sheet.appendChild(accountSection());
  sheet.appendChild(backupSection());
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return overlay;
}

export function renderRenamePanel() {
  const args = state.panelArgs;
  const renamingId = args?.renamingId || state.currentProjectId;
  // Where to go afterwards: back to the projects list, or nowhere (menu rename).
  const returnTo: PanelName | null = args?.returnTo === undefined ? 'projects' : args.returnTo;
  const finish = () => { state.panel = returnTo; state.panelArgs = null; render(); };
  const input = el('input', { type: 'text', value: args?.originalName || '' });
  setTimeout(() => { input.focus(); input.select(); }, 50);
  const doRename = async () => {
    if (renamingId) await renameProject(renamingId, uniqueName(input.value.trim() || 'Untitled', state.projects.filter((p) => p.id !== renamingId).map((p) => p.name)));
    finish();
  };
  const saveBtn = el('button', { className: 'btn primary' }, 'Save');
  saveBtn.addEventListener('click', () => void doRename());
  const cancelBtn = el('button', { className: 'btn ghost' }, 'Cancel');
  cancelBtn.addEventListener('click', finish);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void doRename(); });
  const modal = el('div', { className: 'modal' },
    el('div', { className: 'sheet-header' }, el('div', { className: 'title' }, 'Rename project'), closeButton(finish)),
    el('div', { className: 'sheet-body' },
      el('div', { className: 'field' }, el('label', {}, 'Project name'), input),
      el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, cancelBtn, saveBtn)));
  return el('div', { className: 'overlay center' }, modal);
}
