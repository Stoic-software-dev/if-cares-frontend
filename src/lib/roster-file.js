// Turning a roster file into rows.
//
// What arrives here is whatever the office had: a CSV exported from Excel, a
// block pasted straight out of a spreadsheet (tab separated), sometimes a
// column header and sometimes not. All of that has to work without asking
// anyone to reformat anything, because "please fix the file first" is how a
// feature goes unused.

const DELIMITERS = [',', '\t', ';'];

/** The delimiter that yields the most columns on the first non-empty line. */
function detectDelimiter(text) {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  let best = ',';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = splitLine(line, d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** One line into fields, honouring quotes and doubled quotes inside them. */
function splitLine(line, delimiter) {
  const fields = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

const NAME_HEADERS = ['name', 'student', 'student name', 'full name', 'nombre', 'alumno'];
const AGE_HEADERS = ['age', 'edad'];
const BIRTHDATE_HEADERS = ['birthdate', 'birth date', 'dob', 'date of birth', 'nacimiento', 'fecha de nacimiento'];

const matches = (value, list) => list.includes(value.trim().toLowerCase());

/** US-style dates are what these files carry; ISO passes through untouched. */
function normalizeDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slashed = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashed) {
    const [, m, d, y] = slashed;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return raw; // let the server reject it with a reason
}

/**
 * Parses a roster file or pasted block into `{ rows, columns }`.
 *
 * A header row is used when it names the columns and ignored otherwise, so a
 * bare "Ana Perez, 9" list works exactly as well as an exported spreadsheet.
 * Without a header the order is the one the app already shows: name, age,
 * birthdate.
 */
export function parseRosterText(text) {
  const clean = String(text ?? '').replace(/^﻿/, ''); // Excel's BOM
  const lines = clean.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { rows: [], columns: null };

  const delimiter = detectDelimiter(clean);
  const table = lines.map((line) => splitLine(line, delimiter));

  let columns = { name: 0, age: 1, birthdate: 2 };
  let start = 0;

  const head = table[0];
  const looksLikeHeader = head.some(
    (cell) => matches(cell, NAME_HEADERS) || matches(cell, AGE_HEADERS) || matches(cell, BIRTHDATE_HEADERS)
  );
  if (looksLikeHeader) {
    columns = { name: -1, age: -1, birthdate: -1 };
    head.forEach((cell, i) => {
      if (columns.name < 0 && matches(cell, NAME_HEADERS)) columns.name = i;
      else if (columns.age < 0 && matches(cell, AGE_HEADERS)) columns.age = i;
      else if (columns.birthdate < 0 && matches(cell, BIRTHDATE_HEADERS)) columns.birthdate = i;
    });
    if (columns.name < 0) columns.name = 0;
    start = 1;
  }

  const rows = table.slice(start).map((cells) => ({
    name: cells[columns.name] ?? '',
    age: columns.age >= 0 ? (cells[columns.age] ?? '') : '',
    birthdate: columns.birthdate >= 0 ? normalizeDate(cells[columns.birthdate] ?? '') : '',
  }));

  return { rows, columns, delimiter, hadHeader: start === 1 };
}
