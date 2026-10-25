import { labelFields } from './a11y';
import { saveStateWord } from './save-warning';
import { resizeCanvas } from '../canvas';
import { el, svgEl } from '../dom';
import { onCanvasPointerDown, onWheel } from '../gestures';
import { canRedo, canUndo, redo, undo } from '../history';
import { I } from '../icons';
import { copySelected, setViewFilter, zoomBy } from '../mutations';
import { deleteSelectedAsking } from './delete-selected';
import { clearSelection, getSelected, singleSelected } from '../selection';
import { state } from '../state';
import { typeName } from '../util';
import { fmtFeet, screenToFeet } from '../geometry';
import { measuredFeet, canDeleteVertex, canFinishDraw, cancelDraw, deleteSelectedVertex, drawPathWidth, editedShape, finishDraw, finishEditPoints, finishesItself, lastSnap, setDrawHover, setDrawKind, setDrawPathWidth, shapeName, startKind, undoDrawPoint, unsnapLast, unsnapVertex, vertexSnap } from '../draw';
import type { TapSnap } from '../types';
import { redrawHandles } from '../canvas';
import { kindDef, METHOD_LABELS, nextTapPrompt, type KindKey } from '../kinds';
import { methodIcon, renderAddSheet, renderShortcutsPanel, withKey } from './add-sheet';
import { finishPlacing, placingPlant, setPlaceHover, undoPlace } from '../place';
import { plantColor } from '../plants';
import { currentProject, storageIsDurable } from '../storage';
import { renderBgDistanceModal, renderBgPanel } from './background-panel';
import { renderLayersPanel } from './layers-panel';
import { snapOn } from '../tidy';
import { dismissToastAction } from './toast';
import { renderMoreMenu, toggleSelectMode } from './menu';
import { renderExportModal, renderPreviewModal, renderResetModal } from './modals';
import { renderPlantsPanel } from './plants-panel';
import { renderPrintPanel } from './print-panel';
import { renderPlantForm } from './plant-form';
import { renderBloomPanel } from './bloom-view';
import { renderLocationPanel } from './location-panel';
import { fullRingRadius } from '../my-plants';
import { filterActive, filterText } from '../status';
import { toast } from './toast';
import { renderProjectsPanel, renderRenamePanel } from './projects-panel';
import { moreOfSame, renderArrangePanel, renderPropsPanel, resetKindChange } from './props-panel';

