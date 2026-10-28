/**
 * Removes what the 2.0 testing left in the base before go-live (STOIC-2691).
 *
 *   node scripts/cleanup-test-data.mjs                     lists, writes the manifest, changes nothing
 *   node scripts/cleanup-test-data.mjs --rehearse <manifest>  does the whole deletion and rolls it back
 *   node scripts/cleanup-test-data.mjs --apply <manifest>  deletes exactly what that manifest lists
 *
 * Two steps on purpose: the list is reviewed by a person, and the deletion acts
 * on that reviewed list by id, never on a query re-run at deletion time (a
 * query re-run on another day matches other rows). Take a backup of the base
 * before --apply: nothing here can be undone.
 *
 * What is test data, as decided on the card:
 *   - every count filed in the 2.0 (source APP); the history import is GAS_IMPORT
 *     and is never touched, Training Only included (the site stays, its counts go);
 *   - the QA accounts (@example.org) and four accounts from the old system that
 *     were tests there too;
 *   - the test sites, with their students, calendar and requests;
 *   - every consolidated report built so far, with its file in Drive;
 *   - every count saved for later;
 *   - on the real sites, the students the tests added (named "ZZ QA ...") and
 *     every request filed on Training Only, the site the tests use.
 * The audit log is evidence and stays, pointing at rows that no longer exist.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile('.env');
} catch {
  // Prisma reads .env on its own; Drive is skipped below if it is not set up.
}

const LEGACY_TEST_EMAILS = ['123@123.com', 'julio@julio.com', 'test@123.com', 'juanchosperoni@hotmail.comm'];
const TEST_SITE_NAMES = ['Test Site', 'ZZ QA Sitio Vacio', 'ZZ QA Furioso Site'];
const TRAINING_SITE = 'Training Only';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const applyPath = args[0] === '--apply' || args[0] === '--rehearse' ? args[1] : null;
if ((args[0] === '--apply' || args[0] === '--rehearse') && !applyPath) {
  console.error(`${args[0]} needs the manifest the list step wrote. Nothing was done.`);
  process.exit(1);
}
const rehearse = args[0] === '--rehearse';

class Rehearsal extends Error {}

async function snapshot(db) {
  return {
    importedCounts: await db.mealCount.count({ where: { source: 'GAS_IMPORT' } }),
    importedEntries: await db.mealCountEntry.count({ where: { mealCount: { source: 'GAS_IMPORT' } } }),
    sites: await db.site.count(),
    users: await db.user.count(),
    students: await db.student.count(),
    auditLog: await db.auditLog.count(),
  };
}

async function buildManifest() {
  const counts = await prisma.mealCount.findMany({
    where: { source: 'APP' },
    select: { id: true, date: true, voidedAt: true, site: { select: { name: true } }, _count: { select: { entries: true } } },
    orderBy: [{ date: 'asc' }],
  });

  const users = await prisma.user.findMany({
    where: { OR: [{ email: { endsWith: '@example.org' } }, { email: { in: LEGACY_TEST_EMAILS } }] },
    select: { id: true, email: true, name: true, lastname: true, role: true },
    orderBy: { email: 'asc' },
  });

  const sites = await prisma.site.findMany({
    where: { OR: [{ name: { in: TEST_SITE_NAMES } }, { name: { startsWith: 'ZZ QA' } }] },
    select: {
      id: true,
      name: true,
      _count: { select: { students: true, serviceDays: true, requests: true, mealCounts: true } },
    },
  });

  const reports = await prisma.generatedReport.findMany({
    select: { id: true, fileName: true, storageKey: true, signedAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const drafts = await prisma.mealCountDraft.findMany({ select: { id: true, date: true, site: { select: { name: true } } } });
  const siteIds = sites.map((s) => s.id);
  const students = await prisma.student.findMany({
    where: { name: { startsWith: 'ZZ QA ' }, siteId: { notIn: siteIds } },
    select: { id: true, name: true, site: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  const requests = await prisma.request.findMany({
    where: { site: { name: TRAINING_SITE } },
    select: { id: true, type: true, requestedByEmail: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Deleting an account blanks it on whatever it touched. On the imported
  // history that would be worth knowing before, not after.
  const userIds = users.map((u) => u.id);
  const touchedImported = await prisma.mealCount.count({
    where: {
      source: 'GAS_IMPORT',
      OR: [{ submittedById: { in: userIds } }, { approvedById: { in: userIds } }, { voidedById: { in: userIds } }],
    },
  });

  return {
    builtAt: new Date().toISOString(),
    touchedImported,
    counts: counts.map((c) => ({
      id: c.id,
      site: c.site.name,
      date: c.date.toISOString().slice(0, 10),
      students: c._count.entries,
      voided: Boolean(c.voidedAt),
    })),
    users: users.map((u) => ({ id: u.id, email: u.email, name: `${u.name} ${u.lastname}`.trim(), role: u.role })),
    sites: sites.map((s) => ({ id: s.id, name: s.name, ...s._count })),
    reports: reports.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      storageKey: r.storageKey,
      signed: Boolean(r.signedAt),
    })),
    drafts: drafts.map((d) => ({ id: d.id, site: d.site.name, date: d.date.toISOString().slice(0, 10) })),
    students: students.map((st) => ({ id: st.id, name: st.name, site: st.site.name })),
    requests: requests.map((r) => ({
      id: r.id,
      type: r.type,
      by: r.requestedByEmail,
      date: r.createdAt.toISOString().slice(0, 10),
    })),
  };
}

function print(manifest) {
  console.log(`\nCounts filed in the 2.0 (${manifest.counts.length}):`);
  for (const c of manifest.counts) {
    console.log(`  ${c.date}  ${c.site}  ${c.students} students${c.voided ? '  (voided)' : ''}`);
  }
  console.log(`\nAccounts (${manifest.users.length}):`);
  for (const u of manifest.users) console.log(`  ${u.email}  ${u.name}  ${u.role}`);
  if (manifest.touchedImported) {
    console.log(`  WARNING: these accounts filed, approved or voided ${manifest.touchedImported} imported counts.`);
  }
  console.log(`\nSites, with everything in them (${manifest.sites.length}):`);
  for (const s of manifest.sites) {
    console.log(`  ${s.name}  ${s.students} students, ${s.serviceDays} service days, ${s.requests} requests`);
  }
  console.log(`\nConsolidated reports and their Drive files (${manifest.reports.length}):`);
  for (const r of manifest.reports) console.log(`  ${r.fileName}${r.signed ? '  (signed)' : ''}`);
  console.log(`\nCounts saved for later (${manifest.drafts.length}):`);
  for (const d of manifest.drafts) console.log(`  ${d.date}  ${d.site}`);
  console.log(`
Test students on real sites (${manifest.students.length}):`);
  for (const st of manifest.students) console.log(`  ${st.site}  ${st.name}`);
  console.log(`
Requests on ${TRAINING_SITE} (${manifest.requests.length}):`);
  for (const r of manifest.requests) console.log(`  ${r.date}  ${r.type}  ${r.by}`);
}

async function apply(manifest) {
  const countIds = manifest.counts.map((c) => c.id);
  const siteIds = manifest.sites.map((s) => s.id);

  // Guards re-checked against the base as it is now, not as it was listed.
  const imported = await prisma.mealCount.count({ where: { id: { in: countIds }, source: 'GAS_IMPORT' } });
  if (imported) throw new Error(`${imported} of the listed counts come from the history import. Nothing was deleted.`);
  const siteImported = await prisma.mealCount.count({ where: { siteId: { in: siteIds }, source: 'GAS_IMPORT' } });
  if (siteImported) throw new Error(`A listed site holds ${siteImported} imported counts. Nothing was deleted.`);
  const unlisted = await prisma.mealCount.count({ where: { siteId: { in: siteIds }, id: { notIn: countIds } } });
  if (unlisted) throw new Error(`A listed site has ${unlisted} counts filed after the list was made. List again.`);
  // Manifests written before these two lists existed delete neither.
  const studentIds = (manifest.students ?? []).map((st) => st.id);
  const requestIds = (manifest.requests ?? []).map((r) => r.id);
  const studentImported = await prisma.mealCountEntry.count({
    where: { studentId: { in: studentIds }, mealCount: { source: 'GAS_IMPORT' } },
  });
  if (studentImported) throw new Error(`A listed student is on ${studentImported} imported count rows. Nothing was deleted.`);

  const before = await snapshot(prisma);

  // The check runs inside the transaction, so a deletion that fails it never
  // happens at all.
  let result;
  let after;
  try {
    await prisma.$transaction(
      async (tx) => {
        result = {
          // All of them, listed or not: nobody takes real counts in the 2.0
          // before go-live, so any count saved for later is a test.
          drafts: (await tx.mealCountDraft.deleteMany({})).count,
          counts: (await tx.mealCount.deleteMany({ where: { id: { in: countIds } } })).count,
          students: (await tx.student.deleteMany({ where: { OR: [{ siteId: { in: siteIds } }, { id: { in: studentIds } }] } }))
            .count,
          serviceDays: (await tx.serviceDay.deleteMany({ where: { siteId: { in: siteIds } } })).count,
          requests: (await tx.request.deleteMany({ where: { OR: [{ siteId: { in: siteIds } }, { id: { in: requestIds } }] } }))
            .count,
          sites: (await tx.site.deleteMany({ where: { id: { in: siteIds } } })).count,
          reports: (await tx.generatedReport.deleteMany({ where: { id: { in: manifest.reports.map((r) => r.id) } } }))
            .count,
          users: (await tx.user.deleteMany({ where: { id: { in: manifest.users.map((u) => u.id) } } })).count,
        };
        after = await snapshot(tx);

        const problems = [];
        if (after.importedCounts !== before.importedCounts) problems.push('imported counts changed');
        if (after.importedEntries !== before.importedEntries) problems.push('imported count rows changed');
        if (after.sites !== before.sites - result.sites) problems.push('more sites went than listed');
        if (after.users !== before.users - result.users) problems.push('more accounts went than listed');
        if (after.auditLog < before.auditLog) problems.push('audit log rows went');
        if (result.counts !== countIds.length) problems.push('some listed counts were already gone');
        console.log('Deleted:', result);
        console.log('Before:', before);
        console.log('After: ', after);
        if (problems.length) throw new Error(`CHECK FAILED, nothing was deleted: ${problems.join(', ')}`);
        if (rehearse) throw new Rehearsal();
      },
      { timeout: 60_000 }
    );
  } catch (error) {
    if (!(error instanceof Rehearsal)) throw error;
    console.log('Rehearsal passed and was rolled back. Nothing was deleted.');
    return;
  }
  console.log(`Check passed: the ${after.importedCounts} imported counts and their rows are all still there.`);

  // The files go after the rows: a file left behind is tidied by hand, a row
  // pointing at a trashed file is a claim that no longer opens. A file another
  // remaining report still uses is left alone.
  const drive = await import('../src/lib/google-drive.js');
  if (drive.driveConfigured()) {
    for (const report of manifest.reports) {
      if (!report.storageKey) continue;
      const stillUsed = await prisma.generatedReport.count({ where: { storageKey: report.storageKey } });
      if (stillUsed) continue;
      try {
        await drive.trashFile(report.storageKey);
        console.log(`Trashed in Drive: ${report.fileName}`);
      } catch (error) {
        console.warn(`Could not trash ${report.fileName}: ${error.message}`);
      }
    }
  } else {
    console.warn('Drive is not configured here: the report files were left in Drive.');
  }

}

try {
  if (applyPath) {
    await apply(JSON.parse(readFileSync(applyPath, 'utf8')));
  } else {
    const manifest = await buildManifest();
    print(manifest);
    const out = args[0] === '--out' ? args[1] : 'cleanup-manifest.json';
    writeFileSync(out, JSON.stringify(manifest, null, 2));
    console.log(`\nManifest written to ${out}. Nothing was changed.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
