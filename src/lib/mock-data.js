// Fixtures for the v2 mock build. Everything here is invented — no real
// student, staff or account data may ever land in this file.

export const MOCK_SITE = {
  name: 'COD Janie C. Turner Rec Center',
  meals: ['snack', 'supper'],
};

export const MOCK_USER = { name: 'Maria', lastname: 'Alvarez', role: 'STAFF' };

export const MOCK_STUDENTS = [
  { id: 's01', number: 1, name: 'Amara Bennett', age: 8 },
  { id: 's02', number: 2, name: 'Caleb Rios', age: 7 },
  { id: 's03', number: 3, name: 'Dario Vela', age: 9 },
  { id: 's04', number: 4, name: 'Elena Okafor', age: 9 },
  { id: 's05', number: 5, name: 'Felix Nguyen', age: 6 },
  { id: 's06', number: 6, name: 'Gia Marchetti', age: 8 },
  { id: 's07', number: 7, name: 'Hassan Ali', age: 10 },
  { id: 's08', number: 8, name: 'Imani Brooks', age: 7 },
  { id: 's09', number: 9, name: 'Jonas Petrov', age: 9 },
  { id: 's10', number: 10, name: 'Kira Tanaka', age: 8 },
  { id: 's11', number: 11, name: 'Liam Doyle', age: 6 },
  { id: 's12', number: 12, name: 'Maya Castillo', age: 10 },
  { id: 's13', number: 13, name: 'Noah Lindgren', age: 7 },
  { id: 's14', number: 14, name: 'Oona Fitzgerald', age: 9 },
  { id: 's15', number: 15, name: 'Pablo Herrera', age: 8 },
  { id: 's16', number: 16, name: 'Quinn Abara', age: 6 },
  { id: 's17', number: 17, name: 'Rosa Delgado', age: 10 },
  { id: 's18', number: 18, name: 'Samir Haddad', age: 7 },
  { id: 's19', number: 19, name: 'Tessa Novak', age: 9 },
  { id: 's20', number: 20, name: 'Uri Blum', age: 8 },
  { id: 's21', number: 21, name: 'Vera Kowalski', age: 6 },
  { id: 's22', number: 22, name: 'Wes Thornton', age: 10 },
  { id: 's23', number: 23, name: 'Ximena Paredes', age: 7 },
  { id: 's24', number: 24, name: 'Yusuf Kamara', age: 9 },
];

// September 2026: Tuesday the 1st, service Monday to Friday, today = the 17th.
// Day statuses: submitted | missing | today | upcoming | none (no service).
export const MOCK_MONTH = {
  label: 'September',
  year: 2026,
  todayDate: '2026-09-17',
  // Monday-first offset of September 1, 2026 (a Tuesday).
  leadingBlanks: 1,
  daysInMonth: 30,
  days: {
    1: 'submitted',
    2: 'submitted',
    3: 'submitted',
    4: 'submitted',
    7: 'submitted',
    8: 'submitted',
    9: 'missing',
    10: 'submitted',
    11: 'submitted',
    14: 'missing',
    15: 'submitted',
    16: 'submitted',
    17: 'today',
    18: 'upcoming',
    21: 'upcoming',
    22: 'upcoming',
    23: 'upcoming',
    24: 'upcoming',
    25: 'upcoming',
    28: 'upcoming',
    29: 'upcoming',
    30: 'upcoming',
  },
};

export const MOCK_COUNT_DETAIL = {
  date: '2026-09-08',
  dateLabel: 'Monday, September 8',
  timeIn: '3:30 PM',
  timeOut: '5:45 PM',
  status: 'submitted',
  corrected: {
    by: 'D. Whitfield',
    at: 'Sep 10, 4:12 PM',
    note: 'Supper for row 2 changed from 1 to 0. Original values are kept.',
  },
  signedBy: 'M. Alvarez',
  signedAt: 'Sep 8, 5:47 PM',
  totals: { att: 22, brk: 0, lun: 0, snk: 22, sup: 14 },
  entries: MOCK_STUDENTS.map((s, i) => ({
    ...s,
    att: i !== 4 && i !== 11,
    lun: false,
    snk: i !== 4 && i !== 11,
    sup: i % 3 !== 0 && i !== 4 && i !== 11,
    corrected: i === 1,
  })),
};

