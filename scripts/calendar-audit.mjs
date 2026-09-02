import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Can every site file a count tomorrow?
//
// The old system published service days one at a time, at 7:45 each morning,
// from the master's `All Meals` tab. The import could only ever capture the two
// or three days that tab happened to hold, so the calendar the app inherited
// stops almost immediately. Filing a count needs a ServiceDay row - without one
// the API answers "This date is not available for meal counts" - so a site with
// an empty calendar cannot work at all the morning after the Sheets are frozen.
//
// Nothing here writes. It reports which sites are empty ahead and proposes the
// weekly pattern each one actually served, so filling the calendar in is a
// review rather than a guess. Exits 1 when a site would be unable to file, so it
// can gate the cutover the way db:reconcile does.
//
// The pattern is read from the counts, not from the ServiceDay flags: 89% of the
// imported days carry all four meals as false, because the flags did not survive
// the export. What each site really served is in the 369,000 student rows that
// did.

const prisma = new PrismaClient();

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const LABEL = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MEALS = ['brk', 'lunch', 'snk', 'sup'];
const SHORT = { brk: 'B', lunch: 'L', snk: 'S', sup: 'P' };

// A full school year back, so a site that only runs a term is still described by
// the term it ran.
const LOOKBACK_DAYS = 400;
// A weekday seen fewer times than this in a year is an exception, not a habit.
const MIN_DAYS = 3;

const pad = (value, width) => String(value).padEnd(width);

function describe(template) {
  const parts = [];
  for (const key of ORDER) {
    const meals = template[key];
    if (!meals) continue;
    parts.push(`${LABEL[key]} ${MEALS.filter((meal) => meals[meal]).map((meal) => SHORT[meal]).join('')}`);
  }
  return parts.join(', ');
}

async function main() {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - LOOKBACK_DAYS);

  const sites = await prisma.site.findMany({
    where: { active: true },
    select: { id: true, name: true, state: true, programStart: true, programEnd: true, weeklyTemplate: true },
    orderBy: { name: 'asc' },
  });

  const ahead = new Map();
  for (const row of await prisma.serviceDay.groupBy({
    by: ['siteId'],
    where: { date: { gte: today } },
    _count: { _all: true },
  })) {
    ahead.set(row.siteId, row._count._all);
  }

  // One pass over the real counts: per site and weekday, on how many days each
  // meal was actually served to at least one student.
  const served = await prisma.$queryRaw`
    select c."siteId"                                                   as site_id,
           extract(dow from c."date")::int                              as dow,
           count(distinct c.id)::int                                    as days,
           count(distinct case when e.breakfast then c.id end)::int     as brk,
           count(distinct case when e.lunch     then c.id end)::int     as lunch,
           count(distinct case when e.snack     then c.id end)::int     as snk,
           count(distinct case when e.supper    then c.id end)::int     as sup
      from regular_year."MealCount" c
      join regular_year."MealCountEntry" e on e."mealCountId" = c.id
     where c."voidedAt" is null
       and c."date" >= ${since}
     group by 1, 2
  `;

  const patterns = new Map();
  for (const row of served) {
    const key = WEEKDAYS[row.dow];
    if (row.days < MIN_DAYS) continue;
    const meals = {};
    let serves = false;
    for (const meal of MEALS) {
      // Served on more than half the days this site opened on this weekday.
      meals[meal] = row[meal] > row.days / 2;
      if (meals[meal]) serves = true;
    }
    if (!serves) continue;
    const template = patterns.get(row.site_id) ?? {};
    template[key] = meals;
    patterns.set(row.site_id, template);
  }

  const report = sites.map((site) => ({
    site,
    ahead: ahead.get(site.id) ?? 0,
    template: patterns.get(site.id) ?? {},
    configured: Object.keys(site.weeklyTemplate ?? {}).length > 0,
    hasCycle: Boolean(site.programStart && site.programEnd),
  }));

  const blocked = report.filter((row) => row.ahead === 0);
  const noPattern = blocked.filter((row) => Object.keys(row.template).length === 0);

  console.log(`Sitios activos: ${report.length}`);
  console.log(`  Con días de servicio por delante : ${report.length - blocked.length}`);
  console.log(`  SIN un solo día por delante      : ${blocked.length}`);
  console.log(`  Con ciclo de programa cargado    : ${report.filter((row) => row.hasCycle).length}`);
  console.log(`  Con plantilla semanal cargada    : ${report.filter((row) => row.configured).length}`);
  console.log(`  Total de días por delante        : ${report.reduce((a, row) => a + row.ahead, 0)}`);

  console.log(`\n${pad('Sitio', 46)}${pad('St', 4)}${pad('Adel.', 7)}Lo que ese sitio ya venía sirviendo`);
  console.log('-'.repeat(120));
  for (const row of report) {
    console.log(
      pad(row.site.name.slice(0, 45), 46) +
        pad(row.site.state || '--', 4) +
        pad(row.ahead, 7) +
        (describe(row.template) || '(sin historia reciente)')
    );
  }

  console.log('\nB desayuno, L almuerzo, S merienda, P cena. Leído de los counts reales de');
  console.log(`cada sitio en los últimos ${LOOKBACK_DAYS} días: una comida entra cuando se sirvió`);
  console.log('en más de la mitad de los días que el sitio abrió ese día de la semana.');

  if (noPattern.length) {
    console.log(
      `\n${noPattern.length} sitios sin días por delante tampoco tienen historia reciente de la` +
        ' que deducir un patrón. Esos hay que cargarlos a mano o preguntarle a IF Cares:'
    );
    for (const row of noPattern) console.log(`  - ${row.site.name}`);
  }

  if (blocked.length) {
    console.log(
      `\nFALLA: ${blocked.length} de ${report.length} sitios no podrían cargar un count mañana.` +
        '\nSe completa en Service calendar, o desde la ficha del sitio cargando el ciclo del' +
        '\nprograma y la plantilla semanal y usando "Generate missing days".'
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nOK: todos los sitios activos tienen al menos un día de servicio por delante.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
