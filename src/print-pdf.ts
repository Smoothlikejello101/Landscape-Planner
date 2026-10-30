import type { jsPDF as JsPDF } from 'jspdf';
import { plantsById } from './plants';
import {
  buildPlanSvg, legendEntries, pdfSafe, planLayout, plantSchedule, printContent, scaleBarFeet, scaleText,
  type Box, type LegendEntry, type PrintLayout, type ScheduleGroup,
} from './print';
import type { BgImage, PrintSettings, Shape, SizeMode, Status } from './types';
import { filterText } from './status';

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

export async function buildPlanPdf(
  settings: PrintSettings, projectName: string, shapes: Shape[], bg: BgImage | null, sizeMode: SizeMode = 'typical',
): Promise<PdfResult> {
  const filter = { status: settings.statusFilter, phase: settings.phaseFilter, showGone: false };
  const content = printContent(shapes, bg, settings.includeBackground, filter);
  if (!content.bounds) throw new Error('There is nothing on the plan to print yet.');
  const layout = planLayout(settings.paper, settings.orientation, content.bounds);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'in', format: [layout.pageW, layout.pageH], orientation: layout.orientation, compress: true });
  doc.setProperties({ title: pdfSafe(settings.title || projectName), creator: 'FullGrown' });

  // The drawing.
  const pxPerIn = Math.min(200, Math.sqrt(MAX_PIXELS / (layout.plan.w * layout.plan.h)));
  const plan = buildPlanSvg(layout, content.shapes, bg, { ...settings, order: shapes }, pxPerIn);
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
  let cy = titleBlock(doc, cols[0], settings, projectName, layout);
  cy = legend(doc, cols[0], cy, legendEntries(content.shapes, sizeMode, settings.includeFullRings && sizeMode === 'typical'));
  cy = statusLegend(doc, cols[0], cy, new Set(content.shapes.map((s) => s.status).filter((x): x is Status => !!x)));
  const schedule = settings.includePlantList ? plantSchedule(content.shapes, plantsById, shapes) : [];
  let pages = 1;
  if (schedule.length) {
    const first: Box[] = layout.sideAt === 'right'
      ? [{ x: side.x, y: cy + 0.15, w: side.w, h: side.y + side.h - cy - 0.15 }]
      : [cols[1]];
    pages = plantList(doc, schedule, first, layout, filterText(filter));
  }
  footer(doc, layout, 1, pages);
  return { blob: doc.output('blob'), pages, layout };
}

function titleBlock(doc: JsPDF, box: Box, s: PrintSettings, projectName: string, layout: PrintLayout): number {
  let y = box.y;
  doc.setTextColor('#1c1917');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  const title = doc.splitTextToSize(pdfSafe(s.title.trim() || projectName), box.w) as string[];
  doc.text(title.slice(0, 2), box.x, y, { baseline: 'top' });
  y += pt(19) * Math.min(2, title.length);
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

/** Fill boxes with the plant list, adding continuation pages as needed. Returns the page count. */
function plantList(doc: JsPDF, groups: ScheduleGroup[], firstBoxes: Box[], layout: PrintLayout, which = ''): number {
  type Item = { kind: 'head'; text: string } | { kind: 'note'; text: string } | { kind: 'group'; text: string; total: number } | { kind: 'row'; key: number; count: number; label: string; botanical: string };
  const total = groups.reduce((n, g) => n + g.total, 0);
  const items: Item[] = [
    { kind: 'head', text: `Plant list${which ? ': ' + which : ''} (${total})` },
    { kind: 'note', text: 'Numbers match the numbers in the circles on the plan.' },
  ];
  for (const g of groups) {
    items.push({ kind: 'group', text: g.bed, total: g.total });
    for (const r of g.rows) items.push({ kind: 'row', key: r.key, count: r.count, label: r.label, botanical: r.botanical });
  }
  const lineH = (it: Item) => (it.kind === 'head' ? pt(12) : it.kind === 'note' ? pt(11) : it.kind === 'group' ? pt(14) : pt(11));
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
    doc.text('Plant list (continued)', m, m, { baseline: 'top' });
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
      // Key (as printed in the circles), then quantity, then the name.
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text(String(it.key), box.x + 0.2, y, { baseline: 'top', align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text('×' + it.count, box.x + 0.28, y, { baseline: 'top' });
      const nameX = box.x + 0.62, room = box.w - 0.62;
      const name = fit(doc, it.label, room);
      doc.text(name, nameX, y, { baseline: 'top' });
      const used = doc.getTextWidth(name);
      if (it.botanical && used + 0.4 < room) {
        doc.setFont('helvetica', 'italic'); doc.setTextColor('#78716c');
        doc.text(fit(doc, it.botanical, room - used - 0.1), nameX + used + 0.1, y, { baseline: 'top' });
      }
    }
    y += lineH(it);
  }
  return pages;
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
