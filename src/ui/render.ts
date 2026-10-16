import { resizeCanvas } from '../canvas';
import { el, svgEl } from '../dom';
import { onCanvasPointerDown, onWheel } from '../gestures';
import { canRedo, canUndo, redo, undo } from '../history';
import { I } from '../icons';
import { copySelected, deleteSelected, setViewFilter, zoomBy } from '../mutations';
import { clearSelection, singleSelected } from '../selection';
import { state } from '../state';
import { typeName } from '../util';
import { fmtFeet, screenToFeet } from '../geometry';
import { measuredFeet, canDeleteVertex, canFinishDraw, cancelDraw, deleteSelectedVertex, drawPathWidth, editedShape, finishDraw, finishEditPoints, finishesItself, setDrawHover, setDrawKind, setDrawPathWidth, startKind, undoDrawPoint } from '../draw';
import { redrawHandles } from '../canvas';
import { kindDef, METHOD_LABELS, nextTapPrompt, type KindKey } from '../kinds';
import { methodIcon, renderAddSheet, renderShortcutsPanel, withKey } from './add-sheet';
import { currentProject, storageIsDurable } from '../storage';
import { renderBgDistanceModal, renderBgPanel } from './background-panel';
import { renderLayersPanel } from './layers-panel';
import { renderMoreMenu } from './menu';
import { renderExportModal, renderPreviewModal, renderResetModal } from './modals';
import { renderPlantsPanel } from './plants-panel';
import { renderPrintPanel } from './print-panel';
import { renderPlantForm } from './plant-form';
import { renderBloomPanel } from './bloom-view';
import { fullRingRadius } from '../my-plants';
import { filterActive, filterText } from '../status';
import { toast } from './toast';
import { renderProjectsPanel, renderRenamePanel } from './projects-panel';
import { renderArrangePanel, renderPropsPanel, resetKindChange } from './props-panel';

// MAIN RENDER
// ============================================================
function statusText() {
  const n = state.shapes.length;
  return n + (n === 1 ? ' shape · ' : ' shapes · ') + Math.round(state.zoom * 100) + '%';
}
/** Refresh the shape count / zoom readout without rebuilding the page. */
export function updateStatusReadout() {
  const node = document.querySelector('.project-btn .pinfo');
  if (node) node.textContent = statusText();
}

