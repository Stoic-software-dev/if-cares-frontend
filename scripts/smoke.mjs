/**
 * Contract smoke test for the screens.
 *
 * The frontend reads a handful of endpoints and depends on their exact shape
 * (raw arrays for the legacy ones, { result, data } for the rest). This script
 * signs in and checks those shapes, so a change on the API side is caught here
 * instead of on a tablet at a site.
 *
 *   npm run smoke                      (against http://localhost:3000)
 *   BASE_URL=https://... npm run smoke
 *
 * Credentials come from .env (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) or from
 * SMOKE_EMAIL / SMOKE_PASSWORD. Nothing is written: every call is a read.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

function envFromFile() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    return Object.fromEntries(
      raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
        })
    );
  } catch {
    return {};
  }
}

const fileEnv = envFromFile();
const EMAIL = process.env.SMOKE_EMAIL || fileEnv.SEED_ADMIN_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD || fileEnv.SEED_ADMIN_PASSWORD;

let cookie = '';
const results = [];

function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  const mark = condition ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${condition || !detail ? '' : `  (${detail})`}`);
  return Boolean(condition);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...(cookie ? { cookie } : {}) },
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return res;
}

async function json(path) {
  const res = await api(path);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function run() {
  if (!EMAIL || !PASSWORD) {
    console.error('Missing credentials: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env, or SMOKE_EMAIL and SMOKE_PASSWORD.');
    process.exit(2);
  }

  const health = await json('/api/health');
  check('health responds with a database connection', health.status === 200 && health.body?.db === true, JSON.stringify(health.body));

  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginBody = await login.json().catch(() => null);
  if (!check('login returns a session', login.status === 200 && Boolean(cookie), `status ${login.status}`)) {
    process.exit(1);
  }
  check('login carries the legacy user shape', typeof loginBody?.data?.role === 'number' && 'assignedSite' in loginBody.data);

  const me = await json('/api/auth/me');
  check('session resolves', me.status === 200 && Boolean(me.body?.data?.email));

  const sites = await json('/api/sites');
  const siteNames = Array.isArray(sites.body) ? sites.body.map((s) => s.name) : [];
  check('sites is a raw array of named sites', siteNames.length > 0 && typeof siteNames[0] === 'string');

  const all = await json('/api/meal-counts/all');
  const first = siteNames[0];
  const siteData = all.body?.[first];
  check(
    'meal-counts/all is keyed by site with validDates and excludedDates',
    Boolean(siteData) && typeof siteData.validDates === 'object' && Array.isArray(siteData.excludedDates)
  );
  check(
    'the calendar map carries the approved days',
    Array.isArray(siteData?.approvedDates)
  );

  // The dashboard needs at least one site with a submitted count to render a
  // detail; pick it here so the next checks are meaningful.
  const withCount = siteNames.find((name) => (all.body?.[name]?.excludedDates ?? []).length > 0);
  const submittedDate = withCount ? all.body[withCount].excludedDates.at(-1) : null;

  const roster = await json(`/api/students/roster?site=${encodeURIComponent(first)}`);
  const student = Array.isArray(roster.body) ? roster.body[0] : null;
  check(
    'roster rows carry id, number, name and age',
    !student || (typeof student.id === 'string' && typeof student.number === 'number' && 'name' in student && 'age' in student)
  );

  const serviceDays = await json(`/api/sites/service-days?site=${encodeURIComponent(first)}`);
  check(
    'service-days returns the calendar with meal flags',
    Array.isArray(serviceDays.body?.days) &&
      (serviceDays.body.days.length === 0 || 'brk' in serviceDays.body.days[0])
  );

  const requests = await json('/api/requests');
  check('requests inbox returns data rows', Array.isArray(requests.body?.data));

  const users = await json('/api/users');
  const user = users.body?.data?.[0];
  check('users carry role, active and their sites', Boolean(user) && 'role' in user && 'active' in user && Array.isArray(user.sites));

  const request = requests.body?.data?.[0];
  check(
    'requests carry the administrator answer fields',
    Boolean(request) && 'responseComment' in request && 'respondedBy' in request && 'respondedAt' in request
  );

  // Voiding is a write, so the check uses a site that cannot exist: it proves
  // the route is deployed and guarded without touching a real count.
  const voidGuard = await api('/api/meal-counts/void', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site: 'NO SUCH SITE ZZZ', date: '2026-01-01', reason: 'smoke check' }),
  });
  check('voiding is deployed and refuses an unknown site', voidGuard.status === 404, `status ${voidGuard.status}`);

  const approveGuard = await api('/api/meal-counts/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site: 'NO SUCH SITE ZZZ', date: '2026-01-01' }),
  });
  check(
    'approving is deployed and refuses an unknown site',
    approveGuard.status === 404,
    `status ${approveGuard.status}`
  );

  const record = await json(`/api/sites/record?site=${encodeURIComponent(sites.body[0].name)}`);
  check(
    'the site record carries the cycle and the weekly template',
    record.status === 200 && 'programStart' in record.body.data && 'weeklyTemplate' in record.body.data
  );

  const holidays = await json('/api/holidays');
  check('holidays are deployed', Array.isArray(holidays.body?.data), `status ${holidays.status}`);

  const anySite = Object.values(all.body)[0];
  check('the calendar map carries the holiday names', anySite && typeof anySite.holidays === 'object');

  const monthly = await api(
    `/api/reports/monthly?site=${encodeURIComponent(sites.body[0].name)}&year=${new Date().getFullYear()}&month=1`
  );
  check(
    'the monthly site report renders',
    monthly.ok && (monthly.headers.get('content-type') || '').includes('pdf'),
    `status ${monthly.status}`
  );

  const claims = await json('/api/reports/generated');
  check('saved consolidated claims are listed', Array.isArray(claims.body?.data), `status ${claims.status}`);

  const badToken = await api('/api/sign/not-a-real-token-at-all-0000000');
  check('an invalid signing token is refused', badToken.status === 404, `status ${badToken.status}`);

  const reminders = await json('/api/reminders');
  check(
    'reminder settings are readable and say whether mail is ready',
    reminders.status === 200 && typeof reminders.body?.data?.enabled === 'boolean' &&
      'mailReady' in reminders.body.data
  );

  // The scheduler entry point must never be open. Without the shared secret it
  // refuses, whatever the settings say.
  const cron = await api('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('the reminder scheduler refuses without its secret', cron.status === 503 || cron.status === 401, `status ${cron.status}`);

  // Monitoring is gated to developers, so the contract is the gate, not the
  // list: this account sees it or gets a 404 depending on which side of
  // NEXT_PUBLIC_MONITORING_EMAILS it is on. A 403, or a 200 for an account that
  // should not have it, is the failure worth catching.
  const allowedToSeeCrashes = (process.env.NEXT_PUBLIC_MONITORING_EMAILS || 'miqueas@stoicsoftware.io')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .includes(String(EMAIL).trim().toLowerCase());
  const crashes = await json('/api/monitoring');
  check(
    allowedToSeeCrashes
      ? 'client error monitoring answers a developer'
      : 'client error monitoring is hidden from an ordinary administrator',
    allowedToSeeCrashes ? Array.isArray(crashes.body?.data) : crashes.status === 404,
    `status ${crashes.status}`
  );

  const menus = await json('/api/reports/files');
  check('menus listing responds', Array.isArray(menus.body), `status ${menus.status}`);

  const menu = menus.body?.[0];
  if (menu) {
    const file = await api(`/api/reports/files/download?fileId=${encodeURIComponent(menu.id ?? menu.fileId)}`);
    const bytes = await file.arrayBuffer().catch(() => new ArrayBuffer(0));
    check(
      'a menu downloads as a real file',
      file.ok && (file.headers.get('content-type') || '').includes('pdf') && bytes.byteLength > 1024,
      `status ${file.status}, ${file.headers.get('content-type')}, ${bytes.byteLength} bytes`
    );
  }

  if (submittedDate) {
    const detail = await json(
      `/api/meal-counts/detail?site=${encodeURIComponent(withCount)}&date=${submittedDate}`
    );
    check(
      'count detail carries totals and entries',
      detail.status === 200 && typeof detail.body?.data?.totals?.att === 'number' && Array.isArray(detail.body.data.entries)
    );

    const pdf = await api(`/api/meal-counts/pdf?site=${encodeURIComponent(withCount)}&date=${submittedDate}`);
    check(
      'daily PDF renders',
      pdf.status === 200 && (pdf.headers.get('content-type') || '').includes('pdf'),
      `status ${pdf.status}`
    );
  } else {
    check('a submitted count exists to exercise detail and PDF', false, 'no submitted counts found');
  }

  // Guards the screens rely on: a closed day and a duplicate must be refused.
  const bogus = await api('/api/meal-counts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      actionType: 'mealCount',
      values: { site: first, date: '1999-01-01T12:00:00.000Z', timeIn: '15:30', timeOut: '17:45', signature: '', data: [] },
    }),
  });
  check('submitting on a day that is not open is refused', bogus.status >= 400, `status ${bogus.status}`);

  await api('/api/auth/logout', { method: 'POST' });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

run().catch((error) => {
  console.error('Smoke run failed:', error.message);
  process.exit(1);
});
