// The rejected-records log STOIC-2198 asks for, generated rather than written.
//
// A hand-written list of anomalies is out of date the moment the pipeline runs
// again, and this one has to survive being sent to IF Cares, answered weeks
// later, and checked again before the cutover. So it reads the live database
// and the import snapshots every time.
//
//   npm run db:anomalies            # readable report
//   npm run db:anomalies -- --json  # same thing for a script
//
// It is deliberately read only. Nothing here decides anything: every item is a
// question for IF Cares, and the answers are recorded in
// docs/data-anomalies-for-ifcares.md.

import { readdir, readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const asJson = process.argv.includes('--json');
const findings = [];

const add = (key, title, count, detail, recommendation) => {
  findings.push({ key, title, count, detail, recommendation });
};

// 1. Duplicated site sheets that came across as sites.
const copies = await prisma.site.findMany({
  where: { name: { startsWith: 'Copy of ' } },
  select: { name: true, active: true },
  orderBy: { name: 'asc' },
});
add(
  'copied-sites',
  'Sites whose name starts with "Copy of"',
  copies.length,
  copies.map((s) => `${s.name}${s.active ? ' (ACTIVE)' : ' (inactive)'}`),
  copies.some((s) => s.active)
    ? 'Some are still active. Confirm they are duplicates and we deactivate them.'
    : 'All inactive already. Nothing to do unless IF Cares wants them deleted outright.'
);

// 2. The same name twice inside one site.
const dupes = await prisma.$queryRawUnsafe(`
  SELECT s.name AS site, st.name AS student, COUNT(*)::int AS times
  FROM regular_year."Student" st
  JOIN regular_year."Site" s ON s.id = st."siteId"
  GROUP BY s.name, LOWER(st.name), st.name
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, s.name
`);
add(
  'duplicate-students',
  'Students appearing more than once in the same site',
  dupes.length,
  dupes.map((d) => `${d.site}: ${d.student} x${d.times}`),
  'Keep one record each. The counts already filed stay attached to whichever row is kept.'
);

// 3. Birthdates that cannot be right.
const now = new Date();
const badBirthdates = await prisma.student.findMany({
  where: { OR: [{ birthdate: { gt: now } }, { birthdate: { lt: new Date('1990-01-01') } }] },
  select: { name: true, birthdate: true, site: { select: { name: true } } },
});
add(
  'impossible-birthdates',
  'Students with an impossible birthdate',
  badBirthdates.length,
  badBirthdates.map((s) => `${s.site.name}: ${s.name} — ${s.birthdate?.toISOString().slice(0, 10)}`),
  'Almost certainly typos. IF Cares confirms the right dates.'
);

// 4. The withdrawn-student convention.
const zz = await prisma.student.findMany({
  where: { name: { startsWith: 'ZZ' } },
  select: { name: true, active: true },
});
add(
  'zz-students',
  'Students whose name starts with "ZZ" (the withdrawn convention)',
  zz.length,
  [`${zz.filter((s) => s.active).length} still active, ${zz.filter((s) => !s.active).length} already inactive`],
  'Import them inactive under the clean name so the history survives and the daily roster stays short.'
);

// 5. One person, two accounts.
const users = await prisma.user.findMany({
  where: { active: true },
  select: { email: true, name: true, lastname: true },
});
// Two ways the same person ends up twice, and they catch different cases: the
// same name on two addresses, and the same mailbox on two domains
// (kenya@ifcares.com and kenya@ifcares.org, which is the one that started this
// list and which a name match misses when the two rows are spelled differently).
const byPerson = new Map();
const byLocalPart = new Map();
for (const u of users) {
  const name = `${u.name} ${u.lastname}`.trim().toLowerCase();
  if (name) {
    if (!byPerson.has(name)) byPerson.set(name, []);
    byPerson.get(name).push(u.email);
  }
  const local = u.email.split('@')[0]?.toLowerCase();
  if (local) {
    if (!byLocalPart.has(local)) byLocalPart.set(local, []);
    byLocalPart.get(local).push(u.email);
  }
}
const doubled = [
  ...[...byPerson.entries()]
    .filter(([, emails]) => emails.length > 1)
    .map(([person, emails]) => [`${person} (same name)`, emails]),
  ...[...byLocalPart.entries()]
    .filter(([, emails]) => emails.length > 1)
    .map(([local, emails]) => [`${local}@… (same mailbox, different domains)`, emails]),
];
add(
  'duplicate-accounts',
  'People with more than one active account',
  doubled.length,
  doubled.map(([person, emails]) => `${person}: ${emails.join(', ')}`),
  'Confirm which address is the real one. Notifications go to whichever is kept.'
);

// 6. Accounts that never set a password, which is what a test row looks like.
const noPassword = await prisma.user.findMany({
  where: { active: true, passwordHash: null },
  select: { email: true },
});
add(
  'accounts-without-password',
  'Active accounts that have never set a password',
  noPassword.length,
  noPassword.map((u) => u.email),
  'Either send them their link, or deactivate the ones that were only ever for testing.'
);

// 7. Sites that no claim can include, because a claim filters by state.
const stateless = await prisma.site.findMany({
  where: { active: true, state: '' },
  select: { name: true },
});
add(
  'sites-without-state',
  'Active sites with no state, which no state claim can include',
  stateless.length,
  stateless.map((s) => s.name),
  'Every real site needs TX or OK. A training-only site is the one acceptable exception.'
);

// 8. What the spreadsheets themselves could not add up.
let mismatches = [];
try {
  const dir = 'migration-data/history';
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const snap = JSON.parse(await readFile(`${dir}/${file}`, 'utf8'));
    for (const [tab, day] of Object.entries(snap.dates ?? {})) {
      const derived = { att: 0, brk: 0, lunch: 0, snk: 0, sup: 0 };
      for (const s of day.students ?? []) {
        if (s.att) derived.att++;
        if (s.brk) derived.brk++;
        if (s.lu) derived.lunch++;
        if (s.snk) derived.snk++;
        if (s.sup) derived.sup++;
      }
      const sameAs = (t) =>
        t && ['att', 'brk', 'lunch', 'snk', 'sup'].every((k) => Number(t[k] ?? 0) === derived[k]);
      if (!sameAs(day.totalsStandard) && !sameAs(day.totalsCooke)) {
        mismatches.push(`${snap.site} ${tab}: rows add up to ${JSON.stringify(derived)}, the sheet's own totals row says otherwise`);
      }
    }
  }
} catch {
  mismatches = ['(snapshots not available - run import-history first)'];
}
add(
  'sheet-totals-mismatch',
  "Days where the spreadsheet's own totals row disagrees with its rows",
  mismatches.length,
  mismatches,
  'The per-student rows were imported as they stand, which is the real record. IF Cares decides whether these days need revisiting.'
);

if (asJson) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2));
} else {
  console.log(`Data review for IF Cares — generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\n`);
  for (const f of findings) {
    const flag = f.count === 0 ? 'clear ' : 'REVIEW';
    console.log(`[${flag}] ${f.title}: ${f.count}`);
    if (f.count > 0) {
      for (const line of f.detail.slice(0, 12)) console.log(`           ${line}`);
      if (f.detail.length > 12) console.log(`           …and ${f.detail.length - 12} more`);
      console.log(`           → ${f.recommendation}`);
    }
    console.log('');
  }
  const open = findings.filter((f) => f.count > 0).length;
  console.log(`${open} of ${findings.length} categories need a decision from IF Cares.`);
}

await prisma.$disconnect();