export function render() {
  const root = document.getElementById('root')!;
  // Clear root
  while (root.firstChild) root.removeChild(root.firstChild);

  const app = el('div', { className: 'app' });
  if (!storageIsDurable()) {
    app.appendChild(el('div', { className: 'storage-warning', role: 'alert' },
      "This browser isn't saving your work. Use Projects → Back up to keep it."));
  }

  // ===== TOP BAR =====
  const topbar = el('div', { className: 'topbar' });
  const proj = currentProject();
  const projName = proj ? proj.name : 'Untitled';
  const projBtn = el('button', { className: 'project-btn' },
    el('div', { className: 'pname' }, projName),
    el('div', { html: I.chevronDown, style: { display: 'flex', color: '#78716c' } }),
    el('div', { className: 'pinfo' }, statusText())
  );
  projBtn.addEventListener('click', () => { state.panel = 'projects'; render(); });
  topbar.appendChild(projBtn);

  // Undo
  const undoBtn = el('button', { className: 'iconbtn', html: I.undo, title: 'Undo' });
  undoBtn.disabled = !canUndo() || !!state.draw; // while drawing, the bar's Undo removes the last point
  undoBtn.addEventListener('click', () => { undo(); render(); });
  topbar.appendChild(undoBtn);

  // Redo
  const redoBtn = el('button', { className: 'iconbtn', html: I.redo, title: 'Redo' });
  redoBtn.disabled = !canRedo() || !!state.draw;
  redoBtn.addEventListener('click', () => { redo(); render(); });
  topbar.appendChild(redoBtn);

  // Layers
  const layersBtn = el('button', { className: 'iconbtn', html: I.layers, title: 'Layers' });
  layersBtn.addEventListener('click', () => { state.panel = 'layers'; render(); });
  topbar.appendChild(layersBtn);

  // Export
  const exportBtn = el('button', { className: 'iconbtn', html: I.download, title: 'Export' });
  exportBtn.disabled = state.shapes.length === 0;
  exportBtn.addEventListener('click', () => { state.panel = 'export'; render(); });
  topbar.appendChild(exportBtn);

  // More menu
  const moreBtn = el('button', { className: 'iconbtn' + (state.selectMode ? ' active' : ''), html: I.more, title: 'More' });
  moreBtn.addEventListener('click', () => { state.menu = state.menu ? null : 'more'; render(); });
  topbar.appendChild(moreBtn);

  app.appendChild(topbar);

  // ===== CANVAS WRAP =====
  const canvasWrap = el('div', { className: 'canvas-wrap', id: 'canvas-wrap' });
  const svg = svgEl('svg', { id: 'canvas-svg', width: state.canvasW, height: state.canvasH });
  svg.addEventListener('pointerdown', onCanvasPointerDown);
  svg.addEventListener('touchstart', e => { if (e.touches && e.touches.length === 2) e.preventDefault(); }, { passive: false });
  svg.addEventListener('touchmove', e => { if (e.touches && e.touches.length === 2) e.preventDefault(); }, { passive: false });
  svg.addEventListener('wheel', onWheel, { passive: false });
  // With a mouse, the shape being drawn follows the pointer to the next click.
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons || !state.draw || state.draw.kind === 'measure') return;
    setDrawHover(screenToFeet(e.clientX, e.clientY));
    redrawHandles();
  });
  svg.addEventListener('pointerleave', () => { if (state.draw) { setDrawHover(null); redrawHandles(); } });
  canvasWrap.appendChild(svg);

  // Mode banner (when select mode is on)
  if (state.selectMode) {
    const banner = el('div', { className: 'mode-banner' });
    banner.innerHTML = I.lasso + '<span>Select mode — drag to lasso, tap to toggle</span>';
    const closeX = el('button', { className: 'iconbtn', style: { width: '20px', height: '20px', padding: 0 }, html: I.x });
    closeX.addEventListener('click', () => {
      state.selectMode = false;
      clearSelection();
      render();
    });
    banner.appendChild(closeX);
    canvasWrap.appendChild(banner);
  }

  // Background edit-mode banner
  if (state.bgEditMode && !state.bgCalibrate) {
    const banner = el('div', { className: 'mode-banner' });
    banner.innerHTML = I.move + '<span>Editing background — drag image to move, use ⟳ handle to rotate</span>';
    const doneBtn = el('button', { className: 'iconbtn', style: { width: '20px', height: '20px', padding: 0 }, html: I.x });
    doneBtn.addEventListener('click', () => { state.bgEditMode = false; render(); });
    banner.appendChild(doneBtn);
    canvasWrap.appendChild(banner);
  }

  // Calibration banner
  if (state.bgCalibrate) {
    const banner = el('div', { className: 'mode-banner' });
    const msg = state.bgCalibrate.step === 'point1' ? 'Tap the first known point on the image (A)'
      : state.bgCalibrate.step === 'point2' ? 'Tap the second known point (B)'
      : 'Enter the real distance between A and B';
    banner.innerHTML = I.target + '<span>Calibrating — ' + msg + '</span>';
    const cancelBtn = el('button', { className: 'iconbtn', style: { width: '20px', height: '20px', padding: 0 }, html: I.x });
    cancelBtn.addEventListener('click', () => {
      state.bgCalibrate = null;
      if (state.panel === 'bgDistance') state.panel = 'bg';
      render();
    });
    banner.appendChild(cancelBtn);
    canvasWrap.appendChild(banner);
  }

  // Drawing / point-editing banner
  if (state.editPoints && !editedShape()) state.editPoints = null; // e.g. undone past its creation
  if (state.draw || state.editPoints) {
    const d = state.draw;
    const feet = measuredFeet();
    const msg = d
      ? d.kind === 'measure'
        ? (feet != null ? `${fmtFeet(feet)} ft — Keep adds it to the plan; tap again to measure again`
          : d.points.length ? 'Tap the other end' : 'Measuring — tap two points')
        : `${kindDef(d.target ?? 'plain').label}: ${nextTapPrompt(d.kind, d.points.length)}`
      : state.editPoints!.vertex != null ? 'Point selected — drag it, or Delete point below' : 'Drag a point to move it · tap + to add one';
    const banner = el('div', { className: 'mode-banner draw-banner', 'data-testid': 'draw-banner' });
    banner.innerHTML = I.draw + '<span></span>';
    banner.querySelector('span')!.textContent = msg;
    canvasWrap.appendChild(banner);
  }

  // Showing only some plants: say so, with a way back to everything.
  if (filterActive(state.viewFilter) && !state.draw && !state.editPoints && !state.bgCalibrate) {
    const f = state.viewFilter;
    const what = filterText(f) || 'All plants';
    const banner = el('div', { className: 'mode-banner filter-banner', 'data-testid': 'filter-banner' });
    banner.appendChild(el('span', {}, 'Showing: ' + what + (f.showGone ? ' (gone included)' : '')));
    const clear = el('button', { className: 'iconbtn', style: { width: '20px', height: '20px', padding: 0 }, html: I.x, title: 'Show all', 'aria-label': 'Show all plants' });
    clear.addEventListener('click', () => { setViewFilter({ status: '', phase: '', showGone: false }); render(); });
    banner.appendChild(clear);
    canvasWrap.appendChild(banner);
  }

  // Zoom buttons
  const zoomBtns = el('div', { className: 'zoombtns' });
  const zIn = el('button', { className: 'zoombtn', html: I.zoomIn });
  zIn.addEventListener('click', () => { zoomBy(1.25); render(); });
  const zOut = el('button', { className: 'zoombtn', html: I.zoomOut });
  zOut.addEventListener('click', () => { zoomBy(0.8); render(); });
  zoomBtns.appendChild(zIn); zoomBtns.appendChild(zOut);
  canvasWrap.appendChild(zoomBtns);

  // Empty hint
  if (state.shapes.length === 0 && !state.draw) {
    canvasWrap.appendChild(el('div', { className: 'empty-hint' },
      el('div', {}, 'Tap a button below to add something.'),
      el('div', {}, 'Grid lines are ', el('b', {}, '1 ft'), ' apart; bold lines every ', el('b', {}, '10 ft'), '.')
    ));
  }

  // Multi-select action bar (floating, only when 2+ selected and no panel open)
  const drawing = !!state.draw || !!state.editPoints;
  if (state.selectedIds.length >= 2 && !state.panel && !drawing) {
    const bar = el('div', { className: 'multi-bar' });
    bar.appendChild(el('div', { className: 'count' }, state.selectedIds.length + ' selected'));
    const editAllBtn = el('button', { title: 'Edit' });
    editAllBtn.innerHTML = I.edit + '<span>Edit</span>';
    editAllBtn.addEventListener('click', () => { state.panel = 'props'; render(); });
    const copyBtn = el('button', { title: 'Copy' });
    copyBtn.innerHTML = I.copy;
    copyBtn.addEventListener('click', () => {
      copySelected();
      // brief visual feedback
      copyBtn.style.background = 'rgba(255,255,255,0.2)';
      setTimeout(() => { copyBtn.style.background = ''; }, 300);
    });
    const delBtn = el('button', { title: 'Delete' });
    delBtn.innerHTML = I.trash;
    delBtn.addEventListener('click', () => { deleteSelected(); render(); });
    const closeBtn = el('button', { title: 'Deselect' });
    closeBtn.innerHTML = I.x;
    closeBtn.addEventListener('click', () => { clearSelection(); render(); });
    bar.appendChild(editAllBtn);
    bar.appendChild(copyBtn);
    bar.appendChild(delBtn);
    bar.appendChild(closeBtn);
    canvasWrap.appendChild(bar);
  }

  // Single-select pill (only when exactly 1 selected, no panel open, no multi-bar)
  if (state.selectedIds.length === 1 && !state.panel && !drawing) {
    const s = singleSelected();
    if (s) {
      const pill = el('div', { className: 'sel-pill' });
      pill.appendChild(el('div', { className: 'sw', style: { background: s.color } }));
      pill.appendChild(el('div', { className: 'name' }, s.label || ('Unlabeled ' + typeName(s.type))));
      const editBtn = el('button', { className: 'edit' });
      editBtn.innerHTML = I.edit + '<span>Edit</span>';
      editBtn.addEventListener('click', () => { state.panel = 'props'; render(); });
      pill.appendChild(editBtn);
      canvasWrap.appendChild(pill);
    }
  }

  app.appendChild(canvasWrap);

  // ===== BOTTOM TOOLBAR =====
  // Named by what gets added, not by shape: the three most common things, and Add for the rest.
  const bottomBar = el('div', { className: 'bottom-toolbar' });
  const kindBtn = (key: KindKey, cls: string, icon: string) => {
    const k = kindDef(key);
    const b = el('button', { className: 'tool-btn ' + cls, title: withKey(k), 'data-kind': key });
    b.innerHTML = icon + '<div class="lbl">' + k.label + '</div>';
    b.addEventListener('click', () => { startKind(key); render(); });
    return b;
  };
  bottomBar.appendChild(kindBtn('plant', 'plants', I.leaf));
  bottomBar.appendChild(kindBtn('bed', 'bed', I.bed));
  bottomBar.appendChild(kindBtn('path', 'path', I.path));
  const addBtn = el('button', { className: 'tool-btn add', title: 'Add something else (A)', 'data-testid': 'add-btn' });
  addBtn.innerHTML = I.plus + '<div class="lbl">Add</div>';
  addBtn.addEventListener('click', () => { state.panel = 'add'; render(); });
  bottomBar.appendChild(addBtn);
  app.appendChild(drawing ? renderDrawBar() : bottomBar);

  root.appendChild(app);

  // ===== PANELS / MODALS / MENU =====
  if (state.panel !== 'props') resetKindChange(); // the kind list opens fresh each time
  let panelNode = null;
  if (state.panel === 'props') panelNode = renderPropsPanel();
  else if (state.panel === 'arrange') panelNode = renderArrangePanel();
  else if (state.panel === 'layers') panelNode = renderLayersPanel();
  else if (state.panel === 'projects') panelNode = renderProjectsPanel();
  else if (state.panel === 'rename') panelNode = renderRenamePanel();
  else if (state.panel === 'export') panelNode = renderExportModal();
  else if (state.panel === 'preview') panelNode = renderPreviewModal();
  else if (state.panel === 'reset') panelNode = renderResetModal();
  else if (state.panel === 'plants') panelNode = renderPlantsPanel();
  else if (state.panel === 'bg') panelNode = renderBgPanel();
  else if (state.panel === 'bgDistance') panelNode = renderBgDistanceModal();
  else if (state.panel === 'print') panelNode = renderPrintPanel();
  else if (state.panel === 'plantForm') panelNode = renderPlantForm();
  else if (state.panel === 'bloom') panelNode = renderBloomPanel();
  else if (state.panel === 'add') panelNode = renderAddSheet();
  else if (state.panel === 'shortcuts') panelNode = renderShortcutsPanel();
  if (panelNode) root.appendChild(panelNode);
  if (state.menu === 'more') root.appendChild(renderMoreMenu());

  // Now that the SVG is in the DOM, size it and draw grid/shapes
  resizeCanvas();
  maybeExplainFullSize();
}

