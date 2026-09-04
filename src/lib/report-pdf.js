import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// The monthly and consolidated documents. They share the daily form's ink so the
// three read as one product.
//
// The field list of the consolidated reports comes from the legacy generator
// (`gas-backup/report/generateReports.gs`): part one is one row per site with
// its month totals, part two is one row per day. The legacy version filled a
// Google Sheets template, so the exact printed layout of the official form is
// not reproduced here field position by field position, only its content.

const PAGE = { width: 612, height: 792 }; // US Letter portrait
const LANDSCAPE = { width: 792, height: 612 };
const MARGIN = 40;
const ROW_HEIGHT = 16;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.89, 0.91, 0.94);
const HEADER_BG = rgb(0.97, 0.98, 0.99);

const CERTIFICATION =
  'I certify that the information on this report is true and correct to the best of my knowledge, ' +
  'that the meals claimed were served to eligible participants, and that records are on file to ' +
  'support this claim.';

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

/** Draws a table and returns the y it finished at, adding pages as it fills them. */
function drawTable(ctx, { columns, rows, startY, totalsRow }) {
  const { doc, font, bold, size } = ctx;
  let page = ctx.page;
  let y = startY;

  const header = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - ROW_HEIGHT + 4,
      width: size.width - MARGIN * 2,
      height: ROW_HEIGHT,
      color: HEADER_BG,
    });
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
      page = doc.addPage([size.width, size.height]);
      ctx.page = page;
      y = size.height - MARGIN;
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
        color: INK,
      });
      x += column.width;
    }

    page.drawLine({
      start: { x: MARGIN, y: y - ROW_HEIGHT + 2 },
      end: { x: size.width - MARGIN, y: y - ROW_HEIGHT + 2 },
      thickness: 0.5,
      color: LINE,
    });
    y -= ROW_HEIGHT;
  }

  if (totalsRow) {
    let x = MARGIN;
    page.drawRectangle({
      x: MARGIN,
      y: y - ROW_HEIGHT + 4,
      width: size.width - MARGIN * 2,
      height: ROW_HEIGHT,
      color: HEADER_BG,
    });
    for (const column of columns) {
      const value = String(column.total ? column.total(totalsRow) : '');
      if (value) {
        page.drawText(value, {
          x: column.align === 'right' ? x + column.width - 4 - bold.widthOfTextAtSize(value, 8.5) : x + 4,
          y: y - ROW_HEIGHT + 9,
          size: 8.5,
          font: bold,
          color: INK,
        });
      }
      x += column.width;
    }
    y -= ROW_HEIGHT;
  }

  return y;
}

// The claim is filed by the foundation, and the state reads that number first.
// The legacy template printed it as "Intrinsic Foundation <id>".
function foundationLine(data) {
  return data.foundationId ? `Intrinsic Foundation ${data.foundationId} - ` : '';
}

function drawHeading(ctx, { title, subtitle }) {
  const { page, bold, font, size } = ctx;
  let y = size.height - MARGIN;
  page.drawText(title, { x: MARGIN, y: y - 14, size: 15, font: bold, color: INK });
  y -= 30;
  if (subtitle) {
    page.drawText(subtitle, { x: MARGIN, y: y - 4, size: 9.5, font, color: MUTED });
    y -= 18;
  }
  return y - 8;
}

/**
 * The signature block that closes a claim. `signature` is a PNG data URL when
 * the report has been signed; without one it prints the ruled line to sign by
 * hand, so an unsigned copy is still a usable document.
 */
async function drawSignature(ctx, y, { signature, signedBy, title }) {
  const { doc, font, bold, size } = ctx;
  const boxWidth = 220;

  const lines = [];
  let line = '';
  for (const word of CERTIFICATION.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, 8) > size.width - MARGIN * 2) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  // The signature is measured before anything is drawn, because its height
  // decides two things: how far down the ruled line goes, and whether the whole
  // block still fits on this page.
  let png = null;
  let sigWidth = 0;
  let sigHeight = 0;
  if (signature?.startsWith('data:image/png;base64,')) {
    try {
      png = await doc.embedPng(Buffer.from(signature.split(',')[1], 'base64'));
      const scale = Math.min(boxWidth / png.width, 44 / png.height);
      sigWidth = png.width * scale;
      sigHeight = png.height * scale;
    } catch {
      // An unreadable signature must not cost the whole report.
      png = null;
    }
  }

  // Room for the signature to stand on the line rather than hang through it.
  const gap = Math.max(18, sigHeight + 10);
  const needed = 10 + lines.length * 11 + gap + 32;
  if (y - needed < MARGIN) {
    ctx.page = doc.addPage([size.width, size.height]);
    y = size.height - MARGIN;
  }
  const page = ctx.page;
  let cursor = y - 10;

  for (const text of lines) {
    page.drawText(text, { x: MARGIN, y: cursor, size: 8, font, color: MUTED });
    cursor -= 11;
  }

  cursor -= gap;

  // Sitting on the line, not across it. Anchoring the image by its top put the
  // strokes through "Authorized representative" and through the signer's own
  // name, on the one page of the claim that has to look like a signed document.
  if (png) {
    page.drawImage(png, { x: MARGIN, y: cursor + 1, width: sigWidth, height: sigHeight });
  }

  page.drawLine({
    start: { x: MARGIN, y: cursor - 2 },
    end: { x: MARGIN + boxWidth, y: cursor - 2 },
    thickness: 0.75,
    color: INK,
  });
  page.drawText('Authorized representative', { x: MARGIN, y: cursor - 14, size: 7.5, font, color: MUTED });
  if (signedBy) {
    page.drawText(signedBy, { x: MARGIN, y: cursor - 25, size: 9, font: bold, color: INK });
  }

  const dateX = MARGIN + boxWidth + 40;
  page.drawLine({
    start: { x: dateX, y: cursor - 2 },
    end: { x: dateX + 140, y: cursor - 2 },
    thickness: 0.75,
    color: INK,
  });
  page.drawText('Date', { x: dateX, y: cursor - 14, size: 7.5, font, color: MUTED });
  if (signedBy) {
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    page.drawText(today, { x: dateX, y: cursor - 25, size: 9, font: bold, color: INK });
  }

  // The signer's title used to float beside the date with no line and no label,
  // which read as a stray word rather than a field of the form.
  if (title) {
    const titleX = dateX + 160;
    page.drawLine({
      start: { x: titleX, y: cursor - 2 },
      end: { x: size.width - MARGIN, y: cursor - 2 },
      thickness: 0.75,
      color: INK,
    });
    page.drawText('Title', { x: titleX, y: cursor - 14, size: 7.5, font, color: MUTED });
    page.drawText(title, { x: titleX, y: cursor - 25, size: 9, font: bold, color: INK });
  }
}

