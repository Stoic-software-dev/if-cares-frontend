import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Daily meal count PDF (STOIC-2203). Mirrors the paper form's structure —
// roster with attendance and meal marks, totals, certification text and the
// staff signature. Field-by-field fidelity gets validated against the real
// paper form with IF Cares.

const PAGE = { width: 612, height: 792 }; // US Letter
const MARGIN = 40;
const ROW_HEIGHT = 16;

const INK = rgb(0.06, 0.09, 0.16); // slate-900
const MUTED = rgb(0.39, 0.45, 0.55); // slate-500
const LINE = rgb(0.89, 0.91, 0.94); // slate-200
const HEADER_BG = rgb(0.97, 0.98, 0.99); // slate-50
const WARN = rgb(0.71, 0.33, 0.05); // amber-700, readable when this prints in grey

const CERTIFICATION_TEXT =
  'I certify that the information on this form is true and correct to the best of my ' +
  'knowledge, and that meal counts were taken at the point of service.';

function timeLabel(canonical) {
  if (!canonical) return 'Not recorded';
  const [h, m] = canonical.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function dateLabel(ymd) {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export async function buildMealCountPdf(count) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const tableWidth = PAGE.width - MARGIN * 2;
  const markWidth = 42;
  const columns = [
    { key: 'number', label: '#', width: 26, align: 'left' },
    { key: 'name', label: 'Student', width: tableWidth - 26 - 30 - markWidth * 5, align: 'left' },
    { key: 'age', label: 'Age', width: 30, align: 'center' },
    { key: 'attendance', label: 'Att', width: markWidth, align: 'center' },
    { key: 'breakfast', label: 'Brk', width: markWidth, align: 'center' },
    { key: 'lunch', label: 'Lun', width: markWidth, align: 'center' },
    { key: 'snack', label: 'Snk', width: markWidth, align: 'center' },
    { key: 'supper', label: 'Sup', width: markWidth, align: 'center' },
  ];

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const text = (value, x, size = 9, options = {}) => {
    page.drawText(String(value), {
      x,
      y: y - size,
      size,
      font: options.bold ? bold : font,
      color: options.color ?? INK,
    });
  };

  const cellX = (index) => MARGIN + columns.slice(0, index).reduce((sum, c) => sum + c.width, 0);

  const cellText = (value, index, size = 9, options = {}) => {
    const column = columns[index];
    const usedFont = options.bold ? bold : font;
    let x = cellX(index) + 2;
    if (column.align === 'center') {
      const w = usedFont.widthOfTextAtSize(String(value), size);
      x = cellX(index) + (column.width - w) / 2;
    }
    text(value, x, size, options);
  };

  const drawTableHeader = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - ROW_HEIGHT,
      width: tableWidth,
      height: ROW_HEIGHT,
      color: HEADER_BG,
    });
    y -= 3;
    columns.forEach((column, i) => cellText(column.label, i, 8, { bold: true, color: MUTED }));
    y -= ROW_HEIGHT - 3;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + tableWidth, y },
      thickness: 0.8,
      color: LINE,
    });
  };

  const newPage = () => {
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
    drawTableHeader();
  };

  // Header block
  text('IF Cares Daily Meal Count', MARGIN, 15, { bold: true });
  const dateStr = dateLabel(count.date);
  const dateWidth = bold.widthOfTextAtSize(dateStr, 11);
  text(dateStr, PAGE.width - MARGIN - dateWidth, 11, { bold: true });
  y -= 24;
  text(count.site, MARGIN, 11);
  y -= 18;
  text(`Time in: ${timeLabel(count.timeIn)}`, MARGIN, 9, { color: MUTED });
  text(`Time out: ${timeLabel(count.timeOut)}`, MARGIN + 110, 9, { color: MUTED });
  if (count.submittedBy && count.submittedBy !== 'gas-import') {
    text(`Submitted by: ${count.submittedBy}`, MARGIN + 230, 9, { color: MUTED });
  }

  // A corrected count prints its current values, so on paper it is
  // indistinguishable from one that was right the first time. Whoever receives
  // this has to be able to see that it was touched after it was signed, and
  // when - that is the whole point of keeping the original values.
  if (count.corrected) {
    y -= 15;
    const last = count.corrections?.[0];
    const when = last?.at ? new Date(last.at) : null;
    const stamp = when
      ? ` on ${when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : '';
    const times = count.corrections?.length ?? 1;
    text(
      `CORRECTED after submission - ${times} ${times === 1 ? 'correction' : 'corrections'}, last${stamp}${last?.by ? ` by ${last.by}` : ''}`,
      MARGIN,
      9,
      { bold: true, color: WARN }
    );
  }
  y -= 20;

  drawTableHeader();

  for (const entry of count.entries) {
    if (y < MARGIN + ROW_HEIGHT) newPage();
    y -= 3;
    cellText(entry.number, 0, 9);
    cellText(entry.name.slice(0, 55), 1, 9);
    cellText(entry.age ?? '', 2, 9);
    cellText(entry.attendance ? 'X' : '', 3, 9);
    cellText(entry.breakfast ? 'X' : '', 4, 9);
    cellText(entry.lunch ? 'X' : '', 5, 9);
    cellText(entry.snack ? 'X' : '', 6, 9);
    cellText(entry.supper ? 'X' : '', 7, 9);
    y -= ROW_HEIGHT - 3;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + tableWidth, y },
      thickness: 0.5,
      color: LINE,
    });
  }

  // Totals row
  if (y < MARGIN + ROW_HEIGHT) newPage();
  y -= 3;
  cellText('TOTALS', 1, 9, { bold: true });
  cellText(count.totals.att, 3, 9, { bold: true });
  cellText(count.totals.brk, 4, 9, { bold: true });
  cellText(count.totals.lun, 5, 9, { bold: true });
  cellText(count.totals.snk, 6, 9, { bold: true });
  cellText(count.totals.sup, 7, 9, { bold: true });
  y -= ROW_HEIGHT;

  // Certification + signature block, kept together
  const blockHeight = 130;
  if (y < MARGIN + blockHeight) newPage();
  y -= 16;
  text('Certification', MARGIN, 9, { bold: true });
  y -= 14;
  // Naive two-line wrap is enough for the fixed certification sentence.
  const midpoint = CERTIFICATION_TEXT.lastIndexOf(' ', Math.ceil(CERTIFICATION_TEXT.length / 2) + 10);
  text(CERTIFICATION_TEXT.slice(0, midpoint), MARGIN, 8, { color: MUTED });
  y -= 11;
  text(CERTIFICATION_TEXT.slice(midpoint + 1), MARGIN, 8, { color: MUTED });
  y -= 24;

  // A signature that will not decode must not take the document down with it.
  // pdf-lib throws on a truncated PNG ("Invalid typed array length: 0"), and
  // this is the only place the bytes are ever read - so a count accepted months
  // ago became a count whose daily form answered 500, at the moment somebody
  // needed the form. The row is still on the dashboard, still in the monthly
  // report and still in the claim; only its own document was unbuildable.
  let png = null;
  if (count.signature?.startsWith('data:image/png;base64,')) {
    try {
      png = await doc.embedPng(count.signature.slice('data:image/png;base64,'.length));
    } catch {
      png = null; // falls through to the blank signature line below
    }
  }

  if (png) {
    const scale = Math.min(180 / png.width, 55 / png.height, 1);
    page.drawImage(png, {
      x: MARGIN,
      y: y - png.height * scale,
      width: png.width * scale,
      height: png.height * scale,
    });
    y -= png.height * scale + 6;
  } else {
    y -= 30;
    text('Signature on file in the previous system', MARGIN, 8, { color: MUTED });
    y -= 6;
  }
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 220, y },
    thickness: 0.8,
    color: INK,
  });
  y -= 12;
  text('Staff signature', MARGIN, 8, { color: MUTED });

  return doc.save();
}
