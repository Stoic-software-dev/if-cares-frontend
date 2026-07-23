// Read-only diff between the live GAS backend and the local v2 API.
// Usage: with `npm run dev` running →  node scripts/verify-parity.mjs
// Signs in with the seed admin, then compares sites, students, roster numbers,
// siteData and allMeals. Informational: prints PASS/DIFF lines.

try {
  process.loadEnvFile();
} catch {
  // .env optional
}

const GAS = process.env.GAS_BASE_URL;
const API = process.env.PARITY_API_URL || 'http://localhost:3000';
const EMAIL = process.env.SEED_ADMIN_EMAIL;
const PASSWORD = process.env.SEED_ADMIN_PASSWORD;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gasGet(type, params = {}) {
  const qs = new URLSearchParams({ type, ...params }).toString();
  const res = await fetch(`${GAS}?${qs}`, { redirect: 'follow' });
  const data = JSON.parse(await res.text());
  await sleep(400);
  return data;
}

let cookie = '';
async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: { cookie } });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

function diffSets(labelA, a, labelB, b) {
  const onlyA = [...a].filter((x) => !b.has(x));
  const onlyB = [...b].filter((x) => !a.has(x));
  return { onlyA, onlyB, equal: onlyA.length === 0 && onlyB.length === 0 };
}

const lines = [];
const report = (ok, label, detail = '') =>
  lines.push(`${ok ? 'PASS' : 'DIFF'}  ${label}${detail ? ` — ${detail}` : ''}`);

async function main() {
  if (!GAS || !EMAIL || !PASSWORD) {
    console.error('Need GAS_BASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD in env.');
    process.exit(1);
  }

  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ actionType: 'login', email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`login failed: HTTP ${login.status} ${await login.text()}`);
  cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('login did not set a session cookie');
  console.log('Signed in to local API.\n');

  // --- sites ---
  const [gasSites, apiSites] = [await gasGet('sites'), await api('/api/sites')];
  const gasNames = new Set(gasSites.map((s) => String(s.name).trim()));
  const apiNames = new Set(apiSites.map((s) => s.name));
  const sitesDiff = diffSets('gas', gasNames, 'api', apiNames);
  report(
    sitesDiff.onlyB.length === 0,
    `sites (${apiNames.size} local / ${gasNames.size} gas)`,
    `${sitesDiff.onlyA.length} GAS-only (stale years expected: ${sitesDiff.onlyA.slice(0, 3).join(' | ') || '—'})` +
      (sitesDiff.onlyB.length ? ` · LOCAL-ONLY: ${sitesDiff.onlyB.join(' | ')}` : '')
  );

  // --- students (compare within sites the local API exposes) ---
  const [gasStudents, apiStudents] = [await gasGet('students'), await api('/api/students')];
  const gasById = new Map(
    gasStudents.filter((s) => apiNames.has(String(s.site).trim())).map((s) => [String(s.id), s])
  );
  const apiById = new Map(apiStudents.map((s) => [s.id, s]));
  const idsDiff = diffSets('gas', new Set(gasById.keys()), 'api', new Set(apiById.keys()));
  let nameMismatches = 0;
  for (const [id, apiRow] of apiById) {
    const gasRow = gasById.get(id);
    if (gasRow && String(gasRow.name).trim().replace(/\s{2,}/g, ' ') !== apiRow.name) nameMismatches++;
  }
  report(
    idsDiff.onlyB.length === 0 && nameMismatches === 0,
    `students (${apiById.size} local / ${gasById.size} gas in visible sites)`,
    `${idsDiff.onlyA.length} GAS-only (skipped dupes expected), ${idsDiff.onlyB.length} local-only, ${nameMismatches} name mismatches`
  );

  // --- allMeals ---
  const [gasAll, apiAll] = [await gasGet('allMeals'), await api('/api/meal-counts/all')];
  let sitesCompared = 0;
  let validDiffs = 0;
  let excludedDiffs = 0;
  for (const [siteName, apiData] of Object.entries(apiAll)) {
    const gasData = gasAll[siteName];
    if (!gasData) continue;
    sitesCompared++;
    const vd = diffSets('gas', new Set(Object.keys(gasData.validDates || {})), 'api', new Set(Object.keys(apiData.validDates || {})));
    const ed = diffSets('gas', new Set(gasData.excludedDates || []), 'api', new Set(apiData.excludedDates || []));
    if (!vd.equal) {
      validDiffs++;
      lines.push(`       · ${siteName} validDates — GAS-only: [${vd.onlyA.join(', ')}] LOCAL-only: [${vd.onlyB.join(', ')}]`);
    }
    if (!ed.equal) {
      excludedDiffs++;
      lines.push(`       · ${siteName} excludedDates — GAS-only: [${ed.onlyA.join(', ')}] LOCAL-only: [${ed.onlyB.join(', ')}]`);
    }
  }
  report(validDiffs === 0 && excludedDiffs === 0, `allMeals (${sitesCompared} sites compared)`, `${validDiffs} validDates diffs, ${excludedDiffs} excludedDates diffs`);

  // --- roster numbers + siteData for a couple of sites ---
  const sample = apiSites.slice(0, 2);
  for (const site of sample) {
    const q = encodeURIComponent(site.name);
    const [gasRoster, apiRoster] = [await gasGet('studentData', { site: site.name }), await api(`/api/students/roster?site=${q}`)];
    const gasNums = new Map((Array.isArray(gasRoster) ? gasRoster : []).map((r) => [String(r.id), Number(r.number)]));
    let numDiffs = 0;
    for (const row of apiRoster) {
      if (gasNums.has(row.id) && gasNums.get(row.id) !== row.number) numDiffs++;
    }
    report(numDiffs === 0, `roster numbers @ ${site.name}`, `${numDiffs} mismatches over ${apiRoster.length} rows`);

    const [gasSite, apiSite] = [await gasGet('siteData', { site: site.name }), await api(`/api/sites/data?site=${q}`)];
    const ceOk =
      String(gasSite?.ceId ?? '') === apiSite.ceId && String(gasSite?.siteNumber ?? '') === apiSite.siteNumber;
    report(ceOk, `siteData CE fields @ ${site.name}`, ceOk ? '' : `gas ceId=${gasSite?.ceId} local ceId=${apiSite.ceId}`);
  }

  console.log(lines.join('\n'));
  const diffs = lines.filter((l) => l.startsWith('DIFF')).length;
  console.log(`\n${diffs === 0 ? '✅ parity clean' : `⚠ ${diffs} section(s) with differences — review above`}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
