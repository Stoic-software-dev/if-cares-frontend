import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildMealCountPdf } from '@/lib/meal-count-pdf';

// The monthly bundle and the two consolidated claims.
//
// The claims are drawn to the two Google Sheets templates the old generator
// filled (`gas-backup/report/generateReports.gs`, "Template - Consolidated
// Report" and "Template - Part 2" in the client's Drive), measured off the PDFs
// it exported: part one is the portrait "Documentation of Meals Claimed -
// At-Risk", one row per site with the certification and signature block under
// it; part two is the per day table under the foundation's id and the claim
// period, and carries no signature of its own.

const PAGE = { width: 612, height: 792 }; // US Letter portrait

const INK = rgb(0, 0, 0);
const GRID = rgb(0.85, 0.85, 0.85);
const SHADE = rgb(0.953, 0.953, 0.953);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.89, 0.91, 0.94);
const HEADER_BG = rgb(0.97, 0.98, 0.99);
const SLATE = rgb(0.06, 0.09, 0.16);

const CERTIFICATION =
  'I certify that the information on this form is true and correct to the best of my knowledge. ' +
  'I understand that misrepresentation or withholding of information may result in prosecution ' +
  'under applicable state and Federal laws.';

const Y = (top) => PAGE.height - top;

function dayLabel(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function timeLabel(canonical) {
  if (!canonical) return '';
  const [h, m] = canonical.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${period}`;
}

function todayLabel() {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
}

function encodable(font, text, size) {
  try {
    font.widthOfTextAtSize(text, size);
    return text;
  } catch {
    return String(text)
      .normalize('NFKD')
      .replace(/[^\x20-\x7e\xa0-\xff]/g, '');
  }
}

function wrap(font, text, size, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function newDoc() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const ctx = { doc, page, font, bold };

  ctx.text = (value, x, top, options = {}) => {
    const size = options.size ?? 5.8;
    const used = options.bold ? bold : font;
    let str = encodable(used, String(value ?? ''), size);
    if (options.maxWidth) {
      while (str.length > 1 && used.widthOfTextAtSize(str, size) > options.maxWidth) str = str.slice(0, -1);
    }
    let drawX = x;
    if (options.align === 'center') drawX = x - used.widthOfTextAtSize(str, size) / 2;
    if (options.align === 'right') drawX = x - used.widthOfTextAtSize(str, size);
    ctx.page.drawText(str, { x: drawX, y: Y(top), size, font: used, color: options.color ?? INK });
  };
  ctx.hline = (x1, x2, top, thickness = 0.5, color = INK) =>
    ctx.page.drawLine({ start: { x: x1, y: Y(top) }, end: { x: x2, y: Y(top) }, thickness, color });
  ctx.vline = (x, top1, top2, thickness = 0.5, color = INK) =>
    ctx.page.drawLine({ start: { x, y: Y(top1) }, end: { x, y: Y(top2) }, thickness, color });
  ctx.box = (x, top, width, height, options = {}) =>
    ctx.page.drawRectangle({
      x,
      y: Y(top + height),
      width,
      height,
      borderColor: options.border ?? INK,
      borderWidth: options.thickness ?? 0.5,
      color: options.fill,
    });
  ctx.newPage = () => {
    ctx.page = doc.addPage([PAGE.width, PAGE.height]);
    return ctx.page;
  };
  return ctx;
}

/**
 * The certification and signature block that closes a claim, as the template
 * prints it: the sentence in a box, and four ruled lines for the signature,
 * the authorized representative, the date and the title. Signed, the image
 * stands on the first line and the name, the date and the title on theirs.
 */
async function drawClaimSignature(ctx, top, { signature, signedBy, title }, { left, right }) {
  let png = null;
  if (signature?.startsWith('data:image/png;base64,')) {
    try {
      png = await ctx.doc.embedPng(Buffer.from(signature.split(',')[1], 'base64'));
    } catch {
      png = null; // an unreadable signature must not cost the whole report
    }
  }

  const height = 62;
  if (top + height > PAGE.height - 30) {
    ctx.newPage();
    top = 30;
  }
  ctx.box(left, top, right - left, height);

  const lines = wrap(ctx.font, CERTIFICATION, 5.8, right - left - 6);
  lines.forEach((line, i) => ctx.text(line, left + 2, top + 8 + i * 6.7));

  const lineTop = top + height - 14;
  const fields = [
    { from: left + 10, to: left + 100, label: 'Signature' },
    { from: left + 107, to: left + 217, label: 'Authorized Representative', value: signedBy },
    { from: left + 225, to: left + 305, label: 'Date', value: signedBy ? todayLabel() : '' },
    { from: left + 313, to: right - 12, label: 'Title', value: title },
  ];
  for (const field of fields) {
    ctx.hline(field.from, field.to, lineTop, 0.6);
    ctx.text(field.label, (field.from + field.to) / 2, lineTop + 7.5, { align: 'center' });
    if (field.value) {
      ctx.text(field.value, (field.from + field.to) / 2, lineTop - 2.5, {
        align: 'center',
        maxWidth: field.to - field.from - 4,
      });
    }
  }
  if (png) {
    const scale = Math.min(88 / png.width, 26 / png.height, 1);
    const w = png.width * scale;
    const h = png.height * scale;
    ctx.page.drawImage(png, { x: (fields[0].from + fields[0].to) / 2 - w / 2, y: Y(lineTop - 1), width: w, height: h });
  }
  return top + height;
}

/**
 * Consolidated part one, "Documentation of Meals Claimed - At-Risk": one row
 * per site, alphabetical, with the month's attendance and meals. The template
 * lists supper before snack and leaves "Total Dollars Paid" for the office to
 * fill, and so does this.
 */
export async function buildConsolidatedSitesPdf(data, options = {}) {
  const ctx = await newDoc();
  const left = 29.7;
  const right = 592;
  const columns = [
    { key: 'site', from: left, to: 256, align: 'left' },
    { key: 'siteNumber', from: 256, to: 294 },
    { key: 'att', from: 294, to: 338 },
    { key: 'brk', from: 338, to: 384 },
    { key: 'lun', from: 384, to: 430 },
    { key: 'sup', from: 430, to: 476 },
    { key: 'snk', from: 476, to: 522 },
    { key: 'dollars', from: 522, to: right },
  ];
  const ROW = 9.4;
  const ceName = data.ceName || 'Intrinsic Foundation';

  const drawPageHeader = () => {
    ctx.text('Documentation of Meals Claimed - At-Risk', PAGE.width / 2, 40, { bold: true, size: 7.5, align: 'center' });

    // The three header cells: the foundation, its id, the month.
    const bandTop = 48;
    const bandBottom = 70;
    ctx.box(left, bandTop, right - left, bandBottom - bandTop);
    ctx.vline(426, bandTop, bandBottom);
    ctx.vline(506, bandTop, bandBottom);
    ctx.text(ceName, left + 2, bandTop + 8);
    ctx.text('id', 428, bandTop + 8);
    ctx.text(data.foundationId || '', 428, bandTop + 17);
    ctx.text('Month and Year', 508, bandTop + 8);
    ctx.text(data.period, right - 3, bandTop + 17, { align: 'right' });

    // The two tier column header.
    const headTop = 78;
    const headBottom = 106;
    const mid = headTop + 12;
    ctx.box(left, headTop, right - left, headBottom - headTop);
    for (const column of columns.slice(1)) ctx.vline(column.from, column.key === 'brk' || column.key === 'lun' || column.key === 'sup' || column.key === 'snk' ? mid : headTop, headBottom);
    ctx.hline(338, 522, mid);
    ctx.text('Name of Site', (left + 256) / 2, headTop + 12.5, { bold: true, align: 'center' });
    ctx.text('(List alphabetically)', (left + 256) / 2, headTop + 19.5, { bold: true, align: 'center' });
    ctx.text('Site #', 275, headTop + 16, { bold: true, align: 'center' });
    ctx.text('Attendance', 316, headTop + 16, { bold: true, align: 'center' });
    ctx.text('Number of Meals Claimed', 430, headTop + 8.5, { bold: true, align: 'center' });
    ctx.text('Total Dollars Paid', 557, headTop + 16, { bold: true, align: 'center' });
    for (const [key, label] of [['brk', 'Breakfast'], ['lun', 'Lunch'], ['sup', 'Supper'], ['snk', 'Snack']]) {
      const column = columns.find((c) => c.key === key);
      const centre = (column.from + column.to) / 2;
      ctx.text('At-risk', centre, mid + 7.5, { bold: true, align: 'center' });
      ctx.text(label, centre, mid + 14.2, { bold: true, align: 'center' });
    }
    return headBottom;
  };

  const drawRow = (top, row, { totals = false } = {}) => {
    ctx.box(left, top, right - left, ROW, { thickness: 0.4 });
    for (const column of columns.slice(1)) ctx.vline(column.from, top, top + ROW, 0.4);
    if (totals) {
      ctx.text('Totals:', 290, top + 6.8, { bold: true, align: 'right' });
    } else {
      ctx.text(row.site, left + 1, top + 6.8, { maxWidth: 256 - left - 3 });
      ctx.text(row.siteNumber ?? '', 290, top + 6.8, { align: 'right' });
    }
    for (const key of ['att', 'brk', 'lun', 'sup', 'snk']) {
      const column = columns.find((c) => c.key === key);
      ctx.text(row[key] ?? 0, column.to - 3.5, top + 6.8, { align: 'right' });
    }
  };

  let top = drawPageHeader();
  const floor = PAGE.height - 40;
  for (const row of data.rows) {
    if (top + ROW > floor) {
      ctx.newPage();
      top = drawPageHeader();
    }
    drawRow(top, row);
    top += ROW;
  }
  if (top + ROW > floor) {
    ctx.newPage();
    top = drawPageHeader();
  }
  drawRow(top, data.totals ?? {}, { totals: true });
  top += ROW;

  await drawClaimSignature(ctx, top + 12, options, { left, right });
  return ctx.doc.save();
}

/**
 * Consolidated part two: one row per day of the month, the four meals across.
 * Attendance is not on this form. It carries no signature block either; one is
 * drawn only when the document was in fact signed, so the signature is not
 * lost.
 */
export async function buildConsolidatedDaysPdf(data, options = {}) {
  const ctx = await newDoc();
  const left = 62;
  const right = 560;
  const width = (right - 104) / 4;
  const columns = [
    { key: 'day', from: left, to: 104, label: 'Date' },
    { key: 'brk', from: 104, to: 104 + width, label: 'At Risk Breakfast - 1st Meals' },
    { key: 'lun', from: 104 + width, to: 104 + width * 2, label: 'At Risk Lunch - 1st Meals' },
    { key: 'snk', from: 104 + width * 2, to: 104 + width * 3, label: 'At Risk Snack - 1st Meals' },
    { key: 'sup', from: 104 + width * 3, to: right, label: 'At Risk Supper - 1st Meals' },
  ];
  const ROW = 11.9;
  const SIZE = 7.4;
  const ceName = data.ceName || 'Intrinsic Foundation';

  ctx.text(`${ceName} ${data.foundationId || ''}`.trim(), PAGE.width / 2, 76, { size: 8.8, align: 'center' });
  ctx.text(`Claim Period: ${data.period}`, PAGE.width / 2, 89, { size: 8.8, align: 'center' });

  const headTop = 103;
  const headBottom = 116;
  ctx.box(left, headTop, right - left, headBottom - headTop, { thickness: 0.9 });
  for (const column of columns) {
    if (column.from !== left) ctx.vline(column.from, headTop, headBottom, 0.5, GRID);
    ctx.text(column.label, (column.from + column.to) / 2, headTop + 9.6, { size: SIZE, align: 'center' });
  }

  let top = headBottom;
  const drawRow = (row, { totals = false } = {}) => {
    if (totals) ctx.box(left, top, right - left, ROW, { fill: SHADE, thickness: 0.9 });
    for (const column of columns) {
      if (column.from !== left) ctx.vline(column.from, top, top + ROW, 0.5, GRID);
      const value = column.key === 'day' ? (totals ? 'Totals' : row.day) : row[column.key] ?? 0;
      ctx.text(value, (column.from + column.to) / 2, top + 8.2, { size: SIZE, align: 'center', bold: totals });
    }
    if (!totals) ctx.hline(left, right, top + ROW, 0.5, GRID);
    top += ROW;
  };
  for (const row of data.rows) drawRow(row);
  ctx.vline(left, headBottom, top, 0.9);
  ctx.vline(right, headBottom, top, 0.9);
  drawRow(data.totals ?? {}, { totals: true });

  if (options.signature || options.signedBy) {
    await drawClaimSignature(ctx, top + 16, options, { left, right });
  }
  return ctx.doc.save();
}

/** Draws a plain table, adding pages as it fills them. Returns the y it finished at. */
function drawSummaryTable(ctx, { columns, rows, startY, totalsRow }) {
  const MARGIN = 40;
  const ROW_HEIGHT = 16;
  const { doc, font, bold } = ctx;
  let page = ctx.page;
  let y = startY;

  const header = () => {
    page.drawRectangle({ x: MARGIN, y: y - ROW_HEIGHT + 4, width: PAGE.width - MARGIN * 2, height: ROW_HEIGHT, color: HEADER_BG });
    let x = MARGIN;
    for (const column of columns) {
      page.drawText(column.label, {
        x: column.align === 'right' ? x + column.width - 4 - bold.widthOfTextAtSize(column.label, 7.5) : x + 4,
        y: y - ROW_HEIGHT + 9,
        size: 7.5,
        font: bold,
        color: MUTED,
      });
      x += column.width;
    }
    y -= ROW_HEIGHT;
  };

  header();
  for (const row of rows) {
    if (y < MARGIN + ROW_HEIGHT * 4) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      ctx.page = page;
      y = PAGE.height - MARGIN;
      header();
    }
    let x = MARGIN;
    for (const column of columns) {
      const value = String(column.value(row) ?? '');
      page.drawText(value, {
        x: column.align === 'right' ? x + column.width - 4 - font.widthOfTextAtSize(value, 8.5) : x + 4,
        y: y - ROW_HEIGHT + 9,
        size: 8.5,
        font,
        color: SLATE,
      });
      x += column.width;
    }
    page.drawLine({ start: { x: MARGIN, y: y - ROW_HEIGHT + 2 }, end: { x: PAGE.width - MARGIN, y: y - ROW_HEIGHT + 2 }, thickness: 0.5, color: LINE });
    y -= ROW_HEIGHT;
  }

  if (totalsRow) {
    let x = MARGIN;
    page.drawRectangle({ x: MARGIN, y: y - ROW_HEIGHT + 4, width: PAGE.width - MARGIN * 2, height: ROW_HEIGHT, color: HEADER_BG });
    for (const column of columns) {
      const value = String(column.total ? column.total(totalsRow) : '');
      if (value) {
        page.drawText(value, {
          x: column.align === 'right' ? x + column.width - 4 - bold.widthOfTextAtSize(value, 8.5) : x + 4,
          y: y - ROW_HEIGHT + 9,
          size: 8.5,
          font: bold,
          color: SLATE,
        });
      }
      x += column.width;
    }
    y -= ROW_HEIGHT;
  }
  return y;
}

/**
 * The cover sheet of a site's month: every count it filed, one line each, with
 * the month totals. The daily forms follow it in the bundle.
 */
export async function buildSiteMonthPdf(data) {
  const ctx = await newDoc();
  const MARGIN = 40;
  const { page, bold, font } = ctx;

  let y = PAGE.height - MARGIN;
  page.drawText('Monthly meal count summary', { x: MARGIN, y: y - 14, size: 15, font: bold, color: SLATE });
  y -= 30;
  page.drawText(`${data.site}, ${data.period}`, { x: MARGIN, y: y - 4, size: 9.5, font, color: MUTED });
  y -= 18;
  page.drawText('Cover sheet. The daily forms follow, one per service day, in order.', {
    x: MARGIN,
    y: y - 4,
    size: 8.5,
    font,
    color: MUTED,
  });
  y -= 26;

  const columns = [
    // The asterisk rides on the date rather than taking a column of its own: on
    // a month where nothing was corrected, an empty column reads as a mistake.
    { label: 'Date', width: 120, value: (row) => `${dayLabel(row.date)}${row.corrected ? ' *' : ''}` },
    { label: 'Time in', width: 70, value: (row) => timeLabel(row.timeIn) },
    { label: 'Time out', width: 70, value: (row) => timeLabel(row.timeOut) },
    { label: 'Att', width: 52, align: 'right', value: (row) => row.att, total: (t) => t.att },
    { label: 'Brk', width: 52, align: 'right', value: (row) => row.brk, total: (t) => t.brk },
    { label: 'Lun', width: 52, align: 'right', value: (row) => row.lun, total: (t) => t.lun },
    { label: 'Snk', width: 52, align: 'right', value: (row) => row.snk, total: (t) => t.snk },
    { label: 'Sup', width: 52, align: 'right', value: (row) => row.sup, total: (t) => t.sup },
  ];
  columns[0].total = () => 'Totals';

  y = drawSummaryTable(ctx, { columns, rows: data.days, startY: y, totalsRow: data.totals });

  const correctedDays = data.days.filter((day) => day.corrected).length;
  ctx.page.drawText(`${data.days.length} ${data.days.length === 1 ? 'day' : 'days'} filed`, {
    x: MARGIN,
    y: y - 16,
    size: 8.5,
    font: ctx.font,
    color: MUTED,
  });
  if (correctedDays) {
    ctx.page.drawText(
      `* ${correctedDays} ${correctedDays === 1 ? 'day was' : 'days were'} corrected after submission. The figures are the corrected ones.`,
      { x: MARGIN, y: y - 30, size: 8.5, font: ctx.font, color: MUTED }
    );
  }
  return ctx.doc.save();
}

/**
 * A site's month as one document: the cover sheet, then every daily form in
 * date order (STOIC-2203: "un único PDF que contenga todos los formularios
 * diarios"). Each form is the same bytes its own download produces.
 */
export async function buildSiteMonthBundlePdf({ summary, counts }) {
  const doc = await PDFDocument.create();
  const append = async (bytes) => {
    const source = await PDFDocument.load(bytes);
    const pages = await doc.copyPages(source, source.getPageIndices());
    for (const page of pages) doc.addPage(page);
  };
  await append(await buildSiteMonthPdf(summary));
  for (const count of counts) await append(await buildMealCountPdf(count));
  return doc.save();
}
