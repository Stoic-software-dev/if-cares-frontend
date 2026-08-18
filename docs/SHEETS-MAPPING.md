# Sheets → database mapping

Column-by-column mapping from the legacy Google Sheets to the v2 schema
(`prisma/schema.prisma`). Source layouts were verified against the live
spreadsheets in July 2026 (see gas-backup/ for the Apps Script that writes them).

## Master spreadsheet

### Tab `Students` (global aggregate — rebuilt from every sheet in the Drive folder)

| Col | Content | Maps to | Notes |
|---|---|---|---|
| A | Student name | `Student.name` | "ZZ " prefix = withdrawn → `Student.active = false` |
| B | Age | `Student.age` | Ignored when non-integer or out of 0–120 |
| C | Site name | membership fallback | Authoritative ONLY for inactive sites; active sites use their own Roster (see below) |
| D | Site spreadsheetId | — | Redundant with the Sites tab |
| E | Birthdate | `Student.birthdate` | Rejected outside 1990–today (two rows say 2027) |
| F | GAS id (`ABC_<millis>`) | `Student.id` | Preserved verbatim; keys localStorage drafts and history linking |

### Tab `Sites`

| Col | Content | Maps to | Notes |
|---|---|---|---|
| A | Site name (with school-year prefix) | `Site.name` | Unique; the frontend's identity everywhere |
| B | SpreadsheetId | `Site.legacySpreadsheetId` | |
| C | State | `Site.state` | "TX" \| "OK"; drives the consolidated claim reports |
| D2 | Folder file count | — | Operational cell, not migrated |
| G2 | OK foundation id | `AppSetting` `foundationId.OK` | |
| G3 | TX foundation id | `AppSetting` `foundationId.TX` | |

### Tab `All Meals` (valid dates published day by day at 7:45 AM)

| Col | Content | Maps to |
|---|---|---|
| A | Site name | `ServiceDay.siteId` (by name) |
| B | Date | `ServiceDay.date` (calendar date, UTC-midnight convention) |
| C–F | brk / lunch / snk / sup flags | `ServiceDay.brk/lunch/snk/sup` |

### Tab `Sent Meals` (submission log, pruned after ~8 days)

Submitted dates become **stub `MealCount`s** (`source: GAS_IMPORT`) so the date
can't be resubmitted; the history import fills them with real entries.

### Tab `Users`

| Col | Content | Maps to | Notes |
|---|---|---|---|
| A | GAS id | — | Not preserved (cuid) |
| B / C | Name / lastname | `User.name` / `User.lastname` | |
| D | Email | `User.email` | Lowercased; duplicates deduped at import |
| E | Password (PLAINTEXT) | `User.passwordHash` | bcrypt-hashed at import; plaintext never persisted — users keep their credentials |
| F | Role (3202 admin / 5670 user) | `User.role` (`ADMIN`/`USER`) | Legacy numbers still served by the login API for compatibility |
| G | assignedSite (`all` or CSV) | `User.allSites` / `UserSite` rows | |

### Tab `Reminders`

| Col | Content | Maps to |
|---|---|---|
| A | Site name | — |
| B / C | Window start / end | `Site.reminderStart` / `Site.reminderEnd` |

### Tab `Reports` (consolidated report log)

Maps to `GeneratedReport` (year, month, state, kind, fileName, signedBy);
file bytes move from Drive to object storage under `storageKey`.

## Per-site spreadsheets

### Tab `Roster` — **authoritative membership for active sites**

| Col | Content | Maps to | Notes |
|---|---|---|---|
| A | Name | `Student.name` | Sheet re-sorts alphabetically on every change |
| B | Age (DATEDIF formula) | `Student.age` | |
| C | Birthdate | `Student.birthdate` | |
| D | GAS id | `Student.id` | Position (1-based) → `Student.number` (positional, NOT unique) |

### Dated tabs `M/D/YYYY` (one per submission; some legacy renames are `MMDDYYYY`)

| Range | Content | Maps to | Notes |
|---|---|---|---|
| B7:B{106\|156} / L7:L… | Student names, left/right blocks | `MealCountEntry.name` | Submission order alternates left/right per row; BGC COOKE uses the 150-row layout, others 100 |
| C / M | Age | `MealCountEntry.age` | |
| D / N | Attendance | `MealCountEntry.attendance` | |
| E:F / O:P | Times | `MealCount.timeIn/timeOut` | Canonical "HH:MM:SS"; the `Dates` tab wins when present |
| G–J / Q–T | brk, lunch, snack, supper | `MealCountEntry.breakfast/lunch/snack/supper` | |
| Totals row 108/109 (158/159 Cooke) | Template-computed totals | verification only | Import derives totals from entries and cross-checks both layouts |
| Row 111/161 | `=Image()` signature | `MealCount.signature` | PNG lives in Drive `Signatures/<site>/<date>.png`; storage migration pending |
| Tab name | The date | `MealCount.date` | Parsed as text — never as a Date cell (script timezone is Buenos Aires) |

### Tab `Dates`

| Col | Content | Maps to |
|---|---|---|
| A | Date | key for the dated tab |
| B / C | timeIn / timeOut | `MealCount.timeIn/timeOut` (canonical source) |

### Tab `Requests`

Maps to `Request` (type, amount, time, site, requester); status is new in v2
(`NEW` on import).

### Tabs `Welcome, Form, DataBase, SiteDays, BD, Meals, PastMeals`

Operational machinery of the old app (form template, aggregation caches).
Not migrated; their content is derived state.

## Known anomalies (decision pending with IF Cares)

See `docs/data-anomalies-for-ifcares.md`: one "Copy of" site sheet, six
duplicate student names, two 2027 birthdates, "ZZ " withdrawals (~134),
duplicate admin emails, test rows in Users, 64 "Copy of…" sheets in the folder.
