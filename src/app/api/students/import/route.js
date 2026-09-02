import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { requireUser, requireSiteAccess } from '@/lib/auth';
import { ymdToUtcDate, ageFromBirthdate } from '@/lib/dates';
import { logAudit } from '@/lib/audit';
import { nextRosterNumber } from '@/lib/roster';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// STOIC-2200: loading a roster one student at a time is fine for a correction
// and unusable for a new site with two hundred names. This takes the whole list
// at once.
//
// The rule that matters is in the card: a bad row must not sink the import. Every
// row is judged on its own and comes back with a reason, so the answer to a
// messy spreadsheet is "these four lines need attention", not "it failed".
//
// `dryRun` is what the screen uses first: an admin sees exactly what would
// happen - added, brought back, skipped and why - before anything is written.

// A roster is a few hundred names. The cap is there so a pasted wrong file
// cannot turn into a transaction that runs for a minute.
const MAX_ROWS = 1000;

const rowSchema = z.object({
  name: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().replace(/\s{2,}/g, ' ') : v),
    z.string().min(1, 'Needs a name.').max(120, 'That name is too long.')
  ),
  age: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int('Age has to be a whole number.').min(0, 'Age cannot be negative.').max(120, 'That age is not plausible.').optional()
  ),
  birthdate: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Birthdate has to be YYYY-MM-DD.').optional()
  ),
});

const importSchema = z.object({
  site: z.string().min(1, 'Please select a Site.'),
  dryRun: z.boolean().default(false),
  rows: z.array(z.unknown()).min(1, 'The file has no rows.').max(MAX_ROWS, `More than ${MAX_ROWS} rows in one import.`),
});

export const POST = handle(async (req) => {
  const session = await requireUser();
  const body = importSchema.parse(await readJsonBody(req));

  const site = await prisma.site.findUnique({ where: { name: body.site } });
  if (!site || !site.active) throw new ApiError(422, 'Site not found.');
  await requireSiteAccess(session, site.name);

  const existing = await prisma.student.findMany({
    where: { siteId: site.id },
    select: { id: true, name: true, active: true },
  });
  const byName = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s]));

  const accepted = [];
  const skipped = [];
  // A name repeated inside the file itself is the most common mistake in a
  // pasted roster, and the least obvious once it is in.
  const seenInFile = new Map();

  body.rows.forEach((raw, index) => {
    const line = index + 1;
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      skipped.push({
        line,
        name: typeof raw?.name === 'string' ? raw.name : '',
        reason: issue?.message ?? 'That row could not be read.',
      });
      return;
    }

    const row = parsed.data;
    if (row.age === undefined && !row.birthdate) {
      skipped.push({ line, name: row.name, reason: 'Needs an age or a birthdate.' });
      return;
    }

    const key = row.name.toLowerCase();
    if (seenInFile.has(key)) {
      skipped.push({ line, name: row.name, reason: `Repeated in the file, first at line ${seenInFile.get(key)}.` });
      return;
    }
    seenInFile.set(key, line);

    const already = byName.get(key);
    if (already?.active) {
      skipped.push({ line, name: row.name, reason: 'Already on the roster.' });
      return;
    }

    accepted.push({ line, row, revives: already ?? null });
  });

  const summary = {
    total: body.rows.length,
    toAdd: accepted.filter((a) => !a.revives).length,
    toRevive: accepted.filter((a) => a.revives).length,
    skipped,
  };

  if (body.dryRun) {
    return legacyJson({ result: 'success', data: { ...summary, dryRun: true } });
  }

  let added = 0;
  let revived = 0;

  // Sequential on purpose: roster numbers come from a running maximum, and a
  // parallel insert would hand two students the same one.
  for (const item of accepted) {
    const birthdate = item.row.birthdate ? ymdToUtcDate(item.row.birthdate) : null;
    const age = item.row.age ?? (birthdate ? ageFromBirthdate(birthdate) : null);
    try {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$transaction(async (tx) => {
        const number = await nextRosterNumber(tx, site.id);
        if (item.revives) {
          await tx.student.update({
            where: { id: item.revives.id },
            data: { active: true, age, birthdate, number },
          });
        } else {
          await tx.student.create({
            data: { name: item.row.name, age, birthdate, number, siteId: site.id },
          });
        }
      });
      if (item.revives) revived += 1;
      else added += 1;
    } catch (error) {
      // One row failing is a row, not the import.
      skipped.push({
        line: item.line,
        name: item.row.name,
        reason: error?.code === 'P2002' ? 'A student with that name is already there.' : 'Could not be saved.',
      });
    }
  }

  await logAudit({
    actor: session.user,
    action: 'student.import',
    entity: 'site',
    entityId: site.id,
    payload: { site: site.name, added, revived, skipped: skipped.length, total: body.rows.length },
  });

  return legacyJson({
    result: 'success',
    data: { total: body.rows.length, added, revived, skipped, dryRun: false },
  });
});
