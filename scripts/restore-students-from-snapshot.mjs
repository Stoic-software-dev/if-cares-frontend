// Restores the roster from a saved `GET /api/students` response.
//
// Written on 3-sep-2026, when the database was dropped and the frozen Apps
// Script - the other source of rosters - had degraded to answering about half
// its calls, which turned `import-from-gas --only=students` into a run that
// could not finish. A response captured minutes before the loss is both faster
// and MORE faithful than the spreadsheets: it is the live state, so it includes
// students added through the app after the cutover, which the sheets never saw.
//
//   node scripts/restore-students-from-snapshot.mjs <file.json> [--dry-run]
//
// The snapshot shape is the legacy roster row:
//   { id, name, age, site, spreadsheetId, birthdate }
//
// `Student.number` is not in it and does not need to be: the roster endpoint
// renumbers alphabetically on read, and history is linked by name. Numbers are
// assigned here in that same alphabetical order so the stored value agrees with
// what every screen shows.
//
// Idempotent: upserts on the student id the snapshot carries, which is the id
// the original import assigned, so meal count entries keep pointing at the same
// person.

import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile();
} catch {
  // .env optional
}

const [file, ...rest] = process.argv.slice(2);
const DRY = rest.includes('--dry-run');

if (!file) {
  console.error('Usage: node scripts/restore-students-from-snapshot.mjs <file.json> [--dry-run]');
  process.exit(1);
}

const prisma = new PrismaClient();
const warnings = [];
const warn = (message) => {
  warnings.push(message);
  console.warn(`  ⚠ ${message}`);
};

const ymdToUtcDate = (ymd) =>
  /^(19|20)\d{2}-\d{2}-\d{2}$/.test(ymd ?? '') ? new Date(`${ymd}T00:00:00.000Z`) : null;

async function main() {
  const rows = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('That file is not a roster snapshot.');
  console.log(`Restoring ${rows.length} students from ${file}${DRY ? ' (DRY RUN)' : ''}`);

  const sites = await prisma.site.findMany({ select: { id: true, name: true } });
  const siteIdByName = new Map(sites.map((site) => [site.name, site.id]));

  // Grouped per site so the positional number matches the alphabetical order the
  // roster endpoint produces.
  const bySite = new Map();
  for (const row of rows) {
    const siteId = siteIdByName.get(row.site);
    if (!siteId) {
      warn(`unknown site "${row.site}" — ${row.name} skipped`);
      continue;
    }
    if (!bySite.has(siteId)) bySite.set(siteId, []);
    bySite.get(siteId).push(row);
  }

  let written = 0;
  for (const [siteId, roster] of bySite) {
    roster.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    for (const [index, row] of roster.entries()) {
      const age = row.age === '' || row.age === null || row.age === undefined ? null : Number(row.age);
      const data = {
        name: String(row.name).trim(),
        age: Number.isFinite(age) ? age : null,
        birthdate: ymdToUtcDate(row.birthdate),
        number: index + 1,
        siteId,
        active: true,
      };
      if (!DRY) {
        await prisma.student.upsert({
          where: { id: String(row.id) },
          create: { id: String(row.id), ...data },
          update: data,
        });
      }
      written += 1;
    }
  }

  console.log(`  students restored: ${written} across ${bySite.size} sites`);
  console.log(`\nDone. ${warnings.length} warning(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
