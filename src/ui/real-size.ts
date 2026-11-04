// "Is that the real size?": the plan's only building came out smaller than a house is (src/yard-in.ts asksRealSize).
// A gentle question, not a stop: a notice with its answers, about the building (it keeps clear of it, and goes with it
// if it's undone). Jason, Nov 2: no house is drawn for anyone, so one drawn at the wrong scale is asked about instead.

import { startBgCalibration } from '../background';
import { startKind } from '../draw';
import { fmtFeet, shapeArea } from '../geometry';
import { flushHistoryDebounce, pushHistory } from '../history';
import { state } from '../state';
import { save } from '../storage';
import type { Shape } from '../types';
import { asksRealSize } from '../yard-in';
import { render } from './render';
import { toastAction } from './toast';

export function askRealSize(shape: Shape): void {
  if (!asksRealSize(shape, state.shapes)) return;
  const size = shape.type === 'rect' ? `${fmtFeet(shape.width)} × ${fmtFeet(shape.height)} ft` : `${Math.round(shapeArea(shape))} sq ft`;
  // (Traced over a photo not yet to scale: the photo's the likelier thing to fix.)
  const unscaled = !!state.bgImage?.visible && !!state.bgImage.uncalibrated;
  const again = unscaled
    ? { label: 'Set the photo’s scale', run: () => { startBgCalibration(); } }
    : { label: 'Draw it again', run: () => {
      if (!state.shapes.some((s) => s.id === shape.id)) return;
      flushHistoryDebounce();
      state.featurePlace = null;
      state.shapes = state.shapes.filter((s) => s.id !== shape.id);
      state.selectedIds = [];
      pushHistory(`delete ${shape.label || 'the building'}`);
      save();
      startKind('building'); // (where a house fits, the plan's first building again: src/draw.ts)
      render();
    } };
  toastAction(`Is that the real size? At ${size}, it’s small for a house${unscaled ? ', and the photo isn’t to scale yet' : ''}.`,
    [again, { label: 'It’s right', run: () => {} }], 15000, 'real-size');
  const n = document.getElementById('toast-action');
  if (n) n.dataset.about = shape.id; // (gone with the building; kept clear of it: src/ui/toast.ts placeNotice)
}
