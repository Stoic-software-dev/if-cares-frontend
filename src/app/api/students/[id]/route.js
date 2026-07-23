import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacySuccess, ApiError } from '@/lib/http';
import { requireUser, requireSiteAccess } from '@/lib/auth';
import { editStudentSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { nextRosterNumber } from '@/lib/roster';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function findStudentOr404(id) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: { site: true },
  });
  if (!student) throw new ApiError(404, 'Student not found.');
  return student;
}

export const PATCH = handle(async (req, { params }) => {
  const session = await requireUser();
  const student = await findStudentOr404(params.id);
  await requireSiteAccess(session, student.site.name);

  const body = editStudentSchema.parse(await readJsonBody(req));

  let targetSite = student.site;
  if (body.site !== student.site.name) {
    const found = await prisma.site.findUnique({ where: { name: body.site } });
    if (!found || !found.active) throw new ApiError(422, 'Site not found.');
    await requireSiteAccess(session, found.name);
    targetSite = found;
  }

  const clash = await prisma.student.findFirst({
    where: {
      siteId: targetSite.id,
      name: { equals: body.name, mode: 'insensitive' },
      id: { not: student.id },
    },
    select: { id: true },
  });
  if (clash) throw new ApiError(409, 'Full name must be unique');

  await prisma.$transaction(async (tx) => {
    const data = { name: body.name, age: body.age ?? null };
    if (targetSite.id !== student.siteId) {
      data.siteId = targetSite.id;
      data.number = await nextRosterNumber(tx, targetSite.id); // renumbered in the new site
    }
    await tx.student.update({ where: { id: student.id }, data });
  });

  await logAudit({
    actor: session.user,
    action: 'student.update',
    entity: 'student',
    entityId: student.id,
    payload: {
      before: { name: student.name, age: student.age, site: student.site.name },
      after: { name: body.name, age: body.age ?? null, site: targetSite.name },
    },
  });
  return legacySuccess();
});

export const DELETE = handle(async (req, { params }) => {
  const session = await requireUser();
  const student = await findStudentOr404(params.id);
  await requireSiteAccess(session, student.site.name);

  // Hard delete, matching legacy behavior; meal-count history keeps its snapshot
  // rows (MealCountEntry.studentId is set to null by the FK).
  await prisma.student.delete({ where: { id: student.id } });

  await logAudit({
    actor: session.user,
    action: 'student.delete',
    entity: 'student',
    entityId: student.id,
    payload: { name: student.name, site: student.site.name },
  });
  return legacySuccess();
});
