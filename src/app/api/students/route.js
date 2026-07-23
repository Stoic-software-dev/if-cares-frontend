import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, legacySuccess, ApiError } from '@/lib/http';
import { requireUser, requireSiteAccess } from '@/lib/auth';
import { toLegacyStudent } from '@/lib/legacy';
import { addStudentSchema, normalizeAddStudentBody } from '@/lib/validation';
import { ymdToUtcDate, ageFromBirthdate } from '@/lib/dates';
import { logAudit } from '@/lib/audit';
import { nextRosterNumber } from '@/lib/roster';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy `?type=students`: RAW array of roster rows, scoped to the user.
export const GET = handle(async () => {
  const session = await requireUser();
  const where =
    session.user.role === 'ADMIN' || session.user.allSites
      ? { site: { active: true } }
      : { siteId: { in: (session.user.sites || []).map((us) => us.siteId) } };

  const students = await prisma.student.findMany({
    where,
    include: { site: true },
    orderBy: [{ site: { name: 'asc' } }, { number: 'asc' }],
  });
  return legacyJson(students.map(toLegacyStudent));
});

async function assertNameUnique(siteId, name, excludeId) {
  const clash = await prisma.student.findFirst({
    where: {
      siteId,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new ApiError(409, 'Full name must be unique');
}

// Accepts both the legacy {actionType:'add', values:[name, age, site, birthdate]}
// body and a clean {name, age, birthdate, site} object.
export const POST = handle(async (req) => {
  const session = await requireUser();
  const body = addStudentSchema.parse(normalizeAddStudentBody(await readJsonBody(req)));

  const site = await prisma.site.findUnique({ where: { name: body.site } });
  if (!site || !site.active) throw new ApiError(422, 'Site not found.');
  await requireSiteAccess(session, site.name);

  await assertNameUnique(site.id, body.name);

  const birthdate = body.birthdate ? ymdToUtcDate(body.birthdate) : null;
  const age = body.age ?? (birthdate ? ageFromBirthdate(birthdate) : null);

  let student;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      student = await prisma.$transaction(async (tx) => {
        const number = await nextRosterNumber(tx, site.id);
        return tx.student.create({
          data: { name: body.name, age, birthdate, number, siteId: site.id },
        });
      });
      break;
    } catch (error) {
      // Retry once if a concurrent insert grabbed the same roster number
      if (error?.code === 'P2002' && attempt === 0) continue;
      if (error?.code === 'P2002') throw new ApiError(409, 'Full name must be unique');
      throw error;
    }
  }

  await logAudit({
    actor: session.user,
    action: 'student.create',
    entity: 'student',
    entityId: student.id,
    payload: { name: student.name, site: site.name },
  });
  return legacySuccess();
});
