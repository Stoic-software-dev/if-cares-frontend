# IF Cares Regular Year App 2.0 — Especificación técnica

> Fuente de verdad funcional: cards de Jira **STOIC-2196 a STOIC-2207** (hijas de STOIC-8 "IfCares")
> y el documento de requerimientos "IF Cares - Regular Year App 2.0".
> Este archivo consolida lo **técnico**: arquitectura, modelo de datos, convenciones y decisiones.
> Última actualización: 2026-08-18.

---

## 1. Objetivo

Sacar las Google Sheets como sistema de registro y pasar toda la app Regular Year
(meal counting escolar, estilo CACFP) a una base de datos propia, con autenticación
real, módulo de administración, reportes nativos y un rediseño visual completo.
La app vieja (GAS + Sheets) sigue operando en producción **hasta un único cutover
al final del proyecto** (STOIC-2207). No hay dual-write en ningún momento.

## 2. Sistema actual (v1) — lo que se reemplaza

- **Frontend**: Next.js 14 App Router (JSX), este repo. Prod en Railway
  (`ifcares-regularyear-prod.up.railway.app`), deploya desde `main`; `dev` es la rama de trabajo.
- **Backend**: Google Apps Script web app sobre Google Sheets (`API_BASE_URL` en
  `src/constants/index.js`). Fuente del GAS commiteada en `gas-backup/` (branch `v2-backend`).
  - GET `?type=`: `sites, students, studentData, siteData, allMeals, listFiles,
    downloadSelectedPdf, request, refreshUser`.
  - POST `actionType`: `login, add, edit, delete, mealCount`.
- **Estructura de Sheets**: Master (tabs Students / Sites / All Meals / Sent Meals /
  Users / Reminders / Reports) + una spreadsheet por sitio (~56) con tabs
  `Form, Roster, DataBase, SiteDays, Meals, PastMeals, Dates, Requests` + un tab
  fechado `M/D/YYYY` por submission. Firmas = PNG en Drive (`Signatures/<site>/<fecha>.png`).
  Menús = PDFs en carpeta `Menu/` de Drive servidos por `listFiles` (¡se llaman
  "reports" en el código pero son menús!).
- **Triggers GAS**: `updateAllMeals` diario 7:45 AM (publica la fecha del día — las
  fechas aparecen **día a día**, no por adelantado), `sendReminderEmail` 8 AM
  (counts atrasados → mail al staff del sitio cc marisela@ifcares.org),
  `deleteOldDates` (poda Sent Meals > 8 días), `checkAndUpdate` cada 5 min.
- **Problemas estructurales que motivan el 2.0**:
  - Webapp `ANYONE_ANONYMOUS`: endpoints sin auth pueden dumpear el roster completo
    y **editar** el calendario. Passwords en texto plano en el tab Users.
  - Concurrencia: read-modify-write de tabs completos (mitigado con locks en el
    hotfix de ago-2026, pero estructuralmente frágil).
  - Latencias: sites ~9s, allMeals ~14s off-peak. Objetivo 2.0: **≤ 1 s**.
  - Roster "number" = índice alfabético recalculado en cada alta/baja (no es un id).
  - Alta de sitios/usuarios = editar el archivo correcto a mano.

## 3. Arquitectura 2.0

