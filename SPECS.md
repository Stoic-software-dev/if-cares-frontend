# IF Cares Regular Year App 2.0 — Especificación técnica

> Fuente de verdad funcional: cards de Jira **STOIC-2196 a STOIC-2207** (hijas de STOIC-8 "IfCares")
> y el documento de requerimientos "IF Cares - Regular Year App 2.0".
> Este archivo consolida lo **técnico**: arquitectura, modelo de datos, convenciones y decisiones.
> Última actualización: 2026-08-28 (relevamiento de paridad con la app Summer — §11).

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

**Deltas de schema de paridad Summer** (relevamiento 28-ago, detalle funcional en §11):

- `Holiday` — **entidad nueva**: `name`, `startDate`/`endDate` (rango), alcance de sitios
  (todos / N sitios) y alcance de comidas (todas / subconjunto `brk|lunch|snk|sup`),
  `createdBy/At`. Hoy el calendario son `ServiceDay` sueltos: no hay forma de nombrar un
  feriado, aplicarlo a un rango, ni quitarlo de todos los sitios en una acción (3.6).
  `ServiceDay` sigue siendo la proyección efectiva que consultan dashboard y submit.
- `Site` — **plantilla semanal** (qué comidas se sirven cada día de la semana) +
  `programStart` / `programEnd`, para **generar** los `ServiceDay` del ciclo en vez de
  cargarlos día a día (3.5; equivale a la tab `Meal Schedules` de Summer).
- `Site` — **datos de contacto**: `address`, `telephone`, `supervisor` (Summer los imprime
  en el PDF). Sujeto a confirmar el formulario en papel del Regular Year.
- `MealCount` — **anulación**: `voidedAt`, `voidedById`, `voidReason`. Baja lógica: el día
  vuelve a `validDates`, sale de reportes, la fila y sus entries quedan para auditoría.
  Sin esto, un count en el sitio/fecha equivocada es irreparable (corregir no alcanza).
- `MealCount` — **aprobación** (condicional a la decisión de IF Cares): `approvalStatus`
  (`PENDING|APPROVED`), `approvedAt`, `approvedById`. Aprobado ⇒ bloquea corrección;
  anular sigue disponible.
- `Request` — **respuesta**: `responseComment`, `respondedById`, `respondedAt` (hoy solo
  cambia `status`, el solicitante nunca ve el porqué).
- `GeneratedReport` — agregar el estado de firma (`signedAt`, `signedName`, `signatureRef`)
  y el token público de la pantalla de firma (§11, ítem *firma del consolidado*).
- `AppSetting` — además de reminders: destinatarios por tipo de mail (aprobación,
  respuesta de request, envío de PDFs) para no hardcodear direcciones.
- **Jobs** (`ReportJob` o cola equivalente): `id` provisto por el cliente, `status`
  (`processing|completed|error`), `resultRef`, `error`, timestamps — necesario para los
  PDFs largos (§11, ítem *jobs asíncronos*).

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
**Todos los PDFs viven en Drive**, por un solo camino: `src/lib/google-drive.js`
(Drive REST API con service account, JWT firmado con `jose`, sin SDK) y
`src/lib/pdf-archive.js` para la escritura. Detalle en `docs/DRIVE-STORAGE.md`.
`reports/files` y `download` leen la carpeta de menús.
El listado se cachea 10 min en memoria del proceso y se sirve aunque Drive falle; el
cliente además lo guarda 5 min en `lib/data-cache.js` (`MENUS_PATH`), así que volver a
Menús es instantáneo. `download` **streamea el archivo** con su content type real, así
que Ver y Descargar son links directos, sin base64 ni decodificación en el cliente.
Mientras `GOOGLE_SERVICE_ACCOUNT_*` esté vacío cae al GAS viejo, que es lo único que
todavía lo invoca en runtime.

**Endpoints a construir** (paridad Summer + cards abiertas; mapeo detallado en
`docs/V2-BACKEND.md` → *Planned endpoints*):

