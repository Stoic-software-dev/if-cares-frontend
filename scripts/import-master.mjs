// Imports users, site states, foundation IDs and reminder windows from a local
// export of the master spreadsheet (migration-data/master.xlsx — NEVER commit
// that file: it contains PII and plaintext passwords).
//
//   node scripts/import-master.mjs --dry-run     # parse & report only, no DB
//   node scripts/import-master.mjs               # upserts into the DB
//
// Passwords: the sheet stores them in PLAINTEXT. They are bcrypt-hashed here so
// every user keeps their current password at cutover. On re-runs, an existing
// passwordHash is never overwritten (users who already changed it are safe).

import XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { ROLES } from '../src/constants/index.js';

try {
  process.loadEnvFile();
} catch {
  // .env optional
}

const DRY = process.argv.includes('--dry-run');
const FILE = 'migration-data/master.xlsx';

const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.warn(`  ⚠ ${msg}`);
};

// Google/Excel date serial (1900 system) -> 'YYYY-MM-DD' with pure integer
// math — never interpret sheet dates as timezone-carrying instants.
function serialToYmd(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Math.round(value) * 86400000 + Date.UTC(1899, 11, 30);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const m = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const iso = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

function parseMaster() {
  const wb = XLSX.readFile(FILE);

  // --- Users (cols: id, name, lastname, email, password, role, assigned site) ---
  const userRows = XLSX.utils.sheet_to_json(wb.Sheets['Users'], { header: 1, raw: true });
  const users = [];
  const seenEmails = new Set();
  for (let i = 1; i < userRows.length; i++) {
    const [, name, lastname, emailRaw, password, role, assignedRaw] = userRows[i] || [];
    const email = String(emailRaw ?? '').trim().toLowerCase();
    if (!email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warn(`user row ${i + 1}: invalid email "${email}" — skipped`);
      continue;
    }
    if (seenEmails.has(email)) {
      warn(`duplicate user email "${email}" — first row kept (GAS login matched top-down)`);
      continue;
    }
    seenEmails.add(email);

    const roleCode = Number(role);
    if (roleCode !== ROLES.Admin && roleCode !== ROLES.User) {
      warn(`user "${email}": unknown role "${role}" — skipped`);
      continue;
    }

    const assigned = String(assignedRaw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    users.push({
      email,
      name: String(name ?? '').trim(),
      lastname: String(lastname ?? '').trim(),
      plainPassword: String(password ?? ''),
      role: roleCode === ROLES.Admin ? 'ADMIN' : 'USER',
      allSites: assigned.includes('all'),
      siteNames: assigned.filter((s) => s !== 'all'),
    });
  }

  // --- Sites (col A name, col C state) + foundation IDs (F/G rows 2-3) ---
  const siteRows = XLSX.utils.sheet_to_json(wb.Sheets['Sites'], { header: 1, raw: true });
  const siteStates = [];
  for (let i = 1; i < siteRows.length; i++) {
    const [name, , state] = siteRows[i] || [];
    if (!name) continue;
    siteStates.push({ name: String(name).trim(), state: String(state ?? '').trim().toUpperCase() });
  }
  const foundationIds = {};
  for (let i = 1; i < Math.min(siteRows.length, 6); i++) {
    const stateLabel = String(siteRows[i]?.[5] ?? '').trim().toUpperCase();
    const id = String(siteRows[i]?.[6] ?? '').trim();
    if (!id) continue;
    // The sheet has a "TK" typo for TX — GAS reads by fixed row (G2=OK, G3=TX)
    const state = stateLabel === 'OK' ? 'OK' : 'TX';
    foundationIds[state] = id;
  }

  // --- Reminders (site, start, end) ---
  const remRows = XLSX.utils.sheet_to_json(wb.Sheets['Reminders'], { header: 1, raw: true });
  const reminders = [];
  for (let i = 1; i < remRows.length; i++) {
    const [name, start, end] = remRows[i] || [];
    if (!name) continue;
    reminders.push({
      name: String(name).trim(),
      start: serialToYmd(start),
      end: serialToYmd(end),
    });
  }

  return { users, siteStates, foundationIds, reminders };
}

async function main() {
  const { users, siteStates, foundationIds, reminders } = parseMaster();

  console.log(`Parsed master.xlsx:`);
  console.log(`  users: ${users.length} (${users.filter((u) => u.role === 'ADMIN').length} admins, ${users.filter((u) => !u.plainPassword).length} without password)`);
  console.log(`  sites with state: ${siteStates.length} (${siteStates.filter((s) => s.state === 'OK').length} OK / ${siteStates.filter((s) => s.state === 'TX').length} TX)`);
  console.log(`  foundation ids: ${JSON.stringify(foundationIds)}`);
  console.log(`  reminder windows with dates: ${reminders.filter((r) => r.start && r.end).length}`);

  if (DRY) {
    console.log('\n(dry run — nothing written)');
    reportWarnings();
    return;
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const sites = await prisma.site.findMany({ select: { id: true, name: true } });
    const siteByName = new Map(sites.map((s) => [s.name, s]));

    // Users
    let created = 0;
    let updated = 0;
    for (const u of users) {
      const passwordHash = u.plainPassword ? await bcrypt.hash(u.plainPassword, 12) : null;
      if (!u.plainPassword) warn(`user "${u.email}" has no password in the sheet — will need a reset link`);

      const siteIds = [];
      for (const name of u.siteNames) {
        const site = siteByName.get(name);
        if (site) siteIds.push(site.id);
        else warn(`user "${u.email}": assigned site "${name}" not found in DB — link skipped`);
      }

      const existing = await prisma.user.findUnique({ where: { email: u.email } });
      const data = {
        name: u.name,
        lastname: u.lastname,
        role: u.role,
        allSites: u.allSites,
        active: true,
        sites: {
          deleteMany: {},
          create: siteIds.map((siteId) => ({ siteId })),
        },
      };
      if (existing) {
        // never clobber a password the user already manages in v2
        if (!existing.passwordHash && passwordHash) data.passwordHash = passwordHash;
        await prisma.user.update({ where: { email: u.email }, data });
        updated++;
      } else {
        await prisma.user.create({
          data: { email: u.email, passwordHash, ...data, sites: { create: siteIds.map((siteId) => ({ siteId })) } },
        });
        created++;
      }
    }
    console.log(`  users upserted: ${created} created, ${updated} updated`);

    // Site states
    let stated = 0;
    for (const s of siteStates) {
      const site = siteByName.get(s.name);
      if (!site) {
        warn(`state for unknown site "${s.name}" skipped`);
        continue;
      }
      await prisma.site.update({ where: { id: site.id }, data: { state: s.state } });
      stated++;
    }
    console.log(`  site states set: ${stated}`);

    // Foundation IDs
    for (const [state, value] of Object.entries(foundationIds)) {
      await prisma.appSetting.upsert({
        where: { key: `foundationId.${state}` },
        create: { key: `foundationId.${state}`, value },
        update: { value },
      });
    }
    console.log(`  foundation ids stored: ${Object.keys(foundationIds).join(', ')}`);

    // Reminder windows
    let windows = 0;
    for (const r of reminders) {
      const site = siteByName.get(r.name);
      if (!site) continue; // reminders list includes retired sites — silently skip
      await prisma.site.update({
        where: { id: site.id },
        data: {
          reminderStart: r.start ? new Date(`${r.start}T00:00:00.000Z`) : null,
          reminderEnd: r.end ? new Date(`${r.end}T00:00:00.000Z`) : null,
        },
      });
      windows++;
    }
    console.log(`  reminder windows applied: ${windows}`);
  } finally {
    await prisma.$disconnect();
  }

  reportWarnings();
}

function reportWarnings() {
  console.log(`\nDone. ${warnings.length} warning(s).`);
  for (const w of warnings) console.log(`  - ${w}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
