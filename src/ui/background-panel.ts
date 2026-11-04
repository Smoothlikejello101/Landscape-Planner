import { finishBgCalibration, fitPhoto, handleBgImageFile, imagePxToWorld, removeBgImage, setPhotoDeviceOnly, startBgCalibration, updateBgImage, updateBgImageSilent } from '../background';
import { pxPerFoot } from '../geometry';
import { zoomBy } from '../mutations';
import type { Point } from '../types';
import { clearOfBox } from '../yard-in';
import { el, tapSaid, ts } from '../dom';
import { I } from '../icons';
import { account } from '../account';
import { state } from '../state';
import { render } from './render';
import { snapRot } from '../util';
import { ask } from './ask';

export function renderBgPanel() {
  const bg = state.bgImage;
  const header = el('div', { className: 'sheet-header' },
    el('div', { className: 'title' }, 'Background image'),
    (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', () => { state.panel = null; render(); }); return b; })()
  );
  const body = el('div', { className: 'sheet-body' });

  // Upload / replace section
  const fileInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', style: { display: 'none' } });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const ok = await handleBgImageFile(f);
    if (ok) {
      // After a fresh upload, auto-start calibration. Otherwise the image
      // will be at whatever arbitrary scale it defaulted to.
      startBgCalibration();
      fitPhoto(); // (the plan as tall as it is now, under the strip saying what to tap)
      render();
      // (What to do next: the strip above the plan says it. A notice saying it too sat over the photo, where the two
      // points go: Jason, Nov 2, a notice never covers what the step is about.)
    }
    fileInput.value = ''; // allow re-picking the same file
  });
  const uploadBtn = el('button', { className: bg ? 'btn ghost' : 'btn primary', 'data-testid': 'bg-choose', html: (bg ? I.image : I.plus) + '<span style="margin-left:6px">' + (bg ? 'Replace image' : 'Choose image (JPEG/PNG)') + '</span>' });
  uploadBtn.addEventListener('click', () => fileInput.click());
  body.appendChild(fileInput);
  body.appendChild(uploadBtn);

  if (!bg) {
    const away = state.photoElsewhere;
    if (away) {
      body.insertBefore(el('div', { className: 'hint', 'data-testid': 'photo-elsewhere' }, 'deviceOnly' in away
        ? 'This plan’s background photo is kept on another device only.'
        : 'This plan’s background photo hasn’t come down to this device yet. It will at the next sync.'), uploadBtn);
    }
    body.appendChild(el('div', { style: { fontSize: ts(13), color: '#57534e', lineHeight: '1.5' } },
      'Use a straight-down view of your property: a drone photo taken looking directly down from well above the roof, ',
      'a survey or plat scan, or aerial imagery you have the right to use (many county GIS sites publish aerials). ',
      'Photos taken at an angle stretch distances, so measurements traced from them will be off. ',
      'Large images are downscaled to about 2000 px on the long edge to fit browser storage.',
      el('br'), el('br'),
      el('b', {}, 'iPhone note:'), ' if your photos are HEIC format, switch to JPEG at Settings → Camera → Formats → Most Compatible, or convert the file first.'
    ));
    const sheet = el('div', { className: 'sheet' }, header, body);
    const overlay = el('div', { className: 'overlay' }, sheet);
    overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
    return overlay;
  }

  // Thumbnail preview
  const thumb = el('img', { src: bg.dataUrl, style: { maxWidth: '100%', maxHeight: '160px', display: 'block', margin: '0 auto', border: '1px solid #d6d3d1', borderRadius: '4px' } });
  body.appendChild(thumb);

  // Scale readout
  const wFt = bg.naturalWidth * bg.ftPerPx;
  const hFt = bg.naturalHeight * bg.ftPerPx;
  body.appendChild(bg.uncalibrated
    ? el('div', { className: 'banner', 'data-testid': 'bg-uncalibrated' },
      tapSaid('Not to scale yet: its size on the plan is a guess. Calibrate it: tap two points on the photo you know the distance between.'))
    : el('div', { style: { fontSize: ts(12), color: '#57534e' } },
      'Current scale: ' + (1 / bg.ftPerPx).toFixed(1) + ' pixels per foot',
      el('br'),
      'Image covers ~' + wFt.toFixed(1) + ' × ' + hFt.toFixed(1) + ' ft'
    ));

  // Calibrate button
  const calBtn = el('button', { className: 'btn primary', html: I.target + `<span style="margin-left:6px">${tapSaid('Calibrate scale (tap 2 known points)')}</span>` });
  calBtn.addEventListener('click', () => startBgCalibration());
  body.appendChild(calBtn);

  // Edit mode toggle
  const editBtn = el('button', {
    className: 'btn ' + (state.bgEditMode ? 'secondary' : 'ghost'), 'data-testid': 'bg-edit',
    html: I.move + '<span style="margin-left:6px">' + (state.bgEditMode ? tapSaid('Editing position — tap to finish') : 'Edit position & rotation') + '</span>'
  });
  editBtn.addEventListener('click', () => {
    state.bgEditMode = !state.bgEditMode;
    state.panel = null; // close panel so user can interact with canvas
    render();
  });
  body.appendChild(editBtn);

  // Visible toggle
  const visBtn = el('button', {
    className: 'btn ghost',
    html: (bg.visible ? I.eyeOff : I.eye) + '<span style="margin-left:6px">' + (bg.visible ? 'Hide image' : 'Show image') + '</span>'
  });
  visBtn.addEventListener('click', () => updateBgImage({ visible: !bg.visible }));
  body.appendChild(visBtn);

  // Opacity slider (silent update — keeps slider focus smooth)
  const opInput = el('input', { type: 'range', min: '0.05', max: '1', step: '0.05', value: bg.opacity, 'data-testid': 'bg-opacity' });
  const opPct = el('span', { style: { fontSize: ts(12), color: '#78716c' } }, Math.round(bg.opacity * 100) + '%');
  opInput.addEventListener('input', e => {
    const v = parseFloat((e.target as HTMLInputElement).value);
    updateBgImageSilent({ opacity: v });
    opPct.textContent = Math.round(v * 100) + '%';
  });
  body.appendChild(el('div', { className: 'field' },
    el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
      el('label', {}, 'Opacity'), opPct),
    opInput,
    el('div', { className: 'hint' }, 'Lower opacity makes the grid and plants easier to see.')
  ));

  // Rotation input + quick buttons (mirrors shape rotation UI)
  const rotVal = bg.rotation || 0;
  const rotInput = el('input', { type: 'number', step: '5', value: rotVal });
  const rotPct = el('span', { style: { fontSize: ts(12), color: '#78716c' } }, rotVal.toFixed(1) + '°');
  rotInput.addEventListener('input', e => {
    const v = parseFloat((e.target as HTMLInputElement).value) || 0;
    updateBgImageSilent({ rotation: v });
    rotPct.textContent = v.toFixed(1) + '°';
  });
  const quickRow = el('div', { className: 'rot-quick' });
  [-90, -15, -5, 5, 15, 90].forEach(delta => {
    const b = el('button', {}, (delta > 0 ? '+' : '') + delta + '°');
    b.addEventListener('click', () => {
      const cur = state.bgImage?.rotation || 0;
      let newRot = snapRot(cur + delta);
      if (newRot >= 180) newRot -= 360;
      if (newRot < -180) newRot += 360;
      rotInput.value = String(newRot);
      rotPct.textContent = newRot.toFixed(1) + '°';
      updateBgImageSilent({ rotation: newRot });
    });
    quickRow.appendChild(b);
  });
  const resetRotBtn = el('button', {}, 'Reset to 0°');
  resetRotBtn.addEventListener('click', () => {
    rotInput.value = '0';
    rotPct.textContent = '0.0°';
    updateBgImageSilent({ rotation: 0 });
  });
  body.appendChild(el('div', { className: 'field' },
    el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
      el('label', {}, 'Rotation (around image center)'), rotPct),
    rotInput,
    quickRow,
    el('div', { style: { marginTop: '6px' } }, resetRotBtn)
  ));

  // Position (X, Y of image center in world feet)
  const xInput = el('input', { type: 'number', step: '0.5', value: bg.cx.toFixed(1) });
  xInput.addEventListener('input', e => updateBgImageSilent({ cx: parseFloat((e.target as HTMLInputElement).value) || 0 }));
  const yInput = el('input', { type: 'number', step: '0.5', value: bg.cy.toFixed(1) });
  yInput.addEventListener('input', e => updateBgImageSilent({ cy: parseFloat((e.target as HTMLInputElement).value) || 0 }));
  body.appendChild(el('div', { className: 'row-2' },
    el('div', { className: 'field' }, el('label', {}, 'Center X (ft)'), xInput),
    el('div', { className: 'field' }, el('label', {}, 'Center Y (ft)'), yInput)
  ));

  // Sync: the photo goes with the plan unless it's kept here.
  if (account.status === 'signedIn') {
    const keep = el('input', { type: 'checkbox' }) as HTMLInputElement;
    keep.checked = !!bg.deviceOnly;
    keep.addEventListener('change', () => { setPhotoDeviceOnly(keep.checked); render(); });
    body.appendChild(el('div', { className: 'field' },
      el('label', { className: 'check-row', 'data-testid': 'photo-device-only' }, keep, el('span', {}, 'Keep this photo on this device only')),
      el('div', { className: 'hint' }, keep.checked
        ? 'The plan syncs without it; your other devices show the plan alone.'
        : 'It syncs with the plan to your other devices, in storage only your account can read.')));
  }

  // Remove button
  const rmBtn = el('button', { className: 'btn danger', html: I.trash + '<span style="margin-left:6px">Remove background image</span>' });
  rmBtn.addEventListener('click', async () => {
    if (await ask('Remove the background image? Undo brings it back for now; once that\u2019s gone, you\u2019ll need to add it and calibrate it again.', { ok: 'Remove it', danger: true })) {
      removeBgImage();
      state.panel = null;
      render();
    }
  });
  body.appendChild(rmBtn);

  const sheet = el('div', { className: 'sheet' }, header, body);
  const overlay = el('div', { className: 'overlay' }, sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) { state.panel = null; render(); } });
  return overlay;
}

