import type { jsPDF as JsPDF } from 'jspdf';
import { plantsById } from './plants';
import {
  buildPlanSvg, legendEntries, pdfSafe, planLayout, plantSchedule, printContent, scaleBarFeet, scaleText,
  type Box, type LegendEntry, type PrintLayout, type ScheduleGroup, type UnderShown,
} from './print';
import type { BgImage, PrintSettings, PrintUnder, Shape, SizeMode, Status } from './types';
import { filterText } from './status';
import { shownCaption } from './export';
import { state } from './state';
import { areaWords, frameArea, WHOLE_PLAN, type PrintArea } from './print-area';
import { keyHoursAt, SUN_KEY, washAt, washOver } from './sun';

// Writes the printable plan as a PDF (browser only). Layout and content come
// from print.ts; this file only draws them.

const MAX_PIXELS = 12_000_000; // keep the drawing's canvas within what phones allow
const pt = (n: number) => n / 72; // points to inches

export interface PdfResult { blob: Blob; pages: number; layout: PrintLayout }

/** Draw an SVG onto a white canvas and return it as JPEG data. */
async function rasterize(svg: string, w: number, h: number): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('The drawing took too long to render.')), 20000);
      img.onload = () => { clearTimeout(t); resolve(); };
      img.onerror = () => { clearTimeout(t); reject(new Error('The drawing could not be rendered.')); };
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser could not make the drawing (no canvas).');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Mix a hex color with white, as a fill at `alpha` over paper would look. */
function onPaper(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const mix = (c: number) => Math.round(c * alpha + 255 * (1 - alpha)).toString(16).padStart(2, '0');
  return '#' + mix((n >> 16) & 255) + mix((n >> 8) & 255) + mix(n & 255);
}

/**
 * How the plan is drawn, as the screen shows it unless changed in the dialog (Jason, Oct 31): names, numbers, lengths
 * and sun hours, or none; the month Through the year shows, or none (every plant in leaf and bloom).
 */
export interface PrintView {
  names: boolean; month: number | null;
  /** The plants under taller ones (src/canvas.ts paperUnder), and Layers' see-through height when it's on: per device. */
  under?: PrintUnder; seeThroughFrom?: number | null;
}

/**
 * `area`: the whole plan, the part of it on the screen, or one bed (src/print-area.ts), scaled to fill the page; its
 * plant list lists only the plants in it, numbered as on the whole plan's sheet.
 */