| Área | Endpoints |
|---|---|
| Sitios (admin) | `POST /api/sites`, `PATCH /api/sites/[id]` (incluye rename propagado y `active`), `POST /api/sites/[id]/schedule` (plantilla semanal → genera `ServiceDay`) |
| Feriados | `GET/POST /api/holidays`, `PATCH/DELETE /api/holidays/[id]` (alcance sitios + comidas) |
| Counts | `POST /api/meal-counts/void`, `POST /api/meal-counts/approve` (condicional) |
| Reportes | `POST /api/reports/daily` y `/monthly` (guardar y/o enviar por email), `POST /api/reports/consolidated` (job), `GET /api/reports/jobs/[id]`, `GET /api/reports` (histórico recuperable) |
| Firma | `GET /api/sign/[token]` + `POST /api/sign/[token]` — **públicos, sin sesión**, autorizados por token de un solo uso con expiración (única excepción a §9) |
| Requests | `PATCH /api/requests/[id]` extendido con comentario de respuesta + disparo de email |
| Observabilidad | `POST /api/monitoring` (proxy server-side al servicio central, con la app y el entorno) |

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
| Storage de archivos (PDFs generados, menús) | 2199, 2203, 2204 | **Resuelto**: Google Drive vía service account, un solo módulo para lectura y escritura (`docs/DRIVE-STORAGE.md`). Las firmas siguen como data URL en `MealCount.signature` |
| Cron/scheduler (reminders diarios, refresh del pipeline) | 2198, 2205 | Railway cron / pg_cron / a definir |
| Motor de PDF (¿puppeteer/react-pdf?) — replicar el form en papel campo por campo | 2203, 2204 | Spike pendiente |
| Hosting v2 + staging público | 2206, 2207 | Railway candidato |
| **Menús post-freeze**: si el GAS se apaga en el corte, se rompen | 2199 ("siguen igual"), 2207 | **Resuelto**: Drive API con service account (carpeta `1wagBWXeOi_8U5N7zvqUGhdv6AjH1yyki`). Falta cargar `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `_PRIVATE_KEY` en el entorno |
| Freeze del GAS (2207): listar y apagar triggers `updateAllMeals`, `sendReminderEmail`, `deleteOldDates`, `checkAndUpdate` | 2207 | Documentar en el plan de corte |
| Observabilidad: error monitoring + alertas (v1 alertaba por mail); fix pendiente del import `logErrorMonitoring` en login | Transversal | Sin decidir — **Summer ya lo tiene** resuelto contra `monitoring-center` (§11); replicar el patrón es lo barato |
| **¿Va el flujo de aprobación de counts?** (Summer lo tiene; el requerimiento del Regular Year no lo pide) | Schema de `MealCount`, correcciones, PDFs, reportes | **Decisión de IF Cares — bloquea Etapa 2** |
| **¿El formulario en papel lleva dirección / teléfono / supervisor del sitio?** | Schema de `Site`, alta de sitios (2200), PDF (2203) | Confirmar con IF Cares junto con el formato del PDF |
| Cola/estado de **jobs largos** (consolidado 1-3 min en Summer): tabla propia + polling, o servicio de colas | 2203, 2204 | Sin decidir — sin esto el mensual/consolidado muere en el timeout del hosting |
| Backups: configurar al crear Supabase, no en el cutover (2207 solo los verifica) | 2207 | — |

## 8. Requisitos no funcionales (de las cards)

- Carga de pantalla y submit **≤ 1 s** (medido también en dispositivos reales, STOIC-2206).
- Mobile/tablet first: sin zoom ni scroll horizontal, targets táctiles ≥ 44 px, inputs ≥ 16 px font.
- Un count submiteado queda bloqueado para Site Staff; solo Admin corrige (versionado).
- Site Staff no accede ni por URL directa a sitios no asignados.
- Consolidación **sin tope fijo de sitios** (antecedente: STOIC-1943).
- Escala: 5+ años de operación, más sitios/estudiantes/historia. Hoy ~56 sitios, ~3k alumnos.
- **Nada de trabajo perdido** (paridad Summer): el formulario avisa antes de cerrar la
  pestaña y antes de navegar dentro de la app si hay marcas sin enviar.
- **El error se avisa antes de cargar, no al enviar**: fecha futura, día no operativo,
  feriado y count ya enviado se bloquean en el cliente con mensaje en lenguaje claro; el
  server sigue siendo la autoridad (422/409).
- **Toda operación > 10 s es un job con estado consultable**, nunca un request bloqueante.
- **Toda acción destructiva pide confirmación** y dice qué se lleva puesto.

## 9. Seguridad y manejo de datos

- Toda pantalla y endpoint detrás de sesión válida (hoy en GAS: nada lo está).
- **Única excepción prevista**: la pantalla pública de firma del consolidado
  (`/sign/[token]`, §11). Va autorizada por un token opaco de un solo uso, con
  expiración, alcance a **un** reporte y sin exponer ningún otro dato; el link se
  envía por mail a quien firma. Summer hoy publica el `pdfId` de Drive en la URL —
  el 2.0 **no** debe copiar eso.
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
- Paridad con Summer: **§11** de este archivo (código de referencia en
  `C:\laragon\www\if-cares-summer-frontend`).

---

## 11. Paridad funcional con la app Summer

Relevamiento del **28-ago-2026**: se revisó la app Summer completa (`src/` + `appscript/`)
contra el estado real del Regular Year 2.0 (`v2-mock` / `v2-backend`) y contra el
documento de requerimientos. Summer corre la misma operación (meal counts en sitios de
IF Cares) sobre Sheets + GAS, con dos años más de uso real: lo que ya resolvió es la
mejor fuente de requisitos que tenemos. Las referencias `→` apuntan al archivo de Summer
que sirve de blueprint. Ruta de ejecución: **ROADMAP.md** (ítems marcados `[S]`).

### 11.1 No estaba ni construido ni planificado

| # | Qué | Referencia Summer | Dónde entra |
|---|---|---|---|
| 1 | **Aprobación de counts**: aprobar por count, `approvedBy/At`, badge en calendario y detalle, bloqueo de edición al aprobar, y PDF + mail al staff del sitio como follow-up asíncrono | `appscript/post/approveMealCount.gs`, `components/calendar/DayMealDetails.jsx` | **Decisión de IF Cares** (no está en el requerimiento del RY) → Etapa 1, luego schema en Etapa 2 y UI en Etapa 4 |
| 2 | **Anular un count** (admin, con confirmación y motivo): hoy un count en el sitio o la fecha equivocada no tiene salida — corregirlo no alcanza | `dashboard/page.jsx` (`handleDeleteMeal`) | Etapa 2 (schema) + Etapa 4 (UI) |
| 3 | **Monitoreo de errores del cliente** (app, función, mensaje, stack, URL) contra un servicio central | `utils/index.js`, `api/monitoring/route.js` | Transversal |
| 4 | **Guardia de cambios sin guardar**: `beforeunload` + intercepción de la navegación interna | `app/page.js` | Etapa 3 |
| 5 | **Jobs asíncronos + polling** para PDFs largos (jobId del cliente, estado, tiempo transcurrido, cancelar) | `components/consolidatedPdfModal/ConsolidatedPdfModal.jsx` | Etapa 5 (+ decisión de infra en §7) |
| 6 | **Datos de contacto del sitio** (dirección / teléfono / supervisor) editables y usados en el PDF | `dashboard/site/[siteName]/page.jsx` | Etapa 1 (confirmar) → 2 y 4 |
| 7 | **Responder un request**: comentario + email al solicitante, con quién y cuándo; búsqueda global; paginación; contadores por pestaña; filtros por sitio y fecha | `dashboard/requests/page.jsx` | Etapa 6 |
| 8 | **Filtros del dashboard**: por estado y selector libre de mes/año | `dashboard/page.jsx` | Etapa 3 |
| 9 | **Feriado ≠ sin servicio** en el calendario (estado propio + nombre del feriado) | `getStatusForDay` + leyenda | Etapa 3 |
| 10 | **Validación en el cliente antes de cargar**: fecha futura, feriado, día no operativo, count ya enviado | `app/page.js` (`isValid`) | Etapa 3 |

### 11.2 Estaba en el plan, pero Summer ya lo tiene resuelto (blueprint) y el plan lo decía en una línea

- **Holidays Manager** → `components/holidayPicker/HolidayPicker.jsx`: nombre + rango de
  fechas, alcance "todos los sitios" o selección, "todas las comidas" o específicas,
  detección de duplicados, edición/borrado por alcance, tabs próximos/pasados, paginación.
  El RY solo tiene `PUT /api/sites/service-days` (reemplazo total por sitio) **sin UI**.
- **Plantilla semanal de comidas + fechas del programa** → tab `Meal Schedules` +
  `api/sheets/meal-schedule`: define qué se espera cada día y permite **generar** el
  calendario. El RY carga días sueltos y no tiene generador (requerimiento 3.5).
- **Admin de sitios** → `dashboard/sites` + `dashboard/site/[siteName]`: listado con
  buscador, toggle de inactivos y contador; ficha lectura/edición; desactivar; aviso y
  propagación al renombrar. El RY no tiene ni UI ni API de alta/edición/baja de sitios.
- **PDF: guardar / enviar por email / ambos**, con varios destinatarios validados →
  `components/pdfModal/PdfModal.jsx`. El RY solo descarga en el browser.
- **Consolidado** → `ConsolidatedPdfModal.jsx`: por estado, rango de fechas, exclusión de
  sitios con chips y atajos, resultado guardado y recuperable.
- **Firma del consolidado** → `app/sign/[id]` + `app/sign/success`: preview del PDF, pad
  de firma, certificación, **sin login**, y confirmación con el PDF firmado. Es el paso
  que hoy se hace a mano en la master (requerimiento 3.8). Ver la nota de seguridad en §9.
- **Emails** (aprobación, respuesta de requests, reminders, envío de PDFs): Summer los
  manda por GAS/MailApp. El RY 2.0 todavía **no tiene proveedor conectado** — el reset de
  password se copia y pega a mano.
- **ABM de alumnos / import de roster con UI**: el RY tiene la API (`students`,
  `students/[id]`) y ninguna pantalla.

### 11.3 Detalles chicos que salen baratos

Indicador de pasos en el formulario · scroll automático al primer campo faltante ·
prefetch/caché de meses adyacentes y del roster (ayuda al objetivo ≤ 1 s) · colapsar
tarjetas de detalle en mobile · tooltip con la lista completa de sitios en filas
agrupadas · atajos "excluir todos / incluir todos" en selecciones múltiples.

### 11.4 Revisado y descartado — propio del dominio Summer

No se traen: conteo por tipo de comida como envíos separados (breakfast/lunch/snack/supper
son un envío por comida en Summer; en el Regular Year es **un count por día** con las
comidas marcadas por alumno) · inventario de comidas (recibidas, del día anterior,
**carry-over automático de sobrantes**) · temperaturas de comida y leche · comidas de
adultos programa / no programa · no reimbursables · contador de comidas pedidas de más ·
y toda la maquinaria del espejo `Historical Meal Data` + merge GAS/Sheets + ediciones
optimistas contra el lag del mirror (el 2.0 lee de una base: no aplica).
