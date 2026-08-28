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
| `?type=listFiles` | GET `/api/reports/files` (Drive REST API, 10 min in-process cache with stale fallback) |

Every PDF the app generates is archived to Drive through `src/lib/pdf-archive.js`
(`<reports folder>/<YYYY-MM>/<name>.pdf`). Monthly and consolidated reports must use
the same helper and store the returned Drive id in `GeneratedReport.storageKey`.
| `?type=downloadSelectedPdf&fileId=` | GET `/api/reports/files/download?fileId=` (Drive stream, `&download=1` for attachment) |

New (no legacy equivalent): `/api/auth/logout|forgot-password|reset-password`,
`/api/sites/service-days` (admin calendar authoring), `/api/requests` GET +
`/api/requests/[id]` PATCH (admin inbox), `/api/health`.

## Planned endpoints

From the open cards plus the **Summer-parity review** (28-Aug-2026 — functional
inventory in `SPECS.md` §11, sequencing in `ROADMAP.md`, items tagged `[S]`).
Same conventions as above: site by query param, dates through `src/lib/dates.js`,
writes return `{result, message?}` with real status codes, every write audited.

| Endpoint | Notes |
|---|---|
| `POST /api/sites` · `PATCH /api/sites/[id]` | Admin site CRUD. A rename must propagate — `Site.name` is the identity matched by `assignedSite`, counts and reports; do it in one transaction and audit it. `PATCH` also flips `active`. |
| `POST /api/sites/[id]/schedule` | Weekly template (meals per weekday) + `programStart/End` → generates `ServiceDay` rows for the cycle. Never rewrites a day that already has a `MealCount` (same rule the current `PUT /api/sites/service-days` enforces). |
| `GET/POST /api/holidays` · `PATCH/DELETE /api/holidays/[id]` | Named holiday with a date range, site scope (all / selected) and meal scope (all / subset). Reject duplicates on `name + range + scope`. Deleting only removes rows inside the same scope. Projects onto `ServiceDay` — never onto claimed days. |
| `POST /api/meal-counts/void` | Soft void: `voidedAt/ById/Reason`. The date returns to `validDates`, the count leaves every report, rows stay for audit. Admin only. |
| `POST /api/meal-counts/approve` | **Only if IF Cares confirms the approval flow.** Sets `approvalStatus/approvedAt/approvedById`, blocks corrections, and queues the PDF + site email as a follow-up job (never inline — Summer learned this the hard way). |
| `POST /api/reports/daily` · `POST /api/reports/monthly` | `{ save?, emails? }` — store in Storage, email to N validated recipients, or both. Returns the stored file reference. |
| `POST /api/reports/consolidated` | Month/range × state, with an excluded-sites list. Client-generated `jobId` so polling survives a dropped connection. Returns immediately. |
| `GET /api/reports/jobs/[id]` | `processing \| completed \| error` (+ `resultRef`). Everything over ~10s goes through here. |
| `GET /api/reports` | Stored reports, retrievable without regenerating (`GeneratedReport`). |
| `GET/POST /api/sign/[token]` | **Public, no session** — the only exception to "everything behind auth" (`SPECS.md` §9). Opaque single-use token, expiring, scoped to one report; returns the PDF for preview and accepts the signature. Do NOT put a Drive/file id in the URL the way Summer does. |
| `PATCH /api/requests/[id]` (extended) | Adds `responseComment` + `respondedBy/At` and triggers the email to the requester. |
| `POST /api/monitoring` | Server-side proxy to the central monitoring service; the browser never talks to it directly. Payload: app, environment, screen/function, message, stack, URL. |

## Still pending (later phases)

- Phase 2: swap the 14 frontend call sites; import historical per-student meal
  counts + real users (needs spreadsheet access — no GAS endpoint exposes them);
  deploy with Supabase; retire GAS writes.
- Phase 3: admin UI (users, sites, service calendar, holidays). Phase 4: redesign.
  Phase 5: native reports (replace proxy), request inbox UI, email delivery.
- Schema deltas the planned endpoints depend on (`SPECS.md` §4): `Holiday`, the site
  weekly template + program dates, site contact fields, count void (and optional
  approval) fields, request response fields, report signature + job state.