// The eight request types of the current app, verbatim.
export const REQUEST_TYPES = [
  'Sporks',
  'Meal Increase',
  'Meal Decrease',
  'Change approved meal service time',
  'Condiments',
  'Special Meals',
  'Dietary Restrictions',
  'Amount of milk on hand',
];

export const REQUEST_TYPE_WITH_TIME = 'Change approved meal service time';

export const MOCK_MENUS = [
  { id: 'm1', name: 'September 2026 Menu.pdf', updated: 'Aug 28, 2026', size: '1.2 MB' },
  { id: 'm2', name: 'August 2026 Menu.pdf', updated: 'Jul 30, 2026', size: '1.1 MB' },
  { id: 'm3', name: 'Snack Cycle Menu Fall 2026.pdf', updated: 'Aug 28, 2026', size: '840 KB' },
  { id: 'm4', name: 'Supper Cycle Menu Fall 2026.pdf', updated: 'Aug 28, 2026', size: '910 KB' },
];

export const MOCK_MY_REQUESTS = [
  { id: 'r1', type: 'Meal Increase', detail: '10 meals', status: 'IN_PROGRESS', date: 'Sep 15' },
  { id: 'r2', type: 'Sporks', detail: '200 units', status: 'RESOLVED', date: 'Sep 9' },
  { id: 'r3', type: 'Change approved meal service time', detail: '4:00 PM', status: 'RESOLVED', date: 'Aug 31' },
];

export const MOCK_INBOX_REQUESTS = [
  { id: 'q1', site: 'Janie C. Turner', type: 'Meal Increase', detail: '10 meals', by: 'M. Alvarez', date: 'Sep 15', status: 'NEW' },
  { id: 'q2', site: 'BGC Cooke', type: 'Special Meals', detail: '2 meals', by: 'D. Price', date: 'Sep 15', status: 'NEW' },
  { id: 'q3', site: 'Pleasant Oaks', type: 'Amount of milk on hand', detail: '30 units', by: 'T. Reed', date: 'Sep 14', status: 'NEW' },
  { id: 'q4', site: 'Fields Rec Center', type: 'Sporks', detail: '150 units', by: 'P. Raman', date: 'Sep 14', status: 'IN_PROGRESS' },
  { id: 'q5', site: 'Reverchon', type: 'Meal Decrease', detail: '5 meals', by: 'T. Reed', date: 'Sep 11', status: 'IN_PROGRESS' },
  { id: 'q6', site: 'Anita Martinez', type: 'Condiments', detail: '40 units', by: 'J. Ellis', date: 'Sep 10', status: 'RESOLVED' },
  { id: 'q7', site: 'Janie C. Turner', type: 'Sporks', detail: '200 units', by: 'M. Alvarez', date: 'Sep 9', status: 'RESOLVED' },
  { id: 'q8', site: 'Kleberg Rylie', type: 'Dietary Restrictions', detail: '1 student', by: 'R. Nguyen', date: 'Sep 8', status: 'RESOLVED' },
];

export const MOCK_ADMIN_USERS = [
  { id: 'u1', name: 'Dana Whitfield', email: 'd.whitfield@example.org', role: 'ADMIN', sites: 'All sites', active: true },
  { id: 'u2', name: 'Maria Alvarez', email: 'm.alvarez@example.org', role: 'STAFF', sites: 'Janie C. Turner · Fields Rec Center', active: true },
  { id: 'u3', name: 'Devon Price', email: 'd.price@example.org', role: 'STAFF', sites: 'BGC Cooke', active: true },
  { id: 'u4', name: 'Robert Nguyen', email: 'r.nguyen@example.org', role: 'STAFF', sites: 'Kleberg Rylie', active: false },
  { id: 'u5', name: 'Tasha Reed', email: 't.reed@example.org', role: 'STAFF', sites: 'Pleasant Oaks · Reverchon · Anita Martinez', active: true },
  { id: 'u6', name: 'Owen Castillo', email: 'o.castillo@example.org', role: 'ADMIN', sites: 'All sites', active: true },
  { id: 'u7', name: 'Priya Raman', email: 'p.raman@example.org', role: 'STAFF', sites: 'Fields Rec Center', active: true },
  { id: 'u8', name: 'Jordan Ellis', email: 'j.ellis@example.org', role: 'STAFF', sites: 'Anita Martinez', active: true },
];
