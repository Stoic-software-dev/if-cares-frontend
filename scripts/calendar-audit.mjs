import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { patternFromServed, MIN_DAYS as DEFAULT_MIN_DAYS } from '../src/lib/served-pattern.mjs';
import { generateServiceDays } from '../src/lib/site-calendar.js';
import { ymdToUtcDate } from '../src/lib/dates.js';

// Can every site file a count tomorrow?
//
// The old system published service days one at a time, at 7:45 each morning,
// from the master's `All Meals` tab. The import could only ever capture the two
// or three days that tab happened to hold, so the calendar the app inherited
// stops almost immediately. Filing a count needs a ServiceDay row - without one
// the API answers "This date is not available for meal counts" - so a site with
// an empty calendar cannot work at all the morning after the Sheets are frozen.
//
// Without --fill nothing here writes. It reports which sites are empty ahead and proposes the
// weekly pattern each one actually served, so filling the calendar in is a
// review rather than a guess. Exits 1 when a site would be unable to file, so it
// can gate the cutover the way db:reconcile does.
//
// The pattern is read from the counts, not from the ServiceDay flags: 89% of the
// imported days carry all four meals as false, because the flags did not survive
// the export. What each site really served is in the 369,000 student rows that
// did.
//
// --fill writes what it proposes, for the sites that have no day ahead and do
// have a pattern:
//
//   node scripts/calendar-audit.mjs --since=2026-08-01 --min-days=2 --fill --from=2026-10-27 --to=2026-12-18
//
// --since reads the pattern from that date on instead of the last year, so a
// site that changed its days this cycle is described by this cycle. The site
// keeps a template it already has, and its program cycle is set only where it
// is empty or ends sooner, so the calendar screen's "Generate missing days"
// keeps working from there. Days are only added, never removed or rewritten:
// running it twice adds nothing the second time.

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const argValue = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || null;
const FILL = args.includes('--fill');
const SINCE = argValue('since');
const FROM = argValue('from');
const TO = argValue('to');
// How many times a weekday has to show up to count as a habit. Three fits a
// year of history; with a month or two, a site that opens every Monday may show
// only two, and a missing day blocks filing while an extra one only shows as
// pending. So a short --since wants a lower bar.
const MIN_DAYS = argValue('min-days') === null ? DEFAULT_MIN_DAYS : Number(argValue('min-days'));
if (!Number.isInteger(MIN_DAYS) || MIN_DAYS < 1) {
  console.error('--min-days takes a whole number, 1 or more.');
  process.exit(1);
}
const YMD = /^\d{4}-\d{2}-\d{2}$/;
if ([SINCE, FROM, TO].some((v) => v && !YMD.test(v)) || (FILL && (!FROM || !TO || FROM > TO))) {
  console.error('Dates go as YYYY-MM-DD, and --fill needs --from and --to, in that order.');
  process.exit(1);
}

const LABEL = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MEALS = ['brk', 'lunch', 'snk', 'sup'];
const SHORT = { brk: 'B', lunch: 'L', snk: 'S', sup: 'P' };

// A full school year back, so a site that only runs a term is still described by
// the term it ran.
const LOOKBACK_DAYS = 400;

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

// Only sites that cannot file and have a pattern to fill from: a site that
// already has days ahead was set up by someone, and one without history is a
// question for IF Cares, not a guess.
async function fill(sites, ahead, patterns) {
  const from = ymdToUtcDate(FROM);
  const to = ymdToUtcDate(TO);
  console.log(`Llenando el calendario del ${FROM} al ${TO}:`);
  let filledSites = 0;
  let addedDays = 0;

  for (const site of sites) {
    if ((ahead.get(site.id) ?? 0) > 0) continue;
    const configured = Object.keys(site.weeklyTemplate ?? {}).length > 0;
    const template = configured ? site.weeklyTemplate : patterns.get(site.id);
    if (!template) continue;

    // A site whose cycle starts later than --from opens when its cycle says.
    const start = site.programStart && site.programStart > from ? site.programStart : from;
    const wanted = generateServiceDays({ programStart: start, programEnd: to, weeklyTemplate: template });
    const existing = await prisma.serviceDay.findMany({
      where: { siteId: site.id, date: { gte: start, lte: to } },
      select: { date: true },
    });
    const have = new Set(existing.map((day) => day.date.toISOString().slice(0, 10)));
    const missing = wanted.filter((day) => !have.has(day.date));

    await prisma.$transaction([
      prisma.site.update({
        where: { id: site.id },
        data: {
          ...(configured ? {} : { weeklyTemplate: template }),
          ...(site.programStart ? {} : { programStart: from }),
          ...(site.programEnd && site.programEnd >= to ? {} : { programEnd: to }),
        },
      }),
      prisma.serviceDay.createMany({
        data: missing.map((day) => ({
          siteId: site.id,
          date: ymdToUtcDate(day.date),
          brk: day.brk,
          lunch: day.lunch,
          snk: day.snk,
          sup: day.sup,
        })),
        skipDuplicates: true,
      }),
    ]);
    filledSites++;
    addedDays += missing.length;
    console.log(`  ${site.name.slice(0, 45).padEnd(46)}+${missing.length} días  ${describe(template)}`);
  }
  console.log(`${filledSites} sitios, ${addedDays} días agregados.\n`);
}

async function main() {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  let since = new Date(today);
  since.setUTCDate(since.getUTCDate() - LOOKBACK_DAYS);
  if (SINCE) since = ymdToUtcDate(SINCE);

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

  const rowsBySite = new Map();
  for (const row of served) {
    if (!rowsBySite.has(row.site_id)) rowsBySite.set(row.site_id, []);
    rowsBySite.get(row.site_id).push(row);
  }
  const patterns = new Map();
  for (const [siteId, rows] of rowsBySite) {
    const template = patternFromServed(rows, { minDays: MIN_DAYS });
    if (Object.keys(template).length) patterns.set(siteId, template);
  }

  if (FILL) {
    await fill(sites, ahead, patterns);
    ahead.clear();
    for (const row of await prisma.serviceDay.groupBy({
      by: ['siteId'],
      where: { date: { gte: today } },
      _count: { _all: true },
    })) {
      ahead.set(row.siteId, row._count._all);
    }
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

  if (SINCE) console.log(`\nPatrón leído de los counts desde ${SINCE}.`);
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
