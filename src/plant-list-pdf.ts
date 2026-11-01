import type { jsPDF as JsPDF } from 'jspdf';
import { pdfSafe } from './print';
import { listTotals, rowFacts, totalsText, type ListRow, type PlantList } from './plant-list';

// The Plant list on paper (Jason, Nov 1, from the UI review: "one page, big type"), to take to the nursery: the plan's
// name and the date, the totals, then a box to tick for each kind to buy, its count first. Only what's to buy: planted
// and existing plants are on the screen and in Share as text. The type is as big as fits on one Letter page, down to
// two thirds of its size; a list longer than that goes on to another page. A kind bought already has its box ticked.

const PAGE_W = 8.5, PAGE_H = 11, MARGIN = 0.6;
const pt = (n: number) => n / 72;
const NAME = 20, SMALL = 13; // (points, at full size)

/** A row laid out: its name's lines; its botanical name's (italic) and its facts'; or those two on one line (`oneLine`). */
interface Laid { r: ListRow; head: string[]; bot: string[]; facts: string[]; oneLine: boolean; h: number }
/** A row's lines at `f` times the full size, and its height (inches). */
function lay(doc: JsPDF, r: ListRow, f: number, w: number): Laid {
  const text = w - pt(34 * f);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(NAME * f);
  const head = doc.splitTextToSize(pdfSafe(`${r.count} × ${r.name}`), text) as string[];
  doc.setFontSize(SMALL * f);
  const partly = r.bought && r.bought < r.count ? `${r.bought} of ${r.count} bought` : '';
  const said = pdfSafe([rowFacts(r), partly].filter(Boolean).join(' · '));
  const latin = pdfSafe(r.botanical);
  // (The botanical name and the facts on one line where they fit: a row of two lines, not three, so more fit a page.)
  doc.setFont('helvetica', 'italic');
  const botW = latin ? doc.getTextWidth(latin) : 0;
  doc.setFont('helvetica', 'normal');
  const oneLine = !!latin && !!said && botW + doc.getTextWidth(` · ${said}`) <= text;
  const facts = said ? (oneLine ? [said] : doc.splitTextToSize(said, text) as string[]) : [];
  doc.setFont('helvetica', 'italic');
  const bot = latin ? (oneLine ? [latin] : doc.splitTextToSize(latin, text) as string[]) : [];
  const small = oneLine ? 1 : bot.length + facts.length;
  const h = head.length * pt(NAME * f * 1.15) + small * pt(SMALL * f * 1.3) + pt(12 * f);
  return { r, head, bot, facts, oneLine, h };
}

export async function buildListPdf(planName: string, list: PlantList, when = new Date()): Promise<{ blob: Blob; pages: number }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait', compress: true });
  const w = PAGE_W - 2 * MARGIN, bottom = PAGE_H - MARGIN;
  let y = MARGIN;
  doc.setTextColor('#1c1917');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
  const title = doc.splitTextToSize(pdfSafe(`Plant list: ${planName}`), w) as string[];
  doc.text(title.slice(0, 2), MARGIN, y, { baseline: 'top' });
  y += Math.min(2, title.length) * pt(24 * 1.15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor('#57534e');
  doc.text(pdfSafe(when.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })), MARGIN, y + pt(2), { baseline: 'top' });
  y += pt(2) + pt(12 * 1.4);
  const t = listTotals(list);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor('#1c1917');
  doc.text(pdfSafe(totalsText(t)), MARGIN, y + pt(4), { baseline: 'top' });
  y += pt(4) + pt(16 * 1.3) + pt(6);
  doc.setDrawColor('#a8a29e'); doc.setLineWidth(pt(0.75));
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += pt(12);
  const also = [t.planted ? `${t.planted} planted` : '', t.existing ? `${t.existing} existing` : ''].filter(Boolean).join(', ');
  const foot = also ? pt(12 * 1.4) + pt(8) : 0;
  // As big as fits on this page (with the line at its foot), down to two thirds.
  let f = 1, laid = list.buy.map((r) => lay(doc, r, f, w));
  const tall = (rows: Laid[]) => rows.reduce((n, x) => n + x.h, 0);
  while (f > 0.67 && y + tall(laid) + foot > bottom) { f = Math.max(0.66, f - 0.04); laid = list.buy.map((r) => lay(doc, r, f, w)); }
  for (const x of laid) {
    if (y + x.h > bottom && y > MARGIN + 0.01) { doc.addPage(); y = MARGIN; }
    const box = pt(20 * f), done = x.r.bought >= x.r.count;
    doc.setDrawColor('#1c1917'); doc.setLineWidth(pt(1.25 * f));
    doc.rect(MARGIN, y + pt(2 * f), box, box);
    if (done) {
      doc.setLineWidth(pt(2.2 * f));
      doc.lines([[box * 0.25, box * 0.28], [box * 0.5, -box * 0.62]], MARGIN + box * 0.15, y + pt(2 * f) + box * 0.5);
    }
    const tx = MARGIN + pt(34 * f);
    let ty = y;
    doc.setTextColor(done ? '#78716c' : '#1c1917');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(NAME * f);
    doc.text(x.head, tx, ty, { baseline: 'top', lineHeightFactor: 1.15 });
    ty += x.head.length * pt(NAME * f * 1.15);
    doc.setTextColor('#44403c'); doc.setFontSize(SMALL * f);
    let fx = tx;
    if (x.bot.length) {
      doc.setFont('helvetica', 'italic');
      doc.text(x.bot, tx, ty, { baseline: 'top', lineHeightFactor: 1.3 });
      if (x.oneLine) fx = tx + doc.getTextWidth(x.bot[0]);
      else ty += x.bot.length * pt(SMALL * f * 1.3);
    }
    if (x.facts.length) {
      doc.setFont('helvetica', 'normal');
      doc.text(x.oneLine ? [` · ${x.facts[0]}`] : x.facts, fx, ty, { baseline: 'top', lineHeightFactor: 1.3 });
    }
    y += x.h;
  }
  if (!list.buy.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(16); doc.setTextColor('#44403c');
    doc.text('Nothing to buy.', MARGIN, y, { baseline: 'top' });
    y += pt(16 * 1.4);
  }
  if (also) {
    if (y + foot > bottom) { doc.addPage(); y = MARGIN; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor('#57534e');
    doc.text(pdfSafe(`Also in the plan: ${also}.`), MARGIN, y + pt(8), { baseline: 'top' });
  }
  return { blob: doc.output('blob'), pages: doc.getNumberOfPages() };
}
