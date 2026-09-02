// Waits for the cron container's probe to land in the database. That row can
// only exist if the container ran curl, reached the internet, and the app
// accepted the POST - which is the whole chain the cron depends on.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const started = Date.now();

while (Date.now() - started < 4 * 60 * 1000) {
  const hit = await prisma.clientError.findFirst({
    where: { message: { contains: 'cron connectivity probe' } },
    select: { id: true, message: true, firstSeenAt: true, lastSeenAt: true, count: true, userAgent: true },
  });
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  if (hit) {
    console.log(`[${mins}m] PROBE LANDED`);
    console.log(JSON.stringify(hit, null, 2));
    break;
  }
  console.log(`[${mins}m] not yet...`);
  await new Promise((r) => setTimeout(r, 15000));
}
await prisma.$disconnect();
