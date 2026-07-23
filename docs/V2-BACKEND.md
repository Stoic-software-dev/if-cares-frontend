# v2 Backend (Phase 1) — developer notes

Branch `v2-backend`. The app's own API replaces the Google Apps Script/Sheets
backend. The existing UI is untouched and still points at GAS; the Phase 2
cutover swaps 14 mapped call sites to these endpoints.

## Stack

- **Prisma 6 + PostgreSQL** — schema in `prisma/schema.prisma`, migrations in `prisma/migrations/`.
- **Auth**: bcryptjs (cost 12) + jose HS256 JWT in an httpOnly cookie (`ifc_session`, 8h, sliding refresh via `/api/auth/me`). No Supabase Auth — custom sessions keep the legacy login shape (`role: 3202|5670`, `assignedSite: 'all'|'A,B'`).
- **DB target**: Supabase Postgres (pending project creation). Interim local dev: Docker container `ifcares-pg` → `docker start ifcares-pg` (postgres:16 on **127.0.0.1:5434**, user/pass/db `ifcares`). Native PG services own 5432/5433 — do not use `localhost:5433`.

## Setup

```bash
cp .env.example .env   # fill AUTH_SECRET + SEED_ADMIN_*
docker start ifcares-pg
npx prisma migrate dev
npm run db:seed        # admin user from SEED_ADMIN_* env
npm run db:import      # pulls sites/students/calendar from live GAS (read-only)
npm run dev
```

Switching to Supabase: replace `DATABASE_URL` (Transaction pooler, port 6543,
add `?pgbouncer=true&connection_limit=1` on Vercel) and `DIRECT_URL` (direct,
5432) in `.env`, then `npx prisma migrate deploy`, re-seed, re-import.

## Scripts

- `npm run db:import` (`scripts/import-from-gas.mjs`) — idempotent; flags `--dry-run`, `--only=sites|students|meals`, `--snapshot` (raw GAS JSON into `import-snapshots/`). Re-runs converge; GAS remains source of truth until cutover.
- `npm run db:parity` (`scripts/verify-parity.mjs`) — with `npm run dev` running, diffs GAS vs the local API (sites/students/roster numbers/siteData/allMeals).
- `node scripts/create-reset-link.mjs <email>` — 1h password-reset link (until email delivery exists).

## API conventions

- GET endpoints return **raw** arrays/objects exactly like GAS; writes return `{result:'success'|'error', message?}` plus real HTTP codes.
- POST bodies may arrive as `Content-Type: text/plain` (legacy) — parsed via `req.text()`.
- Site is always a **query param** (`?site=`) because names contain `/`.
- Calendar dates are `@db.Date` under a UTC-midnight convention; ALL conversions go through `src/lib/dates.js` (client ISO instants resolve to a calendar date in `APP_TIMEZONE`).
- `validDates` = ServiceDay rows without a MealCount; `excludedDates` = dates with one. Imported already-submitted dates exist as **stub MealCounts** (`source: GAS_IMPORT`, empty times/signature) so they can't be resubmitted; the Phase 2 historical import fills them in.

| Legacy GAS call | v2 endpoint |
|---|---|
| POST `actionType:login` | POST `/api/auth/login` |
| `?type=refreshUser&email=` | GET `/api/auth/me` |
| `?type=sites` | GET `/api/sites` |
| `?type=siteData&site=` | GET `/api/sites/data?site=` |
| `?type=studentData&site=` | GET `/api/students/roster?site=` |
| `?type=students` | GET `/api/students` |
| POST `actionType:add` | POST `/api/students` (legacy body accepted) |
| POST `actionType:edit` | PATCH `/api/students/[id]` |
| POST `actionType:delete` | DELETE `/api/students/[id]` |
| POST `actionType:mealCount` | POST `/api/meal-counts` (legacy body accepted) |
| `?type=allMeals` | GET `/api/meal-counts/all` |
| `?type=request&…` | POST `/api/requests` |
| `?type=listFiles` | GET `/api/reports/files` (GAS proxy until Phase 5) |
| `?type=downloadSelectedPdf&fileId=` | GET `/api/reports/files/download?fileId=` (proxy) |

New (no legacy equivalent): `/api/auth/logout|forgot-password|reset-password`,
`/api/sites/service-days` (admin calendar authoring), `/api/requests` GET +
`/api/requests/[id]` PATCH (admin inbox), `/api/health`.

## Still pending (later phases)

- Phase 2: swap the 14 frontend call sites; import historical per-student meal
  counts + real users (needs spreadsheet access — no GAS endpoint exposes them);
  deploy with Supabase; retire GAS writes.
- Phase 3: admin UI (users, sites, service calendar). Phase 4: redesign.
  Phase 5: native reports (replace proxy), request inbox UI, email delivery.