/** Bottom bar while drawing or editing an outline's points. */
function renderDrawBar(): HTMLElement {
  const bar = el('div', { className: 'bottom-toolbar draw-bar', 'data-testid': 'draw-bar' });
  const btn = (label: string, cls: string, onClick: () => void, disabled = false) => {
    const b = el('button', { className: 'draw-btn ' + cls }, label);
    b.disabled = disabled;
    b.addEventListener('click', () => { onClick(); render(); });
    return b;
  };
  const d = state.draw;
  if (d && d.kind === 'measure') {
    bar.appendChild(btn('Keep', '', () => { finishDraw(); }, !canFinishDraw()));
    bar.appendChild(btn('Done', 'primary', cancelDraw));
    return bar;
  }
  if (d) {
    const kind = kindDef(d.target ?? 'plain');
    const col = el('div', { className: 'draw-bar-rows' });
    // How to draw it: each choice pictures its taps.
    if (kind.methods.length > 1) {
      const seg = el('div', { className: 'method-seg', role: 'group', 'aria-label': 'Draw it as' });
      for (const m of kind.methods) {
        const on = d.kind === m;
        const b = el('button', { className: on ? 'on' : '', 'aria-pressed': String(on), 'data-method': m });
        b.innerHTML = methodIcon(m) + '<span></span>';
        b.querySelector('span')!.textContent = METHOD_LABELS[m];
        b.addEventListener('click', () => { setDrawKind(m); render(); });
        seg.appendChild(b);
      }
      col.appendChild(seg);
    }
    const row = el('div', { className: 'draw-bar-row' });
    if (d.kind === 'path') {
      // The path's width, typed without re-rendering (keyboard safety): only the preview redraws.
      const w = el('input', { type: 'number', min: '0.25', max: '50', step: '0.5', inputMode: 'decimal', value: drawPathWidth(), 'aria-label': 'Path width in feet', 'data-testid': 'draw-path-width' }) as HTMLInputElement;
      w.addEventListener('input', () => { setDrawPathWidth(parseFloat(w.value.replace(',', '.'))); redrawHandles(); });
      row.appendChild(el('label', { className: 'draw-width' }, w, el('span', {}, 'ft wide')));
    }
    row.appendChild(btn('Undo', '', undoDrawPoint, d.points.length === 0));
    row.appendChild(btn('Cancel', '', cancelDraw));
    if (!finishesItself(d.kind)) row.appendChild(btn('Done', 'primary', () => { finishDraw(); }, !canFinishDraw()));
    col.appendChild(row);
    bar.appendChild(col);
    return bar;
  }
  bar.appendChild(btn('Delete point', 'danger', deleteSelectedVertex, !canDeleteVertex()));
  bar.appendChild(btn('Done', 'primary', () => {
    const id = state.editPoints?.id;
    finishEditPoints();
    if (id) { state.selectedIds = [id]; state.panel = 'props'; }
  }));
  return bar;
}

/** The first time a plant with a full-size ring is selected, say what the ring is (once per device). */
function maybeExplainFullSize() {
  const s = singleSelected();
  if (!s || state.panel || !fullRingRadius(s)) return;
  const KEY = 'lp-hint-full-size';
  try {
    if (localStorage.getItem(KEY)) return;
    localStorage.setItem(KEY, '1');
  } catch { return; } // no storage: skip the hint rather than repeat it every time
  toast('Circles show typical size; the dashed ring is full size. Change it in Layers.', 7000);
}
