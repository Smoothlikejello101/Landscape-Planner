import { el } from '../dom';
import { I } from '../icons';
import { paste } from '../mutations';
import { state } from '../state';
import { createProject, deleteProject, getClipboard, loadProject, loadProjectData, renameProject, saveCurrentProject } from '../storage';
import { render } from './render';

export function renderProjectsPanel() {
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Projects (' + state.projects.length + ')'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );
  const list = el('div', {});
  const sorted = [...state.projects].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  for (const p of sorted) {
    const isCurrent = p.id === state.currentProjectId;
    const modDate = p.lastModified ? new Date(p.lastModified).toLocaleString() : 'Never';
    const projData = loadProjectData(p.id);
    const shapeCount = projData ? (projData.shapes || []).length : 0;
    const info = el('div', { className: 'pinfo' },
      el('div', { className: 'pname' }, p.name + (isCurrent ? ' (current)' : '')),
      el('div', { className: 'pmeta' }, shapeCount + ' shapes · last modified ' + modDate)
    );
    const actions = el('div', { className: 'pactions' });
    // Rename button
    const renameBtn = el('button', { className: 'iconbtn', html: I.edit });
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.panelArgs = { renamingId: p.id, originalName: p.name };
      state.panel = 'rename';
      render();
    });
    actions.appendChild(renameBtn);
    // Delete button (only if not current and there's more than one project)
    if (!isCurrent && state.projects.length > 1) {
      const delBtn = el('button', { className: 'iconbtn', html: I.trash });
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete project "' + p.name + '"? This cannot be undone.')) {
          deleteProject(p.id);
          render();
        }
      });
      actions.appendChild(delBtn);
    }
    const row = el('div', { className: 'proj-row' + (isCurrent ? ' current' : '') }, info, actions);
    row.addEventListener('click', () => {
      if (p.id !== state.currentProjectId) {
        saveCurrentProject();
        loadProject(p.id);
      }
      state.panel = null;
      render();
    });
    list.appendChild(row);
  }
  // New project button
  const newBtn = el('button', { className: 'btn primary', style: { margin: '16px' },
    html: I.plus + '<span style="margin-left:6px">New project</span>' });
  newBtn.addEventListener('click', () => {
    const name = prompt('Name for new project:', 'Untitled');
    if (name === null) return;
    saveCurrentProject();
    const id = createProject(name || 'Untitled');
    loadProject(id);
    state.panel = null;
    render();
  });
  // Paste from clipboard
  const clip = getClipboard();
  let pasteBtn = null;
  if (clip && clip.shapes && clip.shapes.length) {
    pasteBtn = el('button', { className: 'btn ghost', style: { margin: '0 16px 16px' },
      html: I.paste + '<span style="margin-left:6px">Paste ' + clip.shapes.length + ' shape' + (clip.shapes.length !== 1 ? 's' : '') + ' here</span>' });
    pasteBtn.addEventListener('click', () => {
      paste();
      state.panel = null;
      render();
    });
  }
  const sheet = el('div', { className: 'sheet' }, header, list, newBtn);
  if (pasteBtn) sheet.appendChild(pasteBtn);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

export function renderRenamePanel() {
  const args = state.panelArgs || {};
  const original = args.originalName || '';
  const renamingId = args.renamingId || state.currentProjectId;
  const input = el('input', { type: 'text', value: original });
  setTimeout(() => { input.focus(); input.select(); }, 50);
  const doRename = () => {
    const v = input.value.trim() || 'Untitled';
    renameProject(renamingId, v);
    state.panel = state.panelArgs.returnTo || 'projects';
    state.panelArgs = null;
    render();
  };
  const saveBtn = el('button', { className: 'btn primary' }, 'Save');
  saveBtn.addEventListener('click', doRename);
  const cancelBtn = el('button', { className: 'btn ghost' }, 'Cancel');
  cancelBtn.addEventListener('click', () => { state.panel = state.panelArgs?.returnTo || 'projects'; state.panelArgs = null; render(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doRename(); });
  const modal = el('div', { className: 'modal' },
    el('div', { className: 'sheet-header' },
      el('div', { className: 'title' }, 'Rename project'),
      (() => { const b = el('button', { className: 'iconbtn', html: I.x }); b.addEventListener('click', () => { state.panel = state.panelArgs?.returnTo || 'projects'; state.panelArgs = null; render(); }); return b; })()
    ),
    el('div', { className: 'sheet-body' },
      el('div', { className: 'field' }, el('label', {}, 'Project name'), input),
      el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, cancelBtn, saveBtn)
    )
  );
  const overlay = el('div', { className: 'overlay center' }, modal);
  return overlay;
}
