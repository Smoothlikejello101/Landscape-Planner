// Where the names of the yard's areas go (a bed's, a lawn's, a path's, a building's, a sun area's): over every shape,
// clear of each other and of the plants. First for pictures and printouts (src/export.ts areaNamesSvg: the UI review,
// 2026-11-01, a bed's name printed under its plants); on the plan itself too since the after-release-3 fixes
// (src/canvas.ts: the general bug hunt, Nov 1, plants hid "Bed" and all but an "n" of "Morning sun").

import { textWidth1 } from './labels';

/**
 * The name of one of the yard's areas, where its shape puts it (px; `fs` its size there), to be placed over all the
 * shapes. `around`: its shape's box; `fixed`: a path's or a turned name, which stays where it is; `gone`: faint, as its
 * shape.
 */
export interface AreaName {
  label: string; x: number; y: number; fs: number; angle: number; bed: boolean; size: number; fixed: boolean; gone: boolean; around: PxBox;
  /** Its size (px), where it isn't one line of `label` at `fs` (on the plan, a sun area's name with its hours under it). */
  w?: number; h?: number;
}
export type PxBox = { x0: number; y0: number; x1: number; y1: number };

/**
 * Where each of the areas' names goes (areaNamesSvg; and on the plan itself since the after-release-3 fixes: src/canvas.ts,
 * where plants hid a bed's name, the general bug hunt, Nov 1), in the order given: its middle and box (px), whether that's
 * over a plant, or null where it's left off. `within`: the picture, or the plan on the screen, that a moved name stays
 * inside. `keep`: a name with no spot clear of the others stays where its shape puts it, rather than being left off (the
 * screen, where it can be zoomed in on).
 */
export function placeAreaNames(names: AreaName[], plants: { x: number; y: number; r: number }[], within: PxBox, k = 1, keep = false):
  ({ x: number; y: number; box: PxBox; overPlant: boolean } | null)[] {
  const meets = (a: PxBox, b: PxBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const onPlant = (b: PxBox) => plants.some((c) => Math.hypot(Math.max(b.x0, Math.min(c.x, b.x1)) - c.x, Math.max(b.y0, Math.min(c.y, b.y1)) - c.y) < c.r);
  const placed: PxBox[] = [];
  const out: ({ x: number; y: number; box: PxBox; overPlant: boolean } | null)[] = names.map(() => null);
  const order = names.map((n, i) => ({ n, i })).sort((a, b) => Number(b.n.bed) - Number(a.n.bed) || b.n.size - a.n.size);
  for (const { n, i } of order) {
    const tw = n.w ?? textWidth1(n.label) * n.fs, th = n.h ?? n.fs * 1.2, gap = 3 * k, rad = (n.angle * Math.PI) / 180;
    const bw = Math.abs(tw * Math.cos(rad)) + Math.abs(th * Math.sin(rad)), bh = Math.abs(tw * Math.sin(rad)) + Math.abs(th * Math.cos(rad));
    const { x0, y0, x1, y1 } = n.around, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const spots = [{ x: n.x, y: n.y }, ...(n.fixed ? [] : [
      { x: mx, y: y0 - gap - bh / 2 }, { x: mx, y: y1 + gap + bh / 2 }, { x: x1 + gap + bw / 2, y: my }, { x: x0 - gap - bw / 2, y: my }])]
      .map((p) => ({ ...p, box: { x0: p.x - bw / 2, x1: p.x + bw / 2, y0: p.y - bh / 2, y1: p.y + bh / 2 } }))
      .filter((p, j) => j === 0 || (p.box.x0 >= within.x0 && p.box.y0 >= within.y0 && p.box.x1 <= within.x1 && p.box.y1 <= within.y1)); // (moved: inside the picture)
    const clear = spots.filter((p) => !placed.some((q) => meets(q, p.box)));
    const at = clear.find((p) => !onPlant(p.box)) ?? clear[0] ?? (keep ? spots[0] : undefined);
    if (!at) continue;
    placed.push(at.box);
    out[i] = { x: at.x, y: at.y, box: at.box, overPlant: onPlant(at.box) };
  }
  return out;
}
