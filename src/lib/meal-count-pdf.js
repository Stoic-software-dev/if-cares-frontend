import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// The daily form, drawn to match the one the sites have always filed: the
// "Daily Meal Count and Attendance Record: At-Risk" sheet the old system
// exported from each site's spreadsheet, two hundred numbered rows in two
// columns, the five header boxes, the totals grid, the certification and the
// site representative's signature. The geometry is measured off those exports
// (`Meal Count PDF's` in the client's Drive), so an auditor gets the same page
// whichever system produced it.
//
// The one thing the paper form never had is a corrected mark. STOIC-2201 asks
// for one, so a corrected count says so under the title, in the only colour on
// the page.

const PAGE = { width: 612, height: 792 }; // US Letter portrait
const LEFT = 50.4;
const RIGHT = 562;
const TOP = 54; // measured from the top edge, the way the form is read
const FLOOR = 740; // the roster stops here and continues on the next page
const ROW = 8.8;
const SIZE = 5.7;
const HALF = (RIGHT - LEFT) / 2;

const INK = rgb(0, 0, 0);
const GRID = rgb(0.72, 0.72, 0.72);
const CHECK = rgb(0.36, 0.36, 0.36);
const WHITE = rgb(1, 1, 1);
const WARN = rgb(0.71, 0.33, 0.05);

const CERTIFICATION =
  'I certify that the information on this form is true and correct to the best of my knowledge ' +
  'and that I will claim reimbursement only for eligible meals served to eligible Program ' +
  'participants. I understand that misrepresentation may result in prosecution under applicable ' +
  'state or federal laws.';

// One half of the roster, in the proportions of the original sheet. Scaled so
// the two halves fill the width exactly.
const COLUMNS = [
  { key: 'num', w: 15 },
  { key: 'name', w: 78 },
  { key: 'age', w: 18.8, label: 'Age' },
  { key: 'at', w: 15, label: 'At', flag: 'attendance' },
  { key: 'in', w: 37.6, label: 'In' },
  { key: 'out', w: 27.4, label: 'Out' },
  { key: 'brk', w: 14.3, label: 'Brk', flag: 'breakfast' },
  { key: 'lu', w: 14.3, label: 'Lu', flag: 'lunch' },
  { key: 'snk', w: 14.3, label: 'Snk', flag: 'snack' },
  { key: 'sup', w: 14.3, label: 'Sup', flag: 'supper' },
];
const COLUMNS_WIDTH = COLUMNS.reduce((sum, column) => sum + column.w, 0);

// The sheet came in 200, 250 and 300 row editions (STOIC-235); a roster is
// printed on the smallest one it fits, blank numbered rows included, because
// those rows are part of the form the sites know.
function capacityFor(rows) {
  if (rows <= 200) return 200;
  if (rows <= 250) return 250;
  if (rows <= 300) return 300;
  return Math.ceil(rows / 50) * 50;
}

const Y = (top) => PAGE.height - top;