export async function buildPlanPdf(
  settings: PrintSettings, projectName: string, shapes: Shape[], bg: BgImage | null, sizeMode: SizeMode = 'typical',
  view: PrintView = { names: true, month: null }, area: PrintArea = WHOLE_PLAN,
): Promise<PdfResult> {
  const filter = { status: settings.statusFilter, phase: settings.phaseFilter, showGone: false };
  const content = printContent(shapes, bg, settings.includeBackground, filter);
  if (!content.bounds) throw new Error('There is nothing on the plan to print yet.');
  const framed = frameArea(area, content.shapes, shapes, content.bounds);
  if (!framed.bounds) throw new Error('That bed is no longer on the plan. Pick another.');
  const layout = planLayout(settings.paper, settings.orientation, framed.bounds, framed.exact);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'in', format: [layout.pageW, layout.pageH], orientation: layout.orientation, compress: true });
  doc.setProperties({ title: pdfSafe(settings.title || projectName), creator: 'FullGrown' });

  // The drawing.
  const pxPerIn = Math.min(200, Math.sqrt(MAX_PIXELS / (layout.plan.w * layout.plan.h)));
  // (In the month asked for: the plants' pictures read it from the state, set while the drawing is made.)
  const wasMonth = state.month;
  state.month = view.month;
  let plan: ReturnType<typeof buildPlanSvg>;
  try {
    plan = buildPlanSvg(layout, framed.shapes, bg, {
      ...settings, order: shapes, names: view.names, keyFrom: content.shapes, ...(framed.exact ? { listed: new Set(framed.plants.map((s) => s.id)) } : {}),
      under: view.under ?? 'windows', seeThroughFrom: view.seeThroughFrom ?? null,
    }, pxPerIn);
  }
  finally { state.month = wasMonth; }
  const jpeg = await rasterize(plan.svg, plan.w, plan.h);
  const { x, y, w, h } = layout.plan;
  doc.addImage(jpeg, 'JPEG', x, y, w, h, undefined, 'FAST');
  doc.setDrawColor('#57534e'); doc.setLineWidth(pt(0.75));
  doc.rect(x, y, w, h, 'S');

  // The side panel: title block, scale and north, legend, then the plant list.
  const side = layout.side;
  const cols: Box[] = layout.sideAt === 'right'
    ? [side]
    : [{ x: side.x, y: side.y, w: side.w * 0.42, h: side.h }, { x: side.x + side.w * 0.42 + 0.25, y: side.y, w: side.w * 0.58 - 0.25, h: side.h }];
  let cy = titleBlock(doc, cols[0], settings, projectName, layout, shownCaption(filter, view.month), areaWords(framed));
  cy = legend(doc, cols[0], cy, legendEntries(framed.shapes, sizeMode, settings.includeFullRings && sizeMode === 'typical'));
  cy = statusLegend(doc, cols[0], cy, new Set(framed.shapes.map((s) => s.status).filter((x): x is Status => !!x)));
  cy = underLegend(doc, cols[0], cy, plan.under);
  const schedule = settings.includePlantList ? plantSchedule(framed.plants, plantsById, shapes, content.shapes) : [];
  // (The numbered dots' key, where the sheet has no plant list numbered as they are: in the plant list's place.)
  const dots = plan.under.dots;
  const key = dots && !dots.inList ? dots.rows : [];
  let pages = 1;
  const first = (): Box[] => layout.sideAt === 'right'
    ? [{ x: side.x, y: cy + 0.15, w: side.w, h: side.y + side.h - cy - 0.15 }]
    : [cols[1]];
  if (schedule.length) {
    pages = plantList(doc, schedule, first(), layout, [framed.name, filterText(filter)].filter(Boolean).join(' · '), view.names);
  } else if (key.length) {
    pages = plantList(doc, [{ bed: '', rows: key, total: key.reduce((n, r) => n + r.count, 0) }], first(), layout, '', true, DOT_KEY_WORDS);
  }
  footer(doc, layout, 1, pages);
  return { blob: doc.output('blob'), pages, layout };
}