| Capa | Decisión |
|---|---|
| Framework | Next.js App Router (mismo repo; API propia en `src/app/api`) |
| ORM / DB | **Prisma 6** + PostgreSQL (Prisma 7 rompía — quedarse en 6) |
| DB hosting | **Supabase** (decidido; proyecto AÚN NO CREADO — runbook en `docs/SUPABASE-SETUP.md`). Dev interino: Docker `ifcares-pg` postgres:16 en `127.0.0.1:5434` (nunca `localhost`: IPv6 pega en el PG nativo) |
| Auth | **Custom** (NO Supabase Auth): bcryptjs cost 12 + JWT jose HS256 en cookie httpOnly `ifc_session`, 8 h deslizante vía `/api/auth/me`. Mantiene el shape legacy del login (`role: 3202\|5670`, `assignedSite: 'all'\|'A,B'`) |
| UI / Design system | **Tailwind + shadcn/ui** + headless únicamente: react-hook-form + zod, TanStack Table, react-day-picker (shadcn Calendar), Sonner, Vaul, lucide, motion. **PROHIBIDO** reintroducir MUI / NextUI / Flowbite / DaisyUI / FontAwesome / Heroicons / Formik / Yup del v1. Estética por tokens (CSS vars) |
| Dirección visual | **Espejo de la app Summer** (`C:\laragon\www\if-cares-summer-frontend`, decidido 18-ago): mismas superficies slate (bg slate-50, cards blancas con border slate-200, texto slate-500/700/800), mismo patrón de layout (Navbar + PageLayout con gradiente `from-slate-50 via-<hue>-50 to-slate-100`, main centrado max-w-screen-xl / 2xl para calendario, PageHeader estándar), pills redondeadas para badges de rol/estado, focus ring del hue de marca. **Diferencia: el hue de marca** — Summer usa indigo `#4f46e5`; Regular Year usa **teal** (placeholder, se valida con las 5 pantallas ante IF Cares). Estados: verde éxito, rojo error, ámbar warning — iguales en ambas apps |
| App hosting | A definir (Railway ya hostea el v1 — candidato natural). Falta staging público para STOIC-2206 |

Estado del código: branch **`v2-backend`** (commits `0198646`, `5721b69`, `511e66f`,
`c20a15a` — **solo locales, sin pushear**). El frontend actual no fue tocado: sigue
apuntando a GAS hasta que se swapeen los 14 call sites mapeados en `docs/V2-BACKEND.md`.

## 4. Modelo de datos

Schema en `prisma/schema.prisma` (branch `v2-backend`), migraciones versionadas
(`20260723161630_init`, `20260723190000_site_state_and_settings`). Referencia SQL
completa en `prisma/full-schema-reference.sql`.

**Entidades existentes**:

- `Site` — name único con prefijo de año escolar (identidad que matchea el frontend),
  `active`, `state` ("TX"|"OK", maneja los reportes consolidados por estado),
  `ceName/ceId/siteName/siteNumber`, `legacySpreadsheetId`, ventana de reminders
  (`reminderStart/End`).
- `Student` — id legacy verbatim en importados, `number` (alfabético dinámico),
  `@@unique([siteId,name])` y `[siteId,number]`, `active` (reemplaza el prefijo "ZZ ").
- `ServiceDay` — calendario por sitio: `date` + flags `brk/lunch/snk/sup`,
  `@@unique([siteId,date])`.
- `MealCount` — `@@unique([siteId,date])`, `timeIn/timeOut` ("HH:MM:SS" 24 h),
  `signature`, `source` (`APP` | `GAS_IMPORT` — los importados ya submiteados existen
  como **stubs** para bloquear resubmit hasta que el import histórico los complete),
  `submittedBy`.
- `MealCountEntry` — snapshot de la fila del roster tal como se submiteó
  (`number/name/age` + attendance + 4 comidas); link a `Student` nullable (SetNull).
- `User` — email único lowercase, `passwordHash` (los migrados conservan su password:
  se hashea el texto plano en el import; **nadie resetea por la migración** — condición
  dura de STOIC-2197), `role ADMIN|USER`, `allSites`, `active`, `UserSite` N:M.
- `Request` — 8 tipos literales validados con zod, `status NEW|IN_PROGRESS|RESOLVED`.
- `AuditLog` — actor, action ("student.create"…), entity/entityId, payload Json.
- `AppSetting` — key-value (foundation ids TX/OK, config de reminders, etc.).
- `PasswordResetToken` — sha256 del token, expiración, un solo uso.

**Deltas de schema PENDIENTES** (exigidos por las cards, hacer antes de STOIC-2199/2201/2204):