/**
 * Lengths most people can find, to tap the ends of (Jason liked the idea, Nov 2): on the strip above the plan while A
 * and B are tapped (Jason, Nov 4: "the 'lengths you might know' hint comes too late. They need it while they're
 * picking points"), in a line or two, and `short` in the box asking how far apart they are.
 */
export function lengthsYouMayKnow(short = false): HTMLElement {
  return short
    ? el('div', { className: 'scale-hints', 'data-testid': 'scale-hints' }, el('b', {}, 'Lengths you may know: '),
      'the house\u2019s front, a one-car driveway\u2019s width (10\u201312 ft), the lot\u2019s sides.')
    : el('div', { className: 'cal-hints', 'data-testid': 'cal-hints' }, el('b', {}, 'Lengths you may know: '),
      'your house\u2019s front (its listing) \u00b7 a one-car driveway, 10\u201312 ft wide \u00b7 your lot\u2019s sides (county GIS map, plat)');
}

/**
 * How far apart A and B are: the box asking, at the top of the screen, the plan moved so the two points show below it
 * (keepScaleBoxClear), where a phone's keyboard leaves them be; it sat over them, in the middle (Jason, Nov 2, from the
 * UI review). With lengths people often know, to measure between.
 */
export function renderBgDistanceModal() {
  const input = el('input', { type: 'number', step: 'any', min: '0.1', inputMode: 'decimal', placeholder: 'e.g. 32', 'data-testid': 'scale-distance' });
  setTimeout(() => { input.focus(); input.select(); }, 60);
  const doIt = () => {
    const v = parseFloat(input.value);
    finishBgCalibration(v);
  };
  const okBtn = el('button', { className: 'btn primary', 'data-testid': 'scale-set' }, 'Set scale');
  okBtn.addEventListener('click', doIt);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doIt(); });
  const cancelBtn = el('button', { className: 'btn ghost' }, 'Cancel');
  cancelBtn.addEventListener('click', () => {
    state.bgCalibrate = null;
    state.panel = 'bg';
    render();
  });
  // (Lengths you may know, in short: the strip above the plan has said them while A and B were tapped.)
  const hints = lengthsYouMayKnow(true);
  const modal = el('div', { className: 'modal scale-box', 'data-testid': 'scale-box' },
    el('div', { className: 'sheet-header' },
      el('div', { className: 'title' }, 'How far is A from B?'),
      (() => { const b = el('button', { className: 'iconbtn', html: I.x, 'aria-label': 'Close' }); b.addEventListener('click', () => { state.bgCalibrate = null; state.panel = 'bg'; render(); }); return b; })()
    ),
    el('div', { className: 'sheet-body' },
      el('div', { className: 'scale-row' },
        el('div', { className: 'field' }, el('label', {}, 'Distance (ft)'), input),
        el('div', { className: 'scale-buttons' }, cancelBtn, okBtn)),
      hints
    )
  );
  // (Lightly dimmed: A, B and the line between them are what's being measured, so they stay clear to see.)
  return el('div', { className: 'overlay scale-overlay', style: { zIndex: 40 } }, modal);
}
/**
 * The scale box just opened: the plan moved, zoomed out only if it must, so A and B show clear of it, just below it
 * (src/yard-in.ts clearOfBox). Run as it opens, before the plan is drawn (src/ui/render.ts).
 */
export function keepScaleBoxClear(overlay: HTMLElement): void {
  const bg = state.bgImage, cal = state.bgCalibrate, wrap = document.getElementById('canvas-wrap');
  const box = overlay.querySelector('.modal')?.getBoundingClientRect();
  if (!bg || !cal?.p1 || !cal.p2 || !wrap || !box) return;
  const plan = wrap.getBoundingClientRect(), ppf = pxPerFoot();
  const onPage = (p: Point) => { const f = imagePxToWorld(bg, p); return { x: plan.left + (f.x - state.offsetX) * ppf, y: plan.top + (f.y - state.offsetY) * ppf }; };
  const pts = [onPage(cal.p1), onPage(cal.p2)];
  const move = clearOfBox(pts, box, { top: plan.top, bottom: plan.bottom });
  if (!move) return;
  if (move.zoom < 1) zoomBy(move.zoom, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
  state.offsetY -= move.dy / pxPerFoot();
}
