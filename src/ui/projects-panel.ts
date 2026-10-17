import { backupAll, buildProjectFile, canShareFiles, downloadText, importProjects, parseImportFile, parseImportPlants } from '../backup';
import { mergeMyPlants } from '../my-plants';
import { el } from '../dom';
import { I } from '../icons';
import { paste } from '../mutations';
import { pushHistory } from '../history';
import { state } from '../state';
import { createProject, deleteProject, getClipboard, getLastBackupAt, isPersisted, renameProject, storageIsDurable, switchProject } from '../storage';
import type { PanelName } from '../types';
import { errMsg } from '../util';
import { render } from './render';
import { accountSection } from './account-section';
import { toast } from './toast';

function closeButton(onClick: () => void) {
  const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' });
  b.addEventListener('click', onClick);
  return b;
}
async function openProject(id: string) {
  if (!(await switchProject(id))) {
    if (!state.projects.some((p) => p.id === id)) { render(); return; } // deleted on another device just now (sync says so)
    alert("Your latest changes couldn't be saved, so the project wasn't switched. Check that your device has free space, then try again.");
    render();
    return;
  }
  pushHistory(); // seed undo with the loaded state
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
      const n = await backupAll(via);
      if (n) toast(`Backed up ${n} project${n === 1 ? '' : 's'}`);
      render();
    } catch (e) { alert('Backup failed: ' + errMsg(e)); }
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
    } catch (e) { alert(errMsg(e)); }
  });
  const imp = el('button', { className: 'btn ghost', html: I.upload + '<span>Import from file</span>' });
  imp.addEventListener('click', () => fileInput.click());
  section.appendChild(fileInput);
  section.appendChild(imp);
  return section;
}

export function renderProjectsPanel() {
  const close = () => { state.panel = null; render(); };
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Projects (' + state.projects.length + ')'),
    closeButton(close));
  const list = el('div', {});
  const sorted = [...state.projects].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  for (const p of sorted) {
    const isCurrent = p.id === state.currentProjectId;
    const shapeCount = isCurrent ? state.shapes.length : (p.shapeCount ?? 0);
    const info = el('div', { className: 'pinfo' },
      el('div', { className: 'pname' }, p.name + (isCurrent ? ' (current)' : '')),
      el('div', { className: 'pmeta' }, shapeCount + ' shapes · last modified ' + new Date(p.lastModified).toLocaleString()));
    const actions = el('div', { className: 'pactions' });

    const exportBtn = el('button', { className: 'iconbtn', html: I.download, title: 'Save project file', 'aria-label': 'Save ' + p.name + ' as a file' });
    exportBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const file = await buildProjectFile(p.id);
        if (file) { downloadText(file.filename, file.text); toast('Saved ' + file.filename); }
      } catch (err) { alert('Export failed: ' + errMsg(err)); }
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
        if (confirm('Delete project "' + p.name + '"? This cannot be undone.')) {
          await deleteProject(p.id);
          render();
        }
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
    const name = prompt('Name for new project:', 'Untitled');
    if (name === null) return;
    await openProject(await createProject(name || 'Untitled'));
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
    if (renamingId) await renameProject(renamingId, input.value);
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