- **Correcciones de counts** (STOIC-2201): versionado explícito — nunca pisar el valor
  original; quién, cuándo, valor anterior; flag visible de "corregido". (AuditLog solo
  no alcanza: los reportes deben tomar el valor corregido y la UI marcarlo.)
- **Firmas** (STOIC-2199): hoy `signature` es un campo de texto; definir captura
  (canvas) + almacenamiento binario (candidato: Supabase Storage).
- **Reportes generados** (STOIC-2204): tabla para PDFs consolidados guardados
  (mes, estado, archivo, firma incorporada) recuperables sin regenerar.
- **Config de notificaciones** (STOIC-2205): destinatarios/horario/on-off en
  `AppSetting` o tabla propia.
- Horarios de servicio por meal type (STOIC-2199 los pide por tipo; hoy hay un
  `timeIn/timeOut` global por count — confirmar con el form real).

## 5. API (paridad legacy)

Convenciones (ver `docs/V2-BACKEND.md` para el mapeo completo de los 14 call sites):

- Los GET devuelven **raw** (arrays/objetos idénticos a GAS); las escrituras
  `{result:'success'|'error', message?}` + HTTP codes reales.
- Los POST legacy llegan como `Content-Type: text/plain` → `req.text()`.
- El sitio viaja siempre por **query param** (`?site=`) — los nombres contienen `/`.
- **Fechas**: `@db.Date` con convención UTC-midnight; TODA conversión pasa por
  `src/lib/dates.js`. Regla heredada del GAS: parsear nombres de tab / strings de
  fecha, nunca celdas Date como instantes (timezone del script = Buenos Aires).
- `validDates` = ServiceDay sin MealCount; `excludedDates` = con MealCount.
- Roster: numeración alfabética **dinámica** (paridad con GAS), entries linkean por nombre.

Endpoints nuevos sin equivalente legacy: `auth/logout|forgot-password|reset-password`,
`sites/service-days` (calendario admin), `requests` GET/PATCH (inbox), `health`.
`reports/files` y `download` son **proxy a GAS** hasta que existan los reportes nativos.

## 6. Pipeline de migración (STOIC-2198)

Todo idempotente — se corre N veces hasta el corte; GAS sigue siendo la fuente de
verdad hasta STOIC-2207.

- `npm run db:import` (`scripts/import-from-gas.mjs`) — sites/students/calendar desde
  los GET read-only de GAS. Flags `--dry-run`, `--only=`, `--snapshot`.
- `scripts/import-master.mjs` — usuarios (hasheando passwords, dedup de emails, nunca
  pisa un `passwordHash` existente), estados de sitio, foundation ids, ventanas de
  reminders. Verificado contra el master real: 57 usuarios / 15 admins.
- `scripts/import-history.mjs` + `gas-backup/migration-export.gs` — histórico
  per-student. **Requiere acción manual**: pegar el .gs en Apps Script, setear
  `MIGRATION_EXPORT_KEY` y redeployar (la key también va a `.env` como `GAS_EXPORT_KEY`).
  El export XLSX NO es viable (>10 MB y los nombres de tab pierden las barras).
- `npm run db:parity` (`scripts/verify-parity.mjs`) — diff GAS vs API local. Todo PASS al 23-jul.
- **Falta**: reporte de reconciliación formal por sitio/mes (cantidades y totales,
  Sheets vs base) y refresco programado de la copia.

**Anomalías de data conocidas** (van al listado de STOIC-2196 para acordar con IF Cares):

- 19 estudiantes salteados en el import: sitio basura "Copy of Drexel Academy 2nd Grade",
  5 nombres duplicados, 2 birthdates en 2027.
- Prefijo **"ZZ "** en el nombre = alumno dado de baja (~134 en la master) → mapear a `active=false`.
- Emails duplicados de Kenya (`kenya@ifcares.com` / `.org`) y filas de test en Users.
- Hojas "Copy of …" en el folder Sites (64 entradas, duplicados año viejo/nuevo).
- Tabs históricos viejos: solo columna izquierda, nombres "Last, First" → link a
  studentId parcial (esperado). BGC Cooke: form de 150 filas (resto 100).
