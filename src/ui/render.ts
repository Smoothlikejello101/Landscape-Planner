import { resizeCanvas } from '../canvas';
import { el, svgEl } from '../dom';
import { onCanvasPointerDown, onWheel } from '../gestures';
import { canRedo, canUndo, redo, undo } from '../history';
import { I } from '../icons';
import { addShape, copySelected, deleteSelected, setViewFilter, zoomBy } from '../mutations';
import { clearSelection, singleSelected } from '../selection';
import { state } from '../state';
import type { ShapeType } from '../types';
import { typeName } from '../util';
import { fmtFeet } from '../geometry';
import { measuredFeet, canDeleteVertex, canFinishDraw, cancelDraw, deleteSelectedVertex, editedShape, finishDraw, finishEditPoints, setDrawKind, startDraw, undoDrawPoint } from '../draw';
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
import { renderArrangePanel, renderPropsPanel } from './props-panel';

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
        : (d.kind === 'poly'
        ? (d.points.length === 0 ? 'Drawing an outline — tap to place the first corner'
          : d.points.length < 3 ? 'Tap to add corners · drag to move around'
          : 'Tap the first point (or Done) to close the outline')
        : (d.points.length < 2 ? 'Drawing a line — tap to add points · drag to move around' : 'Tap to add points · Done when finished'))
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
  const bottomBar = el('div', { className: 'bottom-toolbar' });
  const mkShapeBtn = (type: ShapeType, cls: string, label: string, icon: string) => {
    const b = el('button', { className: 'tool-btn ' + cls });
    b.innerHTML = icon + '<div class="lbl">' + label + '</div>';
    b.addEventListener('click', () => { addShape(type); render(); });
    return b;
  };
  bottomBar.appendChild(mkShapeBtn('circle', 'circle', 'Circle', I.circle));
  bottomBar.appendChild(mkShapeBtn('rect', 'rect', 'Rect', I.square));
  bottomBar.appendChild(mkShapeBtn('oval', 'oval', 'Oval', I.oval));
  bottomBar.appendChild(mkShapeBtn('triangle', 'tri', 'Triangle', I.triangle));
  const drawBtn = el('button', { className: 'tool-btn draw', 'data-testid': 'draw-btn' });
  drawBtn.innerHTML = I.draw + '<div class="lbl">Draw</div>';
  drawBtn.addEventListener('click', () => { startDraw('poly'); render(); });
  bottomBar.appendChild(drawBtn);
  bottomBar.appendChild(mkShapeBtn('text', 'text', 'Text', I.text));
  const plantsBtn = el('button', { className: 'tool-btn plants' });
  plantsBtn.innerHTML = I.leaf + '<div class="lbl">Plants</div>';
  plantsBtn.addEventListener('click', () => { state.panel = 'plants'; render(); });
  bottomBar.appendChild(plantsBtn);
  app.appendChild(drawing ? renderDrawBar() : bottomBar);

  root.appendChild(app);

  // ===== PANELS / MODALS / MENU =====
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
  if (panelNode) root.appendChild(panelNode);
  if (state.menu === 'more') root.appendChild(renderMoreMenu());

  // Now that the SVG is in the DOM, size it and draw grid/shapes
  resizeCanvas();
  maybeExplainFullSize();
}

/** Bottom bar while drawing an outline/line or editing its points. */
function renderDrawBar(): HTMLElement {
  const bar = el('div', { className: 'bottom-toolbar draw-bar', 'data-testid': 'draw-bar' });
  const btn = (label: string, cls: string, onClick: () => void, disabled = false) => {
    const b = el('button', { className: 'draw-btn ' + cls }, label);
    b.disabled = disabled;
    b.addEventListener('click', () => { onClick(); render(); });
    return b;
  };
  const d = state.draw;
  if (d) {
    const seg = el('div', { className: 'seg', role: 'group', 'aria-label': 'Kind' });
    for (const [kind, label] of [['poly', 'Outline'], ['line', 'Line'], ['measure', 'Measure']] as const) {
      const b = el('button', { className: d.kind === kind ? 'on' : '', 'aria-pressed': String(d.kind === kind) }, label);
      b.addEventListener('click', () => { setDrawKind(kind); render(); });
      seg.appendChild(b);
    }
    bar.appendChild(seg);
    if (d.kind === 'measure') {
      bar.appendChild(btn('Keep', '', () => { finishDraw(); }, !canFinishDraw()));
      bar.appendChild(btn('Done', 'primary', cancelDraw));
    } else {
      bar.appendChild(btn('Undo', '', undoDrawPoint, d.points.length === 0));
      bar.appendChild(btn('Cancel', '', cancelDraw));
      bar.appendChild(btn('Done', 'primary', () => { finishDraw(); }, !canFinishDraw()));
    }
  } else {
    bar.appendChild(btn('Delete point', 'danger', deleteSelectedVertex, !canDeleteVertex()));
    bar.appendChild(btn('Done', 'primary', () => {
      const id = state.editPoints?.id;
      finishEditPoints();
      if (id) { state.selectedIds = [id]; state.panel = 'props'; }
    }));
  }
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