/** `area`: what of the plan the sheet shows, when not all of it ("Front bed: 7 plants"), said under the title. */
function titleBlock(doc: JsPDF, box: Box, s: PrintSettings, projectName: string, layout: PrintLayout, caption = '', area = ''): number {
  let y = box.y;
  doc.setTextColor('#1c1917');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  const title = doc.splitTextToSize(pdfSafe(s.title.trim() || projectName), box.w) as string[];
  doc.text(title.slice(0, 2), box.x, y, { baseline: 'top' });
  y += pt(19) * Math.min(2, title.length);
  if (area) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    const lines = doc.splitTextToSize(pdfSafe(area), box.w) as string[];
    doc.text(lines.slice(0, 2), box.x, y + pt(1), { baseline: 'top' });
    y += pt(1) + pt(13.5) * Math.min(2, lines.length);
  }
  if (s.subtitle.trim()) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const sub = doc.splitTextToSize(pdfSafe(s.subtitle.trim()), box.w) as string[];
    doc.text(sub.slice(0, 3), box.x, y + pt(2), { baseline: 'top' });
    y += pt(2) + pt(12.5) * Math.min(3, sub.length);
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor('#57534e');
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(pdfSafe(date), box.x, y + pt(4), { baseline: 'top' });
  y += pt(4) + pt(12);
  // What the sheet leaves out, or shows as it isn't always ("Showing planned plants in Phase 1 only · As in February"):
  // a partial plan doesn't pass for the whole one.
  if (caption) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
    const lines = doc.splitTextToSize(pdfSafe(caption), box.w) as string[];
    doc.text(lines.slice(0, 3), box.x, y, { baseline: 'top' });
    y += pt(10) * Math.min(3, lines.length) + pt(2);
  }

  // Scale bar and north arrow.
  y += 0.12;
  doc.setTextColor('#1c1917'); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Scale ' + scaleText(layout.ftPerIn), box.x, y, { baseline: 'top' });
  y += pt(12);
  const barFt = scaleBarFeet(layout.ftPerIn, Math.min(2, box.w - 0.9));
  const barIn = barFt / layout.ftPerIn;
  const segs = barFt % 4 === 0 || barFt === 20 || barFt === 40 ? 4 : barFt % 5 === 0 ? 5 : 2;
  const by = y + 0.05, bh = 0.08;
  doc.setLineWidth(pt(0.6)); doc.setDrawColor('#1c1917');
  for (let i = 0; i < segs; i++) {
    doc.setFillColor(i % 2 ? '#ffffff' : '#1c1917');
    doc.rect(box.x + (barIn * i) / segs, by, barIn / segs, bh, 'FD');
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('0', box.x, by + bh + pt(2), { baseline: 'top', align: 'center' });
  doc.text(`${barFt} ft`, box.x + barIn, by + bh + pt(2), { baseline: 'top', align: 'center' });
  northArrow(doc, box.x + Math.max(barIn + 0.55, Math.min(box.w - 0.3, 2.6)), by + 0.12, s.northDeg);
  y = by + bh + pt(12) + 0.08;
  doc.setFontSize(7); doc.setTextColor('#78716c');
  doc.text('Print at actual size (100%), not "fit to page", for the scale to hold.', box.x, y, { baseline: 'top', maxWidth: box.w });
  return y + pt(10) * (doc.getTextWidth('Print at actual size (100%), not "fit to page", for the scale to hold.') > box.w ? 2 : 1) + 0.12;
}

function northArrow(doc: JsPDF, cx: number, cy: number, deg: number) {
  const r = 0.2;
  const rot = (px: number, py: number) => {
    const a = (deg * Math.PI) / 180;
    return [cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a)] as const;
  };
  const tip = rot(0, -r), left = rot(-r * 0.45, r * 0.7), right = rot(r * 0.45, r * 0.7), mid = rot(0, r * 0.35);
  doc.setLineWidth(pt(0.6)); doc.setDrawColor('#1c1917');
  doc.setFillColor('#1c1917');
  doc.triangle(tip[0], tip[1], left[0], left[1], mid[0], mid[1], 'FD');
  doc.setFillColor('#ffffff');
  doc.triangle(tip[0], tip[1], right[0], right[1], mid[0], mid[1], 'FD');
  const n = rot(0, -r - 0.11);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor('#1c1917');
  doc.text('N', n[0], n[1], { align: 'center', baseline: 'middle' });
}