export function timeLabel(canonical) {
  if (!canonical) return '';
  const [h, m] = canonical.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** mm/dd/yyyy, which is what the form's own date box asks for. */
export function formDate(ymd) {
  const [y, m, d] = String(ymd).split('-');
  return y && m && d ? `${m}/${d}/${y}` : String(ymd ?? '');
}

// The standard fonts cover Latin-1 and nothing beyond it. A name with a
// character outside that (a Vietnamese tone mark, an emoji pasted into the
// roster) must not take the whole form down, so it is drawn without it.
function encodable(font, text) {
  try {
    font.widthOfTextAtSize(text, SIZE);
    return text;
  } catch {
    const stripped = String(text)
      .normalize('NFKD')
      .replace(/[^\x20-\x7e\xa0-\xff]/g, '');
    try {
      font.widthOfTextAtSize(stripped, SIZE);
      return stripped;
    } catch {
      return stripped.replace(/[^\x20-\x7e]/g, '');
    }
  }
}

/** Shrinks, then truncates, so a long name never runs into the next cell. */
function fit(font, text, size, maxWidth) {
  let s = size;
  while (s > 4.2 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.2;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t, s) > maxWidth) t = t.slice(0, -1);
  return { text: t, size: s };
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

export async function buildMealCountPdf(count) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const scale = HALF / COLUMNS_WIDTH;
  const columns = COLUMNS.map((column) => ({ ...column, w: column.w * scale }));
  const columnX = (side, index) =>
    LEFT + side * HALF + columns.slice(0, index).reduce((sum, column) => sum + column.w, 0);

  const entries = [...(count.entries ?? [])].sort((a, b) => a.number - b.number);
  const capacity = capacityFor(entries.length);
  const half = capacity / 2;
  const header = count.siteHeader ?? {};
  const timeIn = timeLabel(count.timeIn);
  const timeOut = timeLabel(count.timeOut);

  const text = (page, value, x, top, options = {}) => {
    const size = options.size ?? SIZE;
    const used = options.bold ? bold : font;
    const str = encodable(used, String(value ?? ''));
    let drawX = x;
    if (options.align === 'center') drawX = x - used.widthOfTextAtSize(str, size) / 2;
    if (options.align === 'right') drawX = x - used.widthOfTextAtSize(str, size);
    page.drawText(str, { x: drawX, y: Y(top), size, font: used, color: options.color ?? INK });
  };

  const hline = (page, x1, x2, top, thickness = 0.3, color = GRID) =>
    page.drawLine({ start: { x: x1, y: Y(top) }, end: { x: x2, y: Y(top) }, thickness, color });
  const vline = (page, x, top1, top2, thickness = 0.3, color = GRID) =>
    page.drawLine({ start: { x, y: Y(top1) }, end: { x, y: Y(top2) }, thickness, color });
  const box = (page, x, top, width, height, thickness = 0.8, color = INK) =>
    page.drawRectangle({ x, y: Y(top + height), width, height, borderColor: color, borderWidth: thickness });

  const checkbox = (page, cx, cy, checked) => {
    const s = 5.6;
    const x = cx - s / 2;
    const y = Y(cy + s / 2);
    if (!checked) {
      page.drawRectangle({ x, y, width: s, height: s, borderColor: CHECK, borderWidth: 0.5 });
      return;
    }
    page.drawRectangle({ x, y, width: s, height: s, color: CHECK });
    page.drawLine({ start: { x: x + 1.2, y: y + 2.7 }, end: { x: x + 2.4, y: y + 1.4 }, thickness: 0.8, color: WHITE });
    page.drawLine({ start: { x: x + 2.4, y: y + 1.4 }, end: { x: x + 4.5, y: y + 4.4 }, thickness: 0.8, color: WHITE });
  };

  // The column header sits at the top of every page of the roster: the first
  // under the form's header boxes, the rest under nothing.
  const drawColumnHeader = (page, top) => {
    const bottom = top + 15;
    for (const side of [0, 1]) {
      columns.forEach((column, index) => {
        const x = columnX(side, index);
        if (column.key === 'num') return;
        if (column.key === 'name') {
          text(page, "Participant's Name", x + 0.5, top + 6.6, { bold: true });
          text(page, '(First & Last Name Required)', x + 0.5, top + 13.2, { bold: true });
          return;
        }
        text(page, column.label, x + column.w / 2, top + 10.2, { bold: true, align: 'center' });
      });
    }
    hline(page, LEFT, RIGHT, bottom, 0.8, INK);
    return bottom;
  };

  const drawFormHeader = (page) => {
    const titleBottom = TOP + 18;
    const fieldsBottom = titleBottom + 24;
    const rowsTop = drawColumnHeader(page, fieldsBottom);
    box(page, LEFT, TOP, RIGHT - LEFT, rowsTop - TOP);

    text(page, 'Daily Meal Count and Attendance Record: At-Risk', PAGE.width / 2, TOP + 12.5, {
      bold: true,
      size: 9.3,
      align: 'center',
    });
    hline(page, LEFT, RIGHT, titleBottom, 0.8, INK);

    const cells = [
      { label: 'Name of Contracting Entity (CE)', value: header.ceName, from: LEFT, to: 270 },
      { label: 'CE ID', value: header.ceId, from: 270, to: LEFT + HALF },
      { label: 'Name of Site', value: header.siteName || count.site, from: LEFT + HALF, to: 465 },
      { label: 'Site #', value: header.siteNumber, from: 465, to: 514 },
      { label: 'Date (mm/dd/yyyy)', value: formDate(count.date), from: 514, to: RIGHT },
    ];
    for (const cell of cells) {
      text(page, cell.label, cell.from + 1.5, titleBottom + 6.6, { bold: true, size: 5.2 });
      const value = fit(font, encodable(font, String(cell.value ?? '')), 6.2, cell.to - cell.from - 4);
      text(page, value.text, (cell.from + cell.to) / 2, fieldsBottom - 5, { size: value.size, align: 'center' });
      if (cell.to !== RIGHT) vline(page, cell.to, titleBottom, fieldsBottom, 0.8, INK);
    }
    hline(page, LEFT, RIGHT, fieldsBottom, 0.8, INK);
    return rowsTop;
  };

  const drawRow = (page, side, top, number, entry) => {
    const baseline = top + 6.5;
    columns.forEach((column, index) => {
      const x = columnX(side, index);
      const centre = x + column.w / 2;
      switch (column.key) {
        case 'num':
          text(page, number, x + 1.2, baseline);
          break;
        case 'name': {
          if (!entry) break;
          const name = fit(font, encodable(font, entry.name ?? ''), SIZE, column.w - 2.5);
          text(page, name.text, x + 0.5, baseline, { size: name.size });
          break;
        }
        case 'age':
          if (entry?.age !== null && entry?.age !== undefined && entry?.age !== '') {
            text(page, entry.age, centre, baseline, { align: 'center' });
          }
          break;
        case 'in':
          if (entry?.attendance) text(page, timeIn, centre, baseline, { align: 'center' });
          break;
        case 'out':
          if (entry?.attendance) text(page, timeOut, centre, baseline, { align: 'center' });
          break;
        default:
          checkbox(page, centre, top + ROW / 2, Boolean(entry?.[column.flag]));
      }
    });
  };

  const drawRows = (page, top, rows, offset) => {
    for (let r = 0; r < rows; r++) {
      const rowTop = top + r * ROW;
      for (const side of [0, 1]) {
        const number = side * half + offset + r + 1;
        drawRow(page, side, rowTop, number, entries[number - 1]);
      }
      hline(page, LEFT, RIGHT, rowTop + ROW);
    }
    const bottom = top + rows * ROW;
    for (const side of [0, 1]) {
      columns.forEach((column, index) => {
        if (index === 0) return;
        const heavy = column.key === 'name' || column.key === 'age' || column.key === 'in' || column.key === 'brk';
        vline(page, columnX(side, index), top, bottom, heavy ? 0.5 : 0.3, heavy ? CHECK : GRID);
      });
    }
    vline(page, LEFT + HALF, top, bottom, 0.8, INK);
    box(page, LEFT, top, RIGHT - LEFT, bottom - top);
    return bottom;
  };

  // A page's worth of rows in each column. Two hundred rows on the 200 row
  // sheet came out as 1-70 beside 101-170 and then 71-100 beside 171-200,
  // which is what the sites are used to reading.
  let page = doc.addPage([PAGE.width, PAGE.height]);
  let rowsTop = drawFormHeader(page);
  let slot = 0;
  let bottom = rowsTop;
  while (slot < half) {
    const rows = Math.min(Math.floor((FLOOR - rowsTop) / ROW), half - slot);
    bottom = drawRows(page, rowsTop, rows, slot);
    slot += rows;
    if (slot < half) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      rowsTop = drawColumnHeader(page, TOP);
    }
  }

  // The signature is decoded before the footer is placed, because its height is
  // part of what has to fit.
  let png = null;
  if (count.signature?.startsWith('data:image/png;base64,')) {
    try {
      png = await doc.embedPng(count.signature.slice('data:image/png;base64,'.length));
    } catch {
      png = null; // a signature that will not decode must not cost the form
    }
  }
  const sigScale = png ? Math.min(112 / png.width, 26 / png.height, 1) : 0;

  let top = bottom + 10;
  if (top + 96 > PAGE.height - 30) {
    page = doc.addPage([PAGE.width, PAGE.height]);
    top = TOP;
  }

  // Totals, in the sheet's own two by three grid. Non-program meals were never
  // recorded by the app and print as zero, as they always did.
  const totals = count.totals ?? {};
  const grid = [
    [
      ['Total breakfasts:', totals.brk],
      ['Total snacks:', totals.snk],
      ['Total Non-Program Meals:', 0],
    ],
    [
      ['Total lunches:', totals.lun],
      ['Total suppers:', totals.sup],
      ['Total Program Participants:', totals.att],
    ],
  ];
  const slots = [
    { labelRight: 143.3, valueFrom: 146, valueTo: 168 },
    { labelRight: 257.3, valueFrom: 260, valueTo: 284 },
    { labelRight: 390.9, valueFrom: 394, valueTo: 422 },
  ];
  grid.forEach((row, r) => {
    const rowTop = top + r * (ROW + 1);
    row.forEach(([label, value], i) => {
      const slotAt = slots[i];
      text(page, label, slotAt.labelRight, rowTop + 6.6, { bold: true, align: 'right' });
      box(page, slotAt.valueFrom, rowTop, slotAt.valueTo - slotAt.valueFrom, ROW + 1, 0.4, GRID);
      text(page, value ?? 0, (slotAt.valueFrom + slotAt.valueTo) / 2, rowTop + 6.6, { align: 'center' });
    });
  });

  // A corrected count prints its current values, so on paper it would pass for
  // one that was right the first time. The mark sits beside the totals, where
  // whoever audits the form is already looking.
  if (count.corrected) {
    const times = count.correctionCount ?? count.corrections?.length ?? 1;
    const last = count.corrections?.[0];
    const when = last?.at ? formDate(new Date(last.at).toISOString().slice(0, 10)) : '';
    const detail = [when && `last ${when}`, last?.by && `by ${last.by}`].filter(Boolean).join(' ');
    text(page, `CORRECTED AFTER SUBMISSION (${times})`, RIGHT - 2, top + 6.6, { bold: true, size: 5.4, align: 'right', color: WARN });
    if (detail) text(page, detail, RIGHT - 2, top + ROW + 1 + 6.6, { size: 5.2, align: 'right', color: WARN });
  }
  top += 2 * (ROW + 1) + 14;

  // Certification, with "eligible" underlined twice as the form prints it.
  const certLines = wrap(bold, CERTIFICATION, SIZE, 214);
  certLines.forEach((line, i) => {
    const baseline = top + i * 6.9 + 5.7;
    text(page, line, LEFT + 1.2, baseline, { bold: true });
    let from = 0;
    while (from < line.length) {
      const at = line.indexOf('eligible', from);
      if (at < 0) break;
      const x1 = LEFT + 1.2 + bold.widthOfTextAtSize(line.slice(0, at), SIZE);
      const x2 = x1 + bold.widthOfTextAtSize('eligible', SIZE);
      hline(page, x1, x2, baseline + 1.1, 0.4, INK);
      from = at + 'eligible'.length;
    }
  });

  const lineTop = top + 22;
  if (png) {
    const w = png.width * sigScale;
    const h = png.height * sigScale;
    page.drawImage(png, { x: 359 - w / 2, y: Y(lineTop - 1), width: w, height: h });
  }
  hline(page, 300, 418, lineTop, 0.6, INK);
  text(page, 'Signature - Site Representative', 359, lineTop + 7.5, { size: 4.7, align: 'center' });

  text(page, formDate(count.date), 514, lineTop - 2, { size: 5.2, align: 'center' });
  hline(page, 470, 558, lineTop, 0.6, INK);
  text(page, 'Date', 514, lineTop + 7.5, { size: 4.7, align: 'center' });

  return doc.save();
}