// MAIN RENDER
// ============================================================
function statusText() {
  const n = state.shapes.length;
  return n + (n === 1 ? ' shape · ' : ' shapes · ') + Math.round(state.zoom * 100) + '%';
}
/** Refresh the shape count / zoom readout without rebuilding the page. */
export function updateStatusReadout() {
  const node = document.querySelector('.project-btn .pcount');
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
    el('div', { className: 'pinfo' }, el('span', { className: 'pcount' }, statusText()), ' \u00b7 ',
      (() => { const s = saveStateWord(); return el('span', { className: 'save-state' + (s.bad ? ' bad' : ''), title: s.title, 'data-testid': 'save-state' }, s.word); })())
  );
  projBtn.addEventListener('click', () => { state.panel = 'projects'; render(); });
  topbar.appendChild(projBtn);

  // Undo
  const undoBtn = el('button', { className: 'iconbtn', html: I.undo, title: 'Undo' });
  undoBtn.disabled = !canUndo() || !!state.draw || !!state.placing; // while drawing or placing, the bar's Undo
  // (A notice's Undo is the same step: after either, it's gone.)
  undoBtn.addEventListener('click', () => { dismissToastAction(); undo(); render(); });
  topbar.appendChild(undoBtn);

  // Redo
  const redoBtn = el('button', { className: 'iconbtn', html: I.redo, title: 'Redo' });
  redoBtn.disabled = !canRedo() || !!state.draw || !!state.placing;
  redoBtn.addEventListener('click', () => { dismissToastAction(); redo(); render(); });
  topbar.appendChild(redoBtn);

  // Layers
  const layersBtn = el('button', { className: 'iconbtn', html: I.layers, title: 'Layers' });
  layersBtn.addEventListener('click', () => { state.panel = 'layers'; render(); });
  topbar.appendChild(layersBtn);

  // Select: lasso several things, tap to add or remove (export lives in the menu).
  const selectBtn = el('button', { className: 'iconbtn' + (state.selectMode ? ' active' : ''), html: I.lasso, title: state.selectMode ? 'Stop selecting' : 'Select several', 'aria-pressed': String(state.selectMode), 'data-testid': 'select-mode' });
  selectBtn.addEventListener('click', () => { toggleSelectMode(); render(); });
  topbar.appendChild(selectBtn);

  // More menu
  const moreBtn = el('button', { className: 'iconbtn', html: I.more, title: 'More' });
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
  // (A tap target to the browser, so a tap on the plan near a button stays on the plan: Chrome moves a tap that's
  // near a button onto it when nothing under the finger takes taps. Drawing still runs on pointer events.)
  svg.addEventListener('click', () => { /* the plan takes its taps */ });
  // With a mouse, the shape being drawn follows the pointer to the next click.
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    if (state.placing) { setPlaceHover(screenToFeet(e.clientX, e.clientY)); redrawHandles(); return; }
    if (!state.draw || state.draw.kind === 'measure') return;
    setDrawHover(screenToFeet(e.clientX, e.clientY));
    redrawHandles();
  });
  svg.addEventListener('pointerleave', () => {
    if (state.draw) { setDrawHover(null); redrawHandles(); }
    if (state.placing) { setPlaceHover(null); redrawHandles(); }
  });
  canvasWrap.appendChild(svg);

  // Mode banner (when select mode is on)
  if (state.selectMode) {
    const banner = el('div', { className: 'mode-banner' });
    banner.innerHTML = I.lasso + '<span>Select mode — drag to lasso, tap to toggle</span>';
    const closeX = el('button', { className: 'banner-close', html: I.x, 'aria-label': 'Leave select mode' });
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
    const doneBtn = el('button', { className: 'banner-close', html: I.x, 'aria-label': 'Done moving the background' });
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
    const cancelBtn = el('button', { className: 'banner-close', html: I.x, 'aria-label': 'Cancel setting the scale' });
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

  // Placing plants: which one, and how many so far.
  const placing = placingPlant();
  if (state.placing && !placing) finishPlacing(); // the plant in hand is gone (removed from My plants)
  if (placing && state.placing) {
    // (This plant's, not every plant placed since Place was tapped: a switch starts the count over.)
    const n = state.placing.placed.filter((x) => state.shapes.find((s) => s.id === x.id)?.plantId === placing.id).length;
    const banner = el('div', { className: 'mode-banner draw-banner', 'data-testid': 'place-banner' });
    banner.innerHTML = I.leaf + '<span></span>';
    banner.querySelector('span')!.textContent = `Tap to place ${placing.common} · ${n} placed`;
    canvasWrap.appendChild(banner);
  }

  // Showing only some plants: say so, with a way back to everything.
  if (filterActive(state.viewFilter) && !state.draw && !state.editPoints && !state.bgCalibrate && !state.placing) {
    const f = state.viewFilter;
    const what = filterText(f) || 'All plants';
    const banner = el('div', { className: 'mode-banner filter-banner', 'data-testid': 'filter-banner' });
    banner.appendChild(el('span', {}, 'Showing: ' + what + (f.showGone ? ' (gone included)' : '')));
    const clear = el('button', { className: 'banner-close', html: I.x, title: 'Show all', 'aria-label': 'Show all plants' });
    clear.addEventListener('click', () => { setViewFilter({ status: '', phase: '', showGone: false }); render(); });
    banner.appendChild(clear);
    canvasWrap.appendChild(banner);
  }

  // Zoom buttons
  const zoomBtns = el('div', { className: 'zoombtns' });
  const zIn = el('button', { className: 'zoombtn', html: I.zoomIn, 'aria-label': 'Zoom in', title: 'Zoom in' });
  zIn.addEventListener('click', () => { zoomBy(1.25); render(); });
  const zOut = el('button', { className: 'zoombtn', html: I.zoomOut, 'aria-label': 'Zoom out', title: 'Zoom out' });
  zOut.addEventListener('click', () => { zoomBy(0.8); render(); });
  zoomBtns.appendChild(zIn); zoomBtns.appendChild(zOut);
  zoomBtns.appendChild(namesButton());
  canvasWrap.appendChild(zoomBtns);

  // Empty hint
  if (state.shapes.length === 0 && !state.draw && !state.placing && !state.bgCalibrate && !state.bgEditMode) {
    const hint = el('div', { className: 'empty-hint' });
    // The easiest start is tracing over a photo of the yard from above, so offer it first.
    if (!state.bgImage) {
      const photo = el('button', { className: 'empty-photo-btn', 'data-testid': 'start-photo', html: I.image + '<span>Start from an aerial photo</span>' });
      photo.addEventListener('click', () => { state.panel = 'bg'; render(); });
      hint.append(photo, el('div', { className: 'empty-sub' }, 'A satellite or drone photo of your yard to trace over.'), el('div', { className: 'empty-or' }, 'or'));
    }
    hint.append(
      el('div', {}, 'Tap a button below to add something.'),
      el('div', {}, 'Grid lines are ', el('b', {}, '1 ft'), ' apart; bold lines every ', el('b', {}, '10 ft'), '.'));
    canvasWrap.appendChild(hint);
  }

  // Multi-select action bar (floating, only when 2+ selected and no panel open)
  const drawing = !!state.draw || !!state.editPoints || !!state.placing;
  if (state.selectedIds.length >= 2 && !state.panel && !drawing) {
    const bar = el('div', { className: 'multi-bar' });
    bar.appendChild(el('div', { className: 'count' }, state.selectedIds.length + ' selected'));
    const editAllBtn = el('button', { title: 'Edit' });
    editAllBtn.innerHTML = I.edit + '<span>Edit</span>';
    editAllBtn.addEventListener('click', () => { state.panel = 'props'; render(); });
    const copyBtn = el('button', { title: 'Copy', 'aria-label': 'Copy' });
    copyBtn.innerHTML = I.copy;
    copyBtn.addEventListener('click', () => {
      copySelected();
      // brief visual feedback
      copyBtn.style.background = 'rgba(255,255,255,0.2)';
      setTimeout(() => { copyBtn.style.background = ''; }, 300);
    });
    const delBtn = el('button', { title: 'Delete', 'aria-label': 'Delete', className: 'danger' });
    delBtn.innerHTML = I.trash;
    delBtn.addEventListener('click', () => { deleteSelectedAsking(); render(); });
    const closeBtn = el('button', { title: 'Deselect', 'aria-label': 'Deselect' });
    closeBtn.innerHTML = I.x;
    closeBtn.addEventListener('click', () => { clearSelection(); render(); });
    bar.appendChild(editAllBtn);
    // All the same plant (or the same tree): more of it.
    const more = moreOfSame(getSelected(), false);
    if (more) {
      const b = el('button', { title: more.title, 'data-testid': 'bar-place-more' });
      b.innerHTML = I.plus + '<span>More</span>';
      b.addEventListener('click', () => { more.start(); render(); });
      bar.appendChild(b);
    }
    bar.appendChild(copyBtn);
    bar.appendChild(closeBtn);
    bar.appendChild(el('span', { className: 'bar-gap', 'aria-hidden': 'true' }));
    bar.appendChild(delBtn);
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
      // Another of the same: a plant placed, a tree or anything else drawn.
      const more = moreOfSame([s], true);
      if (more) {
        const b = el('button', { className: 'pill-more', 'data-testid': 'pill-place-more', title: more.title, 'aria-label': more.title });
        b.innerHTML = I.plus + '<span>More</span>';
        b.addEventListener('click', () => { more.start(); render(); });
        pill.appendChild(b);
      }
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
  app.appendChild(state.placing ? renderPlaceBar() : drawing ? renderDrawBar() : bottomBar);

  root.appendChild(app);

  // ===== PANELS / MODALS / MENU =====
  // The kind list opens fresh each time; a status question left open is dropped with the panel.
  if (state.panel !== 'props') { resetKindChange(); state.statusAsk = null; }
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
  else if (state.panel === 'location') panelNode = renderLocationPanel();
  if (panelNode) root.appendChild(panelNode);
  if (state.menu === 'more') root.appendChild(renderMoreMenu());

  labelFields(root); // (each field's label names its control, for screen readers)
  // Now that the SVG is in the DOM, size it and draw grid/shapes
  resizeCanvas();
  maybeExplainFullSize();
}

/** Bottom bar while placing plants: the plant in hand (tap to switch), Undo, Done. */
function renderPlaceBar(): HTMLElement {
  const bar = el('div', { className: 'bottom-toolbar draw-bar place-bar', 'data-testid': 'place-bar' });
  const p = placingPlant();
  const pick = el('button', { className: 'draw-btn place-plant', 'data-testid': 'place-switch', title: 'Switch plant' },
    el('span', { className: 'sw-dot', style: { background: plantColor(p ?? undefined) } }),
    el('span', { className: 'place-name' }, p?.common ?? ''), el('span', { html: I.chevronDown, style: { display: 'flex' } }));
  pick.addEventListener('click', () => { state.panel = 'plants'; render(); });
  const undoB = el('button', { className: 'draw-btn' }, 'Undo');
  undoB.disabled = !state.placing?.placed.length;
  undoB.addEventListener('click', () => { undoPlace(); render(); });
  const done = el('button', { className: 'draw-btn primary' }, 'Done');
  done.addEventListener('click', () => { finishPlacing(); render(); });
  bar.append(pick, undoB, done);
  return bar;
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
  const snapped = d ? lastSnap() : vertexSnap();
  // The chip's place in the bar, kept while snapping is on (empty when nothing snapped): it never moves the
  // plan's edge, and never sits over the plan where the next tap goes.
  const chipRow = (unsnap: () => void) => (snapOn() ? el('div', { className: 'snap-chip-row' }, snapped ? snapChip(snapped, unsnap) : '') : null);
  const addChipRow = (to: HTMLElement, unsnap: () => void) => { const r = chipRow(unsnap); if (r) to.appendChild(r); };
  if (d && d.kind === 'measure') {
    addChipRow(bar, unsnapLast);
    bar.appendChild(btn('Keep', '', () => { finishDraw(); }, !canFinishDraw()));
    bar.appendChild(btn('Done', 'primary', cancelDraw));
    return bar;
  }
  if (d) {
    const kind = kindDef(d.target ?? 'plain');
    const col = el('div', { className: 'draw-bar-rows' });
    // The last tap landed on another shape: said, with a way to put it on the grid instead.
    addChipRow(col, unsnapLast);
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
  addChipRow(bar, unsnapVertex);
  bar.appendChild(btn('Delete point', 'danger', deleteSelectedVertex, !canDeleteVertex()));
  bar.appendChild(btn('Done', 'primary', () => {
    const id = state.editPoints?.id;
    finishEditPoints();
    if (id) { state.selectedIds = [id]; state.panel = 'props'; }
  }));
  return bar;
}

/** "On House · Unsnap": a point that landed on another shape, and putting it on the grid instead. */
function snapChip(s: TapSnap, unsnap: () => void): HTMLElement {
  const chip = el('div', { className: 'snap-chip', 'data-testid': 'snap-chip', role: 'status' },
    el('span', { className: 'snap-chip-ring', 'aria-hidden': 'true' }), el('span', {}, `On ${shapeName(s.shapeId)}`));
  const b = el('button', { 'data-testid': 'unsnap' }, 'Unsnap');
  b.addEventListener('click', () => { unsnap(); render(); });
  chip.appendChild(b);
  return chip;
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

/**
 * Names on or off, under the zoom buttons: the plan without its names, lengths, sun hours and plant badges, to
 * step back and see it whole. A view only (not saved): a selected shape still shows its own.
 */
function namesButton(): HTMLElement {
  const hidden = !state.showNames;
  const b = el('button', {
    className: 'zoombtn' + (hidden ? ' on' : ''), html: hidden ? I.tagOff : I.tag, 'data-testid': 'toggle-names',
    title: 'Hide names and badges', 'aria-label': 'Hide names and badges', 'aria-pressed': String(hidden),
  });
  b.addEventListener('click', () => {
    state.showNames = !state.showNames;
    if (!state.showNames) toast('Names and badges hidden. Select a shape to see its own.');
    render();
  });
  return b;
}