function legend(doc: JsPDF, box: Box, y: number, entries: LegendEntry[]): number {
  if (!entries.length) return y;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor('#1c1917');
  doc.text('Legend', box.x, y, { baseline: 'top' });
  y += pt(13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  for (const e of entries) {
    if (y + pt(12) > box.y + box.h) break;
    if (e.sunKey) {
      if (y + pt(36) > box.y + box.h) break;
      y = sunKey(doc, box, y);
      continue;
    }
    if (e.outline) {
      doc.setDrawColor(e.color); doc.setLineWidth(pt(1.5));
      if (!e.solid) doc.setLineDashPattern([0.06, 0.03], 0);
      doc.line(box.x, y + 0.06, box.x + 0.28, y + 0.06);
      doc.setLineDashPattern([], 0);
    } else {
      doc.setFillColor(onPaper(e.color, e.key === 'plant' ? 0.65 : 0.5)); doc.setDrawColor('#a8a29e'); doc.setLineWidth(pt(0.5));
      if (e.key === 'plant') doc.circle(box.x + 0.14, y + 0.06, 0.06, 'FD');
      else doc.rect(box.x, y, 0.28, 0.12, 'FD');
    }
    doc.text(pdfSafe(e.label), box.x + 0.38, y + 0.06, { baseline: 'middle' });
    y += pt(12);
  }
  return y;
}

/**
 * The sun areas' key, in the legend's place for them (Jason, Nov 4; as on the page he answered): "Sun Exposure: hours of
 * direct sun"; a bar of the ramp as it prints on white paper, "8 h+" to "2 h or less"; and a white swatch, "Plain: no
 * sun recorded". (No hatch on paper: his answer 3.)
 */
function sunKey(doc: JsPDF, box: Box, y: number): number {
  doc.setTextColor('#1c1917');
  doc.text(SUN_KEY.printTitle, box.x + 0.38, y + 0.06, { baseline: 'middle' });
  y += pt(12);
  const x0 = box.x + 0.38, bw = 0.6, n = 40;
  doc.text(SUN_KEY.printMost, x0 - 0.05, y + 0.06, { baseline: 'middle', align: 'right' });
  for (let i = 0; i < n; i++) {
    doc.setFillColor(washOver(washAt(keyHoursAt((i + 0.5) / n)), '#ffffff'));
    doc.rect(x0 + (bw / n) * i, y, bw / n + (i < n - 1 ? 0.004 : 0), 0.12, 'F'); // (a hair over the next: no seams)
  }
  doc.setDrawColor('#a8a29e'); doc.setLineWidth(pt(0.5));
  doc.rect(x0, y, bw, 0.12, 'S');
  doc.text(SUN_KEY.least, x0 + bw + 0.06, y + 0.06, { baseline: 'middle' });
  y += pt(12);
  doc.setFillColor('#ffffff');
  doc.rect(box.x, y, 0.28, 0.12, 'FD');
  doc.text(SUN_KEY.plain, box.x + 0.38, y + 0.06, { baseline: 'middle' });
  return y + pt(12);
}

/** Legend lines for statuses on the sheet (planned, to move, to remove). */
function statusLegend(doc: JsPDF, box: Box, y: number, present: Set<Status>): number {
  const rows: [Status, string][] = [['planned', 'Planned (dashed, lighter)'], ['move', 'To move (blue arrow)'], ['remove', 'To remove (red cross)']];
  for (const [k, label] of rows) {
    if (!present.has(k) || y + pt(12) > box.y + box.h) continue;
    doc.setLineWidth(pt(1.2));
    if (k === 'planned') {
      doc.setDrawColor('#57534e'); doc.setFillColor('#f5f5f4'); doc.setLineDashPattern([0.04, 0.03], 0);
      doc.rect(box.x, y, 0.28, 0.12, 'FD'); doc.setLineDashPattern([], 0);
    } else if (k === 'remove') {
      doc.setDrawColor('#dc2626'); doc.rect(box.x, y, 0.28, 0.12, 'S');
      doc.line(box.x, y, box.x + 0.28, y + 0.12); doc.line(box.x + 0.28, y, box.x, y + 0.12);
    } else {
      doc.setFillColor('#2563eb'); doc.circle(box.x + 0.14, y + 0.06, 0.06, 'F');
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor('#1c1917');
    doc.text(label, box.x + 0.38, y + 0.06, { baseline: 'middle' });
    y += pt(12);
  }
  return y;
}

/**
 * A line in the legend for the plants under taller ones, marked as on the plan (src/print.ts buildPlanSvg): a numbered
 * dot, its number in the plant list or in the key; or, not numbered, a pin. None when none is marked.
 */
function underLegend(doc: JsPDF, box: Box, y: number, under: UnderShown): number {
  if (!under.marks || y + pt(12) > box.y + box.h) return y;
  const cx = box.x + 0.14, cy = y + 0.06;
  doc.setLineWidth(pt(1));
  if (under.dots) {
    doc.setFillColor('#292524'); doc.setDrawColor('#ffffff');
    doc.circle(cx, cy, 0.065, 'FD');
  } else {
    doc.setFillColor('#ffffff'); doc.setDrawColor('#a8a29e'); doc.setLineWidth(pt(0.5));
    doc.circle(cx, cy, 0.05, 'FD');
    doc.setFillColor('#292524'); doc.circle(cx, cy, 0.028, 'F');
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor('#1c1917');
  const lines = doc.splitTextToSize(pdfSafe(underLegendText(under)), box.w - 0.38) as string[];
  lines.forEach((line, i) => doc.text(line, box.x + 0.38, cy + i * pt(10.5), { baseline: 'middle' }));
  return y + pt(12) + (lines.length - 1) * pt(10.5);
}
/** What the legend says of the plants under taller ones (underLegend). */
export function underLegendText(under: UnderShown): string {
  if (!under.dots) return 'Plant under a taller one';
  return under.dots.inList ? 'Plant under a taller one, numbered as in the plant list' : 'Plant under a taller one, numbered (see the key)';
}

/**
 * A plan's plant list in words: its heading, the note on its numbers, and its heading on a page of its own. The key to
 * the numbered dots (Jason, Nov 4) is drawn as a list of its own with DOT_KEY_WORDS.
 */
interface ListWords { head: string; note: string; continued: string }
const PLANT_LIST_WORDS: ListWords = { head: 'Plant list', note: 'Numbers match the numbers in the circles on the plan.', continued: 'Plant list (continued)' };
export const DOT_KEY_WORDS: ListWords = { head: 'Plants under taller ones', note: 'Numbers match the numbered dots on the plan.', continued: 'Plants under taller ones (continued)' };

/**
 * Fill boxes with the plant list, adding continuation pages as needed. Returns the page count. A group with no bed name
 * (the dots' key) has no heading.
 */
function plantList(doc: JsPDF, groups: ScheduleGroup[], firstBoxes: Box[], layout: PrintLayout, which = '', numbered = true, words: ListWords = PLANT_LIST_WORDS): number {
  type Item = { kind: 'head'; text: string } | { kind: 'note'; text: string } | { kind: 'group'; text: string; total: number } | { kind: 'row'; key: number; count: number; label: string; botanical: string };
  const total = groups.reduce((n, g) => n + g.total, 0);
  const items: Item[] = [
    { kind: 'head', text: `${words.head}${which ? ': ' + which : ''} (${total})` },
    // (Names hidden, the plan has no numbers: the list has none either.)
    ...(numbered ? [{ kind: 'note' as const, text: words.note }] : []),
  ];
  for (const g of groups) {
    if (g.bed) items.push({ kind: 'group', text: g.bed, total: g.total });
    for (const r of g.rows) items.push({ kind: 'row', key: r.key, count: r.count, label: r.label, botanical: r.botanical });
  }
  const NAME_X = 0.62;
  /** A row's lines in this column, laid out as it's drawn (scheduleRow). */
  const rowIn = (it: Extract<Item, { kind: 'row' }>) => scheduleRow(doc, it.label, it.botanical, box.w - NAME_X);
  const lineH = (it: Item) => (it.kind === 'head' ? pt(12) : it.kind === 'note' ? pt(11) : it.kind === 'group' ? pt(14) : rowIn(it).lines * pt(11));
  let boxes = firstBoxes.slice();
  let box = boxes.shift()!;
  let y = box.y;
  let pages = 1;
  const nextBox = () => {
    const b = boxes.shift();
    if (b) { box = b; y = b.y; return; }
    // A continuation page with columns of the list.
    doc.addPage([layout.pageW, layout.pageH], layout.orientation);
    pages++;
    const m = 0.5, colGap = 0.3;
    const ncol = layout.pageW > 10 ? 3 : 2;
    const cw = (layout.pageW - 2 * m - colGap * (ncol - 1)) / ncol;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor('#1c1917');
    doc.text(words.continued, m, m, { baseline: 'top' });
    boxes = Array.from({ length: ncol }, (_, i) => ({ x: m + i * (cw + colGap), y: m + 0.3, w: cw, h: layout.pageH - 2 * m - 0.6 }));
    box = boxes.shift()!; y = box.y;
  };
  for (const it of items) {
    // Keep a bed heading with at least its first row.
    const need = lineH(it) + (it.kind === 'group' ? pt(11) : 0);
    if (y + need > box.y + box.h) nextBox();
    doc.setTextColor('#1c1917');
    if (it.kind === 'head') {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text(fit(doc, it.text, box.w), box.x, y, { baseline: 'top' });
    } else if (it.kind === 'note') {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor('#78716c');
      doc.text(fit(doc, it.text, box.w), box.x, y, { baseline: 'top' });
    } else if (it.kind === 'group') {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text(fit(doc, it.text, box.w - 0.4), box.x, y + pt(3), { baseline: 'top' });
      doc.setFont('helvetica', 'normal'); doc.setTextColor('#78716c');
      doc.text(String(it.total), box.x + box.w, y + pt(3), { baseline: 'top', align: 'right' });
      doc.setDrawColor('#d6d3d1'); doc.setLineWidth(pt(0.5));
      doc.line(box.x, y + pt(13), box.x + box.w, y + pt(13));
    } else {
      // Key (as printed in the circles), then quantity, then the name, its botanical name after it or under it.
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      if (numbered) doc.text(String(it.key), box.x + 0.2, y, { baseline: 'top', align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text('×' + it.count, box.x + 0.28, y, { baseline: 'top' });
      const nameX = box.x + NAME_X, r = rowIn(it);
      doc.setFont('helvetica', 'normal'); // (measuring left it at the botanical name's italic)
      r.name.forEach((line, i) => doc.text(line, nameX, y + i * pt(11), { baseline: 'top' }));
      if (r.bot.length) {
        doc.setFont('helvetica', 'italic'); doc.setTextColor('#78716c');
        const first = r.botAfter ? r.name.length - 1 : r.name.length;
        r.bot.forEach((line, i) => doc.text(line, i === 0 && r.botAfter ? nameX + r.botAfter : nameX, y + (first + i) * pt(11), { baseline: 'top' }));
      }
    }
    y += lineH(it);
  }
  return pages;
}
/** The most lines a plant list row's name, or its botanical name, takes: a longer one is cut, with an ellipsis. */
const ROW_LINES = 2;
/**
 * A plant list row in a column `room` inches wide (8 pt): its name, wrapped; its botanical name after it on the name's
 * last line where it fits whole there (`botAfter`: inches in from the name's start), else on lines of its own under
 * it. Cut only past two lines each. (The general bug hunt, Nov 1: "Ensete ventrico..." cut short on its one line, with
 * the page mostly empty.) `lines`: how many it takes. The font is left at the name's: 8 pt, normal.
 */
export function scheduleRow(doc: JsPDF, label: string, botanical: string, room: number): { name: string[]; bot: string[]; botAfter: number; lines: number } {
  const lines = (text: string) => {
    const all = doc.splitTextToSize(pdfSafe(text), room) as string[];
    return all.length <= ROW_LINES ? all : [...all.slice(0, ROW_LINES - 1), fit(doc, all.slice(ROW_LINES - 1).join(' '), room)];
  };
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const name = lines(label);
  if (!botanical.trim()) return { name, bot: [], botAfter: 0, lines: name.length };
  const after = doc.getTextWidth(name[name.length - 1] ?? '') + 0.1;
  doc.setFont('helvetica', 'italic');
  const beside = after + doc.getTextWidth(pdfSafe(botanical)) <= room;
  const bot = beside ? [pdfSafe(botanical)] : lines(botanical);
  doc.setFont('helvetica', 'normal');
  return beside ? { name, bot, botAfter: after, lines: name.length } : { name, bot, botAfter: 0, lines: name.length + bot.length };
}
/** Text cut to fit `width` inches, with an ellipsis. */
function fit(doc: JsPDF, text: string, width: number): string {
  let t = pdfSafe(text);
  if (doc.getTextWidth(t) <= width) return t;
  while (t.length > 1 && doc.getTextWidth(t + '...') > width) t = t.slice(0, -1);
  return t.trimEnd() + '...';
}

function footer(doc: JsPDF, layout: PrintLayout, _page: number, pages: number) {
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor('#a8a29e');
    const label = pages > 1 ? `Page ${i} of ${pages} · FullGrown` : 'FullGrown';
    doc.text(pdfSafe(label), layout.pageW - 0.4, layout.pageH - 0.18, { align: 'right', baseline: 'bottom' });
  }
}