- Data histórica importada al 23-jul: 2.922 estudiantes, 56 sitios (52 activos), 566 service days.

## 7. Decisiones técnicas pendientes (sin dueño en las cards — asignar)

| Tema | Lo necesitan | Estado |
|---|---|---|
| Crear proyecto Supabase | Todo | **BLOQUEANTE #1** — runbook listo, ~15 min |
| Proveedor de email (Resend/SES/…) | 2197 reset, 2203/2204 envío PDFs, 2205 requests+reminders | Sin decidir — decidir YA |
| Storage de archivos (firmas, PDFs generados, menús) | 2199, 2203, 2204 | Candidato: Supabase Storage |
| Cron/scheduler (reminders diarios, refresh del pipeline) | 2198, 2205 | Railway cron / pg_cron / a definir |
| Motor de PDF (¿puppeteer/react-pdf?) — replicar el form en papel campo por campo | 2203, 2204 | Spike pendiente |
| Hosting v2 + staging público | 2206, 2207 | Railway candidato |
| **Menús post-freeze**: hoy salen de GAS `listFiles` sobre Drive. Si el GAS se apaga en el corte, se rompen | 2199 ("siguen igual"), 2207 | Definir: Drive API desde el backend o migrar a Storage |
| Freeze del GAS (2207): listar y apagar triggers `updateAllMeals`, `sendReminderEmail`, `deleteOldDates`, `checkAndUpdate` | 2207 | Documentar en el plan de corte |
| Observabilidad: error monitoring + alertas (v1 alertaba por mail); fix pendiente del import `logErrorMonitoring` en login | Transversal | Sin decidir |
| Backups: configurar al crear Supabase, no en el cutover (2207 solo los verifica) | 2207 | — |

## 8. Requisitos no funcionales (de las cards)

- Carga de pantalla y submit **≤ 1 s** (medido también en dispositivos reales, STOIC-2206).
- Mobile/tablet first: sin zoom ni scroll horizontal, targets táctiles ≥ 44 px, inputs ≥ 16 px font.
- Un count submiteado queda bloqueado para Site Staff; solo Admin corrige (versionado).
- Site Staff no accede ni por URL directa a sitios no asignados.
- Consolidación **sin tope fijo de sitios** (antecedente: STOIC-1943).
- Escala: 5+ años de operación, más sitios/estudiantes/historia. Hoy ~56 sitios, ~3k alumnos.

## 9. Seguridad y manejo de datos

- Toda pantalla y endpoint detrás de sesión válida (hoy en GAS: nada lo está).
- `migration-data/` (master.xlsx: PII + passwords en texto plano) está **gitignoreado — jamás commitear**.
  Ídem dumps crudos de Sheets.
- Passwords legacy: se hashean en el import y el texto plano no se persiste en el 2.0.
- El GAS queda expuesto (`ANYONE_ANONYMOUS`) hasta el corte — no ampliar superficie
  (el export endpoint nuevo va con key `MIGRATION_EXPORT_KEY`).

## 10. Referencias

- Cards: STOIC-2196 (modelo/DB/relevamiento) · 2197 (auth) · 2198 (pipeline) ·
  2199 (meal count + dashboard) · 2200 (admin usuarios/sitios/rosters) ·
  2201 (calendarios + correcciones) · 2202 (design system, EN CURSO) ·
  2203 (PDF diario/mensual + email) · 2204 (consolidados + firma + storage) ·
  2205 (inbox requests + notifs) · 2206 (testing staff real) · 2207 (cutover).
- Docs en `v2-backend`: `docs/V2-BACKEND.md` (API + mapeo call sites),
  `docs/SUPABASE-SETUP.md` (runbook), `prisma/schema.prisma`, `gas-backup/` (fuente GAS).
- Ruta de trabajo: **ROADMAP.md** (este repo).