async function newDoc(size) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([size.width, size.height]);
  return {
    doc,
    page,
    size,
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

/** One site, one month: every count it filed, with the month totals. */
export async function buildSiteMonthPdf(data) {
  const ctx = await newDoc(PAGE);
  ctx.font = await ctx.doc.embedFont(StandardFonts.Helvetica);
  ctx.bold = await ctx.doc.embedFont(StandardFonts.HelveticaBold);

  let y = drawHeading(ctx, {
    title: 'Monthly meal count summary',
    subtitle: `${data.site} · ${data.period}`.replace(' · ', ', '),
  });

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

  y = drawTable(ctx, { columns, rows: data.days, startY: y, totalsRow: data.totals });

  const correctedDays = data.days.filter((day) => day.corrected).length;
  ctx.page.drawText(
    `${data.days.length} ${data.days.length === 1 ? 'day' : 'days'} filed`,
    { x: MARGIN, y: y - 16, size: 8.5, font: ctx.font, color: MUTED }
  );
  if (correctedDays) {
    ctx.page.drawText(
      `* ${correctedDays} ${correctedDays === 1 ? 'day was' : 'days were'} corrected after submission. The figures above are the corrected ones.`,
      { x: MARGIN, y: y - 30, size: 8.5, font: ctx.font, color: MUTED }
    );
  }

  return ctx.doc.save();
}

/** Consolidated part one: a row per site. */
export async function buildConsolidatedSitesPdf(data, options = {}) {
  const ctx = await newDoc(LANDSCAPE);
  ctx.font = await ctx.doc.embedFont(StandardFonts.Helvetica);
  ctx.bold = await ctx.doc.embedFont(StandardFonts.HelveticaBold);

  let y = drawHeading(ctx, {
    title: 'Documentation of meals claimed, by site',
    subtitle: `${foundationLine(data)}${data.state}, ${data.period}${
      data.excluded?.length ? `, ${data.excluded.length} sites excluded` : ''
    }`,
  });

  const columns = [
    { label: 'Site', width: 300, value: (row) => row.site },
    { label: 'Site number', width: 80, value: (row) => row.siteNumber || '' },
    { label: 'Days', width: 50, align: 'right', value: (row) => row.days },
    { label: 'Attendance', width: 70, align: 'right', value: (row) => row.att, total: (t) => t.att },
    { label: 'Breakfast', width: 70, align: 'right', value: (row) => row.brk, total: (t) => t.brk },
    { label: 'Lunch', width: 70, align: 'right', value: (row) => row.lun, total: (t) => t.lun },
    { label: 'Snack', width: 70, align: 'right', value: (row) => row.snk, total: (t) => t.snk },
    { label: 'Supper', width: 70, align: 'right', value: (row) => row.sup, total: (t) => t.sup },
  ];
  columns[0].total = () => 'Totals';

  y = drawTable(ctx, { columns, rows: data.rows, startY: y, totalsRow: data.totals });
  await drawSignature(ctx, y, options);

  return ctx.doc.save();
}

/** Consolidated part two: a row per day of the month. */
export async function buildConsolidatedDaysPdf(data, options = {}) {
  const ctx = await newDoc(PAGE);
  ctx.font = await ctx.doc.embedFont(StandardFonts.Helvetica);
  ctx.bold = await ctx.doc.embedFont(StandardFonts.HelveticaBold);

  let y = drawHeading(ctx, {
    title: 'Documentation of meals claimed, by day',
    subtitle: `${foundationLine(data)}${data.state}, ${data.period}`,
  });

  const columns = [
    { label: 'Day', width: 60, value: (row) => row.day },
    { label: 'Attendance', width: 90, align: 'right', value: (row) => row.att, total: (t) => t.att },
    { label: 'Breakfast', width: 90, align: 'right', value: (row) => row.brk, total: (t) => t.brk },
    { label: 'Lunch', width: 90, align: 'right', value: (row) => row.lun, total: (t) => t.lun },
    { label: 'Snack', width: 90, align: 'right', value: (row) => row.snk, total: (t) => t.snk },
    { label: 'Supper', width: 90, align: 'right', value: (row) => row.sup, total: (t) => t.sup },
  ];
  columns[0].total = () => 'Totals';

  y = drawTable(ctx, { columns, rows: data.rows, startY: y, totalsRow: data.totals });
  await drawSignature(ctx, y, options);

  return ctx.doc.save();
}
